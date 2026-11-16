package shape

import (
	"fmt"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"
	"unsafe"
)

// The keys of the first indices, made once: an index is its digits as a
// key and a boxed int on the path, and past what the runtime caches (99
// and 255) both allocate, per element per call.
const indexKeys = 1024

var indexKey [indexKeys]string
var indexAny [indexKeys]any

func init() {
	for i := range indexKey {
		indexKey[i] = strconv.Itoa(i)
		indexAny[i] = i
	}
}

// skipPath reports whether the path stacks can be left alone: a verdict-only
// call on a schema with no validators has nothing that reads them, since a
// terse error records no path and no validator exists to ask.
func skipPath(ctx *Context) bool {
	return ctx != nil && ctx.pure && ctx.terse
}

// plainOK reports whether a present value passes a plain node's whole
// check, the empty-string, NaN and fraction rules included; anything else
// takes the full walk, which reports it.
func plainOK(n *node, v any) bool {
	switch n.kind {
	case KindString:
		s, ok := v.(string)
		return ok && (s != "" || n.empty)
	case KindNumber:
		return isNumber(v) && !isNaN(v)
	case KindBoolean:
		_, ok := v.(bool)
		return ok
	}
	return isInteger(v)
}

// TS-aligned marks. See src/shape.ts makeErrImpl call sites.
const (
	markObjectRequired  = 1010
	markObjectType      = 1020
	markArrayRequired   = 1030
	markArrayType       = 1040
	markCheckType       = 1045
	markScalarType      = 1050
	markScalarRequired  = 1060
	markNever           = 1070
	markRegexp          = 1045
	markUndefRequired   = 1080
	markArrayClosed     = 1090
	markObjectClosed    = 1100
	markCustomCheckErr  = 2010
	markCustomCheckText = 4000
)

// undefinedT is an internal sentinel for a missing value (JS undefined). It is
// only ever placed in the `in` slot for absent object keys / array positions;
// validateNode translates it back to nil before any user validator sees it.
type undefinedT struct{}

var undefinedVal any = undefinedT{}

func isUndef(v any) bool {
	_, ok := v.(undefinedT)
	return ok
}

// nullT marks a value that is present and null, as distinct from absent.
type nullT struct{}

// Null is an explicit present null. Go cannot tell a missing argument from a
// nil one, so Validate(nil) means "no value supplied" (JS undefined) and
// defaults fill, mirroring TS Shape(x)(). Validate(Null) means the value is
// present and null (JS null), which is a type error against a typed shape.
// Inside a map or slice a plain nil already reads as present-null, because the
// key or index exists; Null is accepted there too and means the same thing.
var Null any = nullT{}

func isNull(v any) bool {
	_, ok := v.(nullT)
	return ok
}

// rootInput maps a nil top-level input to the absent sentinel: Validate(nil)
// means "no value supplied" (JS undefined), so defaults fill as in TS Shape(x)().
func rootInput(in any) any {
	if in == nil {
		return undefinedVal
	}
	return in
}

// requiredMarkFor returns the TS-aligned required mark for a node kind.
func requiredMarkFor(k Kind) int {
	switch k {
	case KindObject:
		return markObjectRequired
	case KindArray:
		return markArrayRequired
	default:
		return markScalarRequired
	}
}

// typeMarkFor returns the TS-aligned type mark for a node kind.
func typeMarkFor(k Kind) int {
	switch k {
	case KindObject:
		return markObjectType
	case KindArray:
		return markArrayType
	case KindCheck:
		return markCheckType
	default:
		return markScalarType
	}
}

// validateNode is the recursive validation engine. It returns the produced
// value (defaults injected, child shapes validated) and writes errors via verr.
func validateNode(n *node, in any, path []string, pathArr []any, key string, parent any, ctx *Context, match bool, verr *ValidationError) any {
	if n == nil {
		return in
	}

	// Unwrap an explicit Null anywhere it appears, so it reads as a present nil
	// rather than an opaque value of unknown type.
	if isNull(in) {
		in = nil
	}

	// Translate the absent sentinel back to nil, remembering that the value was
	// missing (JS undefined) rather than an explicit null.
	absent := isUndef(in)
	if absent {
		in = nil
	}

	var state *State
	if ctx == nil {
		state = &State{}
	} else {
		state = ctx.newState()
	}
	// Field by field: a composite literal is built on the stack and copied
	// in whole, with a write barrier over every word.
	state.Path = path
	state.PathArr = pathArr
	state.Key = key
	state.Value = in
	state.Node = n
	state.Parent = parent
	state.Match = match
	state.Ctx = ctx
	state.absent = absent
	state.checkName = ""

	// Run before-validators. They may replace the value or the node, and a
	// failing one ends the structural checks (TS handleValidate sets
	// update.done) — but every before still runs, and so do the afters.
	//
	// A before that puts another node in this one's place (Refer, a claimed
	// Rename) leaves that node's befores to run, from its first, each once:
	// TS restarts its loop on the new node, and a Refer back to a node whose
	// befores have begun does not run them again.
	done := false
	var ran map[beforeAt]bool
	for bI := 0; bI < len(n.befores); bI++ {
		if ran != nil {
			if ran[beforeAt{n, bI}] {
				continue
			}
			ran[beforeAt{n, bI}] = true
		}
		b := n.befores[bI]
		update := &state.upd
		*update = Update{}
		state.checkName = b.name
		ok := b.fn(state.Value, update, state)
		if !ok && nullPasses(state) {
			continue
		}
		applyUpdate(state, update)
		in = state.Value
		was := n
		n = state.Node
		if n != was {
			if ran == nil {
				ran = map[beforeAt]bool{}
				for i := 0; i <= bI; i++ {
					ran[beforeAt{was, i}] = true
				}
			}
			bI = -1
		}
		if !ok && absentSkips(state, update) {
			continue
		}
		if !ok {
			emitUpdateErrors(state, update, verr)
		}
		if !ok || update.Done {
			done = true
		}
	}
	if !done {
		state.Value = validateStructure(n, state, absent, path, pathArr, key, parent, ctx, match, verr)
	}
	if len(state.Node.afters) > 0 {
		runAfters(state, verr)
	}
	out := state.Value
	if ctx != nil {
		ctx.popState()
	}
	return out
}

// beforeAt names one before of one node, so that each runs once per value.
type beforeAt struct {
	n *node
	i int
}

// absentSkips reports whether a failed check is to raise nothing: TS drops the
// errors of a check run against an absent value on a node that does not
// require one ("Skip allows undefined"), unless the check insisted with Done.
func absentSkips(state *State, update *Update) bool {
	n := state.Node
	return state.absent && state.Value == nil && (n.skippable || !n.required) && !update.Done
}

// nullPasses reports whether a failed check is to be passed over entirely:
// Nullable allows a present null, whatever the check made of it, so its
// errors, its Done and its update are all dropped (TS handleValidate).
func nullPasses(state *State) bool {
	return !state.absent && state.Value == nil && state.Node.nullable
}

// validateStructure runs the structural checks — composition, nullable, Never,
// the missing-value rules and the kind check — and returns the produced value.
// The afters run afterwards whatever it reported, as they do in TS.
func validateStructure(n *node, state *State, absent bool, path []string, pathArr []any, key string, parent any, ctx *Context, match bool, verr *ValidationError) any {

	// Nullable: an explicit null is accepted as the value, whatever a
	// composition would make of it (TS drops the errors of the All or Nof
	// check, as it does any check's). Absent is still governed by
	// required/optional below, since a nil that is absent is not yet in play
	// here — the absent sentinel was translated above.
	if state.Value == nil && !absent && n.nullable {
		// The composition still runs, as TS runs its check, so the trials
		// it takes count.
		if n.kind == KindList && n.listMode != listNone {
			evaluateList(n, state, &ValidationError{})
		}
		return state.Value
	}

	// Composition shortcuts. An absent value on a node that does not require
	// one is not put to the branches: TS drops the errors such a check would
	// raise, so Optional(All(...)) given nothing is simply absent.
	if n.kind == KindList && n.listMode != listNone && !(absent && !n.required) {
		before := verr.count()
		out := evaluateList(n, state, verr)
		// A required composition that passed but left an absent subject
		// absent (All produces nothing from it) reports the missing value,
		// as TypeScript's required check does after the validators.
		if absent && n.required && out == nil && verr.count() == before {
			addRequired(state, n, verr)
		}
		return out
	}

	// Never rejects any present value, and an absent one where the node
	// requires a value: Never alone does, so it fails always, while Optional
	// or Skip around it means the value must be absent. This precedes the
	// missing-value handling below: an absent value against Never is "no
	// value is allowed", not "the value is required", and nothing is
	// injected for it.
	if n.kind == KindNever {
		if absent && !n.required {
			return state.Value
		}
		err := makeErr(state, WhyNever, markNever, "")
		if n.faultMsg != "" {
			if !err.terse {
				err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
			}
		}
		if !n.silent {
			verr.add(err)
		}
		return state.Value
	}

	// A regexp node never reports "required": TS treats an absent value as a
	// non-string and reports the type error, or ignores it when not required.
	if n.kind == KindRegexp && state.Value == nil && absent && !n.required {
		return nil
	}

	// Missing value (JS undefined): required error, skip, or inject the default.
	// An explicit null (present, not absent) falls through to structural checks
	// below — where, e.g., null against a String is a type error, not a required
	// error (mirrors TS undefined-vs-null semantics).
	if state.Value == nil && absent && n.kind != KindRegexp {
		if n.required {
			addRequired(state, n, verr)
			return nil
		}
		if n.skippable {
			return nil
		}

		// A container spec with no explicit default is not simply filled in:
		// TS constructs the empty container and descends, so a required
		// descendant still raises and nested defaults are still built. Handing
		// back cloneDefault(n) here skipped that entirely — cloneDefault omits
		// required children, so { a: { b: Number } } accepted {} and the
		// requirement on a.b was never checked.
		if !n.hasDefault && (n.kind == KindObject || n.kind == KindArray) {
			state.Value = emptyContainer(n.kind)
		} else {
			return cloneDefault(n)
		}
	}

	out := state.Value

	switch n.kind {
	case KindAny, KindCheck:
		// nothing structural to enforce
	case KindRegexp:
		// A bare /re/ is a string-shaped node in TS, so a non-string is a plain
		// "not of type string" error rather than a failed check, and the empty
		// string is matched rather than rejected as empty.
		sv, ok := state.Value.(string)
		if !ok {
			err := newErr(state, WhyType, markScalarType)
			err.Type = KindString
			if !err.terse {
				err.Text = defaultErrText(err)
			}
			if n.faultMsg != "" {
				if !err.terse {
					err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
				}
			}
			if !n.silent {
				verr.add(err)
			}
			return state.Value
		}
		if n.regexpVal != nil && !n.regexpVal.MatchString(sv) {
			err := makeErr(state, WhyRegexp, markRegexp, "")
			if n.faultMsg != "" {
				if !err.terse {
					err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
				}
			}
			if !n.silent {
				verr.add(err)
			}
			return state.Value
		}
	case KindString:
		s, ok := state.Value.(string)
		if !ok {
			emitTypeErr(state, verr, n)
			return state.Value
		}
		if s == "" && !n.empty {
			err := makeErr(state, WhyRequired, markScalarRequired, "")
			if n.faultMsg != "" {
				if !err.terse {
					err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
				}
			}
			if !n.silent {
				verr.add(err)
			}
			return state.Value
		}
	case KindNumber:
		if !isNumber(state.Value) {
			emitTypeErr(state, verr, n)
			return state.Value
		}
		if isNaN(state.Value) {
			emitTypeErr(state, verr, n)
			return state.Value
		}
	case KindBoolean:
		if _, ok := state.Value.(bool); !ok {
			emitTypeErr(state, verr, n)
			return state.Value
		}
	case KindInteger:
		if !isInteger(state.Value) {
			emitTypeErr(state, verr, n)
			return state.Value
		}
	case KindDate:
		if _, ok := state.Value.(time.Time); !ok {
			emitTypeErr(state, verr, n)
			return state.Value
		}
	case KindNaN:
		if !isNumber(state.Value) || !isNaN(state.Value) {
			emitTypeErr(state, verr, n)
			return state.Value
		}
	case KindNull:
		if state.Value != nil {
			emitTypeErr(state, verr, n)
			return state.Value
		}
	case KindArray:
		out = validateArray(n, state.Value, path, pathArr, parent, ctx, match, verr)
		if out == nil {
			return state.Value
		}
	case KindObject:
		out = validateObject(n, state.Value, path, pathArr, parent, ctx, match, verr)
		if out == nil {
			return state.Value
		}
	case KindFunction:
		if !isFunction(state.Value) {
			emitTypeErr(state, verr, n)
			return state.Value
		}
	default:
		// Unknown kind: allow.
	}

	return out
}

func emitTypeErr(state *State, verr *ValidationError, n *node) {
	err := makeErr(state, WhyType, typeMarkFor(n.kind), "")
	if n.faultMsg != "" {
		if !err.terse {
			err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
		}
	}
	if !n.silent {
		verr.add(err)
	}
}

func runAfters(state *State, verr *ValidationError) {
	// Every after runs, whatever the ones before it reported (TS).
	n := state.Node
	for _, a := range n.afters {
		update := &state.upd
		*update = Update{}
		state.checkName = a.name
		ok := a.fn(state.Value, update, state)
		if !ok && nullPasses(state) {
			continue
		}
		applyUpdate(state, update)
		if !ok && !absentSkips(state, update) {
			emitUpdateErrors(state, update, verr)
		}
	}
}

func validateArray(n *node, in any, path []string, pathArr []any, parent any, ctx *Context, match bool, verr *ValidationError) any {
	arr, ok := toAnySlice(in)
	if !ok {
		state := &State{Path: path, PathArr: pathArr, Value: in, Node: n, Parent: parent, Match: match, Ctx: ctx}
		emitTypeErr(state, verr, n)
		return nil
	}
	// The slice as the elements see their parent and as the result is
	// returned: the interface it arrived in, or the []any a typed slice
	// was read as, boxed once here rather than once per element.
	var boxed any = in
	if _, direct := in.([]any); !direct {
		boxed = arr
	}

	switch {
	case len(n.arrChildren) > 0:
		// Tuple validation.
		tupleLen := len(n.arrChildren)

		// Closed tuple with extra elements: TS emits a single "index N is not
		// allowed" error (N = tuple length) and does not validate any element.
		if len(arr) > tupleLen && n.arrRest == nil {
			state := &State{Path: path, PathArr: pathArr, Key: strconv.Itoa(tupleLen), Value: arr, Node: n, Match: match, Ctx: ctx}
			err := makeErr(state, WhyClosed, markArrayClosed, "")
			if !n.silent {
				verr.add(err)
			}
			return arr
		}

		p := newProduced(arr, boxed, ctx, match)
		for i, v := range arr {
			cn := n.arrRest
			if i < tupleLen {
				cn = n.arrChildren[i]
			}
			// len(arr) > tupleLen only reaches here when arrRest is set.
			if cn.plain && plainOK(cn, v) {
				continue
			}
			p.set(i, validateElem(cn, v, path, pathArr, i, p.parent(), ctx, match, verr), match)
		}
		// Missing tuple positions get their default. A position that
		// produces nothing (skipped, optional with no default, or in error)
		// is left out, as an absent property is; one after it that does
		// produce leaves a null in its place, as TS's array has a hole
		// there.
		for i := len(arr); i < tupleLen; i++ {
			cn := n.arrChildren[i]
			v := validateNode(cn, undefinedVal, append(path, strconv.Itoa(i)), append(pathArr, i), strconv.Itoa(i), p.parent(), ctx, match, verr)
			if match || absentOmits(cn, v) {
				continue
			}
			p.ensure()
			for len(p.out) < i {
				p.out = append(p.out, nil)
			}
			p.out = append(p.out, v)
			p.par = p.out
		}
		return p.result(match)
	case n.arrChild != nil:
		p := newProduced(arr, boxed, ctx, match)
		cn := n.arrChild
		for i, v := range arr {
			// A plain element of its kind is its own produced value, and a
			// copy already holds it: nothing to do.
			if cn.plain && plainOK(cn, v) {
				continue
			}
			p.set(i, validateElem(cn, v, path, pathArr, i, p.parent(), ctx, match, verr), match)
		}
		return p.result(match)
	case n.arrRest != nil:
		// Rest with no tuple positions in front of it: every element is a rest
		// element. Without this case the node fell through to the default and
		// nothing was validated at all.
		p := newProduced(arr, boxed, ctx, match)
		cn := n.arrRest
		for i, v := range arr {
			if cn.plain && plainOK(cn, v) {
				continue
			}
			p.set(i, validateElem(cn, v, path, pathArr, i, p.parent(), ctx, match, verr), match)
		}
		return p.result(match)
	default:
		return arr
	}
}

// produced is the slice an array's elements are produced into, made on the
// first element produced as a different value; until then the input is the
// result, and a match never writes. Where the schema has validators the
// slice is made up front and the elements see it as their parent, so a
// validator writing through State.Parent never reaches the input.
type produced struct {
	in  []any
	out []any
	// The parent the elements see and the result when nothing changed:
	// the input as it was boxed on arrival, then the produced slice, boxed
	// when it is made rather than per element.
	par any
}

func newProduced(arr []any, boxed any, ctx *Context, match bool) produced {
	p := produced{in: arr, par: boxed}
	if !match && !pureCall(ctx) {
		p.ensure()
	}
	return p
}

// parent is what the elements see as their parent: the produced slice when
// there is one, the input otherwise.
func (p *produced) parent() any {
	return p.par
}

// pureCall reports whether the call runs a schema with no validators, so
// that nothing can observe the parent of a value.
func pureCall(ctx *Context) bool {
	return ctx != nil && ctx.pure
}

func (p *produced) ensure() {
	if p.out == nil {
		p.out = make([]any, len(p.in), len(p.in)+1)
		copy(p.out, p.in)
		p.par = p.out
	}
}

func (p *produced) set(i int, v any, match bool) {
	if match {
		return
	}
	if p.out != nil || !sameValue(v, p.in[i]) {
		p.ensure()
		p.out[i] = v
	}
}

func (p *produced) result(match bool) any {
	if match {
		return nil
	}
	return p.par
}

func validateObject(n *node, in any, path []string, pathArr []any, parent any, ctx *Context, match bool, verr *ValidationError) any {
	// A struct, or a map of some other value type, reads as the map it
	// describes (see structs.go).
	obj, ok := objectValue(in)
	if !ok {
		state := &State{Path: path, PathArr: pathArr, Value: in, Node: n, Parent: parent, Match: match, Ctx: ctx}
		emitTypeErr(state, verr, n)
		return nil
	}

	// The produced map is made on the first write that changes something: a
	// default or a null literal injected, a key renamed or dropped, a child
	// produced as a different value. Until then the input is the result, and
	// a match never writes. Children see the input as their parent, as they
	// do in TS, where the walk produces in place.
	var out map[string]any
	ensure := func() {
		if out == nil {
			out = make(map[string]any, len(obj)+len(n.objKeys))
			for k, v := range obj {
				out[k] = v
			}
		}
	}
	// A validator may write through State.Parent, so where the schema has
	// any, the producing walk copies up front and the children see the copy,
	// with the values produced before them, as they always did. Only a
	// schema with no validators produces into the input.
	var parentOf any = obj
	if !match && !pureCall(ctx) {
		ensure()
		parentOf = out
	}

	// Unknown keys are reported before descending into the declared ones,
	// which is the order TS emits them in. When the input has no more keys
	// than the spec declares, the scan waits until the declared keys have
	// been counted, since an input made only of declared keys has nothing to
	// report; the error still goes in at the index this object's errors
	// start, ahead of its children's.
	errStart := len(verr.Issues)
	deferScan := !n.open && len(obj) <= len(n.objKeys)
	if !n.open && !deferScan {
		reportUnknown(n, obj, path, pathArr, ctx, match, verr, -1)
	}

	present := 0
	noPath := skipPath(ctx)
	for i, k := range n.objKeys {
		cn := n.objChildList[i]
		v, has := obj[k]
		if has {
			present++
			// A plain leaf of its kind is its own produced value; a copy
			// already holds it, and is written only as the full path would
			// have written it, after an earlier child's rename to this key.
			if cn.plain && plainOK(cn, v) {
				if !match && out != nil {
					out[k] = v
				}
				continue
			}
		}
		var produced any
		kpath, kpathArr := path, pathArr
		if !noPath {
			kpath = append(path, k)
			kpathArr = append(pathArr, n.objKeysAny[i])
		}

		// Rename.claim: if the value is missing and claim source has it, pick up.
		if !has && cn.renameTo != "" && len(cn.renameClaim) > 0 {
			for _, src := range cn.renameClaim {
				if sv, sh := obj[src]; sh {
					v = sv
					has = true
					if !cn.renameKeep && !match {
						ensure()
						delete(out, src)
					}
					break
				}
			}
		}

		if !has {
			produced = validateNode(cn, undefinedVal, kpath, kpathArr, k, parentOf, ctx, match, verr)
			if absentOmits(cn, produced) {
				continue
			}
		} else {
			// Ignore: keep the value only when it validates cleanly, otherwise
			// drop it (and any errors it would raise).
			if isIgnore(cn) {
				probed, kept := validateIgnored(cn, v, kpath, kpathArr, k, parentOf, ctx, match)
				if match {
					continue
				}
				if !kept {
					ensure()
					delete(out, k)
					continue
				}
				if out != nil || !sameValue(probed, v) {
					ensure()
					out[k] = probed
				}
				continue
			}
			produced = validateNode(cn, v, kpath, kpathArr, k, parentOf, ctx, match, verr)
		}

		if match {
			continue
		}
		if !has || out != nil || !sameValue(produced, v) {
			ensure()
			out[k] = produced
		}

		// Apply Rename: if child has renameTo, move into target key.
		if cn.renameTo != "" && cn.renameTo != k {
			ensure()
			out[cn.renameTo] = produced
			if !cn.renameKeep {
				delete(out, k)
			}
		}
	}

	if deferScan && present < len(obj) {
		reportUnknown(n, obj, path, pathArr, ctx, match, verr, errStart)
	}

	// A child held under a key the declared list does not name (none in a
	// tree the builders make).
	for _, k := range n.objExtra {
		cn := n.objChildren[k]
		if out != nil {
			if _, present := out[k]; present {
				continue
			}
		} else if _, present := obj[k]; present {
			continue
		}
		produced := validateNode(cn, undefinedVal, append(path, k), append(pathArr, k), k, parentOf, ctx, match, verr)
		if produced != nil && !match {
			ensure()
			out[k] = produced
		}
	}

	if n.open && n.objRest != nil {
		// Sorted: Go map iteration is random and the message order is compared
		// exactly, so an unsorted walk makes the error order flaky.
		rest := make([]string, 0, len(obj))
		for k := range obj {
			if _, declared := n.objChildren[k]; !declared {
				rest = append(rest, k)
			}
		}
		sort.Strings(rest)

		for _, k := range rest {
			// Honour Ignore here too: an open object whose rest shape is an
			// Ignore drops the keys that do not validate.
			if isIgnore(n.objRest) {
				produced, kept := validateIgnored(n.objRest, obj[k],
					append(path, k), append(pathArr, k), k, parentOf, ctx, match)
				if match {
					continue
				}
				if !kept {
					ensure()
					delete(out, k)
					continue
				}
				if out != nil || !sameValue(produced, obj[k]) {
					ensure()
					out[k] = produced
				}
				continue
			}
			produced := validateNode(n.objRest, obj[k], append(path, k), append(pathArr, k), k, parentOf, ctx, match, verr)
			if !match && (out != nil || !sameValue(produced, obj[k])) {
				ensure()
				out[k] = produced
			}
		}
	}

	if match {
		return nil
	}
	if out == nil {
		return obj
	}
	return out
}

// absentOmits reports whether what a node produced for an absent value is
// left out of its parent rather than put in place. A skipped node puts
// nothing; otherwise a nil means nothing was injected (a required error, or
// an optional value with no default), matching TS. The exception is a null
// default, a null literal's own or one Default(null, ...) gave: TS injects
// it, so the key is present and null.
func absentOmits(cn *node, produced any) bool {
	if cn.skippable && (produced == nil || cn.silent) {
		return true
	}
	return produced == nil && !(cn.hasDefault && !cn.required && (cn.kind == KindNull || cn.defaultNull))
}

// reportUnknown records the one error naming every key of obj the closed
// object n does not consume, sorted because Go map iteration is random and
// the message order is compared exactly. The error is appended, or put in at
// index at when the scan ran after the children (see validateObject). TS
// renders this as:
//
//	Validation failed for property "<parent>" because the property "<k>" is not allowed.
//	... because the properties "<k>, <k>" are not allowed.
func reportUnknown(n *node, obj map[string]any, path []string, pathArr []any, ctx *Context, match bool, verr *ValidationError, at int) {
	var unknown []string
	for k := range obj {
		if !n.consumed[k] {
			unknown = append(unknown, k)
		}
	}
	if len(unknown) == 0 || n.silent {
		return
	}
	sort.Strings(unknown)
	state := &State{Path: path, PathArr: pathArr, Key: strings.Join(unknown, ", "),
		Value: obj, Node: n, Match: match, Ctx: ctx}
	err := newErr(state, WhyClosed, markObjectClosed)
	err.plural = len(unknown) > 1
	if !err.terse {
		err.Text = defaultErrText(err)
	}
	if at < 0 {
		verr.add(err)
		return
	}
	verr.Issues = append(verr.Issues, FieldError{})
	copy(verr.Issues[at+1:], verr.Issues[at:])
	verr.Issues[at] = err
}

// sameValue reports whether a produced value is the input value it came
// from, so that an unchanged child needs no copy of its parent: identity for
// maps and slices, equality for the comparable kinds.
func sameValue(a, b any) bool {
	switch x := a.(type) {
	case nil:
		return b == nil
	case string:
		y, ok := b.(string)
		return ok && x == y
	case float64:
		y, ok := b.(float64)
		return ok && x == y
	case int:
		y, ok := b.(int)
		return ok && x == y
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case map[string]any:
		y, ok := b.(map[string]any)
		return ok && reflect.ValueOf(x).Pointer() == reflect.ValueOf(y).Pointer()
	case []any:
		// The data pointers, without boxing either slice through reflect.
		y, ok := b.([]any)
		return ok && len(x) == len(y) && unsafe.SliceData(x) == unsafe.SliceData(y)
	}
	ta, tb := reflect.TypeOf(a), reflect.TypeOf(b)
	return ta == tb && ta.Comparable() && a == b
}

// addRequired reports a missing required value, with the node's fault text
// if it has one.
func addRequired(state *State, n *node, verr *ValidationError) {
	err := makeErr(state, WhyRequired, requiredMarkFor(n.kind), "")
	if n.faultMsg != "" {
		if !err.terse {
			err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
		}
	}
	if !n.silent {
		verr.add(err)
	}
}

// evaluateList puts the value of a composition node's state to its branches.
func evaluateList(n *node, state *State, verr *ValidationError) any {
	in, path, pathArr, key, parent := state.Value, state.Path, state.PathArr, state.Key, state.Parent
	ctx, match, absent := state.Ctx, state.Match, state.absent

	// Branches must see the value as the parent saw it: an absent value stays
	// absent, so a branch that does not require one can still match and supply
	// its default. Passing a bare nil instead made every branch see a present
	// null, which a typed branch rejects.
	branchIn := in
	if absent {
		branchIn = undefinedVal
	}

	switch n.listMode {
	case listAll:
		passAll := true
		out := in
		// All threads the value through its branches, so once a branch has
		// produced one it is no longer absent; a branch that produces nothing
		// from an absent value passes it on absent. Each branch is put the
		// value as a call of its own is, at the All's path (see branchNode),
		// and a failing branch's errors are the errors, each said once.
		branchOut := branchIn
		var errs []FieldError
		for _, sn := range n.list {
			sub := &ValidationError{}
			res := branchNode(sn, branchOut, path, pathArr, key, ctx, match, sub)
			if sub.hasAny() {
				passAll = false
				errs = appendUnique(errs, sub.Issues)
			} else if res != nil || !isUndef(branchOut) {
				out = res
				branchOut = res
			}
		}
		if !passAll {
			if !n.silent {
				for _, e := range errs {
					verr.add(e)
				}
			}
			return in
		}
		// An absent subject stays absent, for the required check to see, as
		// in TypeScript.
		if absent {
			return in
		}
		return out
	case listNof:
		// An absent value is not tried: the required check speaks for it.
		if absent {
			return in
		}
		// Shapes of different kinds: the value is put only to the shape of
		// its kind, whose errors are then the errors, and which produces the
		// value. A value of no kind listed is counted, and fails, as any
		// other.
		if kI, kind := nofKindIndex(nofKindsNow(n), in); kI >= 0 {
			sub := &ValidationError{}
			var res any
			if nofInPlace(n, kind, ctx) {
				res = validateNode(n.list[kI], in, path, pathArr, key, parent, ctx, match, sub)
			} else {
				res = ownBranch(n.list[kI], in, path, pathArr, key, ctx, match, sub)
			}
			if sub.hasAny() {
				if !n.silent {
					for _, e := range sub.Issues {
						verr.add(e)
					}
				}
				return in
			}
			return res
		}
		// A branch is tried only while the untried could change the verdict.
		k, tried, total, matched := 0, 0, len(n.list), 0
		var matchedOut any
		deep := false
		for nofSpan(n.nofOK, k, total-tried) == nofSome {
			if ok, out, within := trial(n.list[tried], branchIn, path, pathArr, key, state); ok {
				k++
				matched, matchedOut, deep = tried, out, within
			}
			tried++
		}
		if nofSpan(n.nofOK, k, total-tried) == nofNone {
			state := &State{Path: path, PathArr: pathArr, Key: key, Value: in, Node: n, Match: match, Ctx: ctx, absent: absent}
			admitted := strconv.Itoa(k)
			if tried < total {
				admitted += " to " + strconv.Itoa(k+total-tried)
			}
			// The message is the Nof's own, so a Fault does not replace it:
			// as in TypeScript, a Fault speaks for structural failures only.
			err := makeErr(state, WhyNof, 4033,
				fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" satisfies %s of: %s; the count must be %s.",
					admitted, listShapeNames(n), nofCountText(n)))
			if !n.silent {
				verr.add(err)
			}
			return in
		}
		// Exactly one: the branch the value satisfies produces it, run again
		// as TS runs it, so the trials within it count again. A verdict
		// alone needs it only for those.
		if n.nofOne {
			if match && !deep {
				return matchedOut
			}
			return validateNode(n.list[matched], branchIn, path, pathArr, key, parent, ctx, match, &ValidationError{})
		}
		return in
	case listWhen:
		// An absent value is not tried: the required check speaks for it.
		if absent {
			return in
		}
		// The condition is tried on the value; the shape it picks validates
		// it as a call of its own, and its errors are the errors.
		pick := n.list[2]
		if ok, _, _ := trial(n.list[0], in, path, pathArr, key, state); ok {
			pick = n.list[1]
		}
		// A shape that drops its value (Ignore) leaves the value as it was.
		if isIgnore(pick) {
			if res, kept := validateIgnored(pick, in, path, pathArr, key, nil, ctx, match); kept {
				return res
			}
			return in
		}
		sub := &ValidationError{}
		res := branchNode(pick, in, path, pathArr, key, ctx, match, sub)
		if sub.hasAny() {
			if !n.silent {
				for _, e := range sub.Issues {
					verr.add(e)
				}
			}
			return in
		}
		return res
	}
	return in
}

// trial tries a shape on a value for a verdict alone, as a call of its own
// at the path given: nothing it finds is reported. Each trial takes one
// from the budget of the call it is part of; past the budget a trial
// refuses, and the first refusal records the error the call then fails
// with alone, at the state of the composition that asked (see endCall).
// It reports the verdict, what the shape made, and whether trials ran
// within it.
func trial(sn *node, val any, path []string, pathArr []any, key string, at *State) (bool, any, bool) {
	if at.Ctx == nil {
		at.Ctx = newContext(nil)
	}
	ctx := at.Ctx
	t := &ctx.trials
	if t.budget == 0 {
		t.left, t.budget = defaultTrials, defaultTrials
	}
	if t.left <= 0 {
		if t.spent == nil {
			spent := makeErr(at, WhyTrial, 0, "Value \"$VALUE\" for property \"$PATH\" needs more trials than the budget of "+
				strconv.Itoa(t.budget)+".")
			t.spent = &spent
		}
		return false, nil, false
	}
	t.left--
	left := t.left
	sub := &ValidationError{terse: true}
	out := validateNode(sn, val, path, pathArr, key, nil, ctx, true, sub)
	return !sub.hasAny(), out, t.left < left
}

// branchNode validates one branch of a composition as TypeScript runs it, a
// call of its own on the value at the composition's path: the branch's root
// has no parent, so a failure there names a "property", whatever holds the
// composition.
func branchNode(sn *node, in any, path []string, pathArr []any, key string, ctx *Context, match bool, verr *ValidationError) any {
	return validateNode(sn, in, path, pathArr, key, nil, ctx, match, verr)
}

// appendUnique appends the errors not listed already, by path and text: a
// failing All says each of its branches' errors once.
func appendUnique(list []FieldError, add []FieldError) []FieldError {
next:
	for _, e := range add {
		for _, x := range list {
			if x.Path == e.Path && x.Text == e.Text {
				continue next
			}
		}
		list = append(list, e)
	}
	return list
}

// nofKindIndex is the index of the branch of a value's kind among the kinds
// of a Nof's branches, and that kind; -1 where they have none (see
// nofKinds) or none is of its kind.
func nofKindIndex(kinds []string, v any) (int, string) {
	if kinds == nil {
		return -1, ""
	}
	k := kindOf(v)
	for i, x := range kinds {
		if x == k {
			return i, k
		}
	}
	return -1, k
}

// nofInPlace reports whether the branch of a value's kind stands in the
// Nof's own place, as TS's walk puts it there: where the Nof is the node's
// one check, and the value a scalar, or the value a call of its own was
// given (see Context.own). There, a failure at the branch names the value
// as the Nof's parent holds it, an "index" in an array; elsewhere the branch
// is a call of its own (see ownBranch).
func nofInPlace(n *node, kind string, ctx *Context) bool {
	return len(n.befores) == 0 && len(n.afters) == 0 &&
		((kind != "object" && kind != "array") || (ctx != nil && ctx.own))
}

// ownBranch validates the branch of a value's kind as a call of its own (see
// branchNode), whose value is then its own copy: a Nof of kinds within puts
// any value in its own place.
func ownBranch(sn *node, in any, path []string, pathArr []any, key string, ctx *Context, match bool, verr *ValidationError) any {
	if ctx == nil {
		ctx = newContext(nil)
	}
	own := ctx.own
	ctx.own = true
	out := branchNode(sn, in, path, pathArr, key, ctx, match, verr)
	ctx.own = own
	return out
}

// The verdicts of a span of counts, for a Nof deciding whether to try
// another branch.
const (
	nofNone = 0
	nofSome = 1
	nofAll  = 2
)

// nofSpan reports whether the counts from k to k+open are all admitted, some
// or none: a branch is tried only while it is some.
func nofSpan(ok []bool, k, open int) int {
	yes := 0
	for c := k; c <= k+open; c++ {
		if ok[c] {
			yes++
		}
	}
	switch yes {
	case 0:
		return nofNone
	case open + 1:
		return nofAll
	}
	return nofSome
}

// nofCountText renders a Nof's count as TypeScript does: the whole number,
// or the shape for it.
func nofCountText(n *node) string {
	if n.nofCount == nil {
		return fmtFloat(n.nofExact)
	}
	return stringifyNode(n.nofCount, true)
}

func listShapeNames(n *node) string {
	out := ""
	for i, sn := range n.list {
		if i > 0 {
			out += ", "
		}
		out += stringifyNode(sn, true)
	}
	return out
}

func emitUpdateErrors(state *State, update *Update, verr *ValidationError) {
	if state.Node.silent {
		return
	}
	switch e := update.Err.(type) {
	case nil:
		why := update.Why
		mark := update.Mark
		if why == "" {
			why = WhyCheck
		}
		if mark == 0 {
			mark = markCustomCheckErr
		}
		// A check that supplies no text of its own takes the Fault text, as a
		// structural error does; one that does keeps its own (TS: text || z).
		err := makeErr(state, why, mark, "")
		if state.Node.faultMsg != "" {
			if !err.terse {
				err.Text = expandErrText(state.Node.faultMsg, err.Path, state.Value)
			}
		}
		verr.add(err)
	case string:
		why := update.Why
		mark := update.Mark
		if why == "" {
			why = WhyCheck
		}
		if mark == 0 {
			mark = markCustomCheckText
		}
		verr.add(makeErr(state, why, mark, e))
	case FieldError:
		if e.Path == "" {
			e.Path = joinPath(state.Path)
		}
		if e.Mark == 0 {
			e.Mark = markCustomCheckText
		}
		verr.add(e)
	case []FieldError:
		for _, ee := range e {
			if ee.Path == "" {
				ee.Path = joinPath(state.Path)
			}
			if ee.Mark == 0 {
				ee.Mark = markCustomCheckText
			}
			verr.add(ee)
		}
	}
}

func applyUpdate(state *State, update *Update) {
	if update.HasVal {
		state.Value = update.Val
	}
	if update.Node != nil {
		state.Node = update.Node
	}
}

// validateElem validates one array element, honouring Ignore the same way an
// object property and the root do: a value that does not validate is dropped
// along with the errors it would raise.
func validateElem(cn *node, v any, path []string, pathArr []any, i int, parent any, ctx *Context, match bool, verr *ValidationError) any {
	key, boxed := indexOf(i)
	epath, epathArr := path, pathArr
	if !skipPath(ctx) {
		epath = append(path, key)
		epathArr = append(pathArr, boxed)
	}

	if isIgnore(cn) {
		produced, kept := validateIgnored(cn, v, epath, epathArr, key, parent, ctx, match)
		if !kept {
			return nil
		}
		return produced
	}

	return validateNode(cn, v, epath, epathArr, key, parent, ctx, match, verr)
}

// indexOf is an index as a key, and boxed for the path.
func indexOf(i int) (string, any) {
	if i < indexKeys {
		return indexKey[i], indexAny[i]
	}
	return strconv.Itoa(i), i
}

// isIgnore reports whether a node was built by Ignore: optional, no default
// injection, and errors below it suppressed.
func isIgnore(n *node) bool {
	return n != nil && n.silent && n.skippable
}

// validateIgnored runs an Ignore node, reporting whether the value survived.
// The probe disables silence so the failure is observable, mirroring TS Ignore
// inspecting curerr; the caller drops the value when kept is false.
func validateIgnored(n *node, in any, path []string, pathArr []any, key string, parent any, ctx *Context, match bool) (any, bool) {
	probe := *n
	probe.silent = false
	sub := &ValidationError{}
	produced := validateNode(&probe, in, path, pathArr, key, parent, ctx, match, sub)
	if sub.hasAny() {
		return nil, false
	}
	return produced, true
}

// emptyContainer is the value a container node descends into when its own
// value is absent: the empty object or array TS constructs before validating
// children.
func emptyContainer(k Kind) any {
	if k == KindArray {
		return []any{}
	}
	return map[string]any{}
}

// hasDefaultValue reports whether the node has a default, as TS's n.f is
// defined: a nil default is the zero of a kind that has none (Any, Date),
// which TS has no default for at all; only the null kind's null and an
// explicit null default are defaults.
func hasDefaultValue(n *node) bool {
	return n.hasDefault && (n.defaultValue != nil || n.kind == KindNull || n.defaultNull)
}

// cloneDefault produces the value injected for an absent, unrequired node.
//
// It is only reached for a scalar, or for a container that carries an explicit
// default — a container without one descends into an empty container instead,
// so that required descendants still raise. That is why there is no longer any
// child walk here: building a container out of its children's defaults would
// also ignore the explicit default the node was given, and TS returns that
// default as-is.
func cloneDefault(n *node) any {
	if n.hasDefault {
		return cloneAny(n.defaultValue)
	}
	return n.defaultValue
}

// cloneAny copies maps and slices deeply. A cycle, or a container reached
// twice, is reproduced rather than followed.
func cloneAny(v any) any {
	// Only a container is copied; a scalar needs no cycle table.
	switch v.(type) {
	case map[string]any, []any:
		return cloneSeen(v, map[uintptr]any{})
	}
	return v
}

func cloneSeen(v any, seen map[uintptr]any) any {
	switch x := v.(type) {
	case map[string]any:
		if x == nil {
			return x
		}
		id := reflect.ValueOf(x).Pointer()
		if done, ok := seen[id]; ok {
			return done
		}
		out := map[string]any{}
		seen[id] = out
		for k, vv := range x {
			out[k] = cloneSeen(vv, seen)
		}
		return out
	case []any:
		if x == nil {
			return x
		}
		id := reflect.ValueOf(x).Pointer()
		if done, ok := seen[id]; ok {
			return done
		}
		out := make([]any, len(x))
		seen[id] = out
		for i, vv := range x {
			out[i] = cloneSeen(vv, seen)
		}
		return out
	default:
		return v
	}
}

func isNumber(v any) bool {
	switch v.(type) {
	case int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64,
		float32, float64:
		return true
	}
	return false
}

// isInteger reports whether v is a number with no fractional part. Every
// integer Go type qualifies; a float qualifies when it is finite and whole,
// mirroring Number.isInteger.
func isInteger(v any) bool {
	switch x := v.(type) {
	case float64:
		return !math.IsNaN(x) && !math.IsInf(x, 0) && x == math.Trunc(x)
	case float32:
		f := float64(x)
		return !math.IsNaN(f) && !math.IsInf(f, 0) && f == math.Trunc(f)
	}
	return isNumber(v)
}

func isNaN(v any) bool {
	switch x := v.(type) {
	case float64:
		return math.IsNaN(x)
	case float32:
		return math.IsNaN(float64(x))
	}
	return false
}

func isFunction(v any) bool {
	if v == nil {
		return false
	}
	return reflect.TypeOf(v).Kind() == reflect.Func
}

func toAnySlice(v any) ([]any, bool) {
	if arr, ok := v.([]any); ok {
		return arr, true
	}
	rv := reflect.ValueOf(v)
	if rv.Kind() == reflect.Slice {
		out := make([]any, rv.Len())
		for i := 0; i < rv.Len(); i++ {
			out[i] = rv.Index(i).Interface()
		}
		return out, true
	}
	return nil, false
}

func contains(ss []string, s string) bool {
	for _, x := range ss {
		if x == s {
			return true
		}
	}
	return false
}

func joinPath(path []string) string {
	// The segments' lengths are known, so the dotted form is one
	// allocation, and a single segment is itself.
	n, size := 0, 0
	first := ""
	for _, p := range path {
		if p == "" {
			continue
		}
		if n == 0 {
			first = p
		}
		n++
		size += len(p)
	}
	if n <= 1 {
		return first
	}
	var b strings.Builder
	b.Grow(size + n - 1)
	for _, p := range path {
		if p == "" {
			continue
		}
		if b.Len() > 0 {
			b.WriteByte('.')
		}
		b.WriteString(p)
	}
	return b.String()
}

func pathstr(s *State) string {
	if s == nil {
		return ""
	}
	return joinPath(s.Path)
}

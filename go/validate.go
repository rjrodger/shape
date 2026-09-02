package shape

import (
	"fmt"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"
)

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
	*state = State{
		Path:    path,
		PathArr: pathArr,
		Key:     key,
		Value:   in,
		Node:    n,
		Parent:  parent,
		Match:   match,
		Ctx:     ctx,
		absent:  absent,
	}

	// Run before-validators. They may replace the value or the node, and a
	// failing one ends the structural checks (TS handleValidate sets
	// update.done) — but every before still runs, and so do the afters.
	done := false
	for _, b := range n.befores {
		update := &Update{}
		state.checkName = b.name
		ok := b.fn(state.Value, update, state)
		applyUpdate(state, update)
		in = state.Value
		n = state.Node
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
	if done {
		runAfters(state, verr)
		return state.Value
	}

	state.Value = validateStructure(n, state, absent, path, pathArr, key, parent, ctx, match, verr)
	runAfters(state, verr)
	return state.Value
}

// absentSkips reports whether a failed check is to raise nothing: TS drops the
// errors of a check run against an absent value on a node that does not
// require one ("Skip allows undefined"), unless the check insisted with Done.
func absentSkips(state *State, update *Update) bool {
	n := state.Node
	return state.absent && state.Value == nil && (n.skippable || !n.required) && !update.Done
}

// validateStructure runs the structural checks — composition, nullable, Never,
// the missing-value rules and the kind check — and returns the produced value.
// The afters run afterwards whatever it reported, as they do in TS.
func validateStructure(n *node, state *State, absent bool, path []string, pathArr []any, key string, parent any, ctx *Context, match bool, verr *ValidationError) any {

	// Composition shortcuts. An absent value on a node that does not require
	// one is not put to the branches: TS drops the errors such a check would
	// raise, so Optional(One(...)) given nothing is simply absent.
	if n.kind == KindList && n.listMode != listNone && !(absent && !n.required) {
		return evaluateList(n, state.Value, path, pathArr, key, parent, ctx, match, verr, absent)
	}

	// Nullable: an explicit null is accepted as the value. Absent is still
	// governed by required/optional below, since a nil that is absent is not
	// yet in play here — the absent sentinel was translated above.
	if state.Value == nil && !absent && n.nullable {
		return state.Value
	}

	// Never rejects any value, present or absent. This precedes the missing-value
	// handling below: an absent value against Never is "no value is allowed",
	// not "the value is required".
	if n.kind == KindNever {
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
			err := makeErr(state, WhyRequired, requiredMarkFor(n.kind), "")
			if n.faultMsg != "" {
				if !err.terse {
					err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
				}
			}
			if !n.silent {
				verr.add(err)
			}
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
			err := makeErr(state, WhyType, markScalarType, "")
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
		update := &Update{}
		state.checkName = a.name
		ok := a.fn(state.Value, update, state)
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

		p := newProduced(arr, ctx, match)
		for i, v := range arr {
			if i < tupleLen {
				p.set(i, validateElem(n.arrChildren[i], v, path, pathArr, i, p.parent(), ctx, match, verr), match)
			} else {
				// len(arr) > tupleLen only reaches here when arrRest is set.
				p.set(i, validateElem(n.arrRest, v, path, pathArr, i, p.parent(), ctx, match, verr), match)
			}
		}
		// Missing tuple positions get their default.
		for i := len(arr); i < tupleLen; i++ {
			cn := n.arrChildren[i]
			v := validateNode(cn, undefinedVal, append(path, strconv.Itoa(i)), append(pathArr, i), strconv.Itoa(i), p.parent(), ctx, match, verr)
			if !match {
				p.ensure()
				p.out = append(p.out, v)
			}
		}
		return p.result(match)
	case n.arrChild != nil:
		p := newProduced(arr, ctx, match)
		for i, v := range arr {
			p.set(i, validateElem(n.arrChild, v, path, pathArr, i, p.parent(), ctx, match, verr), match)
		}
		return p.result(match)
	case n.arrRest != nil:
		// Rest with no tuple positions in front of it: every element is a rest
		// element. Without this case the node fell through to the default and
		// nothing was validated at all.
		p := newProduced(arr, ctx, match)
		for i, v := range arr {
			p.set(i, validateElem(n.arrRest, v, path, pathArr, i, p.parent(), ctx, match, verr), match)
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
}

func newProduced(arr []any, ctx *Context, match bool) produced {
	p := produced{in: arr}
	if !match && !pureCall(ctx) {
		p.ensure()
	}
	return p
}

// parent is what the elements see as their parent: the produced slice when
// there is one, the input otherwise.
func (p *produced) parent() any {
	if p.out != nil {
		return p.out
	}
	return p.in
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
	if p.out == nil {
		return p.in
	}
	return p.out
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
	for i, k := range n.objKeys {
		cn := n.objChildren[k]
		v, has := obj[k]
		if has {
			present++
		}
		var produced any
		kpath := append(path, k)
		kpathArr := append(pathArr, n.objKeysAny[i])

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
			if cn.skippable && (produced == nil || cn.silent) {
				continue
			}
			// A nil produced value means nothing was injected (required error, or
			// an optional field with no default) — omit the key, matching TS.
			// The exception is a null literal, whose default is the null
			// itself: TS injects it, so the key is present and null.
			if produced == nil && !(cn.kind == KindNull && cn.hasDefault && !cn.required) {
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

	for k, cn := range n.objChildren {
		if out != nil {
			if _, present := out[k]; present {
				continue
			}
		} else if _, present := obj[k]; present {
			continue
		}
		if !contains(n.objKeys, k) {
			produced := validateNode(cn, undefinedVal, append(path, k), append(pathArr, k), k, parentOf, ctx, match, verr)
			if produced != nil && !match {
				ensure()
				out[k] = produced
			}
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
	err := makeErr(state, WhyClosed, markObjectClosed, "")
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
		y, ok := b.([]any)
		return ok && len(x) == len(y) && reflect.ValueOf(x).Pointer() == reflect.ValueOf(y).Pointer()
	}
	ta, tb := reflect.TypeOf(a), reflect.TypeOf(b)
	return ta == tb && ta.Comparable() && a == b
}

func evaluateList(n *node, in any, path []string, pathArr []any, key string, parent any, ctx *Context, match bool, verr *ValidationError, absent bool) any {
	// Branches must see the value as the parent saw it: an absent value stays
	// absent, so a branch that does not require one can still match and supply
	// its default. Passing a bare nil instead made every branch see a present
	// null, which a typed branch rejects.
	branchIn := in
	if absent {
		branchIn = undefinedVal
	}

	switch n.listMode {
	case listOne:
		passN := 0
		var winner any = in
		for _, sn := range n.list {
			sub := &ValidationError{}
			out := validateNode(sn, branchIn, path, pathArr, key, parent, ctx, true, sub)
			if !sub.hasAny() {
				passN++
				if passN == 1 {
					if !match {
						out2 := validateNode(sn, branchIn, path, pathArr, key, parent, ctx, false, &ValidationError{})
						winner = out2
					} else {
						winner = out
					}
					break
				}
			}
		}
		if passN != 1 {
			state := &State{Path: path, PathArr: pathArr, Key: key, Value: in, Node: n, Match: match, Ctx: ctx, absent: absent}
			err := makeErr(state, WhyOne, 4030,
				fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" does not satisfy one of: %s", listShapeNames(n)))
			if n.faultMsg != "" {
				if !err.terse {
					err.Text = expandErrText(n.faultMsg, err.Path, in)
				}
			}
			if !n.silent {
				verr.add(err)
			}
			return in
		}
		return winner
	case listSome:
		matched := false
		var winner any = in
		for _, sn := range n.list {
			sub := &ValidationError{}
			out := validateNode(sn, branchIn, path, pathArr, key, parent, ctx, true, sub)
			if !sub.hasAny() {
				matched = true
				winner = validateNode(sn, branchIn, path, pathArr, key, parent, ctx, match, &ValidationError{})
				_ = out
			}
		}
		if !matched {
			state := &State{Path: path, PathArr: pathArr, Key: key, Value: in, Node: n, Match: match, Ctx: ctx, absent: absent}
			err := makeErr(state, WhySome, 4031,
				fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" does not satisfy any of: %s", listShapeNames(n)))
			if n.faultMsg != "" {
				if !err.terse {
					err.Text = expandErrText(n.faultMsg, err.Path, in)
				}
			}
			if !n.silent {
				verr.add(err)
			}
			return in
		}
		return winner
	case listAll:
		passAll := true
		out := in
		// All threads the value through its branches, so once a branch has
		// produced one it is no longer absent.
		branchOut := branchIn
		for _, sn := range n.list {
			sub := &ValidationError{}
			res := validateNode(sn, branchOut, path, pathArr, key, parent, ctx, match, sub)
			if sub.hasAny() {
				// The branch errors are diagnostic only: TS collects them into a
				// throwaway context and reports just the composite failure.
				passAll = false
			} else {
				out = res
				branchOut = res
			}
		}
		if !passAll {
			state := &State{Path: path, PathArr: pathArr, Key: key, Value: in, Node: n, Match: match, Ctx: ctx, absent: absent}
			err := makeErr(state, WhyAll, 4032,
				fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" does not satisfy all of: %s", listShapeNames(n)))
			if !n.silent {
				verr.add(err)
			}
			return in
		}
		return out
	}
	return in
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
	key := strconv.Itoa(i)
	epath := append(path, key)
	epathArr := append(pathArr, i)

	if isIgnore(cn) {
		produced, kept := validateIgnored(cn, v, epath, epathArr, key, parent, ctx, match)
		if !kept {
			return nil
		}
		return produced
	}

	return validateNode(cn, v, epath, epathArr, key, parent, ctx, match, verr)
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
	return cloneSeen(v, map[uintptr]any{})
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
	out := ""
	for _, p := range path {
		if p == "" {
			continue
		}
		if out == "" {
			out = p
		} else {
			out += "." + p
		}
	}
	return out
}

func pathstr(s *State) string {
	if s == nil {
		return ""
	}
	return joinPath(s.Path)
}

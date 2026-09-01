package shape

import (
	"fmt"
	"math"
	"reflect"
	"sort"
	"strconv"
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

	state := &State{
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

	// Run before-validators. They may replace value, replace node, or short-circuit.
	for _, b := range n.befores {
		update := &Update{}
		state.checkName = b.name
		ok := b.fn(state.Value, update, state)
		applyUpdate(state, update)
		in = state.Value
		n = state.Node
		if !ok {
			emitUpdateErrors(state, update, verr)
			if update.Done {
				if n.faultMsg != "" {
					replaceLastErrText(verr, n.faultMsg, state.Value, joinPath(path))
				}
				return state.Value
			}
		}
	}

	// Composition shortcuts.
	if n.kind == KindList {
		out := evaluateList(n, state.Value, path, pathArr, key, parent, ctx, match, verr, absent)
		state.Value = out
		runAfters(state, verr)
		return state.Value
	}

	// Never rejects any value, present or absent. This precedes the missing-value
	// handling below: an absent value against Never is "no value is allowed",
	// not "the value is required".
	if n.kind == KindNever {
		err := makeErr(state, WhyNever, markNever, "")
		if n.faultMsg != "" {
			err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
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
				err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
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
			err.Text = defaultErrText(err)
			if n.faultMsg != "" {
				err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
			}
			if !n.silent {
				verr.add(err)
			}
			return state.Value
		}
		if n.regexpVal != nil && !n.regexpVal.MatchString(sv) {
			err := makeErr(state, WhyRegexp, markRegexp, "")
			if n.faultMsg != "" {
				err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
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
				err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
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

	state.Value = out
	runAfters(state, verr)
	return state.Value
}

func emitTypeErr(state *State, verr *ValidationError, n *node) {
	err := makeErr(state, WhyType, typeMarkFor(n.kind), "")
	if n.faultMsg != "" {
		err.Text = expandErrText(n.faultMsg, err.Path, state.Value)
	}
	if !n.silent {
		verr.add(err)
	}
}

func runAfters(state *State, verr *ValidationError) {
	n := state.Node
	for _, a := range n.afters {
		update := &Update{}
		state.checkName = a.name
		ok := a.fn(state.Value, update, state)
		applyUpdate(state, update)
		if !ok {
			emitUpdateErrors(state, update, verr)
			if update.Done {
				if n.faultMsg != "" {
					replaceLastErrText(verr, n.faultMsg, state.Value, joinPath(state.Path))
				}
				return
			}
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
			out := make([]any, len(arr))
			copy(out, arr)
			return out
		}

		out := make([]any, len(arr))
		for i, v := range arr {
			if i < tupleLen {
				cn := n.arrChildren[i]
				out[i] = validateNode(cn, v, append(path, strconv.Itoa(i)), append(pathArr, i), strconv.Itoa(i), out, ctx, match, verr)
			} else {
				// len(arr) > tupleLen only reaches here when arrRest is set.
				out[i] = validateNode(n.arrRest, v, append(path, strconv.Itoa(i)), append(pathArr, i), strconv.Itoa(i), out, ctx, match, verr)
			}
		}
		// Missing tuple positions get their default.
		for i := len(arr); i < tupleLen; i++ {
			cn := n.arrChildren[i]
			out = append(out, validateNode(cn, undefinedVal, append(path, strconv.Itoa(i)), append(pathArr, i), strconv.Itoa(i), out, ctx, match, verr))
		}
		return out
	case n.arrChild != nil:
		out := make([]any, len(arr))
		for i, v := range arr {
			out[i] = validateNode(n.arrChild, v, append(path, strconv.Itoa(i)), append(pathArr, i), strconv.Itoa(i), out, ctx, match, verr)
		}
		return out
	case n.arrRest != nil:
		// Rest with no tuple positions in front of it: every element is a rest
		// element. Without this case the node fell through to the default and
		// nothing was validated at all.
		out := make([]any, len(arr))
		for i, v := range arr {
			out[i] = validateNode(n.arrRest, v, append(path, strconv.Itoa(i)), append(pathArr, i), strconv.Itoa(i), out, ctx, match, verr)
		}
		return out
	default:
		out := make([]any, len(arr))
		copy(out, arr)
		return out
	}
}

func validateObject(n *node, in any, path []string, pathArr []any, parent any, ctx *Context, match bool, verr *ValidationError) any {
	obj, ok := in.(map[string]any)
	if !ok {
		state := &State{Path: path, PathArr: pathArr, Value: in, Node: n, Parent: parent, Match: match, Ctx: ctx}
		emitTypeErr(state, verr, n)
		return nil
	}

	out := map[string]any{}
	for k, v := range obj {
		out[k] = v
	}

	// Track keys that are legally consumed by this object schema:
	// declared keys, rename targets, and claim sources.
	consumed := map[string]bool{}
	for _, k := range n.objKeys {
		consumed[k] = true
		cn := n.objChildren[k]
		if cn.renameTo != "" {
			consumed[cn.renameTo] = true
		}
		for _, src := range cn.renameClaim {
			consumed[src] = true
		}
	}

	// Unknown keys are reported before descending into the declared ones, which
	// is the order TS emits them in. The keys are sorted because Go map
	// iteration is random and the message order is compared exactly.
	if !n.open {
		unknown := make([]string, 0, len(obj))
		for k := range obj {
			if !consumed[k] {
				unknown = append(unknown, k)
			}
		}
		sort.Strings(unknown)

		for _, k := range unknown {
			// The path is the parent's; the offending key is reported separately.
			// TS renders this as:
			//   Validation failed for property "<parent>" because the property "<k>" is not allowed.
			state := &State{Path: path, PathArr: pathArr, Key: k, Value: obj, Node: n, Match: match, Ctx: ctx}
			err := makeErr(state, WhyClosed, markObjectClosed, "")
			if !n.silent {
				verr.add(err)
			}
		}
	}

	for _, k := range n.objKeys {
		cn := n.objChildren[k]
		v, has := obj[k]
		var produced any
		kpath := append(path, k)
		kpathArr := append(pathArr, k)

		// Rename.claim: if the value is missing and claim source has it, pick up.
		if !has && cn.renameTo != "" && len(cn.renameClaim) > 0 {
			for _, src := range cn.renameClaim {
				if sv, sh := obj[src]; sh {
					v = sv
					has = true
					if !cn.renameKeep {
						delete(out, src)
					}
					break
				}
			}
		}

		if !has {
			produced = validateNode(cn, undefinedVal, kpath, kpathArr, k, out, ctx, match, verr)
			if cn.skippable && (produced == nil || cn.silent) {
				delete(out, k)
				continue
			}
			// A nil produced value means nothing was injected (required error, or
			// an optional field with no default) — omit the key, matching TS.
			if produced == nil {
				delete(out, k)
				continue
			}
		} else {
			// Ignore: keep the value only when it validates cleanly, otherwise
			// drop it (and any errors it would raise).
			if isIgnore(cn) {
				probed, kept := validateIgnored(cn, v, kpath, kpathArr, k, out, ctx, match)
				if !kept {
					delete(out, k)
					continue
				}
				out[k] = probed
				continue
			}
			produced = validateNode(cn, v, kpath, kpathArr, k, out, ctx, match, verr)
		}

		out[k] = produced

		// Apply Rename: if child has renameTo, move into target key.
		if cn.renameTo != "" && cn.renameTo != k {
			out[cn.renameTo] = produced
			if !cn.renameKeep {
				delete(out, k)
			}
		}
	}

	for k, cn := range n.objChildren {
		if _, present := out[k]; present {
			continue
		}
		if !contains(n.objKeys, k) {
			produced := validateNode(cn, undefinedVal, append(path, k), append(pathArr, k), k, out, ctx, match, verr)
			if produced != nil {
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
			out[k] = validateNode(n.objRest, obj[k], append(path, k), append(pathArr, k), k, out, ctx, match, verr)
		}
	}

	return out
}

func evaluateList(n *node, in any, path []string, pathArr []any, key string, parent any, ctx *Context, match bool, verr *ValidationError, absent bool) any {
	switch n.listMode {
	case listOne:
		passN := 0
		var winner any = in
		for _, sn := range n.list {
			sub := &ValidationError{}
			out := validateNode(sn, in, path, pathArr, key, parent, ctx, true, sub)
			if !sub.hasAny() {
				passN++
				if passN == 1 {
					if !match {
						out2 := validateNode(sn, in, path, pathArr, key, parent, ctx, false, &ValidationError{})
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
				err.Text = expandErrText(n.faultMsg, err.Path, in)
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
			out := validateNode(sn, in, path, pathArr, key, parent, ctx, true, sub)
			if !sub.hasAny() {
				matched = true
				winner = validateNode(sn, in, path, pathArr, key, parent, ctx, match, &ValidationError{})
				_ = out
			}
		}
		if !matched {
			state := &State{Path: path, PathArr: pathArr, Key: key, Value: in, Node: n, Match: match, Ctx: ctx, absent: absent}
			err := makeErr(state, WhySome, 4031,
				fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" does not satisfy any of: %s", listShapeNames(n)))
			if n.faultMsg != "" {
				err.Text = expandErrText(n.faultMsg, err.Path, in)
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
		for _, sn := range n.list {
			sub := &ValidationError{}
			res := validateNode(sn, out, path, pathArr, key, parent, ctx, match, sub)
			if sub.hasAny() {
				// The branch errors are diagnostic only: TS collects them into a
				// throwaway context and reports just the composite failure.
				passAll = false
			} else {
				out = res
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
		verr.add(makeErr(state, why, mark, ""))
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

func replaceLastErrText(verr *ValidationError, msg string, val any, path string) {
	if len(verr.Issues) == 0 {
		return
	}
	idx := len(verr.Issues) - 1
	verr.Issues[idx].Text = expandErrText(msg, path, val)
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

func cloneDefault(n *node) any {
	switch n.kind {
	case KindObject:
		out := map[string]any{}
		for _, k := range n.objKeys {
			cn := n.objChildren[k]
			if cn.required || cn.skippable {
				continue
			}
			if cn.hasDefault || cn.kind == KindObject || cn.kind == KindArray || cn.kind == KindNull {
				out[k] = cloneDefault(cn)
			}
		}
		return out
	case KindArray:
		if n.hasDefault {
			return cloneAny(n.defaultValue)
		}
		return []any{}
	default:
		if n.hasDefault {
			return cloneAny(n.defaultValue)
		}
		return n.defaultValue
	}
}

func cloneAny(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := map[string]any{}
		for k, vv := range x {
			out[k] = cloneAny(vv)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, vv := range x {
			out[i] = cloneAny(vv)
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

// collectDefines walks the node tree and registers all Define nodes into
// ctx.Refs so Refer lookups don't depend on traversal order.
func collectDefines(n *node, ctx *Context) {
	if n == nil || ctx == nil {
		return
	}
	if n.defineName != "" {
		ctx.Refs[n.defineName] = n
	}
	for _, cn := range n.objChildren {
		collectDefines(cn, ctx)
	}
	if n.objRest != nil {
		collectDefines(n.objRest, ctx)
	}
	for _, cn := range n.arrChildren {
		collectDefines(cn, ctx)
	}
	if n.arrChild != nil {
		collectDefines(n.arrChild, ctx)
	}
	if n.arrRest != nil {
		collectDefines(n.arrRest, ctx)
	}
	for _, sn := range n.list {
		collectDefines(sn, ctx)
	}
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

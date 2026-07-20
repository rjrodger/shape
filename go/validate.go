package shape

import (
	"fmt"
	"math"
	"reflect"
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
		out := evaluateList(n, state.Value, path, pathArr, key, parent, ctx, match, verr)
		state.Value = out
		runAfters(state, verr)
		return state.Value
	}

	// Missing value (JS undefined): required error, skip, or inject the default.
	// An explicit null (present, not absent) falls through to structural checks
	// below — where, e.g., null against a String is a type error, not a required
	// error (mirrors TS undefined-vs-null semantics).
	if state.Value == nil && absent {
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
		return cloneDefault(n)
	}

	// Structural type checks.
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

	out := state.Value

	switch n.kind {
	case KindAny, KindCheck:
		// nothing structural to enforce
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
		out = validateArray(n, state.Value, path, pathArr, ctx, match, verr)
		if out == nil {
			return state.Value
		}
	case KindObject:
		out = validateObject(n, state.Value, path, pathArr, ctx, match, verr)
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

func validateArray(n *node, in any, path []string, pathArr []any, ctx *Context, match bool, verr *ValidationError) any {
	arr, ok := toAnySlice(in)
	if !ok {
		state := &State{Path: path, PathArr: pathArr, Value: in, Node: n, Match: match, Ctx: ctx}
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
	default:
		out := make([]any, len(arr))
		copy(out, arr)
		return out
	}
}

func validateObject(n *node, in any, path []string, pathArr []any, ctx *Context, match bool, verr *ValidationError) any {
	obj, ok := in.(map[string]any)
	if !ok {
		state := &State{Path: path, PathArr: pathArr, Value: in, Node: n, Match: match, Ctx: ctx}
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
			// Ignore: keep the value only when it validates cleanly, otherwise drop
			// it (and any errors it would raise). Probe with silent disabled so the
			// failure is observable (mirrors TS Ignore inspecting curerr).
			if cn.silent && cn.skippable {
				probe := *cn
				probe.silent = false
				sub := &ValidationError{}
				probed := validateNode(&probe, v, kpath, kpathArr, k, out, ctx, match, sub)
				if sub.hasAny() {
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

	switch {
	case n.open && n.objRest != nil:
		for k, v := range obj {
			if _, declared := n.objChildren[k]; declared {
				continue
			}
			out[k] = validateNode(n.objRest, v, append(path, k), append(pathArr, k), k, out, ctx, match, verr)
		}
	case n.open:
		// keep unknown as-is
	default:
		for k := range obj {
			if consumed[k] {
				continue
			}
			// Closed: path is the parent's path; the offending key is
			// reported separately. TS makeErrImpl renders this as:
			//   Validation failed for property "<parent>" because the property "<k>" is not allowed.
			state := &State{Path: path, PathArr: pathArr, Key: k, Value: obj, Node: n, Match: match, Ctx: ctx}
			err := makeErr(state, WhyClosed, markObjectClosed, "")
			if !n.silent {
				verr.add(err)
			}
		}
	}

	return out
}

func evaluateList(n *node, in any, path []string, pathArr []any, key string, parent any, ctx *Context, match bool, verr *ValidationError) any {
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
			state := &State{Path: path, PathArr: pathArr, Key: key, Value: in, Node: n, Match: match, Ctx: ctx}
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
			state := &State{Path: path, PathArr: pathArr, Key: key, Value: in, Node: n, Match: match, Ctx: ctx}
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
				passAll = false
				if !match {
					verr.Issues = append(verr.Issues, sub.Issues...)
				}
			} else {
				out = res
			}
		}
		if !passAll {
			state := &State{Path: path, PathArr: pathArr, Key: key, Value: in, Node: n, Match: match, Ctx: ctx}
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

package shape

// Declarative JSON
// ================
// A shape written back as the JSON that Build reads: every string is an
// expression of the string DSL, a key expression ("a: String") carries its
// example as the value, and a "$$" key applies an expression to the object
// that holds it, with "$$0", "$$1", ... beside it for the arguments an
// expression cannot spell inline (an object or array shape). The result
// reads back as the same shape: Build(s.JSON()).JSON() is s.JSON(), and the
// two accept and produce the same values. Nothing a function does can be
// written down, so a shape carrying one (Check(fn), Before, After,
// Transform, Key(fn)) is an error, as is a builder option the DSL has no
// word for (Rename's Keep and Claim, Refer's Fill and Strict) and a default
// that is an object, an array or a date.
//
// This mirrors ts/src/shape.ts nodeJson; the Rust port carries the same.

import (
	"fmt"
	"math"
	"reflect"
	"regexp"
	"strings"
	"time"
)

const jsonMark = "$$"

var jsonToken = map[Kind]string{
	KindString:  "String",
	KindNumber:  "Number",
	KindInteger: "Integer",
	KindBoolean: "Boolean",
}

var jsonFormats = map[string]bool{
	"Email": true, "Url": true, "Uuid": true, "DateTime": true, "Ip": true, "Ipv4": true, "Ipv6": true,
}

// jsonCannot is what the export raises where the JSON cannot say what the
// shape does; JSON() turns it into the error.
type jsonCannot struct{ what string }

func (c jsonCannot) Error() string { return "Shape: json cannot express " + c.what }

func jsonFault(what string) {
	panic(jsonCannot{what})
}

// An argument of a call: inline expression text, or a spec that rides in a
// sidecar ("$$0") beside the expression.
type jsonArg struct {
	x    string
	j    any
	side bool
}

type jsonCall struct {
	n string
	a []jsonArg
}

func jx(x string) jsonArg { return jsonArg{x: x} }

// JSON is the declarative JSON of the shape, which Build reads back.
func (s *Schema) JSON() (out any, err error) {
	if s == nil || s.root == nil {
		return nil, nil
	}
	defer func() {
		if r := recover(); r != nil {
			if c, ok := r.(jsonCannot); ok {
				out, err = nil, c
				return
			}
			panic(r)
		}
	}()
	return nodeJSON(s.root), nil
}

// isKeyExpr is whether a key is a key expression: a name, a colon, and an
// expression.
func isKeyExpr(k string) bool {
	m := keyExprRE.FindStringSubmatch(k)
	return m != nil && strings.Contains(k, ":") && m[2] != ""
}

// jsonLiteral is the inline text of a literal argument: a JSON scalar, or
// NaN.
func jsonLiteral(v any, what string) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case string, bool:
		return jsonText(x)
	}
	if f, ok := toFloat64(v); ok {
		if math.IsNaN(f) {
			return "NaN"
		}
		if math.IsInf(f, 0) {
			jsonFault(what + " " + fmt.Sprint(v))
		}
		return jsonText(f)
	}
	jsonFault(what + " " + jsonTypeName(v))
	return ""
}

// jsonTypeName is the JavaScript typeof of a value, for a message.
func jsonTypeName(v any) string {
	if reflect.TypeOf(v).Kind() == reflect.Func {
		return "function"
	}
	return "object"
}

func toFloat64(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return reflect.ValueOf(x).Convert(reflect.TypeOf(float64(0))).Float(), true
	}
	return 0, false
}

// jsonNoAfters: an after check is a custom one, which cannot be written.
func jsonNoAfters(afters []validator) {
	for _, v := range afters {
		jsonFault("a custom after check " + v.name)
	}
}

// jsonValidatorCalls is the checks a node carries, as calls, in the order
// they run; the check `skip` is the head of the expression and left out.
func jsonValidatorCalls(n *node, skip *validator) []jsonCall {
	var calls []jsonCall
	for i := range n.befores {
		if skip != &n.befores[i] {
			calls = jsonValidatorCall(&n.befores[i], calls)
		}
	}
	jsonNoAfters(n.afters)
	return calls
}

func jsonValidatorCall(v *validator, calls []jsonCall) []jsonCall {
	name := v.name
	switch {
	case name == "Min" || name == "Max" || name == "Above" || name == "Below" || name == "Len":
		return append(calls, jsonCall{n: name, a: []jsonArg{jx(jsonLiteral(v.args[0], "the bound"))}})
	case name == "Catch":
		// The taken checks run inside, so they read ahead of the taker.
		for i := range v.inner.befores {
			calls = jsonValidatorCall(&v.inner.befores[i], calls)
		}
		jsonNoAfters(v.inner.afters)
		return append(calls, jsonCall{n: name, a: []jsonArg{jx(jsonLiteral(v.args[0], "the fallback"))}})
	case name == "Transform":
		jsonFault(name)
	case name == "Coerce" || jsonFormats[name]:
		return append(calls, jsonCall{n: name})
	case name == "Define" || name == "Refer":
		return append(calls, jsonCall{n: name, a: []jsonArg{jx(jsonText(v.args[0]))}})
	case name == "Key":
		args := make([]jsonArg, len(v.args))
		for i, a := range v.args {
			args[i] = jx(jsonLiteral(a, "the Key argument"))
		}
		return append(calls, jsonCall{n: name, a: args})
	case strings.HasPrefix(name, "/"):
		return append(calls, jsonCall{n: "Check", a: []jsonArg{jx(name)}})
	case name == "Exact":
		args := make([]jsonArg, len(v.args))
		for i, a := range v.args {
			args[i] = jx(jsonLiteral(a, "the Exact value"))
		}
		return append(calls, jsonCall{n: name, a: args})
	case name == "Check":
		jsonFault("a check function")
	case name == "One" || name == "Some" || name == "All" || name == "Discriminated":
		// The list itself is the head of the expression.
	default:
		jsonFault("a custom check " + name)
	}
	return calls
}

// jsonRequiredCalls is whether the node is required or skipped, as calls,
// for a head that says neither: Required where the head is optional by
// itself, Optional or Skip where it is required. Ignore says skipped
// already.
func jsonRequiredCalls(n *node, headRequired bool) []jsonCall {
	var calls []jsonCall
	ignored := n.silent && n.skippable
	if n.required && !headRequired {
		calls = append(calls, jsonCall{n: "Required"})
	} else if !n.required && !ignored {
		if n.skippable {
			calls = append(calls, jsonCall{n: "Skip"})
		} else if headRequired {
			calls = append(calls, jsonCall{n: "Optional"})
		}
	}
	return calls
}

// jsonFlagCalls is the flags of the node, as calls. An empty literal head
// says Empty by itself. Rename is a flag here, and reads first among the
// checks, as it does when written first.
func jsonFlagCalls(n *node, literalHead bool) []jsonCall {
	var calls []jsonCall
	if n.kind == KindString && n.empty && !(literalHead && n.defaultValue == "") {
		calls = append(calls, jsonCall{n: "Empty"})
	}
	if n.nullable {
		calls = append(calls, jsonCall{n: "Nullable"})
	}
	if n.renameTo != "" {
		if n.renameKeep || len(n.renameClaim) > 0 {
			jsonFault("the options of Rename")
		}
		calls = append(calls, jsonCall{n: "Rename", a: []jsonArg{jx(jsonText(n.renameTo))}})
	}
	if n.referName != "" && (n.referFill || n.referStrict) {
		jsonFault("the options of Refer")
	}
	return calls
}

// jsonTailCalls: Ignore is a flag, read after the checks it silences, then
// the description and the fault text.
func jsonTailCalls(n *node) []jsonCall {
	var calls []jsonCall
	if n.silent && n.skippable {
		calls = append(calls, jsonCall{n: "Ignore"})
	}
	if d, ok := n.meta["description"]; ok {
		calls = append(calls, jsonCall{n: "Describe", a: []jsonArg{jx(jsonText(d))}})
	}
	if n.faultMsg != "" {
		calls = append(calls, jsonCall{n: "Fault", a: []jsonArg{jx(jsonText(n.faultMsg))}})
	}
	return calls
}

// jsonArgOf is the value form of a node as an argument: inline when it is
// a string.
func jsonArgOf(n *node) jsonArg {
	j := nodeJSON(n)
	if s, ok := j.(string); ok {
		return jx(s)
	}
	return jsonArg{j: j, side: true}
}

// jsonIsOpen is whether an open object's child shape is the plain Any of
// Open.
func jsonIsOpen(c *node) bool {
	return c.kind == KindAny && !c.required && len(c.befores) == 0 && len(c.afters) == 0 &&
		c.objRest == nil && (!c.hasDefault || c.defaultValue == nil)
}

// jsonCallText is the text of a call, its sidecar arguments registered in
// refs. A shape is the call's last argument.
func jsonCallText(c jsonCall, refs map[string]any, shape string) string {
	var parts []string
	for _, a := range c.a {
		if a.side {
			name := jsonMark + fmt.Sprint(len(refs))
			refs[name] = a.j
			parts = append(parts, name)
		} else {
			parts = append(parts, a.x)
		}
	}
	if shape != "" {
		parts = append(parts, shape)
	}
	if len(parts) == 0 {
		return c.n
	}
	return c.n + "(" + strings.Join(parts, ",") + ")"
}

// jsonChainText is a chain of calls after a head, or with no head as a bare
// chain; empty with neither.
func jsonChainText(head string, calls []jsonCall, refs map[string]any) string {
	out := head
	for _, c := range calls {
		text := jsonCallText(c, refs, "")
		if out == "" {
			out = text
		} else {
			out += "." + text
		}
	}
	return out
}

// jsonWrapText is the calls around a shape that is not a node by itself (a
// literal, a regexp, a sidecar): the first takes it, the rest chain.
func jsonWrapText(calls []jsonCall, shape string, refs map[string]any) string {
	out := jsonCallText(calls[0], refs, shape)
	for _, c := range calls[1:] {
		out += "." + jsonCallText(c, refs, "")
	}
	return out
}

// jsonCarrier is a carrier object: the expression under "$$", the sidecars
// beside it.
func jsonCarrier(text string, refs map[string]any) map[string]any {
	out := map[string]any{jsonMark: text}
	for k, v := range refs {
		out[k] = v
	}
	return out
}

// jsonLiteralHead is a literal, held by the call that says whether it is
// required.
func jsonLiteralHead(n *node, lit string) string {
	call := "Optional"
	if n.skippable {
		call = "Skip"
	} else if n.required {
		call = "Required"
	}
	return call + "(" + lit + ")"
}

// jsonHeadValidator is the validator that makes the node the head of its
// expression, so that the node has no key form: Key makes it, and Exact
// reads every argument as a value.
func jsonHeadValidator(n *node) *validator {
	for i := range n.befores {
		if n.befores[i].name == "Key" || n.befores[i].name == "Exact" {
			return &n.befores[i]
		}
	}
	return nil
}

// jsonZero is whether a scalar's default is its kind's zero, the example a
// type token brings.
func jsonZero(n *node) bool {
	if !n.hasDefault {
		return true
	}
	switch n.kind {
	case KindString:
		return n.defaultValue == ""
	case KindBoolean:
		return n.defaultValue == false
	}
	f, ok := toFloat64(n.defaultValue)
	return ok && f == 0
}

type jsonScalarParts struct {
	head    string
	token   string
	example any
	calls   []jsonCall
}

// jsonScalar is the parts of a scalar: the head (a type token, a held
// literal, or Key), the token of the key form (empty where the head is not
// one), the example of the key form, and the calls after the head.
func jsonScalar(n *node) jsonScalarParts {
	zero := jsonZero(n)
	var example any = n.defaultValue
	if zero {
		example = zeroForKind(n.kind)
	}
	hv := jsonHeadValidator(n)
	p := jsonScalarParts{example: example}

	switch {
	case hv != nil && hv.name == "Key":
		p.head = jsonCallText(jsonValidatorCall(hv, nil)[0], nil, "")
		p.calls = append(jsonRequiredCalls(n, false), jsonFlagCalls(n, false)...)
	// A literal stands for its own kind, but not for integer, and an empty
	// string literal allows the empty string; a required zero is the type
	// token.
	case (n.required && zero) || n.kind == KindInteger ||
		(n.kind == KindString && !n.empty && n.defaultValue == ""):
		p.token = jsonToken[n.kind]
		p.head = p.token
		p.calls = append(jsonRequiredCalls(n, true), jsonFlagCalls(n, false)...)
	default:
		p.head = jsonLiteralHead(n, jsonLiteral(example, "the default"))
		p.calls = jsonFlagCalls(n, true)
	}

	var skip *validator
	if hv != nil && hv.name == "Key" {
		skip = hv
	}
	p.calls = append(p.calls, jsonValidatorCalls(n, skip)...)
	p.calls = append(p.calls, jsonTailCalls(n)...)
	return p
}

// jsonKeyForm is the key form of a property, "name: chain" with its
// example, or false where the node has no key form (a list, a regexp, a
// shape needing sidecars).
func jsonKeyForm(n *node) (chain string, example any, ok bool) {
	if jsonHeadValidator(n) != nil {
		return "", nil, false
	}
	if _, isTok := jsonToken[n.kind]; isTok {
		sc := jsonScalar(n)
		// With a literal head, the call that held the literal starts the chain.
		head := sc.token
		if head == "" {
			if n.skippable {
				head = "Skip"
			} else if n.required {
				head = "Required"
			}
		}
		return jsonChainText(head, sc.calls, map[string]any{}), sc.example, true
	}
	if n.kind == KindObject {
		children, chain, refs := jsonObject(n)
		if len(refs) > 0 {
			return "", nil, false
		}
		return chain, children, true
	}
	if n.kind == KindArray {
		a := jsonArray(n)
		if len(a.refs) > 0 || a.closed {
			return "", nil, false
		}
		return a.chain, a.elements, true
	}
	return "", nil, false
}

var jsonQuoteRE = regexp.MustCompile(`[\s"\\]`)

// jsonObject is the children of an object in key form, and the chain that
// applies to the object (empty when there is none).
func jsonObject(n *node) (children map[string]any, chain string, refs map[string]any) {
	children = map[string]any{}
	refs = map[string]any{}

	// A type token brings the empty object as its default, which the walk
	// makes for an absent object anyway; any other default is one the
	// expression form cannot spell.
	if m, ok := n.defaultValue.(map[string]any); n.hasDefault && (!ok || len(m) > 0) && n.defaultValue != nil {
		jsonFault("an object default")
	}

	for _, k := range n.objKeys {
		if strings.HasPrefix(k, jsonMark) {
			jsonFault("the property name " + jsonText(k))
		}
		c := n.objChildren[k]
		kchain, example, keyable := jsonKeyForm(c)
		quoted := jsonQuoteRE.MatchString(k) || k == "" || isKeyExpr(k)
		switch {
		case keyable && kchain != "":
			name := k
			if quoted {
				name = jsonText(k)
			}
			children[name+": "+kchain] = example
		case keyable && isKeyExpr(k):
			// A name that reads as a key expression is quoted, and so needs a
			// chain; Optional says nothing about a node that is optional
			// already.
			children[jsonText(k)+": Optional"] = example
		case isKeyExpr(k):
			jsonFault("the property name " + jsonText(k) + " of a value with no key form")
		default:
			children[k] = nodeJSON(c)
		}
	}

	calls := append(jsonRequiredCalls(n, false), jsonFlagCalls(n, false)...)
	calls = append(calls, jsonValidatorCalls(n, nil)...)
	switch {
	case n.objRest == nil:
		if len(n.objKeys) == 0 {
			calls = append(calls, jsonCall{n: "Closed"})
		}
	case jsonIsOpen(n.objRest):
		if len(n.objKeys) > 0 {
			calls = append(calls, jsonCall{n: "Open"})
		}
	default:
		calls = append(calls, jsonCall{n: "Child", a: []jsonArg{jsonArgOf(n.objRest)}})
	}
	calls = append(calls, jsonTailCalls(n)...)

	if len(calls) > 0 {
		chain = jsonChainText("", calls, refs)
	}
	return children, chain, refs
}

type jsonArrayParts struct {
	elements []any
	calls    []jsonCall
	chain    string
	refs     map[string]any
	closed   bool
}

// jsonArray is the elements of an array in value form: the fixed positions,
// or the one element shape. A single fixed position is closed, which [X]
// cannot say.
func jsonArray(n *node) jsonArrayParts {
	a := jsonArrayParts{elements: []any{}, refs: map[string]any{}}

	if d, ok := n.defaultValue.([]any); n.hasDefault && (!ok || len(d) > 0) && n.defaultValue != nil {
		jsonFault("an array default")
	}

	switch {
	case len(n.arrChildren) > 0:
		for _, p := range n.arrChildren {
			a.elements = append(a.elements, nodeJSON(p))
		}
		a.closed = len(n.arrChildren) == 1
	case n.arrChild != nil && n.arrRest == nil:
		a.elements = append(a.elements, nodeJSON(n.arrChild))
	}

	a.calls = append(jsonRequiredCalls(n, false), jsonFlagCalls(n, false)...)
	a.calls = append(a.calls, jsonValidatorCalls(n, nil)...)
	if n.arrRest != nil {
		a.calls = append(a.calls, jsonCall{n: "Rest", a: []jsonArg{jsonArgOf(n.arrRest)}})
	}
	a.calls = append(a.calls, jsonTailCalls(n)...)

	if len(a.calls) > 0 {
		a.chain = jsonChainText("", a.calls, a.refs)
	}
	return a
}

// jsonHeaded is a node whose head is a call that makes it (Key on an array):
// the head, then the rest of the chain. Exact reads its arguments as values,
// so an object or an array with it cannot be written.
func jsonHeaded(n *node, hv *validator, kind string) any {
	if hv.name == "Exact" {
		jsonFault("Exact on " + kind)
	}
	head := jsonCallText(jsonValidatorCall(hv, nil)[0], nil, "")
	calls := append(jsonRequiredCalls(n, false), jsonFlagCalls(n, false)...)
	calls = append(calls, jsonValidatorCalls(n, hv)...)
	calls = append(calls, jsonTailCalls(n)...)
	return jsonChainText(head, calls, map[string]any{})
}

// nodeJSON is the value form of a node: the JSON that reads back as it.
func nodeJSON(n *node) any {
	if _, isTok := jsonToken[n.kind]; isTok {
		sc := jsonScalar(n)
		// A literal with nothing after it is the JSON value; a string is
		// quoted, as a bare one would read as an expression.
		if sc.token == "" && len(sc.calls) == 0 && jsonHeadValidator(n) == nil && !n.required && !n.skippable {
			if n.kind == KindString {
				return jsonText(sc.example)
			}
			return sc.example
		}
		return jsonChainText(sc.head, sc.calls, map[string]any{})
	}

	hv := jsonHeadValidator(n)

	switch n.kind {
	case KindObject:
		if hv != nil {
			return jsonHeaded(n, hv, "an object")
		}
		children, chain, refs := jsonObject(n)
		if chain != "" {
			children[jsonMark] = chain
			for k, v := range refs {
				children[k] = v
			}
		}
		return children

	case KindArray:
		if hv != nil {
			return jsonHeaded(n, hv, "an array")
		}
		a := jsonArray(n)
		if a.chain == "" && !a.closed {
			return a.elements
		}
		// The calls take the array as their shape; a single position is
		// closed first, as a one element array is an element shape.
		refs := map[string]any{}
		name := jsonMark + "0"
		refs[name] = a.elements
		shape := name
		if a.closed {
			shape = "Closed(" + name + ")"
		}
		if len(a.calls) == 0 {
			return jsonCarrier(shape, refs)
		}
		return jsonCarrier(jsonWrapText(a.calls, shape, refs), refs)

	case KindList:
		refs := map[string]any{}
		var head jsonCall
		if n.disc != nil {
			head = jsonCall{n: "Discriminated", a: []jsonArg{
				jx(jsonText(n.disc.tag)), {j: jsonBranches(n), side: true}}}
		} else {
			mode := "One"
			switch n.listMode {
			case listSome:
				mode = "Some"
			case listAll:
				mode = "All"
			}
			head = jsonCall{n: mode}
			for _, b := range n.list {
				head.a = append(head.a, jsonArgOf(b))
			}
		}
		calls := append(jsonRequiredCalls(n, true), jsonFlagCalls(n, false)...)
		calls = append(calls, jsonValidatorCalls(n, nil)...)
		calls = append(calls, jsonTailCalls(n)...)
		text := jsonChainText(jsonCallText(head, refs, ""), calls, refs)
		if len(refs) == 0 {
			return text
		}
		return jsonCarrier(text, refs)

	case KindRegexp:
		// A regexp is not a node until a builder takes it, so the calls wrap it.
		calls := append(jsonRequiredCalls(n, true), jsonFlagCalls(n, false)...)
		calls = append(calls, jsonValidatorCalls(n, nil)...)
		calls = append(calls, jsonTailCalls(n)...)
		re := "/" + n.regexpSrc + "/"
		if len(calls) == 0 {
			return re
		}
		return jsonWrapText(calls, re, map[string]any{})

	case KindNaN:
		calls := append(jsonFlagCalls(n, true), jsonValidatorCalls(n, nil)...)
		calls = append(calls, jsonTailCalls(n)...)
		if len(calls) == 0 && !n.required && !n.skippable {
			return "NaN"
		}
		return jsonChainText(jsonLiteralHead(n, "NaN"), calls, map[string]any{})
	}

	// The rest are a call that names the kind, then the chain.
	var head string
	headRequired := true
	headSkipped := false
	switch n.kind {
	case KindAny:
		head = "Any"
		if n.required {
			head = "Required"
		}
		headRequired = n.required
		if n.hasDefault && n.defaultValue != nil {
			head += "(" + jsonLiteral(n.defaultValue, "the default") + ")"
		}
		if n.open && (n.objRest == nil || jsonIsOpen(n.objRest)) {
			head += ".Open"
		}
	case KindNever:
		head = "Never"
		headRequired = false
	case KindNull:
		if !n.required && !n.skippable && len(n.befores) == 0 && len(n.afters) == 0 &&
			!n.nullable && n.faultMsg == "" && n.meta["description"] == nil && n.renameTo == "" {
			return nil
		}
		switch {
		case n.required:
			head = "Required(null)"
		case n.skippable:
			head = "Skip(null)"
		default:
			head = "null"
		}
		headRequired = n.required
		headSkipped = n.skippable
	case KindDate, KindFunction:
		if n.hasDefault && n.defaultValue != nil {
			if _, isDate := n.defaultValue.(time.Time); isDate || n.kind == KindFunction {
				jsonFault("a " + string(n.kind) + " default")
			}
		}
		head = "Function"
		if n.kind == KindDate {
			head = "Date"
		}
	case KindCheck:
		// Check is the first call, and says required.
		if len(n.befores) == 0 || !strings.HasPrefix(n.befores[0].name, "/") {
			jsonFault("a check function")
		}
		first := &n.befores[0]
		head = jsonCallText(jsonValidatorCall(first, nil)[0], nil, "")
		calls := append(jsonRequiredCalls(n, true), jsonFlagCalls(n, false)...)
		calls = append(calls, jsonValidatorCalls(n, first)...)
		calls = append(calls, jsonTailCalls(n)...)
		return jsonChainText(head, calls, map[string]any{})
	default:
		jsonFault("a " + string(n.kind) + " value")
	}

	var rp []jsonCall
	if !headSkipped {
		rp = jsonRequiredCalls(n, headRequired)
	}
	calls := append(jsonFlagCalls(n, false), jsonValidatorCalls(n, nil)...)
	calls = append(calls, jsonTailCalls(n)...)
	if headRequired && len(rp) > 0 && n.kind != KindAny {
		// Optional(Date), Skip(Never): the call holds the token.
		head = rp[0].n + "(" + head + ")"
		return jsonChainText(head, calls, map[string]any{})
	}
	return jsonChainText(head, append(rp, calls...), map[string]any{})
}

// jsonBranches is the branches of a Discriminated union by tag value. A
// branch's tag property is what the union added, unless the author
// declared it.
func jsonBranches(n *node) map[string]any {
	out := map[string]any{}
	tag := n.disc.tag
	for i, t := range n.disc.tags {
		b := n.list[i]
		j := nodeJSON(b)
		if b.kind == KindObject {
			if tn, ok := b.objChildren[tag]; ok && tn.kind == KindString && !tn.required &&
				tn.defaultValue == t && len(tn.befores) == 0 && len(tn.afters) == 0 && tn.faultMsg == "" {
				if m, isMap := j.(map[string]any); isMap {
					delete(m, tag)
				}
			}
		}
		out[t] = j
	}
	return out
}

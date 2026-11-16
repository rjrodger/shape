package shape

import (
	"fmt"
	"math"
	"math/big"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// buildize prepares a *Node for further builder mutation. Pass nil to start a
// fresh blank node, or an existing spec to lift it into the builder chain.
func buildize(spec any) *Node {
	if spec == nil {
		return newNodeWrap(&node{kind: KindAny})
	}
	if nw, ok := spec.(*Node); ok {
		return nw
	}
	n, err := normalize(spec)
	if err != nil {
		// Builders accept any spec; deferred errors surface at validation time.
		return newNodeWrap(faultNode(err.Error()))
	}
	return newNodeWrap(n)
}

// faultNode is the node a spec that cannot be built stands for: it accepts
// nothing and says why. It is required, as a bare Never is, so an absent
// value meets the fault too.
func faultNode(msg string) *node {
	return &node{kind: KindNever, faultMsg: msg, required: true, requiredSet: true}
}

// Required marks the value as required. Single-arg form Required(spec) wraps an
// existing spec; zero-arg Required() yields a required Any.
func Required(spec ...any) *Node {
	if len(spec) == 0 {
		nb := buildize(nil)
		nb.n.required = true
		nb.n.requiredSet = true
		nb.n.skippable = false
		return nb
	}
	nb := buildizeLiteral(spec[0])
	nb.n.required = true
	nb.n.requiredSet = true
	nb.n.skippable = false
	return nb
}

// buildizeLiteral is buildize for an explicit spec argument, where a nil is
// the null literal (TS Required(null)) rather than the absence of a spec.
func buildizeLiteral(spec any) *Node {
	if spec == nil {
		n, _ := normalize(nil)
		return newNodeWrap(n)
	}
	return buildize(spec)
}

// Required (chained) on a Node.
func (n *Node) Required() *Node {
	n.n.required = true
	n.n.requiredSet = true
	n.n.skippable = false
	return n
}

// Optional marks the value as optional.
func Optional(spec ...any) *Node {
	if len(spec) == 0 {
		nb := buildize(nil)
		nb.n.required = false
		nb.n.requiredSet = true
		return nb
	}
	nb := buildizeLiteral(spec[0])
	nb.n.required = false
	nb.n.requiredSet = true
	return nb
}

// Optional (chained).
func (n *Node) Optional() *Node {
	n.n.required = false
	n.n.requiredSet = true
	return n
}

// Open allows additional properties on object schemas.
func Open(spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(map[string]any{})
	} else {
		nb = buildize(spec[0])
	}
	nb.n.open = true
	nb.n.openSet = true
	if nb.n.kind == KindObject && nb.n.objRest == nil {
		nb.n.objRest = &node{kind: KindAny}
	}
	return nb
}

// Open (chained).
func (n *Node) Open() *Node {
	n.n.open = true
	n.n.openSet = true
	if n.n.kind == KindObject && n.n.objRest == nil {
		n.n.objRest = &node{kind: KindAny}
	}
	return n
}

// Closed forbids additional properties on object schemas.
func Closed(spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.open = false
	nb.n.openSet = true
	nb.n.objRest = nil
	if nb.n.kind == KindArray && nb.n.arrChild != nil && len(nb.n.arrChildren) == 0 {
		// Make a single-shape array fixed (tuple of one) when explicitly closed.
		nb.n.arrChildren = []*node{nb.n.arrChild}
		nb.n.arrChild = nil
	}
	return nb
}

// Closed (chained).
func (n *Node) Closed() *Node {
	n.n.open = false
	n.n.openSet = true
	n.n.objRest = nil
	if n.n.kind == KindArray && n.n.arrChild != nil && len(n.n.arrChildren) == 0 {
		n.n.arrChildren = []*node{n.n.arrChild}
		n.n.arrChild = nil
	}
	return n
}

// Skip marks a value as skippable: optional, no default injection.
func Skip(spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.required = false
	nb.n.requiredSet = true
	nb.n.skippable = true
	return nb
}

// Skip (chained).
func (n *Node) Skip() *Node {
	n.n.required = false
	n.n.requiredSet = true
	n.n.skippable = true
	return n
}

// Ignore behaves like Skip but also suppresses errors raised on the value.
func Ignore(spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.required = false
	nb.n.requiredSet = true
	nb.n.skippable = true
	nb.n.silent = true
	return nb
}

// Ignore (chained).
func (n *Node) Ignore() *Node {
	n.n.required = false
	n.n.requiredSet = true
	n.n.skippable = true
	n.n.silent = true
	return n
}

// Empty allows the empty string for a String shape.
func Empty(spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		// Untyped, as in TS: Empty() allows the empty string without also
		// demanding that the value be a string.
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.empty = true
	return nb
}

// Empty (chained).
func (n *Node) Empty() *Node {
	n.n.empty = true
	return n
}

// Default sets an explicit default value, optionally narrowing the shape.
func Default(dval any, spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		// A nil here is the null default, so the shape is the null literal:
		// buildize(nil) would be no shape at all.
		if dval == nil {
			nb = newNodeWrap(&node{kind: KindNull})
		} else {
			nb = buildize(dval)
		}
	} else {
		nb = buildize(spec[0])
		// An untyped shape (Required(), Exact(1)) is built over the default
		// instead, and so takes the default's kind, as in TS; a null default
		// makes it the null kind.
		if nb.n.kind == KindAny {
			if base, err := normalize(dval); err == nil {
				base.befores = append(append([]validator{}, nb.n.befores...), base.befores...)
				bumpValidatorGen()
				base.afters = append(append([]validator{}, nb.n.afters...), base.afters...)
				bumpValidatorGen()
				base.hasExact, base.exactVals = nb.n.hasExact, nb.n.exactVals
				base.empty, base.nullable, base.silent = nb.n.empty, nb.n.nullable, nb.n.silent
				base.faultMsg = nb.n.faultMsg
				for k, v := range nb.n.meta {
					if base.meta == nil {
						base.meta = map[string]any{}
					}
					base.meta[k] = v
				}
				nb = newNodeWrap(base)
			}
		}
	}
	nb.n.required = false
	nb.n.requiredSet = true
	nb.n.skippable = false
	nb.n.hasDefault = true
	nb.n.defaultValue = dval
	nb.n.defaultNull = dval == nil
	return nb
}

// Default (chained).
func (n *Node) Default(dval any) *Node {
	n.n.required = false
	n.n.requiredSet = true
	n.n.skippable = false
	n.n.hasDefault = true
	n.n.defaultValue = dval
	n.n.defaultNull = dval == nil
	return n
}

// Fault sets a custom error message used when this node's validation fails.
func Fault(msg string, spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.faultMsg = msg
	return nb
}

// Fault (chained).
func (n *Node) Fault(msg string) *Node {
	n.n.faultMsg = msg
	return n
}

// Nullable accepts an explicit null as the value. Whether the value may be
// absent is still governed by Required/Optional.
func Nullable(spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.nullable = true
	return nb
}

// Nullable (chained).
func (n *Node) Nullable() *Node {
	n.n.nullable = true
	return n
}

// Never always fails to match. Absent is still governed by required or
// optional: Never alone requires a value, and so fails always; Optional or
// Skip around it means the value must be absent.
func Never(spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.kind = KindNever
	nb.n.required = true
	nb.n.requiredSet = true
	return nb
}

// Never (chained): the node keeps whether it requires a value.
func (n *Node) Never() *Node {
	n.n.kind = KindNever
	return n
}

// Type explicitly asserts a kind on the node.
func Type(kind any, spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	// Adopt the reference type's kind AND its required/skippable/default state,
	// mirroring TS Type(). Setting only the kind made Type() a silent no-op for
	// a *Node argument — which is exactly what the string DSL hands it, since a
	// bare type token there parses to Required(tok). Structural children are
	// deliberately not copied: TS leaves them behind too, so Type(Object) is a
	// closed object and Type(Array) accepts any elements.
	tn := typeRefNode(kind)
	if tn == nil || tn == nb.n {
		return nb
	}

	// Any keeps the value it is given as its default, as TS Any(0) does, a
	// null included (Any(null)); the other tokens bring their own.
	keep := tn.kind == KindAny && nb.n.hasDefault && (nb.n.defaultValue != nil || nb.n.kind == KindNull)
	nb.n.defaultNull = keep && nb.n.defaultValue == nil
	nb.n.kind = tn.kind
	nb.n.kindSet = true
	nb.n.required = tn.required
	nb.n.requiredSet = tn.requiredSet
	nb.n.skippable = tn.skippable
	if !keep {
		nb.n.hasDefault = tn.hasDefault
		nb.n.defaultValue = cloneAny(tn.defaultValue)
		nb.n.hasLiteral = tn.hasLiteral
		nb.n.literal = tn.literal
	}

	return nb
}

// typeRefNode resolves Type()'s first argument — a Kind, a TypeToken, a kind
// name, or an already-built node — to the node that type stands for.
func typeRefNode(kind any) *node {
	switch v := kind.(type) {
	case Kind:
		return typeTokenNode(v)
	case TypeToken:
		return typeTokenNode(v.kind)
	case string:
		return typeTokenNode(Kind(v))
	case *Node:
		return v.n
	case *node:
		return v
	}
	return nil
}

// Exact requires the value equal one of the provided literals. It asks for a
// value, as a type token does, so Optional or Skip around it lets the value
// be absent; chained, the node keeps whether it requires one.
func Exact(vals ...any) *Node {
	nb := buildize(nil)
	nb.n.kind = KindAny
	nb.n.required = true
	nb.n.requiredSet = true
	nb.n.hasExact = true
	nb.n.exactVals = append([]any{}, vals...)
	listText := formatList(vals)
	v := validator{
		name: "Exact",
		args: append([]any{}, vals...),
		fn: func(val any, update *Update, state *State) bool {
			// An absent value is no listed value, null included (TS: a value
			// undefined is === to none of them).
			if !state.absent {
				for _, want := range vals {
					if exactEqual(val, want) {
						return true
					}
				}
			}
			// The default stands in for an absent value only; a present null
			// is a value in its own right (TS: undefined === val).
			n := state.Node
			if state.absent && n.hasDefault {
				for _, want := range vals {
					if exactEqual(n.defaultValue, want) {
						return true
					}
				}
			}
			// Absent, where the node does not require a value and has no
			// default to put in its place.
			if state.absent && (n.skippable || (!n.required && !hasDefaultValue(n))) {
				return true
			}
			update.Why = WhyExact
			update.Mark = 4010
			update.Done = true
			if terseCall(state) {
				return false
			}
			update.Err = boundErr(state, WhyExact, 4010, " must be exactly one of: "+listText)
			return false
		},
		stringify: func() string {
			return "Exact(" + formatList(vals) + ")"
		},
	}
	nb.n.befores = append(nb.n.befores, v)
	bumpValidatorGen()
	return nb
}

// Exact (chained).
func (n *Node) Exact(vals ...any) *Node {
	other := Exact(vals...)
	n.n.hasExact = true
	n.n.exactVals = append([]any{}, vals...)
	n.n.befores = append(n.n.befores, other.n.befores...)
	bumpValidatorGen()
	return n
}

// Min specifies a minimum value or length.
// fault is what a builder returns when called wrongly: a node that
// accepts nothing and says why at validation, since a Go builder cannot
// throw as the TypeScript one does (see the parity page).
// terseCall reports whether the call wants a verdict only: a validator that
// fails then records nothing but the failure, and builds no message.
func terseCall(state *State) bool {
	return state.Ctx != nil && state.Ctx.terse
}

// boundErr is the error of a failed bound or Exact: the value and the path,
// then the clause given, assembled directly. A path holding "$VALUE" (a key
// named so) or a clause holding a "$" takes the template's replacements
// instead, whose order (the path first) can put the value into either.
func boundErr(state *State, why string, mark int, clause string) FieldError {
	err := newErr(state, why, mark)
	if strings.Contains(err.Path, "$VALUE") || strings.Contains(clause, "$") {
		err.Text = expandErrTextFor("Value \"$VALUE\" for property \"$PATH\""+clause, err.Path, state.Value, err.absent)
		return err
	}
	valstr := "undefined"
	if !err.absent {
		valstr = valueToString(state.Value)
	}
	err.Text = "Value \"" + valstr + "\" for property \"" + err.Path + "\"" + clause
	return err
}

// exactEqual is Exact's comparison: numbers by value whatever their kind, so
// an int literal in the spec matches the float64 a JSON decoder produces, as
// one JavaScript number type would; anything else structurally. Numbers are
// compared as exact rationals, so large integers keep their precision.
func exactEqual(val, want any) bool {
	// The common kinds are compared directly; the rest as below.
	switch x := val.(type) {
	case string:
		y, ok := want.(string)
		return ok && x == y
	case bool:
		y, ok := want.(bool)
		return ok && x == y
	case float64:
		if y, ok := want.(float64); ok {
			return x == y
		}
	}
	if reflect.DeepEqual(val, want) {
		return true
	}
	if !isNumber(val) || !isNumber(want) {
		return false
	}
	a, b := exactRat(val), exactRat(want)
	return a != nil && b != nil && a.Cmp(b) == 0
}

// exactRat is a number as an exact rational; NaN and the infinities, which
// equal nothing, are nil.
func exactRat(v any) *big.Rat {
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return new(big.Rat).SetInt64(rv.Int())
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr:
		return new(big.Rat).SetUint64(rv.Uint())
	case reflect.Float32, reflect.Float64:
		return new(big.Rat).SetFloat64(rv.Float())
	}
	return nil
}

func fault(msg string) *Node {
	n := faultNode(msg)
	n.argFault = true
	return newNodeWrap(n)
}

// becomeFault makes a chained builder's node the fault of a wrong argument:
// it accepts nothing, an absent value included, and says why.
func (n *Node) becomeFault(f *Node) *Node {
	n.n.kind, n.n.faultMsg, n.n.argFault = KindNever, f.n.faultMsg, f.n.argFault
	n.n.required, n.n.requiredSet = true, true
	return n
}

// boundArg reports whether a bound is a finite number: a numeric value, a
// time (for a Date), or a string that reads as a number, as TypeScript
// reads it with +size and Number.isFinite.
func boundArg(v any) bool {
	var f float64
	switch x := v.(type) {
	case time.Time:
		return true
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		if err != nil {
			return false
		}
		f = parsed
	default:
		if !isNumeric(v) {
			return false
		}
		f = toFloat(v)
	}
	return !math.IsNaN(f) && !math.IsInf(f, 0)
}

func Min(min any, spec ...any) *Node {
	if !boundArg(min) {
		return fault("Shape: Min needs a number")
	}
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	limit := toFloat(min)
	minText := numText(min)
	v := validator{
		name: "Min",
		args: []any{min},
		fn: func(val any, update *Update, state *State) bool {
			if boundDefers(state) {
				return true
			}
			vsize, ok := valueLen(val)
			if ok && limit <= vsize {
				return true
			}
			update.Why = WhyMin
			update.Done = true
			update.Mark = 4011
			if terseCall(state) {
				return false
			}
			lenpart := ""
			if !isNumeric(val) {
				lenpart = "length "
			}
			update.Err = boundErr(state, WhyMin, 4011,
				" must be a minimum "+lenpart+"of "+minText+" (was "+sizeText(vsize, ok)+").")
			return false
		},
		stringify: func() string { return "Min(" + numText(min) + ")" },
	}
	nb.n.befores = append(nb.n.befores, v)
	bumpValidatorGen()
	return nb
}

// Min (chained).
func (n *Node) Min(min any) *Node {
	other := Min(min)
	if other.n.kind == KindNever && other.n.faultMsg != "" {
		// The argument was wrong: this node becomes the fault.
		return n.becomeFault(other)
	}
	n.n.befores = append(n.n.befores, other.n.befores...)
	bumpValidatorGen()
	return n
}

// Max specifies a maximum value or length.
func Max(max any, spec ...any) *Node {
	if !boundArg(max) {
		return fault("Shape: Max needs a number")
	}
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	limit := toFloat(max)
	maxText := numText(max)
	v := validator{
		name: "Max",
		args: []any{max},
		fn: func(val any, update *Update, state *State) bool {
			if boundDefers(state) {
				return true
			}
			vsize, ok := valueLen(val)
			if ok && vsize <= limit {
				return true
			}
			update.Why = WhyMax
			update.Done = true
			update.Mark = 4012
			if terseCall(state) {
				return false
			}
			lenpart := ""
			if !isNumeric(val) {
				lenpart = "length "
			}
			update.Err = boundErr(state, WhyMax, 4012,
				" must be a maximum "+lenpart+"of "+maxText+" (was "+sizeText(vsize, ok)+").")
			return false
		},
		stringify: func() string { return "Max(" + numText(max) + ")" },
	}
	nb.n.befores = append(nb.n.befores, v)
	bumpValidatorGen()
	return nb
}

// Max (chained).
func (n *Node) Max(max any) *Node {
	other := Max(max)
	if other.n.kind == KindNever && other.n.faultMsg != "" {
		// The argument was wrong: this node becomes the fault.
		return n.becomeFault(other)
	}
	n.n.befores = append(n.n.befores, other.n.befores...)
	bumpValidatorGen()
	return n
}

// Above specifies a strict lower bound on value or length.
func Above(above any, spec ...any) *Node {
	if !boundArg(above) {
		return fault("Shape: Above needs a number")
	}
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	limit := toFloat(above)
	aboveText := numText(above)
	v := validator{
		name: "Above",
		args: []any{above},
		fn: func(val any, update *Update, state *State) bool {
			if boundDefers(state) {
				return true
			}
			vsize, ok := valueLen(val)
			if ok && limit < vsize {
				return true
			}
			update.Why = WhyAbove
			update.Done = true
			update.Mark = 4013
			if terseCall(state) {
				return false
			}
			verb := "be"
			if !isNumeric(val) {
				verb = "have length"
			}
			update.Err = boundErr(state, WhyAbove, 4013,
				" must "+verb+" above "+aboveText+" (was "+sizeText(vsize, ok)+").")
			return false
		},
		stringify: func() string { return "Above(" + numText(above) + ")" },
	}
	nb.n.befores = append(nb.n.befores, v)
	bumpValidatorGen()
	return nb
}

// Above (chained).
func (n *Node) Above(above any) *Node {
	other := Above(above)
	if other.n.kind == KindNever && other.n.faultMsg != "" {
		// The argument was wrong: this node becomes the fault.
		return n.becomeFault(other)
	}
	n.n.befores = append(n.n.befores, other.n.befores...)
	bumpValidatorGen()
	return n
}

// Below specifies a strict upper bound on value or length.
func Below(below any, spec ...any) *Node {
	if !boundArg(below) {
		return fault("Shape: Below needs a number")
	}
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	limit := toFloat(below)
	belowText := numText(below)
	v := validator{
		name: "Below",
		args: []any{below},
		fn: func(val any, update *Update, state *State) bool {
			if boundDefers(state) {
				return true
			}
			vsize, ok := valueLen(val)
			if ok && vsize < limit {
				return true
			}
			update.Why = WhyBelow
			update.Done = true
			update.Mark = 4014
			if terseCall(state) {
				return false
			}
			verb := "be"
			if !isNumeric(val) {
				verb = "have length"
			}
			update.Err = boundErr(state, WhyBelow, 4014,
				" must "+verb+" below "+belowText+" (was "+sizeText(vsize, ok)+").")
			return false
		},
		stringify: func() string { return "Below(" + numText(below) + ")" },
	}
	nb.n.befores = append(nb.n.befores, v)
	bumpValidatorGen()
	return nb
}

// Below (chained).
func (n *Node) Below(below any) *Node {
	other := Below(below)
	if other.n.kind == KindNever && other.n.faultMsg != "" {
		// The argument was wrong: this node becomes the fault.
		return n.becomeFault(other)
	}
	n.n.befores = append(n.n.befores, other.n.befores...)
	bumpValidatorGen()
	return n
}

// Len requires an exact value or collection length.
func Len(length int, spec ...any) *Node {
	if length < 0 {
		return fault("Shape: Len needs a whole number of zero or more")
	}
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	limit := float64(length)
	lengthText := strconv.Itoa(length)
	v := validator{
		name: "Len",
		args: []any{length},
		fn: func(val any, update *Update, state *State) bool {
			if boundDefers(state) {
				return true
			}
			vsize, ok := valueLen(val)
			if ok && vsize == limit {
				return true
			}
			update.Why = WhyLen
			update.Done = true
			update.Mark = 4015
			if terseCall(state) {
				return false
			}
			suffix := ""
			if !isNumeric(val) {
				suffix = " in length"
			}
			update.Err = boundErr(state, WhyLen, 4015,
				" must be exactly "+lengthText+suffix+" (was "+sizeText(vsize, ok)+").")
			return false
		},
		stringify: func() string { return fmt.Sprintf("Len(%d)", length) },
	}
	nb.n.befores = append(nb.n.befores, v)
	bumpValidatorGen()
	return nb
}

// Len (chained).
func (n *Node) Len(length int) *Node {
	other := Len(length)
	if other.n.kind == KindNever && other.n.faultMsg != "" {
		// The argument was wrong: this node becomes the fault.
		return n.becomeFault(other)
	}
	n.n.befores = append(n.n.befores, other.n.befores...)
	bumpValidatorGen()
	return n
}

// Check installs a custom validation. Accepts a function of (val, update, state)
// or a *regexp.Regexp.
func Check(check any, spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	switch c := check.(type) {
	case func(val any, update *Update, state *State) bool:
		nb.n.kind = KindCheck
		nb.n.required = true
		nb.n.requiredSet = true
		// An absent value is left to the required check, as in TypeScript.
		fn := func(val any, update *Update, state *State) bool {
			return state.absent || c(val, update, state)
		}
		v := validator{name: "Check", fn: fn, user: true, stringify: func() string { return "Check()" }}
		nb.n.befores = append(nb.n.befores, v)
		bumpValidatorGen()
	case *regexp.Regexp:
		src := c.String()
		re, err := compileRegexp(src)
		if err != nil {
			return fault(err.Error())
		}
		nb.n.kind = KindCheck
		nb.n.required = true
		nb.n.requiredSet = true
		// The check name is the /pattern/ form so failures read
		// `check "/re/" failed`, mirroring TS Check(RegExp).
		reName := "/" + src + "/"
		v := validator{
			name: reName,
			fn: func(val any, update *Update, state *State) bool {
				if state.absent {
					return true
				}
				if s, ok := val.(string); ok && re.MatchString(s) {
					return true
				}
				// No custom text: fall through to the default "check ... failed"
				// message with the /pattern/ name.
				update.Why = WhyCheck
				update.Mark = markCheckType
				return false
			},
			stringify: func() string { return fmt.Sprintf("Check(/%s/)", src) },
		}
		nb.n.befores = append(nb.n.befores, v)
		bumpValidatorGen()
	}
	if len(spec) > 0 {
		// Narrow kind to the carrier shape kind.
		sn, err := normalize(spec[0])
		if err == nil {
			nb.n.kind = sn.kind
		}
	}
	return nb
}

// Check (chained).
func (n *Node) Check(check any) *Node {
	other := Check(check)
	n.n.befores = append(n.n.befores, other.n.befores...)
	bumpValidatorGen()
	return n
}

// Before runs a custom validator before structural type checks.
func Before(fn func(val any, update *Update, state *State) bool, spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.befores = append(nb.n.befores,
		validator{name: "Before", fn: fn, user: true, stringify: func() string { return "Before()" }})
	bumpValidatorGen()
	return nb
}

// Before (chained).
func (n *Node) Before(fn func(val any, update *Update, state *State) bool) *Node {
	n.n.befores = append(n.n.befores,
		validator{name: "Before", fn: fn, user: true, stringify: func() string { return "Before()" }})
	bumpValidatorGen()
	return n
}

// After runs a custom validator after structural type checks.
func After(fn func(val any, update *Update, state *State) bool, spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.afters = append(nb.n.afters,
		validator{name: "After", fn: fn, user: true, stringify: func() string { return "After()" }})
	bumpValidatorGen()
	return nb
}

// After (chained).
func (n *Node) After(fn func(val any, update *Update, state *State) bool) *Node {
	n.n.afters = append(n.n.afters,
		validator{name: "After", fn: fn, user: true, stringify: func() string { return "After()" }})
	bumpValidatorGen()
	return n
}

// All requires the value to satisfy every shape.
func All(shapes ...any) *Node {
	return makeListBuilder(listAll, shapes)
}

// nofFault is the message of a Nof whose count is neither a whole number of
// zero or more nor a shape.
const nofFault = "Shape: Nof needs a whole number of zero or more, or a shape for the count"

// Nof requires the number of shapes the value satisfies to be one the count
// admits. The count is a whole number, for exactly that many, or a shape the
// number must satisfy: Nof(1, ...) is exactly one, Nof(Min(1), ...) at least
// one, Nof(0, s) not s. A shape is tried only while the shapes left untried
// could still change the verdict. A count of exactly one produces: the one
// shape the value satisfies makes the result. Any other count only checks,
// and the value is left as it was given. An absent value is not tried, so
// whether it may be absent is the node's required or optional.
func Nof(count any, shapes ...any) *Node {
	exact, isNumber := toFloat64(count)
	var counter *Schema
	if isNumber {
		if exact != math.Trunc(exact) || exact < 0 || math.IsInf(exact, 1) {
			return fault(nofFault)
		}
	} else {
		// A count that is itself a builder's fault is the fault: it is never
		// validated, so its message would otherwise be lost.
		if cn, ok := count.(*Node); ok && cn.n.argFault {
			return cn
		}
		var err error
		if counter, err = Shape(count); err != nil {
			return fault(err.Error())
		}
	}
	nb := makeListBuilder(listNof, shapes)
	nb.n.nofExact = exact
	nb.n.nofOne = len(shapes) > 0
	for c := 0; c <= len(shapes); c++ {
		ok := (counter == nil && float64(c) == exact) || (counter != nil && counter.Match(float64(c)))
		nb.n.nofOK = append(nb.n.nofOK, ok)
		nb.n.nofOne = nb.n.nofOne && ok == (c == 1)
	}
	if counter != nil {
		nb.n.nofCount = counter.root
	}
	return nb
}

// whenFault is the message of a When with no condition.
const whenFault = "Shape: When needs a shape for its condition"

// When validates the value with the shape its condition picks: the first
// of shapes where the value satisfies cond, and the second otherwise. The
// condition is tried on the value and only checks (see trial); the shape
// it picks validates the value and makes the result, and its errors are
// the errors. A shape not given is Any, and shapes past the second are
// ignored. An absent value is not tried, so whether it may be absent is
// the node's required or optional.
func When(cond any, shapes ...any) *Node {
	if cond == nil {
		return fault(whenFault)
	}
	// A condition that is itself a builder's fault is the fault: it is only
	// tried, so its message would otherwise be lost.
	if cn, ok := cond.(*Node); ok && cn.n.argFault {
		return cn
	}
	arms := []any{cond, Any, Any}
	copy(arms[1:], shapes)
	return makeListBuilder(listWhen, arms)
}

// The messages of a Contains given a wrong count, or no shape for its items.
const (
	containsFault      = "Shape: Contains needs a whole number of zero or more, or a shape for the count"
	containsShapeFault = "Shape: Contains needs a shape for the items it counts"
)

// Contains requires the number of an array's items that satisfy the shape
// to be one the count admits. The count is a whole number, for exactly
// that many, or a shape the number must satisfy: Contains(Min(1), s) is at
// least one, Contains(0, s) none. Each item is tried on its own (see
// trial), and only while the items left untried could still change the
// verdict; the array is left as it was given. A value that is not an array
// is not counted, so whether it is one is the node's type check. Without a
// spec of its own the node is an array of anything.
func Contains(count any, shape any, spec ...any) *Node {
	v, f := containsCheck(count, shape)
	if f != nil {
		return f
	}
	nb := buildize(arraySpec(spec))
	nb.n.befores = append(nb.n.befores, v)
	bumpValidatorGen()
	return nb
}

// Contains (chained): the node keeps its kind.
func (n *Node) Contains(count any, shape any) *Node {
	v, f := containsCheck(count, shape)
	if f != nil {
		return n.becomeFault(f)
	}
	n.n.befores = append(n.n.befores, v)
	bumpValidatorGen()
	return n
}

// arraySpec is the spec a check of an array's items applies to: the one
// given, or an array of anything.
func arraySpec(spec []any) any {
	if len(spec) == 0 {
		return []any{}
	}
	return spec[0]
}

// containsCheck is the check of a Contains, or the fault of a wrong
// argument. The count is held as the whole number or the count shape's
// node, then the bounds of the counts it admits; the shape of the items is
// walked with the tree.
func containsCheck(count any, shape any) (validator, *Node) {
	exact, isNumber := toFloat64(count)
	var counter *Schema
	switch {
	case count == nil:
		return validator{}, fault(containsFault)
	case isNumber:
		if exact != math.Trunc(exact) || exact < 0 || math.IsInf(exact, 1) {
			return validator{}, fault(containsFault)
		}
	default:
		// A count or shape that is itself a builder's fault is the fault:
		// neither is reported, so its message would otherwise be lost.
		if cn, ok := count.(*Node); ok && cn.n.argFault {
			return validator{}, cn
		}
		var err error
		if counter, err = Shape(count); err != nil {
			return validator{}, fault(err.Error())
		}
	}
	if shape == nil {
		return validator{}, fault(containsShapeFault)
	}
	if sn, ok := shape.(*Node); ok && sn.n.argFault {
		return validator{}, sn
	}
	item, err := normalize(shape)
	if err != nil {
		return validator{}, fault(err.Error())
	}

	var held any = exact
	countText := func() string { return fmtFloat(exact) }
	lo, hi, interval := exact, exact, true
	if counter != nil {
		held = counter.root
		countText = func() string { return stringifyNode(counter.root, true) }
		lo, hi, interval = countBounds(counter.root)
	}
	verdicts := &countVerdicts{}
	return validator{
		name:  "Contains",
		args:  []any{held, lo, hi},
		nodes: []*node{item},
		fn: func(val any, update *Update, state *State) bool {
			items, ok := toAnySlice(val)
			if !ok {
				return true
			}
			// The counts from k to k + open are all, some or none admitted:
			// at once for a count that is an interval, and otherwise off the
			// running total of admitted counts.
			n := len(items)
			var yes []int
			if !interval {
				admitted := verdicts.upTo(counter, n)
				yes = make([]int, n+2)
				for c := 0; c <= n; c++ {
					yes[c+1] = yes[c]
					if admitted[c] {
						yes[c+1]++
					}
				}
			}
			k, tried := 0, 0
			for countSpan(lo, hi, yes, k, n-tried) == nofSome {
				key, boxed := indexOf(tried)
				if ok, _, _ := trial(item, items[tried], append(state.Path, key), append(state.PathArr, boxed), key, state); ok {
					k++
				}
				tried++
			}
			if countSpan(lo, hi, yes, k, n-tried) == nofAll {
				return true
			}
			if terseCall(state) {
				return false
			}
			has := strconv.Itoa(k)
			if tried < n {
				has += " to " + strconv.Itoa(k+n-tried)
			}
			update.Err = makeErr(state, WhyCheck, 0, "Value \"$VALUE\" for property \"$PATH\" has "+has+
				" of its items satisfying "+stringifyNode(item, true)+"; the count must be "+countText()+".")
			return false
		},
		stringify: func() string { return "Contains(" + countText() + "," + stringifyNode(item, true) + ")" },
	}, nil
}

// countSpan reports whether the counts from k to k+open are all admitted,
// some or none: by the bounds of a count that is the whole numbers lo to
// hi, or else from yes, the running totals of the admitted counts. A count
// no number satisfies (lo above hi) admits none at once.
func countSpan(lo, hi float64, yes []int, k, open int) int {
	if yes == nil {
		switch {
		case math.Min(hi, float64(k+open)) < math.Max(lo, float64(k)):
			return nofNone
		case lo <= float64(k) && float64(k+open) <= hi:
			return nofAll
		}
		return nofSome
	}
	switch yes[k+open+1] - yes[k] {
	case 0:
		return nofNone
	case open + 1:
		return nofAll
	}
	return nofSome
}

// countBounds is the counts a count shape admits by its Min, Max, Above,
// Below and Len, as the whole numbers lo to hi; an interval where the shape
// has nothing else to say of a whole number. Ignore and Rename are checks
// of their own in TS, and so say more.
func countBounds(n *node) (lo, hi float64, interval bool) {
	lo, hi = 0, math.Inf(1)
	interval = (n.kind == KindAny || n.kind == KindNumber || n.kind == KindInteger) &&
		len(n.afters) == 0 && !n.silent && n.renameTo == ""
	for _, cv := range n.befores {
		switch cv.name {
		case "Min":
			lo = math.Max(lo, math.Ceil(toFloat(cv.args[0])))
		case "Max":
			hi = math.Min(hi, math.Floor(toFloat(cv.args[0])))
		case "Above":
			lo = math.Max(lo, math.Floor(toFloat(cv.args[0]))+1)
		case "Below":
			hi = math.Min(hi, math.Ceil(toFloat(cv.args[0]))-1)
		case "Len":
			b := toFloat(cv.args[0])
			lo, hi = math.Max(lo, b), math.Min(hi, b)
		default:
			interval = false
		}
	}
	return lo, hi, interval
}

// countVerdicts is whether a count shape admits each count from none up,
// kept for the next array to ask, as each is the same verdict every time.
type countVerdicts struct {
	mu sync.Mutex
	ok []bool
}

// upTo is the verdicts on the counts from none to n.
func (cv *countVerdicts) upTo(counter *Schema, n int) []bool {
	cv.mu.Lock()
	defer cv.mu.Unlock()
	for c := len(cv.ok); c <= n; c++ {
		cv.ok = append(cv.ok, counter.Match(float64(c)))
	}
	return cv.ok[:n+1]
}

// Unique requires that no two of an array's items be equal as JSON values:
// a number by its value, an array by its items in order, an object by its
// keys and their values, in any order. The error names the first item
// equal to one before it, and the first of those. A value that is not an
// array is not checked. Without a spec of its own the node is an array of
// anything.
func Unique(spec ...any) *Node {
	nb := buildize(arraySpec(spec))
	nb.n.befores = append(nb.n.befores, uniqueCheck())
	bumpValidatorGen()
	return nb
}

// Unique (chained): the node keeps its kind.
func (n *Node) Unique() *Node {
	n.n.befores = append(n.n.befores, uniqueCheck())
	bumpValidatorGen()
	return n
}

func uniqueCheck() validator {
	return validator{
		name: "Unique",
		fn: func(val any, update *Update, state *State) bool {
			items, ok := toAnySlice(val)
			if !ok {
				return true
			}
			i, j := repeated(items)
			if j < 0 {
				return true
			}
			if terseCall(state) {
				return false
			}
			update.Err = makeErr(state, WhyCheck, 0, "Value \"$VALUE\" for property \"$PATH\" must have unique items (items "+
				strconv.Itoa(i)+" and "+strconv.Itoa(j)+" are equal).")
			return false
		},
		stringify: func() string { return "Unique()" },
	}
}

// repeated is the first item equal to an item before it, and the first of
// those; -1 for both where no two are equal. A scalar is looked up by its
// value, and an array or object compared with the containers before it.
func repeated(items []any) (int, int) {
	seen := map[any]int{}
	var containers []int
	for j, v := range items {
		if kind, _, _ := itemKind(v); kind != itemScalar {
			for _, i := range containers {
				if sameJSON(items[i], v) {
					return i, j
				}
			}
			containers = append(containers, j)
			continue
		}
		k, ok := scalarKey(v)
		if !ok {
			continue
		}
		if i, has := seen[k]; has {
			return i, j
		}
		seen[k] = j
	}
	return -1, -1
}

// The kinds of item Unique compares.
const (
	itemScalar = iota
	itemArray
	itemObject
)

// itemKind reads an item as the walk does: an array, an object (a struct
// or another map, see objectValue), or neither.
func itemKind(v any) (int, []any, map[string]any) {
	switch v.(type) {
	case nil, nullT, string, bool, float64, int:
		return itemScalar, nil, nil
	}
	if arr, ok := toAnySlice(v); ok {
		return itemArray, arr, nil
	}
	if obj, ok := objectValue(v); ok {
		return itemObject, nil, obj
	}
	return itemScalar, nil, nil
}

// nanKey stands for NaN among the scalars Unique looks up: NaN is not
// equal to itself, but two are the same value, as JSON would have them.
type nanKey struct{}

// scalarKey is a scalar as Unique looks it up: a number by its value
// whatever its type, Null as the nil it means, anything else as itself. A
// value that cannot be a key is equal to nothing, and has none.
func scalarKey(v any) (any, bool) {
	if f, ok := toFloat64(v); ok {
		if math.IsNaN(f) {
			return nanKey{}, true
		}
		return f, true
	}
	if v == nil || isNull(v) {
		return nil, true
	}
	if !reflect.TypeOf(v).Comparable() {
		return nil, false
	}
	return v, true
}

// sameJSON reports whether two values are equal as JSON values (see
// Unique); a value that is neither a container nor a JSON scalar is equal
// to itself alone.
func sameJSON(x, y any) bool {
	xk, xa, xo := itemKind(x)
	yk, ya, yo := itemKind(y)
	if xk != yk {
		return false
	}
	switch xk {
	case itemArray:
		if len(xa) != len(ya) {
			return false
		}
		for i := range xa {
			if !sameJSON(xa[i], ya[i]) {
				return false
			}
		}
		return true
	case itemObject:
		if len(xo) != len(yo) {
			return false
		}
		for k, v := range xo {
			if w, has := yo[k]; !has || !sameJSON(v, w) {
				return false
			}
		}
		return true
	}
	kx, okx := scalarKey(x)
	ky, oky := scalarKey(y)
	return okx && oky && kx == ky
}

// The kind of JSON value a node's type takes: number covers integer, and
// string a regexp.
var kindOfType = map[Kind]string{
	KindNull: "null", KindBoolean: "boolean", KindNumber: "number", KindInteger: "number",
	KindString: "string", KindRegexp: "string", KindObject: "object", KindArray: "array",
}

// The checks that leave a shape's kind as it was: a shape with no others
// takes a value of its own kind only. A function Check is the caller's and
// may take anything; a Check of a regexp is named by its pattern.
var kindKeeping = map[string]bool{
	"Above": true, "Below": true, "Contains": true, "DateTime": true, "Define": true, "Email": true,
	"Exact": true, "Ip": true, "Ipv4": true, "Ipv6": true, "Len": true, "Max": true, "Min": true,
	"Unique": true, "Url": true, "Uuid": true,
}

// nofKinds is the kinds of the shapes, where each is of a different kind and
// takes values of that kind only; nil otherwise. A nullable shape takes a
// null too, and a renamed or ignored one does more than check (in TS they
// carry validators that keep no kind).
func nofKinds(list []*node) []string {
	kinds := make([]string, len(list))
	for i, sn := range list {
		k := kindOfType[sn.kind]
		if k == "" || sn.nullable || sn.silent || sn.renameTo != "" || contains(kinds[:i], k) ||
			!keepsKind(sn.befores) || !keepsKind(sn.afters) {
			return nil
		}
		kinds[i] = k
	}
	return kinds
}

// keepsKind reports whether every check leaves a shape's kind as it was.
func keepsKind(vs []validator) bool {
	for _, v := range vs {
		if !kindKeeping[v.name] && !strings.HasPrefix(v.name, "/") {
			return false
		}
	}
	return true
}

// nofKindsNow is the kinds of a Nof's branches as they stand (see
// nofKinds), where its count admits exactly one: a retained *Node may have
// been re-chained to another kind since the Nof was built, as in TS.
func nofKindsNow(n *node) []string {
	if !n.nofOne {
		return nil
	}
	return nofKinds(n.list)
}

// kindOf is the kind of a JSON value, as nofKinds names a shape's: "" for a
// value of none (a function), which no shape is of.
func kindOf(v any) string {
	switch v.(type) {
	case nil:
		return "null"
	case bool:
		return "boolean"
	case string:
		return "string"
	case time.Time:
		// typeof a Date is "object" in JS.
		return "object"
	}
	switch {
	case isNumber(v):
		return "number"
	case isAnyArray(v):
		return "array"
	}
	if _, ok := objectValue(v); ok {
		return "object"
	}
	return ""
}

func makeListBuilder(mode listMode, shapes []any) *Node {
	nb := buildize(nil)
	nb.n.kind = KindList
	nb.n.required = true
	nb.n.requiredSet = true
	nb.n.listMode = mode
	for _, s := range shapes {
		sn, err := normalize(s)
		if err != nil {
			sn = faultNode(err.Error())
		}
		nb.n.list = append(nb.n.list, sn)
	}
	return nb
}

// Child sets a default child shape for an object (Open object child) or array.
func Child(child any, spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		// Given no shape, Child is an object with the empty default TS gives
		// it (f = {}), which its JSON Schema carries.
		nb = buildize(map[string]any{})
		nb.n.hasDefault = true
	} else {
		nb = buildize(spec[0])
	}
	cn, err := normalize(child)
	if err != nil {
		cn = faultNode(err.Error())
	}
	switch nb.n.kind {
	case KindObject:
		nb.n.objRest = cn
		nb.n.open = true
		nb.n.openSet = true
	case KindArray:
		nb.n.arrChild = cn
	default:
		nb.n.kind = KindObject
		nb.n.objRest = cn
		nb.n.open = true
		nb.n.openSet = true
		if nb.n.objChildren == nil {
			nb.n.objChildren = map[string]*node{}
		}
	}
	return nb
}

// Child (chained).
func (n *Node) Child(child any) *Node {
	cn, err := normalize(child)
	if err != nil {
		cn = faultNode(err.Error())
	}
	switch n.n.kind {
	case KindObject:
		n.n.objRest = cn
		n.n.open = true
		n.n.openSet = true
	case KindArray:
		n.n.arrChild = cn
	}
	return n
}

// Rest declares a tail-shape for arrays past the tuple positions.
func Rest(child any, spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize([]any{})
	} else {
		nb = buildize(spec[0])
	}
	cn, err := normalize(child)
	if err != nil {
		cn = faultNode(err.Error())
	}
	if nb.n.kind != KindArray {
		nb.n.kind = KindArray
	}
	// The rest replaces a plain element shape, as it does in TS, where Rest
	// sets the one child an array has: Rest(Number, [String]) is an array of
	// numbers. Fixed positions are a tuple, and are kept.
	nb.n.arrChild = nil
	nb.n.arrRest = cn
	return nb
}

// Any (chained): the value may be anything.
func (n *Node) Any() *Node {
	n.n.kind = KindAny
	return n
}

// Type (chained): assert a kind, given a Kind, TypeToken, kind name or node.
func (n *Node) Type(kind any) *Node {
	return Type(kind, n)
}

// Define (chained): name this node so a later Refer can clone it.
func (n *Node) Define(name string) *Node {
	return Define(name, n)
}

// Refer (chained): substitute the named node at validation time.
func (n *Node) Refer(name string) *Node {
	return Refer(name, n)
}

// Rename (chained): rename this property after validation.
func (n *Node) Rename(name string) *Node {
	return Rename(name, n)
}

// Type-token shortcuts, mirroring the TS chain (.Number(), .Boolean(), ...).
// There is deliberately no String() shortcut: a method of that name on an
// exported type reads as fmt.Stringer and go vet rejects the signature. Use
// Type(String) for a string, which is what these shortcuts call anyway.

// Number (chained).
func (n *Node) Number() *Node { return Type(Number, n) }

// Boolean (chained).
func (n *Node) Boolean() *Node { return Type(Boolean, n) }

// Object (chained).
func (n *Node) Object() *Node { return Type(Object, n) }

// Array (chained).
func (n *Node) Array() *Node { return Type(Array, n) }

// Function (chained).
func (n *Node) Function() *Node { return Type(Function, n) }

// Integer (chained).
func (n *Node) Integer() *Node { return Type(Integer, n) }

// Date (chained).
func (n *Node) Date() *Node { return Type(Date, n) }

// Rest (chained).
func (n *Node) Rest(child any) *Node {
	cn, err := normalize(child)
	if err != nil {
		cn = faultNode(err.Error())
	}
	if n.n.kind != KindArray {
		n.n.kind = KindArray
	}
	n.n.arrChild = nil
	n.n.arrRest = cn
	return n
}

// Define names the current node so a later Refer with the same name can clone it.
func Define(name string, spec ...any) *Node {
	if name == "" {
		return fault("Shape: Define needs a name")
	}
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.defineName = name
	captured := nb.n
	v := validator{
		name: "Define",
		args: []any{name},
		fn: func(val any, update *Update, state *State) bool {
			if state.Ctx == nil {
				state.Ctx = newContext(nil)
			}
			if state.Ctx.Refs == nil {
				state.Ctx.Refs = map[string]*node{}
			}
			state.Ctx.Refs[name] = captured
			return true
		},
		stringify: func() string { return fmt.Sprintf("Define(%q)", name) },
	}
	nb.n.befores = append(nb.n.befores, v)
	bumpValidatorGen()
	return nb
}

// ReferOptions controls Refer behaviour. Fill substitutes the referenced node
// even when the input value is missing/nil, allowing recursive structure.
type ReferOptions struct {
	// Fill substitutes even when the value is absent (not for self-recursion).
	Fill bool
	// Strict makes a name with no Define an error, rather than a Refer that
	// does nothing.
	Strict bool
}

// Refer substitutes the named node at validation time.
func Refer(name string, spec ...any) *Node {
	return ReferWith(name, ReferOptions{}, spec...)
}

// ReferWith is Refer with explicit options.
func ReferWith(name string, opts ReferOptions, spec ...any) *Node {
	if name == "" {
		return fault("Shape: Refer needs a name")
	}
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.referName = name
	nb.n.referFill = opts.Fill
	nb.n.referStrict = opts.Strict
	v := validator{
		name: "Refer",
		args: []any{name},
		fn: func(val any, update *Update, state *State) bool {
			if state.Ctx == nil {
				return true
			}
			// An absent value is left alone unless Fill asks; a present null
			// is a value, as in TS.
			if state.absent && !opts.Fill {
				return true
			}
			// A Define met on this call first, then the schema's own; both
			// maps read fine when nil.
			if rn, ok := state.Ctx.Refs[name]; ok {
				update.Node = rn
			} else if rn, ok := state.Ctx.defs[name]; ok {
				update.Node = rn
			} else if opts.Strict {
				update.Err = "Value \"$VALUE\" for property \"$PATH\" refers to \"" + name + "\", which is not defined."
				return false
			}
			return true
		},
		stringify: func() string { return fmt.Sprintf("Refer(%q)", name) },
	}
	nb.n.befores = append(nb.n.befores, v)
	bumpValidatorGen()
	return nb
}

// RenameOptions controls Rename behaviour.
//
//   - Keep: retain the original key in addition to writing under the new name.
//   - Claim: list of alternative source keys to read from when the renamed key is
//     missing on the input. Useful for migrating legacy property names.
type RenameOptions struct {
	Keep  bool
	Claim []string
}

// Rename renames a property after validation. Use only inside object child shapes.
func Rename(name string, spec ...any) *Node {
	return RenameWith(name, RenameOptions{}, spec...)
}

// RenameWith is Rename with explicit options (Keep, Claim).
func RenameWith(name string, opts RenameOptions, spec ...any) *Node {
	if name == "" {
		return fault("Shape: Rename needs a name")
	}
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.renameTo = name
	nb.n.renameKeep = opts.Keep
	if len(opts.Claim) > 0 {
		nb.n.renameClaim = append([]string{}, opts.Claim...)
	}
	return nb
}

// Func declares a function-typed value (best-effort: any reflect.Func value).
// It is a builder, not a type token, so it does not require a value of
// itself: TS Func() leaves the node optional, and { n: Func() } accepts an
// object without n. The Function token is the required form.
func Func(spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.kind = KindFunction
	return nb
}

// Func (chained): the receiver's required state is kept.
func (n *Node) Func() *Node {
	n.n.kind = KindFunction
	return n
}

// Key replaces the value with the validation key (or path slice).
//
//   - Key()        → uses the immediate parent key as the value.
//   - Key(depth)   → reads `depth` levels up the path.
//   - Key(depth, sep) → joins the path slice with sep into a string.
func Key(args ...any) *Node {
	nb := buildize(nil)
	nb.n.kind = KindString
	var depth *int
	var sep *string
	for _, a := range args {
		if s, ok := a.(string); ok {
			sv := s
			sep = &sv
			continue
		}
		// Any numeric argument is a depth. The string DSL parses numbers as
		// float64, so accept every numeric kind (mirrors TS `typeof d === 'number'`).
		if d, ok := toInt(a); ok {
			dv := d
			depth = &dv
		}
	}
	// Key(depth) without a separator yields a path slice, so the node must be an
	// array to accept it (mirrors TS nodize([])).
	if depth != nil && sep == nil {
		nb.n.kind = KindArray
	}
	v := validator{
		name: "Key",
		args: append([]any{}, args...),
		fn: func(val any, update *Update, state *State) bool {
			// TS state.path is [nil, k1, ..., kn]; replicate the leading nil root so
			// the index/slice math matches exactly.
			path := state.Path
			tsPath := make([]any, len(path)+1)
			for i, k := range path {
				tsPath[i+1] = k
			}
			L := len(tsPath)
			switch {
			case depth == nil && sep == nil:
				// Parent key: tsPath[L-2]. When there is no parent (root or a
				// top-level property) the slot is the nil root, so leave the value
				// unchanged (TS assigns undefined/null, which is not applied).
				if len(path) >= 2 {
					update.Val = path[len(path)-2]
					update.HasVal = true
				}
			case depth != nil:
				d := *depth
				lo := L - 1
				if d >= 0 {
					lo = L - 1 - d
				}
				hi := L - 1
				if d < 0 {
					hi = L
				}
				sl := jsSlice(tsPath, lo, hi)
				if sep != nil {
					parts := make([]string, len(sl))
					for i, e := range sl {
						if str, ok := e.(string); ok {
							parts[i] = str
						}
					}
					update.Val = joinWith(parts, *sep)
				} else {
					update.Val = append([]any{}, sl...)
				}
				update.HasVal = true
			}
			return true
		},
		stringify: func() string { return "Key()" },
	}
	nb.n.befores = append(nb.n.befores, v)
	bumpValidatorGen()
	return nb
}

// jsSlice implements JavaScript Array.prototype.slice index semantics: a
// negative bound counts from the end, out-of-range bounds clamp, and an empty
// range yields an empty slice (never a panic). Used by Key(depth).
func jsSlice(arr []any, start, end int) []any {
	n := len(arr)
	if start < 0 {
		start = n + start
		if start < 0 {
			start = 0
		}
	} else if start > n {
		start = n
	}
	if end < 0 {
		end = n + end
		if end < 0 {
			end = 0
		}
	} else if end > n {
		end = n
	}
	if start >= end {
		return []any{}
	}
	out := make([]any, end-start)
	copy(out, arr[start:end])
	return out
}

func joinWith(parts []string, sep string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += sep
		}
		out += p
	}
	return out
}

// G-prefixed aliases. Provided for users who want to dot-import the package
// without colliding with stdlib builtins (e.g. String/Number/Boolean tokens).
var (
	GAny      = Any
	GString   = String
	GNumber   = Number
	GBoolean  = Boolean
	GObject   = Object
	GArray    = Array
	GFunction = Function
	GInteger  = Integer
	GDate     = Date
)

// Builder aliases (functions, not vars, so they can be method-valued).
func GRequired(spec ...any) *Node          { return Required(spec...) }
func GOptional(spec ...any) *Node          { return Optional(spec...) }
func GOpen(spec ...any) *Node              { return Open(spec...) }
func GClosed(spec ...any) *Node            { return Closed(spec...) }
func GSkip(spec ...any) *Node              { return Skip(spec...) }
func GIgnore(spec ...any) *Node            { return Ignore(spec...) }
func GEmpty(spec ...any) *Node             { return Empty(spec...) }
func GDefault(d any, spec ...any) *Node    { return Default(d, spec...) }
func GFault(msg string, spec ...any) *Node { return Fault(msg, spec...) }
func GNever(spec ...any) *Node             { return Never(spec...) }
func GType(kind any, spec ...any) *Node    { return Type(kind, spec...) }
func GExact(vals ...any) *Node             { return Exact(vals...) }
func GMin(min any, spec ...any) *Node      { return Min(min, spec...) }
func GMax(max any, spec ...any) *Node      { return Max(max, spec...) }
func GAbove(above any, spec ...any) *Node  { return Above(above, spec...) }
func GBelow(below any, spec ...any) *Node  { return Below(below, spec...) }
func GLen(length int, spec ...any) *Node   { return Len(length, spec...) }
func GCheck(check any, spec ...any) *Node  { return Check(check, spec...) }
func GBefore(fn func(any, *Update, *State) bool, spec ...any) *Node {
	return Before(fn, spec...)
}
func GAfter(fn func(any, *Update, *State) bool, spec ...any) *Node {
	return After(fn, spec...)
}
func GAll(shapes ...any) *Node               { return All(shapes...) }
func GNof(count any, shapes ...any) *Node    { return Nof(count, shapes...) }
func GChild(child any, spec ...any) *Node    { return Child(child, spec...) }
func GRest(child any, spec ...any) *Node     { return Rest(child, spec...) }
func GDefine(name string, spec ...any) *Node { return Define(name, spec...) }
func GRefer(name string, spec ...any) *Node  { return Refer(name, spec...) }
func GRename(name string, spec ...any) *Node { return Rename(name, spec...) }
func GFunc(spec ...any) *Node                { return Func(spec...) }
func GKey(args ...any) *Node                 { return Key(args...) }

// Helpers

func toFloat(v any) float64 {
	switch x := v.(type) {
	case int:
		return float64(x)
	case int8:
		return float64(x)
	case int16:
		return float64(x)
	case int32:
		return float64(x)
	case int64:
		return float64(x)
	case uint:
		return float64(x)
	case uint8:
		return float64(x)
	case uint16:
		return float64(x)
	case uint32:
		return float64(x)
	case uint64:
		return float64(x)
	case float32:
		return float64(x)
	case float64:
		return x
	case string:
		return float64(len(x))
	}
	return math.NaN()
}

// valueLen mirrors TS valueLen: number → number, otherwise length-of-string/array
// or count of object keys. ok=false if not measurable.
// boundDefers reports whether a size bound should stand aside and let the rest
// of validation speak. Two cases: the value is of the wrong type, so the
// structural check is about to report that and a bound message would mask it;
// or the value is absent on a node that does not require it, which TS drops.
// Mirrors TS typeWillFail plus the undefined guard in handleValidate.
func boundDefers(state *State) bool {
	n := state.Node
	if state.absent && (n.skippable || !n.required) {
		return true
	}
	// An absent value fails a declared null kind, as it fails any other:
	// its nil only looks like the null.
	if state.absent && n.kind == KindNull {
		return true
	}
	return typeWillFail(n, state.Value)
}

// typeWillFail reports whether the node declares a concrete type that this
// value does not have.
func typeWillFail(n *node, val any) bool {
	switch n.kind {
	case KindString:
		_, ok := val.(string)
		return !ok
	case KindNumber:
		return !isNumber(val) || isNaN(val)
	case KindBoolean:
		_, ok := val.(bool)
		return !ok
	case KindObject:
		_, ok := val.(map[string]any)
		return !ok
	case KindArray:
		return !isAnyArray(val)
	case KindFunction:
		return !isFunction(val)
	case KindRegexp:
		// A regexp node is string-shaped, so a non-string is a type error.
		_, ok := val.(string)
		return !ok
	case KindNull:
		return val != nil
	case KindNaN:
		return !isNumber(val) || !isNaN(val)
	case KindInteger:
		return !isInteger(val)
	case KindDate:
		_, ok := val.(time.Time)
		return !ok
	}
	return false
}

// numText renders a bound argument as JS renders a number: an integral value
// in full, never in exponent form.
func numText(v any) string {
	if isNumber(v) {
		return fmtFloat(toFloat(v))
	}
	return fmt.Sprintf("%v", v)
}

// isNumeric reports whether a bound compares the value itself (a number or a
// date, measured by its time value) rather than a length or key count.
func isNumeric(v any) bool {
	if _, ok := v.(time.Time); ok {
		return true
	}
	return isNumber(v)
}

// sizeText renders a measured size, or NaN when the value has none — a boolean
// or null has no length, and TS reports "(was NaN)" rather than omitting it.
func sizeText(vsize float64, ok bool) string {
	if !ok {
		return "NaN"
	}
	return fmtFloat(vsize)
}

func valueLen(v any) (float64, bool) {
	// A date's size is its time value, so bounds compare instants.
	if t, ok := v.(time.Time); ok {
		return float64(t.UnixMilli()), true
	}
	if v == nil {
		return 0, false
	}
	if isNumber(v) {
		return toFloat(v), true
	}
	switch x := v.(type) {
	case string:
		return float64(len(x)), true
	case []any:
		return float64(len(x)), true
	case map[string]any:
		return float64(len(x)), true
	}
	return 0, false
}

// fmtFloat renders a float64 as JS Number#toString does, so a number in a
// message or a coerced string reads identically in both languages: plain digits
// for 1e-6 <= |f| < 1e21, exponent form with a signed, unpadded exponent
// outside that range, and NaN / Infinity by name.
func fmtFloat(f float64) string {
	switch {
	case math.IsNaN(f):
		return "NaN"
	case math.IsInf(f, 1):
		return "Infinity"
	case math.IsInf(f, -1):
		return "-Infinity"
	case f == 0:
		return "0"
	}

	if a := math.Abs(f); a >= 1e-6 && a < 1e21 {
		return strconv.FormatFloat(f, 'f', -1, 64)
	}

	// strconv writes "1.5e-07"; JS writes "1.5e-7". The exponent is never
	// zero here: this branch only sees magnitudes below 1e-6 or at least 1e21.
	mant, exp, _ := strings.Cut(strconv.FormatFloat(f, 'e', -1, 64), "e")
	return mant + "e" + exp[:1] + strings.TrimLeft(exp[1:], "0")
}

func formatList(vals []any) string {
	out := ""
	for i, v := range vals {
		if i > 0 {
			out += ", "
		}
		// TS renders Exact values dequoted (stringify(v, true)), e.g. admin, user.
		switch x := v.(type) {
		case nil:
			out += "null"
		case string:
			out += x
		case map[string]any, []any:
			// An object or array value is its JSON, as TS stringifies it
			// (its keys sorted here, see the parity page).
			out += jsonRender(x)
		default:
			out += fmt.Sprintf("%v", x)
		}
	}
	return out
}

// G-prefixed aliases for the builders added since v10, for a dot-import.
func GNullable(spec ...any) *Node                     { return Nullable(spec...) }
func GCoerce(spec ...any) *Node                       { return Coerce(spec...) }
func GEmail(spec ...any) *Node                        { return Email(spec...) }
func GUrl(spec ...any) *Node                          { return Url(spec...) }
func GUuid(spec ...any) *Node                         { return Uuid(spec...) }
func GDateTime(spec ...any) *Node                     { return DateTime(spec...) }
func GIp(spec ...any) *Node                           { return Ip(spec...) }
func GIpv4(spec ...any) *Node                         { return Ipv4(spec...) }
func GIpv6(spec ...any) *Node                         { return Ipv6(spec...) }
func GCatch(fallback any, spec ...any) *Node          { return Catch(fallback, spec...) }
func GDescribe(description string, spec ...any) *Node { return Describe(description, spec...) }
func GDiscriminated(tag string, branches map[string]any) *Node {
	return Discriminated(tag, branches)
}
func GTransform(fn func(val any, state *State) any, spec ...any) *Node {
	return Transform(fn, spec...)
}
func GWhen(cond any, shapes ...any) *Node { return When(cond, shapes...) }
func GContains(count any, shape any, spec ...any) *Node {
	return Contains(count, shape, spec...)
}
func GUnique(spec ...any) *Node { return Unique(spec...) }

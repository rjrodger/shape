package shape

import (
	"fmt"
	"math"
	"reflect"
	"regexp"
	"strconv"
	"strings"
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
		return newNodeWrap(&node{kind: KindNever, faultMsg: err.Error()})
	}
	return newNodeWrap(n)
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
		nb = buildize(dval)
	} else {
		nb = buildize(spec[0])
		// An untyped shape (Required(), Exact(1)) is built over the default
		// instead, and so takes the default's kind, as in TS.
		if nb.n.kind == KindAny && dval != nil {
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
	return nb
}

// Default (chained).
func (n *Node) Default(dval any) *Node {
	n.n.required = false
	n.n.requiredSet = true
	n.n.skippable = false
	n.n.hasDefault = true
	n.n.defaultValue = dval
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

// Never always fails to match.
func Never(spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.kind = KindNever
	return nb
}

// Never (chained).
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

	nb.n.kind = tn.kind
	nb.n.required = tn.required
	nb.n.requiredSet = tn.requiredSet
	nb.n.skippable = tn.skippable
	nb.n.hasDefault = tn.hasDefault
	nb.n.defaultValue = cloneAny(tn.defaultValue)
	nb.n.hasLiteral = tn.hasLiteral
	nb.n.literal = tn.literal

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

// Exact requires the value equal one of the provided literals.
func Exact(vals ...any) *Node {
	nb := buildize(nil)
	nb.n.kind = KindAny
	nb.n.hasExact = true
	nb.n.exactVals = append([]any{}, vals...)
	v := validator{
		name: "Exact",
		args: append([]any{}, vals...),
		fn: func(val any, update *Update, state *State) bool {
			for _, want := range vals {
				if reflect.DeepEqual(val, want) {
					return true
				}
			}
			// The default stands in for an absent value only; a present null
			// is a value in its own right (TS: undefined === val).
			if state.absent && state.Node.hasDefault {
				for _, want := range vals {
					if reflect.DeepEqual(state.Node.defaultValue, want) {
						return true
					}
				}
			}
			update.Why = WhyExact
			update.Mark = 4010
			update.Err = makeErr(state, WhyExact, 4010,
				fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" must be exactly one of: %s", formatList(vals)))
			update.Done = true
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
func fault(msg string) *Node {
	return newNodeWrap(&node{kind: KindNever, faultMsg: msg})
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
			lenpart := ""
			if !isNumeric(val) {
				lenpart = "length "
			}
			update.Why = WhyMin
			update.Done = true
			update.Mark = 4011
			update.Err = makeErr(state, WhyMin, 4011,
				fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" must be a minimum %sof %s (was %s).",
					lenpart, numText(min), sizeText(vsize, ok)))
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
		n.n.kind, n.n.faultMsg = KindNever, other.n.faultMsg
		return n
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
			lenpart := ""
			if !isNumeric(val) {
				lenpart = "length "
			}
			update.Why = WhyMax
			update.Done = true
			update.Mark = 4012
			update.Err = makeErr(state, WhyMax, 4012,
				fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" must be a maximum %sof %s (was %s).",
					lenpart, numText(max), sizeText(vsize, ok)))
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
		n.n.kind, n.n.faultMsg = KindNever, other.n.faultMsg
		return n
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
			verb := "be"
			if !isNumeric(val) {
				verb = "have length"
			}
			update.Why = WhyAbove
			update.Done = true
			update.Mark = 4013
			update.Err = makeErr(state, WhyAbove, 4013,
				fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" must %s above %s (was %s).",
					verb, numText(above), sizeText(vsize, ok)))
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
		n.n.kind, n.n.faultMsg = KindNever, other.n.faultMsg
		return n
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
			verb := "be"
			if !isNumeric(val) {
				verb = "have length"
			}
			update.Why = WhyBelow
			update.Done = true
			update.Mark = 4014
			update.Err = makeErr(state, WhyBelow, 4014,
				fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" must %s below %s (was %s).",
					verb, numText(below), sizeText(vsize, ok)))
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
		n.n.kind, n.n.faultMsg = KindNever, other.n.faultMsg
		return n
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
			suffix := ""
			if !isNumeric(val) {
				suffix = " in length"
			}
			update.Why = WhyLen
			update.Done = true
			update.Mark = 4015
			update.Err = makeErr(state, WhyLen, 4015,
				fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" must be exactly %d%s (was %s).",
					length, suffix, sizeText(vsize, ok)))
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
		n.n.kind, n.n.faultMsg = KindNever, other.n.faultMsg
		return n
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
		v := validator{name: "Check", fn: c, stringify: func() string { return "Check()" }}
		nb.n.befores = append(nb.n.befores, v)
		bumpValidatorGen()
	case *regexp.Regexp:
		re := c
		nb.n.kind = KindCheck
		nb.n.required = true
		nb.n.requiredSet = true
		// The check name is the /pattern/ form so failures read
		// `check "/re/" failed`, mirroring TS Check(RegExp).
		reName := "/" + re.String() + "/"
		v := validator{
			name: reName,
			fn: func(val any, update *Update, state *State) bool {
				if s, ok := val.(string); ok && re.MatchString(s) {
					return true
				}
				// No custom text: fall through to the default "check ... failed"
				// message with the /pattern/ name.
				update.Why = WhyCheck
				update.Mark = markCheckType
				return false
			},
			stringify: func() string { return fmt.Sprintf("Check(/%s/)", re.String()) },
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
		validator{name: "Before", fn: fn, stringify: func() string { return "Before()" }})
	bumpValidatorGen()
	return nb
}

// Before (chained).
func (n *Node) Before(fn func(val any, update *Update, state *State) bool) *Node {
	n.n.befores = append(n.n.befores,
		validator{name: "Before", fn: fn, stringify: func() string { return "Before()" }})
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
		validator{name: "After", fn: fn, stringify: func() string { return "After()" }})
	bumpValidatorGen()
	return nb
}

// After (chained).
func (n *Node) After(fn func(val any, update *Update, state *State) bool) *Node {
	n.n.afters = append(n.n.afters,
		validator{name: "After", fn: fn, stringify: func() string { return "After()" }})
	bumpValidatorGen()
	return n
}

// One requires the value to satisfy exactly one of the given shapes.
func One(shapes ...any) *Node {
	return makeListBuilder(listOne, shapes)
}

// Some requires the value to satisfy at least one shape.
func Some(shapes ...any) *Node {
	return makeListBuilder(listSome, shapes)
}

// All requires the value to satisfy every shape.
func All(shapes ...any) *Node {
	return makeListBuilder(listAll, shapes)
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
			sn = &node{kind: KindNever, faultMsg: err.Error()}
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
		cn = &node{kind: KindNever, faultMsg: err.Error()}
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
		cn = &node{kind: KindNever, faultMsg: err.Error()}
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
		cn = &node{kind: KindNever, faultMsg: err.Error()}
	}
	if nb.n.kind != KindArray {
		nb.n.kind = KindArray
	}
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
		cn = &node{kind: KindNever, faultMsg: err.Error()}
	}
	if n.n.kind != KindArray {
		n.n.kind = KindArray
	}
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
	v := validator{
		name: "Refer",
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
func GOne(shapes ...any) *Node               { return One(shapes...) }
func GSome(shapes ...any) *Node              { return Some(shapes...) }
func GAll(shapes ...any) *Node               { return All(shapes...) }
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

package shape

import (
	"fmt"
	"math"
	"reflect"
	"regexp"
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
	nb := buildize(spec[0])
	nb.n.required = true
	nb.n.requiredSet = true
	nb.n.skippable = false
	return nb
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
	nb := buildize(spec[0])
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
		nb = buildize(String)
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
	switch v := kind.(type) {
	case Kind:
		nb.n.kind = v
	case TypeToken:
		nb.n.kind = v.kind
	case string:
		nb.n.kind = Kind(v)
	}
	return nb
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
			if val == nil && state.Node.hasDefault {
				for _, want := range vals {
					if reflect.DeepEqual(state.Node.defaultValue, want) {
						return true
					}
				}
			}
			update.Why = WhyExact
			update.Mark = 4010
			update.Err = makeErr(state, WhyExact, 4010,
				fmt.Sprintf("Value $VALUE for property $PATH must be exactly one of: %s", formatList(vals)))
			update.Done = true
			return false
		},
		stringify: func() string {
			return "Exact(" + formatList(vals) + ")"
		},
	}
	nb.n.befores = append(nb.n.befores, v)
	return nb
}

// Exact (chained).
func (n *Node) Exact(vals ...any) *Node {
	other := Exact(vals...)
	n.n.hasExact = true
	n.n.exactVals = append([]any{}, vals...)
	n.n.befores = append(n.n.befores, other.n.befores...)
	return n
}

// Min specifies a minimum value or length.
func Min(min any, spec ...any) *Node {
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
			vsize, ok := valueLen(val)
			if !ok {
				update.Err = makeErr(state, WhyMin, 4011,
					fmt.Sprintf("Value $VALUE for property $PATH must be a minimum of %v.", min))
				return false
			}
			if limit <= vsize {
				return true
			}
			lenpart := ""
			if !isNumber(val) {
				lenpart = "length "
			}
			update.Why = WhyMin
			update.Mark = 4011
			update.Err = makeErr(state, WhyMin, 4011,
				fmt.Sprintf("Value $VALUE for property $PATH must be a minimum %sof %v (was %v).",
					lenpart, min, fmtFloat(vsize)))
			return false
		},
		stringify: func() string { return fmt.Sprintf("Min(%v)", min) },
	}
	nb.n.afters = append(nb.n.afters, v)
	return nb
}

// Min (chained).
func (n *Node) Min(min any) *Node {
	other := Min(min)
	n.n.afters = append(n.n.afters, other.n.afters...)
	return n
}

// Max specifies a maximum value or length.
func Max(max any, spec ...any) *Node {
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
			vsize, ok := valueLen(val)
			if !ok {
				update.Err = makeErr(state, WhyMax, 4012,
					fmt.Sprintf("Value $VALUE for property $PATH must be a maximum of %v.", max))
				return false
			}
			if vsize <= limit {
				return true
			}
			lenpart := ""
			if !isNumber(val) {
				lenpart = "length "
			}
			update.Why = WhyMax
			update.Mark = 4012
			update.Err = makeErr(state, WhyMax, 4012,
				fmt.Sprintf("Value $VALUE for property $PATH must be a maximum %sof %v (was %v).",
					lenpart, max, fmtFloat(vsize)))
			return false
		},
		stringify: func() string { return fmt.Sprintf("Max(%v)", max) },
	}
	nb.n.afters = append(nb.n.afters, v)
	return nb
}

// Max (chained).
func (n *Node) Max(max any) *Node {
	other := Max(max)
	n.n.afters = append(n.n.afters, other.n.afters...)
	return n
}

// Above specifies a strict lower bound on value or length.
func Above(above any, spec ...any) *Node {
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
			vsize, ok := valueLen(val)
			if !ok {
				return false
			}
			if limit < vsize {
				return true
			}
			verb := "be"
			if !isNumber(val) {
				verb = "have length"
			}
			update.Why = WhyAbove
			update.Mark = 4013
			update.Err = makeErr(state, WhyAbove, 4013,
				fmt.Sprintf("Value $VALUE for property $PATH must %s above %v (was %v).",
					verb, above, fmtFloat(vsize)))
			return false
		},
		stringify: func() string { return fmt.Sprintf("Above(%v)", above) },
	}
	nb.n.afters = append(nb.n.afters, v)
	return nb
}

// Above (chained).
func (n *Node) Above(above any) *Node {
	other := Above(above)
	n.n.afters = append(n.n.afters, other.n.afters...)
	return n
}

// Below specifies a strict upper bound on value or length.
func Below(below any, spec ...any) *Node {
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
			vsize, ok := valueLen(val)
			if !ok {
				return false
			}
			if vsize < limit {
				return true
			}
			verb := "be"
			if !isNumber(val) {
				verb = "have length"
			}
			update.Why = WhyBelow
			update.Mark = 4014
			update.Err = makeErr(state, WhyBelow, 4014,
				fmt.Sprintf("Value $VALUE for property $PATH must %s below %v (was %v).",
					verb, below, fmtFloat(vsize)))
			return false
		},
		stringify: func() string { return fmt.Sprintf("Below(%v)", below) },
	}
	nb.n.afters = append(nb.n.afters, v)
	return nb
}

// Below (chained).
func (n *Node) Below(below any) *Node {
	other := Below(below)
	n.n.afters = append(n.n.afters, other.n.afters...)
	return n
}

// Len requires an exact value or collection length.
func Len(length int, spec ...any) *Node {
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
			vsize, ok := valueLen(val)
			if !ok {
				return false
			}
			if vsize == limit {
				return true
			}
			suffix := ""
			if !isNumber(val) {
				suffix = " in length"
			}
			update.Why = WhyLen
			update.Mark = 4015
			update.Err = makeErr(state, WhyLen, 4015,
				fmt.Sprintf("Value $VALUE for property $PATH must be exactly %d%s (was %v).",
					length, suffix, fmtFloat(vsize)))
			return false
		},
		stringify: func() string { return fmt.Sprintf("Len(%d)", length) },
	}
	nb.n.afters = append(nb.n.afters, v)
	return nb
}

// Len (chained).
func (n *Node) Len(length int) *Node {
	other := Len(length)
	n.n.afters = append(n.n.afters, other.n.afters...)
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
	case *regexp.Regexp:
		re := c
		nb.n.kind = KindCheck
		nb.n.required = true
		nb.n.requiredSet = true
		v := validator{
			name: "Check",
			fn: func(val any, update *Update, state *State) bool {
				if val == nil {
					return false
				}
				s, ok := val.(string)
				if !ok {
					return false
				}
				if !re.MatchString(s) {
					update.Why = WhyCheck
					update.Err = makeErr(state, WhyCheck, 4020,
						fmt.Sprintf("Value $VALUE for property $PATH did not match %s.", re.String()))
					return false
				}
				return true
			},
			stringify: func() string { return fmt.Sprintf("Check(/%s/)", re.String()) },
		}
		nb.n.befores = append(nb.n.befores, v)
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
	return nb
}

// Before (chained).
func (n *Node) Before(fn func(val any, update *Update, state *State) bool) *Node {
	n.n.befores = append(n.n.befores,
		validator{name: "Before", fn: fn, stringify: func() string { return "Before()" }})
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
	return nb
}

// After (chained).
func (n *Node) After(fn func(val any, update *Update, state *State) bool) *Node {
	n.n.afters = append(n.n.afters,
		validator{name: "After", fn: fn, stringify: func() string { return "After()" }})
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
		nb = buildize(map[string]any{})
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
	return nb
}

// ReferOptions controls Refer behaviour. Fill substitutes the referenced node
// even when the input value is missing/nil, allowing recursive structure.
type ReferOptions struct {
	Fill bool
}

// Refer substitutes the named node at validation time.
func Refer(name string, spec ...any) *Node {
	return ReferWith(name, ReferOptions{}, spec...)
}

// ReferWith is Refer with explicit options.
func ReferWith(name string, opts ReferOptions, spec ...any) *Node {
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
			if state.Ctx == nil || state.Ctx.Refs == nil {
				return true
			}
			if val == nil && !opts.Fill {
				return true
			}
			if rn, ok := state.Ctx.Refs[name]; ok {
				update.Node = rn
			}
			return true
		},
		stringify: func() string { return fmt.Sprintf("Refer(%q)", name) },
	}
	nb.n.befores = append(nb.n.befores, v)
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
func Func(spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.kind = KindFunction
	nb.n.required = true
	nb.n.requiredSet = true
	return nb
}

// Func (chained).
func (n *Node) Func() *Node {
	n.n.kind = KindFunction
	n.n.required = true
	n.n.requiredSet = true
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
		switch v := a.(type) {
		case int:
			d := v
			depth = &d
		case string:
			s := v
			sep = &s
		}
	}
	v := validator{
		name: "Key",
		fn: func(val any, update *Update, state *State) bool {
			path := state.Path
			switch {
			case depth == nil && sep == nil:
				if len(path) == 0 {
					update.Val = ""
				} else {
					update.Val = path[len(path)-1]
				}
				update.HasVal = true
			case depth != nil:
				d := *depth
				start := len(path) - 1 - d
				if d < 0 {
					start = len(path) - 1
				}
				if start < 0 {
					start = 0
				}
				end := len(path) - 1
				if d < 0 {
					end = len(path) + (-d)
				}
				if end > len(path) {
					end = len(path)
				}
				if start > end {
					start = end
				}
				slice := append([]string{}, path[start:end]...)
				if sep != nil {
					update.Val = joinWith(slice, *sep)
				} else {
					anys := make([]any, len(slice))
					for i, s := range slice {
						anys[i] = s
					}
					update.Val = anys
				}
				update.HasVal = true
			}
			return true
		},
		stringify: func() string { return "Key()" },
	}
	nb.n.befores = append(nb.n.befores, v)
	return nb
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
)

// Builder aliases (functions, not vars, so they can be method-valued).
func GRequired(spec ...any) *Node                         { return Required(spec...) }
func GOptional(spec ...any) *Node                         { return Optional(spec...) }
func GOpen(spec ...any) *Node                             { return Open(spec...) }
func GClosed(spec ...any) *Node                           { return Closed(spec...) }
func GSkip(spec ...any) *Node                             { return Skip(spec...) }
func GIgnore(spec ...any) *Node                           { return Ignore(spec...) }
func GEmpty(spec ...any) *Node                            { return Empty(spec...) }
func GDefault(d any, spec ...any) *Node                   { return Default(d, spec...) }
func GFault(msg string, spec ...any) *Node                { return Fault(msg, spec...) }
func GNever(spec ...any) *Node                            { return Never(spec...) }
func GType(kind any, spec ...any) *Node                   { return Type(kind, spec...) }
func GExact(vals ...any) *Node                            { return Exact(vals...) }
func GMin(min any, spec ...any) *Node                     { return Min(min, spec...) }
func GMax(max any, spec ...any) *Node                     { return Max(max, spec...) }
func GAbove(above any, spec ...any) *Node                 { return Above(above, spec...) }
func GBelow(below any, spec ...any) *Node                 { return Below(below, spec...) }
func GLen(length int, spec ...any) *Node                  { return Len(length, spec...) }
func GCheck(check any, spec ...any) *Node                 { return Check(check, spec...) }
func GBefore(fn func(any, *Update, *State) bool, spec ...any) *Node {
	return Before(fn, spec...)
}
func GAfter(fn func(any, *Update, *State) bool, spec ...any) *Node {
	return After(fn, spec...)
}
func GOne(shapes ...any) *Node                            { return One(shapes...) }
func GSome(shapes ...any) *Node                           { return Some(shapes...) }
func GAll(shapes ...any) *Node                            { return All(shapes...) }
func GChild(child any, spec ...any) *Node                 { return Child(child, spec...) }
func GRest(child any, spec ...any) *Node                  { return Rest(child, spec...) }
func GDefine(name string, spec ...any) *Node              { return Define(name, spec...) }
func GRefer(name string, spec ...any) *Node               { return Refer(name, spec...) }
func GRename(name string, spec ...any) *Node              { return Rename(name, spec...) }
func GFunc(spec ...any) *Node                             { return Func(spec...) }
func GKey(args ...any) *Node                              { return Key(args...) }

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
func valueLen(v any) (float64, bool) {
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

func fmtFloat(f float64) string {
	if f == math.Trunc(f) && !math.IsInf(f, 0) {
		return fmt.Sprintf("%d", int64(f))
	}
	return fmt.Sprintf("%v", f)
}

func formatList(vals []any) string {
	out := ""
	for i, v := range vals {
		if i > 0 {
			out += ", "
		}
		switch x := v.(type) {
		case string:
			out += fmt.Sprintf("%q", x)
		default:
			out += fmt.Sprintf("%v", x)
		}
	}
	return out
}

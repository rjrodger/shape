package shape

import (
	"fmt"
)

// Argu is a positional-arguments validator returned from MakeArgu.
type Argu struct {
	name string
}

// MakeArgu creates an Argu validator with the given namespace name. Use the
// returned value to validate positional arguments against an ordered spec.
//
//	Argu := MakeArgu("mylib")
//	argmap, err := Argu([]any{2, "x"}, "foo", map[string]any{
//	    "a": Number,
//	    "b": String,
//	})
//	// argmap == map[string]any{"a": 2, "b": "x"}
//
// Spec values may be type tokens, literal defaults, or builder *Node values.
// Skip(spec) makes a slot optional with positional shifting; Rest(spec) tail-
// captures remaining args into a slice.
func MakeArgu(name string) Argu {
	return Argu{name: name}
}

// Validate runs the positional-arg matcher.
func (a Argu) Validate(args []any, whence string, spec map[string]any) (map[string]any, error) {
	keys, nodes, err := a.compileSpec(spec)
	if err != nil {
		return nil, err
	}
	return a.run(args, whence, keys, nodes)
}

// Partial returns a closure that can be invoked with arg lists. Useful for
// building reusable signature validators.
func (a Argu) Partial(whence string, spec map[string]any) func([]any) (map[string]any, error) {
	keys, nodes, err := a.compileSpec(spec)
	if err != nil {
		// Defer the error to invocation time.
		return func([]any) (map[string]any, error) { return nil, err }
	}
	return func(args []any) (map[string]any, error) {
		return a.run(args, whence, keys, nodes)
	}
}

func (a Argu) compileSpec(spec map[string]any) ([]string, []*node, error) {
	if len(spec) == 0 {
		return nil, nil, fmt.Errorf("%s: empty argument spec", a.name)
	}
	keys := orderedKeys(spec)
	nodes := make([]*node, len(keys))
	for i, k := range keys {
		n, err := normalize(spec[k])
		if err != nil {
			return nil, nil, fmt.Errorf("%s: arg %q: %w", a.name, k, err)
		}
		nodes[i] = n
	}
	return keys, nodes, nil
}

func (a Argu) run(args []any, whence string, keys []string, nodes []*node) (map[string]any, error) {
	prefix := a.name
	if whence != "" {
		prefix += " (" + whence + ")"
	}

	out := map[string]any{}
	argIdx := 0

	for kI, key := range keys {
		n := nodes[kI]
		switch {
		case isRestNode(n):
			// Capture remaining args; if none remain and there are unfilled later
			// keys, leave undefined slots so semantics match TS Rest().
			rem := []any{}
			rest := args[argIdx:]
			if len(rest) == 0 {
				// Need at least one undefined to mirror TS behaviour: bar(f0) => d=[undefined]
				rem = []any{nil}
			} else {
				rem = append(rem, rest...)
			}
			child := n.arrChild
			if child == nil {
				child = &node{kind: KindAny}
			}
			validated := make([]any, len(rem))
			for i, v := range rem {
				sub := &ValidationError{}
				ctx := newContext(nil)
				validated[i] = validateNode(child, v, []string{key}, key, out, ctx, false, sub)
				if sub.hasAny() {
					return nil, fmt.Errorf("%s: %s", prefix, sub.Error())
				}
			}
			out[key] = validated
			argIdx = len(args)
		case n.skippable:
			if argIdx >= len(args) {
				out[key] = nil
				continue
			}
			// Try matching argIdx; if it doesn't match the underlying type, skip.
			tester := *n
			tester.skippable = false
			tester.silent = false
			ok, _ := tryMatch(&tester, args[argIdx])
			if ok {
				val, err := requireMatch(&tester, args[argIdx], key, prefix)
				if err != nil {
					return nil, err
				}
				out[key] = val
				argIdx++
			} else {
				out[key] = nil
			}
		default:
			if argIdx >= len(args) {
				val, err := requireMatch(n, nil, key, prefix)
				if err != nil {
					return nil, err
				}
				out[key] = val
				continue
			}
			val, err := requireMatch(n, args[argIdx], key, prefix)
			if err != nil {
				return nil, err
			}
			out[key] = val
			argIdx++
		}
	}

	// Too many args?
	if argIdx < len(args) {
		// Count expected (skip-aware). Approximate: count of non-rest keys.
		expected := 0
		for _, n := range nodes {
			if !isRestNode(n) {
				expected++
			}
		}
		return nil, fmt.Errorf("%s: Too many arguments for type signature (was %d, expected %d)",
			prefix, len(args), expected)
	}

	return out, nil
}

func isRestNode(n *node) bool {
	if n == nil {
		return false
	}
	if n.kind == KindArray && n.arrRest != nil {
		return true
	}
	return false
}

func tryMatch(n *node, val any) (bool, []FieldError) {
	verr := &ValidationError{}
	ctx := newContext(nil)
	collectDefines(n, ctx)
	validateNode(n, val, []string{}, "", nil, ctx, true, verr)
	return !verr.hasAny(), verr.Issues
}

func requireMatch(n *node, val any, key, prefix string) (any, error) {
	verr := &ValidationError{}
	ctx := newContext(nil)
	collectDefines(n, ctx)
	out := validateNode(n, val, []string{key}, key, nil, ctx, false, verr)
	if verr.hasAny() {
		return nil, fmt.Errorf("%s: %s", prefix, verr.Error())
	}
	return out, nil
}

// orderedKeys returns the keys of m in deterministic insertion order. Go maps
// have no defined order, so we sort alphabetically — callers needing strict
// positional order should use a map type with explicit ordering or rely on
// alphabetical key conventions like a, b, c, d.
func orderedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// Sort to make MakeArgu usage deterministic.
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j-1] > keys[j]; j-- {
			keys[j-1], keys[j] = keys[j], keys[j-1]
		}
	}
	return keys
}

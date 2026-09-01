package shape

import (
	"fmt"
	"math"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// keyExprRE matches "name: expr" — mirrors TS KEY_EXPR_RE.
var keyExprRE = regexp.MustCompile(`^\s*("(?:\\.|[^"\\])*"|[^\s]+):\s*(.*?)\s*$`)

// normalize converts a user-supplied schema spec into an internal *node tree.
func normalize(spec any) (*node, error) {
	return normalizeWith(spec, ShapeOptions{})
}

func normalizeWith(spec any, opts ShapeOptions) (*node, error) {
	if spec == nil {
		// A null literal is an optional null with null as its default, as any
		// other literal is its own default (TS nodize(null): f = null).
		return &node{kind: KindNull, hasDefault: true}, nil
	}

	switch v := spec.(type) {
	case *Node:
		return v.n, nil
	case *node:
		return v, nil
	case TypeToken:
		return typeTokenNode(v.kind), nil
	case *regexp.Regexp:
		// A regexp anywhere in a spec is a string-shaped node, as in TS. Without
		// this, One(/re/, Number) and a raw regexp spec both failed to build.
		return regexpNode(v), nil
	case time.Time:
		// A date value in a spec is a date default, as a number literal is a
		// number default.
		return &node{kind: KindDate, defaultValue: v, hasDefault: true, hasLiteral: true, literal: v}, nil
	case Kind:
		return typeTokenNode(v), nil
	case string:
		// An empty-string literal spec allows the empty string, mirroring TS
		// nodize (u.empty = true). Without this Shape("") rejected its own
		// default value.
		return &node{kind: KindString, defaultValue: v, hasDefault: true, hasLiteral: true,
			literal: v, empty: v == ""}, nil
	case bool:
		return &node{kind: KindBoolean, defaultValue: v, hasDefault: true, hasLiteral: true, literal: v}, nil
	case float64:
		if math.IsNaN(v) {
			// A NaN literal is an optional NaN with NaN as its default, as any
			// other literal is its own default (TS nodize(NaN)).
			return nanNode(), nil
		}
		return &node{kind: KindNumber, defaultValue: v, hasDefault: true, hasLiteral: true, literal: v}, nil
	case float32:
		if math.IsNaN(float64(v)) {
			return nanNode(), nil
		}
		return &node{kind: KindNumber, defaultValue: v, hasDefault: true, hasLiteral: true, literal: v}, nil
	case int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64:
		return &node{kind: KindNumber, defaultValue: v, hasDefault: true, hasLiteral: true, literal: v}, nil
	case []any:
		return normalizeArray(v, opts)
	case map[string]any:
		return normalizeObject(v, opts)
	}

	return nil, fmt.Errorf("unsupported schema value type %T", spec)
}

func nanNode() *node {
	return &node{kind: KindNaN, hasDefault: true, defaultValue: math.NaN(), hasLiteral: true, literal: math.NaN()}
}

// typeTokenNode builds a required node for a type token, carrying the kind's
// empty default value. The default is only injected when the node is later made
// Optional (mirrors TS, where wrapper constructors set both r=true and an
// EMPTY_VAL default; requiredness gates whether the default is used).
// regexpNode builds the node a regexp stands for: a required string that must
// match the pattern.
func regexpNode(re *regexp.Regexp) *node {
	return &node{
		kind:        KindRegexp,
		regexpVal:   re,
		required:    true,
		requiredSet: true,
	}
}

func typeTokenNode(k Kind) *node {
	n := &node{
		kind: k,
		// Any is the one token that does not require a value: TS Any() builds
		// an unrequired node, so { a: Any } accepts an object without "a".
		required:     k != KindAny,
		requiredSet:  true,
		hasDefault:   true,
		defaultValue: zeroForKind(k),
	}
	switch k {
	case KindObject:
		n.open = true
		n.openSet = true
		n.objRest = &node{kind: KindAny}
	case KindArray:
		n.arrChild = &node{kind: KindAny}
	}
	return n
}

// zeroForKind returns the empty value for a kind (TS EMPTY_VAL).
func zeroForKind(k Kind) any {
	switch k {
	case KindString:
		return ""
	case KindNumber, KindInteger:
		return float64(0)
	case KindBoolean:
		return false
	case KindObject:
		return map[string]any{}
	case KindArray:
		return []any{}
	default:
		return nil
	}
}

func normalizeArray(v []any, opts ShapeOptions) (*node, error) {
	n := &node{kind: KindArray, defaultValue: []any{}}
	switch len(v) {
	case 0:
		return n, nil
	case 1:
		child, err := normalizeWith(v[0], opts)
		if err != nil {
			return nil, err
		}
		n.arrChild = child
		return n, nil
	default:
		n.arrChildren = make([]*node, len(v))
		for i, sv := range v {
			cn, err := normalizeWith(sv, opts)
			if err != nil {
				return nil, fmt.Errorf("index %d: %w", i, err)
			}
			n.arrChildren[i] = cn
		}
		return n, nil
	}
}

func normalizeObject(v map[string]any, opts ShapeOptions) (*node, error) {
	n := &node{
		kind:         KindObject,
		objChildren:  map[string]*node{},
		defaultValue: map[string]any{},
	}

	if len(v) == 0 {
		n.open = true
		n.objRest = &node{kind: KindAny}
		return n, nil
	}

	keys := make([]string, 0, len(v))
	for k := range v {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	keyExprActive := opts.keyExprActive()
	metaActive := opts.metaActive()
	metaSuffix := opts.metaSuffix()
	valExprActive := opts.valExprActive()
	valExprMark := opts.valExprMark()

	// Pre-collect meta sidecars: keys ending in suffix attach to the corresponding "<base>" key.
	pendingMeta := map[string]map[string]any{}
	if metaActive {
		for _, k := range keys {
			if strings.HasSuffix(k, metaSuffix) && k != metaSuffix {
				base := k[:len(k)-len(metaSuffix)]
				if _, exists := v[base]; exists {
					sv := v[k]
					var meta map[string]any
					switch x := sv.(type) {
					case string:
						meta = map[string]any{"short": x}
					case map[string]any:
						meta = map[string]any{}
						for mk, mv := range x {
							meta[mk] = mv
						}
					default:
						meta = map[string]any{"value": sv}
					}
					pendingMeta[base] = meta
				}
			}
		}
	}

	for _, k := range keys {
		// Skip meta keys themselves.
		if metaActive && strings.HasSuffix(k, metaSuffix) && k != metaSuffix {
			base := k[:len(k)-len(metaSuffix)]
			if _, exists := v[base]; exists {
				continue
			}
		}

		// valexpr keymark: apply the expression to the parent node in place, so
		// e.g. "Open" opens this object (mirrors TS expr(src, n)). Narrowing
		// builders (Open/Closed/Min/Required/...) mutate the carrier and take
		// effect. Composition builders (All/One/Some/Exact) can't: TS applies them
		// with the object as `this` (keeping its children), but Go's variadic
		// composition builders have no carrier slot — so those are not supported
		// as value expressions (an off-by-default, rarely-used combination).
		if valExprActive && k == valExprMark {
			if src, ok := v[k].(string); ok {
				if _, err := exprApply(src, newNodeWrap(n)); err != nil {
					return nil, fmt.Errorf("valexpr key %q: %w", k, err)
				}
				continue
			}
		}

		realKey := k
		rawVal := v[k]

		// keyexpr: split "name: expr" → name + expression applied to value
		if keyExprActive {
			if m := keyExprRE.FindStringSubmatch(k); m != nil && strings.Contains(k, ":") {
				bare := m[1]
				exprSrc := m[2]
				// A quoted name decodes its escapes: "a\"b" declares a"b.
				if len(bare) >= 2 && bare[0] == '"' && bare[len(bare)-1] == '"' {
					if unq, err := strconv.Unquote(bare); err == nil {
						bare = unq
					} else {
						bare = bare[1 : len(bare)-1]
					}
				}
				if exprSrc != "" {
					realKey = bare
					// Build a *Node from the expression, then narrow with the literal default.
					built, err := buildExprWithDefault(exprSrc, rawVal)
					if err != nil {
						return nil, fmt.Errorf("key %q: %w", k, err)
					}
					rawVal = built
				}
			}
		}

		cn, err := normalizeWith(rawVal, opts)
		if err != nil {
			return nil, fmt.Errorf("key %q: %w", k, err)
		}

		// Attach meta if any.
		if meta, ok := pendingMeta[realKey]; ok {
			if cn.meta == nil {
				cn.meta = map[string]any{}
			}
			for mk, mv := range meta {
				cn.meta[mk] = mv
			}
		}

		n.objChildren[realKey] = cn
		n.objKeys = append(n.objKeys, realKey)
	}

	return n, nil
}

// buildExprWithDefault parses an expression source like "Min(1).Max(4)" and
// applies it to a literal default value. The resulting node validates the
// literal-default by default but enforces the chained constraints.
func buildExprWithDefault(src string, dflt any) (*Node, error) {
	bare, bareErr := Expr(src)

	if dflt == nil {
		return bare, bareErr
	}

	ex, err := normalize(dflt)
	if err != nil {
		return nil, err
	}

	// The example value is appended as the innermost builder call's final
	// argument, so a builder that takes a shape consumes it: "Child(Number)"
	// with [] becomes an array of numbers, "Min(2)" with 0 a bounded number.
	// A builder whose arity is already satisfied drops it — Optional(Number, 5)
	// ignores the 5 — and the example is the author's stated default, so where
	// it made no difference to the node it is applied as the value instead.
	// (ts/src/shape.ts keyExprNode does the same, both ways round.) The raw
	// example is what is appended, as TS splices the raw value: a builder that
	// takes a value ("Default()", "Min()") then reads it as one.
	node, applyErr := exprApply(src, dflt)
	if applyErr != nil {
		// Not a builder chain at all — a bare literal such as "a: 5" — so there
		// is nothing to hand the example to and the expression's own value
		// stands, as it does in TS.
		return bare, bareErr
	}

	if bareErr != nil {
		// The expression cannot be built without the example. Where the
		// example became the shape — Pick(["a"]) has nothing to pick from
		// without it — it plainly made a difference; where a value-taking
		// builder read it as its argument, TS's bare build succeeds with an
		// empty argument and looks the same, so the example is the default
		// too ("a: Min()" with 3 is a bound of 3 defaulting to 3).
		if ex.kind != node.n.kind {
			node.n.hasDefault = true
			node.n.defaultValue = dflt
			node.n.hasLiteral = true
			node.n.literal = dflt
		}
		return node, nil
	}

	if sameShapeNode(node.n, bare.n) {
		node.n.hasDefault = true
		node.n.defaultValue = dflt
		node.n.hasLiteral = true
		node.n.literal = dflt
	}

	return node, nil
}

// sameShapeNode is the structural comparison of the parts of a node a key
// expression's example could have influenced (TS sameShapeNode): the kind,
// the required and skippable flags, how many checks it carries, its value
// and default, and its child shapes. A builder's own arguments are not
// compared, so Exact() with an example reads as Exact(example), just as
// Exact() does.
func sameShapeNode(x, y *node) bool {
	return x.kind == y.kind &&
		x.required == y.required &&
		x.skippable == y.skippable &&
		len(x.befores) == len(y.befores) &&
		len(x.afters) == len(y.afters) &&
		x.hasDefault == y.hasDefault &&
		reflect.DeepEqual(x.defaultValue, y.defaultValue) &&
		len(x.objChildren) == len(y.objChildren) &&
		len(x.arrChildren) == len(y.arrChildren) &&
		(x.objRest == nil) == (y.objRest == nil) &&
		(x.arrChild == nil) == (y.arrChild == nil) &&
		(x.arrRest == nil) == (y.arrRest == nil)
}

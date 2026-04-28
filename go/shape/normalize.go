package shape

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
)

// keyExprRE matches "name: expr" — mirrors TS KEY_EXPR_RE.
var keyExprRE = regexp.MustCompile(`^\s*("(?:\\.|[^"\\])*"|[^\s]+):\s*(.*?)\s*$`)

// normalize converts a user-supplied schema spec into an internal *node tree.
func normalize(spec any) (*node, error) {
	return normalizeWith(spec, ShapeOptions{})
}

func normalizeWith(spec any, opts ShapeOptions) (*node, error) {
	if spec == nil {
		return &node{kind: KindNull}, nil
	}

	switch v := spec.(type) {
	case *Node:
		return v.n, nil
	case *node:
		return v, nil
	case TypeToken:
		n := &node{kind: v.kind, required: true, requiredSet: true}
		if v.kind == KindObject {
			n.open = true
			n.openSet = true
			n.objRest = &node{kind: KindAny}
		}
		if v.kind == KindArray {
			n.arrChild = &node{kind: KindAny}
		}
		return n, nil
	case Kind:
		return &node{kind: v, required: true, requiredSet: true}, nil
	case string:
		return &node{kind: KindString, defaultValue: v, hasDefault: true, hasLiteral: true, literal: v}, nil
	case bool:
		return &node{kind: KindBoolean, defaultValue: v, hasDefault: true, hasLiteral: true, literal: v}, nil
	case float64:
		if math.IsNaN(v) {
			return &node{kind: KindNaN, required: true, requiredSet: true}, nil
		}
		return &node{kind: KindNumber, defaultValue: v, hasDefault: true, hasLiteral: true, literal: v}, nil
	case float32:
		if math.IsNaN(float64(v)) {
			return &node{kind: KindNaN, required: true, requiredSet: true}, nil
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

		// valexpr keymark: the entire object is rewritten via expression.
		if valExprActive && k == valExprMark {
			if src, ok := v[k].(string); ok {
				// Apply expression to the existing node `n`.
				exprNode, err := Expr(src)
				if err != nil {
					return nil, fmt.Errorf("valexpr key %q: %w", k, err)
				}
				// Merge: copy whatever the expression set onto our node.
				n.kind = exprNode.n.kind
				n.required = exprNode.n.required
				n.requiredSet = exprNode.n.requiredSet
				n.befores = append(n.befores, exprNode.n.befores...)
				n.afters = append(n.afters, exprNode.n.afters...)
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
				// strip optional surrounding quotes from name
				if len(bare) >= 2 && bare[0] == '"' && bare[len(bare)-1] == '"' {
					bare = bare[1 : len(bare)-1]
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
	exprNode, err := Expr(src)
	if err != nil {
		return nil, err
	}
	// If the default is supplied, attach as default value while preserving the
	// expression's kind and validators.
	if dflt != nil {
		exprNode.n.hasDefault = true
		exprNode.n.defaultValue = dflt
		exprNode.n.hasLiteral = true
		exprNode.n.literal = dflt
		exprNode.n.required = false
		exprNode.n.requiredSet = true
	}
	return exprNode, nil
}

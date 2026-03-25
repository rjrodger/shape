package shape

import "fmt"

func normalize(spec any) (*node, error) {
	reqOverride, openOverride, base := unwrap(spec)

	n, err := normalizeBase(base)
	if err != nil {
		return nil, err
	}

	if reqOverride != nil {
		n.required = *reqOverride
	}
	if openOverride != nil && n.kind == KindObject {
		n.open = *openOverride
	}

	return n, nil
}

func unwrap(spec any) (required *bool, open *bool, base any) {
	base = spec
	for {
		w, ok := base.(wrappedSpec)
		if !ok {
			return required, open, base
		}
		if w.required != nil {
			required = w.required
		}
		if w.open != nil {
			open = w.open
		}
		base = w.spec
	}
}

func normalizeBase(spec any) (*node, error) {
	switch v := spec.(type) {
	case nil:
		return &node{kind: KindNull, defaultValue: nil}, nil
	case TypeToken:
		return &node{kind: v.kind, required: true}, nil
	case string:
		return &node{kind: KindString, defaultValue: v}, nil
	case bool:
		return &node{kind: KindBoolean, defaultValue: v}, nil
	case int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64,
		float32, float64:
		return &node{kind: KindNumber, defaultValue: v}, nil
	case []any:
		n := &node{kind: KindArray, defaultValue: []any{}}
		if len(v) == 1 {
			child, err := normalize(v[0])
			if err != nil {
				return nil, err
			}
			n.arrChild = child
		}
		return n, nil
	case map[string]any:
		n := &node{kind: KindObject, objChildren: map[string]*node{}, defaultValue: map[string]any{}, open: false}
		for k, sv := range v {
			cn, err := normalize(sv)
			if err != nil {
				return nil, fmt.Errorf("key %q: %w", k, err)
			}
			n.objChildren[k] = cn
		}
		if len(v) == 0 {
			n.open = true
		}
		return n, nil
	default:
		return nil, fmt.Errorf("unsupported schema value type %T", spec)
	}
}

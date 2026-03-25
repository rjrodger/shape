package shape

import (
	"fmt"
)

func validateNode(n *node, in any, path string, verr *ValidationError) any {
	if n == nil {
		return in
	}

	if in == nil {
		if n.required {
			verr.add(path, "value is required")
			return nil
		}
		return cloneDefault(n)
	}

	switch n.kind {
	case KindAny:
		return in
	case KindString:
		if _, ok := in.(string); !ok {
			verr.add(path, "expected string")
			return in
		}
		return in
	case KindBoolean:
		if _, ok := in.(bool); !ok {
			verr.add(path, "expected boolean")
			return in
		}
		return in
	case KindNumber:
		if !isNumber(in) {
			verr.add(path, "expected number")
			return in
		}
		return in
	case KindNull:
		if in != nil {
			verr.add(path, "expected null")
		}
		return nil
	case KindArray:
		arr, ok := in.([]any)
		if !ok {
			verr.add(path, "expected array ([]any)")
			return in
		}
		if n.arrChild == nil {
			return arr
		}
		out := make([]any, len(arr))
		for i := range arr {
			out[i] = validateNode(n.arrChild, arr[i], fmt.Sprintf("%s[%d]", path, i), verr)
		}
		return out
	case KindObject:
		obj, ok := in.(map[string]any)
		if !ok {
			verr.add(path, "expected object (map[string]any)")
			return in
		}

		out := map[string]any{}
		for k, v := range obj {
			out[k] = v
		}

		for k, cn := range n.objChildren {
			v, has := obj[k]
			kpath := path + "." + k
			if !has {
				if cn.required {
					verr.add(kpath, "value is required")
					continue
				}
				if cn.defaultValue != nil || cn.kind == KindNull || cn.kind == KindObject || cn.kind == KindArray {
					out[k] = cloneDefault(cn)
				}
				continue
			}
			out[k] = validateNode(cn, v, kpath, verr)
		}

		if !n.open {
			for k := range obj {
				if _, ok := n.objChildren[k]; !ok {
					verr.add(path+"."+k, "property is not allowed")
				}
			}
		}

		return out
	default:
		verr.add(path, "unknown schema kind")
		return in
	}
}

func cloneDefault(n *node) any {
	switch n.kind {
	case KindObject:
		out := map[string]any{}
		for k, cn := range n.objChildren {
			if cn.required {
				continue
			}
			if cn.defaultValue != nil || cn.kind == KindNull || cn.kind == KindObject || cn.kind == KindArray {
				out[k] = cloneDefault(cn)
			}
		}
		return out
	case KindArray:
		return []any{}
	default:
		return n.defaultValue
	}
}

func isNumber(v any) bool {
	switch v.(type) {
	case int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64,
		float32, float64:
		return true
	default:
		return false
	}
}

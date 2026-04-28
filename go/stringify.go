package shape

import (
	"fmt"
	"sort"
	"strings"
)

// stringifyNode renders a node as a compact debug string.
func stringifyNode(n *node, inline bool) string {
	if n == nil {
		return "<nil>"
	}
	switch n.kind {
	case KindString:
		return suffix(quoteOrType(n, "String"), n)
	case KindNumber:
		return suffix(literalOrType(n, "Number"), n)
	case KindBoolean:
		return suffix(literalOrType(n, "Boolean"), n)
	case KindNull:
		return "null"
	case KindNaN:
		return "NaN"
	case KindAny:
		base := "Any"
		if n.hasDefault {
			base = fmt.Sprintf("Any(%v)", n.defaultValue)
		}
		return suffix(base, n)
	case KindNever:
		return suffix("Never", n)
	case KindCheck:
		return suffix("Check", n)
	case KindFunction:
		return suffix("Function", n)
	case KindList:
		mode := "One"
		switch n.listMode {
		case listSome:
			mode = "Some"
		case listAll:
			mode = "All"
		}
		parts := make([]string, len(n.list))
		for i, sn := range n.list {
			parts[i] = stringifyNode(sn, true)
		}
		return suffix(fmt.Sprintf("%s(%s)", mode, strings.Join(parts, ", ")), n)
	case KindArray:
		var parts []string
		switch {
		case len(n.arrChildren) > 0:
			for _, sn := range n.arrChildren {
				parts = append(parts, stringifyNode(sn, true))
			}
		case n.arrChild != nil:
			parts = append(parts, stringifyNode(n.arrChild, true))
		}
		if n.arrRest != nil {
			parts = append(parts, "..."+stringifyNode(n.arrRest, true))
		}
		return suffix("["+strings.Join(parts, ", ")+"]", n)
	case KindObject:
		keys := append([]string{}, n.objKeys...)
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, k := range keys {
			parts = append(parts, fmt.Sprintf("%s: %s", k, stringifyNode(n.objChildren[k], true)))
		}
		body := "{" + strings.Join(parts, ", ") + "}"
		if n.open && n.objRest != nil && n.objRest.kind != KindAny {
			body += ".Child(" + stringifyNode(n.objRest, true) + ")"
		} else if n.open {
			body += ".Open()"
		}
		return suffix(body, n)
	}
	return suffix(string(n.kind), n)
}

func suffix(base string, n *node) string {
	out := base
	if n.required && !isStructuralKind(n.kind) {
		// Required is implicit on a TypeToken; only annotate when default-bearing.
		if n.hasDefault || n.hasLiteral {
			out += ".Required()"
		}
	}
	if n.skippable {
		out += ".Skip()"
	}
	if n.silent {
		out += ".Ignore()"
	}
	if n.empty {
		out += ".Empty()"
	}
	for _, b := range n.befores {
		if b.stringify != nil {
			out += "." + b.stringify()
		}
	}
	for _, a := range n.afters {
		if a.stringify != nil {
			out += "." + a.stringify()
		}
	}
	return out
}

func isStructuralKind(k Kind) bool {
	switch k {
	case KindObject, KindArray, KindList:
		return true
	}
	return false
}

func quoteOrType(n *node, fallback string) string {
	if n.hasLiteral {
		if s, ok := n.literal.(string); ok {
			return fmt.Sprintf("%q", s)
		}
	}
	return fallback
}

func literalOrType(n *node, fallback string) string {
	if n.hasLiteral {
		return fmt.Sprintf("%v", n.literal)
	}
	return fallback
}

// nodeSpec produces a JSON-friendly description of the node tree.
func nodeSpec(n *node) any {
	if n == nil {
		return nil
	}
	out := map[string]any{
		"kind": string(n.kind),
	}
	if n.required {
		out["required"] = true
	}
	if n.open {
		out["open"] = true
	}
	if n.skippable {
		out["skip"] = true
	}
	if n.silent {
		out["ignore"] = true
	}
	if n.empty {
		out["empty"] = true
	}
	if n.hasDefault {
		out["default"] = n.defaultValue
	}
	if n.faultMsg != "" {
		out["fault"] = n.faultMsg
	}
	if len(n.objChildren) > 0 {
		props := map[string]any{}
		for k, cn := range n.objChildren {
			props[k] = nodeSpec(cn)
		}
		out["properties"] = props
	}
	if n.objRest != nil {
		out["rest"] = nodeSpec(n.objRest)
	}
	if len(n.arrChildren) > 0 {
		items := make([]any, len(n.arrChildren))
		for i, cn := range n.arrChildren {
			items[i] = nodeSpec(cn)
		}
		out["items"] = items
	}
	if n.arrChild != nil {
		out["element"] = nodeSpec(n.arrChild)
	}
	if n.arrRest != nil {
		out["arrayRest"] = nodeSpec(n.arrRest)
	}
	if n.listMode != listNone {
		out["listMode"] = []string{"none", "one", "some", "all"}[n.listMode]
		branches := make([]any, len(n.list))
		for i, sn := range n.list {
			branches[i] = nodeSpec(sn)
		}
		out["branches"] = branches
	}
	if n.hasExact {
		out["exact"] = n.exactVals
	}
	return out
}

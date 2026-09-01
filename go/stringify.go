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
		return suffix(typeOrValue(n, "String", inline), n)
	case KindNumber:
		return suffix(typeOrValue(n, "Number", inline), n)
	case KindBoolean:
		return suffix(typeOrValue(n, "Boolean", inline), n)
	case KindNull:
		return "null"
	case KindNaN:
		return "NaN"
	case KindAny:
		base := "Any"
		if n.hasDefault {
			base = fmt.Sprintf("Any(%v)", n.defaultValue)
		}
		out := suffix(base, n)
		// A node with no asserted type exists only to carry its builders, and
		// renders as that chain alone — TS shows "Min(2)", not "Any.Min(2)".
		if !n.hasDefault && strings.HasPrefix(out, "Any.") {
			return out[len("Any."):]
		}
		return out
	case KindNever:
		return suffix("Never", n)
	case KindRegexp:
		if n.regexpVal != nil {
			return suffix("/"+n.regexpVal.String()+"/", n)
		}
		return suffix("Regexp", n)
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
	// TS node2json renders a required scalar as just its type name ("Number"),
	// never ".Required()", so no required annotation is emitted here.
	// Skip / Ignore / Empty are not annotated: they change whether a value is
	// demanded, not what shape it has, and TS leaves them out of the rendering.
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

// typeOrValue renders a typed node the way TS does: a required node shows its
// type name ("Number"), an unrequired one shows the value it would produce
// ("0"), because that value is what the schema actually stands for there.
//
// inline mirrors TS stringify's dequote flag. Inside a composite message a
// string value is written bare, so One("a",Number) reads "a, Number"; on its
// own it keeps its quotes, so a string value stays distinguishable from a type
// name and the empty string stays visible.
func typeOrValue(n *node, typeName string, inline bool) string {
	if n.required || !n.hasDefault {
		return typeName
	}
	if sv, ok := n.defaultValue.(string); ok && !inline {
		return fmt.Sprintf("%q", sv)
	}
	return fmt.Sprintf("%v", n.defaultValue)
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

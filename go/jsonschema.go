package shape

import (
	"sort"
	"strings"
)

// JSON Schema export (draft 2020-12): the values a node accepts. Every kind,
// bound, format, literal set, composition, reference and default has a
// rendering; a check that is a function, and the builders that only change
// what comes out (Coerce, Catch, Transform, Rename, Key), have none. The
// canonical TypeScript renders the same schema for the same shape, and the
// differential harness compares the two.

const jsonSchemaDraft = "https://json-schema.org/draft/2020-12/schema"

// JSONSchema renders the schema as a JSON Schema document.
func (s *Schema) JSONSchema() map[string]any {
	if s == nil || s.root == nil {
		return map[string]any{"$schema": jsonSchemaDraft}
	}
	return rootSchema(s.root)
}

// JSONSchema renders a built node as a JSON Schema document.
func (n *Node) JSONSchema() map[string]any {
	return rootSchema(n.n)
}

func rootSchema(n *node) map[string]any {
	defs := map[string]any{}
	body := nodeSchema(n, defs)
	out := map[string]any{"$schema": jsonSchemaDraft}
	for k, v := range body {
		out[k] = v
	}
	if len(defs) > 0 {
		out["$defs"] = defs
	}
	return out
}

var jsonSchemaType = map[Kind]string{
	KindString:  "string",
	KindNumber:  "number",
	KindNaN:     "number",
	KindInteger: "integer",
	KindBoolean: "boolean",
	KindNull:    "null",
	KindObject:  "object",
	KindArray:   "array",
	KindDate:    "string",
	KindRegexp:  "string",
}

var jsonSchemaFormat = map[string]string{
	"Email":    "email",
	"Url":      "uri",
	"Uuid":     "uuid",
	"DateTime": "date-time",
	"Ipv4":     "ipv4",
	"Ipv6":     "ipv6",
}

func nodeSchema(n *node, defs map[string]any) map[string]any {
	s := map[string]any{}

	// A reference stands for the named shape, which is rendered where it is
	// defined.
	if n.referName != "" {
		s["$ref"] = "#/$defs/" + n.referName
		return describeSchema(n, s)
	}

	if t, ok := jsonSchemaType[n.kind]; ok {
		s["type"] = t
	}

	switch n.kind {
	case KindString:
		if !n.empty {
			s["minLength"] = 1
		}
	case KindDate:
		s["format"] = "date-time"
	case KindRegexp:
		s["pattern"] = n.regexpVal.String()
	case KindNever:
		s["not"] = map[string]any{}
	case KindObject:
		objectSchema(n, s, defs)
	case KindArray:
		arraySchema(n, s, defs)
	case KindList:
		listSchema(n, s, defs)
	}

	checkSchema(n, s)

	if n.nullable {
		if t, ok := s["type"]; ok {
			s["type"] = []any{t, "null"}
		}
	}

	// A nil default is the zero of a kind that has none (Any, Date): TS has
	// no default there at all. Only the null kind's null is a default.
	if !n.required && !n.skippable && n.hasDefault && !isFunction(n.defaultValue) && !isNaN(n.defaultValue) &&
		(n.defaultValue != nil || n.kind == KindNull) {
		s["default"] = n.defaultValue
	}

	describeSchema(n, s)

	if n.defineName != "" {
		defs[n.defineName] = s
	}

	return s
}

func describeSchema(n *node, s map[string]any) map[string]any {
	if d, ok := n.meta["description"].(string); ok {
		s["description"] = d
	}
	return s
}

func objectSchema(n *node, s map[string]any, defs map[string]any) {
	props := map[string]any{}
	required := []string{}
	for _, k := range n.objKeys {
		cn := n.objChildren[k]
		props[k] = nodeSchema(cn, defs)
		if cn.required {
			required = append(required, k)
		}
	}
	if len(props) > 0 {
		s["properties"] = props
	}
	if len(required) > 0 {
		sort.Strings(required)
		s["required"] = required
	}
	if !n.open || n.objRest == nil {
		s["additionalProperties"] = false
	} else if !isAnySchema(n.objRest) {
		s["additionalProperties"] = nodeSchema(n.objRest, defs)
	}
}

// isAnySchema reports a child shape of Any, which says nothing, unless it
// stands for a reference.
func isAnySchema(child *node) bool {
	return child.kind == KindAny && child.referName == ""
}

func arraySchema(n *node, s map[string]any, defs map[string]any) {
	// A tail past the tuple, or every element: TS keeps one child slot for
	// both, so Rest replaces the repeating shape here as it does there.
	child := n.arrChild
	if n.arrRest != nil {
		child = n.arrRest
	}
	// An element shape of Any says nothing, as an Any rest shape does not for
	// an object; nothing may follow a closed tuple.
	closed := child == nil
	if child != nil && isAnySchema(child) {
		child = nil
	}
	if len(n.arrChildren) > 0 {
		fixed := make([]any, len(n.arrChildren))
		for i, cn := range n.arrChildren {
			fixed[i] = nodeSchema(cn, defs)
		}
		s["prefixItems"] = fixed
		if closed {
			s["items"] = false
		} else if child != nil {
			s["items"] = nodeSchema(child, defs)
		}
	} else if child != nil {
		s["items"] = nodeSchema(child, defs)
	}
}

func listSchema(n *node, s map[string]any, defs map[string]any) {
	branches := make([]any, len(n.list))
	for i, bn := range n.list {
		branches[i] = nodeSchema(bn, defs)
	}
	if n.disc != nil {
		for i, b := range branches {
			bs := b.(map[string]any)
			// Every branch carries the tag as a key (see discriminated.go),
			// so it always has properties.
			props := bs["properties"].(map[string]any)
			props[n.disc.tag] = map[string]any{"type": "string", "const": n.disc.tags[i]}
			bs["properties"] = props
			required := []string{n.disc.tag}
			if have, ok := bs["required"].([]string); ok {
				for _, k := range have {
					if k != n.disc.tag {
						required = append(required, k)
					}
				}
			}
			sort.Strings(required)
			bs["required"] = required
		}
		s["oneOf"] = branches
		return
	}
	if n.listMode == listAll {
		s["allOf"] = branches
	} else {
		s["anyOf"] = branches
	}
}

// The bounds a size builder puts on a value: the number family for a number,
// a length family for a string, array or object, and every family for a
// node that has not said.
var sizeFamilies = map[Kind][]string{
	KindNumber:  {"minimum"},
	KindNaN:     {"minimum"},
	KindInteger: {"minimum"},
	KindString:  {"minLength"},
	KindArray:   {"minItems"},
	KindObject:  {"minProperties"},
}

var sizeMax = map[string]string{
	"minimum":       "maximum",
	"minLength":     "maxLength",
	"minItems":      "maxItems",
	"minProperties": "maxProperties",
}

func checkSchema(n *node, s map[string]any) {
	families, ok := sizeFamilies[n.kind]
	if !ok {
		families = []string{"minimum", "minLength", "minItems", "minProperties"}
	}

	vs := append(append([]validator{}, n.befores...), n.afters...)
	for i := 0; i < len(vs); i++ {
		v := vs[i]

		// Catch and Transform take the node's checks inside.
		if v.inner != nil {
			vs = append(vs, v.inner.befores...)
			vs = append(vs, v.inner.afters...)
			continue
		}

		switch v.name {
		case "Exact":
			s["enum"] = append([]any{}, v.args...)
		case "Email", "Url", "Uuid", "DateTime", "Ipv4", "Ipv6":
			s["format"] = jsonSchemaFormat[v.name]
		case "Ip":
			s["anyOf"] = []any{map[string]any{"format": "ipv4"}, map[string]any{"format": "ipv6"}}
		case "Min", "Max", "Above", "Below", "Len":
			size := toFloat(v.args[0])
			for _, lo := range families {
				hi := sizeMax[lo]
				numeric := lo == "minimum"
				switch v.name {
				case "Min":
					s[lo] = size
				case "Max":
					s[hi] = size
				case "Above":
					if numeric {
						s["exclusiveMinimum"] = size
					} else {
						s[lo] = size + 1
					}
				case "Below":
					if numeric {
						s["exclusiveMaximum"] = size
					} else {
						s[hi] = size - 1
					}
				default:
					s[lo] = size
					s[hi] = size
				}
			}
		default:
			if strings.HasPrefix(v.name, "/") && strings.HasSuffix(v.name, "/") && len(v.name) >= 2 {
				s["pattern"] = v.name[1 : len(v.name)-1]
			}
		}
	}
}

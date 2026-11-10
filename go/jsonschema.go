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
		s["pattern"] = n.regexpSrc
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

	// Nullable adds null to the types, to the list where there is one.
	if n.nullable {
		if t, ok := s["type"]; ok {
			types, isList := t.([]any)
			if !isList {
				types = []any{t}
			}
			s["type"] = append(append([]any{}, types...), "null")
		}
	}

	// A tuple position the shape requires must be there, and so must every
	// one before it.
	if n.kind == KindArray {
		need := 0
		for i, cn := range n.arrChildren {
			if cn.required {
				need = i + 1
			}
		}
		if have, _ := toFloat64(s["minItems"]); float64(need) > have {
			s["minItems"] = need
		}
	}

	// A nil default is the zero of a kind that has none (Any, Date): TS has
	// no default there at all. Only the null kind's null is a default.
	if !n.required && !n.skippable && hasDefaultValue(n) && !isFunction(n.defaultValue) && !isNaN(n.defaultValue) {
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
			// An object branch carries the tag as a key (see discriminated.go);
			// any other branch gets the tag as its only property, as in TS.
			props, _ := bs["properties"].(map[string]any)
			if props == nil {
				props = map[string]any{}
			}
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
	if n.listMode == listNof {
		if !kindsSchema(n.nofKinds, branches, s) {
			nofSchema(n.nofOK, branches, s)
		}
	} else {
		s["allOf"] = branches
	}
}

// The JSON kinds, every one of which a schema with no type lets through.
var jsonKinds = []string{"null", "boolean", "number", "string", "object", "array"}

// The keywords that apply to one kind of value only.
var jsonSchemaKindKeywords = map[string][]string{
	"number": {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"},
	"string": {"minLength", "maxLength", "pattern", "format"},
	"object": {"properties", "required", "additionalProperties", "minProperties", "maxProperties"},
	"array":  {"items", "prefixItems", "minItems", "maxItems"},
}

// The kind of value a schema's type names, as TS's KIND_OF_TYPE reads it (a
// regexp reads as a string there too).
var jsonSchemaTypeKind = map[string]string{
	"null": "null", "boolean": "boolean", "number": "number", "integer": "number",
	"string": "string", "regexp": "string", "object": "object", "array": "array",
}

// kindsSchema writes exactly one of a shape for every JSON kind as a schema
// with no type: the keywords of each kind side by side. A shape that says
// more than its kind's keywords can say is counted, as oneOf, so kindsSchema
// reports whether it wrote the schema.
func kindsSchema(kinds []string, branches []any, s map[string]any) bool {
	for _, k := range jsonKinds {
		if !contains(kinds, k) {
			return false
		}
	}
	for _, b := range branches {
		bs := b.(map[string]any)
		t, _ := bs["type"].(string)
		for k := range bs {
			if k != "type" && !contains(jsonSchemaKindKeywords[jsonSchemaTypeKind[t]], k) {
				return false
			}
		}
	}
	for _, b := range branches {
		for k, v := range b.(map[string]any) {
			if k != "type" {
				s[k] = v
			}
		}
	}
	return true
}

// nofSchema writes a count of the shapes as the keywords that count: none
// of them is not, exactly one oneOf, every one allOf. JSON Schema has no
// keyword for any other count, so it is bounded by what it rules out: anyOf
// when the count is never none, not allOf when it is never every one. That
// bound is exact for at least one, not every one, and both together.
func nofSchema(ok []bool, branches []any, s map[string]any) {
	n := len(branches)
	only := func(c int) bool {
		for i, v := range ok {
			if v != (i == c) {
				return false
			}
		}
		return true
	}
	admits := 0
	for _, v := range ok {
		if v {
			admits++
		}
	}
	switch {
	case admits == len(ok):
	case admits == 0:
		s["not"] = map[string]any{}
	case only(0):
		if n == 1 {
			s["not"] = branches[0]
		} else {
			s["not"] = map[string]any{"anyOf": branches}
		}
	case only(1):
		s["oneOf"] = branches
	case only(n):
		s["allOf"] = branches
	default:
		if !ok[0] {
			s["anyOf"] = branches
		}
		if !ok[n] {
			s["not"] = map[string]any{"allOf": branches}
		}
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

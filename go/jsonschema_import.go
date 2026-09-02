package shape

import (
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strings"
)

// JSON Schema import (draft 2020-12, and the common keywords of earlier
// drafts), the inverse of the export in jsonschema.go: a type becomes a
// token, bounds become size builders, formats and patterns their builders,
// enum and const become Exact, properties and items become objects and
// arrays, the compositions become One, All and Discriminated, and a
// definition is inlined where it is referenced — Define and Refer only where
// a definition refers to itself. A property that is not required and has no
// default is Skip. Unknown keywords are ignored; an unknown type or reference
// is an error. The canonical TypeScript builds the same spec, and the
// differential harness compares the export of what each imports.

// FromJSONSchema builds a spec from a JSON Schema document, as decoded by
// encoding/json (map[string]any, []any, float64, bool, string, nil). Compile
// it with Shape, or compose it further with the builders.
func FromJSONSchema(schema any) (any, error) {
	m, ok := schema.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("JSON Schema: the schema must be an object")
	}
	defs, _ := m["$defs"].(map[string]any)
	if defs == nil {
		defs, _ = m["definitions"].(map[string]any)
	}
	ctx := &jsonSchemaImport{root: m, defs: defs, recursive: map[string]bool{}}
	return ctx.schema(m, "")
}

// MustFromJSONSchema is FromJSONSchema, panicking on error.
func MustFromJSONSchema(schema any) any {
	spec, err := FromJSONSchema(schema)
	if err != nil {
		panic(err)
	}
	return spec
}

type jsonSchemaImport struct {
	root      map[string]any
	defs      map[string]any
	stack     []string
	recursive map[string]bool
}

func jsonSchemaFault(msg, path string) error {
	if path == "" {
		path = "/"
	}
	return fmt.Errorf("JSON Schema: %s at %s", msg, path)
}

var jsonSchemaKinds = map[string]bool{
	"string": true, "number": true, "integer": true, "boolean": true, "null": true, "object": true, "array": true,
}

func (c *jsonSchemaImport) schema(s any, path string) (any, error) {
	if b, ok := s.(bool); ok {
		if b {
			return Any, nil
		}
		return Never(), nil
	}
	m, ok := s.(map[string]any)
	if !ok {
		return nil, jsonSchemaFault("a schema must be an object or boolean", path)
	}

	var spec any
	var err error
	if ref, ok := m["$ref"].(string); ok {
		spec, err = c.ref(ref, path)
	} else {
		spec, err = c.keywords(m, path)
	}
	if err != nil {
		return nil, err
	}

	if d, ok := m["description"].(string); ok {
		spec = Describe(d, spec)
	}
	return spec, nil
}

var jsonSchemaRefRE = regexp.MustCompile(`^#/(\$defs|definitions)/([^/]+)$`)

// A definition is inlined at each reference, so validation order cannot
// matter; a definition that refers to itself is Defined at its outermost
// expansion and Referred within.
func (c *jsonSchemaImport) ref(ref, path string) (any, error) {
	var name string
	var def any
	if m := jsonSchemaRefRE.FindStringSubmatch(ref); m != nil {
		name, _ = url.PathUnescape(m[2])
		var ok bool
		def, ok = c.defs[name]
		if !ok {
			return nil, jsonSchemaFault(fmt.Sprintf("unknown $ref %q", ref), path)
		}
	} else if ref == "#" {
		name = ""
		def = c.root
	} else {
		return nil, jsonSchemaFault(fmt.Sprintf("unsupported $ref %q", ref), path)
	}

	refname := name
	if refname == "" {
		refname = "$root"
	}
	for _, n := range c.stack {
		if n == name {
			c.recursive[name] = true
			return Refer(refname), nil
		}
	}

	c.stack = append(c.stack, name)
	wasRecursive := c.recursive[name]
	c.recursive[name] = false
	spec, err := c.schema(def, path)
	recursive := c.recursive[name]
	c.recursive[name] = wasRecursive
	c.stack = c.stack[:len(c.stack)-1]
	if err != nil {
		return nil, err
	}

	if recursive {
		return Define(refname, spec), nil
	}
	return spec, nil
}

func (c *jsonSchemaImport) keywords(m map[string]any, path string) (any, error) {
	var spec any
	var err error

	if e, ok := m["enum"]; ok {
		vals, ok := e.([]any)
		if !ok || len(vals) == 0 {
			return nil, jsonSchemaFault("enum must be a non-empty array", path)
		}
		spec = Exact(vals...)
	} else if v, ok := m["const"]; ok {
		spec = Exact(v)
	} else if all, ok := m["allOf"]; ok {
		branches, err := c.branches(all, path+"/allOf")
		if err != nil {
			return nil, err
		}
		spec = All(branches...)
	} else if one, ok := m["oneOf"]; ok {
		list, err := branchList(one, path+"/oneOf")
		if err != nil {
			return nil, err
		}
		spec, err = c.discriminated(list, path+"/oneOf")
		if err != nil {
			return nil, err
		}
		if spec == nil {
			branches, err := c.branches(list, path+"/oneOf")
			if err != nil {
				return nil, err
			}
			spec = One(branches...)
		}
	} else if anyOf, ok := m["anyOf"]; ok && !isIpFormats(anyOf) {
		branches, err := c.branches(anyOf, path+"/anyOf")
		if err != nil {
			return nil, err
		}
		spec = One(branches...)
	} else if not, ok := m["not"]; ok && isEmptyObject(not) {
		spec = Never()
	} else {
		spec, err = c.typed(m, path)
		if err != nil {
			return nil, err
		}
	}

	if d, ok := m["default"]; ok {
		spec = Default(d, spec)
	}
	return spec, nil
}

func branchList(v any, path string) ([]any, error) {
	list, ok := v.([]any)
	if !ok {
		return nil, jsonSchemaFault(path[strings.LastIndex(path, "/")+1:]+" must be an array", path)
	}
	return list, nil
}

func (c *jsonSchemaImport) branches(v any, path string) ([]any, error) {
	list, err := branchList(v, path)
	if err != nil {
		return nil, err
	}
	out := make([]any, len(list))
	for i, b := range list {
		spec, err := c.schema(b, fmt.Sprintf("%s/%d", path, i))
		if err != nil {
			return nil, err
		}
		out[i] = spec
	}
	return out, nil
}

func isEmptyObject(v any) bool {
	m, ok := v.(map[string]any)
	return ok && len(m) == 0
}

// The export's rendering of Ip: an anyOf of the two address formats.
func isIpFormats(v any) bool {
	anyOf, ok := v.([]any)
	if !ok || len(anyOf) != 2 {
		return false
	}
	for _, b := range anyOf {
		if m, ok := b.(map[string]any); !ok || len(m) != 1 {
			return false
		}
	}
	return anyOf[0].(map[string]any)["format"] == "ipv4" && anyOf[1].(map[string]any)["format"] == "ipv6"
}

func (c *jsonSchemaImport) typed(m map[string]any, path string) (any, error) {
	var types []any
	switch t := m["type"].(type) {
	case []any:
		types = t
	case nil:
	default:
		types = []any{t}
	}

	nullable := false
	if len(types) > 1 {
		for _, t := range types {
			if t == "null" {
				nullable = true
			}
		}
	}
	if nullable {
		kept := []any{}
		for _, t := range types {
			if t != "null" {
				kept = append(kept, t)
			}
		}
		types = kept
	}

	for _, t := range types {
		if name, ok := t.(string); !ok || !jsonSchemaKinds[name] {
			return nil, jsonSchemaFault(fmt.Sprintf("unknown type %q", fmt.Sprint(t)), path)
		}
	}

	if len(types) == 0 {
		// No type: the shape the keywords imply, or anything.
		_, hasProps := m["properties"]
		_, hasAdditional := m["additionalProperties"]
		_, hasRequired := m["required"]
		_, hasItems := m["items"]
		_, hasPrefix := m["prefixItems"]
		if hasProps || hasAdditional || hasRequired {
			types = []any{"object"}
		} else if hasItems || hasPrefix {
			types = []any{"array"}
		} else {
			return c.untyped(m, path)
		}
	}

	var spec any
	if len(types) == 1 {
		var err error
		spec, err = c.kind(types[0].(string), m, path)
		if err != nil {
			return nil, err
		}
	} else {
		kinds := make([]any, len(types))
		for i, t := range types {
			k, err := c.kind(t.(string), m, path)
			if err != nil {
				return nil, err
			}
			kinds[i] = k
		}
		spec = One(kinds...)
	}

	if nullable {
		spec = Nullable(spec)
	}
	return spec, nil
}

func (c *jsonSchemaImport) kind(t string, m map[string]any, path string) (any, error) {
	switch t {
	case "string":
		return importString(m, path)
	case "number":
		return importNumber(Number, m), nil
	case "integer":
		return importNumber(Integer, m), nil
	case "boolean":
		return Boolean, nil
	case "null":
		return Required(nil), nil
	case "object":
		return c.object(m, path)
	}
	return c.array(m, path)
}

var jsonSchemaFormatBuilder = map[string]func(spec ...any) *Node{
	"email":     Email,
	"uri":       Url,
	"uuid":      Uuid,
	"date-time": DateTime,
	"ipv4":      Ipv4,
	"ipv6":      Ipv6,
}

// Keywords without a type: a pattern or format reads as a string, a bound
// applies to whatever kind the value turns out to be (as a bare Min does),
// and anything else says nothing.
func (c *jsonSchemaImport) untyped(m map[string]any, path string) (any, error) {
	_, hasPattern := m["pattern"].(string)
	format, _ := m["format"].(string)
	if hasPattern || jsonSchemaFormatBuilder[format] != nil || isIpFormats(m["anyOf"]) {
		return importString(m, path)
	}
	// Beside a numeric exclusive bound the length keywords are that bound
	// written for strings, arrays and objects (Above(1) exports minLength 2),
	// so only a plain minimum or maximum is a second bound there.
	view := map[string]any{}
	if _, exclusive := m["exclusiveMinimum"].(float64); exclusive {
		if v, ok := m["minimum"].(float64); ok {
			view["minimum"] = v
		}
	} else if v, ok := firstNumber(m, "minimum", "minLength", "minItems", "minProperties"); ok {
		view["minimum"] = v
	}
	if _, exclusive := m["exclusiveMaximum"].(float64); exclusive {
		if v, ok := m["maximum"].(float64); ok {
			view["maximum"] = v
		}
	} else if v, ok := firstNumber(m, "maximum", "maxLength", "maxItems", "maxProperties"); ok {
		view["maximum"] = v
	}
	view["exclusiveMinimum"] = m["exclusiveMinimum"]
	view["exclusiveMaximum"] = m["exclusiveMaximum"]
	// A bare bound (Min(1)) rather than one on an Any node, as a user writes.
	spec := importNumber(nil, view)
	if spec == nil {
		return Any, nil
	}
	return spec, nil
}

func firstNumber(m map[string]any, keys ...string) (float64, bool) {
	for _, k := range keys {
		if v, ok := m[k].(float64); ok {
			return v, true
		}
	}
	return 0, false
}

func importString(m map[string]any, path string) (any, error) {
	var spec any = String
	plain := true
	if p, ok := m["pattern"].(string); ok {
		n, err := regexpNode(p)
		if err != nil {
			return nil, jsonSchemaFault(fmt.Sprintf("bad pattern %q", p), path)
		}
		spec = newNodeWrap(n)
		plain = false
	}

	minLength, hasMin := m["minLength"].(float64)
	format, _ := m["format"].(string)
	if builder, ok := jsonSchemaFormatBuilder[format]; ok {
		spec = builder(spec)
	} else if isIpFormats(m["anyOf"]) {
		spec = Ip(spec)
	} else if plain && !(hasMin && minLength > 0) {
		// A string with no lower bound is allowed to be empty; a pattern or
		// format decides for itself.
		spec = Empty(spec)
	}

	if hasMin && minLength > 1 {
		spec = Min(minLength, spec)
	}
	if maxLength, ok := m["maxLength"].(float64); ok {
		spec = Max(maxLength, spec)
	}
	return spec, nil
}

func importNumber(spec any, m map[string]any) any {
	// A numeric exclusive bound and a plain bound are independent keywords,
	// so both apply; the boolean form makes the plain bound exclusive.
	if v, ok := m["exclusiveMinimum"].(float64); ok {
		spec = Above(v, spec)
	}
	if v, ok := m["minimum"].(float64); ok {
		if b, _ := m["exclusiveMinimum"].(bool); b {
			spec = Above(v, spec)
		} else {
			spec = Min(v, spec)
		}
	}
	if v, ok := m["exclusiveMaximum"].(float64); ok {
		spec = Below(v, spec)
	}
	if v, ok := m["maximum"].(float64); ok {
		if b, _ := m["exclusiveMaximum"].(bool); b {
			spec = Below(v, spec)
		} else {
			spec = Max(v, spec)
		}
	}
	return spec
}

func (c *jsonSchemaImport) object(m map[string]any, path string) (any, error) {
	props, ok := m["properties"].(map[string]any)
	if _, has := m["properties"]; has && !ok {
		return nil, jsonSchemaFault("properties must be an object", path+"/properties")
	}
	required := map[string]bool{}
	if list, ok := m["required"].([]any); ok {
		for _, r := range list {
			if name, ok := r.(string); ok {
				required[name] = true
			}
		}
	}

	obj := map[string]any{}
	names := make([]string, 0, len(props))
	for k := range props {
		names = append(names, k)
	}
	sort.Strings(names)
	for _, k := range names {
		spec, err := c.property(props[k], required[k], path+"/properties/"+k)
		if err != nil {
			return nil, err
		}
		obj[k] = spec
	}
	// A required name with no property schema must still be present.
	for k := range required {
		if _, has := obj[k]; !has {
			obj[k] = Required()
		}
	}

	var spec any
	ap, has := m["additionalProperties"]
	if ap == false {
		if len(obj) == 0 {
			spec = Closed(obj)
		} else {
			spec = obj
		}
	} else if !has || ap == true {
		spec = Open(obj)
	} else {
		child, err := c.schema(ap, path+"/additionalProperties")
		if err != nil {
			return nil, err
		}
		spec = Child(child, obj)
	}

	if v, ok := m["minProperties"].(float64); ok {
		spec = Min(v, spec)
	}
	if v, ok := m["maxProperties"].(float64); ok {
		spec = Max(v, spec)
	}
	return spec, nil
}

// A property is required when listed, has its default when given, and is
// otherwise Skip: absent stays absent.
func (c *jsonSchemaImport) property(ps any, required bool, path string) (any, error) {
	spec, err := c.schema(ps, path)
	if err != nil {
		return nil, err
	}
	if m, ok := ps.(map[string]any); ok {
		if _, has := m["default"]; has {
			return spec, nil
		}
	}
	if required {
		return Required(spec), nil
	}
	return Skip(spec), nil
}

func (c *jsonSchemaImport) array(m map[string]any, path string) (any, error) {
	var spec any
	items, hasItems := m["items"]
	if prefix, has := m["prefixItems"]; has {
		list, ok := prefix.([]any)
		if !ok {
			return nil, jsonSchemaFault("prefixItems must be an array", path+"/prefixItems")
		}
		elems, err := c.branches(list, path+"/prefixItems")
		if err != nil {
			return nil, err
		}
		// Closed makes a one-element list a tuple rather than an element
		// shape; items says what may follow (anything, when it is absent
		// or true).
		tuple := Closed(elems)
		if items == false {
			spec = tuple
		} else if !hasItems || items == true {
			spec = Rest(Any, tuple)
		} else {
			rest, err := c.schema(items, path+"/items")
			if err != nil {
				return nil, err
			}
			spec = Rest(rest, tuple)
		}
	} else if !hasItems || items == true {
		spec = []any{}
	} else {
		elem, err := c.schema(items, path+"/items")
		if err != nil {
			return nil, err
		}
		spec = []any{elem}
	}

	if v, ok := m["minItems"].(float64); ok {
		spec = Min(v, spec)
	}
	if v, ok := m["maxItems"].(float64); ok {
		spec = Max(v, spec)
	}
	return spec, nil
}

// A oneOf of objects that each require one property with a distinct string
// const is a discriminated union on that property.
func (c *jsonSchemaImport) discriminated(branches []any, path string) (any, error) {
	if len(branches) == 0 {
		return nil, nil
	}
	objs := make([]map[string]any, len(branches))
	props := make([]map[string]any, len(branches))
	reqs := make([]map[string]bool, len(branches))
	for i, b := range branches {
		m, ok := b.(map[string]any)
		if !ok {
			return nil, nil
		}
		p, ok := m["properties"].(map[string]any)
		if !ok {
			return nil, nil
		}
		r, ok := m["required"].([]any)
		if !ok {
			return nil, nil
		}
		objs[i], props[i], reqs[i] = m, p, map[string]bool{}
		for _, k := range r {
			if name, ok := k.(string); ok {
				reqs[i][name] = true
			}
		}
	}

	constOf := func(p map[string]any, k string) (string, bool) {
		pm, ok := p[k].(map[string]any)
		if !ok {
			return "", false
		}
		s, ok := pm["const"].(string)
		return s, ok
	}

	// The tag is the first property (in key order) of the first branch that
	// every branch declares with a string const and the first requires.
	tag := ""
	firstKeys := make([]string, 0, len(props[0]))
	for k := range props[0] {
		firstKeys = append(firstKeys, k)
	}
	sort.Strings(firstKeys)
	for _, k := range firstKeys {
		if _, ok := constOf(props[0], k); !ok || !reqs[0][k] {
			continue
		}
		all := true
		for _, p := range props {
			if _, ok := constOf(p, k); !ok {
				all = false
				break
			}
		}
		if all {
			tag = k
			break
		}
	}
	if tag == "" {
		return nil, nil
	}

	tags := make([]string, len(branches))
	seen := map[string]bool{}
	for i, p := range props {
		t, _ := constOf(p, tag)
		if seen[t] || !reqs[i][tag] {
			return nil, nil
		}
		seen[t] = true
		tags[i] = t
	}

	out := map[string]any{}
	for i, m := range objs {
		rest := map[string]any{}
		for k, v := range props[i] {
			if k != tag {
				rest[k] = v
			}
		}
		required := []any{}
		for _, k := range objs[i]["required"].([]any) {
			if k != tag {
				required = append(required, k)
			}
		}
		branch := map[string]any{}
		for k, v := range m {
			branch[k] = v
		}
		branch["properties"] = rest
		branch["required"] = required
		spec, err := c.object(branch, fmt.Sprintf("%s/%d", path, i))
		if err != nil {
			return nil, err
		}
		out[tags[i]] = spec
	}
	return Discriminated(tag, out), nil
}

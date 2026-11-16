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
// arrays, contains and uniqueItems Contains and Unique, the compositions
// become All, Nof and Discriminated (anyOf a count of at least one, oneOf
// of exactly one, not of none), if and the dependent keywords become When,
// and a definition is inlined where it is referenced — Define and Refer
// only where a definition refers to itself. Every keyword of a schema
// applies, each a part of All; an enum or a const keeps the values the
// other parts allow. A schema with no type checks each kind of value with
// that kind's keywords only, and a subschema of not, allOf, anyOf or oneOf
// is read for the one kind its parent's type lets through. A property that
// is not required and has no default is Skip. Unknown keywords are ignored
// (unless the import is strict); an unknown type or reference is an error.
// The canonical TypeScript builds the same spec, and the differential
// harness compares the export of what each imports.

// JSONSchemaImportOptions controls FromJSONSchemaWith.
type JSONSchemaImportOptions struct {
	// Strict refuses a keyword the import recognises but does not enforce
	// (multipleOf, patternProperties, ...), which it otherwise passes over
	// as it does a keyword it does not know.
	Strict bool
}

// FromJSONSchema builds a spec from a JSON Schema document, as decoded by
// encoding/json (map[string]any, []any, float64, bool, string, nil): an
// object, or a boolean (true accepts anything, false nothing). Compile it
// with Shape, or compose it further with the builders.
func FromJSONSchema(schema any) (any, error) {
	return FromJSONSchemaWith(schema, JSONSchemaImportOptions{})
}

// FromJSONSchemaWith is FromJSONSchema with options.
func FromJSONSchemaWith(schema any, opts JSONSchemaImportOptions) (any, error) {
	m, isObject := schema.(map[string]any)
	if _, isBool := schema.(bool); !isObject && !isBool {
		return nil, fmt.Errorf("JSON Schema: the schema must be an object or boolean")
	}
	defs, _ := m["$defs"].(map[string]any)
	if defs == nil {
		defs, _ = m["definitions"].(map[string]any)
	}
	draft, _ := m["$schema"].(string)
	ctx := &jsonSchemaImport{root: m, defs: defs, recursive: map[string]bool{},
		refAlone: jsonSchemaRefAlone.MatchString(draft), strict: opts.Strict}
	return ctx.schema(schema, "", "")
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
	// backrefs counts the references made back to a definition still being
	// read: a part that holds one cannot be tried yet (see exact).
	backrefs int
	// refAlone is set for a document of draft 7 or earlier, where a $ref
	// stands for the whole schema it sits in, so the keywords beside it are
	// ignored. From 2019-09 on, a $ref is one keyword among the others.
	refAlone bool
	strict   bool
}

// The drafts in which a $ref stands alone.
var jsonSchemaRefAlone = regexp.MustCompile(`^https?://json-schema\.org/draft-0[3-7]/schema#?$`)

// Keywords the import recognises but does not enforce. It passes over them,
// as it does a keyword it does not know, unless it is strict.
var jsonSchemaUnsupported = []string{
	"$dynamicRef", "$recursiveRef", "multipleOf", "patternProperties", "propertyNames",
	"unevaluatedItems", "unevaluatedProperties",
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

// schema imports one schema. A kind, where given, is the one kind of value
// the enclosing schema lets through to this one (see kindSplit).
func (c *jsonSchemaImport) schema(s any, path, kind string) (any, error) {
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
	if ref, isRef := m["$ref"].(string); isRef && c.refAlone {
		spec, err = c.ref(ref, path)
	} else {
		spec, err = c.keywords(m, path, kind)
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
			c.backrefs++
			return Refer(refname), nil
		}
	}

	c.stack = append(c.stack, name)
	wasRecursive := c.recursive[name]
	c.recursive[name] = false
	spec, err := c.schema(def, path, "")
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

// keywords imports a schema's keywords, every one of which applies, each a
// part of All. Not comes first, so that it sees the value as given. An enum
// or a const keeps only the values the other parts allow, and so stays one
// Exact, with Exact's message.
func (c *jsonSchemaImport) keywords(m map[string]any, path, kind string) (any, error) {
	if c.strict {
		for _, k := range jsonSchemaUnsupported {
			if _, has := m[k]; has {
				return nil, jsonSchemaFault("unsupported keyword \""+k+"\"", path)
			}
		}
	}

	var spec any
	if isEmptyObject(m["not"]) {
		// not: {} admits nothing, whatever else the schema says.
		spec = Never()
	} else {
		// The subschemas of not, allOf, anyOf and oneOf see the same value,
		// so they need only meet the one kind this schema lets through, if
		// it has one.
		inner := typeKind(m)
		if inner == "" {
			inner = kind
		}
		backrefs := c.backrefs
		var parts []any
		if not, has := m["not"]; has {
			ns, err := c.schema(not, path+"/not", inner)
			if err != nil {
				return nil, err
			}
			parts = append(parts, Nof(0, ns))
		}
		// A condition sees the value as given, before a part fills it in.
		conditions, err := c.when(m, path, inner)
		if err != nil {
			return nil, err
		}
		parts = append(parts, conditions...)
		dependents, err := c.dependents(m, path)
		if err != nil {
			return nil, err
		}
		parts = append(parts, dependents...)
		if ref, isRef := m["$ref"].(string); isRef {
			rs, err := c.ref(ref, path)
			if err != nil {
				return nil, err
			}
			parts = append(parts, rs)
		}
		typed, err := c.typed(m, path, kind)
		if err != nil {
			return nil, err
		}
		// The Any of a schema with no type and no keyword of a kind says
		// nothing.
		if typed != Any {
			parts = append(parts, typed)
		}
		if all, has := m["allOf"]; has {
			branches, err := c.branches(all, path+"/allOf", inner)
			if err != nil {
				return nil, err
			}
			parts = append(parts, All(branches...))
		}
		if anyOf, has := m["anyOf"]; has && !isIpFormats(anyOf) {
			branches, err := c.branches(anyOf, path+"/anyOf", inner)
			if err != nil {
				return nil, err
			}
			parts = append(parts, Nof(Min(1), branches...))
		}
		if one, has := m["oneOf"]; has {
			part, err := c.oneOf(one, path+"/oneOf", inner)
			if err != nil {
				return nil, err
			}
			parts = append(parts, part)
		}

		_, hasEnum := m["enum"]
		_, hasConst := m["const"]
		if hasEnum || hasConst {
			spec, err = c.exact(m, parts, backrefs < c.backrefs, path)
			if err != nil {
				return nil, err
			}
		} else {
			spec = joinParts(parts)
		}
	}

	if d, ok := m["default"]; ok {
		spec = Default(d, spec)
	}
	return spec, nil
}

// when is if, then and else as a When, each read for the kind the schema
// lets through, as allOf's branches are. An if with neither then nor else
// asserts nothing, and is no part.
func (c *jsonSchemaImport) when(m map[string]any, path, kind string) ([]any, error) {
	_, hasIf := m["if"]
	_, hasThen := m["then"]
	_, hasElse := m["else"]
	if !hasIf || (!hasThen && !hasElse) {
		return nil, nil
	}
	arms := []any{nil, Any, Any}
	for i, k := range []string{"if", "then", "else"} {
		if v, has := m[k]; has {
			spec, err := c.schema(v, path+"/"+k, kind)
			if err != nil {
				return nil, err
			}
			arms[i] = spec
		}
	}
	return []any{When(arms[0], arms[1:]...)}, nil
}

// dependents is each entry of a dependent keyword as a When on its key
// being present: the object must then hold the names dependentRequired
// lists, or satisfy the schema dependentSchemas gives, which can only meet
// an object. Draft 7's dependencies holds either form, and is read where
// neither of the two that replaced it is written. The entries are read in
// key order, as the properties are.
func (c *jsonSchemaImport) dependents(m map[string]any, path string) ([]any, error) {
	var out []any
	_, hasRequired := m["dependentRequired"]
	_, hasSchemas := m["dependentSchemas"]
	for _, kw := range []string{"dependentRequired", "dependentSchemas", "dependencies"} {
		v, has := m[kw]
		if !has || (kw == "dependencies" && (hasRequired || hasSchemas)) {
			continue
		}
		entries, ok := v.(map[string]any)
		if !ok {
			return nil, jsonSchemaFault(kw+" must be an object", path+"/"+kw)
		}
		keys := make([]string, 0, len(entries))
		for k := range entries {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			at := path + "/" + kw + "/" + k
			if _, isList := entries[k].([]any); kw == "dependentRequired" || (kw == "dependencies" && isList) {
				names, err := dependencyNames(entries[k], at)
				if err != nil {
					return nil, err
				}
				if len(names) > 0 {
					out = append(out, When(holds(k), holds(names...)))
				}
				continue
			}
			spec, err := c.schema(entries[k], at, "object")
			if err != nil {
				return nil, err
			}
			out = append(out, When(holds(k), spec))
		}
	}
	return out, nil
}

// holds is an object that holds the properties named, and any others.
func holds(names ...string) *Node {
	obj := map[string]any{}
	for _, k := range names {
		obj[k] = Required()
	}
	return Open(obj)
}

// dependencyNames is the property names a dependency lists.
func dependencyNames(v any, path string) ([]string, error) {
	list, ok := v.([]any)
	names := make([]string, 0, len(list))
	for _, n := range list {
		name, isName := n.(string)
		ok = ok && isName
		names = append(names, name)
	}
	if !ok {
		return nil, jsonSchemaFault("a dependency must be an array of property names", path)
	}
	return names, nil
}

// joinParts is the parts of a schema as one spec: nothing is anything, and
// more than one are All of them.
func joinParts(parts []any) any {
	switch len(parts) {
	case 0:
		return Any
	case 1:
		return parts[0]
	}
	return All(parts...)
}

// oneOf is a count of exactly one, or a discriminated union where the
// branches are objects told apart by a const property.
func (c *jsonSchemaImport) oneOf(one any, path, kind string) (any, error) {
	list, err := branchList(one, path)
	if err != nil {
		return nil, err
	}
	disc, err := c.discriminated(list, path)
	if disc != nil || err != nil {
		return disc, err
	}
	branches, err := c.branches(list, path, kind)
	if err != nil {
		return nil, err
	}
	return Nof(1, branches...), nil
}

// exact is an enum or a const, less the values the other parts refuse. A
// part that refers back to a definition still being read cannot be tried
// yet, so the parts then stay beside the Exact.
func (c *jsonSchemaImport) exact(m map[string]any, parts []any, backref bool, path string) (any, error) {
	cv, hasConst := m["const"]
	vals := []any{cv}
	if e, hasEnum := m["enum"]; hasEnum {
		list, ok := e.([]any)
		if !ok {
			return nil, jsonSchemaFault("enum must be an array", path)
		}
		vals = list
		if hasConst {
			vals = []any{}
			for _, v := range list {
				if jsonEqual(v, cv) {
					vals = append(vals, v)
				}
			}
		}
	}

	if backref {
		return All(append([]any{exactOf(vals)}, parts...)...), nil
	}
	if len(parts) > 0 {
		// A property name that reads as a key expression can refuse to
		// build, as it can in TypeScript.
		rest, err := Shape(joinParts(parts))
		if err != nil {
			return nil, err
		}
		kept := []any{}
		for _, v := range vals {
			// A null in the list is a value, present and null.
			in := v
			if in == nil {
				in = Null
			}
			if rest.Match(in) {
				kept = append(kept, v)
			}
		}
		vals = kept
	}
	return exactOf(vals), nil
}

// exactOf is Exact of the values, or Never where there are none.
func exactOf(vals []any) *Node {
	if len(vals) == 0 {
		return Never()
	}
	return Exact(vals...)
}

// jsonEqual is the equality of JSON values, as enum and const compare them:
// objects and arrays by their contents.
func jsonEqual(x, y any) bool {
	xm, xIsMap := x.(map[string]any)
	ym, yIsMap := y.(map[string]any)
	xa, xIsArr := x.([]any)
	ya, yIsArr := y.([]any)
	switch {
	case xIsMap && yIsMap:
		if len(xm) != len(ym) {
			return false
		}
		for k, v := range xm {
			if w, has := ym[k]; !has || !jsonEqual(v, w) {
				return false
			}
		}
		return true
	case xIsArr && yIsArr:
		if len(xa) != len(ya) {
			return false
		}
		for i := range xa {
			if !jsonEqual(xa[i], ya[i]) {
				return false
			}
		}
		return true
	case xIsMap || yIsMap || xIsArr || yIsArr:
		return false
	}
	return exactEqual(x, y)
}

func branchList(v any, path string) ([]any, error) {
	list, ok := v.([]any)
	if !ok {
		return nil, jsonSchemaFault(path[strings.LastIndex(path, "/")+1:]+" must be an array", path)
	}
	return list, nil
}

func (c *jsonSchemaImport) branches(v any, path, kind string) ([]any, error) {
	list, err := branchList(v, path)
	if err != nil {
		return nil, err
	}
	out := make([]any, len(list))
	for i, b := range list {
		spec, err := c.schema(b, fmt.Sprintf("%s/%d", path, i), kind)
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

// typeKind is the one kind of value a schema's type lets through, if it
// names one.
func typeKind(m map[string]any) string {
	t := m["type"]
	if list, ok := t.([]any); ok && len(list) == 1 {
		t = list[0]
	}
	name, _ := t.(string)
	return jsonSchemaTypeKind[name]
}

// typed is the types of a schema: one, or exactly one of several, which are
// of different kinds, so the value's kind chooses among them (see Nof). With
// no type, each kind of value is checked by its own keywords (kindSplit).
func (c *jsonSchemaImport) typed(m map[string]any, path, kind string) (any, error) {
	var given []any
	if t, has := m["type"]; has {
		if list, ok := t.([]any); ok {
			given = list
		} else {
			given = []any{t}
		}
	}
	for _, t := range given {
		if name, ok := t.(string); !ok || !jsonSchemaKinds[name] {
			return nil, jsonSchemaFault("unknown type \""+jsText(t)+"\"", path)
		}
	}

	// Null beside another type is Nullable, and a number covers an integer.
	var types []string
	for _, t := range given {
		if !contains(types, t.(string)) {
			types = append(types, t.(string))
		}
	}
	nullable := contains(types, "null") && len(types) > 1
	var kept []string
	for _, t := range types {
		if !(nullable && t == "null") && !(t == "integer" && contains(types, "number")) {
			kept = append(kept, t)
		}
	}

	if len(kept) == 0 {
		return c.kindSplit(m, path, kind)
	}

	specs := make([]any, len(kept))
	for i, t := range kept {
		spec, err := c.kind(t, m, path)
		if err != nil {
			return nil, err
		}
		specs[i] = spec
	}
	spec := specs[0]
	if len(specs) > 1 {
		spec = Nof(1, specs...)
	}
	if nullable {
		spec = Nullable(spec)
	}
	return spec, nil
}

// jsText is a JSON value as JavaScript's String() writes it.
func jsText(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case map[string]any:
		return "[object Object]"
	case []any:
		// An array joins its elements, a null as nothing.
		parts := make([]string, len(x))
		for i, e := range x {
			if e != nil {
				parts[i] = jsText(e)
			}
		}
		return strings.Join(parts, ",")
	}
	if f, ok := toFloat64(v); ok {
		return fmtFloat(f)
	}
	return fmt.Sprint(v)
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

// kindSplit is a schema without a type, which checks each kind of value with
// the keywords of that kind and lets every other kind through: {minLength:
// 2} fails "a" and passes 1. Where the enclosing schema lets one kind
// through, only that kind's keywords can apply.
func (c *jsonSchemaImport) kindSplit(m map[string]any, path, kind string) (any, error) {
	has := func(k string) bool {
		if kind != "" && k != kind {
			return false
		}
		for _, w := range jsonSchemaKindKeywords[k] {
			if _, ok := m[w]; ok {
				return true
			}
		}
		return k == "string" && isIpFormats(m["anyOf"])
	}
	if !has("number") && !has("string") && !has("object") && !has("array") {
		return Any, nil
	}
	switch kind {
	case "number":
		return importNumber(Number, m), nil
	case "string":
		return importString(m, path)
	case "object":
		return c.object(m, path)
	case "array":
		return c.array(m, path)
	}

	// A shape for each kind of JSON value: the value's kind chooses (see
	// Nof).
	var number, str, obj, arr any = Number, Empty(String), Open(map[string]any{}), []any{}
	var err error
	if has("number") {
		number = importNumber(Number, m)
	}
	if has("string") {
		if str, err = importString(m, path); err != nil {
			return nil, err
		}
	}
	if has("object") {
		if obj, err = c.object(m, path); err != nil {
			return nil, err
		}
	}
	if has("array") {
		if arr, err = c.array(m, path); err != nil {
			return nil, err
		}
	}
	return Nof(1, Required(nil), Boolean, number, str, obj, arr), nil
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
		child, err := c.schema(ap, path+"/additionalProperties", "")
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
	spec, err := c.schema(ps, path, "")
	if err != nil {
		return nil, err
	}
	if hasDefaultKeyword(ps) {
		return spec, nil
	}
	if required {
		return Required(spec), nil
	}
	return Skip(spec), nil
}

// hasDefaultKeyword reports whether a schema is an object with a default.
func hasDefaultKeyword(s any) bool {
	m, _ := s.(map[string]any)
	_, has := m["default"]
	return has
}

func (c *jsonSchemaImport) array(m map[string]any, path string) (any, error) {
	var spec any
	items, hasItems := m["items"]
	if prefix, has := m["prefixItems"]; has {
		list, ok := prefix.([]any)
		if !ok {
			return nil, jsonSchemaFault("prefixItems must be an array", path+"/prefixItems")
		}
		// A position may be absent, but for one before a position with a
		// default to fill in: an array has no holes.
		last := -1
		for i, e := range list {
			if hasDefaultKeyword(e) {
				last = i
			}
		}
		elems := make([]any, len(list))
		for i, e := range list {
			elem, err := c.schema(e, fmt.Sprintf("%s/prefixItems/%d", path, i), "")
			if err != nil {
				return nil, err
			}
			switch {
			case hasDefaultKeyword(e):
				elems[i] = elem
			case i < last:
				elems[i] = Required(elem)
			default:
				elems[i] = Skip(elem)
			}
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
			rest, err := c.schema(items, path+"/items", "")
			if err != nil {
				return nil, err
			}
			spec = Rest(rest, tuple)
		}
	} else if !hasItems || items == true {
		spec = []any{}
	} else {
		elem, err := c.schema(items, path+"/items", "")
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

	// contains counts the items its schema admits, at least one unless
	// minContains says otherwise; a count of at least none asserts nothing.
	if cs, has := m["contains"]; has {
		lo, hasLo := m["minContains"].(float64)
		if !hasLo {
			lo = 1
		}
		hi, hasHi := m["maxContains"].(float64)
		if lo > 0 || hasHi {
			var count any
			switch {
			case hasHi && lo == hi:
				count = lo
			case !hasHi:
				count = Min(lo)
			case lo == 0:
				count = Max(hi)
			default:
				count = Max(hi, Min(lo))
			}
			item, err := c.schema(cs, path+"/contains", "")
			if err != nil {
				return nil, err
			}
			// An exact count that is not a whole number refuses, as the
			// builder does.
			counted := Contains(count, item, spec)
			if counted.n.argFault {
				return nil, fmt.Errorf("%s", counted.n.faultMsg)
			}
			spec = counted
		}
	}
	if m["uniqueItems"] == true {
		spec = Unique(spec)
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

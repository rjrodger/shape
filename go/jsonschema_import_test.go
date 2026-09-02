package shape

import (
	"encoding/json"
	"reflect"
	"regexp"
	"testing"
)

// JSON Schema import (jsonschema_import.go).

// js decodes a JSON document as encoding/json would hand it to FromJSONSchema.
func js(t *testing.T, doc string) any {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(doc), &v); err != nil {
		t.Fatalf("bad JSON %s: %v", doc, err)
	}
	return v
}

// jsonRT normalizes a schema through JSON so []string and []any compare equal.
func jsonRT(t *testing.T, v any) any {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

func importShape(t *testing.T, doc string) *Schema {
	t.Helper()
	spec, err := FromJSONSchema(js(t, doc))
	if err != nil {
		t.Fatalf("import %s: %v", doc, err)
	}
	return MustShape(spec)
}

func importErr(t *testing.T, doc string, want string) {
	t.Helper()
	_, err := FromJSONSchema(js(t, doc))
	if err == nil || err.Error() != want {
		t.Fatalf("import %s: got %v, want %q", doc, err, want)
	}
}

// Export, import, export: the same document comes back.
func TestJSONSchemaImportRoundTrip(t *testing.T) {
	specs := map[string]any{
		"flat":         map[string]any{"a": Integer, "b": String, "c": Boolean, "d": Number},
		"defaults":     map[string]any{"port": 8080.0, "host": "localhost", "on": true},
		"skip":         map[string]any{"a": Skip(String), "b": Skip(map[string]any{"c": 1.0})},
		"nested":       map[string]any{"a": map[string]any{"b": map[string]any{"c": String}}, "t": []any{String}},
		"open":         Open(map[string]any{"a": 1.0}),
		"child":        Child(Number, map[string]any{"a": 1.0}),
		"closed-empty": Closed(map[string]any{}),
		"empty-open":   map[string]any{},
		"tuple":        []any{String, Number},
		"closed-tuple": Closed([]any{String, Number}),
		"rest":         Rest(Number, []any{String}),
		"open-tuple":   Rest(Any, []any{String, Number}),
		"open-1-tuple": Rest(Any, Closed([]any{String})),
		"typed-rest":   Rest(Number, Closed([]any{String})),
		"untyped":      map[string]any{"a": Min(1), "b": Max(3), "c": Above(1), "d": Below(3), "e": All(Number, Min(1))},
		"bounds": map[string]any{
			"a": Min(3, String), "b": Max(9, Number), "c": Above(0, Integer), "d": Below(1, Number),
			"e": Len(2, []any{Number}), "f": Max(2, Min(1, map[string]any{"x": 1.0})),
		},
		"empty-string":  Empty(String),
		"regexp":        mustRegexp("^a+$"),
		"regexp-bounds": Min(2, mustRegexp("^a+$")),
		"formats":       map[string]any{"a": Email(), "b": Url(), "c": Uuid(), "d": DateTime(), "e": Ipv4(), "f": Ipv6(), "g": Ip()},
		"exact":         map[string]any{"a": Exact("x", "y"), "b": Exact(1.0), "c": Exact(true, false)},
		"one":           One(String, Number),
		"all":           All(Number, Min(1, Number)),
		"nullable":      map[string]any{"a": Nullable(Number), "b": Nullable(Empty(String))},
		"never":         map[string]any{"a": Never()},
		"any":           map[string]any{"a": Any},
		"describe":      Describe("top", map[string]any{"a": Describe("d", Empty(String))}),
		"discriminated": Discriminated("k", map[string]any{"a": map[string]any{"x": 1.0}, "b": map[string]any{"y": String}}),
		"null-literal":  map[string]any{"a": nil},
		"required-null": map[string]any{"a": Required(nil)},
		"integer-opt":   map[string]any{"a": Optional(Integer)},
		"default-obj":   map[string]any{"a": Default(map[string]any{"x": 1.0}, map[string]any{"x": Number})},
		"default-child": Default(map[string]any{}, Child(Number, map[string]any{})),
	}
	for name, spec := range specs {
		a := jsonRT(t, MustShape(spec).JSONSchema())
		imported, err := FromJSONSchema(a)
		if err != nil {
			t.Fatalf("%s: import: %v", name, err)
		}
		b := jsonRT(t, MustShape(imported).JSONSchema())
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("%s: round trip differs\n  %v\n  %v", name, a, b)
		}
	}
}

func mustRegexp(p string) any {
	return regexp.MustCompile(p)
}

func TestJSONSchemaImportRecursive(t *testing.T) {
	a := jsonRT(t, MustShape(Define("t", map[string]any{"v": 1.0, "kids": []any{Refer("t")}})).JSONSchema()).(map[string]any)
	imported, err := FromJSONSchema(a)
	if err != nil {
		t.Fatal(err)
	}
	s := MustShape(imported)
	b := jsonRT(t, s.JSONSchema()).(map[string]any)
	if !reflect.DeepEqual(a["$defs"], b["$defs"]) {
		t.Fatalf("defs differ: %v vs %v", a["$defs"], b["$defs"])
	}
	inner := b["properties"].(map[string]any)["kids"].(map[string]any)["items"].(map[string]any)["properties"].(map[string]any)["kids"].(map[string]any)["items"]
	if !reflect.DeepEqual(inner, map[string]any{"$ref": "#/$defs/t"}) {
		t.Fatalf("inner items = %v", inner)
	}
	got := mustOK(t, s, map[string]any{"kids": []any{map[string]any{"kids": []any{map[string]any{}}}}})
	want := map[string]any{"v": 1.0, "kids": []any{map[string]any{"v": 1.0, "kids": []any{map[string]any{"v": 1.0}}}}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
	mustErr(t, s, map[string]any{"kids": []any{map[string]any{"kids": []any{map[string]any{"v": "x"}}}}}, "kids.0.kids.0.v")

	// Through Child, and through the root.
	a = jsonRT(t, MustShape(Define("t", map[string]any{"v": 1.0, "more": Child(Refer("t"), map[string]any{})})).JSONSchema()).(map[string]any)
	b = jsonRT(t, MustShape(MustFromJSONSchema(a)).JSONSchema()).(map[string]any)
	if !reflect.DeepEqual(a["$defs"], b["$defs"]) {
		t.Fatalf("child defs differ: %v vs %v", a["$defs"], b["$defs"])
	}
	root := importShape(t, `{"type":"object","properties":{"v":{"type":"number"},"next":{"$ref":"#"}}}`)
	mustOK(t, root, map[string]any{"v": 1.0, "next": map[string]any{"v": 2.0}})
	mustErr(t, root, map[string]any{"v": 1.0, "next": map[string]any{"next": map[string]any{"v": "x"}}}, "next.next.v")
	next := jsonRT(t, root.JSONSchema()).(map[string]any)["properties"].(map[string]any)["next"].(map[string]any)["properties"].(map[string]any)["next"]
	if !reflect.DeepEqual(next, map[string]any{"$ref": "#/$defs/$root"}) {
		t.Fatalf("root ref = %v", next)
	}

	// A definition used more than once is inlined at each use.
	a = jsonRT(t, MustShape(map[string]any{"b": Define("x", map[string]any{"q": 1.0}), "a": Refer("x")}).JSONSchema()).(map[string]any)
	b = jsonRT(t, MustShape(MustFromJSONSchema(a)).JSONSchema()).(map[string]any)
	if _, has := b["$defs"]; has {
		t.Fatal("inlined definition should leave no $defs")
	}
	if !reflect.DeepEqual(b["properties"].(map[string]any)["a"], a["$defs"].(map[string]any)["x"]) {
		t.Fatalf("inlined = %v", b["properties"].(map[string]any)["a"])
	}
}

func TestJSONSchemaImportValidates(t *testing.T) {
	s := importShape(t, `{
		"type": "object",
		"properties": {
			"name": {"type": "string"},
			"age": {"type": "integer", "minimum": 0, "default": 1},
			"tags": {"type": "array", "items": {"type": "string"}},
			"addr": {"type": "object", "properties": {"zip": {"type": "string", "pattern": "^[0-9]{5}$"}},
			         "required": ["zip"], "additionalProperties": false}
		},
		"required": ["name"]
	}`)
	got := mustOK(t, s, map[string]any{"name": "a", "extra": 1.0})
	if !reflect.DeepEqual(got, map[string]any{"name": "a", "extra": 1.0, "age": 1.0}) {
		t.Fatalf("got %#v", got)
	}
	mustOK(t, s, map[string]any{"name": ""})
	mustErr(t, s, map[string]any{"name": "a", "age": -1.0}, "must be a minimum of 0")
	mustErr(t, s, map[string]any{"name": "a", "age": 1.5}, "not of type integer")
	mustErr(t, s, map[string]any{"name": "a", "addr": map[string]any{"zip": "1"}}, "did not match")
	mustErr(t, s, map[string]any{"name": "a", "addr": map[string]any{"zip": "12345", "x": 1.0}}, `property "x" is not allowed`)
	mustErr(t, s, map[string]any{}, `property "name"`)
	mustErr(t, s, map[string]any{"name": "a", "tags": []any{1.0}}, "tags.0")
}

func TestJSONSchemaImportKeywords(t *testing.T) {
	ok := func(doc string, in any) any {
		t.Helper()
		return mustOK(t, importShape(t, doc), in)
	}
	bad := func(doc string, in any, want string) {
		t.Helper()
		mustErr(t, importShape(t, doc), in, want)
	}

	// Types.
	ok(`{"type":["string","number"]}`, 3.0)
	ok(`{"type":["string","null"]}`, Null)
	ok(`{"type":"null"}`, Null)
	bad(`{"type":"null"}`, 1.0, "not of type null")
	bad(`{"type":["string","number"]}`, true, "does not satisfy one of")
	ok(`{"type":"boolean"}`, false)
	ok(`{}`, "anything")
	ok(`{"properties":{"a":{"type":"number"}}}`, map[string]any{"a": 1.0, "b": 2.0})
	ok(`{"items":{"type":"number"}}`, []any{1.0})
	ok(`{"required":["a"]}`, map[string]any{"a": 1.0})
	bad(`{"required":["a"]}`, map[string]any{}, "required")
	ok(`{"additionalProperties":true}`, map[string]any{"z": 1.0})

	// Boolean schemas.
	ok(`{"type":"object","properties":{"a":true}}`, map[string]any{"a": 1.0})
	bad(`{"type":"object","properties":{"b":false}}`, map[string]any{"b": 1.0}, "no value is allowed")
	bad(`{"type":"object","properties":{"b":false}}`, map[string]any{}, "no value is allowed")

	// Numbers, including draft-4 boolean exclusives.
	bad(`{"type":"number","minimum":1,"exclusiveMinimum":true}`, 1.0, "above 1")
	bad(`{"type":"number","maximum":1,"exclusiveMaximum":true}`, 1.0, "below 1")
	bad(`{"type":"number","exclusiveMaximum":1}`, 1.0, "below 1")
	bad(`{"type":"number","exclusiveMinimum":1}`, 1.0, "above 1")
	bad(`{"type":"number","maximum":1}`, 2.0, "maximum of 1")
	ok(`{"type":"number","minimum":1,"maximum":1}`, 1.0)
	bad(`{"type":"integer","minimum":1}`, 0.0, "minimum of 1")

	// Strings.
	ok(`{"type":"string","minLength":1}`, "a")
	bad(`{"type":"string","minLength":1}`, "", "empty string")
	bad(`{"type":"string","minLength":2}`, "a", "minimum length of 2")
	bad(`{"type":"string","maxLength":2}`, "abc", "maximum length of 2")
	ok(`{"type":"string","minLength":0}`, "")
	ok(`{"type":"string","format":"email"}`, "a@b.co")
	bad(`{"type":"string","format":"email"}`, "nope", "email")
	ok(`{"type":"string","format":"unknown-format"}`, "")
	ok(`{"type":"string","pattern":"^1","format":"uuid","minLength":0}`, "123e4567-e89b-12d3-a456-426614174000")
	bad(`{"type":"string","pattern":"^1","format":"uuid"}`, "223e4567-e89b-12d3-a456-426614174000", "did not match")
	bad(`{"type":"string","pattern":"^1","format":"uuid"}`, "1", "UUID")
	bad(`{"type":"string","anyOf":[{"format":"ipv4"},{"format":"ipv6"}]}`, "x", "IP address")

	// Enum and const, with and without a type.
	bad(`{"type":"string","enum":["a","b"]}`, "c", "exactly one of: a, b")
	ok(`{"enum":[1,2]}`, 2.0)
	bad(`{"const":"x"}`, "y", "exactly one of: x")

	// Objects.
	bad(`{"type":"object","additionalProperties":false}`, map[string]any{"a": 1.0}, "not allowed")
	bad(`{"type":"object","additionalProperties":{"type":"number"}}`, map[string]any{"a": "x"}, "not of type number")
	bad(`{"type":"object","minProperties":1}`, map[string]any{}, "minimum length of 1")
	bad(`{"type":"object","maxProperties":1}`, map[string]any{"a": 1.0, "b": 2.0}, "maximum length of 1")
	ok(`{"type":"object","required":[1]}`, map[string]any{})
	ok(`{"type":"object","required":"a"}`, map[string]any{})
	ok(`{"type":"array","items":true}`, []any{"a", 1.0})

	// Arrays.
	ok(`{"type":"array","prefixItems":[{"type":"string"},{"type":"number"}]}`, []any{"a", 1.0, true})
	ok(`{"type":"array","prefixItems":[{"type":"string"}],"items":true}`, []any{"a", 1.0})
	bad(`{"type":"array","prefixItems":[{"type":"string"}],"items":false}`, []any{"a", 1.0}, "not allowed")
	bad(`{"type":"array","prefixItems":[{"type":"string"}],"items":{"type":"number"}}`, []any{"a", "b"}, "not of type number")
	ok(`{"type":"array"}`, []any{1.0, "a"})
	bad(`{"type":"array","minItems":1}`, []any{}, "minimum length of 1")
	bad(`{"type":"array","maxItems":1}`, []any{1.0, 2.0}, "maximum length of 1")

	// Compositions.
	bad(`{"oneOf":[{"type":"string"},{"type":"number"}]}`, true, "does not satisfy one of")
	bad(`{"allOf":[{"type":"number"},{"minimum":1}]}`, 0.0, "does not satisfy all of: Number, Min(1)")
	bad(`{"minLength":2}`, "a", "minimum length of 2")
	bad(`{"maxItems":1}`, []any{1.0, 2.0}, "maximum length of 1")
	bad(`{"exclusiveMinimum":1}`, 1.0, "above 1")
	bad(`{"minimum":1,"exclusiveMinimum":true}`, 1.0, "above 1")
	ok(`{"minProperties":1,"maxProperties":9}`, "x")
	ok(`{"exclusiveMinimum":true}`, 0.0)
	ok(`{"pattern":"^a"}`, "a")
	bad(`{"format":"email"}`, "x", "email")
	bad(`{"anyOf":[{"format":"ipv4"},{"format":"ipv6"}]}`, "x", "IP address")
	ok(`{"type":"array","prefixItems":[{"type":"string"}]}`, []any{"a", 1.0})
	bad(`{"type":"array","prefixItems":[{"type":"string"}]}`, []any{1.0}, "not of type string")
	bad(`{"type":"array","prefixItems":[{"type":"string"}],"items":false}`, []any{"a", "b"}, "not allowed")
	bad(`{"not":{}}`, 1.0, "no value is allowed")
	ok(`{"not":{"type":"string"}}`, 1.0)

	// A discriminated oneOf, and oneOfs that are not one.
	disc := importShape(t, `{"oneOf":[
		{"type":"object","properties":{"k":{"const":"a"},"x":{"type":"number"}},"required":["k","x"]},
		{"type":"object","properties":{"k":{"const":"b"}},"required":["k"]}]}`)
	mustOK(t, disc, map[string]any{"k": "a", "x": 1.0})
	mustErr(t, disc, map[string]any{"k": "a", "x": "no"}, `property "x"`)
	mustErr(t, disc, map[string]any{"k": "c"}, "k")
	for _, doc := range []string{
		`{"oneOf":[{"type":"object","properties":{"k":{"const":"a"}},"required":["k"]},{"type":"object","properties":{"k":{"const":"a"}},"required":["k"]}]}`,
		`{"oneOf":[{"type":"object","properties":{"k":{"const":"a"}},"required":["k"]},{"type":"object","properties":{"j":{"const":"b"}},"required":["j"]}]}`,
		`{"oneOf":[{"type":"object","properties":{"k":{"const":"a"}},"required":["k"]},{"type":"object","properties":{"k":{"const":"b"}},"required":[]}]}`,
		`{"oneOf":[{"type":"object","properties":{"k":{"const":"a"}},"required":["k"]},{"type":"object","properties":{"k":{"type":"string"}},"required":["k"]}]}`,
		`{"oneOf":[{"type":"object","properties":{"k":{"const":"a"}},"required":["k"]},{"type":"object","properties":{"k":{"const":"b"}}}]}`,
		`{"oneOf":[{"type":"object","properties":{"k":{"const":"a"}},"required":["k"]},{"type":"object","required":["k"]}]}`,
		`{"oneOf":[{"type":"object","properties":{"k":{"const":"a"}},"required":["k"]},{"type":"string"}]}`,
		`{"oneOf":[{"type":"object","properties":{"k":{"const":"a"}},"required":["k"]},true]}`,
	} {
		s := importShape(t, doc)
		if _, has := s.JSONSchema()["oneOf"]; has {
			t.Fatalf("%s should not import as discriminated", doc)
		}
	}
	if got := importShape(t, `{"oneOf":[]}`).JSONSchema()["anyOf"]; !reflect.DeepEqual(got, []any{}) {
		t.Fatalf("an empty oneOf is an empty One, got %v", got)
	}
	twoTags := importShape(t, `{"oneOf":[
		{"type":"object","properties":{"k":{"const":"a"},"j":{"const":"x"}},"required":["j"]},
		{"type":"object","properties":{"k":{"const":"b"},"j":{"const":"y"}},"required":["j","k"]}]}`)
	first := twoTags.JSONSchema()["oneOf"].([]any)[0].(map[string]any)["properties"].(map[string]any)["j"]
	if !reflect.DeepEqual(first, map[string]any{"type": "string", "const": "x"}) {
		t.Fatalf("tag should be j: %v", first)
	}
	mustOK(t, twoTags, map[string]any{"j": "y", "k": "b"})
	// A property before the tag in name order that is not a const.
	skipped := importShape(t, `{"oneOf":[
		{"type":"object","properties":{"a":{"type":"string"},"k":{"const":"a"}},"required":["k"]},
		{"type":"object","properties":{"k":{"const":"b"}},"required":["k"]}]}`)
	mustOK(t, skipped, map[string]any{"k": "a", "a": "x"})
	mustErr(t, skipped, map[string]any{"k": "a", "a": 1.0}, `property "a"`)

	// Descriptions and defaults.
	if d := importShape(t, `{"type":"string","description":"d"}`).JSONSchema()["description"]; d != "d" {
		t.Fatalf("description = %v", d)
	}
	got := ok(`{"type":"object","properties":{"a":{"type":"number","default":2}}}`, map[string]any{})
	if !reflect.DeepEqual(got, map[string]any{"a": 2.0}) {
		t.Fatalf("default = %#v", got)
	}
	got = ok(`{"type":"object","properties":{"a":{"type":"object","default":{"q":1},"additionalProperties":{"type":"number"}}}}`, map[string]any{})
	if !reflect.DeepEqual(got, map[string]any{"a": map[string]any{"q": 1.0}}) {
		t.Fatalf("object default = %#v", got)
	}
}

func TestJSONSchemaImportReferences(t *testing.T) {
	twice := importShape(t, `{"$defs":{"p":{"type":"object","properties":{"n":{"type":"string"}},"required":["n"]}},
		"type":"object","properties":{"a":{"$ref":"#/$defs/p"},"b":{"$ref":"#/$defs/p"}},"required":["a","b"]}`)
	mustOK(t, twice, map[string]any{"a": map[string]any{"n": "x"}, "b": map[string]any{"n": "y"}})
	mustErr(t, twice, map[string]any{"a": map[string]any{"n": "x"}, "b": map[string]any{}}, "b.n")

	// draft-4 definitions, a description beside the reference, an escaped name.
	legacy := importShape(t, `{"definitions":{"p q":{"type":"number"}},"type":"object","properties":{"a":{"$ref":"#/definitions/p%20q","description":"d"}}}`)
	if d := legacy.JSONSchema()["properties"].(map[string]any)["a"].(map[string]any)["description"]; d != "d" {
		t.Fatalf("description = %v", d)
	}
	mustErr(t, legacy, map[string]any{"a": "x"}, "not of type number")

	importErr(t, `{"$ref":"#/$defs/zz"}`, `JSON Schema: unknown $ref "#/$defs/zz" at /`)
	importErr(t, `{"type":"object","properties":{"a":{"$ref":"other.json#/x"}}}`, `JSON Schema: unsupported $ref "other.json#/x" at /properties/a`)
	importErr(t, `{"$defs":{"p":{"type":"x"}},"$ref":"#/$defs/p"}`, `JSON Schema: unknown type "x" at /`)
}

func TestJSONSchemaImportFaults(t *testing.T) {
	if _, err := FromJSONSchema(3); err == nil || err.Error() != "JSON Schema: the schema must be an object" {
		t.Fatalf("got %v", err)
	}
	importErr(t, `{"properties":{"a":"x"}}`, "JSON Schema: a schema must be an object or boolean at /properties/a")
	importErr(t, `{"items":null}`, "JSON Schema: a schema must be an object or boolean at /items")
	importErr(t, `{"type":"object","additionalProperties":null}`, "JSON Schema: a schema must be an object or boolean at /additionalProperties")
	importErr(t, `{"type":"object","properties":3}`, "JSON Schema: properties must be an object at /properties")
	importErr(t, `{"type":"array","prefixItems":{}}`, "JSON Schema: prefixItems must be an array at /prefixItems")
	importErr(t, `{"anyOf":{}}`, "JSON Schema: anyOf must be an array at /anyOf")
	importErr(t, `{"oneOf":1}`, "JSON Schema: oneOf must be an array at /oneOf")
	importErr(t, `{"allOf":"x"}`, "JSON Schema: allOf must be an array at /allOf")
	importErr(t, `{"properties":{"a":{"type":"strng"}}}`, `JSON Schema: unknown type "strng" at /properties/a`)
	importErr(t, `{"type":3}`, `JSON Schema: unknown type "3" at /`)
	importErr(t, `{"type":["string",3]}`, `JSON Schema: unknown type "3" at /`)
	importErr(t, `{"type":"string","pattern":"("}`, `JSON Schema: bad pattern "(" at /`)
	importErr(t, `{"enum":[]}`, "JSON Schema: enum must be a non-empty array at /")
	importErr(t, `{"enum":"x"}`, "JSON Schema: enum must be a non-empty array at /")
	importErr(t, `{"type":"array","prefixItems":[{"type":"x"}]}`, `JSON Schema: unknown type "x" at /prefixItems/0`)
	importErr(t, `{"type":"array","prefixItems":[{"type":"string"}],"items":{"type":"x"}}`, `JSON Schema: unknown type "x" at /items`)
	importErr(t, `{"type":"array","items":{"type":"x"}}`, `JSON Schema: unknown type "x" at /items`)
	importErr(t, `{"anyOf":[{"type":"x"}]}`, `JSON Schema: unknown type "x" at /anyOf/0`)
	importErr(t, `{"oneOf":[{"type":"x"}]}`, `JSON Schema: unknown type "x" at /oneOf/0`)
	importErr(t, `{"oneOf":[{"type":"object","properties":{"k":{"const":"a"},"x":{"type":"x"}},"required":["k"]},{"type":"object","properties":{"k":{"const":"b"}},"required":["k"]}]}`,
		`JSON Schema: unknown type "x" at /oneOf/0/properties/x`)
	importErr(t, `{"allOf":[{"type":"x"}]}`, `JSON Schema: unknown type "x" at /allOf/0`)
	importErr(t, `{"type":"object","additionalProperties":{"type":"x"}}`, `JSON Schema: unknown type "x" at /additionalProperties`)
	importErr(t, `{"type":["string","x"]}`, `JSON Schema: unknown type "x" at /`)
	importErr(t, `{"type":["x","null"]}`, `JSON Schema: unknown type "x" at /`)
	importErr(t, `{"type":["string","number"],"pattern":"("}`, `JSON Schema: bad pattern "(" at /`)

	defer func() {
		if r := recover(); r == nil {
			t.Fatal("MustFromJSONSchema should panic")
		}
	}()
	MustFromJSONSchema(3)
}

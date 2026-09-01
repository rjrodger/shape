package shape

import (
	"encoding/json"
	"reflect"
	"regexp"
	"testing"
	"time"
)

// JSON Schema export. The expected documents are the canonical TypeScript
// build's renderings of the same shapes (ts/test/jsonschema.test.ts).

func schemaWant(t *testing.T, name string, got map[string]any, want string) {
	t.Helper()
	var w any
	if err := json.Unmarshal([]byte(want), &w); err != nil {
		t.Fatalf("%s: bad expectation: %v", name, err)
	}
	if g := jsonNorm(got); !reflect.DeepEqual(g, w) {
		gb, _ := json.Marshal(g)
		t.Fatalf("%s:\n got %s\nwant %s", name, gb, want)
	}
}

const draft = `"$schema":"https://json-schema.org/draft/2020-12/schema"`

func TestJSONSchemaKinds(t *testing.T) {
	s := MustShape(map[string]any{
		"a": String, "b": Number, "c": Boolean, "d": Integer, "e": time.Unix(0, 0).UTC(),
		"f": regexp.MustCompile("^b"), "g": nil, "h": Min(2), "i": Empty(), "j": Optional(Object),
		"k": Optional(Date), "l": "x", "m": Never(), "n": Func(), "o": Any,
	})
	schemaWant(t, "kinds", s.JSONSchema(), `{`+draft+`,"type":"object","properties":{
		"a":{"type":"string","minLength":1},"b":{"type":"number"},"c":{"type":"boolean"},"d":{"type":"integer"},
		"e":{"type":"string","format":"date-time","default":"1970-01-01T00:00:00.000Z"},
		"f":{"type":"string","pattern":"^b"},"g":{"type":"null","default":null},
		"h":{"minimum":2,"minLength":2,"minItems":2,"minProperties":2},"i":{},
		"j":{"type":"object","default":{}},"k":{"type":"string","format":"date-time"},
		"l":{"type":"string","minLength":1,"default":"x"},"m":{"not":{}},"n":{},"o":{}},
		"required":["a","b","c","d","f"],"additionalProperties":false}`)
}

func TestJSONSchemaObjectsAndArrays(t *testing.T) {
	s := MustShape(map[string]any{
		"a": Open(map[string]any{"t": 1}), "b": Child(Number), "c": Closed([]any{Number}),
		"d": Rest(Number, []any{String, Boolean}), "e": []any{}, "f": []any{Number}, "g": map[string]any{},
		"h": Child(Number, map[string]any{"z": 1}), "i": Skip(Number), "j": Rest(Number), "k": []any{Any}, "l": Array,
	})
	schemaWant(t, "containers", s.JSONSchema(), `{`+draft+`,"type":"object","properties":{
		"a":{"type":"object","properties":{"t":{"type":"number","default":1}}},
		"b":{"type":"object","additionalProperties":{"type":"number"},"default":{}},
		"c":{"type":"array","prefixItems":[{"type":"number"}],"items":false},
		"d":{"type":"array","prefixItems":[{"type":"string","minLength":1},{"type":"boolean"}],"items":{"type":"number"}},
		"e":{"type":"array"},"f":{"type":"array","items":{"type":"number"}},"g":{"type":"object"},
		"h":{"type":"object","properties":{"z":{"type":"number","default":1}},"additionalProperties":{"type":"number"}},
		"i":{"type":"number"},"j":{"type":"array","items":{"type":"number"}},"k":{"type":"array"},"l":{"type":"array"}},
		"required":["l"],"additionalProperties":false}`)
}

func TestJSONSchemaChecks(t *testing.T) {
	s := MustShape(map[string]any{
		"a": Min(2, Number), "b": Optional(Max(5, String)), "c": Above(1, []any{Number}), "d": Below(3, map[string]any{}),
		"e": Len(2, String), "f": Exact("x", 1, nil), "g": Email(), "h": Ip(), "i": Check(regexp.MustCompile("^a")),
		"j": Min(1), "k": Above(1, Number), "l": Below(3, Number), "m": Len(3, Number), "n": Above(1, String),
		"o": Below(3, String), "p": Check(func(val any, u *Update, s *State) bool { return true }),
		"q": Url(), "r": Uuid(), "s": DateTime(), "t": Ipv4(), "u": Ipv6(),
	})
	schemaWant(t, "checks", s.JSONSchema(), `{`+draft+`,"type":"object","properties":{
		"a":{"type":"number","minimum":2},"b":{"type":"string","minLength":1,"maxLength":5,"default":""},
		"c":{"type":"array","items":{"type":"number"},"minItems":2},"d":{"type":"object","maxProperties":2},
		"e":{"type":"string","minLength":2,"maxLength":2},"f":{"enum":["x",1,null]},
		"g":{"type":"string","minLength":1,"format":"email"},
		"h":{"type":"string","minLength":1,"anyOf":[{"format":"ipv4"},{"format":"ipv6"}]},
		"i":{"pattern":"^a"},"j":{"minimum":1,"minLength":1,"minItems":1,"minProperties":1},
		"k":{"type":"number","exclusiveMinimum":1},"l":{"type":"number","exclusiveMaximum":3},
		"m":{"type":"number","minimum":3,"maximum":3},"n":{"type":"string","minLength":2},
		"o":{"type":"string","minLength":1,"maxLength":2},"p":{},
		"q":{"type":"string","minLength":1,"format":"uri"},"r":{"type":"string","minLength":1,"format":"uuid"},
		"s":{"type":"string","minLength":1,"format":"date-time"},"t":{"type":"string","minLength":1,"format":"ipv4"},
		"u":{"type":"string","minLength":1,"format":"ipv6"}},
		"required":["a","e","g","h","i","k","l","m","n","o","p","q","r","s","t","u"],"additionalProperties":false}`)
}

func TestJSONSchemaCompositionAndReferences(t *testing.T) {
	s := MustShape(map[string]any{
		"a": One(String, Number), "b": Some(String, Number), "c": All(Number, Min(1)),
		"d": Discriminated("kind", map[string]any{
			"dog": map[string]any{"bark": Boolean}, "fish": map[string]any{"fins": 1}, "cat": Object,
			"bird": map[string]any{"kind": String, "wings": 2}}),
		"e": Define("d", map[string]any{"z": 1}), "f": Refer("d"), "g": Describe("a ref", Refer("d")),
	})
	schemaWant(t, "composition", s.JSONSchema(), `{`+draft+`,"type":"object","properties":{
		"a":{"anyOf":[{"type":"string","minLength":1},{"type":"number"}]},
		"b":{"anyOf":[{"type":"string","minLength":1},{"type":"number"}]},
		"c":{"allOf":[{"type":"number"},{"minimum":1,"minLength":1,"minItems":1,"minProperties":1}]},
		"d":{"oneOf":[
			{"type":"object","properties":{"kind":{"type":"string","const":"bird"},"wings":{"type":"number","default":2}},
			 "required":["kind"],"additionalProperties":false},
			{"type":"object","properties":{"kind":{"type":"string","const":"cat"}},"required":["kind"]},
			{"type":"object","properties":{"bark":{"type":"boolean"},"kind":{"type":"string","const":"dog"}},
			 "required":["bark","kind"],"additionalProperties":false},
			{"type":"object","properties":{"fins":{"type":"number","default":1},"kind":{"type":"string","const":"fish"}},
			 "required":["kind"],"additionalProperties":false}]},
		"e":{"type":"object","properties":{"z":{"type":"number","default":1}},"additionalProperties":false},
		"f":{"$ref":"#/$defs/d"},"g":{"$ref":"#/$defs/d","description":"a ref"}},
		"required":["a","b","c","d"],"additionalProperties":false,
		"$defs":{"d":{"type":"object","properties":{"z":{"type":"number","default":1}},"additionalProperties":false}}}`)
}

func TestJSONSchemaModifiersAndIsolation(t *testing.T) {
	s := MustShape(map[string]any{
		"a": Nullable(Number), "b": Nullable(), "c": Describe("desc", Catch(0, Min(2, Number))),
		"d": Transform(func(v any, s *State) any { return v }, Max(3, String)), "e": Ignore(Min(2, Number)),
		"f": Coerce(Boolean), "g": Default(3, Number), "h": Optional(Nullable(Integer)),
	})
	schemaWant(t, "modifiers", s.JSONSchema(), `{`+draft+`,"type":"object","properties":{
		"a":{"type":["number","null"]},"b":{},"c":{"type":"number","minimum":2,"description":"desc"},
		"d":{"type":"string","minLength":1,"maxLength":3},"e":{"type":"number","minimum":2},"f":{"type":"boolean"},
		"g":{"type":"number","default":3},"h":{"type":["integer","null"],"default":0}},
		"required":["a","c","d","f"],"additionalProperties":false}`)
}

func TestJSONSchemaRoot(t *testing.T) {
	schemaWant(t, "number", MustShape(Number).JSONSchema(), `{`+draft+`,"type":"number"}`)
	schemaWant(t, "literal", MustShape(1).JSONSchema(), `{`+draft+`,"type":"number","default":1}`)
	schemaWant(t, "never", MustShape(Never()).JSONSchema(), `{`+draft+`,"not":{}}`)
	schemaWant(t, "node", Min(2, Number).JSONSchema(), `{`+draft+`,"type":"number","minimum":2}`)
	schemaWant(t, "nil", (*Schema)(nil).JSONSchema(), `{`+draft+`}`)
	schemaWant(t, "key expression", MustShape(map[string]any{"a: Min(2)": 0}).JSONSchema(),
		`{`+draft+`,"type":"object","properties":{"a":{"type":"number","minimum":2,"default":0}},"additionalProperties":false}`)
}

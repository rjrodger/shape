package shape

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

// Structs as values and as specs (structs.go).

type stAddress struct {
	Street string `json:"street"`
	City   string `json:"city,omitempty"`
}

type stAudit struct {
	CreatedBy string `json:"createdBy"`
	hidden    string
}

type stLabel struct {
	Text string `json:"text"`
}

// StExported is an exported embedded type; its fields are promoted too.
type StExported struct {
	Version int `json:"version"`
}

type stPtrBase struct {
	Base string `json:"base"`
}

type stUser struct {
	stAudit
	StExported
	*stPtrBase
	stLabel  `json:"label"`
	Name     string            `json:"name"`
	Age      int               `json:"age"`
	Nick     string            `json:"nick,omitempty"`
	Secret   string            `json:"-"`
	Untagged bool              ``
	Renamed  string            `json:",omitempty"`
	Home     stAddress         `json:"home"`
	Work     *stAddress        `json:"work"`
	Tags     []string          `json:"tags"`
	Pair     [2]int            `json:"pair"`
	Scores   map[string]int    `json:"scores"`
	Odd      map[int]string    `json:"odd"`
	When     time.Time         `json:"when"`
	Any      any               `json:"any"`
	Ref      *int              `json:"ref"`
	Meta     map[string]any    `json:"meta"`
	Nested   []stAddress       `json:"nested"`
	Iface    any               `json:"iface"`
	Deep     map[string][]*int `json:"deep"`
	private  int
}

func stWant(t *testing.T, name string, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%s = %#v, want %#v", name, got, want)
	}
}

func TestStructValueReads(t *testing.T) {
	seven := 7
	when := time.Date(2024, 1, 2, 3, 4, 5, 0, time.UTC)
	u := stUser{
		stAudit:    stAudit{CreatedBy: "sys", hidden: "x"},
		stLabel:    stLabel{Text: "L"},
		StExported: StExported{Version: 3},
		stPtrBase:  &stPtrBase{Base: "p"},
		Name:       "Ann",
		Age:        30,
		Secret:     "s",
		Untagged:   true,
		Home:       stAddress{Street: "1 Main", City: ""},
		Work:       &stAddress{Street: "2 Side", City: "Town"},
		Tags:       []string{"a", "b"},
		Pair:       [2]int{1, 2},
		Scores:     map[string]int{"x": 1},
		Odd:        map[int]string{1: "one"},
		When:       when,
		Any:        "free",
		Ref:        &seven,
		Meta:       nil,
		Nested:     []stAddress{{Street: "3"}},
		Iface:      &seven,
		Deep:       map[string][]*int{"k": {&seven, nil}},
		private:    9,
	}

	got, ok := objectValue(u)
	if !ok {
		t.Fatal("struct should read as an object")
	}
	want := map[string]any{
		"createdBy": "sys",
		"label":     map[string]any{"text": "L"},
		"version":   3,
		"base":      "p",
		"name":      "Ann",
		"age":       30,
		"Untagged":  true,
		"home":      map[string]any{"street": "1 Main"},
		"work":      map[string]any{"street": "2 Side", "city": "Town"},
		"tags":      []any{"a", "b"},
		"pair":      []any{1, 2},
		"scores":    map[string]any{"x": 1},
		"odd":       map[int]string{1: "one"},
		"when":      when,
		"any":       "free",
		"ref":       7,
		"meta":      nil,
		"nested":    []any{map[string]any{"street": "3"}},
		"iface":     7,
		"deep":      map[string]any{"k": []any{7, nil}},
	}
	stWant(t, "struct fields", got, want)

	// A pointer to a struct reads the same; a nil pointer is not an object.
	got2, ok := objectValue(&u)
	if !ok || !reflect.DeepEqual(got2, want) {
		t.Fatalf("pointer to struct should read as the struct")
	}
	var nilUser *stUser
	if _, ok := objectValue(nilUser); ok {
		t.Fatal("nil pointer should not read as an object")
	}

	// Maps of other value types read as map[string]any; other keys do not.
	got3, ok := objectValue(map[string]int{"n": 1})
	stWant(t, "map[string]int", got3, map[string]any{"n": 1})
	if !ok {
		t.Fatal("map[string]int should read as an object")
	}
	if _, ok := objectValue(map[int]int{1: 1}); ok {
		t.Fatal("map with non-string keys should not read as an object")
	}

	// A nil embedded pointer contributes nothing; a defined scalar type
	// reads as its built-in type.
	type Port int
	type Name string
	type withNil struct {
		*stPtrBase
		Port  Port          `json:"port"`
		Name  Name          `json:"name"`
		On    bool          `json:"on"`
		Ports []Port        `json:"ports"`
		ByKey map[Name]Port `json:"byKey"`
	}
	got4, _ := objectValue(withNil{Port: 8080, Name: "n", On: true, Ports: []Port{1}, ByKey: map[Name]Port{"k": 2}})
	stWant(t, "nil embedded pointer and defined scalars", got4, map[string]any{
		"port": 8080, "name": "n", "on": true, "ports": []any{1}, "byKey": map[string]any{"k": 2},
	})
	if _, isInt := got4["port"].(int); !isInt {
		t.Fatalf("port should be an int, is %T", got4["port"])
	}
	type config struct {
		Port Port `shape:"Min(1)"`
	}
	mustOK(t, MustShape(config{Port: 80}), map[string]any{})
	// Values reached through a struct or a typed map are converted; a
	// map[string]any is used as given.
	mustOK(t, MustShape(map[string]any{"port": Number}), map[string]Port{"port": 1})
	mustErr(t, MustShape(map[string]any{"port": Number}), map[string]Name{"port": "x"}, "not of type number")
	mustErr(t, MustShape(map[string]any{"port": Number}), map[string]any{"port": Port(1)}, "not of type number")

	// Plain values, times, and nils are not objects.
	for _, v := range []any{1, "s", nil, time.Now(), &when, []any{}} {
		if _, ok := objectValue(v); ok {
			t.Fatalf("%#v should not read as an object", v)
		}
	}

	// A nil interface field and a nil slice are present nulls.
	stWant(t, "nil interface", valueOf(reflect.ValueOf(&u).Elem().FieldByName("Iface"), false), 7)
	var empty stUser
	stWant(t, "nil slice", valueOf(reflect.ValueOf(empty).FieldByName("Tags"), false), nil)
	stWant(t, "nil any", valueOf(reflect.ValueOf(empty).FieldByName("Any"), false), nil)
	stWant(t, "nil pointer", valueOf(reflect.ValueOf(empty).FieldByName("Ref"), false), nil)
}

func TestStructValueValidates(t *testing.T) {
	type in struct {
		Name string `json:"name"`
		Age  int    `json:"age,omitempty"`
		Home struct {
			Street string `json:"street"`
		} `json:"home"`
	}
	s := MustShape(map[string]any{
		"name": String,
		"age":  42,
		"home": map[string]any{"street": String},
	})

	v := in{Name: "Ann"}
	v.Home.Street = "x"
	got := mustOK(t, s, v)
	stWant(t, "produced", got, map[string]any{
		"name": "Ann",
		"age":  42, // omitempty zero is absent, so the default fills it
		"home": map[string]any{"street": "x"},
	})

	got = mustOK(t, s, &in{Name: "Bob", Age: 7, Home: struct {
		Street string `json:"street"`
	}{Street: "y"}})
	stWant(t, "produced via pointer", got, map[string]any{
		"name": "Bob",
		"age":  7,
		"home": map[string]any{"street": "y"},
	})

	mustErr(t, s, in{Home: struct {
		Street string `json:"street"`
	}{Street: "y"}},
		`Validation failed for property "name" with string "" because an empty string is not allowed.`)

	// Unknown fields are still rejected on a closed object.
	type extra struct {
		Name  string `json:"name"`
		Bogus int    `json:"bogus"`
		Home  struct {
			Street string `json:"street"`
		} `json:"home"`
	}
	mustErr(t, s, extra{Name: "a", Bogus: 1}, `the property "bogus" is not allowed`)

	// A nil pointer is not an object.
	var np *in
	mustErr(t, s, np, `Validation failed for value "null" because the value is not of type object.`)

	// Nested structs inside slices and maps of structs.
	rows := MustShape(map[string]any{
		"rows": []any{map[string]any{"street": String}},
		"byId": Child(map[string]any{"street": String}),
	})
	type addr struct {
		Street string `json:"street"`
	}
	got = mustOK(t, rows, map[string]any{
		"rows": []addr{{Street: "a"}, {Street: "b"}},
		"byId": map[string]addr{"one": {Street: "c"}},
	})
	stWant(t, "nested", got, map[string]any{
		"rows": []any{map[string]any{"street": "a"}, map[string]any{"street": "b"}},
		"byId": map[string]any{"one": map[string]any{"street": "c"}},
	})
}

func TestStructSpec(t *testing.T) {
	type config struct {
		Host  string `shape:"Min(1)"`
		Port  int    `shape:"Min(1).Max(65535)"`
		Debug bool   `shape:"Boolean"`
		Name  string `json:"name" shape:"String"`
		Note  string `json:"note,omitempty"`
		Skip  string `json:"-"`
		Empty string `shape:""`
		low   int
	}
	base := config{Host: "localhost", Port: 8080}

	m, ok := structSpec(base)
	if !ok {
		t.Fatal("struct should read as a spec")
	}
	stWant(t, "spec map", m, map[string]any{
		"Host: Min(1)":            "localhost",
		"Port: Min(1).Max(65535)": 8080,
		"Debug: Boolean":          false,
		"name: String":            "",
		"note":                    "", // omitempty is ignored for specs
		"Empty":                   "",
	})

	s := MustShape(base)
	got := mustOK(t, s, map[string]any{"Debug": true, "name": "n"})
	stWant(t, "defaults", got, map[string]any{
		"Host":  "localhost",
		"Port":  8080,
		"Debug": true,
		"name":  "n",
		"note":  "",
		"Empty": "",
	})
	mustErr(t, s, map[string]any{"name": "n"},
		`Validation failed for property "Debug" with value "undefined" because the value is required.`)
	mustErr(t, s, map[string]any{"Debug": true, "name": "n", "Port": 70000},
		`Value "70000" for property "Port" must be a maximum of 65535 (was 70000).`)
	mustErr(t, s, map[string]any{"Debug": true, "name": "n", "Host": ""},
		`Value "" for property "Host" must be a minimum length of 1 (was 0).`)
	mustErr(t, s, map[string]any{"Debug": true},
		`Validation failed for property "name" with value "undefined" because the value is required.`)

	// A struct spec validates a struct value of the same type.
	got = mustOK(t, s, config{Host: "h", Port: 1, Debug: true, Name: "z"})
	stWant(t, "struct in, map out", got, map[string]any{
		"Host": "h", "Port": 1, "Debug": true, "name": "z", "note": "", "Empty": "",
	})

	// A pointer to a struct is also a spec, and nested structs are nested
	// object specs.
	type outer struct {
		Inner config `json:"inner"`
		Tags  []string
	}
	s2 := MustShape(&outer{Inner: base, Tags: []string{"x"}})
	got = mustOK(t, s2, map[string]any{"inner": map[string]any{"Debug": false, "name": "q"}})
	stWant(t, "nested spec", got, map[string]any{
		"inner": map[string]any{"Host": "localhost", "Port": 8080, "Debug": false, "name": "q", "note": "", "Empty": ""},
		"Tags":  []any{},
	})
	got = mustOK(t, s2, map[string]any{"inner": map[string]any{"Debug": false, "name": "q"}, "Tags": []any{"y"}})
	stWant(t, "nested spec array", got.(map[string]any)["Tags"], []any{"y"})
	mustErr(t, s2, map[string]any{"inner": map[string]any{"Debug": false, "name": "q"}, "Tags": []any{1}},
		`Validation failed for index "Tags.0" with number "1" because the number is not of type string.`)

	// A bad key expression is a schema error.
	type bad struct {
		X int `shape:"Nope("`
	}
	if _, err := Shape(bad{}); err == nil {
		t.Fatal("expected a schema error for a bad shape tag")
	}

	// Not specs: nil pointers, non-structs, times.
	if _, ok := structSpec((*config)(nil)); ok {
		t.Fatal("nil pointer is not a spec")
	}
	if _, ok := structSpec(3); ok {
		t.Fatal("int is not a spec")
	}
	if _, ok := structSpec(time.Now()); ok {
		t.Fatal("time is not a spec")
	}
	if _, err := Shape((*config)(nil)); err == nil || !strings.Contains(err.Error(), "unsupported schema value type *shape.config") {
		t.Fatalf("nil struct pointer should be an unsupported spec, got %v", err)
	}
}

func TestValidateInto(t *testing.T) {
	type user struct {
		Name string `json:"name"`
		Age  int    `json:"age"`
	}
	s := MustShape(map[string]any{"name": String, "age": 42})

	var u user
	if err := s.ValidateInto(map[string]any{"name": "Ann"}, &u); err != nil {
		t.Fatal(err)
	}
	stWant(t, "filled", u, user{Name: "Ann", Age: 42})

	// Struct in, struct out.
	var v user
	if err := s.ValidateInto(user{Name: "Bob", Age: 7}, &v); err != nil {
		t.Fatal(err)
	}
	stWant(t, "round trip", v, user{Name: "Bob", Age: 7})

	// Validation errors come through unchanged.
	err := s.ValidateInto(map[string]any{}, &u)
	if err == nil || !strings.Contains(err.Error(), `property "name"`) {
		t.Fatalf("expected a validation error, got %v", err)
	}

	// A value encoding/json cannot marshal is an error.
	open := MustShape(Open(map[string]any{}))
	if err := open.ValidateInto(map[string]any{"c": make(chan int)}, &u); err == nil {
		t.Fatal("expected a marshal error")
	}

	// As is a target encoding/json cannot decode into.
	if err := s.ValidateInto(map[string]any{"name": "Ann"}, u); err == nil {
		t.Fatal("expected an unmarshal error for a non-pointer target")
	}
}

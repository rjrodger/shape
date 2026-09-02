package shape

import (
	"reflect"
	"strings"
	"testing"
)

// Object algebra: Pick, Omit, Partial, Extend.

func algObj(kv ...any) map[string]any {
	m := map[string]any{}
	for i := 0; i < len(kv); i += 2 {
		m[kv[i].(string)] = kv[i+1]
	}
	return m
}

func algWant(t *testing.T, name string, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("%s = %#v, want %#v", name, got, want)
	}
}

func TestAlgebraPick(t *testing.T) {
	base := algObj("a", 1.0, "b", String, "c", true)

	algWant(t, "default kept", mustOK(t, MustShape(Pick([]string{"a"}, base)), algObj()), algObj("a", 1.0))
	algWant(t, "single name", mustOK(t, MustShape(Pick("a", base)), algObj()), algObj("a", 1.0))
	algWant(t, "two names", mustOK(t, MustShape(Pick([]any{"a", "c"}, base)), algObj("c", false)), algObj("a", 1.0, "c", false))
	mustErr(t, MustShape(Pick([]string{"b"}, base)), algObj(),
		"Validation failed for property \"b\" because the property is missing.")
	mustErr(t, MustShape(Pick([]string{"a"}, base)), algObj("a", 2.0, "b", "x"),
		"Validation failed for object \"{a:2,b:x}\" because the property \"b\" is not allowed.")
	algWant(t, "open base", mustOK(t, MustShape(Pick("a", Open(base))), algObj("z", 1.0)), algObj("a", 1.0, "z", 1.0))

	// The source is untouched.
	mustErr(t, MustShape(base), algObj(), "because the property is missing")

	// Chained, and the G alias.
	algWant(t, "chained", mustOK(t, MustShape(Closed(base).Pick("a")), algObj()), algObj("a", 1.0))
	algWant(t, "alias", mustOK(t, MustShape(GPick("a", base)), algObj()), algObj("a", 1.0))

	// An object default is narrowed with the properties.
	d := Pick("a", Default(algObj("a", 1.0, "b", 2.0), base))
	algWant(t, "default narrowed", d.n.defaultValue, algObj("a", 1.0))

	// Construction faults surface at validation, as for any other bad spec.
	mustErr(t, MustShape(Pick("z", base)), algObj(), "Pick: unknown property \"z\"")
	mustErr(t, MustShape(Pick("a", String)), "x", "Pick needs an object shape")
	mustErr(t, MustShape(Pick("a")), algObj(), "Pick needs an object shape")
	mustErr(t, MustShape(Pick(1, base)), algObj(), "Pick needs a list of property names")
	mustErr(t, MustShape(Pick([]any{1}, base)), algObj(), "Pick needs a list of property names")
}

func TestAlgebraOmit(t *testing.T) {
	base := algObj("a", 1.0, "b", String, "c", true)

	algWant(t, "drops required", mustOK(t, MustShape(Omit("b", base)), algObj()), algObj("a", 1.0, "c", true))
	algWant(t, "unknown ignored", mustOK(t, MustShape(Omit([]string{"z"}, base)), algObj("b", "x")),
		algObj("a", 1.0, "b", "x", "c", true))
	mustErr(t, MustShape(Omit("b", base)), algObj("b", "x"),
		"Validation failed for object \"{b:x}\" because the property \"b\" is not allowed.")
	algWant(t, "chained", mustOK(t, MustShape(Closed(base).Omit([]any{"b", "c"})), algObj()), algObj("a", 1.0))
	algWant(t, "alias", mustOK(t, MustShape(GOmit("b", base)), algObj()), algObj("a", 1.0, "c", true))

	mustErr(t, MustShape(Omit("a", Number)), 1.0, "Omit needs an object shape")
	mustErr(t, MustShape(Omit(true, base)), algObj(), "Omit needs a list of property names")
}

func TestAlgebraPartial(t *testing.T) {
	base := algObj("a", 1.0, "b", String, "c", true)

	algWant(t, "absent", mustOK(t, MustShape(Partial(base)), algObj()), algObj("a", 1.0, "b", "", "c", true))
	mustErr(t, MustShape(Partial(base)), algObj("b", 1.0),
		"Validation failed for property \"b\" with number \"1\" because the number is not of type string.")
	// Shallow: a nested object's own properties are as they were.
	mustErr(t, MustShape(Partial(algObj("a", algObj("b", Number)))), algObj(),
		"Validation failed for property \"a.b\" because the property is missing.")
	algWant(t, "chained", mustOK(t, MustShape(Closed(base).Partial()), algObj()), algObj("a", 1.0, "b", "", "c", true))
	algWant(t, "alias", mustOK(t, MustShape(GPartial(base)), algObj()), algObj("a", 1.0, "b", "", "c", true))
	algWant(t, "object token", mustOK(t, MustShape(Partial(Object)), algObj("z", 1.0)), algObj("z", 1.0))

	// The source's children are untouched.
	mustErr(t, MustShape(base), algObj(), "because the property is missing")

	mustErr(t, MustShape(Partial(String)), "x", "Partial needs an object shape")
	mustErr(t, MustShape(Partial()), algObj(), "Partial needs an object shape")
}

func TestAlgebraExtend(t *testing.T) {
	base := algObj("a", 1.0, "b", String, "c", true)

	algWant(t, "adds", mustOK(t, MustShape(Extend(algObj("e", 2.0), base)), algObj("b", "x")),
		algObj("a", 1.0, "b", "x", "c", true, "e", 2.0))
	mustErr(t, MustShape(Extend(algObj("e", Number), base)), algObj("b", "x"),
		"Validation failed for property \"e\" because the property is missing.")
	algWant(t, "overrides", mustOK(t, MustShape(Extend(algObj("b", 5.0), base)), algObj()),
		algObj("a", 1.0, "b", 5.0, "c", true))
	mustErr(t, MustShape(Extend(algObj("e", 2.0), base)), algObj("b", "x", "z", 1.0),
		"Validation failed for object \"{b:x,z:1}\" because the property \"z\" is not allowed.")
	algWant(t, "open base", mustOK(t, MustShape(Extend(algObj("e", 2.0), Open(base))), algObj("b", "x", "z", 1.0)),
		algObj("a", 1.0, "b", "x", "c", true, "e", 2.0, "z", 1.0))
	// Only the extension's properties are taken, not its openness.
	mustErr(t, MustShape(Extend(Open(algObj("e", 2.0)), base)), algObj("b", "x", "z", 1.0),
		"the property \"z\" is not allowed")
	algWant(t, "object token ext", mustOK(t, MustShape(Extend(Object, base)), algObj("b", "x")),
		algObj("a", 1.0, "b", "x", "c", true))
	algWant(t, "chained", mustOK(t, MustShape(Closed(base).Extend(algObj("e", 2.0))), algObj("b", "x")),
		algObj("a", 1.0, "b", "x", "c", true, "e", 2.0))
	algWant(t, "alias", mustOK(t, MustShape(GExtend(algObj("e", 2.0), base)), algObj("b", "x")),
		algObj("a", 1.0, "b", "x", "c", true, "e", 2.0))

	mustErr(t, MustShape(Extend("x", base)), algObj(), "Extend needs an object to extend with")
	mustErr(t, MustShape(Extend(make(chan int), base)), algObj(), "Extend needs an object to extend with")
	mustErr(t, MustShape(Extend(algObj(), String)), "x", "Extend needs an object shape")
}

func TestAlgebraComposed(t *testing.T) {
	base := algObj("a", 1.0, "b", String, "c", true)

	n := Partial(Pick("b", Extend(algObj("e", Number), base)))
	algWant(t, "composed", mustOK(t, MustShape(n), algObj()), algObj("b", ""))

	// The base's own checks and metadata come along.
	m := Pick("a", Describe("d", Min(2, base)))
	mustErr(t, MustShape(m), algObj("a", 1.0), "must be a minimum length of 2")
	algWant(t, "meta copied", m.Meta()["description"], "d")

	// Key expressions in the source are compiled, so the real name is picked.
	ke := Pick("a", algObj("a: Min(2)", 0.0, "b", 1.0))
	mustErr(t, MustShape(ke), algObj("a", 1.0), "must be a minimum of 2")

	algWant(t, "render", stringifyNode(Omit("b", base).n, true), "{a: 1, c: true}")
}

func TestAlgebraExpr(t *testing.T) {
	// A key expression hands the example to the builder as its shape.
	algWant(t, "ke pick", mustOK(t, MustShape(algObj(`u: Pick(["a"])`, algObj("a", 1.0, "b", 2.0))), algObj()),
		algObj("u", algObj("a", 1.0)))
	mustErr(t, MustShape(algObj(`u: Omit(["a"])`, algObj("a", 1.0, "b", 2.0))), algObj("u", algObj("a", 1.0)),
		"the property \"a\" is not allowed")
	algWant(t, "ke partial", mustOK(t, MustShape(algObj("u: Partial", algObj("a", String))), algObj()),
		algObj("u", algObj("a", "")))
	algWant(t, "ke partial called", mustOK(t, MustShape(algObj("u: Partial()", algObj("a", String))), algObj("u", algObj())),
		algObj("u", algObj("a", "")))

	// A bare Object in the DSL is Type(Object), which is closed.
	algWant(t, "expr partial", mustOK(t, MustShape(MustExpr("Partial(Object)")), algObj()), algObj())
	algWant(t, "expr extend", mustOK(t, MustShape(MustExpr("Extend(Object,Object)")), algObj()), algObj())
	algWant(t, "expr omit", mustOK(t, MustShape(MustExpr(`Omit(["a"],Object)`)), algObj()), algObj())

	// Construction faults are expression errors, as they are thrown in TS.
	for src, want := range map[string]string{
		"Pick()":              "Pick: missing property names",
		"Omit()":              "Omit: missing property names",
		"Extend()":            "Extend: missing extension",
		`Pick(["a"])`:         "Shape: Pick needs an object shape",
		`Pick(["a"],Object)`:  `Shape: Pick: unknown property "a"`,
		`Omit(["a"],String)`:  "Shape: Omit needs an object shape",
		"Partial":             "Shape: Partial needs an object shape",
		"Extend(1,Object)":    "Shape: Extend needs an object to extend with",
		"Extend(Object,null)": "Shape: Extend needs an object shape",
	} {
		_, err := Expr(src)
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("%s: got %v, want %q", src, err, want)
		}
	}

	// A key expression that cannot be built at all, with or without its
	// example, is still an error.
	if _, err := Shape(algObj("a: Bogus(", 1.0)); err == nil {
		t.Fatal("expected an expression error")
	}
}

func TestAliasesAndKeyNames(t *testing.T) {
	// Every builder added since v10 has a G alias.
	for name, n := range map[string]*Node{
		"GNullable": GNullable(Number), "GCoerce": GCoerce(Number), "GEmail": GEmail(), "GUrl": GUrl(),
		"GUuid": GUuid(), "GDateTime": GDateTime(), "GIp": GIp(), "GIpv4": GIpv4(), "GIpv6": GIpv6(),
		"GCatch": GCatch(0, Number), "GDescribe": GDescribe("d", Number),
		"GDiscriminated": GDiscriminated("k", map[string]any{"a": Object}),
		"GTransform":     GTransform(func(v any, s *State) any { return v }, Number),
	} {
		if n == nil {
			t.Fatalf("%s: nil", name)
		}
	}
	if GInteger != Integer || GDate != Date {
		t.Fatal("token aliases")
	}

	// A quoted key-expression name decodes its escapes; one that does not
	// unquote keeps its inside.
	algWant(t, "escaped", mustOK(t, MustShape(map[string]any{`"a\"b": Min(1)`: 0.0}), algObj(`a"b`, 2.0)), algObj(`a"b`, 2.0))
	algWant(t, "bad escape", mustOK(t, MustShape(map[string]any{`"a\q": Min(1)`: 0.0}), algObj(`a\q`, 2.0)), algObj(`a\q`, 2.0))

	// A value-taking builder reads the key expression's example as its value.
	algWant(t, "default", mustOK(t, MustShape(map[string]any{"a: Default()": 5.0}), algObj()), algObj("a", 5.0))
	mustErr(t, MustShape(map[string]any{"a: Min()": 3.0}), algObj("a", 1.0), "must be a minimum of 3 (was 1)")
}

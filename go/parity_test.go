package shape

// Tests for behaviours corrected while bringing the Go port to parity with the
// canonical TypeScript implementation. The declarative cases are pinned by the
// shared corpus in ../test/*.tsv; these cover the Go-only surface and the
// regressions that were easiest to reintroduce.

import (
	"reflect"
	"strings"
	"testing"
)

// --- required descendants under an absent parent -------------------------

func TestNestedRequiredUnderAbsentParent(t *testing.T) {
	// cloneDefault skips required children, so short-cutting to it here used to
	// accept {} for a schema that requires a.b.
	s := MustShape(map[string]any{"a": map[string]any{"b": Number}})

	mustErr(t, s, map[string]any{}, `property "a.b"`)
	mustErr(t, s, map[string]any{"a": map[string]any{}}, `property "a.b"`)
	mustOK(t, s, map[string]any{"a": map[string]any{"b": 1.0}})

	deep := MustShape(map[string]any{"a": map[string]any{"b": map[string]any{"c": Number}}})
	mustErr(t, deep, map[string]any{}, `property "a.b.c"`)
	mustErr(t, deep, map[string]any{"a": map[string]any{}}, `property "a.b.c"`)

	// A required tuple position under an absent parent behaves the same way.
	tup := MustShape(map[string]any{"a": []any{Number, String}})
	mustErr(t, tup, map[string]any{}, `index "a.0"`)
}

func TestAbsentParentStillBuildsDefaults(t *testing.T) {
	// The descent must still construct nested defaults, not just raise.
	s := MustShape(map[string]any{"a": map[string]any{"b": 1.0}})
	out := mustOK(t, s, map[string]any{}).(map[string]any)
	if !reflect.DeepEqual(out["a"], map[string]any{"b": 1.0}) {
		t.Fatalf("nested default not built: %#v", out)
	}

	arr := MustShape(map[string]any{"a": []any{1.0, 2.0}})
	aout := mustOK(t, arr, map[string]any{}).(map[string]any)
	if !reflect.DeepEqual(aout["a"], []any{1.0, 2.0}) {
		t.Fatalf("tuple default not built: %#v", aout)
	}

	// A repeating-child array with nothing to repeat over stays empty.
	rep := MustShape(map[string]any{"a": []any{Number}})
	rout := mustOK(t, rep, map[string]any{}).(map[string]any)
	if !reflect.DeepEqual(rout["a"], []any{}) {
		t.Fatalf("repeating array default: %#v", rout)
	}
}

// --- Type() in the string DSL --------------------------------------------

func TestTypeAppliesInStringDSL(t *testing.T) {
	// A bare type token in the DSL parses to Required(tok), a *Node — which the
	// old type switch did not match, leaving the node as KindAny.
	s := MustShape(MustExpr("Type(String)"))
	mustErr(t, s, 1, "is not of type string")
	mustOK(t, s, "x")

	if k := MustExpr("Type(Number)").Kind(); k != KindNumber {
		t.Fatalf("expr Type(Number) kind = %q", k)
	}

	// Structural children are deliberately not carried across, so Type(Object)
	// is a closed object and Type(Array) accepts any elements (as in TS).
	obj := MustShape(MustExpr("Type(Object)"))
	mustOK(t, obj, map[string]any{})
	mustErr(t, obj, map[string]any{"a": 1.0}, `property "a" is not allowed`)

	arr := MustShape(MustExpr("Type(Array)"))
	mustOK(t, arr, []any{1.0, "x"})
	mustErr(t, arr, map[string]any{}, "is not of type array")

	// The builder form takes a Kind or a kind name too.
	mustErr(t, MustShape(Type(KindNumber)), "x", "is not of type number")
	mustErr(t, MustShape(Type("number")), "x", "is not of type number")

	// An unrecognized reference leaves the node alone rather than panicking.
	if k := Type(42).Kind(); k != KindAny {
		t.Fatalf("Type(42) kind = %q", k)
	}
}

// --- Rest validates elements ---------------------------------------------

func TestRestValidatesEveryElement(t *testing.T) {
	// arrRest was only consulted from the tuple branch, so a Rest with no tuple
	// positions in front of it validated nothing at all.
	s := MustShape(MustExpr("Rest(Number)"))
	mustOK(t, s, []any{1.0, 2.0, 3.0})
	mustErr(t, s, []any{1.0, "x"}, `index "1"`)
	mustErr(t, s, []any{"x"}, "is not of type number")
	mustErr(t, s, []any{1.0, nil}, `index "1"`)

	// Nested rest elements are validated too.
	nested := MustShape(map[string]any{"a": MustExpr("Rest(String)")})
	mustOK(t, nested, map[string]any{"a": []any{"x", "y"}})
	mustErr(t, nested, map[string]any{"a": []any{"x", 2.0}}, `index "a.1"`)
}

// --- Ignore at the root ---------------------------------------------------

func TestIgnoreAtRoot(t *testing.T) {
	s := MustShape(Ignore(Number))

	// A clean value survives.
	if out := mustOK(t, s, 5.0); out != 5.0 {
		t.Fatalf("ignore dropped a valid value: %#v", out)
	}

	// A failing value is dropped, and its errors with it.
	out, err := s.Validate("x")
	if err != nil {
		t.Fatalf("ignore leaked an error: %v", err)
	}
	if out != nil {
		t.Fatalf("ignore kept a failing value: %#v", out)
	}
}

// --- empty-string literal spec -------------------------------------------

func TestEmptyStringLiteralSpecAcceptsEmpty(t *testing.T) {
	// Shape("") used to reject its own default value.
	mustOK(t, MustShape(""), "")
	mustOK(t, MustShape(""), "x")
	mustErr(t, MustShape("ab"), "", "an empty string is not allowed")
}

// --- Never on an absent key ----------------------------------------------

func TestNeverRejectsAbsentValue(t *testing.T) {
	s := MustShape(map[string]any{"a": Never(String)})
	mustErr(t, s, map[string]any{}, "no value is allowed")
	mustErr(t, s, map[string]any{"a": "x"}, "no value is allowed")
}

// --- a bare regexp is a type, not a check --------------------------------

func TestBareRegexpIsAType(t *testing.T) {
	s := MustShape(MustExpr(`/^a.+/`))
	mustOK(t, s, "abc")
	mustErr(t, s, "zzz", `the string did not match /^a.+/`)
	mustErr(t, s, "", `the string did not match /^a.+/`)
	mustErr(t, s, 1, "the number is not of type string")
	mustErr(t, s, Null, "the value is not of type string")

	// Check(/re/) stays an explicit check and reports as one.
	c := MustShape(MustExpr(`Check(/^[0-9]+$/)`))
	mustOK(t, c, "12")
	mustErr(t, c, 1, `check "/^[0-9]+$/" failed`)

	// Fault overrides the message on both paths.
	mustErr(t, MustShape(MustExpr(`/^a.+/`).Fault("nope")), "zzz", "nope")
	mustErr(t, MustShape(MustExpr(`/^a.+/`).Fault("nope")), 1, "nope")
}

// --- explicit present null at the root -----------------------------------

func TestNullSentinel(t *testing.T) {
	s := MustShape(1.0)

	// Absent: the default fills, as before.
	if out := mustOK(t, s, nil); out != 1.0 {
		t.Fatalf("Validate(nil) = %#v, want the default", out)
	}

	// Present and null: a type error, matching TS Shape(1)(null).
	mustErr(t, s, Null, `value "null" because the value is not of type number`)

	// Null nested means the same as a nested nil.
	obj := MustShape(map[string]any{"a": Number})
	mustErr(t, obj, map[string]any{"a": Null}, `property "a"`)
	mustErr(t, obj, map[string]any{"a": nil}, `property "a"`)

	// Against an untyped shape it is simply a null value.
	if out := mustOK(t, MustShape(Any), Null); out != nil {
		t.Fatalf("Any accepted Null as %#v", out)
	}
}

// --- chained builders added for TS parity --------------------------------

func TestChainedBuildersParity(t *testing.T) {
	mustOK(t, MustShape(Optional().Any()), "anything")
	mustErr(t, MustShape(Optional().Number()), "x", "is not of type number")
	mustErr(t, MustShape(Optional().Boolean()), "x", "is not of type boolean")
	mustErr(t, MustShape(Optional().Object()), "x", "is not of type object")
	mustErr(t, MustShape(Optional().Array()), "x", "is not of type array")
	mustErr(t, MustShape(Optional().Function()), "x", "is not of type function")
	mustErr(t, MustShape(Optional().Type(String)), 1, "is not of type string")

	// Define / Refer / Rename chain onto an existing node.
	dr := MustShape(map[string]any{
		"def": Optional().Define("d"),
		"use": Optional().Refer("d"),
	})
	out := mustOK(t, dr, map[string]any{"def": 1.0, "use": 2.0}).(map[string]any)
	if out["use"] != 2.0 {
		t.Fatalf("chained Refer: %#v", out)
	}

	rn := MustShape(map[string]any{"a": Optional().Rename("b")})
	rout := mustOK(t, rn, map[string]any{"a": 1.0}).(map[string]any)
	if rout["b"] != 1.0 {
		t.Fatalf("chained Rename: %#v", rout)
	}
	if _, still := rout["a"]; still {
		t.Fatalf("chained Rename kept the source key: %#v", rout)
	}
}

// --- the differential harness's own decoder ------------------------------

func TestDiffCasePanicIsRecorded(t *testing.T) {
	// runDiffCase must record a panic rather than aborting the whole run.
	res := runDiffCase(diffCase{Name: "boom", Spec: func() {}, Input: 1})
	if !strings.HasPrefix(res.Build, "PANIC: ") && !strings.HasPrefix(res.Build, "ERR: ") {
		t.Fatalf("expected a recorded build failure, got %#v", res)
	}
}

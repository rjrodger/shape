package shape

import (
	"math"
	"strings"
	"testing"
	"time"
)

// A builder called with the wrong argument returns a node that accepts
// nothing and says why, the message TypeScript throws at build.
func TestBuilderArguments(t *testing.T) {
	cases := map[string]*Node{
		"Shape: Min needs a number":                       Min("x"),
		"Shape: Max needs a number":                       Max(nil),
		"Shape: Above needs a number":                     Above(true),
		"Shape: Below needs a number":                     Below("q"),
		"Shape: Len needs a whole number of zero or more": Len(-1),
		"Shape: Define needs a name":                      Define(""),
		"Shape: Refer needs a name":                       Refer(""),
		"Shape: Rename needs a name":                      Rename(""),
	}
	for msg, n := range cases {
		_, err := MustShape(map[string]any{"a": n}).Validate(map[string]any{"a": 1.0})
		if err == nil || !strings.Contains(err.Error(), msg) {
			t.Fatalf("%s: got %v", msg, err)
		}
	}
	// A time is a bound too (for a Date), and a numeric string is a number,
	// as in TypeScript.
	if Min(time.Unix(0, 0)).n.kind == KindNever {
		t.Fatal("a time is not accepted as a bound")
	}
	if _, err := MustShape(map[string]any{"a": Min("2", Number)}).Validate(map[string]any{"a": 3.0}); err != nil {
		t.Fatal(err)
	}
}

// The same faults through the chained forms, and the bounds TypeScript's
// Number.isFinite rejects.
func TestBuilderArgumentsChainedAndNonFinite(t *testing.T) {
	chained := map[string]*Node{
		"Shape: Min needs a number":                       buildize(Number).Min("x"),
		"Shape: Max needs a number":                       buildize(Number).Max(nil),
		"Shape: Above needs a number":                     buildize(Number).Above("q"),
		"Shape: Below needs a number":                     buildize(Number).Below(true),
		"Shape: Len needs a whole number of zero or more": buildize(String).Len(-1),
	}
	for msg, n := range chained {
		_, err := MustShape(map[string]any{"a": n}).Validate(map[string]any{"a": 1.0})
		if err == nil || !strings.Contains(err.Error(), msg) {
			t.Fatalf("chained %s: got %v", msg, err)
		}
	}
	for _, bad := range []any{math.NaN(), math.Inf(1), math.Inf(-1), "NaN", "Inf", "", " "} {
		if Min(bad).n.kind != KindNever {
			t.Fatalf("bound %#v accepted", bad)
		}
	}
}

// A Define chained onto a node after the compile is found by a strict
// Refer visited before it, since the definition table is read again with
// the validators.
func TestLateDefineIsFound(t *testing.T) {
	leaf := Required(Number)
	s := MustShape(map[string]any{
		"a": ReferWith("d", ReferOptions{Strict: true}, Number),
		"b": leaf,
	})
	in := map[string]any{"a": 1.0, "b": 2.0}
	if _, err := s.Validate(in); err == nil {
		t.Fatal("an undefined strict Refer did not fail")
	}
	leaf.Define("d")
	if _, err := s.Validate(in); err != nil {
		t.Fatalf("a late Define was not found: %v", err)
	}
}

// A Transform chained onto a node after the compile takes the schema off
// the pooled context, so what it puts in Custom and returns survives.
func TestLateTransformIsNoticed(t *testing.T) {
	leaf := Required(Number)
	s := MustShape(map[string]any{"a": leaf})
	if !s.isPure() {
		t.Fatal("not pure before the transform")
	}
	leaf.Transform(func(val any, state *State) any {
		state.Ctx.Custom["k"] = val
		return state.Ctx.Custom
	})
	out, err := s.Validate(map[string]any{"a": 1.0})
	if err != nil {
		t.Fatal(err)
	}
	got, _ := out.(map[string]any)["a"].(map[string]any)
	if got["k"] != 1.0 {
		t.Fatalf("the late transform's map was cleared: %v", out)
	}
}

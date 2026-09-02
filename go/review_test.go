package shape

import (
	"math"
	"regexp"
	"testing"
)

// Behaviour the documentation review of 2026-09-02 found wrong or unpinned.

// The string form rejects a builder called wrongly, as expr throws in
// TypeScript.
func TestExprFaultIsAnError(t *testing.T) {
	for src, want := range map[string]string{
		`String.Min("x")`:  "Shape: Min needs a number",
		`Len(-1)`:          "Shape: Len needs a whole number of zero or more",
		`Open(Define(""))`: "Shape: Define needs a name",
	} {
		if _, err := Expr(src); err == nil || err.Error() != want {
			t.Fatalf("%s: got %v, want %s", src, err, want)
		}
	}
}

// Exact compares numbers by value across kinds, so an int literal in the
// spec matches the float64 a JSON decoder produces.
func TestExactNumberKinds(t *testing.T) {
	s, err := Shape(Exact(1, "a"))
	if err != nil {
		t.Fatal(err)
	}
	for _, in := range []any{1, 1.0, int64(1), int8(1), uint(1), float32(1), "a"} {
		mustValid(t, s, in)
	}
	for _, in := range []any{2, 1.5, "1", true, nil} {
		if _, err := s.Validate(in); err == nil {
			t.Fatalf("%v: expected an error", in)
		}
	}
	// Large integers keep their precision: no detour through float64.
	big, _ := Shape(Exact(int64(9007199254740993)))
	mustValid(t, big, int64(9007199254740993))
	mustValid(t, big, uint64(9007199254740993))
	for _, in := range []any{int64(9007199254740992), float64(9007199254740992), uint64(9007199254740994)} {
		if _, err := big.Validate(in); err == nil {
			t.Fatalf("%v: expected an error", in)
		}
	}
	// NaN equals nothing, as in JavaScript.
	nan, _ := Shape(Exact(math.NaN()))
	if _, err := nan.Validate(math.NaN()); err == nil {
		t.Fatal("NaN: expected an error")
	}
	if exactRat("x") != nil {
		t.Fatal("exactRat of a string")
	}
}

// A deliberate Fault on a Never node is a valid expression; only a builder
// given a wrong argument is refused.
func TestExprKeepsDeliberateFaults(t *testing.T) {
	for _, src := range []string{`Never.Fault("f")`, `Fault("f", Never)`} {
		n, err := Expr(src)
		if err != nil {
			t.Fatalf("%s: %v", src, err)
		}
		s, _ := Shape(n)
		if _, err := s.Validate(1); err == nil || err.Error() != "f" {
			t.Fatalf("%s: got %v, want f", src, err)
		}
	}
}

// A Check is not called for an absent value; the required check speaks.
func TestCheckSkipsAbsent(t *testing.T) {
	called := false
	s, _ := Shape(map[string]any{"a": Check(func(val any, update *Update, state *State) bool {
		called = true
		return true
	})})
	want := `Validation failed for property "a" because the property is missing.`
	if _, err := s.Validate(map[string]any{}); called || err == nil || err.Error() != want {
		t.Fatalf("called=%v err=%v", called, err)
	}
	re, _ := Shape(map[string]any{"a": Check(regexp.MustCompile("^x"))})
	if _, err := re.Validate(map[string]any{}); err == nil || err.Error() != want {
		t.Fatalf("regexp: %v", err)
	}
}

// Some threads a map through its matching branches, as TypeScript produces
// one object in place, and runs each branch on the original scalar.
func TestSomeThreadsContainers(t *testing.T) {
	s, _ := Shape(Some(Open(map[string]any{"a": 1}), Open(map[string]any{"a": 2})))
	out := mustValid(t, s, map[string]any{}).(map[string]any)
	if out["a"] != 1 {
		t.Fatalf("got %v, want a: 1", out)
	}
	sc, _ := Shape(Some(Coerce(Number), Max(2)))
	if out := mustValid(t, sc, "12"); out != "12" {
		t.Fatalf("got %v (%T), want \"12\"", out, out)
	}
	cs, _ := Shape(Some(Max(2), Coerce(Number)))
	if out := mustValid(t, cs, "12"); out != 12.0 {
		t.Fatalf("got %v (%T), want 12", out, out)
	}
	// A branch that replaces the map leaves the next branch the map.
	rp, _ := Shape(Some(Catch(1, Number), Open(map[string]any{"a": 1})))
	if out := mustValid(t, rp, map[string]any{}).(map[string]any); out["a"] != 1 {
		t.Fatalf("got %v, want a: 1", out)
	}
	if out := mustValid(t, rp, 3); out != 3.0 && out != 3 {
		t.Fatalf("got %v (%T), want 3", out, out)
	}
	if !isContainer(&struct{}{}) || isContainer(nil) || isContainer(3) {
		t.Fatal("isContainer")
	}
	m := map[string]any{}
	if !sameContainer(&m, m) || sameContainer(m, []any{}) || sameContainer(m, 1) {
		t.Fatal("sameContainer")
	}
}

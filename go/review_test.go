package shape

import "testing"

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
	if !isContainer(&struct{}{}) || isContainer(nil) || isContainer(3) {
		t.Fatal("isContainer")
	}
}

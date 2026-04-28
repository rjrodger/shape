package shape

import (
	"reflect"
	"regexp"
	"strings"
	"testing"
)

func mustValid(t *testing.T, s *Schema, in any) any {
	t.Helper()
	out, err := s.Validate(in)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	return out
}

func mustInvalid(t *testing.T, s *Schema, in any, wantSubstr string) {
	t.Helper()
	_, err := s.Validate(in)
	if err == nil {
		t.Fatalf("expected error containing %q", wantSubstr)
	}
	if wantSubstr != "" && !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(wantSubstr)) {
		t.Fatalf("expected error containing %q, got %q", wantSubstr, err.Error())
	}
}

// --- Instance methods ----------------------------------------------------

func TestSchemaMatchValidError(t *testing.T) {
	s := MustShape(map[string]any{"x": Number})

	if !s.Match(map[string]any{"x": 1}) {
		t.Fatal("expected match")
	}
	if s.Match(map[string]any{"x": "no"}) {
		t.Fatal("did not expect match")
	}
	if !s.Valid(map[string]any{"x": 1}) {
		t.Fatal("expected valid")
	}

	errs := s.Error(map[string]any{"x": "no"})
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errs))
	}
	if errs[0].Why != WhyType {
		t.Fatalf("expected why=type, got %q", errs[0].Why)
	}
	if errs[0].Path != "x" {
		t.Fatalf("expected path=x, got %q", errs[0].Path)
	}
}

func TestSchemaSpec(t *testing.T) {
	s := MustShape(map[string]any{"x": Number, "y": "ok"})
	spec := s.Spec()
	m, ok := spec.(map[string]any)
	if !ok {
		t.Fatalf("expected spec map, got %T", spec)
	}
	if m["kind"] != string(KindObject) {
		t.Fatalf("expected object kind, got %v", m["kind"])
	}
}

// --- Min / Max / Above / Below / Len ------------------------------------

func TestMinMaxNumber(t *testing.T) {
	s := MustShape(Min(2, Max(10, Number)))
	mustValid(t, s, 5)
	mustInvalid(t, s, 1, "minimum")
	mustInvalid(t, s, 100, "maximum")
}

func TestMinStringLength(t *testing.T) {
	s := MustShape(Min(3, String))
	mustValid(t, s, "abcd")
	mustInvalid(t, s, "ab", "minimum length")
}

func TestLenArray(t *testing.T) {
	s := MustShape(Len(2, []any{Number}))
	mustValid(t, s, []any{1, 2})
	mustInvalid(t, s, []any{1, 2, 3}, "exactly 2")
}

func TestAboveBelow(t *testing.T) {
	s := MustShape(Above(0, Below(10, Number)))
	mustValid(t, s, 5)
	mustInvalid(t, s, 0, "above 0")
	mustInvalid(t, s, 10, "below 10")
}

// --- Exact / Never / Empty ---------------------------------------------

func TestExact(t *testing.T) {
	s := MustShape(Exact("a", "b", 3))
	mustValid(t, s, "a")
	mustValid(t, s, 3)
	mustInvalid(t, s, "c", "exactly one of")
}

func TestNever(t *testing.T) {
	s := MustShape(Never())
	mustInvalid(t, s, 1, "no value is allowed")
}

func TestEmptyString(t *testing.T) {
	// Plain String token rejects empty strings.
	s := MustShape(String)
	mustInvalid(t, s, "", "empty")

	// Empty(String) accepts them.
	se := MustShape(Empty(String))
	out, err := se.Validate("")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if out != "" {
		t.Fatalf("expected empty string, got %v", out)
	}
}

// --- Skip / Default / Ignore -------------------------------------------

func TestSkip(t *testing.T) {
	s := MustShape(map[string]any{"x": Skip(Number)})
	out := mustValid(t, s, map[string]any{}).(map[string]any)
	if _, has := out["x"]; has {
		t.Fatalf("expected x to be skipped, got %v", out)
	}
}

func TestDefault(t *testing.T) {
	s := MustShape(map[string]any{"x": Default(42, Number)})
	out := mustValid(t, s, map[string]any{}).(map[string]any)
	if out["x"] != 42 {
		t.Fatalf("expected default 42, got %v", out["x"])
	}
}

func TestIgnoreSuppressesErrors(t *testing.T) {
	s := MustShape(map[string]any{"x": Ignore(Number)})
	out, err := s.Validate(map[string]any{"x": "not a number"})
	if err != nil {
		t.Fatalf("ignored child should not fail: %v", err)
	}
	if _, has := out.(map[string]any)["x"]; has {
		// Ignore yields undefined; either keep raw or drop — both acceptable.
		// We assert no error for now.
	}
}

// --- One / Some / All --------------------------------------------------

func TestOne(t *testing.T) {
	s := MustShape(One(Number, String))
	mustValid(t, s, 5)
	mustValid(t, s, "x")
	mustInvalid(t, s, true, "one of")
}

func TestSome(t *testing.T) {
	s := MustShape(Some(Number, String))
	mustValid(t, s, 1)
	mustValid(t, s, "ok")
	mustInvalid(t, s, true, "any of")
}

func TestAll(t *testing.T) {
	s := MustShape(All(Min(2, Number), Max(10, Number)))
	mustValid(t, s, 5)
	mustInvalid(t, s, 1, "all of")
}

// --- Check (function + regex) ------------------------------------------

func TestCheckFunction(t *testing.T) {
	s := MustShape(Check(func(val any, update *Update, state *State) bool {
		s, ok := val.(string)
		if !ok || !strings.HasPrefix(s, "x-") {
			update.Why = "prefix"
			return false
		}
		return true
	}))
	mustValid(t, s, "x-good")
	mustInvalid(t, s, "bad", "check")
}

func TestCheckRegex(t *testing.T) {
	re := regexp.MustCompile(`^[a-z]+$`)
	s := MustShape(Check(re))
	mustValid(t, s, "abc")
	mustInvalid(t, s, "ABC", "did not match")
}

// --- Tuple arrays ------------------------------------------------------

func TestTupleArray(t *testing.T) {
	s := MustShape([]any{Number, String, Boolean})
	mustValid(t, s, []any{1, "x", true})
	mustInvalid(t, s, []any{1, 2, true}, "string")
}

func TestArrayChildSingleRepeats(t *testing.T) {
	s := MustShape([]any{Number})
	mustValid(t, s, []any{1, 2, 3, 4})
}

// --- Open / Closed / Child ---------------------------------------------

func TestChildObject(t *testing.T) {
	s := MustShape(Child(Number, map[string]any{"a": 1}))
	out := mustValid(t, s, map[string]any{"a": 2, "b": 7}).(map[string]any)
	if out["b"] != 7 {
		t.Fatalf("expected open child to retain b: %v", out)
	}
	mustInvalid(t, s, map[string]any{"a": 2, "b": "x"}, "number")
}

// --- NaN ---------------------------------------------------------------

func TestNumberRejectsNaN(t *testing.T) {
	s := MustShape(Number)
	mustInvalid(t, s, nanFloat(), "number")
}

// --- Fault custom error ------------------------------------------------

func TestFault(t *testing.T) {
	s := MustShape(Fault("bad value $VALUE at $PATH", map[string]any{"x": Number}))
	_, err := s.Validate("not an object")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "bad value") {
		t.Fatalf("expected fault message, got %q", err.Error())
	}
}

// --- Stringify ---------------------------------------------------------

func TestStringify(t *testing.T) {
	s := MustShape(Min(2, String))
	out := s.String()
	if !strings.Contains(out, "Min(2)") || !strings.Contains(out, "String") {
		t.Fatalf("expected Stringified node to contain builder names: %q", out)
	}
}

// --- Define / Refer ----------------------------------------------------

func TestDefineRefer(t *testing.T) {
	s := MustShape(map[string]any{
		"src":  Define("name", String),
		"echo": Refer("name", String),
	})
	out := mustValid(t, s, map[string]any{"src": "alice", "echo": "alice"}).(map[string]any)
	if out["echo"] != "alice" {
		t.Fatalf("expected echo=alice, got %v", out["echo"])
	}
}

// --- Rename ------------------------------------------------------------

func TestRename(t *testing.T) {
	s := MustShape(map[string]any{
		"a": Rename("b", Number),
	})
	out, err := s.Validate(map[string]any{"a": 1})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	m := out.(map[string]any)
	if m["b"] != 1 {
		t.Fatalf("expected b=1, got %v", m)
	}
	if _, has := m["a"]; has {
		t.Fatalf("expected a to be removed: %v", m)
	}
}

// --- Chainable methods ------------------------------------------------

func TestChainable(t *testing.T) {
	s := MustShape(Required().Min(2).Max(5))
	mustValid(t, s, 3)
	mustInvalid(t, s, 1, "minimum")
	mustInvalid(t, s, 9, "maximum")
}

// --- Required-on-string-token rejects "" -------------------------------

func TestRequiredStringRejectsEmpty(t *testing.T) {
	s := MustShape(map[string]any{"name": String})
	mustInvalid(t, s, map[string]any{"name": ""}, "empty")
}

// --- Path correctness --------------------------------------------------

func TestNestedErrorPath(t *testing.T) {
	s := MustShape(map[string]any{
		"a": map[string]any{
			"b": []any{Number},
		},
	})
	errs := s.Error(map[string]any{
		"a": map[string]any{"b": []any{1, "no"}},
	})
	if len(errs) != 1 {
		t.Fatalf("expected 1 err, got %d (%v)", len(errs), errs)
	}
	if errs[0].Path != "a.b.1" {
		t.Fatalf("expected path a.b.1, got %q", errs[0].Path)
	}
}

// --- Helpers -----------------------------------------------------------

func nanFloat() float64 {
	zero := 0.0
	return zero / zero
}

// Sanity check that DeepEqual still works with our outputs.
func TestDeepEqualOutputs(t *testing.T) {
	s := MustShape(map[string]any{"x": 1, "y": "default"})
	out := mustValid(t, s, map[string]any{"x": 2})
	want := map[string]any{"x": 2, "y": "default"}
	if !reflect.DeepEqual(out, want) {
		t.Fatalf("expected %v, got %v", want, out)
	}
}

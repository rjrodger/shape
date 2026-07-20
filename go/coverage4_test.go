package shape

import (
	"regexp"
	"testing"
)

// --- buildize error path (invalid spec → deferred Never/fault) ----------

func TestBuildizeError(t *testing.T) {
	// A builder given an un-normalizable spec yields a node that fails validation.
	n := Min(1.0, func() {}) // func() is not a valid spec
	s := MustShape(map[string]any{"a": n})
	if _, err := s.Validate(map[string]any{"a": 1.0}); err == nil {
		t.Fatal("expected deferred spec error")
	}
}

// --- Closed on arrays (tuple-of-one) + chained -------------------------

func TestClosedArrays(t *testing.T) {
	// Closed turns a single-shape array into a fixed tuple-of-one.
	s := MustShape(Closed([]any{Number}))
	mustOK(t, s, []any{1.0})
	mustErr(t, s, []any{1.0, 2.0}, "not allowed")

	// Chained Closed on an array node.
	s2 := MustShape(buildize([]any{Number}).Closed())
	mustErr(t, s2, []any{1.0, 2.0}, "not allowed")
}

// --- Exact matches from the node default -------------------------------

func TestExactFromDefault(t *testing.T) {
	// An absent, defaulted Exact node matches via its default value.
	s := MustShape(map[string]any{"a": Default(1.0, Exact(1.0, 2.0))})
	out := mustOK(t, s, map[string]any{}).(map[string]any)
	if out["a"] != 1.0 {
		t.Fatalf("Exact-from-default: %#v", out)
	}
}

// --- Child / Rest coercion branches ------------------------------------

func TestChildRestCoercion(t *testing.T) {
	// Child with no carrier coerces to an open object.
	mustOK(t, MustShape(Child(Number)), map[string]any{"x": 1.0, "y": 2.0})
	mustErr(t, MustShape(Child(Number)), map[string]any{"x": "bad"}, "not of type number")

	// Rest with no carrier forces an array.
	mustOK(t, MustShape(map[string]any{"a": Rest(Number)}), map[string]any{"a": []any{}})

	// arrRest applies as the tail over a real tuple: [String, Number] then Booleans.
	s := MustShape(buildize([]any{String, Number}).Rest(Boolean))
	mustOK(t, s, []any{"x", 1.0, true, false})
	mustErr(t, s, []any{"x", 1.0, "bad"}, "not of type boolean")
}

// --- Define / Refer / Rename without spec + fill -----------------------

func TestDefineReferRenameForms(t *testing.T) {
	// Refer that is missing and not filled → left absent.
	s := MustShape(map[string]any{
		"def": Define("d", map[string]any{"v": Number}),
		"ref": Refer("d"),
	})
	out := mustOK(t, s, map[string]any{"def": map[string]any{"v": 1.0}}).(map[string]any)
	if _, has := out["ref"]; has {
		t.Fatalf("unfilled Refer should be absent: %#v", out)
	}

	// RenameWith with a carrier spec.
	sr := MustShape(map[string]any{"a": RenameWith("b", RenameOptions{}, Number)})
	out2 := mustOK(t, sr, map[string]any{"a": 1.0}).(map[string]any)
	if out2["b"] != 1.0 {
		t.Fatalf("RenameWith: %#v", out2)
	}
}

// --- Func with a carrier + Type string kind ----------------------------

func TestFuncAndTypeForms(t *testing.T) {
	mustOK(t, MustShape(map[string]any{"f": Func(Function)}), map[string]any{"f": func() {}})
	mustErr(t, MustShape(map[string]any{"a": Type("number")}), map[string]any{"a": "x"}, "not of type number")
}

// --- Argu: rest-with-none + skip-nonmatch ------------------------------

func TestArguRestAndSkip(t *testing.T) {
	a := MakeArgu("z")

	// Rest with no trailing args → single undefined slot (TS parity).
	got, err := a.Validate([]any{1.0}, "sig", map[string]any{
		"a": Number,
		"b": Rest(Number),
	})
	if err != nil {
		t.Fatalf("argu rest-none: %v", err)
	}
	if _, ok := got["b"].([]any); !ok {
		t.Fatalf("argu rest-none slot: %#v", got)
	}

	// Skip that does not match shifts the following positional arg down.
	got2, err := a.Validate([]any{2.0}, "sig", map[string]any{
		"a": Skip(String),
		"b": Number,
	})
	if err != nil {
		t.Fatalf("argu skip-nonmatch: %v", err)
	}
	if got2["b"] != 2.0 {
		t.Fatalf("argu skip-nonmatch: %#v", got2)
	}
}

// --- Expr / Build error and passthrough branches -----------------------

func TestExprBuildEdges(t *testing.T) {
	// Build with nested array + $$ passthrough + non-string leaves.
	bs, err := Build(map[string]any{
		"a":  []any{"Number", map[string]any{"deep": "Min(1,String)"}},
		"$$": "keep-me",
		"n":  true,
	})
	if err != nil {
		t.Fatalf("Build nested: %v", err)
	}
	_ = bs

	// Expr error branches.
	for _, bad := range []string{"Min(1", "Min 1)", "(", ")", "Min(1,)junk", ".Foo"} {
		if _, err := Expr(bad); err == nil {
			t.Fatalf("Expr(%q) should error", bad)
		}
	}

	// Build with a top-level string.
	if _, err := Build("Min(2,String)"); err != nil {
		t.Fatalf("Build string: %v", err)
	}
}

// --- normalize error propagation ---------------------------------------

func TestNormalizeErrors(t *testing.T) {
	// Invalid element inside an array spec.
	if _, err := Shape([]any{Number, func() {}}); err == nil {
		t.Fatal("array element error expected")
	}
	// Invalid value inside an object spec.
	if _, err := Shape(map[string]any{"a": func() {}}); err == nil {
		t.Fatal("object value error expected")
	}
}

// --- validate: after-fail with Done, All-fail, Some-none, array non-slice

func TestValidateBranches(t *testing.T) {
	// After returning false with Done → error and stop.
	af := buildize(Number).After(func(v any, u *Update, s *State) bool {
		u.Done = true
		u.Err = "after failed"
		return false
	})
	mustErr(t, MustShape(map[string]any{"a": af}), map[string]any{"a": 1.0}, "after failed")

	// All with one failing branch.
	mustErr(t, MustShape(map[string]any{"a": All(Number, Min(10.0))}), map[string]any{"a": 1.0}, "satisfy all")

	// Some with no matching branch.
	mustErr(t, MustShape(map[string]any{"a": Some(Number, Boolean)}), map[string]any{"a": "x"}, "satisfy any")

	// Array shape validating a non-array input.
	mustErr(t, MustShape([]any{Number}), map[string]any{"not": "array"}, "not of type array")

	// Object shape validating a non-object input.
	mustErr(t, MustShape(map[string]any{"a": Number}), "not-object", "not of type object")

	// Regexp check on a non-string value fails.
	mustErr(t, MustShape(map[string]any{"a": Check(regexp.MustCompile(`^a`))}), map[string]any{"a": 1.0}, "failed")
}

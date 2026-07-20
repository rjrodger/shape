package shape

import (
	"strings"
	"testing"
)

// --- Numeric type coverage (toFloat / toInt / isNumber / normalize) ----

func TestNumericTypes(t *testing.T) {
	// Every numeric type as a literal default, a Min bound, and an input value.
	nums := []any{
		int(2), int8(2), int16(2), int32(2), int64(2),
		uint(2), uint8(2), uint16(2), uint32(2), uint64(2),
		float32(2), float64(2),
	}
	for _, n := range nums {
		// As a literal default (normalize numeric arms).
		if _, err := Shape(map[string]any{"a": n}); err != nil {
			t.Fatalf("normalize %T: %v", n, err)
		}
		// As a Min bound (toFloat on the bound) with a passing value.
		s := MustShape(map[string]any{"a": Min(n, Number)})
		if _, err := s.Validate(map[string]any{"a": 9.0}); err != nil {
			t.Fatalf("Min(%T): %v", n, err)
		}
		// As an input value against a numeric shape (isNumber / toFloat on value).
		if _, err := MustShape(map[string]any{"a": Min(1.0, Number)}).Validate(map[string]any{"a": n}); err != nil {
			t.Fatalf("value %T: %v", n, err)
		}
	}

	// float32 NaN and float64 NaN normalize to the NaN kind.
	for _, nan := range []any{float32(nan32()), nan64()} {
		if _, err := Shape(nan); err != nil {
			t.Fatalf("NaN normalize %T: %v", nan, err)
		}
	}
}

func nan64() float64 { z := 0.0; return z / z }
func nan32() float32 { return float32(nan64()) }

// --- normalizeWith: *Node, *node, bare Kind ----------------------------

func TestNormalizeVariants(t *testing.T) {
	// *Node passthrough.
	if _, err := Shape(Min(1.0, Number)); err != nil {
		t.Fatal(err)
	}
	// bare Kind.
	if _, err := Shape(KindString); err != nil {
		t.Fatal(err)
	}
	// nil spec.
	if _, err := Shape(nil); err != nil {
		t.Fatal(err)
	}
	// *node passthrough via Inner.
	inner := Min(1.0, Number).Inner()
	if _, err := Shape(inner); err != nil {
		t.Fatal(err)
	}
}

// --- Kind() on TypeToken -----------------------------------------------

func TestTypeTokenKind(t *testing.T) {
	if Number.Kind() != KindNumber || String.Kind() != KindString {
		t.Fatal("TypeToken.Kind")
	}
}

// --- Error fallback rendering ------------------------------------------

func TestErrorFallbacks(t *testing.T) {
	// FieldError with no Text → "path: why"; no path → "why".
	fe := FieldError{Path: "a.b", Why: "custom"}
	if fe.Error() != "a.b: custom" {
		t.Fatalf("FieldError.Error path: %q", fe.Error())
	}
	fe2 := FieldError{Why: "bare"}
	if fe2.Error() != "bare" {
		t.Fatalf("FieldError.Error bare: %q", fe2.Error())
	}

	// ValidationError: nil-safe and empty.
	var ve *ValidationError
	if ve.Error() != "" {
		t.Fatal("nil ValidationError.Error")
	}
	if (&ValidationError{}).Error() != "" {
		t.Fatal("empty ValidationError.Error")
	}
	// Multi-issue join.
	multi := &ValidationError{Issues: []FieldError{{Text: "one"}, {Text: "two"}}}
	if !strings.Contains(multi.Error(), "one; two") {
		t.Fatalf("multi join: %q", multi.Error())
	}
}

// --- jsonRender / valueToString edge shapes in error text --------------

func TestErrorValueRendering(t *testing.T) {
	// Object value, array value, bool value, long (truncated) value.
	mustErr(t, MustShape(map[string]any{"a": Number}), map[string]any{"a": map[string]any{"x": 1.0}}, "not of type number")
	mustErr(t, MustShape(map[string]any{"a": Number}), map[string]any{"a": []any{1.0, 2.0}}, "not of type number")
	mustErr(t, MustShape(map[string]any{"a": Number}), map[string]any{"a": true}, "not of type number")
	long := strings.Repeat("x", 200)
	mustErr(t, MustShape(map[string]any{"a": Number}), map[string]any{"a": long}, "...")
}

// --- replaceLastErrText via Fault on a failing custom before-check ------

func TestFaultReplacesCustomError(t *testing.T) {
	failing := Fault("overridden", Before(func(val any, u *Update, s *State) bool {
		u.Done = true
		return false
	}, Number))
	mustErr(t, MustShape(map[string]any{"a": failing}), map[string]any{"a": 1.0}, "overridden")
}

// --- expr: remaining builders and chains -------------------------------

func TestExprBuildersFull(t *testing.T) {
	for _, src := range []string{
		"Above(2,Number)", "Below(9,Number)", "Len(3,String)",
		`Fault("oops",Number)`, `Define("d",Number)`, `Refer("d")`, `Rename("b",Number)`,
		"Key", "Type(Number)", "String.Min(2).Max(9)", "Number.Above(1)",
		"Boolean", "Object", "Array", "Function", "Any",
	} {
		if _, err := Expr(src); err != nil {
			t.Fatalf("Expr(%q): %v", src, err)
		}
	}

	// Error inside a chain.
	if _, err := Expr("String.Nope(1)"); err == nil {
		t.Fatal("Expr chain with unknown builder should error")
	}

	// Len with a non-integer arg is rejected.
	if _, err := Expr("Len(1.5)"); err == nil {
		t.Fatal("Len(1.5) should error")
	}
}

// --- structural stringify (isStructuralKind, list/object rendering) -----

func TestStringifyStructural(t *testing.T) {
	s := MustShape(map[string]any{
		"list":   One(Number, String),
		"nested": map[string]any{"deep": []any{Number, String}},
		"open":   Open(map[string]any{"x": 1.0}),
		"child":  Child(Number, map[string]any{}),
	})
	out := s.String()
	for _, want := range []string{"One(", "deep", "Open", "Child"} {
		if !strings.Contains(out, want) {
			t.Fatalf("String() missing %q in %q", want, out)
		}
	}
}

// --- argu edges: Partial deferred error, isRestNode --------------------

func TestArguEdges(t *testing.T) {
	a := MakeArgu("q")

	// Partial with an invalid spec surfaces the error at call time.
	p := a.Partial("sig", map[string]any{"a": func() {}})
	if _, err := p([]any{1.0}); err == nil {
		t.Fatal("partial invalid spec should error at call")
	}

	// Skip in an arg spec shifts positions.
	got, err := a.Validate([]any{5.0}, "sig", map[string]any{
		"a": Skip(String),
		"b": Number,
	})
	if err != nil {
		t.Fatalf("argu skip: %v", err)
	}
	if got["b"] != 5.0 {
		t.Fatalf("argu skip shift: %#v", got)
	}
}

// --- options: valExprMark custom + valexpr property ---------------------

func TestValExprMark(t *testing.T) {
	// A valexpr keymark merges the expression's kind/required/validators onto the
	// parent object node (Go merges these; note it does not copy open/child).
	s := MustShapeWith(map[string]any{"##": "Required", "a": Number},
		ShapeOptions{ValExpr: ValExprOptions{Active: true, KeyMark: "##"}})
	if _, err := s.Validate(map[string]any{"a": 1.0}); err != nil {
		t.Fatalf("valexpr required: %v", err)
	}
}

// --- Match false path + Error on typed-slice ---------------------------

func TestMatchAndErrorPaths(t *testing.T) {
	s := MustShape([]any{Number})
	if s.Match([]any{"x"}) {
		t.Fatal("Match should be false")
	}
	if errs := s.Error([]any{"x"}); len(errs) == 0 {
		t.Fatal("Error should report")
	}
}

package shape

import (
	"strings"
	"testing"
)

func TestExprDirect(t *testing.T) {
	n, err := Expr("String")
	if err != nil {
		t.Fatal(err)
	}
	if n.Kind() != KindString {
		t.Fatalf("expected string kind, got %v", n.Kind())
	}
	if !n.n.required {
		t.Fatalf("expected required, got %#v", n.n)
	}

	// Bad token
	_, err = Expr("Bad")
	if err == nil || !strings.Contains(err.Error(), "unexpected token Bad") {
		t.Fatalf("expected error with 'unexpected token Bad', got %v", err)
	}

	// Min with type token arg
	n2, err := Expr("Max(2, String)")
	if err != nil {
		t.Fatal(err)
	}
	if n2.Kind() != KindString {
		t.Fatalf("expected string carrier, got %v", n2.Kind())
	}
	if len(n2.n.afters) != 1 {
		t.Fatalf("expected one Max validator, got %d", len(n2.n.afters))
	}

	// Chained
	n3, err := Expr("String.Min(2).Max(10)")
	if err != nil {
		t.Fatal(err)
	}
	if n3.Kind() != KindString {
		t.Fatalf("expected string carrier, got %v", n3.Kind())
	}
	if len(n3.n.afters) != 2 {
		t.Fatalf("expected min+max, got %d afters", len(n3.n.afters))
	}
}

func TestExprValidate(t *testing.T) {
	// Direct expression with chaining; use it as a schema.
	n := MustExpr("Min(1, Max(4, Number))")
	s, err := Shape(n)
	if err != nil {
		t.Fatal(err)
	}
	mustValid(t, s, 3)
	mustInvalid(t, s, 0, "minimum")
	mustInvalid(t, s, 5, "maximum")
}

func TestExprRegexp(t *testing.T) {
	n := MustExpr("Check(/^a/)")
	s, err := Shape(n)
	if err != nil {
		t.Fatal(err)
	}
	mustValid(t, s, "abc")
	mustInvalid(t, s, "xyz", "did not match")
}

func TestExprLiteralDefault(t *testing.T) {
	// A bare literal at the top of an expression is treated as a Default.
	n := MustExpr("42")
	s := MustShape(n)
	out, err := s.Validate(nil)
	if err != nil {
		t.Fatal(err)
	}
	// JSON parser produces float64 for "42" — we accept either.
	switch out := out.(type) {
	case float64:
		if out != 42 {
			t.Fatalf("expected default 42, got %v", out)
		}
	case int:
		if out != 42 {
			t.Fatalf("expected default 42, got %v", out)
		}
	default:
		t.Fatalf("unexpected type: %T", out)
	}
}

func TestExprBuild(t *testing.T) {
	// Build expands strings inside a JSON-like spec.
	s, err := Build(map[string]any{
		"x": "Min(1, Max(4, Number))",
		"y": 2,
	})
	if err != nil {
		t.Fatal(err)
	}
	mustValid(t, s, map[string]any{"x": 3})
	mustInvalid(t, s, map[string]any{"x": 0}, "minimum")
}

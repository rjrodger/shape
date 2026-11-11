package shape

import (
	"reflect"
	"strings"
	"testing"
)

// --- Key-expression mode ---

func TestKeyExprBasic(t *testing.T) {
	// "x: Min(1)" key splits into key=x with value constrained Min(1).
	s := MustShape(map[string]any{
		"x: Min(1)": 1,
	})

	mustValid(t, s, map[string]any{"x": 5})
	mustInvalid(t, s, map[string]any{"x": 0}, "minimum")
}

func TestKeyExprChained(t *testing.T) {
	s := MustShape(map[string]any{
		"x: Min(1).Max(4)": 2,
	})
	mustValid(t, s, map[string]any{"x": 3})
	mustInvalid(t, s, map[string]any{"x": 0}, "minimum")
	mustInvalid(t, s, map[string]any{"x": 5}, "maximum")
}

func TestKeyExprDefaultsApply(t *testing.T) {
	s := MustShape(map[string]any{
		"x: Min(1).Max(4)": 2,
		"y: Min(1)":        2,
	})
	out, err := s.Validate(map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	m := out.(map[string]any)
	if !reflect.DeepEqual(m, map[string]any{"x": 2, "y": 2}) {
		t.Fatalf("expected defaults, got %v", m)
	}
}

// An Exact asks for a value only until it has a default: a key expression's
// example is that default, so the property is optional, unless the
// expression says Required outright (ts/src/shape.ts keyExprNode).
func TestKeyExprExactExampleDefault(t *testing.T) {
	for spec, want := range map[string]any{
		"a: Exact(1,2)":          map[string]any{"a": 1.0},
		"a: Exact":               map[string]any{"a": 1.0},
		"a: Optional(Exact(1))":  map[string]any{"a": 1.0},
		"a: Exact(1).Catch(5)":   map[string]any{"a": 5.0},
		"a: Required(Exact(1))":  nil,
		"a: Exact(1,2).Required": nil,
	} {
		out, err := MustShape(map[string]any{spec: 1.0}).Validate(map[string]any{})
		if want == nil {
			if err == nil || err.Error() != `Validation failed for property "a" because the property is missing.` {
				t.Fatalf("%s: got %v, %v", spec, out, err)
			}
			continue
		}
		if err != nil || !reflect.DeepEqual(out, want) {
			t.Fatalf("%s: got %v, %v", spec, out, err)
		}
	}
}

func TestKeyExprDisable(t *testing.T) {
	// With KeyExpr.Disable, the literal key is preserved.
	s, err := ShapeWith(map[string]any{
		"x: Min(1)": 1,
	}, ShapeOptions{KeyExpr: KeyExprOptions{Disable: true}})
	if err != nil {
		t.Fatal(err)
	}
	out, err := s.Validate(map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	m := out.(map[string]any)
	if _, has := m["x: Min(1)"]; !has {
		t.Fatalf("expected literal key 'x: Min(1)', got %v", m)
	}
}

func TestKeyExprBadBuilder(t *testing.T) {
	_, err := Shape(map[string]any{
		"x: BadBuilder": 1,
	})
	if err == nil {
		t.Fatal("expected build error for BadBuilder")
	}
	if !strings.Contains(err.Error(), "unexpected token") {
		t.Fatalf("expected 'unexpected token' error, got %q", err.Error())
	}
}

// --- Meta sidecar ---

func TestMetaSidecar(t *testing.T) {
	s, err := ShapeWith(map[string]any{
		"x$$": map[string]any{"foo": 99},
		"x":   1,
	}, ShapeOptions{Meta: MetaOptions{Active: true}})
	if err != nil {
		t.Fatal(err)
	}
	cn := s.root.objChildren["x"]
	if cn == nil {
		t.Fatal("expected child x")
	}
	if cn.meta == nil {
		t.Fatal("expected meta on x")
	}
	if cn.meta["foo"] != 99 {
		t.Fatalf("expected meta.foo=99, got %v", cn.meta["foo"])
	}
	// The meta key itself should not appear as a property.
	if _, has := s.root.objChildren["x$$"]; has {
		t.Fatalf("expected x$$ not to be a child")
	}
}

func TestMetaInactive(t *testing.T) {
	// Without meta active, x$$ is just another key.
	s := MustShape(map[string]any{
		"x$$": 99,
		"x":   1,
	})
	if _, has := s.root.objChildren["x$$"]; !has {
		t.Fatal("expected x$$ to be a child when meta inactive")
	}
}

func TestMetaCustomSuffix(t *testing.T) {
	s, err := ShapeWith(map[string]any{
		"x@meta": "info",
		"x":      1,
	}, ShapeOptions{Meta: MetaOptions{Active: true, Suffix: "@meta"}})
	if err != nil {
		t.Fatal(err)
	}
	cn := s.root.objChildren["x"]
	if cn == nil || cn.meta == nil {
		t.Fatal("expected x with meta")
	}
	if cn.meta["short"] != "info" {
		t.Fatalf("expected meta.short=info, got %v", cn.meta)
	}
}

// --- JSON-render error values ---

func TestErrorValueObjectJSON(t *testing.T) {
	s := MustShape(Func())
	_, err := s.Validate(map[string]any{"x": 1, "y": "hi"})
	if err == nil {
		t.Fatal("expected error")
	}
	// Must contain JSON-style object rendering, not Go's "map[...]" form.
	got := err.Error()
	if strings.Contains(got, "map[") {
		t.Fatalf("expected JSON-style render, got Go map syntax: %q", got)
	}
	// TS strips inner quotes after stringify, so the rendered form reads as
	// {x:1,y:hi} (no quotes around keys/values) — that's the parity check.
	if !strings.Contains(got, "x:1") || !strings.Contains(got, "y:hi") {
		t.Fatalf("expected x:1 and y:hi in output, got %q", got)
	}
}

func TestErrorValueArrayJSON(t *testing.T) {
	s := MustShape(String)
	_, err := s.Validate([]any{1, 2, 3})
	if err == nil {
		t.Fatal("expected error")
	}
	got := err.Error()
	if !strings.Contains(got, "[1,2,3]") {
		t.Fatalf("expected [1,2,3] in output, got %q", got)
	}
}

func TestErrorValueTruncated(t *testing.T) {
	long := strings.Repeat("x", 200)
	s := MustShape(Number)
	_, err := s.Validate(long)
	if err == nil {
		t.Fatal("expected error")
	}
	got := err.Error()
	if !strings.Contains(got, "...") {
		t.Fatalf("expected truncation '...', got %q", got)
	}
}

// --- Combined: key-expr emits expected error path ---

func TestKeyExprErrorPath(t *testing.T) {
	s := MustShape(map[string]any{
		"x: Min(1)": 1,
	})
	errs := s.Error(map[string]any{"x": 0})
	if len(errs) != 1 {
		t.Fatalf("expected 1 err, got %d", len(errs))
	}
	if errs[0].Path != "x" {
		t.Fatalf("expected path=x, got %q", errs[0].Path)
	}
}

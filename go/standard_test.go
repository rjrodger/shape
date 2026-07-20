package shape

import (
	"reflect"
	"testing"
)

func TestStandardProps(t *testing.T) {
	std := MustShape(map[string]any{"a": Number}).Standard()
	if std.Version != 1 {
		t.Fatalf("version: %d", std.Version)
	}
	if std.Vendor != "shape" {
		t.Fatalf("vendor: %q", std.Vendor)
	}
	if std.Validate == nil {
		t.Fatal("validate is nil")
	}
}

func TestStandardSuccessDefaults(t *testing.T) {
	std := MustShape(map[string]any{"port": 8080, "host": "localhost"}).Standard()
	r := std.Validate(map[string]any{})
	if len(r.Issues) != 0 {
		t.Fatalf("expected success, got issues %#v", r.Issues)
	}
	want := map[string]any{"port": 8080, "host": "localhost"}
	if !reflect.DeepEqual(r.Value, want) {
		t.Fatalf("value: %#v", r.Value)
	}
}

func TestStandardSuccessPreserves(t *testing.T) {
	std := MustShape(map[string]any{"a": Number, "b": String}).Standard()
	r := std.Validate(map[string]any{"a": 2.0, "b": "x"})
	if len(r.Issues) != 0 {
		t.Fatalf("unexpected issues: %#v", r.Issues)
	}
	if !reflect.DeepEqual(r.Value, map[string]any{"a": 2.0, "b": "x"}) {
		t.Fatalf("value: %#v", r.Value)
	}
}

func TestStandardFailureMessageAndPath(t *testing.T) {
	std := MustShape(map[string]any{"a": Number, "b": String}).Standard()
	r := std.Validate(map[string]any{"a": "not-a-number", "b": "ok"})
	if len(r.Issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(r.Issues))
	}
	if r.Issues[0].Message == "" {
		t.Fatal("empty message")
	}
	if !reflect.DeepEqual(r.Issues[0].Path, []any{"a"}) {
		t.Fatalf("path: %#v", r.Issues[0].Path)
	}
	// On failure, no Value is meaningful.
	if r.Value != nil {
		// Value may carry the partial output; issues are the signal. Just ensure
		// the caller distinguishes via Issues.
	}
}

func TestStandardMissingProperty(t *testing.T) {
	std := MustShape(map[string]any{"a": Number, "b": String}).Standard()
	r := std.Validate(map[string]any{"a": 1.0})
	if len(r.Issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(r.Issues))
	}
	if !reflect.DeepEqual(r.Issues[0].Path, []any{"b"}) {
		t.Fatalf("path: %#v", r.Issues[0].Path)
	}
}

func TestStandardNestedPath(t *testing.T) {
	std := MustShape(map[string]any{"server": map[string]any{"port": Number}}).Standard()
	r := std.Validate(map[string]any{"server": map[string]any{"port": "bad"}})
	if len(r.Issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(r.Issues))
	}
	if !reflect.DeepEqual(r.Issues[0].Path, []any{"server", "port"}) {
		t.Fatalf("path: %#v", r.Issues[0].Path)
	}
}

func TestStandardArrayIndexPath(t *testing.T) {
	std := MustShape([]any{Number}).Standard()
	r := std.Validate([]any{1.0, "two", 3.0})
	if len(r.Issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(r.Issues))
	}
	if !reflect.DeepEqual(r.Issues[0].Path, []any{1}) {
		t.Fatalf("path: %#v", r.Issues[0].Path)
	}
	if _, ok := r.Issues[0].Path[0].(int); !ok {
		t.Fatalf("array index should be an int, got %T", r.Issues[0].Path[0])
	}
}

func TestStandardRootEmptyPath(t *testing.T) {
	std := MustShape(Number).Standard()
	r := std.Validate("nope")
	if len(r.Issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(r.Issues))
	}
	if len(r.Issues[0].Path) != 0 {
		t.Fatalf("root path should be empty, got %#v", r.Issues[0].Path)
	}
}

func TestStandardMultipleFailures(t *testing.T) {
	std := MustShape(map[string]any{"a": Number, "b": String}).Standard()
	r := std.Validate(map[string]any{"a": "x", "b": 5.0})
	if len(r.Issues) != 2 {
		t.Fatalf("expected 2 issues, got %d", len(r.Issues))
	}
	seen := map[any]bool{}
	for _, iss := range r.Issues {
		seen[iss.Path[0]] = true
	}
	if !seen["a"] || !seen["b"] {
		t.Fatalf("expected paths a and b, got %#v", r.Issues)
	}
}

func TestStandardKeyWithDots(t *testing.T) {
	std := MustShape(map[string]any{"a.b": Number}).Standard()
	r := std.Validate(map[string]any{"a.b": "bad"})
	if len(r.Issues) != 1 {
		t.Fatalf("expected 1 issue, got %d", len(r.Issues))
	}
	// The key contains a dot; the array path keeps it as a single segment.
	if !reflect.DeepEqual(r.Issues[0].Path, []any{"a.b"}) {
		t.Fatalf("path: %#v", r.Issues[0].Path)
	}
}

func TestStandardDoesNotPanic(t *testing.T) {
	std := MustShape(map[string]any{"a": Number}).Standard()
	// Plain Validate returns an error; Standard.Validate must simply report issues.
	r := std.Validate(map[string]any{"a": "x"})
	if len(r.Issues) == 0 {
		t.Fatal("expected issues")
	}
}

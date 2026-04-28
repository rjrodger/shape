package shape

import (
	"fmt"
	"reflect"
	"testing"
)

// TestStressDeepNestedArray validates a 50-deep nested array of strings.
func TestStressDeepNestedArray(t *testing.T) {
	const depth = 50
	spec := buildNestedArraySpec(depth, String)
	input := buildNestedArrayValue(depth, "ok")

	s := MustShape(spec)
	out, err := s.Validate(input)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}

	if got := nestedArrayLeaf(out, depth); got != "ok" {
		t.Fatalf("expected leaf 'ok', got %v", got)
	}
}

// TestStressDeepNestedObject validates a 50-deep nested object.
func TestStressDeepNestedObject(t *testing.T) {
	const depth = 50
	spec := buildNestedObjectSpec(depth, "leaf", Number)
	input := buildNestedObjectValue(depth, 42)

	s := MustShape(spec)
	out, err := s.Validate(input)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got := nestedObjectLeaf(out, depth); got != 42 {
		t.Fatalf("expected 42, got %v", got)
	}
}

// TestStressLongArray validates a 10,000-element array.
func TestStressLongArray(t *testing.T) {
	const n = 10_000
	arr := make([]any, n)
	for i := range arr {
		arr[i] = i
	}
	s := MustShape([]any{Number})
	out, err := s.Validate(arr)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if reflect.ValueOf(out).Len() != n {
		t.Fatalf("expected %d elements, got %d", n, reflect.ValueOf(out).Len())
	}
}

// TestStressWideObject validates a 1000-key object.
func TestStressWideObject(t *testing.T) {
	const n = 1000
	specMap := map[string]any{}
	input := map[string]any{}
	for i := 0; i < n; i++ {
		k := fmt.Sprintf("k%d", i)
		specMap[k] = Number
		input[k] = i
	}
	s := MustShape(specMap)
	out, err := s.Validate(input)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	m := out.(map[string]any)
	if len(m) != n {
		t.Fatalf("expected %d keys, got %d", n, len(m))
	}
}

// TestStressManyDefaults injects 1000 default values into an empty input.
func TestStressManyDefaults(t *testing.T) {
	const n = 1000
	specMap := map[string]any{}
	for i := 0; i < n; i++ {
		k := fmt.Sprintf("k%d", i)
		specMap[k] = i // literal default
	}
	s := MustShape(specMap)
	out, err := s.Validate(map[string]any{})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	m := out.(map[string]any)
	if len(m) != n {
		t.Fatalf("expected %d defaults, got %d", n, len(m))
	}
	if m["k0"] != 0 || m["k999"] != 999 {
		t.Fatalf("expected defaults 0 and 999, got %v / %v", m["k0"], m["k999"])
	}
}

// TestStressErrorAggregation collects 1000 type errors in a single pass.
func TestStressErrorAggregation(t *testing.T) {
	const n = 1000
	arr := make([]any, n)
	for i := range arr {
		arr[i] = "not-a-number"
	}
	s := MustShape([]any{Number})
	errs := s.Error(arr)
	if len(errs) != n {
		t.Fatalf("expected %d errors, got %d", n, len(errs))
	}
}

// --- helpers ---

func buildNestedArraySpec(depth int, leaf any) any {
	cur := any(leaf)
	for i := 0; i < depth; i++ {
		cur = []any{cur}
	}
	return cur
}

func buildNestedArrayValue(depth int, leaf any) any {
	cur := any(leaf)
	for i := 0; i < depth; i++ {
		cur = []any{cur}
	}
	return cur
}

func nestedArrayLeaf(v any, depth int) any {
	for i := 0; i < depth; i++ {
		arr, ok := v.([]any)
		if !ok || len(arr) == 0 {
			return nil
		}
		v = arr[0]
	}
	return v
}

func buildNestedObjectSpec(depth int, leafKey string, leafSpec any) any {
	cur := any(leafSpec)
	for i := 0; i < depth; i++ {
		cur = map[string]any{leafKey: cur}
	}
	return cur
}

func buildNestedObjectValue(depth int, leaf any) any {
	cur := any(leaf)
	for i := 0; i < depth; i++ {
		cur = map[string]any{"leaf": cur}
	}
	return cur
}

func nestedObjectLeaf(v any, depth int) any {
	for i := 0; i < depth; i++ {
		m, ok := v.(map[string]any)
		if !ok {
			return nil
		}
		v = m["leaf"]
	}
	return v
}

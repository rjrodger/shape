package shape

import "testing"

func TestDefaultsAndRequiredToken(t *testing.T) {
	s := MustShape(map[string]any{
		"port":  8080,
		"host":  "localhost",
		"debug": Boolean,
	})

	out, err := s.Validate(map[string]any{"debug": true})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}

	obj := out.(map[string]any)
	if obj["port"] != 8080 || obj["host"] != "localhost" || obj["debug"] != true {
		t.Fatalf("unexpected output: %#v", obj)
	}
}

func TestClosedObjectRejectsUnknown(t *testing.T) {
	s := MustShape(map[string]any{"a": 1})
	_, err := s.Validate(map[string]any{"a": 2, "b": true})
	if err == nil {
		t.Fatal("expected validation error")
	}
}

func TestOpenObjectAllowsUnknown(t *testing.T) {
	s := MustShape(Open(map[string]any{"a": 1}))
	out, err := s.Validate(map[string]any{"a": 2, "b": true})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	obj := out.(map[string]any)
	if obj["b"] != true {
		t.Fatalf("expected b to be preserved: %#v", obj)
	}
}

func TestArrayChildValidation(t *testing.T) {
	s := MustShape([]any{Number})
	_, err := s.Validate([]any{1, 2, "x"})
	if err == nil {
		t.Fatal("expected validation error")
	}
}

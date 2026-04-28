package shape

import (
	"reflect"
	"strings"
	"testing"
)

func TestArguBasic(t *testing.T) {
	Argu := MakeArgu("QAZ")

	out, err := Argu.Validate([]any{2, "X"}, "foo", map[string]any{
		"a": 1,
		"b": "B",
	})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	want := map[string]any{"a": 2, "b": "X"}
	if !reflect.DeepEqual(out, want) {
		t.Fatalf("expected %v, got %v", want, out)
	}

	_, err = Argu.Validate([]any{2, 3}, "foo", map[string]any{
		"a": 1,
		"b": "B",
	})
	if err == nil {
		t.Fatal("expected error for non-string b")
	}
	if !strings.Contains(err.Error(), "QAZ (foo)") {
		t.Fatalf("expected QAZ (foo) prefix, got %q", err.Error())
	}
	if !strings.Contains(err.Error(), "string") {
		t.Fatalf("expected error mentioning string, got %q", err.Error())
	}
}

func TestArguPartial(t *testing.T) {
	Argu := MakeArgu("LIB")
	fn := Argu.Partial("foo", map[string]any{
		"a": Skip(Number),
		"b": String,
	})
	out, err := fn([]any{2, "X"})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(out, map[string]any{"a": 2, "b": "X"}) {
		t.Fatalf("expected {a:2, b:X}, got %v", out)
	}

	out, err = fn([]any{"X"})
	if err != nil {
		t.Fatal(err)
	}
	if out["a"] != nil || out["b"] != "X" {
		t.Fatalf("expected a=nil b=X, got %v", out)
	}

	_, err = fn([]any{})
	if err == nil {
		t.Fatal("expected error for missing required b")
	}
}

func TestArguTooManyArgs(t *testing.T) {
	Argu := MakeArgu("LIB")
	fn := Argu.Partial("foo", map[string]any{
		"a": Skip(Number),
		"b": String,
	})
	_, err := fn([]any{"X", "Y"})
	if err == nil {
		t.Fatal("expected too-many-args error")
	}
	if !strings.Contains(err.Error(), "Too many arguments") {
		t.Fatalf("expected too-many-args message, got %q", err.Error())
	}
}

func TestArguRest(t *testing.T) {
	Argu := MakeArgu("seneca")
	fn := Argu.Partial("bar", map[string]any{
		"a": Skip(String),
		"b": Skip(Object),
		"c": Func(),
		"d": Rest(Any),
	})
	f0 := func() {}
	out, err := fn([]any{"a", map[string]any{"x": 1}, f0, 11})
	if err != nil {
		t.Fatal(err)
	}
	if out["a"] != "a" {
		t.Fatalf("a=%v", out["a"])
	}
	if !reflect.DeepEqual(out["b"], map[string]any{"x": 1}) {
		t.Fatalf("b=%v", out["b"])
	}
	d := out["d"].([]any)
	if len(d) != 1 || d[0] != 11 {
		t.Fatalf("expected d=[11], got %v", d)
	}
}

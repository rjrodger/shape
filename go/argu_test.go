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

// The arguments' shapes are prepared together, as one schema's are: a
// Define is collected, a Refer in another argument finds it, and an object
// element of a Rest is walked.
func TestArguDefinitions(t *testing.T) {
	a := MakeArgu("x")
	ok := func(args []any, spec map[string]any, want map[string]any) {
		t.Helper()
		if out, err := a.Validate(args, "w", spec); err != nil || !reflect.DeepEqual(out, want) {
			t.Fatalf("%v: %v %v", args, out, err)
		}
	}
	bad := func(args []any, spec map[string]any, want string) {
		t.Helper()
		if _, err := a.Validate(args, "w", spec); err == nil || err.Error() != want {
			t.Fatalf("%v: %v", args, err)
		}
	}
	defined := map[string]any{"a": Define("n", Number)}
	ok([]any{1.0}, defined, map[string]any{"a": 1.0})
	bad([]any{"q"}, defined, `x (w): Validation failed for property "a" with string "q" because the string is not of type number.`)
	referred := map[string]any{"a": Define("n", Number), "b": Refer("n")}
	ok([]any{1.0, 2.0}, referred, map[string]any{"a": 1.0, "b": 2.0})
	bad([]any{1.0, "q"}, referred, `x (w): Validation failed for property "b" with string "q" because the string is not of type number.`)
	p := a.Partial("w", referred)
	if _, err := p([]any{1.0, "q"}); err == nil {
		t.Fatal("partial: the Refer should find the Define")
	}
	rest := map[string]any{"a": Rest(map[string]any{"b": Number})}
	ok([]any{map[string]any{"b": 1.0}, map[string]any{"b": 2.0}}, rest,
		map[string]any{"a": []any{map[string]any{"b": 1.0}, map[string]any{"b": 2.0}}})
	bad([]any{map[string]any{"b": "q"}}, rest, `x (w): Validation failed for property "a.b" with string "q" because the string is not of type number.`)
	// A skipped argument is tried, its definition and all.
	ok([]any{1.0}, map[string]any{"a": Skip(Define("n", String)), "b": Number}, map[string]any{"a": nil, "b": 1.0})
}

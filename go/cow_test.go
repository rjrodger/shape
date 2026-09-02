package shape

import "testing"

// The producing walk copies an object or array only when it changes it, so
// an input that validates as it is comes back as itself, and one that gains
// a default is left as it was.
func TestProduceCopiesOnWrite(t *testing.T) {
	plain := MustShape(map[string]any{"a": Number, "b": []any{String}})
	in := map[string]any{"a": 1.0, "b": []any{"x", "y"}}
	out, err := plain.Validate(in)
	if err != nil {
		t.Fatal(err)
	}
	if om, ok := out.(map[string]any); !ok || &om == nil || !sameValue(om, in) || !sameValue(om["b"], in["b"]) {
		t.Fatal("unchanged input is returned as it is")
	}

	dflt := MustShape(map[string]any{"a": Number, "c": "z", "b": []any{String, Default("q", String)}})
	in = map[string]any{"a": 1.0, "b": []any{"x"}}
	out, err = dflt.Validate(in)
	if err != nil {
		t.Fatal(err)
	}
	om := out.(map[string]any)
	if sameValue(om, in) || om["c"] != "z" || om["b"].([]any)[1] != "q" {
		t.Fatal("produced value differs")
	}
	if _, has := in["c"]; has || len(in["b"].([]any)) != 1 {
		t.Fatal("input left as it was")
	}

	// An Ignore child kept with a changed value writes it into the copy.
	kept := MustShape(map[string]any{"a": Ignore(map[string]any{"b": 1.0})})
	out, err = kept.Validate(map[string]any{"a": map[string]any{}})
	if err != nil || out.(map[string]any)["a"].(map[string]any)["b"] != 1.0 {
		t.Fatal("ignore child produced", out, err)
	}

	// A closed object with more keys than the spec declares reports them
	// before its children's errors, and so does one with fewer.
	closed := MustShape(map[string]any{"a": Number, "b": Number})
	errs := closed.Error(map[string]any{"a": "x", "z": 1.0})
	if len(errs) != 3 || errs[0].Why != WhyClosed || errs[1].Why != WhyType || errs[2].Why != WhyRequired {
		t.Fatal("unknown key first (no more keys than declared)", errs)
	}
	errs = closed.Error(map[string]any{"a": "x", "b": 1.0, "z": 1.0})
	if len(errs) != 2 || errs[0].Why != WhyClosed || errs[1].Why != WhyType {
		t.Fatal("unknown key first (more keys than declared)", errs)
	}

	// The pooled context of a validator-free schema is reset between calls.
	if !plain.Valid(map[string]any{"a": 1.0, "b": []any{}}) || plain.Valid(map[string]any{"a": "x", "b": []any{}}) || !plain.Valid(map[string]any{"a": 2.0, "b": []any{}}) {
		t.Fatal("pooled match")
	}
	empty := []any{}
	if !sameValue(1, 1) || sameValue(1, 2) || sameValue(true, false) || sameValue("a", 1.0) || sameValue([]any{1.0}, []any{1.0}) || sameValue(make([]any, 0, 1), make([]any, 0, 1)) || !sameValue(empty, empty) || sameValue(nil, 1) {
		t.Fatal("sameValue")
	}
}

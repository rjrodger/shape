package shape

import (
	"math"
	"reflect"
	"strings"
	"testing"
)

// Nof: a count of the shapes the value satisfies. The shared corpus pins
// the verdicts and messages; these cover the construction faults, the
// renderings and the JSON Schema export.

func nofErr(t *testing.T, s *Schema, in any) string {
	t.Helper()
	_, err := s.Validate(in)
	if err == nil {
		t.Fatalf("expected an error for %v", in)
	}
	return err.Error()
}

func TestNofCounts(t *testing.T) {
	one := MustShape(Nof(1, Number, Integer))
	if out, err := one.Validate(1.5); err != nil || out != 1.5 {
		t.Fatalf("one of 1.5: %v %v", out, err)
	}
	if got := nofErr(t, one, 1.0); got != `Value "1" for property "" satisfies 2 of: Number, Integer; the count must be 1.` {
		t.Fatalf("two satisfied: %s", got)
	}
	// A shape for the count, and a verdict reached early.
	early := MustShape(Nof(Min(2), String, Number, Boolean))
	if got := nofErr(t, early, true); got != `Value "true" for property "" satisfies 0 to 1 of: String, Number, Boolean; the count must be Min(2).` {
		t.Fatalf("early: %s", got)
	}
	// A Nof's message is its own, so a Fault does not replace it; the Fault
	// speaks for a value that is missing.
	faulted := MustShape(Fault("not that", Nof(0, String)))
	if got := nofErr(t, faulted, "x"); got != `Value "x" for property "" satisfies 1 of: String; the count must be 0.` {
		t.Fatalf("fault: %s", got)
	}
	if got := nofErr(t, MustShape(map[string]any{"a": Fault("not that", Nof(0, String))}), map[string]any{}); got != "not that" {
		t.Fatalf("fault, missing: %s", got)
	}
	// Ignore drops the failure and the value.
	if out, err := MustShape(map[string]any{"a": Ignore(Nof(0, String))}).Validate(map[string]any{"a": "x"}); err != nil ||
		!reflect.DeepEqual(out, map[string]any{}) {
		t.Fatalf("ignored: %v %v", out, err)
	}
	// A count of exactly one produces from the branch that matched, in
	// either mode; any other count only checks.
	in := map[string]any{"a": 1.0}
	out, err := MustShape(Nof(1, Open(map[string]any{"b": 2.0}), Number)).Validate(in)
	if err != nil || !reflect.DeepEqual(out, map[string]any{"a": 1.0, "b": 2.0}) {
		t.Fatalf("one produces: %v %v", out, err)
	}
	if !reflect.DeepEqual(in, map[string]any{"a": 1.0}) {
		t.Fatalf("input changed: %v", in)
	}
	if !MustShape(All(Nof(1, Coerce(Number), Boolean), Min(2))).Match("5") {
		t.Fatal("a match threads the produced value")
	}
	out, err = MustShape(Nof(Min(1), Open(map[string]any{"b": 2.0}), Number)).Validate(map[string]any{"a": 1.0})
	if err != nil || !reflect.DeepEqual(out, map[string]any{"a": 1.0}) {
		t.Fatalf("min checks only: %v %v", out, err)
	}
	if GNof(0, String).n.listMode != listNof {
		t.Fatal("GNof is Nof")
	}
}

func TestNofFaults(t *testing.T) {
	for _, count := range []any{-1, 1.5, math.NaN(), math.Inf(1), math.Inf(-1)} {
		_, err := MustShape(Nof(count, String)).Validate("x")
		if err == nil || err.Error() != nofFault {
			t.Fatalf("count %v: %v", count, err)
		}
	}
	// A shape for the count that does not compile is the builder's fault.
	_, err := MustShape(Nof(map[string]any{"a: Min(": 1}, String)).Validate("x")
	if err == nil || !strings.Contains(err.Error(), "Min(") {
		t.Fatalf("bad count shape: %v", err)
	}
	// So is a count that is a builder's fault, as TypeScript throws it.
	_, err = MustShape(Nof(Min("x"), String)).Validate("x")
	if err == nil || err.Error() != "Shape: Min needs a number" {
		t.Fatalf("faulted count: %v", err)
	}
	// The string form refuses a wrong count, and a missing one, at build.
	for _, src := range []string{"Nof(-1,String)", "Nof(1.5,String)", "Nof()"} {
		if _, err := Expr(src); err == nil || err.Error() != nofFault {
			t.Fatalf("%s: %v", src, err)
		}
	}
}

func TestNofRender(t *testing.T) {
	if got := MustShape(Nof(1, Number, String)).String(); got != "Nof(1,Number,String)" {
		t.Fatalf("string: %s", got)
	}
	if got := MustShape(Nof(MustExpr("Min(1).Max(2)"), Number, String)).String(); got != "Nof(Min(1).Max(2),Number,String)" {
		t.Fatalf("string: %s", got)
	}
	for _, c := range []struct {
		spec any
		json any
	}{
		{Nof(1, String, Number), "Nof(1,String,Number)"},
		{Optional(Nof(0, String)), "Nof(0,String).Optional"},
		{Nof(Min(1), String, Number), "Nof(Any.Min(1),String,Number)"},
	} {
		got, err := MustShape(c.spec).JSON()
		if err != nil || !reflect.DeepEqual(got, c.json) {
			t.Fatalf("json: %v %v, want %v", got, err, c.json)
		}
		back, err := Build(got)
		if err != nil {
			t.Fatalf("build %v: %v", got, err)
		}
		if again, _ := back.JSON(); !reflect.DeepEqual(again, c.json) {
			t.Fatalf("round trip: %v, want %v", again, c.json)
		}
	}
}

func TestNofJSONSchema(t *testing.T) {
	str := map[string]any{"type": "string", "minLength": 1}
	num := map[string]any{"type": "number"}
	boo := map[string]any{"type": "boolean"}
	three := []any{str, num, boo}
	for _, c := range []struct {
		spec any
		want map[string]any
	}{
		{Nof(1, String, Number), map[string]any{"oneOf": []any{str, num}}},
		{Nof(0, String), map[string]any{"not": str}},
		{Nof(0, String, Number), map[string]any{"not": map[string]any{"anyOf": []any{str, num}}}},
		{Nof(2, String, Number), map[string]any{"allOf": []any{str, num}}},
		{Nof(Min(1), String, Number, Boolean), map[string]any{"anyOf": three}},
		{Nof(Max(2), String, Number, Boolean), map[string]any{"not": map[string]any{"allOf": three}}},
		{Nof(MustExpr("Min(1).Max(2)"), String, Number, Boolean),
			map[string]any{"anyOf": three, "not": map[string]any{"allOf": three}}},
		{Nof(Min(2), String, Number, Boolean), map[string]any{"anyOf": three}},
		{Nof(Exact(0, 3), String, Number, Boolean), map[string]any{}},
		{Nof(MustExpr("Min(1).Max(0)"), String), map[string]any{"not": map[string]any{}}},
		{Nof(Min(0), String), map[string]any{}},
		{Nof(0), map[string]any{}},
		{Nof(1), map[string]any{"not": map[string]any{}}},
	} {
		got := MustShape(c.spec).JSONSchema()
		delete(got, "$schema")
		if !reflect.DeepEqual(got, c.want) {
			t.Fatalf("%s: got %v, want %v", MustShape(c.spec).String(), got, c.want)
		}
	}
}

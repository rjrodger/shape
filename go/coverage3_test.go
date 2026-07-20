package shape

import (
	"math"
	"testing"
)

// Direct in-package unit tests for the small helpers, covering switch arms that
// are correct but not reachable through the public API (e.g. non-float64 numeric
// kinds, which JSON-sourced values never produce).

func TestToFloatAllKinds(t *testing.T) {
	for _, v := range []any{
		int(1), int8(1), int16(1), int32(1), int64(1),
		uint(1), uint8(1), uint16(1), uint32(1), uint64(1),
		float32(1), float64(1),
	} {
		if toFloat(v) != 1 {
			t.Fatalf("toFloat(%T)=%v", v, toFloat(v))
		}
	}
	if toFloat("abc") != 3 { // string → length
		t.Fatal("toFloat string length")
	}
	if !math.IsNaN(toFloat(struct{}{})) {
		t.Fatal("toFloat non-numeric → NaN")
	}
}

func TestToIntAllKinds(t *testing.T) {
	for _, v := range []any{
		int(1), int8(1), int16(1), int32(1), int64(1),
		uint(1), uint8(1), uint16(1), uint32(1), uint64(1),
		float32(1), float64(1),
	} {
		if n, ok := toInt(v); !ok || n != 1 {
			t.Fatalf("toInt(%T)=%v,%v", v, n, ok)
		}
	}
	if _, ok := toInt("nope"); ok {
		t.Fatal("toInt(string) should be false")
	}
}

func TestValueLenAndFmt(t *testing.T) {
	if n, ok := valueLen(5.0); !ok || n != 5 {
		t.Fatal("valueLen number")
	}
	if n, ok := valueLen("abcd"); !ok || n != 4 {
		t.Fatal("valueLen string")
	}
	if n, ok := valueLen([]any{1, 2}); !ok || n != 2 {
		t.Fatal("valueLen slice")
	}
	if n, ok := valueLen(map[string]any{"a": 1}); !ok || n != 1 {
		t.Fatal("valueLen map")
	}
	if _, ok := valueLen(nil); ok {
		t.Fatal("valueLen nil")
	}
	if _, ok := valueLen(true); ok {
		t.Fatal("valueLen bool not measurable")
	}

	if fmtFloat(3.0) != "3" {
		t.Fatal("fmtFloat whole")
	}
	if fmtFloat(3.5) != "3.5" {
		t.Fatal("fmtFloat fractional")
	}
	if fmtFloat(math.Inf(1)) == "" {
		t.Fatal("fmtFloat inf")
	}
}

func TestSmallHelpers(t *testing.T) {
	if !isNaN(math.NaN()) || !isNaN(float32(math.NaN())) || isNaN(1.0) || isNaN("x") {
		t.Fatal("isNaN")
	}
	if isFunction(nil) || !isFunction(func() {}) || isFunction(1) {
		t.Fatal("isFunction")
	}
	if pathstr(nil) != "" {
		t.Fatal("pathstr nil")
	}
	if !contains([]string{"a", "b"}, "b") || contains([]string{"a"}, "z") {
		t.Fatal("contains")
	}
	if joinPath([]string{"", "a", "", "b"}) != "a.b" {
		t.Fatal("joinPath skips empties")
	}
	if joinWith([]string{"a", "b"}, "-") != "a-b" {
		t.Fatal("joinWith")
	}
	if requiredMarkFor(KindObject) != markObjectRequired ||
		requiredMarkFor(KindArray) != markArrayRequired ||
		requiredMarkFor(KindString) != markScalarRequired {
		t.Fatal("requiredMarkFor")
	}
	if typeMarkFor(KindObject) != markObjectType ||
		typeMarkFor(KindArray) != markArrayType ||
		typeMarkFor(KindCheck) != markCheckType ||
		typeMarkFor(KindString) != markScalarType {
		t.Fatal("typeMarkFor")
	}
	for _, k := range []Kind{KindString, KindNumber, KindBoolean, KindObject, KindArray, KindNull} {
		_ = zeroForKind(k)
	}
	if zeroForKind(KindString) != "" || zeroForKind(KindNumber) != float64(0) || zeroForKind(KindBoolean) != false {
		t.Fatal("zeroForKind scalars")
	}
	if zeroForKind(KindAny) != nil {
		t.Fatal("zeroForKind default")
	}
}

// --- Builder argument-shape branches (0-arg vs spec) -------------------

func TestBuilderArgBranches(t *testing.T) {
	// Zero-argument builder forms.
	_ = MustShape(map[string]any{"a": Optional()})
	_ = MustShape(map[string]any{"a": Skip()})
	_ = MustShape(map[string]any{"a": Ignore()})
	_ = MustShape(map[string]any{"a": Empty()})
	_ = MustShape(map[string]any{"a": Never()})
	_ = MustShape(map[string]any{"a": Fault("x")})
	_ = MustShape(map[string]any{"a": Required()})
	_ = MustShape(Closed())
	_ = MustShape(Open())

	// Type with each acceptable kind argument form.
	_ = MustShape(map[string]any{"a": Type(KindNumber)})
	_ = MustShape(map[string]any{"a": Type(Number)})
	_ = MustShape(map[string]any{"a": Type("number")})

	// Child / Rest / Func with no carrier spec.
	mustOK(t, MustShape(Child(Number)), map[string]any{"x": 1.0})
	mustOK(t, MustShape(map[string]any{"a": Rest(Number)}), map[string]any{"a": []any{}})
	mustOK(t, MustShape(map[string]any{"f": Func()}), map[string]any{"f": func() {}})

	// Default zero-arg (dval only) already covered; Default with spec:
	if got := mustOK(t, MustShape(map[string]any{"a": Default(3.0, Number)}), map[string]any{}); got.(map[string]any)["a"] != 3.0 {
		t.Fatalf("Default with spec: %v", got)
	}

	// Check with a function form + carrier spec (narrows kind).
	fnShape := MustShape(map[string]any{"a": Check(func(v any, u *Update, s *State) bool {
		return v == 5.0
	}, Number)})
	mustOK(t, fnShape, map[string]any{"a": 5.0})
	mustErr(t, fnShape, map[string]any{"a": 6.0}, "failed")
}

// --- cloneDefault variants ---------------------------------------------

func TestCloneDefaultVariants(t *testing.T) {
	// Optional object default → {} (recurses children).
	mustOK(t, MustShape(map[string]any{"o": map[string]any{"x": 1.0}}), map[string]any{})
	// Optional array default → [].
	mustOK(t, MustShape(map[string]any{"a": []any{Number}}), map[string]any{})
	// Optional type token injects its empty default (parity with TS).
	if got := mustOK(t, MustShape(map[string]any{"a": Optional(Number)}), map[string]any{}).(map[string]any); got["a"] != float64(0) {
		t.Fatalf("Optional(Number) should inject 0: %#v", got)
	}
	// Skip omits the key entirely (no default injection).
	out := mustOK(t, MustShape(map[string]any{"a": Skip(Number)}), map[string]any{}).(map[string]any)
	if _, has := out["a"]; has {
		t.Fatalf("Skip should omit the key: %#v", out)
	}
}

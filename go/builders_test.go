package shape

import (
	"errors"
	"fmt"
	"testing"
)

// --- Required ---

func TestRequiredMakesFieldRequired(t *testing.T) {
	result := mustValidate(t, M{"name": Required(String)}, M{"name": "Alice"})
	assertEq(t, result.(M)["name"], "Alice")
}

func TestRequiredRejectsMissing(t *testing.T) {
	se := mustFail(t, M{"name": Required(String)}, M{})
	assertEq(t, se.Errors[0].Code, ErrRequired)
}

func TestRequiredWithLiteral(t *testing.T) {
	// Required overrides literal default behavior (which is optional)
	se := mustFail(t, M{"x": Required("default")}, M{})
	assertEq(t, se.Errors[0].Code, ErrRequired)
}

// --- Optional ---

func TestOptionalWithDefault(t *testing.T) {
	result := mustValidate(t, M{"x": Optional(1.0)}, M{})
	assertEq(t, result.(M)["x"], 1.0)
}

func TestOptionalOverride(t *testing.T) {
	result := mustValidate(t, M{"x": Optional(1.0)}, M{"x": 2.0})
	assertEq(t, result.(M)["x"], 2.0)
}

func TestOptionalString(t *testing.T) {
	// Optional(String) should not error when missing; should get default ""
	result := mustValidate(t, M{"x": Optional(String)}, M{})
	assertEq(t, result.(M)["x"], "")
}

// --- Default ---

func TestDefault(t *testing.T) {
	result := mustValidate(t, M{"x": Default(42.0, Number)}, M{})
	assertEq(t, result.(M)["x"], 42.0)
}

func TestDefaultOverridden(t *testing.T) {
	result := mustValidate(t, M{"x": Default(42.0, Number)}, M{"x": 99.0})
	assertEq(t, result.(M)["x"], 99.0)
}

// --- Skip ---

func TestSkipOmitsMissingField(t *testing.T) {
	result := mustValidate(t, M{"x": Skip(String)}, M{})
	m := result.(M)
	if _, exists := m["x"]; exists {
		t.Error("skip should not insert field when missing")
	}
}

func TestSkipKeepsPresentField(t *testing.T) {
	result := mustValidate(t, M{"x": Skip(String)}, M{"x": "hello"})
	assertEq(t, result.(M)["x"], "hello")
}

// --- Min / Max ---

func TestMinNumber(t *testing.T) {
	result := mustValidate(t, M{"x": Min(1, Number)}, M{"x": 5.0})
	assertEq(t, result.(M)["x"], 5.0)
}

func TestMinNumberFails(t *testing.T) {
	se := mustFail(t, M{"x": Min(1, Number)}, M{"x": 0.0})
	assertEq(t, se.Errors[0].Code, ErrMin)
}

func TestMaxNumber(t *testing.T) {
	result := mustValidate(t, M{"x": Max(10, Number)}, M{"x": 5.0})
	assertEq(t, result.(M)["x"], 5.0)
}

func TestMaxNumberFails(t *testing.T) {
	se := mustFail(t, M{"x": Max(10, Number)}, M{"x": 15.0})
	assertEq(t, se.Errors[0].Code, ErrMax)
}

func TestMinMaxComposed(t *testing.T) {
	result := mustValidate(t, M{"x": Min(1, Max(10, Number))}, M{"x": 5.0})
	assertEq(t, result.(M)["x"], 5.0)
}

func TestMinMaxComposedFailsMin(t *testing.T) {
	se := mustFail(t, M{"x": Min(1, Max(10, Number))}, M{"x": 0.0})
	assertEq(t, se.Errors[0].Code, ErrMin)
}

func TestMinMaxComposedFailsMax(t *testing.T) {
	se := mustFail(t, M{"x": Min(1, Max(10, Number))}, M{"x": 15.0})
	assertEq(t, se.Errors[0].Code, ErrMax)
}

// --- Min/Max for strings (length) ---

func TestMinStringLength(t *testing.T) {
	result := mustValidate(t, M{"x": Min(2, String)}, M{"x": "abc"})
	assertEq(t, result.(M)["x"], "abc")
}

func TestMinStringLengthFails(t *testing.T) {
	se := mustFail(t, M{"x": Min(5, String)}, M{"x": "ab"})
	assertEq(t, se.Errors[0].Code, ErrMin)
}

// --- Above / Below ---

func TestAbove(t *testing.T) {
	result := mustValidate(t, M{"x": Above(0)}, M{"x": 1.0})
	assertEq(t, result.(M)["x"], 1.0)
}

func TestAboveFails(t *testing.T) {
	se := mustFail(t, M{"x": Above(0)}, M{"x": 0.0})
	assertEq(t, se.Errors[0].Code, ErrAbove)
}

func TestBelow(t *testing.T) {
	result := mustValidate(t, M{"x": Below(10)}, M{"x": 5.0})
	assertEq(t, result.(M)["x"], 5.0)
}

func TestBelowFails(t *testing.T) {
	se := mustFail(t, M{"x": Below(10)}, M{"x": 10.0})
	assertEq(t, se.Errors[0].Code, ErrBelow)
}

// --- Len ---

func TestLenString(t *testing.T) {
	result := mustValidate(t, M{"x": Len(3, String)}, M{"x": "abc"})
	assertEq(t, result.(M)["x"], "abc")
}

func TestLenStringFails(t *testing.T) {
	se := mustFail(t, M{"x": Len(3, String)}, M{"x": "ab"})
	assertEq(t, se.Errors[0].Code, ErrLen)
}

func TestLenArray(t *testing.T) {
	result := mustValidate(t, M{"x": Len(2, L{Number})}, M{"x": L{1.0, 2.0}})
	arr := result.(M)["x"].([]any)
	assertEq(t, len(arr), 2)
}

func TestLenArrayFails(t *testing.T) {
	se := mustFail(t, M{"x": Len(2, L{Number})}, M{"x": L{1.0}})
	assertEq(t, se.Errors[0].Code, ErrLen)
}

// --- One ---

func TestOneMatchesFirst(t *testing.T) {
	result := mustValidate(t, M{"x": One(Number, String)}, M{"x": 42.0})
	assertEq(t, result.(M)["x"], 42.0)
}

func TestOneMatchesSecond(t *testing.T) {
	result := mustValidate(t, M{"x": One(Number, String)}, M{"x": "hello"})
	assertEq(t, result.(M)["x"], "hello")
}

func TestOneFailsNone(t *testing.T) {
	se := mustFail(t, M{"x": One(Number, String)}, M{"x": true})
	assertEq(t, se.Errors[0].Code, ErrOne)
}

// --- Some ---

func TestSomeMatchesOne(t *testing.T) {
	result := mustValidate(t, M{"x": Some(Number, String)}, M{"x": 42.0})
	assertEq(t, result.(M)["x"], 42.0)
}

func TestSomeFailsNone(t *testing.T) {
	se := mustFail(t, M{"x": Some(Number, String)}, M{"x": true})
	assertEq(t, se.Errors[0].Code, ErrSome)
}

// --- All ---

func TestAllPasses(t *testing.T) {
	// Both schemas accept the value
	schema := M{"x": All(
		Min(1, Number),
		Max(10, Number),
	)}
	result := mustValidate(t, schema, M{"x": 5.0})
	assertEq(t, result.(M)["x"], 5.0)
}

func TestAllFailsOne(t *testing.T) {
	schema := M{"x": All(
		Min(1, Number),
		Max(10, Number),
	)}
	se := mustFail(t, schema, M{"x": 0.0})
	// Should fail on Min
	assertEq(t, se.Errors[0].Code, ErrMin)
}

// --- Exact ---

func TestExactString(t *testing.T) {
	result := mustValidate(t, M{"role": Exact("admin", "user")}, M{"role": "admin"})
	assertEq(t, result.(M)["role"], "admin")
}

func TestExactStringFails(t *testing.T) {
	se := mustFail(t, M{"role": Exact("admin", "user")}, M{"role": "guest"})
	assertEq(t, se.Errors[0].Code, ErrExact)
}

func TestExactNumber(t *testing.T) {
	result := mustValidate(t, M{"x": Exact(1.0, 2.0, 3.0)}, M{"x": 2.0})
	assertEq(t, result.(M)["x"], 2.0)
}

// --- Check ---

func TestCheck(t *testing.T) {
	positive := Check(func(v any) error {
		if n, ok := v.(float64); ok && n > 0 {
			return nil
		}
		return fmt.Errorf("must be positive")
	})
	result := mustValidate(t, M{"x": positive}, M{"x": 5.0})
	assertEq(t, result.(M)["x"], 5.0)
}

func TestCheckFails(t *testing.T) {
	positive := Check(func(v any) error {
		if n, ok := v.(float64); ok && n > 0 {
			return nil
		}
		return fmt.Errorf("must be positive")
	})
	se := mustFail(t, M{"x": positive}, M{"x": -1.0})
	assertEq(t, se.Errors[0].Code, ErrCheck)
}

// --- Before / After ---

func TestBefore(t *testing.T) {
	called := false
	schema := M{"x": Before(func(v any) error {
		called = true
		return nil
	}, Number)}
	mustValidate(t, schema, M{"x": 1.0})
	if !called {
		t.Error("before validator not called")
	}
}

func TestBeforeFails(t *testing.T) {
	schema := M{"x": Before(func(v any) error {
		return fmt.Errorf("before failed")
	}, Number)}
	se := mustFail(t, schema, M{"x": 1.0})
	assertEq(t, se.Errors[0].Code, ErrCheck)
}

func TestAfter(t *testing.T) {
	called := false
	schema := M{"x": After(func(v any) error {
		called = true
		return nil
	}, Number)}
	mustValidate(t, schema, M{"x": 1.0})
	if !called {
		t.Error("after validator not called")
	}
}

// --- Open / Closed ---

func TestClosedRejectsExtra(t *testing.T) {
	schema := M{"x": Closed(M{"a": String})}
	se := mustFail(t, schema, M{"x": M{"a": "ok", "b": "extra"}})
	found := false
	for _, e := range se.Errors {
		if e.Code == ErrClosed {
			found = true
		}
	}
	if !found {
		t.Error("expected ErrClosed for extra property")
	}
}

func TestClosedAcceptsDeclared(t *testing.T) {
	schema := M{"x": Closed(M{"a": String})}
	result := mustValidate(t, schema, M{"x": M{"a": "hello"}})
	inner := result.(M)["x"].(M)
	assertEq(t, inner["a"], "hello")
}

// --- Empty ---

func TestEmptyAllowsEmptyString(t *testing.T) {
	result := mustValidate(t, M{"x": Empty(Required(String))}, M{"x": ""})
	assertEq(t, result.(M)["x"], "")
}

func TestRequiredStringRejectsEmpty(t *testing.T) {
	se := mustFail(t, M{"x": Required(String)}, M{"x": ""})
	assertEq(t, se.Errors[0].Code, ErrEmpty)
}

// --- Composition ---

func TestRequiredOptionalOverride(t *testing.T) {
	// Optional wrapping Required — Optional wins
	result := mustValidate(t, M{"x": Optional(Required(String))}, M{})
	assertEq(t, result.(M)["x"], "")
}

func TestMinMaxNested(t *testing.T) {
	schema := M{"x": Min(1, Max(10, Default(5.0, Number)))}
	result := mustValidate(t, schema, M{})
	assertEq(t, result.(M)["x"], 5.0)
}

// --- IsShapeError / Errors helpers ---

func TestIsShapeError(t *testing.T) {
	_, err := New(M{"x": String}).Validate(M{})
	if !IsShapeError(err) {
		t.Error("expected IsShapeError to return true")
	}
}

func TestErrorsHelper(t *testing.T) {
	_, err := New(M{"x": String}).Validate(M{})
	errs := Errors(err)
	if len(errs) == 0 {
		t.Error("expected non-empty errors")
	}
}

func TestErrorsHelperNil(t *testing.T) {
	errs := Errors(nil)
	if errs != nil {
		t.Error("expected nil for nil error")
	}
}

func TestErrorsHelperNonShape(t *testing.T) {
	errs := Errors(errors.New("not a shape error"))
	if errs != nil {
		t.Error("expected nil for non-ShapeError")
	}
}

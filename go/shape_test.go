package shape

import (
	"errors"
	"testing"
)

// --- Helpers ---

func mustValidate(t *testing.T, spec any, data any) any {
	t.Helper()
	s := New(spec)
	result, err := s.Validate(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	return result
}

func mustFail(t *testing.T, spec any, data any) *ShapeError {
	t.Helper()
	s := New(spec)
	_, err := s.Validate(data)
	if err == nil {
		t.Fatal("expected validation error, got nil")
	}
	var se *ShapeError
	if !errors.As(err, &se) {
		t.Fatalf("expected *ShapeError, got %T", err)
	}
	return se
}

func assertEq(t *testing.T, got, want any) {
	t.Helper()
	if got != want {
		t.Errorf("got %v (%T), want %v (%T)", got, got, want, want)
	}
}

// --- Kind Sentinel Tests ---

func TestStringKind(t *testing.T) {
	result := mustValidate(t, M{"name": String}, M{"name": "Alice"})
	m := result.(M)
	assertEq(t, m["name"], "Alice")
}

func TestStringKindRejectsNumber(t *testing.T) {
	se := mustFail(t, M{"name": String}, M{"name": 42})
	assertEq(t, se.Errors[0].Path, "name")
	assertEq(t, se.Errors[0].Code, ErrType)
}

func TestStringKindRequired(t *testing.T) {
	se := mustFail(t, M{"name": String}, M{})
	assertEq(t, se.Errors[0].Path, "name")
	assertEq(t, se.Errors[0].Code, ErrRequired)
}

func TestNumberKind(t *testing.T) {
	// float64
	result := mustValidate(t, M{"age": Number}, M{"age": 30.0})
	assertEq(t, result.(M)["age"], 30.0)

	// int
	result = mustValidate(t, M{"age": Number}, M{"age": 30})
	assertEq(t, result.(M)["age"], 30)
}

func TestNumberKindRejectsString(t *testing.T) {
	se := mustFail(t, M{"age": Number}, M{"age": "thirty"})
	assertEq(t, se.Errors[0].Code, ErrType)
}

func TestIntegerKind(t *testing.T) {
	result := mustValidate(t, M{"count": Integer}, M{"count": 5})
	assertEq(t, result.(M)["count"], 5)
}

func TestIntegerKindRejectsFloat(t *testing.T) {
	se := mustFail(t, M{"count": Integer}, M{"count": 5.5})
	assertEq(t, se.Errors[0].Code, ErrType)
}

func TestFloatKind(t *testing.T) {
	result := mustValidate(t, M{"score": Float}, M{"score": 3.14})
	assertEq(t, result.(M)["score"], 3.14)
}

func TestFloatKindRejectsInt(t *testing.T) {
	se := mustFail(t, M{"score": Float}, M{"score": 3})
	assertEq(t, se.Errors[0].Code, ErrType)
}

func TestBoolKind(t *testing.T) {
	result := mustValidate(t, M{"active": Bool}, M{"active": true})
	assertEq(t, result.(M)["active"], true)
}

func TestBoolKindRejectsString(t *testing.T) {
	se := mustFail(t, M{"active": Bool}, M{"active": "yes"})
	assertEq(t, se.Errors[0].Code, ErrType)
}

// --- Literal Default Tests ---

func TestLiteralStringDefault(t *testing.T) {
	result := mustValidate(t, M{"tag": "default-tag"}, M{})
	assertEq(t, result.(M)["tag"], "default-tag")
}

func TestLiteralStringOverride(t *testing.T) {
	result := mustValidate(t, M{"tag": "default-tag"}, M{"tag": "custom"})
	assertEq(t, result.(M)["tag"], "custom")
}

func TestLiteralNumberDefault(t *testing.T) {
	result := mustValidate(t, M{"count": 0.0}, M{})
	assertEq(t, result.(M)["count"], 0.0)
}

func TestLiteralNumberOverride(t *testing.T) {
	result := mustValidate(t, M{"count": 0.0}, M{"count": 42.0})
	assertEq(t, result.(M)["count"], 42.0)
}

func TestLiteralBoolDefault(t *testing.T) {
	result := mustValidate(t, M{"flag": false}, M{})
	assertEq(t, result.(M)["flag"], false)
}

// --- Nested Object Tests ---

func TestNestedObject(t *testing.T) {
	schema := New(M{
		"user": M{
			"name": String,
			"age":  Number,
		},
	})
	result, err := schema.Validate(M{
		"user": M{"name": "Bob", "age": 25.0},
	})
	if err != nil {
		t.Fatal(err)
	}
	user := result.(M)["user"].(M)
	assertEq(t, user["name"], "Bob")
	assertEq(t, user["age"], 25.0)
}

func TestNestedObjectDefaults(t *testing.T) {
	schema := New(M{
		"config": M{
			"debug": false,
			"level": 1.0,
		},
	})
	result, err := schema.Validate(M{
		"config": M{},
	})
	if err != nil {
		t.Fatal(err)
	}
	config := result.(M)["config"].(M)
	assertEq(t, config["debug"], false)
	assertEq(t, config["level"], 1.0)
}

func TestNestedObjectMissingRequired(t *testing.T) {
	se := mustFail(t, M{
		"user": M{"name": String},
	}, M{
		"user": M{},
	})
	assertEq(t, se.Errors[0].Path, "user.name")
	assertEq(t, se.Errors[0].Code, ErrRequired)
}

// --- Array Tests ---

func TestArrayOfNumbers(t *testing.T) {
	result := mustValidate(t, M{"items": L{Number}}, M{"items": L{1.0, 2.0, 3.0}})
	items := result.(M)["items"].([]any)
	assertEq(t, len(items), 3)
	assertEq(t, items[0], 1.0)
}

func TestArrayElementTypeMismatch(t *testing.T) {
	se := mustFail(t, M{"items": L{Number}}, M{"items": L{1.0, "two", 3.0}})
	assertEq(t, se.Errors[0].Path, "items[1]")
	assertEq(t, se.Errors[0].Code, ErrType)
}

func TestArrayDefault(t *testing.T) {
	result := mustValidate(t, M{"items": L{Number}}, M{})
	// Missing optional array should get default empty array
	items := result.(M)["items"]
	if items != nil {
		arr, ok := items.([]any)
		if ok && len(arr) != 0 {
			t.Errorf("expected empty or nil array default, got %v", items)
		}
	}
}

// --- Top-level non-object Tests ---

func TestTopLevelString(t *testing.T) {
	result := mustValidate(t, String, "hello")
	assertEq(t, result, "hello")
}

func TestTopLevelNumber(t *testing.T) {
	result := mustValidate(t, Number, 42.0)
	assertEq(t, result, 42.0)
}

func TestTopLevelArray(t *testing.T) {
	result := mustValidate(t, L{String}, L{"a", "b"})
	arr := result.([]any)
	assertEq(t, len(arr), 2)
	assertEq(t, arr[0], "a")
}

// --- Multi-field Schema Tests ---

func TestMultiFieldSchema(t *testing.T) {
	schema := New(M{
		"name":   String,
		"age":    Number,
		"active": Bool,
		"tag":    "default",
	})

	result, err := schema.Validate(M{
		"name":   "Alice",
		"age":    30.0,
		"active": true,
	})
	if err != nil {
		t.Fatal(err)
	}

	m := result.(M)
	assertEq(t, m["name"], "Alice")
	assertEq(t, m["age"], 30.0)
	assertEq(t, m["active"], true)
	assertEq(t, m["tag"], "default")
}

func TestMultiFieldMissingRequired(t *testing.T) {
	schema := New(M{
		"name": String,
		"age":  Number,
	})

	se := mustFail(t, schema.root, M{"name": "Alice"})
	// Should have error for missing "age"
	found := false
	for _, e := range se.Errors {
		if e.Path == "age" {
			found = true
		}
	}
	if !found {
		t.Error("expected error for missing 'age'")
	}
}

// --- Error Structure Tests ---

func TestShapeErrorInterface(t *testing.T) {
	_, err := New(M{"name": String}).Validate(M{})
	if err == nil {
		t.Fatal("expected error")
	}

	var se *ShapeError
	if !errors.As(err, &se) {
		t.Fatal("expected *ShapeError")
	}

	if len(se.Errors) == 0 {
		t.Fatal("expected at least one FieldError")
	}

	// Error() should produce a readable string
	msg := err.Error()
	if msg == "" {
		t.Error("error message should not be empty")
	}
}

// --- Must Tests ---

func TestMustSuccess(t *testing.T) {
	result := New(M{"x": 1.0}).Must(M{"x": 2.0})
	assertEq(t, result.(M)["x"], 2.0)
}

func TestMustPanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic")
		}
	}()
	New(M{"x": String}).Must(M{})
}

// --- Convenience Functions ---

func TestValidateFunc(t *testing.T) {
	result, err := Validate(M{"x": String}, M{"x": "hello"})
	if err != nil {
		t.Fatal(err)
	}
	assertEq(t, result.(M)["x"], "hello")
}

func TestMustValidateFunc(t *testing.T) {
	result := MustValidate(M{"x": 1.0}, M{})
	assertEq(t, result.(M)["x"], 1.0)
}

// --- Extra properties pass through ---

func TestExtraPropertiesPassThrough(t *testing.T) {
	result := mustValidate(t, M{"name": String}, M{"name": "Alice", "extra": "data"})
	m := result.(M)
	assertEq(t, m["name"], "Alice")
	assertEq(t, m["extra"], "data")
}

// --- Int values for Number kind ---

func TestNumberKindAcceptsInt(t *testing.T) {
	result := mustValidate(t, M{"n": Number}, M{"n": 42})
	assertEq(t, result.(M)["n"], 42)
}

func TestNumberKindAcceptsInt64(t *testing.T) {
	result := mustValidate(t, M{"n": Number}, M{"n": int64(100)})
	assertEq(t, result.(M)["n"], int64(100))
}

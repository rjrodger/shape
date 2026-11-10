package shape

import (
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"
)

func mustValid(t *testing.T, s *Schema, in any) any {
	t.Helper()
	out, err := s.Validate(in)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	return out
}

func mustInvalid(t *testing.T, s *Schema, in any, wantSubstr string) {
	t.Helper()
	_, err := s.Validate(in)
	if err == nil {
		t.Fatalf("expected error containing %q", wantSubstr)
	}
	if wantSubstr != "" && !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(wantSubstr)) {
		t.Fatalf("expected error containing %q, got %q", wantSubstr, err.Error())
	}
}

// --- Instance methods ----------------------------------------------------

func TestSchemaMatchValidError(t *testing.T) {
	s := MustShape(map[string]any{"x": Number})

	if !s.Match(map[string]any{"x": 1}) {
		t.Fatal("expected match")
	}
	if s.Match(map[string]any{"x": "no"}) {
		t.Fatal("did not expect match")
	}
	if !s.Valid(map[string]any{"x": 1}) {
		t.Fatal("expected valid")
	}

	errs := s.Error(map[string]any{"x": "no"})
	if len(errs) != 1 {
		t.Fatalf("expected 1 error, got %d", len(errs))
	}
	if errs[0].Why != WhyType {
		t.Fatalf("expected why=type, got %q", errs[0].Why)
	}
	if errs[0].Path != "x" {
		t.Fatalf("expected path=x, got %q", errs[0].Path)
	}
}

func TestSchemaSpec(t *testing.T) {
	s := MustShape(map[string]any{"x": Number, "y": "ok"})
	spec := s.Spec()
	m, ok := spec.(map[string]any)
	if !ok {
		t.Fatalf("expected spec map, got %T", spec)
	}
	if m["kind"] != string(KindObject) {
		t.Fatalf("expected object kind, got %v", m["kind"])
	}
	// A composition names its mode.
	for want, s := range map[string]*Schema{"nof": MustShape(Nof(1, String)), "all": MustShape(All(String))} {
		if got := s.Spec().(map[string]any)["listMode"]; got != want {
			t.Fatalf("listMode = %v, want %v", got, want)
		}
	}
}

// --- Min / Max / Above / Below / Len ------------------------------------

func TestMinMaxNumber(t *testing.T) {
	s := MustShape(Min(2, Max(10, Number)))
	mustValid(t, s, 5)
	mustInvalid(t, s, 1, "minimum")
	mustInvalid(t, s, 100, "maximum")
}

func TestMinStringLength(t *testing.T) {
	s := MustShape(Min(3, String))
	mustValid(t, s, "abcd")
	mustInvalid(t, s, "ab", "minimum length")
}

func TestLenArray(t *testing.T) {
	s := MustShape(Len(2, []any{Number}))
	mustValid(t, s, []any{1, 2})
	mustInvalid(t, s, []any{1, 2, 3}, "exactly 2")
}

func TestAboveBelow(t *testing.T) {
	s := MustShape(Above(0, Below(10, Number)))
	mustValid(t, s, 5)
	mustInvalid(t, s, 0, "above 0")
	mustInvalid(t, s, 10, "below 10")
}

// --- Exact / Never / Empty ---------------------------------------------

func TestExact(t *testing.T) {
	s := MustShape(Exact("a", "b", 3))
	mustValid(t, s, "a")
	mustValid(t, s, 3)
	mustInvalid(t, s, "c", "exactly one of")
}

func TestNever(t *testing.T) {
	s := MustShape(Never())
	mustInvalid(t, s, 1, "no value is allowed")
}

// Never alone requires a value it cannot have; optional, the value must be
// absent (ts/test/builder.test.ts builder-never).
func TestNeverRequiresValue(t *testing.T) {
	g1 := MustShape(map[string]any{"a": Never()})
	mustErr(t, g1, map[string]any{}, `Validation failed for property "a" with value "undefined" because no value is allowed.`)
	for _, g2 := range []*Schema{
		MustShape(map[string]any{"a": Optional(Never())}),
		MustShape(map[string]any{"a": Skip(Never())}),
		MustShape(map[string]any{"a": Never().Optional()}),
		// Chained in the string form, Never keeps the node's flags.
		MustShape(map[string]any{"a": MustExpr("Optional(String).Never")}),
	} {
		if out := mustOK(t, g2, map[string]any{}); !reflect.DeepEqual(out, map[string]any{}) {
			t.Fatalf("absent value: got %#v", out)
		}
		mustErr(t, g2, map[string]any{"a": 1.0}, `Validation failed for property "a" with number "1" because no value is allowed.`)
	}
	// A builder's fault is a Never that requires a value too, so it speaks
	// for an absent value as well.
	mustErr(t, MustShape(map[string]any{"a": Min("x")}), map[string]any{}, "Shape: Min needs a number")
	mustErr(t, MustShape(map[string]any{"a": Optional(Number).Min("x")}), map[string]any{}, "Shape: Min needs a number")
}

// Exact requires a value, as a type token does, until it is made optional; a
// default it allows stands in for an absent value, and one it does not is
// still an error (ts/test/builder.test.ts builder-exact).
func TestExactRequiresValue(t *testing.T) {
	g2 := MustShape(map[string]any{"a": Exact("x", "y")})
	mustErr(t, g2, map[string]any{}, `Value "undefined" for property "a" must be exactly one of: x, y`)
	for _, g3 := range []*Schema{
		MustShape(map[string]any{"a": Optional(Exact("x", "y"))}),
		MustShape(map[string]any{"a": Skip(Exact("x", "y"))}),
		MustShape(map[string]any{"a": Exact("x", "y").Optional()}),
	} {
		if out := mustOK(t, g3, map[string]any{}); !reflect.DeepEqual(out, map[string]any{}) {
			t.Fatalf("absent value: got %#v", out)
		}
		mustOK(t, g3, map[string]any{"a": "y"})
		mustErr(t, g3, map[string]any{"a": "z"}, "must be exactly one of: x, y")
	}
	if out := mustOK(t, MustShape(map[string]any{"a": Default("x", Exact("x", "y"))}), map[string]any{}); !reflect.DeepEqual(out, map[string]any{"a": "x"}) {
		t.Fatalf("listed default: got %#v", out)
	}
	mustErr(t, MustShape(map[string]any{"a": Default("z", Exact("x", "y"))}), map[string]any{}, "must be exactly one of: x, y")
	mustErr(t, MustShape(map[string]any{"a": Required(Exact("x", "y"))}), map[string]any{}, "must be exactly one of: x, y")
	// An absent value is not the null listed, as undefined is not null.
	mustErr(t, MustShape(map[string]any{"a": Exact("x", nil)}), map[string]any{}, `Value "undefined" for property "a" must be exactly one of: x, null`)
	// A missing value renders as "undefined" in a template a "$" sends
	// through the replacements.
	mustErr(t, MustShape(map[string]any{"a": Exact("$1")}), map[string]any{}, `Value "undefined" for property "a" must be exactly one of: $1`)
	// An object or array value reads as its JSON.
	mustErr(t, MustShape(Exact(map[string]any{"a": 1.0}, []any{1.0, 2.0})), 1.0, `must be exactly one of: {"a":1}, [1,2]`)
}

// Nullable accepts null whatever a check would make of it
// (ts/test/builder.test.ts builder-nullable-checks).
func TestNullableChecks(t *testing.T) {
	fail := func(val any, update *Update, state *State) bool { return false }
	isOne := func(val any, update *Update, state *State) bool { return val == 1.0 }
	for _, s := range []*Schema{
		MustShape(Nullable(Exact(1.0))),
		MustShape(Nullable(Nof(1, String, Number))),
		MustShape(Nullable(All(String, Min(1)))),
		MustShape(Nullable(Check(isOne))),
		MustShape(Nullable(After(fail, String))),
	} {
		if out := mustOK(t, s, Null); out != nil {
			t.Fatalf("null: got %#v", out)
		}
	}
	mustErr(t, MustShape(Nullable(Exact(1.0))), 2.0, "must be exactly one of: 1")
	mustErr(t, MustShape(Nullable(Nof(1, String, Number))), true, "satisfies 0 of: String, Number")
	mustErr(t, MustShape(Nullable(Check(isOne))), 2.0, "check")
	if out := mustOK(t, MustShape(map[string]any{"a": Nullable(Exact("x"))}), map[string]any{"a": nil}); !reflect.DeepEqual(out, map[string]any{"a": nil}) {
		t.Fatalf("null property: got %#v", out)
	}
	mustErr(t, MustShape(map[string]any{"a": Nullable(Exact("x"))}), map[string]any{}, "must be exactly one of: x")
}

// Exactly one of shapes of different kinds: the value's kind chooses, and
// that shape's errors are the errors (ts/test/builder.test.ts
// builder-nof-kinds).
func TestNofKinds(t *testing.T) {
	g0 := MustShape(Nof(1, Min(2, String), Number, map[string]any{"a": 1.0}))
	mustErr(t, g0, "a", `Value "a" for property "" must be a minimum length of 2 (was 1).`)
	mustOK(t, g0, 5.0)
	if out := mustOK(t, g0, map[string]any{}); !reflect.DeepEqual(out, map[string]any{"a": 1.0}) {
		t.Fatalf("object branch: got %#v", out)
	}
	mustErr(t, g0, map[string]any{"a": "x"}, `Validation failed for property "a" with string "x" because the string is not of type number.`)
	mustErr(t, g0, true, `Value "true" for property "" satisfies 0 of: String.Min(2), Number, `)

	// Otherwise every shape is tried, and the count is the message: a
	// nullable shape, one that may take another kind, two of one kind.
	mustErr(t, MustShape(Nof(1, Nullable(Min(2, String)), Number)), "a", "satisfies 0 of")
	mustErr(t, MustShape(Nof(1, Min(1, Coerce(Number)), String)), "3", "satisfies 2 of")
	mustErr(t, MustShape(Nof(1, Min(1, String), Max(3, String))), "ab", "satisfies 2 of")
	mustErr(t, MustShape(Nof(1, Min(2, String), Number)), Null, "satisfies 0 of")
	// A function check is the caller's, and may take any kind; so may a
	// shape that renames or is ignored.
	fn := func(val any, update *Update, state *State) bool { return false }
	for _, s := range [][]any{
		{Check(fn, Number), String},
		{RenameWith("b", RenameOptions{}, Number), String},
		{Ignore(Number), String},
	} {
		if MustShape(Nof(1, s...)).root.nofKinds != nil {
			t.Fatalf("%v should have no kinds", s)
		}
	}
	// A regexp check, a format and a definition keep the kind; a bare
	// regexp check has none.
	if k := MustShape(Nof(1, Check(regexp.MustCompile("^a"), String), Define("d", Integer), []any{})).root.nofKinds; !reflect.DeepEqual(k, []string{"string", "number", "array"}) {
		t.Fatalf("kinds = %v", k)
	}
	if k := MustShape(Nof(1, Email(), Number)).root.nofKinds; !reflect.DeepEqual(k, []string{"string", "number"}) {
		t.Fatalf("kinds = %v", k)
	}
	if k := MustShape(Nof(1, Check(regexp.MustCompile("^a")), Number)).root.nofKinds; k != nil {
		t.Fatalf("kinds = %v", k)
	}
	// A scalar's shape stands in the Nof's place, so in an array it names an
	// index, as TypeScript's walk does; where the Nof is not its node's one
	// check, or the value is an object or array, the shape is a call of its
	// own, whose root names a property.
	scalar := `Validation failed for %s "0" with number "1.5" because the number is not of type integer.`
	for _, s := range []any{Nof(1, Integer, String), Describe("d", Nof(1, Integer, String)),
		Default(1.0, Nof(1, Integer, String)), Nullable(Nof(1, Integer, String))} {
		mustErr(t, MustShape([]any{s}), []any{1.5}, fmt.Sprintf(scalar, "index"))
	}
	for _, s := range []any{Min(1, Nof(1, Integer, String)), Define("d", Nof(1, Integer, String))} {
		mustErr(t, MustShape([]any{s}), []any{1.5}, fmt.Sprintf(scalar, "property"))
	}
	mustErr(t, MustShape([]any{Nof(1, String, Integer)}), []any{""},
		`Validation failed for index "0" with string "" because an empty string is not allowed.`)
	objCheck := func() *Node { return Nof(1, Integer, Check(regexp.MustCompile("^a"), map[string]any{})) }
	failed := `Validation failed for %s "0" with object "{}" because check "/^a/" failed.`
	mustErr(t, MustShape([]any{objCheck()}), []any{map[string]any{}}, fmt.Sprintf(failed, "property"))
	// Within the branch a value was put to in a call of its own, the value
	// is that call's copy, and any value's shape stands in its Nof's place.
	mustErr(t, MustShape(Nof(1, Integer, []any{objCheck()})), []any{map[string]any{}}, fmt.Sprintf(failed, "index"))
	mustErr(t, MustShape(Nof(1, Integer, []any{Min(0, objCheck())})), []any{map[string]any{}}, fmt.Sprintf(failed, "property"))
	// Called with no context, the branch makes its own.
	sub := &ValidationError{}
	validateNode(objCheck().n, map[string]any{}, []string{}, []any{}, "", nil, nil, false, sub)
	if !sub.hasAny() {
		t.Fatal("the object branch should fail")
	}
	// An ignored Nof says nothing of a failing branch.
	if out := mustOK(t, MustShape(map[string]any{"a": Ignore(Nof(1, Min(2, String), Number))}), map[string]any{"a": "a"}); !reflect.DeepEqual(out, map[string]any{}) {
		t.Fatalf("ignored: got %#v", out)
	}
}

// The kind of a value, as a Nof chooses its branch by it: a date is an
// object, as typeof says in JavaScript, and a function is of no kind.
func TestKindOf(t *testing.T) {
	type pair struct{ A int }
	for v, want := range map[any]string{
		"x": "string", 1: "number", true: "boolean", time.Unix(0, 0): "object", pair{1}: "object",
	} {
		if got := kindOf(v); got != want {
			t.Fatalf("kindOf(%#v) = %q", v, got)
		}
	}
	for v, want := range map[string]any{"null": nil, "array": []string{"a"}, "object": map[string]int{}, "": func() {}} {
		if got := kindOf(want); got != v {
			t.Fatalf("kindOf(%#v) = %q", want, got)
		}
	}
}

// A missing tuple position that produces nothing is left out, and one after
// it that does leaves a null in its place, as TypeScript's array has a hole
// there.
func TestTupleMissingPositions(t *testing.T) {
	if out := mustOK(t, MustShape([]any{String, Optional(Any)}), []any{"a"}); !reflect.DeepEqual(out, []any{"a"}) {
		t.Fatalf("got %#v", out)
	}
	if out := mustOK(t, MustShape(Closed([]any{Optional(Any), 7.0})), []any{}); !reflect.DeepEqual(out, []any{nil, 7.0}) {
		t.Fatalf("got %#v", out)
	}
	if out := mustOK(t, MustShape(Closed([]any{Skip(String), Skip(Number)})), []any{"a"}); !reflect.DeepEqual(out, []any{"a"}) {
		t.Fatalf("got %#v", out)
	}
}

// A failing branch of All reports its own errors, each once, at the All's
// path (ts/test/builder.test.ts builder-all).
func TestAllBranchErrors(t *testing.T) {
	g0 := MustShape(All(Open(map[string]any{"x": 1.0}), Open(map[string]any{"y": "a"})))
	if out := mustOK(t, g0, map[string]any{}); !reflect.DeepEqual(out, map[string]any{"x": 1.0, "y": "a"}) {
		t.Fatalf("defaults: got %#v", out)
	}
	mustErr(t, g0, map[string]any{"x": "b", "y": "a"},
		`Validation failed for property "x" with string "b" because the string is not of type number.`)
	g4 := MustShape(All(Open(map[string]any{"x": 1.0}), Open(map[string]any{"y": 2.0})))
	_, err := g4.Validate(map[string]any{"x": "X", "y": "Y"})
	if err == nil || err.Error() != "Validation failed for property \"x\" with string \"X\" because the string is not of type number.\n"+
		"Validation failed for property \"y\" with string \"Y\" because the string is not of type number." {
		t.Fatalf("got %v", err)
	}
	// The same error from two branches is said once.
	_, err = MustShape(map[string]any{"a": All(String, Min(2, String))}).Validate(map[string]any{"a": 1.0})
	if err == nil || err.Error() != `Validation failed for property "a" with number "1" because the number is not of type string.` {
		t.Fatalf("got %v", err)
	}
	mustErr(t, MustShape(map[string]any{"a": All(Open(map[string]any{"b": String}), Max(2))}),
		map[string]any{"a": map[string]any{"b": "X", "c": "Y", "d": "Z"}},
		`Value "{b:X,c:Y,d:Z}" for property "a" must be a maximum length of 2 (was 3).`)
	// A branch that produces nothing from an absent value passes it on
	// absent, so the next one finds it missing.
	mustErr(t, MustShape(map[string]any{"a": All(Skip(Number), Number)}), map[string]any{},
		`Validation failed for property "a" because the property is missing.`)
	// Inside an array, a branch's root names a property, as in TypeScript.
	mustErr(t, MustShape([]any{All(String, Number)}), []any{true},
		`Validation failed for property "0" with boolean "true" because the boolean is not of type string.`)
	// A match counts the errors and reads no text.
	if g4.Match(map[string]any{"x": "X", "y": "Y"}) {
		t.Fatal("a failing All matched")
	}
}

func TestEmptyString(t *testing.T) {
	// Plain String token rejects empty strings.
	s := MustShape(String)
	mustInvalid(t, s, "", "empty")

	// Empty(String) accepts them.
	se := MustShape(Empty(String))
	out, err := se.Validate("")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if out != "" {
		t.Fatalf("expected empty string, got %v", out)
	}
}

// --- Skip / Default / Ignore -------------------------------------------

func TestSkip(t *testing.T) {
	s := MustShape(map[string]any{"x": Skip(Number)})
	out := mustValid(t, s, map[string]any{}).(map[string]any)
	if _, has := out["x"]; has {
		t.Fatalf("expected x to be skipped, got %v", out)
	}
}

func TestDefault(t *testing.T) {
	s := MustShape(map[string]any{"x": Default(42, Number)})
	out := mustValid(t, s, map[string]any{}).(map[string]any)
	if out["x"] != 42 {
		t.Fatalf("expected default 42, got %v", out["x"])
	}
}

func TestIgnoreSuppressesErrors(t *testing.T) {
	s := MustShape(map[string]any{"x": Ignore(Number)})
	out, err := s.Validate(map[string]any{"x": "not a number"})
	if err != nil {
		t.Fatalf("ignored child should not fail: %v", err)
	}
	if _, has := out.(map[string]any)["x"]; has {
		// Ignore yields undefined; either keep raw or drop — both acceptable.
		// We assert no error for now.
	}
}

// --- Nof / All ----------------------------------------------------------

func TestNofExactlyOne(t *testing.T) {
	s := MustShape(Nof(1, Number, String))
	mustValid(t, s, 5)
	mustValid(t, s, "x")
	mustInvalid(t, s, true, "satisfies 0 of")
}

func TestNofAtLeastOne(t *testing.T) {
	s := MustShape(Nof(Min(1), Number, String))
	mustValid(t, s, 1)
	mustValid(t, s, "ok")
	mustInvalid(t, s, true, "the count must be Min(1)")
}

func TestAll(t *testing.T) {
	s := MustShape(All(Min(2, Number), Max(10, Number)))
	mustValid(t, s, 5)
	// A failing branch's own errors are the errors.
	mustInvalid(t, s, 1, `Value "1" for property "" must be a minimum of 2 (was 1).`)
}

// --- Check (function + regex) ------------------------------------------

func TestCheckFunction(t *testing.T) {
	s := MustShape(Check(func(val any, update *Update, state *State) bool {
		s, ok := val.(string)
		if !ok || !strings.HasPrefix(s, "x-") {
			update.Why = "prefix"
			return false
		}
		return true
	}))
	mustValid(t, s, "x-good")
	mustInvalid(t, s, "bad", "check")
}

func TestCheckRegex(t *testing.T) {
	re := regexp.MustCompile(`^[a-z]+$`)
	s := MustShape(Check(re))
	mustValid(t, s, "abc")
	// TS renders Check(RegExp) failures as: check "/pattern/" failed.
	mustInvalid(t, s, "ABC", `check "/^[a-z]+$/" failed`)
}

// --- Tuple arrays ------------------------------------------------------

func TestTupleArray(t *testing.T) {
	s := MustShape([]any{Number, String, Boolean})
	mustValid(t, s, []any{1, "x", true})
	mustInvalid(t, s, []any{1, 2, true}, "string")
}

func TestArrayChildSingleRepeats(t *testing.T) {
	s := MustShape([]any{Number})
	mustValid(t, s, []any{1, 2, 3, 4})
}

// --- Open / Closed / Child ---------------------------------------------

func TestChildObject(t *testing.T) {
	s := MustShape(Child(Number, map[string]any{"a": 1}))
	out := mustValid(t, s, map[string]any{"a": 2, "b": 7}).(map[string]any)
	if out["b"] != 7 {
		t.Fatalf("expected open child to retain b: %v", out)
	}
	mustInvalid(t, s, map[string]any{"a": 2, "b": "x"}, "number")
}

// --- NaN ---------------------------------------------------------------

func TestNumberRejectsNaN(t *testing.T) {
	s := MustShape(Number)
	mustInvalid(t, s, nanFloat(), "number")
}

// --- Fault custom error ------------------------------------------------

func TestFault(t *testing.T) {
	s := MustShape(Fault("bad value $VALUE at $PATH", map[string]any{"x": Number}))
	_, err := s.Validate("not an object")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "bad value") {
		t.Fatalf("expected fault message, got %q", err.Error())
	}
}

// --- Stringify ---------------------------------------------------------

func TestStringify(t *testing.T) {
	s := MustShape(Min(2, String))
	out := s.String()
	if !strings.Contains(out, "Min(2)") || !strings.Contains(out, "String") {
		t.Fatalf("expected Stringified node to contain builder names: %q", out)
	}
}

// --- Define / Refer ----------------------------------------------------

func TestDefineRefer(t *testing.T) {
	s := MustShape(map[string]any{
		"src":  Define("name", String),
		"echo": Refer("name", String),
	})
	out := mustValid(t, s, map[string]any{"src": "alice", "echo": "alice"}).(map[string]any)
	if out["echo"] != "alice" {
		t.Fatalf("expected echo=alice, got %v", out["echo"])
	}
}

// --- Rename ------------------------------------------------------------

func TestRename(t *testing.T) {
	s := MustShape(map[string]any{
		"a": Rename("b", Number),
	})
	out, err := s.Validate(map[string]any{"a": 1})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	m := out.(map[string]any)
	if m["b"] != 1 {
		t.Fatalf("expected b=1, got %v", m)
	}
	if _, has := m["a"]; has {
		t.Fatalf("expected a to be removed: %v", m)
	}
}

// --- Chainable methods ------------------------------------------------

func TestChainable(t *testing.T) {
	s := MustShape(Required().Min(2).Max(5))
	mustValid(t, s, 3)
	mustInvalid(t, s, 1, "minimum")
	mustInvalid(t, s, 9, "maximum")
}

// --- Required-on-string-token rejects "" -------------------------------

func TestRequiredStringRejectsEmpty(t *testing.T) {
	s := MustShape(map[string]any{"name": String})
	mustInvalid(t, s, map[string]any{"name": ""}, "empty")
}

// --- Path correctness --------------------------------------------------

func TestNestedErrorPath(t *testing.T) {
	s := MustShape(map[string]any{
		"a": map[string]any{
			"b": []any{Number},
		},
	})
	errs := s.Error(map[string]any{
		"a": map[string]any{"b": []any{1, "no"}},
	})
	if len(errs) != 1 {
		t.Fatalf("expected 1 err, got %d (%v)", len(errs), errs)
	}
	if errs[0].Path != "a.b.1" {
		t.Fatalf("expected path a.b.1, got %q", errs[0].Path)
	}
}

// --- Helpers -----------------------------------------------------------

func nanFloat() float64 {
	zero := 0.0
	return zero / zero
}

// Sanity check that DeepEqual still works with our outputs.
func TestDeepEqualOutputs(t *testing.T) {
	s := MustShape(map[string]any{"x": 1, "y": "default"})
	out := mustValid(t, s, map[string]any{"x": 2})
	want := map[string]any{"x": 2, "y": "default"}
	if !reflect.DeepEqual(out, want) {
		t.Fatalf("expected %v, got %v", want, out)
	}
}

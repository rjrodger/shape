package shape

// Tests for behaviours corrected while bringing the Go port to parity with the
// canonical TypeScript implementation. The declarative cases are pinned by the
// shared corpus in ../test/*.tsv; these cover the Go-only surface and the
// regressions that were easiest to reintroduce.

import (
	"math"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"
)

// --- required descendants under an absent parent -------------------------

func TestNestedRequiredUnderAbsentParent(t *testing.T) {
	// cloneDefault skips required children, so short-cutting to it here used to
	// accept {} for a schema that requires a.b.
	s := MustShape(map[string]any{"a": map[string]any{"b": Number}})

	mustErr(t, s, map[string]any{}, `property "a.b"`)
	mustErr(t, s, map[string]any{"a": map[string]any{}}, `property "a.b"`)
	mustOK(t, s, map[string]any{"a": map[string]any{"b": 1.0}})

	deep := MustShape(map[string]any{"a": map[string]any{"b": map[string]any{"c": Number}}})
	mustErr(t, deep, map[string]any{}, `property "a.b.c"`)
	mustErr(t, deep, map[string]any{"a": map[string]any{}}, `property "a.b.c"`)

	// A required tuple position under an absent parent behaves the same way.
	tup := MustShape(map[string]any{"a": []any{Number, String}})
	mustErr(t, tup, map[string]any{}, `index "a.0"`)
}

func TestAbsentParentStillBuildsDefaults(t *testing.T) {
	// The descent must still construct nested defaults, not just raise.
	s := MustShape(map[string]any{"a": map[string]any{"b": 1.0}})
	out := mustOK(t, s, map[string]any{}).(map[string]any)
	if !reflect.DeepEqual(out["a"], map[string]any{"b": 1.0}) {
		t.Fatalf("nested default not built: %#v", out)
	}

	arr := MustShape(map[string]any{"a": []any{1.0, 2.0}})
	aout := mustOK(t, arr, map[string]any{}).(map[string]any)
	if !reflect.DeepEqual(aout["a"], []any{1.0, 2.0}) {
		t.Fatalf("tuple default not built: %#v", aout)
	}

	// A repeating-child array with nothing to repeat over stays empty.
	rep := MustShape(map[string]any{"a": []any{Number}})
	rout := mustOK(t, rep, map[string]any{}).(map[string]any)
	if !reflect.DeepEqual(rout["a"], []any{}) {
		t.Fatalf("repeating array default: %#v", rout)
	}
}

// --- Type() in the string DSL --------------------------------------------

func TestTypeAppliesInStringDSL(t *testing.T) {
	// A bare type token in the DSL parses to Required(tok), a *Node — which the
	// old type switch did not match, leaving the node as KindAny.
	s := MustShape(MustExpr("Type(String)"))
	mustErr(t, s, 1, "is not of type string")
	mustOK(t, s, "x")

	if k := MustExpr("Type(Number)").Kind(); k != KindNumber {
		t.Fatalf("expr Type(Number) kind = %q", k)
	}

	// Structural children are deliberately not carried across, so Type(Object)
	// is a closed object and Type(Array) accepts any elements (as in TS).
	obj := MustShape(MustExpr("Type(Object)"))
	mustOK(t, obj, map[string]any{})
	mustErr(t, obj, map[string]any{"a": 1.0}, `property "a" is not allowed`)

	arr := MustShape(MustExpr("Type(Array)"))
	mustOK(t, arr, []any{1.0, "x"})
	mustErr(t, arr, map[string]any{}, "is not of type array")

	// The builder form takes a Kind or a kind name too.
	mustErr(t, MustShape(Type(KindNumber)), "x", "is not of type number")
	mustErr(t, MustShape(Type("number")), "x", "is not of type number")

	// An unrecognized reference leaves the node alone rather than panicking.
	if k := Type(42).Kind(); k != KindAny {
		t.Fatalf("Type(42) kind = %q", k)
	}
}

// --- Rest validates elements ---------------------------------------------

func TestRestValidatesEveryElement(t *testing.T) {
	// arrRest was only consulted from the tuple branch, so a Rest with no tuple
	// positions in front of it validated nothing at all.
	s := MustShape(MustExpr("Rest(Number)"))
	mustOK(t, s, []any{1.0, 2.0, 3.0})
	mustErr(t, s, []any{1.0, "x"}, `index "1"`)
	mustErr(t, s, []any{"x"}, "is not of type number")
	mustErr(t, s, []any{1.0, nil}, `index "1"`)

	// Nested rest elements are validated too.
	nested := MustShape(map[string]any{"a": MustExpr("Rest(String)")})
	mustOK(t, nested, map[string]any{"a": []any{"x", "y"}})
	mustErr(t, nested, map[string]any{"a": []any{"x", 2.0}}, `index "a.1"`)
}

// --- Ignore at the root ---------------------------------------------------

func TestIgnoreAtRoot(t *testing.T) {
	s := MustShape(Ignore(Number))

	// A clean value survives.
	if out := mustOK(t, s, 5.0); out != 5.0 {
		t.Fatalf("ignore dropped a valid value: %#v", out)
	}

	// A failing value is dropped, and its errors with it.
	out, err := s.Validate("x")
	if err != nil {
		t.Fatalf("ignore leaked an error: %v", err)
	}
	if out != nil {
		t.Fatalf("ignore kept a failing value: %#v", out)
	}
}

// --- empty-string literal spec -------------------------------------------

func TestEmptyStringLiteralSpecAcceptsEmpty(t *testing.T) {
	// Shape("") used to reject its own default value.
	mustOK(t, MustShape(""), "")
	mustOK(t, MustShape(""), "x")
	mustErr(t, MustShape("ab"), "", "an empty string is not allowed")
}

// --- Never on an absent key ----------------------------------------------

func TestNeverRejectsAbsentValue(t *testing.T) {
	s := MustShape(map[string]any{"a": Never(String)})
	mustErr(t, s, map[string]any{}, "no value is allowed")
	mustErr(t, s, map[string]any{"a": "x"}, "no value is allowed")
}

// --- a bare regexp is a type, not a check --------------------------------

func TestBareRegexpIsAType(t *testing.T) {
	s := MustShape(MustExpr(`/^a.+/`))
	mustOK(t, s, "abc")
	mustErr(t, s, "zzz", `the string did not match /^a.+/`)
	mustErr(t, s, "", `the string did not match /^a.+/`)
	mustErr(t, s, 1, "the number is not of type string")
	mustErr(t, s, Null, "the value is not of type string")

	// Check(/re/) stays an explicit check and reports as one.
	c := MustShape(MustExpr(`Check(/^[0-9]+$/)`))
	mustOK(t, c, "12")
	mustErr(t, c, 1, `check "/^[0-9]+$/" failed`)

	// Fault overrides the message on both paths.
	mustErr(t, MustShape(MustExpr(`/^a.+/`).Fault("nope")), "zzz", "nope")
	mustErr(t, MustShape(MustExpr(`/^a.+/`).Fault("nope")), 1, "nope")
}

// --- explicit present null at the root -----------------------------------

func TestNullSentinel(t *testing.T) {
	s := MustShape(1.0)

	// Absent: the default fills, as before.
	if out := mustOK(t, s, nil); out != 1.0 {
		t.Fatalf("Validate(nil) = %#v, want the default", out)
	}

	// Present and null: a type error, matching TS Shape(1)(null).
	mustErr(t, s, Null, `value "null" because the value is not of type number`)

	// Null nested means the same as a nested nil.
	obj := MustShape(map[string]any{"a": Number})
	mustErr(t, obj, map[string]any{"a": Null}, `property "a"`)
	mustErr(t, obj, map[string]any{"a": nil}, `property "a"`)

	// Against an untyped shape it is simply a null value.
	if out := mustOK(t, MustShape(Any), Null); out != nil {
		t.Fatalf("Any accepted Null as %#v", out)
	}
}

// --- chained builders added for TS parity --------------------------------

func TestChainedBuildersParity(t *testing.T) {
	mustOK(t, MustShape(Optional().Any()), "anything")
	mustErr(t, MustShape(Optional().Number()), "x", "is not of type number")
	mustErr(t, MustShape(Optional().Boolean()), "x", "is not of type boolean")
	mustErr(t, MustShape(Optional().Object()), "x", "is not of type object")
	mustErr(t, MustShape(Optional().Array()), "x", "is not of type array")
	mustErr(t, MustShape(Optional().Function()), "x", "is not of type function")
	mustErr(t, MustShape(Optional().Type(String)), 1, "is not of type string")

	// Define / Refer / Rename chain onto an existing node.
	dr := MustShape(map[string]any{
		"def": Optional().Define("d"),
		"use": Optional().Refer("d"),
	})
	out := mustOK(t, dr, map[string]any{"def": 1.0, "use": 2.0}).(map[string]any)
	if out["use"] != 2.0 {
		t.Fatalf("chained Refer: %#v", out)
	}

	rn := MustShape(map[string]any{"a": Optional().Rename("b")})
	rout := mustOK(t, rn, map[string]any{"a": 1.0}).(map[string]any)
	if rout["b"] != 1.0 {
		t.Fatalf("chained Rename: %#v", rout)
	}
	if _, still := rout["a"]; still {
		t.Fatalf("chained Rename kept the source key: %#v", rout)
	}
}

// --- the differential harness's own decoder ------------------------------

func TestDiffCasePanicIsRecorded(t *testing.T) {
	// runDiffCase must record a panic rather than aborting the whole run.
	res := runDiffCase(diffCase{Name: "boom", Spec: func() {}, Input: 1})
	if !strings.HasPrefix(res.Build, "PANIC: ") && !strings.HasPrefix(res.Build, "ERR: ") {
		t.Fatalf("expected a recorded build failure, got %#v", res)
	}
}

// --- coverage for the paths the parity fixes introduced ------------------

func TestOptionalContainerDefaults(t *testing.T) {
	// A container token that is optional still injects its empty default, so
	// cloneDefault's container branches remain live after the descent change.
	obj := mustOK(t, MustShape(map[string]any{"a": Optional(Object)}), map[string]any{}).(map[string]any)
	if !reflect.DeepEqual(obj["a"], map[string]any{}) {
		t.Fatalf("optional object default: %#v", obj)
	}

	arr := mustOK(t, MustShape(map[string]any{"a": Optional(Array)}), map[string]any{}).(map[string]any)
	if !reflect.DeepEqual(arr["a"], []any{}) {
		t.Fatalf("optional array default: %#v", arr)
	}

	// A container default nested inside another container default.
	nested := mustOK(t, MustShape(map[string]any{"a": Optional(map[string]any{
		"b": Optional(Object),
		"c": 1.0,
	})}), map[string]any{}).(map[string]any)
	inner, ok := nested["a"].(map[string]any)
	if !ok || !reflect.DeepEqual(inner["b"], map[string]any{}) || inner["c"] != 1.0 {
		t.Fatalf("nested container default: %#v", nested)
	}
}

func TestOptionalRegexpAbsent(t *testing.T) {
	// An unrequired regexp node ignores an absent value rather than reporting
	// a type error for it.
	out := mustOK(t, MustShape(map[string]any{"a": Optional(MustExpr(`/^a/`))}), map[string]any{})
	if _, present := out.(map[string]any)["a"]; present {
		t.Fatalf("optional regexp injected a value: %#v", out)
	}
}

func TestBoundDefersToTypeCheck(t *testing.T) {
	// Every bound stands aside when the declared type will not match, so the
	// structural error speaks instead of a misleading size message.
	for _, tc := range []struct{ expr, want string }{
		{"Min(2,String)", "is not of type string"},
		{"Max(2,Number)", "is not of type number"},
		{"Above(1,String)", "is not of type string"},
		{"Below(1,Number)", "is not of type number"},
		{"Len(1,String)", "is not of type string"},
		{"Min(2,Object)", "is not of type object"},
		{"Min(1,Func)", "is not of type function"},
		{"Min(1,Boolean)", "is not of type boolean"},
		{"Min(1).Array", "is not of type array"},
	} {
		s := MustShape(MustExpr(tc.expr))
		mustErr(t, s, wrongTypeFor(tc.expr), tc.want)
	}

	// An absent value on a node that does not require one raises nothing.
	mustOK(t, MustShape(map[string]any{"a": Optional(MustExpr("Min(2)"))}), map[string]any{})
}

// wrongTypeFor picks a value guaranteed not to match the expression's type.
func wrongTypeFor(expr string) any {
	if strings.Contains(expr, "Number") {
		return "x"
	}
	return 1.0
}

func TestIgnoreSuppressesBoundErrors(t *testing.T) {
	// A silent node drops the errors its befores raise, so emitUpdateErrors
	// returns early rather than recording them.
	out := mustOK(t, MustShape(map[string]any{"a": Ignore(MustExpr("Min(2,Number)"))}),
		map[string]any{"a": 1.0})
	if _, present := out.(map[string]any)["a"]; present {
		t.Fatalf("ignore kept a failing value: %#v", out)
	}
}

func TestCompositeMessageRendersAbsentValue(t *testing.T) {
	// A missing value renders as "undefined", not "null", in a $VALUE template.
	mustErr(t, MustShape(map[string]any{"a": MustExpr("One(String,Number)")}),
		map[string]any{}, `Value "undefined" for property "a"`)
}

func TestTypeRefFromInternalNode(t *testing.T) {
	// Type() also accepts the unexported node form, which normalize hands it.
	if k := Type(&node{kind: KindBoolean}).Kind(); k != KindBoolean {
		t.Fatalf("Type(*node) kind = %q", k)
	}
}

func TestExplicitContainerDefaultWins(t *testing.T) {
	// A container with an explicit default injects that default as-is, rather
	// than rebuilding one from its children's defaults.
	s := MustShape(map[string]any{
		"a": Default(map[string]any{}, map[string]any{"b": 1.0, "c": Number}),
	})
	out := mustOK(t, s, map[string]any{}).(map[string]any)
	if !reflect.DeepEqual(out["a"], map[string]any{}) {
		t.Fatalf("explicit default not used: %#v", out)
	}
}

func TestIgnoreInArraysAndOpenObjects(t *testing.T) {
	// Ignore drops a failing value wherever it appears, not only on a declared
	// object property.
	arr := mustOK(t, MustShape([]any{Ignore(Number)}), []any{1.0, "x"}).([]any)
	if len(arr) != 2 || arr[0] != 1.0 || arr[1] != nil {
		t.Fatalf("array Ignore: %#v", arr)
	}

	rest := mustOK(t, MustShape(Child(Ignore(Number))),
		map[string]any{"a": "x", "b": 1.0}).(map[string]any)
	if _, present := rest["a"]; present || rest["b"] != 1.0 {
		t.Fatalf("open-object Ignore: %#v", rest)
	}
}

func TestNodeRenderingMatchesTS(t *testing.T) {
	// A required typed node renders as its type name; an unrequired one renders
	// as the value it produces. Skip/Ignore/Empty are not annotated.
	for _, tc := range []struct{ expr, want string }{
		{"Number", "Number"},
		{"Min(2,Number)", "Number.Min(2)"},
		{"Optional(Number)", "0"},
		{"Skip(Number)", "0"},
		{"Ignore(Number)", "0"},
		{"Ignore(Min(2,Number))", "0.Min(2)"},
		{"Empty(String)", "String"},
		{"Min(2)", "Min(2)"},
	} {
		if got := stringifyNode(MustExpr(tc.expr).n, true); got != tc.want {
			t.Fatalf("stringify %s = %q, want %q", tc.expr, got, tc.want)
		}
	}
}

// --- review follow-ups ---------------------------------------------------

func TestRegexpIsASpecValue(t *testing.T) {
	// A regexp has to normalize like any other spec value, not only in the
	// string DSL: without that, One(/re/, Number) built a Never branch and
	// rejected every string.
	one := MustShape(MustExpr(`One(/^a/,Number)`))
	mustOK(t, one, "abc")
	mustOK(t, one, 5.0)
	mustErr(t, one, true, "does not satisfy one of: /^a/, Number")

	// A raw *regexp.Regexp anywhere in a spec.
	mustOK(t, MustShape(regexp.MustCompile(`^a`)), "abc")
	mustErr(t, MustShape(map[string]any{"a": regexp.MustCompile(`^a`)}),
		map[string]any{"a": "zzz"}, "did not match")

	// A bound wrapping a regexp defers to the type check, like any other kind.
	mustErr(t, MustShape(Min(2, MustExpr(`/^a/`))), 1.0, "is not of type string")
	mustOK(t, MustShape(Min(2, MustExpr(`/^a/`))), "abc")
}

func TestBareEmptyIsUntyped(t *testing.T) {
	// TS Empty() allows the empty string without also demanding a string.
	mustOK(t, MustShape(Empty()), 0.0)
	mustOK(t, MustShape(Empty()), "")
	mustOK(t, MustShape(Empty()), "x")

	// So an Ignore wrapping it keeps values a string check would have dropped.
	if out := mustOK(t, MustShape(Ignore(Empty())), 0.0); out != 0.0 {
		t.Fatalf("Ignore(Empty()) dropped a valid value: %#v", out)
	}
}

func TestChainedFuncKeepsOptionality(t *testing.T) {
	// TS merges the receiver's flags over the builder's, so a chain that has
	// already said "optional" stays optional.
	mustOK(t, MustShape(map[string]any{"a": Optional().Func()}), map[string]any{})

	// A chain that has not stated it still becomes required.
	mustErr(t, MustShape(map[string]any{"a": buildize(nil).Func()}),
		map[string]any{}, "is required")
}

func TestExplicitAnyInKeyExpression(t *testing.T) {
	// The example value supplies the kind only for a constraint-only carrier;
	// an expression that said Any meant Any.
	anyKey := MustShape(map[string]any{"a: Any": 0.0})
	mustOK(t, anyKey, map[string]any{"a": "a"})
	mustOK(t, anyKey, map[string]any{"a": true})
	mustOK(t, anyKey, map[string]any{})

	// A bare constraint still adopts the example's kind.
	mustErr(t, MustShape(map[string]any{"a: Min(2)": 0.0}),
		map[string]any{"a": "x"}, "is not of type number")
}

func TestClosedObjectListsEveryUnknownKey(t *testing.T) {
	s := MustShape(map[string]any{"a": 1.0})
	mustErr(t, s, map[string]any{"a": 1.0, "b": 2.0},
		`the property "b" is not allowed`)
	mustErr(t, s, map[string]any{"a": 1.0, "b": 2.0, "c": 3.0},
		`the properties "b, c" are not allowed`)
	mustErr(t, s, map[string]any{"a": 1.0, "b": 2.0, "c": 3.0, "d": 4.0},
		`the properties "b, c, d" are not allowed`)
}

func TestStringValuesQuotedUnlessInline(t *testing.T) {
	// Standalone a string value keeps its quotes, so it stays distinguishable
	// from a type name; inside a composite message it is written bare.
	n := MustShape("x").Node()
	if got := stringifyNode(n, false); got != `"x"` {
		t.Fatalf("standalone string render = %q", got)
	}
	if got := stringifyNode(n, true); got != "x" {
		t.Fatalf("inline string render = %q", got)
	}
	if got := stringifyNode(MustShape("").Node(), false); got != `""` {
		t.Fatalf("empty string render = %q", got)
	}
}

func TestBoundDefersForNullAndNaNKinds(t *testing.T) {
	// Every concrete kind defers, including the two with no Go type assertion.
	mustErr(t, MustShape(MustExpr("Min(2,null)")), 1.0, "is not of type null")
	mustErr(t, MustShape(MustExpr("Min(2,null)")), Null, "must be a minimum length of 2 (was NaN)")
	mustErr(t, MustShape(MustExpr("Min(2,NaN)")), 1.0, "is not of type nan")
	mustErr(t, MustShape(MustExpr("Min(2,NaN)")), "x", "is not of type nan")
}

func TestRegexpNodeWithoutPatternRenders(t *testing.T) {
	// Defensive: every constructed regexp node carries its pattern, but the
	// renderer must not print an empty // for one that somehow does not.
	if got := stringifyNode(&node{kind: KindRegexp}, false); got != "Regexp" {
		t.Fatalf("patternless regexp render = %q", got)
	}
}

func TestKeyExpressionExampleSurvives(t *testing.T) {
	// The example value is the author's stated default. Where the builder had
	// room for it as a shape it is consumed; where the builder's arity was
	// already satisfied it is applied as the value instead — either way it
	// survives, and either way the expression keeps the kind it declared.
	for _, tc := range []struct {
		spec map[string]any
		want any
	}{
		{map[string]any{"a: Optional(Any)": 5.0}, 5.0},
		{map[string]any{"a: Optional(Number)": 5.0}, 5.0},
		{map[string]any{"a: Optional(String)": "z"}, "z"},
		{map[string]any{"a: Any": 5.0}, 5.0},
	} {
		out := mustOK(t, MustShape(tc.spec), map[string]any{}).(map[string]any)
		if out["a"] != tc.want {
			t.Fatalf("%v injected %#v, want %#v", tc.spec, out["a"], tc.want)
		}
	}

	// A builder that consumed the example as its shape uses the kind it implies.
	child := MustShape(map[string]any{"a: Child(Number)": []any{}})
	mustOK(t, child, map[string]any{"a": []any{1.0, 2.0}})
	mustErr(t, child, map[string]any{"a": []any{1.0, "x"}}, `index "a.1"`)
	mustErr(t, child, map[string]any{"a": map[string]any{}}, "is not of type array")

	// Skip still means no injection at all.
	skipped := mustOK(t, MustShape(map[string]any{"a: Skip(Number)": 5.0}),
		map[string]any{}).(map[string]any)
	if _, present := skipped["a"]; present {
		t.Fatalf("Skip injected a value: %#v", skipped)
	}
}

func TestKeyExpressionEdgeCases(t *testing.T) {
	// No example at all: the expression stands alone.
	noEx := MustShape(map[string]any{"a: String": nil})
	mustErr(t, noEx, map[string]any{}, "is required")
	mustOK(t, noEx, map[string]any{"a": "x"})

	// A bare literal expression is not a builder chain, so there is nothing to
	// hand the example to and the expression's own value stands.
	lit := mustOK(t, MustShape(map[string]any{"a: 5": 3.0}), map[string]any{}).(map[string]any)
	if lit["a"] != 5.0 {
		t.Fatalf("bare literal expression injected %#v, want 5", lit["a"])
	}
	mustOK(t, MustShape(map[string]any{"a: 5": 3.0}), map[string]any{"a": 9.0})

	// An example that cannot be normalized is reported, not swallowed.
	if _, err := Shape(map[string]any{"a: Optional": make(chan int)}); err == nil {
		t.Fatal("expected an error for an unnormalizable example value")
	}
}

// --- kinds: nullable, integer, date ---------------------------------------

func TestNullable(t *testing.T) {
	s := MustShape(Nullable(Number))
	if out := mustOK(t, s, Null); out != nil {
		t.Fatalf("Nullable(Number) with null = %#v", out)
	}
	if out := mustOK(t, s, 5.0); out != 5.0 {
		t.Fatalf("Nullable(Number) with 5 = %#v", out)
	}
	mustErr(t, s, "x", "the string is not of type number")

	// Absent is still governed by required/optional.
	obj := mustOK(t, MustShape(map[string]any{"a": Nullable(String)}), map[string]any{"a": nil}).(map[string]any)
	if v, present := obj["a"]; !present || v != nil {
		t.Fatalf("nullable property: %#v", obj)
	}
	mustErr(t, MustShape(map[string]any{"a": Nullable(Number)}), map[string]any{}, "is required")
	opt := mustOK(t, MustShape(map[string]any{"a": Optional(Nullable(Number))}), map[string]any{}).(map[string]any)
	if opt["a"] != 0.0 {
		t.Fatalf("Optional(Nullable(Number)) absent = %#v", opt)
	}

	// Containers, the DSL, bare use, and the chain.
	if out := mustOK(t, MustShape(Nullable(map[string]any{"b": 1.0})), Null); out != nil {
		t.Fatalf("Nullable(object) with null = %#v", out)
	}
	if out := mustOK(t, MustShape(MustExpr("Nullable(Number)")), Null); out != nil {
		t.Fatalf("DSL Nullable with null = %#v", out)
	}
	bare := mustOK(t, MustShape(map[string]any{"a": MustExpr("Nullable")}), map[string]any{"a": nil}).(map[string]any)
	if v, present := bare["a"]; !present || v != nil {
		t.Fatalf("bare Nullable: %#v", bare)
	}
	if out := mustOK(t, MustShape(Optional().Nullable().Number()), Null); out != nil {
		t.Fatalf("chained Nullable with null = %#v", out)
	}
	// Nullable(Never) still accepts null, as in TS (the null check comes first).
	if out := mustOK(t, MustShape(Nullable(Never())), Null); out != nil {
		t.Fatalf("Nullable(Never) with null = %#v", out)
	}
}

func TestIntegerKind(t *testing.T) {
	s := MustShape(Integer)
	mustOK(t, s, 5.0)
	mustOK(t, s, 5)
	mustOK(t, s, int32(-2))
	mustOK(t, s, float32(3))
	mustErr(t, s, 1.5, "the number is not of type integer")
	mustErr(t, s, float32(1.5), "is not of type integer")
	mustErr(t, s, "5", "the string is not of type integer")
	mustErr(t, s, math.NaN(), "is not of type integer")
	mustErr(t, s, math.Inf(1), "is not of type integer")

	// A type token: required, default 0.
	mustErr(t, MustShape(map[string]any{"a": Integer}), map[string]any{}, "is required")
	out := mustOK(t, MustShape(map[string]any{"a": Optional(Integer)}), map[string]any{}).(map[string]any)
	if out["a"] != 0.0 {
		t.Fatalf("Optional(Integer) absent = %#v", out)
	}

	// Bounds defer to the type check; Type() and the DSL know the name.
	mustErr(t, MustShape(MustExpr("Min(2,Integer)")), 1.5, "is not of type integer")
	mustErr(t, MustShape(MustExpr("Min(2,Integer)")), 1.0, "must be a minimum of 2")
	mustErr(t, MustShape(MustExpr("Type(Integer)")), 2.5, "is not of type integer")
	mustErr(t, MustShape(Type(Integer)), 2.5, "is not of type integer")
	mustOK(t, MustShape(Optional().Integer()), 4.0)
	mustErr(t, MustShape(map[string]any{"a: Integer": 0.0}), map[string]any{"a": 1.5}, "is not of type integer")
	if got := stringifyNode(MustExpr("Min(2,Integer)").n, true); got != "Integer.Min(2)" {
		t.Fatalf("Integer render = %q", got)
	}
	if got := stringifyNode(MustExpr("Optional(Integer)").n, true); got != "0" {
		t.Fatalf("Optional(Integer) render = %q", got)
	}
}

func TestDateKind(t *testing.T) {
	d := time.Unix(0, 0).UTC()
	s := MustShape(Date)
	if out := mustOK(t, s, d); out != d {
		t.Fatalf("Date passthrough = %#v", out)
	}
	mustErr(t, s, "x", "the string is not of type date")
	mustErr(t, s, 1.0, "the number is not of type date")
	mustErr(t, MustShape(map[string]any{"a": Date}), map[string]any{}, "is required")

	// No default to inject for an optional date; a literal date is a default.
	if out := mustOK(t, MustShape(map[string]any{"a": Optional(Date)}), map[string]any{}).(map[string]any); len(out) != 0 {
		t.Fatalf("Optional(Date) absent injected %#v", out)
	}
	lit := mustOK(t, MustShape(map[string]any{"a": d}), map[string]any{}).(map[string]any)
	if lit["a"] != d {
		t.Fatalf("date literal default = %#v", lit)
	}
	if out := mustOK(t, MustShape(Optional().Date()), d); out != d {
		t.Fatalf("chained Date = %#v", out)
	}
	mustErr(t, MustShape(MustExpr("Date")), 1.0, "the number is not of type date")

	// A bound compares the instant, and reads as a value, not a length.
	y2020 := float64(time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC).UnixMilli())
	mustOK(t, MustShape(Min(y2020, Date)), time.Date(2021, 1, 1, 0, 0, 0, 0, time.UTC))
	mustErr(t, MustShape(Min(y2020, Date)), time.Date(2019, 6, 1, 0, 0, 0, 0, time.UTC),
		"must be a minimum of 1577836800000 (was 1559347200000)")

	// A date value in an error message renders as JSON.stringify does.
	mustErr(t, MustShape(Number), d,
		`Validation failed for object "1970-01-01T00:00:00.000Z" because the object is not of type number.`)

	// Rendering.
	if got := stringifyNode(MustExpr("Date").n, false); got != "Date" {
		t.Fatalf("Date render = %q", got)
	}
	if got := stringifyNode(MustShape(d).Node(), false); got != `"1970-01-01T00:00:00.000Z"` {
		t.Fatalf("date literal render = %q", got)
	}
	if got := stringifyNode(MustShape(d).Node(), true); got != "1970-01-01T00:00:00.000Z" {
		t.Fatalf("inline date literal render = %q", got)
	}
}

func TestTypeTokenArgumentsApply(t *testing.T) {
	// String(Min(2)) is Type('String', Min(2)) in TS; the arguments used to be
	// parsed and dropped here.
	mustErr(t, MustShape(MustExpr("String(Min(2))")), "a", "must be a minimum length of 2")
	mustOK(t, MustShape(MustExpr("String(Min(2))")), "abc")
	mustErr(t, MustShape(MustExpr("Number(Max(1))")), 5.0, "must be a maximum of 1")
	// ...including when the token starts a chain.
	mustErr(t, MustShape(MustExpr("String(Min(2)).Max(3)")), "abcd", "must be a maximum length of 3")
	if _, err := Expr("String(Min("); err == nil {
		t.Fatal("expected a parse error for an unterminated argument list")
	}
}

func TestTypeTokenArgumentsInArgumentPosition(t *testing.T) {
	// The same applies when the token is itself an argument.
	mustErr(t, MustShape(MustExpr("Optional(String(Min(2)))")), "a", "must be a minimum length of 2")
	mustOK(t, MustShape(MustExpr("Optional(String(Min(2)))")), "abc")
	if _, err := Expr("Optional(String(Min("); err == nil {
		t.Fatal("expected a parse error for an unterminated nested argument list")
	}
}

func TestBoundArgumentRendering(t *testing.T) {
	// Large integral bounds print in full, as JS prints them, not in %v's
	// exponent form; a non-numeric bound falls back to %v.
	if got := stringifyNode(Min(1577836800000.0).n, true); got != "Min(1577836800000)" {
		t.Fatalf("large bound render = %q", got)
	}
	if got := stringifyNode(Min("x").n, true); got != "Min(x)" {
		t.Fatalf("non-numeric bound render = %q", got)
	}
	mustErr(t, MustShape(Min(1000000.0, Number)), 5.0, "must be a minimum of 1000000 (was 5)")
}

// --- coerce ---------------------------------------------------------------

func TestCoerce(t *testing.T) {
	n := MustShape(Coerce(Number))
	for in, want := range map[any]float64{"5": 5, " 5 ": 5, "1e3": 1000, ".5": 0.5, "+5": 5, "5.": 5, true: 1, false: 0, 7.0: 7} {
		if out := mustOK(t, n, in); out != want {
			t.Fatalf("Coerce(Number)(%#v) = %#v, want %v", in, out, want)
		}
	}
	for _, bad := range []any{"0x10", "Infinity", "", " ", "5abc", Null, []any{}} {
		mustErr(t, n, bad, "is not of type number")
	}
	mustOK(t, MustShape(Coerce(Integer)), "5")
	mustErr(t, MustShape(Coerce(Integer)), "5.5", "is not of type integer")

	s := MustShape(Coerce(String))
	for in, want := range map[any]string{1.5: "1.5", 1000000.0: "1000000", 1e21: "1e+21", 1e-7: "1e-7",
		0.00001: "0.00001", -2.5: "-2.5", true: "true", false: "false", 3: "3"} {
		if out := mustOK(t, s, in); out != want {
			t.Fatalf("Coerce(String)(%#v) = %#v, want %q", in, out, want)
		}
	}
	mustErr(t, s, math.NaN(), "is not of type string")
	mustErr(t, s, math.Inf(1), "is not of type string")
	mustErr(t, s, Null, "is not of type string")

	b := MustShape(Coerce(Boolean))
	for in, want := range map[any]bool{" TRUE ": true, "false": false, "1": true, "0": false, 1.0: true, 0.0: false, 1: true} {
		if out := mustOK(t, b, in); out != want {
			t.Fatalf("Coerce(Boolean)(%#v) = %#v, want %v", in, out, want)
		}
	}
	mustErr(t, b, "yes", "is not of type boolean")
	mustErr(t, b, 2.0, "is not of type boolean")
	mustErr(t, b, Null, "is not of type boolean")

	d := MustShape(Coerce(Date))
	want := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	if out := mustOK(t, d, "2020-01-01T00:00:00Z"); !out.(time.Time).Equal(want) {
		t.Fatalf("Coerce(Date) iso = %v", out)
	}
	if out := mustOK(t, d, "2020-01-01T12:30:00.5+02:00"); !out.(time.Time).Equal(time.Date(2020, 1, 1, 10, 30, 0, 500000000, time.UTC)) {
		t.Fatalf("Coerce(Date) offset = %v", out)
	}
	mustOK(t, d, "2020-02-29T00:00:00Z")
	if out := mustOK(t, d, 1577836800000.0); !out.(time.Time).Equal(want) {
		t.Fatalf("Coerce(Date) millis = %v", out)
	}
	for _, bad := range []any{"2021-02-29T00:00:00Z", "2020-02-30T00:00:00Z", "2020-13-01T00:00:00Z",
		"2020-01-01T24:00:00Z", "2020-01-01T00:60:00Z", "2020-01-01T00:00:60Z", "2020-01-01T00:00:00+24:00",
		"2020-01-01T00:00:00+00:60", "2020-00-10T00:00:00Z", "2020-01-00T00:00:00Z", "2020-01-01", "x",
		math.Inf(1), Null, true} {
		mustErr(t, d, bad, "is not of type date")
	}

	// Ahead of any bound, whichever way round it is written; no-ops otherwise.
	mustOK(t, MustShape(Coerce(Min(2, Number))), "3")
	mustErr(t, MustShape(Coerce(Min(2, Number))), "1", "must be a minimum of 2")
	mustErr(t, MustShape(Min(2, Coerce(Number))), "1", "must be a minimum of 2")
	if out := mustOK(t, MustShape(Nullable(Coerce(Number))), Null); out != nil {
		t.Fatalf("Nullable(Coerce) null = %#v", out)
	}
	mustOK(t, MustShape(Optional().Coerce().Number()), "4")
	mustOK(t, MustShape(MustExpr("Coerce(Number)")), "4")
	mustOK(t, MustShape(Coerce()), "x")
	mustOK(t, MustShape(Coerce(Any)), "x")
	// An absent value is still absent: nothing is injected for it to convert.
	mustErr(t, MustShape(map[string]any{"a": Coerce(Number)}), map[string]any{}, "is required")
	out := mustOK(t, MustShape(map[string]any{"a": Optional(Coerce(Number))}), map[string]any{}).(map[string]any)
	if out["a"] != 0.0 {
		t.Fatalf("Optional(Coerce(Number)) absent = %#v", out)
	}
}

func TestFmtFloatMatchesJS(t *testing.T) {
	for f, want := range map[float64]string{0: "0", math.Copysign(0, -1): "0", 1.5: "1.5", 1000000: "1000000",
		1577836800000: "1577836800000", 1e20: "100000000000000000000", 1e21: "1e+21", 1.5e22: "1.5e+22",
		1e-6: "0.000001", 1e-7: "1e-7", 1.5e-7: "1.5e-7", 0.1: "0.1", -2.5: "-2.5",
		math.NaN(): "NaN", math.Inf(1): "Infinity", math.Inf(-1): "-Infinity"} {
		if got := fmtFloat(f); got != want {
			t.Fatalf("fmtFloat(%v) = %q, want %q", f, got, want)
		}
	}
	// The strict date-time parser rejects what time.Parse alone would accept.
	if _, ok := parseISODateTime("2020-01-01T00:00:00Z "); ok {
		t.Fatal("trailing space accepted")
	}
}

// --- string formats ---------------------------------------------------------

func TestFormats(t *testing.T) {
	long := strings.Repeat("x", 64) + "@" + strings.Repeat(strings.Repeat("a", 63)+".", 3) + "com"
	v4ok := []string{"0.0.0.0", "127.0.0.1", "255.255.255.255", "1.2.3.4"}
	v4bad := []string{"256.0.0.1", "1.2.3", "1.2.3.4.5", "01.2.3.4", "1.2.3.4 ", "::1", "a.b.c.d", "1.2.3.-4", ""}
	v6ok := []string{"::", "::1", "1::", "fe80::1", "2001:db8::8a2e:370:7334", "1:2:3:4:5:6:7:8",
		"::ffff:192.168.1.1", "::1.2.3.4", "1:2:3:4:5:6:1.2.3.4", "1:2:3:4:5:6:7::",
		"ABCD:EF01:2345:6789:abcd:ef01:2345:6789"}
	v6bad := []string{"1.2.3.4", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "1::2::3", ":::",
		":1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8::", "12345::", "g::1", "1::2:", "fe80::1%eth0",
		"::1/64", "1:2:3:4:5:6::1.2.3.4", "1.2.3.4::", "1:2:3:4:5:6:7:1.2.3.4", "", ":"}

	cases := []struct {
		b       *Node
		what    string
		ok, bad []string
	}{
		{Email(), "email address",
			[]string{"a@b.co", "first.last+tag@sub.example.org", "o'neil@example.com", "A_B-c@x-y.example", "a@b.museum"},
			[]string{"nope", "@b.co", "a@", "a@b", "a@b.c", "a..b@c.co", ".a@b.co", "a.@b.co", "a@-b.co", "a@b-.co",
				"a@b..co", "a b@c.co", "a@b.c0",
				// Length limits: a 65-character local part, a 64-character label, 260 in all.
				strings.Repeat("x", 65) + "@b.co", "a@" + strings.Repeat("b", 64) + ".co", long}},
		{Url(), "URL",
			[]string{"http://example.com", "https://a.b/c/d?e=f#g", "ftp://user:pw@host:21/path", "http://[::1]:8080/x",
				"custom+scheme.x://host", "http://localhost", "http://1.2.3.4/"},
			[]string{"example.com", "http://", "http:// example.com", "http://exa mple.com/", "://host", "http://host:port",
				"1http://host", "mailto:a@b.co", "http://@host", "http://host/a b"}},
		{Uuid(), "UUID",
			[]string{"123e4567-e89b-12d3-a456-426614174000", "00000000-0000-0000-0000-000000000000",
				"ABCDEF01-2345-6789-ABCD-EF0123456789"},
			[]string{"123e4567e89b12d3a456426614174000", "123e4567-e89b-12d3-a456-42661417400",
				"123e4567-e89b-12d3-a456-4266141740000", "g23e4567-e89b-12d3-a456-426614174000",
				"{123e4567-e89b-12d3-a456-426614174000}"}},
		{DateTime(), "ISO 8601 date-time",
			[]string{"2020-01-01T00:00:00Z", "2020-02-29T23:59:59.999+05:30"},
			[]string{"2020-01-01", "2021-02-29T00:00:00Z", "2020-01-01 00:00:00Z", "now", ""}},
		{Ipv4(), "IPv4 address", v4ok, v4bad},
		{Ipv6(), "IPv6 address", v6ok, v6bad},
		{Ip(), "IP address", append(append([]string{}, v4ok...), v6ok...), []string{"x", "1.2.3", "1::2::3", ""}},
	}
	for _, c := range cases {
		s := MustShape(c.b)
		for _, v := range c.ok {
			if out := mustOK(t, s, v); out != v {
				t.Fatalf("%s: %q became %#v", c.what, v, out)
			}
		}
		for _, v := range c.bad {
			mustErr(t, s, v, "is not a valid "+c.what+".")
		}
	}
	// DateTime keeps the string; Coerce(Date) is the one that parses.
	if _, ok := mustOK(t, MustShape(DateTime()), "2020-01-01T00:00:00Z").(string); !ok {
		t.Fatal("DateTime did not keep the string")
	}

	// A format is a shape of string: required by default, "" when optional.
	mustErr(t, MustShape(map[string]any{"a": Email()}), map[string]any{}, "is required")
	if out := mustOK(t, MustShape(map[string]any{"a": Optional(Email())}), map[string]any{}).(map[string]any); out["a"] != "" {
		t.Fatalf("Optional(Email) absent = %#v", out)
	}
	if out := mustOK(t, MustShape(map[string]any{"a": Email(Nullable(String))}), map[string]any{"a": nil}).(map[string]any); out["a"] != nil {
		t.Fatalf("Email(Nullable(String)) null = %#v", out)
	}
	mustErr(t, MustShape(map[string]any{"a": Email()}), map[string]any{"a": 1.0}, "the number is not of type string")
	mustErr(t, MustShape(Email(Any)), 1.0, "is not of type string")

	// Like .String(), a chained format re-asserts the string type.
	mustErr(t, MustShape(map[string]any{"a": Optional().Email()}), map[string]any{}, "is required")
	for _, chained := range []struct {
		f   func(*Node) *Node
		bad string
	}{{(*Node).Url, "x"}, {(*Node).Uuid, "x"}, {(*Node).DateTime, "x"}, {(*Node).Ip, "x"}, {(*Node).Ipv4, "::1"}, {(*Node).Ipv6, "1.2.3.4"}} {
		mustErr(t, MustShape(chained.f(Required(String))), chained.bad, "is not a valid")
	}

	// Befores run in the order they were added; every failing one speaks.
	mustErr(t, MustShape(Email(Min(10, String))), "nope",
		"Value \"nope\" for property \"\" must be a minimum length of 10 (was 4).\nValue \"nope\" for property \"\" is not a valid email address.")
	mustErr(t, MustShape(Min(10, Email())), "a@b.co", "must be a minimum length of 10 (was 6).")

	// The format's own text survives Fault; the type error takes it.
	mustErr(t, MustShape(Fault("boom", Email())), "bad", "Value \"bad\" for property \"\" is not a valid email address.")
	mustErr(t, MustShape(Fault("boom", Email())), 1.0, "boom")

	mustOK(t, MustShape(MustExpr("Email")), "a@b.co")
	if out := mustOK(t, MustShape(map[string]any{"a": MustExpr("Optional(Url)")}), map[string]any{}).(map[string]any); out["a"] != "" {
		t.Fatalf("expr Optional(Url) absent = %#v", out)
	}
	mustErr(t, MustShape(MustExpr("Uuid(Min(2,String))")), "x", "minimum length of 2")

	if got := stringifyNode(Email(String).n, true); got != "String.Email" {
		t.Fatalf("render = %q", got)
	}
	if got := stringifyNode(MustExpr("Ipv6").n, true); got != "String.Ipv6" {
		t.Fatalf("render = %q", got)
	}

	errs := MustShape(Email()).Error("nope")
	if len(errs) != 1 || errs[0].Why != WhyEmail || errs[0].Check != "Email" {
		t.Fatalf("why/check = %#v", errs)
	}
}

// --- checks run in order -----------------------------------------------------

func TestChecksRunInOrder(t *testing.T) {
	fail := func(any, *Update, *State) bool { return false }

	// A failing before ends the structural checks; the afters still run.
	mustErr(t, MustShape(After(fail, Min(2, Number))), 1.0,
		"Value \"1\" for property \"\" must be a minimum of 2 (was 1).\nValidation failed for number \"1\" because check \"After\" failed.")
	mustErr(t, MustShape(After(fail, Number)), "x",
		"is not of type number.\nValidation failed for string \"x\" because check \"After\" failed.")
	mustErr(t, MustShape(After(fail, Never())), 1.0,
		"no value is allowed.\nValidation failed for number \"1\" because check \"After\" failed.")

	// Fault replaces structural text, not a check's own.
	mustErr(t, MustShape(Fault("boom", Min(2, Number))), 1.0, "Value \"1\" for property \"\" must be a minimum of 2 (was 1).")
	mustErr(t, MustShape(Fault("boom", Check(fail))), "x", "boom")
	mustErr(t, MustShape(Fault("boom", Check(func(_ any, u *Update, _ *State) bool { u.Err = "custom"; return false }))), "x", "custom")
	mustErr(t, MustShape(Fault("boom", After(fail, Number))), 1.0, "boom")
	mustErr(t, MustShape(Fault("boom", String)), 1.0, "boom")

	// An absent value on an unrequired node raises nothing from its checks.
	if out := mustOK(t, MustShape(map[string]any{"a": After(fail, Skip(Number))}), map[string]any{}).(map[string]any); len(out) != 0 {
		t.Fatalf("After on skipped absent = %#v", out)
	}
	if out := mustOK(t, MustShape(map[string]any{"a": Before(fail, Optional(Number))}), map[string]any{}).(map[string]any); out["a"] != 0.0 {
		t.Fatalf("Before on optional absent = %#v", out)
	}
	mustErr(t, MustShape(map[string]any{"a": Before(fail, Number)}), map[string]any{},
		"Validation failed for property \"a\" with value \"undefined\" because check \"Before\" failed.")
	mustErr(t, MustShape(map[string]any{"a": After(fail, Number)}), map[string]any{},
		"is required.\nValidation failed for property \"a\" with value \"undefined\" because check \"After\" failed.")
	// ...unless the check insists.
	mustErr(t, MustShape(map[string]any{"a": Before(func(_ any, u *Update, _ *State) bool { u.Done = true; return false }, Optional(Number))}),
		map[string]any{}, "check \"Before\" failed.")
}

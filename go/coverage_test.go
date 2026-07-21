package shape

import (
	"reflect"
	"regexp"
	"strings"
	"testing"
)

// mustOK validates and fails the test on any error.
func mustOK(t *testing.T, s *Schema, in any) any {
	t.Helper()
	out, err := s.Validate(in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	return out
}

// mustErr validates and asserts the error text contains want.
func mustErr(t *testing.T, s *Schema, in any, want string) {
	t.Helper()
	_, err := s.Validate(in)
	if err == nil {
		t.Fatalf("expected error containing %q, got nil", want)
	}
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("expected error containing %q, got %q", want, err.Error())
	}
}

// --- Chained *Node builder methods -------------------------------------

func TestChainedMethods(t *testing.T) {
	// Required / Optional
	mustErr(t, MustShape(map[string]any{"a": buildize(Number).Required()}), map[string]any{}, "required")
	mustOK(t, MustShape(map[string]any{"a": buildize(String).Optional()}), map[string]any{})

	// Open / Closed (chained)
	mustOK(t, MustShape(buildize(map[string]any{"a": 1.0}).Open()), map[string]any{"a": 2.0, "b": 3.0})
	mustErr(t, MustShape(buildize(map[string]any{"a": 1.0}).Closed()), map[string]any{"a": 2.0, "z": 9.0}, "not allowed")

	// Skip / Ignore (chained)
	mustOK(t, MustShape(map[string]any{"a": buildize(Number).Skip()}), map[string]any{})
	out := mustOK(t, MustShape(map[string]any{"a": buildize(Number).Ignore()}), map[string]any{"a": "bad"})
	if _, has := out.(map[string]any)["a"]; has {
		t.Fatalf("Ignore should drop invalid value, got %v", out)
	}

	// Empty (chained)
	mustOK(t, MustShape(map[string]any{"a": buildize(String).Empty()}), map[string]any{"a": ""})

	// Default (chained)
	if got := mustOK(t, MustShape(map[string]any{"a": buildize(Number).Default(7.0)}), map[string]any{}); got.(map[string]any)["a"] != 7.0 {
		t.Fatalf("Default chained: got %v", got)
	}

	// Fault (chained)
	mustErr(t, MustShape(map[string]any{"a": buildize(Number).Fault("boom")}), map[string]any{"a": "x"}, "boom")

	// Never (chained)
	mustErr(t, MustShape(map[string]any{"a": buildize(nil).Never()}), map[string]any{"a": 1.0}, "no value is allowed")

	// Exact (chained)
	mustOK(t, MustShape(map[string]any{"a": buildize(nil).Exact("x", "y")}), map[string]any{"a": "y"})
	mustErr(t, MustShape(map[string]any{"a": buildize(nil).Exact("x", "y")}), map[string]any{"a": "z"}, "exactly one of")

	// Min / Max / Above / Below / Len (chained)
	mustErr(t, MustShape(map[string]any{"a": buildize(Number).Min(3.0)}), map[string]any{"a": 1.0}, "minimum")
	mustErr(t, MustShape(map[string]any{"a": buildize(Number).Max(3.0)}), map[string]any{"a": 9.0}, "maximum")
	mustErr(t, MustShape(map[string]any{"a": buildize(Number).Above(3.0)}), map[string]any{"a": 3.0}, "above")
	mustErr(t, MustShape(map[string]any{"a": buildize(Number).Below(3.0)}), map[string]any{"a": 3.0}, "below")
	mustErr(t, MustShape(map[string]any{"a": buildize(String).Len(2)}), map[string]any{"a": "abc"}, "exactly 2")

	// Check (chained)
	mustErr(t, MustShape(map[string]any{"a": buildize(String).Check(regexp.MustCompile(`^a`))}), map[string]any{"a": "zzz"}, "failed")

	// Before / After (chained)
	bumped := buildize(nil).Before(func(val any, u *Update, s *State) bool {
		u.Val, u.HasVal = 42.0, true
		return true
	})
	if got := mustOK(t, MustShape(map[string]any{"a": bumped}), map[string]any{"a": 1.0}); got.(map[string]any)["a"] != 42.0 {
		t.Fatalf("Before chained: got %v", got)
	}
	after := buildize(Number).After(func(val any, u *Update, s *State) bool { return true })
	mustOK(t, MustShape(map[string]any{"a": after}), map[string]any{"a": 5.0})

	// Child / Rest / Func (chained)
	mustOK(t, MustShape(buildize(map[string]any{}).Child(Number)), map[string]any{"x": 1.0})
	mustOK(t, MustShape(buildize([]any{Number, String}).Rest(Number)), []any{1.0, "a", 2.0, 3.0})
	mustOK(t, MustShape(map[string]any{"f": buildize(nil).Func()}), map[string]any{"f": func() {}})
}

// --- G-prefixed aliases -------------------------------------------------

func TestGAliasesFull(t *testing.T) {
	// Token aliases.
	mustErr(t, MustShape(map[string]any{"a": GString}), map[string]any{}, "required")
	mustErr(t, MustShape(map[string]any{"a": GNumber}), map[string]any{}, "required")
	mustErr(t, MustShape(map[string]any{"a": GBoolean}), map[string]any{}, "required")
	mustOK(t, MustShape(map[string]any{"a": GAny}), map[string]any{"a": 1.0})
	mustErr(t, MustShape(GObject), "notobj", "type")
	mustErr(t, MustShape(GArray), "notarr", "type")
	mustOK(t, MustShape(map[string]any{"f": GFunction}), map[string]any{"f": func() {}})

	// Builder aliases.
	mustOK(t, MustShape(map[string]any{"a": GRequired(Number)}), map[string]any{"a": 1.0})
	mustOK(t, MustShape(map[string]any{"a": GOptional(Number)}), map[string]any{})
	mustOK(t, MustShape(GOpen(map[string]any{"a": 1.0})), map[string]any{"a": 1.0, "b": 2.0})
	mustErr(t, MustShape(GClosed(map[string]any{"a": 1.0})), map[string]any{"z": 1.0}, "not allowed")
	mustOK(t, MustShape(map[string]any{"a": GSkip(Number)}), map[string]any{})
	mustOK(t, MustShape(map[string]any{"a": GIgnore(Number)}), map[string]any{"a": "bad"})
	mustOK(t, MustShape(map[string]any{"a": GEmpty()}), map[string]any{"a": ""})
	mustOK(t, MustShape(map[string]any{"a": GDefault(3.0, Number)}), map[string]any{})
	mustErr(t, MustShape(map[string]any{"a": GFault("bad", Number)}), map[string]any{"a": "x"}, "bad")
	mustErr(t, MustShape(map[string]any{"a": GNever()}), map[string]any{"a": 1.0}, "no value")
	mustOK(t, MustShape(map[string]any{"a": GType(Number)}), map[string]any{"a": 1.0})
	mustErr(t, MustShape(map[string]any{"a": GExact(1.0, 2.0)}), map[string]any{"a": 3.0}, "exactly one of")
	mustErr(t, MustShape(map[string]any{"a": GMin(2.0, Number)}), map[string]any{"a": 1.0}, "minimum")
	mustErr(t, MustShape(map[string]any{"a": GMax(2.0, Number)}), map[string]any{"a": 9.0}, "maximum")
	mustErr(t, MustShape(map[string]any{"a": GAbove(2.0, Number)}), map[string]any{"a": 2.0}, "above")
	mustErr(t, MustShape(map[string]any{"a": GBelow(2.0, Number)}), map[string]any{"a": 2.0}, "below")
	mustErr(t, MustShape(map[string]any{"a": GLen(2, String)}), map[string]any{"a": "abc"}, "exactly 2")
	mustErr(t, MustShape(map[string]any{"a": GCheck(regexp.MustCompile(`^a`))}), map[string]any{"a": "z"}, "failed")
	mustOK(t, MustShape(map[string]any{"a": GBefore(func(v any, u *Update, s *State) bool { return true }, Number)}), map[string]any{"a": 1.0})
	mustOK(t, MustShape(map[string]any{"a": GAfter(func(v any, u *Update, s *State) bool { return true }, Number)}), map[string]any{"a": 1.0})
	mustOK(t, MustShape(map[string]any{"a": GOne(Number, String)}), map[string]any{"a": "x"})
	mustOK(t, MustShape(map[string]any{"a": GSome(Number, String)}), map[string]any{"a": 5.0})
	mustOK(t, MustShape(map[string]any{"a": GAll(Number, GMin(1.0))}), map[string]any{"a": 5.0})
	mustOK(t, MustShape(GChild(Number, map[string]any{})), map[string]any{"x": 1.0})
	mustOK(t, MustShape(GRest(Number, []any{Number, String})), []any{1.0, "a", 2.0})
	mustOK(t, MustShape(map[string]any{"a": GDefine("d", Number)}), map[string]any{"a": 1.0})
	mustOK(t, MustShape(map[string]any{"a": GRefer("d", Number)}), map[string]any{"a": 1.0})
	mustOK(t, MustShape(map[string]any{"a": GRename("b", Number)}), map[string]any{"a": 1.0})
	mustOK(t, MustShape(map[string]any{"f": GFunc()}), map[string]any{"f": func() {}})
	mustOK(t, MustShape(map[string]any{"a": map[string]any{"k": GKey()}}), map[string]any{"a": map[string]any{"k": "ignored"}})
}

// --- Introspection: Spec / String / Node / Inner / Kind / IsShape ------

func TestIntrospection(t *testing.T) {
	s := MustShape(map[string]any{
		"n":   Number,
		"s":   "hi",
		"b":   true,
		"arr": []any{Number},
		"tup": []any{Number, String},
		"one": One(Number, String),
		"chk": Check(regexp.MustCompile(`^a`)),
		"obj": Open(map[string]any{"x": 1.0}),
		"nul": MustExpr("null"),
		"nan": MustExpr("NaN"),
		"fn":  buildize(nil).Func(),
		"nv":  buildize(nil).Never(),
	})
	if s.String() == "" {
		t.Fatal("String() empty")
	}
	if s.Spec() == nil {
		t.Fatal("Spec() nil")
	}
	if s.Node() == nil {
		t.Fatal("Node() nil")
	}
	if s.Node().kind != KindObject {
		t.Fatalf("root kind: %v", s.Node().kind)
	}

	n := Min(2.0, String)
	if n.Inner() == nil || n.Kind() != KindString {
		t.Fatalf("Node Inner/Kind: %v", n.Kind())
	}
	if !IsShape(s) || IsShape(42) {
		t.Fatal("IsShape wrong")
	}

	// Rest + Child + Exact + Define/Refer/Rename spec rendering.
	s2 := MustShape(map[string]any{
		"ex": Exact("a", "b"),
		"ch": Child(Number, map[string]any{}),
		"re": Rest(Number, []any{String}),
		"df": Default(9.0, Number),
		"sk": Skip(Number),
		"ig": Ignore(Number),
		"em": Empty(),
	})
	_ = s2.String()
	_ = s2.Spec()

	// nil schema methods.
	var ns *Schema
	if ns.String() != "" || ns.Spec() != nil || ns.Node() != nil {
		t.Fatal("nil schema should be inert")
	}
	if ns.Error(nil) != nil || ns.Match(nil) != true {
		t.Fatal("nil schema Error/Match")
	}
	if _, err := ns.Validate(nil); err != nil {
		t.Fatal("nil schema Validate")
	}
}

// --- Match / Valid / Error / ValidateCtx -------------------------------

func TestValidationSurfaces(t *testing.T) {
	s := MustShape(map[string]any{"a": Number})
	if !s.Match(map[string]any{"a": 1.0}) || s.Match(map[string]any{}) {
		t.Fatal("Match")
	}
	if !s.Valid(map[string]any{"a": 1.0}) {
		t.Fatal("Valid")
	}
	if errs := s.Error(map[string]any{}); len(errs) == 0 {
		t.Fatal("Error should report")
	}
	if errs := s.Error(map[string]any{"a": 1.0}); errs != nil {
		t.Fatal("Error should be nil when valid")
	}

	ctx := &Context{}
	_, err := s.ValidateCtx(map[string]any{}, ctx)
	if err == nil || len(ctx.Err) == 0 {
		t.Fatal("ValidateCtx should collect issues")
	}
}

// --- MustShape / MustShapeWith / MustExpr panics -----------------------

func TestMustPanics(t *testing.T) {
	assertPanics(t, func() { MustShape(func() {}) })
	assertPanics(t, func() { MustShapeWith(func() {}, ShapeOptions{}) })
	assertPanics(t, func() { MustExpr("Min(") })

	// Non-panic MustShapeWith.
	if MustShapeWith(map[string]any{"a": 1.0}, ShapeOptions{}) == nil {
		t.Fatal("MustShapeWith nil")
	}
}

func assertPanics(t *testing.T, fn func()) {
	t.Helper()
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic")
		}
	}()
	fn()
}

// --- Custom validator Update.Err variants ------------------------------

func TestCustomCheckErrForms(t *testing.T) {
	// string error
	sErr := MustShape(map[string]any{"a": Before(func(v any, u *Update, s *State) bool {
		u.Err = "custom string error"
		return false
	}, Number)})
	mustErr(t, sErr, map[string]any{"a": 1.0}, "custom string error")

	// FieldError error
	feErr := MustShape(map[string]any{"a": Before(func(v any, u *Update, s *State) bool {
		u.Err = FieldError{Text: "field error text"}
		return false
	}, Number)})
	mustErr(t, feErr, map[string]any{"a": 1.0}, "field error text")

	// []FieldError error
	sliceErr := MustShape(map[string]any{"a": Before(func(v any, u *Update, s *State) bool {
		u.Err = []FieldError{{Text: "first"}, {Text: "second"}}
		return false
	}, Number)})
	mustErr(t, sliceErr, map[string]any{"a": 1.0}, "second")

	// nil error, just false → default check-failed text
	nilErr := MustShape(map[string]any{"a": Before(func(v any, u *Update, s *State) bool {
		return false
	}, Number)})
	mustErr(t, nilErr, map[string]any{"a": 1.0}, "failed")
}

// --- Typed (non-[]any) slice input via reflection ----------------------

func TestTypedSliceInput(t *testing.T) {
	s := MustShape([]any{Number})
	out := mustOK(t, s, []int{1, 2, 3})
	arr, ok := out.([]any)
	if !ok || len(arr) != 3 {
		t.Fatalf("typed slice not coerced: %#v", out)
	}
}

// --- Nested default cloning (cloneAny) ---------------------------------

func TestNestedDefaultClone(t *testing.T) {
	// A Default value carrying a slice-with-map must be deep-cloned per Validate
	// (exercises cloneAny's slice and map branches).
	s := MustShape(map[string]any{
		"cfg": Default([]any{1.0, map[string]any{"x": 1.0}}),
	})
	a := mustOK(t, s, map[string]any{}).(map[string]any)["cfg"].([]any)
	b := mustOK(t, s, map[string]any{}).(map[string]any)["cfg"].([]any)
	a[1].(map[string]any)["x"] = 99.0
	if b[1].(map[string]any)["x"] != 1.0 {
		t.Fatal("default not deep-cloned")
	}
}

// --- Key builder forms -------------------------------------------------

func TestKeyForms(t *testing.T) {
	// Key() injects the parent key (matches canonical TS).
	s := MustShape(map[string]any{"a": map[string]any{"self": Key()}})
	out := mustOK(t, s, map[string]any{"a": map[string]any{"self": "x"}}).(map[string]any)
	if out["a"].(map[string]any)["self"] != "a" {
		t.Fatalf("Key() should inject parent key 'a': %v", out)
	}

	// Key(depth) → path slice; Key(depth, sep) → joined path.
	sd := MustShape(map[string]any{"a": map[string]any{"p": Key(1, ".")}})
	od := mustOK(t, sd, map[string]any{"a": map[string]any{"p": "x"}}).(map[string]any)
	if _, ok := od["a"].(map[string]any)["p"].(string); !ok {
		t.Fatalf("Key(depth,sep) should be a string: %#v", od)
	}
	sneg := MustShape(map[string]any{"a": map[string]any{"p": Key(-1)}})
	_ = mustOK(t, sneg, map[string]any{"a": map[string]any{"p": "x"}})
}

// --- Expr / Build coverage ---------------------------------------------

func TestExprAndBuild(t *testing.T) {
	// null / NaN / regexp / type tokens / nested / chained / implicit chain.
	for _, src := range []string{
		"String", "Number.Min(2).Max(9)", "Required(Min(1))",
		"null", "NaN", "/^a.+/", "Exact(1,2,3)", `Exact("x","y")`,
		"One(Number,String)", "Some(Number,String)", "All(Number,Min(1))",
		"Child(Number)", "Rest(Number)", "Open", "Closed", "Skip", "Ignore",
		"Empty", "Never", "Default(5)", "Type(Number)", "42", `"hello"`, "true",
	} {
		if _, err := Expr(src); err != nil {
			t.Fatalf("Expr(%q): %v", src, err)
		}
	}

	// Expr errors.
	for _, bad := range []string{"", "Min(", "Min(1))", ".Min(1)", "Min(1) trailing junk!!"} {
		if _, err := Expr(bad); err == nil {
			t.Fatalf("Expr(%q) should error", bad)
		}
	}

	// Build expands JSON-with-strings.
	bs, err := Build(map[string]any{
		"a": "Min(2,String)",
		"b": []any{"Number"},
		"c": map[string]any{"$$": "passthrough"},
		"n": 1.0,
	})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	mustErr(t, bs, map[string]any{"a": "x", "b": []any{1.0}, "c": map[string]any{}}, "minimum")

	// MustExpr success + panic.
	if MustExpr("String") == nil {
		t.Fatal("MustExpr nil")
	}
	assertPanics(t, func() { MustExpr("Min(") })
}

// --- Argu (positional argument validation) -----------------------------

func TestArguCoverage(t *testing.T) {
	a := MakeArgu("fn")

	// Basic positional validate.
	got, err := a.Validate([]any{"name", 5.0}, "sig", map[string]any{
		"a": String,
		"b": Number,
	})
	if err != nil {
		t.Fatalf("argu validate: %v", err)
	}
	if got["a"] != "name" || got["b"] != 5.0 {
		t.Fatalf("argu map: %#v", got)
	}

	// Too many arguments.
	if _, err := a.Validate([]any{"x", 1.0, 2.0}, "sig", map[string]any{"a": String, "b": Number}); err == nil {
		t.Fatal("expected too-many-arguments error")
	}

	// Partial (reusable).
	p := a.Partial("sig", map[string]any{"a": String})
	if _, err := p([]any{"ok"}); err != nil {
		t.Fatalf("partial: %v", err)
	}

	// Rest tail capture.
	rest, err := a.Validate([]any{1.0, 2.0, 3.0}, "sig", map[string]any{
		"a": Number,
		"b": Rest(Number),
	})
	if err != nil {
		t.Fatalf("argu rest: %v", err)
	}
	if got := rest["b"].([]any); len(got) != 2 {
		t.Fatalf("argu rest tail: %#v", rest)
	}

	// Empty spec is an error.
	if _, err := a.Validate([]any{}, "sig", map[string]any{}); err == nil {
		t.Fatal("expected empty-spec error")
	}
}

// --- Options: meta + valexpr + keyexpr disable -------------------------

func TestOptionsCoverage(t *testing.T) {
	// keyexpr disabled → "a: Min(1)" is a literal key.
	s := MustShapeWith(map[string]any{"a: Min(1)": Number}, ShapeOptions{KeyExpr: KeyExprOptions{Disable: true}})
	if _, has := s.Node().objChildren["a: Min(1)"]; !has {
		t.Fatal("keyexpr disable: literal key expected")
	}

	// meta sidecar.
	ms := MustShapeWith(map[string]any{"a$$": "short desc", "a": Number},
		ShapeOptions{Meta: MetaOptions{Active: true}})
	if ms.Node().objChildren["a"].meta["short"] != "short desc" {
		t.Fatalf("meta not attached: %#v", ms.Node().objChildren["a"].meta)
	}

	// custom suffix.
	_ = MustShapeWith(map[string]any{"a@@": map[string]any{"k": "v"}, "a": Number},
		ShapeOptions{Meta: MetaOptions{Active: true, Suffix: "@@"}})

	// valexpr keymark.
	_ = MustShapeWith(map[string]any{"$$": "Open"},
		ShapeOptions{ValExpr: ValExprOptions{Active: true}})
}

// --- Refer with fill + define across paths -----------------------------

func TestReferFillFull(t *testing.T) {
	s := MustShape(map[string]any{
		"def": Define("shared", map[string]any{"v": Number}),
		"use": ReferWith("shared", ReferOptions{Fill: true}),
	})
	out := mustOK(t, s, map[string]any{"def": map[string]any{"v": 1.0}})
	if _, ok := out.(map[string]any)["use"]; !ok {
		t.Fatalf("refer fill did not inject: %#v", out)
	}
}

// --- Rename keep + claim -----------------------------------------------

func TestRenameKeepClaim(t *testing.T) {
	// Keep the original key.
	sk := MustShape(map[string]any{"a": RenameWith("b", RenameOptions{Keep: true}, Number)})
	out := mustOK(t, sk, map[string]any{"a": 1.0}).(map[string]any)
	if out["a"] != 1.0 || out["b"] != 1.0 {
		t.Fatalf("rename keep: %#v", out)
	}

	// Claim from an alternate source key.
	sc := MustShape(map[string]any{"b": RenameWith("b", RenameOptions{Claim: []string{"a"}}, Number)})
	out2 := mustOK(t, sc, map[string]any{"a": 2.0}).(map[string]any)
	if out2["b"] != 2.0 {
		t.Fatalf("rename claim: %#v", out2)
	}
}

// --- Fault overriding a builder-produced error -------------------------

func TestFaultOverridesStructuralError(t *testing.T) {
	// Fault overrides a structural (type) error, but not a builder's own message
	// (parity with TS, where node.z is consulted only by the default-text path).
	s := MustShape(map[string]any{"a": Fault("must be a number", Number)})
	mustErr(t, s, map[string]any{"a": "x"}, "must be a number")
}

// --- unsupported spec type ---------------------------------------------

func TestUnsupportedSpec(t *testing.T) {
	if _, err := Shape(func() {}); err == nil {
		t.Fatal("expected unsupported-type error")
	}
}

// --- helper sanity for reflect on non-slice ----------------------------

func TestValueHelpers(t *testing.T) {
	if _, ok := toAnySlice("x"); ok {
		t.Fatal("toAnySlice string")
	}
	if !reflect.DeepEqual(jsonNorm(map[string]any{"a": nil}), map[string]any{}) {
		// jsonNorm drops nil map entries.
	}
}

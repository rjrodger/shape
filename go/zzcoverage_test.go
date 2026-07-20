package shape

import (
	"math"
	"testing"
)

// zzMatchDependent returns true only in match mode, so tryMatch (match=true)
// passes while requireMatch (match=false) fails.
func zzMatchDependent(val any, u *Update, s *State) bool { return s.Match }

// zzAlwaysFail fails and marks the check done, used to exercise Done+Fault paths.
func zzAlwaysFailDone(val any, u *Update, s *State) bool { u.Done = true; return false }

func zzFail(val any, u *Update, s *State) bool { return false }
func zzPass(val any, u *Update, s *State) bool { return true }

// ---------------------------------------------------------------------------
// argu.go
// ---------------------------------------------------------------------------

func TestZZArgu(t *testing.T) {
	Argu := MakeArgu("t")

	// Rest node whose arrChild is a real type that fails validation (99-101).
	if _, err := Argu.Validate([]any{"x"}, "", map[string]any{
		"a": Rest(Number, []any{Number}),
	}); err == nil {
		t.Fatal("expected rest child validation error")
	}

	// Skippable slot whose tryMatch passes but requireMatch fails (117-119).
	if _, err := Argu.Validate([]any{5.0}, "", map[string]any{
		"a": Skip(Before(zzMatchDependent, Number)),
	}); err == nil {
		t.Fatal("expected skippable requireMatch error")
	}

	// Default branch: fewer args than keys, missing slot validates cleanly (131-132).
	out, err := Argu.Validate([]any{5.0}, "", map[string]any{
		"a": Number,
		"b": Optional(),
	})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if _, ok := out["b"]; !ok {
		t.Fatalf("expected key b present, got %v", out)
	}

	// isRestNode(nil) (160-162).
	if isRestNode(nil) {
		t.Fatal("isRestNode(nil) should be false")
	}

	// orderedKeys must perform swaps when the map iteration order is unsorted.
	// Many keys make an already-sorted iteration order vanishingly unlikely (199).
	m := map[string]any{}
	for _, k := range []string{"t", "s", "r", "q", "p", "o", "n", "m", "l", "k", "j", "i", "h", "g"} {
		m[k] = Number
	}
	ks := orderedKeys(m)
	for i := 1; i < len(ks); i++ {
		if ks[i-1] > ks[i] {
			t.Fatalf("orderedKeys not sorted: %v", ks)
		}
	}
}

// ---------------------------------------------------------------------------
// builders.go
// ---------------------------------------------------------------------------

func TestZZBuildersNoSpecForms(t *testing.T) {
	// buildize(nil) zero-arg branches.
	_ = Never()
	_ = Type(KindString)
	_ = Before(zzPass)
	_ = After(zzPass)
	_ = Define("d")
	_ = Rename("r")

	// With-spec branches (buildize(spec[0])).
	_ = Never(String)
	if Type(KindNumber, String).Kind() != KindNumber {
		t.Fatal("Type(kind, spec) kind mismatch")
	}

	// Type accepts a TypeToken and a string kind too.
	if Type(String).Kind() != KindString {
		t.Fatal("Type(String) kind mismatch")
	}
	if Type("number").Kind() != KindNumber {
		t.Fatal("Type(\"number\") kind mismatch")
	}
}

func TestZZBuildersLenlessValues(t *testing.T) {
	// valueLen(bool) is not measurable -> the !ok branch in each after-check.
	for _, sc := range []*Schema{
		MustShape(Min(1, Boolean)),
		MustShape(Max(1, Boolean)),
		MustShape(Above(1, Boolean)),
		MustShape(Below(1, Boolean)),
		MustShape(Len(1, Boolean)),
	} {
		if _, err := sc.Validate(true); err == nil {
			t.Fatalf("expected length error for %s", sc.String())
		}
	}

	// Above/Below "have length" verb on string values (434-436 / 478-480).
	if _, err := MustShape(Above(5, String)).Validate("ab"); err == nil {
		t.Fatal("expected Above length failure")
	}
	if _, err := MustShape(Below(1, String)).Validate("abc"); err == nil {
		t.Fatal("expected Below length failure")
	}
}

func TestZZBuildersStringify(t *testing.T) {
	// Exercise the stringify closures of the after/before validators.
	cases := []*node{
		Above(5, String).n,
		Below(1, String).n,
		Len(3, String).n,
		Check(zzPass).n,
		Before(zzPass).n,
		After(zzPass).n,
		Define("d", Number).n,
		Refer("d", Number).n,
		Key().n,
	}
	for _, n := range cases {
		if s := stringifyNode(n, false); s == "" {
			t.Fatal("empty stringify")
		}
	}

	// Chained Before/After stringify closures (618 / 638).
	nb := Required()
	nb.Before(zzPass)
	nb.After(zzPass)
	_ = stringifyNode(nb.n, false)
}

func TestZZBuildersListErrors(t *testing.T) {
	// One/Some/All with an unnormalizable shape -> Never fallback (665-667).
	_ = One(make(chan int))
	_ = Some(make(chan int))
	_ = All(make(chan int))
}

func TestZZBuildersChildRest(t *testing.T) {
	// Child on array carrier (690-691).
	_ = Child(Number, []any{})
	// Child default branch: non-object/array carrier (692-699).
	_ = Child(Number, String)
	// Child with unnormalizable child (682-684).
	_ = Child(make(chan int))

	// Chained Child on array node (715-716) and normalize error (707-709).
	buildize([]any{}).Child(Number)
	buildize(map[string]any{}).Child(make(chan int))

	// Rest with unnormalizable child (730-732) and non-array carrier kind (733-735).
	_ = Rest(make(chan int))
	_ = Rest(Number, String)

	// Chained Rest normalize error (743-745) and non-array carrier (746-748).
	Required(String).Rest(make(chan int))
	Required(String).Rest(Number)
}

func TestZZDefineReferCtx(t *testing.T) {
	// Define validator with a nil ctx creates a fresh context (766-768).
	validateNode(Define("d", Number).n, 5.0, []string{}, "", nil, nil, false, &ValidationError{})
	// Define validator with a ctx that has nil Refs (769-771).
	validateNode(Define("d", Number).n, 5.0, []string{}, "", nil, &Context{}, false, &ValidationError{})
	// Refer validator with nil ctx short-circuits (805-807).
	validateNode(Refer("d").n, 5.0, []string{}, "", nil, nil, false, &ValidationError{})
}

func TestZZKeyForms(t *testing.T) {
	// Key() at the root: the empty path yields "" via update.Val (906-908). The
	// resulting empty string is then rejected by the String structural check, so
	// an error is expected here; we only care that the before-branch executed.
	if out, _ := MustShape(Key()).Validate("ignored"); out != "" {
		t.Fatalf("Key() root want empty, got %v", out)
	}

	// Key(depth) whose depth exceeds the path length -> start clamped to 0 (918-920),
	// without an empty path so no panic occurs. The joined key is empty and thus
	// rejected by the String check; the point is that the depth branch executed.
	sc := MustShape(map[string]any{"a": Key(3, "-")})
	_, _ = sc.Validate(map[string]any{"a": "x"})

	// Key(depth) at the root: the empty path clamps to an empty slice rather than
	// panicking, mirroring JS .slice() (exercises the end<0 low-clamp).
	if out, _ := MustShape(Key(2)).Validate(nil); out == nil {
		t.Fatal("Key(2) at root should yield an empty slice, not nil")
	} else if arr, ok := out.([]any); !ok || len(arr) != 0 {
		t.Fatalf("Key(2) at root want empty []any, got %#v", out)
	}
}

// ---------------------------------------------------------------------------
// error.go
// ---------------------------------------------------------------------------

func TestZZErrorHelpers(t *testing.T) {
	// makeErr with empty why / zero mark defaults them (91-96).
	e := makeErr(&State{Node: &node{kind: KindString}}, "", 0, "hi $PATH")
	if e.Why != WhyCheck || e.Mark != 4000 {
		t.Fatalf("makeErr defaults wrong: %+v", e)
	}

	// defaultErrText: WhyRequired with a non-empty, non-nil value (166-167).
	if s := defaultErrText(FieldError{Why: WhyRequired, Value: 5.0, Path: "x", Type: KindNumber}); s == "" {
		t.Fatal("empty required text")
	}
	// defaultErrText: default case falls back to why when Check is empty (183-185).
	if s := defaultErrText(FieldError{Why: WhyCheck, Value: 5.0, Path: "x"}); s == "" {
		t.Fatal("empty default text")
	}

	// valueToString(false) (202).
	if valueToString(false) != "false" {
		t.Fatal("valueToString(false)")
	}

	// jsonRender variants.
	if jsonRender(false) != "false" {
		t.Fatal("jsonRender(false)")
	}
	if jsonRender(nil) != "null" {
		t.Fatal("jsonRender(nil)")
	}
	// A struct marshals via json.Marshal (245-248).
	if got := jsonRender(struct {
		A int `json:"a"`
	}{A: 1}); got != `{"a":1}` {
		t.Fatalf("jsonRender(struct)=%q", got)
	}
	// A channel fails json.Marshal -> %v fallback (249).
	_ = jsonRender(make(chan int))

	// truncateText with a tiny limit (256-258).
	if truncateText("abcdef", 2) != "ab" {
		t.Fatal("truncateText limit<3")
	}

	// valueKind default for an unknown type (292).
	if valueKind(make(chan int)) != "value" {
		t.Fatal("valueKind(chan) should be value")
	}
}

// ---------------------------------------------------------------------------
// expr.go
// ---------------------------------------------------------------------------

func TestZZExprBuildValue(t *testing.T) {
	// Build error via a bad top-level expression (48-50).
	if _, err := Build("("); err == nil {
		t.Fatal("expected Build error")
	}
	// buildValue map value error (66-68).
	if _, err := Build(map[string]any{"a": "("}); err == nil {
		t.Fatal("expected map buildValue error")
	}
	// buildValue array element error (76-78).
	if _, err := Build([]any{"("}); err == nil {
		t.Fatal("expected array buildValue error")
	}
}

func TestZZExprTokenize(t *testing.T) {
	// Unparseable gap between tokens (99-102).
	if _, err := Expr("a,,b"); err == nil {
		t.Fatal("expected tokenize gap error")
	}
	// Trailing unmatched text (106-108).
	if _, err := Expr("a,"); err == nil {
		t.Fatal("expected trailing text error")
	}
}

func TestZZExprParsing(t *testing.T) {
	// Trailing dot: parseChained then take() past end (130-132 / 225-227).
	if _, err := Expr("String."); err != nil {
		t.Fatalf("String. err: %v", err)
	}
	// Implicit chaining without a dot (154-159, incl. 158).
	if _, err := Expr("String Min(2)"); err != nil {
		t.Fatalf("implicit chain err: %v", err)
	}
	// Invalid regexp literal (201-203).
	if _, err := Expr("/[/"); err == nil {
		t.Fatal("expected regexp compile error")
	}
	// Chained builder with an unclosed arg list (233-235).
	if _, err := Expr("String.Min("); err == nil {
		t.Fatal("expected unclosed chained arg error")
	}

	// parseTerm(false): a non-top literal wraps in a node (213, 217).
	p := &exprParser{tokens: []string{"5"}, src: "5"}
	if _, err := p.parseTerm(false); err != nil {
		t.Fatalf("parseTerm(false) err: %v", err)
	}
	// parseTerm with no tokens (167-169).
	if _, err := (&exprParser{src: "z"}).parseTerm(true); err == nil {
		t.Fatal("expected parseTerm empty error")
	}
	// parseArg with no tokens (267-269).
	if _, err := (&exprParser{src: "z"}).parseArg(); err == nil {
		t.Fatal("expected parseArg empty error")
	}
}

func TestZZExprArgs(t *testing.T) {
	// Nested unclosed arg list inside an arg (273-275).
	if _, err := Expr("Min(Max("); err == nil {
		t.Fatal("expected nested unclosed error")
	}
	// Builder arg that errors during construction (277-279).
	if _, err := Expr("Min(Default)"); err == nil {
		t.Fatal("expected builder arg construction error")
	}
	// NaN arg (286-291).
	if _, err := Expr("Min(NaN)"); err != nil {
		t.Fatalf("Min(NaN) err: %v", err)
	}
	// null/undefined arg -> nil (292-294).
	if _, err := Expr("Min(null)"); err != nil {
		t.Fatalf("Min(null) err: %v", err)
	}
	// Bad regexp as an arg (297-299).
	if _, err := Expr("Min(/[/)"); err == nil {
		t.Fatal("expected bad-regexp arg error")
	}

	// chainContinuation loop within an arg (311-317).
	if _, err := Expr("One(String.Min(2))"); err != nil {
		t.Fatalf("One(String.Min(2)) err: %v", err)
	}
	// chainContinuation error propagation (314-316).
	if _, err := Expr("One(String.Zzz)"); err == nil {
		t.Fatal("expected chainContinuation error")
	}
}

func TestZZExprBuilderErrors(t *testing.T) {
	// Each dispatcher error branch: missing / wrong-typed args.
	badExprs := []string{
		"Default",   // 363-365
		"Fault",     // 371-373
		"Fault(1)",  // 375-377
		"Type",      // 382-384
		"Max",       // 397-399
		"Above",     // 403-405
		"Below",     // 409-411
		"Len",       // 415-417
		"Len(true)", // 419-421
		"Check",     // 425-427
		"Child",     // 440-442
		"Rest",      // 446-448
		"Define",    // 452-454
		"Define(1)", // 456-458
		"Refer",     // 462-464
		"Refer(1)",  // 466-468
		"Rename",    // 472-474
		"Rename(1)", // 476-478
	}
	for _, src := range badExprs {
		if _, err := Expr(src); err == nil {
			t.Fatalf("expected error for %q", src)
		}
	}
}

// ---------------------------------------------------------------------------
// normalize.go
// ---------------------------------------------------------------------------

func TestZZNormalize(t *testing.T) {
	// Single-element array whose element fails to normalize (107-109).
	if _, err := Shape([]any{make(chan int)}); err == nil {
		t.Fatal("expected array element normalize error")
	}

	// Meta sidecar with a non-string, non-map value -> default meta form (167-168).
	if _, err := ShapeWith(map[string]any{
		"x":   Number,
		"x$$": 5.0,
	}, ShapeOptions{Meta: MetaOptions{Active: true}}); err != nil {
		t.Fatalf("meta default err: %v", err)
	}

	// valexpr key whose expression is invalid (190-192).
	if _, err := ShapeWith(map[string]any{
		"$$": "Min(",
	}, ShapeOptions{ValExpr: ValExprOptions{Active: true}}); err == nil {
		t.Fatal("expected valexpr error")
	}

	// keyexpr with a quoted key name -> quote stripping (212-214).
	if _, err := Shape(map[string]any{`"nm": Min(1)`: 5.0}); err != nil {
		t.Fatalf("quoted keyexpr err: %v", err)
	}
}

// ---------------------------------------------------------------------------
// stringify.go
// ---------------------------------------------------------------------------

func TestZZStringify(t *testing.T) {
	// nil node (11-13).
	if stringifyNode(nil, false) != "<nil>" {
		t.Fatal("stringifyNode(nil)")
	}
	// KindAny with a default (27-29).
	_ = stringifyNode(&node{kind: KindAny, hasDefault: true, defaultValue: 5}, false)
	// List Some / All modes (40-43).
	_ = stringifyNode(Some(String).n, false)
	_ = stringifyNode(All(String).n, false)
	// Unknown kind default return (79).
	_ = stringifyNode(&node{kind: Kind("bogus")}, false)

	// nodeSpec nil (126-128).
	if nodeSpec(nil) != nil {
		t.Fatal("nodeSpec(nil)")
	}
	// nodeSpec fault field (150-152).
	spec := nodeSpec(Fault("boom", String).n)
	m, ok := spec.(map[string]any)
	if !ok || m["fault"] != "boom" {
		t.Fatalf("nodeSpec fault: %v", spec)
	}
}

// ---------------------------------------------------------------------------
// validate.go
// ---------------------------------------------------------------------------

func TestZZValidateNilAndKinds(t *testing.T) {
	// nil node returns input unchanged (77-79).
	if got := validateNode(nil, "x", []string{}, "", nil, nil, false, &ValidationError{}); got != "x" {
		t.Fatal("validateNode(nil)")
	}

	// Required + absent with a Fault message (133-135).
	if _, err := MustShape(Fault("req!", Required(String))).Validate(nil); err == nil {
		t.Fatal("expected required fault error")
	}
	// Empty string on a String with a Fault message (172-174).
	if _, err := MustShape(Fault("empty!", String)).Validate(""); err == nil {
		t.Fatal("expected empty-string fault error")
	}

	// KindNaN with a non-NaN value (194-198).
	if _, err := MustShape(math.NaN()).Validate(5.0); err == nil {
		t.Fatal("expected NaN type error")
	}
	// KindNull with a non-nil value (200-203).
	if _, err := MustShape(nil).Validate(5.0); err == nil {
		t.Fatal("expected null type error")
	}

	// Unknown kind falls through the switch default (219).
	validateNode(&node{kind: Kind("weird"), requiredSet: true}, "x",
		[]string{}, "", nil, newContext(nil), false, &ValidationError{})
}

func TestZZValidateAftersAndLists(t *testing.T) {
	// After validator that fails with Done on a Fault node (248-250).
	if _, err := MustShape(Fault("boom", After(zzAlwaysFailDone, Number))).Validate(5.0); err == nil {
		t.Fatal("expected after-done fault error")
	}

	// Tuple with fewer values than positions -> missing positions defaulted (294-297).
	if _, err := MustShape([]any{Number, Optional(String)}).Validate([]any{5.0}); err != nil {
		t.Fatalf("tuple default err: %v", err)
	}

	// Object node whose objChildren has a key absent from objKeys (405-409).
	on := &node{kind: KindObject, objChildren: map[string]*node{"extra": Optional(Number).n}}
	out := validateNode(on, map[string]any{}, []string{}, "", nil, newContext(nil), false, &ValidationError{})
	if om, ok := out.(map[string]any); !ok || om["extra"] == nil {
		t.Fatalf("expected extra key injected, got %v", out)
	}

	// Open object with a nil objRest keeps unknown keys as-is (421).
	openN := &node{kind: KindObject, open: true}
	validateNode(openN, map[string]any{"u": 1.0}, []string{}, "", nil, newContext(nil), false, &ValidationError{})

	// One in match mode (456-458).
	if !MustShape(One(Number, String)).Match(5.0) {
		t.Fatal("One match should pass")
	}
	// One/Some failures carrying a Fault message (467-469 / 492-494).
	if _, err := MustShape(Fault("no", One(Number, String))).Validate(true); err == nil {
		t.Fatal("expected One fault error")
	}
	if _, err := MustShape(Fault("no", Some(Number, String))).Validate(true); err == nil {
		t.Fatal("expected Some fault error")
	}

	// evaluateList with no list mode returns the input (527).
	if got := evaluateList(&node{kind: KindList, listMode: listNone}, 5.0,
		[]string{}, "", nil, newContext(nil), false, &ValidationError{}); got != 5.0 {
		t.Fatal("evaluateList(none)")
	}
}

func TestZZValidateSmallHelpers(t *testing.T) {
	// emitUpdateErrors early-returns for a silent node (542-544).
	if _, err := MustShape(Ignore(Before(zzFail, Number))).Validate(5.0); err != nil {
		t.Fatalf("silent before should suppress error, got %v", err)
	}

	// replaceLastErrText with no issues is a no-op (597-599).
	replaceLastErrText(&ValidationError{}, "msg", nil, "")

	// collectDefines with nil args returns immediately (695-697).
	collectDefines(nil, nil)
}

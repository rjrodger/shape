package shape

import (
	"math"
	"reflect"
	"sync"
	"testing"
)

// When, Contains, Unique and the trial budget (ts/test/builder.test.ts
// builder-when, builder-contains, builder-unique and builder-trials). The
// shared corpus pins the verdicts and messages; these cover the rest.

func wcM(kv ...any) map[string]any {
	m := map[string]any{}
	for i := 0; i < len(kv); i += 2 {
		m[kv[i].(string)] = kv[i+1]
	}
	return m
}

func wcA(v ...any) []any { return v }

// wcOK validates and wants the produced value.
func wcOK(t *testing.T, s *Schema, in, want any) {
	t.Helper()
	out, err := s.Validate(in)
	if err != nil || !reflect.DeepEqual(jsonNorm(out), jsonNorm(want)) {
		t.Fatalf("%v: got %#v, %v; want %#v", in, out, err, want)
	}
}

// wcErr validates and wants the whole message.
func wcErr(t *testing.T, s *Schema, in any, want string) {
	t.Helper()
	if _, err := s.Validate(in); err == nil || err.Error() != want {
		t.Fatalf("%v: got %v; want %q", in, err, want)
	}
}

func TestBuilderWhen(t *testing.T) {
	M, A := wcM, wcA

	// The condition picks the shape; its errors are the errors.
	w := MustShape(When(Open(M("kind", Exact("a"))), Open(M("x", Required(Number))), Open(M("y", Required(String)))))
	wcOK(t, w, M("kind", "a", "x", 1.0), M("kind", "a", "x", 1.0))
	wcErr(t, w, M("kind", "a"), `Validation failed for property "x" because the property is missing.`)
	wcErr(t, w, M("kind", "b"), `Validation failed for property "y" because the property is missing.`)
	wcOK(t, w, M("kind", "b", "y", "q"), M("kind", "b", "y", "q"))

	// A shape not given passes, and the picked shape makes the result.
	then := MustShape(When(String, Min(2)))
	wcOK(t, then, "ab", "ab")
	wcOK(t, then, 5.0, 5.0)
	wcErr(t, then, "a", `Value "a" for property "" must be a minimum length of 2 (was 1).`)
	wcOK(t, MustShape(When(Open(M()), Open(M("b", 2.0)))), M("a", 1.0), M("a", 1.0, "b", 2.0))
	wcOK(t, MustShape(When(Number, Ignore(Min(5)))), 3.0, 3.0)
	// An Ignore that fails leaves the value as given, defaults and all.
	wcOK(t, MustShape(When(Open(M()), Ignore(M("b", 2.0, "c", Number)))), M("a", 1.0), M("a", 1.0))
	wcOK(t, MustShape(When(Open(M()), Ignore(M("b", 2.0, "c", Number)))), M("c", 1.0), M("c", 1.0, "b", 2.0))

	// The condition only checks, on a copy.
	input := M("a", 1.0)
	wcOK(t, MustShape(When(Open(M("b", 2.0)), Any)), input, M("a", 1.0))
	if !reflect.DeepEqual(input, M("a", 1.0)) {
		t.Fatalf("input changed: %v", input)
	}

	// Errors name the path, after an array sibling too; an absent value is
	// not tried.
	wcErr(t, MustShape(M("a", A(Number), "c", When(Number, Min(5)))), M("a", A(1.0), "c", 3.0),
		`Value "3" for property "c" must be a minimum of 5 (was 3).`)
	after := &Context{}
	_, _ = MustShape(M("a", A(Number), "c", Number)).ValidateCtx(M("a", A(1.0), "c", "x"), after)
	if len(after.Err) != 1 || !reflect.DeepEqual(after.Err[0].PathArr, []any{"c"}) {
		t.Fatalf("after an array sibling: %#v", after.Err)
	}
	wcErr(t, MustShape(M("a", M("b", When(String, Min(2))))), M("a", M("b", "x")),
		`Value "x" for property "a.b" must be a minimum length of 2 (was 1).`)
	wcErr(t, MustShape(M("a", When(String, Min(2)))), M(), `Validation failed for property "a" because the property is missing.`)
	wcOK(t, MustShape(M("a", Optional(When(String, Min(2))))), M(), M())
	wcOK(t, MustShape(M("a", Default("xy", When(String, Min(2))))), M(), M("a", "xy"))
	wcErr(t, MustShape(When(String, Min(2))), nil, `Validation failed for value "undefined" because the value is required.`)

	// A present null is tried as any value; a nullable When takes it as it is.
	wcOK(t, MustShape(When(String, Min(2))), Null, nil)
	wcErr(t, MustShape(When(Number, Min(2), String)), Null, `Validation failed for value "null" because the value is not of type string.`)
	wcOK(t, MustShape(Nullable(When(Number, Min(2), String))), Null, nil)
	// Ignored, a failing When says nothing and its value is dropped.
	wcOK(t, MustShape(M("a", Ignore(When(String, Min(2))))), M("a", "x"), M())
	// A Fault speaks for a missing value, not for the shape picked.
	wcErr(t, MustShape(Fault("bad", When(Number, Min(2), String))), 1.0, `Value "1" for property "" must be a minimum of 2 (was 1).`)
	// Shapes past the second are ignored.
	wcErr(t, MustShape(When(Number, Min(2), String, Number)), 1.0, `Value "1" for property "" must be a minimum of 2 (was 1).`)
	wcOK(t, MustShape(When(String)), "x", "x")

	// A condition is needed, and a fault given as one is the fault; the
	// string form, and how it renders.
	wcErr(t, MustShape(When(nil)), 1.0, "Shape: When needs a shape for its condition")
	wcErr(t, MustShape(When(Min("x"), String)), 1.0, "Shape: Min needs a number")
	wcOK(t, MustShape(MustExpr("When(String,Min(2))")), "ab", "ab")
	wcOK(t, MustShape(M("a: When(String,Min(2))", "xy")), M(), M("a", "xy"))
	if got := MustShape(When(Number, Min(1), Max(-1))).String(); got != "When(Number,Min(1),Max(-1))" {
		t.Fatalf("render: %s", got)
	}
	if got := MustShape(When(String, Min(2))).String(); got != "When(String,Min(2),Any)" {
		t.Fatalf("render: %s", got)
	}
	if spec := MustShape(When(String, Min(2))).Spec().(map[string]any); spec["listMode"] != "when" {
		t.Fatalf("spec: %v", spec)
	}
	wcOK(t, MustShape(GWhen(String, Min(2))), "ab", "ab")
	for _, src := range []string{"When()", "When(Min(\"x\"))"} {
		if _, err := Expr(src); err == nil {
			t.Fatalf("%s should not build", src)
		}
	}
	// The string form's null is the null literal, as the condition too.
	wcErr(t, MustShape(MustExpr("When(null,String,Number)")), Null, `Validation failed for value "null" because the value is not of type string.`)
	wcOK(t, MustShape(MustExpr("When(null,String,Number)")), 1.0, 1.0)
	wcErr(t, MustShape(When(Open(M()), A(Number))), M("a", 1.0),
		`Validation failed for object "{a:1}" because the object is not of type array.`)
	wcOK(t, MustShape(When(Open(M()), Any, A(Number))), A(1.0), A(1.0))
}

func TestBuilderContains(t *testing.T) {
	M, A := wcM, wcA

	// At least one, exactly some, at most some.
	one := MustShape(Contains(Min(1), Number))
	wcOK(t, one, A("a", 2.0), A("a", 2.0))
	wcErr(t, one, A("a", "b"), `Value "[a,b]" for property "" has 0 of its items satisfying Number; the count must be Min(1).`)
	wcErr(t, one, A(), `Value "[]" for property "" has 0 of its items satisfying Number; the count must be Min(1).`)
	wcErr(t, MustShape(Contains(2, Number)), A(1.0, "a", 2.0, 3.0),
		`Value "[1,a,2,3]" for property "" has 3 of its items satisfying Number; the count must be 2.`)
	wcOK(t, MustShape(Contains(0, Number)), A("a"), A("a"))
	wcErr(t, MustShape(Contains(0, Number)), A(1.0, "a"),
		`Value "[1,a]" for property "" has 1 to 2 of its items satisfying Number; the count must be 0.`)

	// An item is tried only while the untried could change the verdict.
	wcErr(t, MustShape(Contains(Max(1), Number)), A(1.0, 2.0, 3.0),
		`Value "[1,2,3]" for property "" has 2 to 3 of its items satisfying Number; the count must be Max(1).`)
	tried := 0
	lazy := MustShape(Contains(Min(1), Check(func(any, *Update, *State) bool { tried++; return true })))
	wcOK(t, lazy, A(1.0, 2.0, 3.0), A(1.0, 2.0, 3.0))
	if tried != 1 {
		t.Fatalf("tried %d", tried)
	}
	wcErr(t, MustShape(Contains(Min(1).Max(2), Number)), A(1.0, 2.0, 3.0, 4.0),
		`Value "[1,2,3,4]" for property "" has 3 to 4 of its items satisfying Number; the count must be Min(1).Max(2).`)

	// A count of size bounds alone on a number is an interval, read at once;
	// any other count is read count by count (and Go spaces an Exact's
	// values, see the parity page). Either way a count no number satisfies
	// decides before any item is tried.
	wcErr(t, MustShape(Contains(Max(1, Min(2)), Number)), A(1.0, 2.0, 3.0),
		`Value "[1,2,3]" for property "" has 0 to 3 of its items satisfying Number; the count must be Min(2).Max(1).`)
	five := A(1.0, 2.0, "x", 4.0, 5.0)
	for _, count := range []*Node{Min(3).Max(1), Max(1, Min(3, Number)), Max(1, Min(3, Integer)),
		Nullable(Min(3).Max(1)), Max(1, Min(3, String)), Rename("q", Min(3).Max(1)),
		Min(3).Max(1).After(func(any, *Update, *State) bool { return true })} {
		seen := 0
		counted := MustShape(Contains(count, Check(func(v any, _ *Update, _ *State) bool { seen++; return isNumber(v) })))
		if _, err := counted.Validate(five); err == nil || seen != 0 {
			t.Fatalf("%s: tried %d, %v", stringifyNode(count.n, true), seen, err)
		}
		wcErr(t, MustShape(Contains(count, Number)), five, `Value "[1,2,x,4,5]" for property "" has 0 to 5`+
			` of its items satisfying Number; the count must be `+stringifyNode(count.n, true)+".")
	}
	wcErr(t, MustShape(Contains(Below(0), Number)), A(1.0, 2.0),
		`Value "[1,2]" for property "" has 0 to 2 of its items satisfying Number; the count must be Below(0).`)
	wcErr(t, MustShape(Contains(Above(1.5).Below(3.5), Number)), A(1.0, "x", "y", "z"),
		`Value "[1,x,y,z]" for property "" has 1 of its items satisfying Number; the count must be Above(1.5).Below(3.5).`)
	wcOK(t, MustShape(Contains(Len(2), Number)), A(1.0, "x", 2.0), A(1.0, "x", 2.0))
	// An ignored count fails nothing, so admits every count.
	wcOK(t, MustShape(Contains(Ignore(Min(3).Max(1)), Number)), A(1.0, 2.0, "x"), A(1.0, 2.0, "x"))
	evens := MustShape(Contains(Exact(0.0, 2.0), Number))
	wcOK(t, evens, A("a", 1.0, 2.0), A("a", 1.0, 2.0))
	wcErr(t, evens, A(1.0, "a"), `Value "[1,a]" for property "" has 1 of its items satisfying Number; the count must be Exact(0, 2).`)

	// Not an array: the node's type speaks. With a spec, its shape holds too.
	wcErr(t, one, "x", `Validation failed for string "x" because the string is not of type array.`)
	wcOK(t, MustShape(Contains(Min(1), Number, Any)), "x", "x")
	wcErr(t, MustShape(Contains(1, Number, A(Min(1)))), A(1.0, 0.0),
		`Value "[1,0]" for property "" has 2 of its items satisfying Number; the count must be 1.`)
	wcOK(t, MustShape(Min(1).Contains(1, String)), A("a"), A("a"))
	wcOK(t, MustShape(M("a", Contains(Below(3, Above(0)), Number))), M("a", A(1.0, "x")), M("a", A(1.0, "x")))
	// The items are left as they were given.
	wcOK(t, MustShape(Contains(Min(1), Open(M("b", 2.0)))), A(M("a", 1.0)), A(M("a", 1.0)))
	// Any slice is an array; an object item shape is walked with the tree.
	wcOK(t, MustShape(Contains(2, String)), []string{"a", "b"}, A("a", "b"))
	wcOK(t, MustShape(Contains(1, M("x", Number))), A(M("x", 1.0), 2.0), A(M("x", 1.0), 2.0))
	// An item path past the index table is still made.
	long := make([]any, indexKeys+1)
	for i := range long {
		long[i] = "x"
	}
	long[indexKeys] = 1.0
	wcOK(t, MustShape(Contains(1, Number)), long, long)

	// The count is a whole number or a shape; the items need a shape.
	fault := "Shape: Contains needs a whole number of zero or more, or a shape for the count"
	for _, bad := range []*Node{Contains(-1, String), Contains(1.5, String), Contains(math.Inf(1), String),
		Contains(nil, String), Unique().Contains(-1, String)} {
		wcErr(t, MustShape(bad), A(), fault)
	}
	wcErr(t, MustShape(Contains(1, nil)), A(), "Shape: Contains needs a shape for the items it counts")
	// A builder's fault for the count or the items is the fault.
	wcErr(t, MustShape(Contains(Min("x"), Number)), A(), "Shape: Min needs a number")
	wcErr(t, MustShape(Contains(1, Max("x"))), A(), "Shape: Max needs a number")
	// So is a count or an item shape that cannot be built.
	wcErr(t, MustShape(Contains(make(chan int), Number)), A(), "unsupported schema value type chan int")
	wcErr(t, MustShape(Contains(1, make(chan int))), A(), "unsupported schema value type chan int")

	// The string form, and the key expression, whose example is the spec
	// whatever the count is.
	wcOK(t, MustShape(MustExpr("Contains(1,Number)")), A(1.0, "a"), A(1.0, "a"))
	wcOK(t, MustShape(M("a: Contains(1,Number)", A())), M("a", A(1.0)), M("a", A(1.0)))
	wcErr(t, MustShape(M("a: Contains(Min(1),Number)", A())), M("a", A("x")),
		`Value "[x]" for property "a" has 0 of its items satisfying Number; the count must be Min(1).`)
	wcOK(t, MustShape(M("a: Contains(1,Nof(1,String,Number))", A())), M("a", A("x", true)), M("a", A("x", true)))
	wcOK(t, MustShape(GContains(1, Number)), A(1.0), A(1.0))
	for src, want := range map[string]string{
		"Contains()":          fault,
		"Contains(1)":         "Shape: Contains needs a shape for the items it counts",
		"Contains(-1,String)": fault,
	} {
		if _, err := Expr(src); err == nil || err.Error() != want {
			t.Fatalf("%s: %v", src, err)
		}
	}
	// The string form's null is the null literal, for the count and the items.
	wcErr(t, MustShape(MustExpr("Contains(null,Number)")), A(), `Value "[]" for property "" has 0 of its items satisfying Number; the count must be null.`)
	wcOK(t, MustShape(MustExpr("Contains(1,null)")), A(nil), A(nil))

	// An array renders as itself; on another kind Contains is a call.
	wcErr(t, MustShape(Nof(2, Contains(Min(1), Number), Unique(A(String)))), A("a"),
		`Value "[a]" for property "" satisfies 0 to 1 of: [], [String]; the count must be 2.`)
	wcErr(t, MustShape(Nof(2, Contains(1, Number, Any), Number)), "x",
		`Value "x" for property "" satisfies 1 of: Contains(1,Number), Number; the count must be 2.`)
	wcErr(t, MustShape(Nof(2, Min(1).Unique(), Number)), "x",
		`Value "x" for property "" satisfies 1 of: Min(1).Unique(), Number; the count must be 2.`)
}

func TestBuilderUnique(t *testing.T) {
	M, A := wcM, wcA

	// Items compare as JSON values: by value, in any key order.
	u := MustShape(Unique())
	wcOK(t, u, A(1.0, "1", true, nil, A(1.0), M("a", 1.0)), A(1.0, "1", true, nil, A(1.0), M("a", 1.0)))
	wcErr(t, u, A(1.0, 2.0, 2.0, 1.0), `Value "[1,2,2,1]" for property "" must have unique items (items 1 and 2 are equal).`)
	wcErr(t, u, A(M("a", 1.0, "b", 2.0), M("b", 2.0, "a", 1.0)),
		`Value "[{a:1,b:2},{a:1,b:2}]" for property "" must have unique items (items 0 and 1 are equal).`)
	wcOK(t, u, A(A(1.0), M("0", 1.0)), A(A(1.0), M("0", 1.0)))
	wcOK(t, u, A(M("a", 1.0), M("b", 1.0), M("a", 1.0, "b", 1.0)), A(M("a", 1.0), M("b", 1.0), M("a", 1.0, "b", 1.0)))
	mustErr(t, u, A(A(math.NaN()), A(math.NaN())), "must have unique items (items 0 and 1 are equal).")
	mustErr(t, u, A(math.NaN(), math.NaN()), "must have unique items (items 0 and 1 are equal).")
	// A number is its value whatever its type, and Null is null.
	mustErr(t, u, A(1, 1.0), "must have unique items (items 0 and 1 are equal).")
	mustErr(t, u, A(Null, nil), "must have unique items (items 0 and 1 are equal).")
	mustErr(t, u, A(A(1, Null), A(1.0, nil)), "must have unique items (items 0 and 1 are equal).")
	// The walk's arrays and objects: a slice, a map, a struct.
	type pair struct{ X int }
	mustErr(t, u, A([]string{"a"}, A("a")), "must have unique items (items 0 and 1 are equal).")
	mustErr(t, u, A(map[string]int{"X": 1}, pair{1}), "must have unique items (items 0 and 1 are equal).")
	wcOK(t, u, A(A(1.0), A(1.0, 2.0)), A(A(1.0), A(1.0, 2.0)))
	wcOK(t, u, A(A(1.0), A(2.0)), A(A(1.0), A(2.0)))
	wcOK(t, u, A(M("a", 1.0), M("a", 2.0)), A(M("a", 1.0), M("a", 2.0)))
	wcOK(t, u, A(M("a", 1.0), A(1.0)), A(M("a", 1.0), A(1.0)))
	// Anything else is equal to itself alone; what Go cannot compare, such
	// as a function, is equal to nothing.
	x, y := 1, 1
	if out := mustOK(t, u, A(&x, &y)); len(out.([]any)) != 2 {
		t.Fatalf("pointers: %v", out)
	}
	mustErr(t, u, A(&x, &x), "must have unique items (items 0 and 1 are equal).")
	fn := func() {}
	if out := mustOK(t, u, A(fn, fn)); len(out.([]any)) != 2 {
		t.Fatalf("functions: %v", out)
	}
	if !sameJSON(1.0, 1) || sameJSON(fn, fn) || sameJSON("1", 1.0) {
		t.Fatal("sameJSON scalars")
	}

	// Not an array: the node's type speaks. With a spec, its shape holds too.
	wcErr(t, u, "x", `Validation failed for string "x" because the string is not of type array.`)
	wcOK(t, MustShape(Unique(Any)), "x", "x")
	mustErr(t, MustShape(Unique(A(String))), A("a", "a"), "must have unique items (items 0 and 1 are equal).")
	mustErr(t, MustShape(Max(2).Unique()), A(1.0, 1.0), "must have unique items (items 0 and 1 are equal).")
	wcOK(t, MustShape(M("u", Unique())), M("u", A(1.0, 2.0)), M("u", A(1.0, 2.0)))
	wcOK(t, MustShape(MustExpr("Unique")), A(1.0, 2.0), A(1.0, 2.0))
	wcOK(t, MustShape(GUnique()), A(1.0, 2.0), A(1.0, 2.0))
	if !MustShape(Unique()).Valid(A(1.0)) || MustShape(Unique()).Valid(A(1.0, 1.0)) {
		t.Fatal("verdicts")
	}
}

func TestBuilderTrials(t *testing.T) {
	M, A := wcM, wcA
	trials := func(n int, spec any) *Schema { return MustShapeWith(spec, ShapeOptions{Trials: n}) }

	// Every trial takes one from the validation's budget; past it the
	// validation fails, with that error alone.
	spent := `Value "[1,2]" for property "" needs more trials than the budget of 1.`
	wcErr(t, trials(1, Contains(2, Number)), A(1.0, 2.0), spent)
	wcOK(t, trials(2, Contains(2, Number)), A(1.0, 2.0), A(1.0, 2.0))
	ctx := &Context{}
	_, _ = trials(1, Contains(2, Number)).ValidateCtx(A(1.0, 2.0), ctx)
	if len(ctx.Err) != 1 || ctx.Err[0].Text != spent || ctx.Err[0].Path != "" || ctx.Err[0].Why != WhyTrial {
		t.Fatalf("ctx errors: %#v", ctx.Err)
	}
	if errs := trials(1, Contains(2, Number)).Error(A(1.0, 2.0)); len(errs) != 1 || errs[0].Text != spent {
		t.Fatalf("errors: %#v", errs)
	}

	// A trial the budget refused could have decided anything, even a not.
	not := trials(2, Nof(0, Contains(3, Number)))
	wcErr(t, not, A(1.0, 2.0, 3.0), `Value "[1,2,3]" for property "" needs more trials than the budget of 2.`)
	if not.Valid(A(1.0, 2.0, 3.0)) || not.Match(A(1.0, 2.0, 3.0)) {
		t.Fatal("a spent budget is no verdict")
	}

	// Validations within it share the budget, and the error names where it
	// ran out.
	mustErr(t, trials(3, All(Contains(1, Number), Contains(1, String))), A(1.0, "a"), "needs more trials than the budget of 3.")
	wcErr(t, trials(1, Discriminated("k", M("a", M("k", String, "x", Contains(Min(1), Number))))), M("k", "a", "x", A("q", 1.0)),
		`Value "[q,1]" for property "x" needs more trials than the budget of 1.`)
	wcErr(t, trials(2, M("a", A(Nof(1, Contains(Min(1), Number), String)))), M("a", A(A(1.0), A("x", 1.0))),
		`Value "[x,1]" for property "a.1" needs more trials than the budget of 2.`)

	// Each call has a budget of its own; a budget that is not a whole
	// number above zero is the default.
	twice := trials(2, Contains(Min(1), Number))
	reused := &Context{}
	for i := 0; i < 2; i++ {
		if out, err := twice.ValidateCtx(A("a", 1.0), reused); err != nil || !reflect.DeepEqual(out, A("a", 1.0)) {
			t.Fatalf("reused %d: %v %v", i, out, err)
		}
	}
	wcOK(t, trials(0, Contains(Min(1), Number)), A(1.0), A(1.0))
	wcOK(t, trials(-1, Contains(Min(1), Number)), A(1.0), A(1.0))
	wcOK(t, MustShape(Contains(Min(1), Number)), A(1.0), A(1.0))

	// A When's condition is a trial, and the shape it picks shares the
	// budget; a Catch, Transform and Ignore probe too.
	wcErr(t, trials(1, When(Contains(1, Number), Any)), A(1.0), `Value "[1]" for property "" needs more trials than the budget of 1.`)
	wcErr(t, trials(1, When(Number, Contains(1, Number), Contains(2, Number))), A(1.0, 2.0),
		`Value "[1,2]" for property "" needs more trials than the budget of 1.`)
	wcErr(t, trials(1, Catch(A(), Contains(2, Number))), A(1.0, 2.0), spent)
	wcErr(t, trials(1, Transform(func(v any, _ *State) any { return v }, Contains(2, Number))), A(1.0, 2.0), spent)
	wcErr(t, trials(1, M("a", Ignore(Contains(2, Number)))), M("a", A(1.0, 2.0)),
		`Value "[1,2]" for property "a" needs more trials than the budget of 1.`)
	wcErr(t, trials(1, Ignore(Contains(2, Number))), A(1.0, 2.0), spent)

	// So does the branch Nof(1) produces from, which runs its trials again:
	// past the budget there, the error names the Nof's own path.
	wcErr(t, trials(4, M("a", Nof(1, Nof(1, Min(0, Number), Max(5, Number)), Boolean))), M("a", 7.0),
		`Value "7" for property "a" needs more trials than the budget of 4.`)
	produce := func(spec any) *Schema { return trials(3, spec) }
	pair := Nof(1, Contains(1, Number), Contains(2, Number))
	wcOK(t, trials(4, pair), A(1.0), A(1.0))
	wcErr(t, produce(pair), A(1.0), `Value "[1]" for property "" needs more trials than the budget of 3.`)
	wcErr(t, produce(M("a", Nof(1, Contains(1, Number), Contains(2, Number)))), M("a", A(1.0)),
		`Value "[1]" for property "a" needs more trials than the budget of 3.`)
	wcErr(t, produce(M("a", M("b", A(Nof(1, Contains(1, Number), Contains(2, Number)))))), M("a", M("b", A(A(1.0)))),
		`Value "[1]" for property "a.b.0" needs more trials than the budget of 3.`)
	wcErr(t, produce(M("a", All(M("b", Nof(1, Contains(1, Number), Contains(2, Number)))))), M("a", M("b", A(1.0))),
		`Value "[1]" for property "a.b" needs more trials than the budget of 3.`)
	wcErr(t, produce(M("a", Nof(1, M("x", Contains(1, Number)), M("x", Contains(2, Number))))), M("a", M("x", A(1.0))),
		`Value "[1]" for property "a.x" needs more trials than the budget of 3.`)
	// A verdict alone runs it again too, but only where trials ran within.
	if produce(M("a", Nof(1, Contains(1, Number), Contains(2, Number)))).Match(M("a", A(1.0))) {
		t.Fatal("the produce step's trials count in a verdict")
	}
	if !trials(4, M("a", Nof(1, Contains(1, Number), Contains(2, Number)))).Match(M("a", A(1.0))) {
		t.Fatal("within the budget")
	}
	if !trials(2, Nof(1, Min(3, String), Max(3, String))).Match("ab") {
		t.Fatal("plain branches")
	}

	// A null a nullable composition is given is still put to its shapes, so
	// its trials count.
	wcErr(t, trials(1, Nullable(Nof(1, Contains(1, Number), Number))), Null,
		`Value "null" for property "" needs more trials than the budget of 1.`)
	wcOK(t, trials(2, Nullable(Nof(1, Contains(1, Number), Number))), Null, nil)

	// A validation run without a context, or with one no call started, has
	// the default budget.
	n := Nof(1, Min(1, String), Max(3, String)).n
	for _, ctx := range []*Context{nil, {}} {
		if verr := (&ValidationError{}); validateNode(n, "ab", []string{}, []any{}, "", nil, ctx, false, verr) != "ab" || !verr.hasAny() {
			t.Fatalf("both branches, context %v", ctx)
		}
		if verr := (&ValidationError{}); validateNode(n, "abcd", []string{}, []any{}, "", nil, ctx, false, verr) != "abcd" || verr.hasAny() {
			t.Fatalf("one branch, context %v", ctx)
		}
	}

	// A count shape is asked once for each count, whoever asks.
	asked := map[float64]int{}
	var mu sync.Mutex
	counting := MustShape(Contains(Check(func(v any, _ *Update, _ *State) bool {
		mu.Lock()
		asked[v.(float64)]++
		mu.Unlock()
		return v.(float64) >= 1
	}), Number))
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			counting.Valid(A(1.0, "x"))
			counting.Valid(A("x"))
		}()
	}
	wg.Wait()
	if len(asked) != 3 || asked[0] != 1 || asked[1] != 1 || asked[2] != 1 {
		t.Fatalf("asked %v", asked)
	}

	// An argument is validated as a call of its own, and counts its trials
	// on a budget of its own.
	argu := MakeArgu("t")
	if out, err := argu.Validate(A(A(1.0, 2.0)), "w", M("a", Contains(2, Number))); err != nil ||
		!reflect.DeepEqual(out, M("a", A(1.0, 2.0))) {
		t.Fatalf("argu: %v %v", out, err)
	}
	if _, err := argu.Validate(A(A(1.0)), "w", M("a", Contains(2, Number))); err == nil ||
		err.Error() != `t (w): Value "[1]" for property "a" has 0 to 1 of its items satisfying Number; the count must be 2.` {
		t.Fatalf("argu: %v", err)
	}
	if out, err := argu.Validate(A(A(1.0), A(2.0)), "w", M("a", Rest(Contains(1, Number)))); err != nil ||
		!reflect.DeepEqual(out, M("a", A(A(1.0), A(2.0)))) {
		t.Fatalf("argu rest: %v %v", out, err)
	}
}

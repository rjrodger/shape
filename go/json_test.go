package shape

// The declarative JSON export, Schema.JSON(), and the Build that reads it.
// Mirrors ts/test/json.test.ts.

import (
	"encoding/json"
	"math"
	"reflect"
	"regexp"
	"strings"
	"testing"
	"time"
)

// jsonOf is the export as canonical JSON text (Go maps sort their keys).
func jsonOf(t *testing.T, s *Schema) string {
	t.Helper()
	j, err := s.JSON()
	if err != nil {
		t.Fatalf("JSON: %v", err)
	}
	b, err := json.Marshal(jsonNorm(j))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return string(b)
}

func canonJSON(t *testing.T, src string) string {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(src), &v); err != nil {
		t.Fatalf("parse %s: %v", src, err)
	}
	b, _ := json.Marshal(v)
	return string(b)
}

// roundTrip: the JSON reads back as a shape with the same JSON, and the two
// shapes agree on every value.
func roundTrip(t *testing.T, spec any, want string, vals ...any) {
	t.Helper()
	s := MustShape(spec)
	got := jsonOf(t, s)
	if got != canonJSON(t, want) {
		t.Fatalf("json:\n got %s\nwant %s", got, canonJSON(t, want))
	}
	var parsed any
	_ = json.Unmarshal([]byte(got), &parsed)
	b, err := Build(parsed)
	if err != nil {
		t.Fatalf("build %s: %v", got, err)
	}
	if back := jsonOf(t, b); back != got {
		t.Fatalf("not fixed:\n got %s\nback %s", got, back)
	}
	for _, v := range vals {
		agree(t, s, b, v)
	}
}

var gnameRE = regexp.MustCompile(`G\$\w+`)

func agree(t *testing.T, s, b *Schema, v any) {
	t.Helper()
	so, se := s.Validate(cloneAny(v))
	bo, be := b.Validate(cloneAny(v))
	if !reflect.DeepEqual(jsonNorm(so), jsonNorm(bo)) {
		t.Fatalf("outputs differ for %v: %v vs %v", v, so, bo)
	}
	st, bt := "", ""
	if se != nil {
		st = gnameRE.ReplaceAllString(se.Error(), "G$")
	}
	if be != nil {
		bt = gnameRE.ReplaceAllString(be.Error(), "G$")
	}
	if st != bt {
		t.Fatalf("errors differ for %v:\n %q\n %q", v, st, bt)
	}
}

func cannot(t *testing.T, spec any, want string) {
	t.Helper()
	s := MustShape(spec)
	_, err := s.JSON()
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("expected %q, got %v", want, err)
	}
}

func TestJSONScalars(t *testing.T) {
	M := func(kv ...any) map[string]any {
		m := map[string]any{}
		for i := 0; i < len(kv); i += 2 {
			m[kv[i].(string)] = kv[i+1]
		}
		return m
	}
	roundTrip(t, M("a", String), `{"a: String":""}`, M("a", "x"), M("a", ""), M())
	roundTrip(t, M("a", Number, "b", Boolean, "c", Integer),
		`{"a: Number":0,"b: Boolean":false,"c: Integer":0}`, M("a", 1.0, "b", true, "c", 2.0), M("c", 1.5))
	roundTrip(t, M("a", 5.0, "b", "x", "c", "", "d", true, "e", nil),
		`{"a":5,"b":"\"x\"","c":"\"\"","d":true,"e":null}`, M(), M("a", "no"), M("e", 1.0))
	roundTrip(t, M("a", Optional(String), "b", Skip(Number), "c", Optional(Integer), "d", Required(5.0)),
		`{"a: String.Optional":"","b: Skip":0,"c: Integer.Optional":0,"d: Required":5}`,
		M(), M("a", ""), M("c", 1.5), M("d", 1.0))
	roundTrip(t, M("a", Empty(String), "b", Nullable(String), "c", Empty("x"), "d", Nullable(5.0)),
		`{"a: String.Empty":"","b: String.Nullable":"","c: Empty":"x","d: Nullable":5}`,
		M("a", "", "b", nil, "c", "", "d", nil), M())
	roundTrip(t, M("a", Min(2, String), "b", Max(3, Optional(Number)), "c", Above(1.5, Number), "d", Below(-2), "e", Len(3, "abc")),
		`{"a: String.Min(2)":"","b: Max(3)":0,"c: Number.Above(1.5)":0,"d":"Any.Below(-2)","e: Len(3)":"abc"}`,
		M(), M("a", "a"), M("b", 4.0), M("c", 1.5), M("d", -2.0), M("e", "abcd"))
	roundTrip(t, M("a", Email(), "b", Coerce(Number), "c", Describe("desc", Number), "d", Fault("bad", String)),
		`{"a: String.Email":"","b: Number.Coerce":0,"c: Number.Describe(\"desc\")":0,"d: String.Fault(\"bad\")":""}`,
		M("a", "a@b.co", "b", "1"), M("a", "nope"), M("d", 1.0))
	// Order is kept: Coerce goes ahead of the bound it converts for.
	roundTrip(t, M("a", Min(2, Number).Coerce()), `{"a: Number.Coerce.Min(2)":0}`, M("a", "3"), M("a", "1"))
	roundTrip(t, M("a", Min(1, Max(3, Number))), `{"a: Number.Max(3).Min(1)":0}`, M("a", 2.0), M("a", 4.0))
}

func TestJSONValueForm(t *testing.T) {
	A := func(v ...any) []any { return v }
	roundTrip(t, A(Skip(0.0)), `["Skip(0)"]`, A(1.0), A("x"))
	roundTrip(t, A(Min(2, 0.0)), `["Optional(0).Min(2)"]`, A(3.0), A(1.0))
	roundTrip(t, A(Required(5.0)), `["Required(5)"]`, A(5.0), A())
	roundTrip(t, A(Optional(String)), `["String.Optional"]`, A(""), A(1.0))
	roundTrip(t, A(Optional(Integer)), `["Integer.Optional"]`, A(1.0), A(1.5))
	roundTrip(t, A("x"), `["\"x\""]`, A("y"), A(1.0))
	roundTrip(t, A(""), `["\"\""]`, A(""), A(1.0))
	roundTrip(t, A(Empty("x")), `["Optional(\"x\").Empty"]`, A(""), A(1.0))
	roundTrip(t, A(Exact(1.0, "a", nil, true)), `["Any.Exact(1,\"a\",null,true)"]`, A("a"), A(2.0))
	roundTrip(t, map[string]any{"a": Optional(7.0).Exact(2.0)}, `{"a":"Optional(7).Exact(2)"}`,
		map[string]any{}, map[string]any{"a": 2.0}, map[string]any{"a": 3.0})
}

func TestJSONObjects(t *testing.T) {
	M := func(kv ...any) map[string]any {
		m := map[string]any{}
		for i := 0; i < len(kv); i += 2 {
			m[kv[i].(string)] = kv[i+1]
		}
		return m
	}
	roundTrip(t, M("a", M("b", String), "c", M(), "d", Closed(M()), "e", Open(M("b", 1.0))),
		`{"a":{"b: String":""},"c":{},"d: Closed":{},"e: Open":{"b":1}}`,
		M("a", M("b", "x"), "c", M("z", 1.0), "d", M(), "e", M("b", 2.0, "z", 1.0)), M("d", M("z", 1.0)), M("a", M()))
	roundTrip(t, M("a", Child(Number), "b", Child(String, M("c", 1.0)), "d", Required(M("e", 1.0)), "f", Skip(M("g", 1.0))),
		`{"a: Child(Number)":{},"b: Child(String)":{"c":1},"d: Required":{"e":1},"f: Skip":{"g":1}}`,
		M("a", M("x", 1.0), "b", M("z", "x"), "d", M()), M("a", M("x", "no")), M(), M("f", M()))
	roundTrip(t, M("a", Min(1, Open(M("b", 1.0))), "c", Nullable(M("d", 1.0))),
		`{"a: Min(1).Open":{"b":1},"c: Nullable":{"d":1}}`, M("a", M(), "c", nil), M("a", M("b", 2.0)))
	// A child shape with no expression rides in a sidecar.
	roundTrip(t, Child(M("x", Number)), `{"$$":"Child($$0)","$$0":{"x: Number":0}}`, M("a", M("x", 1.0)), M("a", M("x", "no")))
	roundTrip(t, M("a", Child(M("x", Number), M("b", 1.0))),
		`{"a":{"b":1,"$$":"Child($$0)","$$0":{"x: Number":0}}}`, M("a", M("c", M("x", 1.0))))
	roundTrip(t, Open(M("a", String)), `{"a: String":"","$$":"Open"}`, M("a", "x", "z", 1.0))
	roundTrip(t, M(), `{}`, M("z", 1.0))
	roundTrip(t, Closed(M()), `{"$$":"Closed"}`, M(), M("z", 1.0))
}

func TestJSONArrays(t *testing.T) {
	M := func(kv ...any) map[string]any {
		m := map[string]any{}
		for i := 0; i < len(kv); i += 2 {
			m[kv[i].(string)] = kv[i+1]
		}
		return m
	}
	A := func(v ...any) []any { return v }
	roundTrip(t, M("a", A(String), "b", A(String, Number), "c", A(), "d", A(A(Number)), "e", A(M("x", String))),
		`{"a":["String"],"b":["String","Number"],"c":[],"d":[["Number"]],"e":[{"x: String":""}]}`,
		M("a", A("x"), "b", A("x", 1.0), "c", A(), "d", A(A(1.0)), "e", A(M("x", "y"))), M("a", A(1.0)), M("b", A("x")), M("c", A(1.0)))
	roundTrip(t, M("a", Closed(A(String))), `{"a":{"$$":"Closed($$0)","$$0":["String"]}}`, M("a", A("x")), M("a", A("x", "y")))
	roundTrip(t, M("a", Rest(Number, A(String, Number)), "b", Rest(Number, Closed(A(String))), "c", Rest(Number, A())),
		`{"a: Rest(Number)":["String","Number"],"b":{"$$":"Rest(Number,Closed($$0))","$$0":["String"]},"c: Rest(Number)":[]}`,
		M("a", A("x", 1.0, 2.0), "b", A("x", 1.0), "c", A(1.0)), M("a", A("x", 1.0, "y")), M("b", A("x", "y")), M("c", A("x")))
	roundTrip(t, M("a", Min(2, A(String)), "b", Required(A(Number)), "c", Skip(A(Number)), "d", Min(1, Closed(A(String)))),
		`{"a: Min(2)":["String"],"b: Required":["Number"],"c: Skip":["Number"],"d":{"$$":"Min(1,Closed($$0))","$$0":["String"]}}`,
		M("a", A("x", "y"), "b", A(), "d", A("x")), M("a", A("x")), M(), M("d", A()))
	roundTrip(t, Rest(M("q", 1.0), A()), `{"$$":"Rest($$1,$$0)","$$0":[],"$$1":{"q":1}}`, A(M()), A(1.0))
}

func TestJSONLists(t *testing.T) {
	M := func(kv ...any) map[string]any {
		m := map[string]any{}
		for i := 0; i < len(kv); i += 2 {
			m[kv[i].(string)] = kv[i+1]
		}
		return m
	}
	A := func(v ...any) []any { return v }
	roundTrip(t, M("a", One(String, Number)), `{"a":"One(String,Number)"}`, M("a", 1.0), M("a", true))
	roundTrip(t, M("a", Some(M("x", 1.0), A(String))), `{"a":{"$$":"Some($$0,$$1)","$$0":{"x":1},"$$1":["String"]}}`,
		M("a", M("x", 2.0)), M("a", A("y")))
	roundTrip(t, M("a", All(Number, Min(1))), `{"a":"All(Number,Any.Min(1))"}`, M("a", 1.0), M("a", 0.0))
	roundTrip(t, M("a", Optional(One(String, Number)), "b", Skip(One(String, Number))),
		`{"a":"One(String,Number).Optional","b":"One(String,Number).Skip"}`, M(), M("a", true))
	roundTrip(t, M("a", One(Skip(0.0)), "b", One(Min(2, 0.0).Ignore(), String)),
		`{"a":"One(Skip(0))","b":"One(Skip(0).Min(2).Ignore,String)"}`, M(), M("a", 1.0), M("b", 1.0), M("b", "x"))
	roundTrip(t, Some(Open(M("a", 1.0)), Open(M("b", 2.0))),
		`{"$$":"Some($$0,$$1)","$$0":{"a":1,"$$":"Open"},"$$1":{"b":2,"$$":"Open"}}`, M(), M("a", 2.0, "c", 3.0))
	roundTrip(t, M("a", Discriminated("k", M("x", M("a", Number), "y", M("b", String, "k", "y")))),
		`{"a":{"$$":"Discriminated(\"k\",$$0)","$$0":{"x":{"a: Number":0},"y":{"b: String":""}}}}`,
		M("a", M("k", "x", "a", 1.0)), M("a", M("k", "y", "b", 1.0)), M("a", M("k", "z")))
	roundTrip(t, Discriminated("k", M("x", M("k", Min(1, "x")))),
		`{"$$":"Discriminated(\"k\",$$0)","$$0":{"x":{"k: Min(1)":"x"}}}`, M("k", "x"))
}

func TestJSONKinds(t *testing.T) {
	M := func(kv ...any) map[string]any {
		m := map[string]any{}
		for i := 0; i < len(kv); i += 2 {
			m[kv[i].(string)] = kv[i+1]
		}
		return m
	}
	re := regexp.MustCompile
	roundTrip(t, M("a", re("^a+$"), "b", Check(re("^b")), "c", Skip(re("x")), "d", Min(2, re("x")).Skip(), "e", Optional(Check(re("^b")))),
		`{"a":"/^a+$/","b":"Check(/^b/)","c":"Skip(/x/)","d":"Skip(/x/).Min(2)","e":"Check(/^b/).Optional"}`,
		M("a", "aa", "b", "b", "c", "x", "d", "xx"), M("a", "b"), M("b", 1.0), M("d", "x"), M("e", "c"))
	roundTrip(t, M("a", Type(Any), "b", Required(), "c", Never(), "d", Date, "e", Optional(Date), "f", Func(), "g", Function),
		`{"a":"Any","b":"Required","c":"Never","d":"Date","e":"Optional(Date)","f":"Optional(Function)","g":"Function"}`,
		M("b", 1.0, "d", time.Now()), M("c", 1.0), M())
	roundTrip(t, M("a", Type(Any).Open(), "b", Type(Any).Default(3.0), "e", Skip(Never())),
		`{"a":"Any.Open","b":"Any(3)","e":"Never.Skip"}`, M("a", M("z", 1.0)), M())
	roundTrip(t, M("a", MustExpr("NaN"), "b", Required(MustExpr("NaN")), "c", Min(2, MustExpr("NaN")), "d", MustExpr("Skip(null)"), "e", MustExpr("Required(null)")),
		`{"a":"NaN","b":"Required(NaN)","c":"Optional(NaN).Min(2)","d":"Skip(null)","e":"Required(null)"}`,
		M("e", nil), M(), M("d", 1.0))
	roundTrip(t, M("a", Catch(0.0, Min(2, Number)), "b", Ignore(Min(2, String)), "c", Catch("x", re("^a"))),
		`{"a: Number.Min(2).Catch(0)":0,"b: String.Min(2).Ignore":"","c":"Catch(\"x\",/^a/)"}`,
		M("a", 1.0, "b", "a", "c", "b"), M("a", "x"), M())
	roundTrip(t, M("a", Define("d", String), "b", Refer("d"), "c", Rename("z", String), "d", Rename("z", Number)),
		`{"a: String.Define(\"d\")":"","b":"Any.Refer(\"d\")","c: String.Rename(\"z\")":"","d: Number.Rename(\"z\")":0}`,
		M("a", "x", "b", "y", "c", "q", "d", 1.0), M("a", "x", "b", 1.0))
	roundTrip(t, M("a", Key(), "b", Key(2, "/"), "c", Key(1), "d", Required(Key()), "e", Key().Min(1)),
		`{"a":"Key","b":"Key(2,\"/\")","c":"Key(1)","d":"Key.Required","e":"Key.Min(1)"}`, M("a", "x"), M())
}

func TestJSONNames(t *testing.T) {
	M := func(kv ...any) map[string]any {
		m := map[string]any{}
		for i := 0; i < len(kv); i += 2 {
			m[kv[i].(string)] = kv[i+1]
		}
		return m
	}
	roundTrip(t, M("a b", 1.0, "c d", String, `"q"`, 2.0, "", 3.0, "e:", 4.0, " f", Number),
		`{"a b":1,"\"c d\": String":"","\"q\"":2,"":3,"e:":4,"\" f\": Number":0}`,
		M("a b", 2.0, "c d", "x", `"q"`, 3.0, "", 4.0, "e:", 5.0, " f", 1.0), M("c d", 1.0))
	s, err := ShapeWith(M("a: b", 1.0), ShapeOptions{KeyExpr: KeyExprOptions{Disable: true}})
	if err != nil {
		t.Fatal(err)
	}
	if got := jsonOf(t, s); got != `{"\"a: b\": Optional":1}` {
		t.Fatalf("got %s", got)
	}
}

func TestJSONCannot(t *testing.T) {
	M := func(kv ...any) map[string]any {
		m := map[string]any{}
		for i := 0; i < len(kv); i += 2 {
			m[kv[i].(string)] = kv[i+1]
		}
		return m
	}
	fn := func(val any, update *Update, state *State) bool { return true }
	cannot(t, M("a", Check(fn)), "cannot express a check function")
	cannot(t, M("a", Before(fn, Number)), "cannot express a custom check Before")
	cannot(t, M("a", After(fn, Number)), "cannot express a custom after check After")
	cannot(t, M("a", Catch(0.0, After(fn, Number))), "cannot express a custom after check")
	cannot(t, M("a", Transform(func(v any, s *State) any { return v }, Number)), "cannot express Transform")
	cannot(t, M("a", Key(func() {})), "cannot express the Key argument function")
	cannot(t, M("a", RenameWith("b", RenameOptions{Keep: true}, Number)), "cannot express the options of Rename")
	cannot(t, M("a", ReferWith("d", ReferOptions{Fill: true})), "cannot express the options of Refer")
	cannot(t, M("a", ReferWith("d", ReferOptions{Strict: true})), "cannot express the options of Refer")
	cannot(t, M("a", Catch(M("x", 1.0), Number)), "cannot express the fallback object")
	cannot(t, M("a", Default(M("q", 1.0), Child(Number))), "cannot express an object default")
	cannot(t, M("a", Default([]any{1.0}, []any{Number})), "cannot express an array default")
	cannot(t, M("a", time.Now()), "cannot express a date default")
	cannot(t, M("$$", 1.0), `cannot express the property name "$$"`)
	cannot(t, M("a", Child(Number).Exact(1.0)), "cannot express Exact on an object")
	cannot(t, M("a", Rest(Number).Exact(1.0)), "cannot express Exact on an array")
	cannot(t, M("a", Exact(func() {})), "cannot express the Exact value function")
	cannot(t, M("a", Exact(math.Inf(1))), "cannot express the Exact value +Inf")
	cannot(t, M("a", Check(regexp.MustCompile("^a")).Check(func(val any, update *Update, state *State) bool { return true })), "cannot express a check function")
	roundTrip(t, M("a", Exact(math.NaN()), "b", Min(int8(2), Number), "c", Max(float32(3), Number)),
		`{"a":"Any.Exact(NaN)","b: Number.Min(2)":0,"c: Number.Max(3)":0}`, M("b", 2.0, "c", 3.0), M("b", 1.0))
	cannot(t, M("a", Exact(M())), "cannot express the Exact value object")
	cannot(t, M("a", Type(Any).Default(M())), "cannot express the default object")
	cannot(t, M("a", Type(Kind("bigint"))), "cannot express a bigint value")
	s, _ := ShapeWith(M("a: b", One(1.0, 2.0)), ShapeOptions{KeyExpr: KeyExprOptions{Disable: true}})
	if _, err := s.JSON(); err == nil || !strings.Contains(err.Error(), `property name "a: b" of a value with no key form`) {
		t.Fatalf("got %v", err)
	}
	// An empty schema has no JSON.
	var none *Schema
	if j, err := none.JSON(); j != nil || err != nil {
		t.Fatal("nil schema")
	}
	// Any other panic passes through.
	bad := MustShape(M("a", Min(1, String)))
	bad.root.objChildren["a"].befores[0].args = nil
	assertPanics(t, func() { _, _ = bad.JSON() })
}

func TestJSONReader(t *testing.T) {
	M := func(kv ...any) map[string]any {
		m := map[string]any{}
		for i := 0; i < len(kv); i += 2 {
			m[kv[i].(string)] = kv[i+1]
		}
		return m
	}
	A := func(v ...any) []any { return v }
	build := func(spec any) *Schema {
		s, err := Build(spec)
		if err != nil {
			t.Fatalf("build: %v", err)
		}
		return s
	}
	// The key form keeps the kind the chain names; the example is the
	// default alone.
	mustErr(t, build(M("a: String", "")), M("a", ""), "empty string is not allowed")
	mustErr(t, build(M("a: Integer.Min(2)", 0.0)), M("a", 2.5), "not of type integer")
	if out := mustOK(t, build(M("a: Number.Optional", 5.0)), M()); !reflect.DeepEqual(out, M("a", 5.0)) {
		t.Fatalf("got %v", out)
	}
	if out := mustOK(t, build(M("a: String.Optional", "x")), M()); !reflect.DeepEqual(out, M("a", "x")) {
		t.Fatalf("got %v", out)
	}
	if out := mustOK(t, build(M("a: String.Skip", "")), M()); !reflect.DeepEqual(out, M()) {
		t.Fatalf("got %v", out)
	}
	mustErr(t, build(M("a: String.Skip", "")), M("a", ""), "empty string is not allowed")
	mustOK(t, build(M("a: Skip", "")), M("a", ""))
	// The kind of a chain that names none is the example's.
	mustErr(t, build(M("a: Min(2)", 0.0)), M("a", "x"), "not of type number")
	mustOK(t, build(M("a: Child(Number)", A())), M("a", A(1.0)))
	mustOK(t, build(M("a: Object", M("b", String))), M("a", M("b", "x")))
	mustErr(t, build(M("a: Object", M("b", String))), M("a", M("b", "x", "z", 1.0)), `"z" is not allowed`)
	mustOK(t, build(M("a: Array", A(String))), M("a", A("x")))
	// A rest replaces the element shape it is given, as it does in TypeScript.
	mustOK(t, build(M("a: Rest(Number)", A(String))), M("a", A(1.0)))
	mustErr(t, build(M("a: Rest(Number)", A(String))), M("a", A("x")), "not of type number")
	// A fraction is one token.
	mustOK(t, MustShape(MustExpr("Min(1.5)")), 1.6)
	mustErr(t, MustShape(MustExpr("Min(1.5)")), 1.4, "minimum of 1.5")
	mustOK(t, MustShape(MustExpr("Max(-2.5e1)")), -30.0)
	if out := mustOK(t, MustShape(MustExpr("Optional(1.5)")), nil); out != 1.5 {
		t.Fatalf("got %v", out)
	}
	// Marks are read where they are, so a branch has its own.
	if out := mustOK(t, build(M("$$", "One($$0,String)", "$$0", M("a", 1.0, "$$", "Open"))), M("z", 1.0)); !reflect.DeepEqual(out, M("a", 1.0, "z", 1.0)) {
		t.Fatalf("got %v", out)
	}
	mustOK(t, build(M("$$", "Min(2,$$0).Skip", "$$0", A("String"))), A("a", "b"))
	mustErr(t, build(M("$$", "Min(2,$$0).Skip", "$$0", A("String"))), A("a"), "minimum length of 2")
	if got := jsonOf(t, build(M("$$", "Min(2,$$0).Skip", "$$0", A("String")))); got != `{"$$":"Skip($$0).Min(2)","$$0":["String"]}` {
		t.Fatalf("got %s", got)
	}
	// The mark value that is not an expression is left alone.
	mustOK(t, build(M("a", 1.0, "$$", 2.0)), M("a", 3.0, "$$", 4.0))
	// An unclosed argument list, in a chained Exact and elsewhere.
	for _, bad := range []string{"Any.Exact(", "Any.Exact(1", "Exact("} {
		if _, err := Expr(bad); err == nil {
			t.Fatalf("Expr(%q) should error", bad)
		}
	}
	// A mark that does not parse is a build error.
	for _, bad := range []any{
		M("$$", ""),
		M("$$", "One(@)"),
		M("$$", "Min(", "$$0", A()),
		M("$$", "Min(2,$$0).Bogus", "$$0", A()),
		M("$$", "Discriminated(1,$$0)", "$$0", M()),
		M("$$", "Discriminated(\"k\")"),
		M("a", A("(")),
	} {
		if _, err := Build(bad); err == nil {
			t.Fatalf("expected an error for %v", bad)
		}
	}
	// A sidecar in head position.
	mustOK(t, build(M("$$", "$$0", "$$0", A("String"))), A("a"))
	// A build error inside a key expression's object example.
	if _, err := Build(M("a: Open", M("b", "("))); err == nil {
		t.Fatal("expected an error")
	}
}

// Every corpus spec round trips, but for the few that say what the
// expression form cannot.
func TestJSONCorpus(t *testing.T) {
	count, cannotCount := 0, 0
	for _, row := range loadCompatRows(t) {
		s, err := Shape(decodeSpec(row.Spec))
		if err != nil {
			continue
		}
		j, err := s.JSON()
		if err != nil {
			if !strings.Contains(err.Error(), "the options of Refer") && !strings.Contains(err.Error(), "an object default") {
				t.Fatalf("%s: %v", row.Name, err)
			}
			cannotCount++
			continue
		}
		text, _ := json.Marshal(jsonNorm(j))
		var parsed any
		_ = json.Unmarshal(text, &parsed)
		b, err := Build(parsed)
		if err != nil {
			t.Fatalf("%s: build %s: %v", row.Name, text, err)
		}
		bj, err := b.JSON()
		if err != nil {
			t.Fatalf("%s: re-export: %v", row.Name, err)
		}
		back, _ := json.Marshal(jsonNorm(bj))
		if string(back) != string(text) {
			t.Fatalf("%s: not fixed:\n %s\n %s", row.Name, text, back)
		}
		in := row.Input
		if in == nil {
			in = Null
		}
		agree(t, s, b, in)
		count++
	}
	if count < 300 || cannotCount > 8 {
		t.Fatalf("count %d cannot %d", count, cannotCount)
	}
}

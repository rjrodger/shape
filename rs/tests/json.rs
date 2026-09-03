//! The declarative JSON export, `Schema::json`, and the `build` that reads
//! it. Mirrors `ts/test/json.test.ts` and `go/json_test.go`.

mod common;

use common::decode_spec;
use shape::*;
use std::fs;
use std::path::Path;

/// The export as canonical JSON text.
fn json_of(s: &Schema) -> String {
    serde_json::Value::from(s.json().unwrap_or_else(|e| panic!("json: {}", e))).to_string()
}

fn canon(src: &str) -> String {
    serde_json::from_str::<serde_json::Value>(src)
        .unwrap_or_else(|e| panic!("{}: {}", src, e))
        .to_string()
}

/// The JSON reads back as a shape with the same JSON, and the two shapes
/// agree on every value.
fn round_trip(spec: impl Into<Spec>, want: &str, vals: &[serde_json::Value]) {
    let s = Schema::new(spec);
    let got = json_of(&s);
    assert_eq!(got, canon(want));
    let parsed: serde_json::Value = serde_json::from_str(&got).unwrap();
    let b = Schema::new(build(&Value::from(parsed)).unwrap_or_else(|e| panic!("build {}: {}", got, e)));
    assert_eq!(json_of(&b), got, "not a fixed point");
    for v in vals {
        agree(&s, &b, v);
    }
}

fn agree(s: &Schema, b: &Schema, v: &serde_json::Value) {
    let sr = s.validate(Value::from(v.clone()));
    let br = b.validate(Value::from(v.clone()));
    match (sr, br) {
        (Ok(so), Ok(bo)) => assert_eq!(
            serde_json::Value::from(so),
            serde_json::Value::from(bo),
            "outputs differ for {}",
            v
        ),
        (Err(se), Err(be)) => assert_eq!(se.to_string(), be.to_string(), "errors differ for {}", v),
        (so, bo) => panic!("verdicts differ for {}: {:?} {:?}", v, so.is_ok(), bo.is_ok()),
    }
}

fn cannot(spec: impl Into<Spec>, want: &str) {
    let e = Schema::new(spec).json().expect_err("expected a refusal");
    assert!(
        e.to_string().contains(want),
        "want {:?}, got {:?}",
        want,
        e.to_string()
    );
}

fn v(src: &str) -> serde_json::Value {
    serde_json::from_str(src).unwrap()
}

#[test]
fn scalars() {
    round_trip(
        obj([("a", Token::String)]),
        r#"{"a: String":""}"#,
        &[v(r#"{"a":"x"}"#), v(r#"{"a":""}"#), v("{}")],
    );
    round_trip(
        obj([
            ("a", Spec::from(Token::Number)),
            ("b", Spec::from(Token::Boolean)),
            ("c", Spec::from(Token::Integer)),
        ]),
        r#"{"a: Number":0,"b: Boolean":false,"c: Integer":0}"#,
        &[v(r#"{"a":1,"b":true,"c":2}"#), v(r#"{"c":1.5}"#)],
    );
    round_trip(
        obj([
            ("a", Spec::from(5)),
            ("b", Spec::from("x")),
            ("c", Spec::from("")),
            ("d", Spec::from(true)),
            ("e", Spec::Value(Value::Null)),
        ]),
        r#"{"a":5,"b":"\"x\"","c":"\"\"","d":true,"e":null}"#,
        &[v("{}"), v(r#"{"a":"no"}"#), v(r#"{"e":1}"#)],
    );
    round_trip(
        obj([
            ("a", optional(Token::String)),
            ("b", skip(Token::Number)),
            ("c", optional(Token::Integer)),
            ("d", required(5)),
        ]),
        r#"{"a: String.Optional":"","b: Skip":0,"c: Integer.Optional":0,"d: Required":5}"#,
        &[v("{}"), v(r#"{"a":""}"#), v(r#"{"c":1.5}"#), v(r#"{"d":1}"#)],
    );
    round_trip(
        obj([
            ("a", empty(Token::String)),
            ("b", nullable(Token::String)),
            ("c", empty("x")),
            ("d", nullable(5)),
        ]),
        r#"{"a: String.Empty":"","b: String.Nullable":"","c: Empty":"x","d: Nullable":5}"#,
        &[v(r#"{"a":"","b":null,"c":"","d":null}"#), v("{}")],
    );
    round_trip(
        obj([
            ("a", min(2, Token::String)),
            ("b", max(3, optional(Token::Number))),
            ("c", above(1.5, Token::Number)),
            ("d", below(-2, any())),
            ("e", len(3, "abc")),
        ]),
        r#"{"a: String.Min(2)":"","b: Max(3)":0,"c: Number.Above(1.5)":0,"d":"Any.Below(-2)","e: Len(3)":"abc"}"#,
        &[v("{}"), v(r#"{"a":"a"}"#), v(r#"{"b":4}"#), v(r#"{"c":1.5}"#), v(r#"{"e":"abcd"}"#)],
    );
    round_trip(
        obj([
            ("a", email(any())),
            ("b", coerce(Token::Number)),
            ("c", describe("desc", Token::Number)),
            ("d", fault("bad", Token::String)),
        ]),
        r#"{"a: String.Email":"","b: Number.Coerce":0,"c: Number.Describe(\"desc\")":0,"d: String.Fault(\"bad\")":""}"#,
        &[v(r#"{"a":"a@b.co","b":"1"}"#), v(r#"{"a":"nope"}"#), v(r#"{"d":1}"#)],
    );
    // Order is kept: Coerce goes ahead of the bound it converts for.
    round_trip(
        obj([("a", min(2, Token::Number).coerce())]),
        r#"{"a: Number.Coerce.Min(2)":0}"#,
        &[v(r#"{"a":"3"}"#), v(r#"{"a":"1"}"#)],
    );
    round_trip(
        obj([("a", min(1, max(3, Token::Number)))]),
        r#"{"a: Number.Max(3).Min(1)":0}"#,
        &[v(r#"{"a":2}"#), v(r#"{"a":4}"#)],
    );
}

#[test]
fn value_form() {
    round_trip(arr([skip(0)]), r#"["Skip(0)"]"#, &[v("[1]"), v(r#"["x"]"#)]);
    round_trip(arr([min(2, 0)]), r#"["Optional(0).Min(2)"]"#, &[v("[3]"), v("[1]")]);
    round_trip(arr([required(5)]), r#"["Required(5)"]"#, &[v("[5]"), v("[]")]);
    round_trip(arr([optional(Token::String)]), r#"["String.Optional"]"#, &[v(r#"[""]"#), v("[1]")]);
    round_trip(arr([optional(Token::Integer)]), r#"["Integer.Optional"]"#, &[v("[1]"), v("[1.5]")]);
    round_trip(arr([Spec::from("x")]), r#"["\"x\""]"#, &[v(r#"["y"]"#), v("[1]")]);
    round_trip(arr([Spec::from("")]), r#"["\"\""]"#, &[v(r#"[""]"#), v("[1]")]);
    round_trip(arr([empty("x")]), r#"["Optional(\"x\").Empty"]"#, &[v(r#"[""]"#), v("[1]")]);
    round_trip(
        arr([exact([Value::from(1), Value::from("a"), Value::Null, Value::from(true)])]),
        r#"["Any.Exact(1,\"a\",null,true)"]"#,
        &[v(r#"["a"]"#), v("[2]")],
    );
    round_trip(
        obj([("a", optional(7).exact([2]))]),
        r#"{"a":"Optional(7).Exact(2)"}"#,
        &[v("{}"), v(r#"{"a":2}"#), v(r#"{"a":3}"#)],
    );
}

#[test]
fn objects() {
    round_trip(
        obj([
            ("a", obj([("b", Token::String)])),
            ("c", obj::<&str, Spec>([])),
            ("d", Spec::from(closed(obj::<&str, Spec>([])))),
            ("e", Spec::from(open(obj([("b", 1)])))),
        ]),
        r#"{"a":{"b: String":""},"c":{},"d: Closed":{},"e: Open":{"b":1}}"#,
        &[
            v(r#"{"a":{"b":"x"},"c":{"z":1},"d":{},"e":{"b":2,"z":1}}"#),
            v(r#"{"d":{"z":1}}"#),
            v(r#"{"a":{}}"#),
        ],
    );
    round_trip(
        obj([
            ("a", child(Token::Number, any())),
            ("b", child(Token::String, obj([("c", 1)]))),
            ("d", required(obj([("e", 1)]))),
            ("f", skip(obj([("g", 1)]))),
        ]),
        r#"{"a: Child(Number)":{},"b: Child(String)":{"c":1},"d: Required":{"e":1},"f: Skip":{"g":1}}"#,
        &[
            v(r#"{"a":{"x":1},"b":{"z":"x"},"d":{}}"#),
            v(r#"{"a":{"x":"no"}}"#),
            v("{}"),
            v(r#"{"f":{}}"#),
        ],
    );
    round_trip(
        obj([
            ("a", min(1, open(obj([("b", 1)])))),
            ("c", nullable(obj([("d", 1)]))),
        ]),
        r#"{"a: Min(1).Open":{"b":1},"c: Nullable":{"d":1}}"#,
        &[v(r#"{"a":{},"c":null}"#), v(r#"{"a":{"b":2}}"#)],
    );
    // A child shape with no expression rides in a sidecar.
    round_trip(
        child(obj([("x", Token::Number)]), any()),
        r#"{"$$":"Child($$0)","$$0":{"x: Number":0}}"#,
        &[v(r#"{"a":{"x":1}}"#), v(r#"{"a":{"x":"no"}}"#)],
    );
    round_trip(
        obj([("a", child(obj([("x", Token::Number)]), obj([("b", 1)])))]),
        r#"{"a":{"b":1,"$$":"Child($$0)","$$0":{"x: Number":0}}}"#,
        &[v(r#"{"a":{"c":{"x":1}}}"#)],
    );
    round_trip(
        open(obj([("a", Token::String)])),
        r#"{"a: String":"","$$":"Open"}"#,
        &[v(r#"{"a":"x","z":1}"#)],
    );
    round_trip(obj::<&str, Spec>([]), "{}", &[v(r#"{"z":1}"#)]);
    round_trip(closed(obj::<&str, Spec>([])), r#"{"$$":"Closed"}"#, &[v("{}"), v(r#"{"z":1}"#)]);
}

#[test]
fn arrays() {
    round_trip(
        obj([
            ("a", arr([Token::String])),
            ("b", arr([Token::String, Token::Number])),
            ("c", arr::<Spec>([])),
            ("d", arr([arr([Token::Number])])),
            ("e", arr([obj([("x", Token::String)])])),
        ]),
        r#"{"a":["String"],"b":["String","Number"],"c":[],"d":[["Number"]],"e":[{"x: String":""}]}"#,
        &[
            v(r#"{"a":["x"],"b":["x",1],"c":[],"d":[[1]],"e":[{"x":"y"}]}"#),
            v(r#"{"a":[1]}"#),
            v(r#"{"b":["x"]}"#),
            v(r#"{"c":[1]}"#),
        ],
    );
    // A single position is closed, which [X] cannot say.
    round_trip(
        obj([("a", closed(arr([Token::String])))]),
        r#"{"a":{"$$":"Closed($$0)","$$0":["String"]}}"#,
        &[v(r#"{"a":["x"]}"#), v(r#"{"a":["x","y"]}"#)],
    );
    round_trip(
        obj([
            ("a", rest(Token::Number, arr([Token::String, Token::Number]))),
            ("b", rest(Token::Number, closed(arr([Token::String])))),
            ("c", rest(Token::Number, arr::<Spec>([]))),
        ]),
        r#"{"a: Rest(Number)":["String","Number"],"b":{"$$":"Rest(Number,Closed($$0))","$$0":["String"]},"c: Rest(Number)":[]}"#,
        &[
            v(r#"{"a":["x",1,2],"b":["x",1],"c":[1]}"#),
            v(r#"{"a":["x",1,"y"]}"#),
            v(r#"{"b":["x","y"]}"#),
            v(r#"{"c":["x"]}"#),
        ],
    );
    round_trip(
        obj([
            ("a", min(2, arr([Token::String]))),
            ("b", required(arr([Token::Number]))),
            ("c", skip(arr([Token::Number]))),
            ("d", min(1, closed(arr([Token::String])))),
        ]),
        r#"{"a: Min(2)":["String"],"b: Required":["Number"],"c: Skip":["Number"],"d":{"$$":"Min(1,Closed($$0))","$$0":["String"]}}"#,
        &[v(r#"{"a":["x","y"],"b":[],"d":["x"]}"#), v(r#"{"a":["x"]}"#), v("{}"), v(r#"{"d":[]}"#)],
    );
    // A rest replaces a plain element shape, so nothing of the String is
    // left to write.
    round_trip(
        obj([("a", rest(Token::Number, arr([Token::String])))]),
        r#"{"a: Rest(Number)":[]}"#,
        &[v(r#"{"a":[1,2]}"#), v(r#"{"a":["x"]}"#)],
    );
    round_trip(
        rest(obj([("q", 1)]), arr::<Spec>([])),
        r#"{"$$":"Rest($$1,$$0)","$$0":[],"$$1":{"q":1}}"#,
        &[v("[{}]"), v("[1]")],
    );
}

#[test]
fn lists() {
    round_trip(
        obj([("a", one([Token::String, Token::Number]))]),
        r#"{"a":"One(String,Number)"}"#,
        &[v(r#"{"a":1}"#), v(r#"{"a":true}"#)],
    );
    round_trip(
        obj([("a", some([obj([("x", 1)]), Spec::Arr(vec![Spec::from(Token::String)])]))]),
        r#"{"a":{"$$":"Some($$0,$$1)","$$0":{"x":1},"$$1":["String"]}}"#,
        &[v(r#"{"a":{"x":2}}"#), v(r#"{"a":["y"]}"#)],
    );
    round_trip(
        obj([("a", all([Spec::from(Token::Number), Spec::from(min(1, any()))]))]),
        r#"{"a":"All(Number,Any.Min(1))"}"#,
        &[v(r#"{"a":1}"#), v(r#"{"a":0}"#)],
    );
    round_trip(
        obj([
            ("a", optional(one([Token::String, Token::Number]))),
            ("b", skip(one([Token::String, Token::Number]))),
        ]),
        r#"{"a":"One(String,Number).Optional","b":"One(String,Number).Skip"}"#,
        &[v("{}"), v(r#"{"a":true}"#)],
    );
    round_trip(
        obj([
            ("a", one([skip(0)])),
            ("b", one([Spec::from(min(2, 0).ignore()), Spec::from(Token::String)])),
        ]),
        r#"{"a":"One(Skip(0))","b":"One(Skip(0).Min(2).Ignore,String)"}"#,
        &[v("{}"), v(r#"{"a":1}"#), v(r#"{"b":1}"#), v(r#"{"b":"x"}"#)],
    );
    // Marks inside a branch apply to the branch.
    round_trip(
        some([open(obj([("a", 1)])), open(obj([("b", 2)]))]),
        r#"{"$$":"Some($$0,$$1)","$$0":{"a":1,"$$":"Open"},"$$1":{"b":2,"$$":"Open"}}"#,
        &[v("{}"), v(r#"{"a":2,"c":3}"#)],
    );
    round_trip(
        obj([(
            "a",
            discriminated(
                "k",
                [
                    ("x", obj([("a", Token::Number)])),
                    ("y", obj([("b", Spec::from(Token::String)), ("k", Spec::from("y"))])),
                ],
            ),
        )]),
        r#"{"a":{"$$":"Discriminated(\"k\",$$0)","$$0":{"x":{"a: Number":0},"y":{"b: String":""}}}}"#,
        &[v(r#"{"a":{"k":"x","a":1}}"#), v(r#"{"a":{"k":"y","b":1}}"#), v(r#"{"a":{"k":"z"}}"#)],
    );
    // A branch that is not an object has no tag property to drop.
    round_trip(
        discriminated("k", [("x", Spec::from(Token::Number))]),
        r#"{"$$":"Discriminated(\"k\",$$0)","$$0":{"x":"Number"}}"#,
        &[v(r#"{"k":"x"}"#), v("1")],
    );
    round_trip(
        discriminated("k", [("x", obj([("k", min(1, "x"))]))]),
        r#"{"$$":"Discriminated(\"k\",$$0)","$$0":{"x":{"k: Min(1)":"x"}}}"#,
        &[v(r#"{"k":"x"}"#)],
    );
}

#[test]
fn kinds() {
    let re = |s: &str| regex::Regex::new(s).unwrap();
    round_trip(
        obj([
            ("a", Spec::from(re("^a+$"))),
            ("b", Spec::from(check_re(re("^b"), any()))),
            ("c", Spec::from(skip(re("x")))),
            ("d", Spec::from(min(2, re("x")).skip())),
            ("e", Spec::from(optional(check_re(re("^b"), any())))),
        ]),
        r#"{"a":"/^a+$/","b":"Check(/^b/)","c":"Skip(/x/)","d":"Skip(/x/).Min(2)","e":"Check(/^b/).Optional"}"#,
        &[
            v(r#"{"a":"aa","b":"b","c":"x","d":"xx"}"#),
            v(r#"{"a":"b"}"#),
            v(r#"{"b":1}"#),
            v(r#"{"d":"x"}"#),
            v(r#"{"e":"c"}"#),
        ],
    );
    round_trip(
        obj([
            ("a", Spec::from(any())),
            ("b", Spec::from(required(any()))),
            ("c", Spec::from(never(any()))),
            ("d", Spec::from(Token::Date)),
            ("e", Spec::from(optional(Token::Date))),
            ("f", Spec::from(func(any()))),
            ("g", Spec::from(Token::Function)),
        ]),
        r#"{"a":"Any","b":"Required","c":"Never","d":"Date","e":"Optional(Date)","f":"Optional(Function)","g":"Function"}"#,
        &[v(r#"{"c":1}"#), v("{}")],
    );
    round_trip(
        obj([
            ("a", Spec::from(open(obj::<&str, Spec>([])))),
            ("b", Spec::from(expr("Any(3)").unwrap())),
            ("e", Spec::from(skip(never(any())))),
        ]),
        r#"{"a":{},"b":"Any(3)","e":"Never.Skip"}"#,
        &[v(r#"{"a":{"z":1}}"#), v("{}")],
    );
    round_trip(
        obj([
            ("a", Spec::from(expr("NaN").unwrap())),
            ("b", Spec::from(required(expr("NaN").unwrap()))),
            ("c", Spec::from(min(2, expr("NaN").unwrap()))),
            ("d", Spec::from(expr("Skip(null)").unwrap())),
            ("e", Spec::from(expr("Required(null)").unwrap())),
        ]),
        r#"{"a":"NaN","b":"Required(NaN)","c":"Optional(NaN).Min(2)","d":"Skip(null)","e":"Required(null)"}"#,
        &[v(r#"{"e":null}"#), v("{}"), v(r#"{"d":1}"#)],
    );
}

#[test]
fn checks() {
    let re = |s: &str| regex::Regex::new(s).unwrap();
    round_trip(
        obj([
            ("a", catch(0, min(2, Token::Number))),
            ("b", ignore(min(2, Token::String))),
            ("c", catch("x", re("^a"))),
        ]),
        r#"{"a: Number.Min(2).Catch(0)":0,"b: String.Min(2).Ignore":"","c":"Catch(\"x\",/^a/)"}"#,
        &[v(r#"{"a":1,"b":"a","c":"b"}"#), v(r#"{"a":"x"}"#), v("{}")],
    );
    round_trip(
        obj([
            ("a", define("d", Token::String)),
            ("b", refer("d", any())),
            ("c", rename("z", Token::String)),
            ("d", rename("z", Token::Number)),
        ]),
        r#"{"a: String.Define(\"d\")":"","b":"Any.Refer(\"d\")","c: String.Rename(\"z\")":"","d: Number.Rename(\"z\")":0}"#,
        &[v(r#"{"a":"x","b":"y","c":"q","d":1}"#), v(r#"{"a":"x","b":1}"#)],
    );
    round_trip(
        obj([
            ("a", key()),
            ("b", key_join(2, "/")),
            ("c", key_depth(1)),
            ("d", required(key())),
            ("e", key().min(1)),
        ]),
        r#"{"a":"Key","b":"Key(2,\"/\")","c":"Key(1)","d":"Key.Required","e":"Key.Min(1)"}"#,
        &[v(r#"{"a":"x"}"#), v("{}")],
    );
}

#[test]
fn names() {
    round_trip(
        obj([
            ("a b", Spec::from(1)),
            ("c d", Spec::from(Token::String)),
            ("\"q\"", Spec::from(2)),
            ("", Spec::from(3)),
            ("e:", Spec::from(4)),
            (" f", Spec::from(Token::Number)),
        ]),
        r#"{"a b":1,"\"c d\": String":"","\"q\"":2,"":3,"e:":4,"\" f\": Number":0}"#,
        &[
            v(r#"{"a b":2,"c d":"x","\"q\"":3,"":4,"e:":5," f":1}"#),
            v(r#"{"c d":1}"#),
        ],
    );
    let opts = Options {
        key_expr: false,
        ..Default::default()
    };
    let s = Schema::with_options(obj([("a: b", 1)]), &opts);
    assert_eq!(json_of(&s), r#"{"\"a: b\": Optional":1}"#);
}

#[test]
fn refusals() {
    let re = |s: &str| regex::Regex::new(s).unwrap();
    cannot(obj([("a", check(|_s, _u| true, any()))]), "cannot express a check function");
    cannot(obj([("a", any().check(|_s, _u| true))]), "cannot express a check function");
    cannot(
        obj([("a", any().before(|_s, _u| true))]),
        "cannot express a custom check Before",
    );
    cannot(
        obj([("a", exact([Value::Func(1)]))]),
        "cannot express the Exact value function",
    );
    cannot(
        obj([("a", exact([Value::BigInt(num_bigint::BigInt::from(1))]))]),
        "cannot express the Exact value bigint",
    );
    cannot(
        obj([("a", any().transform(|v, _s| v))]),
        "cannot express Transform",
    );
    cannot(
        obj([("a", catch(0, any().transform(|v, _s| v)))]),
        "cannot express Transform",
    );
    cannot(
        obj([(
            "a",
            rename_with("b", RenameOptions { keep: true, ..Default::default() }, Token::Number),
        )]),
        "cannot express the options of Rename",
    );
    cannot(
        obj([(
            "a",
            refer_with("d", ReferOptions { fill: true, strict: false }, any()),
        )]),
        "cannot express the options of Refer",
    );
    cannot(
        obj([(
            "a",
            refer_with("d", ReferOptions { fill: false, strict: true }, any()),
        )]),
        "cannot express the options of Refer",
    );
    cannot(
        obj([("a", catch(Value::Obj(Default::default()), Token::Number))]),
        "cannot express the fallback object",
    );
    cannot(
        obj([("a", catch(Value::Undefined, Token::Number))]),
        "cannot express the fallback undefined",
    );
    cannot(
        obj([("a", default(Value::from(v(r#"{"q":1}"#)), any()))]),
        "cannot express an object default",
    );
    cannot(
        obj([("a", default(Value::from(vec![Value::from(1)]), child(Token::Number, any())))]),
        "cannot express an object default",
    );
    cannot(
        obj([("a", default(Value::from(vec![Value::from(1)]), arr([Token::Number])))]),
        "cannot express an array default",
    );
    cannot(obj([("a", Spec::Value(Value::Date(0)))]), "cannot express a date default");
    cannot(
        obj([("a", Spec::Value(Value::Func(1)))]),
        "cannot express a function default",
    );
    cannot(
        obj([("a", Spec::Value(Value::BigInt(num_bigint::BigInt::from(1))))]),
        "cannot express a bigint value",
    );
    cannot(obj([("$$", 1)]), r#"cannot express the property name "$$""#);
    cannot(
        obj([("a", child(Token::Number, any()).exact([1]))]),
        "cannot express Exact on an object",
    );
    cannot(
        obj([("a", rest(Token::Number, arr::<Spec>([])).exact([1]))]),
        "cannot express Exact on an array",
    );
    cannot(
        obj([("a", exact([Value::Undefined]))]),
        "cannot express the Exact value undefined",
    );
    cannot(
        obj([("a", exact([Value::Obj(Default::default())]))]),
        "cannot express the Exact value object",
    );
    cannot(
        obj([("a", exact([Value::Num(f64::INFINITY)]))]),
        "cannot express the Exact value Infinity",
    );
    cannot(
        obj([("a", check_re(re("^a"), any()).check(|_s, _u| true))]),
        "cannot express a check function",
    );
    cannot(
        obj([("a", any().after(|_s, _u| true))]),
        "cannot express a custom after check",
    );
    let opts = Options {
        key_expr: false,
        ..Default::default()
    };
    let s = Schema::with_options(obj([("a: b", one([1, 2]))]), &opts);
    assert!(s
        .json()
        .expect_err("no key form")
        .to_string()
        .contains(r#"property name "a: b" of a value with no key form"#));
}

#[test]
fn reader() {
    let b = |src: &str| Schema::new(build(&Value::from(v(src))).unwrap_or_else(|e| panic!("{}: {}", src, e)));
    let ok = |s: &Schema, input: &str| s.validate(Value::from(v(input))).unwrap_or_else(|e| panic!("{}", e));
    let bad = |s: &Schema, input: &str, want: &str| {
        let e = s.validate(Value::from(v(input))).expect_err("expected an error");
        assert!(e.to_string().contains(want), "want {:?}, got {:?}", want, e.to_string());
    };
    // The key form keeps the kind the chain names; the example is the
    // default alone.
    bad(&b(r#"{"a: String":""}"#), r#"{"a":""}"#, "empty string is not allowed");
    bad(&b(r#"{"a: Integer.Min(2)":0}"#), r#"{"a":2.5}"#, "not of type integer");
    assert_eq!(
        serde_json::Value::from(ok(&b(r#"{"a: Number.Optional":5}"#), "{}")),
        v(r#"{"a":5}"#)
    );
    assert_eq!(
        serde_json::Value::from(ok(&b(r#"{"a: String.Optional":"x"}"#), "{}")),
        v(r#"{"a":"x"}"#)
    );
    assert_eq!(
        serde_json::Value::from(ok(&b(r#"{"a: String.Skip":""}"#), "{}")),
        v("{}")
    );
    bad(&b(r#"{"a: String.Skip":""}"#), r#"{"a":""}"#, "empty string is not allowed");
    ok(&b(r#"{"a: Skip":""}"#), r#"{"a":""}"#);
    // The kind of a chain that names none is the example's.
    bad(&b(r#"{"a: Min(2)":0}"#), r#"{"a":"x"}"#, "not of type number");
    ok(&b(r#"{"a: Child(Number)":[]}"#), r#"{"a":[1]}"#);
    ok(&b(r#"{"a: Object":{"b":"String"}}"#), r#"{"a":{"b":"x"}}"#);
    bad(&b(r#"{"a: Object":{"b":"String"}}"#), r#"{"a":{"b":"x","z":1}}"#, r#""z" is not allowed"#);
    ok(&b(r#"{"a: Array":["String"]}"#), r#"{"a":["x"]}"#);
    // A fraction is one token.
    ok(&Schema::new(expr("Min(1.5)").unwrap()), "1.6");
    bad(&Schema::new(expr("Min(1.5)").unwrap()), "1.4", "minimum of 1.5");
    ok(&Schema::new(expr("Max(-2.5e1)").unwrap()), "-30");
    assert_eq!(
        serde_json::Value::from(Schema::new(expr("Optional(1.5)").unwrap()).validate(Value::Undefined).unwrap()),
        v("1.5")
    );
    // Len holds to whole numbers, as it does in every language.
    assert!(expr("Len(1.5)").is_err());
    // Marks are read where they are, so a branch has its own.
    assert_eq!(
        serde_json::Value::from(ok(
            &b(r#"{"$$":"One($$0,String)","$$0":{"a":1,"$$":"Open"}}"#),
            r#"{"z":1}"#
        )),
        v(r#"{"a":1,"z":1}"#)
    );
    ok(&b(r#"{"$$":"Min(2,$$0).Skip","$$0":["String"]}"#), r#"["a","b"]"#);
    bad(&b(r#"{"$$":"Min(2,$$0).Skip","$$0":["String"]}"#), r#"["a"]"#, "minimum length of 2");
    assert_eq!(
        json_of(&b(r#"{"$$":"Min(2,$$0).Skip","$$0":["String"]}"#)),
        r#"{"$$":"Skip($$0).Min(2)","$$0":["String"]}"#
    );
    // A sidecar in head position, and one chained onto.
    ok(&b(r#"{"$$":"$$0","$$0":["String"]}"#), r#"["a"]"#);
    ok(&b(r#"{"$$":"Open.$$0","$$0":{"a":1}}"#), r#"{"a":2}"#);
    // The mark value that is not an expression is left alone.
    ok(&b(r#"{"a":1,"$$":2}"#), r#"{"a":3,"$$":4}"#);
    // A mark that does not parse is a build error.
    for src in [
        r#"{"$$":"keep-me"}"#,
        r#"{"$$":"Min("}"#,
        r#"{"$$":"Min(2,$$0).Bogus","$$0":[]}"#,
        r#"{"$$":"Discriminated(1,$$0)","$$0":{}}"#,
        r#"{"$$":"Discriminated(\"k\")"}"#,
        r#"{"$$":"Discriminated(\"k\",\"x\")"}"#,
        r#"{"a":["("]}"#,
        r#"{"a: Open":{"b":"("}}"#,
    ] {
        assert!(build(&Value::from(v(src))).is_err(), "{} should not build", src);
    }
}

/// Every corpus spec round trips, but for the few that say what the
/// expression form cannot.
#[test]
fn corpus() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test");
    let mut files: Vec<_> = fs::read_dir(&dir)
        .expect("test dir")
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == "tsv").unwrap_or(false))
        .collect();
    files.sort();
    let mut count = 0usize;
    let mut refused = 0usize;
    for path in files {
        let text = fs::read_to_string(&path).unwrap();
        let mut lines = text.lines();
        let headers: Vec<&str> = lines.next().expect("header").split('\t').collect();
        let si = headers.iter().position(|x| *x == "spec").unwrap();
        let ii = headers.iter().position(|x| *x == "input").unwrap();
        let ni = headers.iter().position(|x| *x == "name").unwrap();
        for line in lines {
            if line.trim().is_empty() {
                continue;
            }
            let cols: Vec<&str> = line.split('\t').collect();
            let name = cols[ni];
            let spec_json: serde_json::Value = serde_json::from_str(cols[si].trim()).unwrap();
            let input: serde_json::Value = serde_json::from_str(cols[ii].trim()).unwrap();
            let Ok(spec) = decode_spec(&spec_json) else {
                continue;
            };
            let s = Schema::new(spec);
            let json = match s.json() {
                Ok(j) => j,
                Err(e) => {
                    let msg = e.to_string();
                    assert!(
                        msg.contains("the options of Refer") || msg.contains("an object default"),
                        "{}: {}",
                        name,
                        msg
                    );
                    refused += 1;
                    continue;
                }
            };
            let text = serde_json::Value::from(json).to_string();
            let parsed: serde_json::Value = serde_json::from_str(&text).unwrap();
            let b = Schema::new(
                build(&Value::from(parsed)).unwrap_or_else(|e| panic!("{}: build {}: {}", name, text, e)),
            );
            let back = serde_json::Value::from(b.json().unwrap_or_else(|e| panic!("{}: {}", name, e)))
                .to_string();
            assert_eq!(back, text, "{}: not a fixed point", name);
            agree(&s, &b, &input);
            count += 1;
        }
    }
    assert!(count > 300, "only {} rows", count);
    assert!(refused <= 8, "{} refusals", refused);
}

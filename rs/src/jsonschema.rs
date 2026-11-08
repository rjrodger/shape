//! JSON Schema export (draft 2020-12): the values a node accepts. Every
//! kind, bound, format, literal set, composition, reference and default has
//! a rendering; a check that is a function, and the builders that only
//! change what comes out (Coerce, Catch, Transform, Rename, Key), have
//! none. The canonical implementation renders the same schema for the same
//! shape, and the differential harness compares the two.

use crate::builders::bound_arg;
use crate::node::{Kind, ListMode, Node, Validator};
use crate::value::{Map, Value};

pub const JSON_SCHEMA_DRAFT: &str = "https://json-schema.org/draft/2020-12/schema";

/// Render a node as a JSON Schema document.
pub fn json_schema(n: &Node) -> Value {
    let mut defs = Map::new();
    let body = node_schema(n, &mut defs);
    let mut out = Map::new();
    out.insert("$schema".to_string(), Value::from(JSON_SCHEMA_DRAFT));
    for (k, v) in body {
        out.insert(k, v);
    }
    if !defs.is_empty() {
        out.insert("$defs".to_string(), Value::Obj(defs));
    }
    Value::Obj(out)
}

fn type_name(k: Kind) -> Option<&'static str> {
    Some(match k {
        Kind::String | Kind::Date | Kind::Regexp => "string",
        Kind::Number | Kind::NaN => "number",
        Kind::Integer => "integer",
        Kind::Boolean => "boolean",
        Kind::Null => "null",
        Kind::Object => "object",
        Kind::Array => "array",
        _ => return None,
    })
}

fn format_name(builder: &str) -> Option<&'static str> {
    Some(match builder {
        "Email" => "email",
        "Url" => "uri",
        "Uuid" => "uuid",
        "DateTime" => "date-time",
        "Ipv4" => "ipv4",
        "Ipv6" => "ipv6",
        _ => return None,
    })
}

fn node_schema(n: &Node, defs: &mut Map) -> Map {
    let mut s = Map::new();

    // A reference stands for the named shape, which is rendered where it
    // is defined.
    if let Some(name) = &n.refer_name {
        s.insert("$ref".to_string(), Value::from(format!("#/$defs/{}", name)));
        describe_schema(n, &mut s);
        return s;
    }

    if let Some(t) = type_name(n.kind) {
        s.insert("type".to_string(), Value::from(t));
    }

    match n.kind {
        Kind::String => {
            if !n.empty {
                s.insert("minLength".to_string(), Value::from(1));
            }
        }
        Kind::Date => {
            s.insert("format".to_string(), Value::from("date-time"));
        }
        Kind::Regexp => {
            s.insert("pattern".to_string(), Value::from(n.regexp_src.as_str()));
        }
        Kind::Never => {
            s.insert("not".to_string(), Value::Obj(Map::new()));
        }
        Kind::Object => object_schema(n, &mut s, defs),
        Kind::Array => array_schema(n, &mut s, defs),
        Kind::List => list_schema(n, &mut s, defs),
        _ => {}
    }

    check_schema(n, &mut s);

    if n.nullable {
        if let Some(t) = s.get("type").cloned() {
            s.insert("type".to_string(), Value::Arr(vec![t, Value::from("null")]));
        }
    }

    // A default the shape injects. An undefined one is the zero of a kind
    // that has none (Any, Date); a null is a default as any value is, as
    // Default(null, Number) injects it.
    let d = &n.default;
    let carries = !n.required
        && !n.skippable
        && n.has_default
        && !d.is_undefined()
        && !matches!(d, Value::Func(_))
        && !matches!(d, Value::Num(f) if f.is_nan());
    if carries {
        s.insert("default".to_string(), d.clone());
    }

    describe_schema(n, &mut s);

    if let Some(name) = &n.define_name {
        defs.insert(name.clone(), Value::Obj(s.clone()));
    }
    s
}

fn describe_schema(n: &Node, s: &mut Map) {
    if let Some(Value::Str(d)) = n.meta.get("description") {
        s.insert("description".to_string(), Value::Str(d.clone()));
    }
}

/// A child shape of Any says nothing, unless it stands for a reference.
fn is_any_schema(child: &Node) -> bool {
    child.kind == Kind::Any && child.refer_name.is_none()
}

fn object_schema(n: &Node, s: &mut Map, defs: &mut Map) {
    let mut props = Map::new();
    let mut required: Vec<String> = Vec::new();
    for (k, cn) in &n.obj_children {
        props.insert(k.clone(), Value::Obj(node_schema(cn, defs)));
        if cn.required {
            required.push(k.clone());
        }
    }
    if !props.is_empty() {
        s.insert("properties".to_string(), Value::Obj(props));
    }
    if !required.is_empty() {
        required.sort();
        s.insert(
            "required".to_string(),
            Value::Arr(required.into_iter().map(Value::Str).collect()),
        );
    }
    match &n.obj_rest {
        None => {
            s.insert("additionalProperties".to_string(), Value::Bool(false));
        }
        Some(rest) if !is_any_schema(rest) => {
            s.insert(
                "additionalProperties".to_string(),
                Value::Obj(node_schema(rest, defs)),
            );
        }
        Some(_) => {}
    }
}

fn array_schema(n: &Node, s: &mut Map, defs: &mut Map) {
    // A tail past the tuple, or every element: one child slot serves both,
    // so Rest replaces the repeating shape. An element shape of Any says
    // nothing; nothing may follow a closed tuple.
    let child = n.arr_rest.as_deref().or(n.arr_child.as_deref());
    let closed = child.is_none();
    let child = child.filter(|c| !is_any_schema(c));
    if !n.arr_children.is_empty() {
        let fixed: Vec<Value> = n
            .arr_children
            .iter()
            .map(|cn| Value::Obj(node_schema(cn, defs)))
            .collect();
        s.insert("prefixItems".to_string(), Value::Arr(fixed));
        if closed {
            s.insert("items".to_string(), Value::Bool(false));
        } else if let Some(c) = child {
            s.insert("items".to_string(), Value::Obj(node_schema(c, defs)));
        }
    } else if let Some(c) = child {
        s.insert("items".to_string(), Value::Obj(node_schema(c, defs)));
    }
}

fn list_schema(n: &Node, s: &mut Map, defs: &mut Map) {
    let mut branches: Vec<Value> = n
        .list
        .iter()
        .map(|bn| Value::Obj(node_schema(bn, defs)))
        .collect();
    if let Some(d) = &n.disc {
        for (i, b) in branches.iter_mut().enumerate() {
            let Value::Obj(bs) = b else { continue };
            // An object branch carries the tag as a key; any other branch
            // gets the tag as its only property.
            let mut props = match bs.shift_remove("properties") {
                Some(Value::Obj(p)) => p,
                _ => Map::new(),
            };
            let mut tag_schema = Map::new();
            tag_schema.insert("type".to_string(), Value::from("string"));
            tag_schema.insert("const".to_string(), Value::from(d.tags[i].as_str()));
            props.insert(d.tag.clone(), Value::Obj(tag_schema));
            bs.insert("properties".to_string(), Value::Obj(props));
            let mut required = vec![d.tag.clone()];
            if let Some(Value::Arr(have)) = bs.get("required") {
                for k in have.iter().filter_map(|k| k.as_str()) {
                    if k != d.tag {
                        required.push(k.to_string());
                    }
                }
            }
            required.sort();
            bs.insert(
                "required".to_string(),
                Value::Arr(required.into_iter().map(Value::Str).collect()),
            );
        }
        s.insert("oneOf".to_string(), Value::Arr(branches));
        return;
    }
    match n.list_mode {
        ListMode::Nof => nof_schema(&n.nof_ok, branches, s),
        _ => {
            s.insert("allOf".to_string(), Value::Arr(branches));
        }
    }
}

/// A count of the shapes, as the keywords that count: none of them is not,
/// exactly one oneOf, every one allOf. JSON Schema has no keyword for any
/// other count, so it is bounded by what it rules out: anyOf when the count
/// is never none, not allOf when it is never every one. That bound is exact
/// for at least one, not every one, and both together.
fn nof_schema(ok: &[bool], branches: Vec<Value>, s: &mut Map) {
    let n = branches.len();
    let only = |c: usize| ok.iter().enumerate().all(|(i, v)| *v == (i == c));
    let keyed = |k: &str, v: Vec<Value>| {
        let mut m = Map::new();
        m.insert(k.to_string(), Value::Arr(v));
        Value::Obj(m)
    };
    let admits = ok.iter().filter(|v| **v).count();
    if admits == ok.len() {
        return;
    }
    if admits == 0 {
        s.insert("not".to_string(), Value::Obj(Map::new()));
    } else if only(0) {
        let not = if n == 1 {
            branches[0].clone()
        } else {
            keyed("anyOf", branches)
        };
        s.insert("not".to_string(), not);
    } else if only(1) {
        s.insert("oneOf".to_string(), Value::Arr(branches));
    } else if only(n) {
        s.insert("allOf".to_string(), Value::Arr(branches));
    } else {
        if !ok[0] {
            s.insert("anyOf".to_string(), Value::Arr(branches.clone()));
        }
        if !ok[n] {
            s.insert("not".to_string(), keyed("allOf", branches));
        }
    }
}

/// The bounds a size builder puts on a value: the number family for a
/// number, a length family for a string, array or object, and every family
/// for a node that has not said.
fn size_families(k: Kind) -> &'static [&'static str] {
    match k {
        Kind::Number | Kind::NaN | Kind::Integer => &["minimum"],
        Kind::String => &["minLength"],
        Kind::Array => &["minItems"],
        Kind::Object => &["minProperties"],
        _ => &["minimum", "minLength", "minItems", "minProperties"],
    }
}

fn size_max(lo: &str) -> &'static str {
    match lo {
        "minimum" => "maximum",
        "minLength" => "maxLength",
        "minItems" => "maxItems",
        _ => "maxProperties",
    }
}

fn check_schema(n: &Node, s: &mut Map) {
    let families = size_families(n.kind);
    let mut vs: Vec<&Validator> = n.befores.iter().chain(n.afters.iter()).collect();
    let mut i = 0;
    while i < vs.len() {
        let v = vs[i];
        i += 1;
        // Catch and Transform take the node's checks inside.
        if let Some(inner) = &v.inner {
            vs.extend(inner.befores.iter().chain(inner.afters.iter()));
            continue;
        }
        match v.name.as_str() {
            "Exact" => {
                s.insert("enum".to_string(), Value::Arr(v.args.clone()));
            }
            "Ip" => {
                let fmt = |f: &str| {
                    let mut m = Map::new();
                    m.insert("format".to_string(), Value::from(f));
                    Value::Obj(m)
                };
                s.insert(
                    "anyOf".to_string(),
                    Value::Arr(vec![fmt("ipv4"), fmt("ipv6")]),
                );
            }
            "Min" | "Max" | "Above" | "Below" | "Len" => {
                let size = v.args.first().and_then(bound_arg).unwrap_or(0.0);
                for lo in families {
                    let hi = size_max(lo);
                    let numeric = *lo == "minimum";
                    match v.name.as_str() {
                        "Min" => {
                            s.insert(lo.to_string(), Value::Num(size));
                        }
                        "Max" => {
                            s.insert(hi.to_string(), Value::Num(size));
                        }
                        "Above" => {
                            if numeric {
                                s.insert("exclusiveMinimum".to_string(), Value::Num(size));
                            } else {
                                s.insert(lo.to_string(), Value::Num(size + 1.0));
                            }
                        }
                        "Below" => {
                            if numeric {
                                s.insert("exclusiveMaximum".to_string(), Value::Num(size));
                            } else {
                                s.insert(hi.to_string(), Value::Num(size - 1.0));
                            }
                        }
                        _ => {
                            s.insert(lo.to_string(), Value::Num(size));
                            s.insert(hi.to_string(), Value::Num(size));
                        }
                    }
                }
            }
            name => {
                if let Some(f) = format_name(name) {
                    s.insert("format".to_string(), Value::from(f));
                } else if name.len() >= 2 && name.starts_with('/') && name.ends_with('/') {
                    s.insert("pattern".to_string(), Value::from(&name[1..name.len() - 1]));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::builders::*;
    use crate::discriminated::Discriminated;
    use crate::node::Token;
    use crate::spec::{arr, obj, Spec};
    use crate::Schema;
    use regex::Regex;
    use serde_json::json;

    fn js(spec: impl Into<Spec>) -> serde_json::Value {
        let mut v = serde_json::Value::from(Schema::new(spec).json_schema());
        v.as_object_mut().unwrap().remove("$schema");
        v
    }

    #[test]
    fn renders_a_count_as_the_keywords_that_count() {
        let three = || {
            [
                Spec::from(Token::String),
                Spec::from(Token::Number),
                Spec::from(Token::Boolean),
            ]
        };
        let two = || [Spec::from(Token::String), Spec::from(Token::Number)];
        let str_ = json!({"type": "string", "minLength": 1});
        let num = json!({"type": "number"});
        let all3 = json!([str_, num, {"type": "boolean"}]);
        assert_eq!(js(Nof(1, two())), json!({"oneOf": [str_, num]}));
        assert_eq!(
            js(Nof(0, [Spec::from(Token::String)])),
            json!({"not": str_})
        );
        assert_eq!(js(Nof(0, two())), json!({"not": {"anyOf": [str_, num]}}));
        assert_eq!(js(Nof(2, two())), json!({"allOf": [str_, num]}));
        assert_eq!(js(Nof(Min(1, Any()), three())), json!({"anyOf": all3}));
        assert_eq!(
            js(Nof(Max(2, Any()), three())),
            json!({"not": {"allOf": all3}})
        );
        assert_eq!(
            js(Nof(Max(2, Min(1, Any())), three())),
            json!({"anyOf": all3, "not": {"allOf": all3}})
        );
        // Any other count is bounded by what it rules out, or says nothing.
        assert_eq!(js(Nof(Min(2, Any()), three())), json!({"anyOf": all3}));
        assert_eq!(js(Nof(Exact([0, 3]), three())), json!({}));
        // No count admitted, every count admitted, and no shapes at all.
        assert_eq!(
            js(Nof(Max(0, Min(1, Any())), [Spec::from(Token::String)])),
            json!({"not": {}})
        );
        assert_eq!(
            js(Nof(Min(0, Any()), [Spec::from(Token::String)])),
            json!({})
        );
        assert_eq!(js(Nof(0, Vec::<Spec>::new())), json!({}));
        assert_eq!(js(Nof(1, Vec::<Spec>::new())), json!({"not": {}}));
    }

    #[test]
    fn renders_kinds_and_containers() {
        assert_eq!(
            serde_json::Value::from(Schema::new(Token::String).json_schema()),
            json!({"$schema": JSON_SCHEMA_DRAFT, "type": "string", "minLength": 1})
        );
        assert_eq!(js(Empty(Token::String)), json!({"type": "string"}));
        assert_eq!(
            js("x"),
            json!({"type": "string", "minLength": 1, "default": "x"})
        );
        assert_eq!(
            js(Token::Date),
            json!({"type": "string", "format": "date-time"})
        );
        assert_eq!(
            js(Regex::new("^a").unwrap()),
            json!({"type": "string", "pattern": "^a"})
        );
        assert_eq!(js(Never(Any())), json!({"not": {}}));
        assert_eq!(js(Token::Any), json!({}));
        assert_eq!(js(Token::Integer), json!({"type": "integer"}));
        assert_eq!(js(f64::NAN), json!({"type": "number"}));
        assert_eq!(
            js(Spec::Value(Value::Null)),
            json!({"type": "null", "default": null})
        );
        assert_eq!(js(Spec::Value(Value::Func(1))), json!({}));
        assert_eq!(js(Token::Function), json!({}));
        assert_eq!(
            js(Nullable(Token::Number)),
            json!({"type": ["number", "null"]})
        );
        assert_eq!(js(Nullable(Any())), json!({}));
        assert_eq!(
            js(Describe("d", Token::Boolean)),
            json!({"type": "boolean", "description": "d"})
        );
        assert_eq!(
            js(obj([
                ("a", Spec::from(Token::Number)),
                ("b", Spec::from(1))
            ])),
            json!({"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number", "default": 1}}, "required": ["a"], "additionalProperties": false})
        );
        assert_eq!(js(Token::Object), json!({"type": "object"}));
        assert_eq!(
            js(Optional(Token::Object)),
            json!({"type": "object", "default": {}})
        );
        assert_eq!(
            js(Child(Token::Number, Token::Object)),
            json!({"type": "object", "additionalProperties": {"type": "number"}})
        );
        assert_eq!(js(Token::Array), json!({"type": "array"}));
        assert_eq!(
            js(arr([Spec::from(Token::Number)])),
            json!({"type": "array", "items": {"type": "number"}})
        );
        assert_eq!(
            js(arr([Spec::from(Token::Number), Spec::from("x")])),
            json!({"type": "array", "prefixItems": [{"type": "number"}, {"type": "string", "minLength": 1, "default": "x"}], "items": false})
        );
        assert_eq!(
            js(Rest(
                Token::String,
                arr([Spec::from(Token::Number), Spec::from(1)])
            )),
            json!({"type": "array", "prefixItems": [{"type": "number"}, {"type": "number", "default": 1}], "items": {"type": "string", "minLength": 1}})
        );
        assert_eq!(
            js(Rest(
                Token::Any,
                arr([Spec::from(Token::Number), Spec::from(1)])
            )),
            json!({"type": "array", "prefixItems": [{"type": "number"}, {"type": "number", "default": 1}]})
        );
        assert_eq!(js(arr(Vec::<Spec>::new())), json!({"type": "array"}));
    }

    #[test]
    fn renders_checks_and_compositions() {
        assert_eq!(js(Exact(["a", "b"])), json!({"enum": ["a", "b"]}));
        assert_eq!(
            js(Email(Any())),
            json!({"type": "string", "minLength": 1, "format": "email"})
        );
        assert_eq!(
            js(Url(Any())),
            json!({"type": "string", "minLength": 1, "format": "uri"})
        );
        assert_eq!(
            js(Uuid(Any())),
            json!({"type": "string", "minLength": 1, "format": "uuid"})
        );
        assert_eq!(
            js(DateTime(Any())),
            json!({"type": "string", "minLength": 1, "format": "date-time"})
        );
        assert_eq!(
            js(Ipv4(Any())),
            json!({"type": "string", "minLength": 1, "format": "ipv4"})
        );
        assert_eq!(
            js(Ipv6(Any())),
            json!({"type": "string", "minLength": 1, "format": "ipv6"})
        );
        assert_eq!(
            js(Ip(Any())),
            json!({"type": "string", "minLength": 1, "anyOf": [{"format": "ipv4"}, {"format": "ipv6"}]})
        );
        assert_eq!(
            js(Min(2, Token::Number)),
            json!({"type": "number", "minimum": 2})
        );
        assert_eq!(
            js(Max(2, Token::Integer)),
            json!({"type": "integer", "maximum": 2})
        );
        assert_eq!(
            js(Above(2, Token::Number)),
            json!({"type": "number", "exclusiveMinimum": 2})
        );
        assert_eq!(
            js(Below(2, Token::Number)),
            json!({"type": "number", "exclusiveMaximum": 2})
        );
        assert_eq!(
            js(Len(2, Token::Number)),
            json!({"type": "number", "minimum": 2, "maximum": 2})
        );
        assert_eq!(
            js(Above(2, Token::String)),
            json!({"type": "string", "minLength": 3})
        );
        assert_eq!(
            js(Below(2, Token::String)),
            json!({"type": "string", "minLength": 1, "maxLength": 1})
        );
        assert_eq!(
            js(Min(2, Token::Array)),
            json!({"type": "array", "minItems": 2})
        );
        assert_eq!(
            js(Max(2, Token::Object)),
            json!({"type": "object", "maxProperties": 2})
        );
        assert_eq!(
            js(Min(2, Any())),
            json!({"minimum": 2, "minLength": 2, "minItems": 2, "minProperties": 2})
        );
        assert_eq!(
            js(Len(2, Any())),
            json!({"minimum": 2, "maximum": 2, "minLength": 2, "maxLength": 2, "minItems": 2, "maxItems": 2, "minProperties": 2, "maxProperties": 2})
        );
        assert_eq!(
            js(Above(2, Any())),
            json!({"exclusiveMinimum": 2, "minLength": 3, "minItems": 3, "minProperties": 3})
        );
        assert_eq!(
            js(Below(2, Any())),
            json!({"exclusiveMaximum": 2, "maxLength": 1, "maxItems": 1, "maxProperties": 1})
        );
        assert_eq!(
            js(CheckRe(Regex::new("^a").unwrap(), Token::String)),
            json!({"type": "string", "minLength": 1, "pattern": "^a"})
        );
        assert_eq!(
            js(Check(|_, _| true, Token::String)),
            json!({"type": "string", "minLength": 1})
        );
        assert_eq!(
            js(Catch(0, Min(2, Token::Number))),
            json!({"type": "number", "minimum": 2})
        );
        assert_eq!(
            js(Coerce(Transform(|v, _| v, Max(2, Token::Number)))),
            json!({"type": "number", "maximum": 2})
        );
        assert_eq!(
            js(Nof(
                1,
                [Spec::from(Token::String), Spec::from(Token::Number)]
            )),
            json!({"oneOf": [{"type": "string", "minLength": 1}, {"type": "number"}]})
        );
        assert_eq!(
            js(All([Spec::from(Token::Number), Spec::from(Min(1, Any()))])),
            json!({"allOf": [{"type": "number"}, {"minimum": 1, "minLength": 1, "minItems": 1, "minProperties": 1}]})
        );
        assert_eq!(
            js(Discriminated(
                "k",
                [
                    ("a", obj([("x", Spec::from(Token::Number))])),
                    ("b", Spec::from(Token::Number))
                ]
            )),
            json!({"oneOf": [
                {"type": "object", "properties": {"x": {"type": "number"}, "k": {"type": "string", "const": "a"}}, "required": ["k", "x"], "additionalProperties": false},
                {"type": "number", "properties": {"k": {"type": "string", "const": "b"}}, "required": ["k"]}
            ]})
        );
        assert_eq!(
            js(obj([
                ("a", Spec::from(Define("d", Token::Number))),
                ("b", Spec::from(Refer("d", Any())))
            ])),
            json!({"type": "object", "properties": {"a": {"type": "number"}, "b": {"$ref": "#/$defs/d"}}, "required": ["a"], "additionalProperties": false, "$defs": {"d": {"type": "number"}}})
        );
        assert_eq!(
            js(Describe("r", Refer("d", Any()))),
            json!({"$ref": "#/$defs/d", "description": "r"})
        );
        assert_eq!(
            js(Child(Refer("d", Any()), Token::Object)),
            json!({"type": "object", "additionalProperties": {"$ref": "#/$defs/d"}})
        );
        assert_eq!(
            js(arr([Spec::from(Refer("d", Any()))])),
            json!({"type": "array", "items": {"$ref": "#/$defs/d"}})
        );
        assert_eq!(js(Skip(Token::Number)), json!({"type": "number"}));
        // A branch that declares the tag itself lists it once.
        assert_eq!(
            js(Discriminated(
                "k",
                [("a", obj([("k", Spec::from(Token::String))]))]
            )),
            json!({"oneOf": [{"type": "object", "properties": {"k": {"type": "string", "const": "a"}}, "required": ["k"], "additionalProperties": false}]})
        );
        assert_eq!(
            js(Optional(Token::Date)),
            json!({"type": "string", "format": "date-time"})
        );
        assert_eq!(
            serde_json::Value::from(json_schema(&buildize(Token::Number))),
            json!({"$schema": JSON_SCHEMA_DRAFT, "type": "number"})
        );
    }
}

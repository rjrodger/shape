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
            let src = n.regexp.as_ref().map(|r| r.as_str()).unwrap_or("");
            s.insert("pattern".to_string(), Value::from(src));
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
    // that has none (Any, Date); only the null kind's null is a default.
    let d = &n.default;
    let carries = !n.required
        && !n.skippable
        && n.has_default
        && !d.is_undefined()
        && !matches!(d, Value::Func(_))
        && !matches!(d, Value::Num(f) if f.is_nan())
        && (!d.is_null() || n.kind == Kind::Null);
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
    let key = if n.list_mode == ListMode::All {
        "allOf"
    } else {
        "anyOf"
    };
    s.insert(key.to_string(), Value::Arr(branches));
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
    use crate::discriminated::discriminated;
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
    fn renders_kinds_and_containers() {
        assert_eq!(
            serde_json::Value::from(Schema::new(Token::String).json_schema()),
            json!({"$schema": JSON_SCHEMA_DRAFT, "type": "string", "minLength": 1})
        );
        assert_eq!(js(empty(Token::String)), json!({"type": "string"}));
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
        assert_eq!(js(never(any())), json!({"not": {}}));
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
            js(nullable(Token::Number)),
            json!({"type": ["number", "null"]})
        );
        assert_eq!(js(nullable(any())), json!({}));
        assert_eq!(
            js(describe("d", Token::Boolean)),
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
            js(optional(Token::Object)),
            json!({"type": "object", "default": {}})
        );
        assert_eq!(
            js(child(Token::Number, Token::Object)),
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
            js(rest(
                Token::String,
                arr([Spec::from(Token::Number), Spec::from(1)])
            )),
            json!({"type": "array", "prefixItems": [{"type": "number"}, {"type": "number", "default": 1}], "items": {"type": "string", "minLength": 1}})
        );
        assert_eq!(
            js(rest(
                Token::Any,
                arr([Spec::from(Token::Number), Spec::from(1)])
            )),
            json!({"type": "array", "prefixItems": [{"type": "number"}, {"type": "number", "default": 1}]})
        );
        assert_eq!(js(arr(Vec::<Spec>::new())), json!({"type": "array"}));
    }

    #[test]
    fn renders_checks_and_compositions() {
        assert_eq!(js(exact(["a", "b"])), json!({"enum": ["a", "b"]}));
        assert_eq!(
            js(email(any())),
            json!({"type": "string", "minLength": 1, "format": "email"})
        );
        assert_eq!(
            js(url(any())),
            json!({"type": "string", "minLength": 1, "format": "uri"})
        );
        assert_eq!(
            js(uuid(any())),
            json!({"type": "string", "minLength": 1, "format": "uuid"})
        );
        assert_eq!(
            js(date_time(any())),
            json!({"type": "string", "minLength": 1, "format": "date-time"})
        );
        assert_eq!(
            js(ipv4(any())),
            json!({"type": "string", "minLength": 1, "format": "ipv4"})
        );
        assert_eq!(
            js(ipv6(any())),
            json!({"type": "string", "minLength": 1, "format": "ipv6"})
        );
        assert_eq!(
            js(ip(any())),
            json!({"type": "string", "minLength": 1, "anyOf": [{"format": "ipv4"}, {"format": "ipv6"}]})
        );
        assert_eq!(
            js(min(2, Token::Number)),
            json!({"type": "number", "minimum": 2})
        );
        assert_eq!(
            js(max(2, Token::Integer)),
            json!({"type": "integer", "maximum": 2})
        );
        assert_eq!(
            js(above(2, Token::Number)),
            json!({"type": "number", "exclusiveMinimum": 2})
        );
        assert_eq!(
            js(below(2, Token::Number)),
            json!({"type": "number", "exclusiveMaximum": 2})
        );
        assert_eq!(
            js(len(2, Token::Number)),
            json!({"type": "number", "minimum": 2, "maximum": 2})
        );
        assert_eq!(
            js(above(2, Token::String)),
            json!({"type": "string", "minLength": 3})
        );
        assert_eq!(
            js(below(2, Token::String)),
            json!({"type": "string", "minLength": 1, "maxLength": 1})
        );
        assert_eq!(
            js(min(2, Token::Array)),
            json!({"type": "array", "minItems": 2})
        );
        assert_eq!(
            js(max(2, Token::Object)),
            json!({"type": "object", "maxProperties": 2})
        );
        assert_eq!(
            js(min(2, any())),
            json!({"minimum": 2, "minLength": 2, "minItems": 2, "minProperties": 2})
        );
        assert_eq!(
            js(len(2, any())),
            json!({"minimum": 2, "maximum": 2, "minLength": 2, "maxLength": 2, "minItems": 2, "maxItems": 2, "minProperties": 2, "maxProperties": 2})
        );
        assert_eq!(
            js(above(2, any())),
            json!({"exclusiveMinimum": 2, "minLength": 3, "minItems": 3, "minProperties": 3})
        );
        assert_eq!(
            js(below(2, any())),
            json!({"exclusiveMaximum": 2, "maxLength": 1, "maxItems": 1, "maxProperties": 1})
        );
        assert_eq!(
            js(check_re(Regex::new("^a").unwrap(), Token::String)),
            json!({"type": "string", "minLength": 1, "pattern": "^a"})
        );
        assert_eq!(
            js(check(|_, _| true, Token::String)),
            json!({"type": "string", "minLength": 1})
        );
        assert_eq!(
            js(catch(0, min(2, Token::Number))),
            json!({"type": "number", "minimum": 2})
        );
        assert_eq!(
            js(coerce(transform(|v, _| v, max(2, Token::Number)))),
            json!({"type": "number", "maximum": 2})
        );
        assert_eq!(
            js(one([Spec::from(Token::String), Spec::from(Token::Number)])),
            json!({"anyOf": [{"type": "string", "minLength": 1}, {"type": "number"}]})
        );
        assert_eq!(
            js(all([Spec::from(Token::Number), Spec::from(min(1, any()))])),
            json!({"allOf": [{"type": "number"}, {"minimum": 1, "minLength": 1, "minItems": 1, "minProperties": 1}]})
        );
        assert_eq!(
            js(discriminated(
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
                ("a", Spec::from(define("d", Token::Number))),
                ("b", Spec::from(refer("d", any())))
            ])),
            json!({"type": "object", "properties": {"a": {"type": "number"}, "b": {"$ref": "#/$defs/d"}}, "required": ["a"], "additionalProperties": false, "$defs": {"d": {"type": "number"}}})
        );
        assert_eq!(
            js(describe("r", refer("d", any()))),
            json!({"$ref": "#/$defs/d", "description": "r"})
        );
        assert_eq!(
            js(child(refer("d", any()), Token::Object)),
            json!({"type": "object", "additionalProperties": {"$ref": "#/$defs/d"}})
        );
        assert_eq!(
            js(arr([Spec::from(refer("d", any()))])),
            json!({"type": "array", "items": {"$ref": "#/$defs/d"}})
        );
        assert_eq!(js(skip(Token::Number)), json!({"type": "number"}));
        // A branch that declares the tag itself lists it once.
        assert_eq!(
            js(discriminated(
                "k",
                [("a", obj([("k", Spec::from(Token::String))]))]
            )),
            json!({"oneOf": [{"type": "object", "properties": {"k": {"type": "string", "const": "a"}}, "required": ["k"], "additionalProperties": false}]})
        );
        assert_eq!(
            js(optional(Token::Date)),
            json!({"type": "string", "format": "date-time"})
        );
        assert_eq!(
            serde_json::Value::from(json_schema(&buildize(Token::Number))),
            json!({"$schema": JSON_SCHEMA_DRAFT, "type": "number"})
        );
    }
}

//! A node rendered as the spec text it stands for: type names for required
//! nodes, values for optional ones, the builder chain as a suffix. This is
//! what a composite message names its branches with.

use crate::node::{Kind, ListMode, Node, Validator};
use crate::value::{js_date_string, js_number, json_text, Value};

/// A `Nof`'s count as TypeScript renders it: the whole number, or the shape
/// for it.
pub(crate) fn nof_count_text(n: &Node) -> String {
    match &n.nof_count {
        Some(c) => stringify_node(c, true),
        None => js_number(n.nof_exact),
    }
}

/// Render a node. `inline` is the canonical dequote flag: inside a composite
/// message a string value is written bare, on its own it keeps its quotes.
pub fn stringify_node(n: &Node, inline: bool) -> String {
    match n.kind {
        Kind::String => suffix(type_or_value(n, "String", inline), n),
        Kind::Number => suffix(type_or_value(n, "Number", inline), n),
        Kind::Boolean => suffix(type_or_value(n, "Boolean", inline), n),
        Kind::Integer => suffix(type_or_value(n, "Integer", inline), n),
        Kind::BigInt => suffix(type_or_value(n, "BigInt", inline), n),
        Kind::Date => {
            let base = match n.default {
                Value::Date(ms) if !n.required && n.has_default => {
                    let iso = js_date_string(ms);
                    if inline {
                        iso
                    } else {
                        format!("\"{}\"", iso)
                    }
                }
                _ => "Date".to_string(),
            };
            suffix(base, n)
        }
        Kind::Null => suffix("null".to_string(), n),
        Kind::NaN => "NaN".to_string(),
        Kind::Any => {
            // The Any token carries no default at all: it renders as "Any".
            let base = if n.has_default && !n.default.is_undefined() {
                format!("Any({})", inline_value(&n.default))
            } else {
                "Any".to_string()
            };
            let out = suffix(base.clone(), n);
            // A node with no asserted type exists only to carry its
            // builders, and renders as that chain alone: "Min(2)", not
            // "Any.Min(2)".
            match out.strip_prefix("Any.") {
                Some(rest) if base == "Any" => rest.to_string(),
                _ => out,
            }
        }
        Kind::Never => suffix("Never".to_string(), n),
        Kind::Regexp => match &n.regexp {
            Some(_) => suffix(format!("/{}/", n.regexp_src), n),
            None => suffix("Regexp".to_string(), n),
        },
        Kind::Check => suffix("Check".to_string(), n),
        Kind::Function => suffix("Function".to_string(), n),
        Kind::List => {
            if let Some(d) = &n.disc {
                return suffix(format!("Discriminated({},{})", d.tag, d.tags.join(",")), n);
            }
            let mut parts: Vec<String> = Vec::new();
            let mode = match n.list_mode {
                ListMode::Nof => {
                    // A Nof's count leads its shapes.
                    parts.push(nof_count_text(n));
                    "Nof"
                }
                ListMode::When => "When",
                _ => "All",
            };
            parts.extend(n.list.iter().map(|sn| stringify_node(sn, true)));
            suffix(format!("{}({})", mode, parts.join(",")), n)
        }
        Kind::Array => {
            let mut parts: Vec<String> = Vec::new();
            if !n.arr_children.is_empty() {
                parts.extend(n.arr_children.iter().map(|sn| stringify_node(sn, true)));
            } else if let Some(c) = &n.arr_child {
                parts.push(stringify_node(c, true));
            }
            if let Some(r) = &n.arr_rest {
                parts.push(format!("...{}", stringify_node(r, true)));
            }
            // The checks of its items are left out, as TypeScript renders
            // an array as its spec alone.
            suffix_where(format!("[{}]", parts.join(", ")), n, |v| {
                v.counted.is_none() && v.name != "Unique"
            })
        }
        Kind::Object => {
            let parts: Vec<String> = n
                .obj_children
                .iter()
                .map(|(k, cn)| format!("{}: {}", k, stringify_node(cn, true)))
                .collect();
            let mut body = format!("{{{}}}", parts.join(", "));
            match &n.obj_rest {
                Some(rest) if rest.kind != Kind::Any => {
                    body.push_str(&format!(".Child({})", stringify_node(rest, true)));
                }
                Some(_) => body.push_str(".Open()"),
                None => {}
            }
            suffix(body, n)
        }
    }
}

/// The builder chain a node carries, as `.Name(args)` after the base. A
/// required scalar is just its type name, never `.Required()`; Skip, Ignore
/// and Empty change whether a value is demanded, not what shape it has, and
/// are left out, as the canonical rendering leaves them.
fn suffix(base: String, n: &Node) -> String {
    suffix_where(base, n, |_| true)
}

/// The builder chain of the validators `keep` keeps.
fn suffix_where(base: String, n: &Node, keep: impl Fn(&Validator) -> bool) -> String {
    let mut out = base;
    for v in n.befores.iter().chain(n.afters.iter()).filter(|v| keep(v)) {
        if let Some(s) = &v.suffix {
            out.push('.');
            out.push_str(s);
        }
    }
    out
}

/// A typed node the canonical way: a required node shows its type name, an
/// unrequired one the value it would produce, because that value is what
/// the schema stands for there.
fn type_or_value(n: &Node, type_name: &str, inline: bool) -> String {
    if n.required || !n.has_default {
        return type_name.to_string();
    }
    if let Value::Str(s) = &n.default {
        if !inline {
            return json_text(s);
        }
    }
    inline_value(&n.default)
}

/// A value inside a rendering: strings bare, numbers as JavaScript prints
/// them, everything else as JSON.
pub(crate) fn inline_value(v: &Value) -> String {
    match v {
        Value::Str(s) => s.clone(),
        Value::Num(n) => js_number(*n),
        Value::Undefined => "undefined".to_string(),
        other => crate::value::json_render(other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::builders::*;
    use crate::node::Token;
    use crate::spec::{arr, obj, Spec};
    use regex::Regex;

    #[test]
    fn renders_types_values_and_chains() {
        assert_eq!(stringify_node(&buildize(Token::String), false), "String");
        assert_eq!(stringify_node(&buildize("x"), false), "\"x\"");
        assert_eq!(stringify_node(&buildize("x"), true), "x");
        assert_eq!(stringify_node(&buildize(1.5), false), "1.5");
        assert_eq!(stringify_node(&buildize(true), false), "true");
        assert_eq!(stringify_node(&buildize(Token::Integer), false), "Integer");
        assert_eq!(stringify_node(&buildize(Token::BigInt), false), "BigInt");
        assert_eq!(stringify_node(&buildize(Token::Date), false), "Date");
        assert_eq!(
            stringify_node(&buildize(Spec::Value(Value::Date(0))), false),
            "\"1970-01-01T00:00:00.000Z\""
        );
        assert_eq!(
            stringify_node(&buildize(Spec::Value(Value::Date(0))), true),
            "1970-01-01T00:00:00.000Z"
        );
        assert_eq!(
            stringify_node(&buildize(Spec::Value(Value::Null)), false),
            "null"
        );
        assert_eq!(stringify_node(&buildize(f64::NAN), false), "NaN");
        assert_eq!(stringify_node(&Any(), false), "Any");
        assert_eq!(stringify_node(&Min(2, Any()), false), "Min(2)");
        assert_eq!(
            stringify_node(&Min(2, Token::Number), false),
            "Number.Min(2)"
        );
        let mut anyd = Any();
        anyd.has_default = true;
        anyd.default = Value::from(3);
        assert_eq!(stringify_node(&anyd, false), "Any(3)");
        assert_eq!(stringify_node(&Never(1), false), "Never");
        assert_eq!(
            stringify_node(&buildize(Regex::new("^a").unwrap()), false),
            "/^a/"
        );
        let mut re = buildize(Token::String);
        re.kind = Kind::Regexp;
        assert_eq!(stringify_node(&re, false), "Regexp");
        assert_eq!(
            stringify_node(&Check(|_, _| true, Any()), false),
            "Check.Check()"
        );
        assert_eq!(
            stringify_node(&buildize(Token::Function), false),
            "Function"
        );
        assert_eq!(
            stringify_node(&Nof(1, [Spec::from(Token::Number), Spec::from("a")]), false),
            "Nof(1,Number,a)"
        );
        assert_eq!(
            stringify_node(&All([Spec::from(Token::Number)]), false),
            "All(Number)"
        );
        assert_eq!(stringify_node(&buildize(Token::Array), false), "[]");
        assert_eq!(
            stringify_node(
                &buildize(arr([Spec::from(1), Spec::from(Token::String)])),
                false
            ),
            "[1, String]"
        );
        assert_eq!(
            stringify_node(&Rest(Token::Number, arr::<Spec>([])), false),
            "[...Number]"
        );
        assert_eq!(
            stringify_node(
                &buildize(obj([
                    ("b", Spec::from(1)),
                    ("a", Spec::from(Token::String))
                ])),
                false
            ),
            "{b: 1, a: String}"
        );
        assert_eq!(stringify_node(&buildize(Token::Object), false), "{}.Open()");
        assert_eq!(
            stringify_node(&Child(Token::Number, Token::Object), false),
            "{}.Child(Number)"
        );
        assert_eq!(inline_value(&Value::Undefined), "undefined");
    }
}

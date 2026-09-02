//! Spec by example to node: a literal is optional and its own default, a
//! type token is required, an object or array carries its children.

use crate::node::{Kind, Node, Token};
use crate::spec::Spec;
use crate::value::Value;
use indexmap::IndexMap;
use regex::Regex;

/// Compile a spec into a node.
pub fn normalize(spec: Spec) -> Node {
    match spec {
        Spec::Node(n) => *n,
        Spec::Token(t) => type_token_node(t.kind()),
        Spec::Regex(re) => regexp_node(re),
        Spec::Value(v) => literal_node(v),
        Spec::Arr(items) => normalize_array(items),
        Spec::Obj(pairs) => normalize_object(pairs),
    }
}

/// The node a literal stands for: optional, with the literal as its default.
pub fn literal_node(v: Value) -> Node {
    match v {
        // `undefined` as a spec is `Any`, as in TypeScript.
        Value::Undefined => Node::of(Kind::Any),
        Value::Null => Node {
            has_default: true,
            default: Value::Null,
            literal: Some(Value::Null),
            ..Node::of(Kind::Null)
        },
        Value::Str(s) => Node {
            has_default: true,
            empty: s.is_empty(),
            default: Value::Str(s.clone()),
            literal: Some(Value::Str(s)),
            ..Node::of(Kind::String)
        },
        Value::Bool(b) => Node {
            has_default: true,
            default: Value::Bool(b),
            literal: Some(Value::Bool(b)),
            ..Node::of(Kind::Boolean)
        },
        Value::Num(n) if n.is_nan() => nan_node(),
        Value::Num(n) => Node {
            has_default: true,
            default: Value::Num(n),
            literal: Some(Value::Num(n)),
            ..Node::of(Kind::Number)
        },
        Value::BigInt(b) => Node {
            has_default: true,
            default: Value::BigInt(b.clone()),
            literal: Some(Value::BigInt(b)),
            ..Node::of(Kind::BigInt)
        },
        Value::Date(ms) => Node {
            has_default: true,
            default: Value::Date(ms),
            literal: Some(Value::Date(ms)),
            ..Node::of(Kind::Date)
        },
        Value::Func(id) => Node {
            has_default: true,
            default: Value::Func(id),
            literal: Some(Value::Func(id)),
            ..Node::of(Kind::Function)
        },
        Value::Arr(items) => normalize_array(items.into_iter().map(Spec::Value).collect()),
        Value::Obj(m) => {
            normalize_object(m.into_iter().map(|(k, v)| (k, Spec::Value(v))).collect())
        }
    }
}

pub(crate) fn nan_node() -> Node {
    Node {
        has_default: true,
        default: Value::Num(f64::NAN),
        literal: Some(Value::Num(f64::NAN)),
        ..Node::of(Kind::NaN)
    }
}

/// A regexp is a required string that must match it.
pub(crate) fn regexp_node(re: Regex) -> Node {
    Node {
        regexp: Some(re),
        required: true,
        required_set: true,
        ..Node::of(Kind::Regexp)
    }
}

/// A type token: required (but for `Any`), carrying the kind's empty value as
/// the default it injects once made optional.
pub(crate) fn type_token_node(kind: Kind) -> Node {
    let mut n = Node {
        required: kind != Kind::Any,
        required_set: true,
        has_default: true,
        default: Node::zero_for(kind),
        ..Node::of(kind)
    };
    match kind {
        Kind::Object => n.obj_rest = Some(Box::new(Node::of(Kind::Any))),
        Kind::Array => n.arr_child = Some(Box::new(Node::of(Kind::Any))),
        _ => {}
    }
    n
}

pub(crate) fn normalize_array(items: Vec<Spec>) -> Node {
    let mut n = Node {
        default: Value::Arr(Vec::new()),
        ..Node::of(Kind::Array)
    };
    match items.len() {
        0 => {}
        1 => n.arr_child = Some(Box::new(normalize(items.into_iter().next().unwrap()))),
        _ => n.arr_children = items.into_iter().map(normalize).collect(),
    }
    n
}

pub(crate) fn normalize_object(pairs: Vec<(String, Spec)>) -> Node {
    let mut n = Node {
        default: Value::Obj(Default::default()),
        obj_children: IndexMap::with_capacity(pairs.len()),
        ..Node::of(Kind::Object)
    };
    if pairs.is_empty() {
        n.obj_rest = Some(Box::new(Node::of(Kind::Any)));
        return n;
    }
    for (k, spec) in pairs {
        n.obj_children.insert(k, normalize(spec));
    }
    n
}

impl From<Token> for Node {
    fn from(t: Token) -> Self {
        type_token_node(t.kind())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spec::{arr, obj};

    #[test]
    fn literals_are_optional_defaults() {
        let n = normalize(Spec::from("x"));
        assert!(n.kind == Kind::String && n.has_default && !n.required && !n.empty);
        assert!(normalize(Spec::from("")).empty);
        assert_eq!(normalize(Spec::from(true)).kind, Kind::Boolean);
        assert_eq!(normalize(Spec::from(1.5)).kind, Kind::Number);
        assert_eq!(normalize(Spec::from(f64::NAN)).kind, Kind::NaN);
        assert_eq!(normalize(Spec::Value(Value::Null)).kind, Kind::Null);
        assert_eq!(normalize(Spec::Value(Value::Undefined)).kind, Kind::Any);
        assert_eq!(normalize(Spec::Value(Value::Date(1))).kind, Kind::Date);
        assert_eq!(normalize(Spec::Value(Value::Func(1))).kind, Kind::Function);
        assert_eq!(
            normalize(Spec::from(num_bigint::BigInt::from(1))).kind,
            Kind::BigInt
        );
        let n = normalize(Spec::Value(Value::Arr(vec![Value::from(1)])));
        assert!(n.arr_child.is_some());
        let mut m = crate::value::Map::new();
        m.insert("a".into(), Value::from(1));
        let n = normalize(Spec::Value(Value::Obj(m)));
        assert_eq!(n.obj_children.len(), 1);
    }

    #[test]
    fn tokens_are_required() {
        let n = normalize(Spec::from(Token::String));
        assert!(n.required && n.has_default && n.default == Value::Str(String::new()));
        assert!(!normalize(Spec::from(Token::Any)).required);
        let o = normalize(Spec::from(Token::Object));
        assert!(o.is_open());
        let a = normalize(Spec::from(Token::Array));
        assert!(a.arr_child.is_some());
        let n: Node = Token::Number.into();
        assert_eq!(n.kind, Kind::Number);
        let r = normalize(Spec::from(Regex::new("^a$").unwrap()));
        assert!(r.kind == Kind::Regexp && r.required);
        assert!(matches!(
            normalize(Spec::from(Node::of(Kind::Never))).kind,
            Kind::Never
        ));
    }

    #[test]
    fn containers() {
        assert!(normalize(arr::<Spec>([])).arr_child.is_none());
        assert!(normalize(arr([Token::String])).arr_child.is_some());
        assert_eq!(
            normalize(arr([Spec::from(Token::String), Spec::from(1)]))
                .arr_children
                .len(),
            2
        );
        let o = normalize(obj([("b", 1), ("a", 2)]));
        let keys: Vec<&String> = o.obj_children.keys().collect();
        assert_eq!(keys, vec!["b", "a"]);
        assert!(!o.is_open());
        assert!(normalize(obj::<&str, Spec>([])).is_open());
    }
}

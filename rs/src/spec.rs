//! A spec by example: the value a spec is written as, before it is compiled
//! into a node. Rust has no untyped literal, so a spec is built from these
//! conversions, from the builders, or from the `shape!` macro.

use crate::node::{Node, Token};
use crate::value::{Map, Value};
use num_bigint::BigInt;
use regex::Regex;

/// A spec by example.
#[derive(Clone, Debug)]
pub enum Spec {
    /// A compiled node: a builder's result.
    Node(Box<Node>),
    /// A type token: a required kind.
    Token(Token),
    /// A literal: optional, its own default.
    Value(Value),
    /// An object spec, keys in order.
    Obj(Vec<(String, Spec)>),
    /// An array spec: empty, one child shape, or a tuple.
    Arr(Vec<Spec>),
    /// A regular expression: a required string matching it.
    Regex(Regex),
}

impl From<Node> for Spec {
    fn from(n: Node) -> Self {
        Spec::Node(Box::new(n))
    }
}
impl From<Token> for Spec {
    fn from(t: Token) -> Self {
        Spec::Token(t)
    }
}
impl From<Value> for Spec {
    fn from(v: Value) -> Self {
        Spec::Value(v)
    }
}
impl From<Regex> for Spec {
    fn from(r: Regex) -> Self {
        Spec::Regex(r)
    }
}
impl From<&str> for Spec {
    fn from(s: &str) -> Self {
        Spec::Value(Value::from(s))
    }
}
impl From<String> for Spec {
    fn from(s: String) -> Self {
        Spec::Value(Value::from(s))
    }
}
impl From<bool> for Spec {
    fn from(b: bool) -> Self {
        Spec::Value(Value::from(b))
    }
}
impl From<f64> for Spec {
    fn from(n: f64) -> Self {
        Spec::Value(Value::from(n))
    }
}
impl From<i64> for Spec {
    fn from(n: i64) -> Self {
        Spec::Value(Value::from(n))
    }
}
impl From<i32> for Spec {
    fn from(n: i32) -> Self {
        Spec::Value(Value::from(n))
    }
}
impl From<BigInt> for Spec {
    fn from(b: BigInt) -> Self {
        Spec::Value(Value::from(b))
    }
}
impl From<Vec<Spec>> for Spec {
    fn from(a: Vec<Spec>) -> Self {
        Spec::Arr(a)
    }
}
impl<const N: usize> From<[Spec; N]> for Spec {
    fn from(a: [Spec; N]) -> Self {
        Spec::Arr(a.to_vec())
    }
}
impl<const N: usize> From<[(&str, Spec); N]> for Spec {
    fn from(pairs: [(&str, Spec); N]) -> Self {
        Spec::Obj(pairs.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
    }
}
impl From<Vec<(String, Spec)>> for Spec {
    fn from(pairs: Vec<(String, Spec)>) -> Self {
        Spec::Obj(pairs)
    }
}

/// An object spec from pairs, in order: `obj([("a", 1.into()), ("b", Token::String.into())])`.
pub fn obj<K: Into<String>, S: Into<Spec>>(pairs: impl IntoIterator<Item = (K, S)>) -> Spec {
    Spec::Obj(
        pairs
            .into_iter()
            .map(|(k, v)| (k.into(), v.into()))
            .collect(),
    )
}

/// An array spec: `arr([Token::String.into()])` is an array of strings, more
/// than one item a tuple, none an array of anything.
pub fn arr<S: Into<Spec>>(items: impl IntoIterator<Item = S>) -> Spec {
    Spec::Arr(items.into_iter().map(Into::into).collect())
}

/// The literal null spec.
pub fn null() -> Spec {
    Spec::Value(Value::Null)
}

/// A literal object value as a spec, its properties the defaults.
pub fn from_map(m: Map) -> Spec {
    Spec::Value(Value::Obj(m))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversions() {
        assert!(matches!(Spec::from(Node::default()), Spec::Node(_)));
        assert!(matches!(
            Spec::from(Token::String),
            Spec::Token(Token::String)
        ));
        assert!(matches!(Spec::from(Value::Null), Spec::Value(Value::Null)));
        assert!(matches!(
            Spec::from(Regex::new("a").unwrap()),
            Spec::Regex(_)
        ));
        assert!(matches!(Spec::from("s"), Spec::Value(Value::Str(_))));
        assert!(matches!(
            Spec::from(String::from("s")),
            Spec::Value(Value::Str(_))
        ));
        assert!(matches!(Spec::from(true), Spec::Value(Value::Bool(true))));
        assert!(matches!(Spec::from(1.5), Spec::Value(Value::Num(_))));
        assert!(matches!(Spec::from(1i64), Spec::Value(Value::Num(_))));
        assert!(matches!(Spec::from(1i32), Spec::Value(Value::Num(_))));
        assert!(matches!(
            Spec::from(BigInt::from(1)),
            Spec::Value(Value::BigInt(_))
        ));
        assert!(matches!(Spec::from(vec![Spec::from(1)]), Spec::Arr(_)));
        assert!(matches!(Spec::from([Spec::from(1)]), Spec::Arr(_)));
        assert!(matches!(Spec::from([("a", Spec::from(1))]), Spec::Obj(_)));
        assert!(matches!(
            Spec::from(vec![("a".to_string(), Spec::from(1))]),
            Spec::Obj(_)
        ));
        assert!(matches!(obj([("a", 1)]), Spec::Obj(_)));
        assert!(matches!(arr([Token::String]), Spec::Arr(_)));
        assert!(matches!(null(), Spec::Value(Value::Null)));
        assert!(matches!(from_map(Map::new()), Spec::Value(Value::Obj(_))));
    }
}

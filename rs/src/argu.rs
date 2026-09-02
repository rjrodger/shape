//! Argu: positional arguments matched against an ordered spec, as a call
//! signature is: `argu.validate(args, "foo", spec)` gives the arguments by
//! name. A `skip` slot is optional and shifts the ones after it; a `rest`
//! slot captures whatever remains.

use crate::context::Context;
use crate::error::ValidationError;
use crate::node::{Kind, Node};
use crate::normalize::normalize;
use crate::spec::Spec;
use crate::validate::{validate_node, Cur, Walk};
use crate::value::{Map, Value};
use std::fmt;

/// An argument list that does not match.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ArguError(pub String);

impl fmt::Display for ArguError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ArguError {}

/// A positional-argument validator with a namespace name.
#[derive(Clone, Debug)]
pub struct Argu {
    name: String,
}

/// A compiled signature: the slot names and their shapes, in order.
#[derive(Clone, Debug)]
pub struct Signature {
    prefix: String,
    keys: Vec<String>,
    nodes: Vec<Node>,
}

impl Argu {
    pub fn new(name: impl Into<String>) -> Argu {
        Argu { name: name.into() }
    }

    /// Match the arguments against the spec, naming the call `whence`.
    pub fn validate<I, K, S>(
        &self,
        args: Vec<Value>,
        whence: &str,
        spec: I,
    ) -> Result<Map, ArguError>
    where
        I: IntoIterator<Item = (K, S)>,
        K: Into<String>,
        S: Into<Spec>,
    {
        self.signature(whence, spec)?.apply(args)
    }

    /// Compile the spec once, for many calls.
    pub fn signature<I, K, S>(&self, whence: &str, spec: I) -> Result<Signature, ArguError>
    where
        I: IntoIterator<Item = (K, S)>,
        K: Into<String>,
        S: Into<Spec>,
    {
        let mut keys = Vec::new();
        let mut nodes = Vec::new();
        for (k, s) in spec {
            keys.push(k.into());
            let mut n = normalize(s.into());
            crate::prepare_node(&mut n);
            nodes.push(n);
        }
        if keys.is_empty() {
            return Err(ArguError(format!("{}: empty argument spec", self.name)));
        }
        let prefix = if whence.is_empty() {
            self.name.clone()
        } else {
            format!("{} ({})", self.name, whence)
        };
        Ok(Signature {
            prefix,
            keys,
            nodes,
        })
    }
}

fn is_rest(n: &Node) -> bool {
    n.kind == Kind::Array && n.arr_rest.is_some()
}

fn run(n: &Node, val: Value, key: &str, is_match: bool) -> (Value, ValidationError) {
    let mut ctx = Context::new();
    ctx.terse = is_match;
    let mut verr = ValidationError {
        terse: is_match,
        ..Default::default()
    };
    let mut w = Walk {
        ctx: &mut ctx,
        is_match,
        path: if key.is_empty() {
            Vec::new()
        } else {
            vec![key.to_string()]
        },
        path_arr: if key.is_empty() {
            Vec::new()
        } else {
            vec![crate::context::PathPart::Key(key.to_string())]
        },
    };
    let mut val = val;
    let kept = validate_node(n, Cur::Mut(&mut val), key, false, &mut w, &mut verr);
    if !kept {
        val = Value::Undefined;
    }
    (val, verr)
}

impl Signature {
    /// Match the arguments.
    pub fn apply(&self, args: Vec<Value>) -> Result<Map, ArguError> {
        let mut out = Map::new();
        let mut idx = 0usize;
        let require = |n: &Node, v: Value, key: &str| -> Result<Value, ArguError> {
            let (val, verr) = run(n, v, key, false);
            if verr.has_any() {
                return Err(ArguError(format!("{}: {}", self.prefix, verr)));
            }
            Ok(val)
        };
        for (key, n) in self.keys.iter().zip(self.nodes.iter()) {
            if is_rest(n) {
                // The remaining arguments; none at all is one undefined, as
                // the canonical Rest leaves it.
                let mut rem: Vec<Value> = args[idx.min(args.len())..].to_vec();
                if rem.is_empty() {
                    rem.push(Value::Undefined);
                }
                let child = n.arr_rest.as_deref().unwrap();
                let mut validated = Vec::with_capacity(rem.len());
                for v in rem {
                    validated.push(require(child, v, key)?);
                }
                out.insert(key.clone(), Value::Arr(validated));
                idx = args.len();
            } else if n.skippable {
                if idx >= args.len() {
                    out.insert(key.clone(), Value::Undefined);
                    continue;
                }
                // The slot is taken when the argument matches, and skipped
                // otherwise.
                let mut tester = n.clone();
                tester.skippable = false;
                tester.silent = false;
                let (_, probe) = run(&tester, args[idx].clone(), "", true);
                if !probe.has_any() {
                    out.insert(key.clone(), require(&tester, args[idx].clone(), key)?);
                    idx += 1;
                } else {
                    out.insert(key.clone(), Value::Undefined);
                }
            } else {
                let v = args.get(idx).cloned().unwrap_or(Value::Undefined);
                out.insert(key.clone(), require(n, v, key)?);
                if idx < args.len() {
                    idx += 1;
                }
            }
        }
        if idx < args.len() {
            let expected = self.nodes.iter().filter(|n| !is_rest(n)).count();
            return Err(ArguError(format!(
                "{}: Too many arguments for type signature (was {}, expected {})",
                self.prefix,
                args.len(),
                expected
            )));
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::builders::{rest, skip};
    use crate::node::Token;

    #[test]
    fn matches_positional_arguments() {
        let argu = Argu::new("mylib");
        let sig = argu
            .signature(
                "foo",
                [
                    ("a", Spec::from(Token::Number)),
                    ("b", Spec::from(Token::String)),
                ],
            )
            .unwrap();
        let out = sig.apply(vec![Value::from(2), Value::from("x")]).unwrap();
        assert_eq!(
            serde_json::Value::from(Value::Obj(out)),
            serde_json::json!({"a": 2, "b": "x"})
        );
        assert_eq!(
            sig.apply(vec![Value::from(2)]).unwrap_err().0,
            "mylib (foo): Validation failed for property \"b\" because the property is missing."
        );
        assert_eq!(
            sig.apply(vec![Value::from("z"), Value::from("x")]).unwrap_err().0,
            "mylib (foo): Validation failed for property \"a\" with string \"z\" because the string is not of type number."
        );
        assert_eq!(
            sig.apply(vec![Value::from(1), Value::from("x"), Value::from(3)])
                .unwrap_err()
                .0,
            "mylib (foo): Too many arguments for type signature (was 3, expected 2)"
        );
        // A skip slot shifts.
        let out = argu
            .validate(
                vec![Value::from("x")],
                "",
                [
                    ("a", Spec::from(skip(Token::Number))),
                    ("b", Spec::from(Token::String)),
                ],
            )
            .unwrap();
        assert_eq!(
            serde_json::Value::from(Value::Obj(out)),
            serde_json::json!({"b": "x"})
        );
        let out = argu
            .validate(
                vec![Value::from(1), Value::from("x")],
                "",
                [
                    ("a", Spec::from(skip(Token::Number))),
                    ("b", Spec::from(Token::String)),
                ],
            )
            .unwrap();
        assert_eq!(
            serde_json::Value::from(Value::Obj(out)),
            serde_json::json!({"a": 1, "b": "x"})
        );
        let out = argu
            .validate(vec![], "", [("a", Spec::from(skip(Token::Number)))])
            .unwrap();
        assert_eq!(
            serde_json::Value::from(Value::Obj(out)),
            serde_json::json!({})
        );
        // A rest slot captures the tail; none at all is one undefined.
        let out = argu
            .validate(
                vec![Value::from(1), Value::from(2), Value::from(3)],
                "",
                [
                    ("a", Spec::from(Token::Number)),
                    (
                        "d",
                        Spec::from(rest(Token::Number, crate::spec::arr::<Spec>([]))),
                    ),
                ],
            )
            .unwrap();
        assert_eq!(
            serde_json::Value::from(Value::Obj(out)),
            serde_json::json!({"a": 1, "d": [2, 3]})
        );
        let out = argu
            .validate(
                vec![Value::from(1)],
                "",
                [
                    ("a", Spec::from(Token::Number)),
                    (
                        "d",
                        Spec::from(rest(Token::Any, crate::spec::arr::<Spec>([]))),
                    ),
                ],
            )
            .unwrap();
        assert_eq!(
            serde_json::Value::from(Value::Obj(out)),
            serde_json::json!({"a": 1, "d": [null]})
        );
        assert!(argu
            .validate(
                vec![Value::from(1), Value::from("x")],
                "",
                [
                    ("a", Spec::from(Token::Number)),
                    (
                        "d",
                        Spec::from(rest(Token::Number, crate::spec::arr::<Spec>([])))
                    )
                ],
            )
            .is_err());
        assert_eq!(
            argu.signature("f", Vec::<(String, Spec)>::new())
                .unwrap_err()
                .0,
            "mylib: empty argument spec"
        );
        assert_eq!(format!("{}", ArguError("e".into())), "e");
    }
}

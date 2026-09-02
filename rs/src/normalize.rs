//! Spec by example to node: a literal is optional and its own default, a
//! type token is required, an object or array carries its children.

use crate::builders::fault_node;
use crate::expr::{expr_apply, key_expr_node, split_key_expr};
use crate::node::{Kind, Node, Token};
use crate::spec::Spec;
use crate::value::Value;
use indexmap::IndexMap;
use regex::Regex;
use std::collections::HashMap;

/// How a spec is read.
#[derive(Clone, Debug)]
pub struct Options {
    /// Read object keys like `"x: Min(1)"` as key expressions. On by default.
    pub key_expr: bool,
    /// Read `"x$$"` keys as metadata for `"x"`. Off by default.
    pub meta: bool,
    /// The suffix of a metadata key.
    pub meta_suffix: String,
    /// Read the string under the mark key as an expression applied to the
    /// object. Off by default.
    pub val_expr: bool,
    /// The mark key of a value expression; the meta suffix when empty.
    pub val_expr_mark: String,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            key_expr: true,
            meta: false,
            meta_suffix: "$$".to_string(),
            val_expr: false,
            val_expr_mark: String::new(),
        }
    }
}

impl Options {
    fn mark(&self) -> &str {
        if self.val_expr_mark.is_empty() {
            &self.meta_suffix
        } else {
            &self.val_expr_mark
        }
    }
}

/// Compile a spec into a node.
pub fn normalize(spec: Spec) -> Node {
    normalize_with(spec, &Options::default())
}

/// Compile a spec into a node, with options.
pub fn normalize_with(spec: Spec, opts: &Options) -> Node {
    match spec {
        Spec::Node(n) => *n,
        Spec::Token(t) => type_token_node(t.kind()),
        Spec::Regex(re) => regexp_node(re),
        Spec::Regexp(src) => regexp_node_src(&src),
        Spec::Value(v) => literal_node_with(v, opts),
        Spec::Arr(items) => normalize_array_with(items, opts),
        Spec::Obj(pairs) => normalize_object_with(pairs, opts),
    }
}

/// The node a literal stands for: optional, with the literal as its default.
pub fn literal_node(v: Value) -> Node {
    literal_node_with(v, &Options::default())
}

fn literal_node_with(v: Value, opts: &Options) -> Node {
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
        Value::Arr(items) => {
            normalize_array_with(items.into_iter().map(Spec::Value).collect(), opts)
        }
        Value::Obj(m) => normalize_object_with(
            m.into_iter().map(|(k, v)| (k, Spec::Value(v))).collect(),
            opts,
        ),
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

/// A regexp is a required string that must match it. The pattern is held
/// to the shared subset and compiled for this engine; one outside it makes
/// a fault node, as a builder given a wrong argument does.
pub(crate) fn regexp_node(re: Regex) -> Node {
    regexp_node_src(re.as_str())
}

/// The regexp node of a pattern text.
pub(crate) fn regexp_node_src(src: &str) -> Node {
    match crate::regexp::compile_regexp(src) {
        Ok(engine) => Node {
            regexp: Some(engine),
            regexp_src: src.to_string(),
            required: true,
            required_set: true,
            ..Node::of(Kind::Regexp)
        },
        Err(msg) => crate::builders::fault_node(msg),
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

pub(crate) fn normalize_array_with(items: Vec<Spec>, opts: &Options) -> Node {
    let mut n = Node {
        default: Value::Arr(Vec::new()),
        ..Node::of(Kind::Array)
    };
    match items.len() {
        0 => {}
        1 => {
            n.arr_child = Some(Box::new(normalize_with(
                items.into_iter().next().unwrap(),
                opts,
            )))
        }
        _ => n.arr_children = items.into_iter().map(|s| normalize_with(s, opts)).collect(),
    }
    n
}

/// An object spec: its children in order, with key expressions, metadata
/// sidecars and the value expression read as the options say.
pub(crate) fn normalize_object_with(pairs: Vec<(String, Spec)>, opts: &Options) -> Node {
    let mut n = Node {
        default: Value::Obj(Default::default()),
        obj_children: IndexMap::with_capacity(pairs.len()),
        ..Node::of(Kind::Object)
    };
    if pairs.is_empty() {
        n.obj_rest = Some(Box::new(Node::of(Kind::Any)));
        return n;
    }

    let names: Vec<String> = pairs.iter().map(|(k, _)| k.clone()).collect();
    let suffix = opts.meta_suffix.as_str();
    // A key ending in the suffix is metadata for the key it names, when
    // that key exists; otherwise it is a key like any other.
    let meta_base = |k: &str| -> Option<String> {
        if !opts.meta || k == suffix {
            return None;
        }
        let base = k.strip_suffix(suffix)?;
        names.iter().any(|n| n == base).then(|| base.to_string())
    };
    let mut pending: HashMap<String, IndexMap<String, Value>> = HashMap::new();
    for (k, v) in &pairs {
        if let Some(base) = meta_base(k) {
            let mut meta = IndexMap::new();
            match v {
                Spec::Value(Value::Str(s)) => {
                    meta.insert("short".to_string(), Value::Str(s.clone()));
                }
                Spec::Obj(entries) => {
                    for (mk, mv) in entries {
                        if let Spec::Value(mv) = mv {
                            meta.insert(mk.clone(), mv.clone());
                        }
                    }
                }
                Spec::Value(other) => {
                    meta.insert("value".to_string(), other.clone());
                }
                _ => {}
            }
            pending.insert(base, meta);
        }
    }

    let mut val_expr: Option<String> = None;
    for (k, v) in pairs {
        if meta_base(&k).is_some() {
            continue;
        }
        if opts.val_expr && k == opts.mark() {
            if let Spec::Value(Value::Str(src)) = &v {
                val_expr = Some(src.clone());
                continue;
            }
        }
        let (real_key, mut cn) = match split_key_expr(&k).filter(|_| opts.key_expr) {
            Some((name, src)) => (name, key_expr_node(&src, v)),
            None => (k, normalize_with(v, opts)),
        };
        if let Some(meta) = pending.remove(&real_key) {
            cn.meta.extend(meta);
        }
        n.obj_children.insert(real_key, cn);
    }

    // The value expression applies to the object itself, in place: "Open"
    // opens it rather than replacing it.
    if let Some(src) = val_expr {
        n = match expr_apply(&src, Spec::from(n)) {
            Ok(applied) => applied,
            Err(e) => fault_node(format!("Shape: value expression {:?}: {}", src, e)),
        };
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

#[cfg(test)]
mod option_tests {
    use super::*;
    use crate::spec::obj;
    use crate::Schema;

    fn j(s: &str) -> Value {
        Value::from(serde_json::from_str::<serde_json::Value>(s).unwrap())
    }

    #[test]
    fn meta_sidecars() {
        let opts = Options {
            meta: true,
            ..Default::default()
        };
        let s = Schema::with_options(
            obj([
                ("a", Spec::from(1)),
                ("a$$", Spec::from("short text")),
                ("b", Spec::from(2)),
                (
                    "b$$",
                    obj([("k", Spec::from(1)), ("z", Spec::from(Token::Number))]),
                ),
                ("c", Spec::from(3)),
                ("c$$", Spec::from(7)),
                ("d", Spec::from(4)),
                ("d$$", Spec::from(Token::String)),
                ("e$$", Spec::from(5)),
                ("$$", Spec::from(6)),
            ]),
            &opts,
        );
        let c = &s.node().obj_children;
        assert_eq!(c["a"].meta["short"], Value::from("short text"));
        assert_eq!(c["b"].meta["k"], Value::from(1));
        assert!(!c["b"].meta.contains_key("z"));
        assert_eq!(c["c"].meta["value"], Value::from(7));
        assert!(c["d"].meta.is_empty());
        assert!(!c.contains_key("a$$"));
        assert_eq!(c["e$$"].default, Value::from(5));
        assert_eq!(c["$$"].default, Value::from(6));
        let custom = Options {
            meta: true,
            meta_suffix: "__".into(),
            ..Default::default()
        };
        let s = Schema::with_options(
            obj([("a", Spec::from(1)), ("a__", Spec::from("s"))]),
            &custom,
        );
        assert_eq!(s.node().obj_children["a"].meta["short"], Value::from("s"));
        // Off by default: a sidecar is a key like any other.
        let s = Schema::new(obj([("a", Spec::from(1)), ("a$$", Spec::from("s"))]));
        assert!(s.node().obj_children.contains_key("a$$"));
    }

    #[test]
    fn value_expressions_apply_to_the_object() {
        let opts = Options {
            val_expr: true,
            ..Default::default()
        };
        let s = Schema::with_options(
            obj([("a", Spec::from(1)), ("$$", Spec::from("Open"))]),
            &opts,
        );
        assert!(s.node().is_open());
        assert_eq!(
            serde_json::Value::from(s.validate(j(r#"{"a":2,"z":1}"#)).unwrap()),
            serde_json::json!({"a":2,"z":1})
        );
        let s = Schema::with_options(
            obj([("a", Spec::from(1)), ("$$", Spec::from("Min(2)"))]),
            &opts,
        );
        assert!(s.validate(j(r#"{"a":2}"#)).is_err());
        let s = Schema::with_options(obj([("a", Spec::from(1)), ("$$", Spec::from(5))]), &opts);
        assert!(s.node().obj_children.contains_key("$$"));
        let s = Schema::with_options(
            obj([("a", Spec::from(1)), ("$$", Spec::from("bogus"))]),
            &opts,
        );
        assert_eq!(
            s.validate(j(r#"{"a":2}"#)).unwrap_err().to_string(),
            "Shape: value expression \"bogus\": Shape: unexpected token bogus in builder expression bogus"
        );
        let marked = Options {
            val_expr: true,
            val_expr_mark: "@".into(),
            ..Default::default()
        };
        let s = Schema::with_options(
            obj([("a", Spec::from(1)), ("@", Spec::from("Open"))]),
            &marked,
        );
        assert!(s.node().is_open());
        // Off by default.
        let s = Schema::new(obj([("a", Spec::from(1)), ("$$", Spec::from("Open"))]));
        assert!(!s.node().is_open());
    }

    #[test]
    fn key_expressions_can_be_turned_off() {
        let s = Schema::new(obj([("a: Min(1)", Spec::from(0))]));
        assert!(s.node().obj_children.contains_key("a"));
        let opts = Options {
            key_expr: false,
            ..Default::default()
        };
        let s = Schema::with_options(obj([("a: Min(1)", Spec::from(0))]), &opts);
        assert!(s.node().obj_children.contains_key("a: Min(1)"));
    }
}

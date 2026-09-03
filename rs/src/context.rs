//! What flows through a validation: the caller's context, the state a
//! validator sees at its node, and the update it fills in.

use crate::error::FieldError;
use crate::node::Node;
use crate::value::Value;
use std::any::Any;
use std::collections::HashMap;
use std::sync::Arc;

/// A path element: an object key or an array index.
#[derive(Clone, Debug, PartialEq)]
pub enum PathPart {
    /// A property key, shared with the node that declares it.
    Key(Arc<str>),
    Index(usize),
}

impl PathPart {
    pub fn as_key(&self) -> String {
        match self {
            PathPart::Key(k) => k.to_string(),
            PathPart::Index(i) => i.to_string(),
        }
    }

    fn write_to(&self, out: &mut String) {
        match self {
            PathPart::Key(k) => out.push_str(k),
            PathPart::Index(i) => out.push_str(&i.to_string()),
        }
    }
}

/// The caller's context: per-call state custom validators may share, and
/// the definitions `Define` records for `Refer`.
#[derive(Default)]
pub struct Context {
    /// Anything a validator wants to keep across nodes: a counter, a handle,
    /// a domain object. Type-erased, as TypeScript takes any property and Go
    /// a `map[string]any`.
    pub custom: HashMap<String, Box<dyn Any + Send + Sync>>,
    /// The nodes `Define` recorded during this call.
    pub refs: HashMap<String, Arc<Node>>,
    /// The errors of the call, when the caller asked for them.
    pub err: Vec<FieldError>,
    /// The caller wants a verdict only, so an error is recorded without its
    /// path, text or value rendering.
    pub(crate) terse: bool,
}

impl Context {
    pub fn new() -> Context {
        Context::default()
    }

    /// A typed read of `custom`.
    pub fn get<T: 'static>(&self, key: &str) -> Option<&T> {
        self.custom.get(key).and_then(|b| b.downcast_ref::<T>())
    }

    /// A typed write to `custom`.
    pub fn set<T: Any + Send + Sync>(&mut self, key: &str, value: T) {
        self.custom.insert(key.to_string(), Box::new(value));
    }
}

/// What a custom validator sees: where it is, what it is looking at.
pub struct State<'a> {
    /// The path from the root, the current key last: array indices as
    /// indices, keys as keys.
    pub path_arr: &'a [PathPart],
    /// The immediate key or index.
    pub key: &'a str,
    /// The value under validation.
    pub value: &'a Value,
    /// The node of the value.
    pub node: &'a Node,
    /// Whether the parent is an array (an index) or an object (a property).
    pub parent_is_array: bool,
    /// True on a `matches` or `valid` call: nothing is produced.
    pub is_match: bool,
    pub ctx: &'a mut Context,
    /// The value is missing, rather than present and null.
    pub absent: bool,
    /// The name of the validator running, for `check "<name>" failed`.
    pub check_name: &'a str,
    /// The schema's own definitions, as of its compile. Borrowed from the
    /// schema for the walk: a context of its own cost an allocation and
    /// an atomic per call.
    pub(crate) defs: &'a HashMap<String, Arc<Node>>,
}

impl<'a> State<'a> {
    /// The path as dotted text.
    pub fn path_str(&self) -> String {
        join_path(self.path_arr)
    }

    /// The path as keys, every index as its digits.
    pub fn path_keys(&self) -> Vec<String> {
        self.path_arr.iter().map(|p| p.as_key()).collect()
    }
}

/// The dotted form of a path, empty segments skipped.
pub fn join_path(path: &[PathPart]) -> String {
    let mut out = String::new();
    for p in path {
        if matches!(p, PathPart::Key(k) if k.is_empty()) {
            continue;
        }
        if !out.is_empty() {
            out.push('.');
        }
        p.write_to(&mut out);
    }
    out
}

/// An error a validator reports.
#[derive(Clone, Debug)]
pub enum UpdateErr {
    /// A message; `$PATH` and `$VALUE` are expanded.
    Text(String),
    /// A ready error, its path filled in when empty.
    Field(Box<FieldError>),
    /// Several ready errors.
    Fields(Vec<FieldError>),
}

/// The bag a custom validator fills in.
#[derive(Default)]
pub struct Update {
    /// Stop running further checks and the structural check.
    pub done: bool,
    /// The why code on failure.
    pub why: Option<String>,
    /// The numeric mark on failure.
    pub mark: i64,
    pub err: Option<UpdateErr>,
    /// A replacement value.
    pub val: Option<Value>,
    /// A replacement node (used by `Refer`).
    pub node: Option<Arc<Node>>,
    /// The failure ends the whole walk's errors here.
    pub fatal: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn context_custom_is_typed() {
        let mut c = Context::new();
        c.set("n", 3u32);
        assert_eq!(c.get::<u32>("n"), Some(&3));
        assert_eq!(c.get::<String>("n"), None);
        assert_eq!(c.get::<u32>("m"), None);
    }

    #[test]
    fn paths_join_and_render() {
        let k = |s: &str| PathPart::Key(s.into());
        assert_eq!(
            join_path(&[k("a"), k(""), k("b"), PathPart::Index(1)]),
            "a.b.1"
        );
        assert_eq!(join_path(&[]), "");
        assert_eq!(PathPart::Key("k".into()).as_key(), "k");
        assert_eq!(PathPart::Index(2).as_key(), "2");
        let mut ctx = Context::new();
        let node = Node::default();
        let path = [k("a")];
        let defs = HashMap::new();
        let s = State {
            path_arr: &path,
            key: "a",
            value: &Value::Null,
            node: &node,
            parent_is_array: false,
            is_match: false,
            ctx: &mut ctx,
            absent: false,
            check_name: "",
            defs: &defs,
        };
        assert_eq!(s.path_str(), "a");
        assert_eq!(s.path_keys(), vec!["a".to_string()]);
        let u = Update::default();
        assert!(!u.done && u.val.is_none());
    }
}

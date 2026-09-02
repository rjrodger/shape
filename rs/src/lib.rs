//! # shape
//!
//! Schema by example: a spec is written as an example of the value it
//! accepts, and validating a value against it completes it. The Rust port of
//! [shape](https://github.com/rjrodger/shape); the TypeScript implementation
//! is canonical and this one is held to it by a shared corpus.
//!
//! ```
//! use shape::{obj, shape, Spec, Token, Value};
//!
//! let s = shape(obj([("name", Spec::from(Token::String)), ("port", Spec::from(8080))]));
//! let out = s.validate(Value::from(serde_json::json!({ "name": "x" }))).unwrap();
//! assert_eq!(serde_json::Value::from(out), serde_json::json!({ "name": "x", "port": 8080 }));
//! ```

pub mod builders;
pub mod coerce;
pub mod context;
pub mod error;
pub mod format;
pub mod isolate;
pub mod node;
pub mod normalize;
pub mod spec;
pub mod stringify;
pub mod validate;
pub mod value;

pub use builders::*;
pub use context::{Context, PathPart, State, Update, UpdateErr};
pub use error::{FieldError, ValidationError};
pub use isolate::{Inner, TransformFn};
pub use node::{Kind, ListMode, Node, Token, Validator, ValidatorFn};
pub use spec::{arr, from_map, null, obj, Spec};
pub use stringify::stringify_node;
pub use value::{Map, Value};

use std::collections::HashMap;
use std::sync::Arc;
use validate::{validate_ignored, validate_node, Cur, Walk};

/// The crate version.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// A compiled spec.
#[derive(Clone, Debug)]
pub struct Schema {
    root: Node,
    /// The `define`d nodes by name, for `refer`.
    defs: Arc<HashMap<String, Arc<Node>>>,
}

/// Compile a spec.
pub fn shape(spec: impl Into<Spec>) -> Schema {
    Schema::new(spec)
}

impl Schema {
    pub fn new(spec: impl Into<Spec>) -> Schema {
        let mut root = normalize::normalize(spec.into());
        let mut defs = HashMap::new();
        prepare(&mut root, &mut defs);
        Schema {
            root,
            defs: Arc::new(defs),
        }
    }

    /// The `define`d nodes of the schema, by name.
    pub fn defs(&self) -> &HashMap<String, Arc<Node>> {
        &self.defs
    }

    /// The compiled tree.
    pub fn node(&self) -> &Node {
        &self.root
    }

    /// Validate and complete a value: defaults injected, children validated.
    /// `Value::Undefined` is no value at all, as a bare `shape()` call is.
    pub fn validate(&self, input: Value) -> Result<Value, ValidationError> {
        let mut ctx = Context::new();
        self.validate_ctx(input, &mut ctx)
    }

    /// `validate` with a context of the caller's, for custom validators.
    pub fn validate_ctx(&self, input: Value, ctx: &mut Context) -> Result<Value, ValidationError> {
        let mut value = input;
        let mut verr = ValidationError::default();
        ctx.terse = false;
        ctx.defs = Arc::clone(&self.defs);
        let kept = {
            let mut w = Walk {
                ctx,
                is_match: false,
                path: Vec::new(),
                path_arr: Vec::new(),
            };
            walk_root(&self.root, Cur::Mut(&mut value), &mut w, &mut verr)
        };
        ctx.err.extend(verr.issues.iter().cloned());
        if verr.has_any() {
            return Err(verr);
        }
        if !kept {
            value = Value::Undefined;
        }
        Ok(value)
    }

    /// Whether the value validates. Nothing is produced or rendered.
    pub fn valid(&self, input: &Value) -> bool {
        let mut ctx = Context::new();
        ctx.terse = true;
        ctx.defs = Arc::clone(&self.defs);
        let mut verr = ValidationError {
            terse: true,
            ..Default::default()
        };
        let mut w = Walk {
            ctx: &mut ctx,
            is_match: true,
            path: Vec::new(),
            path_arr: Vec::new(),
        };
        walk_root(&self.root, Cur::Ref(input), &mut w, &mut verr);
        !verr.has_any()
    }

    /// `valid` by another name.
    pub fn matches(&self, input: &Value) -> bool {
        self.valid(input)
    }

    /// The errors of validating the value; empty when it validates.
    pub fn error(&self, input: &Value) -> Vec<FieldError> {
        let mut ctx = Context::new();
        ctx.defs = Arc::clone(&self.defs);
        let mut verr = ValidationError::default();
        let mut w = Walk {
            ctx: &mut ctx,
            is_match: true,
            path: Vec::new(),
            path_arr: Vec::new(),
        };
        walk_root(&self.root, Cur::Ref(input), &mut w, &mut verr);
        verr.issues
    }
}

/// Walk a compiled tree once: every object node gets the set of keys it
/// accepts, and every `define`d node is collected by name.
fn prepare(n: &mut Node, defs: &mut HashMap<String, Arc<Node>>) {
    if n.kind == Kind::Object {
        let mut consumed = std::collections::HashSet::with_capacity(n.obj_children.len());
        for (k, cn) in &n.obj_children {
            consumed.insert(k.clone());
            if let Some(to) = &cn.rename_to {
                consumed.insert(to.clone());
            }
            for src in &cn.rename_claim {
                consumed.insert(src.clone());
            }
        }
        n.consumed = consumed;
    }
    for cn in n.obj_children.values_mut() {
        prepare(cn, defs);
    }
    if let Some(r) = n.obj_rest.as_deref_mut() {
        prepare(r, defs);
    }
    for cn in n.arr_children.iter_mut() {
        prepare(cn, defs);
    }
    if let Some(c) = n.arr_child.as_deref_mut() {
        prepare(c, defs);
    }
    if let Some(r) = n.arr_rest.as_deref_mut() {
        prepare(r, defs);
    }
    for sn in n.list.iter_mut() {
        prepare(sn, defs);
    }
    if let Some(name) = &n.define_name {
        defs.insert(name.clone(), Arc::new(n.clone()));
    }
}

/// The root honours `Ignore` as a property or an element does: a value that
/// does not validate is dropped along with its errors.
fn walk_root(root: &Node, cur: Cur<'_>, w: &mut Walk<'_>, verr: &mut ValidationError) -> bool {
    if root.is_ignore() {
        validate_ignored(root, cur, "", false, w, verr)
    } else {
        validate_node(root, cur, "", false, w, verr)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api() {
        let s = shape(1);
        assert_eq!(s.validate(Value::Undefined).unwrap(), Value::Num(1.0));
        assert!(s.matches(&Value::Num(2.0)));
        assert!(!s.matches(&Value::Str("x".into())));
        assert_eq!(s.node().kind, Kind::Number);
        assert!(!VERSION.is_empty());
    }
}

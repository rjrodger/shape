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
pub mod context;
pub mod error;
pub mod node;
pub mod normalize;
pub mod spec;
pub mod validate;
pub mod value;

pub use builders::*;
pub use context::{Context, PathPart, State, Update, UpdateErr};
pub use error::{FieldError, ValidationError};
pub use node::{Kind, Node, Token, Validator};
pub use spec::{arr, from_map, null, obj, Spec};
pub use value::{Map, Value};

use validate::{validate_ignored, validate_node, Cur, Walk};

/// The crate version.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// A compiled spec.
#[derive(Clone, Debug)]
pub struct Schema {
    root: Node,
}

/// Compile a spec.
pub fn shape(spec: impl Into<Spec>) -> Schema {
    Schema::new(spec)
}

impl Schema {
    pub fn new(spec: impl Into<Spec>) -> Schema {
        Schema {
            root: normalize::normalize(spec.into()),
        }
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

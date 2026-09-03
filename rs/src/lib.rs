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

pub mod algebra;
pub mod argu;
pub mod builders;
pub mod coerce;
pub mod context;
pub mod discriminated;
pub mod error;
pub mod expr;
pub mod format;
pub mod isolate;
pub mod json;
pub mod jsonschema;
pub mod jsonschema_import;
mod macros;
pub mod node;
pub mod normalize;
mod regexp;
pub mod spec;
pub mod standard;
pub mod stringify;
pub mod validate;
pub mod value;

pub use algebra::{extend, omit, partial, pick, Names};
pub use argu::{Argu, ArguError, Signature};
pub use builders::*;
pub use context::{Context, PathPart, State, Update, UpdateErr};
pub use discriminated::{discriminated, Disc};
pub use error::{FieldError, ValidationError};
pub use expr::{expr, expr_apply, ExprError};
pub use isolate::{Inner, TransformFn};
pub use expr::build;
pub use json::{node_json, JsonError};
pub use jsonschema::json_schema;
pub use jsonschema_import::{from_json_schema, JsonSchemaError};
pub use node::{Kind, ListMode, Node, Token, Validator, ValidatorFn};
pub use normalize::Options;
pub use spec::{arr, from_map, null, obj, Spec};
pub use standard::{StandardIssue, StandardResult, StandardSchema};
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
    /// No validator anywhere in the tree: a verdict needs no path.
    pure: bool,
}

/// Compile a spec.
pub fn shape(spec: impl Into<Spec>) -> Schema {
    Schema::new(spec)
}

impl Schema {
    pub fn new(spec: impl Into<Spec>) -> Schema {
        Schema::with_options(spec, &Options::default())
    }

    /// Compile a spec, reading it as the options say.
    pub fn with_options(spec: impl Into<Spec>, opts: &Options) -> Schema {
        let mut root = normalize::normalize_with(spec.into(), opts);
        let mut defs = HashMap::new();
        let pure = prepare(&mut root, &mut defs);
        Schema {
            root,
            defs: Arc::new(defs),
            pure,
        }
    }

    /// Compile the string form of a spec: `Schema::parse("String.Min(2)")`.
    pub fn parse(src: &str) -> Result<Schema, ExprError> {
        Ok(Schema::new(expr(src)?))
    }

    /// The schema as a JSON Schema document (draft 2020-12).
    /// The declarative JSON of the shape, which [`crate::expr::build`]
    /// reads back.
    pub fn json(&self) -> Result<Value, crate::json::JsonError> {
        crate::json::node_json(self.node())
    }

    pub fn json_schema(&self) -> Value {
        json_schema(&self.root)
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
                paths: true,
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
            paths: !self.pure,
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
            paths: true,
        };
        walk_root(&self.root, Cur::Ref(input), &mut w, &mut verr);
        verr.issues
    }
}

/// Prepare a node outside a schema, as Argu compiles its slots.
pub(crate) fn prepare_node(n: &mut Node) {
    let mut defs = HashMap::new();
    prepare(n, &mut defs);
}

/// Walk a compiled tree once: every object node gets the set of keys it
/// accepts and its keys to share with the paths, and every `define`d node
/// is collected by name. Reports whether the tree has no validator at all.
fn prepare(n: &mut Node, defs: &mut HashMap<String, Arc<Node>>) -> bool {
    let mut pure = n.befores.is_empty() && n.afters.is_empty();
    n.plain = pure
        && !n.silent
        && n.rename_to.is_none()
        && n.rename_claim.is_empty()
        && n.regexp.is_none()
        && n.list_mode == ListMode::None
        && n.disc.is_none();
    if n.kind == Kind::Object {
        n.obj_keys = n
            .obj_children
            .keys()
            .map(|k| Arc::from(k.as_str()))
            .collect();
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
        pure &= prepare(cn, defs);
    }
    if let Some(r) = n.obj_rest.as_deref_mut() {
        pure &= prepare(r, defs);
    }
    for cn in n.arr_children.iter_mut() {
        pure &= prepare(cn, defs);
    }
    if let Some(c) = n.arr_child.as_deref_mut() {
        pure &= prepare(c, defs);
    }
    if let Some(r) = n.arr_rest.as_deref_mut() {
        pure &= prepare(r, defs);
    }
    for sn in n.list.iter_mut() {
        pure &= prepare(sn, defs);
    }
    if let Some(name) = &n.define_name {
        defs.insert(name.clone(), Arc::new(n.clone()));
    }
    pure
}

/// What `validate_into` can fail with: the validation, or the deserialization
/// of the produced value into the target type.
#[cfg(feature = "serde")]
#[derive(Debug)]
pub enum IntoError {
    Validation(ValidationError),
    Deserialize(serde_json::Error),
}

#[cfg(feature = "serde")]
impl std::fmt::Display for IntoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IntoError::Validation(e) => write!(f, "{}", e),
            IntoError::Deserialize(e) => write!(f, "{}", e),
        }
    }
}

#[cfg(feature = "serde")]
impl std::error::Error for IntoError {}

#[cfg(feature = "serde")]
impl Schema {
    /// Validate, and deserialize the produced value into a type.
    pub fn validate_into<T: serde::de::DeserializeOwned>(
        &self,
        input: impl Into<Value>,
    ) -> Result<T, IntoError> {
        let out = self.validate(input.into()).map_err(IntoError::Validation)?;
        serde_json::from_value(serde_json::Value::from(out)).map_err(IntoError::Deserialize)
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

#[cfg(all(test, feature = "serde"))]
mod serde_tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize, Debug, PartialEq)]
    struct Config {
        name: String,
        port: u16,
    }

    #[test]
    fn validates_into_a_type() {
        let s = shape(obj([
            ("name", Spec::from(Token::String)),
            ("port", Spec::from(8080)),
        ]));
        let c: Config = s
            .validate_into(Value::from(serde_json::json!({"name": "x"})))
            .unwrap();
        assert_eq!(
            c,
            Config {
                name: "x".into(),
                port: 8080
            }
        );
        let bad = s.validate_into::<Config>(Value::from(serde_json::json!({"name": 1})));
        assert!(matches!(bad, Err(IntoError::Validation(_))));
        assert!(bad.unwrap_err().to_string().contains("not of type string"));
        let s = shape(obj([
            ("name", Spec::from(Token::String)),
            ("port", Spec::from(-1)),
        ]));
        let bad = s.validate_into::<Config>(Value::from(serde_json::json!({"name": "x"})));
        assert!(matches!(bad, Err(IntoError::Deserialize(_))));
        assert!(!bad.unwrap_err().to_string().is_empty());
    }
}

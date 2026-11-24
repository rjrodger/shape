//! # shape
//!
//! Schema by example: a spec is written as an example of the value it
//! accepts, and validating a value against it completes it. The Rust port of
//! [shape](https://github.com/rjrodger/shape); the TypeScript implementation
//! is canonical and this one is held to it by a shared corpus.
//!
//! ```
//! use shape::{obj, Shape, Spec, Token, Value};
//!
//! let s = Shape(obj([("name", Spec::from(Token::String)), ("port", Spec::from(8080))]));
//! let out = s.validate(Value::from(serde_json::json!({ "name": "x" }))).unwrap();
//! assert_eq!(serde_json::Value::from(out), serde_json::json!({ "name": "x", "port": 8080 }));
//! ```

// The builders keep the names they have in TypeScript and Go (Min,
// Required, DateTime), as do their chain methods.
#![allow(non_snake_case)]

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

pub use algebra::{Extend, Names, Omit, Partial, Pick};
pub use argu::{Argu, ArguError, Signature};
pub use builders::*;
pub use context::{Context, PathPart, State, Update, UpdateErr};
pub use discriminated::{Disc, Discriminated};
pub use error::{FieldError, ValidationError};
pub use expr::build;
pub use expr::{expr, expr_apply, ExprError};
pub use isolate::{Inner, TransformFn};
pub use json::{node_json, JsonError};
pub use jsonschema::json_schema;
pub use jsonschema_import::{
    from_json_schema, from_json_schema_with, JsonSchemaError, JsonSchemaImportOptions,
};
pub use node::{Kind, ListMode, Node, Token, Validator, ValidatorFn};
pub use normalize::Options;
pub use spec::{arr, from_map, null, obj, Spec};
pub use standard::{StandardIssue, StandardResult, StandardSchema};
pub use stringify::stringify_node;
pub use value::{Map, Value};

use context::Trials;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use validate::{validate_node, Cur, Walk};

/// The crate version.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// A compiled spec.
#[derive(Clone, Debug)]
pub struct Schema {
    root: Node,
    /// The `Define`d nodes by name, for `Refer`.
    defs: Arc<HashMap<String, Arc<Node>>>,
    /// No validator anywhere in the tree: a verdict needs no path.
    pure: bool,
    /// The trials one validation may run (zero for the default).
    trials: usize,
}

/// Compile a spec.
pub fn Shape(spec: impl Into<Spec>) -> Schema {
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
        let pure = prepare(&mut root, &mut defs, &Reach::default());
        // What a Refer can bring is known once every definition is: where
        // one brings a rename, the tree is prepared again, and so are the
        // definitions taken from it.
        let reach = Reach::of(&defs);
        if !reach.renames.is_empty() {
            prepare(&mut root, &mut defs, &reach);
        }
        Schema {
            root,
            defs: Arc::new(defs),
            pure,
            trials: opts.trials,
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

    /// The `Define`d nodes of the schema, by name.
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
        // Each call counts its trials against a budget of its own, and
        // leaves the budget of a call it runs within as it was.
        let outer = std::mem::replace(&mut ctx.trials, Trials::new(self.trials));
        let kept = {
            let mut w = Walk {
                ctx,
                defs: &self.defs,
                is_match: false,
                path: Vec::new(),
                paths: true,
                own: false,
            };
            walk_root(&self.root, Cur::Mut(&mut value), &mut w, &mut verr)
        };
        std::mem::replace(&mut ctx.trials, outer).settle(&mut verr);
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
        ctx.trials = Trials::new(self.trials);
        let mut verr = ValidationError {
            terse: true,
            ..Default::default()
        };
        let mut w = Walk {
            ctx: &mut ctx,
            defs: &self.defs,
            is_match: true,
            path: Vec::new(),
            paths: !self.pure,
            own: false,
        };
        walk_root(&self.root, Cur::Ref(input), &mut w, &mut verr);
        ctx.trials.settle(&mut verr);
        !verr.has_any()
    }

    /// `valid` by another name.
    pub fn matches(&self, input: &Value) -> bool {
        self.valid(input)
    }

    /// The errors of validating the value; empty when it validates.
    pub fn error(&self, input: &Value) -> Vec<FieldError> {
        let mut ctx = Context::new();
        ctx.trials = Trials::new(self.trials);
        let mut verr = ValidationError::default();
        let mut w = Walk {
            ctx: &mut ctx,
            defs: &self.defs,
            is_match: true,
            path: Vec::new(),
            paths: true,
            own: false,
        };
        walk_root(&self.root, Cur::Ref(input), &mut w, &mut verr);
        ctx.trials.settle(&mut verr);
        verr.issues
    }
}

/// Prepare a node outside a schema, as Argu compiles its slots.
pub(crate) fn prepare_node(n: &mut Node) {
    let mut defs = HashMap::new();
    prepare(n, &mut defs, &Reach::default());
}

/// The names under which a `Refer` can put a node that renames in its
/// place, and those under which it can put one that claims: the node
/// defined under the name does, or refers on to a name whose node does.
#[derive(Default)]
struct Reach {
    renames: HashSet<String>,
    claims: HashSet<String>,
}

impl Reach {
    fn of(defs: &HashMap<String, Arc<Node>>) -> Reach {
        let mut reach = Reach::default();
        loop {
            let mut grew = false;
            for (name, d) in defs {
                if !reach.renames.contains(name)
                    && (d.rename_to.is_some() || Reach::brings(d, &reach.renames))
                {
                    reach.renames.insert(name.clone());
                    grew = true;
                }
                if !reach.claims.contains(name)
                    && (!d.rename_claim.is_empty() || Reach::brings(d, &reach.claims))
                {
                    reach.claims.insert(name.clone());
                    grew = true;
                }
            }
            if !grew {
                return reach;
            }
        }
    }

    /// Whether a `Refer` of the node can bring what the names say.
    fn brings(n: &Node, names: &HashSet<String>) -> bool {
        n.refer_name.as_ref().is_some_and(|r| names.contains(r))
    }
}

/// Walk a compiled tree once: every object node gets the set of keys it
/// accepts and its keys to share with the paths, and every `Define`d node
/// is collected by name. Reports whether the tree has no validator at all.
fn prepare(n: &mut Node, defs: &mut HashMap<String, Arc<Node>>, reach: &Reach) -> bool {
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
        // The declared keys. Neither a rename's target nor a claim's key is
        // one: a value that already has a target is not allowed, and a
        // claimed key is the object's only once a claim takes it (see
        // validate_object), as in TypeScript.
        n.consumed = n.obj_children.keys().cloned().collect();
        n.claims = n
            .obj_children
            .values()
            .chain(n.obj_rest.as_deref())
            .any(|c| !c.rename_claim.is_empty() || Reach::brings(c, &reach.claims));
        n.renames = n
            .obj_children
            .values()
            .chain(n.obj_rest.as_deref())
            .any(|c| c.rename_to.is_some() || Reach::brings(c, &reach.renames));
    }
    for cn in n.obj_children.values_mut() {
        pure &= prepare(cn, defs, reach);
    }
    if let Some(r) = n.obj_rest.as_deref_mut() {
        pure &= prepare(r, defs, reach);
    }
    for cn in n.arr_children.iter_mut() {
        pure &= prepare(cn, defs, reach);
    }
    if let Some(c) = n.arr_child.as_deref_mut() {
        pure &= prepare(c, defs, reach);
    }
    if let Some(r) = n.arr_rest.as_deref_mut() {
        pure &= prepare(r, defs, reach);
    }
    for sn in n.list.iter_mut() {
        pure &= prepare(sn, defs, reach);
    }
    // A Contains counts with a shape of its own, prepared when it was
    // built; what that shape defines is the schema's to refer to as well.
    for c in counted(&n.befores) {
        prepare(&mut c.shape.clone(), defs, reach);
    }
    if let Some(name) = &n.define_name {
        defs.insert(name.clone(), Arc::new(n.clone()));
    }
    pure
}

/// The Contains checks among a node's befores, those a Catch or Transform
/// took inside included.
fn counted(vs: &[Validator]) -> Vec<Arc<node::Counted>> {
    let mut out = Vec::new();
    for v in vs {
        if let Some(inner) = &v.inner {
            out.extend(counted(&inner.befores));
        }
        out.extend(v.counted.iter().cloned());
    }
    out
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
    validate_node(root, cur, "", false, w, verr)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api() {
        let s = Shape(1);
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
        let s = Shape(obj([
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
        let s = Shape(obj([
            ("name", Spec::from(Token::String)),
            ("port", Spec::from(-1)),
        ]));
        let bad = s.validate_into::<Config>(Value::from(serde_json::json!({"name": "x"})));
        assert!(matches!(bad, Err(IntoError::Deserialize(_))));
        assert!(!bad.unwrap_err().to_string().is_empty());
    }
}

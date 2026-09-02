//! Isolated validation: Catch and Transform (Ignore probes the same way from
//! its call sites). These builders take the checks a node carries, its
//! befores and its afters, inside, and validate the node as a whole (those
//! checks, the structural check, every descendant) in a sub-run before the
//! node itself proceeds. Only then is the outcome of the entire subtree
//! known at once; the canonical implementation does the same, since it runs
//! a node's afters before visiting its children.

use crate::context::{State, Update, UpdateErr};
use crate::error::ValidationError;
use crate::node::{Node, Validator};
use crate::validate::{validate_node_with, Cur, Walk};
use crate::value::Value;
use std::sync::Arc;

/// The checks a Catch or Transform took inside.
#[derive(Clone, Debug, Default)]
pub struct Inner {
    pub befores: Vec<Validator>,
    pub afters: Vec<Validator>,
}

impl Inner {
    /// The taken checks rendered ahead of the taking builder, so that the
    /// shape still reads `Number.Min(2).Catch(0)`.
    fn desc(&self) -> String {
        let mut out = String::new();
        for v in self.befores.iter().chain(self.afters.iter()) {
            if let Some(s) = &v.suffix {
                out.push_str(s);
                out.push('.');
            }
        }
        out
    }

    /// Validate the node as it stands, with the taken checks, in isolation,
    /// reporting the produced value and whatever failed.
    fn probe(&self, state: &mut State<'_>) -> (Value, ValidationError) {
        let mut val = state.value.clone();
        let mut sub = ValidationError::default();
        let mut w = Walk {
            ctx: state.ctx,
            is_match: state.is_match,
            path: state.path.to_vec(),
            path_arr: state.path_arr.to_vec(),
        };
        let kept = validate_node_with(
            state.node,
            &self.befores,
            &self.afters,
            state.node.silent,
            Cur::Mut(&mut val),
            state.key,
            state.parent_is_array,
            &mut w,
            &mut sub,
        );
        if !kept {
            val = Value::Undefined;
        }
        (val, sub)
    }
}

fn take_inner(n: &mut Node) -> Arc<Inner> {
    Arc::new(Inner {
        befores: std::mem::take(&mut n.befores),
        afters: std::mem::take(&mut n.afters),
    })
}

/// Catch: whatever fails inside is replaced with the fallback, raising
/// nothing.
pub(crate) fn catch_node(mut n: Node, fallback: Value) -> Node {
    let inner = take_inner(&mut n);
    let suffix = format!(
        "{}Catch({})",
        inner.desc(),
        crate::stringify::inline_value(&fallback)
    );
    let run = Arc::clone(&inner);
    let fb = fallback.clone();
    n.befores = vec![Validator {
        name: "Catch".to_string(),
        func: Arc::new(move |state: &mut State<'_>, update: &mut Update| {
            let (mut out, sub) = run.probe(state);
            if sub.has_any() {
                out = fb.clone();
            }
            update.val = Some(out);
            update.done = true;
            true
        }),
        args: vec![fallback],
        suffix: Some(suffix),
        inner: Some(inner),
    }];
    n
}

/// A Transform function: the produced value, and the state it was produced
/// in, to a new value.
pub type TransformFn = dyn Fn(Value, &mut State<'_>) -> Value + Send + Sync;

/// Transform: a valid value is replaced with a function of it. An invalid
/// one fails as it would have, with the same errors.
pub(crate) fn transform_node(mut n: Node, f: Arc<TransformFn>) -> Node {
    let inner = take_inner(&mut n);
    let suffix = format!("{}Transform", inner.desc());
    let run = Arc::clone(&inner);
    n.befores = vec![Validator {
        name: "Transform".to_string(),
        func: Arc::new(move |state: &mut State<'_>, update: &mut Update| {
            let (out, sub) = run.probe(state);
            if sub.has_any() {
                update.err = Some(UpdateErr::Fields(sub.issues));
                return false;
            }
            update.val = Some(f(out, state));
            update.done = true;
            true
        }),
        args: Vec::new(),
        suffix: Some(suffix),
        inner: Some(inner),
    }];
    n
}

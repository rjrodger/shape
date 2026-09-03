//! A discriminated union: the branch is chosen by the value of a tag
//! property and the value validated against that branch alone, so the
//! errors are its own rather than a list of every alternative.

use crate::builders::{buildize, fault_node};
use crate::context::{State, Update, UpdateErr};
use crate::error::ValidationError;
use crate::node::{Kind, Node, Validator};
use crate::normalize::literal_node;
use crate::spec::Spec;
use crate::validate::{validate_node, Cur, Walk};
use crate::value::{json_render, Value};
use std::sync::Arc;

/// The tag of a discriminated union and its branch names, sorted. The
/// branches themselves are the node's list, in that order.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Disc {
    pub tag: String,
    pub tags: Vec<String>,
}

/// A union choosing its branch by the value of the tag property. An
/// object-shaped branch without the tag property has it added, as the
/// literal it is keyed by.
pub fn discriminated<I, K, S>(tag: impl Into<String>, branches: I) -> Node
where
    I: IntoIterator<Item = (K, S)>,
    K: Into<String>,
    S: Into<Spec>,
{
    let tag = tag.into();
    let mut pairs: Vec<(String, Spec)> = branches
        .into_iter()
        .map(|(k, s)| (k.into(), s.into()))
        .collect();
    if tag.is_empty() || pairs.is_empty() {
        return fault_node("Discriminated needs a tag property name and at least one branch");
    }
    pairs.sort_by(|a, b| a.0.cmp(&b.0));

    let mut n = Node::of(Kind::List);
    n.required = true;
    n.required_set = true;
    let mut tags = Vec::with_capacity(pairs.len());
    for (name, spec) in pairs {
        let mut bn = buildize(spec);
        if bn.kind == Kind::Object && !bn.obj_children.contains_key(&tag) {
            bn.obj_children
                .insert(tag.clone(), literal_node(Value::Str(name.clone())));
        }
        tags.push(name);
        n.list.push(bn);
    }
    n.disc = Some(Disc {
        tag: tag.clone(),
        tags,
    });
    let chosen = tag.clone();
    n.befores.push(Validator {
        name: "Discriminated".to_string(),
        func: Arc::new(move |state: &mut State<'_>, update: &mut Update| {
            choose(&chosen, state, update)
        }),
        args: vec![Value::Str(tag)],
        suffix: None,
        inner: None,
    });
    n
}

fn choose(tag: &str, state: &mut State<'_>, update: &mut Update) -> bool {
    // Required or optional is for the structural check to say.
    if state.absent {
        return true;
    }
    let Some(tv) = state.value.as_obj().and_then(|m| m.get(tag)) else {
        update.err = Some(UpdateErr::Text(format!(
            "Value \"$VALUE\" for property \"$PATH\" is not an object with a \"{}\" property.",
            tag
        )));
        update.why = Some("Discriminated".to_string());
        return false;
    };
    let disc = state.node.disc.as_ref();
    let found = match (tv, disc) {
        (Value::Str(name), Some(d)) => d.tags.iter().position(|t| t == name),
        _ => None,
    };
    let Some(i) = found else {
        let names = disc.map(|d| d.tags.join(", ")).unwrap_or_default();
        update.err = Some(UpdateErr::Text(format!(
            "Value \"$VALUE\" for property \"$PATH\" has unknown \"{}\" {}, expected one of: {}.",
            tag,
            json_render(tv),
            names
        )));
        update.why = Some("Discriminated".to_string());
        return false;
    };
    let bn = &state.node.list[i];
    let mut val = state.value.clone();
    let mut sub = ValidationError::default();
    let mut w = Walk {
        ctx: state.ctx,
        defs: state.defs,
        is_match: state.is_match,
        path: state.path_arr.to_vec(),
        paths: true,
    };
    validate_node(
        bn,
        Cur::Mut(&mut val),
        state.key,
        state.parent_is_array,
        &mut w,
        &mut sub,
    );
    if sub.has_any() {
        update.err = Some(UpdateErr::Fields(sub.issues));
        return false;
    }
    update.val = Some(val);
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::builders::optional;
    use crate::node::Token;
    use crate::spec::obj;
    use crate::stringify::stringify_node;
    use crate::Schema;

    fn j(s: &str) -> Value {
        Value::from(serde_json::from_str::<serde_json::Value>(s).unwrap())
    }

    fn run(s: &Schema, input: &str) -> String {
        match s.validate(j(input)) {
            Ok(v) => serde_json::Value::from(v).to_string(),
            Err(e) => format!("ERR {}", e),
        }
    }

    fn pet() -> Node {
        discriminated(
            "kind",
            [
                ("fish", obj([("fins", Spec::from(Token::Number))])),
                ("dog", obj([("bark", Spec::from(Token::Boolean))])),
            ],
        )
    }

    #[test]
    fn chooses_the_branch_by_tag() {
        let s = Schema::new(obj([("p", Spec::from(pet()))]));
        assert_eq!(
            run(&s, r#"{"p":{"bark":true,"kind":"dog"}}"#),
            r#"{"p":{"bark":true,"kind":"dog"}}"#
        );
        assert_eq!(
            run(&s, r#"{"p":{"fins":"x","kind":"fish"}}"#),
            "ERR Validation failed for property \"p.fins\" with string \"x\" because the string is not of type number."
        );
        assert_eq!(
            run(&s, r#"{"p":{"kind":"dog"}}"#),
            "ERR Validation failed for property \"p.bark\" because the property is missing."
        );
        assert_eq!(
            run(&s, r#"{"p":{"bark":true}}"#),
            "ERR Value \"{bark:true}\" for property \"p\" is not an object with a \"kind\" property."
        );
        assert_eq!(
            run(&s, r#"{"p":{"kind":"cat"}}"#),
            "ERR Value \"{kind:cat}\" for property \"p\" has unknown \"kind\" \"cat\", expected one of: dog, fish."
        );
        assert_eq!(
            run(&s, r#"{"p":{"kind":1}}"#),
            "ERR Value \"{kind:1}\" for property \"p\" has unknown \"kind\" 1, expected one of: dog, fish."
        );
        assert_eq!(
            run(&s, r#"{"p":1}"#),
            "ERR Value \"1\" for property \"p\" is not an object with a \"kind\" property."
        );
        assert_eq!(
            run(&s, "{}"),
            "ERR Validation failed for property \"p\" because the property is missing."
        );
        assert_eq!(
            run(
                &Schema::new(obj([("p", Spec::from(optional(pet())))])),
                "{}"
            ),
            "{}"
        );
        assert!(s.valid(&j(r#"{"p":{"bark":true,"kind":"dog"}}"#)));
        assert!(!s.valid(&j(r#"{"p":{"kind":"cat"}}"#)));
        assert_eq!(
            s.error(&j(r#"{"p":{"kind":"cat"}}"#))[0].why,
            "Discriminated"
        );
        assert_eq!(
            stringify_node(&pet(), false),
            "Discriminated(kind,dog,fish)"
        );
        // A branch that is not an object carries no tag of its own.
        let s = Schema::new(discriminated("k", [("n", Spec::from(Token::Number))]));
        assert_eq!(
            run(&s, r#"{"k":"n"}"#),
            "ERR Validation failed for object \"{k:n}\" because the object is not of type number."
        );
        assert_eq!(
            run(&Schema::new(discriminated("", [("a", Spec::from(1))])), "1"),
            "ERR Discriminated needs a tag property name and at least one branch"
        );
        assert_eq!(
            run(
                &Schema::new(discriminated::<[(&str, Spec); 0], &str, Spec>("k", [])),
                "1"
            ),
            "ERR Discriminated needs a tag property name and at least one branch"
        );
        // A branch that declares the tag keeps its own declaration.
        let s = Schema::new(discriminated(
            "k",
            [("a", obj([("k", Spec::from(Token::String))]))],
        ));
        assert_eq!(run(&s, r#"{"k":"a"}"#), r#"{"k":"a"}"#);
    }
}

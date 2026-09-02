//! Object algebra: `pick`, `omit`, `partial` and `extend` build a new object
//! shape out of an existing one. The result is a fresh node, so the source
//! is left as it was and one base can be reshaped many times. Key
//! expressions in a source (`{"a: Min(2)": 0}`) are compiled on the way in,
//! since the algebra has to know the real property names.

use crate::builders::{buildize, fault_node};
use crate::node::{Kind, Node};
use crate::normalize::normalize;
use crate::spec::Spec;
use crate::value::Value;
use indexmap::IndexMap;

/// The property names an algebra builder is given: one, or a list.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Names(pub Vec<String>);

impl From<&str> for Names {
    fn from(s: &str) -> Self {
        Names(vec![s.to_string()])
    }
}
impl From<String> for Names {
    fn from(s: String) -> Self {
        Names(vec![s])
    }
}
impl From<Vec<String>> for Names {
    fn from(v: Vec<String>) -> Self {
        Names(v)
    }
}
impl From<Vec<&str>> for Names {
    fn from(v: Vec<&str>) -> Self {
        Names(v.into_iter().map(String::from).collect())
    }
}
impl<const N: usize> From<[&str; N]> for Names {
    fn from(v: [&str; N]) -> Self {
        Names(v.iter().map(|s| s.to_string()).collect())
    }
}

impl Names {
    /// The names as a value carries them: one string, or a list of strings.
    pub fn from_value(v: &Value, builder: &str) -> Result<Names, String> {
        match v {
            Value::Str(s) => Ok(Names(vec![s.clone()])),
            Value::Arr(items) => {
                let mut out = Vec::with_capacity(items.len());
                for item in items {
                    match item {
                        Value::Str(s) => out.push(s.clone()),
                        _ => return Err(format!("{} needs a list of property names", builder)),
                    }
                }
                Ok(Names(out))
            }
            _ => Err(format!("{} needs a list of property names", builder)),
        }
    }
}

/// The shape an algebra builder works on, which has to be an object.
fn object_base(spec: Spec, builder: &str) -> Result<Node, String> {
    let n = buildize(spec);
    if n.kind != Kind::Object {
        return Err(format!("{} needs an object shape", builder));
    }
    Ok(n)
}

/// The base's settings with just these properties, in this order. An object
/// default is narrowed to them too.
fn object_node(mut base: Node, children: IndexMap<String, Node>) -> Node {
    if let Value::Obj(dm) = &base.default {
        let mut nd = crate::value::Map::with_capacity(children.len());
        for k in children.keys() {
            if let Some(dv) = dm.get(k) {
                nd.insert(k.clone(), dv.clone());
            }
        }
        base.default = Value::Obj(nd);
    }
    base.obj_children = children;
    base.consumed.clear();
    base
}

pub(crate) fn pick_node(names: Names, spec: Spec) -> Result<Node, String> {
    let base = object_base(spec, "Pick")?;
    for k in &names.0 {
        if !base.obj_children.contains_key(k) {
            return Err(format!("Pick: unknown property \"{}\"", k));
        }
    }
    let children: IndexMap<String, Node> = base
        .obj_children
        .iter()
        .filter(|(k, _)| names.0.contains(k))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    Ok(object_node(base, children))
}

pub(crate) fn omit_node(names: Names, spec: Spec) -> Result<Node, String> {
    let base = object_base(spec, "Omit")?;
    let children: IndexMap<String, Node> = base
        .obj_children
        .iter()
        .filter(|(k, _)| !names.0.contains(k))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    Ok(object_node(base, children))
}

pub(crate) fn partial_node(spec: Spec) -> Result<Node, String> {
    let base = object_base(spec, "Partial")?;
    let children: IndexMap<String, Node> = base
        .obj_children
        .iter()
        .map(|(k, v)| {
            let mut cc = v.clone();
            cc.required = false;
            cc.required_set = true;
            (k.clone(), cc)
        })
        .collect();
    Ok(object_node(base, children))
}

pub(crate) fn extend_node(extra: Spec, spec: Spec) -> Result<Node, String> {
    let base = object_base(spec, "Extend")?;
    let ext = normalize(extra);
    if ext.kind != Kind::Object {
        return Err("Extend needs an object to extend with".to_string());
    }
    let mut children = base.obj_children.clone();
    for (k, cn) in ext.obj_children {
        children.insert(k, cn);
    }
    Ok(object_node(base, children))
}

fn or_fault(r: Result<Node, String>) -> Node {
    r.unwrap_or_else(fault_node)
}

/// Keep only the named properties of an object shape. Naming one the shape
/// does not declare is a fault: there is nothing there to pick.
pub fn pick(names: impl Into<Names>, spec: impl Into<Spec>) -> Node {
    or_fault(pick_node(names.into(), spec.into()))
}

/// Drop the named properties of an object shape. A name the shape does not
/// declare is simply not there to drop.
pub fn omit(names: impl Into<Names>, spec: impl Into<Spec>) -> Node {
    or_fault(omit_node(names.into(), spec.into()))
}

/// Make every declared property of an object shape optional, as `optional`
/// would: a type token then injects its empty value, a literal its own.
/// Shallow: a nested object's own properties are as they were.
pub fn partial(spec: impl Into<Spec>) -> Node {
    or_fault(partial_node(spec.into()))
}

/// Add the properties of another object shape; a property both declare
/// takes the extension's. The result stays open or closed as the base was.
pub fn extend(extra: impl Into<Spec>, spec: impl Into<Spec>) -> Node {
    or_fault(extend_node(extra.into(), spec.into()))
}

impl Node {
    pub fn pick(self, names: impl Into<Names>) -> Node {
        pick(names, self)
    }
    pub fn omit(self, names: impl Into<Names>) -> Node {
        omit(names, self)
    }
    pub fn partial(self) -> Node {
        partial(self)
    }
    pub fn extend(self, extra: impl Into<Spec>) -> Node {
        extend(extra, self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::builders::{any, open};
    use crate::node::Token;
    use crate::spec::obj;
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

    fn base() -> Spec {
        obj([
            ("a", Spec::from(1)),
            ("b", Spec::from(Token::String)),
            ("c", Spec::from(true)),
        ])
    }

    #[test]
    fn reshapes_objects() {
        assert_eq!(run(&Schema::new(pick(["a"], base())), "{}"), r#"{"a":1}"#);
        assert_eq!(run(&Schema::new(pick("a", base())), "{}"), r#"{"a":1}"#);
        assert_eq!(
            run(&Schema::new(pick(vec!["a", "c"], base())), r#"{"c":false}"#),
            r#"{"c":false,"a":1}"#
        );
        assert_eq!(
            run(&Schema::new(pick(vec!["b".to_string()], base())), "{}"),
            "ERR Validation failed for property \"b\" because the property is missing."
        );
        assert_eq!(
            run(&Schema::new(pick("z", base())), "{}"),
            "ERR Pick: unknown property \"z\""
        );
        assert_eq!(
            run(&Schema::new(pick("a", Token::Number)), "1"),
            "ERR Pick needs an object shape"
        );
        assert_eq!(
            run(&Schema::new(pick("a", open(base()))), r#"{"a":2,"z":1}"#),
            r#"{"a":2,"z":1}"#
        );
        assert_eq!(
            run(&Schema::new(omit(["b"], base())), "{}"),
            r#"{"a":1,"c":true}"#
        );
        assert_eq!(
            run(&Schema::new(omit(["z"], base())), r#"{"b":"x"}"#),
            r#"{"b":"x","a":1,"c":true}"#
        );
        assert_eq!(
            run(&Schema::new(omit(["b"], base())), r#"{"b":"x"}"#),
            "ERR Validation failed for object \"{b:x}\" because the property \"b\" is not allowed."
        );
        assert_eq!(
            run(&Schema::new(partial(base())), "{}"),
            r#"{"a":1,"b":"","c":true}"#
        );
        assert_eq!(
            run(&Schema::new(partial(any())), "{}"),
            "ERR Partial needs an object shape"
        );
        assert_eq!(
            run(
                &Schema::new(extend(obj([("d", Spec::from(2))]), base())),
                r#"{"b":"x"}"#
            ),
            r#"{"b":"x","a":1,"c":true,"d":2}"#
        );
        assert_eq!(
            run(
                &Schema::new(extend(obj([("a", Spec::from(Token::Number))]), base())),
                r#"{"b":"x"}"#
            ),
            "ERR Validation failed for property \"a\" because the property is missing."
        );
        assert_eq!(
            run(&Schema::new(extend(Token::Number, base())), "{}"),
            "ERR Extend needs an object to extend with"
        );
        // The source is left as it was, and the chain forms reshape too.
        let b = buildize(base());
        let picked = b.clone().pick("a");
        assert_eq!(b.obj_children.len(), 3);
        assert_eq!(picked.obj_children.len(), 1);
        assert_eq!(
            b.clone().omit(Names(vec!["a".into()])).obj_children.len(),
            2
        );
        assert!(!b.clone().partial().obj_children["b"].required);
        assert_eq!(b.extend(obj([("z", Spec::from(1))])).obj_children.len(), 4);
        // A default narrows with the shape.
        let mut d = buildize(base());
        d.has_default = true;
        d.default = j(r#"{"a":5,"b":"q","c":false}"#);
        let p = pick("a", d);
        assert_eq!(p.default, j(r#"{"a":5}"#));
        let mut bare = Node::of(Kind::Object);
        bare.obj_children.insert("a".into(), buildize(1));
        assert!(pick("a", bare).default.is_undefined());
        assert_eq!(
            Names::from_value(&j(r#"["a","b"]"#), "Pick").unwrap(),
            Names::from(["a", "b"])
        );
        assert_eq!(
            Names::from_value(&j("\"a\""), "Pick").unwrap(),
            Names::from("a")
        );
        assert_eq!(Names::from("a".to_string()), Names::from("a"));
        assert_eq!(Names::from(vec!["a".to_string()]), Names::from("a"));
        assert_eq!(
            Names::from_value(&j("[1]"), "Pick").unwrap_err(),
            "Pick needs a list of property names"
        );
        assert_eq!(
            Names::from_value(&j("1"), "Omit").unwrap_err(),
            "Omit needs a list of property names"
        );
    }
}

//! Standard Schema V1 interoperability (https://standardschema.dev/): a
//! version, a vendor, and a validate that never fails, reporting either the
//! produced value or a list of issues.

use crate::context::PathPart;
use crate::value::Value;
use crate::Schema;

/// The Standard Schema surface of a compiled shape.
#[derive(Clone, Debug)]
pub struct StandardSchema<'s> {
    /// Always 1.
    pub version: u32,
    /// Always "shape".
    pub vendor: &'static str,
    schema: &'s Schema,
}

/// A Standard Schema issue: a message and the path to the offending value.
#[derive(Clone, Debug, PartialEq)]
pub struct StandardIssue {
    pub message: String,
    pub path: Vec<PathPart>,
}

/// The outcome of a Standard Schema validation: the produced value, or the
/// issues, never both.
#[derive(Clone, Debug, PartialEq)]
pub struct StandardResult {
    pub value: Option<Value>,
    pub issues: Vec<StandardIssue>,
}

impl<'s> StandardSchema<'s> {
    /// Validate without failing: the issues are the result.
    pub fn validate(&self, input: Value) -> StandardResult {
        match self.schema.validate(input) {
            Ok(value) => StandardResult {
                value: Some(value),
                issues: Vec::new(),
            },
            Err(e) => StandardResult {
                value: None,
                issues: e
                    .issues
                    .into_iter()
                    .map(|i| StandardIssue {
                        message: i.text,
                        path: i.path_arr,
                    })
                    .collect(),
            },
        }
    }
}

impl Schema {
    /// The Standard Schema V1 surface of this schema.
    pub fn standard(&self) -> StandardSchema<'_> {
        StandardSchema {
            version: 1,
            vendor: "shape",
            schema: self,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node::Token;
    use crate::spec::obj;
    use crate::Spec;

    #[test]
    fn reports_issues_or_a_value() {
        let s = Schema::new(obj([("a", Spec::from(Token::Number))]));
        let std = s.standard();
        assert_eq!((std.version, std.vendor), (1, "shape"));
        let ok = std.validate(Value::from(serde_json::json!({"a": 1})));
        assert!(ok.issues.is_empty() && ok.value.is_some());
        let bad = std.validate(Value::from(serde_json::json!({"a": "x"})));
        assert!(bad.value.is_none());
        assert_eq!(bad.issues[0].path, vec![PathPart::Key("a".into())]);
        assert!(bad.issues[0].message.contains("not of type number"));
    }
}

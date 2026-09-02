//! Errors: one per failing value, with the text TypeScript renders for it.

use crate::context::{join_path, PathPart};
use crate::node::Kind;
use crate::value::{value_kind, value_to_string, Map, Value};
use std::fmt;

/// The marks TypeScript gives its structural errors.
pub const MARK_OBJECT_REQUIRED: i64 = 1010;
pub const MARK_OBJECT_TYPE: i64 = 1020;
pub const MARK_ARRAY_REQUIRED: i64 = 1030;
pub const MARK_ARRAY_TYPE: i64 = 1040;
pub const MARK_CHECK_TYPE: i64 = 1045;
pub const MARK_SCALAR_TYPE: i64 = 1050;
pub const MARK_SCALAR_REQUIRED: i64 = 1060;
pub const MARK_NEVER: i64 = 1070;
pub const MARK_REGEXP: i64 = 1045;
pub const MARK_UNDEF_REQUIRED: i64 = 1080;
pub const MARK_ARRAY_CLOSED: i64 = 1090;
pub const MARK_OBJECT_CLOSED: i64 = 1100;
pub const MARK_CUSTOM_CHECK_ERR: i64 = 2010;
pub const MARK_CUSTOM_CHECK_TEXT: i64 = 4000;

/// The why codes.
pub const WHY_TYPE: &str = "type";
pub const WHY_REQUIRED: &str = "required";
pub const WHY_CLOSED: &str = "closed";
pub const WHY_CHECK: &str = "check";
pub const WHY_NEVER: &str = "never";
pub const WHY_REGEXP: &str = "regexp";

/// One validation failure.
#[derive(Clone, Debug, Default)]
pub struct FieldError {
    /// The dotted path of the failing value.
    pub path: String,
    /// The path as parts: array indices as indices, keys as keys.
    pub path_arr: Vec<PathPart>,
    /// The immediate key or index.
    pub key: String,
    /// The kind of the node that ran the check.
    pub kind: Kind,
    /// The failing value.
    pub value: Value,
    pub why: String,
    pub mark: i64,
    /// The message.
    pub text: String,
    /// Extra context of a custom check.
    pub args: Map,
    /// The name of the failing check.
    pub check: String,
    pub(crate) parent_arr: bool,
    pub(crate) absent: bool,
    pub(crate) regexp_src: String,
    pub(crate) plural: bool,
    pub(crate) terse: bool,
}

impl fmt::Display for FieldError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if !self.text.is_empty() {
            return f.write_str(&self.text);
        }
        if self.path.is_empty() {
            f.write_str(&self.why)
        } else {
            write!(f, "{}: {}", self.path, self.why)
        }
    }
}

/// The errors of one validation.
#[derive(Clone, Debug, Default)]
pub struct ValidationError {
    pub issues: Vec<FieldError>,
    /// A terse collector counts rather than stores.
    pub(crate) terse: bool,
    pub(crate) n: usize,
}

impl ValidationError {
    pub(crate) fn add(&mut self, err: FieldError) {
        if self.terse {
            self.n += 1;
            return;
        }
        self.issues.push(err);
    }

    pub fn has_any(&self) -> bool {
        self.n > 0 || !self.issues.is_empty()
    }
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let parts: Vec<String> = self.issues.iter().map(|e| e.to_string()).collect();
        f.write_str(&parts.join("\n"))
    }
}

impl std::error::Error for ValidationError {}

/// Where an error happened: what `make_err` needs of the state.
pub(crate) struct At<'a> {
    pub path: &'a [String],
    pub path_arr: &'a [PathPart],
    pub key: &'a str,
    pub kind: Kind,
    pub value: &'a Value,
    pub parent_arr: bool,
    pub absent: bool,
    pub check: &'a str,
    pub regexp_src: Option<String>,
    pub terse: bool,
}

/// An error at `at`, with the default text for `why` or the `text` given
/// (`$PATH` and `$VALUE` expanded).
pub(crate) fn make_err(at: &At<'_>, why: &str, mark: i64, text: &str) -> FieldError {
    let why = if why.is_empty() { WHY_CHECK } else { why };
    let mark = if mark == 0 {
        MARK_CUSTOM_CHECK_TEXT
    } else {
        mark
    };
    if at.terse {
        return FieldError {
            key: at.key.to_string(),
            kind: at.kind,
            value: at.value.clone(),
            why: why.to_string(),
            mark,
            check: at.check.to_string(),
            terse: true,
            ..Default::default()
        };
    }
    let path = join_path(at.path);
    let mut err = FieldError {
        path,
        path_arr: at.path_arr.to_vec(),
        key: at.key.to_string(),
        kind: at.kind,
        value: at.value.clone(),
        why: why.to_string(),
        mark,
        check: at.check.to_string(),
        parent_arr: at.parent_arr,
        absent: at.absent,
        regexp_src: at.regexp_src.clone().unwrap_or_default(),
        ..Default::default()
    };
    err.text = if text.is_empty() {
        default_err_text(&err)
    } else {
        expand_err_text(text, &err.path, at.value, at.absent)
    };
    err
}

/// Expand a message template: `$PATH` and `$VALUE`, a missing value as
/// "undefined".
pub(crate) fn expand_err_text(text: &str, path: &str, val: &Value, absent: bool) -> String {
    let valstr = if absent {
        "undefined".to_string()
    } else {
        value_to_string(val)
    };
    text.replace("$PATH", path).replace("$VALUE", &valstr)
}

/// The text of a structural error, as TypeScript renders it.
pub(crate) fn default_err_text(e: &FieldError) -> String {
    let mut valstr = value_to_string(&e.value);
    let mut valkind = value_kind(&e.value);
    if e.absent {
        valstr = "undefined".to_string();
        valkind = "value";
    }
    // "index" when the value renders as an array or its parent is one.
    let propkind = if e.parent_arr || valstr.starts_with('[') {
        "index"
    } else {
        "property"
    };
    let path_part = if e.path.is_empty() {
        String::new()
    } else {
        format!("{} \"{}\" with ", propkind, e.path)
    };
    let head = format!(
        "Validation failed for {}{} \"{}\"",
        path_part, valkind, valstr
    );
    match e.why.as_str() {
        WHY_TYPE => format!(
            "{} because the {} is not of type {}.",
            head, valkind, e.kind
        ),
        WHY_REQUIRED => {
            // A property that is not there is named, not rendered.
            if e.absent && !e.path.is_empty() {
                let noun = if propkind == "index" {
                    "element"
                } else {
                    "property"
                };
                return format!(
                    "Validation failed for {} \"{}\" because the {} is missing.",
                    propkind, e.path, noun
                );
            }
            if matches!(e.value, Value::Str(ref s) if s.is_empty()) {
                format!("{} because an empty string is not allowed.", head)
            } else if e.value.is_null() || e.absent {
                format!("{} because the value is required.", head)
            } else {
                format!("{} because the {} is required.", head, valkind)
            }
        }
        WHY_CLOSED => {
            let (noun, verb) = if e.plural {
                ("properties", "are")
            } else {
                (propkind, "is")
            };
            format!(
                "{} because the {} \"{}\" {} not allowed.",
                head, noun, e.key, verb
            )
        }
        WHY_NEVER => format!("{} because no value is allowed.", head),
        WHY_REGEXP => format!(
            "{} because the {} did not match {}.",
            head, valkind, e.regexp_src
        ),
        _ => {
            let name = if e.check.is_empty() {
                e.why.as_str()
            } else {
                e.check.as_str()
            };
            format!("{} because check \"{}\" failed.", head, name)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at<'a>(path: &'a [String], value: &'a Value, absent: bool) -> At<'a> {
        At {
            path,
            path_arr: &[],
            key: "k",
            kind: Kind::String,
            value,
            parent_arr: false,
            absent,
            check: "",
            regexp_src: None,
            terse: false,
        }
    }

    #[test]
    fn texts() {
        let p = vec!["a".to_string()];
        let v = Value::from(1);
        let e = make_err(&at(&p, &v, false), WHY_TYPE, MARK_SCALAR_TYPE, "");
        assert_eq!(e.text, "Validation failed for property \"a\" with number \"1\" because the number is not of type string.");
        assert_eq!(e.to_string(), e.text);
        let e = make_err(&at(&p, &Value::Undefined, true), WHY_REQUIRED, 0, "");
        assert_eq!(
            e.text,
            "Validation failed for property \"a\" because the property is missing."
        );
        assert_eq!(e.mark, MARK_CUSTOM_CHECK_TEXT);
        let e = make_err(&at(&[], &Value::Undefined, true), WHY_REQUIRED, 1, "");
        assert_eq!(
            e.text,
            "Validation failed for value \"undefined\" because the value is required."
        );
        let e = make_err(&at(&p, &Value::from(""), false), WHY_REQUIRED, 1, "");
        assert_eq!(e.text, "Validation failed for property \"a\" with string \"\" because an empty string is not allowed.");
        let e = make_err(&at(&p, &Value::Null, false), WHY_REQUIRED, 1, "");
        assert_eq!(e.text, "Validation failed for property \"a\" with value \"null\" because the value is required.");
        let e = make_err(&at(&p, &Value::from(2), false), WHY_REQUIRED, 1, "");
        assert_eq!(e.text, "Validation failed for property \"a\" with number \"2\" because the number is required.");
        let mut e = make_err(&at(&p, &v, false), WHY_CLOSED, 1, "");
        e.plural = true;
        e.key = "x, y".into();
        assert_eq!(default_err_text(&e), "Validation failed for property \"a\" with number \"1\" because the properties \"x, y\" are not allowed.");
        e.plural = false;
        assert_eq!(default_err_text(&e), "Validation failed for property \"a\" with number \"1\" because the property \"x, y\" is not allowed.");
        let e = make_err(&at(&p, &v, false), WHY_NEVER, 1, "");
        assert_eq!(
            e.text,
            "Validation failed for property \"a\" with number \"1\" because no value is allowed."
        );
        let mut a = at(&p, &v, false);
        a.regexp_src = Some("/x/".into());
        let e = make_err(&a, WHY_REGEXP, 1, "");
        assert_eq!(e.text, "Validation failed for property \"a\" with number \"1\" because the number did not match /x/.");
        let mut a = at(&p, &v, false);
        a.check = "Min";
        let e = make_err(&a, "", 1, "");
        assert_eq!(
            e.text,
            "Validation failed for property \"a\" with number \"1\" because check \"Min\" failed."
        );
        let e = make_err(&at(&p, &v, false), "why", 1, "");
        assert_eq!(
            e.text,
            "Validation failed for property \"a\" with number \"1\" because check \"why\" failed."
        );
        let e = make_err(
            &at(&p, &v, false),
            "why",
            1,
            "Value \"$VALUE\" at \"$PATH\" is bad.",
        );
        assert_eq!(e.text, "Value \"1\" at \"a\" is bad.");
        assert_eq!(
            expand_err_text("$VALUE", "", &Value::Null, true),
            "undefined"
        );
        let arr = Value::Arr(vec![Value::from(1)]);
        let e = make_err(&at(&p, &arr, false), WHY_TYPE, 1, "");
        assert_eq!(e.text, "Validation failed for index \"a\" with array \"[1]\" because the array is not of type string.");
        let mut a = at(&p, &v, false);
        a.parent_arr = true;
        a.absent = true;
        let e = make_err(&a, WHY_REQUIRED, 1, "");
        assert_eq!(
            e.text,
            "Validation failed for index \"a\" because the element is missing."
        );
        let mut a = at(&p, &v, false);
        a.terse = true;
        let e = make_err(&a, WHY_TYPE, 1, "");
        assert!(e.terse && e.text.is_empty() && e.path.is_empty());
        let plain = FieldError {
            path: "a".into(),
            why: "w".into(),
            ..Default::default()
        };
        assert_eq!(plain.to_string(), "a: w");
        let plain = FieldError {
            why: "w".into(),
            ..Default::default()
        };
        assert_eq!(plain.to_string(), "w");
    }

    #[test]
    fn collector() {
        let mut v = ValidationError::default();
        assert!(!v.has_any());
        v.add(FieldError {
            text: "a".into(),
            ..Default::default()
        });
        v.add(FieldError {
            text: "b".into(),
            ..Default::default()
        });
        assert_eq!(v.to_string(), "a\nb");
        let mut t = ValidationError {
            terse: true,
            ..Default::default()
        };
        t.add(FieldError::default());
        t.add(FieldError::default());
        assert!(t.has_any() && t.issues.is_empty() && t.n == 2);
        let _: &dyn std::error::Error = &v;
    }
}

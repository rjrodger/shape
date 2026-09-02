//! The compiled form of a spec: a tree of nodes, each a kind with its flags,
//! its children and its validators.

use crate::context::{State, Update};
use crate::value::Value;
use indexmap::IndexMap;
use regex::Regex;
use std::fmt;
use std::sync::Arc;

/// The kind of value a node accepts. The names are the TypeScript ones,
/// which the messages use.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Default)]
pub enum Kind {
    #[default]
    Any,
    String,
    Number,
    Boolean,
    Object,
    Array,
    Null,
    NaN,
    Function,
    Never,
    Check,
    Regexp,
    Integer,
    Date,
    BigInt,
    List,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Any => "any",
            Kind::String => "string",
            Kind::Number => "number",
            Kind::Boolean => "boolean",
            Kind::Object => "object",
            Kind::Array => "array",
            Kind::Null => "null",
            Kind::NaN => "nan",
            Kind::Function => "function",
            Kind::Never => "never",
            Kind::Check => "check",
            Kind::Regexp => "regexp",
            Kind::Integer => "integer",
            Kind::Date => "date",
            Kind::BigInt => "bigint",
            Kind::List => "list",
        }
    }
}

impl Kind {
    /// The kind of a name, as `as_str` renders it, or as a type token is
    /// written ("String").
    pub fn from_name(name: &str) -> Option<Kind> {
        ALL_KINDS
            .iter()
            .copied()
            .find(|k| k.as_str() == name || k.as_str().eq_ignore_ascii_case(name))
    }
}

const ALL_KINDS: [Kind; 16] = [
    Kind::Any,
    Kind::String,
    Kind::Number,
    Kind::Boolean,
    Kind::Object,
    Kind::Array,
    Kind::Null,
    Kind::NaN,
    Kind::Function,
    Kind::Never,
    Kind::Check,
    Kind::Regexp,
    Kind::Integer,
    Kind::Date,
    Kind::BigInt,
    Kind::List,
];

impl fmt::Display for Kind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A type token: the required kind a spec names by its constructor in
/// TypeScript (`String`, `Number`, ...).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Token {
    Any,
    String,
    Number,
    Boolean,
    Object,
    Array,
    Function,
    Integer,
    Date,
    BigInt,
}

impl Token {
    pub fn kind(self) -> Kind {
        match self {
            Token::Any => Kind::Any,
            Token::String => Kind::String,
            Token::Number => Kind::Number,
            Token::Boolean => Kind::Boolean,
            Token::Object => Kind::Object,
            Token::Array => Kind::Array,
            Token::Function => Kind::Function,
            Token::Integer => Kind::Integer,
            Token::Date => Kind::Date,
            Token::BigInt => Kind::BigInt,
        }
    }
}

/// How a composition node judges its branches.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum ListMode {
    #[default]
    None,
    One,
    Some,
    All,
}

/// The function of a custom validator: the current state and an update to
/// fill in; true to pass.
pub type ValidatorFn = dyn Fn(&mut State<'_>, &mut Update) -> bool + Send + Sync;

/// A custom check attached to a node, before or after its structural check.
#[derive(Clone)]
pub struct Validator {
    pub name: String,
    pub func: Arc<ValidatorFn>,
    pub args: Vec<Value>,
    /// The `.Name(args)` suffix the validator renders as in a spec text.
    pub suffix: Option<String>,
    /// The checks a Catch or Transform took inside.
    pub inner: Option<Arc<crate::isolate::Inner>>,
}

impl fmt::Debug for Validator {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Validator({})", self.name)
    }
}

/// A node of the compiled tree.
#[derive(Clone, Debug, Default)]
pub struct Node {
    pub kind: Kind,
    pub required: bool,
    pub required_set: bool,
    /// Optional and no default injection (`p` in TypeScript).
    pub skippable: bool,
    /// Errors raised on or below this node are dropped (`e: false`).
    pub silent: bool,
    /// The empty string is allowed.
    pub empty: bool,
    /// An explicit null is accepted as the value.
    pub nullable: bool,
    pub has_default: bool,
    /// Injected for a missing optional property.
    pub default: Value,
    /// The declarative value the node was built from, when it was one.
    pub literal: Option<Value>,

    /// Object children, in the order the spec declared them.
    pub obj_children: IndexMap<String, Node>,
    /// The shape of an unknown key (an open object); none for a closed one.
    pub obj_rest: Option<Box<Node>>,
    /// The keys a closed object accepts: its declared keys, the targets of
    /// its renames and the sources they claim. Set when the tree is
    /// prepared.
    pub consumed: std::collections::HashSet<String>,
    /// The declared keys in order, shared with the paths that name them.
    /// Set when the tree is prepared.
    pub obj_keys: Vec<Arc<str>>,
    /// Nothing but the structural check applies to a present value: no
    /// validator, rename, regexp or silence. Set when the tree is prepared,
    /// and lets a walk judge such a value in place.
    pub plain: bool,

    /// The fixed positions of a tuple.
    pub arr_children: Vec<Node>,
    /// The shape of every element after the fixed positions.
    pub arr_child: Option<Box<Node>>,
    /// A `Rest` appended to an array.
    pub arr_rest: Option<Box<Node>>,

    pub befores: Vec<Validator>,
    pub afters: Vec<Validator>,

    /// The pattern of a `Regexp` node.
    pub regexp: Option<Regex>,
    /// The pattern as written, in the shared subset: what renders and exports.
    pub regexp_src: String,
    /// A `Fault` message overriding the structural text.
    pub fault_msg: Option<String>,
    /// Made by a builder given a wrong argument, as against a deliberate
    /// `fault`: the string form refuses such a node.
    pub arg_fault: bool,

    pub list_mode: ListMode,
    pub list: Vec<Node>,
    /// A Discriminated union: the tag it chooses by, and its branch names,
    /// which are the list in that order.
    pub disc: Option<crate::discriminated::Disc>,

    pub exact_vals: Vec<Value>,
    pub has_exact: bool,

    pub define_name: Option<String>,
    pub refer_name: Option<String>,
    pub refer_fill: bool,

    pub rename_to: Option<String>,
    pub rename_keep: bool,
    pub rename_claim: Vec<String>,

    /// Free-form metadata from `x$$` sidecar keys.
    pub meta: IndexMap<String, Value>,
}

impl Node {
    pub fn of(kind: Kind) -> Node {
        Node {
            kind,
            ..Default::default()
        }
    }

    /// Whether the object accepts keys it does not declare.
    pub fn is_open(&self) -> bool {
        self.obj_rest.is_some()
    }

    /// An `Ignore` node: optional, no default injection, and silent.
    pub fn is_ignore(&self) -> bool {
        self.silent && self.skippable
    }

    /// The empty value of a kind (`EMPTY_VAL` in TypeScript).
    pub fn zero_for(kind: Kind) -> Value {
        match kind {
            Kind::String => Value::Str(String::new()),
            Kind::Number | Kind::Integer => Value::Num(0.0),
            Kind::Boolean => Value::Bool(false),
            Kind::Object => Value::Obj(Default::default()),
            Kind::Array => Value::Arr(Vec::new()),
            _ => Value::Undefined,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kinds_and_tokens_name_themselves() {
        let all = [
            Kind::Any,
            Kind::String,
            Kind::Number,
            Kind::Boolean,
            Kind::Object,
            Kind::Array,
            Kind::Null,
            Kind::NaN,
            Kind::Function,
            Kind::Never,
            Kind::Check,
            Kind::Regexp,
            Kind::Integer,
            Kind::Date,
            Kind::BigInt,
            Kind::List,
        ];
        let names: Vec<String> = all.iter().map(|k| k.to_string()).collect();
        assert_eq!(names.join(","), "any,string,number,boolean,object,array,null,nan,function,never,check,regexp,integer,date,bigint,list");
        let tokens = [
            Token::Any,
            Token::String,
            Token::Number,
            Token::Boolean,
            Token::Object,
            Token::Array,
            Token::Function,
            Token::Integer,
            Token::Date,
            Token::BigInt,
        ];
        let kinds: Vec<&str> = tokens.iter().map(|t| t.kind().as_str()).collect();
        assert_eq!(
            kinds.join(","),
            "any,string,number,boolean,object,array,function,integer,date,bigint"
        );
        assert_eq!(Node::default().kind, Kind::Any);
        assert_eq!(Node::default().list_mode, ListMode::None);
        assert!(!Node::of(Kind::Object).is_open());
        let v = Validator {
            name: "x".into(),
            func: Arc::new(|_, _| true),
            args: vec![],
            suffix: None,
            inner: None,
        };
        assert_eq!(format!("{:?}", v), "Validator(x)");
        assert_eq!(Node::zero_for(Kind::String), Value::Str(String::new()));
        assert_eq!(Node::zero_for(Kind::Integer), Value::Num(0.0));
        assert_eq!(Node::zero_for(Kind::Boolean), Value::Bool(false));
        assert_eq!(Node::zero_for(Kind::Object), Value::Obj(Default::default()));
        assert_eq!(Node::zero_for(Kind::Array), Value::Arr(vec![]));
        assert_eq!(Node::zero_for(Kind::Date), Value::Undefined);
    }
}

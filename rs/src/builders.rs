//! The builders: functions that take a spec and return a node with the
//! builder's rule applied, and the same as methods on a node so they chain.

use crate::node::{Kind, Node};
use crate::normalize::normalize;
use crate::spec::Spec;
use crate::value::Value;

/// A spec as a node: what every builder starts from.
pub fn buildize(spec: impl Into<Spec>) -> Node {
    normalize(spec.into())
}

/// A required `Any`, the node a builder with no spec starts from.
pub fn any() -> Node {
    Node::of(Kind::Any)
}

/// The value must be present.
pub fn required(spec: impl Into<Spec>) -> Node {
    buildize(spec).required()
}

/// The value may be absent; the default is injected.
pub fn optional(spec: impl Into<Spec>) -> Node {
    buildize(spec).optional()
}

/// Optional, with an explicit default. The node is the spec's when one is
/// given, so an object or array shape keeps its children; the default is
/// only the value.
pub fn default(dval: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).default_to(dval)
}

/// A default with no spec: the node takes the default's kind.
pub fn default_of(dval: impl Into<Value>) -> Node {
    let dval = dval.into();
    let mut n = normalize(Spec::Value(dval.clone()));
    n.required = false;
    n.has_default = true;
    n.default = dval;
    n.skippable = false;
    n
}

/// Optional, and an absent value leaves the key out.
pub fn skip(spec: impl Into<Spec>) -> Node {
    buildize(spec).skip()
}

/// Like `skip`, and a value that fails is dropped with its errors.
pub fn ignore(spec: impl Into<Spec>) -> Node {
    buildize(spec).ignore()
}

/// The empty string is allowed.
pub fn empty(spec: impl Into<Spec>) -> Node {
    buildize(spec).empty()
}

/// An explicit null is accepted as the value.
pub fn nullable(spec: impl Into<Spec>) -> Node {
    buildize(spec).nullable()
}

/// An object accepts keys it does not declare.
pub fn open(spec: impl Into<Spec>) -> Node {
    buildize(spec).open()
}

/// An object rejects keys it does not declare.
pub fn closed(spec: impl Into<Spec>) -> Node {
    buildize(spec).closed()
}

/// The shape of every unknown object value, or of every array element.
pub fn child(child: impl Into<Spec>, spec: impl Into<Spec>) -> Node {
    buildize(spec).child(child)
}

/// A `Fault` message overriding the structural text.
pub fn fault(msg: impl Into<String>, spec: impl Into<Spec>) -> Node {
    buildize(spec).fault(msg)
}

/// A node that accepts nothing.
pub fn never(spec: impl Into<Spec>) -> Node {
    buildize(spec).never()
}

impl Node {
    pub fn required(mut self) -> Node {
        self.required = true;
        self.required_set = true;
        self.skippable = false;
        self
    }

    pub fn optional(mut self) -> Node {
        self.required = false;
        self.required_set = true;
        self.skippable = false;
        self
    }

    /// Optional with the default; named to leave `Default::default` alone.
    pub fn default_to(mut self, dval: impl Into<Value>) -> Node {
        let dval = dval.into();
        if self.kind == Kind::Any {
            // An untyped node takes the default's kind.
            let mut n = normalize(Spec::Value(dval.clone()));
            n.befores = std::mem::take(&mut self.befores);
            n.afters = std::mem::take(&mut self.afters);
            n.fault_msg = self.fault_msg.take();
            n.empty = n.empty || self.empty;
            n.nullable = self.nullable;
            self = n;
        }
        self.required = false;
        self.has_default = true;
        self.default = dval;
        self.skippable = false;
        self
    }

    pub fn skip(mut self) -> Node {
        self.required = false;
        self.skippable = true;
        self
    }

    pub fn ignore(mut self) -> Node {
        self.required = false;
        self.skippable = true;
        self.silent = true;
        self
    }

    pub fn empty(mut self) -> Node {
        self.empty = true;
        self
    }

    pub fn nullable(mut self) -> Node {
        self.nullable = true;
        self
    }

    pub fn open(mut self) -> Node {
        if self.obj_rest.is_none() {
            self.obj_rest = Some(Box::new(Node::of(Kind::Any)));
        }
        self
    }

    pub fn closed(mut self) -> Node {
        self.obj_rest = None;
        self
    }

    pub fn child(mut self, child: impl Into<Spec>) -> Node {
        let cn = Box::new(buildize(child));
        if self.kind == Kind::Array {
            self.arr_child = Some(cn);
        } else {
            self.obj_rest = Some(cn);
        }
        self
    }

    pub fn fault(mut self, msg: impl Into<String>) -> Node {
        self.fault_msg = Some(msg.into());
        self
    }

    pub fn never(mut self) -> Node {
        self.kind = Kind::Never;
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::node::Token;
    use crate::spec::obj;

    #[test]
    fn flags() {
        assert!(required(Token::Any).required);
        assert!(!optional(Token::String).required);
        let d = default(5, Token::Number);
        assert!(!d.required && d.has_default && d.default == Value::Num(5.0));
        let d = default(5, any());
        assert_eq!(d.kind, Kind::Number);
        let d = default_of("x");
        assert!(d.kind == Kind::String && d.default == Value::Str("x".into()));
        assert!(skip(Token::String).skippable);
        let i = ignore(Token::String);
        assert!(i.is_ignore());
        assert!(empty(Token::String).empty);
        assert!(nullable(Token::String).nullable);
        assert!(open(obj([("a", 1)])).is_open());
        assert!(!closed(Token::Object).is_open());
        assert!(child(Token::Number, obj([("a", 1)])).obj_rest.is_some());
        assert!(child(Token::Number, Token::Array).arr_child.is_some());
        assert_eq!(fault("m", 1).fault_msg.as_deref(), Some("m"));
        assert_eq!(never(1).kind, Kind::Never);
        assert_eq!(any().kind, Kind::Any);
        assert!(open(open(Token::Object)).is_open());
    }
}

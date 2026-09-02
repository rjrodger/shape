//! The builders: functions that take a spec and return a node with the
//! builder's rule applied, and the same as methods on a node so they chain.
//!
//! A builder given a wrong argument returns a node that accepts nothing and
//! says why at validation, since a Rust builder cannot throw as the
//! canonical one does; a chain method on such an argument turns its node
//! into that fault.

use crate::coerce::coerce_validator;
use crate::context::{State, Update, UpdateErr};
use crate::error::{MARK_CHECK_TYPE, WHY_CHECK};
use crate::format::{
    with_format, FMT_DATE_TIME, FMT_EMAIL, FMT_IP, FMT_IPV4, FMT_IPV6, FMT_URL, FMT_UUID,
};
use crate::isolate::{catch_node, transform_node, TransformFn};
use crate::node::{Kind, ListMode, Node, Token, Validator};
use crate::normalize::{normalize, type_token_node};
use crate::spec::Spec;
use crate::value::{is_integer, js_date_string, js_number, json_render, json_text, Value};
use regex::Regex;
use std::sync::Arc;

/// A spec as a node: what every builder starts from.
pub fn buildize(spec: impl Into<Spec>) -> Node {
    normalize(spec.into())
}

/// An optional `Any`, the node a builder with no spec starts from.
pub fn any() -> Node {
    Node::of(Kind::Any)
}

/// A node that accepts nothing and says why: what a builder returns when
/// called wrongly.
pub(crate) fn fault_node(msg: impl Into<String>) -> Node {
    let mut n = Node::of(Kind::Never);
    n.fault_msg = Some(msg.into());
    n.arg_fault = true;
    n
}

pub(crate) fn is_fault(n: &Node) -> bool {
    n.arg_fault
}

fn validator(
    name: &str,
    suffix: Option<String>,
    args: Vec<Value>,
    f: impl Fn(&mut State<'_>, &mut Update) -> bool + Send + Sync + 'static,
) -> Validator {
    Validator {
        name: name.to_string(),
        func: Arc::new(f),
        args,
        suffix,
        inner: None,
    }
}

// The free functions: each takes the spec it applies to. Pass `any()` for
// the bare form.

/// The value must be present.
pub fn required(spec: impl Into<Spec>) -> Node {
    buildize(spec).required()
}

/// The value may be absent; the default is injected.
pub fn optional(spec: impl Into<Spec>) -> Node {
    buildize(spec).optional()
}

/// Optional, with an explicit default. The node is the spec's, so an object
/// or array shape keeps its children; an untyped spec takes the default's
/// kind.
pub fn default(dval: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).default_to(dval)
}

/// A default with no spec: the node takes the default's kind.
pub fn default_of(dval: impl Into<Value>) -> Node {
    let dval = dval.into();
    normalize(Spec::Value(dval.clone())).default_to(dval)
}

/// Optional, and an absent value leaves the key out.
pub fn skip(spec: impl Into<Spec>) -> Node {
    buildize(spec).skip()
}

/// Like `skip`, and a value that fails is dropped with its errors.
pub fn ignore(spec: impl Into<Spec>) -> Node {
    buildize(spec).ignore()
}

/// The empty string is allowed. Untyped when bare: `empty(any())` allows
/// the empty string without also demanding a string.
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

/// An object rejects keys it does not declare; a single-shape array becomes
/// a tuple of one.
pub fn closed(spec: impl Into<Spec>) -> Node {
    buildize(spec).closed()
}

/// The shape of every unknown object value, or of every array element.
pub fn child(child: impl Into<Spec>, spec: impl Into<Spec>) -> Node {
    buildize(spec).child(child)
}

/// The shape of the array elements past the tuple positions.
pub fn rest(child: impl Into<Spec>, spec: impl Into<Spec>) -> Node {
    buildize(spec).rest(child)
}

/// A `Fault` message overriding the structural text.
pub fn fault(msg: impl Into<String>, spec: impl Into<Spec>) -> Node {
    buildize(spec).fault(msg)
}

/// A node that accepts nothing.
pub fn never(spec: impl Into<Spec>) -> Node {
    buildize(spec).never()
}

/// The kind the node asserts, given a kind, a token, a kind name or a node
/// to take it from.
pub fn type_(kind: impl Into<TypeRef>, spec: impl Into<Spec>) -> Node {
    buildize(spec).type_(kind)
}

/// A function-typed value. A builder, not a type token, so it does not
/// require a value of itself.
pub fn func(spec: impl Into<Spec>) -> Node {
    buildize(spec).func()
}

/// The value must equal one of the literals.
pub fn exact<I>(vals: I) -> Node
where
    I: IntoIterator,
    I::Item: Into<Value>,
{
    any().exact(vals)
}

/// A minimum value, or length.
pub fn min(bound: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).min(bound)
}

/// A maximum value, or length.
pub fn max(bound: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).max(bound)
}

/// A strict lower bound on value, or length.
pub fn above(bound: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).above(bound)
}

/// A strict upper bound on value, or length.
pub fn below(bound: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).below(bound)
}

/// An exact value, or length.
pub fn len(length: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).len(length)
}

/// A custom check, run before the structural check.
pub fn check<F>(f: F, spec: impl Into<Spec>) -> Node
where
    F: Fn(&mut State<'_>, &mut Update) -> bool + Send + Sync + 'static,
{
    let mut n = buildize(spec);
    if n.kind == Kind::Any {
        n.kind = Kind::Check;
    }
    n.required = true;
    n.required_set = true;
    n.check(f)
}

/// A regexp check: the value must be a string matching it. A failure reads
/// `check "/re/" failed`.
pub fn check_re(re: Regex, spec: impl Into<Spec>) -> Node {
    let mut n = buildize(spec);
    if n.kind == Kind::Any {
        n.kind = Kind::Check;
    }
    n.required = true;
    n.required_set = true;
    n.check_re(re)
}

/// A custom validator run before the structural check.
pub fn before<F>(f: F, spec: impl Into<Spec>) -> Node
where
    F: Fn(&mut State<'_>, &mut Update) -> bool + Send + Sync + 'static,
{
    buildize(spec).before(f)
}

/// A custom validator run after the structural check.
pub fn after<F>(f: F, spec: impl Into<Spec>) -> Node
where
    F: Fn(&mut State<'_>, &mut Update) -> bool + Send + Sync + 'static,
{
    buildize(spec).after(f)
}

/// The value must satisfy exactly one of the shapes.
pub fn one<I>(shapes: I) -> Node
where
    I: IntoIterator,
    I::Item: Into<Spec>,
{
    list_node(ListMode::One, shapes)
}

/// The value must satisfy at least one of the shapes.
pub fn some<I>(shapes: I) -> Node
where
    I: IntoIterator,
    I::Item: Into<Spec>,
{
    list_node(ListMode::Some, shapes)
}

/// The value must satisfy every shape.
pub fn all<I>(shapes: I) -> Node
where
    I: IntoIterator,
    I::Item: Into<Spec>,
{
    list_node(ListMode::All, shapes)
}

fn list_node<I>(mode: ListMode, shapes: I) -> Node
where
    I: IntoIterator,
    I::Item: Into<Spec>,
{
    let mut n = Node::of(Kind::List);
    n.required = true;
    n.required_set = true;
    n.list_mode = mode;
    n.list = shapes.into_iter().map(|s| normalize(s.into())).collect();
    n
}

/// Name the node so a later `refer` can substitute it.
pub fn define(name: impl Into<String>, spec: impl Into<Spec>) -> Node {
    buildize(spec).define(name)
}

/// Substitute the named node at validation time.
pub fn refer(name: impl Into<String>, spec: impl Into<Spec>) -> Node {
    buildize(spec).refer_with(name, ReferOptions::default())
}

/// `refer` with options.
pub fn refer_with(name: impl Into<String>, opts: ReferOptions, spec: impl Into<Spec>) -> Node {
    buildize(spec).refer_with(name, opts)
}

/// Rename the property after validation. For object children only.
pub fn rename(name: impl Into<String>, spec: impl Into<Spec>) -> Node {
    buildize(spec).rename_with(name, RenameOptions::default())
}

/// `rename` with options.
pub fn rename_with(name: impl Into<String>, opts: RenameOptions, spec: impl Into<Spec>) -> Node {
    buildize(spec).rename_with(name, opts)
}

/// The value is replaced with the key of the property it sits under.
pub fn key() -> Node {
    key_args(&[])
}

/// The value is replaced with the path `depth` levels up, as an array.
pub fn key_depth(depth: i64) -> Node {
    key_args(&[Value::from(depth)])
}

/// The value is replaced with the path `depth` levels up, joined by `sep`.
pub fn key_join(depth: i64, sep: impl Into<String>) -> Node {
    key_args(&[Value::from(depth), Value::Str(sep.into())])
}

/// `key` from raw arguments: a numeric argument is the depth, a string the
/// separator, as the string form of a spec supplies them.
pub fn key_args(args: &[Value]) -> Node {
    let mut depth: Option<i64> = None;
    let mut sep: Option<String> = None;
    for a in args {
        match a {
            Value::Str(s) => sep = Some(s.clone()),
            Value::Num(f) if f.is_finite() => depth = Some(f.trunc() as i64),
            _ => {}
        }
    }
    // A depth without a separator yields a path slice, so the node must be
    // an array to accept it.
    let mut n = Node::of(if depth.is_some() && sep.is_none() {
        Kind::Array
    } else {
        Kind::String
    });
    n.befores.push(validator(
        "Key",
        Some("Key()".to_string()),
        args.to_vec(),
        move |state, update| {
            // The canonical path is [root, k1, ..., kn]; the leading root
            // slot is kept so the index and slice arithmetic match.
            let path = state.path_keys();
            let mut ts_path: Vec<Value> = Vec::with_capacity(path.len() + 1);
            ts_path.push(Value::Undefined);
            ts_path.extend(path.iter().cloned().map(Value::Str));
            let l = ts_path.len() as i64;
            match (depth, &sep) {
                (None, None) => {
                    // The parent key. With no parent (the root, or a top-level
                    // property) the slot is the root, and the value is left.
                    if path.len() >= 2 {
                        update.val = Some(Value::Str(path[path.len() - 2].clone()));
                    }
                }
                (Some(d), sep) => {
                    let lo = if d >= 0 { l - 1 - d } else { l - 1 };
                    let hi = if d < 0 { l } else { l - 1 };
                    let sl = js_slice(&ts_path, lo, hi);
                    update.val = Some(match sep {
                        Some(sep) => {
                            let parts: Vec<String> = sl
                                .iter()
                                .map(|e| match e {
                                    Value::Str(s) => s.clone(),
                                    _ => String::new(),
                                })
                                .collect();
                            Value::Str(parts.join(sep))
                        }
                        None => Value::Arr(sl),
                    });
                }
                (None, Some(_)) => {}
            }
            true
        },
    ));
    n
}

/// `Array.prototype.slice` index semantics: a negative bound counts from
/// the end, out-of-range bounds clamp, and an empty range is empty.
fn js_slice(arr: &[Value], start: i64, end: i64) -> Vec<Value> {
    let n = arr.len() as i64;
    let clamp = |i: i64| if i < 0 { (n + i).max(0) } else { i.min(n) };
    let (s, e) = (clamp(start), clamp(end));
    if s >= e {
        return Vec::new();
    }
    arr[s as usize..e as usize].to_vec()
}

/// Whatever fails inside is replaced with the fallback, raising nothing.
pub fn catch(fallback: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).catch(fallback)
}

/// A valid value is replaced with a function of it.
pub fn transform<F>(f: F, spec: impl Into<Spec>) -> Node
where
    F: Fn(Value, &mut State<'_>) -> Value + Send + Sync + 'static,
{
    buildize(spec).transform(f)
}

/// A description, read back from the node's meta.
pub fn describe(description: impl Into<String>, spec: impl Into<Spec>) -> Node {
    buildize(spec).describe(description)
}

/// The value is converted to the node's kind where the conversion is
/// unambiguous, before the type check.
pub fn coerce(spec: impl Into<Spec>) -> Node {
    buildize(spec).coerce()
}

/// A string in email address form.
pub fn email(spec: impl Into<Spec>) -> Node {
    buildize(spec).email()
}

/// An absolute URL.
pub fn url(spec: impl Into<Spec>) -> Node {
    buildize(spec).url()
}

/// A UUID in 8-4-4-4-12 hex form.
pub fn uuid(spec: impl Into<Spec>) -> Node {
    buildize(spec).uuid()
}

/// A strict ISO 8601 date-time string.
pub fn date_time(spec: impl Into<Spec>) -> Node {
    buildize(spec).date_time()
}

/// An IPv4 or IPv6 address.
pub fn ip(spec: impl Into<Spec>) -> Node {
    buildize(spec).ip()
}

/// A dotted-quad IPv4 address.
pub fn ipv4(spec: impl Into<Spec>) -> Node {
    buildize(spec).ipv4()
}

/// An IPv6 address in RFC 4291 text form.
pub fn ipv6(spec: impl Into<Spec>) -> Node {
    buildize(spec).ipv6()
}

/// What `type_` takes its kind from.
pub enum TypeRef {
    Kind(Kind),
    Node(Box<Node>),
}

impl From<Kind> for TypeRef {
    fn from(k: Kind) -> Self {
        TypeRef::Kind(k)
    }
}
impl From<Token> for TypeRef {
    fn from(t: Token) -> Self {
        TypeRef::Kind(t.kind())
    }
}
impl From<&str> for TypeRef {
    fn from(name: &str) -> Self {
        TypeRef::Kind(Kind::from_name(name).unwrap_or(Kind::Any))
    }
}
impl From<Node> for TypeRef {
    fn from(n: Node) -> Self {
        TypeRef::Node(Box::new(n))
    }
}

/// `refer` options.
#[derive(Clone, Debug, Default)]
pub struct ReferOptions {
    /// Substitute even when the value is absent (not for self-recursion).
    pub fill: bool,
    /// A name with no `define` is an error, rather than a `refer` that does
    /// nothing.
    pub strict: bool,
}

/// `rename` options.
#[derive(Clone, Debug, Default)]
pub struct RenameOptions {
    /// Keep the original key as well as writing under the new name.
    pub keep: bool,
    /// Alternative source keys to read from when the renamed key is missing.
    pub claim: Vec<String>,
}

/// Whether a bound is a finite number: a number, a date, or a string that
/// reads as a number, as the canonical `+size` reads it.
pub(crate) fn bound_arg(v: &Value) -> Option<f64> {
    match v {
        Value::Num(f) if f.is_finite() => Some(*f),
        Value::Date(ms) => Some(*ms as f64),
        Value::Str(s) => s.trim().parse::<f64>().ok().filter(|f| f.is_finite()),
        _ => None,
    }
}

/// A bound argument rendered as JavaScript renders it.
pub(crate) fn num_text(v: &Value) -> String {
    match v {
        Value::Num(f) => js_number(*f),
        Value::Str(s) => s.clone(),
        Value::Date(ms) => js_date_string(*ms),
        other => json_render(other),
    }
}

/// Whether a bound compares the value itself (a number, or a date by its
/// time value) rather than a length or key count.
pub(crate) fn is_numeric(v: &Value) -> bool {
    matches!(v, Value::Num(_) | Value::Date(_))
}

/// The size a bound measures: a number itself, a date's time value, the
/// length of a string (in UTF-16 units, as JavaScript counts) or array, the
/// key count of an object. None when the value has no size.
pub(crate) fn value_len(v: &Value) -> Option<f64> {
    match v {
        Value::Date(ms) => Some(*ms as f64),
        Value::Num(f) => Some(*f),
        Value::Str(s) => Some(s.encode_utf16().count() as f64),
        Value::Arr(a) => Some(a.len() as f64),
        Value::Obj(m) => Some(m.len() as f64),
        _ => None,
    }
}

/// A measured size, or NaN when the value has none: a boolean or null has
/// no length, and the message says "(was NaN)" rather than nothing.
fn size_text(size: Option<f64>) -> String {
    size.map(js_number).unwrap_or_else(|| "NaN".to_string())
}

/// Whether the node declares a concrete type that this value does not have.
pub(crate) fn type_will_fail(n: &Node, v: &Value) -> bool {
    match n.kind {
        Kind::String | Kind::Regexp => !matches!(v, Value::Str(_)),
        Kind::Number => !matches!(v, Value::Num(f) if !f.is_nan()),
        Kind::Boolean => !matches!(v, Value::Bool(_)),
        Kind::Object => !matches!(v, Value::Obj(_)),
        Kind::Array => !matches!(v, Value::Arr(_)),
        Kind::Function => !matches!(v, Value::Func(_)),
        Kind::Null => !v.is_null(),
        Kind::NaN => !matches!(v, Value::Num(f) if f.is_nan()),
        Kind::Integer => !matches!(v, Value::Num(f) if is_integer(*f)),
        Kind::Date => !matches!(v, Value::Date(_)),
        Kind::BigInt => !matches!(v, Value::BigInt(_)),
        _ => false,
    }
}

/// Whether a size bound should stand aside and let the rest of validation
/// speak: the value is of the wrong type, so the structural check is about
/// to report that and a bound message would mask it; or the value is absent
/// on a node that does not require it, which is dropped.
pub(crate) fn bound_defers(state: &State<'_>) -> bool {
    let n = state.node;
    (state.absent && (n.skippable || !n.required)) || type_will_fail(n, state.value)
}

#[derive(Clone, Copy)]
enum Bound {
    Min,
    Max,
    Above,
    Below,
}

impl Bound {
    fn name(self) -> &'static str {
        match self {
            Bound::Min => "Min",
            Bound::Max => "Max",
            Bound::Above => "Above",
            Bound::Below => "Below",
        }
    }

    fn mark(self) -> i64 {
        match self {
            Bound::Min => 4011,
            Bound::Max => 4012,
            Bound::Above => 4013,
            Bound::Below => 4014,
        }
    }

    fn holds(self, limit: f64, size: f64) -> bool {
        match self {
            Bound::Min => limit <= size,
            Bound::Max => size <= limit,
            Bound::Above => limit < size,
            Bound::Below => size < limit,
        }
    }

    fn text(self, numeric: bool, bound: &str, size: &str) -> String {
        match self {
            Bound::Min | Bound::Max => {
                let lenpart = if numeric { "" } else { "length " };
                let word = if matches!(self, Bound::Min) {
                    "minimum"
                } else {
                    "maximum"
                };
                format!(
                    "Value \"$VALUE\" for property \"$PATH\" must be a {} {}of {} (was {}).",
                    word, lenpart, bound, size
                )
            }
            Bound::Above | Bound::Below => {
                let verb = if numeric { "be" } else { "have length" };
                let word = if matches!(self, Bound::Above) {
                    "above"
                } else {
                    "below"
                };
                format!(
                    "Value \"$VALUE\" for property \"$PATH\" must {} {} {} (was {}).",
                    verb, word, bound, size
                )
            }
        }
    }
}

fn bound_node(kind: Bound, bound: Value) -> Node {
    let Some(limit) = bound_arg(&bound) else {
        return fault_node(format!("Shape: {} needs a number", kind.name()));
    };
    let text = num_text(&bound);
    let mut n = any();
    n.befores.push(validator(
        kind.name(),
        Some(format!("{}({})", kind.name(), text)),
        vec![bound],
        move |state, update| {
            if bound_defers(state) {
                return true;
            }
            let size = value_len(state.value);
            if let Some(s) = size {
                if kind.holds(limit, s) {
                    return true;
                }
            }
            update.why = Some(kind.name().to_string());
            update.done = true;
            update.mark = kind.mark();
            update.err = Some(UpdateErr::Text(kind.text(
                is_numeric(state.value),
                &text,
                &size_text(size),
            )));
            false
        },
    ));
    n
}

fn len_node(length: Value) -> Node {
    let whole = match &length {
        Value::Num(f) if f.is_finite() && *f >= 0.0 && f.fract() == 0.0 => Some(*f),
        _ => None,
    };
    let Some(limit) = whole else {
        return fault_node("Shape: Len needs a whole number of zero or more");
    };
    let text = js_number(limit);
    let mut n = any();
    n.befores.push(validator(
        "Len",
        Some(format!("Len({})", text)),
        vec![length],
        move |state, update| {
            if bound_defers(state) {
                return true;
            }
            let size = value_len(state.value);
            if size == Some(limit) {
                return true;
            }
            let suffix = if is_numeric(state.value) {
                ""
            } else {
                " in length"
            };
            update.why = Some("Len".to_string());
            update.done = true;
            update.mark = 4015;
            update.err = Some(UpdateErr::Text(format!(
                "Value \"$VALUE\" for property \"$PATH\" must be exactly {}{} (was {}).",
                text,
                suffix,
                size_text(size)
            )));
            false
        },
    ));
    n
}

/// The literals of an Exact, dequoted: `admin, user`; `1, a, true, null`.
pub(crate) fn format_list(vals: &[Value]) -> String {
    vals.iter()
        .map(|v| match v {
            Value::Null => "null".to_string(),
            Value::Str(s) => s.clone(),
            Value::Num(f) => js_number(*f),
            Value::Undefined => "undefined".to_string(),
            other => json_render(other),
        })
        .collect::<Vec<_>>()
        .join(", ")
}

impl Node {
    /// Fold another builder's result in: its validators, or the fault it
    /// became when its argument was wrong.
    fn adopt(mut self, other: Node) -> Node {
        if is_fault(&other) {
            self.kind = Kind::Never;
            self.fault_msg = other.fault_msg;
            self.arg_fault = true;
            return self;
        }
        self.befores.extend(other.befores);
        self
    }

    pub fn required(mut self) -> Node {
        self.required = true;
        self.required_set = true;
        self.skippable = false;
        self
    }

    pub fn optional(mut self) -> Node {
        self.required = false;
        self.required_set = true;
        self
    }

    /// Optional with the default; named to leave `Default::default` alone.
    /// An untyped node is built over the default instead, and so takes the
    /// default's kind, keeping the checks and flags it carried.
    pub fn default_to(mut self, dval: impl Into<Value>) -> Node {
        let dval = dval.into();
        if self.kind == Kind::Any && !dval.is_undefined() {
            let mut base = normalize(Spec::Value(dval.clone()));
            let mut befores = std::mem::take(&mut self.befores);
            befores.append(&mut base.befores);
            base.befores = befores;
            let mut afters = std::mem::take(&mut self.afters);
            afters.append(&mut base.afters);
            base.afters = afters;
            base.has_exact = self.has_exact;
            base.exact_vals = std::mem::take(&mut self.exact_vals);
            base.empty = self.empty;
            base.nullable = self.nullable;
            base.silent = self.silent;
            base.fault_msg = self.fault_msg.take();
            base.arg_fault = self.arg_fault;
            base.meta.extend(std::mem::take(&mut self.meta));
            self = base;
        }
        self.required = false;
        self.required_set = true;
        self.skippable = false;
        self.has_default = true;
        self.default = dval;
        self
    }

    pub fn skip(mut self) -> Node {
        self.required = false;
        self.required_set = true;
        self.skippable = true;
        self
    }

    pub fn ignore(mut self) -> Node {
        self.required = false;
        self.required_set = true;
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
        if self.kind == Kind::Object && self.obj_rest.is_none() {
            self.obj_rest = Some(Box::new(Node::of(Kind::Any)));
        }
        self
    }

    pub fn closed(mut self) -> Node {
        self.obj_rest = None;
        if self.kind == Kind::Array && self.arr_children.is_empty() {
            if let Some(c) = self.arr_child.take() {
                // A single-shape array made fixed: a tuple of one.
                self.arr_children = vec![*c];
            }
        }
        self
    }

    pub fn child(mut self, child: impl Into<Spec>) -> Node {
        let cn = Box::new(buildize(child));
        match self.kind {
            Kind::Array => self.arr_child = Some(cn),
            Kind::Object => self.obj_rest = Some(cn),
            _ => {
                self.kind = Kind::Object;
                self.obj_rest = Some(cn);
            }
        }
        self
    }

    pub fn rest(mut self, child: impl Into<Spec>) -> Node {
        self.kind = Kind::Array;
        self.arr_rest = Some(Box::new(buildize(child)));
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

    /// The value may be anything.
    pub fn any(mut self) -> Node {
        self.kind = Kind::Any;
        self
    }

    /// Adopt the reference type's kind and its required, skippable and
    /// default state. Structural children are deliberately not copied:
    /// `type_(Object)` is a closed object and `type_(Array)` accepts any
    /// elements.
    pub fn type_(mut self, kind: impl Into<TypeRef>) -> Node {
        let tn = match kind.into() {
            TypeRef::Kind(k) => type_token_node(k),
            TypeRef::Node(n) => *n,
        };
        self.kind = tn.kind;
        self.required = tn.required;
        self.required_set = tn.required_set;
        self.skippable = tn.skippable;
        self.has_default = tn.has_default;
        self.default = tn.default;
        self.literal = tn.literal;
        self
    }

    pub fn string(self) -> Node {
        self.type_(Kind::String)
    }
    pub fn number(self) -> Node {
        self.type_(Kind::Number)
    }
    pub fn boolean(self) -> Node {
        self.type_(Kind::Boolean)
    }
    pub fn object(self) -> Node {
        self.type_(Kind::Object)
    }
    pub fn array(self) -> Node {
        self.type_(Kind::Array)
    }
    pub fn function(self) -> Node {
        self.type_(Kind::Function)
    }
    pub fn integer(self) -> Node {
        self.type_(Kind::Integer)
    }
    pub fn date(self) -> Node {
        self.type_(Kind::Date)
    }

    /// A function-typed value; the required state is kept.
    pub fn func(mut self) -> Node {
        self.kind = Kind::Function;
        self
    }

    pub fn exact<I>(mut self, vals: I) -> Node
    where
        I: IntoIterator,
        I::Item: Into<Value>,
    {
        let vals: Vec<Value> = vals.into_iter().map(Into::into).collect();
        self.has_exact = true;
        self.exact_vals = vals.clone();
        let list = format_list(&vals);
        let wanted = vals.clone();
        self.befores.push(validator(
            "Exact",
            Some(format!("Exact({})", list)),
            vals,
            move |state, update| {
                if wanted.iter().any(|w| w == state.value) {
                    return true;
                }
                // The default stands in for an absent value only; a present
                // null is a value in its own right.
                if state.absent && state.node.has_default && wanted.contains(&state.node.default) {
                    return true;
                }
                update.why = Some("Exact".to_string());
                update.mark = 4010;
                update.err = Some(UpdateErr::Text(format!(
                    "Value \"$VALUE\" for property \"$PATH\" must be exactly one of: {}",
                    list
                )));
                update.done = true;
                false
            },
        ));
        self
    }

    pub fn min(self, bound: impl Into<Value>) -> Node {
        self.adopt(bound_node(Bound::Min, bound.into()))
    }

    pub fn max(self, bound: impl Into<Value>) -> Node {
        self.adopt(bound_node(Bound::Max, bound.into()))
    }

    pub fn above(self, bound: impl Into<Value>) -> Node {
        self.adopt(bound_node(Bound::Above, bound.into()))
    }

    pub fn below(self, bound: impl Into<Value>) -> Node {
        self.adopt(bound_node(Bound::Below, bound.into()))
    }

    pub fn len(self, length: impl Into<Value>) -> Node {
        self.adopt(len_node(length.into()))
    }

    pub fn check<F>(mut self, f: F) -> Node
    where
        F: Fn(&mut State<'_>, &mut Update) -> bool + Send + Sync + 'static,
    {
        self.befores.push(validator(
            "Check",
            Some("Check()".to_string()),
            Vec::new(),
            // An absent value is left to the required check, as in TypeScript.
            move |state: &mut State<'_>, update: &mut Update| state.absent || f(state, update),
        ));
        self
    }

    pub fn check_re(mut self, re: Regex) -> Node {
        let name = format!("/{}/", re.as_str());
        let suffix = format!("Check({})", name);
        self.befores.push(validator(
            &name,
            Some(suffix),
            Vec::new(),
            move |state, update| {
                if state.absent {
                    return true;
                }
                if let Value::Str(s) = state.value {
                    if re.is_match(s) {
                        return true;
                    }
                }
                // No custom text: the default `check "/re/" failed` speaks.
                update.why = Some(WHY_CHECK.to_string());
                update.mark = MARK_CHECK_TYPE;
                false
            },
        ));
        self
    }

    pub fn before<F>(mut self, f: F) -> Node
    where
        F: Fn(&mut State<'_>, &mut Update) -> bool + Send + Sync + 'static,
    {
        self.befores.push(validator(
            "Before",
            Some("Before()".to_string()),
            Vec::new(),
            f,
        ));
        self
    }

    pub fn after<F>(mut self, f: F) -> Node
    where
        F: Fn(&mut State<'_>, &mut Update) -> bool + Send + Sync + 'static,
    {
        self.afters.push(validator(
            "After",
            Some("After()".to_string()),
            Vec::new(),
            f,
        ));
        self
    }

    pub fn define(mut self, name: impl Into<String>) -> Node {
        let name = name.into();
        if name.is_empty() {
            return fault_node("Shape: Define needs a name");
        }
        self.define_name = Some(name.clone());
        let suffix = format!("Define({})", json_text(&name));
        self.befores.push(validator(
            "Define",
            Some(suffix),
            vec![Value::Str(name.clone())],
            move |state, _update| {
                // The definition met on this call, for a later refer on the
                // same context, is the compiled one of this name.
                if let Some(d) = state.ctx.defs.get(&name).cloned() {
                    state.ctx.refs.insert(name.clone(), d);
                }
                true
            },
        ));
        self
    }

    pub fn refer(self, name: impl Into<String>) -> Node {
        self.refer_with(name, ReferOptions::default())
    }

    pub fn refer_with(mut self, name: impl Into<String>, opts: ReferOptions) -> Node {
        let name = name.into();
        if name.is_empty() {
            return fault_node("Shape: Refer needs a name");
        }
        self.refer_name = Some(name.clone());
        self.refer_fill = opts.fill;
        let suffix = format!("Refer({})", json_text(&name));
        self.befores.push(validator(
            "Refer",
            Some(suffix),
            vec![Value::Str(name.clone())],
            move |state, update| {
                // An absent value is left alone unless fill asks; a present
                // null is a value.
                if state.absent && !opts.fill {
                    return true;
                }
                // A define met on this call first, then the schema's own.
                let found = state
                    .ctx
                    .refs
                    .get(&name)
                    .cloned()
                    .or_else(|| state.ctx.defs.get(&name).cloned());
                match found {
                    Some(rn) => update.node = Some(rn),
                    None if opts.strict => {
                        update.err = Some(UpdateErr::Text(format!(
                            "Value \"$VALUE\" for property \"$PATH\" refers to \"{}\", which is not defined.",
                            name
                        )));
                        return false;
                    }
                    None => {}
                }
                true
            },
        ));
        self
    }

    pub fn rename(self, name: impl Into<String>) -> Node {
        self.rename_with(name, RenameOptions::default())
    }

    pub fn rename_with(mut self, name: impl Into<String>, opts: RenameOptions) -> Node {
        let name = name.into();
        if name.is_empty() {
            return fault_node("Shape: Rename needs a name");
        }
        self.rename_to = Some(name);
        self.rename_keep = opts.keep;
        self.rename_claim = opts.claim;
        self
    }

    pub fn catch(self, fallback: impl Into<Value>) -> Node {
        catch_node(self, fallback.into())
    }

    pub fn transform<F>(self, f: F) -> Node
    where
        F: Fn(Value, &mut State<'_>) -> Value + Send + Sync + 'static,
    {
        let f: Arc<TransformFn> = Arc::new(f);
        transform_node(self, f)
    }

    pub fn describe(mut self, description: impl Into<String>) -> Node {
        self.meta
            .insert("description".to_string(), Value::Str(description.into()));
        self
    }

    pub fn coerce(mut self) -> Node {
        self.befores.insert(0, coerce_validator());
        self
    }

    pub fn email(self) -> Node {
        with_format(self, FMT_EMAIL)
    }
    pub fn url(self) -> Node {
        with_format(self, FMT_URL)
    }
    pub fn uuid(self) -> Node {
        with_format(self, FMT_UUID)
    }
    pub fn date_time(self) -> Node {
        with_format(self, FMT_DATE_TIME)
    }
    pub fn ip(self) -> Node {
        with_format(self, FMT_IP)
    }
    pub fn ipv4(self) -> Node {
        with_format(self, FMT_IPV4)
    }
    pub fn ipv6(self) -> Node {
        with_format(self, FMT_IPV6)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::Context;
    use crate::spec::{arr, null, obj};
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

    fn at_a(n: impl Into<Spec>) -> Schema {
        Schema::new(obj([("a", n.into())]))
    }

    fn a(s: &str) -> String {
        format!("{{\"a\":{}}}", s)
    }

    #[test]
    fn bounds_on_numbers_strings_and_containers() {
        let cases: Vec<(Node, &str, &str)> = vec![
            (min(3, Token::Number), "5", "{\"a\":5}"),
            (min(3, Token::Number), "1", "ERR Value \"1\" for property \"a\" must be a minimum of 3 (was 1)."),
            (max(3, Token::Number), "9", "ERR Value \"9\" for property \"a\" must be a maximum of 3 (was 9)."),
            (above(3, Token::Number), "3", "ERR Value \"3\" for property \"a\" must be above 3 (was 3)."),
            (below(3, Token::Number), "3", "ERR Value \"3\" for property \"a\" must be below 3 (was 3)."),
            (len(3, Token::Number), "4", "ERR Value \"4\" for property \"a\" must be exactly 3 (was 4)."),
            (min(3, Token::String), "\"hi\"", "ERR Value \"hi\" for property \"a\" must be a minimum length of 3 (was 2)."),
            (max(2, Token::String), "\"hey\"", "ERR Value \"hey\" for property \"a\" must be a maximum length of 2 (was 3)."),
            (len(3, Token::String), "\"abc\"", "{\"a\":\"abc\"}"),
            (len(3, Token::String), "\"ab\"", "ERR Value \"ab\" for property \"a\" must be exactly 3 in length (was 2)."),
            (min(2, any()), "[1]", "ERR Value \"[1]\" for property \"a\" must be a minimum length of 2 (was 1)."),
            (above(1, any()), "\"a\"", "ERR Value \"a\" for property \"a\" must have length above 1 (was 1)."),
            (below(1, any()), "\"ab\"", "ERR Value \"ab\" for property \"a\" must have length below 1 (was 2)."),
            (min(2, Token::Object), "{\"x\":1}", "ERR Value \"{x:1}\" for property \"a\" must be a minimum length of 2 (was 1)."),
            (min(2, null()), "null", "ERR Value \"null\" for property \"a\" must be a minimum length of 2 (was NaN)."),
            (min(2, null()), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type null."),
            (min(2, Token::String), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type string."),
            (min(2, Token::Integer), "1.5", "ERR Validation failed for property \"a\" with number \"1.5\" because the number is not of type integer."),
            (min(2, Token::Integer), "1", "ERR Value \"1\" for property \"a\" must be a minimum of 2 (was 1)."),
            (min("2", Token::Number), "1", "ERR Value \"1\" for property \"a\" must be a minimum of 2 (was 1)."),
            (min(2, Token::Boolean), "\"x\"", "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type boolean."),
            (min(2, true), "true", "ERR Value \"true\" for property \"a\" must be a minimum length of 2 (was NaN)."),
            (min(2, Token::Function), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type function."),
            (min(2, Token::Array), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type array."),
            (min(2, Token::Object), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type object."),
            (min(2, f64::NAN), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type nan."),
            (min(2, Token::Date), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type date."),
            (min(2, Token::BigInt), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type bigint."),
            (min(2, buildize(Regex::new("^a").unwrap())), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type string."),
            (min(2, buildize(Regex::new("^a").unwrap())), "\"abc\"", "{\"a\":\"abc\"}"),
            (optional(min(2, Token::Number)), "{}", "{}"),
            (optional(len(2, Token::Number)), "{}", "{}"),
            (max(3, Token::String), "\"hi\"", "{\"a\":\"hi\"}"),
            (above(3, Token::Number), "4", "{\"a\":4}"),
            (below(3, Token::Number), "2", "{\"a\":2}"),
            (len(2, any()), "[1,2]", "{\"a\":[1,2]}"),
        ];
        for (n, input, want) in cases {
            let s = at_a(n);
            let got = if input == "{}" {
                run(&s, "{}")
            } else {
                run(&s, &a(input))
            };
            assert_eq!(got, want.replace("{}", "{\"a\":0}"), "{}", input);
        }
        let s = at_a(min(3, Token::Number));
        assert!(!s.valid(&j(&a("1"))));
        let e = &s.error(&j(&a("1")))[0];
        assert_eq!((e.why.as_str(), e.mark), ("Min", 4011));
        assert_eq!(s.error(&j(&a("\"x\"")))[0].why, "type");
        assert_eq!(at_a(max(3, any())).error(&j(&a("9")))[0].mark, 4012);
        assert_eq!(at_a(above(3, any())).error(&j(&a("1")))[0].mark, 4013);
        assert_eq!(at_a(below(3, any())).error(&j(&a("9")))[0].mark, 4014);
        assert_eq!(at_a(len(3, any())).error(&j(&a("9")))[0].mark, 4015);

        // Dates compare by their time value.
        let s = at_a(min(Value::Date(1000), Token::Date));
        let dated =
            |ms: i64| Value::Obj([("a".to_string(), Value::Date(ms))].into_iter().collect());
        assert!(s.valid(&dated(2000)));
        assert!(!s.valid(&dated(5)));
        assert_eq!(num_text(&Value::Date(0)), "1970-01-01T00:00:00.000Z");
        assert_eq!(num_text(&Value::Bool(true)), "true");
        assert_eq!(value_len(&Value::Bool(true)), None);
        assert_eq!(value_len(&Value::Str("é😀".into())), Some(3.0));
        assert_eq!(bound_arg(&Value::Bool(true)), None);
        assert_eq!(bound_arg(&Value::Str("inf".into())), None);
        assert_eq!(bound_arg(&Value::Str(" 2.5 ".into())), Some(2.5));
        assert!(!is_numeric(&Value::Str("x".into())));
        assert!(!type_will_fail(&any(), &Value::Null));
    }

    #[test]
    fn bad_bound_arguments_become_faults() {
        for (n, msg) in [
            (min("x", Token::Number), "Shape: Min needs a number"),
            (max(true, Token::Number), "Shape: Max needs a number"),
            (
                above(Value::Null, Token::Number),
                "Shape: Above needs a number",
            ),
            (
                below(f64::NAN, Token::Number),
                "Shape: Below needs a number",
            ),
            (
                len(-1, Token::Number),
                "Shape: Len needs a whole number of zero or more",
            ),
            (
                len(1.5, Token::Number),
                "Shape: Len needs a whole number of zero or more",
            ),
            (
                buildize(Token::Number).min("x"),
                "Shape: Min needs a number",
            ),
            (
                buildize(Token::Number).max("x"),
                "Shape: Max needs a number",
            ),
            (
                buildize(Token::Number).above("x"),
                "Shape: Above needs a number",
            ),
            (
                buildize(Token::Number).below("x"),
                "Shape: Below needs a number",
            ),
            (
                buildize(Token::Number).len("x"),
                "Shape: Len needs a whole number of zero or more",
            ),
            (define("", Token::Number), "Shape: Define needs a name"),
            (refer("", Token::Number), "Shape: Refer needs a name"),
            (rename("", Token::Number), "Shape: Rename needs a name"),
        ] {
            assert_eq!(run(&at_a(n), &a("1")), format!("ERR {}", msg));
        }
    }

    #[test]
    fn exact_literals() {
        let s = Schema::new(obj([("role", exact(["admin", "user"]))]));
        assert_eq!(run(&s, r#"{"role":"user"}"#), r#"{"role":"user"}"#);
        assert_eq!(
            run(&s, r#"{"role":"root"}"#),
            "ERR Value \"root\" for property \"role\" must be exactly one of: admin, user"
        );
        let e = &s.error(&j(r#"{"role":"root"}"#))[0];
        assert_eq!((e.why.as_str(), e.mark), ("Exact", 4010));
        assert_eq!(
            run(&at_a(exact([Value::from(1), Value::Null])), &a("0")),
            "ERR Value \"0\" for property \"a\" must be exactly one of: 1, null"
        );
        assert_eq!(
            run(
                &at_a(exact([
                    Value::from(1),
                    Value::from("a"),
                    Value::from(true),
                    Value::Null
                ])),
                &a("0")
            ),
            "ERR Value \"0\" for property \"a\" must be exactly one of: 1, a, true, null"
        );
        assert_eq!(
            format_list(&[Value::Arr(vec![Value::from(1)]), Value::Undefined]),
            "[1], undefined"
        );
        // The default stands in for an absent value.
        let s = at_a(default(2, exact([2, 3])));
        assert_eq!(run(&s, "{}"), a("2"));
        assert_eq!(run(&s, &a("3")), a("3"));
        assert_eq!(
            run(&s, &a("4")),
            "ERR Value \"4\" for property \"a\" must be exactly one of: 2, 3"
        );
        assert_eq!(
            run(&s, &a("null")),
            "ERR Value \"null\" for property \"a\" must be exactly one of: 2, 3"
        );
        let s = at_a(buildize(Token::String).exact(["x"]));
        assert_eq!(run(&s, &a("\"x\"")), a("\"x\""));
        assert!(s.node().obj_children["a"].has_exact);
        assert_eq!(stringify_node(&exact(["a", "b"]), false), "Exact(a, b)");
    }

    #[test]
    fn checks() {
        let s = at_a(check(|st, _| st.value.as_f64().unwrap_or(0.0) > 1.0, any()));
        assert_eq!(s.node().obj_children["a"].kind, Kind::Check);
        assert_eq!(run(&s, &a("2")), a("2"));
        assert_eq!(
            run(&s, &a("1")),
            "ERR Validation failed for property \"a\" with number \"1\" because check \"Check\" failed."
        );
        // A check is not called for an absent value: the required check speaks.
        assert_eq!(
            run(&s, "{}"),
            "ERR Validation failed for property \"a\" because the property is missing."
        );
        let s = at_a(check(|_, _| true, Token::Number));
        assert_eq!(
            run(&s, "{}"),
            "ERR Validation failed for property \"a\" because the property is missing."
        );
        assert_eq!(s.node().obj_children["a"].kind, Kind::Number);
        let re = || Regex::new("^a.+").unwrap();
        let s = at_a(check_re(re(), any()));
        assert_eq!(run(&s, &a("\"abc\"")), a("\"abc\""));
        assert_eq!(
            run(&s, &a("\"zzz\"")),
            "ERR Validation failed for property \"a\" with string \"zzz\" because check \"/^a.+/\" failed."
        );
        assert_eq!(
            run(&s, &a("1")),
            "ERR Validation failed for property \"a\" with number \"1\" because check \"/^a.+/\" failed."
        );
        assert_eq!(s.error(&j(&a("1")))[0].mark, MARK_CHECK_TYPE);
        let s = at_a(check_re(re(), Token::String));
        assert_eq!(s.node().obj_children["a"].kind, Kind::String);
        assert_eq!(
            stringify_node(&check_re(re(), any()), false),
            "Check.Check(/^a.+/)"
        );
        let s = at_a(before(
            |_, u| {
                u.val = Some(Value::from(9));
                true
            },
            Token::Number,
        ));
        assert_eq!(run(&s, &a("1")), a("9"));
        let s = at_a(after(|_, _| false, Token::Number));
        assert_eq!(s.error(&j(&a("1")))[0].check, "After");
        assert_eq!(
            stringify_node(&after(|_, _| true, before(|_, _| true, any())), false),
            "Before().After()"
        );
    }

    #[test]
    fn composition() {
        let one_ns = || one([Spec::from(Token::Number), Spec::from(Token::String)]);
        assert_eq!(run(&at_a(one_ns()), &a("\"x\"")), a("\"x\""));
        assert_eq!(
            run(&at_a(one_ns()), &a("true")),
            "ERR Value \"true\" for property \"a\" does not satisfy one of: Number, String"
        );
        assert!(!at_a(one_ns()).valid(&j(&a("true"))));
        assert!(at_a(one_ns()).valid(&j(&a("1"))));
        let e = &at_a(one_ns()).error(&j(&a("true")))[0];
        assert_eq!((e.why.as_str(), e.mark), ("One", 4030));
        let some_ns = || some([Spec::from(Token::Number), Spec::from(Token::String)]);
        assert_eq!(run(&at_a(some_ns()), &a("5")), a("5"));
        assert_eq!(
            run(&at_a(some_ns()), &a("true")),
            "ERR Value \"true\" for property \"a\" does not satisfy any of: Number, String"
        );
        assert_eq!(at_a(some_ns()).error(&j(&a("true")))[0].mark, 4031);
        let all_nm = || all([Spec::from(Token::Number), Spec::from(min(2, any()))]);
        assert_eq!(
            run(&at_a(all_nm()), &a("1")),
            "ERR Value \"1\" for property \"a\" does not satisfy all of: Number, Min(2)"
        );
        assert_eq!(run(&at_a(all_nm()), &a("5")), a("5"));
        assert_eq!(at_a(all_nm()).error(&j(&a("1")))[0].mark, 4032);
        assert_eq!(
            run(
                &at_a(one([Spec::from(Token::Number), Spec::from(min(2, any()))])),
                &a("\"x\"")
            ),
            "ERR Value \"x\" for property \"a\" does not satisfy one of: Number, Min(2)"
        );
        assert_eq!(
            run(
                &at_a(all([Spec::from(Token::String), Spec::from(Token::Any)])),
                &a("1")
            ),
            "ERR Value \"1\" for property \"a\" does not satisfy all of: String, Any"
        );
        assert_eq!(
            run(
                &at_a(one([
                    Spec::from(ignore(min(2, Token::Number))),
                    Spec::from(Token::String)
                ])),
                &a("1")
            ),
            a("1")
        );
        assert_eq!(
            run(
                &at_a(all([
                    Spec::from(ignore(min(2, Token::Number))),
                    Spec::from(Token::Number)
                ])),
                &a("1")
            ),
            a("1")
        );
        assert_eq!(run(&at_a(optional(one_ns())), "{}"), "{}");
        let re = || Regex::new("^a").unwrap();
        let one_rn = || one([Spec::from(re()), Spec::from(Token::Number)]);
        assert_eq!(run(&at_a(one_rn()), &a("\"abc\"")), a("\"abc\""));
        assert_eq!(run(&at_a(one_rn()), &a("5")), a("5"));
        assert_eq!(
            run(&at_a(one_rn()), &a("true")),
            "ERR Value \"true\" for property \"a\" does not satisfy one of: /^a/, Number"
        );
        assert_eq!(
            run(
                &at_a(some([Spec::from(re()), Spec::from(Token::Number)])),
                &a("true")
            ),
            "ERR Value \"true\" for property \"a\" does not satisfy any of: /^a/, Number"
        );
        // Fault applies to One and Some, not All.
        assert_eq!(run(&at_a(fault("F", one_ns())), &a("true")), "ERR F");
        assert_eq!(run(&at_a(fault("F", some_ns())), &a("true")), "ERR F");
        assert_eq!(
            run(&at_a(fault("F", all_nm())), &a("1")),
            "ERR Value \"1\" for property \"a\" does not satisfy all of: Number, Min(2)"
        );
        assert!(!at_a(fault("F", one_ns())).valid(&j(&a("true"))));
        // Every matching Some branch produces from the original; the last
        // one's result stands.
        let s = at_a(some([
            Spec::from(Token::Number),
            Spec::from(coerce(Token::String)),
        ]));
        assert_eq!(run(&s, &a("5")), a("\"5\""));
        // All threads the value through its branches.
        let s = at_a(all([
            Spec::from(coerce(Token::Number)),
            Spec::from(min(2, any())),
        ]));
        assert_eq!(run(&s, &a("\"5\"")), a("5"));
        let s = at_a(all([
            Spec::from(coerce(Token::Number)),
            Spec::from(min(9, any())),
        ]));
        assert_eq!(
            run(&s, &a("\"5\"")),
            "ERR Value \"5\" for property \"a\" does not satisfy all of: Number, Min(9)"
        );
        // A branch that produces nothing leaves the key out.
        assert_eq!(
            run(&at_a(one([Spec::from(skip(Token::Number))])), "{}"),
            "{}"
        );
        assert_eq!(
            run(&at_a(some([Spec::from(skip(Token::Number))])), "{}"),
            "{}"
        );
        assert_eq!(
            run(&at_a(all([Spec::from(skip(Token::Number))])), "{}"),
            "{}"
        );
        let mut quiet = one_ns();
        quiet.silent = true;
        assert_eq!(run(&at_a(quiet), &a("true")), a("true"));
    }

    #[test]
    fn define_and_refer() {
        let s = |strict: bool, fill: bool| {
            Schema::new(obj([
                ("a", Spec::from(define("d", Token::Number))),
                (
                    "b",
                    Spec::from(refer_with("d", ReferOptions { strict, fill }, any())),
                ),
            ]))
        };
        assert_eq!(
            run(&s(false, false), r#"{"a":1,"b":2}"#),
            r#"{"a":1,"b":2}"#
        );
        assert_eq!(run(&s(true, false), r#"{"a":1,"b":2}"#), r#"{"a":1,"b":2}"#);
        assert_eq!(
            run(&s(true, false), r#"{"a":1,"b":"x"}"#),
            "ERR Validation failed for property \"b\" with string \"x\" because the string is not of type number."
        );
        assert_eq!(run(&s(false, false), r#"{"a":1}"#), r#"{"a":1}"#);
        assert_eq!(
            run(&s(false, true), r#"{"a":1}"#),
            "ERR Validation failed for property \"b\" because the property is missing."
        );
        assert!(s(false, false).defs().contains_key("d"));
        let lax = at_a(any().refer("nope"));
        assert_eq!(run(&lax, &a("2")), a("2"));
        let strict = |fill| {
            at_a(refer_with(
                "nope",
                ReferOptions { strict: true, fill },
                any(),
            ))
        };
        assert_eq!(
            run(&strict(false), &a("2")),
            "ERR Value \"2\" for property \"a\" refers to \"nope\", which is not defined."
        );
        assert_eq!(run(&strict(false), "{}"), "{}");
        assert_eq!(run(&strict(true), "{}"), "{}");
        assert_eq!(
            stringify_node(&define("d", Token::Number), false),
            "Number.Define(\"d\")"
        );
        assert_eq!(stringify_node(&refer("d", any()), false), "Refer(\"d\")");
        // A define met on one schema's call serves a refer on another, when
        // the calls share a context.
        let mut ctx = Context::new();
        let first = at_a(define("shared", Token::Number));
        first.validate_ctx(j(&a("1")), &mut ctx).unwrap();
        let second = at_a(refer("shared", any()));
        assert!(second.validate_ctx(j(&a("\"x\"")), &mut ctx).is_err());
        assert!(second.validate_ctx(j(&a("3")), &mut ctx).is_ok());
    }

    #[test]
    fn renames() {
        let s = at_a(buildize(Token::Number).rename("b"));
        assert_eq!(run(&s, &a("1")), r#"{"b":1}"#);
        assert_eq!(run(&s, r#"{"a":1,"b":2}"#), r#"{"b":1}"#);
        assert!(s.valid(&j(&a("1"))));
        let s = at_a(rename_with(
            "b",
            RenameOptions {
                keep: true,
                claim: vec![],
            },
            Token::Number,
        ));
        assert_eq!(run(&s, &a("1")), r#"{"a":1,"b":1}"#);
        let claim = |keep| {
            at_a(rename_with(
                "b",
                RenameOptions {
                    keep,
                    claim: vec!["old".into(), "older".into()],
                },
                Token::Number,
            ))
        };
        assert_eq!(run(&claim(false), r#"{"older":1}"#), r#"{"b":1}"#);
        assert_eq!(
            run(&claim(true), r#"{"old":1}"#),
            r#"{"old":1,"a":1,"b":1}"#
        );
        assert_eq!(run(&claim(false), &a("2")), r#"{"b":2}"#);
        assert_eq!(
            run(&claim(false), "{}"),
            "ERR Validation failed for property \"a\" because the property is missing."
        );
        assert!(claim(false).valid(&j(r#"{"old":1}"#)));
        assert!(!claim(false).valid(&j(r#"{"old":"x"}"#)));
        assert!(!claim(false).valid(&j("{}")));
        // A renamed child that produced nothing has nothing to move.
        assert_eq!(run(&at_a(rename("b", skip(Token::Number))), "{}"), "{}");
        assert_eq!(run(&at_a(rename("a", Token::Number)), &a("1")), a("1"));
    }

    #[test]
    fn keys() {
        let nested = |n: Node| Schema::new(obj([("a", obj([("b", Spec::from(n))]))]));
        assert_eq!(
            run(&nested(key()), r#"{"a":{"b":"V"}}"#),
            r#"{"a":{"b":"a"}}"#
        );
        assert_eq!(
            run(&nested(key_depth(1)), r#"{"a":{"b":"V"}}"#),
            r#"{"a":{"b":["a"]}}"#
        );
        assert_eq!(
            run(&nested(key_join(1, "/")), r#"{"a":{"b":"V"}}"#),
            r#"{"a":{"b":"a"}}"#
        );
        assert_eq!(
            run(&nested(key_depth(-1)), r#"{"a":{"b":"V"}}"#),
            r#"{"a":{"b":["b"]}}"#
        );
        assert_eq!(
            run(&nested(key_join(0, "/")), r#"{"a":{"b":"V"}}"#),
            "ERR Validation failed for property \"a.b\" with string \"\" because an empty string is not allowed."
        );
        assert_eq!(
            run(&nested(key_join(2, "/")), r#"{"a":{"b":"V"}}"#),
            r#"{"a":{"b":"/a"}}"#
        );
        assert_eq!(
            run(&nested(key_join(5, ".")), r#"{"a":{"b":"V"}}"#),
            r#"{"a":{"b":".a"}}"#
        );
        assert_eq!(run(&at_a(key()), &a("\"V\"")), a("\"V\""));
        assert_eq!(
            run(&at_a(key_args(&[Value::from("/")])), &a("\"V\"")),
            a("\"V\"")
        );
        assert_eq!(key_args(&[Value::Null]).kind, Kind::String);
        assert_eq!(
            js_slice(&[Value::from(1), Value::from(2)], 5, 9),
            Vec::<Value>::new()
        );
        assert_eq!(
            js_slice(&[Value::from(1), Value::from(2)], -9, -1),
            vec![Value::from(1)]
        );
        assert_eq!(stringify_node(&key(), false), "String.Key()");
    }

    #[test]
    fn catch_and_transform() {
        assert_eq!(run(&at_a(catch(0, Token::Number)), &a("\"x\"")), a("0"));
        assert_eq!(run(&at_a(catch(0, Token::Number)), &a("5")), a("5"));
        assert_eq!(
            run(&at_a(catch("none", min(2, Token::String))), &a("\"x\"")),
            a("\"none\"")
        );
        assert_eq!(
            run(&at_a(min(2, catch(0, Token::Number))), &a("\"x\"")),
            "ERR Value \"0\" for property \"a\" must be a minimum of 2 (was 0)."
        );
        assert_eq!(run(&at_a(catch(7, Token::Number)), "{}"), a("7"));
        assert_eq!(run(&at_a(optional(catch(7, Token::Number))), "{}"), a("0"));
        assert_eq!(
            run(&at_a(catch(Value::Null, Token::Number)), &a("\"x\"")),
            a("null")
        );
        assert!(at_a(catch(0, Token::Number)).valid(&j(&a("\"x\""))));
        let s = at_a(catch(
            Value::Obj(Default::default()),
            obj([("x", Spec::from(Token::Number))]),
        ));
        assert_eq!(run(&s, r#"{"a":{"x":"bad"}}"#), r#"{"a":{}}"#);
        assert_eq!(run(&s, r#"{"a":{"x":1}}"#), r#"{"a":{"x":1}}"#);
        assert_eq!(
            stringify_node(&catch(0, min(2, Token::Number)), false),
            "Number.Min(2).Catch(0)"
        );
        assert_eq!(
            stringify_node(&after(|_, _| true, Token::Number).catch("z"), false),
            "Number.After().Catch(z)"
        );
        let dbl = |n: Node| transform(|v, _| Value::Num(v.as_f64().unwrap_or(0.0) * 2.0), n);
        assert_eq!(run(&at_a(dbl(buildize(Token::Number))), &a("2")), a("4"));
        assert_eq!(
            run(&at_a(dbl(buildize(Token::Number))), &a("\"x\"")),
            "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."
        );
        assert_eq!(
            run(&at_a(dbl(min(2, Token::Number))), &a("1")),
            "ERR Value \"1\" for property \"a\" must be a minimum of 2 (was 1)."
        );
        assert!(at_a(dbl(buildize(Token::Number))).valid(&j(&a("2"))));
        assert!(!at_a(dbl(buildize(Token::Number))).valid(&j(&a("\"x\""))));
        assert_eq!(
            stringify_node(&dbl(min(2, Token::Number)), false),
            "Number.Min(2).Transform"
        );
        assert!(catch(0, Token::Number).befores[0].inner.is_some());
        // A transform of an absent optional value: nothing produced, nothing
        // transformed.
        assert_eq!(run(&at_a(dbl(skip(Token::Number))), "{}"), a("0"));
    }

    #[test]
    fn describe_coerce_and_formats() {
        let s = at_a(describe("a number", Token::Number));
        assert_eq!(
            s.node().obj_children["a"].meta.get("description"),
            Some(&Value::from("a number"))
        );
        assert_eq!(
            run(&s, &a("\"x\"")),
            "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."
        );
        let cases: Vec<(Node, &str, &str)> = vec![
            (coerce(Token::Number), "\"5\"", "5"),
            (coerce(Token::Number), "true", "1"),
            (coerce(Token::Number), "\"x\"", "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."),
            (coerce(Token::Number), "\"0x10\"", "ERR Validation failed for property \"a\" with string \"0x10\" because the string is not of type number."),
            (coerce(Token::Integer), "\"5.5\"", "ERR Validation failed for property \"a\" with number \"5.5\" because the number is not of type integer."),
            (coerce(Token::String), "1.5", "\"1.5\""),
            (coerce(Token::String), "1000000", "\"1000000\""),
            (coerce(Token::String), "false", "\"false\""),
            (coerce(Token::Boolean), "\" TRUE \"", "true"),
            (coerce(Token::Boolean), "0", "false"),
            (coerce(Token::Boolean), "\"yes\"", "ERR Validation failed for property \"a\" with string \"yes\" because the string is not of type boolean."),
            (coerce(Token::Date), "\"2020-01-01T00:00:00Z\"", "\"2020-01-01T00:00:00.000Z\""),
            (coerce(Token::Date), "\"2020-01-01T12:30:00.5+02:00\"", "\"2020-01-01T10:30:00.500Z\""),
            (coerce(Token::Date), "\"2020-02-30T00:00:00Z\"", "ERR Validation failed for property \"a\" with string \"2020-02-30T00:00:00Z\" because the string is not of type date."),
            (coerce(Token::Date), "1577836800000", "\"2020-01-01T00:00:00.000Z\""),
            (coerce(min(2, Token::Number)), "\"1\"", "ERR Value \"1\" for property \"a\" must be a minimum of 2 (was 1)."),
            (email(any()), "\"a@b.co\"", "\"a@b.co\""),
            (email(any()), "\"nope\"", "ERR Value \"nope\" for property \"a\" is not a valid email address."),
            (email(any()), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type string."),
            (url(any()), "\"https://example.com/a?b=c#d\"", "\"https://example.com/a?b=c#d\""),
            (url(any()), "\"example.com\"", "ERR Value \"example.com\" for property \"a\" is not a valid URL."),
            (uuid(any()), "\"123e4567-e89b-12d3-a456-426614174000\"", "\"123e4567-e89b-12d3-a456-426614174000\""),
            (uuid(any()), "\"123e4567e89b12d3a456426614174000\"", "ERR Value \"123e4567e89b12d3a456426614174000\" for property \"a\" is not a valid UUID."),
            (date_time(any()), "\"2020-01-01T00:00:00Z\"", "\"2020-01-01T00:00:00Z\""),
            (date_time(any()), "\"2021-02-29T00:00:00Z\"", "ERR Value \"2021-02-29T00:00:00Z\" for property \"a\" is not a valid ISO 8601 date-time."),
            (ip(any()), "\"127.0.0.1\"", "\"127.0.0.1\""),
            (ip(any()), "\"::1\"", "\"::1\""),
            (ip(any()), "\"1.2.3\"", "ERR Value \"1.2.3\" for property \"a\" is not a valid IP address."),
            (ipv4(any()), "\"::1\"", "ERR Value \"::1\" for property \"a\" is not a valid IPv4 address."),
            (ipv6(any()), "\"1.2.3.4\"", "ERR Value \"1.2.3.4\" for property \"a\" is not a valid IPv6 address."),
            (ipv6(any()), "\"::ffff:192.168.1.1\"", "\"::ffff:192.168.1.1\""),
            (email(min(10, Token::String)), "\"nope\"", "ERR Value \"nope\" for property \"a\" must be a minimum length of 10 (was 4).\nValue \"nope\" for property \"a\" is not a valid email address."),
            (fault("boom", min(2, Token::Number)), "1", "ERR Value \"1\" for property \"a\" must be a minimum of 2 (was 1)."),
            (fault("boom", email(any())), "1", "ERR boom"),
            (
                email(Token::Number),
                "1",
                "ERR Value \"1\" for property \"a\" is not a valid email address.",
            ),
            (
                email(Token::Number),
                "\"x\"",
                "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number.",
            ),
            (buildize(Token::String).email().url().uuid().date_time().ip().ipv4().ipv6(), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type string."),
            (buildize(Token::Number).coerce(), "\"7\"", "7"),
            (buildize(Token::Number).describe("n"), "7", "7"),
        ];
        for (n, input, want) in cases {
            let got = run(&at_a(n), &a(input));
            let want = if want.starts_with("ERR") {
                want.to_string()
            } else {
                a(want)
            };
            assert_eq!(got, want, "{}", input);
        }
        assert_eq!(
            run(&at_a(email(any())), "{}"),
            "ERR Validation failed for property \"a\" because the property is missing."
        );
        assert_eq!(run(&at_a(optional(email(any()))), "{}"), a("\"\""));
        let e = &at_a(email(any())).error(&j(&a("\"nope\"")))[0];
        assert_eq!((e.why.as_str(), e.mark), ("Email", 4000));
        assert!(!at_a(email(any())).valid(&j(&a("\"nope\""))));
        assert_eq!(stringify_node(&email(any()), false), "String.Email");
    }

    #[test]
    fn types_and_structure() {
        assert_eq!(run(&at_a(type_(Kind::Number, any())), &a("3")), a("3"));
        assert_eq!(
            run(&at_a(type_(Token::Number, any())), &a("\"x\"")),
            "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."
        );
        assert_eq!(
            run(&at_a(type_("String", any())), &a("3")),
            "ERR Validation failed for property \"a\" with number \"3\" because the number is not of type string."
        );
        assert_eq!(
            run(&Schema::new(type_("Object", any())), "1"),
            "ERR Validation failed for number \"1\" because the number is not of type object."
        );
        assert_eq!(
            run(&Schema::new(type_("Object", any())), r#"{"z":1}"#),
            "ERR Validation failed for object \"{z:1}\" because the property \"z\" is not allowed."
        );
        assert_eq!(type_("nonsense", any()).kind, Kind::Any);
        assert_eq!(type_(buildize(Token::Integer), any()).kind, Kind::Integer);
        assert_eq!(type_(min(2, any()), any()).kind, Kind::Any);
        for (n, k) in [
            (any().string(), Kind::String),
            (any().number(), Kind::Number),
            (any().boolean(), Kind::Boolean),
            (any().object(), Kind::Object),
            (any().array(), Kind::Array),
            (any().function(), Kind::Function),
            (any().integer(), Kind::Integer),
            (any().date(), Kind::Date),
            (buildize(Token::Number).any(), Kind::Any),
        ] {
            assert_eq!(n.kind, k);
        }
        assert_eq!(
            run(&Schema::new(obj([("n", Spec::from(func(any())))])), "{}"),
            "{}"
        );
        assert_eq!(
            run(
                &Schema::new(obj([("n", Spec::from(Token::Function))])),
                "{}"
            ),
            "ERR Validation failed for property \"n\" because the property is missing."
        );
        assert_eq!(buildize(Token::Number).func().kind, Kind::Function);

        assert!(!open(Token::Number).is_open());
        let tuple = closed(arr([Spec::from(Token::Number)]));
        assert_eq!(tuple.arr_children.len(), 1);
        assert_eq!(run(&at_a(tuple.clone()), &a("[1]")), a("[1]"));
        assert!(!at_a(tuple).valid(&j(&a("[1,2]"))));
        assert!(closed(arr([Spec::from(1), Spec::from(2)]))
            .arr_child
            .is_none());
        let c = child(Token::Number, Token::Number);
        assert!(c.kind == Kind::Object && c.obj_rest.is_some());
        assert!(buildize(Token::Array)
            .child(Token::Number)
            .arr_child
            .is_some());
        assert!(buildize(Token::Object)
            .child(Token::Number)
            .obj_rest
            .is_some());
        assert_eq!(
            run(
                &at_a(rest(Token::Number, arr([Spec::from(1)]))),
                &a("[1,2,3]")
            ),
            a("[1,2,3]")
        );
        assert_eq!(run(&at_a(rest(Token::Number, any())), &a("[2]")), a("[2]"));
        assert!(!at_a(rest(Token::Number, arr([Spec::from(1)]))).valid(&j(&a("[1,\"x\"]"))));
        assert_eq!(default_of("x").kind, Kind::String);
        assert_eq!(run(&at_a(default_of("x")), "{}"), a("\"x\""));
        assert_eq!(run(&at_a(empty(any())), &a("\"\"")), a("\"\""));
        assert_eq!(run(&at_a(empty(any())), &a("0")), a("0"));
        assert_eq!(run(&at_a(ignore(empty(any()))), &a("0")), a("0"));
        assert_eq!(
            run(&at_a(required(null())), "{}"),
            "ERR Validation failed for property \"a\" because the property is missing."
        );
        assert_eq!(run(&at_a(skip(null())), "{}"), "{}");
        assert_eq!(run(&at_a(min(2, null())), "{}"), a("null"));
        assert_eq!(
            run(&at_a(required(f64::NAN)), "{}"),
            "ERR Validation failed for property \"a\" because the property is missing."
        );
        assert_eq!(run(&at_a(min(2, f64::NAN)), "{}"), a("null"));
        assert_eq!(run(&at_a(never(Token::String)), "{}"), "ERR Validation failed for property \"a\" with value \"undefined\" because no value is allowed.");
        assert_eq!(
            run(&at_a(nullable(closed(obj::<&str, Spec>([])))), &a("null")),
            a("null")
        );
        assert_eq!(run(&at_a(optional(nullable(Token::Number))), "{}"), a("0"));
    }

    #[test]
    fn untyped_defaults_take_the_default_kind() {
        let cases: Vec<(Node, &str, &str)> = vec![
            (default(2, required(any())), "\"x\"", "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."),
            (default(2, required(any())), "{}", "2"),
            (default(2, describe("two", required(any()))), "3", "3"),
            (default(2, fault("not two", exact([2]))), "3", "ERR Value \"3\" for property \"a\" must be exactly one of: 2"),
            (default(2, exact([2, 3])), "3", "3"),
            (default(2, nullable(required(any()))), "null", "null"),
            (default("x", empty(required(any()))), "\"\"", "\"\""),
            (default(2, after(|_, _| false, any())), "3", "ERR Validation failed for property \"a\" with number \"3\" because check \"After\" failed."),
            // Default clears skippable, so an Ignore's silence remains alone.
            (default(2, ignore(any())), "\"x\"", "\"x\""),
            (default(Value::Undefined, any()), "\"x\"", "\"x\""),
            (default(7, Token::Number), "{}", "7"),
        ];
        for (n, input, want) in cases {
            let got = if input == "{}" {
                run(&at_a(n), "{}")
            } else {
                run(&at_a(n), &a(input))
            };
            let want = if want.starts_with("ERR") || want == "{}" {
                want.to_string()
            } else {
                a(want)
            };
            assert_eq!(got, want, "{}", input);
        }
        let d = default(2, describe("two", any()));
        assert_eq!(d.meta.get("description"), Some(&Value::from("two")));
    }
}

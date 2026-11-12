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
use crate::node::{Counted, Kind, ListMode, Node, Token, Validator};
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
pub fn Any() -> Node {
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
        counted: None,
    }
}

// The free functions: each takes the spec it applies to. Pass `Any()` for
// the bare form.

/// The value must be present.
pub fn Required(spec: impl Into<Spec>) -> Node {
    buildize(spec).Required()
}

/// The value may be absent; the default is injected.
pub fn Optional(spec: impl Into<Spec>) -> Node {
    buildize(spec).Optional()
}

/// Optional, with an explicit default. The node is the spec's, so an object
/// or array shape keeps its children; an untyped spec takes the default's
/// kind.
pub fn Default(dval: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Default(dval)
}

/// A default with no spec: the node takes the default's kind.
pub fn DefaultOf(dval: impl Into<Value>) -> Node {
    let dval = dval.into();
    normalize(Spec::Value(dval.clone())).Default(dval)
}

/// Optional, and an absent value leaves the key out.
pub fn Skip(spec: impl Into<Spec>) -> Node {
    buildize(spec).Skip()
}

/// Like `Skip`, and a value that fails is dropped with its errors.
pub fn Ignore(spec: impl Into<Spec>) -> Node {
    buildize(spec).Ignore()
}

/// The empty string is allowed. Untyped when bare: `Empty(Any())` allows
/// the empty string without also demanding a string.
pub fn Empty(spec: impl Into<Spec>) -> Node {
    buildize(spec).Empty()
}

/// An explicit null is accepted as the value.
pub fn Nullable(spec: impl Into<Spec>) -> Node {
    buildize(spec).Nullable()
}

/// An object accepts keys it does not declare.
pub fn Open(spec: impl Into<Spec>) -> Node {
    buildize(spec).Open()
}

/// An object rejects keys it does not declare; a single-shape array becomes
/// a tuple of one.
pub fn Closed(spec: impl Into<Spec>) -> Node {
    buildize(spec).Closed()
}

/// The shape of every unknown object value, or of every array element.
pub fn Child(child: impl Into<Spec>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Child(child)
}

/// The shape of the array elements past the tuple positions.
pub fn Rest(child: impl Into<Spec>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Rest(child)
}

/// A `Fault` message overriding the structural text.
pub fn Fault(msg: impl Into<String>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Fault(msg)
}

/// A node that accepts nothing. An absent value is still governed by
/// required or optional: Never alone requires a value, and so always
/// fails; Optional or Skip around it means the value must be absent. The
/// chained `.Never()` keeps the node's flags.
pub fn Never(spec: impl Into<Spec>) -> Node {
    let mut n = buildize(spec).Never();
    n.required = true;
    n.required_set = true;
    n
}

/// The kind the node asserts, given a kind, a token, a kind name or a node
/// to take it from.
pub fn Type(kind: impl Into<TypeRef>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Type(kind)
}

/// A function-typed value. A builder, not a type token, so it does not
/// require a value of itself.
pub fn Func(spec: impl Into<Spec>) -> Node {
    buildize(spec).Func()
}

/// The value must equal one of the literals. Exact asks for a value, as a
/// type token does, so Optional or Skip around it lets the value be
/// absent; the chained `.Exact(..)` keeps the node's flags.
pub fn Exact<I>(vals: I) -> Node
where
    I: IntoIterator,
    I::Item: Into<Value>,
{
    let mut n = Any().Exact(vals);
    n.required = true;
    n.required_set = true;
    n
}

/// A minimum value, or length.
pub fn Min(bound: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Min(bound)
}

/// A maximum value, or length.
pub fn Max(bound: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Max(bound)
}

/// A strict lower bound on value, or length.
pub fn Above(bound: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Above(bound)
}

/// A strict upper bound on value, or length.
pub fn Below(bound: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Below(bound)
}

/// An exact value, or length.
pub fn Len(length: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Len(length)
}

/// A custom check, run before the structural check.
pub fn Check<F>(f: F, spec: impl Into<Spec>) -> Node
where
    F: Fn(&mut State<'_>, &mut Update) -> bool + Send + Sync + 'static,
{
    let mut n = buildize(spec);
    if n.kind == Kind::Any {
        n.kind = Kind::Check;
    }
    n.required = true;
    n.required_set = true;
    n.Check(f)
}

/// A regexp check: the value must be a string matching it. A failure reads
/// `check "/re/" failed`.
pub fn CheckRe(re: Regex, spec: impl Into<Spec>) -> Node {
    check_re_src(re.as_str(), spec)
}

/// `CheckRe` from a pattern text.
pub(crate) fn check_re_src(src: &str, spec: impl Into<Spec>) -> Node {
    let mut n = buildize(spec);
    if n.kind == Kind::Any {
        n.kind = Kind::Check;
    }
    n.required = true;
    n.required_set = true;
    n.check_re_src(src)
}

/// A custom validator run before the structural check.
pub fn Before<F>(f: F, spec: impl Into<Spec>) -> Node
where
    F: Fn(&mut State<'_>, &mut Update) -> bool + Send + Sync + 'static,
{
    buildize(spec).Before(f)
}

/// A custom validator run after the structural check.
pub fn After<F>(f: F, spec: impl Into<Spec>) -> Node
where
    F: Fn(&mut State<'_>, &mut Update) -> bool + Send + Sync + 'static,
{
    buildize(spec).After(f)
}

/// The value must satisfy every shape.
pub fn All<I>(shapes: I) -> Node
where
    I: IntoIterator,
    I::Item: Into<Spec>,
{
    list_node(ListMode::All, shapes)
}

/// The message of a `Nof` whose count is neither a whole number of zero or
/// more nor a shape.
pub(crate) const NOF_FAULT: &str =
    "Shape: Nof needs a whole number of zero or more, or a shape for the count";

/// The value must satisfy as many of the shapes as the count admits. The
/// count is a whole number, for exactly that many, or a shape the number
/// must satisfy: `Nof(1, ..)` is exactly one, `Nof(Min(1, Any()), ..)` at
/// least one, `Nof(0, [s])` not `s`. A shape is tried only while the shapes
/// left untried could still change the verdict. A count of exactly one
/// produces: the one shape the value satisfies makes the result. Any other
/// count only checks, and the value is left as it was given. An absent value
/// is not tried, so whether it may be absent is the node's required or
/// optional.
pub fn Nof<C, I>(count: C, shapes: I) -> Node
where
    C: Into<Spec>,
    I: IntoIterator,
    I::Item: Into<Spec>,
{
    let mut n = list_node(ListMode::Nof, shapes);
    let total = n.list.len();
    match count.into() {
        Spec::Value(Value::Num(f)) => {
            if f != f.trunc() || f < 0.0 || f.is_infinite() {
                return fault_node(NOF_FAULT);
            }
            n.nof_exact = f;
            n.nof_ok = (0..=total).map(|c| c as f64 == f).collect();
        }
        spec => {
            let counter = crate::Schema::new(spec);
            // A count that is itself a builder's fault is the fault: it is
            // never validated, so its message would otherwise be lost.
            if is_fault(counter.node()) {
                return counter.node().clone();
            }
            n.nof_ok = (0..=total)
                .map(|c| counter.valid(&Value::Num(c as f64)))
                .collect();
            n.nof_count = Some(Box::new(counter.node().clone()));
        }
    }
    n.nof_one = total > 0 && n.nof_ok.iter().enumerate().all(|(c, ok)| *ok == (c == 1));
    // Exactly one of shapes of different kinds is the shape of the value's
    // kind: the value is put to that shape alone.
    if n.nof_one {
        n.nof_kinds = nof_kinds(&n.list);
    }
    n
}

/// The checks that leave a shape's kind as it was, by validator name: a
/// shape with no others takes a value of its own kind only. A check by
/// regexp is named by its pattern; a check by function is no such check.
const KIND_KEEPING: [&str; 16] = [
    "Above", "Below", "Contains", "DateTime", "Define", "Email", "Exact", "Ip", "Ipv4", "Ipv6",
    "Len", "Max", "Min", "Unique", "Url", "Uuid",
];

/// Whether a shape takes values of its own kind only: it is not Nullable,
/// and every check it carries keeps the kind. Ignore and Rename are checks
/// in TypeScript, and so do not.
fn keeps_kind(n: &Node) -> bool {
    !n.nullable
        && !n.is_ignore()
        && n.rename_to.is_none()
        && n.befores
            .iter()
            .chain(n.afters.iter())
            .all(|v| KIND_KEEPING.contains(&v.name.as_str()) || v.name.starts_with('/'))
}

/// The kinds of the shapes, where each is of a different kind and takes
/// values of that kind only.
pub(crate) fn nof_kinds(list: &[Node]) -> Option<Vec<&'static str>> {
    let mut kinds: Vec<&'static str> = Vec::with_capacity(list.len());
    for n in list {
        let kind = n.kind.json_kind().filter(|_| keeps_kind(n))?;
        if kinds.contains(&kind) {
            return None;
        }
        kinds.push(kind);
    }
    Some(kinds)
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

/// The message of a `When` with no condition.
pub(crate) const WHEN_FAULT: &str = "Shape: When needs a shape for its condition";

/// The value must satisfy the shape its condition picks: `then` where the
/// value satisfies `cond`, and `otherwise` where it does not. The condition
/// is tried on the value and only checks; the shape it picks validates the
/// value and makes the result, and its errors are the errors. Pass `Any()`
/// for a shape that passes everything. An absent value is not tried, so
/// whether it may be absent is the node's required or optional.
pub fn When(cond: impl Into<Spec>, then: impl Into<Spec>, otherwise: impl Into<Spec>) -> Node {
    let cond = cond.into();
    if matches!(cond, Spec::Value(Value::Undefined)) {
        return fault_node(WHEN_FAULT);
    }
    let n = list_node(ListMode::When, [cond, then.into(), otherwise.into()]);
    // A shape that is a builder's fault is the fault: it would have thrown
    // in TypeScript, and a condition that passes nothing would hide it.
    match n.list.iter().find(|b| is_fault(b)) {
        Some(f) => f.clone(),
        None => n,
    }
}

/// The message of a `Contains` whose count is neither a whole number of
/// zero or more nor a shape.
pub(crate) const CONTAINS_FAULT: &str =
    "Shape: Contains needs a whole number of zero or more, or a shape for the count";

/// The message of a `Contains` with no shape for its items.
pub(crate) const CONTAINS_ITEMS_FAULT: &str =
    "Shape: Contains needs a shape for the items it counts";

/// The number of an array's items that satisfy the shape must be one the
/// count admits. The count is a whole number, for exactly that many, or a
/// shape the number must satisfy: `Contains(Min(1, Any()), s, ..)` is at
/// least one, `Contains(0, s, ..)` none. Each item is tried on its own,
/// and only while the items left untried could still change the verdict;
/// the array is left as it was given. A value that is not an array is not
/// counted, so whether it is one is the node's type check. Pass
/// `arr::<Spec>([])` for the bare form, an array of anything.
pub fn Contains(count: impl Into<Spec>, shape: impl Into<Spec>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Contains(count, shape)
}

/// No two of an array's items may be equal as JSON values: a number by its
/// value, an array by its items in order, an object by its keys and their
/// values, in any order. The error names the first item equal to one
/// before it, and the first of those. A value that is not an array is not
/// checked. Pass `arr::<Spec>([])` for the bare form, an array of anything.
pub fn Unique(spec: impl Into<Spec>) -> Node {
    buildize(spec).Unique()
}

/// The whole numbers a count shape's bounds admit, `lo` to `hi`, from its
/// Min, Max, Above, Below and Len, and whether they are all it admits: it
/// takes any number, and has no other check.
fn count_bounds(n: &Node) -> (f64, f64, bool) {
    let (mut lo, mut hi) = (0.0, f64::INFINITY);
    let mut interval = matches!(n.kind, Kind::Any | Kind::Number | Kind::Integer)
        && n.afters.is_empty()
        && !n.silent
        && n.rename_to.is_none();
    for v in &n.befores {
        match (v.name.as_str(), v.args.first().and_then(bound_arg)) {
            ("Min", Some(b)) => lo = above_of(lo, b.ceil()),
            ("Max", Some(b)) => hi = below_of(hi, b.floor()),
            ("Above", Some(b)) => lo = above_of(lo, b.floor() + 1.0),
            ("Below", Some(b)) => hi = below_of(hi, b.ceil() - 1.0),
            ("Len", Some(b)) => (lo, hi) = (above_of(lo, b), below_of(hi, b)),
            _ => interval = false,
        }
    }
    (lo, hi, interval)
}

/// The larger bound, as `Math.max` takes it: a zero of either sign is no
/// larger than the other.
fn above_of(lo: f64, b: f64) -> f64 {
    if b > lo {
        b
    } else {
        lo
    }
}

/// The smaller bound, as `Math.min` takes it.
fn below_of(hi: f64, b: f64) -> f64 {
    if b < hi {
        b
    } else {
        hi
    }
}

/// The check of a Contains, on a node of its own for `adopt`, or the fault
/// of a wrong argument. The count is read before the item shape, as
/// TypeScript evaluates the arguments.
fn contains_node(count: Spec, shape: Spec) -> Node {
    let (count, (lo, hi, interval)) = match count {
        Spec::Value(Value::Num(f)) => {
            if f != f.trunc() || f < 0.0 || f.is_infinite() {
                return fault_node(CONTAINS_FAULT);
            }
            (None, (f, f, true))
        }
        Spec::Value(Value::Undefined) => return fault_node(CONTAINS_FAULT),
        spec => {
            let counter = crate::Schema::new(spec);
            // A count that is itself a builder's fault is the fault.
            if is_fault(counter.node()) {
                return counter.node().clone();
            }
            let bounds = count_bounds(counter.node());
            (Some(counter), bounds)
        }
    };
    if matches!(shape, Spec::Value(Value::Undefined)) {
        return fault_node(CONTAINS_ITEMS_FAULT);
    }
    let mut item = normalize(shape);
    if is_fault(&item) {
        return item;
    }
    // The items are tried apart from the schema's walk, so the shape is
    // prepared here, as the schema's own tree is.
    crate::prepare_node(&mut item);
    let count_text = match &count {
        Some(c) => crate::stringify::stringify_node(c.node(), true),
        None => js_number(lo),
    };
    let shape_text = crate::stringify::stringify_node(&item, true);
    let counted = Arc::new(Counted {
        count,
        lo,
        hi,
        interval,
        shape: item,
        admitted: std::sync::Mutex::new(Vec::new()),
    });
    let run = Arc::clone(&counted);
    let suffix = format!("Contains({},{})", count_text, shape_text);
    let mut n = Any();
    n.befores.push(Validator {
        name: "Contains".to_string(),
        func: Arc::new(move |state: &mut State<'_>, update: &mut Update| {
            crate::validate::count_items(&run, &shape_text, &count_text, state, update)
        }),
        args: Vec::new(),
        suffix: Some(suffix),
        inner: None,
        counted: Some(counted),
    });
    n
}

/// Name the node so a later `Refer` can substitute it.
pub fn Define(name: impl Into<String>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Define(name)
}

/// Substitute the named node at validation time.
pub fn Refer(name: impl Into<String>, spec: impl Into<Spec>) -> Node {
    buildize(spec).ReferWith(name, ReferOptions::default())
}

/// `Refer` with options.
pub fn ReferWith(name: impl Into<String>, opts: ReferOptions, spec: impl Into<Spec>) -> Node {
    buildize(spec).ReferWith(name, opts)
}

/// Rename the property after validation. For object children only.
pub fn Rename(name: impl Into<String>, spec: impl Into<Spec>) -> Node {
    buildize(spec).RenameWith(name, RenameOptions::default())
}

/// `Rename` with options.
pub fn RenameWith(name: impl Into<String>, opts: RenameOptions, spec: impl Into<Spec>) -> Node {
    buildize(spec).RenameWith(name, opts)
}

/// The value is replaced with the key of the property it sits under.
pub fn Key() -> Node {
    KeyArgs(&[])
}

/// The value is replaced with the path `depth` levels up, as an array.
pub fn KeyDepth(depth: i64) -> Node {
    KeyArgs(&[Value::from(depth)])
}

/// The value is replaced with the path `depth` levels up, joined by `sep`.
pub fn KeyJoin(depth: i64, sep: impl Into<String>) -> Node {
    KeyArgs(&[Value::from(depth), Value::Str(sep.into())])
}

/// `Key` from raw arguments: a numeric argument is the depth, a string the
/// separator, as the string form of a spec supplies them.
pub fn KeyArgs(args: &[Value]) -> Node {
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
pub fn Catch(fallback: impl Into<Value>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Catch(fallback)
}

/// A valid value is replaced with a function of it.
pub fn Transform<F>(f: F, spec: impl Into<Spec>) -> Node
where
    F: Fn(Value, &mut State<'_>) -> Value + Send + Sync + 'static,
{
    buildize(spec).Transform(f)
}

/// A description, read back from the node's meta.
pub fn Describe(description: impl Into<String>, spec: impl Into<Spec>) -> Node {
    buildize(spec).Describe(description)
}

/// The value is converted to the node's kind where the conversion is
/// unambiguous, before the type check.
pub fn Coerce(spec: impl Into<Spec>) -> Node {
    buildize(spec).Coerce()
}

/// A string in email address form.
pub fn Email(spec: impl Into<Spec>) -> Node {
    buildize(spec).Email()
}

/// An absolute URL.
pub fn Url(spec: impl Into<Spec>) -> Node {
    buildize(spec).Url()
}

/// A UUID in 8-4-4-4-12 hex form.
pub fn Uuid(spec: impl Into<Spec>) -> Node {
    buildize(spec).Uuid()
}

/// A strict ISO 8601 date-time string.
pub fn DateTime(spec: impl Into<Spec>) -> Node {
    buildize(spec).DateTime()
}

/// An IPv4 or IPv6 address.
pub fn Ip(spec: impl Into<Spec>) -> Node {
    buildize(spec).Ip()
}

/// A dotted-quad IPv4 address.
pub fn Ipv4(spec: impl Into<Spec>) -> Node {
    buildize(spec).Ipv4()
}

/// An IPv6 address in RFC 4291 text form.
pub fn Ipv6(spec: impl Into<Spec>) -> Node {
    buildize(spec).Ipv6()
}

/// What `Type` takes its kind from.
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

/// `Refer` options.
#[derive(Clone, Debug, Default)]
pub struct ReferOptions {
    /// Substitute even when the value is absent (not for self-recursion).
    pub fill: bool,
    /// A name with no `Define` is an error, rather than a `Refer` that does
    /// nothing.
    pub strict: bool,
}

/// `Rename` options.
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
        // An ASCII string is one UTF-16 unit per byte.
        Value::Str(s) => Some(if s.is_ascii() {
            s.len()
        } else {
            s.encode_utf16().count()
        } as f64),
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
    let mut n = Any();
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
            update.done = true;
            update.mark = kind.mark();
            // A verdict-only call counts the failure and reads no message.
            if !state.ctx.terse {
                update.why = Some(kind.name().to_string());
                update.err = Some(UpdateErr::Text(kind.text(
                    is_numeric(state.value),
                    &text,
                    &size_text(size),
                )));
            }
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
    let mut n = Any();
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
            update.done = true;
            update.mark = 4015;
            // A verdict-only call counts the failure and reads no message.
            if !state.ctx.terse {
                let suffix = if is_numeric(state.value) {
                    ""
                } else {
                    " in length"
                };
                update.why = Some("Len".to_string());
                update.err = Some(UpdateErr::Text(format!(
                    "Value \"$VALUE\" for property \"$PATH\" must be exactly {}{} (was {}).",
                    text,
                    suffix,
                    size_text(size)
                )));
            }
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

    pub fn Required(mut self) -> Node {
        self.required = true;
        self.required_set = true;
        self.skippable = false;
        self
    }

    pub fn Optional(mut self) -> Node {
        self.required = false;
        self.required_set = true;
        self
    }

    /// Optional with the default; named to leave `Default::default` alone.
    /// An untyped node is built over the default instead, and so takes the
    /// default's kind, keeping the checks and flags it carried.
    pub fn Default(mut self, dval: impl Into<Value>) -> Node {
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

    pub fn Skip(mut self) -> Node {
        self.required = false;
        self.required_set = true;
        self.skippable = true;
        self
    }

    pub fn Ignore(mut self) -> Node {
        self.required = false;
        self.required_set = true;
        self.skippable = true;
        self.silent = true;
        self
    }

    pub fn Empty(mut self) -> Node {
        self.empty = true;
        self
    }

    pub fn Nullable(mut self) -> Node {
        self.nullable = true;
        self
    }

    pub fn Open(mut self) -> Node {
        if self.kind == Kind::Object && self.obj_rest.is_none() {
            self.obj_rest = Some(Box::new(Node::of(Kind::Any)));
        }
        self
    }

    pub fn Closed(mut self) -> Node {
        self.obj_rest = None;
        if self.kind == Kind::Array && self.arr_children.is_empty() {
            if let Some(c) = self.arr_child.take() {
                // A single-shape array made fixed: a tuple of one.
                self.arr_children = vec![*c];
            }
        }
        self
    }

    pub fn Child(mut self, child: impl Into<Spec>) -> Node {
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

    pub fn Rest(mut self, child: impl Into<Spec>) -> Node {
        self.kind = Kind::Array;
        // The rest replaces a plain element shape, as it does in TypeScript,
        // where Rest sets the one child an array has: Rest(Number, [String])
        // is an array of numbers. Fixed positions are a tuple, and are kept.
        self.arr_child = None;
        self.arr_rest = Some(Box::new(buildize(child)));
        self
    }

    pub fn Fault(mut self, msg: impl Into<String>) -> Node {
        self.fault_msg = Some(msg.into());
        self
    }

    pub fn Never(mut self) -> Node {
        self.kind = Kind::Never;
        self
    }

    /// The value may be anything.
    pub fn Any(mut self) -> Node {
        self.kind = Kind::Any;
        self
    }

    /// Adopt the reference type's kind and its required, skippable and
    /// default state. Structural children are deliberately not copied:
    /// `Type(Object)` is a closed object and `Type(Array)` accepts any
    /// elements.
    pub fn Type(mut self, kind: impl Into<TypeRef>) -> Node {
        let tn = match kind.into() {
            TypeRef::Kind(k) => type_token_node(k),
            TypeRef::Node(n) => *n,
        };
        // Any keeps the value it is given as its default, as `Any(0)` does
        // in TypeScript; the other tokens bring their own.
        let keep = tn.kind == Kind::Any && self.has_default && !self.default.is_undefined();
        self.kind = tn.kind;
        self.kind_set = true;
        self.required = tn.required;
        self.required_set = tn.required_set;
        self.skippable = tn.skippable;
        if !keep {
            self.has_default = tn.has_default;
            self.default = tn.default;
            self.literal = tn.literal;
        }
        self
    }

    pub fn String(self) -> Node {
        self.Type(Kind::String)
    }
    pub fn Number(self) -> Node {
        self.Type(Kind::Number)
    }
    pub fn Boolean(self) -> Node {
        self.Type(Kind::Boolean)
    }
    pub fn Object(self) -> Node {
        self.Type(Kind::Object)
    }
    pub fn Array(self) -> Node {
        self.Type(Kind::Array)
    }
    pub fn Function(self) -> Node {
        self.Type(Kind::Function)
    }
    pub fn Integer(self) -> Node {
        self.Type(Kind::Integer)
    }
    pub fn Date(self) -> Node {
        self.Type(Kind::Date)
    }

    /// A function-typed value; the required state is kept.
    pub fn Func(mut self) -> Node {
        self.kind = Kind::Function;
        self
    }

    pub fn Exact<I>(mut self, vals: I) -> Node
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
                let absent = state.value.is_undefined();
                let node = state.node;
                if absent && node.has_default && wanted.contains(&node.default) {
                    return true;
                }
                // Absent, where the node does not require a value and has
                // no default to put in its place.
                let no_default = !node.has_default || node.default.is_undefined();
                if absent && (node.skippable || (!node.required && no_default)) {
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

    pub fn Min(self, bound: impl Into<Value>) -> Node {
        self.adopt(bound_node(Bound::Min, bound.into()))
    }

    pub fn Max(self, bound: impl Into<Value>) -> Node {
        self.adopt(bound_node(Bound::Max, bound.into()))
    }

    pub fn Above(self, bound: impl Into<Value>) -> Node {
        self.adopt(bound_node(Bound::Above, bound.into()))
    }

    pub fn Below(self, bound: impl Into<Value>) -> Node {
        self.adopt(bound_node(Bound::Below, bound.into()))
    }

    pub fn Len(self, length: impl Into<Value>) -> Node {
        self.adopt(len_node(length.into()))
    }

    /// A count of the array's items that satisfy a shape: see `Contains`.
    pub fn Contains(self, count: impl Into<Spec>, shape: impl Into<Spec>) -> Node {
        self.adopt(contains_node(count.into(), shape.into()))
    }

    /// No two of the array's items equal as JSON values: see `Unique`.
    pub fn Unique(mut self) -> Node {
        self.befores.push(validator(
            "Unique",
            Some("Unique()".to_string()),
            Vec::new(),
            |state, update| {
                let Value::Arr(items) = state.value else {
                    return true;
                };
                let Some((i, j)) = crate::value::repeated(items) else {
                    return true;
                };
                // A verdict-only call counts the failure and reads no message.
                if !state.ctx.terse {
                    update.err = Some(UpdateErr::Text(format!(
                        "Value \"$VALUE\" for property \"$PATH\" must have unique items (items {} and {} are equal).",
                        i, j
                    )));
                }
                false
            },
        ));
        self
    }

    pub fn Check<F>(mut self, f: F) -> Node
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

    pub fn CheckRe(self, re: Regex) -> Node {
        self.check_re_src(re.as_str())
    }

    pub(crate) fn check_re_src(mut self, src: &str) -> Node {
        let src = src.to_string();
        let re = match crate::regexp::compile_regexp(&src) {
            Ok(engine) => engine,
            Err(msg) => return self.adopt(fault_node(msg)),
        };
        let name = format!("/{}/", src);
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

    pub fn Before<F>(mut self, f: F) -> Node
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

    pub fn After<F>(mut self, f: F) -> Node
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

    pub fn Define(mut self, name: impl Into<String>) -> Node {
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
                if let Some(d) = state.defs.get(&name).cloned() {
                    state.ctx.refs.insert(name.clone(), d);
                }
                true
            },
        ));
        self
    }

    pub fn Refer(self, name: impl Into<String>) -> Node {
        self.ReferWith(name, ReferOptions::default())
    }

    pub fn ReferWith(mut self, name: impl Into<String>, opts: ReferOptions) -> Node {
        let name = name.into();
        if name.is_empty() {
            return fault_node("Shape: Refer needs a name");
        }
        self.refer_name = Some(name.clone());
        self.refer_fill = opts.fill;
        self.refer_strict = opts.strict;
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
                    .or_else(|| state.defs.get(&name).cloned());
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

    pub fn Rename(self, name: impl Into<String>) -> Node {
        self.RenameWith(name, RenameOptions::default())
    }

    pub fn RenameWith(mut self, name: impl Into<String>, opts: RenameOptions) -> Node {
        let name = name.into();
        if name.is_empty() {
            return fault_node("Shape: Rename needs a name");
        }
        self.rename_to = Some(name);
        self.rename_keep = opts.keep;
        self.rename_claim = opts.claim;
        self
    }

    pub fn Catch(self, fallback: impl Into<Value>) -> Node {
        catch_node(self, fallback.into())
    }

    pub fn Transform<F>(self, f: F) -> Node
    where
        F: Fn(Value, &mut State<'_>) -> Value + Send + Sync + 'static,
    {
        let f: Arc<TransformFn> = Arc::new(f);
        transform_node(self, f)
    }

    pub fn Describe(mut self, description: impl Into<String>) -> Node {
        self.meta
            .insert("description".to_string(), Value::Str(description.into()));
        self
    }

    pub fn Coerce(mut self) -> Node {
        self.befores.insert(0, coerce_validator());
        self
    }

    pub fn Email(self) -> Node {
        with_format(self, FMT_EMAIL)
    }
    pub fn Url(self) -> Node {
        with_format(self, FMT_URL)
    }
    pub fn Uuid(self) -> Node {
        with_format(self, FMT_UUID)
    }
    pub fn DateTime(self) -> Node {
        with_format(self, FMT_DATE_TIME)
    }
    pub fn Ip(self) -> Node {
        with_format(self, FMT_IP)
    }
    pub fn Ipv4(self) -> Node {
        with_format(self, FMT_IPV4)
    }
    pub fn Ipv6(self) -> Node {
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
            (Min(3, Token::Number), "5", "{\"a\":5}"),
            (Min(3, Token::Number), "1", "ERR Value \"1\" for property \"a\" must be a minimum of 3 (was 1)."),
            (Max(3, Token::Number), "9", "ERR Value \"9\" for property \"a\" must be a maximum of 3 (was 9)."),
            (Above(3, Token::Number), "3", "ERR Value \"3\" for property \"a\" must be above 3 (was 3)."),
            (Below(3, Token::Number), "3", "ERR Value \"3\" for property \"a\" must be below 3 (was 3)."),
            (Len(3, Token::Number), "4", "ERR Value \"4\" for property \"a\" must be exactly 3 (was 4)."),
            (Min(3, Token::String), "\"hi\"", "ERR Value \"hi\" for property \"a\" must be a minimum length of 3 (was 2)."),
            (Max(2, Token::String), "\"hey\"", "ERR Value \"hey\" for property \"a\" must be a maximum length of 2 (was 3)."),
            (Len(3, Token::String), "\"abc\"", "{\"a\":\"abc\"}"),
            (Len(3, Token::String), "\"ab\"", "ERR Value \"ab\" for property \"a\" must be exactly 3 in length (was 2)."),
            (Min(2, Any()), "[1]", "ERR Value \"[1]\" for property \"a\" must be a minimum length of 2 (was 1)."),
            (Above(1, Any()), "\"a\"", "ERR Value \"a\" for property \"a\" must have length above 1 (was 1)."),
            (Below(1, Any()), "\"ab\"", "ERR Value \"ab\" for property \"a\" must have length below 1 (was 2)."),
            (Min(2, Token::Object), "{\"x\":1}", "ERR Value \"{x:1}\" for property \"a\" must be a minimum length of 2 (was 1)."),
            (Min(2, null()), "null", "ERR Value \"null\" for property \"a\" must be a minimum length of 2 (was NaN)."),
            (Min(2, null()), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type null."),
            (Min(2, Token::String), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type string."),
            (Min(2, Token::Integer), "1.5", "ERR Validation failed for property \"a\" with number \"1.5\" because the number is not of type integer."),
            (Min(2, Token::Integer), "1", "ERR Value \"1\" for property \"a\" must be a minimum of 2 (was 1)."),
            (Min("2", Token::Number), "1", "ERR Value \"1\" for property \"a\" must be a minimum of 2 (was 1)."),
            (Min(2, Token::Boolean), "\"x\"", "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type boolean."),
            (Min(2, true), "true", "ERR Value \"true\" for property \"a\" must be a minimum length of 2 (was NaN)."),
            (Min(2, Token::Function), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type function."),
            (Min(2, Token::Array), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type array."),
            (Min(2, Token::Object), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type object."),
            (Min(2, f64::NAN), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type nan."),
            (Min(2, Token::Date), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type date."),
            (Min(2, Token::BigInt), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type bigint."),
            (Min(2, buildize(Regex::new("^a").unwrap())), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type string."),
            (Min(2, buildize(Regex::new("^a").unwrap())), "\"abc\"", "{\"a\":\"abc\"}"),
            (Optional(Min(2, Token::Number)), "{}", "{}"),
            (Optional(Len(2, Token::Number)), "{}", "{}"),
            (Max(3, Token::String), "\"hi\"", "{\"a\":\"hi\"}"),
            (Above(3, Token::Number), "4", "{\"a\":4}"),
            (Below(3, Token::Number), "2", "{\"a\":2}"),
            (Len(2, Any()), "[1,2]", "{\"a\":[1,2]}"),
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
        let s = at_a(Min(3, Token::Number));
        assert!(!s.valid(&j(&a("1"))));
        let e = &s.error(&j(&a("1")))[0];
        assert_eq!((e.why.as_str(), e.mark), ("Min", 4011));
        assert_eq!(s.error(&j(&a("\"x\"")))[0].why, "type");
        assert_eq!(at_a(Max(3, Any())).error(&j(&a("9")))[0].mark, 4012);
        assert_eq!(at_a(Above(3, Any())).error(&j(&a("1")))[0].mark, 4013);
        assert_eq!(at_a(Below(3, Any())).error(&j(&a("9")))[0].mark, 4014);
        assert_eq!(at_a(Len(3, Any())).error(&j(&a("9")))[0].mark, 4015);
        // A verdict on a failing bound counts it and builds no message.
        assert!(!at_a(Len(3, Any())).valid(&j(&a("9"))));
        assert!(!at_a(Min(3, Any())).valid(&j(&a("1"))));
        assert!(!at_a(Max(3, Any())).valid(&j(&a("9"))));
        assert!(!at_a(Above(3, Any())).valid(&j(&a("1"))));
        assert!(!at_a(Below(3, Any())).valid(&j(&a("9"))));

        // Dates compare by their time value.
        let s = at_a(Min(Value::Date(1000), Token::Date));
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
        assert!(!type_will_fail(&Any(), &Value::Null));
    }

    #[test]
    fn bad_bound_arguments_become_faults() {
        for (n, msg) in [
            (Min("x", Token::Number), "Shape: Min needs a number"),
            (Max(true, Token::Number), "Shape: Max needs a number"),
            (
                Above(Value::Null, Token::Number),
                "Shape: Above needs a number",
            ),
            (
                Below(f64::NAN, Token::Number),
                "Shape: Below needs a number",
            ),
            (
                Len(-1, Token::Number),
                "Shape: Len needs a whole number of zero or more",
            ),
            (
                Len(1.5, Token::Number),
                "Shape: Len needs a whole number of zero or more",
            ),
            (
                buildize(Token::Number).Min("x"),
                "Shape: Min needs a number",
            ),
            (
                buildize(Token::Number).Max("x"),
                "Shape: Max needs a number",
            ),
            (
                buildize(Token::Number).Above("x"),
                "Shape: Above needs a number",
            ),
            (
                buildize(Token::Number).Below("x"),
                "Shape: Below needs a number",
            ),
            (
                buildize(Token::Number).Len("x"),
                "Shape: Len needs a whole number of zero or more",
            ),
            (Define("", Token::Number), "Shape: Define needs a name"),
            (Refer("", Token::Number), "Shape: Refer needs a name"),
            (Rename("", Token::Number), "Shape: Rename needs a name"),
        ] {
            assert_eq!(run(&at_a(n), &a("1")), format!("ERR {}", msg));
        }
    }

    #[test]
    fn exact_literals() {
        let s = Schema::new(obj([("role", Exact(["admin", "user"]))]));
        assert_eq!(run(&s, r#"{"role":"user"}"#), r#"{"role":"user"}"#);
        assert_eq!(
            run(&s, r#"{"role":"root"}"#),
            "ERR Value \"root\" for property \"role\" must be exactly one of: admin, user"
        );
        let e = &s.error(&j(r#"{"role":"root"}"#))[0];
        assert_eq!((e.why.as_str(), e.mark), ("Exact", 4010));
        assert_eq!(
            run(&at_a(Exact([Value::from(1), Value::Null])), &a("0")),
            "ERR Value \"0\" for property \"a\" must be exactly one of: 1, null"
        );
        assert_eq!(
            run(
                &at_a(Exact([
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
        let s = at_a(Default(2, Exact([2, 3])));
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
        let s = at_a(buildize(Token::String).Exact(["x"]));
        assert_eq!(run(&s, &a("\"x\"")), a("\"x\""));
        assert!(s.node().obj_children["a"].has_exact);
        assert_eq!(stringify_node(&Exact(["a", "b"]), false), "Exact(a, b)");
    }

    #[test]
    fn checks() {
        let s = at_a(Check(|st, _| st.value.as_f64().unwrap_or(0.0) > 1.0, Any()));
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
        let s = at_a(Check(|_, _| true, Token::Number));
        assert_eq!(
            run(&s, "{}"),
            "ERR Validation failed for property \"a\" because the property is missing."
        );
        assert_eq!(s.node().obj_children["a"].kind, Kind::Number);
        let re = || Regex::new("^a.+").unwrap();
        let s = at_a(CheckRe(re(), Any()));
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
        let s = at_a(CheckRe(re(), Token::String));
        assert_eq!(s.node().obj_children["a"].kind, Kind::String);
        assert_eq!(
            stringify_node(&CheckRe(re(), Any()), false),
            "Check.Check(/^a.+/)"
        );
        let s = at_a(Before(
            |_, u| {
                u.val = Some(Value::from(9));
                true
            },
            Token::Number,
        ));
        assert_eq!(run(&s, &a("1")), a("9"));
        let s = at_a(After(|_, _| false, Token::Number));
        assert_eq!(s.error(&j(&a("1")))[0].check, "After");
        assert_eq!(
            stringify_node(&After(|_, _| true, Before(|_, _| true, Any())), false),
            "Before().After()"
        );
    }

    #[test]
    fn nof_counts_faults_and_renders() {
        let s = |t: Token| Spec::from(t);
        let ni = || Nof(1, [s(Token::Number), s(Token::Integer)]);
        assert_eq!(run(&at_a(ni()), &a("1.5")), a("1.5"));
        assert_eq!(
            run(&at_a(ni()), &a("1")),
            "ERR Value \"1\" for property \"a\" satisfies 2 of: Number, Integer; the count must be 1."
        );
        let e = &at_a(ni()).error(&j(&a("1")))[0];
        assert_eq!((e.why.as_str(), e.mark), ("Nof", 4033));
        // A shape for the count, and a verdict reached early.
        let early = Nof(
            Min(2, Any()),
            [s(Token::String), s(Token::Number), s(Token::Boolean)],
        );
        assert_eq!(
            run(&at_a(early), &a("true")),
            "ERR Value \"true\" for property \"a\" satisfies 0 to 1 of: String, Number, Boolean; the count must be Min(2)."
        );
        // A Nof's message is its own, so a Fault does not replace it; the
        // Fault speaks for a value that is missing. Ignore drops the failure.
        assert_eq!(
            run(
                &at_a(Fault("not that", Nof(0, [s(Token::String)]))),
                &a("\"x\"")
            ),
            "ERR Value \"x\" for property \"a\" satisfies 1 of: String; the count must be 0."
        );
        assert_eq!(
            run(&at_a(Fault("not that", Nof(0, [s(Token::String)]))), "{}"),
            "ERR not that"
        );
        assert_eq!(
            run(&at_a(Ignore(Nof(0, [s(Token::String)]))), &a("\"x\"")),
            "{}"
        );
        // A count of exactly one produces from the branch that matched; any
        // other count only checks.
        let open_b = || Spec::from(Open(obj([("b", Spec::from(2))])));
        assert_eq!(
            run(
                &Schema::new(Nof(1, [open_b(), s(Token::Number)])),
                "{\"a\":1}"
            ),
            "{\"a\":1,\"b\":2}"
        );
        assert_eq!(
            run(
                &Schema::new(Nof(Min(1, Any()), [open_b(), s(Token::Number)])),
                "{\"a\":1}"
            ),
            "{\"a\":1}"
        );
        // A count that is not a whole number of zero or more, or that is a
        // builder's fault, is the fault.
        for c in [-1.0, 1.5, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(
                run(&Schema::new(Nof(c, [s(Token::String)])), "\"x\""),
                format!("ERR {}", NOF_FAULT)
            );
        }
        assert_eq!(
            run(
                &Schema::new(Nof(Min("x", Any()), [s(Token::String)])),
                "\"x\""
            ),
            "ERR Shape: Min needs a number"
        );
        // How it renders, and the declarative JSON that reads back as it.
        assert_eq!(
            stringify_node(&Nof(1, [s(Token::Number), s(Token::String)]), true),
            "Nof(1,Number,String)"
        );
        assert_eq!(
            stringify_node(&Nof(Max(2, Min(1, Any())), [s(Token::Number)]), true),
            "Nof(Min(1).Max(2),Number)"
        );
        for (spec, text) in [
            (
                Nof(1, [s(Token::String), s(Token::Number)]),
                "Nof(1,String,Number)",
            ),
            (
                Nof(Min(1, Any()), [s(Token::String), s(Token::Number)]),
                "Nof(Any.Min(1),String,Number)",
            ),
        ] {
            let json = Schema::new(spec).json().unwrap();
            assert_eq!(json, Value::from(text));
            let back = Schema::new(crate::expr::build(&json).unwrap());
            assert_eq!(back.json().unwrap(), Value::from(text));
        }
    }

    #[test]
    fn composition() {
        let one_ns = || Nof(1, [Spec::from(Token::Number), Spec::from(Token::String)]);
        assert_eq!(run(&at_a(one_ns()), &a("\"x\"")), a("\"x\""));
        assert_eq!(
            run(&at_a(one_ns()), &a("true")),
            "ERR Value \"true\" for property \"a\" satisfies 0 of: Number, String; the count must be 1."
        );
        assert!(!at_a(one_ns()).valid(&j(&a("true"))));
        assert!(at_a(one_ns()).valid(&j(&a("1"))));
        let some_ns = || {
            Nof(
                Min(1, Any()),
                [Spec::from(Token::Number), Spec::from(Token::String)],
            )
        };
        assert_eq!(run(&at_a(some_ns()), &a("5")), a("5"));
        assert_eq!(
            run(&at_a(some_ns()), &a("true")),
            "ERR Value \"true\" for property \"a\" satisfies 0 of: Number, String; the count must be Min(1)."
        );
        // A failing branch's own errors are the errors of All.
        let all_nm = || All([Spec::from(Token::Number), Spec::from(Min(2, Any()))]);
        assert_eq!(
            run(&at_a(all_nm()), &a("1")),
            "ERR Value \"1\" for property \"a\" must be a minimum of 2 (was 1)."
        );
        assert_eq!(run(&at_a(all_nm()), &a("5")), a("5"));
        let e = &at_a(all_nm()).error(&j(&a("1")))[0];
        assert_eq!(
            (e.why.as_str(), e.mark, e.path.as_str()),
            ("Min", 4011, "a")
        );
        assert_eq!(
            run(
                &at_a(Nof(
                    1,
                    [Spec::from(Token::Number), Spec::from(Min(2, Any()))]
                )),
                &a("\"x\"")
            ),
            "ERR Value \"x\" for property \"a\" satisfies 0 of: Number, Min(2); the count must be 1."
        );
        assert_eq!(
            run(
                &at_a(All([Spec::from(Token::String), Spec::from(Token::Any)])),
                &a("1")
            ),
            "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type string."
        );
        assert_eq!(
            run(
                &at_a(Nof(
                    1,
                    [
                        Spec::from(Ignore(Min(2, Token::Number))),
                        Spec::from(Token::String)
                    ]
                )),
                &a("1")
            ),
            a("1")
        );
        assert_eq!(
            run(
                &at_a(All([
                    Spec::from(Ignore(Min(2, Token::Number))),
                    Spec::from(Token::Number)
                ])),
                &a("1")
            ),
            a("1")
        );
        assert_eq!(run(&at_a(Optional(one_ns())), "{}"), "{}");
        let re = || Regex::new("^a").unwrap();
        let one_rn = || Nof(1, [Spec::from(re()), Spec::from(Token::Number)]);
        assert_eq!(run(&at_a(one_rn()), &a("\"abc\"")), a("\"abc\""));
        assert_eq!(run(&at_a(one_rn()), &a("5")), a("5"));
        assert_eq!(
            run(&at_a(one_rn()), &a("true")),
            "ERR Value \"true\" for property \"a\" satisfies 0 of: /^a/, Number; the count must be 1."
        );
        assert_eq!(
            run(
                &at_a(Nof(
                    Min(1, Any()),
                    [Spec::from(re()), Spec::from(Token::Number)]
                )),
                &a("true")
            ),
            "ERR Value \"true\" for property \"a\" satisfies 0 of: /^a/, Number; the count must be Min(1)."
        );
        // A composition keeps its own message under a Fault.
        assert_eq!(
            run(&at_a(Fault("F", one_ns())), &a("true")),
            "ERR Value \"true\" for property \"a\" satisfies 0 of: Number, String; the count must be 1."
        );
        assert_eq!(
            run(&at_a(Fault("F", some_ns())), &a("true")),
            "ERR Value \"true\" for property \"a\" satisfies 0 of: Number, String; the count must be Min(1)."
        );
        assert_eq!(
            run(&at_a(Fault("F", all_nm())), &a("1")),
            "ERR Value \"1\" for property \"a\" must be a minimum of 2 (was 1)."
        );
        assert!(!at_a(Fault("F", one_ns())).valid(&j(&a("true"))));
        // A count other than exactly one only checks: the value stays as
        // it was given.
        let s = at_a(Nof(
            Min(1, Any()),
            [Spec::from(Token::Number), Spec::from(Coerce(Token::String))],
        ));
        assert_eq!(run(&s, &a("5")), a("5"));
        // All threads the value through its branches.
        let s = at_a(All([
            Spec::from(Coerce(Token::Number)),
            Spec::from(Min(2, Any())),
        ]));
        assert_eq!(run(&s, &a("\"5\"")), a("5"));
        let s = at_a(All([
            Spec::from(Coerce(Token::Number)),
            Spec::from(Min(9, Any())),
        ]));
        assert_eq!(
            run(&s, &a("\"5\"")),
            "ERR Value \"5\" for property \"a\" must be a minimum of 9 (was 5)."
        );
        // A branch that produces nothing leaves a required composition with
        // no value, so the missing property is reported.
        let missing = "ERR Validation failed for property \"a\" because the property is missing.";
        assert_eq!(
            run(&at_a(Nof(1, [Spec::from(Skip(Token::Number))])), "{}"),
            missing
        );
        assert_eq!(
            run(
                &at_a(Nof(Min(1, Any()), [Spec::from(Skip(Token::Number))])),
                "{}"
            ),
            missing
        );
        assert_eq!(
            run(&at_a(All([Spec::from(Skip(Token::Number))])), "{}"),
            missing
        );
        let mut quiet = one_ns();
        quiet.silent = true;
        assert_eq!(run(&at_a(quiet), &a("true")), a("true"));
    }

    #[test]
    fn define_and_refer() {
        let s = |strict: bool, fill: bool| {
            Schema::new(obj([
                ("a", Spec::from(Define("d", Token::Number))),
                (
                    "b",
                    Spec::from(ReferWith("d", ReferOptions { strict, fill }, Any())),
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
        let lax = at_a(Any().Refer("nope"));
        assert_eq!(run(&lax, &a("2")), a("2"));
        let strict = |fill| {
            at_a(ReferWith(
                "nope",
                ReferOptions { strict: true, fill },
                Any(),
            ))
        };
        assert_eq!(
            run(&strict(false), &a("2")),
            "ERR Value \"2\" for property \"a\" refers to \"nope\", which is not defined."
        );
        assert_eq!(run(&strict(false), "{}"), "{}");
        assert_eq!(run(&strict(true), "{}"), "{}");
        assert_eq!(
            stringify_node(&Define("d", Token::Number), false),
            "Number.Define(\"d\")"
        );
        assert_eq!(stringify_node(&Refer("d", Any()), false), "Refer(\"d\")");
        // A define met on one schema's call serves a refer on another, when
        // the calls share a context.
        let mut ctx = Context::new();
        let first = at_a(Define("shared", Token::Number));
        first.validate_ctx(j(&a("1")), &mut ctx).unwrap();
        let second = at_a(Refer("shared", Any()));
        assert!(second.validate_ctx(j(&a("\"x\"")), &mut ctx).is_err());
        assert!(second.validate_ctx(j(&a("3")), &mut ctx).is_ok());
    }

    #[test]
    fn renames() {
        let s = at_a(buildize(Token::Number).Rename("b"));
        assert_eq!(run(&s, &a("1")), r#"{"b":1}"#);
        assert_eq!(run(&s, r#"{"a":1,"b":2}"#), r#"{"b":1}"#);
        assert!(s.valid(&j(&a("1"))));
        let s = at_a(RenameWith(
            "b",
            RenameOptions {
                keep: true,
                claim: vec![],
            },
            Token::Number,
        ));
        assert_eq!(run(&s, &a("1")), r#"{"a":1,"b":1}"#);
        let claim = |keep| {
            at_a(RenameWith(
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
        assert_eq!(run(&at_a(Rename("b", Skip(Token::Number))), "{}"), "{}");
        assert_eq!(run(&at_a(Rename("a", Token::Number)), &a("1")), a("1"));
    }

    #[test]
    fn keys() {
        let nested = |n: Node| Schema::new(obj([("a", obj([("b", Spec::from(n))]))]));
        assert_eq!(
            run(&nested(Key()), r#"{"a":{"b":"V"}}"#),
            r#"{"a":{"b":"a"}}"#
        );
        assert_eq!(
            run(&nested(KeyDepth(1)), r#"{"a":{"b":"V"}}"#),
            r#"{"a":{"b":["a"]}}"#
        );
        assert_eq!(
            run(&nested(KeyJoin(1, "/")), r#"{"a":{"b":"V"}}"#),
            r#"{"a":{"b":"a"}}"#
        );
        assert_eq!(
            run(&nested(KeyDepth(-1)), r#"{"a":{"b":"V"}}"#),
            r#"{"a":{"b":["b"]}}"#
        );
        assert_eq!(
            run(&nested(KeyJoin(0, "/")), r#"{"a":{"b":"V"}}"#),
            "ERR Validation failed for property \"a.b\" with string \"\" because an empty string is not allowed."
        );
        assert_eq!(
            run(&nested(KeyJoin(2, "/")), r#"{"a":{"b":"V"}}"#),
            r#"{"a":{"b":"/a"}}"#
        );
        assert_eq!(
            run(&nested(KeyJoin(5, ".")), r#"{"a":{"b":"V"}}"#),
            r#"{"a":{"b":".a"}}"#
        );
        assert_eq!(run(&at_a(Key()), &a("\"V\"")), a("\"V\""));
        assert_eq!(
            run(&at_a(KeyArgs(&[Value::from("/")])), &a("\"V\"")),
            a("\"V\"")
        );
        assert_eq!(KeyArgs(&[Value::Null]).kind, Kind::String);
        assert_eq!(
            js_slice(&[Value::from(1), Value::from(2)], 5, 9),
            Vec::<Value>::new()
        );
        assert_eq!(
            js_slice(&[Value::from(1), Value::from(2)], -9, -1),
            vec![Value::from(1)]
        );
        assert_eq!(stringify_node(&Key(), false), "String.Key()");
    }

    #[test]
    fn catch_and_transform() {
        assert_eq!(run(&at_a(Catch(0, Token::Number)), &a("\"x\"")), a("0"));
        assert_eq!(run(&at_a(Catch(0, Token::Number)), &a("5")), a("5"));
        assert_eq!(
            run(&at_a(Catch("none", Min(2, Token::String))), &a("\"x\"")),
            a("\"none\"")
        );
        assert_eq!(
            run(&at_a(Min(2, Catch(0, Token::Number))), &a("\"x\"")),
            "ERR Value \"0\" for property \"a\" must be a minimum of 2 (was 0)."
        );
        assert_eq!(run(&at_a(Catch(7, Token::Number)), "{}"), a("7"));
        assert_eq!(run(&at_a(Optional(Catch(7, Token::Number))), "{}"), a("0"));
        assert_eq!(
            run(&at_a(Catch(Value::Null, Token::Number)), &a("\"x\"")),
            a("null")
        );
        assert!(at_a(Catch(0, Token::Number)).valid(&j(&a("\"x\""))));
        let s = at_a(Catch(
            Value::Obj(Default::default()),
            obj([("x", Spec::from(Token::Number))]),
        ));
        assert_eq!(run(&s, r#"{"a":{"x":"bad"}}"#), r#"{"a":{}}"#);
        assert_eq!(run(&s, r#"{"a":{"x":1}}"#), r#"{"a":{"x":1}}"#);
        assert_eq!(
            stringify_node(&Catch(0, Min(2, Token::Number)), false),
            "Number.Min(2).Catch(0)"
        );
        assert_eq!(
            stringify_node(&After(|_, _| true, Token::Number).Catch("z"), false),
            "Number.After().Catch(z)"
        );
        let dbl = |n: Node| Transform(|v, _| Value::Num(v.as_f64().unwrap_or(0.0) * 2.0), n);
        assert_eq!(run(&at_a(dbl(buildize(Token::Number))), &a("2")), a("4"));
        assert_eq!(
            run(&at_a(dbl(buildize(Token::Number))), &a("\"x\"")),
            "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."
        );
        assert_eq!(
            run(&at_a(dbl(Min(2, Token::Number))), &a("1")),
            "ERR Value \"1\" for property \"a\" must be a minimum of 2 (was 1)."
        );
        assert!(at_a(dbl(buildize(Token::Number))).valid(&j(&a("2"))));
        assert!(!at_a(dbl(buildize(Token::Number))).valid(&j(&a("\"x\""))));
        assert_eq!(
            stringify_node(&dbl(Min(2, Token::Number)), false),
            "Number.Min(2).Transform"
        );
        assert!(Catch(0, Token::Number).befores[0].inner.is_some());
        // A transform of an absent optional value: nothing produced, nothing
        // transformed.
        assert_eq!(run(&at_a(dbl(Skip(Token::Number))), "{}"), a("0"));
    }

    #[test]
    fn describe_coerce_and_formats() {
        let s = at_a(Describe("a number", Token::Number));
        assert_eq!(
            s.node().obj_children["a"].meta.get("description"),
            Some(&Value::from("a number"))
        );
        assert_eq!(
            run(&s, &a("\"x\"")),
            "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."
        );
        let cases: Vec<(Node, &str, &str)> = vec![
            (Coerce(Token::Number), "\"5\"", "5"),
            (Coerce(Token::Number), "true", "1"),
            (Coerce(Token::Number), "\"x\"", "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."),
            (Coerce(Token::Number), "\"0x10\"", "ERR Validation failed for property \"a\" with string \"0x10\" because the string is not of type number."),
            (Coerce(Token::Integer), "\"5.5\"", "ERR Validation failed for property \"a\" with number \"5.5\" because the number is not of type integer."),
            (Coerce(Token::String), "1.5", "\"1.5\""),
            (Coerce(Token::String), "1000000", "\"1000000\""),
            (Coerce(Token::String), "false", "\"false\""),
            (Coerce(Token::Boolean), "\" TRUE \"", "true"),
            (Coerce(Token::Boolean), "0", "false"),
            (Coerce(Token::Boolean), "\"yes\"", "ERR Validation failed for property \"a\" with string \"yes\" because the string is not of type boolean."),
            (Coerce(Token::Date), "\"2020-01-01T00:00:00Z\"", "\"2020-01-01T00:00:00.000Z\""),
            (Coerce(Token::Date), "\"2020-01-01T12:30:00.5+02:00\"", "\"2020-01-01T10:30:00.500Z\""),
            (Coerce(Token::Date), "\"2020-02-30T00:00:00Z\"", "ERR Validation failed for property \"a\" with string \"2020-02-30T00:00:00Z\" because the string is not of type date."),
            (Coerce(Token::Date), "1577836800000", "\"2020-01-01T00:00:00.000Z\""),
            (Coerce(Min(2, Token::Number)), "\"1\"", "ERR Value \"1\" for property \"a\" must be a minimum of 2 (was 1)."),
            (Email(Any()), "\"a@b.co\"", "\"a@b.co\""),
            (Email(Any()), "\"nope\"", "ERR Value \"nope\" for property \"a\" is not a valid email address."),
            (Email(Any()), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type string."),
            (Url(Any()), "\"https://example.com/a?b=c#d\"", "\"https://example.com/a?b=c#d\""),
            (Url(Any()), "\"example.com\"", "ERR Value \"example.com\" for property \"a\" is not a valid URL."),
            (Uuid(Any()), "\"123e4567-e89b-12d3-a456-426614174000\"", "\"123e4567-e89b-12d3-a456-426614174000\""),
            (Uuid(Any()), "\"123e4567e89b12d3a456426614174000\"", "ERR Value \"123e4567e89b12d3a456426614174000\" for property \"a\" is not a valid UUID."),
            (DateTime(Any()), "\"2020-01-01T00:00:00Z\"", "\"2020-01-01T00:00:00Z\""),
            (DateTime(Any()), "\"2021-02-29T00:00:00Z\"", "ERR Value \"2021-02-29T00:00:00Z\" for property \"a\" is not a valid ISO 8601 date-time."),
            (Ip(Any()), "\"127.0.0.1\"", "\"127.0.0.1\""),
            (Ip(Any()), "\"::1\"", "\"::1\""),
            (Ip(Any()), "\"1.2.3\"", "ERR Value \"1.2.3\" for property \"a\" is not a valid IP address."),
            (Ipv4(Any()), "\"::1\"", "ERR Value \"::1\" for property \"a\" is not a valid IPv4 address."),
            (Ipv6(Any()), "\"1.2.3.4\"", "ERR Value \"1.2.3.4\" for property \"a\" is not a valid IPv6 address."),
            (Ipv6(Any()), "\"::ffff:192.168.1.1\"", "\"::ffff:192.168.1.1\""),
            (Email(Min(10, Token::String)), "\"nope\"", "ERR Value \"nope\" for property \"a\" must be a minimum length of 10 (was 4).\nValue \"nope\" for property \"a\" is not a valid email address."),
            (Fault("boom", Min(2, Token::Number)), "1", "ERR Value \"1\" for property \"a\" must be a minimum of 2 (was 1)."),
            (Fault("boom", Email(Any())), "1", "ERR boom"),
            (
                Email(Token::Number),
                "1",
                "ERR Value \"1\" for property \"a\" is not a valid email address.",
            ),
            (
                Email(Token::Number),
                "\"x\"",
                "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number.",
            ),
            (buildize(Token::String).Email().Url().Uuid().DateTime().Ip().Ipv4().Ipv6(), "1", "ERR Validation failed for property \"a\" with number \"1\" because the number is not of type string."),
            (buildize(Token::Number).Coerce(), "\"7\"", "7"),
            (buildize(Token::Number).Describe("n"), "7", "7"),
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
            run(&at_a(Email(Any())), "{}"),
            "ERR Validation failed for property \"a\" because the property is missing."
        );
        assert_eq!(run(&at_a(Optional(Email(Any()))), "{}"), a("\"\""));
        let e = &at_a(Email(Any())).error(&j(&a("\"nope\"")))[0];
        assert_eq!((e.why.as_str(), e.mark), ("Email", 4000));
        assert!(!at_a(Email(Any())).valid(&j(&a("\"nope\""))));
        assert_eq!(stringify_node(&Email(Any()), false), "String.Email");
    }

    #[test]
    fn types_and_structure() {
        assert_eq!(run(&at_a(Type(Kind::Number, Any())), &a("3")), a("3"));
        assert_eq!(
            run(&at_a(Type(Token::Number, Any())), &a("\"x\"")),
            "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."
        );
        assert_eq!(
            run(&at_a(Type("String", Any())), &a("3")),
            "ERR Validation failed for property \"a\" with number \"3\" because the number is not of type string."
        );
        assert_eq!(
            run(&Schema::new(Type("Object", Any())), "1"),
            "ERR Validation failed for number \"1\" because the number is not of type object."
        );
        assert_eq!(
            run(&Schema::new(Type("Object", Any())), r#"{"z":1}"#),
            "ERR Validation failed for object \"{z:1}\" because the property \"z\" is not allowed."
        );
        assert_eq!(Type("nonsense", Any()).kind, Kind::Any);
        assert_eq!(Type(buildize(Token::Integer), Any()).kind, Kind::Integer);
        assert_eq!(Type(Min(2, Any()), Any()).kind, Kind::Any);
        for (n, k) in [
            (Any().String(), Kind::String),
            (Any().Number(), Kind::Number),
            (Any().Boolean(), Kind::Boolean),
            (Any().Object(), Kind::Object),
            (Any().Array(), Kind::Array),
            (Any().Function(), Kind::Function),
            (Any().Integer(), Kind::Integer),
            (Any().Date(), Kind::Date),
            (buildize(Token::Number).Any(), Kind::Any),
        ] {
            assert_eq!(n.kind, k);
        }
        assert_eq!(
            run(&Schema::new(obj([("n", Spec::from(Func(Any())))])), "{}"),
            "{}"
        );
        assert_eq!(
            run(
                &Schema::new(obj([("n", Spec::from(Token::Function))])),
                "{}"
            ),
            "ERR Validation failed for property \"n\" because the property is missing."
        );
        assert_eq!(buildize(Token::Number).Func().kind, Kind::Function);

        assert!(!Open(Token::Number).is_open());
        let tuple = Closed(arr([Spec::from(Token::Number)]));
        assert_eq!(tuple.arr_children.len(), 1);
        assert_eq!(run(&at_a(tuple.clone()), &a("[1]")), a("[1]"));
        assert!(!at_a(tuple).valid(&j(&a("[1,2]"))));
        assert!(Closed(arr([Spec::from(1), Spec::from(2)]))
            .arr_child
            .is_none());
        let c = Child(Token::Number, Token::Number);
        assert!(c.kind == Kind::Object && c.obj_rest.is_some());
        assert!(buildize(Token::Array)
            .Child(Token::Number)
            .arr_child
            .is_some());
        assert!(buildize(Token::Object)
            .Child(Token::Number)
            .obj_rest
            .is_some());
        assert_eq!(
            run(
                &at_a(Rest(Token::Number, arr([Spec::from(1)]))),
                &a("[1,2,3]")
            ),
            a("[1,2,3]")
        );
        assert_eq!(run(&at_a(Rest(Token::Number, Any())), &a("[2]")), a("[2]"));
        assert!(!at_a(Rest(Token::Number, arr([Spec::from(1)]))).valid(&j(&a("[1,\"x\"]"))));
        assert_eq!(DefaultOf("x").kind, Kind::String);
        assert_eq!(run(&at_a(DefaultOf("x")), "{}"), a("\"x\""));
        assert_eq!(run(&at_a(Empty(Any())), &a("\"\"")), a("\"\""));
        assert_eq!(run(&at_a(Empty(Any())), &a("0")), a("0"));
        assert_eq!(run(&at_a(Ignore(Empty(Any()))), &a("0")), a("0"));
        assert_eq!(
            run(&at_a(Required(null())), "{}"),
            "ERR Validation failed for property \"a\" because the property is missing."
        );
        assert_eq!(run(&at_a(Skip(null())), "{}"), "{}");
        assert_eq!(run(&at_a(Min(2, null())), "{}"), a("null"));
        assert_eq!(
            run(&at_a(Required(f64::NAN)), "{}"),
            "ERR Validation failed for property \"a\" because the property is missing."
        );
        assert_eq!(run(&at_a(Min(2, f64::NAN)), "{}"), a("null"));
        assert_eq!(run(&at_a(Never(Token::String)), "{}"), "ERR Validation failed for property \"a\" with value \"undefined\" because no value is allowed.");
        assert_eq!(
            run(&at_a(Nullable(Closed(obj::<&str, Spec>([])))), &a("null")),
            a("null")
        );
        assert_eq!(run(&at_a(Optional(Nullable(Token::Number))), "{}"), a("0"));
    }

    // Exact and Never require a value until made optional, as a type token
    // does; chained, they keep the node's flags.
    #[test]
    fn exact_and_never_require_a_value() {
        let exact = || Exact(["x", "y"]);
        let listed = "ERR Value \"undefined\" for property \"a\" must be exactly one of: x, y";
        assert_eq!(run(&at_a(exact()), "{}"), listed);
        assert!(exact().required);
        for n in [Optional(exact()), Skip(exact()), exact().Optional()] {
            let s = at_a(n);
            assert_eq!(run(&s, "{}"), "{}");
            assert_eq!(run(&s, &a("\"y\"")), a("\"y\""));
            assert_eq!(
                run(&s, &a("\"z\"")),
                "ERR Value \"z\" for property \"a\" must be exactly one of: x, y"
            );
        }
        // A default it allows stands in for an absent value; one it does
        // not is still an error.
        assert_eq!(run(&at_a(Default("x", exact())), "{}"), a("\"x\""));
        assert_eq!(run(&at_a(Default("z", exact())), "{}"), listed);
        assert_eq!(run(&at_a(Required(exact())), "{}"), listed);
        assert_eq!(run(&at_a(Skip(Token::String).Exact(["x"])), "{}"), "{}");
        assert_eq!(
            run(&at_a(Optional(Token::String).Exact(["x"])), "{}"),
            "ERR Value \"undefined\" for property \"a\" must be exactly one of: x"
        );

        let never = "ERR Validation failed for property \"a\" with value \"undefined\" because no value is allowed.";
        assert_eq!(run(&at_a(Never(Any())), "{}"), never);
        assert!(Never(Any()).required && !Any().Never().required);
        for n in [
            Optional(Never(Any())),
            Skip(Never(Any())),
            Never(Any()).Optional(),
        ] {
            let s = at_a(n);
            assert_eq!(run(&s, "{}"), "{}");
            assert_eq!(
                run(&s, &a("1")),
                "ERR Validation failed for property \"a\" with number \"1\" because no value is allowed."
            );
        }
        // A builder's fault rejects an absent value too.
        assert_eq!(
            run(&at_a(Optional(Token::Number).Min("x")), "{}"),
            "ERR Shape: Min needs a number"
        );
    }

    // Nullable accepts null whatever a check would make of it.
    #[test]
    fn nullable_accepts_null_whatever_a_check_makes_of_it() {
        let null_ok = |n: Node| run(&Schema::new(n), "null");
        assert_eq!(null_ok(Nullable(Exact([1]))), "null");
        assert_eq!(
            run(&Schema::new(Nullable(Exact([1]))), "2"),
            "ERR Value \"2\" for property \"\" must be exactly one of: 1"
        );
        let ns = || Nof(1, [Spec::from(Token::String), Spec::from(Token::Number)]);
        assert_eq!(null_ok(Nullable(ns())), "null");
        assert_eq!(
            run(&Schema::new(Nullable(ns())), "true"),
            "ERR Value \"true\" for property \"\" satisfies 0 of: String, Number; the count must be 1."
        );
        assert_eq!(
            null_ok(Nullable(All([
                Spec::from(Token::String),
                Spec::from(Min(1, Any()))
            ]))),
            "null"
        );
        let one = || Check(|st, _| st.value == &Value::from(1), Any());
        assert_eq!(null_ok(Nullable(one())), "null");
        assert_eq!(
            run(&Schema::new(Nullable(one())), "2"),
            "ERR Validation failed for number \"2\" because check \"Check\" failed."
        );
        let s = at_a(Nullable(Exact(["x"])));
        assert_eq!(run(&s, &a("null")), a("null"));
        assert_eq!(
            run(&s, "{}"),
            "ERR Value \"undefined\" for property \"a\" must be exactly one of: x"
        );
    }

    // Exactly one of shapes of different kinds: the value's kind chooses,
    // and that shape's errors are the errors.
    #[test]
    fn nof_kinds() {
        let g0 = Schema::new(Nof(
            1,
            [
                Spec::from(Min(2, Token::String)),
                Spec::from(Token::Number),
                obj([("a", 1)]),
            ],
        ));
        assert_eq!(
            g0.node().nof_kinds,
            Some(vec!["string", "number", "object"])
        );
        assert_eq!(
            run(&g0, "\"a\""),
            "ERR Value \"a\" for property \"\" must be a minimum length of 2 (was 1)."
        );
        assert_eq!(run(&g0, "5"), "5");
        assert_eq!(run(&g0, "{}"), "{\"a\":1}");
        assert_eq!(
            run(&g0, "{\"a\":\"x\"}"),
            "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."
        );
        // A value of no kind listed is counted, as any other; an object
        // branch is named in the port's own rendering.
        assert_eq!(
            run(&g0, "true"),
            "ERR Value \"true\" for property \"\" satisfies 0 of: String.Min(2), Number, {a: 1}; the count must be 1."
        );
        assert!(!g0.valid(&j("true")) && g0.valid(&j("5")));

        // Otherwise every shape is tried, and the count is the message: a
        // nullable shape, one that may take another kind, a check by
        // function, two of one kind, a count other than exactly one.
        let s = |t: Token| Spec::from(t);
        for n in [
            Nof(
                1,
                [
                    Spec::from(Nullable(Min(2, Token::String))),
                    s(Token::Number),
                ],
            ),
            Nof(
                1,
                [Spec::from(Min(1, Coerce(Token::Number))), s(Token::String)],
            ),
            Nof(
                1,
                [
                    Spec::from(Check(|_, _| true, Token::Number)),
                    s(Token::String),
                ],
            ),
            Nof(
                1,
                [
                    Spec::from(Min(1, Token::String)),
                    Spec::from(Max(3, Token::String)),
                ],
            ),
            Nof(Min(1, Any()), [s(Token::String), s(Token::Number)]),
            Nof(1, [Spec::from(Ignore(Token::String)), s(Token::Number)]),
            Nof(
                1,
                [Spec::from(Rename("b", Token::String)), s(Token::Number)],
            ),
            Nof(1, [s(Token::Any), s(Token::Number)]),
        ] {
            assert_eq!(n.nof_kinds, None, "{}", stringify_node(&n, true));
        }
        assert_eq!(
            run(&Schema::new(Nof(1, [Spec::from(Min(1, Coerce(Token::Number))), s(Token::String)])), "\"3\""),
            "ERR Value \"3\" for property \"\" satisfies 2 of: Number.Min(1), String; the count must be 1."
        );
        // A format and a check by regexp keep the kind, so two such
        // strings are two of one kind.
        let re = Regex::new("^a").unwrap();
        let strings = Nof(
            1,
            [
                Spec::from(CheckRe(re, Token::String)),
                Spec::from(Email(Any())),
            ],
        );
        assert_eq!(strings.nof_kinds, None);
        let typed = Nof(
            1,
            [
                Spec::from(CheckRe(Regex::new("^a").unwrap(), Token::String)),
                s(Token::Number),
            ],
        );
        assert_eq!(typed.nof_kinds, Some(vec!["string", "number"]));
        assert_eq!(
            run(&Schema::new(typed), "\"b\""),
            "ERR Validation failed for string \"b\" because check \"/^a/\" failed."
        );
    }

    #[test]
    fn untyped_defaults_take_the_default_kind() {
        let cases: Vec<(Node, &str, &str)> = vec![
            (Default(2, Required(Any())), "\"x\"", "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."),
            (Default(2, Required(Any())), "{}", "2"),
            (Default(2, Describe("two", Required(Any()))), "3", "3"),
            (Default(2, Fault("not two", Exact([2]))), "3", "ERR Value \"3\" for property \"a\" must be exactly one of: 2"),
            (Default(2, Exact([2, 3])), "3", "3"),
            (Default(2, Nullable(Required(Any()))), "null", "null"),
            (Default("x", Empty(Required(Any()))), "\"\"", "\"\""),
            (Default(2, After(|_, _| false, Any())), "3", "ERR Validation failed for property \"a\" with number \"3\" because check \"After\" failed."),
            // Default clears skippable, so an Ignore's silence remains alone.
            (Default(2, Ignore(Any())), "\"x\"", "\"x\""),
            (Default(Value::Undefined, Any()), "\"x\"", "\"x\""),
            (Default(7, Token::Number), "{}", "7"),
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
        let d = Default(2, Describe("two", Any()));
        assert_eq!(d.meta.get("description"), Some(&Value::from("two")));
    }

    /// The bare form of Contains and Unique: an array of anything.
    fn bare() -> Spec {
        arr::<Spec>([])
    }

    /// A schema with a trial budget of `n`.
    fn budget(n: usize, spec: impl Into<Spec>) -> Schema {
        Schema::with_options(
            spec,
            &crate::Options {
                trials: n,
                ..Default::default()
            },
        )
    }

    // ts/test/builder.test.ts, builder-when.
    #[test]
    fn when_picks_the_shape_its_condition_admits() {
        // The condition picks the shape; its errors are the errors.
        let w = Schema::new(When(
            Open(obj([("kind", Exact(["a"]))])),
            Open(obj([("x", Required(Token::Number))])),
            Open(obj([("y", Required(Token::String))])),
        ));
        assert_eq!(run(&w, r#"{"kind":"a","x":1}"#), r#"{"kind":"a","x":1}"#);
        assert_eq!(
            run(&w, r#"{"kind":"a"}"#),
            "ERR Validation failed for property \"x\" because the property is missing."
        );
        assert_eq!(
            run(&w, r#"{"kind":"b"}"#),
            "ERR Validation failed for property \"y\" because the property is missing."
        );
        assert_eq!(
            run(&w, r#"{"kind":"b","y":"q"}"#),
            r#"{"kind":"b","y":"q"}"#
        );

        // An arm of Any passes, and the picked shape makes the result.
        let then = || When(Token::String, Min(2, Any()), Any());
        assert_eq!(run(&Schema::new(then()), "\"ab\""), "\"ab\"");
        assert_eq!(run(&Schema::new(then()), "5"), "5");
        assert_eq!(
            run(&Schema::new(then()), "\"a\""),
            "ERR Value \"a\" for property \"\" must be a minimum length of 2 (was 1)."
        );
        let filled = When(Open(obj::<&str, Spec>([])), Open(obj([("b", 2)])), Any());
        assert_eq!(run(&Schema::new(filled), r#"{"a":1}"#), r#"{"a":1,"b":2}"#);
        let ignored = When(Token::Number, Ignore(Min(5, Any())), Any());
        assert_eq!(run(&Schema::new(ignored), "3"), "3");

        // The condition only checks, on a copy.
        let copy = When(Open(obj([("b", 2)])), Any(), Any());
        assert_eq!(run(&Schema::new(copy), r#"{"a":1}"#), r#"{"a":1}"#);

        // Errors name the path; an absent value is not tried.
        assert_eq!(
            run(
                &Schema::new(obj([("a", obj([("b", then())]))])),
                r#"{"a":{"b":"x"}}"#
            ),
            "ERR Value \"x\" for property \"a.b\" must be a minimum length of 2 (was 1)."
        );
        // After an array sibling too.
        let sibling = Schema::new(obj([
            ("a", arr([Token::Number])),
            ("c", Spec::from(When(Token::Number, Min(5, Any()), Any()))),
        ]));
        assert_eq!(
            run(&sibling, r#"{"a":[1],"c":3}"#),
            "ERR Value \"3\" for property \"c\" must be a minimum of 5 (was 3)."
        );
        let plain = Schema::new(obj([
            ("a", arr([Token::Number])),
            ("c", Spec::from(Token::Number)),
        ]));
        let paths: Vec<Vec<crate::context::PathPart>> = plain
            .error(&j(r#"{"a":[1],"c":"x"}"#))
            .into_iter()
            .map(|e| e.path_arr)
            .collect();
        assert_eq!(paths, vec![vec![crate::context::PathPart::Key("c".into())]]);
        assert_eq!(
            run(&at_a(then()), "{}"),
            "ERR Validation failed for property \"a\" because the property is missing."
        );
        assert_eq!(run(&at_a(Optional(then())), "{}"), "{}");
        assert_eq!(run(&at_a(Default("xy", then())), "{}"), r#"{"a":"xy"}"#);
        // A silent When raises nothing; a verdict reads it alike.
        let mut quiet = then();
        quiet.silent = true;
        assert_eq!(run(&at_a(quiet), &a("\"x\"")), a("\"x\""));
        assert!(!at_a(then()).valid(&j(&a("\"x\""))));

        // A condition is needed, and a shape that is a builder's fault is
        // the fault; the string form, and how it renders.
        assert_eq!(
            run(&Schema::new(When(Value::Undefined, Any(), Any())), "1"),
            format!("ERR {}", WHEN_FAULT)
        );
        assert_eq!(
            run(&Schema::new(When(Min("x", Any()), Any(), Any())), "1"),
            "ERR Shape: Min needs a number"
        );
        assert_eq!(crate::expr::expr("When()").unwrap_err().0, WHEN_FAULT);
        assert_eq!(
            run(&Schema::parse("When(String,Min(2))").unwrap(), "\"ab\""),
            "\"ab\""
        );
        // An argument past the third is passed over.
        assert_eq!(
            stringify_node(
                &crate::expr::expr("When(String,Min(2),Max(3),Number)").unwrap(),
                false
            ),
            "When(String,Min(2),Max(3))"
        );
        assert_eq!(
            run(&Schema::new(obj([("a: When(String,Min(2))", "xy")])), "{}"),
            r#"{"a":"xy"}"#
        );
        assert_eq!(
            stringify_node(&When(Token::Number, Min(1, Any()), Max(-1, Any())), false),
            "When(Number,Min(1),Max(-1))"
        );
        assert_eq!(stringify_node(&then(), false), "When(String,Min(2),Any)");
    }

    // ts/test/builder.test.ts, builder-contains.
    #[test]
    fn contains_counts_the_items_its_shape_admits() {
        // At least one, exactly some, at most some.
        let one = Schema::new(Contains(Min(1, Any()), Token::Number, bare()));
        assert_eq!(run(&one, r#"["a",2]"#), r#"["a",2]"#);
        assert_eq!(
            run(&one, r#"["a","b"]"#),
            "ERR Value \"[a,b]\" for property \"\" has 0 of its items satisfying Number; the count must be Min(1)."
        );
        assert_eq!(
            run(&one, "[]"),
            "ERR Value \"[]\" for property \"\" has 0 of its items satisfying Number; the count must be Min(1)."
        );
        assert_eq!(
            run(&Schema::new(Contains(2, Token::Number, bare())), r#"[1,"a",2,3]"#),
            "ERR Value \"[1,a,2,3]\" for property \"\" has 3 of its items satisfying Number; the count must be 2."
        );
        assert_eq!(
            run(&Schema::new(Contains(0, Token::Number, bare())), r#"["a"]"#),
            r#"["a"]"#
        );
        // A count that is not an interval of whole numbers is read count by
        // count, here twice from what the first array asked; the port names
        // it in its own rendering.
        let evens = Schema::new(Contains(Exact([0, 2]), Token::Number, bare()));
        assert_eq!(run(&evens, r#"["a",1,2]"#), r#"["a",1,2]"#);
        assert_eq!(
            run(&evens, r#"[1,"a"]"#),
            "ERR Value \"[1,a]\" for property \"\" has 1 of its items satisfying Number; the count must be Exact(0, 2)."
        );
        // An interval is read at once: a count no number satisfies decides
        // before any item is tried, and so tries none of the budget.
        let empty = || Contains(Max(1, Min(2, Any())), Token::Number, bare());
        assert_eq!(
            run(&Schema::new(empty()), "[1,2,3]"),
            "ERR Value \"[1,2,3]\" for property \"\" has 0 to 3 of its items satisfying Number; the count must be Min(2).Max(1)."
        );
        assert_eq!(
            run(&Schema::new(empty()), r#"["a","b"]"#),
            "ERR Value \"[a,b]\" for property \"\" has 0 to 2 of its items satisfying Number; the count must be Min(2).Max(1)."
        );
        assert_eq!(
            run(&budget(1, empty()), "[1,2,3]"),
            "ERR Value \"[1,2,3]\" for property \"\" has 0 to 3 of its items satisfying Number; the count must be Min(2).Max(1)."
        );
        assert_eq!(
            run(&Schema::new(Contains(Max(3, Min(2, Any())), Token::Number, bare())), r#"[1,"a",2,3,4]"#),
            "ERR Value \"[1,a,2,3,4]\" for property \"\" has 4 of its items satisfying Number; the count must be Min(2).Max(3)."
        );
        assert_eq!(
            run(&Schema::new(Contains(Below(0, Any()), Token::Number, bare())), "[1,2]"),
            "ERR Value \"[1,2]\" for property \"\" has 0 to 2 of its items satisfying Number; the count must be Below(0)."
        );
        assert_eq!(
            run(&Schema::new(Contains(Len(2, Any()), Token::Number, bare())), "[1,2,3]"),
            "ERR Value \"[1,2,3]\" for property \"\" has 3 of its items satisfying Number; the count must be Len(2)."
        );
        // Ignore around a count is a check, not a bound: it admits any.
        let ignored = Contains(Ignore(Min(1, Any())), Token::Number, bare());
        assert_eq!(run(&Schema::new(ignored), r#"["a"]"#), r#"["a"]"#);

        // An item is tried only while the untried could change the verdict.
        assert_eq!(
            run(&Schema::new(Contains(Max(1, Any()), Token::Number, bare())), "[1,2,3]"),
            "ERR Value \"[1,2,3]\" for property \"\" has 2 to 3 of its items satisfying Number; the count must be Max(1)."
        );
        let tried = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = Arc::clone(&tried);
        let lazy = Schema::new(Contains(
            Min(1, Any()),
            Check(
                move |_, _| {
                    counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    true
                },
                Any(),
            ),
            bare(),
        ));
        assert_eq!(run(&lazy, "[1,2,3]"), "[1,2,3]");
        assert_eq!(tried.load(std::sync::atomic::Ordering::SeqCst), 1);

        // Not an array: the node's type speaks. With a spec, its shape holds too.
        assert_eq!(
            run(&one, "\"x\""),
            "ERR Validation failed for string \"x\" because the string is not of type array."
        );
        assert_eq!(
            run(
                &Schema::new(Contains(Min(1, Any()), Token::Number, Any())),
                "\"x\""
            ),
            "\"x\""
        );
        assert_eq!(
            run(&Schema::new(Contains(1, Token::Number, arr([Min(1, Any())]))), "[1,0]"),
            "ERR Value \"[1,0]\" for property \"\" has 2 of its items satisfying Number; the count must be 1."
        );
        assert_eq!(
            run(
                &Schema::new(Min(1, Any()).Contains(1, Token::String)),
                r#"["a"]"#
            ),
            r#"["a"]"#
        );
        let between = Contains(Below(3, Above(0, Any())), Token::Number, bare());
        assert_eq!(run(&at_a(between), &a(r#"[1,"x"]"#)), a(r#"[1,"x"]"#));
        // The items are left as they were given.
        let filled = Contains(Min(1, Any()), Open(obj([("b", 2)])), bare());
        assert_eq!(run(&Schema::new(filled), r#"[{"a":1}]"#), r#"[{"a":1}]"#);
        // A verdict reads it alike, and a count shape is asked once per
        // number.
        assert!(one.valid(&j("[1]")) && !one.valid(&j("[\"a\"]")));
        assert!(one.valid(&j("[\"a\",1]")));

        // The count is a whole number or a shape; the items need a shape. A
        // count or an item shape that is a builder's fault is the fault.
        for count in [
            Spec::from(-1),
            Spec::from(1.5),
            Spec::from(f64::INFINITY),
            Spec::from(f64::NAN),
            Spec::Value(Value::Undefined),
        ] {
            assert_eq!(
                run(&Schema::new(Contains(count, Token::String, bare())), "[]"),
                format!("ERR {}", CONTAINS_FAULT)
            );
        }
        assert_eq!(
            run(&Schema::new(Contains(1, Value::Undefined, bare())), "[]"),
            format!("ERR {}", CONTAINS_ITEMS_FAULT)
        );
        assert_eq!(
            run(
                &Schema::new(Contains(Min("x", Any()), Token::String, bare())),
                "[]"
            ),
            "ERR Shape: Min needs a number"
        );
        assert_eq!(
            run(&Schema::new(Contains(1, Min("x", Any()), bare())), "[]"),
            "ERR Shape: Min needs a number"
        );
        for (src, want) in [
            ("Contains()", CONTAINS_FAULT),
            ("Contains(1)", CONTAINS_ITEMS_FAULT),
            ("Contains(-1,String)", CONTAINS_FAULT),
            ("Contains(1.5,String)", CONTAINS_FAULT),
        ] {
            assert_eq!(crate::expr::expr(src).unwrap_err().0, want, "{}", src);
        }

        // The string form, and the key expression, whose example is the spec
        // whatever the count is.
        assert_eq!(
            run(&Schema::parse("Contains(1,Number)").unwrap(), r#"[1,"a"]"#),
            r#"[1,"a"]"#
        );
        let keyed = |key: &str, input: &str| run(&Schema::new(obj([(key, bare())])), input);
        assert_eq!(
            keyed("a: Contains(1,Number)", r#"{"a":[1]}"#),
            r#"{"a":[1]}"#
        );
        assert_eq!(
            keyed("a: Contains(Min(1),Number)", r#"{"a":["x"]}"#),
            "ERR Value \"[x]\" for property \"a\" has 0 of its items satisfying Number; the count must be Min(1)."
        );
        assert_eq!(
            keyed("a: Contains(1,Nof(1,String,Number))", r#"{"a":["x",true]}"#),
            r#"{"a":["x",true]}"#
        );
        // An array renders as its spec; any other node shows the check.
        assert_eq!(
            stringify_node(&Contains(1, Token::String, bare()), false),
            "[]"
        );
        assert_eq!(
            stringify_node(&Min(1, Any()).Contains(1, Token::String), false),
            "Min(1).Contains(1,String)"
        );
    }

    // ts/test/builder.test.ts, builder-unique.
    #[test]
    fn unique_compares_items_as_json_values() {
        // Items compare as JSON values: by value, in any key order.
        let u = Schema::new(Unique(bare()));
        let distinct = r#"[1,"1",true,null,[1],{"a":1}]"#;
        assert_eq!(run(&u, distinct), distinct);
        assert_eq!(
            run(&u, "[1,2,2,1]"),
            "ERR Value \"[1,2,2,1]\" for property \"\" must have unique items (items 1 and 2 are equal)."
        );
        assert_eq!(
            run(&u, r#"[{"a":1,"b":2},{"b":2,"a":1}]"#),
            "ERR Value \"[{a:1,b:2},{b:2,a:1}]\" for property \"\" must have unique items (items 0 and 1 are equal)."
        );
        assert!(u.valid(&j(r#"[[1],{"0":1}]"#)));
        assert!(u.valid(&j(r#"[{"a":1},{"b":1},{"a":1,"b":1}]"#)));
        assert!(u.valid(&j(r#"[[1,2],[1,3],[1]]"#)));
        assert!(!u.valid(&j(r#"[[1,[2]],[1,[2]]]"#)));
        // NaN is NaN, a zero is a zero whatever its sign, a bigint is its
        // value and a function itself; a date is equal to itself alone.
        let items = |vs: Vec<Value>| Value::Arr(vs);
        let nan = || Value::Num(f64::NAN);
        assert!(!u.valid(&items(vec![items(vec![nan()]), items(vec![nan()])])));
        assert!(!u.valid(&items(vec![nan(), nan()])));
        assert!(!u.valid(&items(vec![Value::Num(0.0), Value::Num(-0.0)])));
        let big = || Value::BigInt(num_bigint::BigInt::from(1));
        assert!(!u.valid(&items(vec![big(), big()])));
        assert!(u.valid(&items(vec![big(), Value::from(1)])));
        assert!(!u.valid(&items(vec![Value::Func(1), Value::Func(1)])));
        assert!(u.valid(&items(vec![Value::Func(1), Value::Func(2)])));
        assert!(!u.valid(&items(vec![Value::Undefined, Value::Undefined])));
        assert!(u.valid(&items(vec![Value::Date(1), Value::Date(1)])));
        assert!(u.valid(&items(vec![
            items(vec![Value::Date(1)]),
            items(vec![Value::Date(1)])
        ])));

        // Not an array: the node's type speaks. With a spec, its shape holds too.
        assert_eq!(
            run(&u, "\"x\""),
            "ERR Validation failed for string \"x\" because the string is not of type array."
        );
        assert_eq!(run(&Schema::new(Unique(Any())), "\"x\""), "\"x\"");
        assert_eq!(
            run(&Schema::new(Unique(arr([Token::String]))), r#"["a","a"]"#),
            "ERR Value \"[a,a]\" for property \"\" must have unique items (items 0 and 1 are equal)."
        );
        assert_eq!(
            run(&Schema::new(Max(2, Any()).Unique()), "[1,1]"),
            "ERR Value \"[1,1]\" for property \"\" must have unique items (items 0 and 1 are equal)."
        );
        assert_eq!(
            run(&Schema::new(obj([("u", Unique(bare()))])), r#"{"u":[1,2]}"#),
            r#"{"u":[1,2]}"#
        );
        assert_eq!(run(&Schema::parse("Unique").unwrap(), "[1,2]"), "[1,2]");
        // An array renders as its spec; any other node shows the check.
        assert_eq!(stringify_node(&Unique(bare()), false), "[]");
        assert_eq!(
            stringify_node(&Max(2, Any()).Unique(), false),
            "Max(2).Unique()"
        );
    }

    // ts/test/builder.test.ts, builder-trials.
    #[test]
    fn trials_share_one_budget_per_validation() {
        // Every trial takes one from the validation's budget; past it the
        // validation fails, with that error alone.
        let spent = "Value \"[1,2]\" for property \"\" needs more trials than the budget of 1.";
        let two = || Contains(2, Token::Number, bare());
        assert_eq!(run(&budget(1, two()), "[1,2]"), format!("ERR {}", spent));
        assert_eq!(run(&budget(2, two()), "[1,2]"), "[1,2]");
        let mut ctx = Context::new();
        assert!(budget(1, two()).validate_ctx(j("[1,2]"), &mut ctx).is_err());
        let got: Vec<(&str, &str, &str)> = ctx
            .err
            .iter()
            .map(|e| (e.text.as_str(), e.path.as_str(), e.why.as_str()))
            .collect();
        assert_eq!(got, vec![(spent, "", "trial")]);
        assert_eq!(budget(1, two()).error(&j("[1,2]"))[0].text, spent);
        // A trial refused once is refused again, and the first refusal is
        // the one named.
        assert_eq!(
            run(&budget(1, Contains(3, Token::Number, bare())), "[1,2,3,4]"),
            "ERR Value \"[1,2,3,4]\" for property \"\" needs more trials than the budget of 1."
        );

        // A trial the budget refused could have decided anything, even a not.
        let not = budget(2, Nof(0, [Contains(3, Token::Number, bare())]));
        assert_eq!(
            run(&not, "[1,2,3]"),
            "ERR Value \"[1,2,3]\" for property \"\" needs more trials than the budget of 2."
        );
        assert!(!not.valid(&j("[1,2,3]")));
        assert!(!not.matches(&j("[1,2,3]")));
        assert_eq!(not.error(&j("[1,2,3]")).len(), 1);

        // Validations within it share the budget, and the error names where
        // it ran out.
        let all = All([
            Contains(1, Token::Number, bare()),
            Contains(1, Token::String, bare()),
        ]);
        assert_eq!(
            run(&budget(3, all), r#"[1,"a"]"#),
            "ERR Value \"[1,a]\" for property \"\" needs more trials than the budget of 3."
        );
        let disc = crate::discriminated::Discriminated(
            "k",
            [(
                "a",
                obj([
                    ("k", Spec::from(Token::String)),
                    (
                        "x",
                        Spec::from(Contains(Min(1, Any()), Token::Number, bare())),
                    ),
                ]),
            )],
        );
        assert_eq!(
            run(&budget(1, disc), r#"{"k":"a","x":["q",1]}"#),
            "ERR Value \"[q,1]\" for property \"x\" needs more trials than the budget of 1."
        );
        let kinds = Nof(
            1,
            [
                Spec::from(Contains(Min(1, Any()), Token::Number, bare())),
                Spec::from(Token::String),
            ],
        );
        assert_eq!(
            run(
                &budget(2, obj([("a", arr([kinds]))])),
                r#"{"a":[[1],["x",1]]}"#
            ),
            "ERR Value \"[x,1]\" for property \"a.1\" needs more trials than the budget of 2."
        );
        // A When's condition is a trial too, and so is a Nof's shape.
        let when = || When(Token::Number, Any(), Any());
        assert_eq!(
            run(&budget(1, All([when(), Min(1, when())])), "5"),
            "ERR Value \"5\" for property \"\" needs more trials than the budget of 1."
        );
        assert_eq!(
            run(
                &budget(1, at_a_spec(Nof(1, [Token::String, Token::Boolean]))),
                r#"{"a":1}"#
            ),
            "ERR Value \"1\" for property \"a\" needs more trials than the budget of 1."
        );

        // So does the shape Nof(1) produces from, which runs its trials
        // again, at the Nof's own path.
        let produced = || {
            obj([(
                "a",
                Nof(
                    1,
                    [
                        Contains(1, Token::Number, bare()),
                        Contains(1, Token::String, bare()),
                    ],
                ),
            )])
        };
        assert_eq!(
            run(&budget(3, produced()), r#"{"a":[1]}"#),
            "ERR Value \"[1]\" for property \"a\" needs more trials than the budget of 3."
        );
        assert_eq!(
            run(&budget(4, produced()), r#"{"a":[1]}"#),
            "ERR Value \"[1]\" for property \"a\" needs more trials than the budget of 4."
        );
        assert_eq!(run(&budget(5, produced()), r#"{"a":[1]}"#), r#"{"a":[1]}"#);
        let nested = obj([(
            "a",
            Nof(
                1,
                [
                    Spec::from(Nof(1, [Min(0, Token::Number), Max(5, Token::Number)])),
                    Spec::from(Token::Boolean),
                ],
            ),
        )]);
        assert_eq!(
            run(&budget(4, nested), r#"{"a":7}"#),
            "ERR Value \"7\" for property \"a\" needs more trials than the budget of 4."
        );

        // Each call has a budget of its own, and a call within another
        // leaves the other's as it was; zero is the default.
        let twice = budget(2, Contains(Min(1, Any()), Token::Number, bare()));
        let mut reused = Context::new();
        assert!(twice.validate_ctx(j(r#"["a",1]"#), &mut reused).is_ok());
        assert!(twice.validate_ctx(j(r#"["a",1]"#), &mut reused).is_ok());
        assert_eq!(
            run(
                &budget(0, Contains(Min(1, Any()), Token::Number, bare())),
                "[1]"
            ),
            "[1]"
        );
        // The inner call spends its budget of one; the outer still has its
        // two for the items after it.
        let inner = Arc::new(budget(1, two()));
        let nested = Arc::clone(&inner);
        let outer = budget(
            2,
            Contains(
                2,
                Token::Number,
                Check(
                    move |state, _| nested.validate_ctx(j("[1,2]"), state.ctx).is_err(),
                    bare(),
                ),
            ),
        );
        assert_eq!(run(&outer, "[1,2]"), "[1,2]");
    }

    fn at_a_spec(n: impl Into<Spec>) -> Spec {
        obj([("a", n.into())])
    }
}

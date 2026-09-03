//! Declarative JSON
//! ================
//! A shape written back as the JSON that [`crate::expr::build`] reads: every
//! string is an expression of the string DSL, a key expression (`"a: String"`)
//! carries its example as the value, and a `"$$"` key applies an expression to
//! the object that holds it, with `"$$0"`, `"$$1"`, ... beside it for the
//! arguments an expression cannot spell inline (an object or array shape).
//! The result reads back as the same shape: the JSON of the shape built from
//! a shape's JSON is that JSON, and the two accept and produce the same
//! values. Nothing a function does can be written down, so a shape carrying
//! one (a check function, a transform, a key function) cannot be written, nor
//! can a builder option the DSL has no word for (rename's keep and claim,
//! refer's fill and strict) or a default that is an object, an array or a
//! date.
//!
//! This mirrors `ts/src/shape.ts` nodeJson; the Go port carries the same.

use crate::node::{Kind, ListMode, Node, Validator};
use crate::value::{js_number, json_text, Map, Value};
use std::fmt;

const MARK: &str = "$$";

/// What the JSON cannot say about a shape.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JsonError(pub String);

impl fmt::Display for JsonError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Shape: json cannot express {}", self.0)
    }
}

impl std::error::Error for JsonError {}

type R<T> = Result<T, JsonError>;

fn cannot<T>(what: impl Into<String>) -> R<T> {
    Err(JsonError(what.into()))
}

/// The type token a kind is written as, where it has one.
fn token_of(kind: Kind) -> Option<&'static str> {
    match kind {
        Kind::String => Some("String"),
        Kind::Number => Some("Number"),
        Kind::Integer => Some("Integer"),
        Kind::Boolean => Some("Boolean"),
        _ => None,
    }
}

fn is_format(name: &str) -> bool {
    matches!(
        name,
        "Email" | "Url" | "Uuid" | "DateTime" | "Ip" | "Ipv4" | "Ipv6"
    )
}

/// An argument of a call: inline expression text, or a spec that rides in a
/// sidecar (`"$$0"`) beside the expression.
enum Arg {
    Text(String),
    Side(Value),
}

struct Call {
    name: String,
    args: Vec<Arg>,
}

fn call(name: &str) -> Call {
    Call {
        name: name.to_string(),
        args: Vec::new(),
    }
}

fn call1(name: &str, arg: String) -> Call {
    Call {
        name: name.to_string(),
        args: vec![Arg::Text(arg)],
    }
}

/// The inline text of a literal argument: a JSON scalar, or NaN.
fn literal(v: &Value, what: &str) -> R<String> {
    match v {
        Value::Null => Ok("null".to_string()),
        Value::Bool(_) | Value::Str(_) => Ok(inline_json(v)),
        Value::Num(n) if n.is_finite() || n.is_nan() => Ok(js_number(*n)),
        other => cannot(format!("{} {}", what, kind_word(other))),
    }
}

/// A value as JSON text: a string keeps its quotes.
fn inline_json(v: &Value) -> String {
    match v {
        Value::Str(s) => json_text(s),
        other => crate::value::json_render(other),
    }
}

/// What a value is, in a message: the JavaScript typeof, or the number.
fn kind_word(v: &Value) -> String {
    match v {
        Value::Undefined => "undefined".to_string(),
        Value::Num(n) => js_number(*n),
        Value::Func(_) => "function".to_string(),
        Value::BigInt(_) => "bigint".to_string(),
        _ => "object".to_string(),
    }
}

/// An after check is a custom one, which cannot be written.
fn no_afters(afters: &[Validator]) -> R<()> {
    match afters.first() {
        Some(v) => cannot(format!("a custom after check {}", v.name)),
        None => Ok(()),
    }
}

/// The checks a node carries, as calls, in the order they run; the check at
/// `skip` is the head of the expression and is left out.
fn validator_calls(n: &Node, skip: Option<usize>) -> R<Vec<Call>> {
    let mut calls = Vec::new();
    for (i, v) in n.befores.iter().enumerate() {
        if Some(i) != skip {
            validator_call(v, &mut calls)?;
        }
    }
    no_afters(&n.afters)?;
    Ok(calls)
}

fn validator_call(v: &Validator, calls: &mut Vec<Call>) -> R<()> {
    let name = v.name.as_str();
    match name {
        "Min" | "Max" | "Above" | "Below" | "Len" => {
            calls.push(call1(name, literal(&v.args[0], "the bound")?));
        }
        "Catch" => {
            // The taken checks run inside, so they read ahead of the taker.
            let inner = v.inner.as_ref().expect("Catch takes its checks inside");
            for iv in &inner.befores {
                validator_call(iv, calls)?;
            }
            no_afters(&inner.afters)?;
            calls.push(call1(name, literal(&v.args[0], "the fallback")?));
        }
        "Transform" => return cannot("Transform"),
        "Coerce" => calls.push(call(name)),
        "Define" | "Refer" => calls.push(call1(name, inline_json(&v.args[0]))),
        "Key" => {
            let mut args = Vec::with_capacity(v.args.len());
            for a in &v.args {
                args.push(Arg::Text(literal(a, "the Key argument")?));
            }
            calls.push(Call {
                name: name.to_string(),
                args,
            });
        }
        "Exact" => {
            let mut args = Vec::with_capacity(v.args.len());
            for a in &v.args {
                args.push(Arg::Text(literal(a, "the Exact value")?));
            }
            calls.push(Call {
                name: name.to_string(),
                args,
            });
        }
        "Check" => return cannot("a check function"),
        // The list itself is the head of the expression.
        "One" | "Some" | "All" | "Discriminated" => {}
        _ if is_format(name) => calls.push(call(name)),
        // The check of a regexp is named by its pattern.
        _ if name.starts_with('/') => calls.push(call1("Check", name.to_string())),
        _ => return cannot(format!("a custom check {}", name)),
    }
    Ok(())
}

/// Whether the node is required or skipped, as calls, for a head that says
/// neither: Required where the head is optional by itself, Optional or Skip
/// where it is required. Ignore says skipped already.
fn required_calls(n: &Node, head_required: bool) -> Vec<Call> {
    let mut calls = Vec::new();
    if n.required && !head_required {
        calls.push(call("Required"));
    } else if !n.required && !n.is_ignore() {
        if n.skippable {
            calls.push(call("Skip"));
        } else if head_required {
            calls.push(call("Optional"));
        }
    }
    calls
}

/// The flags of the node, as calls. An empty literal head says Empty by
/// itself. A rename reads first among the checks, as it does when written
/// first.
fn flag_calls(n: &Node, literal_head: bool) -> R<Vec<Call>> {
    let mut calls = Vec::new();
    if n.kind == Kind::String && n.empty && !(literal_head && n.default == Value::Str(String::new()))
    {
        calls.push(call("Empty"));
    }
    if n.nullable {
        calls.push(call("Nullable"));
    }
    if let Some(to) = &n.rename_to {
        if n.rename_keep || !n.rename_claim.is_empty() {
            return cannot("the options of Rename");
        }
        calls.push(call1("Rename", json_text(to)));
    }
    if n.refer_name.is_some() && (n.refer_fill || n.refer_strict) {
        return cannot("the options of Refer");
    }
    Ok(calls)
}

/// Ignore is a flag, read after the checks it silences, then the description
/// and the fault text.
fn tail_calls(n: &Node) -> Vec<Call> {
    let mut calls = Vec::new();
    if n.is_ignore() {
        calls.push(call("Ignore"));
    }
    if let Some(Value::Str(d)) = n.meta.get("description") {
        calls.push(call1("Describe", json_text(d)));
    }
    if let Some(msg) = &n.fault_msg {
        calls.push(call1("Fault", json_text(msg)));
    }
    calls
}

/// The value form of a node as an argument: inline when it is a string.
fn arg_of(n: &Node) -> R<Arg> {
    Ok(match node_json(n)? {
        Value::Str(s) => Arg::Text(s),
        other => Arg::Side(other),
    })
}

/// Whether an open object's child shape is the plain Any of Open.
fn is_open_any(c: &Node) -> bool {
    c.kind == Kind::Any
        && !c.required
        && c.befores.is_empty()
        && c.afters.is_empty()
        && c.obj_rest.is_none()
        && (!c.has_default || c.default.is_undefined())
}

/// The text of a call, its sidecar arguments registered in refs. A shape is
/// the call's last argument.
fn call_text(c: &Call, refs: &mut Vec<(String, Value)>, shape: Option<&str>) -> String {
    let mut parts: Vec<String> = Vec::with_capacity(c.args.len() + 1);
    for a in &c.args {
        match a {
            Arg::Text(t) => parts.push(t.clone()),
            Arg::Side(j) => {
                let name = format!("{}{}", MARK, refs.len());
                refs.push((name.clone(), j.clone()));
                parts.push(name);
            }
        }
    }
    if let Some(s) = shape {
        parts.push(s.to_string());
    }
    if parts.is_empty() {
        c.name.clone()
    } else {
        format!("{}({})", c.name, parts.join(","))
    }
}

/// A chain of calls after a head, or with no head as a bare chain; empty
/// with neither.
fn chain_text(head: &str, calls: &[Call], refs: &mut Vec<(String, Value)>) -> String {
    let mut out = head.to_string();
    for c in calls {
        let text = call_text(c, refs, None);
        if out.is_empty() {
            out = text;
        } else {
            out.push('.');
            out.push_str(&text);
        }
    }
    out
}

/// The calls around a shape that is not a node by itself (a literal, a
/// regexp, a sidecar): the first takes it, the rest chain.
fn wrap_text(calls: &[Call], shape: &str, refs: &mut Vec<(String, Value)>) -> String {
    let mut out = call_text(&calls[0], refs, Some(shape));
    for c in &calls[1..] {
        out.push('.');
        out.push_str(&call_text(c, refs, None));
    }
    out
}

/// A carrier object: the expression under `"$$"`, the sidecars beside it.
fn carrier(text: String, refs: Vec<(String, Value)>) -> Value {
    let mut m = Map::new();
    m.insert(MARK.to_string(), Value::Str(text));
    for (k, v) in refs {
        m.insert(k, v);
    }
    Value::Obj(m)
}

/// A literal, held by the call that says whether it is required.
fn literal_head(n: &Node, lit: &str) -> String {
    let name = if n.skippable {
        "Skip"
    } else if n.required {
        "Required"
    } else {
        "Optional"
    };
    format!("{}({})", name, lit)
}

/// The index of the validator that makes the node the head of its
/// expression, so that the node has no key form: Key makes it, and Exact
/// reads every argument as a value.
fn head_validator(n: &Node) -> Option<usize> {
    n.befores
        .iter()
        .position(|v| v.name == "Key" || v.name == "Exact")
}

struct Scalar {
    head: String,
    token: Option<&'static str>,
    example: Value,
    calls: Vec<Call>,
}

/// The parts of a scalar: the head (a type token, a held literal, or Key),
/// the token of the key form (none where the head is not one), the example
/// of the key form, and the calls after the head.
fn scalar(n: &Node) -> R<Scalar> {
    let zero = Node::zero_for(n.kind);
    let is_zero = !n.has_default || n.default == zero;
    let example = if is_zero { zero } else { n.default.clone() };
    let hv = head_validator(n);
    let keyed = matches!(hv, Some(i) if n.befores[i].name == "Key");

    let (head, token, mut calls) = if keyed {
        let mut kc = Vec::new();
        validator_call(&n.befores[hv.unwrap()], &mut kc)?;
        let head = call_text(&kc[0], &mut Vec::new(), None);
        let mut calls = required_calls(n, false);
        calls.extend(flag_calls(n, false)?);
        (head, None, calls)
    // A literal stands for its own kind, but not for integer, and an empty
    // string literal allows the empty string; a required zero is the type
    // token.
    } else if (n.required && is_zero)
        || n.kind == Kind::Integer
        || (n.kind == Kind::String && !n.empty && n.default == Value::Str(String::new()))
    {
        let token = token_of(n.kind);
        let mut calls = required_calls(n, true);
        calls.extend(flag_calls(n, false)?);
        (token.unwrap_or_default().to_string(), token, calls)
    } else {
        (
            literal_head(n, &literal(&example, "the default")?),
            None,
            flag_calls(n, true)?,
        )
    };

    calls.extend(validator_calls(n, if keyed { hv } else { None })?);
    calls.extend(tail_calls(n));

    Ok(Scalar {
        head,
        token,
        example,
        calls,
    })
}

/// The key form of a property, the chain of `"name: chain"` with its
/// example, or none where the node has no key form (a list, a regexp, a
/// shape needing sidecars).
fn key_form(n: &Node) -> R<Option<(String, Value)>> {
    if head_validator(n).is_some() {
        return Ok(None);
    }
    if token_of(n.kind).is_some() {
        let sc = scalar(n)?;
        // With a literal head, the call that held the literal starts the chain.
        let head = sc.token.map(|t| t.to_string()).unwrap_or_else(|| {
            if n.skippable {
                "Skip".to_string()
            } else if n.required {
                "Required".to_string()
            } else {
                String::new()
            }
        });
        return Ok(Some((
            chain_text(&head, &sc.calls, &mut Vec::new()),
            sc.example,
        )));
    }
    if n.kind == Kind::Object {
        let o = object(n)?;
        if !o.refs.is_empty() {
            return Ok(None);
        }
        return Ok(Some((o.chain, Value::Obj(o.children))));
    }
    if n.kind == Kind::Array {
        let a = array(n)?;
        if !a.refs.is_empty() || a.closed {
            return Ok(None);
        }
        return Ok(Some((a.chain, Value::Arr(a.elements))));
    }
    Ok(None)
}

/// Whether a name has to be quoted in a key expression.
fn needs_quote(k: &str) -> bool {
    k.is_empty()
        || k.chars().any(|c| c.is_whitespace() || c == '"' || c == '\\')
        || crate::expr::split_key_expr(k).is_some()
}

struct ObjectParts {
    children: Map,
    chain: String,
    refs: Vec<(String, Value)>,
}

/// The children of an object in key form, and the chain that applies to the
/// object (empty when there is none).
fn object(n: &Node) -> R<ObjectParts> {
    let mut children = Map::new();
    let mut refs: Vec<(String, Value)> = Vec::new();

    // A type token brings the empty object as its default, which the walk
    // makes for an absent object anyway; any other default is one the
    // expression form cannot spell.
    if n.has_default
        && !n.default.is_undefined()
        && !matches!(&n.default, Value::Obj(m) if m.is_empty())
    {
        return cannot("an object default");
    }

    for (k, c) in &n.obj_children {
        if k.starts_with(MARK) {
            return cannot(format!("the property name {}", json_text(k)));
        }
        let kf = key_form(c)?;
        let is_key_expr = crate::expr::split_key_expr(k).is_some();
        match kf {
            Some((chain, example)) if !chain.is_empty() => {
                let name = if needs_quote(k) {
                    json_text(k)
                } else {
                    k.clone()
                };
                children.insert(format!("{}: {}", name, chain), example);
            }
            // A name that reads as a key expression is quoted, and so needs a
            // chain; Optional says nothing about a node that is optional
            // already.
            Some((_, example)) if is_key_expr => {
                children.insert(format!("{}: Optional", json_text(k)), example);
            }
            _ if is_key_expr => {
                return cannot(format!(
                    "the property name {} of a value with no key form",
                    json_text(k)
                ));
            }
            _ => {
                children.insert(k.clone(), node_json(c)?);
            }
        }
    }

    let mut calls = required_calls(n, false);
    calls.extend(flag_calls(n, false)?);
    calls.extend(validator_calls(n, None)?);
    match &n.obj_rest {
        None => {
            if n.obj_children.is_empty() {
                calls.push(call("Closed"));
            }
        }
        Some(rest) if is_open_any(rest) => {
            if !n.obj_children.is_empty() {
                calls.push(call("Open"));
            }
        }
        Some(rest) => calls.push(Call {
            name: "Child".to_string(),
            args: vec![arg_of(rest)?],
        }),
    }
    calls.extend(tail_calls(n));

    let chain = if calls.is_empty() {
        String::new()
    } else {
        chain_text("", &calls, &mut refs)
    };

    Ok(ObjectParts {
        children,
        chain,
        refs,
    })
}

struct ArrayParts {
    elements: Vec<Value>,
    calls: Vec<Call>,
    chain: String,
    refs: Vec<(String, Value)>,
    closed: bool,
}

/// The elements of an array in value form: the fixed positions, or the one
/// element shape. A single fixed position is closed, which `[X]` cannot say.
fn array(n: &Node) -> R<ArrayParts> {
    let mut refs: Vec<(String, Value)> = Vec::new();
    let mut elements = Vec::new();
    let mut closed = false;

    if n.has_default
        && !n.default.is_undefined()
        && !matches!(&n.default, Value::Arr(a) if a.is_empty())
    {
        return cannot("an array default");
    }

    if !n.arr_children.is_empty() {
        for p in &n.arr_children {
            elements.push(node_json(p)?);
        }
        closed = n.arr_children.len() == 1;
    } else if let Some(c) = &n.arr_child {
        // A rest replaces a plain element shape, so a node has one or the
        // other, never both.
        elements.push(node_json(c)?);
    }

    let mut calls = required_calls(n, false);
    calls.extend(flag_calls(n, false)?);
    calls.extend(validator_calls(n, None)?);
    if let Some(rest) = &n.arr_rest {
        calls.push(Call {
            name: "Rest".to_string(),
            args: vec![arg_of(rest)?],
        });
    }
    calls.extend(tail_calls(n));

    let chain = if calls.is_empty() {
        String::new()
    } else {
        chain_text("", &calls, &mut refs)
    };

    Ok(ArrayParts {
        elements,
        calls,
        chain,
        refs,
        closed,
    })
}

/// A node whose head is a call that makes it (Key on an object or an array):
/// the head, then the rest of the chain. Exact reads its arguments as
/// values, so an object or an array with it cannot be written.
fn headed(n: &Node, hv: usize, what: &str) -> R<Value> {
    if n.befores[hv].name == "Exact" {
        return cannot(format!("Exact on {}", what));
    }
    let mut kc = Vec::new();
    validator_call(&n.befores[hv], &mut kc)?;
    let head = call_text(&kc[0], &mut Vec::new(), None);
    let mut calls = required_calls(n, false);
    calls.extend(flag_calls(n, false)?);
    calls.extend(validator_calls(n, Some(hv))?);
    calls.extend(tail_calls(n));
    Ok(Value::Str(chain_text(&head, &calls, &mut Vec::new())))
}

/// The value form of a node: the JSON that reads back as it.
pub fn node_json(n: &Node) -> R<Value> {
    if token_of(n.kind).is_some() {
        let sc = scalar(n)?;
        // A literal with nothing after it is the JSON value; a string is
        // quoted, as a bare one would read as an expression.
        if sc.token.is_none()
            && sc.calls.is_empty()
            && head_validator(n).is_none()
            && !n.required
            && !n.skippable
        {
            return Ok(match &sc.example {
                Value::Str(s) => Value::Str(json_text(s)),
                other => other.clone(),
            });
        }
        return Ok(Value::Str(chain_text(&sc.head, &sc.calls, &mut Vec::new())));
    }

    let hv = head_validator(n);

    match n.kind {
        Kind::Object => {
            if let Some(i) = hv {
                return headed(n, i, "an object");
            }
            let o = object(n)?;
            let mut children = o.children;
            if !o.chain.is_empty() {
                children.insert(MARK.to_string(), Value::Str(o.chain));
                for (k, v) in o.refs {
                    children.insert(k, v);
                }
            }
            Ok(Value::Obj(children))
        }

        Kind::Array => {
            if let Some(i) = hv {
                return headed(n, i, "an array");
            }
            let a = array(n)?;
            if a.chain.is_empty() && !a.closed {
                return Ok(Value::Arr(a.elements));
            }
            // The calls take the array as their shape; a single position is
            // closed first, as a one element array is an element shape.
            let name = format!("{}0", MARK);
            let mut refs = vec![(name.clone(), Value::Arr(a.elements))];
            let shape = if a.closed {
                format!("Closed({})", name)
            } else {
                name
            };
            let text = if a.calls.is_empty() {
                shape
            } else {
                wrap_text(&a.calls, &shape, &mut refs)
            };
            Ok(carrier(text, refs))
        }

        Kind::List => {
            let mut refs: Vec<(String, Value)> = Vec::new();
            let head = match &n.disc {
                Some(d) => Call {
                    name: "Discriminated".to_string(),
                    args: vec![Arg::Text(json_text(&d.tag)), Arg::Side(branches(n)?)],
                },
                None => {
                    let mode = match n.list_mode {
                        ListMode::Some => "Some",
                        ListMode::All => "All",
                        _ => "One",
                    };
                    let mut args = Vec::with_capacity(n.list.len());
                    for b in &n.list {
                        args.push(arg_of(b)?);
                    }
                    Call {
                        name: mode.to_string(),
                        args,
                    }
                }
            };
            let mut calls = required_calls(n, true);
            calls.extend(flag_calls(n, false)?);
            calls.extend(validator_calls(n, None)?);
            calls.extend(tail_calls(n));
            let head_text = call_text(&head, &mut refs, None);
            let text = chain_text(&head_text, &calls, &mut refs);
            Ok(if refs.is_empty() {
                Value::Str(text)
            } else {
                carrier(text, refs)
            })
        }

        Kind::Regexp => {
            // A regexp is not a node until a builder takes it, so the calls
            // wrap it.
            let mut calls = required_calls(n, true);
            calls.extend(flag_calls(n, false)?);
            calls.extend(validator_calls(n, None)?);
            calls.extend(tail_calls(n));
            let re = format!("/{}/", n.regexp_src);
            Ok(Value::Str(if calls.is_empty() {
                re
            } else {
                wrap_text(&calls, &re, &mut Vec::new())
            }))
        }

        Kind::NaN => {
            let mut calls = flag_calls(n, true)?;
            calls.extend(validator_calls(n, None)?);
            calls.extend(tail_calls(n));
            Ok(Value::Str(if calls.is_empty() && !n.required && !n.skippable {
                "NaN".to_string()
            } else {
                chain_text(&literal_head(n, "NaN"), &calls, &mut Vec::new())
            }))
        }

        // The rest are a call that names the kind, then the chain.
        _ => {
            let mut head_required = true;
            let mut head_skipped = false;
            let head = match n.kind {
                Kind::Any => {
                    let mut head = if n.required { "Required" } else { "Any" }.to_string();
                    head_required = n.required;
                    if n.has_default && !n.default.is_undefined() {
                        head = format!("{}({})", head, literal(&n.default, "the default")?);
                    }
                    head
                }
                Kind::Never => {
                    head_required = false;
                    "Never".to_string()
                }
                Kind::Null => {
                    if !n.required
                        && !n.skippable
                        && n.befores.is_empty()
                        && n.afters.is_empty()
                        && !n.nullable
                        && n.fault_msg.is_none()
                        && !n.meta.contains_key("description")
                        && n.rename_to.is_none()
                    {
                        return Ok(Value::Null);
                    }
                    head_required = n.required;
                    head_skipped = n.skippable;
                    if n.required {
                        "Required(null)".to_string()
                    } else if n.skippable {
                        "Skip(null)".to_string()
                    } else {
                        "null".to_string()
                    }
                }
                Kind::Date | Kind::Function => {
                    if n.has_default && !n.default.is_undefined() {
                        return cannot(format!("a {} default", n.kind));
                    }
                    if n.kind == Kind::Date { "Date" } else { "Function" }.to_string()
                }
                Kind::Check => {
                    // Check is the first call, and says required.
                    let first = match n.befores.first() {
                        Some(v) if v.name.starts_with('/') => v,
                        _ => return cannot("a check function"),
                    };
                    let mut kc = Vec::new();
                    validator_call(first, &mut kc)?;
                    let head = call_text(&kc[0], &mut Vec::new(), None);
                    let mut calls = required_calls(n, true);
                    calls.extend(flag_calls(n, false)?);
                    calls.extend(validator_calls(n, Some(0))?);
                    calls.extend(tail_calls(n));
                    return Ok(Value::Str(chain_text(&head, &calls, &mut Vec::new())));
                }
                other => return cannot(format!("a {} value", other)),
            };

            let rp = if head_skipped {
                Vec::new()
            } else {
                required_calls(n, head_required)
            };
            let mut calls = flag_calls(n, false)?;
            calls.extend(validator_calls(n, None)?);
            calls.extend(tail_calls(n));
            if head_required && !rp.is_empty() && n.kind != Kind::Any {
                // Optional(Date), Skip(Never): the call holds the token.
                let held = format!("{}({})", rp[0].name, head);
                return Ok(Value::Str(chain_text(&held, &calls, &mut Vec::new())));
            }
            let mut all = rp;
            all.extend(calls);
            Ok(Value::Str(chain_text(&head, &all, &mut Vec::new())))
        }
    }
}

/// The branches of a discriminated union by tag value. A branch's tag
/// property is what the union added, unless the author declared it.
fn branches(n: &Node) -> R<Value> {
    let d = n.disc.as_ref().expect("a discriminated node has its tag");
    let mut out = Map::new();
    for (i, t) in d.tags.iter().enumerate() {
        let b = &n.list[i];
        let mut j = node_json(b)?;
        let added = b.obj_children.get(&d.tag).is_some_and(|tn| {
            tn.kind == Kind::String
                && !tn.required
                && tn.default == Value::Str(t.clone())
                && tn.befores.is_empty()
                && tn.afters.is_empty()
                && tn.fault_msg.is_none()
        });
        if let (true, Value::Obj(m)) = (added, &mut j) {
            m.shift_remove(&d.tag);
        }
        out.insert(t.clone(), j);
    }
    Ok(Value::Obj(out))
}

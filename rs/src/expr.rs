//! The string form of a spec: `"String.Min(2)"`, `"Min(2, Number)"`,
//! `"One(String, Number)"`. Builder names, type tokens, JSON literals and
//! `/regexp/` tokens, chained with dots and given arguments in parentheses.

use crate::algebra::{extend_node, omit_node, partial_node, pick_node, Names};
use crate::builders::*;
use crate::node::{Node, Token};
use crate::normalize::{literal_node, nan_node, normalize, regexp_node_src};
use crate::spec::Spec;
use crate::value::Value;
use regex::Regex;
use std::fmt;
use std::sync::OnceLock;

/// An expression that does not parse.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExprError(pub String);

impl fmt::Display for ExprError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ExprError {}

fn err<T>(msg: String) -> Result<T, ExprError> {
    Err(ExprError(msg))
}

/// Parse an expression into a node.
pub fn expr(src: &str) -> Result<Node, ExprError> {
    let tokens = tokenize(src)?;
    let mut p = Parser { tokens, src, i: 0 };
    p.parse_full()
}

/// Apply an expression to an existing carrier: every builder of the chain
/// takes the carrier as its final argument, so `"Open"` opens an object
/// rather than replacing it. What value expressions and key expressions do.
pub fn expr_apply(src: &str, carrier: Spec) -> Result<Node, ExprError> {
    let tokens = tokenize(src)?;
    let mut p = Parser { tokens, src, i: 0 };
    let mut val = carrier;
    while !p.peek().is_empty() {
        if p.peek() == "." {
            p.take();
        }
        val = Spec::from(p.parse_chained(val)?);
    }
    Ok(normalize(val))
}

fn token_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"\s*,?\s*([)(.]|"(?:\\.|[^"\\])*"|/(?:\\.|[^/\\])*/[a-z]?|[^)(,.\s]+)\s*"#)
            .unwrap()
    })
}

fn tokenize(src: &str) -> Result<Vec<String>, ExprError> {
    if src.trim().is_empty() {
        return err("Shape: empty expression".to_string());
    }
    let mut tokens = Vec::new();
    let mut pos = 0;
    for m in token_re().captures_iter(src) {
        let whole = m.get(0).unwrap();
        if whole.start() != pos {
            return err(format!(
                "Shape: unexpected character at offset {} in expression {:?}",
                pos, src
            ));
        }
        pos = whole.end();
        tokens.push(m.get(1).unwrap().as_str().to_string());
    }
    if pos != src.len() {
        return err(format!(
            "Shape: unexpected trailing text in expression {:?}",
            src
        ));
    }
    Ok(tokens)
}

struct Parser<'s> {
    tokens: Vec<String>,
    src: &'s str,
    i: usize,
}

fn type_token(name: &str) -> Option<Token> {
    Some(match name {
        "Any" => Token::Any,
        "String" => Token::String,
        "Number" => Token::Number,
        "Boolean" => Token::Boolean,
        "Object" => Token::Object,
        "Array" => Token::Array,
        "Function" => Token::Function,
        "Integer" => Token::Integer,
        "Date" => Token::Date,
        "BigInt" => Token::BigInt,
        _ => return None,
    })
}

const BUILDERS: [&str; 44] = [
    "Required",
    "Optional",
    "Open",
    "Closed",
    "Skip",
    "Ignore",
    "Empty",
    "Never",
    "Func",
    "Nullable",
    "Coerce",
    "Email",
    "Url",
    "Uuid",
    "DateTime",
    "Ip",
    "Ipv4",
    "Ipv6",
    "Default",
    "Catch",
    "Describe",
    "Pick",
    "Omit",
    "Partial",
    "Extend",
    "Fault",
    "Type",
    "Exact",
    "Min",
    "Max",
    "Above",
    "Below",
    "Len",
    "Check",
    "One",
    "Some",
    "All",
    "Child",
    "Rest",
    "Define",
    "Refer",
    "Rename",
    "Key",
    "Transform",
];

fn is_builder(name: &str) -> bool {
    BUILDERS.contains(&name)
}

/// A type token with arguments applies the type to them: `String(Min(2))`
/// is `Type(String, Min(2))`. Bare, it is `Type(tok)` as well, so that a
/// bare `Object` is closed, as `Type(Object)` is.
fn type_node(tok: Token, args: Vec<Spec>) -> Node {
    let spec = args.into_iter().next().unwrap_or_else(|| Spec::from(any()));
    type_(tok, spec)
}

/// A `/re/` token: held to the shared subset here, so that a pattern
/// outside it is a parse error, as in TypeScript. A flag letter after the
/// closing slash is refused the same way. The body is carried as text; the
/// node compiles the engine form.
fn regexp_token(head: &str) -> Option<Result<String, ExprError>> {
    let bytes = head.as_bytes();
    if head.len() >= 3
        && head.starts_with('/')
        && bytes[head.len() - 1].is_ascii_lowercase()
        && bytes[head.len() - 2] == b'/'
    {
        let body = &head[1..head.len() - 2];
        return Some(Err(ExprError(crate::regexp::regexp_fault(
            body,
            "flags are not supported",
        ))));
    }
    if head.len() >= 2 && head.starts_with('/') && head.ends_with('/') {
        let body = &head[1..head.len() - 1];
        Some(
            crate::regexp::canonical_regexp(body)
                .map(|_| body.to_string())
                .map_err(ExprError),
        )
    } else {
        None
    }
}

fn json_literal(head: &str) -> Option<Value> {
    serde_json::from_str::<serde_json::Value>(head)
        .ok()
        .map(Value::from)
}

impl<'s> Parser<'s> {
    fn peek(&self) -> &str {
        self.tokens.get(self.i).map(|s| s.as_str()).unwrap_or("")
    }

    fn take(&mut self) -> String {
        let t = self.peek().to_string();
        if !t.is_empty() {
            self.i += 1;
        }
        t
    }

    fn unexpected<T>(&self, head: &str) -> Result<T, ExprError> {
        err(format!(
            "Shape: unexpected token {} in builder expression {}",
            head, self.src
        ))
    }

    fn parse_full(&mut self) -> Result<Node, ExprError> {
        let mut val = self.parse_term()?;
        // A chain: `. Builder(args)`, and continued tokens are sub-builders
        // even without the dot.
        while !self.peek().is_empty() {
            if self.peek() == "." {
                self.take();
            }
            val = self.parse_chained(Spec::from(val))?;
        }
        Ok(val)
    }

    /// The primary of an expression: a builder call, a type token, a
    /// literal, a regexp. A literal here is a default value. There is
    /// always a token: an empty source does not tokenize.
    fn parse_term(&mut self) -> Result<Node, ExprError> {
        let head = self.take();
        if head == ")" || head == "(" || head == "." {
            return self.unexpected(&head);
        }
        if is_builder(&head) {
            let args = self.parse_args()?;
            return call_builder(&head, args);
        }
        if let Some(tok) = type_token(&head) {
            let args = self.parse_args()?;
            return Ok(type_node(tok, args));
        }
        if head == "NaN" {
            self.parse_args()?;
            return Ok(nan_node());
        }
        if head == "undefined" || head == "null" {
            self.parse_args()?;
            return Ok(literal_node(Value::Null));
        }
        if let Some(re) = regexp_token(&head) {
            // A bare /re/ is a type, not a check: a non-string fails as a
            // type error. Check(/re/) is the explicit-check form.
            return Ok(regexp_node_src(&re?));
        }
        if let Some(lit) = json_literal(&head) {
            return Ok(default_of(lit));
        }
        self.unexpected(&head)
    }

    fn parse_chained(&mut self, carrier: Spec) -> Result<Node, ExprError> {
        let head = self.take();
        if head.is_empty() {
            return Ok(normalize(carrier));
        }
        if is_builder(&head) {
            let mut args = self.parse_args()?;
            // The carrier is the final argument.
            args.push(carrier);
            return call_builder(&head, args);
        }
        // A type token in chain position sets the type on the carrier:
        // `.Array` is `Type(Array)` applied to the current node.
        if let Some(tok) = type_token(&head) {
            self.parse_args()?;
            return Ok(type_(tok, carrier));
        }
        self.unexpected(&head)
    }

    /// `( arg, arg, ... )` when the next token opens it.
    fn parse_args(&mut self) -> Result<Vec<Spec>, ExprError> {
        if self.peek() != "(" {
            return Ok(Vec::new());
        }
        self.take();
        let mut args = Vec::new();
        loop {
            if self.peek() == ")" {
                self.take();
                return Ok(args);
            }
            if self.peek().is_empty() {
                return err(format!(
                    "Shape: unclosed argument list in expression {:?}",
                    self.src
                ));
            }
            args.push(self.parse_arg()?);
        }
    }

    /// One argument: a builder, a type token, a literal, a regexp; a builder
    /// or token may continue as a chain. The list is known to be open and
    /// not yet closed, so there is a token.
    fn parse_arg(&mut self) -> Result<Spec, ExprError> {
        let head = self.take();
        if is_builder(&head) {
            let args = self.parse_args()?;
            let node = call_builder(&head, args)?;
            return self.chain_continuation(node);
        }
        if let Some(tok) = type_token(&head) {
            let args = self.parse_args()?;
            return self.chain_continuation(type_node(tok, args));
        }
        if head == "NaN" {
            return self.chain_continuation(nan_node());
        }
        if head == "undefined" || head == "null" {
            return Ok(Spec::Value(Value::Null));
        }
        if let Some(re) = regexp_token(&head) {
            return Ok(Spec::Regexp(re?));
        }
        if let Some(lit) = json_literal(&head) {
            return Ok(Spec::Value(lit));
        }
        self.unexpected(&head)
    }

    fn chain_continuation(&mut self, mut node: Node) -> Result<Spec, ExprError> {
        while self.peek() == "." {
            self.take();
            node = self.parse_chained(Spec::from(node))?;
        }
        Ok(Spec::from(node))
    }
}

/// The argument in a shape position, or the bare form's start.
fn shape_at(args: &mut Vec<Spec>, i: usize, bare: Spec) -> Spec {
    if i < args.len() {
        args.remove(i)
    } else {
        bare
    }
}

fn value_at(args: &[Spec], i: usize) -> Option<Value> {
    match args.get(i) {
        Some(Spec::Value(v)) => Some(v.clone()),
        _ => None,
    }
}

fn string_at(name: &str, what: &str, args: &[Spec], i: usize) -> Result<String, ExprError> {
    match args.get(i) {
        None => err(format!("{}: missing {}", name, what)),
        Some(Spec::Value(Value::Str(s))) => Ok(s.clone()),
        Some(_) => err(format!("{}: {} must be a string", name, what)),
    }
}

/// A builder by name with its parsed arguments.
/// A builder call. A builder given a wrong argument makes a fault node that
/// reports at validation; in the string form that is an error here, as the
/// builder throws in TypeScript.
fn call_builder(name: &str, args: Vec<Spec>) -> Result<Node, ExprError> {
    let node = build_call(name, args)?;
    if crate::builders::is_fault(&node) {
        return err(node.fault_msg.clone().unwrap_or_default());
    }
    Ok(node)
}

fn build_call(name: &str, mut args: Vec<Spec>) -> Result<Node, ExprError> {
    let any_spec = || Spec::from(any());
    let unary =
        |args: &mut Vec<Spec>, f: fn(Spec) -> Node| Ok(f(shape_at(args, 0, Spec::from(any()))));
    match name {
        "Required" => unary(&mut args, required),
        "Optional" => unary(&mut args, optional),
        "Open" => Ok(open(shape_at(&mut args, 0, Spec::Obj(Vec::new())))),
        "Closed" => unary(&mut args, closed),
        "Skip" => unary(&mut args, skip),
        "Ignore" => unary(&mut args, ignore),
        "Empty" => unary(&mut args, empty),
        "Never" => unary(&mut args, never),
        "Func" => unary(&mut args, func),
        "Nullable" => unary(&mut args, nullable),
        "Coerce" => unary(&mut args, coerce),
        "Email" => unary(&mut args, email),
        "Url" => unary(&mut args, url),
        "Uuid" => unary(&mut args, uuid),
        "DateTime" => unary(&mut args, date_time),
        "Ip" => unary(&mut args, ip),
        "Ipv4" => unary(&mut args, ipv4),
        "Ipv6" => unary(&mut args, ipv6),
        "Default" => {
            if args.is_empty() {
                return err("Default: missing default value".to_string());
            }
            let Some(dval) = value_at(&args, 0) else {
                return err("Default: default value must be a value".to_string());
            };
            if args.len() == 1 {
                return Ok(default_of(dval));
            }
            Ok(default(dval, shape_at(&mut args, 1, any_spec())))
        }
        "Catch" => {
            if args.is_empty() {
                return err("Catch: missing fallback value".to_string());
            }
            let Some(fb) = value_at(&args, 0) else {
                return err("Catch: fallback value must be a value".to_string());
            };
            Ok(catch(fb, shape_at(&mut args, 1, any_spec())))
        }
        "Describe" => {
            let msg = string_at("Describe", "description", &args, 0)?;
            Ok(describe(msg, shape_at(&mut args, 1, any_spec())))
        }
        "Fault" => {
            let msg = string_at("Fault", "message", &args, 0)?;
            Ok(fault(msg, shape_at(&mut args, 1, any_spec())))
        }
        "Type" => {
            if args.is_empty() {
                return err("Type: missing kind".to_string());
            }
            let kind = args.remove(0);
            let spec = shape_at(&mut args, 0, any_spec());
            Ok(match kind {
                Spec::Node(n) => type_(*n, spec),
                Spec::Token(t) => type_(t, spec),
                Spec::Value(Value::Str(name)) => type_(name.as_str(), spec),
                // Not a kind at all: the node stands as it is.
                _ => normalize(spec),
            })
        }
        "Exact" => {
            let mut vals = Vec::with_capacity(args.len());
            for a in args {
                match a {
                    Spec::Value(v) => vals.push(v),
                    _ => return err("Exact: values expected".to_string()),
                }
            }
            Ok(exact(vals))
        }
        "Min" | "Max" | "Above" | "Below" => {
            if args.is_empty() {
                return err(format!("{}: missing limit", name));
            }
            // A bound that is not a value is a wrong argument, and the
            // builder says so.
            let bound = value_at(&args, 0).unwrap_or(Value::Undefined);
            let spec = shape_at(&mut args, 1, any_spec());
            Ok(match name {
                "Min" => min(bound, spec),
                "Max" => max(bound, spec),
                "Above" => above(bound, spec),
                _ => below(bound, spec),
            })
        }
        "Len" => {
            if args.is_empty() {
                return err("Len: missing length".to_string());
            }
            let Some(Value::Num(f)) = value_at(&args, 0) else {
                return err("Len: length must be integer".to_string());
            };
            Ok(len(f.trunc(), shape_at(&mut args, 1, any_spec())))
        }
        "Check" => {
            if args.is_empty() {
                return err("Check: missing checker".to_string());
            }
            let checker = args.remove(0);
            let spec = shape_at(&mut args, 0, any_spec());
            Ok(match checker {
                Spec::Regexp(src) => check_re_src(&src, spec),
                // Not a check the string form can express: the shape alone.
                _ => normalize(spec),
            })
        }
        "One" => Ok(one(args)),
        "Some" => Ok(some(args)),
        "All" => Ok(all(args)),
        "Child" => {
            if args.is_empty() {
                return err("Child: missing child shape".to_string());
            }
            let c = args.remove(0);
            // Bare, an open object with the empty default it stands for.
            let spec = shape_at(
                &mut args,
                0,
                Spec::from(default(
                    Value::Obj(Default::default()),
                    Spec::Obj(Vec::new()),
                )),
            );
            Ok(child(c, spec))
        }
        "Rest" => {
            if args.is_empty() {
                return err("Rest: missing child shape".to_string());
            }
            let c = args.remove(0);
            let spec = shape_at(&mut args, 0, Spec::Arr(Vec::new()));
            Ok(rest(c, spec))
        }
        "Define" => {
            let n = string_at("Define", "name", &args, 0)?;
            Ok(define(n, shape_at(&mut args, 1, any_spec())))
        }
        "Refer" => {
            let n = string_at("Refer", "name", &args, 0)?;
            Ok(refer(n, shape_at(&mut args, 1, any_spec())))
        }
        "Rename" => {
            let n = string_at("Rename", "name", &args, 0)?;
            Ok(rename(n, shape_at(&mut args, 1, any_spec())))
        }
        "Key" => {
            let vals: Vec<Value> = args
                .into_iter()
                .filter_map(|a| match a {
                    Spec::Value(v) => Some(v),
                    _ => None,
                })
                .collect();
            Ok(key_args(&vals))
        }
        "Pick" | "Omit" => {
            if args.is_empty() {
                return err(format!("{}: missing property names", name));
            }
            let names = match value_at(&args, 0) {
                Some(v) => {
                    Names::from_value(&v, name).map_err(|e| ExprError(format!("Shape: {}", e)))?
                }
                None => return err(format!("Shape: {} needs a list of property names", name)),
            };
            let spec = shape_at(&mut args, 1, any_spec());
            let built = if name == "Pick" {
                pick_node(names, spec)
            } else {
                omit_node(names, spec)
            };
            built.map_err(|e| ExprError(format!("Shape: {}", e)))
        }
        "Partial" => partial_node(shape_at(&mut args, 0, any_spec()))
            .map_err(|e| ExprError(format!("Shape: {}", e))),
        "Extend" => {
            if args.is_empty() {
                return err("Extend: missing extension".to_string());
            }
            let extra = args.remove(0);
            let spec = shape_at(&mut args, 0, any_spec());
            extend_node(extra, spec).map_err(|e| ExprError(format!("Shape: {}", e)))
        }
        _ => err(format!(
            "Shape: {} is not available in the string form",
            name
        )),
    }
}

/// The structural comparison of the parts of a node a key expression's
/// example could have influenced: the kind, the required and skippable
/// flags, how many checks it carries, its default, and its child shapes. A
/// builder's own arguments are not compared, so `Exact()` with an example
/// reads as `Exact(example)`, just as `Exact()` does.
fn same_shape_node(x: &Node, y: &Node) -> bool {
    x.kind == y.kind
        && x.required == y.required
        && x.skippable == y.skippable
        && x.befores.len() == y.befores.len()
        && x.afters.len() == y.afters.len()
        && x.has_default == y.has_default
        && x.default == y.default
        && x.obj_children.len() == y.obj_children.len()
        && x.arr_children.len() == y.arr_children.len()
        && x.obj_rest.is_some() == y.obj_rest.is_some()
        && x.arr_child.is_some() == y.arr_child.is_some()
        && x.arr_rest.is_some() == y.arr_rest.is_some()
}

/// The node of a key expression: the expression applied to the example
/// value. The example is appended as the innermost builder call's final
/// argument, so a builder that takes a shape consumes it: `Child(Number)`
/// with `[]` becomes an array of numbers, `Min(2)` with `0` a bounded
/// number. A builder whose arity is already satisfied drops it, and the
/// example is the author's stated default, so where it made no difference
/// to the node it is applied as the value instead. A bad expression is a
/// node that accepts nothing and says why.
pub(crate) fn key_expr_node(src: &str, example: Spec) -> Node {
    let bare = expr(src);
    let or_fault = |r: Result<Node, ExprError>| r.unwrap_or_else(|e| fault_node(e.0));
    if matches!(example, Spec::Value(Value::Null)) {
        return or_fault(bare);
    }
    let ex = normalize(example.clone());
    let Ok(mut node) = expr_apply(src, example.clone()) else {
        // Not a builder chain at all, a bare literal such as `a: 5`, so
        // there is nothing to hand the example to and the expression's own
        // value stands.
        return or_fault(bare);
    };
    let takes_example = match &bare {
        // The expression cannot be built without the example. Where the
        // example became the shape it plainly made a difference; where a
        // value-taking builder read it as its argument, the bare build
        // looks the same, so the example is the default too.
        Err(_) => ex.kind != node.kind,
        Ok(bare) => same_shape_node(&node, bare),
    };
    if takes_example {
        if let Spec::Value(v) = example {
            node.has_default = true;
            node.default = v.clone();
            node.literal = Some(v);
        }
    }
    node
}

/// The rule of a key expression: a name (quoted, or without spaces), a
/// colon, and the expression. An empty expression is a literal key.
pub(crate) fn split_key_expr(key: &str) -> Option<(String, String)> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re =
        RE.get_or_init(|| Regex::new(r#"^\s*("(?:\\.|[^"\\])*"|[^\s]+):\s*(.*?)\s*$"#).unwrap());
    let m = re.captures(key)?;
    let src = m.get(2).unwrap().as_str();
    if src.is_empty() {
        return None;
    }
    let mut name = m.get(1).unwrap().as_str().to_string();
    if name.len() >= 2 && name.starts_with('"') && name.ends_with('"') {
        // A quoted name decodes its escapes: "a\"b" declares a"b.
        name = serde_json::from_str::<String>(&name)
            .unwrap_or_else(|_| name[1..name.len() - 1].to_string());
    }
    Some((name, src.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spec::{arr, obj};
    use crate::stringify::stringify_node;
    use crate::Schema;

    fn render(src: &str) -> String {
        stringify_node(
            &expr(src).unwrap_or_else(|e| panic!("{}: {}", src, e)),
            false,
        )
    }

    fn fails(src: &str) -> String {
        expr(src).unwrap_err().0
    }

    #[test]
    fn a_wrong_builder_argument_is_a_parse_error() {
        assert_eq!(fails("String.Min(\"x\")"), "Shape: Min needs a number");
        assert_eq!(
            fails("Len(-1)"),
            "Shape: Len needs a whole number of zero or more"
        );
        assert_eq!(fails("Open(Define(\"\"))"), "Shape: Define needs a name");
        assert_eq!(fails("Min(Number)"), "Shape: Min needs a number");
        // A deliberate fault is not a wrong argument.
        assert!(expr("Never.Fault(\"f\")").is_ok());
        assert!(expr("Fault(\"f\", Never)").is_ok());
    }

    #[test]
    fn parses_terms_chains_and_arguments() {
        let cases = [
            ("String.Min(2).Max(10)", "String.Min(2).Max(10)"),
            ("Min(2, Number)", "Number.Min(2)"),
            ("Number Min(2)", "Number.Min(2)"),
            ("Min(2).Number", "Number.Min(2)"),
            ("String.Array(1)", "[]"),
            ("5", "5"),
            ("\"x\"", "\"x\""),
            ("null", "null"),
            ("undefined", "null"),
            ("null(1)", "null"),
            ("NaN", "NaN"),
            ("NaN(1)", "NaN"),
            ("/^a/", "/^a/"),
            ("Check(/^a/)", "Check.Check(/^a/)"),
            ("Check(/^a/, String)", "String.Check(/^a/)"),
            ("Check(1)", "Any"),
            ("One(String, 1, NaN, /x/)", "One(String,1,NaN,/x/)"),
            ("Some(Number)", "Some(Number)"),
            ("All(Number)", "All(Number)"),
            ("Optional(Number)", "0"),
            ("Required()", "Any"),
            ("Required(null)", "null"),
            ("Open", "{}.Open()"),
            ("Open(Number)", "Number"),
            ("Closed", "Any"),
            ("Child(Number)", "{}.Child(Number)"),
            ("Rest(Number)", "[...Number]"),
            ("Rest(Number, [1])", "[1, ...Number]"),
            ("Type(Number)", "Number"),
            ("Type(\"String\")", "String"),
            ("Type(Min(2))", "Any"),
            ("Type(1)", "Any"),
            ("Exact(1, \"a\", null)", "Exact(1, a, null)"),
            ("Len(2)", "Len(2)"),
            ("Key(1, \"/\")", "String.Key()"),
            ("Key(Number)", "String.Key()"),
            ("Default(7)", "7"),
            ("Default(7, Number)", "7"),
            ("Default(null, Number)", "null"),
            ("Catch(0, Number)", "Number.Catch(0)"),
            ("Describe(\"d\", Number)", "Number"),
            ("Fault(\"f\")", "Any"),
            ("Email", "String.Email"),
            ("Url", "String.Url"),
            ("Uuid", "String.Uuid"),
            ("DateTime", "String.DateTime"),
            ("Ip", "String.Ip"),
            ("Ipv4", "String.Ipv4"),
            ("Ipv6", "String.Ipv6"),
            ("Coerce(Number)", "Number"),
            ("Nullable(Number)", "Number"),
            ("Never", "Never"),
            ("Func", "Function"),
            ("Empty", "Any"),
            ("Ignore(Number)", "0"),
            ("Skip(Number)", "0"),
            ("Define(\"d\")", "Define(\"d\")"),
            ("Refer(\"d\")", "Refer(\"d\")"),
            ("Rename(\"b\")", "Any"),
            ("Min(\"2\")", "Min(2)"),
            ("Above(1).Below(3)", "Above(1).Below(3)"),
            ("Max(3, Integer)", "Integer.Max(3)"),
            ("Object", "{}"),
            ("Array", "[]"),
            ("Any", "Any"),
            ("Date", "Date"),
            ("BigInt", "BigInt"),
            ("Boolean", "Boolean"),
            ("Function", "Function"),
            ("String(Min(2))", "String.Min(2)"),
            ("Min(2).", "Min(2)"),
            ("One(Number.Min(2), String)", "One(Number.Min(2),String)"),
            ("Optional(Min(2).Number)", "0.Min(2)"),
            ("Optional(Number)", "0"),
            ("Min(2, /^a/)", "/^a/.Min(2)"),
        ];
        for (src, want) in cases {
            assert_eq!(render(src), want, "{}", src);
        }
        // A fractional length is truncated, as a call sees it; the string
        // form cannot write one, since a dot chains.
        assert_eq!(
            stringify_node(
                &call_builder("Len", vec![Spec::Value(Value::Num(2.7))]).unwrap(),
                false
            ),
            "Len(2)"
        );
        // Type from a token, as a builder call sees it.
        assert_eq!(
            stringify_node(
                &call_builder("Type", vec![Spec::Token(Token::Number)]).unwrap(),
                false
            ),
            "Number"
        );
        let s = Schema::parse("Min(2).Array").unwrap();
        assert!(s.valid(&Value::Arr(vec![Value::from(1), Value::from(2)])));
        assert!(!s.valid(&Value::Arr(vec![Value::from(1)])));
        assert!(Schema::parse("bogus").is_err());
        assert_eq!(
            stringify_node(&expr_apply(".Min(2)", Spec::from(1)).unwrap(), false),
            "1.Min(2)"
        );
        assert_eq!(
            stringify_node(
                &expr_apply("Open", obj([("a", Spec::from(1))])).unwrap(),
                false
            ),
            "{a: 1}.Open()"
        );
        assert!(expr_apply("bogus", Spec::from(1)).is_err());
        assert_eq!(format!("{}", ExprError("x".into())), "x");
    }

    #[test]
    fn rejects_what_it_cannot_read() {
        let cases = [
            ("", "Shape: empty expression"),
            ("  ", "Shape: empty expression"),
            (
                ",,a",
                "Shape: unexpected character at offset 0 in expression \",,a\"",
            ),
            (",", "Shape: unexpected trailing text in expression \",\""),
            ("(", "Shape: unexpected token ( in builder expression ("),
            (")", "Shape: unexpected token ) in builder expression )"),
            (".", "Shape: unexpected token . in builder expression ."),
            (
                "bogus",
                "Shape: unexpected token bogus in builder expression bogus",
            ),
            (
                "Min(2).bogus",
                "Shape: unexpected token bogus in builder expression Min(2).bogus",
            ),
            (
                "Min(2) )",
                "Shape: unexpected token ) in builder expression Min(2) )",
            ),
            (
                "Min(()",
                "Shape: unexpected token ( in builder expression Min(()",
            ),
            (
                "Min(2",
                "Shape: unclosed argument list in expression \"Min(2\"",
            ),
            (
                "Min(",
                "Shape: unclosed argument list in expression \"Min(\"",
            ),
            ("/a/i", "Shape: invalid regexp /a/: flags are not supported"),
            ("Min()", "Min: missing limit"),
            ("Max()", "Max: missing limit"),
            ("Above()", "Above: missing limit"),
            ("Below()", "Below: missing limit"),
            ("Len()", "Len: missing length"),
            ("Len(\"x\")", "Len: length must be integer"),
            ("Default()", "Default: missing default value"),
            ("Default(Number)", "Default: default value must be a value"),
            ("Catch()", "Catch: missing fallback value"),
            ("Catch(Number)", "Catch: fallback value must be a value"),
            ("Describe()", "Describe: missing description"),
            ("Describe(1)", "Describe: description must be a string"),
            ("Fault()", "Fault: missing message"),
            ("Fault(1)", "Fault: message must be a string"),
            ("Type()", "Type: missing kind"),
            ("Exact(Number)", "Exact: values expected"),
            ("Check()", "Check: missing checker"),
            ("Child()", "Child: missing child shape"),
            ("Rest()", "Rest: missing child shape"),
            ("Define()", "Define: missing name"),
            ("Define(1)", "Define: name must be a string"),
            ("Refer()", "Refer: missing name"),
            ("Rename()", "Rename: missing name"),
            ("Pick([\"a\"])", "Shape: Pick needs an object shape"),
            ("Pick()", "Pick: missing property names"),
            ("Omit(1)", "Shape: Omit needs a list of property names"),
            ("Omit(Number)", "Shape: Omit needs a list of property names"),
            ("Partial", "Shape: Partial needs an object shape"),
            ("Extend()", "Extend: missing extension"),
            (
                "Extend(Number, Number)",
                "Shape: Extend needs an object shape",
            ),
            (
                "Transform",
                "Shape: Transform is not available in the string form",
            ),
        ];
        for (src, want) in cases {
            assert_eq!(fails(src), want, "{}", src);
        }
        assert_eq!(
            fails("/[/"),
            "Shape: invalid regexp /[/: unterminated character class"
        );
        assert_eq!(
            fails("Min(2, /[/)"),
            "Shape: invalid regexp /[/: unterminated character class"
        );
    }

    #[test]
    fn key_expressions_take_the_example() {
        let s = |src: &str, ex: Spec| stringify_node(&key_expr_node(src, ex), false);
        // A null example leaves the expression alone.
        assert_eq!(s("Min(2)", Spec::Value(Value::Null)), "Min(2)");
        // A bare literal has no builder to hand the example to.
        assert_eq!(s("5", Spec::from(3)), "5");
        // A value-taking builder reads the example as its argument, and it
        // is the default too.
        assert_eq!(s("Min()", Spec::from(3)), "Any(3).Min(3)");
        // An expression that cannot be built either way is a fault.
        assert_eq!(s("bogus()", Spec::from(3)), "Never");
        // The example became the shape: no default.
        assert_eq!(
            s("Child()", arr([Spec::from(Token::Number)])),
            "{}.Child([Number])"
        );
        // A shape-taking builder consumes it.
        assert_eq!(s("Child(Number)", arr::<Spec>([])), "[Number]");
        // Arity already satisfied: the example is the value.
        assert_eq!(s("Optional(Number)", Spec::from(5)), "5");
        assert_eq!(s("Any", Spec::from(5)), "Any(5)");
        assert_eq!(
            split_key_expr("\"a\\\"b\": Min(1)"),
            Some(("a\"b".into(), "Min(1)".into()))
        );
        assert_eq!(
            split_key_expr("\"a\\q\": Min(1)"),
            Some(("a\\q".into(), "Min(1)".into()))
        );
        assert_eq!(split_key_expr("a:"), None);
        assert_eq!(split_key_expr("a b: Min(1)"), None);
        assert_eq!(
            split_key_expr("a: Min(1) "),
            Some(("a".into(), "Min(1)".into()))
        );
    }
}

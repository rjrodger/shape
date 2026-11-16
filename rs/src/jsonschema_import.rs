//! JSON Schema import (draft 2020-12, and the common keywords of earlier
//! drafts), the inverse of the export: a type becomes a token, bounds become
//! size builders, formats and patterns their builders, enum and const become
//! Exact, properties and items become objects and arrays, the compositions
//! become All, Nof and Discriminated (anyOf a count of at least one, oneOf
//! of exactly one, not of none), and a definition is inlined where it is referenced,
//! with Define and Refer only where a definition refers to
//! itself. Every keyword of a schema applies, each a part of an All; a
//! schema with no type checks each kind of value with that kind's keywords.
//! A property that is not required and has no default is Skip. Unknown
//! keywords are ignored, unless the import is strict; an unknown type or
//! reference is an error.

use crate::builders::*;
use crate::discriminated::Discriminated;
use crate::jsonschema::{kind_keywords, kind_of_type};
use crate::node::{Kind, Node, Token};
use crate::spec::Spec;
use crate::value::{Map, Value};
use crate::Schema;
use regex::Regex;
use std::collections::HashMap;
use std::fmt;
use std::sync::OnceLock;

/// A document that does not import.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JsonSchemaError(pub String);

impl fmt::Display for JsonSchemaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for JsonSchemaError {}

type Res<T> = Result<T, JsonSchemaError>;

fn fault<T>(msg: impl Into<String>, path: &str) -> Res<T> {
    let at = if path.is_empty() { "/" } else { path };
    Err(JsonSchemaError(format!(
        "JSON Schema: {} at {}",
        msg.into(),
        at
    )))
}

/// How a JSON Schema document is read.
#[derive(Clone, Debug, Default)]
pub struct JsonSchemaImportOptions {
    /// Refuse a keyword the import would pass over: one it recognises but
    /// does not enforce.
    pub strict: bool,
}

/// Keywords the import recognises but does not enforce. It passes over
/// them, as it does a keyword it does not know, unless it is strict.
const UNSUPPORTED: [&str; 7] = [
    "$dynamicRef",
    "$recursiveRef",
    "multipleOf",
    "patternProperties",
    "propertyNames",
    "unevaluatedItems",
    "unevaluatedProperties",
];

/// Build a spec from a JSON Schema document, an object or a boolean.
/// Compile it with `Schema::new`, or compose it further with the builders.
pub fn from_json_schema(schema: &Value) -> Res<Spec> {
    from_json_schema_with(schema, &JsonSchemaImportOptions::default())
}

/// `from_json_schema`, read as the options say.
pub fn from_json_schema_with(schema: &Value, opts: &JsonSchemaImportOptions) -> Res<Spec> {
    let empty = Map::new();
    let root = match schema {
        Value::Obj(m) => m,
        Value::Bool(_) => &empty,
        _ => {
            return Err(JsonSchemaError(
                "JSON Schema: the schema must be an object or boolean".to_string(),
            ))
        }
    };
    let defs = match root
        .get("$defs")
        .filter(|d| truthy(d))
        .or_else(|| root.get("definitions"))
    {
        Some(Value::Obj(d)) => d.clone(),
        _ => Map::new(),
    };
    let mut c = Import {
        root: schema,
        defs,
        stack: Vec::new(),
        recursive: HashMap::new(),
        backrefs: 0,
        ref_alone: as_str(root.get("$schema")).is_some_and(|s| ref_alone_re().is_match(s)),
        strict: opts.strict,
    };
    c.schema(schema, "", None)
}

struct Import<'a> {
    root: &'a Value,
    defs: Map,
    stack: Vec<String>,
    recursive: HashMap<String, bool>,
    /// How many references back to a definition still being read the
    /// import has met.
    backrefs: usize,
    /// The document's draft makes a `$ref` stand for its whole schema.
    ref_alone: bool,
    strict: bool,
}

fn is_kind_name(name: &str) -> bool {
    matches!(
        name,
        "string" | "number" | "integer" | "boolean" | "null" | "object" | "array"
    )
}

/// A keyword's value, where it is there at all.
fn present<'m>(m: &'m Map, k: &str) -> Option<&'m Value> {
    m.get(k).filter(|v| !v.is_undefined())
}

/// Whether JavaScript reads the value as true.
fn truthy(v: &Value) -> bool {
    match v {
        Value::Undefined | Value::Null => false,
        Value::Bool(b) => *b,
        Value::Num(f) => *f != 0.0 && !f.is_nan(),
        Value::Str(s) => !s.is_empty(),
        _ => true,
    }
}

fn as_f64(v: Option<&Value>) -> Option<f64> {
    match v {
        Some(Value::Num(f)) => Some(*f),
        _ => None,
    }
}

fn as_bool(v: Option<&Value>) -> Option<bool> {
    match v {
        Some(Value::Bool(b)) => Some(*b),
        _ => None,
    }
}

fn as_str(v: Option<&Value>) -> Option<&str> {
    match v {
        Some(Value::Str(s)) => Some(s.as_str()),
        _ => None,
    }
}

fn empty_object(v: Option<&Value>) -> bool {
    matches!(v, Some(Value::Obj(m)) if m.is_empty())
}

/// The export's rendering of Ip: an anyOf of the two address formats.
fn is_ip_formats(v: Option<&Value>) -> bool {
    let Some(Value::Arr(any_of)) = v else {
        return false;
    };
    if any_of.len() != 2 {
        return false;
    }
    let only = |i: usize, f: &str| match &any_of[i] {
        Value::Obj(m) => m.len() == 1 && as_str(m.get("format")) == Some(f),
        _ => false,
    };
    only(0, "ipv4") && only(1, "ipv6")
}

/// Whether a spec is the Any of a schema that says nothing.
fn is_bare_any(spec: &Spec) -> bool {
    match spec {
        Spec::Token(t) => *t == Token::Any,
        Spec::Node(n) => n.kind == Kind::Any && n.befores.is_empty() && n.afters.is_empty(),
        _ => false,
    }
}

/// The one kind of value a schema's type lets through, if it names one.
fn type_kind(m: &Map) -> Option<&'static str> {
    let t = match m.get("type")? {
        Value::Arr(list) if list.len() == 1 => &list[0],
        t => t,
    };
    t.as_str().and_then(kind_of_type)
}

/// The values of an enum or a const as Exact, or Never when there are none.
fn exact_of(vals: Vec<Value>) -> Spec {
    if vals.is_empty() {
        Spec::from(Never(Any()))
    } else {
        Spec::from(Exact(vals))
    }
}

fn ref_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^#/(\$defs|definitions)/([^/]+)$").unwrap())
}

/// The drafts in which a `$ref` stands for the whole schema it sits in, so
/// the keywords beside it are ignored. From 2019-09 on, a `$ref` is one
/// keyword among the others.
fn ref_alone_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^https?://json-schema\.org/draft-0[3-7]/schema#?$").unwrap())
}

/// The percent-decoding of a reference name.
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = &s[i + 1..i + 3];
            if let Ok(b) = u8::from_str_radix(hex, 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| s.to_string())
}

impl<'a> Import<'a> {
    /// A schema, given the one kind of value the enclosing schema lets
    /// through to it, where it lets through one (see `kind_split`).
    fn schema(&mut self, s: &Value, path: &str, kind: Option<&'static str>) -> Res<Spec> {
        let m = match s {
            Value::Bool(true) => return Ok(Spec::from(Token::Any)),
            Value::Bool(false) => return Ok(Spec::from(Never(Any()))),
            Value::Obj(m) => m,
            _ => return fault("a schema must be an object or boolean", path),
        };
        let spec = match as_str(m.get("$ref")).filter(|_| self.ref_alone) {
            Some(r) => self.reference(r, path)?,
            None => self.keywords(m, path, kind)?,
        };
        Ok(match as_str(m.get("description")) {
            Some(d) => Spec::from(Describe(d, spec)),
            None => spec,
        })
    }

    /// A definition is inlined at each reference, so validation order
    /// cannot matter; a definition that refers to itself is defined at its
    /// outermost expansion and referred to within.
    fn reference(&mut self, r: &str, path: &str) -> Res<Spec> {
        let (name, def): (String, Value) = if let Some(m) = ref_re().captures(r) {
            let name = percent_decode(m.get(2).unwrap().as_str());
            match self.defs.get(&name) {
                Some(d) => (name, d.clone()),
                None => return fault(format!("unknown $ref {:?}", r), path),
            }
        } else if r == "#" {
            (String::new(), self.root.clone())
        } else {
            return fault(format!("unsupported $ref {:?}", r), path);
        };
        let refname = if name.is_empty() {
            "$root".to_string()
        } else {
            name.clone()
        };
        if self.stack.contains(&name) {
            self.recursive.insert(name, true);
            self.backrefs += 1;
            return Ok(Spec::from(Refer(refname, Any())));
        }
        self.stack.push(name.clone());
        let was = self.recursive.get(&name).copied().unwrap_or(false);
        self.recursive.insert(name.clone(), false);
        let spec = self.schema(&def, path, None);
        let recursive = self.recursive.get(&name).copied().unwrap_or(false);
        self.recursive.insert(name.clone(), was);
        self.stack.pop();
        let spec = spec?;
        Ok(if recursive {
            Spec::from(Define(refname, spec))
        } else {
            spec
        })
    }

    /// Every keyword applies, each a part of All. Not comes first, so that
    /// it sees the value as given. An enum or a const keeps only the values
    /// the other parts allow, and so stays one Exact, with Exact's message.
    fn keywords(&mut self, m: &Map, path: &str, kind: Option<&'static str>) -> Res<Spec> {
        if self.strict {
            let refused = UNSUPPORTED.iter().find(|k| present(m, k).is_some());
            if let Some(k) = refused {
                return fault(format!("unsupported keyword \"{}\"", k), path);
            }
        }

        // not: {} admits nothing, whatever else the schema says.
        let spec = if empty_object(m.get("not")) {
            Spec::from(Never(Any()))
        } else {
            // The subschemas of not, allOf, anyOf and oneOf see the same
            // value, so they need only meet the one kind this schema lets
            // through, if it has one.
            let inner = type_kind(m).or(kind);
            let backrefs = self.backrefs;
            let mut parts: Vec<Spec> = Vec::new();
            if let Some(not) = present(m, "not") {
                let none = self.schema(not, &format!("{}/not", path), inner)?;
                parts.push(Spec::from(Nof(0, [none])));
            }
            // A condition sees the value as given, before a part fills it
            // in. An if with neither then nor else asserts nothing.
            if let Some(cond) = present(m, "if") {
                if present(m, "then").is_some() || present(m, "else").is_some() {
                    let cond = self.schema(cond, &format!("{}/if", path), inner)?;
                    let then = self.arm(m, "then", path, inner)?;
                    let otherwise = self.arm(m, "else", path, inner)?;
                    parts.push(Spec::from(When(cond, then, otherwise)));
                }
            }
            parts.extend(self.dependents(m, path)?);
            if let Some(r) = as_str(m.get("$ref")) {
                parts.push(self.reference(r, path)?);
            }
            let typed = self.typed(m, path, kind)?;
            if !is_bare_any(&typed) {
                parts.push(typed);
            }
            if let Some(all_of) = present(m, "allOf") {
                let sub = format!("{}/allOf", path);
                parts.push(Spec::from(All(self.branches(all_of, &sub, inner)?)));
            }
            if let Some(any_of) = present(m, "anyOf").filter(|v| !is_ip_formats(Some(v))) {
                let sub = format!("{}/anyOf", path);
                let shapes = self.branches(any_of, &sub, inner)?;
                parts.push(Spec::from(Nof(Min(1, Any()), shapes)));
            }
            if let Some(one_of) = present(m, "oneOf") {
                let sub = format!("{}/oneOf", path);
                let list = branch_list(one_of, &sub)?;
                parts.push(match self.discriminated(list, &sub)? {
                    Some(d) => d,
                    None => Spec::from(Nof(1, self.branches(one_of, &sub, inner)?)),
                });
            }

            if present(m, "enum").is_some() || present(m, "const").is_some() {
                self.exact(m, parts, backrefs < self.backrefs, path)?
            } else if parts.len() > 1 {
                Spec::from(All(parts))
            } else {
                parts.pop().unwrap_or(Spec::Token(Token::Any))
            }
        };

        Ok(match present(m, "default") {
            Some(d) => Spec::from(Default(d.clone(), spec)),
            None => spec,
        })
    }

    /// An enum or a const, less the values the other parts refuse. A part
    /// that refers back to a definition still being read cannot be tried
    /// yet, so the parts then stay beside the Exact.
    fn exact(&mut self, m: &Map, mut parts: Vec<Spec>, backref: bool, path: &str) -> Res<Spec> {
        let konst = present(m, "const");
        // Enum and const compare as JSON values do, which is equality here.
        let mut vals: Vec<Value> = match present(m, "enum") {
            Some(Value::Arr(list)) => list
                .iter()
                .filter(|v| konst.map_or(true, |c| *v == c))
                .cloned()
                .collect(),
            Some(_) => return fault("enum must be an array", path),
            None => konst.into_iter().cloned().collect(),
        };
        if backref {
            parts.insert(0, exact_of(vals));
            return Ok(Spec::from(All(parts)));
        }
        if !parts.is_empty() {
            let rest = Schema::new(if parts.len() == 1 {
                parts.remove(0)
            } else {
                Spec::from(All(parts))
            });
            vals.retain(|v| rest.matches(v));
        }
        Ok(exact_of(vals))
    }

    /// The then or else of an if; one not given passes.
    fn arm(&mut self, m: &Map, k: &str, path: &str, kind: Option<&'static str>) -> Res<Spec> {
        match present(m, k) {
            Some(s) => self.schema(s, &format!("{}/{}", path, k), kind),
            None => Ok(Spec::from(Any())),
        }
    }

    /// Each entry of a dependent keyword is a When on its key being
    /// present: the object must then hold the names dependentRequired
    /// lists, or satisfy the schema dependentSchemas gives, which can only
    /// meet an object. Draft 7's dependencies holds either form, and is
    /// read where neither of the two that replaced it is written.
    fn dependents(&mut self, m: &Map, path: &str) -> Res<Vec<Spec>> {
        let legacy =
            present(m, "dependentRequired").is_none() && present(m, "dependentSchemas").is_none();
        let mut out = Vec::new();
        for kw in ["dependentRequired", "dependentSchemas", "dependencies"] {
            let Some(v) = present(m, kw).filter(|_| kw != "dependencies" || legacy) else {
                continue;
            };
            let Value::Obj(entries) = v else {
                return fault(
                    format!("{} must be an object", kw),
                    &format!("{}/{}", path, kw),
                );
            };
            for (k, dv) in entries {
                let at = format!("{}/{}/{}", path, kw, k);
                let names = match kw {
                    "dependentRequired" => true,
                    "dependentSchemas" => false,
                    _ => matches!(dv, Value::Arr(_)),
                };
                if names {
                    let list = dependency_names(dv, &at)?;
                    if !list.is_empty() {
                        out.push(Spec::from(When(holds(&[k]), holds(&list), Any())));
                    }
                } else {
                    let then = self.schema(dv, &at, Some("object"))?;
                    out.push(Spec::from(When(holds(&[k]), then, Any())));
                }
            }
        }
        Ok(out)
    }

    fn branches(&mut self, v: &Value, path: &str, kind: Option<&'static str>) -> Res<Vec<Spec>> {
        let list = branch_list(v, path)?;
        let mut out = Vec::with_capacity(list.len());
        for (i, b) in list.iter().enumerate() {
            out.push(self.schema(b, &format!("{}/{}", path, i), kind)?);
        }
        Ok(out)
    }

    fn typed(&mut self, m: &Map, path: &str, kind: Option<&'static str>) -> Res<Spec> {
        let given: Vec<&Value> = match present(m, "type") {
            Some(Value::Arr(list)) => list.iter().collect(),
            Some(t) => vec![t],
            None => Vec::new(),
        };
        let mut types: Vec<&str> = Vec::with_capacity(given.len());
        for t in given {
            match t {
                Value::Str(name) if is_kind_name(name) => {
                    if !types.contains(&name.as_str()) {
                        types.push(name);
                    }
                }
                other => {
                    return fault(
                        format!("unknown type {:?}", crate::stringify::inline_value(other)),
                        path,
                    )
                }
            }
        }

        // Null beside another type is Nullable, and a number covers an
        // integer.
        let nullable = types.len() > 1 && types.contains(&"null");
        let number = types.contains(&"number");
        types.retain(|t| !(nullable && *t == "null") && !(number && *t == "integer"));

        if types.is_empty() {
            return self.kind_split(m, path, kind);
        }

        // The types are of different kinds, so the value's kind chooses
        // among them (see Nof).
        let spec = if types.len() == 1 {
            self.kind(types[0], m, path)?
        } else {
            let mut shapes = Vec::with_capacity(types.len());
            for t in &types {
                shapes.push(self.kind(t, m, path)?);
            }
            Spec::from(Nof(1, shapes))
        };
        Ok(if nullable {
            Spec::from(Nullable(spec))
        } else {
            spec
        })
    }

    fn kind(&mut self, t: &str, m: &Map, path: &str) -> Res<Spec> {
        Ok(match t {
            "string" => import_string(m, path)?,
            "number" => import_number(Spec::from(Token::Number), m),
            "integer" => import_number(Spec::from(Token::Integer), m),
            "boolean" => Spec::from(Token::Boolean),
            "null" => Spec::from(Required(crate::spec::null())),
            "object" => self.object(m, path)?,
            _ => self.array(m, path)?,
        })
    }

    /// A schema without a type checks each kind of value with the keywords
    /// of that kind, and lets every other kind through: `{ minLength: 2 }`
    /// fails "a" and passes 1. Where the enclosing schema lets one kind
    /// through, only that kind's keywords can apply.
    fn kind_split(&mut self, m: &Map, path: &str, kind: Option<&'static str>) -> Res<Spec> {
        let has = |k: &str| {
            kind.map_or(true, |kind| kind == k)
                && (kind_keywords(k).iter().any(|w| present(m, w).is_some())
                    || (k == "string" && is_ip_formats(m.get("anyOf"))))
        };
        if !["number", "string", "object", "array"]
            .iter()
            .any(|k| has(k))
        {
            return Ok(Spec::from(Token::Any));
        }
        if let Some(kind) = kind {
            return match kind {
                "number" => Ok(import_number(Spec::from(Token::Number), m)),
                "string" => import_string(m, path),
                "object" => self.object(m, path),
                _ => self.array(m, path),
            };
        }
        // A shape for each kind of JSON value: the value's kind chooses
        // (see Nof).
        let number = if has("number") {
            import_number(Spec::from(Token::Number), m)
        } else {
            Spec::from(Token::Number)
        };
        let string = if has("string") {
            import_string(m, path)?
        } else {
            Spec::from(Empty(Token::String))
        };
        let object = if has("object") {
            self.object(m, path)?
        } else {
            Spec::from(Open(Spec::Obj(Vec::new())))
        };
        let array = if has("array") {
            self.array(m, path)?
        } else {
            Spec::Arr(Vec::new())
        };
        Ok(Spec::from(Nof(
            1,
            [
                Spec::from(Required(crate::spec::null())),
                Spec::from(Token::Boolean),
                number,
                string,
                object,
                array,
            ],
        )))
    }

    fn object(&mut self, m: &Map, path: &str) -> Res<Spec> {
        let props: Map = match present(m, "properties") {
            Some(Value::Obj(p)) => p.clone(),
            Some(_) => {
                return fault(
                    "properties must be an object",
                    &format!("{}/properties", path),
                )
            }
            None => Map::new(),
        };
        let required: Vec<String> = match m.get("required") {
            Some(Value::Arr(list)) => list
                .iter()
                .filter_map(|r| as_str(Some(r)).map(String::from))
                .collect(),
            _ => Vec::new(),
        };
        let mut obj: Vec<(String, Spec)> = Vec::with_capacity(props.len());
        for (k, ps) in &props {
            let spec = self.property(
                ps,
                required.contains(k),
                &format!("{}/properties/{}", path, k),
            )?;
            obj.push((k.clone(), spec));
        }
        // A required name with no property schema must still be present.
        for k in &required {
            if !props.contains_key(k) {
                obj.push((k.clone(), Spec::from(Required(Any()))));
            }
        }
        let ap = m.get("additionalProperties");
        let spec = match ap {
            Some(Value::Bool(false)) => {
                if obj.is_empty() {
                    Spec::from(Closed(Spec::Obj(obj)))
                } else {
                    Spec::Obj(obj)
                }
            }
            None | Some(Value::Bool(true)) => Spec::from(Open(Spec::Obj(obj))),
            Some(other) => {
                let c = self.schema(other, &format!("{}/additionalProperties", path), None)?;
                Spec::from(Child(c, Spec::Obj(obj)))
            }
        };
        Ok(bounded(spec, m, "minProperties", "maxProperties"))
    }

    /// A property is required when listed, has its default when given, and
    /// is otherwise Skip: absent stays absent.
    fn property(&mut self, ps: &Value, is_required: bool, path: &str) -> Res<Spec> {
        let spec = self.schema(ps, path, None)?;
        if let Value::Obj(m) = ps {
            if present(m, "default").is_some() {
                return Ok(spec);
            }
        }
        Ok(Spec::from(if is_required {
            Required(spec)
        } else {
            Skip(spec)
        }))
    }

    fn array(&mut self, m: &Map, path: &str) -> Res<Spec> {
        let items = m.get("items");
        let spec = if let Some(prefix) = present(m, "prefixItems") {
            let sub = format!("{}/prefixItems", path);
            let Value::Arr(list) = prefix else {
                return fault("prefixItems must be an array", &sub);
            };
            // Closed makes a one-element list a tuple rather than an element
            // shape; items says what may follow (anything, when it is
            // absent or true). A position may be absent, but for one
            // before a position with a default to fill in: an array has no
            // holes.
            let filled = |e: &Value| e.as_obj().is_some_and(|m| present(m, "default").is_some());
            let last = list.iter().rposition(filled);
            let mut elems = Vec::with_capacity(list.len());
            for (i, e) in list.iter().enumerate() {
                let spec = self.schema(e, &format!("{}/{}", sub, i), None)?;
                elems.push(if filled(e) {
                    spec
                } else if last.is_some_and(|l| i < l) {
                    Spec::from(Required(spec))
                } else {
                    Spec::from(Skip(spec))
                });
            }
            let tuple = Closed(Spec::Arr(elems));
            match items {
                Some(Value::Bool(false)) => Spec::from(tuple),
                None | Some(Value::Bool(true)) => Spec::from(Rest(Token::Any, tuple)),
                Some(other) => {
                    let r = self.schema(other, &format!("{}/items", path), None)?;
                    Spec::from(Rest(r, tuple))
                }
            }
        } else {
            match items {
                None | Some(Value::Bool(true)) => Spec::Arr(Vec::new()),
                Some(other) => {
                    let elem = self.schema(other, &format!("{}/items", path), None)?;
                    Spec::Arr(vec![elem])
                }
            }
        };
        let mut spec = bounded(spec, m, "minItems", "maxItems");

        // contains counts the items its schema admits, at least one unless
        // minContains says otherwise; a count of at least none asserts
        // nothing.
        if let Some(contains) = present(m, "contains") {
            let lo = as_f64(m.get("minContains")).unwrap_or(1.0);
            let hi = as_f64(m.get("maxContains"));
            if lo > 0.0 || hi.is_some() {
                let count = match hi {
                    Some(h) if h == lo => Spec::from(lo),
                    None => Spec::from(Min(lo, Any())),
                    Some(h) if lo == 0.0 => Spec::from(Max(h, Any())),
                    Some(h) => Spec::from(Max(h, Min(lo, Any()))),
                };
                let items = self.schema(contains, &format!("{}/contains", path), None)?;
                let counted = Contains(count, items, spec);
                // A count that is no whole number throws in TypeScript, so
                // the document does not import.
                if is_fault(&counted) {
                    return Err(JsonSchemaError(counted.fault_msg.unwrap_or_default()));
                }
                spec = Spec::from(counted);
            }
        }
        if m.get("uniqueItems") == Some(&Value::Bool(true)) {
            spec = Spec::from(Unique(spec));
        }
        Ok(spec)
    }

    /// A oneOf of objects that each require one property with a distinct
    /// string const is a discriminated union on that property.
    fn discriminated(&mut self, branches: &[Value], path: &str) -> Res<Option<Spec>> {
        if branches.is_empty() {
            return Ok(None);
        }
        let mut objs: Vec<&Map> = Vec::new();
        let mut props: Vec<&Map> = Vec::new();
        let mut reqs: Vec<Vec<String>> = Vec::new();
        for b in branches {
            let Value::Obj(m) = b else { return Ok(None) };
            let Some(Value::Obj(p)) = m.get("properties") else {
                return Ok(None);
            };
            let Some(Value::Arr(r)) = m.get("required") else {
                return Ok(None);
            };
            objs.push(m);
            props.push(p);
            reqs.push(
                r.iter()
                    .filter_map(|k| as_str(Some(k)).map(String::from))
                    .collect(),
            );
        }
        let const_of = |p: &Map, k: &str| -> Option<String> {
            match p.get(k) {
                Some(Value::Obj(pm)) => as_str(pm.get("const")).map(String::from),
                _ => None,
            }
        };
        // The tag is the first property, in name order, of the first branch
        // that every branch declares with a string const and the first
        // requires: name order, so every implementation picks the same one.
        let mut names: Vec<&String> = props[0].keys().collect();
        names.sort();
        let tag = names.into_iter().find(|k| {
            const_of(props[0], k).is_some()
                && reqs[0].contains(k)
                && props.iter().all(|p| const_of(p, k).is_some())
        });
        let Some(tag) = tag.cloned() else {
            return Ok(None);
        };
        let mut tags: Vec<String> = Vec::with_capacity(branches.len());
        for (i, p) in props.iter().enumerate() {
            let t = const_of(p, &tag).unwrap_or_default();
            if tags.contains(&t) || !reqs[i].contains(&tag) {
                return Ok(None);
            }
            tags.push(t);
        }
        let mut out: Vec<(String, Spec)> = Vec::with_capacity(branches.len());
        for (i, m) in objs.iter().enumerate() {
            let mut branch = (*m).clone();
            let rest_props: Map = props[i]
                .iter()
                .filter(|(k, _)| **k != tag)
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            let rest_required: Vec<Value> = reqs[i]
                .iter()
                .filter(|k| **k != tag)
                .map(|k| Value::Str(k.clone()))
                .collect();
            branch.insert("properties".to_string(), Value::Obj(rest_props));
            branch.insert("required".to_string(), Value::Arr(rest_required));
            let spec = self.object(&branch, &format!("{}/{}", path, i))?;
            out.push((tags[i].clone(), spec));
        }
        Ok(Some(Spec::from(Discriminated(tag, out))))
    }
}

/// An open object that holds each of the names.
fn holds(names: &[&String]) -> Node {
    Open(Spec::Obj(
        names
            .iter()
            .map(|k| (k.to_string(), Spec::from(Required(Any()))))
            .collect(),
    ))
}

/// The property names a dependency lists.
fn dependency_names<'v>(v: &'v Value, at: &str) -> Res<Vec<&'v String>> {
    let names: Option<Vec<&String>> = match v {
        Value::Arr(list) => list
            .iter()
            .map(|n| match n {
                Value::Str(s) => Some(s),
                _ => None,
            })
            .collect(),
        _ => None,
    };
    match names {
        Some(names) => Ok(names),
        None => fault("a dependency must be an array of property names", at),
    }
}

fn branch_list<'v>(v: &'v Value, path: &str) -> Res<&'v [Value]> {
    match v {
        Value::Arr(list) => Ok(list),
        _ => {
            let word = path.rsplit('/').next().unwrap_or("");
            fault(format!("{} must be an array", word), path)
        }
    }
}

fn format_builder(format: &str) -> Option<fn(Spec) -> Node> {
    Some(match format {
        "email" => |s| Email(s),
        "uri" => |s| Url(s),
        "uuid" => |s| Uuid(s),
        "date-time" => |s| DateTime(s),
        "ipv4" => |s| Ipv4(s),
        "ipv6" => |s| Ipv6(s),
        _ => return None,
    })
}

fn import_string(m: &Map, path: &str) -> Res<Spec> {
    let mut spec = Spec::from(Token::String);
    let mut plain = true;
    if let Some(p) = as_str(m.get("pattern")) {
        if crate::regexp::canonical_regexp(p).is_err() {
            return fault(format!("bad pattern {:?}", p), path);
        }
        spec = Spec::Regexp(p.to_string());
        plain = false;
    }
    let min_length = as_f64(m.get("minLength"));
    let format = as_str(m.get("format")).unwrap_or("");
    if let Some(b) = format_builder(format) {
        spec = Spec::from(b(spec));
    } else if is_ip_formats(m.get("anyOf")) {
        spec = Spec::from(Ip(spec));
    } else if plain && !min_length.map(|v| v > 0.0).unwrap_or(false) {
        // A string with no lower bound is allowed to be empty; a pattern or
        // format decides for itself.
        spec = Spec::from(Empty(spec));
    }
    if let Some(v) = min_length.filter(|v| *v > 1.0) {
        spec = Spec::from(Min(v, spec));
    }
    if let Some(v) = as_f64(m.get("maxLength")) {
        spec = Spec::from(Max(v, spec));
    }
    Ok(spec)
}

/// The bounds of a number on its spec.
fn import_number(spec: Spec, m: &Map) -> Spec {
    let mut spec = spec;
    // A numeric exclusive bound (draft 6 and later) and a plain bound are
    // independent keywords, so both apply; the boolean form (draft 4) makes
    // the plain bound exclusive instead.
    if let Some(v) = as_f64(m.get("exclusiveMinimum")) {
        spec = Spec::from(Above(v, spec));
    }
    if let Some(v) = as_f64(m.get("minimum")) {
        spec = Spec::from(if as_bool(m.get("exclusiveMinimum")) == Some(true) {
            Above(v, spec)
        } else {
            Min(v, spec)
        });
    }
    if let Some(v) = as_f64(m.get("exclusiveMaximum")) {
        spec = Spec::from(Below(v, spec));
    }
    if let Some(v) = as_f64(m.get("maximum")) {
        spec = Spec::from(if as_bool(m.get("exclusiveMaximum")) == Some(true) {
            Below(v, spec)
        } else {
            Max(v, spec)
        });
    }
    spec
}

fn bounded(spec: Spec, m: &Map, lo: &str, hi: &str) -> Spec {
    let mut spec = spec;
    if let Some(v) = as_f64(m.get(lo)) {
        spec = Spec::from(Min(v, spec));
    }
    if let Some(v) = as_f64(m.get(hi)) {
        spec = Spec::from(Max(v, spec));
    }
    spec
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stringify::stringify_node;
    use serde_json::json;

    fn imp(schema: serde_json::Value) -> Result<Spec, JsonSchemaError> {
        from_json_schema(&Value::from(schema))
    }

    fn render(schema: serde_json::Value) -> String {
        stringify_node(&crate::builders::buildize(imp(schema).unwrap()), false)
    }

    fn fails(schema: serde_json::Value) -> String {
        imp(schema).unwrap_err().0
    }

    fn export(schema: serde_json::Value) -> serde_json::Value {
        let mut v = serde_json::Value::from(Schema::new(imp(schema).unwrap()).json_schema());
        v.as_object_mut().unwrap().remove("$schema");
        v
    }

    /// The import validates an input: the produced value as JSON text, or
    /// ERR and the message.
    fn v(schema: &serde_json::Value, input: Value) -> String {
        match Schema::new(imp(schema.clone()).unwrap()).validate(input) {
            Ok(out) => serde_json::Value::from(out).to_string(),
            Err(e) => format!("ERR {}", e),
        }
    }

    /// Each schema against its input, as the canonical build has it.
    fn holds(cases: &[(serde_json::Value, serde_json::Value, &str)]) {
        for (schema, input, want) in cases {
            assert_eq!(
                v(schema, Value::from(input.clone())),
                *want,
                "{} {}",
                schema,
                input
            );
        }
    }

    /// The kind split of a schema with no type: the shape of each kind.
    fn split(number: &str, string: &str, object: &str, array: &str) -> String {
        format!(
            "Nof(1,null,Boolean,{},{},{},{})",
            number, string, object, array
        )
    }

    #[test]
    fn imports_kinds_keywords_and_compositions() {
        assert_eq!(render(json!({"type": "string"})), "String");
        assert_eq!(
            render(json!({"type": "string", "minLength": 2, "maxLength": 5})),
            "String.Min(2).Max(5)"
        );
        assert_eq!(render(json!({"type": "string", "minLength": 1})), "String");
        assert_eq!(render(json!({"type": "string", "pattern": "^a"})), "/^a/");
        assert_eq!(
            render(json!({"type": "string", "format": "email"})),
            "String.Email"
        );
        assert_eq!(
            render(json!({"type": "string", "format": "uri"})),
            "String.Url"
        );
        assert_eq!(
            render(json!({"type": "string", "format": "uuid"})),
            "String.Uuid"
        );
        assert_eq!(
            render(json!({"type": "string", "format": "date-time"})),
            "String.DateTime"
        );
        assert_eq!(
            render(json!({"type": "string", "format": "ipv4"})),
            "String.Ipv4"
        );
        assert_eq!(
            render(json!({"type": "string", "format": "ipv6"})),
            "String.Ipv6"
        );
        assert_eq!(
            render(json!({"type": "string", "anyOf": [{"format": "ipv4"}, {"format": "ipv6"}]})),
            "String.Ip"
        );
        assert_eq!(
            render(json!({"type": "number", "minimum": 1, "maximum": 2})),
            "Number.Min(1).Max(2)"
        );
        assert_eq!(
            render(json!({"type": "integer", "exclusiveMinimum": 1, "exclusiveMaximum": 3})),
            "Integer.Above(1).Below(3)"
        );
        assert_eq!(
            render(
                json!({"type": "number", "minimum": 1, "exclusiveMinimum": true, "maximum": 3, "exclusiveMaximum": true})
            ),
            "Number.Above(1).Below(3)"
        );
        assert_eq!(render(json!({"type": "boolean"})), "Boolean");
        assert_eq!(render(json!({"type": "null"})), "null");
        assert_eq!(render(json!({"type": ["string", "null"]})), "String");
        assert!(
            crate::builders::buildize(imp(json!({"type": ["string", "null"]})).unwrap()).nullable
        );
        assert_eq!(
            render(json!({"type": ["string", "number"]})),
            "Nof(1,String,Number)"
        );
        assert_eq!(render(json!({"enum": ["a", 1]})), "Exact(a, 1)");
        assert_eq!(render(json!({"const": 1})), "Exact(1)");
        assert_eq!(
            render(json!({"allOf": [{"type": "number"}, {"minimum": 1}]})),
            format!(
                "All(Number,{})",
                split("Number.Min(1)", "String", "{}.Open()", "[]")
            )
        );
        assert_eq!(
            render(json!({"anyOf": [{"type": "string"}, {"type": "number"}]})),
            "Nof(Min(1),String,Number)"
        );
        // A oneOf is a count of exactly one; a not, a count of none that
        // holds beside the other keywords, ahead of them.
        assert_eq!(
            render(json!({"oneOf": [{"type": "string"}, {"type": "number"}]})),
            "Nof(1,String,Number)"
        );
        assert_eq!(render(json!({"not": {}})), "Never");
        assert_eq!(render(json!({"enum": ["a"], "not": {}})), "Never");
        assert_eq!(render(json!({"not": {"type": "string"}})), "Nof(0,String)");
        assert_eq!(render(json!({"not": true})), "Nof(0,Any)");
        assert_eq!(
            render(json!({"type": "string", "not": {"pattern": "^a"}})),
            "All(Nof(0,/^a/),String)"
        );
        assert_eq!(
            fails(json!({"not": 1})),
            "JSON Schema: a schema must be an object or boolean at /not"
        );
        assert_eq!(render(json!({})), "Any");
        // With no type, each kind's keywords check that kind of value.
        let open = || "{}.Open()";
        assert_eq!(
            render(json!({"minLength": 2})),
            split("Number", "String.Min(2)", open(), "[]")
        );
        assert_eq!(
            render(json!({"maximum": 2, "exclusiveMinimum": 1})),
            split("Number.Above(1).Max(2)", "String", open(), "[]")
        );
        assert_eq!(
            render(json!({"exclusiveMaximum": 2})),
            split("Number.Below(2)", "String", open(), "[]")
        );
        assert_eq!(
            render(json!({"pattern": "^a"})),
            split("Number", "/^a/", open(), "[]")
        );
        assert_eq!(
            render(json!({"format": "email"})),
            split("Number", "String.Email", open(), "[]")
        );
        assert_eq!(
            render(json!({"anyOf": [{"format": "ipv4"}, {"format": "ipv6"}]})),
            split("Number", "String.Ip", open(), "[]")
        );
        assert_eq!(
            render(json!({"anyOf": [{"format": "ipv4"}]})),
            format!(
                "Nof(Min(1),{})",
                split("Number", "String.Ipv4", open(), "[]")
            )
        );
        assert_eq!(
            fails(json!({"anyOf": [{"format": "ipv4"}, 1]})),
            "JSON Schema: a schema must be an object or boolean at /anyOf/1"
        );
        assert_eq!(render(json!({"type": "number", "default": 5})), "5");
        assert_eq!(
            render(json!({"type": "string", "description": "d"})),
            "String"
        );
        assert_eq!(
            render(json!({"properties": {"a": true, "b": false}})),
            split("Number", "String", "{a: Any, b: Never}.Open()", "[]")
        );
        assert_eq!(
            render(json!({"properties": {"a": {"type": "number"}}})),
            split("Number", "String", "{a: 0}.Open()", "[]")
        );
        assert_eq!(
            render(json!({"required": ["a"]})),
            split("Number", "String", "{a: Any}.Open()", "[]")
        );
        assert_eq!(
            render(json!({"additionalProperties": false})),
            split("Number", "String", "{}", "[]")
        );
        assert_eq!(
            render(json!({"items": {"type": "number"}})),
            split("Number", "String", open(), "[Number]")
        );
        // A prefixItems position may be absent, so it renders as its value.
        assert_eq!(
            render(json!({"prefixItems": [{"type": "number"}]})),
            split("Number", "String", open(), "[0, ...Any]")
        );
        assert_eq!(
            render(json!({"type": "array", "prefixItems": [{"type": "number"}], "items": false})),
            "[0]"
        );
        assert_eq!(
            render(
                json!({"type": "array", "prefixItems": [{"type": "number"}], "items": {"type": "string"}})
            ),
            "[0, ...String]"
        );
        assert_eq!(
            render(json!({"type": "array", "items": true, "minItems": 1, "maxItems": 3})),
            "[].Min(1).Max(3)"
        );
        assert_eq!(
            render(
                json!({"type": "object", "additionalProperties": {"type": "number"}, "minProperties": 1, "maxProperties": 2})
            ),
            "{}.Child(Number).Min(1).Max(2)"
        );
        assert_eq!(
            render(
                json!({"type": "object", "properties": {"a": {"type": "number", "default": 1}, "b": {"type": "string"}}, "required": ["b", "c"]})
            ),
            "{a: 1, b: String, c: Any}.Open()"
        );
        assert_eq!(
            render(
                json!({"type": "object", "properties": {"a": {"type": "number"}}, "additionalProperties": false})
            ),
            "{a: 0}"
        );
        assert_eq!(
            render(
                json!({"$defs": {"p": {"type": "number"}}, "properties": {"a": {"$ref": "#/$defs/p"}}})
            ),
            split("Number", "String", "{a: 0}.Open()", "[]")
        );
        assert_eq!(
            render(
                json!({"definitions": {"a b": {"type": "number"}}, "properties": {"a": {"$ref": "#/definitions/a%20b"}}})
            ),
            split("Number", "String", "{a: 0}.Open()", "[]")
        );
        assert_eq!(
            render(
                json!({"$defs": {"n": {"type": "object", "properties": {"kids": {"type": "array", "items": {"$ref": "#/$defs/n"}}}}}, "$ref": "#/$defs/n"})
            ),
            "{kids: [Refer(\"n\")]}.Open().Define(\"n\")"
        );
        assert_eq!(
            render(json!({"type": "object", "properties": {"next": {"$ref": "#"}}})),
            "{next: {next: Refer(\"$root\")}.Open().Define(\"$root\")}.Open()"
        );
        assert_eq!(
            render(json!({"oneOf": [
                {"type": "object", "properties": {"k": {"const": "a"}, "x": {"type": "number"}}, "required": ["k", "x"]},
                {"type": "object", "properties": {"k": {"const": "b"}}, "required": ["k"]}
            ]})),
            "Discriminated(k,a,b)"
        );
        // The export of what is imported reads back the same.
        let doc = json!({"type": "object", "properties": {"a": {"type": "number", "minimum": 1}, "b": {"type": "string", "minLength": 1}}, "required": ["a"], "additionalProperties": false});
        assert_eq!(export(doc.clone()), doc);
    }

    #[test]
    fn discriminated_needs_a_tag_every_branch_shares() {
        let plain = |branches: serde_json::Value| render(json!({"oneOf": branches}));
        assert_eq!(
            fails(json!({"oneOf": [1, 2]})),
            "JSON Schema: a schema must be an object or boolean at /oneOf/0"
        );
        assert_eq!(
            plain(json!([{"type": "object"}, {"type": "object"}])),
            "Nof(1,{}.Open(),{}.Open())"
        );
        // A branch with no type is a kind split; with "object", an object.
        assert_eq!(
            plain(
                json!([{"properties": {"k": {"const": "a"}}}, {"type": "object", "properties": {"k": {"const": "b"}}}])
            ),
            format!(
                "Nof(1,{},{{k: Exact(b)}}.Open())",
                split("Number", "String", "{k: Exact(a)}.Open()", "[]")
            )
        );
        assert_eq!(
            plain(
                json!([{"type": "object", "properties": {"k": {"type": "string"}}, "required": ["k"]}])
            ),
            "Nof(1,{k: String}.Open())"
        );
        assert_eq!(
            plain(
                json!([{"type": "object", "properties": {"k": {"const": "a"}}, "required": ["k"]}, {"type": "object", "properties": {"k": {"const": "a"}}, "required": ["k"]}])
            ),
            "Nof(1,{k: Exact(a)}.Open(),{k: Exact(a)}.Open())"
        );
        assert_eq!(
            plain(
                json!([{"type": "object", "properties": {"k": {"const": "a"}}, "required": ["k"]}, {"type": "object", "properties": {"k": {"const": "b"}}, "required": []}])
            ),
            "Nof(1,{k: Exact(a)}.Open(),{k: Exact(b)}.Open())"
        );
        assert_eq!(
            plain(
                json!([{"type": "object", "properties": {"k": {"const": "a"}}, "required": ["k"]}, {"type": "object", "properties": {"z": {"const": "b"}}, "required": ["z"]}])
            ),
            "Nof(1,{k: Exact(a)}.Open(),{z: Exact(b)}.Open())"
        );
        assert_eq!(plain(json!([])), "Nof(1)");
    }

    #[test]
    fn rejects_what_it_cannot_read() {
        assert_eq!(
            fails(json!(1)),
            "JSON Schema: the schema must be an object or boolean"
        );
        assert_eq!(
            fails(json!(null)),
            "JSON Schema: the schema must be an object or boolean"
        );
        assert_eq!(
            fails(json!([])),
            "JSON Schema: the schema must be an object or boolean"
        );
        assert_eq!(
            fails(json!({"items": null})),
            "JSON Schema: a schema must be an object or boolean at /items"
        );
        assert_eq!(
            fails(json!({"type": "object", "additionalProperties": null})),
            "JSON Schema: a schema must be an object or boolean at /additionalProperties"
        );
        assert_eq!(
            fails(json!({"allOf": [{"type": "x"}]})),
            "JSON Schema: unknown type \"x\" at /allOf/0"
        );
        assert_eq!(
            fails(json!({"type": ["string", "number"], "pattern": "("})),
            "JSON Schema: bad pattern \"(\" at /"
        );
        assert_eq!(
            fails(json!({"properties": {"a": 1}})),
            "JSON Schema: a schema must be an object or boolean at /properties/a"
        );
        assert_eq!(
            fails(json!({"$ref": "#/$defs/x"})),
            "JSON Schema: unknown $ref \"#/$defs/x\" at /"
        );
        assert_eq!(
            fails(json!({"$ref": "http://x"})),
            "JSON Schema: unsupported $ref \"http://x\" at /"
        );
        // An empty enum admits nothing; one that is not a list is a fault.
        assert_eq!(render(json!({"enum": []})), "Never");
        assert_eq!(
            fails(json!({"enum": 1})),
            "JSON Schema: enum must be an array at /"
        );
        assert_eq!(
            fails(json!({"allOf": 1})),
            "JSON Schema: allOf must be an array at /allOf"
        );
        assert_eq!(
            fails(json!({"oneOf": 1})),
            "JSON Schema: oneOf must be an array at /oneOf"
        );
        assert_eq!(
            fails(json!({"anyOf": 1})),
            "JSON Schema: anyOf must be an array at /anyOf"
        );
        assert_eq!(
            fails(json!({"type": "object", "properties": 1})),
            "JSON Schema: properties must be an object at /properties"
        );
        assert_eq!(
            fails(json!({"type": "array", "prefixItems": 1})),
            "JSON Schema: prefixItems must be an array at /prefixItems"
        );
        assert_eq!(
            fails(json!({"type": "nope"})),
            "JSON Schema: unknown type \"nope\" at /"
        );
        assert_eq!(
            fails(json!({"type": 1})),
            "JSON Schema: unknown type \"1\" at /"
        );
        assert_eq!(
            fails(json!({"type": "string", "pattern": "["})),
            "JSON Schema: bad pattern \"[\" at /"
        );
        assert_eq!(
            fails(json!({"type": "object", "properties": {"a": {"type": "x"}}})),
            "JSON Schema: unknown type \"x\" at /properties/a"
        );
        assert_eq!(
            fails(json!({"type": "array", "items": {"type": "x"}})),
            "JSON Schema: unknown type \"x\" at /items"
        );
        assert_eq!(
            fails(json!({"type": "array", "prefixItems": [{"type": "x"}]})),
            "JSON Schema: unknown type \"x\" at /prefixItems/0"
        );
        assert_eq!(
            fails(json!({"type": "array", "prefixItems": [true], "items": {"type": "x"}})),
            "JSON Schema: unknown type \"x\" at /items"
        );
        assert_eq!(
            fails(json!({"type": "object", "additionalProperties": {"type": "x"}})),
            "JSON Schema: unknown type \"x\" at /additionalProperties"
        );
        assert_eq!(
            fails(json!({"$defs": {"p": {"type": "x"}}, "$ref": "#/$defs/p"})),
            "JSON Schema: unknown type \"x\" at /"
        );
        assert_eq!(
            fails(
                json!({"oneOf": [{"properties": {"k": {"const": "a"}, "x": {"type": "x"}}, "required": ["k"]}, {"properties": {"k": {"const": "b"}}, "required": ["k"]}]})
            ),
            "JSON Schema: unknown type \"x\" at /oneOf/0/properties/x"
        );
        assert_eq!(
            fails(json!({"type": ["string", "x"]})),
            "JSON Schema: unknown type \"x\" at /"
        );
        assert_eq!(format!("{}", JsonSchemaError("e".into())), "e");
        assert_eq!(percent_decode("a%2"), "a%2");
        assert_eq!(percent_decode("a%zzb"), "a%zzb");
    }

    // ts/test/jsonschema-import.test.ts, keywords: what an imported schema
    // accepts and how it fails.
    #[test]
    fn validates_as_the_schema_says() {
        holds(&[
            (json!({"type": ["string", "number"]}), json!(3), "3"),
            (json!({"type": ["string", "number"]}), json!(true), "ERR Value \"true\" for property \"\" satisfies 0 of: String, Number; the count must be 1."),
            (json!({"type": ["string", "number"], "minLength": 2}), json!("a"), "ERR Value \"a\" for property \"\" must be a minimum length of 2 (was 1)."),
            (json!({"type": ["string", "number"], "minLength": 2}), json!(1), "1"),
            (json!({"type": ["integer", "number"]}), json!(1.5), "1.5"),
            (json!({"type": ["string", "number", "null"]}), json!(null), "null"),
            (json!({"properties": {"a": {"type": "number"}}}), json!({"a": 1, "b": 2}), "{\"a\":1,\"b\":2}"),
            (json!({"items": {"type": "number"}}), json!([1]), "[1]"),
            (json!({"required": ["a"]}), json!({"a": 1}), "{\"a\":1}"),
            (json!({"required": ["a"]}), json!({}), "ERR Validation failed for property \"a\" because the property is missing."),
            (json!({"type": "object", "properties": {"b": false}}), json!({"b": 1}), "ERR Validation failed for property \"b\" with number \"1\" because no value is allowed."),
            (json!({"type": "object", "properties": {"b": false}}), json!({}), "{}"),
            (json!({"type": "string", "enum": ["a", "b"]}), json!("c"), "ERR Value \"c\" for property \"\" must be exactly one of: a, b"),
            (json!({"enum": [1, 2]}), json!(2), "2"),
            (json!({"const": "x"}), json!("y"), "ERR Value \"y\" for property \"\" must be exactly one of: x"),
            (json!({"type": "object", "required": "a"}), json!({}), "{}"),
            (json!({"allOf": [{"type": "number"}, {"minimum": 1}]}), json!(0), "ERR Value \"0\" for property \"\" must be a minimum of 1 (was 0)."),
            (json!({"minLength": 2}), json!("a"), "ERR Value \"a\" for property \"\" must be a minimum length of 2 (was 1)."),
            (json!({"maxItems": 1}), json!([1, 2]), "ERR Value \"[1,2]\" for property \"\" must be a maximum length of 1 (was 2)."),
            (json!({"exclusiveMinimum": 1}), json!(1), "ERR Value \"1\" for property \"\" must be above 1 (was 1)."),
            (json!({"minimum": 1, "exclusiveMinimum": true}), json!(1), "ERR Value \"1\" for property \"\" must be above 1 (was 1)."),
            (json!({"minProperties": 1, "maxProperties": 9}), json!("x"), "\"x\""),
            (json!({"exclusiveMinimum": true}), json!(0), "0"),
            (json!({"pattern": "^a"}), json!("a"), "\"a\""),
            (json!({"format": "email"}), json!("x"), "ERR Value \"x\" for property \"\" is not a valid email address."),
            (json!({"anyOf": [{"format": "ipv4"}, {"format": "ipv6"}]}), json!("x"), "ERR Value \"x\" for property \"\" is not a valid IP address."),
            (json!({"not": {"type": "string"}}), json!(1), "1"),
            (json!({"type": "string", "not": {"pattern": "^a"}}), json!("ab"), "ERR Value \"ab\" for property \"\" satisfies 1 of: /^a/; the count must be 0."),
            (json!({"type": "string", "not": {"pattern": "^a"}}), json!(1), "ERR Validation failed for number \"1\" because the number is not of type string."),
            (json!({"enum": ["a", "b"], "not": {}}), json!("a"), "ERR Validation failed for string \"a\" because no value is allowed."),
            (json!({"type": "object", "properties": {"a": {"default": 1}}, "not": {"required": ["a"]}}), json!({}), "{\"a\":1}"),
            // A composite message names an object or array branch in
            // the port's own rendering.
            (json!({"type": "object", "properties": {"a": {"default": 1}}, "not": {"required": ["a"]}}), json!({"a": 2}), "ERR Value \"{a:2}\" for property \"\" satisfies 1 of: {a: Any}.Open(); the count must be 0."),
            (json!({"oneOf": [{"type": "object", "properties": {"k": {"const": "a"}}, "required": ["k"]}, true]}), json!(1), "1"),
        ]);
    }

    // `$defs || definitions`: a $defs that JavaScript reads as false gives
    // way.
    #[test]
    fn truthiness_as_javascript_reads_it() {
        assert!(!truthy(&Value::Undefined) && !truthy(&Value::Null));
        assert!(!truthy(&Value::Bool(false)) && truthy(&Value::Bool(true)));
        assert!(!truthy(&Value::Num(0.0)) && !truthy(&Value::Num(f64::NAN)));
        assert!(truthy(&Value::Num(1.0)));
        assert!(!truthy(&Value::from("")) && truthy(&Value::from("x")));
        assert!(truthy(&Value::Obj(Map::new())));
    }

    // Every keyword of a schema applies, beside the others.
    #[test]
    fn every_keyword_applies() {
        holds(&[
            (json!({"type": "object", "properties": {"a": {"type": "string"}}, "oneOf": [{"required": ["a"]}, {"required": ["b"]}]}), json!({"a": 5}), "ERR Validation failed for property \"a\" with number \"5\" because the number is not of type string."),
            (json!({"type": "object", "properties": {"a": {"type": "string"}}, "oneOf": [{"required": ["a"]}, {"required": ["b"]}]}), json!({"a": "x"}), "{\"a\":\"x\"}"),
            // A composite message names an object or array branch in
            // the port's own rendering.
            (json!({"type": "object", "properties": {"a": {"type": "string"}}, "oneOf": [{"required": ["a"]}, {"required": ["b"]}]}), json!({"c": 1}), "ERR Value \"{c:1}\" for property \"\" satisfies 0 of: {a: Any}.Open(), {b: Any}.Open(); the count must be 1."),
            (json!({"allOf": [{"type": "object", "properties": {"a": {"type": "string"}}}], "required": ["b"]}), json!({"a": "x"}), "ERR Validation failed for property \"b\" because the property is missing."),
            (json!({"type": "string", "anyOf": [{"minLength": 2}, {"pattern": "^x"}]}), json!(5), "ERR Validation failed for number \"5\" because the number is not of type string.\nValue \"5\" for property \"\" satisfies 0 of: String.Min(2), /^x/; the count must be Min(1)."),
            (json!({"type": "string", "anyOf": [{"minLength": 2}, {"pattern": "^x"}]}), json!("x"), "\"x\""),
            (json!({"type": "string", "enum": ["a", 1]}), json!(1), "ERR Value \"1\" for property \"\" must be exactly one of: a"),
            (json!({"enum": ["a", "bb"], "minLength": 2}), json!("a"), "ERR Value \"a\" for property \"\" must be exactly one of: bb"),
            (json!({"type": "number", "const": "x"}), json!("x"), "ERR Validation failed for string \"x\" because no value is allowed."),
            (json!({"enum": ["a", "b"], "const": "b"}), json!("b"), "\"b\""),
            (json!({"enum": ["a", "b"], "const": "b"}), json!("a"), "ERR Value \"a\" for property \"\" must be exactly one of: b"),
            (json!({"enum": []}), json!(1), "ERR Validation failed for number \"1\" because no value is allowed."),
            (json!({"enum": [[1, 2], [1, 3], {"a": 1, "b": 2}, {"b": 1}, {"a": 1}, "x", null], "const": {"a": 1}}), json!(1), "ERR Value \"1\" for property \"\" must be exactly one of: {\"a\":1}"),
            (json!({"$defs": {"n": {"type": "object", "properties": {"k": {"enum": ["x", "y"], "$ref": "#/$defs/k"}, "kids": {"type": "array", "items": {"$ref": "#/$defs/n"}}}}, "k": {"$ref": "#/$defs/n"}}, "$ref": "#/$defs/n"}), json!({"k": "z"}), "ERR Value \"z\" for property \"k\" must be exactly one of: x, y\nValidation failed for property \"k\" with string \"z\" because the string is not of type object."),
            (json!({"type": "object", "properties": {"e": {"enum": ["a"]}, "c": {"const": 1}, "f": false, "n": {"not": {}}}}), json!({}), "{}"),
            (json!({"type": "object", "properties": {"e": {"enum": ["a"]}, "c": {"const": 1}, "f": false, "n": {"not": {}}}}), json!({"e": "b"}), "ERR Value \"b\" for property \"e\" must be exactly one of: a"),
            (json!({"type": "object", "properties": {"e": {"enum": ["a"]}, "c": {"const": 1}, "f": false, "n": {"not": {}}}}), json!({"f": 1}), "ERR Validation failed for property \"f\" with number \"1\" because no value is allowed."),
            (json!({"type": "object", "properties": {"e": {"enum": ["a"]}, "c": {"const": 1}, "f": false, "n": {"not": {}}}, "required": ["f"]}), json!({}), "ERR Validation failed for property \"f\" with value \"undefined\" because no value is allowed."),
            (json!({"$defs": {"a": {"type": "array"}}, "definitions": {"a": {"type": "array"}}, "$ref": "#/$defs/a", "maxItems": 2}), json!([1, 2, 3]), "ERR Value \"[1,2,3]\" for property \"\" must be a maximum length of 2 (was 3)."),
            (json!({"$defs": {"a": {"type": "array"}}, "definitions": {"a": {"type": "array"}}, "$schema": "http://json-schema.org/draft-07/schema#", "$ref": "#/$defs/a", "maxItems": 2}), json!([1, 2, 3]), "[1,2,3]"),
            (json!({"$defs": {"a": {"type": "array"}}, "definitions": {"a": {"type": "array"}}, "$schema": "https://json-schema.org/draft/2020-12/schema", "$ref": "#/$defs/a", "maxItems": 2}), json!([1, 2, 3]), "ERR Value \"[1,2,3]\" for property \"\" must be a maximum length of 2 (was 3)."),
        ]);
        // A $ref's default stands in for an absent value.
        let listed =
            json!({"$defs": {"a": {"type": "array"}}, "$ref": "#/$defs/a", "default": [1]});
        assert_eq!(v(&listed, Value::Undefined), "[1]");
        // An enum keeps what every other part allows, and only that.
        let kept = json!({"enum": ["a", "bb", "cc", 1], "type": "string", "not": {"const": "cc"}, "minLength": 2});
        assert_eq!(
            v(&kept, Value::from("cc")),
            "ERR Value \"cc\" for property \"\" must be exactly one of: bb"
        );
        assert_eq!(v(&kept, Value::from("bb")), "\"bb\"");
        // A $defs that JavaScript reads as false gives way to definitions.
        let legacy = json!({"$defs": null, "definitions": {"a": {"type": "number"}}, "$ref": "#/definitions/a"});
        assert_eq!(
            v(&legacy, Value::from("x")),
            "ERR Validation failed for string \"x\" because the string is not of type number."
        );
    }

    // A schema without a type checks each kind of value with that kind's
    // keywords only.
    #[test]
    fn untyped_keywords_check_their_own_kind() {
        holds(&[
            (json!({"format": "email"}), json!(12), "12"),
            (json!({"format": "email"}), json!("nope"), "ERR Value \"nope\" for property \"\" is not a valid email address."),
            (json!({"minLength": 2}), json!(1), "1"),
            (json!({"pattern": "^a"}), json!(true), "true"),
            (json!({"minimum": 1}), json!("x"), "\"x\""),
            (json!({"minimum": 1}), json!(null), "null"),
            (json!({"minimum": 1}), json!(0), "ERR Value \"0\" for property \"\" must be a minimum of 1 (was 0)."),
            (json!({"properties": {"a": {"type": "number"}}}), json!("str"), "\"str\""),
            (json!({"properties": {"a": {"default": 3}}}), json!({}), "{\"a\":3}"),
            (json!({"properties": {"a": {"type": "number"}}}), json!({"a": "x"}), "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."),
            (json!({"items": {"type": "number"}}), json!({"x": 1}), "{\"x\":1}"),
            (json!({"items": {"type": "number"}}), json!(["x"]), "ERR Validation failed for index \"0\" with string \"x\" because the string is not of type number."),
            (json!({"anyOf": [{"format": "ipv4"}, {"format": "ipv6"}]}), json!(3), "3"),
            (json!({"required": ["a"]}), json!([1]), "[1]"),
            (json!({"minItems": 1, "minProperties": 1, "minLength": 1, "minimum": 1}), json!(false), "false"),
            (json!({"type": ["string", "object"], "properties": {"a": {"type": "number"}}}), json!({"a": "x"}), "ERR Validation failed for property \"a\" with string \"x\" because the string is not of type number."),
            (json!({"type": ["string", "string"]}), json!("a"), "\"a\""),
            (json!({"type": "string", "allOf": [{"minLength": 2}, {"maxLength": 3}]}), json!("a"), "ERR Value \"a\" for property \"\" must be a minimum length of 2 (was 1)."),
            (json!({"type": "number", "anyOf": [{"minimum": 5}, {"maximum": 1}]}), json!(3), "ERR Value \"3\" for property \"\" satisfies 0 of: Number.Min(5), Number.Max(1); the count must be Min(1)."),
            // A composite message names an object or array branch in
            // the port's own rendering.
            (json!({"type": "array", "oneOf": [{"maxItems": 1}, {"minItems": 3}]}), json!([1, 2]), "ERR Value \"[1,2]\" for property \"\" satisfies 0 of: [].Max(1), [].Min(3); the count must be 1."),
            (json!({"type": "boolean", "not": {"minimum": 1}}), json!(true), "ERR Value \"true\" for property \"\" satisfies 1 of: Any; the count must be 0."),
            (json!({"type": ["integer"], "allOf": [{"minimum": 1}]}), json!(2), "2"),
        ]);
        // The kinds export as the keywords side by side, with no type.
        assert_eq!(
            export(
                json!({"minimum": 1, "minLength": 2, "properties": {"a": {"type": "number"}}, "maxItems": 3})
            ),
            json!({"minimum": 1, "minLength": 2, "properties": {"a": {"type": "number"}}, "maxItems": 3})
        );
        assert_eq!(
            export(json!({"minLength": 2, "description": "d"})),
            json!({"minLength": 2, "description": "d"})
        );
        assert_eq!(
            export(json!({"type": ["string", "number", "null"]})),
            json!({"oneOf": [{"type": "string"}, {"type": "number"}]})
        );
    }

    // A whole schema may be true or false; a prefixItems position may be
    // absent; and strict refuses what the import would pass over.
    #[test]
    fn documents_tuples_and_strict() {
        holds(&[
            (json!(true), json!({"a": 1}), "{\"a\":1}"),
            (json!(false), json!(1), "ERR Validation failed for number \"1\" because no value is allowed."),
            (json!({"type": "array", "prefixItems": [{"type": "string"}, {"type": "number"}]}), json!([]), "[]"),
            (json!({"type": "array", "prefixItems": [{"type": "string"}, {"type": "number"}]}), json!(["a"]), "[\"a\"]"),
            (json!({"type": "array", "prefixItems": [{"type": "string"}, {"type": "number"}]}), json!(["a", 1]), "[\"a\",1]"),
            (json!({"type": "array", "prefixItems": [{"type": "string"}, {"type": "number"}]}), json!([1]), "ERR Validation failed for index \"0\" with number \"1\" because the number is not of type string."),
            (json!({"type": "array", "prefixItems": [{"type": "string"}, {"default": 7}, {}]}), json!(["a"]), "[\"a\",7]"),
            (json!({"type": "array", "prefixItems": [{"type": "string"}, {"default": 7}, {}]}), json!([]), "ERR Validation failed for index \"0\" because the element is missing."),
            (json!({"type": "array", "prefixItems": [true, false]}), json!([1]), "[1]"),
            (json!({"type": "array", "prefixItems": [true, false]}), json!([1, 2]), "ERR Validation failed for index \"1\" with number \"2\" because no value is allowed."),
            (json!({"uniqueItems": false}), json!([1, 1]), "[1,1]"),
        ]);
        for k in UNSUPPORTED {
            let schema = json!({"type": "object", "properties": {"a": {k: true}}});
            assert_eq!(
                v(&schema, Value::from(json!({"a": 1}))),
                "{\"a\":1}",
                "{}",
                k
            );
            let strict = JsonSchemaImportOptions { strict: true };
            assert_eq!(
                from_json_schema_with(&Value::from(schema), &strict)
                    .unwrap_err()
                    .0,
                format!(
                    "JSON Schema: unsupported keyword \"{}\" at /properties/a",
                    k
                )
            );
        }
        // What the import reads, strict reads too.
        let strict = JsonSchemaImportOptions { strict: true };
        for schema in [
            json!({"if": false, "then": false}),
            json!({"contains": true}),
            json!({"uniqueItems": true}),
            json!({"uniqueItems": false}),
            json!({"dependentRequired": {}}),
            json!({"dependentSchemas": {}}),
            json!({"dependencies": {}}),
        ] {
            let spec = from_json_schema_with(&Value::from(schema.clone()), &strict);
            assert!(
                Schema::new(spec.unwrap()).valid(&Value::from(5)),
                "{}",
                schema
            );
        }
        let lax =
            from_json_schema_with(&Value::from(json!({"type": "number"})), &Default::default());
        assert!(Schema::new(lax.unwrap()).valid(&Value::from(1)));
    }

    // ts/test/jsonschema-import.test.ts, conditionals-and-array-checks: if,
    // then and else; the dependent keywords; contains and uniqueItems.
    #[test]
    fn conditionals_and_array_checks() {
        let ok = |schema: serde_json::Value, input: serde_json::Value| {
            Schema::new(imp(schema).unwrap()).valid(&Value::from(input))
        };

        // if picks then or else; an if with neither asserts nothing.
        let cond =
            json!({"if": {"type": "number"}, "then": {"minimum": 1}, "else": {"type": "string"}});
        holds(&[
            (cond.clone(), json!(2), "2"),
            (cond.clone(), json!(0), "ERR Value \"0\" for property \"\" must be a minimum of 1 (was 0)."),
            (cond.clone(), json!("a"), "\"a\""),
            (cond.clone(), json!(true), "ERR Validation failed for boolean \"true\" because the boolean is not of type string."),
        ]);
        assert!(ok(json!({"if": false}), json!(1)));
        assert!(!ok(
            json!({"if": {"type": "number"}, "else": false}),
            json!("x")
        ));
        assert!(ok(
            json!({"if": {"type": "number"}, "else": false}),
            json!(1)
        ));
        // Under one type, the condition and its arms meet that kind alone.
        let narrowed = json!({"type": "string", "if": {"minLength": 2}, "then": {"maxLength": 3}});
        assert!(!ok(narrowed.clone(), json!("abcd")));
        assert!(ok(narrowed, json!("a")));
        // The condition sees the value as given, before a default fills it in.
        holds(&[(
            json!({"properties": {"a": {"default": 1}}, "if": {"required": ["a"]}, "then": false}),
            json!({}),
            "{\"a\":1}",
        )]);

        // A dependent keyword holds where its key is present.
        let dr = json!({"dependentRequired": {"a": ["b", "c"], "d": []}});
        holds(&[
            (
                dr.clone(),
                json!({"a": 1, "b": 2, "c": 3}),
                "{\"a\":1,\"b\":2,\"c\":3}",
            ),
            (
                dr.clone(),
                json!({"a": 1, "b": 2}),
                "ERR Validation failed for property \"c\" because the property is missing.",
            ),
            (dr.clone(), json!({"b": 1, "d": 1}), "{\"b\":1,\"d\":1}"),
            (dr, json!("a"), "\"a\""),
        ]);
        let ds = json!({"dependentSchemas": {"a": {"properties": {"b": {"type": "number"}}, "required": ["b"]}}});
        holds(&[
            (ds.clone(), json!({"a": 1, "b": "x"}), "ERR Validation failed for property \"b\" with string \"x\" because the string is not of type number."),
            (ds, json!({"b": "x"}), "{\"b\":\"x\"}"),
        ]);
        assert!(!ok(
            json!({"dependentSchemas": {"a": false}}),
            json!({"a": 1})
        ));
        assert!(ok(json!({"dependentSchemas": {"a": false}}), json!(["a"])));
        // Draft 7's dependencies is either form, where neither of the others is.
        assert!(!ok(json!({"dependencies": {"a": ["b"]}}), json!({"a": 1})));
        assert!(!ok(
            json!({"dependencies": {"a": {"minProperties": 2}}}),
            json!({"a": 1})
        ));
        assert!(ok(
            json!({"dependencies": {"a": ["b"]}, "dependentSchemas": {}}),
            json!({"a": 1})
        ));
        assert!(ok(
            json!({"dependencies": {"a": ["b"]}, "dependentRequired": {}}),
            json!({"a": 1})
        ));
        // A key the object does not hold is not one it holds.
        assert!(ok(
            json!({"dependentRequired": {"toString": ["x"]}}),
            json!({})
        ));

        // contains counts the items its schema admits.
        let c = |extra: serde_json::Value| {
            let mut schema = json!({"type": "array", "contains": {"type": "number"}});
            schema
                .as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            Schema::new(imp(schema).unwrap())
        };
        let a = |s: &str| Value::from(serde_json::from_str::<serde_json::Value>(s).unwrap());
        assert!(c(json!({})).valid(&a(r#"["a",1]"#)));
        assert_eq!(
            c(json!({})).validate(a(r#"["a"]"#)).unwrap_err().to_string(),
            "Value \"[a]\" for property \"\" has 0 of its items satisfying Number; the count must be Min(1)."
        );
        assert!(c(json!({"minContains": 0})).valid(&a("[]")));
        assert!(!c(json!({"minContains": 2})).valid(&a("[1]")));
        assert!(!c(json!({"maxContains": 1})).valid(&a("[1,2]")));
        assert!(!c(json!({"maxContains": 1})).valid(&a("[]")));
        assert!(c(json!({"minContains": 0, "maxContains": 1})).valid(&a("[]")));
        assert!(c(json!({"minContains": 2, "maxContains": 2})).valid(&a(r#"[1,2,"a"]"#)));
        assert!(!c(json!({"minContains": 1, "maxContains": 3})).valid(&a("[1,2,3,4]")));
        // A count of at least none asserts nothing; so does a bound alone.
        assert_eq!(
            export(json!({"type": "array", "minContains": 0, "contains": false})),
            json!({"type": "array"})
        );
        assert!(ok(json!({"type": "array", "minContains": 3}), json!([1])));
        // Untyped, contains and uniqueItems say nothing of other kinds.
        assert!(ok(json!({"contains": {"type": "number"}}), json!("x")));
        assert!(!ok(json!({"contains": {"type": "number"}}), json!(["x"])));
        assert!(ok(json!({"uniqueItems": true}), json!({"a": 1})));

        // uniqueItems compares items as JSON values.
        let u = Schema::new(imp(json!({"type": "array", "uniqueItems": true})).unwrap());
        assert!(u.valid(&a(r#"[1,"1",true,null,[1],{"a":1},{"a":2}]"#)));
        assert_eq!(
            u.validate(a(r#"[{"a":1,"b":[2]},0,{"b":[2],"a":1}]"#)).unwrap_err().to_string(),
            "Value \"[{a:1,b:[2]},0,{b:[2],a:1}]\" for property \"\" must have unique items (items 0 and 2 are equal)."
        );
        holds(&[(
            json!({"type": "array", "uniqueItems": false}),
            json!([1, 1]),
            "[1,1]",
        )]);

        // They export as they were read.
        assert_eq!(
            export(cond),
            json!({"if": {"type": "number"}, "then": {"minimum": 1}, "else": {"type": "string"}})
        );
        assert_eq!(
            export(
                json!({"type": "array", "contains": {"type": "number"}, "minContains": 2, "maxContains": 3, "uniqueItems": true})
            ),
            json!({"type": "array", "contains": {"type": "number"}, "minContains": 2, "maxContains": 3, "uniqueItems": true})
        );
    }

    // ts/test/jsonschema-import.test.ts, conditional-faults.
    #[test]
    fn conditional_faults() {
        for (schema, msg) in [
            (
                json!({"dependentRequired": []}),
                "dependentRequired must be an object at /dependentRequired",
            ),
            (
                json!({"dependentSchemas": 1}),
                "dependentSchemas must be an object at /dependentSchemas",
            ),
            (
                json!({"dependencies": "a"}),
                "dependencies must be an object at /dependencies",
            ),
            (
                json!({"dependentRequired": {"a": "b"}}),
                "a dependency must be an array of property names at /dependentRequired/a",
            ),
            (
                json!({"dependencies": {"a": [1]}}),
                "a dependency must be an array of property names at /dependencies/a",
            ),
            (
                json!({"dependentSchemas": {"a": 1}}),
                "a schema must be an object or boolean at /dependentSchemas/a",
            ),
            (
                json!({"if": true, "then": 1}),
                "a schema must be an object or boolean at /then",
            ),
            (
                json!({"if": 1, "then": true}),
                "a schema must be an object or boolean at /if",
            ),
        ] {
            assert_eq!(fails(schema), format!("JSON Schema: {}", msg));
        }
        // A count that is no whole number does not import, as the builder
        // throws in TypeScript.
        for (lo, hi) in [(1.5, 1.5), (-1.0, -1.0)] {
            assert_eq!(
                fails(
                    json!({"type": "array", "contains": {}, "minContains": lo, "maxContains": hi})
                ),
                crate::builders::CONTAINS_FAULT
            );
        }
    }
}

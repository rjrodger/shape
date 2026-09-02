//! JSON Schema import (draft 2020-12, and the common keywords of earlier
//! drafts), the inverse of the export: a type becomes a token, bounds become
//! size builders, formats and patterns their builders, enum and const become
//! Exact, properties and items become objects and arrays, the compositions
//! become One, All and Discriminated, and a definition is inlined where it
//! is referenced, with Define and Refer only where a definition refers to
//! itself. A property that is not required and has no default is Skip.
//! Unknown keywords are ignored; an unknown type or reference is an error.

use crate::builders::*;
use crate::discriminated::discriminated;
use crate::node::{Node, Token};
use crate::spec::Spec;
use crate::value::{Map, Value};
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

/// Build a spec from a JSON Schema document. Compile it with `Schema::new`,
/// or compose it further with the builders.
pub fn from_json_schema(schema: &Value) -> Res<Spec> {
    let Value::Obj(m) = schema else {
        return Err(JsonSchemaError(
            "JSON Schema: the schema must be an object".to_string(),
        ));
    };
    let defs = match m.get("$defs").or_else(|| m.get("definitions")) {
        Some(Value::Obj(d)) => d.clone(),
        _ => Map::new(),
    };
    let mut c = Import {
        root: m,
        defs,
        stack: Vec::new(),
        recursive: HashMap::new(),
    };
    c.schema(schema, "")
}

struct Import<'a> {
    root: &'a Map,
    defs: Map,
    stack: Vec<String>,
    recursive: HashMap<String, bool>,
}

fn is_kind_name(name: &str) -> bool {
    matches!(
        name,
        "string" | "number" | "integer" | "boolean" | "null" | "object" | "array"
    )
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

fn ref_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^#/(\$defs|definitions)/([^/]+)$").unwrap())
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
    fn schema(&mut self, s: &Value, path: &str) -> Res<Spec> {
        if let Value::Bool(b) = s {
            return Ok(if *b {
                Spec::from(Token::Any)
            } else {
                Spec::from(never(any()))
            });
        }
        let Value::Obj(m) = s else {
            return fault("a schema must be an object or boolean", path);
        };
        let spec = match as_str(m.get("$ref")) {
            Some(r) => self.reference(r, path)?,
            None => self.keywords(m, path)?,
        };
        Ok(match as_str(m.get("description")) {
            Some(d) => Spec::from(describe(d, spec)),
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
            (String::new(), Value::Obj(self.root.clone()))
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
            return Ok(Spec::from(refer(refname, any())));
        }
        self.stack.push(name.clone());
        let was = self.recursive.get(&name).copied().unwrap_or(false);
        self.recursive.insert(name.clone(), false);
        let spec = self.schema(&def, path);
        let recursive = self.recursive.get(&name).copied().unwrap_or(false);
        self.recursive.insert(name.clone(), was);
        self.stack.pop();
        let spec = spec?;
        Ok(if recursive {
            Spec::from(define(refname, spec))
        } else {
            spec
        })
    }

    fn keywords(&mut self, m: &Map, path: &str) -> Res<Spec> {
        let spec = if let Some(e) = m.get("enum") {
            match e {
                Value::Arr(vals) if !vals.is_empty() => Spec::from(exact(vals.clone())),
                _ => return fault("enum must be a non-empty array", path),
            }
        } else if let Some(v) = m.get("const") {
            Spec::from(exact([v.clone()]))
        } else if let Some(all_of) = m.get("allOf") {
            let branches = self.branches(all_of, &format!("{}/allOf", path))?;
            Spec::from(all(branches))
        } else if let Some(one_of) = m.get("oneOf") {
            let sub = format!("{}/oneOf", path);
            let list = branch_list(one_of, &sub)?;
            match self.discriminated(list, &sub)? {
                Some(d) => d,
                None => Spec::from(one(self.branches(one_of, &sub)?)),
            }
        } else if let Some(any_of) = m.get("anyOf").filter(|v| !is_ip_formats(Some(v))) {
            Spec::from(one(self.branches(any_of, &format!("{}/anyOf", path))?))
        } else if empty_object(m.get("not")) {
            Spec::from(never(any()))
        } else {
            self.typed(m, path)?
        };
        Ok(match m.get("default") {
            Some(d) => Spec::from(default(d.clone(), spec)),
            None => spec,
        })
    }

    fn branches(&mut self, v: &Value, path: &str) -> Res<Vec<Spec>> {
        let list = branch_list(v, path)?;
        let mut out = Vec::with_capacity(list.len());
        for (i, b) in list.iter().enumerate() {
            out.push(self.schema(b, &format!("{}/{}", path, i))?);
        }
        Ok(out)
    }

    fn typed(&mut self, m: &Map, path: &str) -> Res<Spec> {
        let mut types: Vec<Value> = match m.get("type") {
            Some(Value::Arr(t)) => t.clone(),
            None => Vec::new(),
            Some(t) => vec![t.clone()],
        };
        let nullable = types.len() > 1 && types.iter().any(|t| as_str(Some(t)) == Some("null"));
        if nullable {
            types.retain(|t| as_str(Some(t)) != Some("null"));
        }
        for t in &types {
            match t {
                Value::Str(name) if is_kind_name(name) => {}
                other => {
                    return fault(
                        format!("unknown type {:?}", crate::stringify::inline_value(other)),
                        path,
                    )
                }
            }
        }
        if types.is_empty() {
            // No type: the shape the keywords imply, or anything.
            let has = |k: &str| m.contains_key(k);
            if has("properties") || has("additionalProperties") || has("required") {
                types.push(Value::from("object"));
            } else if has("items") || has("prefixItems") {
                types.push(Value::from("array"));
            } else {
                return self.untyped(m, path);
            }
        }
        let spec = if types.len() == 1 {
            self.kind(as_str(types.first()).unwrap_or(""), m, path)?
        } else {
            let mut kinds = Vec::with_capacity(types.len());
            for t in &types {
                kinds.push(self.kind(as_str(Some(t)).unwrap_or(""), m, path)?);
            }
            Spec::from(one(kinds))
        };
        Ok(if nullable {
            Spec::from(nullable_(spec))
        } else {
            spec
        })
    }

    fn kind(&mut self, t: &str, m: &Map, path: &str) -> Res<Spec> {
        Ok(match t {
            "string" => import_string(m, path)?,
            "number" => import_number(Some(Spec::from(Token::Number)), m).unwrap(),
            "integer" => import_number(Some(Spec::from(Token::Integer)), m).unwrap(),
            "boolean" => Spec::from(Token::Boolean),
            "null" => Spec::from(required(crate::spec::null())),
            "object" => self.object(m, path)?,
            _ => self.array(m, path)?,
        })
    }

    /// Keywords without a type: a pattern or format reads as a string, a
    /// bound applies to whatever kind the value turns out to be (as a bare
    /// Min does), and anything else says nothing.
    fn untyped(&mut self, m: &Map, path: &str) -> Res<Spec> {
        let format = as_str(m.get("format")).unwrap_or("");
        if as_str(m.get("pattern")).is_some()
            || format_builder(format).is_some()
            || is_ip_formats(m.get("anyOf"))
        {
            return import_string(m, path);
        }
        let mut view = Map::new();
        if let Some(v) = first_number(m, &["minimum", "minLength", "minItems", "minProperties"]) {
            view.insert("minimum".to_string(), Value::Num(v));
        }
        if let Some(v) = first_number(m, &["maximum", "maxLength", "maxItems", "maxProperties"]) {
            view.insert("maximum".to_string(), Value::Num(v));
        }
        for k in ["exclusiveMinimum", "exclusiveMaximum"] {
            if let Some(v) = m.get(k) {
                view.insert(k.to_string(), v.clone());
            }
        }
        // A bare bound rather than one on an Any node, as a user writes.
        Ok(import_number(None, &view).unwrap_or_else(|| Spec::from(Token::Any)))
    }

    fn object(&mut self, m: &Map, path: &str) -> Res<Spec> {
        let props: Map = match m.get("properties") {
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
                obj.push((k.clone(), Spec::from(required_(any()))));
            }
        }
        let ap = m.get("additionalProperties");
        let spec = match ap {
            Some(Value::Bool(false)) => {
                if obj.is_empty() {
                    Spec::from(closed(Spec::Obj(obj)))
                } else {
                    Spec::Obj(obj)
                }
            }
            None | Some(Value::Bool(true)) => Spec::from(open(Spec::Obj(obj))),
            Some(other) => {
                let c = self.schema(other, &format!("{}/additionalProperties", path))?;
                Spec::from(child(c, Spec::Obj(obj)))
            }
        };
        Ok(bounded(spec, m, "minProperties", "maxProperties"))
    }

    /// A property is required when listed, has its default when given, and
    /// is otherwise Skip: absent stays absent.
    fn property(&mut self, ps: &Value, is_required: bool, path: &str) -> Res<Spec> {
        let spec = self.schema(ps, path)?;
        if let Value::Obj(m) = ps {
            if m.contains_key("default") {
                return Ok(spec);
            }
        }
        Ok(Spec::from(if is_required {
            required_(spec)
        } else {
            skip(spec)
        }))
    }

    fn array(&mut self, m: &Map, path: &str) -> Res<Spec> {
        let items = m.get("items");
        let spec = if let Some(prefix) = m.get("prefixItems") {
            let sub = format!("{}/prefixItems", path);
            let Value::Arr(_) = prefix else {
                return fault("prefixItems must be an array", &sub);
            };
            let elems = self.branches(prefix, &sub)?;
            // Closed makes a one-element list a tuple rather than an element
            // shape; items says what may follow (anything, when it is
            // absent or true).
            let tuple = closed(Spec::Arr(elems));
            match items {
                Some(Value::Bool(false)) => Spec::from(tuple),
                None | Some(Value::Bool(true)) => Spec::from(rest(Token::Any, tuple)),
                Some(other) => {
                    let r = self.schema(other, &format!("{}/items", path))?;
                    Spec::from(rest(r, tuple))
                }
            }
        } else {
            match items {
                None | Some(Value::Bool(true)) => Spec::Arr(Vec::new()),
                Some(other) => {
                    let elem = self.schema(other, &format!("{}/items", path))?;
                    Spec::Arr(vec![elem])
                }
            }
        };
        Ok(bounded(spec, m, "minItems", "maxItems"))
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
        // The tag is the first property of the first branch that every
        // branch declares with a string const and the first requires.
        let tag = props[0].keys().find(|k| {
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
        Ok(Some(Spec::from(discriminated(tag, out))))
    }
}

fn required_(spec: impl Into<Spec>) -> Node {
    required(spec)
}

fn nullable_(spec: impl Into<Spec>) -> Node {
    nullable(spec)
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

fn first_number(m: &Map, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|k| as_f64(m.get(*k)))
}

fn format_builder(format: &str) -> Option<fn(Spec) -> Node> {
    Some(match format {
        "email" => |s| email(s),
        "uri" => |s| url(s),
        "uuid" => |s| uuid(s),
        "date-time" => |s| date_time(s),
        "ipv4" => |s| ipv4(s),
        "ipv6" => |s| ipv6(s),
        _ => return None,
    })
}

fn import_string(m: &Map, path: &str) -> Res<Spec> {
    let mut spec = Spec::from(Token::String);
    let mut plain = true;
    if let Some(p) = as_str(m.get("pattern")) {
        match Regex::new(p) {
            Ok(re) => spec = Spec::Regex(re),
            Err(_) => return fault(format!("bad pattern {:?}", p), path),
        }
        plain = false;
    }
    let min_length = as_f64(m.get("minLength"));
    let format = as_str(m.get("format")).unwrap_or("");
    if let Some(b) = format_builder(format) {
        spec = Spec::from(b(spec));
    } else if is_ip_formats(m.get("anyOf")) {
        spec = Spec::from(ip(spec));
    } else if plain && !min_length.map(|v| v > 0.0).unwrap_or(false) {
        // A string with no lower bound is allowed to be empty; a pattern or
        // format decides for itself.
        spec = Spec::from(empty(spec));
    }
    if let Some(v) = min_length.filter(|v| *v > 1.0) {
        spec = Spec::from(min(v, spec));
    }
    if let Some(v) = as_f64(m.get("maxLength")) {
        spec = Spec::from(max(v, spec));
    }
    Ok(spec)
}

/// The bounds of a number, on the spec or bare when there is none.
fn import_number(spec: Option<Spec>, m: &Map) -> Option<Spec> {
    let mut spec = spec;
    let base = |s: Option<Spec>| s.unwrap_or_else(|| Spec::from(any()));
    if let Some(v) = as_f64(m.get("exclusiveMinimum")) {
        spec = Some(Spec::from(above(v, base(spec))));
    } else if let Some(v) = as_f64(m.get("minimum")) {
        spec = Some(Spec::from(
            if as_bool(m.get("exclusiveMinimum")) == Some(true) {
                above(v, base(spec))
            } else {
                min(v, base(spec))
            },
        ));
    }
    if let Some(v) = as_f64(m.get("exclusiveMaximum")) {
        spec = Some(Spec::from(below(v, base(spec))));
    } else if let Some(v) = as_f64(m.get("maximum")) {
        spec = Some(Spec::from(
            if as_bool(m.get("exclusiveMaximum")) == Some(true) {
                below(v, base(spec))
            } else {
                max(v, base(spec))
            },
        ));
    }
    spec
}

fn bounded(spec: Spec, m: &Map, lo: &str, hi: &str) -> Spec {
    let mut spec = spec;
    if let Some(v) = as_f64(m.get(lo)) {
        spec = Spec::from(min(v, spec));
    }
    if let Some(v) = as_f64(m.get(hi)) {
        spec = Spec::from(max(v, spec));
    }
    spec
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stringify::stringify_node;
    use crate::Schema;
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
            "One(String,Number)"
        );
        assert_eq!(render(json!({"enum": ["a", 1]})), "Exact(a, 1)");
        assert_eq!(render(json!({"const": 1})), "Exact(1)");
        assert_eq!(
            render(json!({"allOf": [{"type": "number"}, {"minimum": 1}]})),
            "All(Number,Min(1))"
        );
        assert_eq!(
            render(json!({"anyOf": [{"type": "string"}, {"type": "number"}]})),
            "One(String,Number)"
        );
        assert_eq!(
            render(json!({"oneOf": [{"type": "string"}, {"type": "number"}]})),
            "One(String,Number)"
        );
        assert_eq!(render(json!({"not": {}})), "Never");
        assert_eq!(render(json!({"not": {"type": "string"}})), "Any");
        assert_eq!(render(json!({})), "Any");
        assert_eq!(render(json!({"minLength": 2})), "Min(2)");
        assert_eq!(
            render(json!({"maximum": 2, "exclusiveMinimum": 1})),
            "Above(1).Max(2)"
        );
        assert_eq!(render(json!({"exclusiveMaximum": 2})), "Below(2)");
        assert_eq!(render(json!({"pattern": "^a"})), "/^a/");
        assert_eq!(render(json!({"format": "email"})), "String.Email");
        assert_eq!(
            render(json!({"anyOf": [{"format": "ipv4"}, {"format": "ipv6"}]})),
            "String.Ip"
        );
        assert_eq!(
            render(json!({"anyOf": [{"format": "ipv4"}]})),
            "One(String.Ipv4)"
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
            "{a: Any, b: Never}.Open()"
        );
        assert_eq!(
            render(json!({"properties": {"a": {"type": "number"}}})),
            "{a: 0}.Open()"
        );
        assert_eq!(render(json!({"required": ["a"]})), "{a: Any}.Open()");
        assert_eq!(render(json!({"additionalProperties": false})), "{}");
        assert_eq!(render(json!({"items": {"type": "number"}})), "[Number]");
        assert_eq!(
            render(json!({"prefixItems": [{"type": "number"}]})),
            "[Number, ...Any]"
        );
        assert_eq!(
            render(json!({"type": "array", "prefixItems": [{"type": "number"}], "items": false})),
            "[Number]"
        );
        assert_eq!(
            render(
                json!({"type": "array", "prefixItems": [{"type": "number"}], "items": {"type": "string"}})
            ),
            "[Number, ...String]"
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
            "{a: 0}.Open()"
        );
        assert_eq!(
            render(
                json!({"definitions": {"a b": {"type": "number"}}, "properties": {"a": {"$ref": "#/definitions/a%20b"}}})
            ),
            "{a: 0}.Open()"
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
            "One({}.Open(),{}.Open())"
        );
        assert_eq!(
            plain(
                json!([{"properties": {"k": {"const": "a"}}}, {"properties": {"k": {"const": "b"}}}])
            ),
            "One({k: Exact(a)}.Open(),{k: Exact(b)}.Open())"
        );
        assert_eq!(
            plain(json!([{"properties": {"k": {"type": "string"}}, "required": ["k"]}])),
            "One({k: String}.Open())"
        );
        assert_eq!(
            plain(
                json!([{"properties": {"k": {"const": "a"}}, "required": ["k"]}, {"properties": {"k": {"const": "a"}}, "required": ["k"]}])
            ),
            "One({k: Exact(a)}.Open(),{k: Exact(a)}.Open())"
        );
        assert_eq!(
            plain(
                json!([{"properties": {"k": {"const": "a"}}, "required": ["k"]}, {"properties": {"k": {"const": "b"}}, "required": []}])
            ),
            "One({k: Exact(a)}.Open(),{k: Exact(b)}.Open())"
        );
        assert_eq!(
            plain(
                json!([{"properties": {"k": {"const": "a"}}, "required": ["k"]}, {"properties": {"z": {"const": "b"}}, "required": ["z"]}])
            ),
            "One({k: Exact(a)}.Open(),{z: Exact(b)}.Open())"
        );
        assert_eq!(plain(json!([])), "One()");
    }

    #[test]
    fn rejects_what_it_cannot_read() {
        assert_eq!(fails(json!(1)), "JSON Schema: the schema must be an object");
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
        assert_eq!(
            fails(json!({"enum": []})),
            "JSON Schema: enum must be a non-empty array at /"
        );
        assert_eq!(
            fails(json!({"enum": 1})),
            "JSON Schema: enum must be a non-empty array at /"
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
}

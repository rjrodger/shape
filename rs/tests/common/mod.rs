//! The corpus and differential decoders share one reading of a spec cell:
//! the sentinel encoding of `test/README.md`, on serde_json values.

#![allow(dead_code)]

use shape::{expr, ReferOptions, Spec, Token, Value};

/// A sentinel the port cannot build.
pub struct Unsupported(pub String);

pub fn decode_spec(v: &serde_json::Value) -> Result<Spec, Unsupported> {
    match v {
        serde_json::Value::Array(a) => {
            let items: Result<Vec<Spec>, Unsupported> = a.iter().map(decode_spec).collect();
            Ok(Spec::Arr(items?))
        }
        serde_json::Value::Object(m) => {
            if m.len() == 1 {
                let (k, sv) = m.iter().next().unwrap();
                match k.as_str() {
                    "$type" => {
                        let t = match sv.as_str().unwrap_or("") {
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
                            other => return Err(Unsupported(format!("$type {}", other))),
                        };
                        return Ok(Spec::Token(t));
                    }
                    "$open" => return Ok(Spec::from(shape::open(decode_spec(sv)?))),
                    "$closed" => return Ok(Spec::from(shape::closed(decode_spec(sv)?))),
                    "$required" => return Ok(Spec::from(shape::required(decode_spec(sv)?))),
                    "$optional" => return Ok(Spec::from(shape::optional(decode_spec(sv)?))),
                    "$expr" => {
                        let src = sv.as_str().unwrap_or("");
                        let node = expr(src).unwrap_or_else(|e| panic!("{}: {}", src, e));
                        return Ok(Spec::from(node));
                    }
                    "$call" => {
                        let arr = sv.as_array().unwrap();
                        let name = arr[0].as_str().unwrap();
                        let mut rest = Vec::new();
                        for a in &arr[2..] {
                            rest.push(decode_spec(a)?);
                        }
                        let spec = rest
                            .into_iter()
                            .next()
                            .unwrap_or_else(|| Spec::from(shape::any()));
                        return match name {
                            "Define" => {
                                Ok(Spec::from(shape::define(arr[1].as_str().unwrap(), spec)))
                            }
                            "Refer" => match &arr[1] {
                                serde_json::Value::String(n) => {
                                    Ok(Spec::from(shape::refer(n, spec)))
                                }
                                serde_json::Value::Object(o) => {
                                    let opts = ReferOptions {
                                        fill: o
                                            .get("fill")
                                            .and_then(|v| v.as_bool())
                                            .unwrap_or(false),
                                        strict: o
                                            .get("strict")
                                            .and_then(|v| v.as_bool())
                                            .unwrap_or(false),
                                    };
                                    Ok(Spec::from(shape::refer_with(
                                        o["name"].as_str().unwrap(),
                                        opts,
                                        spec,
                                    )))
                                }
                                _ => Err(Unsupported("$call Refer".into())),
                            },
                            "Pick" | "Omit" => {
                                let names =
                                    shape::Names::from_value(&Value::from(arr[1].clone()), name)
                                        .unwrap();
                                Ok(Spec::from(if name == "Pick" {
                                    shape::pick(names, spec)
                                } else {
                                    shape::omit(names, spec)
                                }))
                            }
                            "Partial" => Ok(Spec::from(shape::partial(decode_spec(&arr[1])?))),
                            "Extend" => Ok(Spec::from(shape::extend(decode_spec(&arr[1])?, spec))),
                            other => Err(Unsupported(format!("$call {}", other))),
                        };
                    }
                    "$discriminated" => {
                        let arr = sv.as_array().unwrap();
                        let tag = arr[0].as_str().unwrap();
                        let mut branches = Vec::new();
                        for (t, b) in arr[1].as_object().unwrap() {
                            branches.push((t.clone(), decode_spec(b)?));
                        }
                        return Ok(Spec::from(shape::discriminated(tag, branches)));
                    }
                    "$jsonschema" => {
                        return Ok(shape::from_json_schema(&Value::from(sv.clone()))
                            .unwrap_or_else(|e| panic!("{}: {}", k, e)));
                    }
                    _ => {}
                }
            }
            let mut pairs = Vec::with_capacity(m.len());
            for (k, sv) in m {
                pairs.push((k.clone(), decode_spec(sv)?));
            }
            Ok(Spec::Obj(pairs))
        }
        other => Ok(Spec::Value(Value::from(other.clone()))),
    }
}

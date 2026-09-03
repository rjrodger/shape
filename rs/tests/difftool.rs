//! Differential parity harness, Rust side: run the shared case matrix
//! (`test/differential/cases.js`) and record what this implementation did,
//! so `compare.js` can diff it against the canonical TypeScript build.
//! Driven by `make diff`; a plain `cargo test` skips it, since it runs only
//! with `DIFF_IN` and `DIFF_OUT` set.

mod common;

use common::decode_spec;
use serde::Serialize;
use shape::{from_json_schema, Schema, Value};
use std::fs;
use std::io::Write;

#[derive(Serialize)]
struct DiffResult {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    build: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    schema: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reimport: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    json: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rejson: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ok: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    out: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    err: Option<String>,
}

fn run_case(name: &str, spec: &serde_json::Value, input: &serde_json::Value) -> DiffResult {
    let mut res = DiffResult {
        name: name.to_string(),
        build: None,
        schema: None,
        reimport: None,
        json: None,
        rejson: None,
        ok: None,
        out: None,
        err: None,
    };
    let spec = match decode_spec(spec) {
        Ok(s) => s,
        Err(e) => {
            res.build = Some(format!("ERR: {}", e.0));
            return res;
        }
    };
    let schema = Schema::new(spec);

    // The JSON Schema export is compared too, once per case, and the export
    // of what the import reads back from it.
    let exported = serde_json::Value::from(schema.json_schema());
    res.reimport = Some(match from_json_schema(&Value::from(exported.clone())) {
        Ok(spec) => serde_json::Value::from(Schema::new(spec).json_schema()),
        Err(e) => serde_json::Value::String(format!("ERR: {}", e)),
    });
    res.schema = Some(exported);

    // The declarative JSON, and the export of the shape it reads back.
    match schema.json() {
        Err(e) => res.json = Some(serde_json::Value::String(format!("ERR: {}", e))),
        Ok(j) => {
            res.json = Some(serde_json::Value::from(j.clone()));
            res.rejson = Some(match shape::build(&j) {
                Err(e) => serde_json::Value::String(format!("ERR: {}", e)),
                Ok(spec) => match Schema::new(spec).json() {
                    Err(e) => serde_json::Value::String(format!("ERR: {}", e)),
                    Ok(back) => serde_json::Value::from(back),
                },
            });
        }
    }

    match schema.validate(Value::from(input.clone())) {
        Ok(out) => {
            res.ok = Some(true);
            res.out = Some(serde_json::Value::from(out));
        }
        Err(e) => {
            res.ok = Some(false);
            res.err = Some(e.to_string());
        }
    }
    res
}

#[test]
fn differential() {
    let (Ok(input), Ok(output)) = (std::env::var("DIFF_IN"), std::env::var("DIFF_OUT")) else {
        eprintln!("differential harness: set DIFF_IN and DIFF_OUT (see make diff)");
        return;
    };
    let raw = fs::read_to_string(&input).unwrap_or_else(|e| panic!("read {}: {}", input, e));
    let cases: Vec<serde_json::Value> = serde_json::from_str(&raw).expect("cases");
    let mut f = fs::File::create(&output).unwrap_or_else(|e| panic!("create {}: {}", output, e));
    for c in &cases {
        let name = c["name"].as_str().unwrap_or("");
        let res = match std::panic::catch_unwind(|| run_case(name, &c["spec"], &c["input"])) {
            Ok(r) => r,
            Err(p) => {
                let msg = p
                    .downcast_ref::<String>()
                    .cloned()
                    .or_else(|| p.downcast_ref::<&str>().map(|s| s.to_string()))
                    .unwrap_or_default();
                DiffResult {
                    name: name.to_string(),
                    build: Some(format!("PANIC: {}", msg)),
                    schema: None,
                    reimport: None,
                    json: None,
                    rejson: None,
                    ok: None,
                    out: None,
                    err: None,
                }
            }
        };
        serde_json::to_writer(&mut f, &res).unwrap();
        f.write_all(b"\n").unwrap();
    }
    eprintln!("rs:  {} results -> {}", cases.len(), output);
}

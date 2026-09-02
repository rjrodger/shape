//! The shared conformance corpus, `test/*.tsv`: every row runs through the
//! Rust port and is compared with what the canonical TypeScript produced. A
//! row whose spec needs a sentinel the port cannot build yet is skipped by
//! name; `SHAPE_RS_STRICT=1` makes a skip a failure.

use shape::{Schema, Spec, Token, Value};
use std::fs;
use std::path::Path;

struct Row {
    name: String,
    spec: serde_json::Value,
    input: serde_json::Value,
    output: Option<serde_json::Value>,
    err: Option<String>,
}

fn load_rows() -> Vec<Row> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../test");
    let mut files: Vec<_> = fs::read_dir(&dir)
        .expect("test dir")
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|x| x == "tsv").unwrap_or(false))
        .collect();
    files.sort();
    assert!(!files.is_empty(), "no .tsv files in {}", dir.display());
    let mut out = Vec::new();
    for path in files {
        let base = path.file_stem().unwrap().to_string_lossy().to_string();
        let text = fs::read_to_string(&path).unwrap();
        let mut lines = text.lines();
        let headers: Vec<&str> = lines.next().expect("header").split('\t').collect();
        let idx = |h: &str| headers.iter().position(|x| *x == h).expect(h);
        let (ni, si, ii, oi, ei) = (
            idx("name"),
            idx("spec"),
            idx("input"),
            idx("output"),
            idx("error"),
        );
        for line in lines {
            if line.trim().is_empty() {
                continue;
            }
            let cols: Vec<&str> = line.split('\t').collect();
            let cell = |i: usize| cols.get(i).copied().unwrap_or("").trim();
            let err_cell = cell(ei);
            out.push(Row {
                name: format!("{}/{}", base, cell(ni)),
                spec: serde_json::from_str(cell(si))
                    .unwrap_or_else(|e| panic!("{}: spec: {}", cell(ni), e)),
                input: serde_json::from_str(cell(ii))
                    .unwrap_or_else(|e| panic!("{}: input: {}", cell(ni), e)),
                output: if err_cell.is_empty() {
                    Some(
                        serde_json::from_str(cell(oi))
                            .unwrap_or_else(|e| panic!("{}: output: {}", cell(ni), e)),
                    )
                } else {
                    None
                },
                err: if err_cell.is_empty() {
                    None
                } else {
                    Some(
                        serde_json::from_str::<String>(err_cell)
                            .unwrap_or_else(|e| panic!("{}: error: {}", cell(ni), e)),
                    )
                },
            });
        }
    }
    out
}

/// A sentinel the port cannot build yet.
struct Unsupported(String);

fn decode_spec(v: &serde_json::Value) -> Result<Spec, Unsupported> {
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
                    "$expr" | "$jsonschema" | "$call" | "$discriminated" => {
                        return Err(Unsupported(k.clone()))
                    }
                    _ => {}
                }
            }
            let mut pairs = Vec::with_capacity(m.len());
            for (k, sv) in m {
                if is_key_expr(k) {
                    return Err(Unsupported(format!("key expression {:?}", k)));
                }
                pairs.push((k.clone(), decode_spec(sv)?));
            }
            Ok(Spec::Obj(pairs))
        }
        other => Ok(Spec::Value(Value::from(other.clone()))),
    }
}

/// A property key that carries an expression, `"a: Min(2)"`: the rule of
/// the TypeScript `KEY_EXPR_RE`, a name (quoted, or without spaces) then a
/// colon and the expression.
fn is_key_expr(k: &str) -> bool {
    let t = k.trim_start();
    let rest = if let Some(after) = t.strip_prefix('"') {
        // A quoted name: skip to the closing quote, honouring escapes.
        let mut chars = after.char_indices();
        let mut end = None;
        while let Some((i, c)) = chars.next() {
            match c {
                '\\' => {
                    chars.next();
                }
                '"' => {
                    end = Some(i);
                    break;
                }
                _ => {}
            }
        }
        match end {
            Some(i) => &after[i + 1..],
            None => return false,
        }
    } else {
        match t.find(|c: char| c.is_whitespace() || c == ':') {
            Some(i) => &t[i..],
            None => return false,
        }
    };
    rest.starts_with(':')
}

/// Both sides through the same JSON normalisation, so numeric width and
/// undefined properties are erased alike.
fn norm(v: serde_json::Value) -> serde_json::Value {
    serde_json::Value::from(Value::from(v))
}

#[test]
fn corpus() {
    let rows = load_rows();
    let strict = std::env::var("SHAPE_RS_STRICT")
        .map(|v| v == "1")
        .unwrap_or(false);
    let mut skipped: Vec<String> = Vec::new();
    let mut failures: Vec<String> = Vec::new();
    let mut passed = 0usize;

    for row in &rows {
        let spec = match decode_spec(&row.spec) {
            Ok(s) => s,
            Err(Unsupported(why)) => {
                skipped.push(format!("{} ({})", row.name, why));
                continue;
            }
        };
        let schema = Schema::new(spec);
        let input = Value::from(row.input.clone());
        match schema.validate(input) {
            Ok(out) => {
                if let Some(want) = &row.err {
                    failures.push(format!(
                        "{}: expected error\n  want: {}\n  got:  success {}",
                        row.name,
                        want,
                        serde_json::Value::from(out)
                    ));
                    continue;
                }
                let got = serde_json::Value::from(out);
                let want = norm(row.output.clone().unwrap());
                if got != want {
                    failures.push(format!(
                        "{}: output mismatch\n  want: {}\n  got:  {}",
                        row.name, want, got
                    ));
                    continue;
                }
                passed += 1;
            }
            Err(e) => {
                let got = e.to_string();
                match &row.err {
                    Some(want) if *want == got => passed += 1,
                    Some(want) => failures.push(format!(
                        "{}: error mismatch\n  want: {}\n  got:  {}",
                        row.name, want, got
                    )),
                    None => {
                        failures.push(format!("{}: unexpected error\n  got:  {}", row.name, got))
                    }
                }
            }
        }
    }

    eprintln!(
        "corpus: {} rows, {} passed, {} failed, {} skipped",
        rows.len(),
        passed,
        failures.len(),
        skipped.len()
    );
    for s in &skipped {
        eprintln!("  skipped {}", s);
    }
    if !failures.is_empty() {
        panic!(
            "{} corpus rows failed:\n{}",
            failures.len(),
            failures.join("\n")
        );
    }
    if strict && !skipped.is_empty() {
        panic!("{} corpus rows skipped", skipped.len());
    }
}

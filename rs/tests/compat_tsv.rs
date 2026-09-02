//! The shared conformance corpus, `test/*.tsv`: every row runs through the
//! Rust port and is compared with what the canonical TypeScript produced. A
//! row whose spec needs a sentinel the port cannot build yet is skipped by
//! name; `SHAPE_RS_STRICT=1` makes a skip a failure.

mod common;

use common::{decode_spec, Unsupported};
use shape::{expr, stringify_node, Schema, Value};

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

/// Every `$expr` source of a spec cell.
fn collect_exprs(v: &serde_json::Value, out: &mut Vec<String>) {
    match v {
        serde_json::Value::Array(a) => a.iter().for_each(|x| collect_exprs(x, out)),
        serde_json::Value::Object(m) => {
            for (k, sv) in m {
                if k == "$expr" {
                    if let Some(src) = sv.as_str() {
                        out.push(src.to_string());
                    }
                } else {
                    collect_exprs(sv, out);
                }
            }
        }
        _ => {}
    }
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
    let mut exprs: Vec<String> = Vec::new();

    for row in &rows {
        collect_exprs(&row.spec, &mut exprs);
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

    // Every expression of the corpus renders back to text that parses to
    // the same rendering, where the string form can express it.
    let mut round_trips = 0usize;
    for src in &exprs {
        let text = stringify_node(&expr(src).unwrap(), false);
        assert!(!text.is_empty(), "{} renders as nothing", src);
        if text.contains(['{', '[']) {
            continue;
        }
        // A rendering the string form cannot read back (a dequoted string
        // argument, as the canonical rendering writes it) is not held to it.
        let Ok(again) = expr(&text) else {
            continue;
        };
        assert_eq!(stringify_node(&again, false), text, "{}", src);
        round_trips += 1;
    }
    eprintln!(
        "expressions: {} parsed, {} round-tripped through stringify",
        exprs.len(),
        round_trips
    );
    assert!(round_trips > 0);
}

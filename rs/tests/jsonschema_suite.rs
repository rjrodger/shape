//! The official JSON Schema Test Suite through the import. Every schema of a
//! draft's required tests is imported and every instance validated, and the
//! verdict must be the suite's, but for the tests the draft's skip ledger
//! lists for this port. A failing test no row covers fails the run, so does a
//! covered test that passes (the change that fixed it deletes its row), and so
//! does a ledger longer than its bound. The TypeScript and Go ports read the
//! same ledgers. See test/json-schema-suite/README.md.

use shape::{from_json_schema, Schema, Value};

use std::fs;
use std::path::{Path, PathBuf};

const PORT: &str = "rs";

// A draft-7 document says so, as the import reads a $ref's siblings by it.
const DRAFT7: &str = "http://json-schema.org/draft-07/schema#";

struct Row {
    file: String,
    group: String,
    test: String,
    ports: Vec<String>,
    text: String,
}

struct Verdict {
    file: String,
    group: String,
    test: String,
    pass: bool,
}

fn suite() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../test/json-schema-suite")
}

fn ledger(draft: &str) -> (Option<usize>, Vec<Row>) {
    let text = fs::read_to_string(suite().join(format!("skips-{draft}.tsv"))).expect("ledger");
    let lines: Vec<&str> = text.lines().filter(|l| !l.is_empty()).collect();
    let bound = lines
        .iter()
        .find_map(|l| l.strip_prefix("# bound: "))
        .and_then(|b| b.trim().parse().ok());
    let rows = lines
        .iter()
        .filter(|l| !l.starts_with('#'))
        .map(|l| {
            let cols: Vec<&str> = l.split('\t').chain(["", "", "", ""]).collect();
            Row {
                file: cols[0].into(),
                group: cols[1].into(),
                test: cols[2].into(),
                ports: cols[3].split(' ').map(String::from).collect(),
                text: l.to_string(),
            }
        })
        .collect();
    (bound, rows)
}

fn compile(draft: &str, mut schema: serde_json::Value) -> Option<Schema> {
    if let (true, Some(m)) = (draft == "draft7", schema.as_object_mut()) {
        m.entry("$schema").or_insert_with(|| DRAFT7.into());
    }
    from_json_schema(&Value::from(schema)).ok().map(Schema::new)
}

fn verdicts(draft: &str) -> Vec<Verdict> {
    let dir = suite().join("tests").join(draft);
    let mut files: Vec<String> = fs::read_dir(&dir)
        .expect("suite dir")
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|f| f.ends_with(".json"))
        .collect();
    files.sort();
    let mut out = Vec::new();
    for file in files {
        let text = fs::read_to_string(dir.join(&file)).expect("suite file");
        let groups: Vec<serde_json::Value> = serde_json::from_str(&text).expect("suite json");
        for g in groups {
            let shape = compile(draft, g["schema"].clone());
            for t in g["tests"].as_array().expect("tests") {
                let want = t["valid"].as_bool().expect("valid");
                let pass = shape
                    .as_ref()
                    .is_some_and(|s| s.valid(&Value::from(t["data"].clone())) == want);
                out.push(Verdict {
                    file: file.clone(),
                    group: g["description"].as_str().unwrap_or("").into(),
                    test: t["description"].as_str().unwrap_or("").into(),
                    pass,
                });
            }
        }
    }
    out
}

fn covers(row: &Row, v: &Verdict) -> bool {
    row.file == v.file
        && (row.group == "*" || row.group == v.group)
        && (row.test == "*" || row.test == v.test)
}

fn check(draft: &str) {
    let (bound, rows) = ledger(draft);
    let mine: Vec<&Row> = rows
        .iter()
        .filter(|r| r.ports.iter().any(|p| p == PORT))
        .collect();
    let vs = verdicts(draft);
    let listed = |v: &Verdict| mine.iter().any(|r| covers(r, v));
    let name = |v: &Verdict| [v.file.as_str(), &v.group, &v.test, PORT].join("\t");
    let unlisted: Vec<String> = vs
        .iter()
        .filter(|v| !v.pass && !listed(v))
        .map(name)
        .collect();
    let passing: Vec<String> = vs
        .iter()
        .filter(|v| v.pass && listed(v))
        .map(name)
        .collect();
    let stale: Vec<&str> = rows
        .iter()
        .filter(|r| !vs.iter().any(|v| covers(r, v)))
        .map(|r| r.text.as_str())
        .collect();
    let bounded = bound.is_some_and(|b| rows.len() <= b);
    assert!(
        unlisted.is_empty() && passing.is_empty() && stale.is_empty() && bounded,
        "the {draft} ledger does not hold:\nunlisted: {unlisted:#?}\npassing: {passing:#?}\nstale: {stale:#?}\nbounded: {bounded} ({} rows, bound {bound:?})",
        rows.len()
    );
}

#[test]
fn draft2020_12() {
    check("draft2020-12");
}

#[test]
fn draft7() {
    check("draft7");
}

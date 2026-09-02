//! The Rust benchmark: shape against garde, validator and the jsonschema
//! crate on the shared cases in bench/cases.json. Prints a JSON document to
//! stdout; the driver (bench/run.js) adds the host and source metadata and
//! files the run.
//!
//! The measurement policy mirrors bench/lib/harness.js and bench/go/main.go:
//! warm up for a fixed time, size a batch to take about a millisecond, then
//! time batches for a fixed budget and record each batch's mean duration per
//! iteration as one sample.

#![allow(dead_code)]

use garde::Validate as GardeValidate;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use shape::{max, min, Schema, Spec, Token, Value};
use std::collections::BTreeMap;
use std::sync::LazyLock;
use std::time::{Duration, Instant};
use validator::Validate as ValidatorValidate;

#[derive(Serialize, Clone, Copy)]
struct Policy {
    warmup_ms: u64,
    time_ms: u64,
    batch_ms: u64,
    min_batches: usize,
    sample_points: usize,
}

#[derive(Serialize)]
struct Result {
    case: String,
    lib: String,
    version: String,
    iterations: u64,
    batch: u64,
    batches: usize,
    mean_ns: f64,
    median_ns: f64,
    p05_ns: f64,
    p95_ns: f64,
    min_ns: f64,
    max_ns: f64,
    stddev_ns: f64,
    ops_per_sec: f64,
    samples_ns: Vec<f64>,
}

#[derive(Deserialize)]
struct Generate {
    #[serde(default)]
    items: usize,
    #[serde(default)]
    keys: usize,
}

#[derive(Deserialize)]
struct Case {
    name: String,
    generate: Option<Generate>,
    input: serde_json::Map<String, serde_json::Value>,
    valid: bool,
    #[serde(rename = "jsonSchema", default)]
    json_schema: serde_json::Value,
}

fn env_u64(name: &str, def: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(def)
}

fn read_policy() -> Policy {
    let quick = std::env::var("BENCH_QUICK").map(|v| v == "1").unwrap_or(false);
    let (warm, budget) = if quick { (50, 100) } else { (300, 2000) };
    Policy {
        warmup_ms: env_u64("BENCH_WARMUP_MS", warm),
        time_ms: env_u64("BENCH_TIME_MS", budget),
        batch_ms: 1,
        min_batches: 10,
        sample_points: 128,
    }
}

/// The smallest non-zero step the clock can report. Windows reports in
/// steps of about half a millisecond, so a batch must run well past one
/// step or its samples are quantised to zero.
fn clock_resolution() -> Duration {
    let mut best = Duration::ZERO;
    for _ in 0..32 {
        let t0 = Instant::now();
        let mut d = Duration::ZERO;
        while d.is_zero() {
            d = t0.elapsed();
        }
        if best.is_zero() || d < best {
            best = d;
        }
    }
    best
}

fn measure(mut f: impl FnMut() -> bool, pol: Policy) -> Result {
    let warm_end = Instant::now() + Duration::from_millis(pol.warmup_ms);
    let mut warm = 0;
    while Instant::now() < warm_end || warm < 10 {
        std::hint::black_box(f());
        warm += 1;
    }
    // A batch takes at least batch_ms and at least 50 clock steps, so timer
    // quantisation is under 2% of a sample; the calibration itself runs
    // until it has spanned a few clock steps.
    let mut target = Duration::from_millis(pol.batch_ms);
    let step = clock_resolution() * 50;
    if step > target {
        target = step;
    }
    let mut calls = 0u64;
    let t0 = Instant::now();
    let mut elapsed = Duration::ZERO;
    while elapsed < target / 10 || calls < 10 {
        std::hint::black_box(f());
        calls += 1;
        elapsed = t0.elapsed();
    }
    let per = (elapsed.as_nanos() as f64 / calls as f64).max(1.0);
    let batch = ((target.as_nanos() as f64) / per).max(1.0) as u64;
    let mut samples = Vec::new();
    let mut iterations = 0u64;
    let end = Instant::now() + Duration::from_millis(pol.time_ms);
    while Instant::now() < end || samples.len() < pol.min_batches {
        let t = Instant::now();
        for _ in 0..batch {
            std::hint::black_box(f());
        }
        let d = t.elapsed();
        samples.push(d.as_nanos() as f64 / batch as f64);
        iterations += batch;
    }
    stats(samples, iterations, batch, pol)
}

fn round1(x: f64) -> f64 {
    (x * 10.0).round() / 10.0
}

fn stats(samples: Vec<f64>, iterations: u64, batch: u64, pol: Policy) -> Result {
    let mut sorted = samples;
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let n = sorted.len();
    let mean = sorted.iter().sum::<f64>() / n as f64;
    let variance = sorted.iter().map(|s| (s - mean) * (s - mean)).sum::<f64>() / n as f64;
    let q = |p: f64| sorted[((p * n as f64).floor() as usize).min(n - 1)];
    Result {
        case: String::new(),
        lib: String::new(),
        version: String::new(),
        iterations,
        batch,
        batches: n,
        mean_ns: round1(mean),
        median_ns: round1(q(0.5)),
        p05_ns: round1(q(0.05)),
        p95_ns: round1(q(0.95)),
        min_ns: round1(sorted[0]),
        max_ns: round1(sorted[n - 1]),
        stddev_ns: round1(variance.sqrt()),
        ops_per_sec: round1(1e9 / mean),
        samples_ns: quantiles(&sorted, pol.sample_points),
    }
}

fn quantiles(sorted: &[f64], points: usize) -> Vec<f64> {
    if sorted.len() <= points {
        return sorted.iter().map(|s| round1(*s)).collect();
    }
    (0..points)
        .map(|i| round1(sorted[(i * (sorted.len() - 1)) / (points - 1)]))
        .collect()
}

/// The key and value at index i of a generated large object.
fn large_key(i: usize) -> String {
    format!("k{:02}", i)
}

fn large_value(i: usize) -> serde_json::Value {
    match i % 4 {
        0 => serde_json::Value::from(format!("v{}", i)),
        1 => serde_json::Value::from(i as u64),
        2 => serde_json::Value::from(i % 8 == 0),
        _ => serde_json::Value::from(i as f64 * 0.5),
    }
}

/// Read cases.json as the harness does, expanding generated inputs and
/// shared schemas, and hash the file with LF line endings so a Windows
/// checkout measures the same cases as everyone else.
fn load_cases(file: &str) -> (Vec<Case>, String) {
    let raw = std::fs::read(file).unwrap_or_else(|e| fail(&format!("{}: {}", file, e)));
    #[derive(Deserialize)]
    struct File {
        cases: Vec<Case>,
    }
    let spec: File = serde_json::from_slice(&raw).unwrap_or_else(|e| fail(&e.to_string()));
    let mut cases = spec.cases;
    let schemas: BTreeMap<String, serde_json::Value> = cases
        .iter()
        .map(|c| (c.name.clone(), c.json_schema.clone()))
        .collect();
    for c in cases.iter_mut() {
        if let Some(g) = &c.generate {
            if g.items > 0 {
                let items: Vec<serde_json::Value> = (0..g.items)
                    .map(|j| {
                        // Integers as integers: a typed struct decodes qty into an i64.
                        serde_json::json!({"sku": format!("SKU-{:04}", j), "qty": (j % 7) as u64, "price": j as f64 * 1.25})
                    })
                    .collect();
                c.input.insert("items".to_string(), serde_json::Value::Array(items));
            }
            if g.keys > 0 {
                let mut properties = serde_json::Map::new();
                let mut required = Vec::new();
                for j in 0..g.keys {
                    let k = large_key(j);
                    c.input.insert(k.clone(), large_value(j));
                    let t = ["string", "integer", "boolean", "number"][j % 4];
                    properties.insert(k.clone(), serde_json::json!({"type": t}));
                    required.push(serde_json::Value::from(k));
                }
                c.json_schema = serde_json::json!({"type": "object", "properties": properties, "required": required, "additionalProperties": false});
            }
        }
        if let Some(r) = c.json_schema.get("$ref").and_then(|r| r.as_str()) {
            if let Some(name) = r.strip_prefix('#') {
                c.json_schema = schemas[name].clone();
            }
        }
    }
    let lf = String::from_utf8_lossy(&raw).replace("\r\n", "\n");
    let digest = Sha256::digest(lf.as_bytes());
    let hex: String = digest.iter().map(|b| format!("{:02x}", b)).collect();
    (cases, hex[..12].to_string())
}

fn fail(msg: &str) -> ! {
    eprintln!("{}", msg);
    std::process::exit(1)
}

/// Shape specs by case, closed objects like the JSON Schemas.
fn shape_spec(name: &str) -> Spec {
    let (s, n, b, i) = (
        Spec::from(Token::String),
        Spec::from(Token::Number),
        Spec::from(Token::Boolean),
        Spec::from(Token::Integer),
    );
    match name {
        "flat" => shape::obj([("id", i), ("name", s.clone()), ("email", s), ("active", b), ("score", n)]),
        "nested" | "invalid" => shape::obj([
            ("id", i),
            ("name", s.clone()),
            ("address", shape::obj([("street", s.clone()), ("city", s.clone()), ("zip", s.clone())])),
            ("tags", shape::arr([s.clone()])),
            ("settings", shape::obj([("theme", s), ("notifications", b)])),
        ]),
        "array" => shape::obj([(
            "items",
            shape::arr([shape::obj([("sku", s), ("qty", i), ("price", n)])]),
        )]),
        "large" => {
            let kinds = [Token::String, Token::Integer, Token::Boolean, Token::Number];
            Spec::Obj((0..50).map(|j| (large_key(j), Spec::from(kinds[j % 4]))).collect())
        }
        "bounds" => shape::obj([
            ("name", Spec::from(max(40, min(3, Token::String)))),
            ("age", Spec::from(max(150, min(0, Token::Integer)))),
            ("code", Spec::from(regex::Regex::new("^[A-Z]{3}$").unwrap())),
            ("ratio", Spec::from(max(1, min(0, Token::Number)))),
        ]),
        other => fail(&format!("no shape spec for case {:?}", other)),
    }
}

// garde and validator work on typed structs, so the input is decoded into
// one per case and library (the two derives cannot share a struct, since
// both name their method validate). A type error in the input is a
// decoding error, not a validation one, so the invalid case is not measured
// for them.

static CODE_RE: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new("^[A-Z]{3}$").unwrap());

#[derive(Deserialize, GardeValidate)]
struct FlatG {
    #[garde(skip)]
    id: i64,
    #[garde(length(min = 1))]
    name: String,
    #[garde(length(min = 1))]
    email: String,
    #[garde(skip)]
    active: bool,
    #[garde(skip)]
    score: f64,
}

#[derive(Deserialize, ValidatorValidate)]
struct FlatV {
    id: i64,
    #[validate(length(min = 1))]
    name: String,
    #[validate(length(min = 1))]
    email: String,
    active: bool,
    score: f64,
}

#[derive(Deserialize, GardeValidate)]
struct AddressG {
    #[garde(length(min = 1))]
    street: String,
    #[garde(length(min = 1))]
    city: String,
    #[garde(length(min = 1))]
    zip: String,
}

#[derive(Deserialize, ValidatorValidate)]
struct AddressV {
    #[validate(length(min = 1))]
    street: String,
    #[validate(length(min = 1))]
    city: String,
    #[validate(length(min = 1))]
    zip: String,
}

#[derive(Deserialize, GardeValidate)]
struct SettingsG {
    #[garde(length(min = 1))]
    theme: String,
    #[garde(skip)]
    notifications: bool,
}

#[derive(Deserialize, ValidatorValidate)]
struct SettingsV {
    #[validate(length(min = 1))]
    theme: String,
    notifications: bool,
}

#[derive(Deserialize, GardeValidate)]
struct NestedG {
    #[garde(skip)]
    id: i64,
    #[garde(length(min = 1))]
    name: String,
    #[garde(dive)]
    address: AddressG,
    #[garde(inner(length(min = 1)))]
    tags: Vec<String>,
    #[garde(dive)]
    settings: SettingsG,
}

#[derive(Deserialize, ValidatorValidate)]
struct NestedV {
    id: i64,
    #[validate(length(min = 1))]
    name: String,
    #[validate(nested)]
    address: AddressV,
    tags: Vec<String>,
    #[validate(nested)]
    settings: SettingsV,
}

#[derive(Deserialize, GardeValidate)]
struct ItemG {
    #[garde(length(min = 1))]
    sku: String,
    #[garde(skip)]
    qty: i64,
    #[garde(skip)]
    price: f64,
}

#[derive(Deserialize, ValidatorValidate)]
struct ItemV {
    #[validate(length(min = 1))]
    sku: String,
    qty: i64,
    price: f64,
}

#[derive(Deserialize, GardeValidate)]
struct ArrayG {
    #[garde(dive)]
    items: Vec<ItemG>,
}

#[derive(Deserialize, ValidatorValidate)]
struct ArrayV {
    #[validate(nested)]
    items: Vec<ItemV>,
}

#[derive(Deserialize, GardeValidate)]
struct BoundsG {
    #[garde(length(min = 3, max = 40))]
    name: String,
    #[garde(range(min = 0, max = 150))]
    age: i64,
    #[garde(pattern(r"^[A-Z]{3}$"))]
    code: String,
    #[garde(range(min = 0.0, max = 1.0))]
    ratio: f64,
}

#[derive(Deserialize, ValidatorValidate)]
struct BoundsV {
    #[validate(length(min = 3, max = 40))]
    name: String,
    #[validate(range(min = 0, max = 150))]
    age: i64,
    #[validate(regex(path = *CODE_RE))]
    code: String,
    #[validate(range(min = 0.0, max = 1.0))]
    ratio: f64,
}

/// The large case: fifty fields cycling through string, integer, boolean
/// and number, as the harness generates them.
#[derive(Deserialize, GardeValidate)]
struct LargeG {
    #[serde(rename = "k00")]
    #[garde(length(min = 1))]
    pub k00: String,
    #[serde(rename = "k01")]
    #[garde(skip)]
    pub k01: i64,
    #[serde(rename = "k02")]
    #[garde(skip)]
    pub k02: bool,
    #[serde(rename = "k03")]
    #[garde(skip)]
    pub k03: f64,
    #[serde(rename = "k04")]
    #[garde(length(min = 1))]
    pub k04: String,
    #[serde(rename = "k05")]
    #[garde(skip)]
    pub k05: i64,
    #[serde(rename = "k06")]
    #[garde(skip)]
    pub k06: bool,
    #[serde(rename = "k07")]
    #[garde(skip)]
    pub k07: f64,
    #[serde(rename = "k08")]
    #[garde(length(min = 1))]
    pub k08: String,
    #[serde(rename = "k09")]
    #[garde(skip)]
    pub k09: i64,
    #[serde(rename = "k10")]
    #[garde(skip)]
    pub k10: bool,
    #[serde(rename = "k11")]
    #[garde(skip)]
    pub k11: f64,
    #[serde(rename = "k12")]
    #[garde(length(min = 1))]
    pub k12: String,
    #[serde(rename = "k13")]
    #[garde(skip)]
    pub k13: i64,
    #[serde(rename = "k14")]
    #[garde(skip)]
    pub k14: bool,
    #[serde(rename = "k15")]
    #[garde(skip)]
    pub k15: f64,
    #[serde(rename = "k16")]
    #[garde(length(min = 1))]
    pub k16: String,
    #[serde(rename = "k17")]
    #[garde(skip)]
    pub k17: i64,
    #[serde(rename = "k18")]
    #[garde(skip)]
    pub k18: bool,
    #[serde(rename = "k19")]
    #[garde(skip)]
    pub k19: f64,
    #[serde(rename = "k20")]
    #[garde(length(min = 1))]
    pub k20: String,
    #[serde(rename = "k21")]
    #[garde(skip)]
    pub k21: i64,
    #[serde(rename = "k22")]
    #[garde(skip)]
    pub k22: bool,
    #[serde(rename = "k23")]
    #[garde(skip)]
    pub k23: f64,
    #[serde(rename = "k24")]
    #[garde(length(min = 1))]
    pub k24: String,
    #[serde(rename = "k25")]
    #[garde(skip)]
    pub k25: i64,
    #[serde(rename = "k26")]
    #[garde(skip)]
    pub k26: bool,
    #[serde(rename = "k27")]
    #[garde(skip)]
    pub k27: f64,
    #[serde(rename = "k28")]
    #[garde(length(min = 1))]
    pub k28: String,
    #[serde(rename = "k29")]
    #[garde(skip)]
    pub k29: i64,
    #[serde(rename = "k30")]
    #[garde(skip)]
    pub k30: bool,
    #[serde(rename = "k31")]
    #[garde(skip)]
    pub k31: f64,
    #[serde(rename = "k32")]
    #[garde(length(min = 1))]
    pub k32: String,
    #[serde(rename = "k33")]
    #[garde(skip)]
    pub k33: i64,
    #[serde(rename = "k34")]
    #[garde(skip)]
    pub k34: bool,
    #[serde(rename = "k35")]
    #[garde(skip)]
    pub k35: f64,
    #[serde(rename = "k36")]
    #[garde(length(min = 1))]
    pub k36: String,
    #[serde(rename = "k37")]
    #[garde(skip)]
    pub k37: i64,
    #[serde(rename = "k38")]
    #[garde(skip)]
    pub k38: bool,
    #[serde(rename = "k39")]
    #[garde(skip)]
    pub k39: f64,
    #[serde(rename = "k40")]
    #[garde(length(min = 1))]
    pub k40: String,
    #[serde(rename = "k41")]
    #[garde(skip)]
    pub k41: i64,
    #[serde(rename = "k42")]
    #[garde(skip)]
    pub k42: bool,
    #[serde(rename = "k43")]
    #[garde(skip)]
    pub k43: f64,
    #[serde(rename = "k44")]
    #[garde(length(min = 1))]
    pub k44: String,
    #[serde(rename = "k45")]
    #[garde(skip)]
    pub k45: i64,
    #[serde(rename = "k46")]
    #[garde(skip)]
    pub k46: bool,
    #[serde(rename = "k47")]
    #[garde(skip)]
    pub k47: f64,
    #[serde(rename = "k48")]
    #[garde(length(min = 1))]
    pub k48: String,
    #[serde(rename = "k49")]
    #[garde(skip)]
    pub k49: i64,
}

#[derive(Deserialize, ValidatorValidate)]
struct LargeV {
    #[serde(rename = "k00")]
    #[validate(length(min = 1))]
    pub k00: String,
    #[serde(rename = "k01")]
    
    pub k01: i64,
    #[serde(rename = "k02")]
    
    pub k02: bool,
    #[serde(rename = "k03")]
    
    pub k03: f64,
    #[serde(rename = "k04")]
    #[validate(length(min = 1))]
    pub k04: String,
    #[serde(rename = "k05")]
    
    pub k05: i64,
    #[serde(rename = "k06")]
    
    pub k06: bool,
    #[serde(rename = "k07")]
    
    pub k07: f64,
    #[serde(rename = "k08")]
    #[validate(length(min = 1))]
    pub k08: String,
    #[serde(rename = "k09")]
    
    pub k09: i64,
    #[serde(rename = "k10")]
    
    pub k10: bool,
    #[serde(rename = "k11")]
    
    pub k11: f64,
    #[serde(rename = "k12")]
    #[validate(length(min = 1))]
    pub k12: String,
    #[serde(rename = "k13")]
    
    pub k13: i64,
    #[serde(rename = "k14")]
    
    pub k14: bool,
    #[serde(rename = "k15")]
    
    pub k15: f64,
    #[serde(rename = "k16")]
    #[validate(length(min = 1))]
    pub k16: String,
    #[serde(rename = "k17")]
    
    pub k17: i64,
    #[serde(rename = "k18")]
    
    pub k18: bool,
    #[serde(rename = "k19")]
    
    pub k19: f64,
    #[serde(rename = "k20")]
    #[validate(length(min = 1))]
    pub k20: String,
    #[serde(rename = "k21")]
    
    pub k21: i64,
    #[serde(rename = "k22")]
    
    pub k22: bool,
    #[serde(rename = "k23")]
    
    pub k23: f64,
    #[serde(rename = "k24")]
    #[validate(length(min = 1))]
    pub k24: String,
    #[serde(rename = "k25")]
    
    pub k25: i64,
    #[serde(rename = "k26")]
    
    pub k26: bool,
    #[serde(rename = "k27")]
    
    pub k27: f64,
    #[serde(rename = "k28")]
    #[validate(length(min = 1))]
    pub k28: String,
    #[serde(rename = "k29")]
    
    pub k29: i64,
    #[serde(rename = "k30")]
    
    pub k30: bool,
    #[serde(rename = "k31")]
    
    pub k31: f64,
    #[serde(rename = "k32")]
    #[validate(length(min = 1))]
    pub k32: String,
    #[serde(rename = "k33")]
    
    pub k33: i64,
    #[serde(rename = "k34")]
    
    pub k34: bool,
    #[serde(rename = "k35")]
    
    pub k35: f64,
    #[serde(rename = "k36")]
    #[validate(length(min = 1))]
    pub k36: String,
    #[serde(rename = "k37")]
    
    pub k37: i64,
    #[serde(rename = "k38")]
    
    pub k38: bool,
    #[serde(rename = "k39")]
    
    pub k39: f64,
    #[serde(rename = "k40")]
    #[validate(length(min = 1))]
    pub k40: String,
    #[serde(rename = "k41")]
    
    pub k41: i64,
    #[serde(rename = "k42")]
    
    pub k42: bool,
    #[serde(rename = "k43")]
    
    pub k43: f64,
    #[serde(rename = "k44")]
    #[validate(length(min = 1))]
    pub k44: String,
    #[serde(rename = "k45")]
    
    pub k45: i64,
    #[serde(rename = "k46")]
    
    pub k46: bool,
    #[serde(rename = "k47")]
    
    pub k47: f64,
    #[serde(rename = "k48")]
    #[validate(length(min = 1))]
    pub k48: String,
    #[serde(rename = "k49")]
    
    pub k49: i64,
}

/// The typed checks of a case: garde's and validator's, each on its own
/// decoded struct.
fn typed_checks(name: &str, input: &serde_json::Value) -> Option<(Box<dyn Fn() -> bool>, Box<dyn Fn() -> bool>)> {
    macro_rules! pair {
        ($g:ty, $v:ty) => {{
            let g: $g = serde_json::from_value(input.clone()).unwrap_or_else(|e| fail(&e.to_string()));
            let v: $v = serde_json::from_value(input.clone()).unwrap_or_else(|e| fail(&e.to_string()));
            Some((
                Box::new(move || GardeValidate::validate(&g).is_ok()) as Box<dyn Fn() -> bool>,
                Box::new(move || ValidatorValidate::validate(&v).is_ok()) as Box<dyn Fn() -> bool>,
            ))
        }};
    }
    match name {
        "flat" => pair!(FlatG, FlatV),
        "nested" => pair!(NestedG, NestedV),
        "array" => pair!(ArrayG, ArrayV),
        "bounds" => pair!(BoundsG, BoundsV),
        "large" => pair!(LargeG, LargeV),
        _ => None,
    }
}

fn crate_version(name: &str) -> String {
    // Cargo.lock lists the resolved version of every dependency.
    let lock = include_str!("../Cargo.lock");
    let mut lines = lock.lines();
    while let Some(line) = lines.next() {
        if line.trim() == format!("name = \"{}\"", name) {
            if let Some(v) = lines.next().and_then(|l| l.trim().strip_prefix("version = \"")) {
                return v.trim_end_matches('"').to_string();
            }
        }
    }
    "unknown".to_string()
}

fn main() {
    let mut args = std::env::args().skip(1);
    let mut cases_file = "../cases.json".to_string();
    while let Some(a) = args.next() {
        if a == "--cases" || a == "-cases" {
            cases_file = args.next().unwrap_or_else(|| fail("--cases needs a path"));
        }
    }

    let pol = read_policy();
    let (cases, hash) = load_cases(&cases_file);
    let versions: BTreeMap<&str, String> = [
        ("shape", shape::VERSION.to_string()),
        ("garde", crate_version("garde")),
        ("validator", crate_version("validator")),
        ("jsonschema", crate_version("jsonschema")),
    ]
    .into_iter()
    .collect();

    let mut out: Vec<Result> = Vec::new();
    for c in &cases {
        let input = serde_json::Value::Object(c.input.clone());
        let shape_input = Value::from(input.clone());
        let schema = Schema::new(shape_spec(&c.name));
        let js = jsonschema::validator_for(&c.json_schema).unwrap_or_else(|e| fail(&e.to_string()));

        let valid = c.valid;
        let shape_check: Box<dyn Fn() -> bool> = Box::new(move || {
            if valid {
                schema.valid(&shape_input)
            } else {
                schema.error(&shape_input).is_empty()
            }
        });
        let js_input = input.clone();
        let js_check: Box<dyn Fn() -> bool> = Box::new(move || js.is_valid(&js_input));
        let mut libs: Vec<(&str, Box<dyn Fn() -> bool>)> = vec![("shape", shape_check)];
        if let Some((g, v)) = typed_checks(&c.name, &input) {
            libs.push(("garde", g));
            libs.push(("validator", v));
        }
        libs.push(("jsonschema", js_check));

        // Sanity: every library agrees on the verdict before it is timed.
        for (lib, f) in &libs {
            let got = f();
            if got != c.valid {
                fail(&format!("case {}: {} says {}, expected {}", c.name, lib, got, c.valid));
            }
        }

        for (lib, f) in &libs {
            let mut r = measure(|| f(), pol);
            r.case = c.name.clone();
            r.lib = lib.to_string();
            r.version = versions[lib].clone();
            eprintln!("{:<8} {:<12} {:>10.1} ns/op", c.name, lib, r.median_ns);
            out.push(r);
        }
    }

    let doc = serde_json::json!({
        "lang": "rs",
        "runtime": {
            "rustc": option_env!("SHAPE_BENCH_RUSTC").unwrap_or("unknown"),
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
            "profile": if cfg!(debug_assertions) { "debug" } else { "release" },
        },
        "versions": versions,
        "input_hash": hash,
        "policy": pol,
        "benchmarks": out,
    });
    println!("{}", serde_json::to_string(&doc).unwrap());
}

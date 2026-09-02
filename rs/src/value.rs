//! The value shape validates: what JSON can carry, plus the four things the
//! canonical behaviour needs and JSON cannot say (an absent value, `NaN`, a
//! date, a bigint), with object keys in insertion order.

use indexmap::IndexMap;
use num_bigint::BigInt;
use std::fmt;

/// An object: keys in insertion order, as a JavaScript object keeps them.
pub type Map = IndexMap<String, Value>;

/// A value under validation, or produced by it.
#[derive(Clone, Debug, PartialEq, Default)]
pub enum Value {
    /// No value at all: a missing property, an absent argument. JavaScript's
    /// `undefined`, which JSON cannot carry.
    #[default]
    Undefined,
    /// A present null.
    Null,
    Bool(bool),
    /// Every number is a double, as in JavaScript; `NaN` is a number here.
    Num(f64),
    Str(String),
    BigInt(BigInt),
    Arr(Vec<Value>),
    Obj(Map),
    /// A date, as milliseconds since the epoch, as a JavaScript `Date` holds it.
    Date(i64),
    /// A function value: opaque, identified so two can be told apart.
    Func(u64),
}

impl Value {
    pub fn is_undefined(&self) -> bool {
        matches!(self, Value::Undefined)
    }

    pub fn is_null(&self) -> bool {
        matches!(self, Value::Null)
    }

    /// The `typeof` of the value as JavaScript reports it (`undefined` and
    /// `null` both read as "value" in messages; see `value_kind`).
    pub fn type_of(&self) -> &'static str {
        match self {
            Value::Undefined => "undefined",
            Value::Null => "object",
            Value::Bool(_) => "boolean",
            Value::Num(_) => "number",
            Value::Str(_) => "string",
            Value::BigInt(_) => "bigint",
            Value::Arr(_) => "object",
            Value::Obj(_) => "object",
            Value::Date(_) => "object",
            Value::Func(_) => "function",
        }
    }

    pub fn as_obj(&self) -> Option<&Map> {
        match self {
            Value::Obj(m) => Some(m),
            _ => None,
        }
    }

    pub fn as_arr(&self) -> Option<&Vec<Value>> {
        match self {
            Value::Arr(a) => Some(a),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Num(n) => Some(*n),
            _ => None,
        }
    }
}

impl From<bool> for Value {
    fn from(b: bool) -> Self {
        Value::Bool(b)
    }
}
impl From<f64> for Value {
    fn from(n: f64) -> Self {
        Value::Num(n)
    }
}
impl From<i64> for Value {
    fn from(n: i64) -> Self {
        Value::Num(n as f64)
    }
}
impl From<i32> for Value {
    fn from(n: i32) -> Self {
        Value::Num(n as f64)
    }
}
impl From<u32> for Value {
    fn from(n: u32) -> Self {
        Value::Num(n as f64)
    }
}
impl From<usize> for Value {
    fn from(n: usize) -> Self {
        Value::Num(n as f64)
    }
}
impl From<&str> for Value {
    fn from(s: &str) -> Self {
        Value::Str(s.to_string())
    }
}
impl From<String> for Value {
    fn from(s: String) -> Self {
        Value::Str(s)
    }
}
impl From<Vec<Value>> for Value {
    fn from(a: Vec<Value>) -> Self {
        Value::Arr(a)
    }
}
impl From<Map> for Value {
    fn from(m: Map) -> Self {
        Value::Obj(m)
    }
}
impl From<BigInt> for Value {
    fn from(b: BigInt) -> Self {
        Value::BigInt(b)
    }
}

/// A number as JavaScript's `Number.prototype.toString` prints it: the
/// shortest digits that read back as the same double, an integer without a
/// point, an exponent below 1e-6 and from 1e21.
pub fn js_number(x: f64) -> String {
    if x.is_nan() {
        return "NaN".to_string();
    }
    if x == 0.0 {
        return "0".to_string();
    }
    if x.is_infinite() {
        return if x > 0.0 { "Infinity" } else { "-Infinity" }.to_string();
    }
    let neg = x < 0.0;
    // Shortest round-trip digits, in scientific form: "d.ddde±x".
    let sci = format!("{:e}", x.abs());
    let (mant, exp) = sci.split_once('e').unwrap_or((&sci, "0"));
    let e: i32 = exp.parse().unwrap_or(0);
    let digits: String = mant.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    // n is the position of the decimal point relative to the digits.
    let n = e + 1;
    let body = if k <= n && n <= 21 {
        format!("{}{}", digits, "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        let (a, b) = digits.split_at(n as usize);
        format!("{}.{}", a, b)
    } else if -6 < n && n <= 0 {
        format!("0.{}{}", "0".repeat((-n) as usize), digits)
    } else {
        let ee = n - 1;
        let esign = if ee < 0 { "-" } else { "+" };
        if k == 1 {
            format!("{}e{}{}", digits, esign, ee.abs())
        } else {
            let (a, b) = digits.split_at(1);
            format!("{}.{}e{}{}", a, b, esign, ee.abs())
        }
    };
    if neg {
        format!("-{}", body)
    } else {
        body
    }
}

/// A date as `Date.prototype.toISOString` prints it: UTC, millisecond precision.
pub fn js_date_string(ms: i64) -> String {
    let days = ms.div_euclid(86_400_000);
    let rem = ms.rem_euclid(86_400_000);
    let (y, m, d) = civil_from_days(days);
    let h = rem / 3_600_000;
    let mi = (rem / 60_000) % 60;
    let s = (rem / 1000) % 60;
    let milli = rem % 1000;
    let year = if (0..=9999).contains(&y) {
        format!("{:04}", y)
    } else if y < 0 {
        format!("-{:06}", -y)
    } else {
        format!("+{:06}", y)
    };
    format!(
        "{}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, m, d, h, mi, s, milli
    )
}

// Days since 1970-01-01 to a proleptic Gregorian civil date.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// A string as `JSON.stringify` prints it, quotes included: no HTML escaping.
pub fn json_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// A value as `JSON.stringify` prints it after shape's replacer: keys in
/// insertion order, no spaces, `NaN` as the text NaN, an undefined element as
/// null and an undefined property omitted, a date as its ISO text.
pub fn json_render(v: &Value) -> String {
    match v {
        Value::Undefined | Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Num(n) => {
            if n.is_nan() {
                "\"NaN\"".to_string()
            } else if n.is_infinite() {
                "null".to_string()
            } else {
                js_number(*n)
            }
        }
        Value::Str(s) => json_text(s),
        Value::BigInt(b) => format!("\"{}\"", b),
        Value::Date(ms) => format!("\"{}\"", js_date_string(*ms)),
        Value::Func(_) => "null".to_string(),
        Value::Arr(a) => {
            let parts: Vec<String> = a.iter().map(json_render).collect();
            format!("[{}]", parts.join(","))
        }
        Value::Obj(m) => {
            let parts: Vec<String> = m
                .iter()
                .filter(|(_, v)| !v.is_undefined())
                .map(|(k, v)| format!("{}:{}", json_text(k), json_render(v)))
                .collect();
            format!("{{{}}}", parts.join(","))
        }
    }
}

/// The limit a rendered value is clipped to in a message.
pub const ERR_VALUE_LIMIT: usize = 111;

/// Clip a rendering to `limit` characters, the last three an ellipsis.
pub fn truncate_text(s: &str, limit: usize) -> String {
    let n = s.chars().count();
    if n <= limit {
        return s.to_string();
    }
    if limit < 3 {
        return s.chars().take(limit).collect();
    }
    let head: String = s.chars().take(limit - 3).collect();
    format!("{}...", head)
}

/// A value as a message names it: its JSON with the quotes stripped, clipped.
pub fn value_to_string(v: &Value) -> String {
    match v {
        Value::Undefined => "undefined".to_string(),
        Value::Null => "null".to_string(),
        Value::Str(s) => truncate_text(&json_text(s).replace('"', ""), ERR_VALUE_LIMIT),
        Value::Num(n) => js_number(*n),
        Value::Bool(b) => b.to_string(),
        Value::BigInt(b) => b.to_string(),
        Value::Date(ms) => js_date_string(*ms),
        Value::Func(_) => "function".to_string(),
        Value::Arr(_) | Value::Obj(_) => {
            truncate_text(&json_render(v).replace('"', ""), ERR_VALUE_LIMIT)
        }
    }
}

/// The kind a message calls a value: "value" for nothing, null or NaN,
/// otherwise its `typeof`, with arrays told from objects.
pub fn value_kind(v: &Value) -> &'static str {
    match v {
        Value::Undefined | Value::Null => "value",
        Value::Num(n) if n.is_nan() => "value",
        Value::Num(_) => "number",
        Value::Str(_) => "string",
        Value::Bool(_) => "boolean",
        Value::BigInt(_) => "bigint",
        Value::Arr(_) => "array",
        Value::Obj(_) | Value::Date(_) => "object",
        Value::Func(_) => "function",
    }
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&value_to_string(self))
    }
}

/// Whether a number is an integer as `Number.isInteger` judges it.
pub fn is_integer(x: f64) -> bool {
    x.is_finite() && x == x.trunc()
}

#[cfg(feature = "serde")]
mod serde_conv {
    use super::{Map, Value};

    impl From<serde_json::Value> for Value {
        fn from(v: serde_json::Value) -> Self {
            match v {
                serde_json::Value::Null => Value::Null,
                serde_json::Value::Bool(b) => Value::Bool(b),
                serde_json::Value::Number(n) => Value::Num(n.as_f64().unwrap_or(f64::NAN)),
                serde_json::Value::String(s) => Value::Str(s),
                serde_json::Value::Array(a) => Value::Arr(a.into_iter().map(Value::from).collect()),
                serde_json::Value::Object(m) => {
                    let mut out = Map::with_capacity(m.len());
                    for (k, v) in m {
                        out.insert(k, Value::from(v));
                    }
                    Value::Obj(out)
                }
            }
        }
    }

    impl From<Value> for serde_json::Value {
        /// As `JSON.stringify` would carry it: an undefined property is dropped,
        /// an undefined element and a NaN become null, a date its ISO text.
        fn from(v: Value) -> Self {
            match v {
                Value::Undefined | Value::Null => serde_json::Value::Null,
                Value::Bool(b) => serde_json::Value::Bool(b),
                // An integral number within the safe range is carried as an
                // integer, so `1` compares equal to `json!(1)`.
                Value::Num(n) if n.fract() == 0.0 && n.abs() < 9007199254740992.0 => {
                    serde_json::Value::from(n as i64)
                }
                Value::Num(n) => serde_json::Number::from_f64(n)
                    .map(serde_json::Value::Number)
                    .unwrap_or(serde_json::Value::Null),
                Value::Str(s) => serde_json::Value::String(s),
                Value::BigInt(b) => serde_json::Value::String(b.to_string()),
                Value::Date(ms) => serde_json::Value::String(super::js_date_string(ms)),
                Value::Func(_) => serde_json::Value::Null,
                Value::Arr(a) => {
                    serde_json::Value::Array(a.into_iter().map(serde_json::Value::from).collect())
                }
                Value::Obj(m) => {
                    let mut out = serde_json::Map::with_capacity(m.len());
                    for (k, v) in m {
                        if !v.is_undefined() {
                            out.insert(k, serde_json::Value::from(v));
                        }
                    }
                    serde_json::Value::Object(out)
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_print_as_javascript_does() {
        let cases: [(f64, &str); 14] = [
            (0.0, "0"),
            (1.0, "1"),
            (-1.0, "-1"),
            (1.5, "1.5"),
            (0.1, "0.1"),
            (100.0, "100"),
            (1e21, "1e+21"),
            (1e20, "100000000000000000000"),
            (123456789012345680000.0, "123456789012345680000"),
            (1e-7, "1e-7"),
            (0.000001, "0.000001"),
            (1.5e-7, "1.5e-7"),
            (1.2345e25, "1.2345e+25"),
            (f64::NAN, "NaN"),
        ];
        for (x, want) in cases {
            assert_eq!(js_number(x), want, "{}", x);
        }
        assert_eq!(js_number(f64::INFINITY), "Infinity");
        assert_eq!(js_number(f64::NEG_INFINITY), "-Infinity");
    }

    #[test]
    fn dates_print_as_iso() {
        assert_eq!(js_date_string(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(
            js_date_string(4_765_132_800_000),
            "2121-01-01T00:00:00.000Z"
        );
        assert_eq!(js_date_string(-1), "1969-12-31T23:59:59.999Z");
        assert_eq!(
            js_date_string(-62_198_755_200_000),
            "-000001-01-01T00:00:00.000Z"
        );
        assert_eq!(
            js_date_string(253_402_300_800_000),
            "+010000-01-01T00:00:00.000Z"
        );
    }

    #[test]
    fn strings_render_with_json_escapes_and_no_quotes() {
        assert_eq!(json_text("a\"b\\c\n\u{1}"), "\"a\\\"b\\\\c\\n\\u0001\"");
        assert_eq!(value_to_string(&Value::from("a\"b\\c")), "a\\b\\\\c");
        let long = "x".repeat(200);
        let t = value_to_string(&Value::from(long.as_str()));
        assert_eq!(t.len(), ERR_VALUE_LIMIT);
        assert!(t.ends_with("..."));
        assert_eq!(truncate_text("abcdef", 2), "ab");
    }

    #[test]
    fn containers_render_in_insertion_order() {
        let mut m = Map::new();
        m.insert("b".into(), Value::from(1));
        m.insert(
            "a".into(),
            Value::Arr(vec![
                Value::Undefined,
                Value::from("x"),
                Value::Num(f64::NAN),
            ]),
        );
        m.insert("u".into(), Value::Undefined);
        m.insert("d".into(), Value::Date(0));
        assert_eq!(
            value_to_string(&Value::Obj(m)),
            "{b:1,a:[null,x,NaN],d:1970-01-01T00:00:00.000Z}"
        );
        assert_eq!(json_render(&Value::Num(f64::INFINITY)), "null");
        assert_eq!(value_kind(&Value::Arr(vec![])), "array");
        assert_eq!(value_kind(&Value::Num(f64::NAN)), "value");
        assert_eq!(value_kind(&Value::Date(0)), "object");
        assert_eq!(value_to_string(&Value::BigInt(BigInt::from(7))), "7");
        assert_eq!(json_render(&Value::BigInt(BigInt::from(7))), "\"7\"");
        assert_eq!(value_to_string(&Value::Func(1)), "function");
        assert_eq!(value_to_string(&Value::Date(0)), "1970-01-01T00:00:00.000Z");
        assert_eq!(json_text("\r\t"), "\"\\r\\t\"");
        assert_eq!(json_render(&Value::Func(1)), "null");
        assert_eq!(value_kind(&Value::Func(1)), "function");
        assert_eq!(value_kind(&Value::BigInt(BigInt::from(1))), "bigint");
        assert_eq!(Value::Func(1).type_of(), "function");
        assert_eq!(Value::Null.type_of(), "object");
        assert_eq!(Value::Undefined.type_of(), "undefined");
        assert_eq!(Value::BigInt(BigInt::from(1)).type_of(), "bigint");
        assert_eq!(Value::Date(0).type_of(), "object");
        assert_eq!(format!("{}", Value::Null), "null");
        assert_eq!(format!("{}", Value::Undefined), "undefined");
        assert_eq!(format!("{}", Value::Bool(true)), "true");
        assert!(is_integer(3.0) && !is_integer(3.5) && !is_integer(f64::NAN));
    }

    #[test]
    fn conversions() {
        assert_eq!(Value::from(true), Value::Bool(true));
        assert_eq!(Value::from(2i64), Value::Num(2.0));
        assert_eq!(Value::from(2i32), Value::Num(2.0));
        assert_eq!(Value::from(2u32), Value::Num(2.0));
        assert_eq!(Value::from(2usize), Value::Num(2.0));
        assert_eq!(Value::from(String::from("s")), Value::Str("s".into()));
        assert_eq!(
            Value::from(vec![Value::Null]),
            Value::Arr(vec![Value::Null])
        );
        assert_eq!(Value::from(Map::new()), Value::Obj(Map::new()));
        assert_eq!(Value::from(BigInt::from(1)), Value::BigInt(BigInt::from(1)));
        assert_eq!(Value::default(), Value::Undefined);
        assert!(Value::Null.is_null());
        assert_eq!(Value::from(1.5).as_f64(), Some(1.5));
        assert_eq!(Value::from("x").as_str(), Some("x"));
        assert!(Value::Null.as_str().is_none() && Value::Null.as_f64().is_none());
        assert!(Value::Null.as_obj().is_none() && Value::Null.as_arr().is_none());
        assert!(Value::Obj(Map::new()).as_obj().is_some());
        assert!(Value::Arr(vec![]).as_arr().is_some());
    }

    #[cfg(feature = "serde")]
    #[test]
    fn serde_round_trip() {
        let j: serde_json::Value =
            serde_json::from_str(r#"{"b":1,"a":[null,"x",true],"c":{"z":1.5}}"#).unwrap();
        let v = Value::from(j.clone());
        let keys: Vec<&String> = v.as_obj().unwrap().keys().collect();
        assert_eq!(keys, vec!["b", "a", "c"]);
        assert_eq!(serde_json::Value::from(v), j);
        let mut m = Map::new();
        m.insert("u".into(), Value::Undefined);
        m.insert("n".into(), Value::Num(f64::NAN));
        m.insert("d".into(), Value::Date(0));
        m.insert("b".into(), Value::BigInt(BigInt::from(3)));
        m.insert("f".into(), Value::Func(0));
        m.insert("e".into(), Value::Arr(vec![Value::Undefined]));
        let out = serde_json::Value::from(Value::Obj(m)).to_string();
        assert_eq!(
            out,
            r#"{"n":null,"d":"1970-01-01T00:00:00.000Z","b":"3","f":null,"e":[null]}"#
        );
    }

    #[test]
    fn remaining_kinds_render() {
        let m = Map::new();
        let cases: Vec<(Value, &str, &str)> = vec![
            (Value::Num(1.0), "number", "number"),
            (Value::Str("s".into()), "string", "string"),
            (Value::BigInt(BigInt::from(2)), "bigint", "bigint"),
            (Value::Arr(vec![]), "object", "array"),
            (Value::Obj(m), "object", "object"),
            (Value::Date(0), "object", "object"),
            (Value::Func(1), "function", "function"),
            (Value::Bool(true), "boolean", "boolean"),
            (Value::Null, "object", "value"),
            (Value::Undefined, "undefined", "value"),
            (Value::Num(f64::NAN), "number", "value"),
        ];
        for (v, ty, kind) in cases {
            assert_eq!(v.type_of(), ty, "{:?}", v);
            assert_eq!(value_kind(&v), kind, "{:?}", v);
        }
        assert_eq!(value_to_string(&Value::Func(1)), "function");
        assert_eq!(value_to_string(&Value::Date(0)), "1970-01-01T00:00:00.000Z");
        assert_eq!(json_text("\r\t"), "\"\\r\\t\"");
        assert_eq!(json_text("a\u{8}b\u{c}c\u{1}d"), "\"a\\bb\\fc\\u0001d\"");
    }
}

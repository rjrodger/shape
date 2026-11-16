//! Coerce: the value converted to the node's kind where the conversion is
//! unambiguous, before the type check; and the strict ISO 8601 date-time
//! both implementations parse identically.

use crate::context::{State, Update};
use crate::node::{Kind, Validator};
use crate::value::{js_number, Value};
use regex::Regex;
use std::sync::{Arc, OnceLock};

/// Strict ISO 8601 / RFC 3339 date-time. Calendar ranges are checked so
/// that 2024-02-30 is rejected rather than rolled over into March. Digits
/// are ASCII, as JavaScript's and Go's `\d` are: the regex crate's `\d`
/// takes any Unicode digit, which no number parse reads.
fn iso_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?(Z|[+-][0-9]{2}:[0-9]{2})$",
        )
        .unwrap()
    })
}

struct IsoParts {
    y: i64,
    mo: i64,
    d: i64,
    h: i64,
    mi: i64,
    s: i64,
    ms: i64,
    /// The offset to subtract, in minutes.
    off: i64,
}

fn iso_parts(s: &str) -> Option<IsoParts> {
    let m = iso_re().captures(s)?;
    // Every read is total: what the pattern admits always parses, and what
    // it might one day admit by mistake is no date rather than a panic.
    let num = |i: usize| m.get(i).map_or(Some(0), |x| x.as_str().parse::<i64>().ok());
    let (y, mo, d, h, mi, sec) = (num(1)?, num(2)?, num(3)?, num(4)?, num(5)?, num(6)?);
    if !(1..=12).contains(&mo) || h > 23 || mi > 59 || sec > 59 {
        return None;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let mut days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][(mo - 1) as usize];
    if leap && mo == 2 {
        days = 29;
    }
    if d < 1 || days < d {
        return None;
    }
    // The fraction is read to milliseconds, as a JavaScript Date keeps it.
    let ms = match m.get(7) {
        Some(f) => format!("{:0<3}", f.as_str().chars().take(3).collect::<String>())
            .parse::<i64>()
            .ok()?,
        None => 0,
    };
    let zone = m.get(8)?.as_str();
    let off = if zone == "Z" {
        0
    } else {
        let oh: i64 = zone.get(1..3)?.parse().ok()?;
        let om: i64 = zone.get(4..6)?.parse().ok()?;
        if oh > 23 || om > 59 {
            return None;
        }
        let total = oh * 60 + om;
        if zone.starts_with('-') {
            -total
        } else {
            total
        }
    };
    Some(IsoParts {
        y,
        mo,
        d,
        h,
        mi,
        s: sec,
        ms,
        off,
    })
}

pub(crate) fn is_iso_date_time(s: &str) -> bool {
    iso_parts(s).is_some()
}

/// Days since the epoch of a civil date (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// A strict ISO 8601 date-time as milliseconds since the epoch.
pub(crate) fn parse_iso_date_time(s: &str) -> Option<i64> {
    let p = iso_parts(s)?;
    let days = days_from_civil(p.y, p.mo, p.d);
    let secs = days * 86400 + p.h * 3600 + p.mi * 60 + p.s - p.off * 60;
    Some(secs * 1000 + p.ms)
}

/// Decimal numeric strings only: no hex, no Infinity, nothing JavaScript's
/// `Number()` would accept that a strict parse would not.
fn numeric_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$").unwrap()
    })
}

/// The value a Coerce node converts `val` to for kind `k`, or None to leave
/// it alone and let the type check report it.
pub(crate) fn coerce_to(k: Kind, val: &Value) -> Option<Value> {
    match k {
        Kind::Number | Kind::Integer => match val {
            Value::Str(v) => {
                let s = v.trim();
                if numeric_re().is_match(s) {
                    return s
                        .parse::<f64>()
                        .ok()
                        .filter(|f| f.is_finite())
                        .map(Value::Num);
                }
                None
            }
            Value::Bool(b) => Some(Value::Num(if *b { 1.0 } else { 0.0 })),
            _ => None,
        },
        Kind::String => match val {
            Value::Bool(b) => Some(Value::Str(b.to_string())),
            Value::Num(f) if f.is_finite() => Some(Value::Str(js_number(*f))),
            _ => None,
        },
        Kind::Boolean => match val {
            Value::Str(s) => match s.trim().to_lowercase().as_str() {
                "true" | "1" => Some(Value::Bool(true)),
                "false" | "0" => Some(Value::Bool(false)),
                _ => None,
            },
            Value::Num(f) if *f == 1.0 => Some(Value::Bool(true)),
            Value::Num(f) if *f == 0.0 => Some(Value::Bool(false)),
            _ => None,
        },
        Kind::Date => match val {
            Value::Str(s) => parse_iso_date_time(s.trim()).map(Value::Date),
            // A JavaScript Date(n) truncates the time value toward zero.
            Value::Num(f) if f.is_finite() => Some(Value::Date(f.trunc() as i64)),
            _ => None,
        },
        _ => None,
    }
}

/// The Coerce check runs ahead of any bound, so a bound sees the converted
/// value. It has no rendering: Coerce is not part of the shape's text.
pub(crate) fn coerce_validator() -> Validator {
    Validator {
        name: "Coerce".to_string(),
        func: Arc::new(|state: &mut State<'_>, update: &mut Update| {
            if let Some(c) = coerce_to(state.node.kind, state.value) {
                update.val = Some(c);
            }
            true
        }),
        args: Vec::new(),
        suffix: None,
        inner: None,
        counted: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_date_times() {
        assert_eq!(parse_iso_date_time("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(
            parse_iso_date_time("2020-01-01T00:00:00Z"),
            Some(1577836800000)
        );
        assert_eq!(
            parse_iso_date_time("2020-01-01T12:30:00.5+02:00"),
            Some(1577874600500)
        );
        assert_eq!(
            parse_iso_date_time("2020-01-01T00:00:00.123456-01:30"),
            Some(1577836800123 + 90 * 60 * 1000)
        );
        assert_eq!(parse_iso_date_time("1969-12-31T23:59:59Z"), Some(-1000));
        assert_eq!(
            parse_iso_date_time("0001-03-01T00:00:00Z"),
            Some(-719103 * 86400000)
        );
        assert!(parse_iso_date_time("2020-02-30T00:00:00Z").is_none());
        assert!(parse_iso_date_time("2020-02-29T00:00:00Z").is_some());
        assert!(parse_iso_date_time("2021-02-29T00:00:00Z").is_none());
        assert!(parse_iso_date_time("2020-13-01T00:00:00Z").is_none());
        assert!(parse_iso_date_time("2020-01-01T24:00:00Z").is_none());
        assert!(parse_iso_date_time("2020-01-01T00:00:00+24:00").is_none());
        assert!(parse_iso_date_time("2020-01-01T00:00:00+01:60").is_none());
        assert!(parse_iso_date_time("2020-01-01").is_none());
        assert!(is_iso_date_time("2000-02-29T00:00:00Z"));
        assert!(!is_iso_date_time("1900-02-29T00:00:00Z"));
    }

    #[test]
    fn only_ascii_digits_are_digits() {
        // A Unicode digit in any field is no date, never a panic: these
        // reached a parse that unwrapped, and the offset a byte slice that
        // split a character.
        for s in [
            "1963-06-1\u{09ea}T00:00:00Z",
            "\u{0661}963-06-14T00:00:00Z",
            "1963-06-14T00:00:00.\u{0665}Z",
            "1963-06-14T00:00:00+0\u{09e7}:00",
            "1963-06-14T00:00:00+01:\u{0663}0",
        ] {
            assert!(parse_iso_date_time(s).is_none(), "{}", s);
        }
        assert_eq!(
            coerce_to(Kind::Number, &Value::from("\u{09e7}\u{09e8}")),
            None
        );
        assert_eq!(
            coerce_to(Kind::Number, &Value::from("12")),
            Some(Value::Num(12.0))
        );
    }

    #[test]
    fn conversions() {
        assert_eq!(
            coerce_to(Kind::Number, &Value::from(" 5 ")),
            Some(Value::Num(5.0))
        );
        assert_eq!(coerce_to(Kind::Number, &Value::from("0x10")), None);
        assert_eq!(coerce_to(Kind::Number, &Value::from("1e999")), None);
        assert_eq!(
            coerce_to(Kind::Integer, &Value::from(true)),
            Some(Value::Num(1.0))
        );
        assert_eq!(
            coerce_to(Kind::Number, &Value::from(false)),
            Some(Value::Num(0.0))
        );
        assert_eq!(coerce_to(Kind::Number, &Value::Null), None);
        assert_eq!(
            coerce_to(Kind::String, &Value::from(true)),
            Some(Value::from("true"))
        );
        assert_eq!(
            coerce_to(Kind::String, &Value::from(1.5)),
            Some(Value::from("1.5"))
        );
        assert_eq!(coerce_to(Kind::String, &Value::Num(f64::NAN)), None);
        assert_eq!(coerce_to(Kind::String, &Value::Null), None);
        assert_eq!(
            coerce_to(Kind::Boolean, &Value::from(" TRUE ")),
            Some(Value::Bool(true))
        );
        assert_eq!(
            coerce_to(Kind::Boolean, &Value::from("0")),
            Some(Value::Bool(false))
        );
        assert_eq!(coerce_to(Kind::Boolean, &Value::from("yes")), None);
        assert_eq!(
            coerce_to(Kind::Boolean, &Value::from(1)),
            Some(Value::Bool(true))
        );
        assert_eq!(
            coerce_to(Kind::Boolean, &Value::from(0)),
            Some(Value::Bool(false))
        );
        assert_eq!(coerce_to(Kind::Boolean, &Value::from(2)), None);
        assert_eq!(coerce_to(Kind::Boolean, &Value::Null), None);
        assert_eq!(
            coerce_to(Kind::Date, &Value::from("2020-01-01T00:00:00Z")),
            Some(Value::Date(1577836800000))
        );
        assert_eq!(coerce_to(Kind::Date, &Value::from("nope")), None);
        assert_eq!(
            coerce_to(Kind::Date, &Value::from(1.9)),
            Some(Value::Date(1))
        );
        assert_eq!(coerce_to(Kind::Date, &Value::Num(f64::INFINITY)), None);
        assert_eq!(coerce_to(Kind::Date, &Value::Null), None);
        assert_eq!(coerce_to(Kind::Any, &Value::from("1")), None);
    }
}

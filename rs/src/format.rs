//! String formats: Email, Url, Uuid, DateTime, Ip, Ipv4, Ipv6. Every pattern
//! is written so that the `regex` crate and the JavaScript engine agree on
//! it: ASCII classes only, no lookaround, explicit whitespace.

use crate::context::{State, Update, UpdateErr};
use crate::node::{Kind, Node, Validator};
use crate::value::Value;
use regex::Regex;
use std::sync::{Arc, OnceLock};

fn re(cell: &'static OnceLock<Regex>, src: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(src).unwrap())
}

/// A pragmatic RFC 5322 addr-spec: a dot-atom local part of at most 64
/// characters, then a dotted domain ending in an alphabetic top-level label,
/// 254 characters in all. No quoted local parts, no address literals.
fn email_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    re(
        &RE,
        "^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*\
         @(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}$",
    )
}

pub(crate) fn is_email(s: &str) -> bool {
    s.len() <= 254 && s.find('@').map(|i| i <= 64).unwrap_or(false) && email_re().is_match(s)
}

/// scheme://[user@]host[:port][/path][?query][#fragment]: an absolute URL
/// with a non-empty host and no whitespace. Nothing is decoded or resolved.
fn url_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    re(
        &RE,
        r"^[A-Za-z][A-Za-z0-9+.-]*://(?:[^ \t\r\n/?#@]+@)?(?:\[[0-9A-Fa-f:.]+\]|[^ \t\r\n/?#@:\[\]]+)(?::\d{1,5})?(?:[/?#][^ \t\r\n]*)?$",
    )
}

/// 8-4-4-4-12 hex digits; any version, including the nil UUID.
fn uuid_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    re(
        &RE,
        r"^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$",
    )
}

/// A dotted quad of decimal octets 0-255 without leading zeros.
fn ipv4_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    re(
        &RE,
        r"^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$",
    )
}

fn hex4_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    re(&RE, r"^[0-9A-Fa-f]{1,4}$")
}

pub(crate) fn is_ipv4(s: &str) -> bool {
    ipv4_re().is_match(s)
}

/// The RFC 4291 text form: eight 16-bit hex groups, one optional `::`
/// standing for a run of zero groups, and optionally a trailing dotted quad
/// in place of the last two groups. No zone index and no prefix length.
pub(crate) fn is_ipv6(s: &str) -> bool {
    let parts: Vec<&str> = s.split("::").collect();
    if parts.len() > 2 {
        return false;
    }
    let head: Vec<&str> = if parts[0].is_empty() {
        Vec::new()
    } else {
        parts[0].split(':').collect()
    };
    let tail: Vec<&str> = if parts.len() == 2 && !parts[1].is_empty() {
        parts[1].split(':').collect()
    } else {
        Vec::new()
    };
    let groups: Vec<&str> = head.iter().chain(tail.iter()).copied().collect();

    let mut count = 0;
    for (i, g) in groups.iter().enumerate() {
        if hex4_re().is_match(g) {
            count += 1;
        } else if i == groups.len() - 1 && (parts.len() == 1 || head.len() <= i) && is_ipv4(g) {
            // A dotted quad may only end the address, so not ahead of a "::".
            count += 2;
        } else {
            return false;
        }
    }
    if parts.len() == 2 {
        count <= 7
    } else {
        count == 8
    }
}

/// One string format builder.
#[derive(Clone, Copy)]
pub(crate) struct Format {
    /// The builder name, and the why code of its error.
    pub name: &'static str,
    /// The noun in "is not a valid <what>".
    pub what: &'static str,
    pub valid: fn(&str) -> bool,
}

pub(crate) const FMT_EMAIL: Format = Format {
    name: "Email",
    what: "email address",
    valid: is_email,
};
pub(crate) const FMT_URL: Format = Format {
    name: "Url",
    what: "URL",
    valid: |s| url_re().is_match(s),
};
pub(crate) const FMT_UUID: Format = Format {
    name: "Uuid",
    what: "UUID",
    valid: |s| uuid_re().is_match(s),
};
pub(crate) const FMT_DATE_TIME: Format = Format {
    name: "DateTime",
    what: "ISO 8601 date-time",
    valid: crate::coerce::is_iso_date_time,
};
pub(crate) const FMT_IP: Format = Format {
    name: "Ip",
    what: "IP address",
    valid: |s| is_ipv4(s) || is_ipv6(s),
};
pub(crate) const FMT_IPV4: Format = Format {
    name: "Ipv4",
    what: "IPv4 address",
    valid: is_ipv4,
};
pub(crate) const FMT_IPV6: Format = Format {
    name: "Ipv6",
    what: "IPv6 address",
    valid: is_ipv6,
};

/// A format is a before on a string-shaped node. It speaks only once the
/// value is known to be present and of the node's kind; otherwise the
/// structural check reports the real problem.
pub(crate) fn format_validator(f: Format) -> Validator {
    Validator {
        name: f.name.to_string(),
        func: Arc::new(move |state: &mut State<'_>, update: &mut Update| {
            if state.absent || crate::builders::type_will_fail(state.node, state.value) {
                return true;
            }
            if let Value::Str(s) = state.value {
                if (f.valid)(s) {
                    return true;
                }
            }
            update.err = Some(UpdateErr::Text(format!(
                "Value \"$VALUE\" for property \"$PATH\" is not a valid {}.",
                f.what
            )));
            update.why = Some(f.name.to_string());
            update.mark = 0;
            false
        }),
        args: Vec::new(),
        suffix: Some(f.name.to_string()),
        inner: None,
    }
}

/// Add the format check. A format is a shape of string, so an untyped node
/// becomes one first.
pub(crate) fn with_format(mut n: Node, f: Format) -> Node {
    if n.kind == Kind::Any {
        n = crate::builders::type_(Kind::String, n);
    }
    n.befores.push(format_validator(f));
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ipv6_forms() {
        assert!(is_ipv6("::1"));
        assert!(is_ipv6("2001:db8::8a2e:370:7334"));
        assert!(is_ipv6("2001:0db8:0000:0000:0000:ff00:0042:8329"));
        assert!(is_ipv6("::ffff:192.168.1.1"));
        assert!(is_ipv6("64:ff9b::192.0.2.33"));
        assert!(!is_ipv6("1:2:3:4:5:6:7:8:9"));
        assert!(!is_ipv6("1::2::3"));
        assert!(!is_ipv6("192.168.1.1::1"));
        assert!(!is_ipv6("2001:db8::8a2e:370:7334:1:2:3"));
        assert!(!is_ipv6("gggg::1"));
        assert!(!is_ipv6("1:2:3:4:5:6:7"));
        assert!(is_ipv6("1:2:3:4:5:6:1.2.3.4"));
        assert!(!is_ipv6("1:2:3:4:5:6:7:1.2.3.4"));
    }

    #[test]
    fn email_limits() {
        assert!(is_email("a@b.co"));
        assert!(!is_email("a"));
        let long_local = format!("{}@b.co", "a".repeat(65));
        assert!(!is_email(&long_local));
        let long = format!("a@{}.co", "b".repeat(260));
        assert!(!is_email(&long));
    }
}

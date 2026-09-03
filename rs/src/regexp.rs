//! The shared regexp subset. A regexp in a shape is read by three engines
//! (JavaScript, RE2 in Go, the regex crate here), which agree only on a
//! subset of syntax and meaning. A pattern is held to that subset and
//! rewritten for this engine, so that the same pattern matches the same
//! strings everywhere; the original text is what renders and exports. The
//! rules are the ones docs/reference/regexp.md states, and the TypeScript
//! and Go implementations carry the same scanner with the same error texts.
//!
//! In the subset: literals, `\` escapes of the syntax characters and `/`,
//! `\t \n \r \f \v` and `\xHH`, character classes with ranges, `\d \w \s`
//! (ASCII) and their negations outside a class, `.` (anything but a
//! newline), `^ $ \b \B`, groups `( )` and `(?: )`, alternation, and the
//! quantifiers `* + ? {n} {n,} {n,m}` with a lazy `?`. Not in it: flags,
//! lookaround, backreferences, named groups, inline flags, POSIX and `\p`
//! classes, `\u` escapes, class set operators and lone braces.

use regex::Regex;

const SYNTAX_ESCAPES: &str = "\\^$.|?*+()[]{}/";
const ASCII_D: &str = "0-9";
const ASCII_W: &str = "A-Za-z0-9_";
const ASCII_S: &str = " \\t\\n\\r\\f\\v";

/// The shared error text for a pattern outside the subset.
pub(crate) fn regexp_fault(src: &str, reason: &str) -> String {
    format!("Shape: invalid regexp /{}/: {}", src, reason)
}

fn is_hex2(s: &[char]) -> bool {
    s.len() == 2 && s.iter().all(|c| c.is_ascii_hexdigit())
}

/// The digits of a `{n}`, `{n,}` or `{n,m}` quantifier at `i`, as the
/// length of the whole brace form, or none.
fn quant_brace(rs: &[char], i: usize) -> Option<usize> {
    let mut j = i + 1;
    let start = j;
    while j < rs.len() && rs[j].is_ascii_digit() {
        j += 1;
    }
    if j == start {
        return None;
    }
    if j < rs.len() && rs[j] == ',' {
        j += 1;
        while j < rs.len() && rs[j].is_ascii_digit() {
            j += 1;
        }
    }
    if j < rs.len() && rs[j] == '}' {
        Some(j + 1 - i)
    } else {
        None
    }
}

/// Validate a pattern against the subset and return the pattern this
/// engine runs, or the shared error text.
pub(crate) fn canonical_regexp(src: &str) -> Result<String, String> {
    let fail = |reason: &str| Err(regexp_fault(src, reason));
    if src.is_empty() {
        return fail("empty pattern");
    }
    let rs: Vec<char> = src.chars().collect();
    let n = rs.len();
    let at = |i: usize| if i < n { rs[i] } else { '\0' };
    let mut out = String::new();
    let mut in_class = false;
    let mut class_items = 0usize; // items so far in the open class
    let mut shorthand = false; // the previous class item was \d \w or \s
    let mut depth = 0i32;
    let mut atom = false; // an atom precedes, so a quantifier may follow
    let mut quant = false; // a quantifier precedes, so a ? makes it lazy

    let mut i = 0usize;
    while i < n {
        let c = rs[i];

        if in_class {
            if c == ']' {
                if class_items == 0 {
                    return fail("empty character class");
                }
                out.push(']');
                in_class = false;
                atom = true;
                quant = false;
                i += 1;
                continue;
            }
            if c == '[' {
                if at(i + 1) == ':' {
                    return fail("POSIX classes are not in the subset");
                }
                return fail("[ must be escaped inside a character class");
            }
            if (c == '&' || c == '~' || c == '-') && at(i + 1) == c {
                return fail("class set operators (&&, --, ~~) are not in the subset");
            }
            if c == '-' {
                // A range: neither end may be a shorthand class.
                let ends = at(i + 1) == ']' || class_items == 0;
                if !ends && shorthand {
                    return fail("a range cannot start or end at a class shorthand");
                }
                if !ends && at(i + 1) == '\\' && "dwsDWS".contains(at(i + 2)) {
                    return fail("a range cannot start or end at a class shorthand");
                }
                out.push('-');
                i += 1;
                continue;
            }
            if c == '\\' {
                i += 1;
                if i >= n {
                    return fail("trailing backslash");
                }
                let e = rs[i];
                shorthand = false;
                if SYNTAX_ESCAPES.contains(e) || e == '-' || "tnrfv".contains(e) {
                    out.push('\\');
                    out.push(e);
                } else if e == 'x' {
                    let h = &rs[(i + 1).min(n)..(i + 3).min(n)];
                    if !is_hex2(h) {
                        return fail("\\x needs two hex digits");
                    }
                    out.push_str("\\x");
                    out.extend(h);
                    i += 2;
                } else if e == 'd' {
                    out.push_str(ASCII_D);
                    shorthand = true;
                } else if e == 'w' {
                    out.push_str(ASCII_W);
                    shorthand = true;
                } else if e == 's' {
                    out.push_str(ASCII_S);
                    shorthand = true;
                } else if e == 'D' || e == 'W' || e == 'S' {
                    return fail("\\D, \\W and \\S are not allowed inside a character class");
                } else if e == 'b' || e == 'B' {
                    return fail("\\b and \\B are not allowed inside a character class");
                } else {
                    return fail(&format!("escape \\{} is not in the subset", e));
                }
                class_items += 1;
                i += 1;
                continue;
            }
            shorthand = false;
            out.push(c);
            class_items += 1;
            i += 1;
            continue;
        }

        if c == '\\' {
            i += 1;
            if i >= n {
                return fail("trailing backslash");
            }
            let e = rs[i];
            if SYNTAX_ESCAPES.contains(e) || "tnrfv".contains(e) {
                out.push('\\');
                out.push(e);
            } else if e == 'x' {
                let h = &rs[(i + 1).min(n)..(i + 3).min(n)];
                if !is_hex2(h) {
                    return fail("\\x needs two hex digits");
                }
                out.push_str("\\x");
                out.extend(h);
                i += 2;
            } else if e == 'd' {
                out.push_str(&format!("[{}]", ASCII_D));
            } else if e == 'D' {
                out.push_str(&format!("[^{}]", ASCII_D));
            } else if e == 'w' {
                out.push_str(&format!("[{}]", ASCII_W));
            } else if e == 'W' {
                out.push_str(&format!("[^{}]", ASCII_W));
            } else if e == 's' {
                out.push_str(&format!("[{}]", ASCII_S));
            } else if e == 'S' {
                out.push_str(&format!("[^{}]", ASCII_S));
            } else if e == 'b' || e == 'B' {
                out.push('\\');
                out.push(e);
                atom = false;
                quant = false;
                i += 1;
                continue;
            } else if e == '-' {
                return fail("escape \\- is only allowed inside a character class");
            } else {
                return fail(&format!("escape \\{} is not in the subset", e));
            }
            atom = true;
            quant = false;
            i += 1;
            continue;
        }

        match c {
            '[' => {
                in_class = true;
                class_items = 0;
                shorthand = false;
                out.push('[');
                if at(i + 1) == '^' {
                    out.push('^');
                    i += 1;
                }
            }
            ']' => return fail("unescaped ]"),
            '(' => {
                if at(i + 1) == '?' {
                    if at(i + 2) != ':' {
                        return fail(
                            "lookaround, named groups and inline flags are not in the subset",
                        );
                    }
                    out.push_str("(?:");
                    i += 2;
                } else {
                    out.push('(');
                }
                depth += 1;
                atom = false;
                quant = false;
            }
            ')' => {
                depth -= 1;
                if depth < 0 {
                    return fail("unbalanced parentheses");
                }
                out.push(')');
                atom = true;
                quant = false;
            }
            '|' | '^' | '$' => {
                out.push(c);
                atom = false;
                quant = false;
            }
            '*' | '+' | '?' => {
                if c == '?' && quant {
                    // Lazy.
                    out.push('?');
                    quant = false;
                    atom = false;
                } else {
                    if !atom {
                        return fail("nothing to repeat");
                    }
                    out.push(c);
                    atom = false;
                    quant = true;
                }
            }
            '{' => {
                let Some(len) = quant_brace(&rs, i) else {
                    return fail("lone quantifier brace");
                };
                if !atom {
                    return fail("nothing to repeat");
                }
                out.extend(&rs[i..i + len]);
                i += len - 1;
                atom = false;
                quant = true;
            }
            '}' => return fail("lone quantifier brace"),
            '.' => {
                out.push_str("[^\\n]");
                atom = true;
                quant = false;
            }
            _ => {
                out.push(c);
                atom = true;
                quant = false;
            }
        }
        i += 1;
    }
    if in_class {
        return fail("unterminated character class");
    }
    if depth != 0 {
        return fail("unbalanced parentheses");
    }
    Ok(out)
}

/// The engine regexp for a pattern in the subset.
pub(crate) fn compile_regexp(src: &str) -> Result<Regex, String> {
    let canon = canonical_regexp(src)?;
    Regex::new(&canon).map_err(|_| regexp_fault(src, "not accepted by the engine"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{check_re, expr, from_json_schema, Schema, Spec, Value};

    const REJECTS: &[(&str, &str)] = &[
        (
            "(?=a)",
            "lookaround, named groups and inline flags are not in the subset",
        ),
        (
            "(?<n>a)",
            "lookaround, named groups and inline flags are not in the subset",
        ),
        (
            "(?i)a",
            "lookaround, named groups and inline flags are not in the subset",
        ),
        ("(a)\\1", "escape \\1 is not in the subset"),
        ("[^]", "empty character class"),
        ("[]", "empty character class"),
        ("\\u00e9", "escape \\u is not in the subset"),
        ("\\p{L}", "escape \\p is not in the subset"),
        ("[[:alpha:]]", "POSIX classes are not in the subset"),
        ("[a[b]", "[ must be escaped inside a character class"),
        (
            "[a&&b]",
            "class set operators (&&, --, ~~) are not in the subset",
        ),
        (
            "[a--b]",
            "class set operators (&&, --, ~~) are not in the subset",
        ),
        (
            "[a~~b]",
            "class set operators (&&, --, ~~) are not in the subset",
        ),
        (
            "[\\d-z]",
            "a range cannot start or end at a class shorthand",
        ),
        (
            "[a-\\d]",
            "a range cannot start or end at a class shorthand",
        ),
        (
            "[\\D]",
            "\\D, \\W and \\S are not allowed inside a character class",
        ),
        (
            "[\\b]",
            "\\b and \\B are not allowed inside a character class",
        ),
        ("[\\q]", "escape \\q is not in the subset"),
        ("[\\x4]", "\\x needs two hex digits"),
        ("[a", "unterminated character class"),
        ("[a\\", "trailing backslash"),
        ("a\\", "trailing backslash"),
        ("\\x4", "\\x needs two hex digits"),
        ("\\-", "escape \\- is only allowed inside a character class"),
        ("\\q", "escape \\q is not in the subset"),
        ("a]", "unescaped ]"),
        ("(a", "unbalanced parentheses"),
        ("a)", "unbalanced parentheses"),
        ("a**", "nothing to repeat"),
        ("*a", "nothing to repeat"),
        ("^*", "nothing to repeat"),
        ("a{", "lone quantifier brace"),
        ("a}", "lone quantifier brace"),
        ("a{x}", "lone quantifier brace"),
        ("a{2x}", "lone quantifier brace"),
        ("{2}", "nothing to repeat"),
        ("a???", "nothing to repeat"),
    ];

    const ACCEPTS: &[(&str, &str, bool)] = &[
        ("^\\d+$", "12", true),
        ("^\\d+$", "١٢", false),
        ("^\\D+$", "ab", true),
        ("^\\D+$", "a1", false),
        ("^\\w+$", "ab_1", true),
        ("^\\w+$", "é", false),
        ("^\\W+$", "é", true),
        ("^\\s+$", " \u{9}", true),
        ("^\\s+$", "\u{a0}", false),
        ("^\\S+$", "ab", true),
        ("^[\\s\\d\\w]+$", " 1a", true),
        ("^[^\\d]+$", "ab", true),
        ("^[^\\d]+$", "a1", false),
        ("^a.b$", "a\u{a}b", false),
        ("^a.b$", "a\u{d}b", true),
        ("^a.b$", "a😀b", true),
        ("^a$", "a\u{a}", false),
        ("\\bx\\b", "a x b", true),
        ("\\bx\\b", "axb", false),
        ("\\Bx\\B", "axb", true),
        ("^x{2,3}?$", "xx", true),
        ("^x{2}$", "xxx", false),
        ("^x{2,}$", "xxxx", true),
        ("^x+?$", "xx", true),
        ("^x*$", "", true),
        ("^(?:a|b)+$", "abab", true),
        ("^(a|b)+$", "abab", true),
        ("^\\/$", "/", true),
        ("^\\x41$", "A", true),
        ("^[a-c-]+$", "a-c", true),
        ("^[-a]+$", "-a", true),
        ("^[\\-\\]\\[]+$", "-][", true),
        ("^é+$", "éé", true),
        ("^\\t\\n\\r\\f\\v$", "\u{9}\u{a}\u{d}\u{c}\u{b}", true),
        ("^[\\t\\n\\r\\f\\v]+$", "\u{9}\u{a}", true),
        (
            "^\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\^\\$\\\\$",
            ".*+?()[]{}|^$\\",
            true,
        ),
        ("^a{1}$", "a", true),
        ("^[a{]+$", "a{", true),
        ("^[a}]+$", "a}", true),
        ("^\\x41\\x62$", "Ab", true),
        ("^[\\x41-\\x43]+$", "AB", true),
        ("^[a\\x2d]+$", "a-", true),
    ];

    #[test]
    fn refuses_outside_the_subset_with_the_shared_text() {
        for (pattern, reason) in REJECTS {
            let want = format!("Shape: invalid regexp /{}/: {}", pattern, reason);
            assert_eq!(
                expr(&format!("/{}/", pattern)).unwrap_err().0,
                want,
                "{}",
                pattern
            );
            assert_eq!(canonical_regexp(pattern).unwrap_err(), want);
            // A regex outside the subset that the crate itself compiles: the
            // node is a fault at validation, as a builder given a wrong
            // argument makes.
            if let Ok(re) = Regex::new(pattern) {
                let s = Schema::new(Spec::from(re.clone()));
                assert_eq!(s.validate(Value::from("a")).unwrap_err().to_string(), want);
                let c = Schema::new(check_re(re, crate::any()));
                assert_eq!(c.validate(Value::from("a")).unwrap_err().to_string(), want);
            }
        }
        assert_eq!(
            expr("/^a$/i").unwrap_err().0,
            "Shape: invalid regexp /^a$/: flags are not supported"
        );
        assert_eq!(
            expr("//").unwrap_err().0,
            "Shape: invalid regexp //: empty pattern"
        );
        assert_eq!(
            expr("Check(/a/i)").unwrap_err().0,
            "Shape: invalid regexp /a/: flags are not supported"
        );
        let js = Value::from(serde_json::json!({"type": "string", "pattern": "(?=a)"}));
        assert!(from_json_schema(&js).is_err());
        assert_eq!(
            compile_regexp("a{9999999999}").unwrap_err(),
            "Shape: invalid regexp /a{9999999999}/: not accepted by the engine"
        );
    }

    #[test]
    fn reads_inside_the_subset_the_same_way() {
        for (pattern, input, ok) in ACCEPTS {
            let v = Value::from(*input);
            let s = Schema::new(expr(&format!("/{}/", pattern)).unwrap());
            assert_eq!(s.valid(&v), *ok, "{} on {:?}", pattern, input);
            let s2 = Schema::new(Spec::from(Regex::new(pattern).unwrap()));
            assert_eq!(s2.valid(&v), *ok, "spec {} on {:?}", pattern, input);
            let s3 = Schema::new(check_re(Regex::new(pattern).unwrap(), crate::any()));
            assert_eq!(s3.valid(&v), *ok, "check {} on {:?}", pattern, input);
            let s4 = Schema::new(crate::any().check_re(Regex::new(pattern).unwrap()));
            assert_eq!(
                s4.valid(&v),
                *ok,
                "chained check {} on {:?}",
                pattern,
                input
            );
            let js = Value::from(serde_json::json!({"type": "string", "pattern": pattern}));
            let imported = from_json_schema(&js).unwrap();
            assert_eq!(
                Schema::new(imported).valid(&v),
                *ok,
                "imported {} on {:?}",
                pattern,
                input
            );
        }
        // The original text is what renders and exports.
        let s = Schema::new(crate::obj([(
            "a",
            Spec::from(Regex::new("^\\d+$").unwrap()),
        )]));
        assert_eq!(crate::stringify_node(s.node(), false), "{a: /^\\d+$/}");
        assert_eq!(
            serde_json::Value::from(s.json_schema())["properties"]["a"]["pattern"],
            serde_json::json!("^\\d+$")
        );
        assert_eq!(
            s.validate(Value::from(serde_json::json!({"a": "\u{661}"})))
                .unwrap_err()
                .to_string(),
            "Validation failed for property \"a\" with string \"\u{661}\" because the string did not match /^\\d+$/."
        );
    }
}

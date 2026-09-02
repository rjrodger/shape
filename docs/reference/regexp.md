# The regexp subset

Every regular expression a shape carries is read by three engines: the
JavaScript engine in TypeScript, RE2 (`regexp`) in Go and the `regex` crate in
Rust. They agree only on a subset of syntax, and read some of what they share
differently (`\d` is ASCII in JavaScript and RE2 but Unicode in the regex
crate; `\s` is ASCII in RE2 and Unicode elsewhere). So a shape holds every
pattern to one subset, checks it at build, and rewrites it for the engine at
hand. The same pattern then matches the same strings in every language, and
the text as written is what renders, exports to JSON Schema and appears in
messages.

This applies wherever a pattern enters a shape: a `/re/` in the string form,
a `RegExp`, `*regexp.Regexp` or `Regex` given to a spec or to `Check`, and a
JSON Schema `pattern` on import.

## What is in the subset

| construct | meaning |
| --- | --- |
| a literal character, ASCII or not | itself, one character being one unit in every engine |
| `\\` `\^` `\$` `\.` `\|` `\?` `\*` `\+` `\(` `\)` `\[` `\]` `\{` `\}` `\/` | that character; `\-` only inside a class |
| `\t` `\n` `\r` `\f` `\v`, `\xHH` | tab, newline, return, form feed, vertical tab, the byte `HH` |
| `.` | any character but a newline (`\n`) |
| `\d` `\w` `\s` | `[0-9]`, `[A-Za-z0-9_]`, `[ \t\n\r\f\v]`: ASCII, whatever the engine's default |
| `\D` `\W` `\S` | the negations, outside a character class only |
| `[abc]` `[a-z]` `[^abc]` | a character class, with ranges; `\d` `\w` `\s` and the escapes above inside it; a `-` first or last is literal |
| `^` `$` | the start and end of the whole string (no multi-line mode) |
| `\b` `\B` | an ASCII word boundary, and not one; outside a class only |
| `( )` `(?: )` | a capturing and a non-capturing group |
| `a\|b` | alternation |
| `*` `+` `?` `{n}` `{n,}` `{n,m}`, each with a `?` suffix | the quantifiers, greedy and lazy |

## What is not, and why

| construct | refused as |
| --- | --- |
| flags (`/re/i`, `new RegExp(re, 'g')`, `(?i)`) | `flags are not supported`; inline flags as below |
| `(?=` `(?!` `(?<=` `(?<!` `(?<name>` `(?P<name>` `(?i)` | `lookaround, named groups and inline flags are not in the subset` (RE2 has no lookaround or backreferences) |
| `\1` and other escapes: `\u`, `\p`, `\a`, `\e`, `\0`, `\c`, `\Q`, `\A`, `\z` | `escape \X is not in the subset` |
| `[[:alpha:]]` | `POSIX classes are not in the subset` (JavaScript reads it as a class of characters) |
| `[^]` `[]` | `empty character class` (JavaScript alone accepts `[^]`) |
| `[a&&b]` `[a--b]` `[a~~b]` | `class set operators (&&, --, ~~) are not in the subset` (the regex crate reads them as set operations) |
| `[` inside a class | `[ must be escaped inside a character class` |
| `\D` `\W` `\S` inside a class | `\D, \W and \S are not allowed inside a character class` |
| `\b` inside a class | `\b and \B are not allowed inside a character class` (a backspace in JavaScript) |
| `[\d-z]` | `a range cannot start or end at a class shorthand` |
| a lone `{` or `}` | `lone quantifier brace` (a literal in RE2, an error in JavaScript) |
| `a**`, `*a`, `a???` | `nothing to repeat` |
| `\-` outside a class, `\x4` | `escape \- is only allowed inside a character class`, `\x needs two hex digits` |
| `//`, `[a`, `(a`, `a)`, `a]`, a trailing `\` | `empty pattern`, `unterminated character class`, `unbalanced parentheses`, `unescaped ]`, `trailing backslash` |

The full text is `Shape: invalid regexp /pattern/: reason`, the same in every
language. In TypeScript it is thrown when the shape is built; in Go and Rust
the string form returns it as the parse error, and a compiled regexp given to
a spec or to `Check` makes a node that reports it at validation, as a builder
given a wrong argument does.

## How the engines are made to agree

The scanner rewrites a pattern before compiling it: `\d`, `\w` and `\s`
become explicit ASCII classes, `.` becomes `[^\n]`, and the JavaScript engine
is given the `u` flag so that `.` and a class see a whole character, as the
RE2 engines do. The rewrite is internal: `stringify`, the JSON Schema export
and error messages all show the pattern as written.

## Writing a portable pattern

- Write `[0-9]` when you mean digits, or `\d`, which now means the same.
- Match Unicode letters with a literal range or class (`[a-zA-ZÀ-ÿ]`); there is
  no `\p{L}`.
- Match case-insensitively with a class (`[uU][lL]`); there are no flags.
- Anchor with `^` and `$`; a trailing newline is not matched by `$`.
- Escape `/` inside a `/re/` in the string form (`/^\/api\//`).

## Gates

Every row of `test/regexp.tsv` runs through all three implementations, and
the differential harness compares the refusals' text. The tables in
`ts/test/regexp.test.ts`, `go/regexp_subset_test.go` and `rs/src/regexp.rs`
pin the same cases per language.

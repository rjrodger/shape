# Rust API reference

The Rust crate is [`shape-schema`](https://crates.io/crates/shape-schema) (the library is
`shape`: `use shape::…`), in [`rs/`](../../rs/README.md).
It matches the canonical TypeScript for validation outcomes, produced values
and exact error text; the [parity page](../explanation/ts-go-parity.md#the-rust-port)
lists its divergences. This page is the Rust surface and its idioms; the
behaviour of each builder is in the [builder reference](builders.md).

## Compilation

```rust
use shape::{shape, Schema, Spec, Token, Options};

let s: Schema = shape(spec);                       // any `impl Into<Spec>`
let s = Schema::new(spec);                          // the same
let s = Schema::with_options(spec, &Options::default());
let s = Schema::parse("String.Min(2)")?;            // the string form; Err(ExprError)
```

A `Spec` is what a schema is compiled from:

| Form | Example | Meaning |
| ---- | ------- | ------- |
| a type token | `Token::String` | required, of that kind |
| a literal | `8080`, `"x"`, `true`, `Value::Null` | optional, that value the default |
| an object | `obj([("a", Spec::from(1))])`, `shape!({ "a": 1 })` | a closed object of those properties |
| an array | `arr([Spec::from(Token::String)])`, `shape!([String])` | an array of that element shape; two or more elements are a tuple |
| a regexp | `Regex::new("^a")?` | a required string matching it |
| a node | `min(2, Token::Number)` | a builder's result |

`shape!` writes a spec as the example it is, in the `serde_json::json!` style:
objects in braces, arrays in brackets, the type tokens bare, and any other
Rust expression a spec can be made from:

```rust
use shape::{shape, min, Schema, Token};

let s = Schema::new(shape!({
    "name": String,
    "port": 8080,
    "tags": [String],
    "age": min(0, Token::Integer),
    "addr": { "zip": String },
}));
```

## `Schema` methods

| Method | Returns | Notes |
| ------ | ------- | ----- |
| `validate(Value)` | `Result<Value, ValidationError>` | the produced value, defaults injected |
| `validate_ctx(Value, &mut Context)` | the same | with a context of the caller's, for custom validators |
| `validate_into::<T>(impl Into<Value>)` | `Result<T, IntoError>` | produce, then deserialize into `T` by serde (feature `serde`, on by default) |
| `valid(&Value)` / `matches(&Value)` | `bool` | a verdict, nothing produced or rendered |
| `error(&Value)` | `Vec<FieldError>` | every issue, empty when valid |
| `json_schema()` | `Value` | the JSON Schema export (draft 2020-12) |
| `standard()` | `StandardSchema` | the Standard Schema V1 surface |
| `node()` | `&Node` | the compiled tree |
| `defs()` | `&HashMap<String, Arc<Node>>` | the `define`d nodes |

`validate` takes its input by value and produces in place. `Value::Undefined`
is no value at all, as a bare `shape()` call is in TypeScript.

## Values

`shape::Value` is what is validated and produced: what JSON can carry, plus
the four things the canonical behaviour needs and JSON cannot say.

| Variant | Stands for |
| ------- | ---------- |
| `Undefined` | no value: a missing property, an absent argument |
| `Null` | a present null |
| `Bool`, `Num(f64)`, `Str`, `BigInt` | the scalars; every number is a double, `NaN` included |
| `Arr(Vec<Value>)`, `Obj(Map)` | containers; `Map` is an insertion-ordered `IndexMap` |
| `Date(i64)` | a date, as milliseconds since the epoch |
| `Func(u64)` | an opaque function value, told apart by id |

`From` conversions exist for the Rust scalars, `&str`, `String`, `Vec`,
`Map` and `BigInt`, and, with the `serde` feature, both ways with
`serde_json::Value` (an undefined property is dropped, `NaN` becomes null, a
date its ISO text).

## Tokens

`Token::{Any, String, Number, Boolean, Object, Array, Function, Integer, Date, BigInt}`.
A token is required (but for `Any`) and carries the kind's empty value as the
default it injects once made optional. `Token::Object` accepts any keys;
`Token::Array` any elements.

## Builders

Every builder is a free function taking the spec it applies to as its last
argument, and a chain method on `Node`. Pass `any()` for the bare form.

| Builder | Chain |
| ------- | ----- |
| `required(spec)`, `optional(spec)`, `default(value, spec)`, `default_of(value)` | `.required()`, `.optional()`, `.default_to(value)` |
| `skip(spec)`, `ignore(spec)`, `empty(spec)`, `nullable(spec)`, `fault(msg, spec)`, `never(spec)` | `.skip()`, `.ignore()`, `.empty()`, `.nullable()`, `.fault(msg)`, `.never()` |
| `open(spec)`, `closed(spec)`, `child(child, spec)`, `rest(child, spec)` | `.open()`, `.closed()`, `.child(c)`, `.rest(c)` |
| `type_(kind, spec)`, `func(spec)` | `.type_(kind)`, `.string()`, `.number()`, `.boolean()`, `.object()`, `.array()`, `.function()`, `.integer()`, `.date()`, `.any()`, `.func()` |
| `exact(values)` | `.exact(values)` |
| `min(bound, spec)`, `max(..)`, `above(..)`, `below(..)`, `len(length, spec)` | `.min(b)`, `.max(b)`, `.above(b)`, `.below(b)`, `.len(n)` |
| `check(f, spec)`, `check_re(regex, spec)`, `before(f, spec)`, `after(f, spec)` | `.check(f)`, `.check_re(re)`, `.before(f)`, `.after(f)` |
| `one(shapes)`, `some(shapes)`, `all(shapes)`, `discriminated(tag, branches)` | – |
| `define(name, spec)`, `refer(name, spec)`, `refer_with(name, ReferOptions, spec)` | `.define(name)`, `.refer(name)`, `.refer_with(name, opts)` |
| `rename(name, spec)`, `rename_with(name, RenameOptions, spec)` | `.rename(name)`, `.rename_with(name, opts)` |
| `key()`, `key_depth(depth)`, `key_join(depth, sep)`, `key_args(&[Value])` | – |
| `catch(fallback, spec)`, `transform(f, spec)`, `describe(text, spec)` | `.catch(v)`, `.transform(f)`, `.describe(text)` |
| `coerce(spec)`, `email(spec)`, `url(spec)`, `uuid(spec)`, `date_time(spec)`, `ip(spec)`, `ipv4(spec)`, `ipv6(spec)` | `.coerce()`, `.email()`, `.url()`, `.uuid()`, `.date_time()`, `.ip()`, `.ipv4()`, `.ipv6()` |
| `pick(names, spec)`, `omit(names, spec)`, `partial(spec)`, `extend(extra, spec)` | `.pick(names)`, `.omit(names)`, `.partial()`, `.extend(extra)` |

The chain method for `Default` is `default_to`, to leave `Default::default`
alone; the one for `Type` is `type_`, since `type` is a keyword. Builders
consume the node they are given and return it, so a compiled `Schema` is
immutable and `Send + Sync`; a base to reshape twice is cloned first.

A builder called with a wrong argument (`min("x", ..)`, `len(-1, ..)`,
`define("", ..)`, `pick("z", ..)`) cannot fail at the call, as it throws in
TypeScript, and returns a node that accepts nothing and reports the same
message at validation. In the string form it is an `ExprError`.

## Custom validators

`check`, `before` and `after` take `Fn(&mut State, &mut Update) -> bool`.
The `State` is the value, the node, the path (`path`, `path_arr`,
`path_str()`), the key, whether the value is absent, and the `Context`; the
`Update` is what the validator reports: `err` (a text with `$PATH` and
`$VALUE`, a `FieldError`, or several), `why` and `mark`, a replacement
`val`, a replacement `node`, and `done` to stop the node's other checks.
`transform` takes `Fn(Value, &mut State) -> Value`.

The `Context` carries a typed map of the caller's own state (`get::<T>`,
`set`), the `define`d shapes met on the call, and every error raised.

## Options

`Options` has three switches, as the canonical `ShapeOptions` does:
`key_expr` (on: `"a: Min(1)"` keys are key expressions), `meta` with
`meta_suffix` (off: `"a$$"` keys are metadata for `"a"`) and `val_expr` with
`val_expr_mark` (off: the string under the mark key is an expression applied
to the object).

## Errors

`ValidationError` holds `issues: Vec<FieldError>` and prints them joined by
newlines, the canonical text. A `FieldError` has `path`, `path_arr`, `key`,
`kind`, `value`, `why`, `mark`, `text`, `args` and `check`; see the
[error reference](errors.md).

## The string form

`expr(src)` parses an expression to a `Node`; `expr_apply(src, carrier)`
applies one to a spec, as key and value expressions do; `stringify_node`
renders a node as its spec text. The grammar is the one of
[the string DSL](../how-to/use-the-string-dsl.md).

## JSON Schema

`Schema::json_schema()` and `shape::json_schema(&node)` export;
`shape::from_json_schema(&Value)` imports, returning a `Spec` to compile or
compose further, or a `JsonSchemaError`.

## Positional arguments (`Argu`)

```rust
let argu = shape::Argu::new("mylib");
let sig = argu.signature("foo", [("a", Spec::from(Token::Number)), ("b", Spec::from(skip(Token::String)))])?;
let named: shape::Map = sig.apply(vec![Value::from(2)])?;
```

A `skip` slot is optional and shifts the ones after it; a `rest` slot
captures whatever remains; too many arguments, or one that does not match,
is an `ArguError` with the canonical text.

## Version

`shape::VERSION` is the crate version.

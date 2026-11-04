# Rust API reference

The Rust crate is [`shape-schema`](https://crates.io/crates/shape-schema) (the library is
`shape`: `use shape::…`), in [`rs/`](../../rs/README.md).
It matches the canonical TypeScript for validation outcomes, produced values
and exact error text; the [parity page](../explanation/ts-go-parity.md#the-rust-port)
lists its divergences. This page is the Rust surface and its idioms; the
behaviour of each builder is in the [builder reference](builders.md).

## Compilation

```rust
use shape::{Options, Schema, Shape, Spec, Token};

let s: Schema = Shape(spec); // any `impl Into<Spec>`
let s = Schema::new(spec); // the same
let s = Schema::with_options(spec, &Options::default());
let s = Schema::parse("String.Min(2)")?; // the string form; Err(ExprError)
```

A `Spec` is what a schema is compiled from:

| Form | Example | Meaning |
| ---- | ------- | ------- |
| a type token | `Token::String` | required, of that kind |
| a literal | `8080`, `"x"`, `true`, `Value::Null`, `null()` | optional, that value the default |
| a literal object | `from_map(map)` | a `Map` as a spec: an object of those properties, each a literal |
| an object | `obj([("a", Spec::from(1))])`, `shape!({ "a": 1 })` | a closed object of those properties |
| an array | `arr([Spec::from(Token::String)])`, `shape!([String])` | an array of that element shape; two or more elements are a tuple |
| a regexp | `Regex::new("^a")?` | a required string matching it |
| a node | `Min(2, Token::Number)` | a builder's result |

`shape!` writes a spec as the example it is, in the `serde_json::json!` style:
objects in braces, arrays in brackets, the type tokens bare, and any other
Rust expression a spec can be made from:

```rust
use shape::{shape, Min, Schema, Token};

let s = Schema::new(shape!({
    "name": String,
    "port": 8080,
    "tags": [String],
    "age": Min(0, Token::Integer),
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
| `json()` | `Result<Value, JsonError>` | the declarative JSON, read back by `build` |
| `json_schema()` | `Value` | the JSON Schema export (draft 2020-12) |
| `standard()` | `StandardSchema` | the Standard Schema V1 surface: `version` 1, `vendor` `"shape"`, and `validate(Value)`, a `StandardResult` of the value or the issues, never failing |
| `node()` | `&Node` | the compiled tree |
| `defs()` | `&HashMap<String, Arc<Node>>` | the `Define`d nodes |

`validate` takes its input by value and produces in place. `Value::Undefined`
is no value at all, as a bare `shape()` call is in TypeScript. The `Node` of
the tree is a plain struct (`kind: Kind`, `required`, its children, its
`befores` and `afters` as `Validator`s); `Node::of(kind)` is a bare one.

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
`serde_json::Value` (an undefined property is dropped, `NaN` and a function
become null, a date its ISO text). The accessors are `is_undefined()`,
`is_null()`, `as_f64()`, `as_str()`, `as_arr()`, `as_obj()` and `type_of()`,
the JavaScript `typeof`.

## Tokens

`Token::{Any, String, Number, Boolean, Object, Array, Function, Integer, Date, BigInt}`.
A token is required (but for `Any`) and carries the kind's empty value as the
default it injects once made optional. `Token::Object` accepts any keys;
`Token::Array` any elements.

## Builders

Builders keep the names they have in TypeScript and Go, upper case, and so
do their chain methods: `Min(2, Token::Number)`,
`buildize(Token::String).Min(3)`. The crate allows Rust's `non_snake_case`
lint for them, and calling them raises no warning in your code. Where Rust
needs a second function for what TypeScript does with one, the second is
named the same way: `DefaultOf`, `CheckRe`, `ReferWith`, `RenameWith`,
`KeyDepth`, `KeyJoin` and `KeyArgs`. The rest of the API (`Schema::new`,
`validate`, `expr`, `build`, `buildize`, `obj`, `arr`) is snake case, as its
TypeScript counterparts are lower case.

Every builder is a free function taking the spec it applies to as its last
argument, and a chain method on `Node`. `buildize(spec)` is the node a spec
compiles to, where a chain starts; pass `Any()` for the bare form.

| Builder | Chain |
| ------- | ----- |
| `Required(spec)`, `Optional(spec)`, `Default(value, spec)`, `DefaultOf(value)` | `.Required()`, `.Optional()`, `.Default(value)` |
| `Skip(spec)`, `Ignore(spec)`, `Empty(spec)`, `Nullable(spec)`, `Fault(msg, spec)`, `Never(spec)` | `.Skip()`, `.Ignore()`, `.Empty()`, `.Nullable()`, `.Fault(msg)`, `.Never()` |
| `Open(spec)`, `Closed(spec)`, `Child(child, spec)`, `Rest(child, spec)` | `.Open()`, `.Closed()`, `.Child(c)`, `.Rest(c)` |
| `Type(kind, spec)`, `Func(spec)` | `.Type(kind)`, `.String()`, `.Number()`, `.Boolean()`, `.Object()`, `.Array()`, `.Function()`, `.Integer()`, `.Date()`, `.Any()`, `.Func()` |
| `Exact(values)` | `.Exact(values)` |
| `Min(bound, spec)`, `Max(..)`, `Above(..)`, `Below(..)`, `Len(length, spec)` | `.Min(b)`, `.Max(b)`, `.Above(b)`, `.Below(b)`, `.Len(n)` |
| `Check(f, spec)`, `CheckRe(regex, spec)`, `Before(f, spec)`, `After(f, spec)` | `.Check(f)`, `.CheckRe(re)`, `.Before(f)`, `.After(f)` |
| `All(shapes)`, `Nof(count, shapes)` (the count a whole number, or a spec for it), `Discriminated(tag, branches)` (the branches `(name, spec)` pairs) | n/a |
| `Define(name, spec)`, `Refer(name, spec)`, `ReferWith(name, ReferOptions, spec)` | `.Define(name)`, `.Refer(name)`, `.ReferWith(name, opts)` |
| `Rename(name, spec)`, `RenameWith(name, RenameOptions, spec)` | `.Rename(name)`, `.RenameWith(name, opts)` |
| `Key()`, `KeyDepth(depth)`, `KeyJoin(depth, sep)`, `KeyArgs(&[Value])` | n/a |
| `Catch(fallback, spec)`, `Transform(f, spec)`, `Describe(text, spec)` | `.Catch(v)`, `.Transform(f)`, `.Describe(text)` |
| `Coerce(spec)`, `Email(spec)`, `Url(spec)`, `Uuid(spec)`, `DateTime(spec)`, `Ip(spec)`, `Ipv4(spec)`, `Ipv6(spec)` | `.Coerce()`, `.Email()`, `.Url()`, `.Uuid()`, `.DateTime()`, `.Ip()`, `.Ipv4()`, `.Ipv6()` |
| `Pick(names, spec)`, `Omit(names, spec)`, `Partial(spec)`, `Extend(extra, spec)` | `.Pick(names)`, `.Omit(names)`, `.Partial()`, `.Extend(extra)` |

The chain method `.Default(value)` leaves `Default::default` alone, since
Rust names are case-sensitive, and `Type` needs no escape, not being a
keyword. Builders consume the node they are given and return it, so a
compiled `Schema` is immutable and `Send + Sync`; a base to reshape twice is
cloned first.

The argument types: `Pick` and `Omit` take a `Names`, made from a `&str`, a
`String`, a `Vec` or an array of them; `Type` takes a `TypeRef`, made from
a `Kind`, a `Token`, a kind's name or a `Node`; `CheckRe` takes a
`regex::Regex`; `Exact` any iterator of values. `ReferOptions` has `fill`
(substitute even when the value is absent) and `strict` (a name with no
`Define` is an error); `RenameOptions` has `keep` (keep the original key
too) and `claim` (other keys to read from when the renamed one is missing).

A builder called with a wrong argument (`Min("x", ..)`, `Len(-1, ..)`,
`Define("", ..)`, `Pick("z", ..)`) cannot fail as TypeScript's throwing
builders do; it returns a fault node that accepts nothing and reports the
message at validation. The string form refuses it instead: `expr` and
`Schema::parse` return an `ExprError` for a wrong argument (`Shape: Min
needs a number`) as for a malformed expression, which is what `expr` throws
in TypeScript.

## Custom validators

`Check`, `Before` and `After` take `Fn(&mut State, &mut Update) -> bool`,
`Send + Sync + 'static` (the `ValidatorFn` type). The `State` is the
`value`, the `node`, the path (`path_arr`, a slice of `PathPart`;
`path_str()` dotted; `path_keys()` as strings), the `key`,
`parent_is_array`, `absent` (missing, rather than present and null),
`is_match` (a `valid` call: nothing is produced), `check_name`, and the
`Context`; the `Update` is what the validator reports: `err` (an
`UpdateErr`: a text with `$PATH` and `$VALUE`, a `FieldError`, or several),
`why` and `mark`, a replacement `val`, a replacement `node`, `done` to stop
the node's other checks, and `fatal` to end the walk's errors there.
`Transform` takes `Fn(Value, &mut State) -> Value` (the `TransformFn`
type).

The `Context` carries `custom`, a typed map of the caller's own state
(`get::<T>`, `set`), `refs`, the `Define`d shapes met on the call, and
`err`, every error raised.

## Options

`Options` has three switches, as the canonical `ShapeOptions` does:
`key_expr` (on: `"a: Min(1)"` keys are key expressions), `meta` with
`meta_suffix` (off: `"a$$"` keys are metadata for `"a"`) and `val_expr` with
`val_expr_mark` (off: the string under the mark key is an expression applied
to the object).

## Errors

`ValidationError` holds `issues: Vec<FieldError>` and prints them joined by
newlines, the canonical text. A `FieldError` has `path`, `path_arr`, `key`,
`kind`, `value`, `why`, `mark`, `text`, `args` and `check`, and prints its
`text`; see the [error reference](errors.md). The `why` codes and `mark`
numbers are the `WHY_*` and `MARK_*` constants of `shape::error`. Both
types are `std::error::Error`, as are `IntoError` (`Validation` or
`Deserialize`, from `validate_into`), `ExprError`, `ArguError` and
`JsonSchemaError`, the last three newtypes of their message.

## The string form

`expr(src)` parses an expression to a `Node`; `expr_apply(src, carrier)`
applies one to a spec, as key and value expressions do;
`stringify_node(&node, inline)` renders a node as its spec text, `inline`
writing a string value bare, as a composite message does. The grammar is the one of
[the string DSL](../how-to/use-the-string-dsl.md).

## JSON Schema

`Schema::json_schema()` and `shape::json_schema(&node)` export;
`shape::from_json_schema(&Value)` imports, returning a `Spec` to compile or
compose further, or a `JsonSchemaError`. `shape::jsonschema::JSON_SCHEMA_DRAFT`
is the `$schema` URL written.

## Positional arguments (`Argu`)

```rust
use shape::{Skip, Spec, Token, Value};

let argu = shape::Argu::new("mylib");
let sig = argu.signature(
    "foo",
    [
        ("a", Spec::from(Token::Number)),
        ("b", Spec::from(Skip(Token::String))),
    ],
)?;
let named: shape::Map = sig.apply(vec![Value::from(2)])?; // {"a": 2, "b": Undefined}
```

`argu.validate(args, whence, spec)` compiles and applies in one call. A
`Skip` slot is optional and shifts the ones after it; a `Rest` slot
captures whatever remains; too many arguments, or one that does not match,
is an `ArguError` with the canonical text
(`mylib (foo): Too many arguments for type signature (was 3, expected 2)`).

## Version

`shape::VERSION` is the crate version.

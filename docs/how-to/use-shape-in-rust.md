# How to use Shape in Rust

**Goal:** apply everything in these docs from Rust, accounting for the
language differences from the canonical TypeScript.

## Install

```sh
cargo add shape-schema
```

The package is `shape-schema` (crates.io already had an unrelated `shape`);
the library it provides is `shape`, so the code reads `use shape::…`.
Requires Rust 1.75 or later. The `serde` feature (on by default) adds the
conversions with `serde_json::Value` and `validate_into`; turn it off with
`default-features = false` for a dependency-light build.

## Write a spec

A spec is an example of the value: a literal is optional with that default,
a type token is required, an object or array carries its children. The
`shape!` macro writes one in the `serde_json::json!` style, with the type
tokens as bare words and any other Rust expression standing for a builder's
result:

```rust
use shape::{min, shape, Schema, Token, Value};

let s = Schema::new(shape!({
    "port": 8080,                    // optional, defaults to 8080, must be a number
    "host": "localhost",             // optional, defaults to "localhost"
    "debug": Boolean,                // required
    "workers": min(1, Token::Integer),
    "tags": [String],
}));
```

Without the macro, `obj([("a", Spec::from(1))])` and `arr([..])` build the
same, and `Schema::parse("String.Min(2)")` reads the string form.

## Validate

```rust
let input = Value::from(serde_json::json!({ "debug": true, "workers": 2 }));
let out = s.validate(input.clone())?;
// out == { "debug": true, "workers": 2, "port": 8080, "host": "localhost", "tags": [] }

let ok = s.valid(&input); // a verdict, nothing produced
let errs = s.error(&input); // every FieldError
let cfg: Config = s.validate_into(input)?; // produce, then deserialize with serde
```

`validate` takes the value and gives the produced one back; there is no
copy-on-write, since ownership already says who may write.

## Values are JSON-shaped, and a little more

`shape::Value` carries what JSON does plus the absent value (`Undefined`),
`NaN`, dates (`Date(ms)`) and big integers. Objects keep insertion order, so
the produced value and the messages naming unknown keys read in the input's
order, as in TypeScript. Convert with `Value::from(serde_json::Value)` and
back with `serde_json::Value::from(value)`.

## Builders are functions and chain methods

Every builder takes the spec it applies to last (`min(2, Token::Number)`) and
exists as a chain method too (`buildize(Token::Number).min(2)`); pass
`any()` for a builder with no spec. `Default` is `default_to` as a method and
`Type` is `type_`. Builders consume the node they are given: clone a base
you mean to reshape twice.

A builder given a wrong argument returns a fault node that reports the
message at validation, since a Rust function cannot throw as the TypeScript
one does; `Schema::parse` returns the same node, and is an `ExprError` only
for an expression that does not parse.

## Custom validation

```rust
use shape::{check, Token};

let even = check(
    |state, update| {
        if state
            .value
            .as_f64()
            .map(|n| n % 2.0 == 0.0)
            .unwrap_or(false)
        {
            return true;
        }
        update.err = Some(shape::UpdateErr::Text(
            "Value \"$VALUE\" for property \"$PATH\" must be even.".into(),
        ));
        false
    },
    Token::Integer,
);
// under {"n": even}, 3 fails: Value "3" for property "n" must be even.
```

`before` and `after` take the same closure; `transform` a `Fn(Value, &mut State) -> Value`.
The closure must be `Send + Sync + 'static`, so a compiled schema can be
shared between threads.

## Language differences

- No `Symbol` token; a function is an opaque `Value::Func(id)`.
- `exact` compares object and array literals by value, where TypeScript
  compares them by identity.
- A wrong builder argument is a fault node, not a panic.
- String lengths are counted in UTF-16 units, as JavaScript counts them.

See the [Rust API reference](../reference/rust-api.md) and the
[parity page](../explanation/ts-go-parity.md#the-rust-port).

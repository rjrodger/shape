# shape

Rust port of the [`shape`](https://github.com/rjrodger/shape) schema-by-example
validator. Your schema looks (almost) exactly like your data.

```rust
use shape::{shape, Schema, Value};

let s = Schema::new(shape!({
    "port": 8080,          // optional, defaults to 8080, must be a number
    "host": "localhost",   // optional, defaults to "localhost", must be a string
    "debug": Boolean,      // required, must be a boolean
}));

let out = s.validate(Value::from(serde_json::json!({ "debug": true })))?;
// out == { "debug": true, "port": 8080, "host": "localhost" }
```

The TypeScript implementation in [`../ts`](../ts/README.md) is canonical: this
port matches it for validation outcomes, produced values and exact error
text, and a [shared conformance corpus](../test/README.md) plus a
[differential harness](../test/differential/README.md) keep it that way. The
full documentation is in [`../docs`](../docs/README.md); the Rust surface is
in the [Rust API reference](../docs/reference/rust-api.md) and the
[how-to](../docs/how-to/use-shape-in-rust.md).

## Install

```sh
cargo add shape-schema
```

The package is `shape-schema`, since crates.io already had an unrelated
`shape`; the library is `shape`, so the code reads `use shape::…`. Requires
Rust 1.75 or later. The `serde` feature (on by default) adds the conversions
with `serde_json::Value` and `validate_into`.

## Concepts

A schema is built from an example value. Literal values become **optional
with a default**; type tokens (`Token::String`, `Token::Number`, ...) become
**required**. Objects are closed unless opened (`open`, `child`); a
one-element array is an element shape, a longer one a tuple.

Every builder of the canonical implementation is here as a function taking
the spec it applies to last, and as a chain method:

```rust
use shape::{max, min, optional, Token};

let port = optional(max(65535, min(1, Token::Integer)));
let name = shape::buildize(Token::String).min(3).max(40);
```

`validate` produces the value with defaults injected; `valid` gives a
verdict without producing; `error` lists every issue; `validate_into::<T>`
deserializes the produced value with serde; `json_schema` exports a JSON
Schema and `from_json_schema` imports one; `Schema::parse` reads the string
form (`"String.Min(2)"`).

## Development

```sh
cargo test --all-features        # unit tests, doc tests and the shared corpus
cargo clippy --all-targets --all-features -- -D warnings
./cover.sh                        # 100% line coverage, by cargo-llvm-cov
make diff-rs                      # from the repository root: the differential harness
```

## License

MIT

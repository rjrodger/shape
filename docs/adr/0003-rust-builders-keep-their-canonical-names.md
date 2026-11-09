# 0003—Rust builders keep their canonical names

- **Status:** Accepted
- **Date:** 2026-11-04
- **Applies to:** `rs/`: every builder function and chain method, and the
  `Shape` entry point

## Context

TypeScript names its builders in upper camel case (`Min`, `Required`,
`DateTime`), and Go names them the same way, as its exported names must be.
The Rust port followed Rust's convention instead: snake case functions and
methods (`min`, `required`, `date_time`). Two names changed further to get
out of the language's way: `type_` for `Type`, since `type` is a keyword, and
the chain method `default_to` for `Default`, to keep clear of
`Default::default`. A spec read differently in Rust than in the two languages
it is held to, and a reader moving between them had a mapping to learn.

The Rust compiler warns on a function or method whose name is not snake case
(the `non_snake_case` lint), and the crate's lint gate turns warnings into
errors. The warning is raised where a name is defined, never where it is
called.

## Decision

**The Rust builders and their chain methods take the names they have in
TypeScript and Go. The crate allows `non_snake_case`.**

- `Min(2, Token::Number)`, `Required(spec)`, `DateTime(spec)`,
  `Nof(1, [..])`; on a node, `.Min(2)` and `.Required()`.
- `Type` and `.Default(value)` replace `type_` and `default_to`: in upper case
  neither name needs an escape.
- Where Rust needs a second function for what TypeScript does with one
  builder, the second takes the same case: `DefaultOf`, `CheckRe`,
  `ReferWith`, `RenameWith`, `KeyDepth`, `KeyJoin` and `KeyArgs`.
- `Shape(spec)` compiles a schema, as it does in TypeScript and Go.
- The rest of the API stays snake case, as its TypeScript counterparts are
  lower case: `Schema::new`, `validate`, `expr`, `build`, `buildize`,
  `from_json_schema`, `obj`, `arr` and the `shape!` macro.

## Consequences

- A spec reads the same in all three languages, but for the type tokens,
  which stay `Token::String` in Rust outside the `shape!` macro.
- The crate is unusual among Rust crates in exporting upper-case functions.
  Calling them raises no warning, since the lint fires only where a name is
  defined.
- A builder cannot take a name that Rust's prelude already gives a value.
  `Some` was such a name until `Nof` replaced it: defined in the crate, it
  would hide `Option::Some` from any code that imports the crate with a
  glob. `Default` and `Extend` share their names with prelude traits, which
  Rust allows, since it resolves a function name apart from a trait name.
- The rename breaks every caller, so the crate needs a new minor version
  until it reaches 1.0.

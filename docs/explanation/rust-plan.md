# Rust implementation plan

**A third implementation of shape, in `rs/`, held to the same contract as the
Go port: TypeScript defines the behaviour, the shared corpus and the
differential harness are the gate, and the parity page records what cannot
match.** This page says what the crate looks like, how it plugs into the
gates the repository already has, in what order it is built, and what will be
hard. It is a plan, not a design record; the decisions that turn out to be
expensive to revisit get an ADR when they are made.

## Why a port, and what it is held to

The Go port showed the shape of the work: about 13,000 lines of Go and 6,000
of tests reproduced every builder, the string DSL, key and value expressions,
JSON Schema export and import, the object algebra and the exact error text,
and the [parity page](ts-go-parity.md) lists the handful of divergences that
are inherent to the language. Rust follows the same path, with the same
rules from [AGENTS.md](../../AGENTS.md):

- **TypeScript is canonical.** A behaviour question is answered by
  `ts/src/shape.ts`; the Rust code mirrors it. A behaviour change starts in
  TypeScript, regenerates the corpus, and is then mirrored in Go and Rust.
- **The corpus and the harness are the gate.** Every row of `test/*.tsv`
  (313 rows today, across ten files) must pass, comparing the produced
  value and the *complete* error text; then the differential harness must
  agree on schema, re-import, verdict, value and error text for its
  thousands of generated cases.
- **Coverage is 100% lines**, measured with `cargo llvm-cov`, with no
  ignore pragmas; dead code is removed, not excused.
- **Divergences are documented**, on the parity page, never silent.

## Where Rust differs from Go before a line is written

Three properties of the language change the design, and two of them make
parity *easier* than it was for Go.

**Values are typed.** Go validated `map[string]any` and leaned on `any` to
carry whatever JSON decoded to, with sentinels (`Null`, an absent marker)
bolted on for the two things `any` cannot say. Rust has no `any`, so the
value type is a decision, and the plan takes it up front: shape gets its own
`Value` enum rather than validating `serde_json::Value` directly, because
the canonical behaviour needs four things JSON cannot represent:

| need | why it matters for parity |
| ---- | ------------------------- |
| *absent* versus `null` | a missing property is "the property is missing"; a present `null` is a type error, or accepted by `Nullable` |
| `NaN` | `Required(NaN)` is a corpus row; JSON has no NaN |
| a date | `Date` is a kind with its own message text and ISO rendering |
| insertion order of object keys | error order, closed-object messages and rendered values follow key order in TypeScript |

So: `enum Value { Undefined, Null, Bool(bool), Num(f64), Str(String),
BigInt(BigInt), Arr(Vec<Value>), Obj(Map), Date(i64), Func(FuncId) }`,
with `Map` an insertion-ordered map (`indexmap`), and
`From<serde_json::Value>` / `Into<serde_json::Value>` behind a `serde`
feature so a caller who decoded with serde pays one conversion. That
feature must require `serde_json`'s `preserve_order`, or the order is lost
before the value reaches shape; and callers can `Deserialize` straight
into `Value`, which keeps order without it. Numbers are `f64` throughout,
as in TypeScript; an `Integer` is an `f64` with no fractional part; a
`BigInt` is its own variant (`num-bigint`), since the canonical `BigInt`
token and bigint defaults are behaviour the JSON-based gates cannot carry,
so the crate pins them with unit tests of its own. This is the one place
the plan asks for an ADR before work starts, because every other module
builds on it.

**Ordered maps close the largest Go divergence.** Go's alphabetical key
order was the parity page's first entry: it changes the order of multiple
errors and how an object renders inside a message, so the differential
cases are written with keys in alphabetical order to keep the Go comparison
exact. With `indexmap` the Rust port walks keys in insertion order, as
TypeScript does, so the harness can add cases whose keys are not in
alphabetical order and compare Rust's error text exactly on those too.

**Ownership makes two of this year's hardest problems disappear.** Builders
consume and return nodes (`Min(0, Integer)`, or `Integer.min(0)`), so a
compiled `Schema` is immutable, `Send + Sync`, and cannot be given a
validator after the fact: the generation counters both other ports needed
have nothing to detect. And the producing walk takes its input by value
(`validate(input: Value) -> Result<Value, ValidationError>`), so it produces
in place like TypeScript with no copy and no copy-on-write. `valid(&Value)`
and `match(&Value)` borrow and run terse, recording errors without text as
the other ports' boolean calls now do; `error(&Value)` borrows too but
runs the full diagnostic path, since its whole purpose is the rendered
errors.

## The crate

```
rs/
  Cargo.toml            shape, edition 2021, MSRV pinned; features: serde, regex
  src/
    lib.rs              re-exports; Shape(), ShapeOptions; Version
    value.rs            Value, Map, conversions, JS-compatible number and date rendering
    node.rs             Node: kind, required, skippable, children, befores/afters, meta
    normalize.rs        spec → Node (the example rules: literal = default, token = required)
    builders.rs         every builder as a function and as a chain method
    validate.rs         the walk: objects, arrays, leaves, defaults, closed/open, Child/Rest
    error.rs            FieldError, ValidationError, the default texts, $PATH/$VALUE expansion
    context.rs          Context (Custom, Refs), State, Update
    expr.rs             the string DSL and key/value expressions
    jsonschema.rs       export
    jsonschema_import.rs import
    algebra.rs          Pick, Omit, Partial, Extend
    discriminated.rs    Discriminated
    isolate.rs          Catch, Ignore, Transform
    format.rs           Email, DateTime, ... (the format builders)
    coerce.rs           Coerce
    argu.rs             MakeArgu (positional arguments)
    stringify.rs        node → spec text (the .String() / describe rendering)
    derive.rs           ValidateInto<T: DeserializeOwned> (serde feature; the struct story)
    standard.rs         the Standard Schema surface (a non-throwing result: value or issues with array paths), as go/standard.go
  tests/
    compat_tsv.rs       the corpus runner (test/*.tsv, every sentinel)
    difftool.rs         the differential runner, gated on DIFF_IN / DIFF_OUT
    ...                 unit tests per module, as go/*_test.go
  README.md             the crate's README (docs.rs front page)
```

The module list mirrors `go/*.go` one for one on purpose: when a corpus row
fails, the Go file of the same name is the second reference after
`shape.ts`, and it already contains the port's answer to every
"how do you say this without `any`" question.

### Spec by example, in a language without object literals

The Go port writes a spec as `map[string]any{"name": shape.String}`. Rust
has no untyped literal, so the plan gives three ways to say a spec, all
producing the same `Node`:

1. **Builders**, the primary form: `Shape::new(obj([("name", String),
   ("age", Min(0, Integer))]))`.
2. **A `shape!` macro** in the style of `serde_json::json!`, so a spec reads
   like the TypeScript one: `shape!({ "name": String, "age": Min(0,
   Integer), "tags": [String] })`. Literals become defaults, tokens become
   required kinds, nested braces become objects, brackets arrays; builders
   are ordinary expressions inside it.
3. **The string DSL**, which is part of the contract anyway, for a single
   expression: `Shape::parse("Min(0, Integer)")`, and inside a key
   expression of the structured forms (`"age: Min(0)": 18`). The DSL has
   no object-literal grammar in TypeScript or Go, and Rust adds none; an
   object is written with the builders or the macro.

The corpus and differential decoders use builders only, mapping the
sentinels (`$type`, `$open`, `$closed`, `$required`, `$optional`, `$expr`,
`$jsonschema`, `$call`, `$discriminated`) exactly as `go/compat_tsv_test.go`
does.

### Construction faults

A Rust builder cannot throw, and returning `Result` from every builder would
make chains unreadable. The plan takes the Go answer: a builder given a
wrong argument (`Min("x")`, `Len(-1)`, `Define("")`) returns a node that
accepts nothing and reports the same message TypeScript throws at build,
which surfaces at validation. The parity page already describes this for
Go; the entry becomes "Go and Rust".

### Custom validators

`Before(|state: &mut State, update: &mut Update| -> bool)` and `After`,
`Check`, with `State` exposing `path`, `key`, `value`, `parent`, `node` and
`ctx.custom` as the other ports do. `custom` is type-erased
(`HashMap<String, Box<dyn Any + Send + Sync>>`, with typed `get`/`insert`
helpers), not a map of `Value`: TypeScript takes any property and Go uses
`map[string]any`, and a validator may keep a counter, a handle or a domain
object there. Closures must be `Send + Sync` for the `Schema` to be; that
is the one constraint the Go port did not have, and it is the right one.

## Plugging into the gates

Nothing new is invented here; each gate grows a third runner.

| gate | today | with Rust |
| ---- | ----- | --------- |
| corpus | `ts/test/compat.test.ts`, `go/compat_tsv_test.go` | `rs/tests/compat_tsv.rs`, run by `cargo test` |
| differential | `run-ts.js`, `go/difftool_test.go` (JSONL in, JSONL out) | `rs/tests/difftool.rs` with the same `DIFF_IN`/`DIFF_OUT` contract; `compare.js` diffs Go and Rust against TypeScript |
| coverage | 100% lines (TS), 100% statements (Go) | 100% lines by `cargo llvm-cov`, read from its lcov export (`rs/cover.sh`), which merges the unit-test and corpus binaries |
| style | `gofmt` | `cargo fmt --check`, `cargo clippy -- -D warnings` |
| Makefile | `build-go`, `test-go`, `diff` | `build-rs`, `test-rs`, `diff-rs`; `build`, `test`, `diff` include them |
| CI | `go-build-and-test` on three OSes, `parity` | `rust-build-and-test` on the same three, stable toolchain; `parity` runs `diff-rs` |
| bench | `bench/go` (a binary printing the run document) | `bench/rs`, same protocol, against `garde`/`validator` and the `jsonschema` crate; the report and site take a third language |
| publish | npm by OIDC, Go by tag | crates.io by trusted publishing (OIDC), version in `Cargo.toml`, tag `rs/vX.Y.Z`; a `rust` input on the Publish workflow. The package is `shape-schema` (crates.io already had a `shape`); the library is `shape` |
| docs | `docs/reference/go-api.md`, `use-shape-in-go.md` | `rust-api.md`, `use-shape-in-rust.md`; the parity page becomes the ports page with a column per language |

`compare.js` already compares error text exactly, for Go as for Rust, and
canonicalises only structured values (schemas, produced values); that does
not change. What Rust adds is the freedom to include cases whose keys are
not in alphabetical order, which the Go comparison has to avoid.

## The parity traps, named now

These are where the Go port lost its time, and where Rust will too unless
they are done first.

1. **Number rendering.** Error text renders values as JavaScript does:
   `1`, not `1.0`; `1e21`, not `1000000000000000000000`; the shortest
   round-trip for fractions. Go needed `numText`; Rust needs the same, built
   on `ryu` with JavaScript's integer and exponent rules, and it is the
   first thing to write and test, before any message.
2. **String rendering.** Values in messages are JSON-escaped with the quotes
   stripped and truncated at 111 characters with `...`; keys inside rendered
   objects likewise. Copy the rules from `go/error.go`.
3. **Dates.** `Date` values render as `toISOString()` and compare by
   milliseconds; a bound for a `Date` is a date or a number of milliseconds.
4. **Regular expressions.** The `regex` crate is RE2-like, as Go's is:
   no lookaround, no backreferences. Same divergence as Go, same entry on
   the parity page.
5. **Absent versus null at the root.** Go could not tell `Validate(nil)`
   from a present null and needed a sentinel; Rust can (`Value::Undefined`
   is a value), so the root reads as TypeScript's `shape()` versus
   `shape(null)`. A Go divergence closed.
6. **The extra-key message lists every unknown key**, in key order, in one
   message; and the missing-property message names the property rather
   than rendering a value. Both are pinned by rows; both are easy to get
   almost right.
7. **`Function` and `Symbol` kinds.** A function is a value in TypeScript
   and best-effort in Go; Rust carries an opaque `Value::Func` so the kind
   exists and its messages match, and has no Symbol, as Go has none.
8. **`Exact` compares by identity in TypeScript** (strict equality: an
   object, array or date matches only the same reference) and structurally
   in Go, which the parity page records. An owned `Value` compares
   structurally too, so Rust takes Go's side of that entry, says so on the
   parity page, and pins it with a unit test, since the JSON gates cannot
   see identity.
9. **Behaviour the JSON gates cannot carry** (`BigInt`, `Exact` identity,
   the Standard Schema surface, `Function` values) gets unit tests in the
   crate written from the TypeScript tests, so the gates being green never
   means those are untested.

## Phases

Each phase claims a set of corpus rows and ends with every one of them
passing and none skipped: the runner reports skipped rows by name, and a
claim is only green at zero skips. Rows with an `$expr`, `$call`,
`$discriminated` or `$jsonschema` cell in an otherwise-claimed file belong
to the phase that builds that sentinel, so a file is fully claimed only
when its last sentinel is. Every phase is at 100% coverage of what exists,
with `cargo fmt` and `clippy` clean; the differential harness is turned on
in phase 5 and stays on.

| # | phase | claims | done when |
| - | ----- | ------ | --------- |
| 0 | **Scaffold.** Crate, `Value` and `Map`, JS-compatible number/string/date rendering, `Node`, the corpus runner that decodes every sentinel and skips what it cannot build yet, `make test-rs`, the CI job. | – | the runner reads all ten files and reports per-row skips; rendering has unit tests for the JS rules |
| 1 | **Core walk.** `normalize` (literal → default, token → required), objects (closed, open, `Child`, `Rest`), arrays (tuples, child shape, `Rest`), leaves (`String`, `Number`, `Integer`, `Boolean`, `Date`, `Any`, `Null`, `Never`), `Required`/`Optional`/`Default`/`Skip`/`Empty`/`Nullable`, defaults injected, `valid`/`validate`/`error`, the default error texts. | the rows of `defaults`, `objects` and `arrays` with no sentinel but `$type`, `$open`, `$closed`, `$required`, `$optional` | every claimed row passes, none skipped |
| 2 | **Builders.** Bounds (`Min`/`Max`/`Above`/`Below`/`Len`/`Exact`), `Check`/`Before`/`After`, `Fault`, `Describe`, `Type`, `Rename` (with claim), `Define`/`Refer` (with `strict`), `Catch`/`Ignore`/`Transform`, `Key`, `Closed`/`Open`, the format builders, `Coerce`, `One`/`Some`/`All`; builder argument checks as fault nodes; the unit tests for `BigInt` and `Exact`. | the same sentinels in `builders`, `checks`, `composition`, `misc` | every claimed row passes, none skipped; `docs/reference/builders.md` has nothing the crate lacks |
| 3 | **The string DSL and expressions.** `expr`, key expressions (`"a: Min(1)"`), value expressions, meta keys; the `shape!` macro. | `keyexpr`, and every `$expr` row of the files above | every claimed row passes, none skipped; `Shape::parse` round-trips `stringify` on every expression in the corpus |
| 4 | **Schema and structure.** JSON Schema export and import, `Pick`/`Omit`/`Partial`/`Extend`, `Discriminated`, `MakeArgu`, `ValidateInto<T>` by serde, the Standard Schema surface with its unit tests. | `jsonschema`, `algebra`, and every `$discriminated`, `$call` and `$jsonschema` row | every corpus row passes, none skipped |
| 5 | **The wide net.** `rs/tests/difftool.rs`, `make diff-rs`, `compare.js` with Rust as a second port, exact error order; coverage to 100%; parity page entries for Rust. | – | `make diff` agrees on every case for both ports; CI `parity` runs both |
| 6 | **Bench, docs, publish.** `bench/rs`, the report and site with three languages, `rust-api.md` and the how-to, the crate README, trusted publishing and the `rust` input on Publish. | – | a Measure run records Rust on three platforms; `cargo publish --dry-run` passes; `shape` on crates.io at `0.1.0` |

Phase 1 is the largest single step and the one that decides the walk's
shape; phases 2 and 4 are wide but each builder is small and has its rows;
phase 3 is a parser and the second reference is `go/expr.go`. The Go port
took its phases in this order and it held.

### Performance, deliberately last

Rust will be the fastest port without trying, and the temptation is to
design for it. The plan does not: phase 1 writes the plain recursive walk
that `go/validate.go` has, with owned values and no allocation tricks, and
measures in phase 6. The performance plan's lessons apply afterwards
(compile once is free here; terse verdicts and the missing per-node
allocations are the whole list), and the [performance report](https://rjrodger.github.io/shape/perf/)
shows the result beside the other two.

## Order of work

| # | pull request | gate at the end |
| - | ------------ | --------------- |
| 1 | ADR: the `Value` type and the three spec forms | – |
| 2 | Phase 0: crate, rendering, corpus runner, Makefile, CI job | `make test-rs` runs (all rows skipped) |
| 3 | Phase 1 | the plain rows of `defaults`, `objects`, `arrays` green, none skipped |
| 4 | Phase 2 | the plain rows of `builders`, `checks`, `composition`, `misc` green |
| 5 | Phase 3 | `keyexpr` and every `$expr` row green |
| 6 | Phase 4 | every corpus row green, zero skips |
| 7 | Phase 5 | `make diff` green for Go and Rust; 100% coverage |
| 8 | Phase 6 | bench recorded, docs, `0.1.0` on crates.io |

Each pull request is reviewable on its own and leaves every existing gate
green; the TypeScript and Go code do not change, except where a Rust row
exposes a TypeScript behaviour worth pinning, which then gets a corpus row
first, as any change does.

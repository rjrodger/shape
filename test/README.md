# Shared conformance corpus

Language-neutral test specs that pin **TypeScript ↔ Go ↔ Rust parity**. Every
`*.tsv` file here is run by *all three* implementations:

- TypeScript — `ts/test/compat.test.ts`
- Go — `go/compat_tsv_test.go`
- Rust — `rs/tests/compat_tsv.rs`

The TypeScript build is canonical: the `output`/`error` columns are computed
from it, so TS passes by construction and the Go and Rust ports are measured
against it.

## File format

Tab-separated, one case per row, with a header row:

| column   | meaning                                                              |
| -------- | -------------------------------------------------------------------- |
| `name`   | test name (prefixed with the file's basename by each harness)        |
| `spec`   | the shape specification (JSON, with sentinels — see below)            |
| `input`  | the value to validate (JSON)                                         |
| `output` | expected produced value (JSON), compared JSON-normalized             |
| `error`  | if non-empty, the **complete** expected message, JSON-encoded         |

A row sets **either** `output` (must pass) **or** `error` (must fail).

The `error` cell is compared **exactly**, not by substring. It holds the whole
message as a JSON string, which both keeps embedded newlines out of the TSV row
and makes separator, ordering and extra-error differences fail the gate — those
are precisely the ways the implementations drift. A produced `undefined`
(from `Ignore`/`Skip`) is written as `null`, matching how every harness
normalizes before comparing.

## Spec sentinels

`spec`/`input` cells are JSON. Objects with a single sentinel key decode to a
builder in every language:

| sentinel                     | decodes to                          |
| ---------------------------- | ----------------------------------- |
| `{"$type":"String"}`         | required type token (`String`, …)   |
| `{"$open":X}`                | `Open(X)`                           |
| `{"$closed":X}`              | `Closed(X)`                         |
| `{"$required":X}`            | `Required(X)`                       |
| `{"$optional":X}`            | `Optional(X)`                       |
| `{"$expr":"Min(2,String)"}`  | the string DSL, compiled (`expr`)   |
| `{"$discriminated":[tag, {…}]}` | `Discriminated(tag, branches)`  |
| `{"$jsonschema":{…}}`        | `fromJsonSchema(…)` / `MustFromJSONSchema(…)`: the shape a JSON Schema imports as |
| `{"$call":["Pick", ["a"], X]}` | the named builder called with these arguments, for a builder whose arguments the DSL cannot express (a list, an object): `Pick`, `Omit`, `Partial`, `Extend`, and `Refer` with an options object (`{"name":…,"strict":true}`) |

A `{"$expr":"…"}` cell unlocks the entire builder DSL in a single row. Object
keys of the form `"name: Min(1)"` exercise key-expression parsing directly.

## Regenerating

Cases are declared in `gen-compat.js`. After editing them, regenerate the
`*.tsv` files (requires a TS build — run `make build-ts` first):

```
node test/gen-compat.js
```

Then run all three suites (`make test`) to confirm parity.

## The wider net

This corpus is the committed gate, but it only covers rows someone thought to
write. [`differential/`](differential/) generates thousands of `(spec, input)`
pairs, runs them through all three implementations and diffs the JSON Schema
export, verdict, produced value and exact error text:

```
make diff        # sampled report
make diff-full   # every mismatch
```

Use it after any behaviour change, and promote anything it finds into a corpus
row here.

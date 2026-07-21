# Shared conformance corpus

Language-neutral test specs that pin **TypeScript ↔ Go parity**. Every `*.tsv`
file here is run by *both* implementations:

- TypeScript — `ts/test/compat.test.ts`
- Go — `go/compat_tsv_test.go`

The TypeScript build is canonical: the `output`/`error` columns are computed
from it, so TS passes by construction and Go is measured against it.

## File format

Tab-separated, one case per row, with a header row:

| column   | meaning                                                            |
| -------- | ----------------------------------------------------------------- |
| `name`   | test name (prefixed with the file's basename by each harness)     |
| `spec`   | the shape specification (JSON, with sentinels — see below)         |
| `input`  | the value to validate (JSON)                                      |
| `output` | expected produced value (JSON), compared JSON-normalized          |
| `error`  | if non-empty, validation must fail and the message must contain it |

A row sets **either** `output` (must pass) **or** `error` (must fail).

## Spec sentinels

`spec`/`input` cells are JSON. Objects with a single sentinel key decode to a
builder in both languages:

| sentinel                     | decodes to                          |
| ---------------------------- | ----------------------------------- |
| `{"$type":"String"}`         | required type token (`String`, …)   |
| `{"$open":X}`                | `Open(X)`                           |
| `{"$closed":X}`              | `Closed(X)`                         |
| `{"$required":X}`            | `Required(X)`                       |
| `{"$optional":X}`            | `Optional(X)`                       |
| `{"$expr":"Min(2,String)"}`  | the string DSL, compiled (`expr`)   |

A `{"$expr":"…"}` cell unlocks the entire builder DSL in a single row. Object
keys of the form `"name: Min(1)"` exercise key-expression parsing directly.

## Regenerating

Cases are declared in `gen-compat.js`. After editing them, regenerate the
`*.tsv` files (requires a TS build — run `make build-ts` first):

```
node test/gen-compat.js
```

Then run both suites (`make test`) to confirm parity.

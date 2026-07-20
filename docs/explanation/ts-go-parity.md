# TypeScript ↔ Go parity

Shape has two implementations. **TypeScript is canonical** — it defines the
behaviour. The Go port aims to match it exactly for validation outcomes and error
message text.

## How parity is enforced

A language-neutral conformance corpus lives in [`test/`](../../test/README.md) as
a set of `.tsv` files. Each row is a `(spec, input) → output | error` case whose
expected column is computed from the canonical TypeScript build. **Both**
implementations run every row:

- TypeScript — `ts/test/compat.test.ts`
- Go — `go/compat_tsv_test.go`

A row's `output` is compared JSON-normalized (so numeric widths and absent
properties don't cause spurious mismatches), and its `error` must appear in the
produced message. When the two languages agree on every row, they are at parity
for the declarative surface. Imperative builders (custom `Check` functions,
`Before`/`After`, `Key`, `Rename`) are covered by each language's own tests.

## What is guaranteed to match

- Validation outcomes: pass/fail, injected defaults, produced values.
- Error **message text** for structural and built-in-builder failures, including
  the `undefined`-vs-`null` rendering and the `index`-vs-`property` wording.
- The builder set and the string DSL grammar.

## Intentional divergences

Some differences are inherent to Go and are unlikely ever to close:

- **Object key ordering.** Go maps are unordered, so object specs and argument
  specs are processed in **alphabetical** key order; TypeScript preserves
  insertion order. This can affect the *order* of multiple errors and the
  meta-key adjacency rule. Name argument keys `a`, `b`, `c`, … to fix positions.
- **Regular expressions.** Go uses the RE2 engine (`regexp`); TypeScript uses the
  JavaScript engine. Patterns relying on backtracking features differ. Prefer
  portable patterns for schemas that must behave identically.

## Error metadata

Both languages produce the same message *text*. The Go `FieldError` also exposes
a `Check` field (the failing builder/check name) and `Mark` codes; the built-in
bounded checks report `why: "check"` with the builder name in `check`, matching
TypeScript's `ErrDesc`.

## Contributing changes

Because TypeScript is canonical, a behaviour change starts there:

1. Change `ts/src/shape.ts` and add/adjust a case in `test/gen-compat.js`.
2. Regenerate the corpus: `node test/gen-compat.js`.
3. Run `make test` — both languages must pass the regenerated corpus.
4. If Go diverges, fix Go to match the corpus.

See the [agent and contributor guide](../../AGENTS.md).

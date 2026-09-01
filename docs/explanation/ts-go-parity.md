# TypeScript ↔ Go parity

Shape has two implementations. **TypeScript is canonical** — it defines the
behaviour. The Go port matches it exactly for validation outcomes, produced
values and error message text.

## How parity is enforced

Two gates, and they do different jobs.

### The shared corpus

A language-neutral conformance corpus lives in [`test/`](../../test/README.md)
as a set of `.tsv` files. Each row is a `(spec, input) → output | error` case
whose expected column is computed from the canonical TypeScript build. **Both**
implementations run every row:

- TypeScript — `ts/test/compat.test.ts`
- Go — `go/compat_tsv_test.go`

A row's `output` is compared JSON-normalized (so numeric widths and absent
properties don't cause spurious mismatches). Its `error` column holds the
**complete** expected message and is compared **exactly** — a substring check
cannot see a wrong separator, a wrong error order or an extra error, and those
are precisely the ways two implementations drift apart.

### The differential harness

The corpus only covers rows someone thought to write, and for a long time it
had no negative case for `Type()` or `Rest()` — so a `Type()` that asserted
nothing and a `Rest()` that validated nothing passed it.

[`test/differential/`](../../test/differential/README.md) is the wider net. It
generates thousands of `(spec, input)` pairs, runs every one through both
implementations, and diffs verdict, produced value and exact error text:

```sh
make diff        # sampled report
make diff-full   # every mismatch
```

Run it after any behaviour change, and promote anything it finds into a corpus
row so the committed gate keeps it closed.

## What is guaranteed to match

- Validation outcomes: pass/fail, injected defaults, produced values.
- Error **message text**, including the aggregation separator (a newline), the
  order errors are reported in, the `undefined`-vs-`null` rendering, the
  `index`-vs-`property` wording, and how a node renders inside a composite
  `One`/`Some`/`All` message.
- The builder set, the chainable-method set, and the string DSL grammar —
  including the coercions, the string formats, the isolation builders
  (`Catch`, `Transform`, `Ignore`), discriminated unions and the object
  algebra (`Pick`, `Omit`, `Partial`, `Extend`).

## Intentional divergences

Some differences are inherent to Go and are unlikely ever to close.

- **Object key ordering.** Go maps are unordered, so object specs and argument
  specs are processed in **alphabetical** key order; TypeScript preserves
  insertion order. This affects three things: the *order* of multiple errors,
  the meta-key adjacency rule, and how an object *value* is rendered inside a
  message — validating a closed `{a: 1}` against `{b: 1, a: 2}` names the value
  `{b:1,a:2}` in TypeScript and `{a:2,b:1}` in Go. Name argument keys `a`, `b`,
  `c`, … to fix positions. The produced value itself is unaffected: it is the
  same object either way, and the differential harness compares it canonically.

- **Regular expressions.** Go uses the RE2 engine (`regexp`); TypeScript uses
  the JavaScript engine. Patterns relying on backtracking features differ.
  Prefer portable patterns for schemas that must behave identically.

- **An explicit null at the root.** Go cannot tell a missing argument from a nil
  one, so `Validate(nil)` means "no value supplied" (JS `undefined`) and
  defaults fill, mirroring TS `Shape(x)()`. To mean a value that is present and
  null — a type error against a typed shape — pass the exported `Null`
  sentinel. Inside a map or slice a plain `nil` already reads as present-null,
  because the key or index exists.

- **No Symbol.** TypeScript has a `Symbol` type token and a `.Symbol()` chain
  shortcut. Go has no equivalent concept.

- **No `.String()` chain shortcut.** Go has `.Number()`, `.Boolean()`,
  `.Object()`, `.Array()` and `.Function()`, but a method named `String` on an
  exported type reads as `fmt.Stringer` and `go vet` rejects the signature. Use
  `.Type(String)`, which is what the shortcuts call anyway.

- **`Any`, `Integer` and `Date` are tokens, not builders.** In TypeScript
  `Any` and `Integer` are builder functions, usable bare (`{ a: Any }`) or
  called (`Any()`), and `Date` is the constructor. In Go they are `TypeToken`s;
  to narrow, use `Type(Any, spec)` or the `.Any()`, `.Integer()` and `.Date()`
  chain methods.

- **Construction faults surface at different times.** TypeScript throws when a
  builder is called wrongly — `Discriminated` without a branch, `Pick` of an
  unknown property, `Extend` with a non-object. A Go builder returns a `*Node`
  and cannot, so the fault surfaces at validation, as it does for any bad spec,
  with the same message on a `never` node. In the string DSL both fail at
  build: `expr` throws and `Expr` returns an error. The differential harness
  compares valid constructions only.

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
4. Run `make diff` — both languages must agree on every generated case.
5. If Go diverges, fix Go to match.

A divergence caused by a TypeScript bug is fixed in TypeScript first: never
"fix" it by changing Go to match, and never change TypeScript to match Go
without deciding that the TypeScript behaviour is wrong.

See the [agent and contributor guide](../../AGENTS.md).

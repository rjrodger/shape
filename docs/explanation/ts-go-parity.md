# TypeScript ↔ Go ↔ Rust parity

Shape has three implementations. **TypeScript is canonical** — it defines the
behaviour. The Go and Rust ports match it exactly for validation outcomes,
produced values and error message text. The page keeps its Go-centred shape,
since the Go port came first and its divergences are the longer list; the
Rust port's own section is at the end.

## How parity is enforced

Two gates, and they do different jobs.

### The shared corpus

A language-neutral conformance corpus lives in [`test/`](../../test/README.md)
as a set of `.tsv` files. Each row is a `(spec, input) → output | error` case
whose expected column is computed from the canonical TypeScript build. **All
three** implementations run every row:

- TypeScript — `ts/test/compat.test.ts`
- Go — `go/compat_tsv_test.go`
- Rust — `rs/tests/compat_tsv.rs`

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
generates thousands of `(spec, input)` pairs, runs every one through all
three implementations, and diffs the JSON Schema export, verdict, produced
value and exact error text, each port against the canonical build:

```sh
make diff        # sampled report, both ports
make diff-full   # every mismatch
make diff-rs     # the Rust port alone
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
- The JSON Schema export: the same shape renders the same document.

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

- **Sharing with the input.** TypeScript produces in place: `valid()`,
  `error()` and the producing call write defaults into the input object
  itself (the documented behaviour of the canonical implementation). Go never
  changes its input; `Validate` copies an object or array on the first write
  that changes it and otherwise returns it as it is, so its result may share
  structure with the input where nothing changed. The produced *value* is the
  same in both; what differs is which objects are the input's own.

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
  with the same message on a `never` node, without the `Shape: ` prefix the
  thrown message carries. In the string DSL both fail at build, a wrong
  builder argument included: `expr` throws and `Expr` returns an error with
  the same text. The differential harness compares the string form's
  refusals, and otherwise valid constructions only.

- **Composite messages render object and array branches differently.** The
  `does not satisfy one of` list of `One`/`Some`/`All` names each branch.
  TypeScript renders a node branch in its spec form (`{a:1,$$:Open}`,
  `[String,Number]`, `Exact(1,x)`, and `[Number]` for a rest tuple) and a
  plain object or array literal as JSON (`{"b":"String","c":["Number"]}`);
  Go and Rust render every branch from the compiled node, spaced (`{a:
  1}.Open()`, `[String, Number]`, `Exact(1, x)`, `[String, ...Number]`,
  `{b: String, c: [Number]}`). Scalar and chained branches (`String.Min(2)`,
  `/^a/`, `Number`) agree, and those are what the corpus pins.

- **Structs are a Go-only convenience.** A struct is read into the same
  `map[string]any` model that TypeScript's plain objects occupy, on the way in
  (as a value, by its `json` tags) and on the way out (`ValidateInto`), and a
  struct spec's `shape` tags are ordinary key expressions. Nothing a shape
  accepts or produces changes; the differential harness never sees a struct.

## Error metadata

All three languages produce the same message *text*, and the Go `FieldError`
and Rust `FieldError` carry the fields of TypeScript's `ErrDesc` (`why`,
`check`, `mark`, `path`, `pathArr`, …). The codes differ for the built-in
checks: TypeScript reports a bound, `One`/`Some`/`All` and `Exact` as
`why: "check"` with mark 4000 and the builder's name in `check`, while Go and
Rust report the builder's own code and mark (`why: "Min"`, mark 4011;
`why: "One"`, mark 4030). The corpus compares text only, so this is a
documented divergence rather than a gated one.

## Contributing changes

Because TypeScript is canonical, a behaviour change starts there:

1. Change `ts/src/shape.ts` and add/adjust a case in `test/gen-compat.js`.
2. Regenerate the corpus: `node test/gen-compat.js`.
3. Run `make test` — all three languages must pass the regenerated corpus.
4. Run `make diff` — both ports must agree with TypeScript on every generated
   case.
5. If a port diverges, fix the port to match.

A divergence caused by a TypeScript bug is fixed in TypeScript first: never
"fix" it by changing a port to match, and never change TypeScript to match a
port without deciding that the TypeScript behaviour is wrong.

See the [agent and contributor guide](../../AGENTS.md).

## The Rust port

The Rust port ([`rs/`](../../rs/README.md), planned in
[rust-plan.md](rust-plan.md)) is held to the same two gates: every corpus row
(none skipped; `make test-rs` sets `SHAPE_RS_STRICT=1`, which turns a
skipped row into a failure) and every differential case. Two of the Go divergences above do not
apply to it:

- **Key order.** Its objects are insertion-ordered maps, so unknown keys and
  produced values keep the input's order, as TypeScript's do.
- **The root value.** `Value::Undefined` is a value of its own, so `validate`
  needs no null sentinel to say "nothing was supplied".

Its own divergences, each deliberate:

- **Construction faults.** A builder called wrongly (`min("x", ..)`,
  `define("", ..)`, `pick("z", ..)`) cannot throw, as in Go, and returns a
  node that accepts nothing and reports the message at validation. In the
  string form (`Schema::parse`, key expressions) the fault is an error at
  parse time, as `expr` throws in TypeScript.
- **`Exact` compares by value.** TypeScript compares object and array
  literals by identity, so an `Exact` of an object matches nothing that was
  not that very object; Rust compares structurally. Scalars behave alike.
- **Error rendering of the value.** A failing after check reports the value
  as it stands at that point, an injected default included, as TypeScript
  does (`with number "0"`); Go renders the original absence.
- **No `Symbol` token, no functions as values.** A function is an opaque
  `Value::Func(id)` that only a spec written in Rust can carry, since JSON
  cannot.
- **String length** is measured in UTF-16 units for the size bounds, as
  JavaScript's `length` is; Go measures bytes.
- **`shape!`** is the spec-by-example form, in the `json!` style; the type
  tokens are bare words in it and Rust expressions stand for everything else.

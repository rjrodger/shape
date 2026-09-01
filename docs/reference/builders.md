# Builder reference

Builders wrap a shape to add behaviour. Every builder exists as a **top-level
function** and — in TypeScript, and for most in Go — as a **chainable method** on
a node. Most take an optional trailing `spec` that they narrow or wrap.

- **TS:** `const { Min } = require('shape')` then `Min(2, String)` or
  `Required(Number).Min(2)`.
- **Go:** `shape.Min(2, shape.String)`; chainable form `buildize(shape.String).Min(2)`.
  `G`-prefixed aliases (`shape.GMin`) avoid stdlib name clashes.

`One`, `Some`, `All` and `Exact` are top-level only (not chainable).

---

## Required / optional / defaults

| Builder | Effect |
| ------- | ------ |
| `Required(spec?)` | Mark required — no default injection. Bare `Required()` is a required `Any`. |
| `Optional(spec?)` | Mark optional. |
| `Default(value, spec?)` | Optional with an explicit default `value`. |
| `Skip(spec?)` | Optional **and** skip default injection — an absent value leaves the key out. |
| `Ignore(spec?)` | Like `Skip`, and drop the value (and its errors) if it fails to match. |
| `Empty(spec?)` | Allow the empty string `""` for a `String` shape. |
| `Fault(message, spec?)` | Override the **structural** error message for this node. |

Notes:
- A literal in a spec is already "optional with a default"; these builders adjust
  that. A type marker is required; `Optional`/`Default` relax it.
- `Ignore` keeps a valid value and silently drops an invalid one.

## Type / equality

| Builder | Effect |
| ------- | ------ |
| `Type(kind, spec?)` | Force a specific type/kind, adopting its required/default state. TS accepts a wrapper (`Number`) or name; Go accepts a `Kind`, `TypeToken`, kind name, or an already-built node. Structural children are not carried across, so `Type(Object)` is a closed object and `Type(Array)` accepts any elements. |
| `Exact(values…)` | Require equality with one of the listed literals. Also matches from the node default. |
| `Never(spec?)` | Never matches — always fails. |
| `Func(spec?)` | Require a function value. |
| `Any(spec?)` | Match any value (optionally carrying a default). |

## Bounds

For numbers these bound the **value**; for strings/arrays/objects they bound the
**length**/size.

| Builder | Effect |
| ------- | ------ |
| `Min(n, spec?)` | value/length ≥ n (inclusive). |
| `Max(n, spec?)` | value/length ≤ n (inclusive). |
| `Above(n, spec?)` | value/length > n (strict). |
| `Below(n, spec?)` | value/length < n (strict). |
| `Len(n, spec?)` | value/length exactly n. |

## Custom checks

| Builder | Effect |
| ------- | ------ |
| `Check(fn or RegExp, spec?)` | Custom predicate, or a regular-expression match. |
| `Before(fn, spec?)` | Run `fn` **before** the structural type check (coerce/substitute). |
| `After(fn, spec?)` | Run `fn` **after** the structural type check (validate the result). |

Validator signature (all three): `(val, update, state) => boolean`. Return
`true` to pass. Use `update.val` to replace the value, `update.err` to set a
message, `update.done` to stop further checks. See [Shape nodes](nodes.md).

## Composition

| Builder | Effect |
| ------- | ------ |
| `One(shapes…)` | Passes on the first matching branch (its output is used). |
| `Some(shapes…)` | Passes if at least one branch matches; all branches are evaluated. |
| `All(shapes…)` | Passes only if every branch matches; the value is threaded through each. |

## Objects / arrays

| Builder | Effect |
| ------- | ------ |
| `Open(spec?)` | Allow unknown object properties. (An empty `{}` is already open.) |
| `Closed(spec?)` | Forbid unknown properties; makes a single-shape array a fixed tuple-of-one. |
| `Child(child, spec?)` | Default shape for every unknown object value (or array element). |
| `Rest(child, spec?)` | Tail shape for array elements past the fixed tuple positions. |

## References

| Builder | Effect |
| ------- | ------ |
| `Define(name, spec?)` | Name this shape so it can be referenced later. |
| `Refer(name, spec?)` | Substitute the named shape at validation time. |
| `Refer({name, fill})` / `ReferWith(name, opts)` | `fill` substitutes even when the value is absent (do not use for self-recursion). |
| `Rename({name, keep?, claim?}, spec?)` / `RenameWith` | Move the property to `name` after validation. `keep` retains the original key; `claim` lists alternate source keys. |

## Misc

| Builder | Effect |
| ------- | ------ |
| `Key(depth?, sep?)` | Replace the value with its key (or a path slice). |

---

## Language differences

- `Len` reports its own name in `stringify`/`spec` and in the error `check`
  field (it does not masquerade as `Below`).
- All bounded/custom-check errors carry the check name; the built-in message text
  is identical across languages.
- Go splits the TS options-object forms into explicit `ReferWith` / `RenameWith`
  helpers alongside the `Refer` / `Rename` shortcuts.
- `Key()` returns the value's **parent** key in both languages.
- `Any` is a builder function in TypeScript (usable bare or called) and a type
  token in Go; narrow it there with `Type(Any, spec)` or `.Any()`.
- Go has no `Symbol` token and no `.String()` chain shortcut — see the
  [parity page](../explanation/ts-go-parity.md#intentional-divergences).

## Key expressions

A key of the form `"name: <expression>"` compiles the expression and takes the
value as an **example**. The example is appended as the innermost builder call's
final argument, so a builder that takes a shape consumes it:

```js
{ 'a: Min(2)': 0 }          // a bounded number — the example gives the kind
{ 'a: Child(Number)': [] }  // an array of numbers — the example gives the kind
```

A builder whose arity is already satisfied has no room for it — `Optional(Number)`
already has its one argument — so there the example is applied as the value and
default instead:

```js
{ 'a: Optional(Number)': 5 }   // an optional number defaulting to 5
{ 'a: Optional(String)': 'z' } // an optional string defaulting to "z"
{ 'a: Any': 5 }                // still accepts anything; defaults to 5
```

Either way the example survives, and the expression keeps whatever kind it
declared. `Skip` still means no injection at all, and a bare literal expression
(`{ 'a: 5': 3 }`) has no builder to hand the example to, so its own value stands.

## Ordering within a node

A size bound (`Min`, `Max`, `Above`, `Below`, `Len`) stands aside when the node
declares a type the value does not have, so `Min(2, String)` against `1` reports
that `1` is not a string rather than that it is below 2. A bound that does fail
short-circuits the rest of the node's checks, so it is the only error reported.

A failed container type check ends the descent: validating `{ a: String }`
against `1` reports one error, not a type error plus "property a is required"
for every declared key.

For per-builder examples, follow the how-to guides linked from the
[docs index](../README.md).

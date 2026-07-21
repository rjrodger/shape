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
| `Type(kind, spec?)` | Force a specific type/kind. TS accepts a wrapper (`Number`) or name; Go accepts a `Kind`, `TypeToken`, or string. |
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

For per-builder examples, follow the how-to guides linked from the
[docs index](../README.md).

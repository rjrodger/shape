# Builder reference

Builders wrap a shape to add behaviour. Every builder exists as a **top-level
function** and—in TypeScript, and for most in Go—as a **chainable method** on
a node. Most take an optional trailing `spec` that they narrow or wrap.

- **TS:** `const { Min } = require('shape')` then `Min(2, String)` or
  `Required(Number).Min(2)`.
- **Go:** `shape.Min(2, shape.String)`; chainable form `buildize(shape.String).Min(2)`.
  `G`-prefixed aliases (`shape.GMin`) avoid stdlib name clashes.

`One`, `Some`, `All`, `Exact` and `Discriminated` are top-level only (not
chainable).

---

## Required / optional / defaults

| Builder | Effect |
| ------- | ------ |
| `Required(spec?)` | Mark required—no default injection. Bare `Required()` is a required `Any`. |
| `Optional(spec?)` | Mark optional. |
| `Default(value, spec?)` | Optional with an explicit default `value`. |
| `Skip(spec?)` | Optional **and** skip default injection—an absent value leaves the key out. |
| `Ignore(spec?)` | Like `Skip`, and drop the value (and its errors) if it fails to match—anywhere in its subtree. |
| `Empty(spec?)` | Allow the empty string `""` for a `String` shape. |
| `Nullable(spec?)` | Accept an explicit `null` as the value. Absent is still governed by required/optional. |
| `Fault(message, spec?)` | Override the **structural** error message for this node (a check's own message is kept). |

Notes:
- A literal in a spec is already "optional with a default"; these builders adjust
  that. A type marker is required; `Optional`/`Default` relax it.
- `Default(value)` alone takes the value's kind; `Default(value, spec)` keeps
  the spec, and an untyped spec (`Required()`, `Exact(1)`) takes the value's
  kind. In a key expression `"a: Default()": 5` the example is the default.
- A builder called with the wrong argument is a mistake in the spec:
  `Min('x')`, `Len(-1)`, `Define('')`. TypeScript throws at build
  (`Shape: Min needs a number`); a Go builder cannot, so it returns a node
  that accepts nothing and reports the same message at validation.
- `Ignore` keeps a valid value and silently drops an invalid one. It judges the
  whole subtree, so a failing descendant is swallowed too.

## Type / equality

| Builder | Effect |
| ------- | ------ |
| `Type(kind, spec?)` | Force a specific type/kind, adopting its required/default state. TS accepts a wrapper (`Number`), a name (`'Number'`, `'Integer'`) or a sample value (`null`, an object); Go accepts a `Kind`, `TypeToken`, kind name, or an already-built node. Structural children are not carried across, so `Type(Object)` is a closed object and `Type(Array)` accepts any elements. |
| `Integer(spec?)` | A number with no fractional part. Behaves as a type token: required, with the latent default `0`, so `Optional(Integer)` injects `0`. TS: a builder, usable bare (`{ n: Integer }`) or called; Go: the `Integer` token, `Type(Integer, spec)` or `.Integer()`. |
| `Date` | A date value. TS: the `Date` constructor as a type marker (a `Date` instance); Go: the `Date` token (a `time.Time`). `.Date()` chains in both. A `Date` instance / `time.Time` in a spec is an optional date with that default. |
| `Exact(values…)` | Require equality with one of the listed literals. Also matches from the node default. |
| `Never(spec?)` | Never matches—always fails. |
| `Func(spec?)` | A function value. A builder, not a type marker, so it is optional of itself: `Function` is the required form. |
| `Any(spec?)` | Match any value (optionally carrying a default). |

## Coercion

| Builder | Effect |
| ------- | ------ |
| `Coerce(spec?)` | Convert the value to the node's kind **before every other check**, bounds included, where the conversion is unambiguous. Anything else is left alone, so the usual type error speaks. |

The conversions, identical in both languages:

| To | From | Converted |
| -- | ---- | --------- |
| `Number` / `Integer` | string | a decimal numeric string, trimmed: `"5"`, `" 5 "`, `"5.5"`, `"1e3"`, `".5"`, `"+5"`. Not hex (`"0x10"`), not `"Infinity"`. `Integer` still rejects `"5.5"` afterwards. |
| | boolean | `true` → `1`, `false` → `0` |
| `String` | number | a finite number, rendered as JavaScript prints it (`1e21`, `1e-7`, `0.000001`) |
| | boolean | `"true"` / `"false"` |
| `Boolean` | string | `"true"`, `"false"`, `"1"`, `"0"`—trimmed, case-insensitive |
| | number | `1` → `true`, `0` → `false` |
| `Date` | string | a strict ISO 8601 / RFC 3339 date-time (`2020-01-01T00:00:00Z`, `2020-01-01T12:30:00.5+02:00`), with calendar checks—`2021-02-29` is rejected rather than rolled over |
| | number | milliseconds since the epoch |

`Coerce(Any)` converts nothing. Bare `Coerce` is an untyped node, so it converts
nothing either.

## String formats

Each requires a **string** in the given format; bare, it is a required string.

| Builder | Accepts |
| ------- | ------- |
| `Email(spec?)` | an email address (`local@domain.tld`) |
| `Url(spec?)` | an absolute URL with a scheme (`https://example.com/a?b=c#d`) |
| `Uuid(spec?)` | a hyphenated UUID |
| `DateTime(spec?)` | the ISO 8601 / RFC 3339 date-time form `Coerce(Date)` accepts, kept as a string |
| `Ip(spec?)` | an IPv4 or IPv6 address |
| `Ipv4(spec?)` / `Ipv6(spec?)` | one family only (`::ffff:192.168.1.1` is IPv6) |

A format only speaks for a present string of the node's kind: a missing or
wrongly typed value still gets the required or type error, and a bound on the
same node (`Email(Min(10, String))`) is checked first. A format failure keeps its
own message (`Value "nope" for property "a" is not a valid email address.`)
under `Fault` too, which replaces structural text only. Every pattern is written
for the RE2 and JavaScript engines alike; IPv6 is checked algorithmically. A
pattern of your own (`/re/`, `Check(/re/)`) is held to the shared
[regexp subset](regexp.md), so it matches the same strings in every language.

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
| `Check(fn or RegExp, spec?)` | Custom predicate, or a regular-expression match. `fn` is not called for an absent value; the node is required. TS also takes a type name, `Check('number')`, which only sets the node's type. |
| `Before(fn, spec?)` | Run `fn` **before** the structural type check (coerce/substitute). |
| `After(fn, spec?)` | Run `fn` **after** the structural type check (validate the result). |

Validator signature (all three): `(val, update, state) => boolean`. Return
`true` to pass. Use `update.val` to replace the value, `update.err` to set a
message (`$VALUE` and `$PATH` are expanded), `update.done` to skip the node's
structural check. In TypeScript a validator that throws fails with the
exception's message appended; in Go a panic and in Rust an unwinding panic
escape the call (see the [parity page](../explanation/ts-go-parity.md)). See
[Shape nodes](nodes.md).

A bare regular expression in a spec (`{ a: /^a/ }`) is a **type**: a string that
must match, so a non-string fails as a type error. `Check(/^a/)` is the explicit
check form and reports as a failed check.

## Isolation: Catch, Transform, Describe

These judge the node as a whole—its own checks, its type, every
descendant—before the node proceeds.

| Builder | Effect |
| ------- | ------ |
| `Catch(fallback, spec?)` | Whatever fails inside is replaced by `fallback` (deep-cloned per result) and raises nothing. `Catch(0, Number)` turns `"x"` into `0`. |
| `Transform(fn, spec?)` | Replace a **valid** value with `fn(value, state)`. An invalid one fails as it would have, with the same errors. |
| `Describe(text, spec?)` | Attach a description, read back as `node.m.description` (TS) or `n.Meta()["description"]` (Go). No effect on validation. |

A bound outside the isolation still applies to what comes out:
`Min(2, Catch(0, Number))` against `"x"` reports that `0` is under the bound of 2.

## Composition

| Builder | Effect |
| ------- | ------ |
| `One(shapes…)` | Passes on the first matching branch, whose output is the result. |
| `Some(shapes…)` | Passes if at least one branch matches; all branches are evaluated, and the last matching branch's result stands. Every branch is handed the value as it was given, never one another branch changed (`Some(Open({a:1}), Open({b:2}))` on `{}` gives `{b:2}`). |
| `All(shapes…)` | Passes only if every branch matches; the value is threaded through each, so later branches see what earlier ones produced (`All(Open({a:1}), Open({b:2}))` on `{}` gives `{a:1,b:2}`). |

None of the three changes the value it was given: each branch matches and
produces from a copy, and the composition's result replaces the value only
when it passes, so a failing `One`, `Some` or `All` leaves the input as it
was.
| `Discriminated(tag, { name: shape, … })` | A tagged union: the branch is chosen by the string value of the `tag` property and the value validated against that branch **alone**, so the errors are its own rather than a list of every alternative. |

`Discriminated` adds the tag property to an object-shaped branch that does not
declare it, as the literal it is keyed by, so the branch's output carries the
tag. A value without the tag, or with an unknown one, fails on the union itself:

```
Value "{bark:true}" for property "p" is not an object with a "kind" property.
Value "{kind:cat}" for property "p" has unknown "kind" "cat", expected one of: dog, fish.
```

An absent optional composition (`Optional(One(String, Number))`) is simply
absent; it is not put to its branches.

## Objects / arrays

| Builder | Effect |
| ------- | ------ |
| `Open(spec?)` | Allow unknown object properties. (An empty `{}` is already open.) |
| `Closed(spec?)` | Forbid unknown properties; makes a single-shape array a fixed tuple-of-one. |
| `Child(child, spec?)` | Default shape for every unknown object value (or array element). |
| `Rest(child, spec?)` | Tail shape for array elements past the fixed tuple positions: `Rest(Number, [String, Boolean])`. A single-shape array is an element shape, not a tuple, so a one-element prefix is `Rest(Number, Closed([String]))`, and `Rest(Number, [String])` is an array of numbers—the rest replaces a plain element shape. Bare `Rest(Number)` is the same as `[Number]`. |

## Object algebra

Each builds a **new** object shape out of an existing one. The source is left
as it was, so one base can be reshaped many times. `names` is a property name
or a list of them.

| Builder | Effect |
| ------- | ------ |
| `Pick(names, spec?)` | Keep only the named properties. Naming one the shape does not declare is an error. |
| `Omit(names, spec?)` | Drop the named properties. A name the shape does not declare is simply not there to drop. |
| `Partial(spec?)` | Make every declared property optional, as `Optional` would: a type token then injects its empty value, a literal its own. Shallow—a nested object keeps its own required properties. |
| `Extend(extra, spec?)` | Add the properties of `extra`, an object shape; a property both declare takes the extension's. Only its properties are taken: the result stays open or closed as the base was, and keeps the base's checks. |

```js
const User = { id: Number, name: String, role: 'user' }

Shape(Pick(['id', 'name'], User))          // { id, name }
Shape(Omit('id', User))                    // { name, role }
Shape(Partial(User))({})                   // → { id: 0, name: '', role: 'user' }
Shape(Extend({ email: Email }, User))      // User plus a required email
Closed(User).Pick('id').Extend({ v: 1 })   // chainable; each step is a new node
```

An object default is narrowed with the properties (`Pick('a', Default({ a: 1, b: 2 }))`
defaults to `{ a: 1 }`). Key expressions in the source (`{ 'a: Min(2)': 0 }`)
are compiled by the algebra, since it has to know the real property names. In
the string DSL, which has no object literal, the algebra is reached through a
key expression, whose example is the shape:
`{ 'u: Pick(["a"])': { a: 1, b: 2 } }`.

## References

| Builder | Effect |
| ------- | ------ |
| `Define(name, spec?)` | Name this shape so it can be referenced later. |
| `Refer(name, spec?)` | Substitute the named shape at validation time. |
| `Refer({name, fill})` / `ReferWith(name, opts)` | `fill` substitutes even when the value is absent (do not use for self-recursion). |
| `Refer({name, strict})` / `ReferOptions{Strict}` | A name no `Define` supplies is an error, rather than a `Refer` that does nothing. |
| `Rename({name, keep?, claim?}, spec?)` / `RenameWith` | Move the property to `name` after validation. `keep` retains the original key; `claim` lists alternate source keys. |

## Misc

| Builder | Effect |
| ------- | ------ |
| `Key(depth?, sep?)` | Replace the value with its key (or a path slice). `Key()` is the parent key; `Key(n)` the `n` keys ending at the parent, as an array (`Key(2)` under `x.y.k` is `['x', 'y']`), `Key(n, sep)` the same joined by `sep`; TS `Key(fn)` is `fn(path, state)`'s result. |

---

## Language differences

- `Len` reports its own name in `stringify`/`spec` and in the error `check`
  field (it does not masquerade as `Below`).
- All bounded/custom-check errors carry the check name; the built-in message text
  is identical across languages.
- Go splits the TS options-object forms into explicit `ReferWith` / `RenameWith`
  helpers alongside the `Refer` / `Rename` shortcuts.
- `Key()` returns the value's **parent** key in both languages.
- `Any`, `Integer` and `Date` are builder functions (or, for `Date`, the
  constructor) in TypeScript, usable bare or called, and type tokens in Go;
  narrow them there with `Type(Any, spec)` or `.Any()`, `.Integer()`, `.Date()`.
- **Construction faults.** TypeScript throws when a builder is called wrongly —
  `Discriminated` without a branch, `Pick` of an unknown property. Go builders
  return a `*Node` and cannot, so the fault surfaces at validation, as it does
  for any bad spec, with the same message. In the string DSL both fail at
  build, since `expr` throws and `Expr` returns an error.
- Go has no `Symbol` token and no `.String()` chain shortcut—see the
  [parity page](../explanation/ts-go-parity.md#intentional-divergences).

## Key expressions

A key of the form `"name: <expression>"` compiles the expression and takes the
value as an **example**. The example is appended as the innermost builder call's
final argument, so a builder that takes a shape consumes it:

```js
{ 'a: Min(2)': 0 }          // a bounded number; the example gives the kind
{ 'a: Child(Number)': [] }  // an array of numbers; the example gives the kind
{ 'u: Pick(["a"])': { a: 1, b: 2 } }  // the example is the shape picked from
```

A builder whose arity is already satisfied has no room for it—`Optional(Number)`
already has its one argument—so there the example is applied as the value and
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

`Coerce` runs first. Then a size bound (`Min`, `Max`, `Above`, `Below`, `Len`)
or a format stands aside when the node declares a type the value does not have,
so `Min(2, String)` against `1` reports that `1` is not a string rather than
that it breaks the bound. A check that fails skips the node's own structural check,
so `Min(2, String)` against `""` reports only the bound, not the empty string
too. Every before and after still runs after one has failed, so a failing bound
and a failing format (`Min(10, Email)` against `"nope"`), or a failing format
and a failing custom check, both report.

A failed container type check ends the descent: validating `{ a: String }`
against `1` reports one error, not a type error plus "property a is required"
for every declared key.

For per-builder examples, follow the how-to guides linked from the
[docs index](../README.md).

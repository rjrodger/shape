# How validation works

This page explains the model behind the behaviour — useful when a result
surprises you.

## Specs become nodes

Compiling a spec **normalizes** it into a tree of nodes. Each value is
interpreted:

- a literal → an optional node whose default and type are that value;
- a type marker (`String`, `Number`, …) → a required node of that type;
- an object → an object node with a child node per key;
- a one-element array → a "zero or more of this shape" node;
- a multi-element array → a fixed tuple node;
- a builder result → a node the builder has already configured.

An empty object `{}` is treated as **open** (matches any object), and a required
`Object` marker is open too.

## Required vs optional vs skippable

Three independent ideas:

- **required** — the value must be present; a missing value is an error and no
  default is injected.
- **optional** — a missing value is filled from the node's default (if any).
- **skippable** (`Skip`) — optional *and* no default injection; a missing value
  simply leaves the key out.

A type marker carries the type's empty value as a latent default (`""`, `0`,
`false`, `{}`, `[]`). Requiredness gates whether that default is ever injected —
so `Optional(String)` fills in `""`, while a bare `String` errors when missing.

## `undefined` vs `null`

A **missing** value (JS `undefined`, or an absent Go map key) is distinct from a
present **null**. Missing may be defaulted or flagged required; a present null is
a value and fails a typed shape as a type error. Go, which has only `nil`,
reproduces this: an absent key behaves as missing, an explicit `nil` as null.

## Default injection and mutation

<a name="mutation"></a>
When an optional value is missing, its default is injected into the output.

- **TS** does this by **mutating the input** object in place. Cloning arbitrary
  JavaScript values is [famously fiddly](https://www.digitalocean.com/community/tutorials/copying-objects-in-javascript),
  so Shape leaves that choice to you — pass a fresh object if you must preserve
  the original.
- **Go** builds and returns a new value; it does not mutate the input map.

Injected defaults are deep-cloned, so two validations never share mutable state.

## Traversal and error collection

Validation is a single depth-first pass. Because composition builders
(`One`/`Some`/`All`) and defaults interact, the engine deliberately evaluates
branches without early exit where a short-circuit would skip a default. All
errors from one pass are collected; by default the first failure surfaces as a
thrown error (TS) or a returned error (Go), but you can
[collect them all](../how-to/handle-and-collect-errors.md).

## Empty strings

The empty string is treated as "no value" for a string shape and is rejected by
default — even for an optional string that is *present* as `""`. Use `Empty` to
allow it. (An optional string that is *absent* is still defaulted to `""`.)

## References and recursion

`Define` records a node under a name during a run; `Refer` substitutes it. To
avoid infinite expansion, `Refer` only substitutes when a value is present unless
you opt into `fill`. This is what makes self-referential (tree) shapes safe.

## See also

- [Builder reference](../reference/builders.md)
- [TypeScript ↔ Go parity](ts-go-parity.md)

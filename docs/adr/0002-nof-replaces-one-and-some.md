# 0002—Nof replaces One and Some

- **Status:** Accepted
- **Date:** 2026-11-04
- **Applies to:** `ts/src/shape.ts`, `go/`, `rs/`, the string form, the
  declarative JSON, and the JSON Schema importer

## Context

Shape had three compositions over a list of shapes: `One`, `Some` and `All`.
Two of the names promised a count their behaviour did not keep.

`One` passed on the first branch that matched and produced the value from it.
It never looked further, so a value two branches both accepted passed: `One`
meant "the first of", not "exactly one of". The `oneOf` of JSON Schema means
exactly one, so `One` could not stand for it.

`Some` passed when any branch matched, but it tried every branch and let the
last match produce the value. The result depended on the order of the
branches, by a rule a reader had to look up.

`Nof(count, …)` counts the branches a value satisfies and compares that number
with a count, which is a whole number or a shape the number must satisfy. It
spells exactly one (`oneOf`), at least one (`anyOf`), none (`not`), and the
bounds between that JSON Schema has no keyword for. With `Nof` in place, `One`
and `Some` were two more names for counts `Nof` already expresses, each with a
production rule of its own.

## Decision

**`One` and `Some` are removed from all three languages. `Nof` replaces them,
and `All` stays.**

- `Nof(1, …)` is exactly one. The branch that matched produces the value, so
  its defaults are filled in.
- `Nof(Min(1), …)` is at least one. It stops at the first match and only
  checks: the value passes through as it was given.
- `All` keeps its rule: the value threads through every branch. A `Nof` that
  counts every branch checks them and does not thread.
- The string form and the declarative JSON no longer read the names, so
  `One(String,Number)` is a build error.
- The JSON Schema importer reads `anyOf`, and a `type` array of more than one
  kind, as `Nof(Min(1), …)`.

## Consequences

### Migrating

| Was | Now | The same when |
| --- | --- | ------------- |
| `One(a, b)` | `Nof(1, a, b)` | no value satisfies both branches |
| `Some(a, b)` | `Nof(Min(1), a, b)` | the branches only check, and fill in or convert nothing |

Two uses have no direct replacement:

- **`One` over branches that overlap.** A value both branches accept now fails
  `Nof(1, …)`. Make the branches disjoint, or, for objects told apart by one
  property, use `Discriminated`.
- **`Some` producing from its last match.** `Nof(Min(1), …)` leaves the value
  as it was given. When a branch has to fill in defaults, use `Nof(1, …)` over
  disjoint branches, or `All` when every branch applies.

### A breaking change

Code that calls `One` or `Some` (`one` and `some` in Rust, and `GOne` and
`GSome` in Go) no longer compiles. A shape kept as declarative JSON or as a
string that names either one no longer builds. Each package needs a new major
version.

### Error text

A failure now reads as a count, `satisfies 0 of: Number, String; the count
must be 1.`, where it read `does not satisfy one of: Number, String`. Go and
Rust report `why: "Nof"` with mark 4033 where they reported `One` (4030) and
`Some` (4031).

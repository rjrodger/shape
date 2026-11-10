# 0004—JSON Schema keywords apply together, by kind

- **Status:** Accepted
- **Date:** 2026-11-10
- **Applies to:** the JSON Schema importer, and `All`, `Nof`, `Exact`,
  `Never` and `Nullable`, in `ts/src/shape.ts`, `go/` and `rs/`

## Context

In JSON Schema each keyword is a separate assertion, and a value must meet
them all. Most keywords apply to one kind of value only: `minLength` says
nothing of a number, `properties` nothing of a string. A schema without a
`type` accepts every kind and checks each against its own keywords.

The importer read keywords as alternatives. An `enum`, `const`, `allOf`,
`oneOf` or `anyOf` replaced every other keyword beside it, and a `$ref`
replaced its siblings. A schema without a `type` became the one kind its
keywords suggested, so `{ format: 'email' }` refused `12`. Each of these gave
a wrong answer with no error. An `allOf` that inherits a base and adds
`required` accepted a value missing the required property, and an object
with an optional `enum` property refused every value that left it out.

That last one was a bug in Shape itself: `Optional(Exact(…))` and
`Skip(Never())` refused an absent value, and `Nullable(Exact(…))` refused
`null`, because those checks ignored the flags around them.

## Decision

**The import reads every keyword of a schema as one part, and a value must
pass every part. Each part applies to its own kind of value.**

- A schema of more than one part is `All` of them. `not` comes first, so it
  applies to the value as given. An `enum` or `const` keeps only the values the
  other parts allow, and so stays one `Exact`.
- A schema without a `type` is `Nof(1, …)` of a shape for each kind of JSON
  value. A schema with several types is `Nof(1, …)` of those. Under a schema
  with one `type`, the schemas of `not`, `allOf`, `anyOf` and `oneOf` are
  read for that kind alone.
- A `$ref` is a part, as it is from draft 2019-09. A document whose
  `$schema` names draft 7 or earlier keeps its siblings ignored.
- `Exact` and `Never` require a value until made optional, and `Nullable`
  accepts `null` whatever a check makes of it.

Two changes to the builders follow, because the import's output must keep
its meaning when written out by `json()` and read back:

- **`All` fails with the errors of the branches that fail**, each once,
  rather than `does not satisfy all of` and a list of every branch. Joined by
  `All`, the keywords of an imported schema would otherwise report a list
  of parts without saying which failed, or why.
- **`Nof` chooses by kind.** When its count admits exactly one and each
  branch is of a different kind, with no check that could let another kind
  through, the value is put to the branch of its kind alone. The verdict is
  the one trying every branch gives, at the cost of one validation instead
  of one per branch, and the errors are that branch's own. Without it,
  every untyped schema in a document would be validated twice at each level
  of nesting, once to count and once to produce.

A marker set by the importer could have changed both messages for imported
schemas alone, but `json()` cannot write a marker, so the shape read back
would behave differently. A new builder for the kind split was the other
option; `Nof` already expresses it.

## Consequences

- Imported schemas pass 74% of the required tests of the official suite for
  draft 2020-12 in TypeScript, from 65%, and none that passed before fails.
- `All`'s message is new for every user of `All`. `Nof`'s is new for a
  branch of a kind the value has, among branches of different kinds; a
  value of no listed kind still reads as a count.
- A bare `Exact` or `Never` now marks its node required, so `json()` writes
  `Required.Exact(…)`, and the JSON Schema export lists such a property in
  `required`, which is what validation already demanded. Text written by an
  earlier `json()` as `Any.Exact(…)` now reads as optional.
- The export writes the required positions of a tuple as `minItems`, since
  the import now reads a `prefixItems` position as optional.
- Keywords the import has no part for are still ignored. The `strict`
  option refuses them instead.

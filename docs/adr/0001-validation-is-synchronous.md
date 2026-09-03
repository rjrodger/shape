# 0001—Validation is synchronous, in both languages

- **Status:** Accepted
- **Date:** 2026-09-01
- **Applies to:** `ts/src/shape.ts`, `go/`, and every builder that takes a
  user-supplied function (`Check`, `Before`, `After`)

## Context

Shape ships two implementations of one specification. TypeScript is canonical;
Go is a port held to it exactly—not approximately. The parity contract covers
validation outcome, produced value **and** error message text, and it is
enforced mechanically: a shared conformance corpus plus a differential harness
that runs thousands of generated `(spec, input)` pairs through both and compares
all three. That contract is the project's central invariant. Nearly every design
question here reduces to "can both languages do this identically?"

Asynchronous validation cannot clear that bar.

Go has no `async`/`await`. Its signature is `Validate(input any) (any, error)`,
which returns when it returns. A TypeScript `parseAsync`, or a `Check` that may
return a promise, would have no Go counterpart. The gap would not be a message
wording difference of the kind the corpus normally catches—it would be a
capability present in one language and absent in the other, permanently
unpinnable by the harness. Every subsequent parity claim would carry an asterisk.

There is a second, independent reason. The validation Shape performs is a pure
function of its input: check structure, check types, apply bounds, inject
defaults, produce a value. Nothing in that needs to wait for anything. The
checks people actually want to `await`—"is this email already registered?",
"does this account have permission?", "is this SKU in the catalogue?"—are
business rules that need a database, a network call, error handling, timeouts
and retries. They are the application's concern, and they are not made better by
being smuggled into a schema.

Interoperability does not force the issue either. Standard Schema V1, which
Shape implements, types its result as `Result | Promise<Result>`. Returning the
synchronous branch is conforming; consumers already handle both.

## Decision

**Validation is synchronous in both languages, and will stay that way.**

Concretely:

- There is no `parseAsync`, no `validateAsync`, and no promise-returning entry
  point. `Shape(spec)(input)` returns a value or throws; `Standard().Validate`
  returns a result, never a promise.
- `Check`, `Before` and `After` take a function returning `boolean`. A validator
  that performs I/O is out of contract.
- A future async capability, if one is ever wanted, belongs in a **separate
  package layered on top** of the sync core—not in it. This ADR does not
  preclude that; it precludes async inside Shape itself.

## Consequences

### Async validators fail open, silently

This is the sharp edge, and it is worth stating plainly rather than discovering
it in production. An `async` function returns a promise, a promise is truthy,
and a truthy return means "passed":

```js
const check = async (v) => v > 100     // would reject 5
Shape(Check(check, Number))(5)         // → 5. Passes.
```

Anything after an `await` is never observed either—neither a mutation nor a
rejection:

```js
Shape(After(async (v, u) => {
  await sleep(1)
  u.val = 'never seen'
  return false                          // never seen
}, Number))(5)                          // → 5
```

Both behaviours follow directly from this decision; neither is a bug in the
sense of contradicting the spec. But they are silent, which is the worst
property a validation failure can have. **Open follow-up:** make a validator
that returns a thenable throw at validation time, so the mistake is loud. That
is a behaviour change needing its own decision, and is deliberately not folded
into this ADR.

### The pattern for async rules

Validate shape first, then apply business rules to the produced value. This
separates "is this well-formed?" from "is this allowed?", which are different
questions with different failure modes anyway:

```js
const user = Shape({ email: String, name: String })(input)  // throws if malformed
if (await emailTaken(user.email)) {
  throw new Error('email already registered')
}
```

### What this buys

- Parity stays provable. The differential harness can keep comparing exact error
  text, because there is no concurrency to make error *order* nondeterministic.
- Shape stays usable where `await` is not available: module-level configuration,
  constructors, property getters, and ordinary Go code.
- The API surface stays small. No sync/async duplication of every entry point.

## Alternatives considered

**Async in TypeScript only, documented as a divergence.** Rejected. The parity
contract is the reason this project has two implementations rather than one; a
divergence of this size would hollow it out. The divergences that are accepted
(RE2 vs the JS regex engine, Go map ordering) are forced by the languages and
are narrow. This one would be chosen, and broad.

**Async in both, with Go using `context.Context` and blocking calls.** Rejected.
It is technically possible, but concurrent branch evaluation makes error order
nondeterministic, and error order is part of the compared contract. Serializing
to preserve order gives up the only reason to be async. It is also a large API
change in service of a concern that belongs upstream of validation.

**A separate async wrapper package.** Not rejected—deferred. It keeps the core
sync and its parity intact, and can be revisited if real demand appears.

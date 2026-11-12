# How to compose shapes

**Goal:** accept a value that matches one of several shapes, all of them, a
counted number of them, the shape a condition picks, or a fixed set of literal
values.

## Which to use

| You want | Use |
| -------- | --- |
| exactly one of several shapes, with that shape's output | `Nof(1, …)` |
| at least one of them, the value left as it was given | `Nof(Min(1), …)` |
| none of them: "not this" | `Nof(0, …)` |
| any other count: at least two, at most one, … | `Nof(count, …)` |
| every one, each building on the last | `All(…)` |
| one shape where a condition holds, another where it does not | `When(cond, then, else)` |
| one of a few literal values | `Exact(…)` |
| one of several objects told apart by one property | `Discriminated(tag, { … })` |

`Nof` counts; `All` threads. When the alternatives are objects with a tag
property, prefer `Discriminated`: it reports the errors of the one branch the
tag picks instead of a count over all of them.

## Exactly one: `Nof(1, …)`

**TS**

```js
const { Shape, Nof } = require('shape')   // Number and String are the JS globals
const id = Shape({ id: Nof(1, Number, String) })

id({ id: 42 })     // OK
id({ id: 'x42' })  // OK
id({ id: true })   // throws: satisfies 0 of: Number, String; the count must be 1.
```

**Go**

```go
s := shape.MustShape(map[string]any{"id": shape.Nof(1, shape.Number, shape.String)})
```

Exactly one means exactly one: a value two branches both satisfy fails. The
branch that matched produces the value, so its defaults are filled in.

When the branches are of different kinds, as here, the value's kind picks
the branch, and a value of that kind that fails gets the branch's own error:

```js
Shape({ id: Nof(1, Number, Min(3, String)) })({ id: 'x' })
// throws: Value "x" for property "id" must be a minimum length of 3 (was 1).
```

## At least one: `Nof(Min(1), …)`

```js
Shape({ v: Nof(Min(1), Number, String) })
```

The count is a shape here, `Min(1)`, which the number of matching branches
must satisfy. `Nof` stops at the first match, and the value passes through as
it was given.

## All of them: `All`

`All` requires every branch to match. It threads the value through each branch,
so defaults from earlier branches are visible to later ones.

```js
Shape({ v: All(Number, Min(1), Max(9)) })   // number, and 1..9
```

A failure reports the errors of the branches that fail: `12` here gives
`Value "12" for property "v" must be a maximum of 9 (was 12).`

## A counted number of them: `Nof`

`Nof` counts the branches the value satisfies, and passes when the count is
one it admits. Give it a whole number for exactly that many, or a shape the
count must satisfy:

**TS**

```js
const { Shape, Nof, Min, Integer } = require('shape')

// Exactly one: an integer satisfies Number and Integer both.
const half = Shape({ v: Nof(1, Number, Integer) })
half({ v: 1.5 })   // OK
half({ v: 1 })     // throws: satisfies 2 of: Number, Integer; the count must be 1.

// None: anything but a string.
const notStr = Shape({ v: Nof(0, String) })
notStr({ v: 1 })   // OK
notStr({ v: 'x' }) // throws: satisfies 1 of: String; the count must be 0.

// At least two of an uppercase letter, a digit and a symbol.
const pw = Shape({ pw: Nof(Min(2), /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/) })
pw({ pw: 'Abc1' }) // OK
pw({ pw: 'abc!' }) // throws: satisfies 0 to 1 of: /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/; the count must be Min(2).
```

**Go**

```go
s := shape.MustShape(map[string]any{"v": shape.Nof(1, shape.Number, shape.Integer)})
```

The last failure counts "0 to 1" because `Nof` stopped after two branches:
one branch left could not have reached two.

## The shape a condition picks: `When`

`When(cond, then, else)` validates the value with `then` where it matches
`cond`, and with `else` where it does not. The condition is tried on a copy,
so it fills nothing in. The shape it picks validates the value, and its
errors are the errors. An arm not given passes.

```js
const { Shape, When, Open, Required, Exact } = require('shape')

const order = Shape(When(
  Open({ ship: Exact(true) }),
  Open({ address: Required(String) }),
))

order({ ship: false })          // OK: nothing to ship, no address needed
order({ ship: true })           // throws: property "address" ... is missing
```

The condition is often an object that holds a property, as the
`dependentRequired` keyword of JSON Schema reads: `When(Open({ card: Required() }),
Open({ expiry: Required() }))` asks for an `expiry` wherever there is a
`card`.

## One of a set of literal values: `Exact`

`Exact` compares by equality against the listed literals.

**TS**

```js
const { Shape, Exact } = require('shape')
const role = Shape({ role: Exact('admin', 'user', 'guest') })

role({ role: 'user' })   // OK
role({ role: 'root' })   // throws: must be exactly one of: admin, user, guest
```

**Go**

```go
s := shape.MustShape(map[string]any{
    "role": shape.Exact("admin", "user", "guest"),
})
```

## A tagged union: `Discriminated`

When the alternatives are objects told apart by one property, `Discriminated`
picks the branch by that property's value and reports **only that branch's**
errors—not a list of every alternative.

**TS**

```js
const { Shape, Discriminated } = require('shape')

const pet = Shape(Discriminated('kind', {
  dog:  { bark: Boolean },
  fish: { fins: Number },
}))

pet({ kind: 'dog', bark: true })   // OK — the "kind" property is added to each branch
pet({ kind: 'fish', fins: 'x' })   // throws: property "fins" ... not of type number
pet({ kind: 'cat' })               // throws: has unknown "kind" "cat", expected one of: dog, fish
pet({ bark: true })                // throws: is not an object with a "kind" property
```

**Go**

```go
pet := shape.MustShape(shape.Discriminated("kind", map[string]any{
    "dog":  map[string]any{"bark": shape.Boolean},
    "fish": map[string]any{"fins": shape.Number},
}))
```

## Notes

- `Nof` tries a branch only while the branches left untried could still
  change the verdict, so `Nof(Min(1), …)` stops at the first match and
  `Nof(1, …)` at the second.
- Each branch `Nof` tries, and each `When` condition, is a trial, and one
  validation may run 100,000 of them (see
  [Trials](../reference/builders.md#trials)).
- No branch changes the value it was given: each is tried on a copy.
  `Nof(1, …)` produces from the one branch that matched
  (`Nof(1, Open({b:2}), Number)` on `{a:1}` gives `{a:1,b:2}`). Any other
  count only checks, and the value passes through as it was given.
- `All` evaluates **every** branch (no short-circuit) and threads the result
  from branch to branch (`All(Open({a:1}), Open({b:2}))` on `{}` gives
  `{a:1,b:2}`). A failing composition leaves the input as it was.
- `Exact` also matches when the value is absent but the node's default equals one
  of the listed literals.
- These builders are not chainable methods—call them as top-level builders.
- An absent optional composition (`Optional(Nof(1, String, Number))`) is simply
  absent; it is not put to its branches. `Nof` and `When` never put an absent
  value to their shapes, so a required one reports the value missing.

# How to compose shapes

**Goal:** accept a value that matches one of several shapes, all of them, a
counted number of them, or a fixed set of literal values.

## One of a set of shapes: `One`

**TS**

```js
const { Shape, One } = require('shape')   // Number and String are the JS globals
const id = Shape({ id: One(Number, String) })

id({ id: 42 })     // OK
id({ id: 'x42' })  // OK
id({ id: true })   // throws: does not satisfy one of: Number, String
```

**Go**

```go
s := shape.MustShape(map[string]any{"id": shape.One(shape.Number, shape.String)})
```

## At least one: `Some`

`Some` passes if the value matches any branch.

```js
Shape({ v: Some(Number, String) })
```

## All of them: `All`

`All` requires every branch to match. It threads the value through each branch,
so defaults from earlier branches are visible to later ones.

```js
Shape({ v: All(Number, Min(1), Max(9)) })   // number, and 1..9
```

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

`Nof(1, …)` is exactly one, where `One` is the first that matches, and
`Nof(0, s)` is "not `s`". The last failure counts "0 to 1" because `Nof`
stopped after two branches: one branch left could not have reached two.

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

- `One` stops at the **first** matching branch and uses that branch's output.
- `Some` and `All` evaluate **every** branch (no short-circuit), so default
  injection from any branch is never skipped.
- No branch changes the value it was given: each matches and produces from a
  copy. `Some` takes the last matching branch's result (`Some(Open({a:1}),
  Open({b:2}))` on `{}` gives `{b:2}`), `All` threads the result from branch
  to branch (`{a:1,b:2}`), and a failing composition leaves the input as it
  was.
- `Nof` never produces: the value passes through as it was given, so a
  branch's defaults are not filled in. Use `One` when you want the matching
  branch's output.
- `Nof` tries a branch only while the branches left untried could still
  change the verdict, so `Nof(Min(1), …)` stops at the first match.
- `Exact` also matches when the value is absent but the node's default equals one
  of the listed literals.
- These builders are not chainable methods—call them as top-level builders.
- An absent optional composition (`Optional(One(String, Number))`) is simply
  absent; it is not put to its branches. `Nof` never puts an absent value to
  its branches, so a required one reports the value missing.

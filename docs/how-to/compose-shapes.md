# How to compose shapes

**Goal:** accept a value that matches one of several shapes, or all of them, or
a fixed set of literal values.

## Exactly one of a set of shapes: `One`

**TS**

```js
const { Shape, One, Number, String } = require('shape')
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

## Notes

- `One` stops at the **first** matching branch and uses that branch's output.
- `Some` and `All` evaluate **every** branch (no short-circuit), so default
  injection from any branch is never skipped.
- `Exact` also matches when the value is absent but the node's default equals one
  of the listed literals.
- These builders are not chainable methods — call them as top-level builders.

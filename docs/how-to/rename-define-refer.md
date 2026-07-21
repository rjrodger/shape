# How to rename properties and reuse shapes

**Goal:** rename a property after validation, or define a shape once and
reference it elsewhere (including recursively).

## Rename a property

`Rename({ name })` validates the value and moves it to a new key.

**TS**

```js
const { Shape, Rename, Number } = require('shape')
const shape = Shape({ id: Rename({ name: 'userId' }, Number) })

shape({ id: 7 })   // → { userId: 7 }
```

**Go**

```go
s := shape.MustShape(map[string]any{
    "id": shape.Rename("userId", shape.Number),
})
```

Options (passed in the first argument object in TS; via `RenameWith` in Go):

| Option  | Effect                                                        |
| ------- | ------------------------------------------------------------- |
| `keep`  | keep the original key as well as the renamed one              |
| `claim` | list of alternate source keys to pull the value from if absent |

```js
Shape({ userId: Rename({ name: 'userId', claim: ['id', 'uid'] }, Number) })
// accepts { id: 7 } or { uid: 7 } → { userId: 7 }
```

## Define and refer to a shape

`Define(name, shape)` records a shape under a name during validation;
`Refer(name)` substitutes it. This is the basis for **recursive** shapes.

**TS**

```js
const { Shape, Define, Refer } = require('shape')

const tree = Shape(Define('node', {
  value: Number,
  children: [Refer('node')],   // each child is another node
}))

tree({ value: 1, children: [{ value: 2, children: [] }] })  // OK
```

**Go**

```go
s := shape.MustShape(shape.Define("node", map[string]any{
    "value":    shape.Number,
    "children": []any{shape.Refer("node")},
}))
```

## Fill from a reference even when absent

By default `Refer` only substitutes when a value is present (this prevents
infinite loops for self-referential shapes). To substitute even when the value
is missing, enable `fill`:

**TS**

```js
Shape({ copy: Refer({ name: 'shared', fill: true }) })
```

**Go**

```go
shape.ReferWith("shared", shape.ReferOptions{Fill: true})
```

> Use `fill` only when the reference is **not** self-recursive, or you will
> create an infinite expansion.

## See also

- [Builder reference: references](../reference/builders.md#references)
- [Recursive shapes](../explanation/how-validation-works.md)

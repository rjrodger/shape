# How to validate objects and nesting

**Goal:** validate object structure, control whether unknown keys are allowed,
and validate deeply nested shapes.

## Closed by default

A declared object rejects unknown keys.

**TS**

```js
const shape = Shape({ a: 1 })
shape({ a: 2, b: 3 })   // throws: property "b" is not allowed
```

## Allow unknown keys: `Open`

**TS**

```js
const { Open } = require('shape')
const shape = Shape(Open({ a: 1 }))
shape({ a: 2, b: 3 })   // → { a: 2, b: 3 }
```

**Go**

```go
shape.MustShape(shape.Open(map[string]any{"a": 1}))
```

> An **empty** object `{}` is treated as `Open` — it matches any object.

## Constrain unknown values: `Child`

`Child(shape)` says "every extra/undeclared value must match this shape".

**TS**

```js
const { Child, Number } = require('shape')
const shape = Shape(Child(Number, {}))   // any keys, all values must be numbers
shape({ x: 1, y: 2 })    // OK
shape({ x: 'a' })        // throws: not of type number
```

**Go**

```go
shape.MustShape(shape.Child(shape.Number, map[string]any{}))
```

## Nesting

Declare nested objects inline; they validate and default recursively.

```js
Shape({
  server: {
    port: 8080,
    tls: { enabled: false },
  },
})
```

Error paths use dot notation, e.g. `server.tls.enabled`.

## Force closed

If a shape became open (e.g. via `Child`/`Open`) and you want it closed again,
wrap it with [`Closed`](../reference/builders.md#closed).

## See also

- [Require fields](require-fields.md)
- [Builder reference: objects/arrays](../reference/builders.md#objects--arrays)

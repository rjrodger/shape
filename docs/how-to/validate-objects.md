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

> An **empty** object `{}` is treated as `Open`—it matches any object.

## Constrain unknown values: `Child`

`Child(shape)` says "every extra/undeclared value must match this shape".

**TS**

```js
const { Child } = require('shape')   // Number is the JS global, not an export
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

Error paths use dot notation, for example `server.tls.enabled`.

## Force closed

If a shape became open (through `Child` or `Open`) and you want it closed again,
wrap it with [`Closed`](../reference/builders.md#objects--arrays).

## Reshape a declared object: `Pick`, `Omit`, `Partial`, `Extend`

Build one object shape out of another, without repeating it. Each returns a
**new** shape; the source is untouched.

**TS**

```js
const { Shape, Pick, Omit, Partial, Extend, Email } = require('shape')

const User = { id: Number, name: String, role: 'user' }

Shape(Pick(['id', 'name'], User))        // only id and name
Shape(Omit('id', User))                  // everything but id
Shape(Partial(User))({})                 // → { id: 0, name: '', role: 'user' }
Shape(Extend({ email: Email }, User))    // User plus a required email
```

**Go**

```go
user := map[string]any{"id": shape.Number, "name": shape.String, "role": "user"}

shape.MustShape(shape.Pick([]string{"id", "name"}, user))
shape.MustShape(shape.Extend(map[string]any{"email": shape.Email()}, user))
```

`Partial` is shallow: a nested object keeps its own required properties.
`Extend` keeps the base's openness and checks, and only takes the extension's
properties. The steps chain, each producing a new node:
`Closed(User).Pick('id').Extend({ v: 1 })`.

## See also

- [Require fields](require-fields.md)
- [Builder reference: objects/arrays](../reference/builders.md#objects--arrays)

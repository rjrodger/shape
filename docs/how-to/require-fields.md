# How to require fields

**Goal:** make a property mandatory, so validation fails when it is missing.

## Recipe: use a type marker

A literal value is optional; a *type marker* is required.

| Language | Required markers |
| -------- | ---------------- |
| TS/JS    | `String`, `Number`, `Boolean`, `Object`, `Array`, `Function`, `Symbol` |
| Go       | `shape.String`, `shape.Number`, `shape.Boolean`, `shape.Object`, `shape.Array`, `shape.Function`, `shape.Any` |

**TS**

```js
Shape({
  name:  String,   // required string
  age:   Number,   // required number
  admin: Boolean,  // required boolean
})
```

**Go**

```go
shape.MustShape(map[string]any{
    "name":  shape.String,
    "age":   shape.Number,
    "admin": shape.Boolean,
})
```

A missing required field fails with `… the value is required`.

## Require a shape that already has a builder

Wrap it with [`Required`](../reference/builders.md#required):

```js
Shape({
  email: Required(Check(/^.+@.+$/)),
  tags:  Required([String]),   // required, non-defaulting array
})
```

## The inverse: force optional

If a value would otherwise be required (e.g. under a `Check`), use
[`Optional`](../reference/builders.md#optional), or use
[`Skip`](../reference/builders.md#skip) to make it optional **and** skip
default injection entirely.

```js
Shape({ note: Optional(String) })  // may be absent
Shape({ note: Skip(String) })      // absent → key omitted, not defaulted
```

## Notes

- Required fields never have a default — there is nothing to default to.
- An empty string fails a required (or any) string field unless
  [`Empty`](../reference/builders.md#empty) is used.

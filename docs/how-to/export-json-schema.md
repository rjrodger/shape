# How to export a JSON Schema

**Goal:** hand the values a shape accepts to a tool that speaks
[JSON Schema](https://json-schema.org/) — an editor, a form generator, an API
description — without writing the schema twice.

## Export

Every compiled shape renders a JSON Schema document (draft 2020-12).

**TS**

```js
const { Shape, Min, Optional, Email, Exact } = require('shape')

const shape = Shape({
  name:  Min(1, String),
  age:   Optional(Number),
  email: Email,
  role:  Exact('admin', 'user'),
  tags:  [String],
})

shape.jsonSchema()
```

**Go**

```go
s := shape.MustShape(map[string]any{
    "name":  shape.Min(1, shape.String),
    "age":   shape.Optional(shape.Number),
    "email": shape.Email(),
    "role":  shape.Exact("admin", "user"),
    "tags":  []any{shape.String},
})

s.JSONSchema()   // map[string]any
```

Both give:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name":  { "type": "string", "minLength": 1 },
    "age":   { "type": "number", "default": 0 },
    "email": { "type": "string", "minLength": 1, "format": "email" },
    "role":  { "enum": ["admin", "user"] },
    "tags":  { "type": "array", "items": { "type": "string", "minLength": 1 } }
  },
  "required": ["email", "name", "role"],
  "additionalProperties": false
}
```

The two implementations render the same document for the same shape; the
[differential harness](../../test/differential/README.md) compares the exports
alongside the validation results.

## What is rendered

| Shape | Schema |
| ----- | ------ |
| `String`, `Number`, `Integer`, `Boolean`, `null`, `Date` | `type` (`Date` is a `date-time` string); a string gets `minLength: 1` unless `Empty` |
| a literal, `Default`, `Optional(token)` | `default` — the value an absent property is given |
| a required property | listed in `required` (sorted) |
| a closed object | `additionalProperties: false`; `Open` omits it; `Child(shape)` sets it to that shape |
| `[shape]`, a tuple, `Rest`, `Closed([shape])` | `items`, `prefixItems` (+ `items: false` when nothing may follow) |
| `Min` / `Max` / `Above` / `Below` / `Len` | `minimum`…, `minLength`…, `minItems`…, `minProperties`… by the node's kind — every family when it has none |
| `Exact` | `enum` |
| `Email`, `Url`, `Uuid`, `DateTime`, `Ipv4`, `Ipv6` | `format`; `Ip` is an `anyOf` of the two |
| a bare `/re/`, `Check(/re/)` | `pattern` |
| `One`, `Some` / `All` | `anyOf` / `allOf` |
| `Discriminated` | `oneOf`, each branch with the tag as a `const` and required |
| `Nullable` | `type: [t, "null"]` |
| `Define(name)` / `Refer(name)` | the definition under `$defs`; `{ "$ref": "#/$defs/name" }` |
| `Describe` | `description` |
| `Never` | `{ "not": {} }` |
| `Any`, `Func`, a function `Check` | `{}` — nothing to say |

`Catch`, `Transform` and `Ignore` are transparent: the schema describes the
shape inside them. `Coerce`, `Rename` and `Key` change what comes *out*, not
what goes in, so they have no rendering.

## See also

- [Shape API](../reference/shape-api.md) — the other introspection methods.
- [Use Shape as a Standard Schema](use-as-standard-schema.md).

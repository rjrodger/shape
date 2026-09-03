# How to export and import a JSON Schema

**Goal:** hand the values a shape accepts to a tool that speaks
[JSON Schema](https://json-schema.org/)—an editor, a form generator, an API
description—without writing the schema twice; and go the other way, so a
schema you already have becomes a shape.

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
  "required": ["email", "name"],
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
| a literal, `Default`, `Optional(token)` | `default`—the value an absent property is given |
| a required property | listed in `required` (sorted) |
| a closed object | `additionalProperties: false`; `Open` omits it; `Child(shape)` sets it to that shape |
| `[shape]`, a tuple, `Rest`, `Closed([shape])` | `items`, `prefixItems` (+ `items: false` when nothing may follow) |
| `Min` / `Max` / `Above` / `Below` / `Len` | `minimum`…, `minLength`…, `minItems`…, `minProperties`… by the node's kind—every family when it has none |
| `Exact` | `enum` |
| `Email`, `Url`, `Uuid`, `DateTime`, `Ipv4`, `Ipv6` | `format`; `Ip` is an `anyOf` of the two |
| a bare `/re/`, `Check(/re/)` | `pattern` |
| `One`, `Some` / `All` | `anyOf` / `allOf` |
| `Discriminated` | `oneOf`, each branch with the tag as a `const` and required |
| `Nullable` | `type: [t, "null"]` |
| `Define(name)` / `Refer(name)` | the definition under `$defs`; `{ "$ref": "#/$defs/name" }` |
| `Describe` | `description` |
| `Never` | `{ "not": {} }` |
| `Any`, `Func`, a function `Check` | `{}`—nothing to say |

`Catch`, `Transform` and `Ignore` are transparent: the schema describes the
shape inside them. `Coerce`, `Rename` and `Key` change what comes *out*, not
what goes in, so they have no rendering.

## Import

`fromJsonSchema` (TS) and `FromJSONSchema` (Go) build a *spec* from a JSON
Schema document—draft 2020-12, and the common keywords of the earlier
drafts. Compile it with `Shape`, or compose it further with the builders as
you would any spec.

**TS**

```js
const { Shape, fromJsonSchema, Extend } = require('shape')

const schema = {
  type: 'object',
  properties: {
    name:  { type: 'string', minLength: 1 },
    age:   { type: 'integer', minimum: 0, default: 0 },
    email: { type: 'string', format: 'email' },
    role:  { enum: ['admin', 'user'] },
    tags:  { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'email', 'role'],
  additionalProperties: false,
}

const shape = Shape(fromJsonSchema(schema))
shape({ name: 'Ann', email: 'ann@example.com', role: 'user' })
// → { name: 'Ann', email: 'ann@example.com', role: 'user', age: 0 }

// A spec composes: add a property, then compile.
const wider = Shape(Extend({ nick: String }, fromJsonSchema(schema)))
```

**Go**

```go
var schema any
json.Unmarshal(doc, &schema)                 // map[string]any, as encoding/json decodes it

spec, err := shape.FromJSONSchema(schema)    // or shape.MustFromJSONSchema
s := shape.MustShape(spec)
```

### What is read

| Schema | Shape |
| ------ | ----- |
| `type: string`, `number`, `integer`, `boolean`, `null` | `String`, `Number`, `Integer`, `Boolean`, a required `null`; a string with no `minLength` may be empty (`Empty(String)`) |
| `type: [t, "null"]`, `type: [a, b]` | `Nullable(t)`, `One(a, b)` |
| `properties`, `required` | an object; a listed property is `Required`, one with a `default` optional with it, and any other `Skip` (absent stays absent); a required name with no schema is `Required()` |
| `additionalProperties` | absent or `true`: `Open`; `false`: closed; a schema: `Child(shape)` |
| `items`, `prefixItems` | `[shape]`; a tuple, closed when `items` is `false`, open (`Rest(Any)`) when absent, `Rest(shape)` otherwise |
| `minimum`… `maxProperties`, `exclusiveMinimum` / `exclusiveMaximum` (number or draft-4 boolean) | `Min`, `Max`, `Above`, `Below` on the typed node; on an untyped schema a bare bound, which applies to whatever kind the value is |
| `pattern`, `format` (`email`, `uri`, `uuid`, `date-time`, `ipv4`, `ipv6`) | a regexp; `Email`, `Url`, `Uuid`, `DateTime`, `Ipv4`, `Ipv6`; the export's `anyOf` of the two address formats is `Ip`. An unknown format is ignored |
| `enum`, `const` | `Exact(...)` |
| `anyOf`, `oneOf`, `allOf` | `One`, `One`, `All`; a `oneOf` of objects that each require a distinct string `const` on one property is `Discriminated` on it |
| `not: {}`, `true`, `false` | `Never`; `Any`; `Never` (a boolean is read as a subschema—the document itself must be an object) |
| `default`, `description` | `Default`, `Describe` |
| `$ref: "#/$defs/name"` (or `definitions`), `$ref: "#"` | the definition, inlined where it is referenced; a definition that refers to itself is `Define`d at its outermost use and `Refer`red within, so recursion validates |

Keywords with no counterpart (`patternProperties`, `uniqueItems`,
`dependentRequired`, `if`/`then`, `$ref` to another document…) are ignored;
a wrong type, an unknown reference, a bad pattern, or a keyword of the wrong
shape (`items: null`) is an error naming the location, such as
`JSON Schema: unknown type "strng" at /properties/a`.

### Round trips

Export → import → export gives the same document for every rendering in the
preceding table, with two exceptions to know about: a definition used more
than once comes back inlined at each use (no `$defs`), and a `Date` comes
back as a `DateTime` string. A default the shape itself would reject (such as
`Optional(String)`'s `""` against `minLength: 1`) round-trips unchanged: it is
read back as a default, since a default is a value the shape produces rather
than one it checks. The
[differential harness](../../test/differential/README.md) compares the
re-export in both languages on every case, and the
[corpus](../../test/README.md) has `{"$jsonschema": …}` rows.

## See also

- [Shape API](../reference/shape-api.md)—the other introspection methods.
- [Use Shape as a Standard Schema](use-as-standard-schema.md).

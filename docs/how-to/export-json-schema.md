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
| `[shape]`, a tuple, `Rest`, `Closed([shape])` | `items`, `prefixItems` (+ `items: false` when nothing may follow); the required positions of a tuple as `minItems` |
| `Min` / `Max` / `Above` / `Below` / `Len` | `minimum`…, `minLength`…, `minItems`…, `minProperties`… by the node's kind—every family when it has none |
| `Exact` | `enum` |
| `Email`, `Url`, `Uuid`, `DateTime`, `Ipv4`, `Ipv6` | `format`; `Ip` is an `anyOf` of the two |
| a bare `/re/`, `Check(/re/)` | `pattern` |
| `All` | `allOf` |
| `Nof` | a count of none, exactly one or every branch: `not` (of an `anyOf` when there are several), `oneOf`, `allOf`; at least one is `anyOf`, and not every one is `not` of an `allOf`. Exactly one of a shape for every kind of JSON value is a schema with no `type`: each kind's keywords side by side |
| `Discriminated` | `oneOf`, each branch with the tag as a `const` and required |
| `Nullable` | `type: [t, "null"]` |
| `Define(name)` / `Refer(name)` | the definition under `$defs`; `{ "$ref": "#/$defs/name" }` |
| `Describe` | `description` |
| `Never` | `{ "not": {} }` |
| `Any`, `Func`, a function `Check` | `{}`—nothing to say |

JSON Schema has no keyword for any other count, so a `Nof` such as
`Nof(Min(2), a, b, c)` exports the bound it implies: `anyOf` when the count
never admits none, `not` of an `allOf` when it never admits every branch.
The schema then accepts more than the shape does.

`Catch`, `Transform` and `Ignore` are transparent: the schema describes the
shape inside them. `Coerce`, `Rename` and `Key` change what comes *out*, not
what goes in, so they have no rendering.

## Import

`fromJsonSchema` (TS), `FromJSONSchema` (Go) and `from_json_schema` (Rust)
build a *spec* from a JSON Schema document—draft 2020-12, and the common
keywords of the earlier drafts. Compile it with `Shape`, or compose it
further with the builders as you would any spec.

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

### Every keyword applies

The keywords of a schema are separate checks, and a value must pass them all.
The import reads each keyword, or each family of them, as one part, and a
schema of more than one part as `All` of the parts:

```js
const either = Shape(fromJsonSchema({
  type: 'object',
  properties: { a: { type: 'string' } },
  oneOf: [{ required: ['a'] }, { required: ['b'] }],
}))

either({ a: 5 })
// throws: Validation failed for property "a" with number "5" because the number is not of type string.
```

The `oneOf` holds beside the `properties`, and the failure is the failing
part's own error. An `enum` or `const` beside other keywords keeps only the
values those keywords allow, so `{ type: 'string', enum: ['a', 1] }` is
`Exact('a')`.

Each keyword also applies to its own kind of value only. A schema with no
`type` checks a string against `minLength` and `pattern`, a number against
`minimum`, and so on, and passes every other kind:

```js
const email = Shape(fromJsonSchema({ format: 'email' }))

email(12)      // 12: format says nothing of a number
email('nope')  // throws: Value "nope" for property "" is not a valid email address.
```

Such a schema reads as `Nof(1, …)` of a shape for each kind of JSON value,
and the value's kind chooses among them (see
[`Nof`](../reference/builders.md#composition)), so the error is that kind's
own. Within a schema that has one `type`, the schemas under `not`, `allOf`,
`anyOf` and `oneOf` are read for that kind alone.

A `$ref` is one keyword among the others, as it is from draft 2019-09: the
keywords beside it apply too. A document whose `$schema` names draft 7 or
earlier keeps the older reading, in which the keywords beside a `$ref` are
ignored.

### What is read

| Schema | Shape |
| ------ | ----- |
| `type: string`, `number`, `integer`, `boolean`, `null` | `String`, `Number`, `Integer`, `Boolean`, a required `null`; a string with no `minLength` may be empty (`Empty(String)`) |
| `type: [t, "null"]`, `type: [a, b]` | `Nullable(t)`, `Nof(1, a, b)`, chosen by the value's kind; `number` covers `integer` |
| no `type` | each kind of value checked with that kind's keywords only, every other kind passing |
| `properties`, `required` | an object; a listed property is `Required`, one with a `default` optional with it, and any other `Skip` (absent stays absent), whatever its schema; a required name with no schema is `Required()` |
| `additionalProperties` | absent or `true`: `Open`; `false`: closed; a schema: `Child(shape)` |
| `items`, `prefixItems` | `[shape]`; a tuple, closed when `items` is `false`, open (`Rest(Any)`) when absent, `Rest(shape)` otherwise. A position may be absent, unless one after it has a default to fill in |
| `minimum`… `maxProperties`, `exclusiveMinimum` / `exclusiveMaximum` (number or draft-4 boolean) | `Min`, `Max`, `Above`, `Below` on the node of that kind |
| `pattern`, `format` (`email`, `uri`, `uuid`, `date-time`, `ipv4`, `ipv6`) | a regexp; `Email`, `Url`, `Uuid`, `DateTime`, `Ipv4`, `Ipv6`; the export's `anyOf` of the two address formats is `Ip`. An unknown format is ignored |
| `enum`, `const` | `Exact(...)` of the values the other keywords allow; none is `Never`, as is an empty `enum` |
| `anyOf`, `oneOf`, `allOf` | `Nof(Min(1), …)`, `Nof(1, …)`, `All`; a `oneOf` of objects that each require a distinct string `const` on one property is `Discriminated` on it |
| `not` | `Nof(0, s)`, ahead of the other keywords, so it applies to the value as given, before a default fills it; `not: {}` is `Never`, whatever else the schema says |
| `true`, `false` | `Any`; `Never`. The whole document may be either |
| `default`, `description` | `Default`, `Describe` |
| `$ref: "#/$defs/name"` (or `definitions`), `$ref: "#"` | the definition, inlined where it is referenced; a definition that refers to itself is `Define`d at its outermost use and `Refer`red within, so recursion validates |

Keywords with no counterpart (`patternProperties`, `uniqueItems`,
`dependentRequired`, `if`/`then`, `$ref` to another document…) are ignored.
A wrong type, an unknown reference, a bad pattern, or a keyword of the wrong
shape (`items: null`) is an error naming the location, such as
`JSON Schema: unknown type "strng" at /properties/a`.

### Refuse what is not enforced

An ignored keyword lets through a value the schema forbids. To be told
instead, import strictly:

```js
fromJsonSchema({ type: 'array', uniqueItems: true }, { strict: true })
// throws: JSON Schema: unsupported keyword "uniqueItems" at /
```

`FromJSONSchemaWith(schema, shape.JSONSchemaImportOptions{Strict: true})` in
Go and `from_json_schema_with(&schema, &JsonSchemaImportOptions { strict: true })`
in Rust do the same. A strict import refuses `if`, `contains`,
`dependentRequired`, `dependentSchemas`, `dependencies`, `multipleOf`,
`patternProperties`, `propertyNames`, `uniqueItems` (unless `false`),
`unevaluatedItems`, `unevaluatedProperties`, `$dynamicRef` and
`$recursiveRef`.

### Round trips

Export → import → export gives the same document for every rendering in the
preceding table, with three exceptions to know about: a definition used more
than once comes back inlined at each use (no `$defs`), a `Date` comes back as
a `DateTime` string, and a `Nof` exported as both an `anyOf` and a `not`
comes back as an `allOf` of the two. A default the shape itself would reject (such as
`Optional(String)`'s `""` against `minLength: 1`) round-trips unchanged: it is
read back as a default, since a default is a value the shape produces rather
than one it checks. The
[differential harness](../../test/differential/README.md) compares the
re-export in both languages on every case, and the
[corpus](../../test/README.md) has `{"$jsonschema": …}` rows.

## See also

- [Shape API](../reference/shape-api.md)—the other introspection methods.
- [Use Shape as a Standard Schema](use-as-standard-schema.md).

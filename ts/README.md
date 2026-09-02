# shape (TypeScript / JavaScript)

The canonical implementation of [`shape`](https://github.com/rjrodger/shape), a
schema-by-example validator: your schema looks (almost) exactly like your data.

```js
const { Shape } = require('shape')

const shape = Shape({
  port: 8080,        // optional, defaults to 8080, must be a number
  host: 'localhost', // optional, defaults to 'localhost', must be a string
  debug: Boolean,    // required, must be a boolean
})

shape({ debug: true })
// → { port: 8080, host: 'localhost', debug: true }

shape({ debug: 'yes' })
// throws ShapeError: Validation failed for property "debug" with string "yes"
//   because the string is not of type boolean.
```

Literal values are **optional with a default**; the wrapper constructors
(`String`, `Number`, `Boolean`, `Object`, `Array`, `Function`, `Date`) are
**required** type markers. Objects and arrays fill out and validate to any
depth. There are no dependencies.

This package defines the behaviour; the [Go port](../go/README.md) matches it
exactly, held there by a [shared conformance corpus](../test/README.md) and a
[differential harness](../test/differential/README.md). The full documentation
is in [`../docs`](../docs/README.md); this file is the TypeScript surface in
one place.

## Install

```sh
npm install shape
```

```js
const { Shape, Min, Optional } = require('shape')   // CommonJS
import { Shape, Min, Optional } from 'shape'         // ESM / TypeScript
```

Node 22+ (24 in CI). Type declarations ship with the package. Bundlers pick up
the CommonJS build, with Node's `util` swapped for a stub by the `browser`
field; a minified standalone bundle, `dist/shape.min.js`, exposes a global
`Shape` for a plain script tag. See
[the browser how-to](../docs/how-to/use-shape-in-the-browser.md).

## Using a shape

```js
const shape = Shape(spec, options?)

shape(value, ctx?)         // the produced value, with defaults injected; throws on failure
shape.match(value)         // boolean, no mutation
shape.valid(value)         // boolean
shape.error(value)         // ShapeError[] (empty when valid)
shape.spec()               // a JSON-friendly description of the compiled shape
shape.node()               // the compiled root node
shape.stringify()          // the shape as DSL-ish text
shape.jsonSchema()         // a JSON Schema (draft 2020-12) for the values accepted
Shape(fromJsonSchema(doc)) // and back: a spec built from a JSON Schema
shape['~standard']         // a Standard Schema V1 validator
```

Shape **mutates** the input to inject defaults; pass a fresh object if you need
the original kept. Pass `{ err: [] }` as `ctx` to collect errors instead of
throwing. See [the Shape API](../docs/reference/shape-api.md) and
[errors](../docs/reference/errors.md).

## Builders

Every builder is a named export, a property of `Shape`, and — except `One`,
`Some`, `All`, `Exact` and `Discriminated` — a chainable method on a node.
`G`-prefixed aliases (`GMin`, `GPick`, …) avoid clashes with local names.

```js
const { Shape, Required, Optional, Min, Max, Email, Coerce, One, Pick } = require('shape')

Shape({
  name:  Min(1, String),                 // required, at least one character
  age:   Coerce(Min(0, Max(120, Number))),  // "42" is accepted as 42
  email: Email,                          // a required email address
  role:  Exact('admin', 'user'),         // one of these
  tags:  Optional([String]),             // an optional array of strings
  id:    One(Number, String),            // either kind
  addr:  Open({ city: String }),         // other keys allowed
})

Required(Number).Min(2)                  // the same builders, chained
```

| Group | Builders |
| ----- | -------- |
| Required / optional / defaults | `Required` `Optional` `Default` `Skip` `Ignore` `Empty` `Nullable` `Fault` |
| Type / equality | `Type` `Integer` `Date` `Exact` `Never` `Func` `Any` |
| Coercion | `Coerce` — a decimal string to a number, `"true"`/`"1"` to a boolean, a number or boolean to a string, an ISO 8601 string or millisecond count to a `Date` |
| String formats | `Email` `Url` `Uuid` `DateTime` `Ip` `Ipv4` `Ipv6` |
| Bounds | `Min` `Max` `Above` `Below` `Len` — value for numbers, length for strings, arrays and objects |
| Custom checks | `Check` (a function or a `RegExp`) `Before` `After` |
| Isolation | `Catch(fallback, …)` `Transform(fn, …)` `Describe(text, …)` |
| Composition | `One` `Some` `All` `Discriminated(tag, { … })` |
| Objects / arrays | `Open` `Closed` `Child` `Rest` |
| Object algebra | `Pick` `Omit` `Partial` `Extend` — each builds a new object shape out of another |
| References | `Define` `Refer` `Rename` |
| Misc | `Key` |

The [builder reference](../docs/reference/builders.md) has the semantics of each.

## Key expressions and the string DSL

A property key of the form `"name: <expression>"` applies builders to the value,
which is the example the expression works on:

```js
Shape({
  'name: Min(1)':          String,
  'port: Optional(Number)': 8080,
  'user: Pick(["id"])':    { id: Number, name: String },
})
```

`expr(source)` compiles one expression, and `build(value)` expands every string
leaf of a JSON structure:

```js
const { expr, build } = require('shape')

Shape(expr('String.Min(2).Max(10)'))
build({ name: 'Min(1,String)', tags: ['String'] })
```

See [key and value expressions](../docs/how-to/use-key-and-value-expressions.md)
and [the string DSL](../docs/how-to/use-the-string-dsl.md).

## TypeScript

`Shape(spec)` infers the produced type from the spec, through every builder:
`Min(1, String)` is `string`, `Exact('a', 'b')` is `'a' | 'b'`, `Skip(Number)`
is `number | undefined`, a discriminated union is a union of its branches, and
a key expression `'port: Max(9)'` is the property `port`. The exported types
are `Node`, `Context`, `Update`, `State`, `Validate`, `Builder`, `ShapeShape`
and `StandardSchemaV1`. See
[TypeScript types](../docs/reference/typescript-types.md).

## Development

```sh
npm install
npm run build      # tsc: src → dist, test → dist-test (both git-ignored), then the browser bundle
npm run build-web  # esbuild: src/shape.web.js → dist/shape.min.js (a global Shape)
npm test           # node --test over dist-test
node --test --experimental-test-coverage dist-test/**/*.test.js
```

`src/shape.ts` is the whole library. The suite is held at **100% line
coverage** of `dist/shape.js`; a genuinely non-exercisable branch may carry a
`/* node:coverage disable */` pragma with a one-line reason. `npm test` also
runs the shared corpus in `../test/*.tsv`, whose expected columns are generated
from this build:

```sh
npm run build && node ../test/gen-compat.js    # regenerate the corpus
make -C .. test                                # both languages must pass it
make -C .. diff                                # the differential harness
```

A behaviour change starts here and is then mirrored in Go — see
[`../AGENTS.md`](../AGENTS.md).

## License

Copyright (c) 2021-2024, Richard Rodger and other contributors.
Licensed under [MIT](./LICENSE).

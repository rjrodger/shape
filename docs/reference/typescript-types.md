# TypeScript types reference

The package is written in TypeScript and ships type declarations. The exported
types are:

| Type | Purpose |
| ---- | ------- |
| `Validate` | signature of a custom validator: `(val, update, state) => boolean`, optionally carrying `s`/`a`/`n` metadata |
| `Update` | the object a validator fills in (see [nodes](nodes.md)) |
| `Context` | the validation context passed to a shape call |
| `Builder` | a node builder: `(opts?, ...vals) => Node` |
| `Node` | a compiled shape node |
| `State` | the traversal state passed to validators |
| `ShapeShape` | the return type of `Shape(...)` — the validator function plus its methods |
| `StandardSchemaV1` | the [Standard Schema](https://standardschema.dev/) interface every shape implements at runtime through `shape['~standard']`; the type `Shape(...)` returns does not declare it, so hand a shape over as `shape as unknown as StandardSchemaV1` |
| `StandardSchemaV1Props`, `StandardSchemaV1Result`, `StandardSchemaV1Issue`, `StandardSchemaV1PathSegment`, `StandardSchemaV1Types` | the parts of that interface |

The options object (`Shape(spec, options)`) and the error description
(`ErrDesc`) have no exported names: use `Parameters<typeof Shape>[1]` and the
element type of `Context['err']`.

## Result inference

`Shape(spec)` infers the produced value's type from the spec, through every
builder. The spec is read as a `const` type, so tuples and literal values keep
their shape.

| In the spec | Inferred |
| ----------- | -------- |
| `String`, `Number`, `Boolean`, `Date` | `string`, `number`, `boolean`, `Date` |
| `Array`, `Object`, `Function`, `Symbol` | `any[]`, `any`, `Function`, `symbol` |
| a literal (`8080`, `'x'`, `true`, a `Date`) | its primitive (`number`, `string`, `boolean`, `Date`) — the literal is a default, not the only value |
| `null`, `/re/` | `null`, `string` |
| a nested object | recursively inferred |
| `[X]` | `X[]`; `[X, Y]` a tuple `[X, Y]`; `[]` `any[]` |
| `'name: expr'` key | the property `name` — the expression text is not in the result |
| a builder wrapping a spec (`Min(1, Number)`, `Required(...)`, `Describe(...)`, `Coerce(...)`, …) | the spec's type |
| `Optional(X)`, `Default(v, X)` | `X` — an absent value is filled from the default |
| `Skip(X)`, `Ignore(X)` | `X \| undefined` |
| `Nullable(X)` | `X \| null` |
| `Integer` — bare or called | `number` |
| `Email`, `Url`, `Uuid`, `DateTime`, `Ip`, `Ipv4`, `Ipv6` — bare or called | `string` |
| `Never`, `Any`, `Func` — bare or called | `never`, `any`, `Function` |
| `Key()`; `Key(n)`; `Key(n, sep)`; `Key(fn)` | `string`; `string[]`; `string`; `fn`'s return type |
| `Exact(a, b, …)` | the union of the literals, `'a' \| 'b'` |
| `One(A, B)`, `Some(A, B)`, `All(A, B)` | `A \| B` — a branch with no spec of its own (`Min(2)`) is `any`, which absorbs the union |
| `Discriminated('kind', { dog: {…}, fish: {…} })` | a union of the branches, each with `kind: 'dog'` or `kind: 'fish'` |
| `Child(X)` | `{ [key: string]: X }`; `Rest(X)` `X[]` |
| `Pick(names, X)`, `Omit(names, X)`, `Extend(extra, X)`, `Partial(X)` | the reshaped object |
| `Transform(fn, X)` | `fn`'s return type; `Catch(fallback, X)` `X \| typeof fallback` |
| `Type(kind, …)` | the kind (`Type(Number)` and `Type('Number')` are `number`) |
| a chain, `Required(Number).Min(2)` | the same as the chain's first builder |

```ts
const shape = Shape({
  name: Min(1, String),            // string
  port: 8080,                      // number
  role: Exact('admin', 'user'),    // 'admin' | 'user'
  tags: Skip([String]),            // string[] | undefined
  'retries: Max(5)': 3,            // retries: number
})

const out = shape(input)   // { name: string, port: number, role: 'admin' | 'user', tags: string[] | undefined, retries: number }
```

An input typed `any` does not widen the result: `shape(JSON.parse(text))` is
typed from the spec. An input typed as an object keeps its own extra properties
in the result, so an `Open` shape's unknowns survive at the type level.
`shape.valid(value)` is a type guard: in its `true` branch `value` is narrowed
to the input type intersected with the result.

The checks are in `ts/test/types.test.ts`, which the build compiles: a wrong
inference fails the build.

## Importing

```ts
import { Shape } from 'shape'
import type { Node, Context, Update, State } from 'shape'
```

Builders are named exports, and are also attached to `Shape` (so
`const { Min } = require('shape')` and `Shape.Min` are equivalent). `G`-prefixed
aliases exist for every builder to avoid clashing with local names.

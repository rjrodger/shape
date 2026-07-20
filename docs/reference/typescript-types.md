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

## Result inference

`Shape(spec)` infers the validated result type from the spec. Wrapper markers
map to their primitive types:

| In the spec | Inferred field type |
| ----------- | ------------------- |
| `String` | `string` |
| `Number` | `number` |
| `Boolean` | `boolean` |
| `Array` | `any[]` |
| `Object` | `any` |
| `Function` | `Function` |
| a literal | the literal's type |
| a nested object | recursively inferred |

```ts
const shape = Shape({
  name: String,        // string
  age:  Number,        // number
  tags: [String],      // string[]
})

const out = shape(input)   // out.name: string, out.age: number, out.tags: string[]
```

## Importing

```ts
import { Shape } from 'shape'
import type { Node, Context, Update, State } from 'shape'
```

Builders are named exports, and are also attached to `Shape` (so
`const { Min } = require('shape')` and `Shape.Min` are equivalent). `G`-prefixed
aliases exist for every builder to avoid clashing with local names.

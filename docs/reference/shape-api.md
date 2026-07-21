# Shape API reference

## Compiling a shape

**TS** — `Shape(spec, options?)` returns a validator function that also carries
methods.

```js
const { Shape } = require('shape')
const shape = Shape(spec, options)
```

**Go** — compilation returns a `*Schema`.

```go
s, err := shape.Shape(spec)
s := shape.MustShape(spec)                 // panics on a bad spec
s, err := shape.ShapeWith(spec, options)
s := shape.MustShapeWith(spec, options)
```

## Validating

| TS | Go | Result |
| -- | -- | ------ |
| `shape(value, ctx?)` | `s.Validate(value)` / `s.ValidateCtx(value, ctx)` | produced value (defaults injected). TS **throws** on failure; Go returns an `error`. |
| `shape.match(value, ctx?)` | `s.Match(value)` | `boolean` — no mutation, no error building. |
| `shape.valid(value, ctx?)` | `s.Valid(value)` | `boolean` — alias-style validity check. |
| `shape.error(value, ctx?)` | `s.Error(value)` | list of errors (empty/`nil` when valid). |

## Introspection

| TS | Go | Result |
| -- | -- | ------ |
| `shape.spec()` | `s.Spec()` | JSON-friendly structural description. |
| `shape.node()` | `s.Node()` | the compiled root node. |
| `shape.stringify(...)` | `s.String()` | DSL-ish string rendering. |
| `shape.jsonify()` | — | JSON form used by `stringify`. |
| `Shape.isShape(v)` | `shape.IsShape(v)` | is `v` a compiled shape? |

## The validation context

Pass a context object to influence a run and to collect errors.

**TS `Context`** (all optional):

| Field | Meaning |
| ----- | ------- |
| `err` | an array to collect errors into (instead of throwing), or `false` to suppress |
| `log(point, state)` | traversal callback for debugging |
| `skip` | `{ depth, keys }` — positions to skip |
| `prefix` / `suffix` | text wrapped around a thrown error message |
| (your own) | any extra keys are visible to custom validators via `state.ctx` |

**Go `*shape.Context`**: `Err []FieldError`, `Custom map[string]any`, plus
internal fields; pass it to `ValidateCtx`.

## Options

Passed as the second argument to `Shape`/`ShapeWith`. Defaults shown.

| Concept | TS | Go | Default |
| ------- | -- | -- | ------- |
| Name (for error prefixes) | `name` | — (uses `MakeArgu` name) | random `G$…` |
| Key expressions (`"x: Min(1)"`) | `keyexpr.active` | `KeyExpr.Disable` | **on** |
| Meta sidecar keys | `meta.active`, `meta.suffix` | `Meta.Active`, `Meta.Suffix` | off, `$$` |
| Value expressions | `valexpr.active`, `valexpr.keymark` | `ValExpr.Active`, `ValExpr.KeyMark` | off, `$$` |

```js
// TS
Shape(spec, {
  name: 'options',
  keyexpr: { active: true },
  meta:    { active: false, suffix: '$$' },
  valexpr: { active: false, keymark: '$$' },
})
```

```go
// Go
shape.ShapeWith(spec, shape.ShapeOptions{
    KeyExpr: shape.KeyExprOptions{Disable: false},
    Meta:    shape.MetaOptions{Active: false, Suffix: "$$"},
    ValExpr: shape.ValExprOptions{Active: false, KeyMark: "$$"},
})
```

## String DSL helpers

| TS | Go |
| -- | -- |
| `expr(source)` | `shape.Expr(source)` / `shape.MustExpr(source)` |
| `build(value)` | `shape.Build(value)` |

See [Use the string DSL](../how-to/use-the-string-dsl.md).

## Argument validation

`MakeArgu(name)` builds a positional-argument validator. See
[Go API: argu](go-api.md#argu) and [arrays how-to](../how-to/validate-arrays-and-tuples.md).

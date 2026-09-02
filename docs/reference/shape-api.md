# Shape API reference

## Compiling a shape

**TS** — `Shape(spec, options?)` returns a validator function that also carries
methods. A bad spec (`Min('x')`, `Pick` of an unknown property) throws here, at
compile time. The validator **mutates** the value it is given to inject
defaults.

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
| `shape.valid(value, ctx?)` | `s.Valid(value)` | `boolean` — alias-style validity check; in TS a type guard, and a `ctx` you pass collects the errors in `ctx.err`. |
| `shape.error(value, ctx?)` | `s.Error(value)` | list of issues — TS `ErrDesc[]`, Go `[]FieldError` — empty/`nil` when valid. |
| `shape['~standard'].validate(value)` | `s.Standard().Validate(value)` | `{ value }` or `{ issues }`, never throws — see [Standard Schema](../how-to/use-as-standard-schema.md). |

## Introspection

| TS | Go | Result |
| -- | -- | ------ |
| `shape.spec()` | `s.Spec()` | JSON-friendly structural description. |
| `shape.node()` | `s.Node()` | the compiled root node. |
| `shape.stringify(...)` | `s.String()` | DSL-ish string rendering. |
| `shape.jsonify()` | — | JSON form used by `stringify`. |
| `shape.toString()` | — | `[Shape <name> <stringify>]`, also used by `util.inspect`. |
| `shape.jsonSchema()` | `s.JSONSchema()` | a JSON Schema (draft 2020-12) for the values accepted — see [the how-to](../how-to/export-json-schema.md). |
| `fromJsonSchema(schema)` | `FromJSONSchema(schema)` | a spec built from a JSON Schema, to compile with `Shape` — see [the how-to](../how-to/export-json-schema.md#import). |
| `Shape.isShape(v)` | `shape.IsShape(v)` | is `v` a compiled shape? |

## The validation context

Pass a context object to influence a run and to collect errors.

**TS `Context`** (all optional):

| Field | Meaning |
| ----- | ------- |
| `err` | an array to collect errors into (instead of throwing), or `false` to suppress — the run then returns the value as far as it got |
| `log(point, state)` | traversal callback for debugging; `point` is `so`/`eo` (start/end object), `sa`/`ea` (start/end array) or `kv` (a value) |
| `skip` | `{ depth, keys }` — treat the nodes at a depth (a number or a list; the root is 0) or the top-level properties named in `keys` as `Skip`: optional, no default injected |
| `prefix` / `suffix` | text wrapped around a thrown error message, as `prefix: message suffix` |
| (your own) | any extra keys are visible to custom validators via `state.ctx` |

**Go `*shape.Context`**: `Err []FieldError`, `Custom map[string]any`, plus
internal fields; pass it to `ValidateCtx`.

## Options

Passed as the second argument to `Shape`/`ShapeWith`. Defaults shown.

| Concept | TS | Go | Default |
| ------- | -- | -- | ------- |
| Name (for error prefixes) | `name` | — (uses `MakeArgu` name) | random `G$…` — a name not starting with `G$` is prepended to thrown messages as `name: …` |
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
| `build(value, options?)` | `shape.Build(value)` |

`expr` compiles one expression string into a node, to compile with `Shape`;
`build` walks a JSON structure, compiles every string leaf as an expression
(a `$$` key is left as a value expression), and returns the **compiled shape**.
See [Use the string DSL](../how-to/use-the-string-dsl.md).

## Argument validation

`MakeArgu(name)` builds a positional-argument validator, `Argu(args, whence?,
spec)`, which validates an arguments array (or `arguments`) against `spec` — an
object whose properties are the positions, in order — and returns the produced
object; `whence` names the call site in errors. `Argu(whence, spec)` without
`args` returns a reusable `(args) => object`. See
[Go API: Argu](go-api.md#positional-arguments-argu) and the
[arrays how-to](../how-to/validate-arrays-and-tuples.md).

## Other TS exports

Every builder is also a property of `Shape` (`Shape.Min`), and has a `G`-prefixed
alias (`GMin`) for when the plain name clashes. The remaining exports are
utilities used by the builders and the string DSL:

| Export | Purpose |
| ------ | ------- |
| `nodize(value, depth?, meta?)` | normalise a spec value into a [node](nodes.md); an existing node is returned as is |
| `buildize(self?, shape?)` | the node a builder works on: `nodize(shape)` merged over the chained node `self`, with the chainable builder methods attached |
| `makeErr(state, text?, why?, use?)` | build an `ErrDesc` for `update.err` from inside a custom validator; `$VALUE`/`$PATH` in `text` are expanded, `why` defaults to `check` |
| `stringify(value, dequote?, expand?, ignore?, replacer?)` | the DSL-ish rendering used in messages and `shape.stringify`; `dequote` drops the quotes around a string, `ignore.key`/`ignore.val` list strings or regular expressions to omit |
| `truncate(str, len?)` | cut `str` to `len` characters (default 30) with a trailing `...` |
| `Shape.jsonSchema(node)` | the JSON Schema for a compiled node; `shape.jsonSchema()` is the shape's own |
| `G$(node)` | mark a plain object as an already-built node |
| `Shape.isShape(v)` | is `v` a compiled shape? |

# How to use the string DSL

**Goal:** express a shape as a compact string, or expand a whole JSON structure
whose string leaves are expressions. Useful for config files and serialized
schemas.

## `expr` — parse one expression

`expr(source)` turns a string into a shape node.

**TS**

```js
const { Shape, expr } = require('shape')

const shape = Shape(expr('String.Min(2).Max(10)'))
shape('hi')     // OK
shape('h')
// throws: Value "h" for property "" must be a minimum length of 2 (was 1).
```

**Go**

```go
n := shape.MustExpr("String.Min(2).Max(10)")
s, _ := shape.Shape(n)
```

### Grammar

- **Builders** are called by name: `Min(2)`, `Max(10)`, `One(Number,String)`.
- **Chaining** with `.`: `Number.Min(1).Below(10)`. Adjacent builders without a
  dot also chain.
- **Type tokens**: `String`, `Number`, `Boolean`, `Object`, `Array`,
  `Function`, `Integer`, `Date`, `Any` — each reads as `Type(token)`: a
  required type (`Any` excepted), so a bare `Object` is a closed object and
  `Array` accepts any elements. A token with arguments applies the type to
  them: `String(Min(2))`.
- **Literals** are JSON: `42`, `"text"`, `true`, plus `null`, `undefined`,
  `NaN`. A bare literal at the top level becomes a `Default`. A list literal
  can hold one element (`["a"]`); the tokenizer splits on commas, so a longer
  one cannot be written.
- **Regular expressions**: `/pattern/` is a string that must match — a type,
  so a non-string fails as a type error. `Check(/pattern/)` is the explicit
  check form.
- Commas between arguments are optional.
- There is no object literal. A builder that needs one — `Extend`, or the
  shape `Pick`/`Omit`/`Partial` work on — is reached through a
  [key expression](use-key-and-value-expressions.md), whose example value is
  handed to the builder: `{ 'u: Pick(["a"])': { a: 1, b: 2 } }`.

## `build` — expand a JSON structure

`build(value)` walks a JSON value and replaces every **string** leaf with the
result of `expr`, then compiles the whole thing.

**TS**

```js
const { build } = require('shape')

const shape = build({
  name: 'Min(1,String)',
  age:  'Min(0,Number)',
  tags: ['String'],
})

shape({ name: 'a', age: 3, tags: ['x'] })   // OK
```

**Go**

```go
s, _ := shape.Build(map[string]any{
    "name": "Min(1,String)",
    "age":  "Min(0,Number)",
    "tags": []any{"String"},
})
```

Non-string leaves (numbers, booleans) are kept as literal defaults. A key that
is exactly `$$` is passed through unchanged (reserved for value expressions).

## Round-tripping a compiled shape

`shape.stringify()` (TS) / `s.String()` (Go) renders a compiled shape back to a
DSL-ish form for logging and serialization.

## See also

- [Builder reference](../reference/builders.md) — the builders the DSL exposes.
- [Key and value expressions](use-key-and-value-expressions.md).

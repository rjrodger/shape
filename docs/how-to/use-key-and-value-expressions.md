# How to use key and value expressions

**Goal:** attach builders to a property directly in its key, or drive a whole
object/array from an expression — without importing builder functions.

## Key expressions (on by default)

A property key of the form `"name: <expression>"` parses the expression as
builders applied to the value. This is enabled by default.

**TS**

```js
const shape = Shape({
  'name: Min(1)':   String,        // required, min length 1
  'tags: Max(10)':  [String],      // at most 10 strings
  'port: Required': 8080,          // make an otherwise-optional literal required
})

shape({ name: 'a', port: 8080 })   // → validated, key is "name" (not "name: Min(1)")
```

**Go**

```go
s := shape.MustShape(map[string]any{
    "name: Min(1)":  shape.String,
    "tags: Max(10)": []any{shape.String},
})
```

The bare property name (`name`, `tags`) is what appears in the output and in
error paths.

### Turn key expressions off

**TS**

```js
Shape({ 'a: b': 1 }, { keyexpr: { active: false } })  // "a: b" is a literal key
```

**Go**

```go
shape.MustShapeWith(spec, shape.ShapeOptions{
    KeyExpr: shape.KeyExprOptions{Disable: true},
})
```

## Value expressions (off by default)

With `valexpr` active, a special `$$` key whose value is an expression rewrites
the parent object/array. Other `$$`-prefixed keys attach metadata.

**TS**

```js
Shape({ '$$': 'Open', a: 1 }, { valexpr: { active: true } })
```

**Go**

```go
shape.MustShapeWith(spec, shape.ShapeOptions{
    ValExpr: shape.ValExprOptions{Active: true},
})
```

## Meta sidecar keys (off by default)

With `meta` active, a key ending in the meta suffix (`$$` by default) attaches
metadata to the property it precedes.

**TS**

```js
Shape({ 'a$$': 'a short description', a: Number }, { meta: { active: true } })
```

**Go**

```go
shape.MustShapeWith(spec, shape.ShapeOptions{
    Meta: shape.MetaOptions{Active: true, Suffix: "$$"},
})
```

## See also

- [Use the string DSL](use-the-string-dsl.md) for the full expression grammar.
- [Shape API: options](../reference/shape-api.md#options).

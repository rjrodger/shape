# How to validate arrays and tuples

**Goal:** validate lists whose elements share a shape, fixed-length tuples, and
tuples with a variable tail.

## A list of one shape

A single-element array means "zero or more elements, each matching this shape".

**TS**

```js
Shape([Number])            // any-length array of numbers
Shape({ tags: [String] })  // property that is an array of strings
```

**Go**

```go
shape.MustShape([]any{shape.Number})
```

```js
const shape = Shape([Number])
shape([1, 2, 3])  // OK
shape([1, 'x'])   // throws: index 1 is not of type number
```

Element error paths use the index, e.g. `tags.1`.

## A fixed-length tuple

Two or more example elements form a tuple of exactly that length; each position
has its own shape.

**TS**

```js
const point = Shape([Number, Number])
point([10, 20])       // OK
point([10, 20, 30])   // throws: index 2 is not allowed
point([10, 'x'])      // throws: index 1 is not of type number
```

Missing tuple positions are filled from their per-position defaults.

## A tuple with a variable tail: `Rest`

`Rest(shape)` matches any number of trailing elements after the fixed tuple
positions. Because it extends a *tuple*, build it on a node whose fixed
positions are already set (`buildize` lifts a spec into a chainable node):

```js
const { Shape, buildize, String, Number } = require('shape')
// [string, number, ...number]
const shape = Shape(buildize([String, Number]).Rest(Number))
shape(['a', 1, 2, 3])   // OK: 'a', 1, then any number of numbers
shape(['a', 1, 'x'])    // throws: not of type number
```

**Go**

```go
s := shape.MustShape(shape.Rest(shape.Number)) // tail-only, over a tuple base
```

## Force a single-shape array to be closed

`[Number]` is open-ended. To require exactly one element, close it:

```js
Shape(Closed([Number]))   // exactly one number
```

## See also

- [Builder reference: `Rest`, `Child`, `Closed`](../reference/builders.md#objects--arrays)
- Positional **function arguments** are validated with `MakeArgu` — see the
  [Go API](../reference/go-api.md#argu) / TS `MakeArgu`.

# Getting started

By the end of this tutorial you will have built a real configuration validator,
starting from a single default and growing it into a nested schema with required
fields, arrays and custom rules. Everything here works the same way in
TypeScript/JavaScript and in Go.

## 1. Install

**TypeScript / JavaScript**

```sh
npm install shape
```

```js
const { Shape } = require('shape')
// import { Shape } from 'shape'  // ESM and browsers work too
```

**Go**

```sh
go get github.com/rjrodger/shape/go
```

```go
import "github.com/rjrodger/shape/go"
```

## 2. Your first shape is just your data

A Shape specification looks like the data you expect. A literal value means
"optional, with this default, and this type".

**TS**

```js
const shape = Shape({
  port: 8080,
  host: 'localhost',
})

shape({ port: 9090 })
// → { port: 9090, host: 'localhost' }

shape({})
// → { port: 8080, host: 'localhost' }
```

**Go**

```go
s := shape.MustShape(map[string]any{
    "port": 8080,
    "host": "localhost",
})

out, _ := s.Validate(map[string]any{"port": 9090})
// out == map[string]any{"port": 9090, "host": "localhost"}
```

Missing fields are filled in from the defaults. This is the most common case for
options objects — everything optional, the default defines the type.

## 3. Nesting just works

Objects fill out to any depth (unlike `Object.assign` or spread).

**TS**

```js
const shape = Shape({
  server: {
    port: 8080,
    host: 'localhost',
  },
})

shape({})
// → { server: { port: 8080, host: 'localhost' } }
```

## 4. Make a field required

Use a type marker instead of a literal. In TS these are the standard wrapper
objects (`String`, `Number`, `Boolean`, …). In Go they are the exported
sentinel tokens (`shape.String`, `shape.Number`, `shape.Boolean`, …).

**TS**

```js
const shape = Shape({
  timeout: 10000,   // optional, default 10000
  message: String,  // required string
  debug: Boolean,   // required boolean
})

shape({ message: 'hi', debug: true })   // OK
shape({ debug: true })                   // throws: message is required
```

**Go**

```go
s := shape.MustShape(map[string]any{
    "timeout": 10000,
    "message": shape.String,
    "debug":   shape.Boolean,
})

s.Validate(map[string]any{"message": "hi", "debug": true}) // OK
s.Validate(map[string]any{"debug": true})                  // error: message is required
```

Required fields have no default — you only declare the type.

## 5. Validate an array

Give one example element and every element must match it.

**TS**

```js
const shape = Shape({
  tags: [String],       // array of strings
})

shape({ tags: ['a', 'b'] })  // OK
shape({ tags: [1] })         // throws: index 0 is not of type string
```

A single-element array means "zero or more of this shape". Multiple elements
make a fixed-length tuple — see
[Validate arrays and tuples](../how-to/validate-arrays-and-tuples.md).

## 6. Add a constraint

Builders wrap a shape to add rules. They can be combined.

**TS**

```js
const { Shape, Min, Max } = require('shape')

const shape = Shape({
  name: Min(1, String),                 // non-empty string
  age:  Min(0, Max(120, Number)),       // 0..120
})
```

**Go**

```go
s := shape.MustShape(map[string]any{
    "name": shape.Min(1, shape.String),
    "age":  shape.Min(0, shape.Max(120, shape.Number)),
})
```

## 7. Handle failures

By default TS **throws** a `ShapeError`; Go **returns** an `error`.

**TS**

```js
try {
  shape({ age: 999 })
} catch (err) {
  console.log(err.message) // Value "999" for property "age" must be a maximum of 120 (was 999).
}
```

**Go**

```go
out, err := s.Validate(map[string]any{"age": 999})
if err != nil {
    fmt.Println(err) // Value "999" for property "age" must be a maximum of 120 (was 999).
}
```

To collect all errors instead of stopping at the first, see
[Handle and collect errors](../how-to/handle-and-collect-errors.md).

## Where to next

- Everything is optional-by-default; the mental model is
  [Schema by example](../explanation/schema-by-example.md).
- Pick a task from the [how-to guides](../README.md#how-to-guides).
- Look up any builder in the [builder reference](../reference/builders.md).

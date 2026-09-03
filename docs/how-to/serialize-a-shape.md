# How to serialize a shape

**Goal:** write a shape down as JSON, store or send it, and read it back as
the same shape—in any of the three languages.

A shape is normally written as a literal in the program that uses it. The
declarative JSON export writes one out instead, as the JSON dialect the
string DSL already reads. What comes back accepts and produces exactly what
the original did.

```js
const { Shape, Min, Optional } = require('shape')

const shape = Shape({ name: Min(1, String), age: Optional(Number) })

shape.json()
// { 'name: String.Min(1)': '', age: 0 }

Shape.build(shape.json())   // the same shape again
```

The export is a fixed point: the JSON of the shape built from a shape's JSON
is that same JSON. So a stored document can be read, re-exported and stored
again without drift.

## The three languages

**TS**

```js
const { Shape } = require('shape')

const text = JSON.stringify(Shape({ a: String }).json())
// '{"a: String":""}'

const back = Shape.build(JSON.parse(text))
back({ a: 'x' })   // { a: 'x' }
```

**Go**

```go
s := shape.MustShape(map[string]any{"a": shape.String})

j, err := s.JSON()          // map[string]any{"a: String": ""}
if err != nil {
    // the shape uses something JSON cannot say; see below
}

back, err := shape.Build(j) // the same shape again
_ = back
```

**Rust**

```rust
use shape::{build, obj, Schema, Token};

let s = Schema::new(obj([("a", Token::String)]));
let j = s.json().expect("a declarative shape");

let back = Schema::new(build(&j).expect("reads back"));
assert_eq!(back.json().unwrap(), j);
```

The JSON is the same in every language, and every language reads every
other's. The differential harness compares the two exports across all three
on thousands of specs.

## What the JSON looks like

The dialect is the one [key and value expressions](use-key-and-value-expressions.md)
and [the string DSL](use-the-string-dsl.md) describe. Four rules cover it.

**A property is a key expression, and its value is the example.** The chain
after the colon says the kind and the checks; the value beside it is the
default.

```js
Shape({ a: String, b: Optional(5), c: Min(2, String) }).json()
// { 'a: String': '', b: 5, 'c: String.Min(2)': '' }
```

A property whose shape is a plain optional value needs no chain at all, so
it is written as that value.

**A value that has no key form is an expression string.** A composition, a
regexp, a bare `Any`:

```js
Shape({ a: One(String, Number), b: /^x/ }).json()
// { a: 'One(String,Number)', b: '/^x/' }
```

**A `$$` key applies an expression to the object that holds it.** This is
how an object says something about itself:

```js
Shape(Open({ a: 1 })).json()
// { a: 1, $$: 'Open' }
```

**A `$$0`, `$$1`, ... key beside it carries a shape the expression cannot
spell inline**—an object or an array in an argument position:

```js
Shape({ a: Some({ x: 1 }, [String]) }).json()
// { a: { $$: 'Some($$0,$$1)', $$0: { x: 1 }, $$1: ['String'] } }
```

Numbers, booleans and `null` are themselves; a string is JSON-quoted, since a
bare string would read as an expression.

## What cannot be written down

A function has no text, so a shape that carries one cannot be written:
`Check(fn)`, `Before`, `After`, `Transform`, and `Key(fn)`. Nor can a builder
option the DSL has no word for (`Rename`'s `keep` and `claim`, `Refer`'s
`fill` and `strict`), or a default that is an object, an array, or a date.

TypeScript throws, Go returns an error, and Rust returns `Err`; the message
names what stopped it.

```js
Shape({ a: Shape.Check(v => v > 1) }).json()
// Error: Shape: json cannot express a check function
```

Everything else round trips, including tuples, rests, objects both open
and closed, discriminated unions, formats, bounds, `Catch`, `Ignore`, `Coerce`,
`Define` and `Refer`, `Describe` and `Fault`.

## When to use which export

| You want | Use |
| -- | -- |
| the same shape back, in any language | `json()` and `build()` |
| the *values* described to another tool | [`jsonSchema()`](export-json-schema.md) |
| a shape from a JSON Schema you already have | [`fromJsonSchema()`](export-json-schema.md) |

The declarative JSON keeps everything Shape knows: defaults, renames,
coercions, custom messages. A JSON Schema keeps only what that standard can
say about values.

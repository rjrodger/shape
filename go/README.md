# shape/go

Go port of the [`shape`](https://github.com/rjrodger/shape) schema-by-example
validator. Your schema looks (almost) exactly like your data.

```go
import "github.com/rjrodger/shape/go"

s := shape.MustShape(map[string]any{
    "port":  8080,         // optional, defaults to 8080, must be a number
    "host":  "localhost",  // optional, defaults to "localhost", must be a string
    "debug": shape.Boolean, // required, must be a boolean
})

out, err := s.Validate(map[string]any{"debug": true})
// out == map[string]any{"port": 8080, "host": "localhost", "debug": true}
```

## Install

```
go get github.com/rjrodger/shape/go
```

Requires Go 1.22+.

## Concepts

A schema is built from an example value. Literal values become **optional with
a default**; sentinel tokens become **required**.

### Sentinel tokens

Go cannot use predeclared types as runtime values, so the package exports
sentinels for each kind:

| Token             | Matches                                       |
| ----------------- | --------------------------------------------- |
| `shape.Any`       | any value                                     |
| `shape.String`    | strings                                       |
| `shape.Number`    | any numeric kind (`int*`, `uint*`, `float*`)  |
| `shape.Boolean`   | booleans                                      |
| `shape.Object`    | `map[string]any`                              |
| `shape.Array`     | `[]any`                                       |
| `shape.Function`  | `reflect.Func` values                         |

If you prefer a dot-import without colliding with stdlib names, `G`-prefixed
aliases are provided: `GString`, `GNumber`, `GBoolean`, `GRequired`, `GMin`,
etc.

### Objects

Objects are **closed by default** — extra keys cause a validation error.
Use `shape.Open(...)` to allow unknown properties, or `shape.Child(...)` to
declare a default shape for unknown values.

```go
shape.MustShape(shape.Open(map[string]any{"a": 1})) // extra keys allowed
shape.MustShape(shape.Child(shape.Number, map[string]any{})) // every value must be a number
```

### Arrays

A single-element array is treated as "every element matches this shape":

```go
shape.MustShape([]any{shape.Number}) // []number
```

Multiple elements form a **tuple** of fixed length. Use `shape.Rest(...)` to
allow a tail beyond the tuple positions.

## API

### Compilation

```go
shape.Shape(spec)                      // compile, returns (*Schema, error)
shape.ShapeWith(spec, shape.ShapeOptions{...})
shape.MustShape(spec)                  // panics on compile error
shape.MustShapeWith(spec, opts)
shape.Build(spec)                      // like Shape, but recursively expands string DSL
shape.Expr("String.Min(2).Max(10)")    // parse the string DSL into a *Node
shape.MustExpr(...)
```

### Validation

```go
out, err := s.Validate(input)          // returns the (defaults-injected) value plus *ValidationError
out, err := s.ValidateCtx(input, ctx)  // pass a *shape.Context for custom validators
ok       := s.Match(input)             // bool, no errors collected
ok       := s.Valid(input)             // alias of Match
issues   := s.Error(input)             // []FieldError, nil when valid
spec     := s.Spec()                   // structural snapshot of the compiled schema
str      := s.String()                 // debug rendering
```

`*ValidationError` aggregates one or more `FieldError`s; each carries
`Path`, `Key`, `Type`, `Value`, `Why`, `Mark`, and `Text`.

### Options

`shape.ShapeOptions` mirrors the TS options. Defaults shown:

```go
shape.ShapeOptions{
    KeyExpr: shape.KeyExprOptions{Disable: false}, // "x: Min(1)" key parsing — on
    Meta:    shape.MetaOptions{Active: false, Suffix: "$$"},
    ValExpr: shape.ValExprOptions{Active: false, KeyMark: "$$"},
}
```

With key-expression parsing on (the default), object keys may carry inline
builders:

```go
shape.MustShape(map[string]any{
    "name: Min(1)":  shape.String,
    "tags: Max(10)": []any{shape.String},
})
```

## Builders

All builders have a top-level form **and** a chainable method form on `*Node`.
Most accept an optional spec argument that the builder narrows or wraps.

### Required / optional / defaults

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `Required(spec?)`                | mark required (no default injection)                               |
| `Optional(spec?)`                | mark optional                                                      |
| `Default(value, spec?)`          | optional with an explicit default                                  |
| `Skip(spec?)`                    | optional, no default injection                                     |
| `Ignore(spec?)`                  | like `Skip`, suppresses errors on the value                        |
| `Empty(spec?)`                   | allow the empty string for a `String` shape                        |
| `Fault(msg, spec?)`              | override the error message produced when this node fails           |

### Type / equality

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `Type(kind, spec?)`              | force a specific `Kind` on the node                                |
| `Exact(values...)`               | require equality with one of the listed literals                   |
| `Never(spec?)`                   | always fails to match                                              |
| `Func(spec?)`                    | require a function-typed value                                     |

### Bounds

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `Min(n, spec?)` / `Max(n, spec?)` | numeric value or collection length bounds (inclusive)             |
| `Above(n, spec?)` / `Below(n, spec?)` | strict bounds                                                  |
| `Len(n, spec?)`                  | exact value or collection length                                   |

### Custom checks

| Builder                                                    | Effect                                |
| ---------------------------------------------------------- | ------------------------------------- |
| `Check(fn or *regexp.Regexp, spec?)`                       | custom predicate                      |
| `Before(fn, spec?)`                                        | run before structural type checks     |
| `After(fn, spec?)`                                         | run after structural type checks      |

Custom-check signature:

```go
func(val any, update *shape.Update, state *shape.State) bool
```

### Composition

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `One(shapes...)`                 | exactly one shape must match                                       |
| `Some(shapes...)`                | at least one shape must match                                      |
| `All(shapes...)`                 | every shape must match                                             |

### Objects / arrays

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `Open(spec?)` / `Closed(spec?)`  | allow / forbid unknown object properties                           |
| `Child(child, spec?)`            | default child shape for an `Open` object or for an array           |
| `Rest(child, spec?)`             | tail-shape for arrays past tuple positions                         |
| `Rename(name, spec?)`, `RenameWith(name, opts, spec?)` | rename an object property after validation     |

### References

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `Define(name, spec?)`            | name a shape so it can be referenced later                         |
| `Refer(name, spec?)`             | substitute the named shape at validation time                      |
| `ReferWith(name, opts, spec?)`   | `opts.Fill` substitutes even when the input value is missing       |

### Misc

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `Key(args...)`                   | replace the value with the validation key (or path slice)          |

## Example: composition and error handling

```go
s := shape.MustShape(map[string]any{
    "name":   shape.Min(1, shape.String),
    "age":    shape.Min(0, shape.Max(120, shape.Number)),
    "email":  shape.Check(regexp.MustCompile(`^.+@.+$`)),
    "role":   shape.Exact("admin", "user"),
    "tags":   shape.Optional([]any{shape.String}),
    "addr":   shape.Open(map[string]any{
        "city": shape.String,
    }),
})

out, err := s.Validate(input)
if verr, ok := err.(*shape.ValidationError); ok {
    for _, issue := range verr.Issues {
        fmt.Printf("%s [%s]: %s\n", issue.Path, issue.Why, issue.Text)
    }
}
```

## Status

The Go port covers the core TS behavior: required/optional semantics,
default injection, object/array recursion, open/closed handling, the full
builder set, key-expression parsing, the string DSL (`Expr` / `Build`), and
`Define`/`Refer`. See `PLAN.md` for the original porting plan and design
notes.

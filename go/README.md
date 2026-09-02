# shape/go

Go port of the [`shape`](https://github.com/rjrodger/shape) schema-by-example
validator. Your schema looks (almost) exactly like your data.

```go
import "github.com/rjrodger/shape/go"

s := shape.MustShape(map[string]any{
    "port":  8080,          // optional, defaults to 8080, must be a number
    "host":  "localhost",   // optional, defaults to "localhost", must be a string
    "debug": shape.Boolean, // required, must be a boolean
})

out, err := s.Validate(map[string]any{"debug": true})
// out == map[string]any{"port": 8080, "host": "localhost", "debug": true}
```

The TypeScript implementation in [`../ts`](../ts/README.md) is canonical: this
port matches it for validation outcomes, produced values and exact error text,
and a [shared conformance corpus](../test/README.md) plus a
[differential harness](../test/differential/README.md) keep it that way. The
full documentation is in [`../docs`](../docs/README.md); this file is the Go
surface in one place.

## Install

```
go get github.com/rjrodger/shape/go
```

Requires Go 1.22+. The module has no dependencies.

## Concepts

A schema is built from an example value. Literal values become **optional with
a default**; sentinel tokens become **required**.

### Sentinel tokens

Go cannot use predeclared types as runtime values, so the package exports
sentinels for each kind:

| Token             | Matches                                                  |
| ----------------- | -------------------------------------------------------- |
| `shape.Any`       | any value (the one token that does not require a value)  |
| `shape.String`    | strings (not the empty string, unless `Empty`)           |
| `shape.Number`    | any numeric kind (`int*`, `uint*`, `float*`)             |
| `shape.Integer`   | a number with no fractional part                         |
| `shape.Boolean`   | booleans                                                 |
| `shape.Object`    | `map[string]any` — open, as a token                      |
| `shape.Array`     | `[]any` (typed slices are accepted and converted)        |
| `shape.Function`  | `reflect.Func` values                                    |
| `shape.Date`      | `time.Time` values                                       |

If you prefer a dot-import without colliding with stdlib names, `G`-prefixed
aliases are provided for every token and builder: `GString`, `GNumber`,
`GRequired`, `GMin`, `GPick`, etc.

### Absent versus null

Go has no `undefined`. A **missing** map key is absent — it may be defaulted or
flagged required. An explicit `nil` value is a present null, a type error
against a typed shape. At the top level `Validate(nil)` means "no value
supplied" and fills defaults; pass `shape.Null` to mean a present null there.

### Objects

Objects are **closed by default** — extra keys cause a validation error. An
empty `map[string]any{}` is open. Use `shape.Open(...)` to allow unknown
properties, or `shape.Child(...)` to declare a shape for unknown values.

```go
shape.MustShape(shape.Open(map[string]any{"a": 1}))          // extra keys allowed
shape.MustShape(shape.Child(shape.Number, map[string]any{})) // every value must be a number
```

Go maps are unordered, so an object's keys are processed in **alphabetical**
order: that fixes the order of multiple errors and how an object value is
rendered inside a message. The produced value is unaffected.

### Structs

A struct, or pointer to one, is accepted wherever an object is: it is read by
its `json` tags (`-` hides, `omitempty` makes a zero value absent, embedded
structs are promoted) into the map model, so it validates exactly as the map
it encodes to. `ValidateInto` decodes the produced value back into a struct.
A struct is also a spec by example, its fields the defaults and its `shape`
tags the key expressions:

```go
type Config struct {
    Host  string `shape:"Min(1)"`
    Port  int    `shape:"Min(1).Max(65535)"`
    Debug bool   `shape:"Boolean"` // required
}
s := shape.MustShape(Config{Host: "localhost", Port: 8080})

var c Config
err := s.ValidateInto(map[string]any{"Debug": true}, &c) // c.Port == 8080
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
shape.IsShape(v)                       // is v a *Schema?
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
schema   := s.JSONSchema()             // a JSON Schema (draft 2020-12), as map[string]any
spec, _  := shape.FromJSONSchema(doc)  // and back: a spec built from a JSON Schema
err      := s.ValidateInto(input, &out) // validate, then decode the result into a struct
```

`Validate` and `Error` never change their input. The value `Validate`
returns is produced by copying on write: an object or array of the input
that validates as it is comes back as itself, and one that changes (a
default injected, a key renamed or dropped, a child produced as a
different value) comes back as a copy, with the input left as it was. So
the result may share structure with the input; take a copy before
changing either if both are kept. (Before v0.4.0 every object and array
was copied whether it changed or not.)

Injected defaults are deep-cloned, so two results never share a default's
state. A validator attached to a node after `Shape()` has compiled it is not
seen by the compile, so attach validators before compiling.

`*ValidationError` aggregates one or more `FieldError`s, joined by newline in
`Error()`; each carries `Path`, `PathArr`, `Key`, `Type`, `Value`, `Why`,
`Check`, `Mark`, `Args` and `Text`. The message text is identical to the
TypeScript implementation's.

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
builders, and the value is the example the builder works on:

```go
shape.MustShape(map[string]any{
    "name: Min(1)":       shape.String,
    "tags: Max(10)":      []any{shape.String},
    "port: Optional(Number)": 8080,                    // optional, defaults to 8080
    `user: Pick(["id"])`: map[string]any{"id": shape.Number, "name": shape.String},
})
```

## Builders

All builders have a top-level form **and**, unless noted, a chainable method
form on `*Node`. Most accept an optional spec argument that the builder narrows
or wraps. The [builder reference](../docs/reference/builders.md) has the
detail; the tables here list the Go signatures.

### Required / optional / defaults

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `Required(spec?)`                | mark required (no default injection)                               |
| `Optional(spec?)`                | mark optional                                                      |
| `Default(value, spec?)`          | optional with an explicit default                                  |
| `Skip(spec?)`                    | optional, no default injection                                     |
| `Ignore(spec?)`                  | like `Skip`, and drop the value if anything in its subtree fails   |
| `Empty(spec?)`                   | allow the empty string for a `String` shape                        |
| `Nullable(spec?)`                | accept an explicit `nil` as the value                              |
| `Fault(msg, spec?)`              | override the structural error message of this node                 |

### Type / equality / coercion

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `Type(kind, spec?)`              | force a `Kind`, `TypeToken`, kind name or node's type on the node  |
| `Exact(values...)`               | require equality with one of the listed literals (top-level only)  |
| `Never(spec?)`                   | always fails to match                                              |
| `Func(spec?)`                    | a function-typed value; optional of itself (the `Function` token is required) |
| `Coerce(spec?)`                  | convert a string/number/bool to the node's kind first, where unambiguous |
| `.Any()`, `.Integer()`, `.Date()` | chain shortcuts for the `Any`, `Integer` and `Date` tokens        |

### String formats

`Email`, `Url`, `Uuid`, `DateTime`, `Ip`, `Ipv4`, `Ipv6` — each `(spec?)`,
each requiring a string in that format; bare, a required string.

### Bounds

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `Min(n, spec?)` / `Max(n, spec?)` | numeric value or collection length bounds (inclusive)             |
| `Above(n, spec?)` / `Below(n, spec?)` | strict bounds                                                  |
| `Len(n, spec?)`                  | exact value or collection length                                   |

### Custom checks and isolation

| Builder                                                    | Effect                                |
| ---------------------------------------------------------- | ------------------------------------- |
| `Check(fn or *regexp.Regexp, spec?)`                       | custom predicate                      |
| `Before(fn, spec?)`                                        | run before structural type checks     |
| `After(fn, spec?)`                                         | run after structural type checks      |
| `Catch(fallback, spec?)`                                   | replace whatever fails inside with `fallback`, raising nothing |
| `Transform(fn, spec?)`                                     | replace a valid value with `fn(value, state)` |
| `Describe(text, spec?)`                                    | attach a description, read back with `n.Meta()["description"]` |

Custom-check signature:

```go
func(val any, update *shape.Update, state *shape.State) bool
```

A `*regexp.Regexp` anywhere in a spec is a string that must match it.

### Composition

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `One(shapes...)`                 | the first matching shape's output is used                          |
| `Some(shapes...)`                | at least one shape must match                                      |
| `All(shapes...)`                 | every shape must match                                             |
| `Discriminated(tag, branches)`   | a tagged union: `branches` is a `map[string]any` keyed by tag value |

All four are top-level only.

### Objects / arrays

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `Open(spec?)` / `Closed(spec?)`  | allow / forbid unknown object properties                           |
| `Child(child, spec?)`            | default child shape for an `Open` object or for an array           |
| `Rest(child, spec?)`             | tail-shape for arrays past tuple positions                         |
| `Rename(name, spec?)`, `RenameWith(name, opts, spec?)` | rename an object property after validation     |

### Object algebra

Each returns a **new** node, leaving the source unchanged. `names` is a
`string`, `[]string` or `[]any`.

| Builder                          | Effect                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `Pick(names, spec?)`             | keep only the named properties (an unknown name is a fault)        |
| `Omit(names, spec?)`             | drop the named properties                                          |
| `Partial(spec?)`                 | make every declared property optional (shallow)                    |
| `Extend(extra, spec?)`           | add the properties of `extra`; the base's openness and checks stay |

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

### Construction faults

A builder called wrongly — `Discriminated` without a branch, `Pick` of an
unknown property — returns a node that fails at validation with the message
TypeScript would have thrown, since a `*Node` cannot carry an error. In the
string DSL, `Expr` returns the error.

## Example: composition and error handling

```go
s := shape.MustShape(map[string]any{
    "name":   shape.Min(1, shape.String),
    "age":    shape.Coerce(shape.Min(0, shape.Max(120, shape.Integer))),
    "email":  shape.Email(),
    "role":   shape.Exact("admin", "user"),
    "tags":   shape.Optional([]any{shape.String}),
    "addr":   shape.Open(map[string]any{
        "city": shape.String,
    }),
    "pet": shape.Discriminated("kind", map[string]any{
        "dog":  map[string]any{"bark": shape.Boolean},
        "fish": map[string]any{"fins": shape.Number},
    }),
})

out, err := s.Validate(input)
if verr, ok := err.(*shape.ValidationError); ok {
    for _, issue := range verr.Issues {
        fmt.Printf("%s [%s]: %s\n", issue.Path, issue.Why, issue.Text)
    }
}
```

## Development

```sh
go build ./... && go vet ./... && go test -cover -count=1 .
```

The package is held at **100% statement coverage**, and Go has no coverage
pragma: anything new is covered by a test or removed. `go test` also runs the
shared corpus in `../test/*.tsv`; `make diff` from the repository root runs the
differential harness against the TypeScript build. `expr.go` and `node.go`
carry original-port formatting that is not gofmt-clean — leave their unrelated
regions as they are; every other file is gofmt-clean.

See [`../AGENTS.md`](../AGENTS.md) for the parity rules and the change
checklist, and [`PLAN.md`](PLAN.md) for the original porting plan.

## Version

```go
const Version = "0.2.0"
```

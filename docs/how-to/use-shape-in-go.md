# How to use Shape in Go

**Goal:** apply everything in these docs from Go, accounting for the language
differences from the canonical TypeScript.

## Install and import

```sh
go get github.com/rjrodger/shape/go
```

```go
import "github.com/rjrodger/shape/go"   // package name is `shape`
```

Requires Go 1.22+.

## Sentinel tokens instead of constructors

Go cannot use predeclared types (`string`, `int`) as runtime map values, so the
package exports sentinel tokens:

| Token             | Matches                                       |
| ----------------- | --------------------------------------------- |
| `shape.Any`       | any value                                     |
| `shape.String`    | strings                                       |
| `shape.Number`    | any numeric kind (`int*`, `uint*`, `float*`)  |
| `shape.Boolean`   | booleans                                      |
| `shape.Object`    | `map[string]any`                              |
| `shape.Array`     | `[]any`                                       |
| `shape.Function`  | any `reflect.Func` value                      |

For a dot-import style without clashing with stdlib names, `G`-prefixed aliases
exist: `GString`, `GNumber`, `GMin`, `GRequired`, …

## Compile and validate

```go
s, err := shape.Shape(spec)              // (*Schema, error)
s := shape.MustShape(spec)               // panics on a bad spec
s := shape.MustShapeWith(spec, opts)

out, err := s.Validate(input)            // produced value + *ValidationError
out, err := s.ValidateCtx(input, ctx)    // with a *shape.Context
ok := s.Match(input)                     // bool, no errors built
ok := s.Valid(input)                     // alias of Match
issues := s.Error(input)                 // []FieldError, nil when valid
```

## Values are JSON-shaped

Validate `map[string]any`, `[]any`, `string`, `bool` and numeric values —
typically the result of `json.Unmarshal`. Numbers compare as `float64`. Typed
slices are accepted and coerced to `[]any`.

## Numbers

`shape.Number` accepts every numeric kind. There is no single "number" type in
Go, so a JSON number arrives as `float64`; native ints/uints/floats are also
accepted.

## `undefined` vs `null`

Go has no `undefined`. A **missing** map key is treated as absent (may be
defaulted or required); an explicit `nil` value is treated as a present `null`
(a type error against a typed shape), mirroring the TypeScript distinction.
`Validate(nil)` at the top level means "no value supplied" and fills defaults.

<a name="argu"></a>
## Positional argument validation

`MakeArgu` builds a validator for a function's positional arguments:

```go
argu := shape.MakeArgu("connect")
args, err := argu.Validate(
    []any{"localhost", 8080.0},
    "host, port",
    map[string]any{"a": shape.String, "b": shape.Number},
)
// args == map[string]any{"a": "localhost", "b": 8080}
```

Because Go maps are unordered, argument specs are ordered **alphabetically** by
key — use `a`, `b`, `c`, … to fix positions. `argu.Partial(...)` returns a
reusable closure.

## Differences to keep in mind

The full list is in [TypeScript ↔ Go parity](../explanation/ts-go-parity.md).
The headline items: alphabetical key ordering (Go maps are unordered), the RE2
regexp engine, and a couple of intentionally-divergent builders.

## See also

- [Go API reference](../reference/go-api.md)
- [Builder reference](../reference/builders.md)

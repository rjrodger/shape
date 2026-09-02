# How to use Shape in Go

**Goal:** apply everything in these docs from Go, accounting for the language
differences from the canonical TypeScript.

## Install and import

```sh
go get github.com/rjrodger/shape/go
```

```go
import "github.com/rjrodger/shape/go" // package name is `shape`
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
| `shape.Object`    | `map[string]any` (or a struct, see below)     |
| `shape.Array`     | `[]any`                                       |
| `shape.Function`  | any `reflect.Func` value                      |
| `shape.Integer`   | a number with no fractional part              |
| `shape.Date`      | `time.Time` values                            |

For a dot-import style without clashing with stdlib names, `G`-prefixed aliases
exist: `GString`, `GNumber`, `GMin`, `GRequired`, …

## Compile and validate

```go
s, err := shape.Shape(spec) // (*Schema, error)
s := shape.MustShape(spec)  // panics on a bad spec
s := shape.MustShapeWith(spec, opts)

out, err := s.Validate(input)         // produced value + *ValidationError
out, err := s.ValidateCtx(input, ctx) // with a *shape.Context
ok := s.Match(input)                  // bool, no errors built
ok := s.Valid(input)                  // alias of Match
issues := s.Error(input)              // []FieldError, nil when valid
std := s.Standard()                   // Standard Schema V1-style interface
```

## Values are JSON-shaped

Validate `map[string]any`, `[]any`, `string`, `bool` and numeric values —
typically the result of `json.Unmarshal`. Numbers compare as `float64`. Typed
slices are accepted and coerced to `[]any`.

## Structs

A struct (or pointer to one) is accepted wherever an object is, read by its
`json` tags as `encoding/json` would encode it: `json:"-"` hides a field,
`omitempty` makes a zero value absent, embedded structs are promoted. The
produced value is still a map; `ValidateInto` decodes it back into a struct.

```go
type User struct {
	Name string `json:"name"`
	Age  int    `json:"age,omitempty"`
}
s := shape.MustShape(map[string]any{"name": shape.String, "age": 42})

var u User
if err := s.ValidateInto(User{Name: "Ann"}, &u); err != nil { ... }
// u == User{Name: "Ann", Age: 42}
```

A struct can also *be* the spec: each field's value is its default and a
`shape` tag holds a key expression, so `Port int` tagged `shape:"Min(1).Max(65535)"`
means what the map key `"Port: Min(1).Max(65535)"` means. See
[Structs](../reference/go-api.md#structs) in the API reference.

## Numbers

`shape.Number` accepts every numeric kind. There is no single "number" type in
Go, so a JSON number arrives as `float64`; native ints/uints/floats are also
accepted. Type checks, bounds (`Min`, `Max`, …) and `Exact` compare numbers
by value whatever their kind, so `Exact(1)` matches the `float64` 1.0 that
`json.Unmarshal` produces. Anything else `Exact` compares with
`reflect.DeepEqual`, so a string, slice or map literal must have the Go type
the input will have.

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
The headline items are inherent to Go: alphabetical key ordering (Go maps are
unordered) and the RE2 regexp engine.

## See also

- [Go API reference](../reference/go-api.md)
- [Builder reference](../reference/builders.md)

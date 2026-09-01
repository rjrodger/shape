# Go API reference

Module `github.com/rjrodger/shape/go`, package `shape`. Requires Go 1.22+.

## Compilation

```go
func Shape(spec any) (*Schema, error)
func ShapeWith(spec any, opts ShapeOptions) (*Schema, error)
func MustShape(spec any) *Schema
func MustShapeWith(spec any, opts ShapeOptions) *Schema
func IsShape(v any) bool
```

## `*Schema` methods

```go
func (s *Schema) Validate(input any) (any, error)          // *ValidationError
func (s *Schema) ValidateCtx(input any, ctx *Context) (any, error)
func (s *Schema) Match(input any) bool
func (s *Schema) Valid(input any) bool                      // alias of Match
func (s *Schema) Error(input any) []FieldError              // nil when valid
func (s *Schema) Spec() any                                 // JSON-friendly
func (s *Schema) Node() *node                               // introspection
func (s *Schema) String() string                            // debug render
func (s *Schema) JSONSchema() map[string]any                // JSON Schema, draft 2020-12
```

`(*Node).JSONSchema()` renders a built node the same way.

## Tokens

Sentinel `TypeToken` values used in a spec to require a type:

```go
var Any, String, Number, Boolean, Object, Array, Function, Integer, Date TypeToken
func (t TypeToken) Kind() Kind
```

`Any` is the one token that does not require a value, so `{ "a": Any }` accepts
an object without `a`. To narrow it, use `Type(Any, spec)`. `Integer` is a
number with no fractional part; `Date` is a `time.Time`, and a `time.Time` in a
spec is an optional date with that default. `Integer` and `Date` are builder
functions in TypeScript, so the chain shortcuts `.Integer()` and `.Date()` are
how a node is narrowed to them here.

`Kind` is the normalized kind identifier (`KindString`, `KindNumber`,
`KindBoolean`, `KindObject`, `KindArray`, `KindAny`, `KindNull`, `KindNaN`,
`KindFunction`, `KindNever`, `KindCheck`, `KindRegexp`, `KindInteger`,
`KindDate`, `KindList`).

## Builders

Every builder is a top-level function returning `*Node`; most also have a
chainable `*Node` method. See the [builder reference](builders.md). Options
carriers:

```go
type ReferOptions  struct { Fill bool }
type RenameOptions struct { Keep bool; Claim []string }

func Refer(name string, spec ...any) *Node
func ReferWith(name string, opts ReferOptions, spec ...any) *Node
func Rename(name string, spec ...any) *Node
func RenameWith(name string, opts RenameOptions, spec ...any) *Node
```

Builders that take more than a shape:

```go
func Discriminated(tag string, branches map[string]any) *Node   // top-level only
func Catch(fallback any, spec ...any) *Node
func Transform(fn func(val any, state *State) any, spec ...any) *Node
func Describe(description string, spec ...any) *Node            // read back with (*Node).Meta()
func Pick(names any, spec ...any) *Node                          // names: string, []string or []any
func Omit(names any, spec ...any) *Node
func Partial(spec ...any) *Node
func Extend(extra any, spec ...any) *Node
```

A builder called wrongly — `Discriminated` without a branch, `Pick` of an
unknown property — cannot return an error, so the fault surfaces at validation
as a `never` node carrying the message, as for any bad spec. In the string DSL
`Expr` returns it as an error.

`G`-prefixed aliases exist for every builder and token (`GString`, `GMin`,
`GRequired`, …) for use with a dot-import.

### Chainable methods

Every builder that takes only a shape is also a `*Node` method, so specs read as
a chain: `Optional().Number().Min(2)`.

```go
Above    After    Any      Before   Below    Catch    Check    Child
Closed   Coerce   DateTime Default  Define   Describe Email    Empty
Exact    Extend   Fault    Func     Ignore   Ip       Ipv4     Ipv6
Len      Max      Min      Never    Nullable Omit     Open     Optional
Partial  Pick     Refer    Rename   Required Rest     Skip     Transform
Type     Url      Uuid
```

plus the type shortcuts `.Number()`, `.Boolean()`, `.Object()`, `.Array()`,
`.Function()`, `.Integer()` and `.Date()`. There is no `.String()`: a method of
that name on an exported type reads as `fmt.Stringer` and `go vet` rejects the
signature — use `.Type(String)`, which is what the shortcuts call anyway.

The object algebra methods (`.Pick`, `.Omit`, `.Partial`, `.Extend`) return a
new node and leave the receiver as it was; every other chain method narrows the
receiver in place and returns it.

## Absent versus null

```go
var Null any
```

Go cannot tell a missing argument from a nil one, so `Validate(nil)` means "no
value supplied" (JS `undefined`) and defaults fill, mirroring TS `Shape(x)()`.
Pass `Null` to mean a value that is present and null (JS `null`), which is a
type error against a typed shape:

```go
s := shape.MustShape(1.0)
s.Validate(nil)         // 1.0, nil       — absent, so the default fills
s.Validate(shape.Null)  // "the value is not of type number"
```

Inside a map or slice a plain `nil` already reads as present-null, because the
key or index exists; `Null` is accepted there too and means the same thing.

## Options

```go
type ShapeOptions struct {
    KeyExpr KeyExprOptions   // "x: Min(1)" key parsing
    Meta    MetaOptions      // "x$$" sidecar metadata
    ValExpr ValExprOptions   // "$$" value expressions
}
type KeyExprOptions struct { Disable bool }              // default: enabled
type MetaOptions    struct { Active bool; Suffix string } // default: off, "$$"
type ValExprOptions struct { Active bool; KeyMark string }// default: off, "$$"
```

## Errors

```go
type FieldError struct {
    Path, Key string
    Type      Kind
    Value     any
    Why       string
    Mark      int
    Text      string
    Check     string
    Args      map[string]any
}
func (e FieldError) Error() string

type ValidationError struct { Issues []FieldError }
func (e *ValidationError) Error() string
```

## Custom validators

```go
type State  struct { Path []string; Key string; Value any; Node *node; Parent any; Match bool; Ctx *Context }
type Update struct { Done bool; Why string; Mark int; Err any; Val any; HasVal bool; Node *node }

func Before(fn func(val any, u *Update, s *State) bool, spec ...any) *Node
func After (fn func(val any, u *Update, s *State) bool, spec ...any) *Node
func Check (check any, spec ...any) *Node   // func(...) bool or *regexp.Regexp
```

## String DSL

```go
func Expr(src string) (*Node, error)
func MustExpr(src string) *Node
func Build(spec any) (*Schema, error)
```

<a name="argu"></a>
## Positional arguments (`Argu`)

```go
func MakeArgu(name string) Argu
func (a Argu) Validate(args []any, whence string, spec map[string]any) (map[string]any, error)
func (a Argu) Partial(whence string, spec map[string]any) func([]any) (map[string]any, error)
```

Argument specs are ordered **alphabetically** by key (Go maps are unordered), so
name keys `a`, `b`, `c`, … to fix argument positions.

## Version

```go
const Version = "0.2.0"
```

See [Use Shape in Go](../how-to/use-shape-in-go.md) for idioms and the
[parity notes](../explanation/ts-go-parity.md) for behavioural differences.

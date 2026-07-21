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
```

## Tokens

Sentinel `TypeToken` values used in a spec to require a type:

```go
var Any, String, Number, Boolean, Object, Array, Function TypeToken
func (t TypeToken) Kind() Kind
```

`Kind` is the normalized kind identifier (`KindString`, `KindNumber`,
`KindBoolean`, `KindObject`, `KindArray`, `KindAny`, `KindNull`, `KindNaN`,
`KindFunction`, `KindNever`, `KindCheck`, `KindList`).

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

`G`-prefixed aliases exist for every builder and token (`GString`, `GMin`,
`GRequired`, …) for use with a dot-import.

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
const Version = "0.1.2"
```

See [Use Shape in Go](../how-to/use-shape-in-go.md) for idioms and the
[parity notes](../explanation/ts-go-parity.md) for behavioural differences.

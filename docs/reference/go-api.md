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
func (s *Schema) Validate(input any) (any, error) // *ValidationError
func (s *Schema) ValidateCtx(input any, ctx *Context) (any, error)
func (s *Schema) Match(input any) bool
func (s *Schema) Valid(input any) bool                  // alias of Match
func (s *Schema) Error(input any) []FieldError          // nil when valid
func (s *Schema) Spec() any                             // JSON-friendly
func (s *Schema) Node() *node                           // introspection
func (s *Schema) String() string                        // debug render
func (s *Schema) JSON() (any, error)                    // declarative JSON, read back by Build
func (s *Schema) JSONSchema() map[string]any            // JSON Schema, draft 2020-12
func (s *Schema) ValidateInto(input any, out any) error // fill a struct with the result
func (s *Schema) Standard() StandardSchema              // Standard Schema V1-style interface
```

`(*Node).JSONSchema()` renders a built node the same way; `(*Node).Kind()` is
its kind, `(*Node).Meta()` its metadata (sidecar keys and `Describe`'s
description) and `(*Node).Inner()` the underlying private node, as
`(*Schema).Node()` is for the root.

```go
func FromJSONSchema(schema any) (any, error) // a spec built from a JSON Schema (as decoded by encoding/json)
func MustFromJSONSchema(schema any) any
```

See [Export and import a JSON Schema](../how-to/export-json-schema.md).

## Structs

The validator works on JSON-shaped values (`map[string]any`, `[]any`,
strings, numbers, booleans); structs are read into that model on the way in
and filled from the produced value on the way out. A struct and the map it
reads as validate identically, so nothing here affects parity with
TypeScript.

**As a value.** Any struct, or pointer to one, is accepted where an object
is. A field is named by its `json` tag or its own name; `json:"-"` hides it;
`json:",omitempty"` makes a zero value *absent* (so a default fills it, or a
required check fires) instead of present; an embedded struct's fields are
promoted, as `encoding/json` promotes them; unexported fields are not read.
Nested structs, pointers (a nil pointer is a present `null`), slices, arrays
and string-keyed maps of any value type are converted recursively;
`time.Time` is kept as a date. `ValidateInto` validates and then decodes the
produced value into `out` (a pointer to a struct, or anything `encoding/json`
can decode into) in one step.

```go
type User struct {
	Name string `json:"name"`
	Age  int    `json:"age,omitempty"`
}
s := shape.MustShape(map[string]any{"name": shape.String, "age": 42})

out, err := s.Validate(User{Name: "Ann"}) // map[string]any{"name":"Ann","age":42}
var u User
err = s.ValidateInto(map[string]any{"name": "Ann"}, &u) // u.Age == 42
```

**As a spec.** A struct value is also a spec by example, as a map is: each
field's value is its default, and a `shape` tag holds a
[key expression](../how-to/use-the-string-dsl.md) applied to it, exactly as
`"Port: Min(1).Max(65535)"` would in a map key. Field names follow the same
`json` tag rules (`omitempty` is ignored, since a spec field is a default
whether or not it is zero).

```go
type Config struct {
	Host  string `shape:"Min(1)"`            // non-empty string, default ""
	Port  int    `shape:"Min(1).Max(65535)"` // default 0 — so set one below
	Debug bool   `shape:"Boolean"`           // required
	Name  string `json:"name" shape:"String"`
}
s := shape.MustShape(Config{Host: "localhost", Port: 8080})
// reads as {"Host: Min(1)": "localhost", "Port: Min(1).Max(65535)": 8080,
//           "Debug: Boolean": false, "name: String": ""}
```

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
chainable `*Node` method. See the [builder reference](builders.md) for what
each does; the Go signatures are:

```go
func Required(spec ...any) *Node
func Optional(spec ...any) *Node
func Default(dval any, spec ...any) *Node
func Skip(spec ...any) *Node
func Ignore(spec ...any) *Node
func Empty(spec ...any) *Node
func Nullable(spec ...any) *Node
func Fault(msg string, spec ...any) *Node
func Type(kind any, spec ...any) *Node // Kind, TypeToken, kind name or *Node
func Exact(vals ...any) *Node          // numbers by value (Exact(1) matches 1.0), the rest by reflect.DeepEqual
func Never(spec ...any) *Node
func Func(spec ...any) *Node
func Coerce(spec ...any) *Node
func Email(spec ...any) *Node
func Url(spec ...any) *Node
func Uuid(spec ...any) *Node
func DateTime(spec ...any) *Node
func Ip(spec ...any) *Node
func Ipv4(spec ...any) *Node
func Ipv6(spec ...any) *Node
func Min(min any, spec ...any) *Node
func Max(max any, spec ...any) *Node
func Above(above any, spec ...any) *Node
func Below(below any, spec ...any) *Node
func Len(length int, spec ...any) *Node
func One(shapes ...any) *Node
func Some(shapes ...any) *Node
func All(shapes ...any) *Node
func Open(spec ...any) *Node
func Closed(spec ...any) *Node
func Child(child any, spec ...any) *Node
func Rest(child any, spec ...any) *Node
func Define(name string, spec ...any) *Node
func Key(args ...any) *Node // Key(), Key(depth) or Key(depth, sep)
```

Options carriers:

```go
type ReferOptions struct {
	Fill   bool // substitute even when the value is absent
	Strict bool // a name with no Define is an error, not a no-op
}
type RenameOptions struct {
	Keep  bool     // keep the original key too
	Claim []string // alternative source keys to read from
}

func Refer(name string, spec ...any) *Node
func ReferWith(name string, opts ReferOptions, spec ...any) *Node
func Rename(name string, spec ...any) *Node
func RenameWith(name string, opts RenameOptions, spec ...any) *Node
```

Builders that take more than a shape:

```go
func Discriminated(tag string, branches map[string]any) *Node // top-level only
func Catch(fallback any, spec ...any) *Node
func Transform(fn func(val any, state *State) any, spec ...any) *Node
func Describe(description string, spec ...any) *Node // read back with (*Node).Meta()
func Pick(names any, spec ...any) *Node              // names: string, []string or []any
func Omit(names any, spec ...any) *Node
func Partial(spec ...any) *Node
func Extend(extra any, spec ...any) *Node
```

A builder called wrongly—`Discriminated` without a branch, `Pick` of an
unknown property—cannot return an error, so the fault surfaces at validation
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
signature—use `.Type(String)`, which is what the shortcuts call anyway.

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
s.Validate(nil)        // 1, nil — absent, so the default fills
s.Validate(shape.Null) // nil, "Validation failed for value \"null\" because the value is not of type number."
```

Inside a map or slice a plain `nil` already reads as present-null, because the
key or index exists; `Null` is accepted there too and means the same thing.

## Options

```go
type ShapeOptions struct {
	KeyExpr KeyExprOptions // "x: Min(1)" key parsing
	Meta    MetaOptions    // "x$$" sidecar metadata
	ValExpr ValExprOptions // "$$" value expressions
}
type KeyExprOptions struct{ Disable bool } // default: enabled
type MetaOptions struct {                  // default: off, "$$"
	Active bool
	Suffix string
}
type ValExprOptions struct { // default: off, "$$"
	Active  bool
	KeyMark string
}
```

## Errors

```go
type FieldError struct {
	Path    string // dot-notation path, e.g. "users.0.email"
	PathArr []any  // the path as an array: indices as ints, keys as strings
	Key     string
	Type    Kind
	Value   any
	Why     string
	Mark    int
	Text    string
	Check   string
	Args    map[string]any
}

func (e FieldError) Error() string

type ValidationError struct{ Issues []FieldError }

func (e *ValidationError) Error() string // the issues' Text, joined by newline
```

`Why` codes are exported as constants: `WhyType`, `WhyRequired`, `WhyClosed`,
`WhyCheck`, `WhyNever`, `WhyRegexp`, `WhyEmpty` (the lower-case codes, equal
to the TypeScript `why` strings) and one per builder that fails on its own
(`WhyMin`, `WhyExact`, `WhyEmail`, `WhyDiscriminated`, …). The builder codes
are a deliberate divergence: where Go reports `WhyMin` with mark 4011,
TypeScript reports `why: "check"` with the builder name in `check` and mark
4000, so code that branches on a why code must not expect the same string in
both (see the [parity page](../explanation/ts-go-parity.md#error-metadata)).

## Standard Schema

A Go rendering of the TypeScript `~standard` object: a version, a vendor and a
`Validate` that never panics and returns either the produced value or a list of
issues, never both.

```go
type StandardSchema struct {
	Version  int                            // always 1
	Vendor   string                         // always "shape"
	Validate func(input any) StandardResult // non-throwing validation
}
type StandardResult struct {
	Value  any             // produced value when Issues is empty
	Issues []StandardIssue // empty on success
}
type StandardIssue struct {
	Message string // FieldError.Text
	Path    []any  // FieldError.PathArr
}

func (s *Schema) Standard() StandardSchema
```

## Custom validators

```go
type State struct {
	Path    []string // path stack from root; current key at end
	PathArr []any    // path as array: array indices as ints, object keys as strings
	Key     string   // immediate key/index name
	Value   any      // current value being validated
	Node    *node    // current node
	Parent  any      // parent map/slice
	Match   bool     // true when invoked via Match (no mutation, no error report)
	Ctx     *Context // user/custom context
}
type Update struct {
	Done    bool   // stop running further checks
	Why     string // why code on failure
	Mark    int    // numeric mark on failure
	Err     any    // string, FieldError, or []FieldError
	Val     any    // replacement value
	HasVal  bool   // true if Val should override
	Node    *node  // override node (used by Refer)
	Replace bool   // compat marker, not currently consulted
}
type Context struct {
	Err    []FieldError
	Custom map[string]any   // cross-property state for custom validators
	Refs   map[string]*node // used by Define/Refer
	Match  bool
}

func Before(fn func(val any, u *Update, s *State) bool, spec ...any) *Node
func After(fn func(val any, u *Update, s *State) bool, spec ...any) *Node
func Check(check any, spec ...any) *Node // func(...) bool or *regexp.Regexp
```

`ValidateCtx` runs a validation with a `*Context` the caller supplies, so custom
validators can share state through `Custom`.

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
const Version = "0.5.0"
```

See [Use Shape in Go](../how-to/use-shape-in-go.md) for idioms and the
[parity notes](../explanation/ts-go-parity.md) for behavioural differences.

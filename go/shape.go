package shape

const Version = "0.1.1"

// Schema is a compiled shape specification.
type Schema struct {
	root *node
}

// Shape compiles a schema-by-example specification with default options.
// Note: keyexpr is enabled by default — keys like "x: Min(1)" are parsed.
func Shape(spec any) (*Schema, error) {
	return ShapeWith(spec, ShapeOptions{})
}

// ShapeWith compiles a schema-by-example specification with the given options.
func ShapeWith(spec any, opts ShapeOptions) (*Schema, error) {
	n, err := normalizeWith(spec, opts)
	if err != nil {
		return nil, err
	}
	return &Schema{root: n}, nil
}

// MustShape compiles a schema and panics if invalid.
func MustShape(spec any) *Schema {
	s, err := Shape(spec)
	if err != nil {
		panic(err)
	}
	return s
}

// MustShapeWith is ShapeWith that panics on error.
func MustShapeWith(spec any, opts ShapeOptions) *Schema {
	s, err := ShapeWith(spec, opts)
	if err != nil {
		panic(err)
	}
	return s
}

// Validate validates and normalizes input. Returns the produced (defaults
// injected) value plus a *ValidationError if any errors occurred.
func (s *Schema) Validate(input any) (any, error) {
	return s.ValidateCtx(input, nil)
}

// ValidateCtx is Validate with an explicit Context (custom validators may use it).
func (s *Schema) ValidateCtx(input any, ctx *Context) (any, error) {
	if s == nil || s.root == nil {
		return nil, nil
	}
	c := newContext(ctx)
	c.Match = false
	collectDefines(s.root, c)
	verr := &ValidationError{}
	out := validateNode(s.root, input, []string{}, "", nil, c, false, verr)
	if ctx != nil {
		ctx.Err = append(ctx.Err, verr.Issues...)
	}
	if verr.hasAny() {
		return out, verr
	}
	return out, nil
}

// Match reports whether input satisfies the schema, without mutating input or
// returning errors. Mirrors TS .match().
func (s *Schema) Match(input any) bool {
	if s == nil || s.root == nil {
		return true
	}
	c := newContext(nil)
	c.Match = true
	collectDefines(s.root, c)
	verr := &ValidationError{}
	validateNode(s.root, input, []string{}, "", nil, c, true, verr)
	return !verr.hasAny()
}

// Valid is an alias of Match retained for API parity. Mirrors TS .valid().
func (s *Schema) Valid(input any) bool {
	return s.Match(input)
}

// Error returns the FieldErrors produced by validating input. Returns nil if
// the input is valid.
func (s *Schema) Error(input any) []FieldError {
	if s == nil || s.root == nil {
		return nil
	}
	c := newContext(nil)
	collectDefines(s.root, c)
	verr := &ValidationError{}
	validateNode(s.root, input, []string{}, "", nil, c, false, verr)
	return verr.Issues
}

// Spec returns a structural representation of the compiled schema.
func (s *Schema) Spec() any {
	if s == nil || s.root == nil {
		return nil
	}
	return nodeSpec(s.root)
}

// Node returns the underlying root node for advanced introspection.
func (s *Schema) Node() *node {
	if s == nil {
		return nil
	}
	return s.root
}

// String renders a debug representation of the schema.
func (s *Schema) String() string {
	if s == nil || s.root == nil {
		return ""
	}
	return stringifyNode(s.root, false)
}

// IsShape reports whether v is a *Schema produced by this package.
func IsShape(v any) bool {
	_, ok := v.(*Schema)
	return ok
}

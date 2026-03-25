package shape

// Schema is a compiled shape specification.
type Schema struct {
	root *node
}

// Shape compiles a schema-by-example specification.
func Shape(spec any) (*Schema, error) {
	n, err := normalize(spec)
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

// Validate validates and normalizes input according to the compiled schema.
// It returns a new value with defaults injected.
func (s *Schema) Validate(input any) (any, error) {
	if s == nil || s.root == nil {
		return nil, nil
	}
	verr := &ValidationError{}
	out := validateNode(s.root, input, "$", verr)
	if verr.hasAny() {
		return out, verr
	}
	return out, nil
}

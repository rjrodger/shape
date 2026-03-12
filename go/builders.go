package shape

import "fmt"

// Required marks a schema as required — the value must be present.
func Required(spec any) *Node {
	n := nodize(spec)
	n.required = true
	n.skip = false
	return n
}

// Optional marks a schema as optional — missing values get the default.
func Optional(spec any) *Node {
	n := nodize(spec)
	n.required = false
	return n
}

// Default sets a default value for a schema. The field becomes optional.
func Default(val any, spec any) *Node {
	n := nodize(spec)
	n.val = val
	n.required = false
	n.skip = false
	return n
}

// Skip marks a schema as optional with no default insertion.
// If the value is missing, it won't appear in the result.
func Skip(spec any) *Node {
	n := nodize(spec)
	n.required = false
	n.skip = true
	return n
}

// Min sets a minimum constraint.
// For numbers: value >= min. For strings/arrays: length >= min.
func Min(min float64, spec any) *Node {
	n := nodize(spec)
	n.hasMin = true
	n.min = min
	return n
}

// Max sets a maximum constraint.
// For numbers: value <= max. For strings/arrays: length <= max.
func Max(max float64, spec any) *Node {
	n := nodize(spec)
	n.hasMax = true
	n.max = max
	return n
}

// Above sets a "greater than" constraint (exclusive).
func Above(above float64) *Node {
	n := &Node{kind: Number, val: 0.0, required: true}
	n.hasAbove = true
	n.above = above
	return n
}

// Below sets a "less than" constraint (exclusive).
func Below(below float64) *Node {
	n := &Node{kind: Number, val: 0.0, required: true}
	n.hasBelow = true
	n.below = below
	return n
}

// Len sets an exact length constraint for strings or arrays.
func Len(length int, spec any) *Node {
	n := nodize(spec)
	n.hasLen = true
	n.length = length
	return n
}

// One requires exactly one of the given schemas to match.
func One(specs ...any) *Node {
	nodes := make([]*Node, len(specs))
	for i, s := range specs {
		nodes[i] = nodize(s)
	}
	return &Node{
		kind:  Any,
		oneOf: nodes,
	}
}

// Some requires at least one of the given schemas to match.
func Some(specs ...any) *Node {
	nodes := make([]*Node, len(specs))
	for i, s := range specs {
		nodes[i] = nodize(s)
	}
	return &Node{
		kind:   Any,
		someOf: nodes,
	}
}

// All requires all of the given schemas to match.
func All(specs ...any) *Node {
	nodes := make([]*Node, len(specs))
	for i, s := range specs {
		nodes[i] = nodize(s)
	}
	return &Node{
		kind:  Any,
		allOf: nodes,
	}
}

// Exact requires the value to be one of the given literal values.
func Exact(vals ...any) *Node {
	// Infer kind from first value
	k := Any
	if len(vals) > 0 {
		vt := classifyVal(vals[0])
		switch vt {
		case vtString:
			k = String
		case vtInteger, vtFloat:
			k = Number
		case vtBool:
			k = Bool
		}
	}
	return &Node{
		kind:     k,
		required: true,
		exact:    vals,
	}
}

// Check adds a custom validation function.
// The function receives the value and should return nil if valid, or an error.
func Check(fn func(any) error) *Node {
	return &Node{
		kind:  Any,
		after: []func(any) error{fn},
	}
}

// Before adds a custom validator that runs before type checking.
func Before(fn func(any) error, spec any) *Node {
	n := nodize(spec)
	n.before = append(n.before, fn)
	return n
}

// After adds a custom validator that runs after type checking.
func After(fn func(any) error, spec any) *Node {
	n := nodize(spec)
	n.after = append(n.after, fn)
	return n
}

// Open allows undeclared properties in an object schema.
func Open(spec any) *Node {
	n := nodize(spec)
	n.open = true
	n.closed = false
	return n
}

// Closed disallows undeclared properties in an object schema.
func Closed(spec any) *Node {
	n := nodize(spec)
	n.closed = true
	n.open = false
	return n
}

// Child sets the schema for all children of an object or array.
func Child(child any, spec any) *Node {
	n := nodize(spec)
	childNode := nodize(child)
	if n.kind == Array {
		n.elemNode = childNode
	} else if n.kind == Object {
		// For objects, set a wildcard child validator
		n.elemNode = childNode
	}
	return n
}

// Empty allows empty strings (by default, required strings reject empty).
func Empty(spec any) *Node {
	n := nodize(spec)
	n.empty = true
	return n
}

// Fault wraps a schema with a custom error message.
func Fault(msg string, spec any) *Node {
	n := nodize(spec)
	n.after = append(n.after, func(v any) error {
		return nil // Fault doesn't add a validator; it's used to customize error messages
	})
	// Store message for error customization
	_ = msg // TODO: implement custom error messages in validation engine
	return n
}

// AnyNode creates a node that accepts any value. Exported builder form.
func AnyNode() *Node {
	return &Node{kind: Any}
}

// NeverNode creates a node that rejects any value. Exported builder form.
func NeverNode() *Node {
	return &Node{kind: Never, required: true}
}

// TypeNode creates a required node for a specific Kind.
func TypeNode(k Kind) *Node {
	return &Node{
		kind:     k,
		val:      zeroVal(k),
		required: true,
	}
}

// Validate is a convenience function that creates a schema and validates in one step.
func Validate(spec any, data any) (any, error) {
	return New(spec).Validate(data)
}

// MustValidate is a convenience function that creates a schema, validates, and panics on error.
func MustValidate(spec any, data any) any {
	return New(spec).Must(data)
}

// IsShapeError checks if an error is a *ShapeError.
func IsShapeError(err error) bool {
	_, ok := err.(*ShapeError)
	return ok
}

// Errors extracts []FieldError from an error, or nil if not a ShapeError.
func Errors(err error) []FieldError {
	if se, ok := err.(*ShapeError); ok {
		return se.Errors
	}
	return nil
}

// String representation for debugging nodes.
func (n *Node) String() string {
	if n == nil {
		return "<nil>"
	}
	req := ""
	if n.required {
		req = ",required"
	}
	return fmt.Sprintf("Node{kind:%s,val:%v%s}", n.kind, n.val, req)
}

// Package shape provides schema validation where the schema looks like the data it validates.
//
// Usage:
//
//	schema := shape.New(shape.M{
//	    "name":   shape.String,       // required string
//	    "age":    shape.Number,       // required number (any numeric type)
//	    "active": shape.Bool,         // required bool
//	    "tag":    "default-tag",      // optional string, defaults to "default-tag"
//	    "nested": shape.M{"x": 1.0}, // nested object with defaults
//	})
//
//	result, err := schema.Validate(shape.M{"name": "Alice", "age": 30, "active": true})
package shape

import (
	"fmt"
	"math"
	"reflect"
	"sort"
)

// M is shorthand for map[string]any — used for object schemas and data.
type M = map[string]any

// L is shorthand for []any — used for array schemas and data.
type L = []any

// Kind represents a type sentinel — the Go equivalent of JS type constructors.
type Kind int

const (
	String  Kind = iota + 1 // any string
	Number                  // any numeric type (int, float64, uint, etc.)
	Integer                 // integer types only (int, int8, int16, int32, int64, uint, etc.)
	Float                   // float types only (float32, float64)
	Bool                    // bool
	Object                  // map[string]any
	Array                   // []any
	Any                     // accept any value
	Never                   // reject any value
)

func (k Kind) String() string {
	switch k {
	case String:
		return "string"
	case Number:
		return "number"
	case Integer:
		return "integer"
	case Float:
		return "float"
	case Bool:
		return "bool"
	case Object:
		return "object"
	case Array:
		return "array"
	case Any:
		return "any"
	case Never:
		return "never"
	default:
		return "unknown"
	}
}

// valType represents the internal type classification of a value.
type valType int

const (
	vtUnknown valType = iota
	vtString
	vtNumber
	vtInteger
	vtFloat
	vtBool
	vtObject
	vtArray
	vtNil
)

func (vt valType) String() string {
	switch vt {
	case vtString:
		return "string"
	case vtNumber:
		return "number"
	case vtInteger:
		return "integer"
	case vtFloat:
		return "float"
	case vtBool:
		return "bool"
	case vtObject:
		return "object"
	case vtArray:
		return "array"
	case vtNil:
		return "nil"
	default:
		return "unknown"
	}
}

// Node is the internal representation of a schema element.
type Node struct {
	kind     Kind      // the type this node expects
	val      any       // the defining value / default
	required bool      // must be present
	skip     bool      // optional, don't insert default
	open     bool      // allow extra keys (objects)
	closed   bool      // disallow extra keys / fix array length
	children map[string]*Node // child nodes for objects
	childOrder []string       // ordered keys
	elemNode *Node     // element schema for arrays
	rest     *Node     // rest element schema for arrays

	// Constraints
	hasMin bool
	min    float64
	hasMax bool
	max    float64
	hasAbove bool
	above    float64
	hasBelow bool
	below    float64
	hasLen bool
	length int
	exact  []any
	empty  bool // allow empty strings

	// Validators
	before []func(any) error
	after  []func(any) error

	// Logical combinators
	oneOf  []*Node
	someOf []*Node
	allOf  []*Node
}

// Shape is a compiled schema that can validate data.
type Shape struct {
	root *Node
}

// New creates a new Shape from a schema specification.
func New(spec any) *Shape {
	return &Shape{root: nodize(spec)}
}

// Validate checks the given data against the schema.
// Returns the validated (and default-filled) data, or a *ShapeError.
func (s *Shape) Validate(data any) (any, error) {
	var errs []FieldError
	result := validate(s.root, data, "", &errs)
	if len(errs) > 0 {
		return nil, &ShapeError{Errors: errs}
	}
	return result, nil
}

// Must validates and panics on error. Useful for tests and init.
func (s *Shape) Must(data any) any {
	result, err := s.Validate(data)
	if err != nil {
		panic(err)
	}
	return result
}

// nodize normalizes any schema value into a Node tree.
func nodize(spec any) *Node {
	if spec == nil {
		return &Node{kind: Any, val: nil, required: false, skip: true}
	}

	// Already a node (from a builder)
	if n, ok := spec.(*Node); ok {
		// If the node has no kind set but has a val, infer it
		if n.kind == 0 && n.val != nil {
			inferred := nodize(n.val)
			if n.kind == 0 {
				n.kind = inferred.kind
			}
			if n.children == nil {
				n.children = inferred.children
				n.childOrder = inferred.childOrder
			}
			if n.elemNode == nil {
				n.elemNode = inferred.elemNode
			}
		}
		return n
	}

	// Kind sentinel (e.g., shape.String, shape.Number)
	if k, ok := spec.(Kind); ok {
		return &Node{
			kind:     k,
			val:      zeroVal(k),
			required: true,
		}
	}

	// Literal values — optional, type inferred, value is default
	switch v := spec.(type) {
	case string:
		return &Node{kind: String, val: v, required: false}
	case float64:
		return &Node{kind: Number, val: v, required: false}
	case float32:
		return &Node{kind: Float, val: float64(v), required: false}
	case int:
		return &Node{kind: Number, val: float64(v), required: false}
	case int8:
		return &Node{kind: Number, val: float64(v), required: false}
	case int16:
		return &Node{kind: Number, val: float64(v), required: false}
	case int32:
		return &Node{kind: Number, val: float64(v), required: false}
	case int64:
		return &Node{kind: Number, val: float64(v), required: false}
	case uint:
		return &Node{kind: Number, val: float64(v), required: false}
	case uint8:
		return &Node{kind: Number, val: float64(v), required: false}
	case uint16:
		return &Node{kind: Number, val: float64(v), required: false}
	case uint32:
		return &Node{kind: Number, val: float64(v), required: false}
	case uint64:
		return &Node{kind: Number, val: float64(v), required: false}
	case bool:
		return &Node{kind: Bool, val: v, required: false}

	case map[string]any:
		n := &Node{
			kind:     Object,
			required: false,
			children: make(map[string]*Node, len(v)),
		}
		// Sort keys for deterministic behavior
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		n.childOrder = keys
		for _, k := range keys {
			n.children[k] = nodize(v[k])
		}
		return n

	case []any:
		n := &Node{
			kind:     Array,
			required: false,
		}
		if len(v) > 0 {
			n.elemNode = nodize(v[0])
		}
		return n
	}

	// Fallback: try to handle via reflection for other numeric types
	rv := reflect.ValueOf(spec)
	if rv.CanInt() {
		return &Node{kind: Number, val: float64(rv.Int()), required: false}
	}
	if rv.CanUint() {
		return &Node{kind: Number, val: float64(rv.Uint()), required: false}
	}
	if rv.CanFloat() {
		return &Node{kind: Number, val: rv.Float(), required: false}
	}

	// Unknown type — treat as Any
	return &Node{kind: Any, val: spec, required: false}
}

// zeroVal returns the zero/empty value for a Kind.
func zeroVal(k Kind) any {
	switch k {
	case String:
		return ""
	case Number, Float:
		return 0.0
	case Integer:
		return 0
	case Bool:
		return false
	case Object:
		return M{}
	case Array:
		return L{}
	default:
		return nil
	}
}

// validate recursively validates data against a node tree.
func validate(n *Node, data any, path string, errs *[]FieldError) any {
	// Run before validators
	for _, fn := range n.before {
		if err := fn(data); err != nil {
			*errs = append(*errs, FieldError{
				Path: path, Code: ErrCheck, Message: err.Error(), Value: data,
			})
			return data
		}
	}

	// Handle logical combinators at this level
	if len(n.oneOf) > 0 {
		return validateOne(n, data, path, errs)
	}
	if len(n.someOf) > 0 {
		return validateSome(n, data, path, errs)
	}
	if len(n.allOf) > 0 {
		return validateAll(n, data, path, errs)
	}

	// Handle Never
	if n.kind == Never {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrNever, Message: "value is not allowed", Value: data,
		})
		return data
	}

	// Handle Any — accept anything
	if n.kind == Any {
		result := data
		if result == nil && n.val != nil && !n.skip {
			result = cloneVal(n.val)
		}
		// Run after validators
		for _, fn := range n.after {
			if err := fn(result); err != nil {
				*errs = append(*errs, FieldError{
					Path: path, Code: ErrCheck, Message: err.Error(), Value: result,
				})
			}
		}
		return result
	}

	// Handle missing/nil data
	if data == nil {
		if n.required {
			*errs = append(*errs, FieldError{
				Path:    path,
				Code:    ErrRequired,
				Message: fmt.Sprintf("required value of type %s", n.kind),
				Value:   nil,
			})
			return nil
		}
		if n.skip {
			return nil
		}
		return cloneVal(n.val)
	}

	// Type checking
	vt := classifyVal(data)
	if !typeMatches(n.kind, vt) {
		*errs = append(*errs, FieldError{
			Path:    path,
			Code:    ErrType,
			Message: fmt.Sprintf("expected type %s, got %s", n.kind, vt),
			Value:   data,
		})
		return data
	}

	// Validate by kind
	switch n.kind {
	case String:
		return validateString(n, data.(string), path, errs)
	case Number, Integer, Float:
		return validateNumber(n, data, path, errs)
	case Bool:
		result := data.(bool)
		for _, fn := range n.after {
			if err := fn(result); err != nil {
				*errs = append(*errs, FieldError{
					Path: path, Code: ErrCheck, Message: err.Error(), Value: result,
				})
			}
		}
		return result
	case Object:
		return validateObject(n, data, path, errs)
	case Array:
		return validateArray(n, data, path, errs)
	}

	return data
}

func validateString(n *Node, val string, path string, errs *[]FieldError) any {
	if !n.empty && val == "" && n.required {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrEmpty, Message: "string must not be empty", Value: val,
		})
		return val
	}
	if n.hasLen && len(val) != n.length {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrLen,
			Message: fmt.Sprintf("string length must be %d, got %d", n.length, len(val)),
			Value:   val,
		})
	}
	if n.hasMin && float64(len(val)) < n.min {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrMin,
			Message: fmt.Sprintf("string length must be at least %g, got %d", n.min, len(val)),
			Value:   val,
		})
	}
	if n.hasMax && float64(len(val)) > n.max {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrMax,
			Message: fmt.Sprintf("string length must be at most %g, got %d", n.max, len(val)),
			Value:   val,
		})
	}
	if len(n.exact) > 0 {
		found := false
		for _, e := range n.exact {
			if s, ok := e.(string); ok && s == val {
				found = true
				break
			}
		}
		if !found {
			*errs = append(*errs, FieldError{
				Path: path, Code: ErrExact,
				Message: fmt.Sprintf("value %q does not match any exact value", val),
				Value:   val,
			})
		}
	}
	for _, fn := range n.after {
		if err := fn(val); err != nil {
			*errs = append(*errs, FieldError{
				Path: path, Code: ErrCheck, Message: err.Error(), Value: val,
			})
		}
	}
	return val
}

func validateNumber(n *Node, data any, path string, errs *[]FieldError) any {
	num := toFloat64(data)
	if n.hasMin && num < n.min {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrMin,
			Message: fmt.Sprintf("value must be at least %g, got %g", n.min, num),
			Value:   data,
		})
	}
	if n.hasMax && num > n.max {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrMax,
			Message: fmt.Sprintf("value must be at most %g, got %g", n.max, num),
			Value:   data,
		})
	}
	if n.hasAbove && num <= n.above {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrAbove,
			Message: fmt.Sprintf("value must be above %g, got %g", n.above, num),
			Value:   data,
		})
	}
	if n.hasBelow && num >= n.below {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrBelow,
			Message: fmt.Sprintf("value must be below %g, got %g", n.below, num),
			Value:   data,
		})
	}
	if len(n.exact) > 0 {
		found := false
		for _, e := range n.exact {
			if toFloat64(e) == num {
				found = true
				break
			}
		}
		if !found {
			*errs = append(*errs, FieldError{
				Path: path, Code: ErrExact,
				Message: fmt.Sprintf("value %g does not match any exact value", num),
				Value:   data,
			})
		}
	}
	for _, fn := range n.after {
		if err := fn(data); err != nil {
			*errs = append(*errs, FieldError{
				Path: path, Code: ErrCheck, Message: err.Error(), Value: data,
			})
		}
	}
	return data
}

func validateObject(n *Node, data any, path string, errs *[]FieldError) any {
	obj, ok := data.(map[string]any)
	if !ok {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrType, Message: "expected object", Value: data,
		})
		return data
	}

	result := make(map[string]any, len(obj))

	// Copy all input values first
	for k, v := range obj {
		result[k] = v
	}

	// Validate declared children
	for _, key := range n.childOrder {
		childNode := n.children[key]
		childPath := joinPath(path, key)
		val, exists := obj[key]

		if !exists {
			if childNode.required {
				*errs = append(*errs, FieldError{
					Path:    childPath,
					Code:    ErrRequired,
					Message: fmt.Sprintf("required property %q", key),
					Value:   nil,
				})
				continue
			}
			if childNode.skip {
				continue
			}
			// Insert default
			result[key] = cloneVal(childNode.val)
			continue
		}

		result[key] = validate(childNode, val, childPath, errs)
	}

	// Check for undeclared keys
	if n.closed && len(n.children) > 0 {
		for k := range obj {
			if _, declared := n.children[k]; !declared {
				childPath := joinPath(path, k)
				*errs = append(*errs, FieldError{
					Path:    childPath,
					Code:    ErrClosed,
					Message: fmt.Sprintf("property %q is not allowed", k),
					Value:   obj[k],
				})
			}
		}
	}

	for _, fn := range n.after {
		if err := fn(result); err != nil {
			*errs = append(*errs, FieldError{
				Path: path, Code: ErrCheck, Message: err.Error(), Value: result,
			})
		}
	}

	return result
}

func validateArray(n *Node, data any, path string, errs *[]FieldError) any {
	arr, ok := data.([]any)
	if !ok {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrType, Message: "expected array", Value: data,
		})
		return data
	}

	if n.hasLen && len(arr) != n.length {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrLen,
			Message: fmt.Sprintf("array length must be %d, got %d", n.length, len(arr)),
			Value:   data,
		})
	}
	if n.hasMin && float64(len(arr)) < n.min {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrMin,
			Message: fmt.Sprintf("array length must be at least %g, got %d", n.min, len(arr)),
			Value:   data,
		})
	}
	if n.hasMax && float64(len(arr)) > n.max {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrMax,
			Message: fmt.Sprintf("array length must be at most %g, got %d", n.max, len(arr)),
			Value:   data,
		})
	}

	if n.elemNode == nil {
		for _, fn := range n.after {
			if err := fn(arr); err != nil {
				*errs = append(*errs, FieldError{
					Path: path, Code: ErrCheck, Message: err.Error(), Value: arr,
				})
			}
		}
		return arr
	}

	result := make([]any, len(arr))
	for i, elem := range arr {
		elemPath := fmt.Sprintf("%s[%d]", path, i)
		if path == "" {
			elemPath = fmt.Sprintf("[%d]", i)
		}
		result[i] = validate(n.elemNode, elem, elemPath, errs)
	}

	for _, fn := range n.after {
		if err := fn(result); err != nil {
			*errs = append(*errs, FieldError{
				Path: path, Code: ErrCheck, Message: err.Error(), Value: result,
			})
		}
	}

	return result
}

func validateOne(n *Node, data any, path string, errs *[]FieldError) any {
	matchCount := 0
	var lastResult any
	for _, opt := range n.oneOf {
		var tmpErrs []FieldError
		result := validate(opt, data, path, &tmpErrs)
		if len(tmpErrs) == 0 {
			matchCount++
			lastResult = result
		}
	}
	if matchCount != 1 {
		*errs = append(*errs, FieldError{
			Path:    path,
			Code:    ErrOne,
			Message: fmt.Sprintf("exactly one schema must match, but %d matched", matchCount),
			Value:   data,
		})
		return data
	}
	for _, fn := range n.after {
		if err := fn(lastResult); err != nil {
			*errs = append(*errs, FieldError{
				Path: path, Code: ErrCheck, Message: err.Error(), Value: lastResult,
			})
		}
	}
	return lastResult
}

func validateSome(n *Node, data any, path string, errs *[]FieldError) any {
	var lastResult any
	matched := false
	for _, opt := range n.someOf {
		var tmpErrs []FieldError
		result := validate(opt, data, path, &tmpErrs)
		if len(tmpErrs) == 0 {
			matched = true
			lastResult = result
		}
	}
	if !matched {
		*errs = append(*errs, FieldError{
			Path: path, Code: ErrSome,
			Message: "at least one schema must match, but none matched",
			Value:   data,
		})
		return data
	}
	for _, fn := range n.after {
		if err := fn(lastResult); err != nil {
			*errs = append(*errs, FieldError{
				Path: path, Code: ErrCheck, Message: err.Error(), Value: lastResult,
			})
		}
	}
	return lastResult
}

func validateAll(n *Node, data any, path string, errs *[]FieldError) any {
	result := data
	for _, opt := range n.allOf {
		var tmpErrs []FieldError
		result = validate(opt, result, path, &tmpErrs)
		if len(tmpErrs) > 0 {
			*errs = append(*errs, tmpErrs...)
			return data
		}
	}
	for _, fn := range n.after {
		if err := fn(result); err != nil {
			*errs = append(*errs, FieldError{
				Path: path, Code: ErrCheck, Message: err.Error(), Value: result,
			})
		}
	}
	return result
}

// classifyVal returns the type classification of a runtime value.
func classifyVal(v any) valType {
	if v == nil {
		return vtNil
	}
	switch v.(type) {
	case string:
		return vtString
	case bool:
		return vtBool
	case map[string]any:
		return vtObject
	case []any:
		return vtArray
	case float32, float64:
		return vtFloat
	case int, int8, int16, int32, int64:
		return vtInteger
	case uint, uint8, uint16, uint32, uint64:
		return vtInteger
	}
	// Fallback via reflection
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return vtInteger
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return vtInteger
	case reflect.Float32, reflect.Float64:
		return vtFloat
	case reflect.String:
		return vtString
	case reflect.Bool:
		return vtBool
	case reflect.Map:
		return vtObject
	case reflect.Slice, reflect.Array:
		return vtArray
	}
	return vtUnknown
}

// typeMatches checks if a value type matches the expected Kind.
func typeMatches(k Kind, vt valType) bool {
	switch k {
	case String:
		return vt == vtString
	case Number:
		return vt == vtInteger || vt == vtFloat
	case Integer:
		return vt == vtInteger
	case Float:
		return vt == vtFloat
	case Bool:
		return vt == vtBool
	case Object:
		return vt == vtObject
	case Array:
		return vt == vtArray
	case Any:
		return true
	case Never:
		return false
	}
	return false
}

// toFloat64 converts any numeric value to float64.
func toFloat64(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int8:
		return float64(n)
	case int16:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	case uint:
		return float64(n)
	case uint8:
		return float64(n)
	case uint16:
		return float64(n)
	case uint32:
		return float64(n)
	case uint64:
		return float64(n)
	}
	rv := reflect.ValueOf(v)
	if rv.CanFloat() {
		return rv.Float()
	}
	if rv.CanInt() {
		return float64(rv.Int())
	}
	if rv.CanUint() {
		return float64(rv.Uint())
	}
	return math.NaN()
}

// cloneVal makes a shallow copy of maps and slices; returns scalars as-is.
func cloneVal(v any) any {
	switch val := v.(type) {
	case map[string]any:
		c := make(map[string]any, len(val))
		for k, v := range val {
			c[k] = cloneVal(v)
		}
		return c
	case []any:
		c := make([]any, len(val))
		for i, v := range val {
			c[i] = cloneVal(v)
		}
		return c
	default:
		return v
	}
}

func joinPath(base, key string) string {
	if base == "" {
		return key
	}
	return base + "." + key
}

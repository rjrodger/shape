package shape

import (
	"fmt"
	"strings"
)

// ShapeError represents one or more validation errors.
// It implements the error interface.
type ShapeError struct {
	Errors []FieldError
}

// FieldError represents a single validation failure at a specific path.
type FieldError struct {
	Path    string // dot-separated path, e.g. "nested.y"
	Code    int    // error code
	Message string // human-readable message
	Value   any    // the actual value that failed validation
}

func (e *ShapeError) Error() string {
	if len(e.Errors) == 1 {
		return e.Errors[0].String()
	}
	msgs := make([]string, len(e.Errors))
	for i, fe := range e.Errors {
		msgs[i] = fe.String()
	}
	return fmt.Sprintf("%d validation errors: [%s]", len(e.Errors), strings.Join(msgs, "; "))
}

func (fe FieldError) String() string {
	if fe.Path == "" {
		return fe.Message
	}
	return fmt.Sprintf("%s: %s", fe.Path, fe.Message)
}

// Error codes matching the JS library conventions.
const (
	ErrRequired = 1010
	ErrType     = 1050
	ErrMin      = 1060
	ErrMax      = 1061
	ErrAbove    = 1062
	ErrBelow    = 1063
	ErrLen      = 1070
	ErrExact    = 1080
	ErrNever    = 1090
	ErrOne      = 1100
	ErrSome     = 1110
	ErrAll      = 1120
	ErrCheck    = 1130
	ErrClosed   = 1140
	ErrEmpty    = 1150
)

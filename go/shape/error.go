package shape

import (
	"fmt"
	"strings"
)

type FieldError struct {
	Path string
	Why  string
}

func (e FieldError) Error() string {
	if e.Path == "" {
		return e.Why
	}
	return fmt.Sprintf("%s: %s", e.Path, e.Why)
}

type ValidationError struct {
	Issues []FieldError
}

func (e *ValidationError) Error() string {
	if e == nil || len(e.Issues) == 0 {
		return ""
	}
	parts := make([]string, len(e.Issues))
	for i, issue := range e.Issues {
		parts[i] = issue.Error()
	}
	return strings.Join(parts, "; ")
}

func (e *ValidationError) add(path, why string) {
	e.Issues = append(e.Issues, FieldError{Path: path, Why: why})
}

func (e *ValidationError) hasAny() bool {
	return e != nil && len(e.Issues) > 0
}

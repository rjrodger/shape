package shape

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// errValueLimit mirrors TS truncate(jstr, 111) — value renderings in error
// messages are clipped to 111 characters with a "..." trailer.
const errValueLimit = 111

// Why codes mirror the TS implementation's why values.
const (
	WhyType     = "type"
	WhyRequired = "required"
	WhyClosed   = "closed"
	WhyCheck    = "check"
	WhyOne      = "One"
	WhySome     = "Some"
	WhyAll      = "All"
	WhyExact    = "Exact"
	WhyMin      = "Min"
	WhyMax      = "Max"
	WhyAbove    = "Above"
	WhyBelow    = "Below"
	WhyLen      = "Len"
	WhyNever    = "never"
	WhyEmpty    = "empty"
)

// FieldError captures rich information about a single validation failure.
type FieldError struct {
	Path  string         // dot-notation property path (e.g. "users.0.email")
	Key   string         // the immediate key/index that failed
	Type  Kind           // node kind that ran the check
	Value any            // failing input value
	Why   string         // why-code (type, required, closed, check, ...)
	Mark  int            // numeric mark (mirrors TS marks 1010, 4000, ...)
	Text  string         // human-readable message
	Args  map[string]any // extra context for custom checks
	node  *node
}

func (e FieldError) Error() string {
	if e.Text != "" {
		return e.Text
	}
	if e.Path != "" {
		return fmt.Sprintf("%s: %s", e.Path, e.Why)
	}
	return e.Why
}

// ValidationError aggregates one or more FieldErrors.
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

func (e *ValidationError) add(err FieldError) {
	e.Issues = append(e.Issues, err)
}

func (e *ValidationError) hasAny() bool {
	return e != nil && len(e.Issues) > 0
}

// makeErr builds a FieldError mirroring TS makeErrImpl text shape.
func makeErr(s *State, why string, mark int, text string) FieldError {
	if why == "" {
		why = WhyCheck
	}
	if mark == 0 {
		mark = 4000
	}
	path := pathstr(s)
	t := KindNever
	if s != nil && s.Node != nil {
		t = s.Node.kind
	}
	err := FieldError{
		Path:  path,
		Key:   s.Key,
		Type:  t,
		Value: s.Value,
		Why:   why,
		Mark:  mark,
		Args:  map[string]any{},
	}
	if s != nil {
		err.node = s.Node
	}
	if text != "" {
		err.Text = expandErrText(text, err.Path, s.Value)
	} else {
		err.Text = defaultErrText(err)
	}
	return err
}

func expandErrText(text, path string, val any) string {
	out := strings.ReplaceAll(text, "$PATH", path)
	out = strings.ReplaceAll(out, "$VALUE", valueToString(val))
	return out
}

func defaultErrText(e FieldError) string {
	valstr := valueToString(e.Value)
	valkind := valueKind(e.Value)
	propkind := "property"
	pathPart := ""
	if e.Path != "" {
		pathPart = fmt.Sprintf("%s %q with ", propkind, e.Path)
	}
	switch e.Why {
	case WhyType:
		return fmt.Sprintf("Validation failed for %s%s %q because the %s is not of type %s.",
			pathPart, valkind, valstr, valkind, e.Type)
	case WhyRequired:
		if e.Value == "" || e.Value == nil {
			emptyTxt := "the value is required"
			if e.Value == "" {
				emptyTxt = "an empty string is not allowed"
			}
			if e.Path == "" {
				return fmt.Sprintf("Validation failed for %s %q because %s.",
					valkind, valstr, emptyTxt)
			}
			return fmt.Sprintf("Validation failed for %s%s %q because %s.",
				pathPart, valkind, valstr, emptyTxt)
		}
		return fmt.Sprintf("Validation failed for %s%s %q because the %s is required.",
			pathPart, valkind, valstr, valkind)
	case WhyClosed:
		// TS pattern: property at parent path is mentioned only if path != "".
		if e.Path == "" {
			return fmt.Sprintf("Validation failed for %s %q because the property %q is not allowed.",
				valkind, valstr, e.Key)
		}
		return fmt.Sprintf("Validation failed for %s%s %q because the property %q is not allowed.",
			pathPart, valkind, valstr, e.Key)
	case WhyNever:
		return fmt.Sprintf("Validation failed for %s%s %q because no value is allowed.",
			pathPart, valkind, valstr)
	default:
		return fmt.Sprintf("Validation failed for %s%s %q because check %q failed.",
			pathPart, valkind, valstr, e.Why)
	}
}

func valueToString(v any) string {
	if v == nil {
		return "null"
	}
	switch x := v.(type) {
	case string:
		return truncateText(x, errValueLimit)
	case bool:
		if x {
			return "true"
		}
		return "false"
	}
	// JSON render maps/arrays/numbers; mirrors TS by stripping inner quotes so
	// the result reads naturally inside the surrounding `... "..."` template.
	rendered := strings.ReplaceAll(jsonRender(v), `"`, "")
	return truncateText(rendered, errValueLimit)
}

// jsonRender produces a deterministic JSON-style representation. Maps are
// sorted alphabetically by key so error text is stable across runs.
func jsonRender(v any) string {
	switch x := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, k := range keys {
			parts = append(parts, fmt.Sprintf("%q:%s", k, jsonRender(x[k])))
		}
		return "{" + strings.Join(parts, ",") + "}"
	case []any:
		parts := make([]string, len(x))
		for i, item := range x {
			parts[i] = jsonRender(item)
		}
		return "[" + strings.Join(parts, ",") + "]"
	case string:
		b, _ := json.Marshal(x)
		return string(b)
	case bool:
		if x {
			return "true"
		}
		return "false"
	case nil:
		return "null"
	}
	if isNumber(v) {
		return fmt.Sprintf("%v", v)
	}
	b, err := json.Marshal(v)
	if err == nil {
		return string(b)
	}
	return fmt.Sprintf("%v", v)
}

func truncateText(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	if limit < 3 {
		return s[:limit]
	}
	return s[:limit-3] + "..."
}

func valueKind(v any) string {
	if v == nil {
		return "value"
	}
	switch v.(type) {
	case string:
		return "string"
	case bool:
		return "boolean"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	}
	if isNumber(v) {
		return "number"
	}
	return "value"
}

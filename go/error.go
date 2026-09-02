package shape

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"
)

// errValueLimit mirrors TS truncate(jstr, 111) — value renderings in error
// messages are clipped to 111 characters with a "..." trailer.
const errValueLimit = 111

// Why codes mirror the TS implementation's why values.
const (
	WhyType          = "type"
	WhyRequired      = "required"
	WhyClosed        = "closed"
	WhyCheck         = "check"
	WhyOne           = "One"
	WhySome          = "Some"
	WhyAll           = "All"
	WhyExact         = "Exact"
	WhyMin           = "Min"
	WhyMax           = "Max"
	WhyAbove         = "Above"
	WhyBelow         = "Below"
	WhyLen           = "Len"
	WhyNever         = "never"
	WhyRegexp        = "regexp"
	WhyEmpty         = "empty"
	WhyEmail         = "Email"
	WhyUrl           = "Url"
	WhyUuid          = "Uuid"
	WhyDateTime      = "DateTime"
	WhyIp            = "Ip"
	WhyIpv4          = "Ipv4"
	WhyIpv6          = "Ipv6"
	WhyDiscriminated = "Discriminated"
)

// FieldError captures rich information about a single validation failure.
type FieldError struct {
	Path    string         // dot-notation property path (e.g. "users.0.email")
	PathArr []any          // path as array: array indices as ints, keys as strings
	Key     string         // the immediate key/index that failed
	Type    Kind           // node kind that ran the check
	Value   any            // failing input value
	Why     string         // why-code (type, required, closed, check, ...)
	Mark    int            // numeric mark (mirrors TS marks 1010, 4000, ...)
	Text    string         // human-readable message
	Args    map[string]any // extra context for custom checks
	Check   string         // name of the failing check (TS ErrDesc.check)
	node    *node
	// parentArr records whether the failing value sits under an array parent, so
	// structural error text can say "index" instead of "property" (mirrors TS
	// isarr(s.parents[s.pI])).
	parentArr bool
	// absent records that the value was missing (JS undefined) rather than an
	// explicit null, so error text renders it as "undefined" (mirrors TS).
	absent bool
	// regexpSrc is the /pattern/ rendering for a failed KindRegexp match.
	regexpSrc string
	// plural records that Key names more than one disallowed property, so the
	// message reads "the properties ... are not allowed".
	plural bool
	// terse marks an error of a verdict-only call, which has no text and
	// is given none.
	terse bool
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

// ValidationError aggregates one or more FieldErrors. A terse one, the
// collector of a Match, only counts them.
type ValidationError struct {
	Issues []FieldError
	terse  bool
	n      int
}

func (e *ValidationError) Error() string {
	if e == nil || len(e.Issues) == 0 {
		return ""
	}
	parts := make([]string, len(e.Issues))
	for i, issue := range e.Issues {
		parts[i] = issue.Error()
	}
	// Newline, as TS joins aggregated messages (shape.ts ValidationError).
	return strings.Join(parts, "\n")
}

func (e *ValidationError) add(err FieldError) {
	if e.terse {
		e.n++
		return
	}
	e.Issues = append(e.Issues, err)
}

func (e *ValidationError) hasAny() bool {
	return e != nil && (e.n > 0 || len(e.Issues) > 0)
}

// makeErr builds a FieldError mirroring TS makeErrImpl text shape.
func makeErr(s *State, why string, mark int, text string) FieldError {
	if why == "" {
		why = WhyCheck
	}
	if mark == 0 {
		mark = 4000
	}
	t := KindNever
	if s != nil && s.Node != nil {
		t = s.Node.kind
	}
	// A verdict-only call reads none of the path, the rendering or the text.
	if s != nil && s.Ctx != nil && s.Ctx.terse {
		return FieldError{Key: s.Key, Type: t, Value: s.Value, Why: why, Mark: mark, Check: s.checkName, terse: true}
	}
	path := pathstr(s)
	err := FieldError{
		Path:      path,
		PathArr:   append([]any{}, s.PathArr...),
		Key:       s.Key,
		Type:      t,
		Value:     s.Value,
		Why:       why,
		Mark:      mark,
		Args:      map[string]any{},
		parentArr: isAnyArray(s.Parent),
		absent:    s != nil && s.absent,
		Check:     s.checkName,
	}
	if s != nil {
		err.node = s.Node
		if s.Node != nil && s.Node.regexpVal != nil {
			err.regexpSrc = "/" + s.Node.regexpVal.String() + "/"
		}
	}
	if text != "" {
		err.Text = expandErrTextFor(text, err.Path, s.Value, err.absent)
	} else {
		err.Text = defaultErrText(err)
	}
	return err
}

// expandErrTextFor expands a message template, rendering a missing value as
// "undefined" rather than "null" — TS distinguishes the two.
func expandErrTextFor(text, path string, val any, absent bool) string {
	if absent {
		out := strings.ReplaceAll(text, "$PATH", path)
		return strings.ReplaceAll(out, "$VALUE", "undefined")
	}
	return expandErrText(text, path, val)
}

func expandErrText(text, path string, val any) string {
	out := strings.ReplaceAll(text, "$PATH", path)
	out = strings.ReplaceAll(out, "$VALUE", valueToString(val))
	return out
}

func defaultErrText(e FieldError) string {
	valstr := valueToString(e.Value)
	valkind := valueKind(e.Value)
	// A missing value renders as "undefined" (TS: undefined === s.val ? "undefined").
	if e.absent {
		valstr = "undefined"
		valkind = "value"
	}
	// TS: propkind is "index" when the value renders as an array or its parent is
	// an array; otherwise "property".
	propkind := "property"
	if e.parentArr || strings.HasPrefix(valstr, "[") {
		propkind = "index"
	}
	// Rendered raw inside the quotes, as TS does: a key holding a backslash
	// or a quote is not escaped again.
	pathPart := ""
	if e.Path != "" {
		pathPart = propkind + " \"" + e.Path + "\" with "
	}
	switch e.Why {
	case WhyType:
		return "Validation failed for " + pathPart + valkind + " \"" + valstr +
			"\" because the " + valkind + " is not of type " + string(e.Type) + "."
	case WhyRequired:
		if e.Value == "" || e.Value == nil {
			emptyTxt := "the value is required"
			if e.Value == "" {
				emptyTxt = "an empty string is not allowed"
			}
			if e.Path == "" {
				return "Validation failed for " + valkind + " \"" + valstr + "\" because " + emptyTxt + "."
			}
			return "Validation failed for " + pathPart + valkind + " \"" + valstr + "\" because " + emptyTxt + "."
		}
		return "Validation failed for " + pathPart + valkind + " \"" + valstr +
			"\" because the " + valkind + " is required."
	case WhyClosed:
		// TS pattern: parent is mentioned only if path != "". The offending key is
		// an "index" under an array parent, else a "property"; more than one is
		// listed in a single pluralized message.
		// TS uses the literal "properties" for more than one key, whether the
		// singular would have been "property" or "index".
		noun, verb := propkind, "is"
		if e.plural {
			noun, verb = "properties", "are"
		}
		if e.Path == "" {
			return "Validation failed for " + valkind + " \"" + valstr + "\" because the " +
				noun + " \"" + e.Key + "\" " + verb + " not allowed."
		}
		return "Validation failed for " + pathPart + valkind + " \"" + valstr + "\" because the " +
			noun + " \"" + e.Key + "\" " + verb + " not allowed."
	case WhyNever:
		return "Validation failed for " + pathPart + valkind + " \"" + valstr + "\" because no value is allowed."
	case WhyRegexp:
		return "Validation failed for " + pathPart + valkind + " \"" + valstr +
			"\" because the " + valkind + " did not match " + e.regexpSrc + "."
	default:
		// TS: check "<fname or why>" failed — prefer the check name.
		name := e.Check
		if name == "" {
			name = e.Why
		}
		return "Validation failed for " + pathPart + valkind + " \"" + valstr +
			"\" because check \"" + name + "\" failed."
	}
}

func valueToString(v any) string {
	if v == nil {
		return "null"
	}
	switch x := v.(type) {
	case string:
		// As TS renders it: JSON-escaped, with the quotes stripped, so that a
		// backslash reads as \\ and a quote as \ — then truncated. A string
		// the encoder would pass through unchanged skips the encoder.
		if plainText(x) {
			return truncateText(x, errValueLimit)
		}
		return truncateText(strings.ReplaceAll(jsonText(x), `"`, ""), errValueLimit)
	case int:
		return strconv.Itoa(x)
	case float64:
		// What %v prints for a float64.
		return strconv.FormatFloat(x, 'g', -1, 64)
	case bool:
		if x {
			return "true"
		}
		return "false"
	case time.Time:
		return jsDateString(x)
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
		// jsonText, not json.Marshal: no HTML escaping, as JSON.stringify.
		return jsonText(x)
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

// plainText reports whether the JSON encoder would emit s as it is, between
// its quotes: printable ASCII with no quote or backslash.
func plainText(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < 0x20 || c > 0x7e || c == '"' || c == '\\' {
			return false
		}
	}
	return true
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

// isAnyArray reports whether v is an array/slice value (an array parent makes a
// failing child an "index" rather than a "property" in error text).
func isAnyArray(v any) bool {
	if v == nil {
		return false
	}
	if _, ok := v.([]any); ok {
		return true
	}
	rv := reflect.ValueOf(v)
	return rv.Kind() == reflect.Slice || rv.Kind() == reflect.Array
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
	case time.Time:
		// typeof a Date is "object" in JS.
		return "object"
	}
	if isNumber(v) {
		return "number"
	}
	return "value"
}

// jsDateString renders a time the way JSON.stringify renders a Date: UTC, with
// millisecond precision.
func jsDateString(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

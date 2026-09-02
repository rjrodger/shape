package shape

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Strict ISO 8601 / RFC 3339 date-time: the one form both implementations parse
// identically. Calendar ranges are checked so that 2024-02-30 is rejected
// rather than rolled over into March.
var isoDateTimeRE = regexp.MustCompile(
	`^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$`)

func isoDateTime(s string) bool {
	m := isoDateTimeRE.FindStringSubmatch(s)
	if m == nil {
		return false
	}

	atoi := func(x string) int { n, _ := strconv.Atoi(x); return n }
	y, mo, d := atoi(m[1]), atoi(m[2]), atoi(m[3])
	h, mi, sec := atoi(m[4]), atoi(m[5]), atoi(m[6])
	if mo < 1 || 12 < mo || 23 < h || 59 < mi || 59 < sec {
		return false
	}

	leap := (y%4 == 0 && y%100 != 0) || y%400 == 0
	days := [...]int{31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}[mo-1]
	if leap && mo == 2 {
		days = 29
	}
	if d < 1 || days < d {
		return false
	}

	if m[8] != "Z" && (23 < atoi(m[8][1:3]) || 59 < atoi(m[8][4:6])) {
		return false
	}

	return true
}

// parseISODateTime parses a strict ISO 8601 date-time, or reports false. The
// gate accepts only what the RFC 3339 layout parses (same ranges, same leap
// rule), so the parse itself cannot fail once the gate has passed.
func parseISODateTime(s string) (time.Time, bool) {
	if !isoDateTime(s) {
		return time.Time{}, false
	}
	t, _ := time.Parse(time.RFC3339Nano, s)
	return t, true
}

// Decimal numeric strings only: no hex, no Infinity, nothing JS's Number()
// would accept that strconv would not — the gate is the same regex in both.
var numericRE = regexp.MustCompile(`^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$`)

// coerceTo is the value a Coerce node converts val to for kind k, or false to
// leave it alone (and let the type check report it).
func coerceTo(k Kind, val any) (any, bool) {
	switch k {
	case KindNumber, KindInteger:
		switch v := val.(type) {
		case string:
			s := strings.TrimSpace(v)
			if numericRE.MatchString(s) {
				if f, err := strconv.ParseFloat(s, 64); err == nil && !math.IsInf(f, 0) {
					return f, true
				}
			}
		case bool:
			if v {
				return 1.0, true
			}
			return 0.0, true
		}
	case KindString:
		if b, ok := val.(bool); ok {
			return strconv.FormatBool(b), true
		}
		if isNumber(val) {
			f := toFloat(val)
			if !math.IsNaN(f) && !math.IsInf(f, 0) {
				return fmtFloat(f), true
			}
		}
	case KindBoolean:
		if str, ok := val.(string); ok {
			switch strings.ToLower(strings.TrimSpace(str)) {
			case "true", "1":
				return true, true
			case "false", "0":
				return false, true
			}
			return nil, false
		}
		if isNumber(val) {
			switch toFloat(val) {
			case 1:
				return true, true
			case 0:
				return false, true
			}
		}
	case KindDate:
		if str, ok := val.(string); ok {
			if t, ok := parseISODateTime(strings.TrimSpace(str)); ok {
				return t, true
			}
			return nil, false
		}
		if isNumber(val) {
			f := toFloat(val)
			if !math.IsNaN(f) && !math.IsInf(f, 0) {
				// JS Date(n) truncates the time value toward zero.
				return time.UnixMilli(int64(f)).UTC(), true
			}
		}
	}
	return nil, false
}

// coerceValidator runs ahead of any bound, so a bound sees the converted value.
func coerceValidator() validator {
	return validator{
		name: "Coerce",
		fn: func(val any, update *Update, state *State) bool {
			if c, ok := coerceTo(state.Node.kind, val); ok {
				update.Val = c
				update.HasVal = true
			}
			return true
		},
	}
}

// Coerce converts the value to the node's kind where the conversion is
// unambiguous, before the type check: a decimal string to a number,
// "true"/"false"/"1"/"0" to a boolean, a number or boolean to a string, an ISO
// 8601 string or a time value to a Date. Anything else is left alone, so the
// usual type error speaks.
func Coerce(spec ...any) *Node {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	nb.n.befores = append([]validator{coerceValidator()}, nb.n.befores...)
	bumpValidatorGen()
	return nb
}

// Coerce (chained).
func (n *Node) Coerce() *Node {
	n.n.befores = append([]validator{coerceValidator()}, n.n.befores...)
	bumpValidatorGen()
	return n
}

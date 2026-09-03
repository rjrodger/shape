package shape

import (
	"fmt"
	"regexp"
	"strings"
)

// The shared regexp subset. A regexp in a shape is read by three engines
// (JavaScript, RE2 here, the regex crate in Rust), which agree only on a
// subset of syntax and meaning. A pattern is held to that subset and
// rewritten for this engine, so that the same pattern matches the same
// strings everywhere; the original text is what renders and exports. The
// rules are the ones docs/reference/regexp.md states, and the TypeScript
// and Rust implementations carry the same scanner with the same error
// texts.
//
// In the subset: literals, \ escapes of the syntax characters and /, \t \n
// \r \f \v and \xHH, character classes with ranges, \d \w \s (ASCII) and
// their negations outside a class, . (anything but a newline), ^ $ \b \B,
// groups ( ) and (?: ), alternation, and the quantifiers * + ? {n} {n,}
// {n,m} with a lazy ?. Not in it: flags, lookaround, backreferences, named
// groups, inline flags, POSIX and \p classes, \u escapes, class set
// operators and lone braces.

const (
	reSyntaxEscapes = `\^$.|?*+()[]{}/`
	reASCIID        = `0-9`
	reASCIIW        = `A-Za-z0-9_`
	reASCIIS        = ` \t\n\r\f\v`
)

var reQuantBrace = regexp.MustCompile(`^\{(\d+)(,(\d*))?\}`)

// regexpFault is the shared error text for a pattern outside the subset.
func regexpFault(src, reason string) error {
	return fmt.Errorf("Shape: invalid regexp /%s/: %s", src, reason)
}

func isHex2(s string) bool {
	if len(s) != 2 {
		return false
	}
	for _, c := range s {
		if !(('0' <= c && c <= '9') || ('a' <= c && c <= 'f') || ('A' <= c && c <= 'F')) {
			return false
		}
	}
	return true
}

// canonicalRegexp validates a pattern against the subset and returns the
// pattern this engine runs, or the shared error.
func canonicalRegexp(src string) (string, error) {
	if src == "" {
		return "", regexpFault(src, "empty pattern")
	}
	rs := []rune(src)
	n := len(rs)
	at := func(i int) rune {
		if i < n {
			return rs[i]
		}
		return 0
	}
	var out strings.Builder
	inClass := false
	classItems := 0    // items so far in the open class
	shorthand := false // the previous class item was \d \w or \s
	depth := 0
	atom := false  // an atom precedes, so a quantifier may follow
	quant := false // a quantifier precedes, so a ? makes it lazy

	for i := 0; i < n; i++ {
		c := rs[i]

		if inClass {
			if c == ']' {
				if classItems == 0 {
					return "", regexpFault(src, "empty character class")
				}
				out.WriteRune(']')
				inClass = false
				atom = true
				quant = false
				continue
			}
			if c == '[' {
				if at(i+1) == ':' {
					return "", regexpFault(src, "POSIX classes are not in the subset")
				}
				return "", regexpFault(src, "[ must be escaped inside a character class")
			}
			if (c == '&' || c == '~' || c == '-') && at(i+1) == c {
				return "", regexpFault(src, "class set operators (&&, --, ~~) are not in the subset")
			}
			if c == '-' {
				// A range: neither end may be a shorthand class.
				ends := at(i+1) == ']' || classItems == 0
				if !ends && shorthand {
					return "", regexpFault(src, "a range cannot start or end at a class shorthand")
				}
				if !ends && at(i+1) == '\\' && strings.ContainsRune("dwsDWS", at(i+2)) {
					return "", regexpFault(src, "a range cannot start or end at a class shorthand")
				}
				out.WriteRune('-')
				continue
			}
			if c == '\\' {
				i++
				if i >= n {
					return "", regexpFault(src, "trailing backslash")
				}
				e := rs[i]
				shorthand = false
				switch {
				case strings.ContainsRune(reSyntaxEscapes, e) || e == '-':
					out.WriteRune('\\')
					out.WriteRune(e)
				case strings.ContainsRune("tnrfv", e):
					out.WriteRune('\\')
					out.WriteRune(e)
				case e == 'x':
					h := string(rs[i+1 : min(i+3, n)])
					if !isHex2(h) {
						return "", regexpFault(src, `\x needs two hex digits`)
					}
					out.WriteString(`\x` + h)
					i += 2
				case e == 'd':
					out.WriteString(reASCIID)
					shorthand = true
				case e == 'w':
					out.WriteString(reASCIIW)
					shorthand = true
				case e == 's':
					out.WriteString(reASCIIS)
					shorthand = true
				case e == 'D' || e == 'W' || e == 'S':
					return "", regexpFault(src, `\D, \W and \S are not allowed inside a character class`)
				case e == 'b' || e == 'B':
					return "", regexpFault(src, `\b and \B are not allowed inside a character class`)
				default:
					return "", regexpFault(src, `escape \`+string(e)+" is not in the subset")
				}
				classItems++
				continue
			}
			shorthand = false
			out.WriteRune(c)
			classItems++
			continue
		}

		if c == '\\' {
			i++
			if i >= n {
				return "", regexpFault(src, "trailing backslash")
			}
			e := rs[i]
			switch {
			case strings.ContainsRune(reSyntaxEscapes, e):
				out.WriteRune('\\')
				out.WriteRune(e)
			case strings.ContainsRune("tnrfv", e):
				out.WriteRune('\\')
				out.WriteRune(e)
			case e == 'x':
				h := string(rs[i+1 : min(i+3, n)])
				if !isHex2(h) {
					return "", regexpFault(src, `\x needs two hex digits`)
				}
				out.WriteString(`\x` + h)
				i += 2
			case e == 'd':
				out.WriteString("[" + reASCIID + "]")
			case e == 'D':
				out.WriteString("[^" + reASCIID + "]")
			case e == 'w':
				out.WriteString("[" + reASCIIW + "]")
			case e == 'W':
				out.WriteString("[^" + reASCIIW + "]")
			case e == 's':
				out.WriteString("[" + reASCIIS + "]")
			case e == 'S':
				out.WriteString("[^" + reASCIIS + "]")
			case e == 'b' || e == 'B':
				out.WriteRune('\\')
				out.WriteRune(e)
				atom = false
				quant = false
				continue
			case e == '-':
				return "", regexpFault(src, `escape \- is only allowed inside a character class`)
			default:
				return "", regexpFault(src, `escape \`+string(e)+" is not in the subset")
			}
			atom = true
			quant = false
			continue
		}

		switch c {
		case '[':
			inClass = true
			classItems = 0
			shorthand = false
			out.WriteRune('[')
			if at(i+1) == '^' {
				out.WriteRune('^')
				i++
			}
			continue
		case ']':
			return "", regexpFault(src, "unescaped ]")
		case '(':
			if at(i+1) == '?' {
				if at(i+2) != ':' {
					return "", regexpFault(src, "lookaround, named groups and inline flags are not in the subset")
				}
				out.WriteString("(?:")
				i += 2
			} else {
				out.WriteRune('(')
			}
			depth++
			atom = false
			quant = false
			continue
		case ')':
			depth--
			if depth < 0 {
				return "", regexpFault(src, "unbalanced parentheses")
			}
			out.WriteRune(')')
			atom = true
			quant = false
			continue
		case '|', '^', '$':
			out.WriteRune(c)
			atom = false
			quant = false
			continue
		case '*', '+', '?':
			if c == '?' && quant {
				// Lazy.
				out.WriteRune('?')
				quant = false
				atom = false
				continue
			}
			if !atom {
				return "", regexpFault(src, "nothing to repeat")
			}
			out.WriteRune(c)
			atom = false
			quant = true
			continue
		case '{':
			m := reQuantBrace.FindString(string(rs[i:]))
			if m == "" {
				return "", regexpFault(src, "lone quantifier brace")
			}
			if !atom {
				return "", regexpFault(src, "nothing to repeat")
			}
			out.WriteString(m)
			i += len([]rune(m)) - 1
			atom = false
			quant = true
			continue
		case '}':
			return "", regexpFault(src, "lone quantifier brace")
		case '.':
			out.WriteString(`[^\n]`)
			atom = true
			quant = false
			continue
		}
		out.WriteRune(c)
		atom = true
		quant = false
	}
	if inClass {
		return "", regexpFault(src, "unterminated character class")
	}
	if depth != 0 {
		return "", regexpFault(src, "unbalanced parentheses")
	}
	return out.String(), nil
}

// compileRegexp is the engine regexp for a pattern in the subset.
func compileRegexp(src string) (*regexp.Regexp, error) {
	canon, err := canonicalRegexp(src)
	if err != nil {
		return nil, err
	}
	re, err := regexp.Compile(canon)
	if err != nil {
		return nil, regexpFault(src, "not accepted by the engine")
	}
	return re, nil
}

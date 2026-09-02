package shape

import (
	"regexp"
	"testing"
)

// The shared regexp subset (docs/reference/regexp.md): what every engine
// accepts, what every engine refuses, and with which text. TypeScript and
// Rust carry this table too.

var regexpRejects = [][2]string{
	{"(?=a)", "lookaround, named groups and inline flags are not in the subset"},
	{"(?<n>a)", "lookaround, named groups and inline flags are not in the subset"},
	{"(?i)a", "lookaround, named groups and inline flags are not in the subset"},
	{"(a)\\1", "escape \\1 is not in the subset"},
	{"[^]", "empty character class"},
	{"[]", "empty character class"},
	{"\\u00e9", "escape \\u is not in the subset"},
	{"\\p{L}", "escape \\p is not in the subset"},
	{"[[:alpha:]]", "POSIX classes are not in the subset"},
	{"[a[b]", "[ must be escaped inside a character class"},
	{"[a&&b]", "class set operators (&&, --, ~~) are not in the subset"},
	{"[a--b]", "class set operators (&&, --, ~~) are not in the subset"},
	{"[a~~b]", "class set operators (&&, --, ~~) are not in the subset"},
	{"[\\d-z]", "a range cannot start or end at a class shorthand"},
	{"[a-\\d]", "a range cannot start or end at a class shorthand"},
	{"[\\D]", "\\D, \\W and \\S are not allowed inside a character class"},
	{"[\\b]", "\\b and \\B are not allowed inside a character class"},
	{"[\\q]", "escape \\q is not in the subset"},
	{"[\\x4]", "\\x needs two hex digits"},
	{"[a", "unterminated character class"},
	{"[a\\", "trailing backslash"},
	{"a\\", "trailing backslash"},
	{"\\x4", "\\x needs two hex digits"},
	{"\\-", "escape \\- is only allowed inside a character class"},
	{"\\q", "escape \\q is not in the subset"},
	{"a]", "unescaped ]"},
	{"(a", "unbalanced parentheses"},
	{"a)", "unbalanced parentheses"},
	{"a**", "nothing to repeat"},
	{"*a", "nothing to repeat"},
	{"^*", "nothing to repeat"},
	{"a{", "lone quantifier brace"},
	{"a}", "lone quantifier brace"},
	{"a{x}", "lone quantifier brace"},
	{"a{2x}", "lone quantifier brace"},
	{"{2}", "nothing to repeat"},
	{"a???", "nothing to repeat"},
}

var regexpAccepts = []struct {
	pattern, input string
	ok             bool
}{
	{"^\\d+$", "12", true},
	{"^\\d+$", "\u0661\u0662", false},
	{"^\\D+$", "ab", true},
	{"^\\D+$", "a1", false},
	{"^\\w+$", "ab_1", true},
	{"^\\w+$", "\u00e9", false},
	{"^\\W+$", "\u00e9", true},
	{"^\\s+$", " \t", true},
	{"^\\s+$", "\u00a0", false},
	{"^\\S+$", "ab", true},
	{"^[\\s\\d\\w]+$", " 1a", true},
	{"^[^\\d]+$", "ab", true},
	{"^[^\\d]+$", "a1", false},
	{"^a.b$", "a\nb", false},
	{"^a.b$", "a\rb", true},
	{"^a.b$", "a😀b", true},
	{"^a$", "a\n", false},
	{"\\bx\\b", "a x b", true},
	{"\\bx\\b", "axb", false},
	{"\\Bx\\B", "axb", true},
	{"^x{2,3}?$", "xx", true},
	{"^x{2}$", "xxx", false},
	{"^x{2,}$", "xxxx", true},
	{"^x+?$", "xx", true},
	{"^x*$", "", true},
	{"^(?:a|b)+$", "abab", true},
	{"^(a|b)+$", "abab", true},
	{"^\\/$", "/", true},
	{"^\\x41$", "A", true},
	{"^[a-c-]+$", "a-c", true},
	{"^[-a]+$", "-a", true},
	{"^[\\-\\]\\[]+$", "-][", true},
	{"^\u00e9+$", "\u00e9\u00e9", true},
	{"^\\t\\n\\r\\f\\v$", "\t\n\r\f\u000b", true},
	{"^[\\t\\n\\r\\f\\v]+$", "\t\n", true},
	{"^\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\^\\$\\\\$", ".*+?()[]{}|^$\\", true},
	{"^a{1}$", "a", true},
	{"^[a{]+$", "a{", true},
	{"^[a}]+$", "a}", true},
	{"^\\x41\\x62$", "Ab", true},
	{"^[\\x41-\\x43]+$", "AB", true},
	{"^[a\\x2d]+$", "a-", true},
}

func TestRegexpSubsetRejects(t *testing.T) {
	for _, c := range regexpRejects {
		want := "Shape: invalid regexp /" + c[0] + "/: " + c[1]
		if _, err := Expr("/" + c[0] + "/"); err == nil || err.Error() != want {
			t.Errorf("expr %q: got %v, want %s", c[0], err, want)
		}
		// A pattern outside the subset that RE2 itself compiles, given as a
		// compiled regexp: a fault at build (the shape), or at validation
		// (Check, a fault node).
		re, err := regexp.Compile(c[0])
		if err != nil {
			continue
		}
		if _, err := Shape(re); err == nil || err.Error() != want {
			t.Errorf("spec %q: got %v, want %s", c[0], err, want)
		}
		s, _ := Shape(Check(re))
		if _, err := s.Validate("a"); err == nil || err.Error() != want {
			t.Errorf("check %q: got %v, want %s", c[0], err, want)
		}
	}
	if _, err := Expr("/^a$/i"); err == nil || err.Error() != "Shape: invalid regexp /^a$/: flags are not supported" {
		t.Errorf("flags: %v", err)
	}
	if _, err := Expr("//"); err == nil || err.Error() != "Shape: invalid regexp //: empty pattern" {
		t.Errorf("empty: %v", err)
	}
	if _, err := Expr("Check(/a/i)"); err == nil || err.Error() != "Shape: invalid regexp /a/: flags are not supported" {
		t.Errorf("argument flags: %v", err)
	}
	if _, err := FromJSONSchema(map[string]any{"type": "string", "pattern": "(?=a)"}); err == nil {
		t.Error("import accepted a lookahead")
	}
	if _, err := compileRegexp("a{9999999999}"); err == nil || err.Error() != "Shape: invalid regexp /a{9999999999}/: not accepted by the engine" {
		t.Errorf("engine: %v", err)
	}
}

func TestRegexpSubsetAccepts(t *testing.T) {
	for _, c := range regexpAccepts {
		n, err := Expr("/" + c.pattern + "/")
		if err != nil {
			t.Fatalf("%q: %v", c.pattern, err)
		}
		s, _ := Shape(n)
		if got := s.Valid(c.input); got != c.ok {
			t.Errorf("%q on %q: got %v, want %v", c.pattern, c.input, got, c.ok)
		}
		re := regexp.MustCompile(c.pattern)
		s2, _ := Shape(re)
		if got := s2.Valid(c.input); got != c.ok {
			t.Errorf("spec %q on %q: got %v, want %v", c.pattern, c.input, got, c.ok)
		}
		s3, _ := Shape(Check(re))
		if got := s3.Valid(c.input); got != c.ok {
			t.Errorf("check %q on %q: got %v, want %v", c.pattern, c.input, got, c.ok)
		}
		spec, err := FromJSONSchema(map[string]any{"type": "string", "pattern": c.pattern})
		if err != nil {
			t.Fatalf("import %q: %v", c.pattern, err)
		}
		s4, _ := Shape(spec)
		if got := s4.Valid(c.input); got != c.ok {
			t.Errorf("imported %q on %q: got %v, want %v", c.pattern, c.input, got, c.ok)
		}
	}
	// The original text is what renders and exports.
	s, _ := Shape(map[string]any{"a": regexp.MustCompile(`^\d+$`)})
	if got := s.String(); got != `{a: /^\d+$/}` {
		t.Errorf("render: %s", got)
	}
	if got := s.JSONSchema()["properties"].(map[string]any)["a"].(map[string]any)["pattern"]; got != `^\d+$` {
		t.Errorf("export: %v", got)
	}
	if _, err := s.Validate(map[string]any{"a": "\u0661"}); err == nil || err.Error() != "Validation failed for property \"a\" with string \"\u0661\" because the string did not match /^\\d+$/." {
		t.Errorf("message: %v", err)
	}
}

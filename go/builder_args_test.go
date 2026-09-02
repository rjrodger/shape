package shape

import (
	"strings"
	"testing"
	"time"
)

// A builder called with the wrong argument returns a node that accepts
// nothing and says why, the message TypeScript throws at build.
func TestBuilderArguments(t *testing.T) {
	cases := map[string]*Node{
		"Shape: Min needs a number":                       Min("x"),
		"Shape: Max needs a number":                       Max(nil),
		"Shape: Above needs a number":                     Above(true),
		"Shape: Below needs a number":                     Below("q"),
		"Shape: Len needs a whole number of zero or more": Len(-1),
		"Shape: Define needs a name":                      Define(""),
		"Shape: Refer needs a name":                       Refer(""),
		"Shape: Rename needs a name":                      Rename(""),
	}
	for msg, n := range cases {
		_, err := MustShape(map[string]any{"a": n}).Validate(map[string]any{"a": 1.0})
		if err == nil || !strings.Contains(err.Error(), msg) {
			t.Fatalf("%s: got %v", msg, err)
		}
	}
	// A time is a bound too (for a Date), and a numeric string is a number,
	// as in TypeScript.
	if Min(time.Unix(0, 0)).n.kind == KindNever {
		t.Fatal("a time is not accepted as a bound")
	}
	if _, err := MustShape(map[string]any{"a": Min("2", Number)}).Validate(map[string]any{"a": 3.0}); err != nil {
		t.Fatal(err)
	}
}

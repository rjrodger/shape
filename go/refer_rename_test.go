package shape

import (
	"reflect"
	"testing"
)

// A claim the node a Refer puts in a key's place makes reads a Null
// sentinel as a present null, as a claim of the key's own node does.
func TestReferClaimNull(t *testing.T) {
	claim := func() *Node { return RenameWith("b", RenameOptions{Claim: []string{"a"}}, Number) }
	direct := MustShape(map[string]any{"o": map[string]any{"b": claim()}})
	referred := MustShape(map[string]any{
		"def": Define("R", claim()),
		"o":   map[string]any{"b": ReferWith("R", ReferOptions{Fill: true})},
	})
	_, derr := direct.Validate(map[string]any{"o": map[string]any{"a": Null}})
	_, rerr := referred.Validate(map[string]any{"def": 2.0, "o": map[string]any{"a": Null}})
	if derr == nil || rerr == nil || derr.Error() != rerr.Error() {
		t.Fatalf("a claimed Null differs: %v / %v", derr, rerr)
	}
	if referred.Match(map[string]any{"def": 2.0, "o": map[string]any{"a": Null}}) {
		t.Fatal("expected no match for a claimed null")
	}

	// A nullable node takes it, under its target.
	nullable := MustShape(map[string]any{
		"def": Define("R", RenameWith("b", RenameOptions{Claim: []string{"a"}}, Nullable(Number))),
		"o":   map[string]any{"b": ReferWith("R", ReferOptions{Fill: true})},
	})
	out := mustOK(t, nullable, map[string]any{"def": 2.0, "o": map[string]any{"a": Null}})
	want := map[string]any{"b": 2.0, "o": map[string]any{"b": nil}}
	if !reflect.DeepEqual(out, want) {
		t.Fatalf("got %v, want %v", out, want)
	}
}

// An object a child of which can claim through a Refer is marked as one
// that claims, by any Define of the name and through a chain of Refers;
// one whose Refers bring no claim is not.
func TestReferClaimsMarked(t *testing.T) {
	claims := func(s *Schema, k string) bool { return s.root.objChildren[k].claims }
	s := MustShape(map[string]any{
		"d1": Define("C", RenameWith("b", RenameOptions{Claim: []string{"a"}}, Number)),
		"d2": Define("S", ReferWith("C", ReferOptions{Fill: true})),
		"d3": Define("P", Rename("x", Number)),
		"o1": map[string]any{"b": ReferWith("S", ReferOptions{Fill: true})},
		"o2": map[string]any{"b": Refer("P")},
	})
	if !claims(s, "o1") || claims(s, "o2") {
		t.Fatalf("claims: o1 %v, o2 %v", claims(s, "o1"), claims(s, "o2"))
	}
	none := MustShape(map[string]any{"d": Define("P", Number), "o": map[string]any{"b": Refer("P")}})
	if claims(none, "o") {
		t.Fatal("an object whose Refers bring no claim is not marked")
	}
}

// A key's own Skip governs an absent value, whatever node a Refer puts in
// its place: nothing is required of it and nothing is injected for it.
func TestReferUnderSkip(t *testing.T) {
	for _, def := range []any{Default(nil, String), Default("z", String), String} {
		s := MustShape(map[string]any{
			"d": Define("N", def),
			"o": map[string]any{"a": ReferWith("N", ReferOptions{Fill: true}, Skip())},
		})
		out := mustOK(t, s, map[string]any{"d": "x", "o": map[string]any{}})
		if want := map[string]any{"d": "x", "o": map[string]any{}}; !reflect.DeepEqual(out, want) {
			t.Fatalf("got %v, want %v", out, want)
		}
	}
}

// A claim runs at its place among its node's checks: a Coerce put ahead of
// it, wrapped round it or chained after it, does not convert the claimed
// value, as in TS.
func TestClaimAfterCoerce(t *testing.T) {
	claim := func() *Node { return RenameWith("b", RenameOptions{Claim: []string{"a"}}, Number) }
	for _, n := range []*Node{Coerce(claim()), claim().Coerce()} {
		mustErr(t, MustShape(map[string]any{"b": n}), map[string]any{"a": "1"}, `with string "1" because the string is not of type number`)
	}
	mustOK(t, MustShape(map[string]any{"b": Coerce(claim())}), map[string]any{"b": "2"})
}

// An open object whose rest shape refers to a claiming node is marked as
// one that claims, and the rest key claims for a value it dropped.
func TestRestReferClaims(t *testing.T) {
	s := MustShape(map[string]any{
		"d": Define("C", RenameWith("x", RenameOptions{Claim: []string{"z"}}, Ignore(Number))),
		"o": Child(Refer("C"), map[string]any{}),
	})
	if !s.root.objChildren["o"].claims {
		t.Fatal("a rest shape that refers to a claim is not marked")
	}
	out := mustOK(t, s, map[string]any{"d": 1.0, "o": map[string]any{"b": "bad", "z": 5.0}})
	if want := map[string]any{"x": 1.0, "o": map[string]any{"x": 5.0}}; !reflect.DeepEqual(out, want) {
		t.Fatalf("got %v, want %v", out, want)
	}
}

// A taker validates the value on its own and leaves a Rename's claim with
// the node, ahead of it, whatever checks the claim followed, and the rename
// after it, as in TS.
func TestRenameAroundTaker(t *testing.T) {
	c := func() *Node { return RenameWith("b", RenameOptions{Claim: []string{"a"}}, Min(2, Number)) }
	for _, tc := range []struct {
		s    *Schema
		in   map[string]any
		want map[string]any
	}{
		{MustShape(map[string]any{"b": Catch(0.0, c())}), map[string]any{"a": 3.0}, map[string]any{"b": 3.0}},
		{MustShape(map[string]any{"b": Catch(0.0, c())}), map[string]any{"a": 1.0}, map[string]any{"b": 0.0}},
		{MustShape(map[string]any{"b": Ignore(c())}), map[string]any{"a": "s"}, map[string]any{}},
		{MustShape(map[string]any{"a": Transform(func(v any, _ *State) any { return v.(float64) * 10 }, Rename("x", Number))}),
			map[string]any{"a": 2.0}, map[string]any{"x": 20.0}},
	} {
		if out := mustOK(t, tc.s, tc.in); !reflect.DeepEqual(out, tc.want) {
			t.Fatalf("%v: got %v, want %v", tc.in, out, tc.want)
		}
	}
}

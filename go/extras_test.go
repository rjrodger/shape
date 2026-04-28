package shape

import (
	"reflect"
	"testing"
)

// --- Mark codes -------------------------------------------------------

func TestErrorMarkCodes(t *testing.T) {
	cases := []struct {
		name string
		spec any
		in   any
		want int
	}{
		{"obj-required", map[string]any{"a": Number}, map[string]any{}, markScalarRequired},
		{"obj-type", Number, "x", markScalarType},
		{"never", Never(), 1, markNever},
		{"obj-closed", map[string]any{"a": 1}, map[string]any{"a": 2, "z": 9}, markObjectClosed},
		{"top-obj-type", map[string]any{"a": Number}, "scalar", markObjectType},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := MustShape(c.spec)
			errs := s.Error(c.in)
			if len(errs) == 0 {
				t.Fatalf("expected error")
			}
			if errs[0].Mark != c.want {
				t.Fatalf("want mark %d, got %d (err=%v)", c.want, errs[0].Mark, errs[0])
			}
		})
	}
}

// --- Ignore drops key ------------------------------------------------

func TestIgnoreDropsKey(t *testing.T) {
	s := MustShape(map[string]any{"x": Ignore(Number), "y": String})
	out, err := s.Validate(map[string]any{"x": "not-a-number", "y": "hi"})
	if err != nil {
		t.Fatalf("ignored child should not fail: %v", err)
	}
	m := out.(map[string]any)
	if _, has := m["x"]; has {
		t.Fatalf("expected x dropped, got %v", m)
	}
	if m["y"] != "hi" {
		t.Fatalf("expected y preserved, got %v", m)
	}
}

func TestIgnoreMissingKey(t *testing.T) {
	s := MustShape(map[string]any{"x": Ignore(Number)})
	out, err := s.Validate(map[string]any{})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	m := out.(map[string]any)
	if _, has := m["x"]; has {
		t.Fatalf("expected no x for skippable, got %v", m)
	}
}

// --- Refer fill -------------------------------------------------------

func TestReferFill(t *testing.T) {
	// Define a node, then Refer with Fill so missing values still substitute.
	s := MustShape(map[string]any{
		"src":  Define("name", Default("anon", String)),
		"echo": ReferWith("name", ReferOptions{Fill: true}, String),
	})
	out, err := s.Validate(map[string]any{"src": "alice"})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	m := out.(map[string]any)
	// src defaults retained
	if m["src"] != "alice" {
		t.Fatalf("src=%v", m["src"])
	}
	// echo missing in input but Fill=true triggers Refer → uses defined node default ("anon")
	if m["echo"] != "anon" {
		t.Fatalf("echo=%v, expected anon (filled)", m["echo"])
	}
}

// --- Rename keep + claim ----------------------------------------------

func TestRenameKeep(t *testing.T) {
	s := MustShape(map[string]any{
		"a": RenameWith("b", RenameOptions{Keep: true}, Number),
	})
	out, err := s.Validate(map[string]any{"a": 5})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	m := out.(map[string]any)
	if m["b"] != 5 || m["a"] != 5 {
		t.Fatalf("expected a and b, got %v", m)
	}
}

func TestRenameClaim(t *testing.T) {
	// "newName" pulls from "oldName" if newName is missing.
	s := MustShape(map[string]any{
		"newName": RenameWith("newName", RenameOptions{Claim: []string{"oldName"}}, String),
	})
	out, err := s.Validate(map[string]any{"oldName": "hello"})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	m := out.(map[string]any)
	if m["newName"] != "hello" {
		t.Fatalf("expected newName=hello, got %v", m)
	}
	if _, has := m["oldName"]; has {
		t.Fatalf("expected oldName dropped: %v", m)
	}
}

// --- Func -------------------------------------------------------------

func TestFunc(t *testing.T) {
	s := MustShape(Func())
	mustValid(t, s, func() {})
	mustInvalid(t, s, "not a function", "function")
}

// --- Key --------------------------------------------------------------

func TestKey(t *testing.T) {
	// Inject the immediate parent key as the value.
	s := MustShape(map[string]any{
		"name": Key(),
	})
	out, err := s.Validate(map[string]any{"name": ""})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	m := out.(map[string]any)
	if m["name"] != "name" {
		t.Fatalf("expected name=name, got %v", m["name"])
	}
}

// --- G-prefixed aliases -----------------------------------------------

func TestGAliases(t *testing.T) {
	// Sample a few aliases and confirm they produce equivalent behaviour.
	s1 := MustShape(GMin(2, GString))
	s2 := MustShape(Min(2, String))

	for _, in := range []any{"abc", "abcd"} {
		o1, _ := s1.Validate(in)
		o2, _ := s2.Validate(in)
		if !reflect.DeepEqual(o1, o2) {
			t.Fatalf("alias and direct disagree for %v: %v vs %v", in, o1, o2)
		}
	}

	if !MustShape(GAll(GMin(0, GNumber), GMax(10, GNumber))).Match(5) {
		t.Fatal("expected 5 to match GAll(GMin(0)..GMax(10))")
	}
	if MustShape(GAll(GMin(0, GNumber), GMax(10, GNumber))).Match(20) {
		t.Fatal("expected 20 not to match")
	}
}

// --- Path correctness across Refer ------------------------------------

func TestReferAcrossPath(t *testing.T) {
	s := MustShape(map[string]any{
		"a": Define("port", Number),
		"b": Refer("port", Number),
	})
	out, err := s.Validate(map[string]any{"a": 8080, "b": 9000})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	m := out.(map[string]any)
	if m["a"] != 8080 || m["b"] != 9000 {
		t.Fatalf("expected both numbers preserved: %v", m)
	}
}

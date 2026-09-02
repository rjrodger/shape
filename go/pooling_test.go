package shape

import "testing"

// A caller's Context keeps its Custom state across calls: a schema with a
// validator is never pooled, so the validator sees the same map each time.
func TestCustomKeepsStateAcrossCallsWithCallerContext(t *testing.T) {
	counter := Check(func(val any, update *Update, state *State) bool {
		n, _ := state.Ctx.Custom["n"].(int)
		state.Ctx.Custom["n"] = n + 1
		return true
	}, Number)
	s := MustShape(map[string]any{"a": counter})
	if s.isPure() {
		t.Fatal("a schema with a validator reads as pure")
	}
	ctx := &Context{Custom: map[string]any{}}
	for i := 0; i < 3; i++ {
		if _, err := s.ValidateCtx(map[string]any{"a": 1.0}, ctx); err != nil {
			t.Fatal(err)
		}
	}
	if ctx.Custom["n"] != 3 {
		t.Fatalf("Custom did not carry across calls: %v", ctx.Custom)
	}
	// Without a caller's context each call gets a fresh Custom, so the
	// validator starts from nothing every time and nothing leaks between
	// calls.
	for i := 0; i < 2; i++ {
		if _, err := s.Validate(map[string]any{"a": 1.0}); err != nil {
			t.Fatal(err)
		}
	}
	probe := &Context{Custom: map[string]any{}}
	if _, err := s.ValidateCtx(map[string]any{"a": 1.0}, probe); err != nil || probe.Custom["n"] != 1 {
		t.Fatalf("a fresh context saw state from another call: %v %v", probe.Custom, err)
	}
}

// A validator attached to a retained node after the schema was compiled is
// noticed: the schema stops reading as pure, the validator runs, and it
// finds a usable Custom map on a context of its own.
func TestValidatorAttachedAfterCompileIsNoticed(t *testing.T) {
	leaf := Required(Number)
	s := MustShape(map[string]any{"a": leaf})
	in := map[string]any{"a": 1.0}
	if !s.isPure() || !s.Valid(in) {
		t.Fatal("pure schema did not validate on the pooled context")
	}
	ran := false
	leaf.Check(func(val any, update *Update, state *State) bool {
		state.Ctx.Custom["seen"] = val
		ran = true
		return false
	})
	if s.isPure() {
		t.Fatal("the validator attached after the compile was not noticed")
	}
	if s.Valid(in) || !ran {
		t.Fatal("the validator attached after the compile did not run")
	}
	if _, err := s.Validate(in); err == nil {
		t.Fatal("Validate did not run the attached validator")
	}
	if s.Error(in) == nil {
		t.Fatal("Error did not run the attached validator")
	}
}

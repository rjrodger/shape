package shape

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
)

// Isolated validation: Catch and Transform (Ignore probes the same way from
// its call sites). These builders take the checks a node carries — its
// befores, its afters — inside, and validate the node as a whole (those
// checks, the structural check, every descendant) in a sub-run before the
// node itself proceeds. Only then is the outcome of the entire subtree known
// at once; TS does the same, since it runs a node's afters before visiting its
// children.

type inner struct {
	befores, afters []validator
}

func takeInner(n *node) inner {
	in := inner{n.befores, n.afters}
	n.befores = nil
	n.afters = nil
	return in
}

// desc renders the taken checks ahead of the taking builder, so that the
// shape still reads Number.Min(2).Catch(0).
func (in inner) desc() string {
	out := ""
	for _, v := range append(append([]validator{}, in.befores...), in.afters...) {
		if v.stringify != nil {
			out += v.stringify() + "."
		}
	}
	return out
}

// probe validates the node as it stands, with the taken checks, in isolation,
// reporting the produced value and whatever failed.
func (in inner) probe(state *State) (any, *ValidationError) {
	n := *state.Node
	n.befores, n.afters = in.befores, in.afters
	val := state.Value
	if state.absent {
		val = undefinedT{}
	}
	sub := &ValidationError{}
	out := validateNode(&n, val, state.Path, state.PathArr, state.Key, state.Parent, state.Ctx, state.Match, sub)
	return out, sub
}

// jsonText renders a value as JSON.stringify does (no HTML escaping).
func jsonText(val any) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(val); err != nil {
		return fmt.Sprintf("%T", val)
	}
	return strings.TrimSuffix(buf.String(), "\n")
}

// argText renders a builder argument as TS's dequoted stringify does: a string
// bare, anything else as JSON.
func argText(val any) string {
	if s, ok := val.(string); ok {
		return s
	}
	return jsonText(val)
}

// Catch replaces whatever fails inside with the fallback, raising nothing.
func Catch(fallback any, spec ...any) *Node {
	if len(spec) == 0 {
		return buildize(nil).Catch(fallback)
	}
	return buildize(spec[0]).Catch(fallback)
}

// Catch (chained).
func (n *Node) Catch(fallback any) *Node {
	in := takeInner(n.n)
	n.n.befores = []validator{{
		name:  "Catch",
		args:  []any{fallback},
		inner: &in,
		fn: func(_ any, update *Update, state *State) bool {
			out, sub := in.probe(state)
			if sub.hasAny() {
				out = cloneAny(fallback)
			}
			update.Val, update.HasVal, update.Done = out, true, true
			return true
		},
		stringify: func() string { return in.desc() + "Catch(" + argText(fallback) + ")" },
	}}
	return n
}

// Transform replaces a valid value with a function of it. An invalid one
// fails as it would have, with the same errors.
func Transform(fn func(val any, state *State) any, spec ...any) *Node {
	if len(spec) == 0 {
		return buildize(nil).Transform(fn)
	}
	return buildize(spec[0]).Transform(fn)
}

// Transform (chained).
func (n *Node) Transform(fn func(val any, state *State) any) *Node {
	in := takeInner(n.n)
	n.n.befores = []validator{{
		name:  "Transform",
		inner: &in,
		fn: func(_ any, update *Update, state *State) bool {
			out, sub := in.probe(state)
			if sub.hasAny() {
				update.Err = sub.Issues
				return false
			}
			update.Val, update.HasVal, update.Done = fn(out, state), true, true
			return true
		},
		stringify: func() string { return in.desc() + "Transform" },
	}}
	return n
}

// Describe attaches a description to the node, read back from Meta().
func Describe(description string, spec ...any) *Node {
	if len(spec) == 0 {
		return buildize(nil).Describe(description)
	}
	return buildize(spec[0]).Describe(description)
}

// Describe (chained).
func (n *Node) Describe(description string) *Node {
	n.Meta()["description"] = description
	return n
}

// Meta returns the node's metadata: sidecar keys, and Describe's description.
func (n *Node) Meta() map[string]any {
	if n.n.meta == nil {
		n.n.meta = map[string]any{}
	}
	return n.n.meta
}

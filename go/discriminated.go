package shape

import (
	"fmt"
	"sort"
	"strings"
)

// A discriminated union: the branch is chosen by the value of a tag property
// and the value validated against that branch alone, so the errors are its
// own rather than a list of every alternative.
type discriminated struct {
	tag      string
	tags     []string // branch names, sorted
	branches map[string]*node
}

// Discriminated chooses the branch by the value of the tag property. An
// object-shaped branch without the tag property has it added, as the literal
// it is keyed by.
func Discriminated(tag string, branches map[string]any) *Node {
	if tag == "" || len(branches) == 0 {
		return newNodeWrap(&node{kind: KindNever,
			faultMsg: "Discriminated needs a tag property name and at least one branch"})
	}

	d := &discriminated{tag: tag, branches: map[string]*node{}}
	for t := range branches {
		d.tags = append(d.tags, t)
	}
	sort.Strings(d.tags)

	n := &node{kind: KindList, required: true, requiredSet: true, disc: d}
	for _, t := range d.tags {
		bn := buildize(branches[t]).n
		if bn.kind == KindObject {
			if _, ok := bn.objChildren[tag]; !ok {
				if bn.objChildren == nil {
					bn.objChildren = map[string]*node{}
				}
				lit, _ := normalize(t) // a string literal always normalizes
				bn.objChildren[tag] = lit
				bn.objKeys = append(bn.objKeys, tag)
			}
		}
		d.branches[t] = bn
		n.list = append(n.list, bn)
	}
	n.befores = []validator{{name: "Discriminated", args: []any{tag}, fn: d.validate}}
	return newNodeWrap(n)
}

func (d *discriminated) validate(val any, update *Update, state *State) bool {
	// Required or optional is for the structural check to say.
	if state.absent {
		return true
	}

	obj, _ := val.(map[string]any)
	tv, has := obj[d.tag]
	if !has {
		update.Err = makeErr(state, WhyDiscriminated, 0,
			fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" is not an object with a \"%s\" property.", d.tag))
		return false
	}

	name, isStr := tv.(string)
	bn, found := d.branches[name]
	if !isStr || !found {
		update.Err = makeErr(state, WhyDiscriminated, 0,
			fmt.Sprintf("Value \"$VALUE\" for property \"$PATH\" has unknown \"%s\" %s, expected one of: %s.",
				d.tag, jsonText(tv), strings.Join(d.tags, ", ")))
		return false
	}

	sub := &ValidationError{}
	out := validateNode(bn, val, state.Path, state.PathArr, state.Key, state.Parent, state.Ctx, state.Match, sub)
	if sub.hasAny() {
		update.Err = sub.Issues
		return false
	}
	update.Val, update.HasVal = out, true
	return true
}

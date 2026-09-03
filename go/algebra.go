package shape

import "fmt"

// Object algebra: Pick, Omit, Partial and Extend build a new object shape
// out of an existing one. The result is a fresh node, so the source is left
// as it was and one base can be reshaped many times. Key expressions in a
// source map ({"a: Min(2)": 0}) are compiled on the way in, as the TS
// builders compile them, since the algebra has to know the real property
// names.

// keyList reads the property names an algebra builder was given: one name,
// or a list of them.
func keyList(names any, name string) ([]string, error) {
	switch v := names.(type) {
	case string:
		return []string{v}, nil
	case []string:
		return v, nil
	case []any:
		out := make([]string, len(v))
		for i, x := range v {
			s, ok := x.(string)
			if !ok {
				return nil, fmt.Errorf("%s needs a list of property names", name)
			}
			out[i] = s
		}
		return out, nil
	}
	return nil, fmt.Errorf("%s needs a list of property names", name)
}

// objectBase resolves the shape an algebra builder works on, which has to be
// an object.
func objectBase(spec []any, name string) (*node, error) {
	var nb *Node
	if len(spec) == 0 {
		nb = buildize(nil)
	} else {
		nb = buildize(spec[0])
	}
	if nb.n.kind != KindObject {
		return nil, fmt.Errorf("%s needs an object shape", name)
	}
	return nb.n, nil
}

// copyNode is a structural copy of a node: the same settings, with its own
// children and check lists, so that changing the copy leaves the original as
// it was.
func copyNode(n *node) *node {
	cp := *n
	cp.objChildren = make(map[string]*node, len(n.objChildren))
	for k, cn := range n.objChildren {
		cp.objChildren[k] = cn
	}
	cp.objKeys = append([]string{}, n.objKeys...)
	// What prepare computed for the original describes its keys, not the
	// copy's: the copy is prepared afresh.
	cp.consumed = nil
	cp.objKeysAny = nil
	cp.objChildList = nil
	cp.objExtra = nil
	cp.befores = append([]validator{}, n.befores...)
	bumpValidatorGen()
	cp.afters = append([]validator{}, n.afters...)
	bumpValidatorGen()
	if n.meta != nil {
		cp.meta = make(map[string]any, len(n.meta))
		for k, v := range n.meta {
			cp.meta[k] = v
		}
	}
	return &cp
}

// objectNode is the base's settings with just these properties, in this
// order. An object default is narrowed to them too.
func objectNode(base *node, keys []string, children map[string]*node) *node {
	cp := copyNode(base)
	cp.objKeys = keys
	cp.objChildren = children
	if dm, ok := base.defaultValue.(map[string]any); ok {
		nd := make(map[string]any, len(keys))
		for _, k := range keys {
			if dv, has := dm[k]; has {
				nd[k] = dv
			}
		}
		cp.defaultValue = nd
	}
	return cp
}

// pickNode keeps only the named properties. Naming one the shape does not
// declare is an error: there is nothing there to pick.
func pickNode(names any, spec []any) (*node, error) {
	base, err := objectBase(spec, "Pick")
	if err != nil {
		return nil, err
	}
	want, err := keyList(names, "Pick")
	if err != nil {
		return nil, err
	}
	for _, k := range want {
		if _, ok := base.objChildren[k]; !ok {
			return nil, fmt.Errorf("Pick: unknown property \"%s\"", k)
		}
	}
	keys := []string{}
	children := map[string]*node{}
	for _, k := range base.objKeys {
		if contains(want, k) {
			keys = append(keys, k)
			children[k] = base.objChildren[k]
		}
	}
	return objectNode(base, keys, children), nil
}

// omitNode drops the named properties. A name the shape does not declare is
// simply not there to drop.
func omitNode(names any, spec []any) (*node, error) {
	base, err := objectBase(spec, "Omit")
	if err != nil {
		return nil, err
	}
	want, err := keyList(names, "Omit")
	if err != nil {
		return nil, err
	}
	keys := []string{}
	children := map[string]*node{}
	for _, k := range base.objKeys {
		if !contains(want, k) {
			keys = append(keys, k)
			children[k] = base.objChildren[k]
		}
	}
	return objectNode(base, keys, children), nil
}

// partialNode makes every declared property optional, as Optional would: a
// type token then injects its empty value, a literal its own. Shallow: a
// nested object's own properties are as they were.
func partialNode(spec []any) (*node, error) {
	base, err := objectBase(spec, "Partial")
	if err != nil {
		return nil, err
	}
	children := map[string]*node{}
	for _, k := range base.objKeys {
		cc := *base.objChildren[k]
		cc.required = false
		cc.requiredSet = true
		children[k] = &cc
	}
	return objectNode(base, append([]string{}, base.objKeys...), children), nil
}

// extendNode adds the properties of another object shape; a property both
// declare takes the extension's. Only its properties are taken: the result
// stays open or closed as the base was.
func extendNode(extra any, spec []any) (*node, error) {
	base, err := objectBase(spec, "Extend")
	if err != nil {
		return nil, err
	}
	ext, err := normalize(extra)
	if err != nil || ext.kind != KindObject {
		return nil, fmt.Errorf("Extend needs an object to extend with")
	}
	keys := append([]string{}, base.objKeys...)
	children := map[string]*node{}
	for k, cn := range base.objChildren {
		children[k] = cn
	}
	for _, k := range ext.objKeys {
		if _, has := children[k]; !has {
			keys = append(keys, k)
		}
		children[k] = ext.objChildren[k]
	}
	return objectNode(base, keys, children), nil
}

// algebraNode wraps a result for the builder API, where a construction fault
// surfaces at validation as it does for any other bad spec.
func algebraNode(n *node, err error) *Node {
	if err != nil {
		return newNodeWrap(&node{kind: KindNever, faultMsg: err.Error()})
	}
	return newNodeWrap(n)
}

// Pick keeps only the named properties of an object shape. names is a string
// or a list of strings. The result is a new node; the source is unchanged.
func Pick(names any, spec ...any) *Node {
	return algebraNode(pickNode(names, spec))
}

// Pick (chained): returns a new node, leaving the receiver as it was.
func (n *Node) Pick(names any) *Node {
	return Pick(names, n)
}

// Omit drops the named properties of an object shape. names is a string or a
// list of strings. The result is a new node; the source is unchanged.
func Omit(names any, spec ...any) *Node {
	return algebraNode(omitNode(names, spec))
}

// Omit (chained): returns a new node, leaving the receiver as it was.
func (n *Node) Omit(names any) *Node {
	return Omit(names, n)
}

// Partial makes every declared property of an object shape optional. The
// result is a new node; the source is unchanged.
func Partial(spec ...any) *Node {
	return algebraNode(partialNode(spec))
}

// Partial (chained): returns a new node, leaving the receiver as it was.
func (n *Node) Partial() *Node {
	return Partial(n)
}

// Extend adds the properties of extra, an object shape, to an object shape.
// The result is a new node; the source is unchanged.
func Extend(extra any, spec ...any) *Node {
	return algebraNode(extendNode(extra, spec))
}

// Extend (chained): returns a new node, leaving the receiver as it was.
func (n *Node) Extend(extra any) *Node {
	return Extend(extra, n)
}

// G-prefixed aliases, for a dot-import alongside other packages.
func GPick(names any, spec ...any) *Node   { return Pick(names, spec...) }
func GOmit(names any, spec ...any) *Node   { return Omit(names, spec...) }
func GPartial(spec ...any) *Node           { return Partial(spec...) }
func GExtend(extra any, spec ...any) *Node { return Extend(extra, spec...) }

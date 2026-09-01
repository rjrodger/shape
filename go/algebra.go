package shape

// Object algebra: Pick, Omit, Partial, Extend. Each returns a new object node;
// the shape given is left as it was, and the children kept are shared with it.

// objectCopy returns a copy of a node with its own children map, key order,
// checks and metadata, so that one can change without the other.
func objectCopy(n *node) *node {
	cp := *n
	cp.objChildren = make(map[string]*node, len(n.objChildren))
	for k, c := range n.objChildren {
		cp.objChildren[k] = c
	}
	cp.objKeys = append([]string{}, n.objKeys...)
	cp.befores = append([]validator{}, n.befores...)
	cp.afters = append([]validator{}, n.afters...)
	if n.meta != nil {
		cp.meta = make(map[string]any, len(n.meta))
		for k, v := range n.meta {
			cp.meta[k] = v
		}
	}
	return &cp
}

// objectFault is the node a non-object shape yields: as for any other bad
// spec, the fault surfaces at validation.
func objectFault(name string) *Node {
	return newNodeWrap(&node{kind: KindNever, faultMsg: name + " needs an object shape"})
}

func specNode(spec []any) *Node {
	if len(spec) == 0 {
		return buildize(nil)
	}
	return buildize(spec[0])
}

// Pick keeps only the named properties.
func Pick(names []string, spec ...any) *Node { return specNode(spec).Pick(names) }

// Pick (chained).
func (n *Node) Pick(names []string) *Node {
	if n.n.kind != KindObject {
		return objectFault("Pick")
	}
	want := map[string]bool{}
	for _, k := range names {
		want[k] = true
	}
	cp := objectCopy(n.n)
	cp.objChildren, cp.objKeys = map[string]*node{}, nil
	for _, k := range n.n.objKeys {
		if want[k] {
			cp.objChildren[k] = n.n.objChildren[k]
			cp.objKeys = append(cp.objKeys, k)
		}
	}
	return newNodeWrap(cp)
}

// Omit drops the named properties.
func Omit(names []string, spec ...any) *Node { return specNode(spec).Omit(names) }

// Omit (chained).
func (n *Node) Omit(names []string) *Node {
	if n.n.kind != KindObject {
		return objectFault("Omit")
	}
	drop := map[string]bool{}
	for _, k := range names {
		drop[k] = true
	}
	cp := objectCopy(n.n)
	cp.objChildren, cp.objKeys = map[string]*node{}, nil
	for _, k := range n.n.objKeys {
		if !drop[k] {
			cp.objChildren[k] = n.n.objChildren[k]
			cp.objKeys = append(cp.objKeys, k)
		}
	}
	return newNodeWrap(cp)
}

// Partial makes every property optional (one level deep).
func Partial(spec ...any) *Node { return specNode(spec).Partial() }

// Partial (chained).
func (n *Node) Partial() *Node {
	if n.n.kind != KindObject {
		return objectFault("Partial")
	}
	cp := objectCopy(n.n)
	for k, c := range n.n.objChildren {
		cc := *c
		cc.required = false
		cc.requiredSet = true
		cp.objChildren[k] = &cc
	}
	return newNodeWrap(cp)
}

// Extend adds the properties of another object shape; a property named by
// both takes the new shape. Whether unknown properties are allowed stays as
// it was.
func Extend(more any, spec ...any) *Node { return specNode(spec).Extend(more) }

// Extend (chained).
func (n *Node) Extend(more any) *Node {
	mn := buildize(more).n
	if n.n.kind != KindObject || mn.kind != KindObject {
		return objectFault("Extend")
	}
	cp := objectCopy(n.n)
	for _, k := range mn.objKeys {
		if _, ok := cp.objChildren[k]; !ok {
			cp.objKeys = append(cp.objKeys, k)
		}
		cp.objChildren[k] = mn.objChildren[k]
	}
	return newNodeWrap(cp)
}

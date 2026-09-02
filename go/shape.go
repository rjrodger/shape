package shape

const Version = "0.3.0"

// Schema is a compiled shape specification.
type Schema struct {
	root *node
	// The Define'd nodes of the tree, collected once so a Refer can resolve
	// them whatever the traversal order (see prepare).
	defs map[string]*node
	// True when no node of the tree has a validator, so a match can run on
	// a pooled context (see matchScratch).
	pure bool
}

// prepare walks a compiled tree once: every object node gets the set of
// keys it accepts, and every Define'd node is collected by name. Both were
// derived on every validation before.
func prepare(n *node, defs map[string]*node) {
	if n == nil {
		return
	}
	if n.defineName != "" {
		defs[n.defineName] = n
	}
	if n.kind == KindObject && n.consumed == nil {
		consumed := make(map[string]bool, len(n.objKeys))
		for _, k := range n.objKeys {
			consumed[k] = true
			cn := n.objChildren[k]
			if cn.renameTo != "" {
				consumed[cn.renameTo] = true
			}
			for _, src := range cn.renameClaim {
				consumed[src] = true
			}
		}
		n.consumed = consumed
		n.objKeysAny = make([]any, len(n.objKeys))
		for i, k := range n.objKeys {
			n.objKeysAny[i] = k
		}
	}
	for _, cn := range n.objChildren {
		prepare(cn, defs)
	}
	prepare(n.objRest, defs)
	for _, cn := range n.arrChildren {
		prepare(cn, defs)
	}
	prepare(n.arrChild, defs)
	prepare(n.arrRest, defs)
	for _, sn := range n.list {
		prepare(sn, defs)
	}
}

// hasValidators reports whether any node of the tree has a before or after.
func hasValidators(n *node) bool {
	if n == nil {
		return false
	}
	if len(n.befores) > 0 || len(n.afters) > 0 {
		return true
	}
	for _, cn := range n.objChildren {
		if hasValidators(cn) {
			return true
		}
	}
	for _, cn := range n.arrChildren {
		if hasValidators(cn) {
			return true
		}
	}
	for _, sn := range n.list {
		if hasValidators(sn) {
			return true
		}
	}
	return hasValidators(n.objRest) || hasValidators(n.arrChild) || hasValidators(n.arrRest)
}

// Shape compiles a schema-by-example specification with default options.
// Note: keyexpr is enabled by default — keys like "x: Min(1)" are parsed.
func Shape(spec any) (*Schema, error) {
	return ShapeWith(spec, ShapeOptions{})
}

// ShapeWith compiles a schema-by-example specification with the given options.
func ShapeWith(spec any, opts ShapeOptions) (*Schema, error) {
	n, err := normalizeWith(spec, opts)
	if err != nil {
		return nil, err
	}
	defs := map[string]*node{}
	prepare(n, defs)
	return &Schema{root: n, defs: defs, pure: !hasValidators(n)}, nil
}

// MustShape compiles a schema and panics if invalid.
func MustShape(spec any) *Schema {
	s, err := Shape(spec)
	if err != nil {
		panic(err)
	}
	return s
}

// MustShapeWith is ShapeWith that panics on error.
func MustShapeWith(spec any, opts ShapeOptions) *Schema {
	s, err := ShapeWith(spec, opts)
	if err != nil {
		panic(err)
	}
	return s
}

// Validate validates and normalizes input. Returns the produced (defaults
// injected) value plus a *ValidationError if any errors occurred.
func (s *Schema) Validate(input any) (any, error) {
	return s.ValidateCtx(input, nil)
}

// ValidateCtx is Validate with an explicit Context (custom validators may use it).
func (s *Schema) ValidateCtx(input any, ctx *Context) (any, error) {
	if s == nil || s.root == nil {
		return nil, nil
	}
	verr := &ValidationError{}
	var c *Context
	var path []string
	var pathArr []any
	var cs *callScratch
	if ctx == nil && s.pure {
		cs = callPool.Get().(*callScratch)
		c, path, pathArr = cs.begin(s.defs, false)
	} else {
		c = newContext(ctx)
		c.Match = false
		c.defs = s.defs
		c.pure = s.pure
		path, pathArr = c.start()
	}

	var out any
	if isIgnore(s.root) {
		// Ignore at the root drops a value that does not validate, exactly as
		// it does for an object property. Without this the failing value was
		// handed back unchanged.
		out, _ = validateIgnored(s.root, rootInput(input), path, pathArr, "", nil, c, false)
	} else {
		out = validateNode(s.root, rootInput(input), path, pathArr, "", nil, c, false, verr)
	}

	if cs != nil {
		cs.release()
	}
	if ctx != nil {
		ctx.Err = append(ctx.Err, verr.Issues...)
	}
	if verr.hasAny() {
		return out, verr
	}
	return out, nil
}

// Match reports whether input satisfies the schema, without mutating input or
// returning errors. Mirrors TS .match().
func (s *Schema) Match(input any) bool {
	if s == nil || s.root == nil {
		return true
	}
	if s.pure {
		cs := callPool.Get().(*callScratch)
		c, path, pathArr := cs.begin(s.defs, true)
		verr := cs.matchErrors()
		validateNode(s.root, rootInput(input), path, pathArr, "", nil, c, true, verr)
		ok := !verr.hasAny()
		cs.release()
		return ok
	}
	c := newContext(nil)
	c.Match = true
	c.defs = s.defs
	c.pure = s.pure
	path, pathArr := c.start()
	verr := &ValidationError{}
	validateNode(s.root, rootInput(input), path, pathArr, "", nil, c, true, verr)
	return !verr.hasAny()
}

// Valid is an alias of Match retained for API parity. Mirrors TS .valid().
func (s *Schema) Valid(input any) bool {
	return s.Match(input)
}

// Error returns the FieldErrors produced by validating input. Returns nil if
// the input is valid.
func (s *Schema) Error(input any) []FieldError {
	if s == nil || s.root == nil {
		return nil
	}
	verr := &ValidationError{}
	if s.pure {
		cs := callPool.Get().(*callScratch)
		c, path, pathArr := cs.begin(s.defs, false)
		validateNode(s.root, rootInput(input), path, pathArr, "", nil, c, false, verr)
		cs.release()
		return verr.Issues
	}
	c := newContext(nil)
	c.defs = s.defs
	c.pure = s.pure
	path, pathArr := c.start()
	validateNode(s.root, rootInput(input), path, pathArr, "", nil, c, false, verr)
	return verr.Issues
}

// Spec returns a structural representation of the compiled schema.
func (s *Schema) Spec() any {
	if s == nil || s.root == nil {
		return nil
	}
	return nodeSpec(s.root)
}

// Node returns the underlying root node for advanced introspection.
func (s *Schema) Node() *node {
	if s == nil {
		return nil
	}
	return s.root
}

// String renders a debug representation of the schema.
func (s *Schema) String() string {
	if s == nil || s.root == nil {
		return ""
	}
	return stringifyNode(s.root, false)
}

// IsShape reports whether v is a *Schema produced by this package.
func IsShape(v any) bool {
	_, ok := v.(*Schema)
	return ok
}

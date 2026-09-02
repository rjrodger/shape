package shape

// Context flows through validation. Custom validators may read/write Custom
// for cross-property state, and Refs is used by Define/Refer.
type Context struct {
	Err    []FieldError
	Custom map[string]any
	Refs   map[string]*node
	Match  bool
	// Rename bookkeeping (parity with TS s.ctx.Rename)
	rename map[string]renameInfo
	// The compiled schema's Define'd nodes, read when Refs has no entry.
	defs map[string]*node
	// The per-node validator states of the current call, allocated in
	// chunks rather than one at a time (see newState).
	states []State
}

// newState hands out the State for one node from a chunk, so a walk over
// many nodes allocates a few chunks instead of a State each. A State is
// only ever used during the call it was made for.
func (c *Context) newState() *State {
	if len(c.states) == cap(c.states) {
		c.states = make([]State, 0, 8)
	}
	c.states = c.states[:len(c.states)+1]
	return &c.states[len(c.states)-1]
}

// scratch is one allocation per call holding what a walk over a typical
// tree needs: the path stacks, with room for the per-key appends, and the
// first chunk of states.
type scratch struct {
	path    [8]string
	pathArr [8]any
	states  [8]State
}

// start readies a context for a call: the scratch space is fresh, so no
// State or path from an earlier call is reused.
func (c *Context) start() (path []string, pathArr []any) {
	sc := &scratch{}
	c.states = sc.states[:0]
	return sc.path[:0], sc.pathArr[:0]
}

type renameInfo struct {
	fromDflt bool
	key      string
	dval     any
	node     *node
}

func newContext(in *Context) *Context {
	// Refs is made when a Define first needs it (see builders.go).
	if in == nil {
		return &Context{Custom: map[string]any{}}
	}
	if in.Custom == nil {
		in.Custom = map[string]any{}
	}
	return in
}

// State is passed to custom validators and tracks the current validation cursor.
type State struct {
	Path    []string // path stack from root; current key at end
	PathArr []any    // path as array: array indices as ints, object keys as strings
	Key     string   // immediate key/index name
	Value   any      // current value being validated
	Node    *node    // current node
	Parent  any      // parent map/slice (for Rename and similar)
	Match   bool     // true when invoked via .Match (no mutation, no error report)
	Ctx     *Context // user/custom context
	curErr  []FieldError
	// absent is true when the value is missing (JS undefined) rather than an
	// explicit null. It distinguishes a missing key (required error, rendered as
	// "undefined") from a present null (a type error), mirroring TS.
	absent bool
	// checkName is the name of the validator currently running (TS s.check.name),
	// used to render `check "<name>" failed` for checks with no custom text.
	checkName string
}

// Update is the bag a custom validator fills in to influence validation.
type Update struct {
	Done    bool   // stop running further checks
	Why     string // why code on failure
	Mark    int    // numeric mark on failure
	Err     any    // string, FieldError, or []FieldError
	Val     any    // replacement value
	HasVal  bool   // true if Val should override
	Node    *node  // override node (used by Refer)
	Replace bool   // (compat marker, not currently consulted)
}

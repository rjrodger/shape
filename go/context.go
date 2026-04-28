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
}

type renameInfo struct {
	fromDflt bool
	key      string
	dval     any
	node     *node
}

func newContext(in *Context) *Context {
	if in == nil {
		return &Context{
			Custom: map[string]any{},
			Refs:   map[string]*node{},
			rename: map[string]renameInfo{},
		}
	}
	if in.Custom == nil {
		in.Custom = map[string]any{}
	}
	if in.Refs == nil {
		in.Refs = map[string]*node{}
	}
	if in.rename == nil {
		in.rename = map[string]renameInfo{}
	}
	return in
}

// State is passed to custom validators and tracks the current validation cursor.
type State struct {
	Path   []string // path stack from root; current key at end
	Key    string   // immediate key/index name
	Value  any      // current value being validated
	Node   *node    // current node
	Parent any      // parent map/slice (for Rename and similar)
	Match  bool     // true when invoked via .Match (no mutation, no error report)
	Ctx    *Context // user/custom context
	curErr []FieldError
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

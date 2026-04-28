package shape

// listMode controls how a composition node (One/Some/All) evaluates its branches.
type listMode int

const (
	listNone listMode = iota
	listOne
	listSome
	listAll
)

// node is the internal validation tree node. Public *Node alias provides
// chainable builder methods.
type node struct {
	kind Kind

	required    bool
	requiredSet bool
	open        bool
	openSet    bool
	skippable   bool // p in TS: optional and no default-injection
	silent      bool // e=false in TS: drop errors raised on or below this node
	empty       bool // empty string allowed
	hasDefault  bool

	defaultValue any   // injected on missing optional property
	literal      any   // declarative value (used by Exact match-from-default)
	hasLiteral   bool

	// Object children (preserved-order for ergonomic introspection).
	objChildren map[string]*node
	objKeys     []string
	objRest     *node // open-object child shape (Open / Child / Rest)

	// Array children. arrChildren is a tuple; arrChild is a repeating shape.
	arrChildren []*node
	arrChild    *node
	arrRest     *node // Rest builder appended to arrays

	// Validators run before/after the structural type check.
	befores []validator
	afters  []validator

	// Custom Fault message overrides default error text.
	faultMsg string

	// Composition: if listMode != listNone, branches define alternate shapes.
	listMode listMode
	list     []*node

	// Exact value match.
	exactVals []any
	hasExact  bool

	// Define / Refer name (also stored on validator closures via befores).
	defineName string
	referName  string
	referFill  bool

	// Rename info.
	renameTo   string
	renameKeep bool
	renameClaim []string

	// Skip / Ignore flags drive optionality and silent behaviour.
	// Already covered by skippable + silent.

	// meta carries free-form metadata attached via "x$$" sidecar keys when
	// MetaOptions.Active is true.
	meta map[string]any
}

// Node is the publicly exposed compiled-spec wrapper. Builders return *Node so
// users can chain (e.g. shape.Min(2, shape.String).Required()).
type Node struct {
	n *node
}

func newNodeWrap(n *node) *Node { return &Node{n: n} }

// Inner exposes the underlying private node for advanced introspection.
func (n *Node) Inner() *node { return n.n }

// Kind returns the underlying type kind.
func (n *Node) Kind() Kind { return n.n.kind }

// validator is a custom check attached to a node.
type validator struct {
	name string
	fn   func(val any, update *Update, state *State) bool
	args []any
	// stringify renders the validator into its TS-style ".Name(args)" suffix.
	stringify func() string
}

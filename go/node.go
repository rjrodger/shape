package shape

import "regexp"

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
	// kindSet marks a kind the spec named (a type token, Type, Any), as
	// against one a value implied: a key expression's example keeps the
	// named kind and supplies the default alone.
	kindSet bool
	open        bool
	openSet    bool
	skippable   bool // p in TS: optional and no default-injection
	silent      bool // e=false in TS: drop errors raised on or below this node
	empty       bool // empty string allowed
	nullable    bool // an explicit null is accepted as the value
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

	// Compiled pattern for a KindRegexp node (a bare /re/ in the string DSL).
	regexpVal *regexp.Regexp
	// The pattern as written, in the shared subset: what renders and exports.
	regexpSrc string

	// Custom Fault message overrides default error text.
	faultMsg string
	// argFault marks a node a builder made when its argument was wrong, as
	// against a deliberate Fault: the string form refuses the former.
	argFault bool

	// Composition: if listMode != listNone, branches define alternate shapes.
	listMode listMode
	list     []*node
	disc     *discriminated // a Discriminated union chooses among list by tag

	// Exact value match.
	exactVals []any
	hasExact  bool

	// The keys an object node accepts (its declared keys, rename targets and
	// claim sources), computed once when the schema is compiled, and the
	// declared keys boxed once for the path array (boxing a string
	// allocates, and it happened per key per call).
	consumed   map[string]bool
	objKeysAny []any

	// Define / Refer name (also stored on validator closures via befores).
	defineName  string
	referName   string
	referFill   bool
	referStrict bool

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
	// inner holds the checks an isolating builder (Catch, Transform) took
	// inside, so that an export can still see them.
	inner *inner
}

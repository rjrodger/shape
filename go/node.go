package shape

import "regexp"

// listMode controls how a composition node (All/Nof/When) evaluates its
// branches.
type listMode int

const (
	listNone listMode = iota
	listAll
	listNof
	// When: the list is the condition, then the two shapes it picks from.
	listWhen
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
	// defaultNull marks an explicit null default (Default(nil, ...)): a nil
	// default is otherwise the zero of a kind that has none, which TS has no
	// default for at all.
	defaultNull bool

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

	// A Nof composition's count: a whole number (nofExact), or a shape the
	// number of satisfied branches must satisfy (nofCount, nil for a whole
	// number), the counts it admits, from none of the branches to all, and
	// whether it admits exactly one and nothing else (nofOne), when the
	// branch that matched produces the value.
	nofExact float64
	nofCount *node
	nofOK    []bool
	nofOne   bool

	// Exact value match.
	exactVals []any
	hasExact  bool

	// The keys an object node accepts (its declared keys; not a rename's
	// target, nor a claim's key until a claim takes it), computed once when
	// the schema is compiled, and the declared keys boxed once for the path
	// array (boxing a string allocates, and it happened per key per call).
	consumed   map[string]bool
	objKeysAny []any
	// claims marks an object a child or the rest shape of which claims
	// keys with a Rename, or can through a Refer (see referClaims): which
	// keys it does not accept is known once its children have run.
	claims bool
	// The declared children in objKeys order, and the keys objChildren
	// holds that objKeys does not (none in a tree the builders make, so
	// the walk no longer ranges over the map to look for them). Computed
	// with consumed.
	objChildList []*node
	objExtra     []string
	// plain marks a String, Number, Boolean or Integer node with nothing
	// but its kind's check to apply: no validator, rename or silence, and
	// no composition. A present value of the kind is judged in its
	// parent's loop, without a State (the mirror of the TypeScript inline
	// leaf and the Rust plain flag). Computed whenever the tree is
	// prepared, since a validator may be attached late.
	plain bool

	// Define / Refer name (also stored on validator closures via befores).
	defineName  string
	referName   string
	referFill   bool
	referStrict bool

	// The node's Renames, in the order they were given: TS attaches each
	// as checks of its own, so every one applies (see renameOp). A list
	// that changes is made anew, as nodes share it.
	renames []renameOp

	// Skip / Ignore flags drive optionality and silent behaviour.
	// Already covered by skippable + silent.

	// meta carries free-form metadata attached via "x$$" sidecar keys when
	// MetaOptions.Active is true.
	meta map[string]any
}

// renameOp is one Rename: the name the value goes to, whether the key
// keeps it, and the keys it claims while the value is absent. at is where
// it stands among the node's befores, as TS attaches it as a check: after
// the checks the renamed shape had, and the ones a later builder put ahead
// of them (Coerce). Its claim runs there, and json writes it there.
type renameOp struct {
	to    string
	keep  bool
	claim []string
	at    int
}

// claimsKeys reports whether any of the node's Renames claims keys.
func (n *node) claimsKeys() bool {
	for i := range n.renames {
		if len(n.renames[i].claim) > 0 {
			return true
		}
	}
	return false
}

// movedRenames is the node's Renames with each place moved by f, as a new
// list, so that a node sharing the old one keeps it.
func movedRenames(rs []renameOp, f func(int) int) []renameOp {
	out := make([]renameOp, len(rs))
	for i, r := range rs {
		r.at = f(r.at)
		out[i] = r
	}
	return out
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
	// user marks a function the caller supplied (Check, Before, After,
	// Transform): it may keep what it is handed, so a call that runs one
	// reuses nothing across nodes or calls. The library's own validators
	// keep nothing.
	user bool
	// stringify renders the validator into its TS-style ".Name(args)" suffix.
	stringify func() string
	// inner holds the checks an isolating builder (Catch, Transform) took
	// inside, so that an export can still see them.
	inner *inner
	// nodes are the shapes the check puts values to itself (Contains: the
	// shape of the items it counts), walked as part of the tree.
	nodes []*node
}

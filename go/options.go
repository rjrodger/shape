package shape

// ShapeOptions configures schema compilation. Mirrors TS ShapeOptions.
//
// Defaults:
//   - KeyExpr.Active   = true   (interpret object keys like "x: Min(1)")
//   - Meta.Active      = false  (sidecar metadata via "x$$" keys)
//   - Meta.Suffix      = "$$"
//   - ValExpr.Active   = false  (string values become builder expressions)
//   - ValExpr.KeyMark  = "$$"
//   - Trials           = 100000
type ShapeOptions struct {
	KeyExpr KeyExprOptions
	Meta    MetaOptions
	ValExpr ValExprOptions
	// Trials is the trials one validation may run: each shape a Nof tries,
	// each When condition and each item a Contains counts takes one. Zero
	// or less is the default, 100000.
	Trials int
}

// KeyExprOptions controls key-expression parsing.
type KeyExprOptions struct {
	// Disable turns key-expression parsing off (default is on).
	Disable bool
}

// MetaOptions controls metadata sidecar keys (e.g. "x$$" providing meta for "x").
type MetaOptions struct {
	Active bool
	Suffix string // default "$$"
}

// ValExprOptions controls value-as-expression parsing.
type ValExprOptions struct {
	Active  bool
	KeyMark string // default "$$"
}

// defaultTrials is the trials one validation may run, unless its options
// say otherwise.
const defaultTrials = 100000

// trials is the budget of trials each validation has (see trial).
func (o ShapeOptions) trials() int {
	if o.Trials > 0 {
		return o.Trials
	}
	return defaultTrials
}

func (o ShapeOptions) keyExprActive() bool { return !o.KeyExpr.Disable }
func (o ShapeOptions) metaActive() bool    { return o.Meta.Active }
func (o ShapeOptions) metaSuffix() string {
	if o.Meta.Suffix == "" {
		return "$$"
	}
	return o.Meta.Suffix
}
func (o ShapeOptions) valExprActive() bool { return o.ValExpr.Active }
func (o ShapeOptions) valExprMark() string {
	if o.ValExpr.KeyMark == "" {
		return o.metaSuffix()
	}
	return o.ValExpr.KeyMark
}

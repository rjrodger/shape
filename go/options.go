package shape

// ShapeOptions configures schema compilation. Mirrors TS ShapeOptions.
//
// Defaults:
//   - KeyExpr.Active   = true   (interpret object keys like "x: Min(1)")
//   - Meta.Active      = false  (sidecar metadata via "x$$" keys)
//   - Meta.Suffix      = "$$"
//   - ValExpr.Active   = false  (string values become builder expressions)
//   - ValExpr.KeyMark  = "$$"
type ShapeOptions struct {
	KeyExpr KeyExprOptions
	Meta    MetaOptions
	ValExpr ValExprOptions
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

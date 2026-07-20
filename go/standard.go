package shape

// Standard Schema V1 interoperability (https://standardschema.dev/).
//
// The Standard Schema spec is a JavaScript/TypeScript convention: a schema
// exposes a "~standard" property so any tool can consume it. Go can't expose
// that JS property, so Shape provides the equivalent surface via Standard():
// a version, a vendor, and a non-throwing Validate that returns either the
// produced value or a list of issues (never both) — mirroring the TS
// `Shape(...)['~standard']` object.

// StandardSchema is the Standard Schema V1-style interface for a compiled shape.
type StandardSchema struct {
	Version  int                            // always 1
	Vendor   string                         // always "shape"
	Validate func(input any) StandardResult // non-throwing validation
}

// StandardResult is the outcome of StandardSchema.Validate: on success Value is
// set and Issues is empty; on failure Issues is populated. Mirrors the TS
// `~standard.validate()` result.
type StandardResult struct {
	Value  any             // produced value (defaults injected) when Issues is empty
	Issues []StandardIssue // validation problems; empty on success
}

// StandardIssue mirrors a Standard Schema V1 issue: a human-readable message and
// the path to the offending value (array indices as ints, object keys as
// strings, matching FieldError.PathArr).
type StandardIssue struct {
	Message string
	Path    []any
}

// Standard returns the Standard Schema V1-style interface for this schema. The
// returned Validate never panics; it reports failures as issues.
func (s *Schema) Standard() StandardSchema {
	return StandardSchema{
		Version: 1,
		Vendor:  "shape",
		Validate: func(input any) StandardResult {
			out, err := s.Validate(input)
			if verr, ok := err.(*ValidationError); ok && verr.hasAny() {
				issues := make([]StandardIssue, len(verr.Issues))
				for i, e := range verr.Issues {
					issues[i] = StandardIssue{Message: e.Text, Path: e.PathArr}
				}
				return StandardResult{Issues: issues}
			}
			return StandardResult{Value: out}
		},
	}
}

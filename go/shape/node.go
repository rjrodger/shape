package shape

type node struct {
	kind Kind

	required bool
	open     bool

	defaultValue any

	objChildren map[string]*node
	arrChild    *node
}

type wrappedSpec struct {
	spec     any
	required *bool
	open     *bool
}

// Required marks a schema fragment as required.
func Required(spec any) any {
	v := true
	return wrappedSpec{spec: spec, required: &v}
}

// Optional marks a schema fragment as optional.
func Optional(spec any) any {
	v := false
	return wrappedSpec{spec: spec, required: &v}
}

// Open allows additional properties on object schemas.
func Open(spec any) any {
	v := true
	return wrappedSpec{spec: spec, open: &v}
}

// Closed forbids additional properties on object schemas.
func Closed(spec any) any {
	v := false
	return wrappedSpec{spec: spec, open: &v}
}

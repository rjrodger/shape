package shape

// Kind identifies a normalized schema/value kind.
type Kind string

const (
	KindAny     Kind = "any"
	KindString  Kind = "string"
	KindNumber  Kind = "number"
	KindBoolean Kind = "boolean"
	KindObject  Kind = "object"
	KindArray   Kind = "array"
	KindNull    Kind = "null"
)

// TypeToken marks a required type in schema-by-example maps.
type TypeToken struct {
	kind Kind
}

func (t TypeToken) Kind() Kind { return t.kind }

// Sentinel tokens for required fields (TS constructor-literal equivalent).
var (
	Any     = TypeToken{kind: KindAny}
	String  = TypeToken{kind: KindString}
	Number  = TypeToken{kind: KindNumber}
	Boolean = TypeToken{kind: KindBoolean}
	Object  = TypeToken{kind: KindObject}
	Array   = TypeToken{kind: KindArray}
)

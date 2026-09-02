package shape

import (
	"encoding/json"
	"reflect"
	"strings"
	"time"
	"unsafe"
)

// Structs. The validator works on the JSON-shaped values that map[string]any
// and []any describe, as the TypeScript implementation works on plain
// objects; a struct is read into that model on the way in, and can be
// filled from the produced value on the way out. Nothing here changes what
// a shape accepts, so parity with TypeScript is unaffected: a struct and the
// map it reads as validate identically.
//
// A field is named by its `json` tag, or its own name without one; a tag of
// "-" hides it, and "omitempty" makes a zero value absent (so a default
// fills it) rather than present. An embedded struct's fields are promoted,
// as encoding/json promotes them. Unexported fields are not read.
//
// A struct is also a spec, by example: each field's value is its default,
// and a `shape` tag holds a key expression applied to it, so
//
//	type Config struct {
//	    Host string `shape:"Min(1)"`         // a non-empty string, default ""
//	    Port int    `shape:"Min(1).Max(65535)"`
//	    Debug bool  `shape:"Boolean"`        // required
//	}
//
// reads as {"Host: Min(1)": "", "Port: Min(1).Max(65535)": 0, "Debug: Boolean": false}.

// ValidateInto validates input and fills out, a pointer to a struct (or to
// any value encoding/json can decode into), with the produced value.
func (s *Schema) ValidateInto(input any, out any) error {
	produced, err := s.Validate(input)
	if err != nil {
		return err
	}
	b, err := json.Marshal(produced)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}

// objectValue reads a value as the map the object walk works on: a map with
// string keys of any value type, or a struct, or a pointer to either.
func objectValue(v any) (map[string]any, bool) {
	if m, ok := v.(map[string]any); ok {
		return m, true
	}
	rv := reflect.ValueOf(v)
	if rv.Kind() == reflect.Pointer {
		if rv.IsNil() {
			return nil, false
		}
		rv = rv.Elem()
	}
	switch rv.Kind() {
	case reflect.Struct:
		if _, isTime := rv.Interface().(time.Time); isTime {
			return nil, false
		}
		return structFields(addressable(rv), false), true
	case reflect.Map:
		if rv.Type().Key().Kind() != reflect.String {
			return nil, false
		}
		out := make(map[string]any, rv.Len())
		iter := rv.MapRange()
		for iter.Next() {
			out[iter.Key().String()] = valueOf(iter.Value(), false)
		}
		return out, true
	}
	return nil, false
}

// structFields reads a struct's exported fields into a map. As a spec, a
// `shape` tag becomes the field's key expression and omitempty is ignored,
// since a spec field is a default whether or not it is zero.
func structFields(rv reflect.Value, spec bool) map[string]any {
	out := map[string]any{}
	rt := rv.Type()
	for i := 0; i < rt.NumField(); i++ {
		f := rt.Field(i)
		fv := rv.Field(i)
		name, omitEmpty := jsonName(f)
		_, named := f.Tag.Lookup("json")
		embedded := f.Anonymous && fv.Kind() == reflect.Struct
		if !f.IsExported() && !embedded {
			continue
		}
		if embedded {
			fv = readable(fv)
		}
		if embedded && !named {
			// An embedded struct's fields are promoted (its own name is not
			// a key), unless a json tag names it as a field of its own.
			for k, v := range structFields(fv, spec) {
				out[k] = v
			}
			continue
		}
		if name == "-" {
			continue
		}
		if !spec && omitEmpty && fv.IsZero() {
			continue
		}
		if expr, ok := f.Tag.Lookup("shape"); ok && spec && expr != "" {
			name = name + ": " + expr
		}
		out[name] = valueOf(fv, spec)
	}
	return out
}

// addressable returns rv, or a copy of it that can be addressed, so that an
// embedded struct of an unexported type can be read (see readable).
func addressable(rv reflect.Value) reflect.Value {
	if rv.CanAddr() {
		return rv
	}
	nv := reflect.New(rv.Type()).Elem()
	nv.Set(rv)
	return nv
}

// readable returns fv as a value whose exported fields can be read even
// when fv itself was reached through an embedded struct of an unexported
// type, which reflect otherwise refuses; encoding/json promotes such
// fields, and so does this.
func readable(fv reflect.Value) reflect.Value {
	if fv.CanInterface() {
		return fv
	}
	return reflect.NewAt(fv.Type(), unsafe.Pointer(fv.UnsafeAddr())).Elem()
}

// jsonName is the name encoding/json would use for a field, and whether it
// carries omitempty.
func jsonName(f reflect.StructField) (string, bool) {
	tag, ok := f.Tag.Lookup("json")
	if !ok {
		return f.Name, false
	}
	name, opts, _ := strings.Cut(tag, ",")
	if name == "" {
		name = f.Name
	}
	return name, strings.Contains(","+opts+",", ",omitempty,")
}

// valueOf converts a reflected value into the JSON-shaped model: structs to
// maps (read as specs when spec is set), slices to []any, string-keyed maps
// to map[string]any, pointers followed (a nil one is a present null), and
// time.Time kept as it is.
func valueOf(rv reflect.Value, spec bool) any {
	switch rv.Kind() {
	case reflect.Interface, reflect.Pointer:
		if rv.IsNil() {
			return nil
		}
		return valueOf(rv.Elem(), spec)
	case reflect.Struct:
		if t, ok := rv.Interface().(time.Time); ok {
			return t
		}
		return structFields(addressable(rv), spec)
	case reflect.Slice, reflect.Array:
		if rv.Kind() == reflect.Slice && rv.IsNil() {
			return nil
		}
		out := make([]any, rv.Len())
		for i := range out {
			out[i] = valueOf(rv.Index(i), spec)
		}
		return out
	case reflect.Map:
		if rv.Type().Key().Kind() != reflect.String {
			return rv.Interface()
		}
		if rv.IsNil() {
			return nil
		}
		out := make(map[string]any, rv.Len())
		iter := rv.MapRange()
		for iter.Next() {
			out[iter.Key().String()] = valueOf(iter.Value(), spec)
		}
		return out
	}
	return rv.Interface()
}

// structSpec reads a struct value as a spec, if it is one.
func structSpec(spec any) (map[string]any, bool) {
	rv := reflect.ValueOf(spec)
	if rv.Kind() == reflect.Pointer && !rv.IsNil() {
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return nil, false
	}
	if _, isTime := rv.Interface().(time.Time); isTime {
		return nil, false
	}
	return structFields(addressable(rv), true), true
}

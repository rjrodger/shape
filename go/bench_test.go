package shape

import "testing"

// Benchmarks of the validation paths on the benchmark suite's flat and
// nested cases, with allocation counts: the performance plan's done
// conditions read these (go test -bench . -benchmem -run xxx).

var benchFlat = map[string]any{"id": Integer, "name": String, "email": String, "active": Boolean, "score": Number}
var benchFlatIn = map[string]any{"id": 1.0, "name": "Alice", "email": "alice@example.com", "active": true, "score": 42.5}

var benchNested = map[string]any{
	"id": Integer, "name": String,
	"address":  map[string]any{"street": String, "city": String, "zip": String},
	"tags":     []any{String},
	"settings": map[string]any{"theme": String, "notifications": Boolean},
}
var benchNestedIn = map[string]any{
	"id": 7.0, "name": "Bob",
	"address":  map[string]any{"street": "1 Main St", "city": "Springfield", "zip": "12345"},
	"tags":     []any{"a", "b", "c"},
	"settings": map[string]any{"theme": "dark", "notifications": true},
}
var benchInvalidIn = map[string]any{
	"id": "seven", "name": "Bob",
	"address":  map[string]any{"street": "1 Main St", "city": "Springfield", "zip": 12345.0},
	"tags":     []any{"a", "b", "c"},
	"settings": map[string]any{"theme": "dark", "notifications": true},
}

// The large case: fifty keys cycling through the four primitive kinds, as
// the benchmark suite generates it.
var benchLarge, benchLargeIn = func() (map[string]any, map[string]any) {
	spec := map[string]any{}
	in := map[string]any{}
	kinds := []any{String, Integer, Boolean, Number}
	for i := 0; i < 50; i++ {
		k := "k" + string(rune('0'+i/10)) + string(rune('0'+i%10))
		spec[k] = kinds[i%4]
		in[k] = []any{"v", float64(i), i%8 == 0, float64(i) * 0.5}[i%4]
	}
	return spec, in
}()

func benchValid(b *testing.B, spec, in any) {
	s := MustShape(spec)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.Valid(in)
	}
}

func benchValidate(b *testing.B, spec, in any) {
	s := MustShape(spec)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.Validate(in)
	}
}

func BenchmarkValidFlat(b *testing.B)      { benchValid(b, benchFlat, benchFlatIn) }
func BenchmarkValidNested(b *testing.B)    { benchValid(b, benchNested, benchNestedIn) }
func BenchmarkValidateFlat(b *testing.B)   { benchValidate(b, benchFlat, benchFlatIn) }
func BenchmarkValidateNested(b *testing.B) { benchValidate(b, benchNested, benchNestedIn) }
func BenchmarkValidLarge(b *testing.B)     { benchValid(b, benchLarge, benchLargeIn) }
func BenchmarkValidateLarge(b *testing.B)  { benchValidate(b, benchLarge, benchLargeIn) }

func BenchmarkValidInvalid(b *testing.B) { benchValid(b, benchNested, benchInvalidIn) }

func BenchmarkErrorInvalid(b *testing.B) {
	s := MustShape(benchNested)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.Error(benchInvalidIn)
	}
}

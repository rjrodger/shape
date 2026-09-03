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

// The bounds case, with a valid input and one failing two bounds, and the
// array case of fifty small objects: the validator and element paths.
var benchBounds = map[string]any{
	"name": Max(40, Min(3, String)), "age": Max(150, Min(0, Integer)),
	"code": MustExpr("/^[A-Z]{3}$/"), "ratio": Max(1, Min(0, Number)),
}
var benchBoundsIn = map[string]any{"name": "Alice", "age": 30.0, "code": "ABC", "ratio": 0.5}
var benchBoundsBad = map[string]any{"name": "Al", "age": 200.0, "code": "ABC", "ratio": 0.5}

var benchArray, benchArrayIn = func() (map[string]any, map[string]any) {
	items := make([]any, 50)
	for i := range items {
		items[i] = map[string]any{"sku": "SKU-" + string(rune('0'+i/10)) + string(rune('0'+i%10)), "qty": float64(i % 7), "price": float64(i) * 1.25}
	}
	return map[string]any{"items": []any{map[string]any{"sku": String, "qty": Integer, "price": Number}}}, map[string]any{"items": items}
}()

func BenchmarkValidBounds(b *testing.B)    { benchValid(b, benchBounds, benchBoundsIn) }
func BenchmarkValidateBounds(b *testing.B) { benchValidate(b, benchBounds, benchBoundsIn) }
func BenchmarkValidBoundsBad(b *testing.B) { benchValid(b, benchBounds, benchBoundsBad) }
func BenchmarkErrorBoundsBad(b *testing.B) {
	s := MustShape(benchBounds)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s.Error(benchBoundsBad)
	}
}
func BenchmarkValidArray(b *testing.B)    { benchValid(b, benchArray, benchArrayIn) }
func BenchmarkValidateArray(b *testing.B) { benchValidate(b, benchArray, benchArrayIn) }

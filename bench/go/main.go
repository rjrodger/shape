// The Go benchmark: shape against go-playground/validator,
// santhosh-tekuri/jsonschema and xeipuuv/gojsonschema on the shared cases
// in bench/cases.json. Prints a JSON document to stdout; the driver
// (bench/run.js) adds the host and source metadata and files the run.
//
// The measurement policy mirrors bench/lib/harness.js: warm up for a fixed
// time, size a batch to take about a millisecond, then time batches for a
// fixed budget and record each batch's mean duration per iteration as one
// sample.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"os"
	"regexp"
	"runtime"
	"runtime/debug"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
	shape "github.com/rjrodger/shape/go"
	"github.com/santhosh-tekuri/jsonschema/v6"
	"github.com/xeipuuv/gojsonschema"
)

type policy struct {
	WarmupMS     int `json:"warmup_ms"`
	TimeMS       int `json:"time_ms"`
	BatchMS      int `json:"batch_ms"`
	MinBatches   int `json:"min_batches"`
	SamplePoints int `json:"sample_points"`
}

type result struct {
	Case       string    `json:"case"`
	Lib        string    `json:"lib"`
	Version    string    `json:"version"`
	Iterations int       `json:"iterations"`
	Batch      int       `json:"batch"`
	Batches    int       `json:"batches"`
	MeanNS     float64   `json:"mean_ns"`
	MedianNS   float64   `json:"median_ns"`
	P05NS      float64   `json:"p05_ns"`
	P95NS      float64   `json:"p95_ns"`
	MinNS      float64   `json:"min_ns"`
	MaxNS      float64   `json:"max_ns"`
	StddevNS   float64   `json:"stddev_ns"`
	OpsPerSec  float64   `json:"ops_per_sec"`
	SamplesNS  []float64 `json:"samples_ns"`
}

type benchCase struct {
	Name        string               `json:"name"`
	Description string               `json:"description"`
	Generate    *struct {
		Items int `json:"items"`
		Keys  int `json:"keys"`
	} `json:"generate"`
	Input       map[string]any       `json:"input"`
	Valid       bool                 `json:"valid"`
	JSONSchema  map[string]any       `json:"jsonSchema"`
}

func envInt(name string, def int) int {
	if v := os.Getenv(name); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

func readPolicy() policy {
	quick := os.Getenv("BENCH_QUICK") == "1"
	warm, budget := 300, 2000
	if quick {
		warm, budget = 50, 100
	}
	return policy{
		WarmupMS:     envInt("BENCH_WARMUP_MS", warm),
		TimeMS:       envInt("BENCH_TIME_MS", budget),
		BatchMS:      1,
		MinBatches:   10,
		SamplePoints: 128,
	}
}

// clockResolution measures the smallest non-zero step time.Now can report.
// Windows reports in steps of about half a millisecond, so a batch must run
// well past one step or its samples are quantised to zero.
func clockResolution() time.Duration {
	best := time.Duration(0)
	for i := 0; i < 32; i++ {
		t0 := time.Now()
		var d time.Duration
		for d == 0 {
			d = time.Since(t0)
		}
		if best == 0 || d < best {
			best = d
		}
	}
	return best
}

func measure(fn func(), pol policy) result {
	warmEnd := time.Now().Add(time.Duration(pol.WarmupMS) * time.Millisecond)
	for warm := 0; time.Now().Before(warmEnd) || warm < 10; warm++ {
		fn()
	}
	// A batch takes at least BatchMS and at least 50 clock steps, so timer
	// quantisation is under 2% of a sample; the calibration itself runs
	// until it has spanned a few clock steps.
	target := time.Duration(pol.BatchMS) * time.Millisecond
	if step := 50 * clockResolution(); step > target {
		target = step
	}
	calls := 0
	t0 := time.Now()
	var elapsed time.Duration
	for elapsed < target/10 || calls < 10 {
		fn()
		calls++
		elapsed = time.Since(t0)
	}
	per := elapsed / time.Duration(calls)
	if per <= 0 {
		per = 1
	}
	batch := int(target / per)
	if batch < 1 {
		batch = 1
	}
	var samples []float64
	iterations := 0
	end := time.Now().Add(time.Duration(pol.TimeMS) * time.Millisecond)
	for time.Now().Before(end) || len(samples) < pol.MinBatches {
		t := time.Now()
		for i := 0; i < batch; i++ {
			fn()
		}
		d := time.Since(t)
		samples = append(samples, float64(d.Nanoseconds())/float64(batch))
		iterations += batch
	}
	return stats(samples, iterations, batch, pol)
}

func round1(x float64) float64 { return math.Round(x*10) / 10 }

func stats(samples []float64, iterations, batch int, pol policy) result {
	sorted := append([]float64(nil), samples...)
	sort.Float64s(sorted)
	n := len(sorted)
	sum := 0.0
	for _, s := range sorted {
		sum += s
	}
	mean := sum / float64(n)
	variance := 0.0
	for _, s := range sorted {
		variance += (s - mean) * (s - mean)
	}
	variance /= float64(n)
	q := func(p float64) float64 {
		i := int(math.Floor(p * float64(n)))
		if i > n-1 {
			i = n - 1
		}
		return sorted[i]
	}
	return result{
		Iterations: iterations,
		Batch:      batch,
		Batches:    n,
		MeanNS:     round1(mean),
		MedianNS:   round1(q(0.5)),
		P05NS:      round1(q(0.05)),
		P95NS:      round1(q(0.95)),
		MinNS:      round1(sorted[0]),
		MaxNS:      round1(sorted[n-1]),
		StddevNS:   round1(math.Sqrt(variance)),
		OpsPerSec:  round1(1e9 / mean),
		SamplesNS:  quantiles(sorted, pol.SamplePoints),
	}
}

func quantiles(sorted []float64, points int) []float64 {
	if len(sorted) <= points {
		out := make([]float64, len(sorted))
		for i, s := range sorted {
			out[i] = round1(s)
		}
		return out
	}
	out := make([]float64, points)
	for i := range out {
		out[i] = round1(sorted[(i*(len(sorted)-1))/(points-1)])
	}
	return out
}

// loadCases reads cases.json as the harness does, expanding generated
// inputs and shared schemas, and hashes the file.
func loadCases(file string) ([]benchCase, string) {
	raw, err := os.ReadFile(file)
	if err != nil {
		fail(err)
	}
	var spec struct {
		Cases []benchCase `json:"cases"`
	}
	if err := json.Unmarshal(raw, &spec); err != nil {
		fail(err)
	}
	byName := map[string]benchCase{}
	for _, c := range spec.Cases {
		byName[c.Name] = c
	}
	for i := range spec.Cases {
		c := &spec.Cases[i]
		if c.Generate != nil && c.Generate.Items > 0 {
			items := make([]any, c.Generate.Items)
			for j := range items {
				items[j] = map[string]any{"sku": fmt.Sprintf("SKU-%04d", j), "qty": float64(j % 7), "price": float64(j) * 1.25}
			}
			c.Input["items"] = items
		}
		if c.Generate != nil && c.Generate.Keys > 0 {
			// As the harness generates it: the keys k00.. cycle through a
			// string, an integer, a boolean and a number, and so does the schema.
			properties := map[string]any{}
			required := []any{}
			for j := 0; j < c.Generate.Keys; j++ {
				k := largeKey(j)
				c.Input[k] = largeValue(j)
				properties[k] = map[string]any{"type": []string{"string", "integer", "boolean", "number"}[j%4]}
				required = append(required, k)
			}
			c.JSONSchema = map[string]any{"type": "object", "properties": properties, "required": required, "additionalProperties": false}
		}
		if ref, ok := c.JSONSchema["$ref"].(string); ok && strings.HasPrefix(ref, "#") {
			c.JSONSchema = byName[ref[1:]].JSONSchema
		}
	}
	sum := sha256.Sum256(raw)
	return spec.Cases, hex.EncodeToString(sum[:])[:12]
}

// The key and value at index i of a generated large object.
func largeKey(i int) string { return fmt.Sprintf("k%02d", i) }

func largeValue(i int) any {
	switch i % 4 {
	case 0:
		return fmt.Sprintf("v%d", i)
	case 1:
		return float64(i)
	case 2:
		return i%8 == 0
	}
	return float64(i) * 0.5
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

// Shape specs by case, closed objects like the JSON Schemas.
func shapeSpec(name string) any {
	switch name {
	case "flat":
		return map[string]any{"id": shape.Integer, "name": shape.String, "email": shape.String, "active": shape.Boolean, "score": shape.Number}
	case "nested", "invalid":
		return map[string]any{
			"id":       shape.Integer,
			"name":     shape.String,
			"address":  map[string]any{"street": shape.String, "city": shape.String, "zip": shape.String},
			"tags":     []any{shape.String},
			"settings": map[string]any{"theme": shape.String, "notifications": shape.Boolean},
		}
	case "array":
		return map[string]any{"items": []any{map[string]any{"sku": shape.String, "qty": shape.Integer, "price": shape.Number}}}
	case "large":
		spec := map[string]any{}
		kinds := []any{shape.String, shape.Integer, shape.Boolean, shape.Number}
		for i := 0; i < 50; i++ {
			spec[largeKey(i)] = kinds[i%4]
		}
		return spec
	case "bounds":
		return map[string]any{
			"name":  shape.Max(40, shape.Min(3, shape.String)),
			"age":   shape.Max(150, shape.Min(0, shape.Integer)),
			"code":  regexp.MustCompile(`^[A-Z]{3}$`),
			"ratio": shape.Max(1, shape.Min(0, shape.Number)),
		}
	}
	fail(fmt.Errorf("no shape spec for case %q", name))
	return nil
}

// go-playground/validator works on typed structs, so the input is decoded
// into one per case. A type error in the input is a decoding error, not a
// validation one, so the invalid case is not measured for it.
type flatIn struct {
	ID     int     `json:"id"`
	Name   string  `json:"name" validate:"required"`
	Email  string  `json:"email" validate:"required"`
	Active bool    `json:"active"`
	Score  float64 `json:"score"`
}

type addressIn struct {
	Street string `json:"street" validate:"required"`
	City   string `json:"city" validate:"required"`
	Zip    string `json:"zip" validate:"required"`
}

type nestedIn struct {
	ID       int       `json:"id"`
	Name     string    `json:"name" validate:"required"`
	Address  addressIn `json:"address" validate:"required"`
	Tags     []string  `json:"tags" validate:"required,dive"`
	Settings struct {
		Theme         string `json:"theme" validate:"required"`
		Notifications bool   `json:"notifications"`
	} `json:"settings" validate:"required"`
}

type arrayIn struct {
	Items []struct {
		Sku   string  `json:"sku" validate:"required"`
		Qty   int     `json:"qty"`
		Price float64 `json:"price"`
	} `json:"items" validate:"required,dive"`
}

type boundsIn struct {
	Name  string  `json:"name" validate:"required,min=3,max=40"`
	Age   int     `json:"age" validate:"gte=0,lte=150"`
	Code  string  `json:"code" validate:"required,len=3,alpha,uppercase"`
	Ratio float64 `json:"ratio" validate:"gte=0,lte=1"`
}

func validatorTarget(name string) any {
	switch name {
	case "flat":
		return &flatIn{}
	case "nested":
		return &nestedIn{}
	case "array":
		return &arrayIn{}
	case "bounds":
		return &boundsIn{}
	}
	return nil
}

func moduleVersion(path string) string {
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, d := range info.Deps {
			if d.Path == path {
				return strings.TrimPrefix(d.Version, "v")
			}
		}
	}
	return "unknown"
}

func main() {
	casesFile := flag.String("cases", "../cases.json", "path to cases.json")
	flag.Parse()

	pol := readPolicy()
	cases, hash := loadCases(*casesFile)
	versions := map[string]string{
		"shape":        shape.Version,
		"validator":    moduleVersion("github.com/go-playground/validator/v10"),
		"jsonschema":   moduleVersion("github.com/santhosh-tekuri/jsonschema/v6"),
		"gojsonschema": moduleVersion("github.com/xeipuuv/gojsonschema"),
	}

	vld := validator.New()
	var out []result

	for _, c := range cases {
		input := c.Input
		s := shape.MustShape(shapeSpec(c.Name))

		compiler := jsonschema.NewCompiler()
		if err := compiler.AddResource(c.Name+".json", c.JSONSchema); err != nil {
			fail(err)
		}
		sch := compiler.MustCompile(c.Name + ".json")

		gsch, err := gojsonschema.NewSchema(gojsonschema.NewGoLoader(c.JSONSchema))
		if err != nil {
			fail(err)
		}

		libs := map[string]func() bool{
			"shape": func() bool {
				if c.Valid {
					return s.Valid(input)
				}
				return s.Error(input) == nil
			},
			"jsonschema": func() bool { return sch.Validate(input) == nil },
			"gojsonschema": func() bool {
				r, err := gsch.Validate(gojsonschema.NewGoLoader(input))
				return err == nil && r.Valid()
			},
		}
		if target := validatorTarget(c.Name); target != nil {
			b, _ := json.Marshal(input)
			if err := json.Unmarshal(b, target); err != nil {
				fail(err)
			}
			libs["validator"] = func() bool { return vld.Struct(target) == nil }
		}

		// Sanity: every library agrees on the verdict before it is timed.
		for lib, fn := range libs {
			if got := fn(); got != c.Valid {
				fail(fmt.Errorf("case %s: %s says %v, expected %v", c.Name, lib, got, c.Valid))
			}
		}

		for _, lib := range []string{"shape", "validator", "jsonschema", "gojsonschema"} {
			fn, ok := libs[lib]
			if !ok {
				continue
			}
			r := measure(func() { fn() }, pol)
			r.Case, r.Lib, r.Version = c.Name, lib, versions[lib]
			out = append(out, r)
			fmt.Fprintf(os.Stderr, "%-8s %-12s %10.1f ns/op\n", c.Name, lib, r.MedianNS)
		}
	}

	doc := map[string]any{
		"lang":       "go",
		"runtime":    map[string]any{"go": runtime.Version(), "goos": runtime.GOOS, "goarch": runtime.GOARCH},
		"versions":   versions,
		"input_hash": hash,
		"policy":     pol,
		"benchmarks": out,
	}
	enc := json.NewEncoder(os.Stdout)
	if err := enc.Encode(doc); err != nil {
		fail(err)
	}
}

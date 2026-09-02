package shape

import (
	"bufio"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"
)

type compatRow struct {
	Name   string
	Spec   any
	Input  any
	Output any
	Err    string
}

func TestCompatTSV(t *testing.T) {
	rows := loadCompatRows(t)

	for _, row := range rows {
		t.Run(row.Name, func(t *testing.T) {
			s := MustShape(decodeSpec(row.Spec))

			// A JSON null in the corpus is a value that is present and null.
			// Go reads a plain nil as "no value supplied", so hand over the
			// sentinel instead.
			in := row.Input
			if in == nil {
				in = Null
			}

			out, err := s.Validate(in)

			if row.Err != "" {
				if err == nil {
					t.Fatalf("expected error %q, got success", row.Err)
				}
				// Exact, whole-message comparison: a substring check cannot see
				// a wrong separator, a wrong error order or an extra error.
				if err.Error() != row.Err {
					t.Fatalf("error mismatch\nexpected: %q\nactual:   %q", row.Err, err.Error())
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected err: %v", err)
			}

			// Compare JSON-normalized: the corpus travels through JSON, so
			// undefined properties and numeric widths are erased on both sides
			// (parity with the TS harness).
			if !reflect.DeepEqual(jsonNorm(out), row.Output) {
				t.Fatalf("output mismatch\nexpected: %#v\nactual:   %#v", row.Output, jsonNorm(out))
			}
		})
	}
}

func loadCompatRows(t *testing.T) []compatRow {
	t.Helper()

	// Shared, language-neutral conformance corpus lives in the top-level test/
	// dir and is consumed by both the TS and Go harnesses.
	dir := filepath.Join("..", "test")
	files, err := filepath.Glob(filepath.Join(dir, "*.tsv"))
	if err != nil {
		t.Fatalf("glob %s: %v", dir, err)
	}
	if len(files) == 0 {
		t.Fatalf("no .tsv spec files found in %s", dir)
	}
	sort.Strings(files)

	var out []compatRow
	for _, path := range files {
		base := strings.TrimSuffix(filepath.Base(path), ".tsv")
		out = append(out, loadCompatFile(t, path, base)...)
	}
	return out
}

func loadCompatFile(t *testing.T, path, base string) []compatRow {
	t.Helper()

	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("open %s: %v", path, err)
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	if !sc.Scan() {
		t.Fatalf("%s is empty", path)
	}

	headers := strings.Split(sc.Text(), "\t")
	idx := map[string]int{}
	for i, h := range headers {
		idx[h] = i
	}

	var out []compatRow
	for sc.Scan() {
		line := sc.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		cols := strings.Split(line, "\t")

		row := compatRow{
			Name:   base + "/" + col(cols, idx, "name"),
			Spec:   parseValueCell(t, col(cols, idx, "spec")),
			Input:  parseValueCell(t, col(cols, idx, "input")),
			Output: parseValueCell(t, col(cols, idx, "output")),
			Err:    parseErrorCell(t, col(cols, idx, "error")),
		}
		out = append(out, row)
	}

	if err := sc.Err(); err != nil {
		t.Fatalf("scan %s: %v", path, err)
	}

	return out
}

// jsonNorm round-trips a value through JSON so nil-valued map entries collapse
// and all numbers become float64 — matching the JSON-authored expected column.
func jsonNorm(v any) any {
	b, err := json.Marshal(jsDates(v))
	if err != nil {
		return v
	}
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		return v
	}
	return out
}

// jsDates rewrites every time.Time in v to the string JSON.stringify gives a
// Date, and a NaN to the null it gives that, so the two languages' produced
// values compare across the JSON boundary.
func jsDates(v any) any {
	switch x := v.(type) {
	case time.Time:
		return jsDateString(x)
	case float64:
		if math.IsNaN(x) {
			return nil
		}
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, vv := range x {
			out[k] = jsDates(vv)
		}
		return out
	case []any:
		out := make([]any, len(x))
		for i, vv := range x {
			out[i] = jsDates(vv)
		}
		return out
	}
	return v
}

func col(cols []string, idx map[string]int, key string) string {
	i, ok := idx[key]
	if !ok || i >= len(cols) {
		return ""
	}
	return cols[i]
}

// parseErrorCell decodes the `error` column, which holds the COMPLETE expected
// message as a JSON string (so embedded newlines survive the TSV). An empty
// cell means "must not fail".
func parseErrorCell(t *testing.T, src string) string {
	t.Helper()
	src = strings.TrimSpace(src)
	if src == "" {
		return ""
	}

	var msg string
	if err := json.Unmarshal([]byte(src), &msg); err != nil {
		t.Fatalf("bad error cell %q: %v", src, err)
	}
	return msg
}

func parseValueCell(t *testing.T, src string) any {
	t.Helper()
	src = strings.TrimSpace(src)

	var v any
	if err := json.Unmarshal([]byte(src), &v); err == nil {
		return v
	}

	if len(src) >= 2 {
		q0 := src[0]
		q1 := src[len(src)-1]
		if (q0 == '\'' && q1 == '\'') || (q0 == '"' && q1 == '"') {
			return src[1 : len(src)-1]
		}
	}

	return src
}

func decodeSpec(v any) any {
	if arr, ok := v.([]any); ok {
		out := make([]any, len(arr))
		for i := range arr {
			out[i] = decodeSpec(arr[i])
		}
		return out
	}

	obj, ok := v.(map[string]any)
	if !ok {
		return v
	}

	if len(obj) == 1 {
		if tv, ok := obj["$type"]; ok {
			if ts, ok := tv.(string); ok {
				switch ts {
				case "Any":
					return Any
				case "String":
					return String
				case "Number":
					return Number
				case "Boolean":
					return Boolean
				case "Object":
					return Object
				case "Array":
					return Array
				case "Function":
					return Function
				case "Integer":
					return Integer
				case "Date":
					return Date
				}
			}
		}

		if ov, ok := obj["$open"]; ok {
			return Open(decodeSpec(ov))
		}
		if cv, ok := obj["$closed"]; ok {
			return Closed(decodeSpec(cv))
		}
		if rv, ok := obj["$required"]; ok {
			return Required(decodeSpec(rv))
		}
		if ov, ok := obj["$optional"]; ok {
			return Optional(decodeSpec(ov))
		}
		if ev, ok := obj["$expr"]; ok {
			if es, ok := ev.(string); ok {
				return MustExpr(es)
			}
		}
		if jv, ok := obj["$jsonschema"]; ok {
			return MustFromJSONSchema(jv)
		}
		if cv, ok := obj["$call"]; ok {
			arr := cv.([]any)
			args := make([]any, len(arr)-1)
			for i := range args {
				args[i] = decodeSpec(arr[i+1])
			}
			return callBuilder(arr[0].(string), args)
		}
		if dv, ok := obj["$discriminated"]; ok {
			arr := dv.([]any)
			branches := map[string]any{}
			for t, b := range arr[1].(map[string]any) {
				branches[t] = decodeSpec(b)
			}
			return Discriminated(arr[0].(string), branches)
		}
	}

	out := map[string]any{}
	for k, subv := range obj {
		out[k] = decodeSpec(subv)
	}

	return out
}

// callBuilder applies a builder the string DSL cannot express — one whose
// arguments include a list or an object — by name, as the {"$call": [name,
// ...args]} sentinel asks.
func callBuilder(name string, args []any) any {
	switch name {
	case "Pick":
		return Pick(args[0], args[1:]...)
	case "Omit":
		return Omit(args[0], args[1:]...)
	case "Partial":
		return Partial(args...)
	case "Extend":
		return Extend(args[0], args[1:]...)
	case "Define":
		return Define(args[0].(string), args[1:]...)
	case "Some":
		return Some(args...)
	case "One":
		return One(args...)
	case "All":
		return All(args...)
	case "Refer":
		// A name, or an options object as the TS form takes it.
		if name, ok := args[0].(string); ok {
			return Refer(name, args[1:]...)
		}
		o := args[0].(map[string]any)
		opts := ReferOptions{}
		opts.Fill, _ = o["fill"].(bool)
		opts.Strict, _ = o["strict"].(bool)
		return ReferWith(o["name"].(string), opts, args[1:]...)
	}
	panic("decodeSpec: unknown builder " + name)
}

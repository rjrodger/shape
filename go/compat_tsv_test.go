package shape

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
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
			out, err := s.Validate(row.Input)

			if row.Err != "" {
				if err == nil {
					t.Fatalf("expected error containing %q", row.Err)
				}
				if !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(row.Err)) {
					t.Fatalf("expected error containing %q, got %q", row.Err, err.Error())
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
			Err:    col(cols, idx, "error"),
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
	b, err := json.Marshal(v)
	if err != nil {
		return v
	}
	var out any
	if err := json.Unmarshal(b, &out); err != nil {
		return v
	}
	return out
}

func col(cols []string, idx map[string]int, key string) string {
	i, ok := idx[key]
	if !ok || i >= len(cols) {
		return ""
	}
	return cols[i]
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
	}

	out := map[string]any{}
	for k, subv := range obj {
		out[k] = decodeSpec(subv)
	}

	return out
}

package shape

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// The official JSON Schema Test Suite through the import. Every schema of a
// draft's required tests is imported and every instance validated, and the
// verdict must be the suite's, but for the tests the draft's skip ledger lists
// for this port. A failing test no row covers fails the run, so does a covered
// test that passes (the change that fixed it deletes its row), and so does a
// ledger longer than its bound. The TypeScript and Rust ports read the same
// ledgers. See test/json-schema-suite/README.md.

const suitePort = "go"

// A draft-7 document says so, as the import reads a $ref's siblings by it.
const suiteDraft7 = "http://json-schema.org/draft-07/schema#"

var suiteDir = filepath.Join("..", "test", "json-schema-suite")

type suiteRow struct {
	file, group, test, text string
	ports                   []string
}

type suiteVerdict struct {
	file, group, test string
	pass              bool
}

func suiteLedger(t *testing.T, draft string) (int, []suiteRow) {
	raw, err := os.ReadFile(filepath.Join(suiteDir, "skips-"+draft+".tsv"))
	if err != nil {
		t.Fatal(err)
	}
	bound := -1
	rows := []suiteRow{}
	for _, line := range strings.Split(strings.ReplaceAll(string(raw), "\r\n", "\n"), "\n") {
		if b, ok := strings.CutPrefix(line, "# bound: "); ok {
			bound, _ = strconv.Atoi(b)
		}
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		cols := append(strings.Split(line, "\t"), "", "", "", "")
		rows = append(rows, suiteRow{cols[0], cols[1], cols[2], line, strings.Split(cols[3], " ")})
	}
	return bound, rows
}

func suiteCompile(draft string, schema any) *Schema {
	if m, ok := schema.(map[string]any); ok && draft == "draft7" {
		if _, has := m["$schema"]; !has {
			m["$schema"] = suiteDraft7
		}
	}
	spec, err := FromJSONSchema(schema)
	if err != nil {
		return nil
	}
	return MustShape(spec)
}

func suiteVerdicts(t *testing.T, draft string) []suiteVerdict {
	dir := filepath.Join(suiteDir, "tests", draft)
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	files := []string{}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".json") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	out := []suiteVerdict{}
	for _, file := range files {
		raw, err := os.ReadFile(filepath.Join(dir, file))
		if err != nil {
			t.Fatal(err)
		}
		var groups []struct {
			Description string `json:"description"`
			Schema      any    `json:"schema"`
			Tests       []struct {
				Description string `json:"description"`
				Data        any    `json:"data"`
				Valid       bool   `json:"valid"`
			} `json:"tests"`
		}
		if err := json.Unmarshal(raw, &groups); err != nil {
			t.Fatal(file, err)
		}
		for _, g := range groups {
			s := suiteCompile(draft, g.Schema)
			for _, c := range g.Tests {
				// A JSON null is a value that is present and null.
				data := c.Data
				if data == nil {
					data = Null
				}
				pass := s != nil && s.Valid(data) == c.Valid
				out = append(out, suiteVerdict{file, g.Description, c.Description, pass})
			}
		}
	}
	return out
}

func suiteCovers(row suiteRow, v suiteVerdict) bool {
	return row.file == v.file && (row.group == "*" || row.group == v.group) &&
		(row.test == "*" || row.test == v.test)
}

func TestJSONSchemaSuite(t *testing.T) {
	for _, draft := range []string{"draft2020-12", "draft7"} {
		t.Run(draft, func(t *testing.T) {
			bound, rows := suiteLedger(t, draft)
			mine := []suiteRow{}
			for _, row := range rows {
				if contains(row.ports, suitePort) {
					mine = append(mine, row)
				}
			}
			vs := suiteVerdicts(t, draft)
			listed := func(v suiteVerdict) bool {
				for _, row := range mine {
					if suiteCovers(row, v) {
						return true
					}
				}
				return false
			}
			unlisted, passing, stale := []string{}, []string{}, []string{}
			for _, v := range vs {
				name := strings.Join([]string{v.file, v.group, v.test, suitePort}, "\t")
				if l := listed(v); !v.pass && !l {
					unlisted = append(unlisted, name)
				} else if v.pass && l {
					passing = append(passing, name)
				}
			}
			for _, row := range rows {
				found := false
				for _, v := range vs {
					found = found || suiteCovers(row, v)
				}
				if !found {
					stale = append(stale, row.text)
				}
			}
			got := map[string]any{"unlisted": unlisted, "passing": passing, "stale": stale,
				"bounded": len(rows) <= bound}
			want := map[string]any{"unlisted": []string{}, "passing": []string{}, "stale": []string{},
				"bounded": true}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("the %s ledger does not hold:\nunlisted: %q\npassing: %q\nstale: %q\nbounded: %v (%d rows, bound %d)",
					draft, unlisted, passing, stale, got["bounded"], len(rows), bound)
			}
		})
	}
}

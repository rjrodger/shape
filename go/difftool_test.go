package shape

// Differential parity harness, Go side.
//
// Runs the shared case matrix (test/differential/cases.js) and records what
// this implementation did, so compare.js can diff it against the canonical TS
// build. Driven by `make diff`; skipped during a normal `go test` run.
//
// This lives in a _test.go file deliberately: it must not add code to the
// package under test, which is held at 100% statement coverage.

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

type diffCase struct {
	Name  string `json:"name"`
	Spec  any    `json:"spec"`
	Input any    `json:"input"`
}

type diffResult struct {
	Name     string `json:"name"`
	Build    string `json:"build,omitempty"`
	Schema   any    `json:"schema,omitempty"`
	Reimport any    `json:"reimport,omitempty"`
	JSON     any    `json:"json,omitempty"`
	ReJSON   any    `json:"rejson,omitempty"`
	OK       *bool  `json:"ok,omitempty"`
	Out      any    `json:"out,omitempty"`
	Err      string `json:"err,omitempty"`
}

func TestDifferential(t *testing.T) {
	in, outPath := os.Getenv("DIFF_IN"), os.Getenv("DIFF_OUT")
	if in == "" || outPath == "" {
		t.Skip("differential harness: set DIFF_IN and DIFF_OUT (see make diff)")
	}

	raw, err := os.ReadFile(in)
	if err != nil {
		t.Fatalf("read %s: %v", in, err)
	}

	var cases []diffCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatalf("parse %s: %v", in, err)
	}

	f, err := os.Create(outPath)
	if err != nil {
		t.Fatalf("create %s: %v", outPath, err)
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	for _, c := range cases {
		if err := enc.Encode(runDiffCase(c)); err != nil {
			t.Fatalf("encode %s: %v", c.Name, err)
		}
	}

	fmt.Fprintf(os.Stderr, "go:  %d results -> %s\n", len(cases), outPath)
}

// runDiffCase validates one case, turning a build error or a panic into a
// recorded result rather than aborting the whole run.
func runDiffCase(c diffCase) (res diffResult) {
	res.Name = c.Name

	defer func() {
		if r := recover(); r != nil {
			// A builder or the string form refusing a spec is a build error,
			// as it is in TypeScript; anything else is a real panic.
			if err, ok := r.(error); ok {
				res.Build = "ERR: " + err.Error()
			} else {
				res.Build = "PANIC: " + fmt.Sprint(r)
			}
		}
	}()

	s, err := Shape(decodeSpec(c.Spec))
	if err != nil {
		res.Build = "ERR: " + err.Error()
		return
	}

	// The JSON Schema export is compared too, once per case, and the export
	// of what the import reads back from it.
	res.Schema = jsonNorm(s.JSONSchema())
	res.Reimport = reimportSchema(res.Schema)

	// The declarative JSON, and the export of the shape it reads back.
	if j, err := s.JSON(); err != nil {
		res.JSON = "ERR: " + err.Error()
	} else {
		res.JSON = jsonNorm(j)
		res.ReJSON = rebuildJSON(res.JSON)
	}

	// A JSON null is a value that is present and null. Go reads a plain nil as
	// "no value supplied", so hand the sentinel over instead.
	in := c.Input
	if in == nil {
		in = Null
	}

	out, verr := s.Validate(in)
	if verr != nil {
		no := false
		res.OK, res.Err = &no, verr.Error()
		return
	}

	yes := true
	res.OK, res.Out = &yes, jsonNorm(out)
	return
}

// rebuildJSON exports the shape the declarative JSON reads back as, or the
// error that stopped it.
func rebuildJSON(j any) (out any) {
	defer func() {
		if r := recover(); r != nil {
			out = "PANIC: " + fmt.Sprint(r)
		}
	}()
	s, err := Build(j)
	if err != nil {
		return "ERR: " + err.Error()
	}
	back, err := s.JSON()
	if err != nil {
		return "ERR: " + err.Error()
	}
	return jsonNorm(back)
}

// reimportSchema exports the shape the import builds from a schema, or the
// import error.
func reimportSchema(schema any) (out any) {
	defer func() {
		if r := recover(); r != nil {
			out = "PANIC: " + fmt.Sprint(r)
		}
	}()
	spec, err := FromJSONSchema(schema)
	if err != nil {
		return "ERR: " + err.Error()
	}
	s, err := Shape(spec)
	if err != nil {
		return "ERR: " + err.Error()
	}
	return jsonNorm(s.JSONSchema())
}

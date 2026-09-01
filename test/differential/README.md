# Differential parity harness

The shared corpus in [`../`](../README.md) is the committed parity gate, but it
only covers rows someone thought to write — and it was blind to a `Type()` that
validated nothing and a `Rest()` that validated nothing, because the only rows
for those builders used valid inputs.

This harness is the wide net. It generates thousands of `(spec, input)` pairs,
runs every one through **both** implementations, and diffs four things:

- the JSON Schema export of the spec,
- the verdict (pass vs fail),
- the produced value,
- the **exact** error message — not a substring.

```sh
make diff        # sampled report, grouped by case family
make diff-full   # every mismatch
```

CI runs `make diff` in its `parity` job, so a divergence fails the build.

## Files

| file          | role                                                      |
| ------------- | --------------------------------------------------------- |
| `cases.js`    | the case matrix: specs crossed with input batteries        |
| `gen.js`      | writes the matrix to JSON for both runners                 |
| `run-ts.js`   | runs the canonical TypeScript build, emits JSONL           |
| `compare.js`  | diffs the two result sets, exits non-zero on any mismatch  |

The Go side lives in [`../../go/difftool_test.go`](../../go/difftool_test.go).
It is a `_test.go` file on purpose: it must not add code to the package under
test, which is held at 100% statement coverage. It skips unless `DIFF_IN` and
`DIFF_OUT` are set, so a normal `go test` run is unaffected.

Spec cells use the same sentinel encoding as the corpus, decoded by the shared
[`../decode-spec.js`](../decode-spec.js) so the two harnesses cannot drift on
what a cell means.

## Adding cases

Add to `build()` in `cases.js`. Each `add(group, spec, inputs)` crosses one spec
with an input battery, so a single line yields a dozen or more comparisons.
Anything this harness catches should also be promoted into a corpus row in
`../gen-compat.js`, so the committed gate keeps it closed.

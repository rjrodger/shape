# JSON Schema Test Suite

The required tests of the official
[JSON Schema Test Suite](https://github.com/json-schema-org/json-schema-test-suite)
for draft 2020-12 and draft 7, run through the JSON Schema import by all
three implementations:

- TypeScript: `ts/test/jsonschema-suite.test.ts`
- Go: `go/jsonschema_suite_test.go`
- Rust: `rs/tests/jsonschema_suite.rs`

Each runner imports every schema, validates every instance, and compares the
verdict with the suite's. The tests the import cannot honour yet are listed
in a skip ledger, one per draft. The ledgers make the suite a ratchet: Shape
can come to pass more of it, and cannot quietly pass less.

## Provenance

| | |
| --- | --- |
| Upstream | `https://github.com/json-schema-org/json-schema-test-suite` |
| Commit | `3f05891cac5d51ffa068d7076d1372130e00c829` (2026-10-31) |
| Copied | `tests/draft2020-12/*.json` and `tests/draft7/*.json`, unchanged; the `optional/` directories are not copied |
| Licence | MIT, in [`LICENSE`](LICENSE) |

To update, copy the same files from a newer commit, change the commit here,
and run the three runners: each lists the tests whose verdict moved.

## The skip ledgers

`skips-draft2020-12.tsv` and `skips-draft7.tsv` hold one row per test that
fails, with five tab-separated columns:

| Column | Meaning |
| --- | --- |
| `file` | the suite file, such as `contains.json` |
| `group` | the group's `description`, or `*` for every group of the file |
| `test` | the test's `description`, or `*` for every test of the group |
| `ports` | the implementations that fail it: `ts go rs`, or `ts` alone |
| `waits on` | the keywords it needs that the import does not read yet |

A `# bound: N` line caps the number of rows. Every runner fails the run when:

- a test fails in its implementation and no row covers it for that
  implementation;
- a row covers a test that now passes in an implementation the row names, so
  the change that fixed it must delete or narrow the row;
- a row covers no test at all;
- the ledger holds more rows than its bound.

A change that makes tests pass deletes their rows and lowers the bound to the
new count. A change that makes a test fail has to add a row and raise the
bound, which a reviewer sees.

TypeScript fails the rows marked `ts` alone because its `Exact` compares an
object or an array by identity, where Go and Rust compare by value; see
[the parity page](../../docs/explanation/ts-go-parity.md).

A draft 7 schema without a `$schema` is read as one that names draft 7, which
the import needs to read a `$ref`'s siblings as draft 7 does.

# Benchmarks

Measures shape against other validators in each language on a shared set of
cases, on many hosts over time. Every run is filed as an immutable JSON
document; a summary is rebuilt from all of them and rendered on the
[project site](https://rjrodger.github.io/shape/perf/).

| language   | shape vs                                                                                                   |
|------------|------------------------------------------------------------------------------------------------------------|
| TypeScript | [Zod](https://zod.dev), [Ajv](https://ajv.js.org), [Joi](https://joi.dev), [Valibot](https://valibot.dev) |
| Go         | [go-playground/validator](https://github.com/go-playground/validator), [santhosh-tekuri/jsonschema](https://github.com/santhosh-tekuri/jsonschema), [xeipuuv/gojsonschema](https://github.com/xeipuuv/gojsonschema) |

## Running

```sh
make bench            # both languages, files a run per language under bench/results/runs/
make bench-ts         # one language
make bench-go
make bench-smoke      # a short run of everything, nothing written (CI does this)
make bench-report     # rebuild bench/results/latest/ from the run files
```

`make bench` builds `ts/` first and installs `bench/ts` dependencies on the
first run. The Go benchmark is its own module (`bench/go`) that points at the
sibling `go/` directory, so both languages measure the checked-out commit.

Environment:

| variable          | effect                                                                 |
|-------------------|------------------------------------------------------------------------|
| `BENCH_QUICK=1`   | 50 ms warm-up, 100 ms budget per benchmark: a smoke run                 |
| `BENCH_WARMUP_MS` | warm-up per benchmark (default 300)                                     |
| `BENCH_TIME_MS`   | measurement budget per benchmark (default 2000)                         |
| `HOST_KEY`        | the string the host id is derived from, instead of the machine's own    |
| `HOST_LABEL`      | a display name for the host, kept in the run                            |

## Cases

`cases.json` holds the inputs and, for the JSON Schema validators, the
schema; the shape specs and the other libraries' schemas are code in
`ts/bench.js` and `go/main.go`, written to accept exactly the same values
(closed objects, the same bounds). Every library's verdict is checked
against the case before anything is timed.

| case      | input                                                                       |
|-----------|-----------------------------------------------------------------------------|
| `flat`    | five primitive properties                                                    |
| `nested`  | a nested object, an array of strings, a settings object                      |
| `array`   | an array of fifty small objects                                              |
| `bounds`  | string length, integer range, a regular expression, a number range           |
| `large`   | fifty primitive properties, generated, so the per-key cost shows             |
| `invalid` | the `nested` input with two type errors, so the error path is measured       |

What is measured is a verdict on an already-decoded value: shape's
`valid()` (`Valid` in Go) on the valid cases and `error()` on the invalid
one, Zod's and Valibot's `safeParse`, an Ajv compiled validator, Joi's
`validate` with conversion off, `validator.Struct`, and the two Go JSON
Schema validators' `Validate`. Two things to keep in mind when reading the
numbers: shape, Zod and Valibot produce a fresh value while the others
check in place, and go-playground/validator works on a typed struct, so it
is measured after decoding and skips the `invalid` case (a type error there
is a decoding error, not a validation one).

## Method

`lib/harness.js` and `go/main.go` implement the same policy so samples from
the two languages are comparable: warm up for a fixed time, size a batch so
it takes about a millisecond and at least fifty steps of the clock (Windows
reports time in half-millisecond steps, and a batch shorter than that reads
as zero), then time batches for the budget and record each batch's mean
duration per iteration as one sample. A run whose medians are zero is one
recorded before that guard; the report shows its cells as not measured. A run keeps the
sample count, mean, median, 5th and 95th percentiles, standard deviation,
and 128 evenly spaced quantiles of the sorted samples, so the distribution
survives without the file growing with the budget.

## Runs

`node bench/run.js` wraps each language's output with:

- `run`: an id (`<time>-<host>-<lang>`), the time, and the commit measured
  (and whether the tree was dirty);
- `host`: an anonymous id, the platform, architecture, CPU model, core
  count and memory, and whether it ran under GitHub Actions;
- `runtime` and `versions`: Node or Go, and every library's version;
- `input_hash`: the hash of `cases.json`, taken with LF line endings so a
  Windows checkout (CRLF) hashes as everyone else. The report also hashes each
  case's definition as it was in the run's commit (`case_hash` on every
  row of `summary.json`), so a case added later leaves the others'
  history comparable, and a case changed later cuts its own history at
  the change;
- `policy`: the timing policy used.

The host id is the first twelve hex characters of a SHA-256 of the
hostname, platform, architecture, CPU model and core count under a domain
separator, or of `HOST_KEY` when set; the hostname itself is not kept. On a
GitHub-hosted runner the key is the runner class (OS, architecture and
image) instead, since every run lands on a fresh machine of that class and
the class is the series worth following.

A run file under `results/runs/` is never rewritten or removed: `run.js`
refuses to overwrite one, and the measurement workflow only adds. The
`results/latest/` directory is derived: `index.json` lists every run,
`summary.json` holds the latest measurement per language, host, case and
library plus the median history for trends, and `README.md` is a readable
table of the latest numbers. Measurements are only compared against the
same cases: the summary keys every row by the input hash, the matrix holds
only rows measured against the hash of the latest run per language and
host, and the trend on the site follows that hash. A run measured from a
worktree with uncommitted changes carries `source.dirty`, and the summary
and the site say so rather than attribute it to its commit; record runs
from a clean checkout.

## Recording from many hosts

The **Measure** workflow (`.github/workflows/measure.yml`) runs the
benchmarks on the Linux, macOS and Windows GitHub runners and commits the
new run files and the rebuilt summary to `main`. It runs on a schedule and
on demand (`workflow_dispatch`), and the site is rebuilt from the commit it
makes. To add a machine of your own, run `make bench` on it with a
`HOST_LABEL` and open a pull request with the new files under
`bench/results/`; hosted runners are shared hardware, so a quiet dedicated
machine gives steadier numbers.

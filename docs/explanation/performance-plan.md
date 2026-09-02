# Performance plan

**The work that takes shape from where the [performance review](performance.md)
found it to the tier of the fast validators, in what order, and how each step
is measured.** The review says where the time goes; this page says what to
do about it. The baseline is the benchmark run recorded at the versions this
plan starts from (`shape@11.1.0`, `go/v0.3.0`) on the
[performance report](https://rjrodger.github.io/shape/perf/), and every
step is judged against it with the same harness.

## Where we start

Median time per validation at the baseline, on the reference host (a 4-core
Xeon, Linux; runs `20260902T082434Z-e39798b4ebbc-ts` and
`20260902T082521Z-e39798b4ebbc-go` under `bench/results/runs/`) — the hosted
runners record the same cases and the report shows them side by side:

| case      | shape TS | fastest TS (Ajv) | Zod    | shape Go | fastest Go (validator) |
| --------- | -------: | ---------------: | -----: | -------: | ---------------------: |
| `flat`    | 3.5 µs   | 44 ns            | 138 ns | 3.3 µs   | 475 ns                 |
| `nested`  | 6.7 µs   | 100 ns           | 438 ns | 7.5 µs   | 1.4 µs                 |
| `array`   | 110 µs   | 1.4 µs           | 6.6 µs | 112 µs   | 20.7 µs                |
| `bounds`  | 5.1 µs   | 148 ns           | 1.4 µs | 2.9 µs   | 930 ns                 |
| `invalid` | 10.9 µs  | 93 ns            | 4.7 µs | 11.4 µs  | –                      |

## Targets

The aim is not to beat Ajv, whose compiled functions do the minimum possible
work; it is to remove the work shape does that is not validation, which the
review measured at most of each call. That puts the realistic targets in the
Valibot tier for TypeScript and within a small factor of go-playground/validator
for Go:

| case      | TS target | from    | Go target (`Valid`) | from    |
| --------- | --------: | ------: | ------------------: | ------: |
| `flat`    | ≤ 0.8 µs  | 3.5 µs  | ≤ 1.0 µs            | 3.3 µs  |
| `nested`  | ≤ 1.8 µs  | 6.7 µs  | ≤ 2.5 µs            | 7.5 µs  |
| `array`   | ≤ 25 µs   | 110 µs  | ≤ 40 µs             | 112 µs  |
| `bounds`  | ≤ 1.2 µs  | 5.1 µs  | ≤ 1.2 µs            | 2.9 µs  |
| `invalid` | ≤ 3.0 µs  | 10.9 µs | ≤ 4.0 µs            | 11.4 µs |

That is a 4–5× improvement on the boolean path in both languages, and the
producing path (the shape called for its value) should gain 2–3× from the
same changes, since it shares the walk.

## The rules that do not move

Every step keeps the [parity contract](ts-go-parity.md): the shared corpus
and the differential harness must pass unchanged in both languages after
each phase, so the produced values, the exact error text and its order, the
JSON Schema export and the re-import all stay as they are. Coverage stays at
100% in both. TypeScript goes first and Go mirrors it, phase by phase, as for
any change. One behaviour is declared out of scope so the compile-once step
is possible: **a spec is read when `Shape()` compiles it; mutating the spec
object afterwards has no effect.** Nothing in the documentation promises
otherwise today, and the corpus has no row that depends on it.

## Phases

Each phase is one pull request per language (TypeScript, then Go), each
with a benchmark run recorded before and after on the same host and the
ratio table in its description, and a Measure dispatch after merge so the
hosted runners show the step on the report.

### Phase 1 — compile once (TypeScript)

The largest item in the review: the spec is normalised inside the walk on
every call. `Shape()` will nodize the whole tree, resolve every key
expression and meta key, and give each compiled node what the walk needs:

- an object node's ordered children `[key, node]`, its known-key lookup (a
  plain object or `Set` built once), and whether it is closed or has a
  child shape;
- an array node's fixed slots and its element shape;
- for every node, whether it has any befores, afters, or a fast leaf check.

`exec` then walks a finished tree: no `KEY_EXPR_RE`, no `nodize`, no
`keys()` of the spec, no `new Set` per object per call. `Define`/`Refer`,
`Child`, `Rest` and the meta-key rules keep their semantics, only earlier.
Expected: 2–3× on `flat` and `nested`; the review put the object branch at
40% of the profile.

*Done when:* the profile shows no normalisation function under `exec`, and
`make test` and `make diff` pass unchanged.

### Phase 2 — the boolean path (TypeScript)

`valid()` runs the producing walk and discards the value; `error()` does
too. Both will run in match mode (no clone of the input, no default
injection into a result) while still collecting errors for `error()`. This
is the API most callers use for a yes-or-no answer and the one the
benchmarks time. Expected: a further 1.3–1.5× on `valid`.

*Done when:* for every corpus row, `valid(input)` equals
`error(input).length === 0` and `error(input)` equals the errors the
producing call throws, text for text.

### Phase 3 — the walk (TypeScript)

- One stack of frames (node, value, parent, key) instead of five parallel
  arrays and a rewritten path; the path is materialised only when an error
  is recorded.
- Drop the per-node `Object.isFrozen` probe for one check at the root.
- A fast path for a required leaf (`String`, `Number`, `Boolean`, `Integer`)
  with no builders: `typeof` and move on, without the before/after loop.
- The extra-key scan of a closed object stops at the first unknown key, and
  an open object with no child shape skips it.

Expected: 1.3–1.6× across the board, most on `array`, whose 50 elements each
pay the per-node cost.

### Phase 4 — Go mirrors phases 1–3

The Go tree is already compiled at `Shape()`, so its phase 1 is smaller:
collect definitions once and keep `Refs` on the `Schema`. Its phase 2 is
the biggest Go item: `Match` and `Valid` walk the input in place with no
`out` map and no copy per object. Its phase 3 is the allocation list from
the review: lazy path slices, `unknown` allocated only on the first unknown
key, a pre-sized `out` on the producing path, a pooled `Context` and
`ValidationError`. Expected: 2–3× on `Valid`, 1.5× on `Validate`.

*Done when:* `go test -bench` shows `Valid` at zero allocations per call on
`flat` and `nested`, and the corpus and differential harness pass.

### Phase 5 — decide on code generation

If, after phases 1–4, the TypeScript `flat` case is still more than 3×
Zod, the remaining gap is the interpretive walk itself and the next step is
compiling a shape to a function (`new Function`), as Ajv does. That is a
separate design (it must keep the same error text, be optional for
CSP-restricted browsers, and have no Go counterpart), so it is decided
then, with the numbers, not planned now.

## Measuring each step

1. Before the change, on the reference host, from a clean checkout of the
   base commit: `HOST_LABEL=<host> make bench`. Commit the two run files.
2. After the change, same host, same label, clean checkout: `make bench`
   again. Commit the runs; `bench/results/latest/README.md` shows both in
   the history and the pull request quotes the medians and ratios per case.
3. Accept a phase when every case improves by the phase's expected factor
   within tolerance and **no case regresses by more than 5%**; the run
   files are the record either way.
4. After merge, dispatch **Measure** so the hosted runners record the same
   commit and the report's trend line shows the step on three platforms.

Two runs on the reference host at the same commit vary by a few percent;
read differences under 10% as noise, and re-run before drawing a
conclusion from them.

## Order of work

| # | pull request | expected on `flat` (TS / Go) |
| - | ------------ | ---------------------------- |
| 1 | TS compile once | 3.5 → ~1.4 µs |
| 2 | TS boolean path | ~1.4 → ~1.0 µs |
| 3 | TS walk | ~1.0 → ~0.7 µs |
| 4 | Go: no-copy match, defines once, lazy paths, pooling | 3.3 → ~1.0 µs |
| 5 | Decide on code generation with the numbers from 1–4 | – |

Each is independent enough to ship and measure on its own, and each leaves
the parity gates green, so the work can pause after any row.

# Performance plan

**The work that takes shape from where the [performance review](performance.md)
found it to the tier of the fast validators, in what order, and how each step
is measured.** The review says where the time goes; this page says what to
do about it. The baseline is the pair of benchmark runs recorded from a clean
checkout of commit `5085fc0`, the first commit carrying `shape@11.1.0` and
`go/v0.3.0`, on the reference host; the runs before them (`fb2015e`,
`11.0.1`/`0.2.1`) stay in the history as the pre-release numbers. Every step
is judged against the baseline with the same harness, and the
[performance report](https://rjrodger.github.io/shape/perf/) shows the
hosted runners alongside.

## Where we start

Median time per validation at the baseline on the reference host (a 4-core
Xeon, Linux; host `e39798b4ebbc` on the report). `invalid` times the
error-producing call in both languages (`error()` and `Error`); the other
cases time the boolean call (`valid()` and `Valid`).

| case     | shape TS | fastest TS (Ajv) | Zod | shape Go | fastest Go (validator) |
| -------- | -------: | ---------------: | --: | -------: | ---------------------: |
| `flat` | 3.5 µs | 44 ns | 138 ns | 3.3 µs | 475 ns |
| `nested` | 6.7 µs | 100 ns | 438 ns | 7.5 µs | 1.4 µs |
| `array` | 110.0 µs | 1.4 µs | 6.6 µs | 112.2 µs | 20.7 µs |
| `bounds` | 5.1 µs | 148 ns | 1.4 µs | 2.9 µs | 930 ns |
| `invalid` | 10.9 µs | 93 ns | 4.7 µs | 11.4 µs | – |

## Targets

The aim is not to beat Ajv, whose compiled functions do the minimum possible
work; it is to remove the work shape does that is not validation, which the
review measured at most of each call. That puts the realistic targets in the
Valibot tier for TypeScript and within a small factor of go-playground/validator
for Go:

| case     | TS target | from | Go target | from | measured call |
| -------- | --------: | ---: | --------: | ---: | ------------- |
| `flat`   | ≤ 0.8 µs  | 3.5 µs | ≤ 1.0 µs | 3.3 µs | `valid` / `Valid` |
| `nested` | ≤ 1.8 µs  | 6.7 µs | ≤ 2.5 µs | 7.5 µs | `valid` / `Valid` |
| `array`  | ≤ 25 µs   | 110.0 µs | ≤ 40 µs | 112.2 µs | `valid` / `Valid` |
| `bounds` | ≤ 1.2 µs  | 5.1 µs | ≤ 1.2 µs | 2.9 µs | `valid` / `Valid` |
| `invalid`| ≤ 3.0 µs  | 10.9 µs | ≤ 4.0 µs | 11.4 µs | `error` / `Error` |

That is a 4–5× improvement in both languages. The producing call (the
shape called for its value, `Validate` in Go) shares the walk and should
gain by nearly the same factor; the benchmarks time the boolean and error
calls because those are what a request handler calls.

## Results

The phases were carried out on 2026-09-02, in one pull request rather than
one per language, and measured with the protocol below. The sandbox that ran
them was not the host of the baseline runs (a 2.10 GHz Xeon, host
`80bb4b189998`, against the baseline's 2.80 GHz one), so the before column
was recorded on that host from a clean worktree at `89e081b`, the last
commit before the phases and the same code as the baseline; the after
column is the run recorded from the clean tree at the end of the work
(`9ddbbe9` for TypeScript, `e67ecc6` for Go). Median per call; the targets
are those set above, so judge a case by its ratio rather than against a
target set on the faster host.

| case | TS before | TS after | gain | TS target | Go before | Go after | gain | Go target |
| ---- | --------: | -------: | ---: | --------: | --------: | -------: | ---: | --------: |
| `flat` | 2.73 µs | 0.85 µs | 3.2× | ≤ 0.8 µs | 2.02 µs | 1.1 µs | 1.8× | ≤ 1.0 µs |
| `nested` | 5.07 µs | 1.7 µs | 3.0× | ≤ 1.8 µs | 5.57 µs | 3.1 µs | 1.8× | ≤ 2.5 µs |
| `array` | 85.2 µs | 27.4 µs | 3.1× | ≤ 25 µs | 79.7 µs | 32.7 µs | 2.4× | ≤ 40 µs |
| `bounds` | 3.07 µs | 1.4 µs | 2.2× | ≤ 1.2 µs | 2.84 µs | 1.4 µs | 2.0× | ≤ 1.2 µs |
| `invalid` | 6.52 µs | 3.3 µs | 2.0× | ≤ 3.0 µs | 8.67 µs | 6.7 µs | 1.3× | ≤ 4.0 µs |

The sandbox is noisier than the 10% floor in the protocol below: four Go
runs at `e67ecc6`, minutes apart, put `flat` between 0.9 µs and 1.5 µs and
`array` between 26 µs and 40 µs. The Go after column is therefore the
median of those four runs (all committed under `bench/results/runs/`),
the TypeScript columns are single runs, and the ratios are indicative to
about a factor of 1.3. The hosted runners are steadier and record the
same commits when Measure is dispatched after merge.

The Go benchmarks in `go/bench_test.go`, which time the calls without the
harness, went from 28 allocations per `Valid` on `flat` and 68 on `nested`
to 3 and 5, from 3.6 µs and 8.5 µs to 1.15 µs and 2.6 µs, and `Error` on
the invalid input from 12.0 µs and 46 allocations to 5.2 µs and 26.

### What each phase did

- **TypeScript, compile once.** An object's or array's children are
  nodized, their key expressions parsed and their order fixed the first
  time the node is visited, and kept on the node in a `WeakMap`; every
  later call walks the compiled list. A spec is therefore read when it is
  first validated, and mutating it afterwards has no effect, as declared
  out of scope above. Deep nodization is memoised in a `WeakSet` so the
  compose builders that re-nodize a subtree do not redo it.
- **TypeScript, the walk.** `next()` pops the back-pointer chain in one
  loop, the frozen-parent probe runs once per parent object instead of
  once per node, the per-node error list is only reset when it holds
  something, and the collected errors are pushed once at the end of a
  node. Two experiments were reverted because they measured slower or the
  same: pooling the `State` across calls (a reused state cost more than a
  fresh one, 1.26 µs against 0.9 µs on `flat`), and guarding the write-back
  of a produced value with an identity check.
- **Go, prepare once.** `Shape()` walks the tree once and gives each object
  node its consumed-key set, its keys boxed as `any` for the path, and the
  schema its `Define` table; nothing is collected per call.
- **Go, no-copy match.** `Match` and `Valid` walk the input in place: no
  `out` map, no copy per object, no produced slice, no `unknown` slice
  until the first unknown key. The producing walk (`Validate`, `Error`)
  keeps the copy, pre-sized.
- **Go, per-call scratch.** One allocation per call holds the path stacks
  with room for eight levels and the first eight validator states; states
  beyond that come in chunks of eight. `Context` no longer builds `Refs` or
  the rename table until a `Define` or `Rename` needs it. A `Valid` on
  `flat` is now the context, the scratch block and the boxed result.
- **Go, error text.** `makeErr` built its text with `fmt` and rendered the
  value through the JSON encoder; the default texts are now concatenated,
  a string the encoder would pass through unchanged is used as it is, and
  ints and float64s go through `strconv` with the same output. The text is
  byte for byte what it was, which the corpus and the harness pin.

### What is left

- **TypeScript** is at 10× Zod on `flat` (0.85 µs against 85 ns), above the
  3× line that phase 5 sets for deciding on code generation. The remaining
  interpretive cost is the per-node bookkeeping of the walk itself and the
  extra-key scan of a closed object; the leaf fast path from phase 3 was
  not done. Those are worth perhaps another 1.3×; the tier of Zod and
  Valibot needs compiling a shape to a function, which is the phase 5
  decision.
- **Go `Error` and `Validate`** still copy every object. `Error` discards
  the copy, so an error walk that does not produce would halve it, but
  that changes what a custom `After` validator on an object sees (the
  produced value with defaults injected, or the input); settle that
  against the TypeScript behaviour before taking it.
- **Go `Valid`** is three allocations per call; the remaining time is the
  map lookups per key and the interface boxing of results, which are the
  cost of validating `map[string]any` and would only move with typed
  (struct) validation paths.
- The hosted runners record these commits when **Measure** is dispatched
  after merge, and the report's History table shows the step per host.

## Results, second round

The interpreter-level items from "What is left" were done on 2026-09-02
(code generation and typed validation were declined). Same host and
protocol as above; before is main at `ea07e43` (the first round's code)
measured with this round's benchmark files, so the `large` case has a
before column too; after is the clean tree at `424ec5a`. The host's spread
at one commit is wider than the 10% floor for Go, so the Go after column
is the median of four runs, and the in-process benchmarks in
`go/bench_test.go` are given beside it.

| case | TS before | TS after | gain | Go before | Go after | gain | Go in-process (`Valid`, before → after) |
| ---- | --------: | -------: | ---: | --------: | -------: | ---: | ------------------------------------ |
| `flat` | 0.92 µs | 0.64 µs | 1.4× | 1.09 µs | 0.45 µs | 2.4× | 1.15 µs → 0.41 µs, 3 → 0 allocations |
| `nested` | 1.67 µs | 1.52 µs | 1.1× | 2.27 µs | 1.87 µs | 1.2× | 2.8 µs → 1.8 µs |
| `array` | 29.1 µs | 25.1 µs | 1.2× | 43.9 µs | 38.8 µs | 1.1× | – |
| `bounds` | 1.90 µs | 1.55 µs | 1.2× | 2.21 µs | 1.59 µs | 1.4× | – |
| `large` | 8.83 µs | 7.64 µs | 1.2× | 7.35 µs | 7.24 µs | 1.0× | 8.6 µs → 7.1 µs |
| `invalid` | 3.92 µs | 2.99 µs | 1.3× | 7.68 µs | 2.96 µs | 2.6× | `Error` 5.2 µs → 4.1 µs |

`Validate` in Go, which the harness does not time, gains the most from
copying on write: `nested` 4.7 µs → 1.9 µs and `large` 13.0 µs → 8.0 µs
in-process.

### What this round did

- **TypeScript, inline leaves.** A `String`, `Number`, `Boolean` or
  `Integer` child with no befores or afters is checked in its parent's
  loop and gets a frame only when it fails; the check is the kind's whole
  check, empty-string, `NaN` and fraction rules included. An object takes
  this for all of its children or none, because a custom validator on one
  child may read its siblings' frames (the argument parser does), and a
  validator attached after the compile keeps its frame. The elements of an
  array with a child shape take it too. The closed-object extra-key list
  is made only when there is an extra key, and an error's primitive value
  is rendered as its JSON directly. A `--trace-deopt` run over the bench
  cases showed a handful of deoptimisations of `exec` during warm-up and
  none recurring, so the walk is not fighting the optimiser.
- **Go, copy on write.** The producing walk uses the input as its result
  until the first write that changes something (a default or null literal
  injected, a key renamed or dropped, a child produced as a different
  value) and copies then. An unchanged input comes back as itself; a
  changed one is never touched. This is the one behaviour change of the
  round: `Validate`'s result may share structure with its input, which the
  Go README and the parity page now say.
- **Go, deferred scan.** A closed object with no more keys than the spec
  declares scans for unknown keys only when a declared key turned out
  missing; the error still goes in ahead of the children's.
- **Go, pooled context.** A schema with no validators anywhere runs its
  calls (without a caller's `Context`) on a pooled context and scratch
  block; no user code runs, so nothing can retain them.
- **Benchmarks.** A `large` case of fifty generated keys, p95 beside the
  median in the History table, and per-case comparability across runs so
  adding a case does not cut the others' history.

### What is left now

TypeScript `flat` stands at about 7× Zod and Go `flat` at about 1.5×
go-playground/validator on this host. The interpretive walk is close to
its floor in both: what remains in TypeScript is the frame push and pop
per non-leaf node and the `keys()` of every object for the extra-key scan;
in Go, a hash lookup and an interface box per key of a `map[string]any`.
The two moves that would change the tier, compiling a shape to a function
in TypeScript and a struct-specialised walk in Go, were considered and
declined for now.

## The rules that do not move

Every step keeps the [parity contract](ts-go-parity.md): the shared corpus
and the differential harness must pass unchanged in both languages after
each phase, so the produced values, the exact error text and its order, the
JSON Schema export and the re-import all stay as they are. Coverage stays at
100% in both. TypeScript goes first and Go mirrors it, phase by phase, as for
any change.

Three behaviours are easy to lose while optimising and are pinned by the
corpus and the test suites, so each phase below names them where it
touches them:

- `valid()` and `error()` run the producing walk on the input itself:
  `Shape({ x: 1, y: 'Y' }).valid({ x: 2 })` injects `y` into the input,
  and does so even when the input is invalid. That is the documented
  behaviour of the canonical implementation and stays.
- A closed object reports **every** unknown key in one message
  (`the properties "b, c" are not allowed`); the scan cannot stop at the
  first.
- The validator `State` exposes the current `path`, and it is read on
  successful walks: the `Key` builder produces its value from it, and
  custom validators may read it. It has to be available on demand at every
  node, not only when an error is recorded.

One behaviour is declared out of scope so the compile-once step is
possible: **a spec is read when `Shape()` compiles it; mutating the spec
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

### Phase 2 — per-call setup (TypeScript)

The review's second item was wrong in its reasoning and has been corrected
there: `valid()`, `match()`, `error()` and the producing call all cost the
same within a few percent (3.5–3.7 µs on `flat`), so there is no cheap
"boolean mode" to switch to, and `valid()` keeps injecting defaults into
its input as it does today. What the boolean call does pay for is the setup
of every call, which the profile attributed to `valid`'s inlined prologue
(about 20%):

- a `State` with five stacks and an `ancestors` and `path` array, allocated
  per call; allocate the frames lazily and reuse the arrays across calls
  where the API allows (a shape is not re-entrant during a call);
- the `ctx.skip` `Set`s built on every call even when `ctx.skip` is absent;
- `actx.err` and the error array plumbing on the boolean path when no error
  is ever recorded.

Expected: 1.2× on the boolean and producing calls alike.

*Done when:* for every corpus row, `valid(input)` equals
`error(input).length === 0`, `valid` still mutates its input exactly as the
suite expects, and `make test` and `make diff` pass unchanged.

### Phase 3 — the walk (TypeScript)

- One stack of frames (node, value, parent, key) instead of five parallel
  arrays. The path stays available on demand at every node: a frame knows
  its key and its parent frame, so `state.path` is built from the frames
  when a validator or an error asks for it, and cached for that node.
- Frozen parents: the producing walk must still write into a mutable copy
  when the input object is frozen, at any depth
  (`Shape({ x: Object })({ x: Object.freeze({ y: 1 }) })` produces
  `{ x: { y: 1 } }`). Replace the per-node `Object.isFrozen` probe with
  one check per object parent on the producing path only, skipped in match
  mode.
- A fast path for a required leaf (`String`, `Number`, `Boolean`, `Integer`)
  with no builders. It performs the leaf's whole check, not `typeof` alone:
  `String` rejects `''`, `Number` rejects `NaN`, `Integer` rejects a
  fraction, exactly as the corpus pins (`empty-string-rejected`,
  `integer-fraction-fails`); what it skips is the generic before/after loop
  and the state bookkeeping.
- The extra-key scan of a closed object still collects every unknown key,
  since the message names them all; it uses the compiled known-key lookup
  instead of `undefined === n.v[k]` per key, and an open object with no
  child shape skips the scan entirely.

Expected: 1.3–1.6× across the board, most on `array`, whose 50 elements each
pay the per-node cost.

### Phase 4 — Go mirrors phases 1–3

The Go tree is already compiled at `Shape()`, so its phase 1 is smaller:
collect definitions once and keep `Refs` on the `Schema`. Its phase 2 is
the biggest Go item: `Match` and `Valid` walk the input in place with no
`out` map and no copy per object. Its phase 3 is the allocation list from
the review:

- path slices built on demand: `State.Path` and `PathArr` stay part of the
  validator contract and are still correct when read, but are materialised
  from the frame chain when asked for rather than appended per property;
- `unknown` allocated only on the first unknown key, and still collecting
  every unknown key after it;
- a pre-sized `out` on the producing path;
- a pooled `Context` and scratch state for `Match` and `Valid` only. The
  `*ValidationError` that `Validate` returns and the `Issues` slice that
  `Error` returns escape to the caller and are never pooled or reused.

Expected: 2–3× on `Valid`, 1.5× on `Validate`.

*Done when:* `go test -bench . -benchmem -run xxx` (the benchmarks in
`go/bench_test.go`) reports `BenchmarkValidFlat` and `BenchmarkValidNested`
at zero allocations per operation, and the corpus and differential harness
pass. At the baseline they report 28 and 68 allocations.

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
   again, and commit the runs. The **History** section of
   `bench/results/latest/README.md` lists shape's median per case for every
   run on the host, newest last, so the before and after read off one
   table; `summary.json` holds the full rows and the site's trend view
   draws them.
3. Two runs on the reference host at the same commit differ by up to 10%,
   so that is the noise floor. Accept a phase when every case improves by
   about the phase's expected factor, and no case is more than 10% slower.
   A case between 5% and 10% slower is re-measured: three further runs, and
   the median of those decides against the same 5% line. Anything beyond
   10% is a regression to fix before merging. The run files are the record
   either way.
4. After merge, dispatch **Measure** so the hosted runners record the same
   commit and the report's trend line shows the step on three platforms.

## Order of work

| # | pull request | expected on `flat` (TS / Go) |
| - | ------------ | ---------------------------- |
| 1 | TS compile once | 3.5 µs → ~1.4 µs |
| 2 | TS per-call setup | ~1.4 → ~1.2 µs |
| 3 | TS walk | ~1.2 → ~0.8 µs |
| 4 | Go: no-copy match, defines once, lazy paths, pooled scratch state | 3.3 µs → ~1.0 µs |
| 5 | Decide on code generation with the numbers from 1–4 | – |

Each is independent enough to ship and measure on its own, and each leaves
the parity gates green, so the work can pause after any row.

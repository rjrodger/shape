# Performance review

**Where the time goes when shape validates, in both implementations, and what
would make it faster.** *The recommendations that follow were carried out;
the figures here are the ones the review was written from, and the
[benchmark report](https://rjrodger.github.io/shape/perf/) carries the
current numbers. The review predates the Rust port, which the benchmarks
and the report now measure too but which was not profiled here. The
TypeScript figures here, and every TypeScript run recorded before
2026-09-03, measured a benchmark whose `String`, `Number` and `Boolean`
leaves were undefined, which shape reads as an optional `any`: a slower
shape than the Go and Rust benchmarks measure, so the TypeScript runs
after the correction are not comparable with the ones before it.* Measured with the [benchmarks](../../bench/README.md)
in `bench/` and CPU and allocation profiles of the `flat`, `nested` and
`array` cases; the numbers are from one Linux host and will differ elsewhere,
but the proportions are what matter. The live comparison with other
validators is on the [performance report](https://rjrodger.github.io/shape/perf/).

## Where shape stands

| case (median per validation) | shape TS | Zod | Ajv | shape Go | validator | jsonschema |
| ---------------------------- | -------: | --: | --: | -------: | --------: | ---------: |
| `flat` (5 properties)        | 3.5 µs   | 155 ns | 44 ns | 3.1 µs | 460 ns | 2.6 µs |
| `nested`                     | 7.0 µs   | 436 ns | 101 ns | 7.1 µs | 1.5 µs | 6.0 µs |
| `array` (50 objects)         | 114 µs   | 7.1 µs | 1.4 µs | 123 µs | 20 µs | 92 µs |

Shape is roughly level with Joi and with the Go JSON Schema validators, and an
order of magnitude behind the fast TypeScript validators. That gap is not in
the checks themselves, which are cheap; it is in the work the walk does
around them. The profiles say the same thing in both languages: **most of a
validation is spent preparing to validate**, not validating.

## TypeScript

The CPU profile of `valid()` on the three cases, by self time:

| share | where | what it does |
| ----: | ----- | ------------ |
| 40 %  | `exec`, the object branch | per property, per validation: a regular-expression match of the key against the key-expression grammar, `nodize` of the child spec, a `Set` of the known keys, `keys()` of the spec and of the value, an `extra` array |
| 27 %  | `State.next` | dereferencing the back-pointer stacks (`nodes`, `vals`, `parents`, `keys`, `path`) and an `Object.isFrozen` check per node |
| 20 %  | `valid` (inlined `exec` prologue) | building a `State`, the `ctx.skip` sets, the produced-value copy |
| 3 %   | the key-expression regexp | `^\s*("(\\.|[^"\\])*"|[^\s]+):\s*(.*?)\s*$` on every object key of every validation |

The root cause is that **the spec is compiled lazily, inside the walk**. When
`exec` reaches an object node it re-derives the node's children from `n.v`:
it parses `"name: Min(1)"` keys, nodizes each child, records the known keys
in a fresh `Set`, and writes the results back into the node. The write-back
means the second validation finds nodes rather than raw specs, but the loop,
the regexp, the `Set` and the `keys()` calls run every time. A closed object
also builds an `extra` array of the value's keys not in the spec, whether or
not there are any.

Second, **every call pays the same setup**. `valid()`, `match()`, `error()`
and the producing call cost the same within a few percent (3.5–3.7 µs on
`flat`): the boolean calls run the producing walk on the input itself
(`valid` injects defaults into it, by design), and match mode saves only the
writes. What the profile attributes to `valid`'s inlined prologue, about
20%, is the per-call construction of the `State` with its five stacks, the
`ctx.skip` sets built whether or not `ctx.skip` is present, and the error
array plumbing.

Third, the walk carries **more state per node than it reads**: five parallel
stacks indexed by the same counters, a path array rewritten at every depth,
and `ancestors`. Each `next()` touches all of them.

### Recommendations, in order of expected effect

1. **Compile the spec once, in `Shape()`.** Nodize the whole tree, resolve
   key expressions, and precompute for each object node the ordered child
   list, the known-key set (or a plain object used as a set) and whether it
   is closed; for each array node the fixed slots and the child. `exec` then
   walks a finished tree and never touches `KEY_EXPR_RE`, `nodize`, `keys()`
   of the spec, or `new Set`. This removes most of the 40 % in the object
   branch and the regexp entirely. It is also the change that unlocks the
   rest, because a compiled node can carry whatever the walk needs. Expected:
   2–3× on `flat` and `nested`.

2. **Trim the per-call setup.** Allocate the walk's frames lazily and reuse
   the arrays across calls, build the `ctx.skip` sets only when `ctx.skip`
   is given, and keep the error plumbing off the path until an error is
   recorded. `valid()` keeps its contract of injecting defaults into the
   input. Expected: about 1.2× on every call.

3. **Skip the extra-key scan for open objects.** A closed object must still
   collect every unknown key, since the message names them all, but with a
   compiled known-key lookup that is one pass; an open object without a
   child shape needs no scan at all.

4. **Collapse the parallel stacks into one array of frames** (node, value,
   parent, key) pushed and popped together, with `state.path` built from the
   frames on demand, since `Key` and custom validators read it on successful
   walks. Keep the frozen-parent handling on the producing path (a frozen
   nested object must still be copied before its children are written) but
   check it once per object parent rather than at every node.

5. **Specialise the leaf kinds.** A required `String`, `Number` or `Boolean`
   with no builders is the common case; a compiled node can carry a `fast`
   flag so the walk performs the leaf's whole check (`typeof`, and the
   non-empty, non-`NaN` and integer rules the corpus pins) without entering
   the generic before/after loop.

Together these are the difference between the current numbers and the
Zod/Valibot tier; Ajv's code generation is a further step (compile the tree
to a function with `new Function`) that is only worth taking after the walk
itself is lean.

## Go

The allocation profile of `Valid()` on `flat` and `nested`:

| case | time | bytes | allocations |
| ---- | ---: | ----: | ----------: |
| `flat`   | 3.5 µs | 1.9 kB | 28 |
| `nested` | 9.0 µs | 4.8 kB | 68 |

35 % of CPU is `mallocgc` and the map runtime, and the allocation sites are
plain:

| share of bytes | where | what |
| -------------: | ----- | ---- |
| 36 % | `validateObject` | `out := map[string]any{}` and `out[k] = v` for every key: **every object in the input is copied**, in match mode too |
| 12 % | `validateObject` | `kpath := append(path, k)` and `kpathArr := append(pathArr, k)`: two new path slices per property |
| 4 %  | `validateObject` | `unknown := make([]string, 0, len(obj))` per object, used only when a key is unknown |
| 7 %  | `newContext` | a fresh `Context` with its `Refs` map per call |
| 53 % | `validateNode` | boxing of results into `any` and the per-node `State` for validators |

And `collectDefines` walks the entire node tree on **every** `Validate`,
`Match` and `Error` call to register `Define` names, which is 4 % of CPU on a
tree with no definitions at all.

### Recommendations, in order of expected effect

1. **Do not copy in match mode.** `Valid` and `Match` need a verdict; walk
   the input map in place and allocate nothing for the result. This removes
   the largest allocation site and most of the map-assignment time on the
   boolean path. Expected: 1.5–2× on `Valid`.

2. **Collect definitions at compile time.** Walk the tree once in `Shape()`
   and keep the `Refs` map on the `Schema`; `newContext` then copies a
   reference rather than rebuilding it, and the 4 % walk disappears.

3. **Build paths lazily.** Pass the parent and key down and materialise the
   `[]string` path from that chain when a validator or an error asks for it,
   which keeps `State.Path` correct for custom validators and `Key` while
   saving two allocations per property on every input that never asks.

4. **Allocate `unknown` only on the first unknown key**, and skip the scan
   for open objects without a child shape, as in TypeScript.

5. **Reuse the `Context` and scratch state** of `Match` and `Valid` across
   calls with a `sync.Pool`, or let `Valid` keep a small stack-allocated
   error counter instead of an issues slice. The `*ValidationError` that
   `Validate` returns and the `Issues` that `Error` returns escape to the
   caller and must never be pooled.

6. **Pre-size `out`** (`make(map[string]any, len(obj)+defaults)`) on the
   producing path, where the copy is genuinely needed, so the map does not
   grow in steps.

Each of these was carried out. The [benchmark
report](https://rjrodger.github.io/shape/perf/) has the current numbers for
every case on every host measured.

## Keeping parity while doing this

Every item here changes how the walk is done, not what it accepts, produces
or says, so the [shared corpus](../../test/README.md) and the
[differential harness](../../test/differential/README.md) are the safety
net: the exact error text, the produced value, and the JSON Schema export
must not move. Do the TypeScript change first, prove it with `make test` and
`make diff`, then mirror it in Go, as for any change. Record a benchmark run
before and after (`make bench`) so the report shows the effect per host.

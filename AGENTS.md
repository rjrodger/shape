# Agent & contributor guide

Guidance for humans and AI coding agents working on this repository. Read this
before making changes.

## What this repo is

`shape` is a schema-by-example validator with **three implementations kept at
behavioural parity**:

| Path      | Contents |
| --------- | -------- |
| `ts/`     | **Canonical** TypeScript implementation (`ts/src/shape.ts`) + tests. |
| `go/`     | Go port (`go/*.go`) + tests. |
| `rs/`     | Rust port (`rs/src/*.rs`) + tests. |
| `docs/`   | [Diátaxis](https://diataxis.fr) documentation (tutorials / how-to / reference / explanation), plus `adr/` decision records, `design/` plans, and `STYLE-GUIDE.md`. |
| `test/`   | Shared, language-neutral conformance corpus (`*.tsv`) run by all three languages. |
| `bench/`  | Benchmarks against other validators (`bench/ts`, `bench/go`, `bench/rs`) and the immutable recorded runs (`bench/results/`). See `bench/README.md`. |
| `site/`   | Static site generator (`site/build.js`) for the docs and the performance report, deployed by the Pages workflow. |
| `Makefile`| Top-level build/test/publish orchestration. |

## The golden rule: TypeScript is canonical

`ts/src/shape.ts` **defines the behaviour**. The Go and Rust ports must match it.

- A behaviour change **starts in TypeScript**, then is mirrored in Go and Rust.
- Never "fix" a divergence by changing TypeScript to match a port without
  deciding that the TypeScript behaviour is wrong.
- Known, intentional divergences are documented in
  [`docs/explanation/ts-go-parity.md`](docs/explanation/ts-go-parity.md). Don't
  silently add new ones — document them there.

## Build & test

```sh
make build      # build ts + go + rs
make test       # test ts + go + rs (includes the shared corpus)

# or per-language:
make build-ts && make test-ts
make build-go  && make test-go
make build-rs  && make test-rs
```

Direct commands:

```sh
# TypeScript (from ts/)
npm install && npm run build
node test/run.js        # the whole suite; a bare glob needs Node 21+ to expand

# Go (from go/)
go build ./... && go vet ./... && go test ./...

# Rust (from rs/)
cargo test --all-features && cargo clippy --all-targets --all-features -- -D warnings
```

Toolchain: Node 20+, Go 1.22+, Rust 1.75+ (stable). TypeScript compiles to
`ts/dist/` and tests to `ts/dist-test/` (both git-ignored) — **always rebuild
after editing `ts/src`**. `npm run build` also bundles `dist/shape.min.js`, the
package's browser entry, with esbuild (`npm run build-web`).

## The shared conformance corpus (parity gate)

`test/*.tsv` pins TS↔Go↔Rust parity. Cases are declared in `test/gen-compat.js`;
expected `output`/`error` columns are computed from the **canonical TS build**.

To add or change a parity case:

```sh
make build-ts                # gen-compat.js needs ts/dist
node test/gen-compat.js      # regenerate every test/*.tsv from canonical TS
make test                    # all three languages must pass the new corpus
```

`ts/test/compat.test.ts`, `go/compat_tsv_test.go` and `rs/tests/compat_tsv.rs`
glob and run every `test/*.tsv`. See [`test/README.md`](test/README.md) for the
cell/sentinel format (`$type`, `$open`, `$closed`, `$required`, `$optional`,
`$expr`, `$discriminated`, `$jsonschema`, `$call`).

The `error` column holds the **complete** expected message and is compared
**exactly**. A substring check cannot see a wrong separator, a wrong error order
or an extra error — the ways the implementations actually drift.

## The differential harness (the wider net)

The corpus only covers rows someone wrote. `test/differential/` generates
thousands of `(spec, input)` pairs, runs each through all three implementations
and diffs the JSON Schema export, verdict, produced value and exact error text,
each port against the canonical build:

```sh
make diff        # sampled report, grouped by case family
make diff-full   # every mismatch
```

Run it after any behaviour change; CI runs it too, in the `parity` job.
Anything it finds should also become a corpus row in `test/gen-compat.js`, so
the committed gate keeps it closed. See
[`test/differential/README.md`](test/differential/README.md).

## Coverage bar

Aim for **100% line coverage** in every language.

```sh
# TypeScript — measure on the executed dist/shape.js (source maps mis-attribute
# the non-executable export{} block). Needs Node 22 or later: the coverage
# reporter throws on Node 20, which the package still supports:
cd ts && node --test --experimental-test-coverage dist-test/*.test.js

# Go:
cd go && go test -cover .

# Rust (cargo-llvm-cov; the lcov export merges the test binaries):
cd rs && ./cover.sh
```

- TypeScript: cover new logic with tests. Genuinely non-exercisable defensive
  branches may use `/* node:coverage disable */ … /* node:coverage enable */`
  (these survive compilation) with a one-line justification.
- Go: **has no line-ignore pragma.** Cover with tests, or remove provably-dead
  code. In-package tests (`package shape`) can call unexported helpers directly.
- Rust: likewise no pragma; restructure an unreachable arm (a `let … else`,
  an `is_some_and`) rather than leave a line no test can reach. `#[cfg(test)]`
  modules reach `pub(crate)` items directly.

## House style / gotchas

- **Numbers in Go** arrive as `float64` (JSON) but every numeric kind is accepted.
- **`undefined` vs `null`:** a missing key is "absent" (may default / be
  required); an explicit `nil` is a present null (a type error). Preserve this.
- **Key ordering:** Go maps are unordered, so object/argument specs sort keys
  alphabetically. Don't rely on insertion order in Go. Rust keeps insertion
  order (`indexmap`), as TypeScript does.
- **Rust builders consume their node** and return it; a compiled `Schema` is
  immutable. A wrong builder argument is a fault node, as in Go.
- **gofmt:** `expr.go` and `node.go` carry some original-port formatting that is
  not gofmt-clean; leave their unrelated regions as-is (don't reformat the whole
  file just to touch one function). `gofmt -w` any *new* file you add, and keep
  edited regions gofmt-clean. CI runs `go vet`, not `gofmt`.
- **Do not edit** `ts/dist`, `ts/dist-test`, or generated `test/*.tsv` by hand —
  rebuild / regenerate instead.
- **Version constants:** `ts/package.json` + the `VERSION` const in
  `ts/src/shape.ts` (kept in sync by `npm run version`), `const Version` in
  `go/shape.go`, and `version` in `rs/Cargo.toml`. The Publish workflow bumps
  all three; the Makefile `publish` targets bump the npm and Go ones.

## Publishing

The **Publish** workflow (`.github/workflows/publish.yml`) is run by hand from
the Actions tab or with `gh workflow run publish.yml -f npm=current -f go=current`.
Each input is `patch`, `minor`, `major`, an explicit `x.y.z`, `current` (publish
the version already in the tree) or `skip`. Only `main` is released. It builds
and tests every language,
then publishes npm with OpenID Connect trusted publishing (no token: npmjs.com
lists this repository and workflow as the package's trusted publisher), commits
and tags `ts/vX.Y.Z`, tags `go/vX.Y.Z` for the Go module, and publishes the
crate to crates.io with trusted publishing too (crates.io lists this
repository and workflow for the `shape-schema` crate; a crate not yet on
crates.io has no publisher to configure, so that step may fail and the publish
falls back to the `CARGO_REGISTRY_TOKEN` secret), committing and tagging
`rs/vX.Y.Z`, pushing all to `main`. A run that failed after `npm publish` is re-run with the same inputs:
a version already on the registry is not published again, and the tag, push and
release are each done only if missing. The Makefile `publish` targets are the
local equivalent for npm and Go and need npm credentials; the crate is only
published by the workflow (`make publish-rs-dry` checks its packaging).

## Docs

Documentation is [Diátaxis](https://diataxis.fr)-structured under `docs/`. When
you change behaviour, update the relevant reference/how-to page and, if it's a
parity-relevant difference, `docs/explanation/ts-go-parity.md`. The root
`README.md` is a slim landing page — keep it short and link into `docs/`.

The docs are published by `.github/workflows/pages.yml`, which runs
`site/build.js` (Markdown → HTML, links between pages rewritten, broken
links fail the build) and deploys `site/dist` to GitHub Pages together with
the performance report read from `bench/results/latest/`.
`docs/design/` is the exception: plans and other working documents live
there, the site skips the directory, and no documentation page may cite one.

**How the prose is written is normative too**, in
[`docs/STYLE-GUIDE.md`](docs/STYLE-GUIDE.md): the Diátaxis kinds, the voice,
the banned-phrase list, the punctuation rulings and the terminology. Two
gates enforce it, and both run in CI:

```sh
make lint-docs        # Vale: spelling, Google's rules, the banned list
make lint-docs-full   # the same, with warnings and suggestions
cd ts && npm test     # ts/test/docs.test.ts, the docs-style block
```

`make lint-docs` needs Vale 3.14.0 on the path plus one `vale sync` to fetch
the pinned Google package; `.github/workflows/docs.yml` does both. Levels
are set in `.vale.ini` and every demotion there records what the rule
produced on a clean run. The banned list is
`.vale/styles/config/vocabularies/Shape/reject.txt`, read by both gates so
they cannot drift.

## Benchmarks

`make bench` measures shape against other validators in every language and
files a run per language under `bench/results/runs/` — never edit or delete
a run file; `bench/results/latest/` is rebuilt from all of them. The
`Measure` workflow records runs from the hosted runners; CI runs
`make bench-smoke` so the benchmarks and every library's verdict stay
correct. See `bench/README.md`.

## Making a change — checklist

1. Change `ts/src/shape.ts` (canonical). Add/adjust a TS test.
2. If it's declarative behaviour, add a case to `test/gen-compat.js` and
   regenerate the corpus.
3. Mirror the change in `go/*.go` and `rs/src/*.rs`. Add a Go or Rust test
   if needed.
4. `make test` — all three languages green, including the corpus.
5. `make diff` — both ports agree with TypeScript on every generated case.
6. Keep coverage at the bar; run `go vet` and `make lint-rs cover-rs`.
7. Update `docs/` (and the parity page if relevant), to
   `docs/STYLE-GUIDE.md`; run `make lint-docs` and `npm test`.
8. Commit with a message that says which language(s) changed and why.

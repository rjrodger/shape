# CLAUDE.md

This file guides Claude Code (and other AI agents) working in this repository.
The full guide is **[AGENTS.md](AGENTS.md)** — read it. The essentials:

## Critical rules

1. **TypeScript is canonical.** `ts/src/shape.ts` defines behaviour; the Go port
   in `go/` and the Rust port in `rs/` must match it. Behaviour changes start in
   TypeScript, then are mirrored in Go and Rust — never the other way around.
2. **Keep the three languages at parity.** The shared corpus in `test/*.tsv` is
   the gate. After a declarative change: `make build-ts && node test/gen-compat.js`
   to regenerate it, then `make test` — all three must pass. Then `make diff`,
   the differential harness, which runs thousands of generated cases through
   all three and compares exact error text; promote anything it finds into a
   corpus row.
3. **Rebuild before testing TS.** Edits to `ts/src` require `npm run build`
   (output in the git-ignored `ts/dist` / `ts/dist-test`).
4. **Coverage bar is 100% lines** in every language. Go has no line-ignore
   pragma — cover with tests or remove provably-dead code. TS may use
   `/* node:coverage disable/enable */` for genuinely non-exercisable branches.
   Rust is measured by `rs/cover.sh` (cargo-llvm-cov, merged over the test
   binaries); restructure an unreachable arm rather than leave it.
5. **Document divergences** in `docs/explanation/ts-go-parity.md`; don't add
   silent ones.
6. **Prose has a gate too.** `docs/STYLE-GUIDE.md` is normative for `docs/`
   and the four READMEs; `make lint-docs` (Vale) and the `docs-style` block
   of `ts/test/docs.test.ts` both run in CI. Plans and other working
   documents go under `docs/design/`, and no documentation page cites one.

## Commands

```sh
make build          # build ts + go + rs
make test           # test ts + go + rs (includes the shared corpus)
make diff           # differential parity harness (make diff-full for detail)
make lint-rs cover-rs   # clippy -D warnings and the 100% line gate for rs
make lint-docs      # the prose gate (Vale 3.14.0 + one `vale sync`)
cd go && go vet ./... && go test -cover .
cd ts && node --test --experimental-test-coverage dist-test/*.test.js
cd rs && cargo test --all-features
```

## Layout

`ts/` canonical TypeScript · `go/` Go port · `rs/` Rust port · `docs/` Diátaxis docs
(plus `adr/`, `design/` plans, `STYLE-GUIDE.md`) ·
`test/` shared conformance corpus · `bench/` benchmarks and recorded runs ·
`site/` site generator (docs + perf report) · `AGENTS.md` full guide.

See [AGENTS.md](AGENTS.md) for the change checklist, gotchas (numbers,
undefined-vs-null, key ordering, gofmt), and the corpus format.

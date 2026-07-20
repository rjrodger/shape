# CLAUDE.md

This file guides Claude Code (and other AI agents) working in this repository.
The full guide is **[AGENTS.md](AGENTS.md)** — read it. The essentials:

## Critical rules

1. **TypeScript is canonical.** `ts/src/shape.ts` defines behaviour; the Go port
   in `go/` must match it. Behaviour changes start in TypeScript, then are
   mirrored in Go — never the other way around.
2. **Keep the two languages at parity.** The shared corpus in `test/*.tsv` is the
   gate. After a declarative change: `make build-ts && node test/gen-compat.js`
   to regenerate it, then `make test` — both languages must pass.
3. **Rebuild before testing TS.** Edits to `ts/src` require `npm run build`
   (output in the git-ignored `ts/dist` / `ts/dist-test`).
4. **Coverage bar is 100% lines** in both languages. Go has no line-ignore
   pragma — cover with tests or remove provably-dead code. TS may use
   `/* node:coverage disable/enable */` for genuinely non-exercisable branches.
5. **Document divergences** in `docs/explanation/ts-go-parity.md`; don't add
   silent ones.

## Commands

```sh
make build          # build ts + go
make test           # test ts + go (includes the shared corpus)
cd go && go vet ./... && go test -cover .
cd ts && node --test --experimental-test-coverage dist-test/**/*.test.js
```

## Layout

`ts/` canonical TypeScript · `go/` Go port · `docs/` Diátaxis docs ·
`test/` shared conformance corpus · `AGENTS.md` full guide.

See [AGENTS.md](AGENTS.md) for the change checklist, gotchas (numbers,
undefined-vs-null, key ordering, gofmt), and the corpus format.

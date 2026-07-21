# Agent & contributor guide

Guidance for humans and AI coding agents working on this repository. Read this
before making changes.

## What this repo is

`shape` is a schema-by-example validator with **two implementations kept at
behavioural parity**:

| Path      | Contents |
| --------- | -------- |
| `ts/`     | **Canonical** TypeScript implementation (`ts/src/shape.ts`) + tests. |
| `go/`     | Go port (`go/*.go`) + tests. |
| `docs/`   | [Diátaxis](https://diataxis.fr) documentation (tutorials / how-to / reference / explanation). |
| `test/`   | Shared, language-neutral conformance corpus (`*.tsv`) run by both languages. |
| `Makefile`| Top-level build/test/publish orchestration. |

## The golden rule: TypeScript is canonical

`ts/src/shape.ts` **defines the behaviour**. The Go port must match it.

- A behaviour change **starts in TypeScript**, then is mirrored in Go.
- Never "fix" a divergence by changing TypeScript to match Go without deciding
  that the TypeScript behaviour is wrong.
- Known, intentional divergences are documented in
  [`docs/explanation/ts-go-parity.md`](docs/explanation/ts-go-parity.md). Don't
  silently add new ones — document them there.

## Build & test

```sh
make build      # build ts + go
make test       # test ts + go (includes the shared corpus)

# or per-language:
make build-ts && make test-ts
make build-go  && make test-go
```

Direct commands:

```sh
# TypeScript (from ts/)
npm install && npm run build
node --test dist-test/**/*.test.js

# Go (from go/)
go build ./... && go vet ./... && go test ./...
```

Toolchain: Node 24+ (works on 22), Go 1.22+. TypeScript compiles to
`ts/dist/` and tests to `ts/dist-test/` (both git-ignored) — **always rebuild
after editing `ts/src`**.

## The shared conformance corpus (parity gate)

`test/*.tsv` pins TS↔Go parity. Cases are declared in `test/gen-compat.js`;
expected `output`/`error` columns are computed from the **canonical TS build**.

To add or change a parity case:

```sh
make build-ts                # gen-compat.js needs ts/dist
node test/gen-compat.js      # regenerate every test/*.tsv from canonical TS
make test                    # both languages must pass the new corpus
```

Both `ts/test/compat.test.ts` and `go/compat_tsv_test.go` glob and run every
`test/*.tsv`. See [`test/README.md`](test/README.md) for the cell/sentinel
format (`$type`, `$open`, `$closed`, `$required`, `$optional`, `$expr`).

## Coverage bar

Aim for **100% line coverage** in both languages.

```sh
# TypeScript — measure on the executed dist/shape.js (source maps mis-attribute
# the non-executable export{} block):
cd ts && node --test --experimental-test-coverage dist-test/**/*.test.js

# Go:
cd go && go test -cover .
```

- TypeScript: cover new logic with tests. Genuinely non-exercisable defensive
  branches may use `/* node:coverage disable */ … /* node:coverage enable */`
  (these survive compilation) with a one-line justification.
- Go: **has no line-ignore pragma.** Cover with tests, or remove provably-dead
  code. In-package tests (`package shape`) can call unexported helpers directly.

## House style / gotchas

- **Numbers in Go** arrive as `float64` (JSON) but every numeric kind is accepted.
- **`undefined` vs `null`:** a missing key is "absent" (may default / be
  required); an explicit `nil` is a present null (a type error). Preserve this.
- **Key ordering:** Go maps are unordered, so object/argument specs sort keys
  alphabetically. Don't rely on insertion order in Go.
- **gofmt:** `expr.go` and `node.go` carry some original-port formatting that is
  not gofmt-clean; leave their unrelated regions as-is (don't reformat the whole
  file just to touch one function). `gofmt -w` any *new* file you add, and keep
  edited regions gofmt-clean. CI runs `go vet`, not `gofmt`.
- **Do not edit** `ts/dist`, `ts/dist-test`, or generated `test/*.tsv` by hand —
  rebuild / regenerate instead.
- **Version constants:** `ts/package.json` + the `VERSION` const in
  `ts/src/shape.ts` (kept in sync by `npm run version`), and `const Version` in
  `go/shape.go`. The Makefile `publish` targets bump these.

## Docs

Documentation is [Diátaxis](https://diataxis.fr)-structured under `docs/`. When
you change behaviour, update the relevant reference/how-to page and, if it's a
parity-relevant difference, `docs/explanation/ts-go-parity.md`. The root
`README.md` is a slim landing page — keep it short and link into `docs/`.

## Making a change — checklist

1. Change `ts/src/shape.ts` (canonical). Add/adjust a TS test.
2. If it's declarative behaviour, add a case to `test/gen-compat.js` and
   regenerate the corpus.
3. Mirror the change in `go/*.go`. Add a Go test if needed.
4. `make test` — both languages green, including the corpus.
5. Keep coverage at the bar; run `go vet`.
6. Update `docs/` (and the parity page if relevant).
7. Commit with a message that says which language(s) changed and why.

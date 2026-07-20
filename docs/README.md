# Shape documentation

Shape is a **schema-by-example** validator: your schema looks (almost) exactly
like your data. It runs in JavaScript/TypeScript (browser and backend) and in
Go, with the two implementations kept at behavioural parity — TypeScript is the
canonical reference.

These docs follow the [Diátaxis](https://diataxis.fr) system. Pick the column
that matches what you need right now:

| I want to…                                   | Go to            |
| -------------------------------------------- | ---------------- |
| **learn** Shape by building something        | [Tutorials](#tutorials) |
| **solve a specific problem** step by step    | [How-to guides](#how-to-guides) |
| **look up** an exact builder, method or type | [Reference](#reference) |
| **understand** how and why Shape works       | [Explanation](#explanation) |

---

## Tutorials

Start here if you are new. Learning-oriented, worked end-to-end.

- [Getting started](tutorials/getting-started.md) — build and grow your first
  shape, in both TypeScript and Go.

## How-to guides

Goal-oriented recipes for a task you already have.

- [Validate options with defaults](how-to/validate-options-with-defaults.md)
- [Require fields](how-to/require-fields.md)
- [Validate objects and nesting](how-to/validate-objects.md)
- [Validate arrays and tuples](how-to/validate-arrays-and-tuples.md)
- [Add custom validation](how-to/add-custom-validation.md)
- [Compose shapes (One / Some / All / Exact)](how-to/compose-shapes.md)
- [Handle and collect errors](how-to/handle-and-collect-errors.md)
- [Rename, Define and Refer](how-to/rename-define-refer.md)
- [Use key and value expressions](how-to/use-key-and-value-expressions.md)
- [Use the string DSL (`expr` / `build`)](how-to/use-the-string-dsl.md)
- [Use Shape in Go](how-to/use-shape-in-go.md)
- [Use Shape in the browser](how-to/use-shape-in-the-browser.md)

## Reference

Dry, complete, look-it-up material.

- [Builder reference](reference/builders.md) — every builder, both languages.
- [Shape API](reference/shape-api.md) — compiling, validating, options.
- [Errors](reference/errors.md) — error objects and message format.
- [Shape nodes](reference/nodes.md) — the compiled node model.
- [TypeScript types](reference/typescript-types.md)
- [Go API](reference/go-api.md) — the Go surface and its idioms.

## Explanation

Background and design discussion.

- [Schema by example](explanation/schema-by-example.md) — the core idea.
- [How validation works](explanation/how-validation-works.md) — defaults,
  mutation, traversal, required/optional semantics.
- [TypeScript ↔ Go parity](explanation/ts-go-parity.md) — the parity contract,
  the shared conformance corpus, and known divergences.

---

## Conventions used in these docs

- **TS** examples use the npm package; **Go** examples use the Go module. Where
  behaviour is identical, only one is shown and the other language differs only
  in syntax (see the [Go API](reference/go-api.md) for the mapping).
- Runnable examples assume `const { Shape } = require('shape')` (TS/JS) or
  `import "github.com/rjrodger/shape/go"` (Go).
- The canonical behaviour is defined by the TypeScript implementation and pinned
  by the shared corpus in [`test/`](../test/README.md).

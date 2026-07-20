<a name="top"></a>

# Shape: An object shape validation utility.

[![npm version](https://img.shields.io/npm/v/shape.svg)](https://npmjs.com/package/shape)
[![build](https://github.com/rjrodger/shape/actions/workflows/build.yml/badge.svg)](https://github.com/rjrodger/shape/actions/workflows/build.yml)
[![Coverage Status](https://coveralls.io/repos/github/rjrodger/shape/badge.svg?branch=main)](https://coveralls.io/github/rjrodger/shape?branch=main)
[![Known Vulnerabilities](https://snyk.io/test/github/rjrodger/shape/badge.svg)](https://snyk.io/test/github/rjrodger/shape)
[![DeepScan grade](https://deepscan.io/api/teams/5016/projects/19509/branches/508695/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=5016&pid=19509&bid=508695)
[![Maintainability](https://api.codeclimate.com/v1/badges/de19e425771fb65e98e2/maintainability)](https://codeclimate.com/github/rjrodger/shape/maintainability)

| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
|---|---|

A schema validator in the tradition of [Joi](https://joi.dev) or
[JSON-Schema](https://json-schema.org/), but with a much nicer developer
experience. It runs in JavaScript and TypeScript — in the browser and on the
backend — and in [Go](go/README.md).

> **The big idea: your schema looks (almost) exactly like your data.**

```js
const { Shape } = require('shape')

const shape = Shape({
  port: 8080,        // optional, defaults to 8080, must be a number
  host: 'localhost', // optional, defaults to 'localhost', must be a string
  debug: Boolean,    // required, must be a boolean
})

shape({ debug: true })
// → { port: 8080, host: 'localhost', debug: true }
```

The same schema in Go:

```go
import "github.com/rjrodger/shape/go"

s := shape.MustShape(map[string]any{
    "port":  8080,
    "host":  "localhost",
    "debug": shape.Boolean,
})

out, _ := s.Validate(map[string]any{"debug": true})
// out == map[string]any{"port": 8080, "host": "localhost", "debug": true}
```

Literal values are **optional with a default**; type markers (`String`,
`Number`, `Boolean`, …) are **required**. Objects and arrays fill out and
validate to any depth.

## Install

```sh
npm install shape                       # JavaScript / TypeScript
go get github.com/rjrodger/shape/go     # Go (1.22+)
```

## Documentation

Full documentation, organized with the [Diátaxis](https://diataxis.fr) system,
lives in **[`docs/`](docs/README.md)**:

- **[Getting started](docs/tutorials/getting-started.md)** — build your first
  shape, step by step (TS and Go).
- **How-to guides** — [validate options](docs/how-to/validate-options-with-defaults.md),
  [require fields](docs/how-to/require-fields.md),
  [objects](docs/how-to/validate-objects.md),
  [arrays & tuples](docs/how-to/validate-arrays-and-tuples.md),
  [custom validation](docs/how-to/add-custom-validation.md),
  [composition](docs/how-to/compose-shapes.md),
  [errors](docs/how-to/handle-and-collect-errors.md), and
  [more](docs/README.md#how-to-guides).
- **Reference** — [builders](docs/reference/builders.md),
  [Shape API](docs/reference/shape-api.md),
  [errors](docs/reference/errors.md),
  [nodes](docs/reference/nodes.md),
  [TypeScript types](docs/reference/typescript-types.md),
  [Go API](docs/reference/go-api.md).
- **Explanation** — [schema by example](docs/explanation/schema-by-example.md),
  [how validation works](docs/explanation/how-validation-works.md),
  [TS ↔ Go parity](docs/explanation/ts-go-parity.md).

## Highlights

- Optional-by-default: a literal is its own default and type.
- Required fields via type markers.
- Deep object/array filling and validation.
- A rich, composable builder set (`Min`, `Max`, `One`, `Exact`, `Check`,
  `Rename`, `Refer`, …).
- A compact string DSL (`expr` / `build`) and inline key expressions.
- Detailed, path-aware error messages.
- TypeScript and Go implementations kept at behavioural parity by a
  [shared conformance corpus](test/README.md).

## Repository layout

| Path        | Contents |
| ----------- | -------- |
| `ts/`       | Canonical TypeScript implementation and tests. |
| `go/`       | Go port and tests. See [`go/README.md`](go/README.md). |
| `docs/`     | Diátaxis documentation. |
| `test/`     | Shared, language-neutral conformance corpus. |
| `AGENTS.md` | Contributor & AI-agent guide (build, test, parity rules). |

## Contributing

`make build` builds both languages; `make test` runs both test suites (including
the shared corpus). TypeScript is canonical — behaviour changes start there and
are mirrored in Go. See **[AGENTS.md](AGENTS.md)**.

## Credits

This module is inspired by [Joi](https://joi.dev), which I used for many years.
It also draws from the way [Vue](https://vuejs.com) does property validation.

## SHAPE

The name comes from a sort of in-joke in Irish politics. It is
[grotesque, unbelievable, bizarre and
unprecedented](https://en.wikipedia.org/wiki/SHAPE), that anyone would write yet
another validation library for JavaScript, let alone a third one! (See
[parambulator](https://github.com/rjrodger/parambulator) and
[norma](https://github.com/rjrodger/norma) — but don't use those, *Shape* is
better!). Also I like short names.

## License

Copyright (c) 2021-2024, Richard Rodger and other contributors.
Licensed under [MIT](./LICENSE).

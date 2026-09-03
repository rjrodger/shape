<a name="top"></a>

# Shape: An object shape validation utility.

[![npm version](https://img.shields.io/npm/v/shape.svg)](https://npmjs.com/package/shape)
[![build](https://github.com/rjrodger/shape/actions/workflows/ci.yml/badge.svg)](https://github.com/rjrodger/shape/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/rjrodger/shape/badge.svg?branch=main)](https://coveralls.io/github/rjrodger/shape?branch=main)
[![Known Vulnerabilities](https://snyk.io/test/github/rjrodger/shape/badge.svg)](https://snyk.io/test/github/rjrodger/shape)
[![DeepScan grade](https://deepscan.io/api/teams/5016/projects/19509/branches/508695/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=5016&pid=19509&bid=508695)

A schema validator in the tradition of [Joi](https://joi.dev) or
[JSON-Schema](https://json-schema.org/), but with a much nicer developer
experience. It runs in JavaScript and TypeScript—in the browser and on the
backend—in [Go](go/README.md) and in [Rust](rs/README.md).

> **The big idea: your schema looks (almost) exactly like your data.**

```js
const { Shape } = require('shape')

const shape = Shape({
  port: 8080,        // optional, defaults to 8080, must be a number
  host: 'localhost', // optional, defaults to 'localhost', must be a string
  debug: Boolean,    // required, must be a boolean
})

shape({ debug: true })
// → { debug: true, port: 8080, host: 'localhost' }
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

And in Rust:

```rust
use shape::{shape, Schema, Value};

let s = Schema::new(shape!({
    "port": 8080,
    "host": "localhost",
    "debug": Boolean,
}));

let out = s.validate(Value::from(serde_json::json!({ "debug": true })))?;
// out == { "debug": true, "port": 8080, "host": "localhost" }
```

Literal values are **optional with a default**; type markers (`String`,
`Number`, `Boolean`, …) are **required**. Objects and arrays fill out and
validate to any depth.

## Install

```sh
npm install shape                       # JavaScript / TypeScript
go get github.com/rjrodger/shape/go     # Go (1.22+)
cargo add shape-schema                  # Rust (1.75+)
```

## Documentation

Full documentation, organized with the [Diátaxis](https://diataxis.fr) system,
lives in **[`docs/`](docs/README.md)** and is published at
**[rjrodger.github.io/shape](https://rjrodger.github.io/shape/)**, along with
a [performance report](https://rjrodger.github.io/shape/perf/) comparing
shape to other validators across hosts and versions:

- **[Getting started](docs/tutorials/getting-started.md)**—build your first
  shape, step by step (TS and Go; Rust in its [how-to](docs/how-to/use-shape-in-rust.md)).
- **How-to guides**—[validate options](docs/how-to/validate-options-with-defaults.md),
  [require fields](docs/how-to/require-fields.md),
  [objects](docs/how-to/validate-objects.md),
  [arrays & tuples](docs/how-to/validate-arrays-and-tuples.md),
  [custom validation](docs/how-to/add-custom-validation.md),
  [composition](docs/how-to/compose-shapes.md),
  [coercion & formats](docs/how-to/coerce-and-formats.md),
  [errors](docs/how-to/handle-and-collect-errors.md),
  [JSON Schema export and import](docs/how-to/export-json-schema.md), and
  [more](docs/README.md#how-to-guides).
- **Reference**—[builders](docs/reference/builders.md),
  [Shape API](docs/reference/shape-api.md),
  [errors](docs/reference/errors.md),
  [nodes](docs/reference/nodes.md),
  [TypeScript types](docs/reference/typescript-types.md),
  [Go API](docs/reference/go-api.md),
  [Rust API](docs/reference/rust-api.md).
- **Explanation**—[schema by example](docs/explanation/schema-by-example.md),
  [how validation works](docs/explanation/how-validation-works.md),
  [TS ↔ Go ↔ Rust parity](docs/explanation/ts-go-parity.md).

## Highlights

- Optional-by-default: a literal is its own default and type.
- Required fields via type markers.
- Deep object/array filling and validation.
- A rich, composable builder set (`Min`, `Max`, `One`, `Exact`, `Check`,
  `Rename`, `Refer`, …).
- Coercion (`Coerce`), string formats (`Email`, `Url`, `Uuid`, `DateTime`,
  `Ip`), `Integer` and `Date` kinds, `Nullable`.
- Discriminated unions, and an object algebra (`Pick`, `Omit`, `Partial`,
  `Extend`) to build one shape out of another.
- `Catch` a failure with a fallback, `Transform` a valid value, `Describe` a
  node for tooling.
- JSON Schema export and import (draft 2020-12) and Standard Schema V1 interop.
- A compact string DSL (`expr` / `build`) and inline key expressions.
- Detailed, path-aware error messages.
- TypeScript, Go and Rust implementations kept at behavioural parity by a
  [shared conformance corpus](test/README.md) and a differential harness.
- Full TypeScript inference of the produced type through every builder, and
  Go structs accepted as values and as specs.
- [Benchmarks](bench/README.md) against Zod, Ajv, Joi and Valibot
  (TypeScript), validator, jsonschema and gojsonschema (Go), and garde,
  validator and jsonschema (Rust), recorded from several hosts on the
  [performance report](https://rjrodger.github.io/shape/perf/).

## Repository layout

| Path        | Contents |
| ----------- | -------- |
| `ts/`       | Canonical TypeScript implementation and tests. See [`ts/README.md`](ts/README.md). |
| `go/`       | Go port and tests. See [`go/README.md`](go/README.md). |
| `rs/`       | Rust port and tests. See [`rs/README.md`](rs/README.md). |
| `docs/`     | Diátaxis documentation. |
| `test/`     | Shared, language-neutral conformance corpus. |
| `bench/`    | Benchmarks against other validators and the recorded runs. See [`bench/README.md`](bench/README.md). |
| `site/`     | Builds the [project site](https://rjrodger.github.io/shape/): the docs and the performance report. |
| `AGENTS.md` | Contributor & AI-agent guide (build, test, parity rules). |

## Contributing

`make build` builds all three languages; `make test` runs all three test suites
(including the shared corpus); `make diff` runs the differential parity
harness, which puts thousands of generated cases through all three and
compares exact error text.
TypeScript is canonical—behaviour changes start there and are mirrored in Go
and Rust.
See **[AGENTS.md](AGENTS.md)**.

## Credits

This module is inspired by [Joi](https://joi.dev), which Richard Rodger used for
many years. It also draws from the way [Vue](https://vuejs.com) does property
validation.

## SHAPE

The name comes from a sort of in-joke in Irish politics. It is
[grotesque, unbelievable, bizarre and
unprecedented](https://en.wikipedia.org/wiki/SHAPE) that anyone would write yet
another validation library for JavaScript, let alone a third one. (See
[parambulator](https://github.com/rjrodger/parambulator) and
[norma](https://github.com/rjrodger/norma)—but don't use those; *Shape* is the
one that is maintained.) Short names help, too.

## License

Copyright (c) 2021-2024 Richard Rodger and other contributors.
Licensed under [MIT](./LICENSE).

| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
|---|---|

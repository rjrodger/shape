# How to use Shape as a Standard Schema

**Goal:** hand a Shape validator to any tool that speaks
[Standard Schema V1](https://standardschema.dev/) — a common, non-throwing
validation interface — or get the same result shape in Go.

## TypeScript / JavaScript: the `~standard` property

Every compiled shape exposes a `~standard` property implementing the Standard
Schema V1 interface, so libraries that accept a standard schema accept a Shape
directly.

```ts
import { Shape } from 'shape'
import type { StandardSchemaV1 } from 'shape'

const schema = Shape({ port: 8080, host: String })

const std = (schema as unknown as StandardSchemaV1)['~standard']
std.version   // 1
std.vendor    // 'shape'

const ok = std.validate({ host: 'localhost' })
// { value: { port: 8080, host: 'localhost' } }

const bad = std.validate({ host: 123 })
// { issues: [ { message: '…', path: ['host'] } ] }
```

`~standard.validate(value)` **never throws** — a failure is returned as
`{ issues }`, a success as `{ value }` (never both). Issue paths are arrays:
object keys are strings and array indices are numbers.

```ts
Shape([Number])['~standard'].validate([1, 'two'])
// { issues: [ { message: '…', path: [1] } ] }   // 1 is a number
```

## Go: the `Standard()` method

Go can't expose the JS `~standard` property, so a compiled schema offers the
equivalent surface via `Standard()`:

```go
s := shape.MustShape(map[string]any{"port": 8080, "host": shape.String})
std := s.Standard()

std.Version   // 1
std.Vendor    // "shape"

ok := std.Validate(map[string]any{"host": "localhost"})
// ok.Value == map[string]any{"port": 8080, "host": "localhost"}, ok.Issues == nil

bad := std.Validate(map[string]any{"host": 123})
// bad.Issues == []shape.StandardIssue{{Message: "…", Path: []any{"host"}}}
```

`Standard().Validate` never panics. `StandardResult` carries either `Value` (on
success) or `Issues` (on failure). Each `StandardIssue` has a `Message` and a
`Path` (`[]any`) where array indices are `int` and object keys are `string`.

```go
shape.MustShape([]any{shape.Number}).Standard().
    Validate([]any{1.0, "two"}).Issues[0].Path   // []any{1}  (int)
```

## Path arrays on errors

The underlying array-path is also available on every error, alongside the
dot-string path:

- **TS** — `ErrDesc.pathArr` (e.g. `['users', 0, 'email']`).
- **Go** — `FieldError.PathArr` (e.g. `[]any{"users", 0, "email"}`).

Unlike the dot-string `path`, the array form is unambiguous for keys that
contain dots.

## See also

- [Handle and collect errors](handle-and-collect-errors.md)
- [Errors reference](../reference/errors.md)

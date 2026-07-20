# Errors reference

## Failure model

- **TS** throws a `ShapeError` (a subclass of `TypeError`) unless you pass a
  collecting context (`{ err: [] }`) or suppress it (`{ err: false }`).
- **Go** returns a `*shape.ValidationError` from `Validate`/`ValidateCtx`, or a
  `[]shape.FieldError` from `Error`.

## `ShapeError` (TS)

| Member | Meaning |
| ------ | ------- |
| `message` | human-readable, all issues joined by newline, with any `prefix`/`suffix` |
| `code` | error code (`"shape"`) |
| `props` | `[{ path, what, type, value }]` summary per issue |
| `desc()` | `{ name, code, err, ctx }` where `err` is the full `ErrDesc[]` |
| `toJSON()` | JSON-serializable form |

## `ValidationError` (Go)

```go
type ValidationError struct { Issues []FieldError }
func (e *ValidationError) Error() string   // issues joined by "; "
```

## A single issue

TS calls it `ErrDesc`; Go calls it `FieldError`. The fields line up:

| TS `ErrDesc` | Go `FieldError` | Meaning |
| ------------ | --------------- | ------- |
| `key`   | `Key`   | the immediate key/index that failed |
| `path`  | `Path`  | dot-notation path from the root (e.g. `users.0.email`) |
| `pathArr` | `PathArr` | path as an array (array indices as numbers, keys as strings) — unambiguous for keys containing dots |
| `type`  | `Type`  | the node's type/kind |
| `value` | `Value` | the failing value |
| `why`   | `Why`   | why-code — see below |
| `check` | `Check` | the failing check/builder name |
| `mark`  | `Mark`  | numeric mark for pinpointing the source call site |
| `text`  | `Text`  | the rendered message |
| `use` / `args` | `Args` | extra context supplied by a custom check |

### Why-codes

`type`, `required`, `closed`, `check`, `never`, `regexp`, and the composition
codes `One`/`Some`/`All`/`Exact`. Built-in bounded checks (`Min`/`Max`/`Above`/
`Below`/`Len`) report `why: "check"` with the builder name in `check`.

## Message format

Default (structural) messages read:

```
Validation failed for <property|index> "<path>" with <kind> "<value>" because <reason>.
```

Examples:

```
Validation failed for property "name" with value "undefined" because the value is required.
Validation failed for index "1" with string "x" because the string is not of type number.
Validation failed for object "{a:2,b:true}" because the property "b" is not allowed.
```

Builder messages read:

```
Value "<value>" for property "<path>" must be a minimum of <n> (was <actual>).
Value "<value>" for property "<path>" must be exactly one of: admin, user
```

- A **missing** value renders as `undefined`; an explicit null renders as `null`.
- Values are rendered without inner quotes and truncated to 111 characters.
- Under an **array** parent the word `index` is used instead of `property`.

## Customising messages

- [`Fault(message, spec)`](builders.md#fault) overrides the structural message.
- A custom [`Check`](../how-to/add-custom-validation.md) sets `update.err`.
- `$VALUE` and `$PATH` in a custom message are expanded to the value and path.
- `ctx.prefix` / `ctx.suffix` (TS) wrap the whole thrown message.

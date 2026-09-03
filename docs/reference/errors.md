# Errors reference

## Failure model

- **TS** throws a `ShapeError` (a subclass of `TypeError`) unless you pass a
  collecting context (`{ err: [] }`) or suppress it (`{ err: false }`).
- **Go** returns a `*shape.ValidationError` from `Validate`/`ValidateCtx`, or a
  `[]shape.FieldError` from `Error`.
- `shape.error(value)` (TS) returns the issues themselves, `ErrDesc[]`, and
  `~standard.validate(value)` returns them as `{ issues: [{ message, path }] }`
  (`text` and `pathArr`)—see [Standard Schema](../how-to/use-as-standard-schema.md).

## `ShapeError` (TS)

| Member | Meaning |
| ------ | ------- |
| `message` | human-readable, all issues' `text` joined by newline, as `<shape name>: <ctx.prefix>: <issues> <ctx.suffix>`—each part only when set (a default `G$…` name is not shown) |
| `name` | `"ShapeError"` |
| `code` | error code (`"shape"`) |
| `gname` | the shape's name, as prefixed to `message` |
| `shape` | `true` |
| `props` | `[{ path, what, type, value }]` summary per issue (`what` is the why-code) |
| `desc()` | `{ name, code, err, ctx }` where `err` is the full `ErrDesc[]` |
| `toJSON()` | JSON-serializable form: the preceding fields plus `err`, `name` and `message` |

## `ValidationError` (Go)

```go
type ValidationError struct { Issues []FieldError }
func (e *ValidationError) Error() string   // issues joined by newline
```

## A single issue

TS calls it `ErrDesc` (the element type of `Context.err`; the name itself is
not exported); Go calls it `FieldError`. The fields line up:

| TS `ErrDesc` | Go `FieldError` | Meaning |
| ------------ | --------------- | ------- |
| `key`   | `Key`   | the immediate key/index that failed |
| `node`  | —       | the failing node (TS) |
| `path`  | `Path`  | dot-notation path from the root, such as `users.0.email` |
| `pathArr` | `PathArr` | path as an array (array indices as numbers, keys as strings)—unambiguous for keys containing dots |
| `type`  | `Type`  | the node's type/kind |
| `value` | `Value` | the failing value |
| `why`   | `Why`   | why-code—see [Why-codes](#why-codes) |
| `check` | `Check` | the name of the check/builder that was running (`none` for a structural error before any ran) |
| `mark`  | `Mark`  | numeric mark for pinpointing the source call site |
| `text`  | `Text`  | the rendered message |
| `use` / `args` | `Args` | extra context supplied by a custom check |

### Why-codes

`type`, `required`, `closed`, `check`, `never`, `regexp`, `Discriminated`, and
the format codes `Email`/`Url`/`Uuid`/`DateTime`/`Ip`/`Ipv4`/`Ipv6`. Built-in
bounded checks (`Min`/`Max`/`Above`/`Below`/`Len`) report `why: "check"` with
the builder name in `check`, and so do `One`/`Some`/`All`/`Exact` and a strict
`Refer` in TS. Go and Rust report the bounds and `One`/`Some`/`All`/`Exact`
under their own why-codes and marks (`why: "Min"`, mark 4011), which the
parity page lists as a divergence.
A custom validator sets its own with `update.why`, or through `makeErr`.
`Coerce` and `Catch` never raise; `Transform` and `Ignore` re-raise or swallow
whatever failed inside them.

## Message format

Default (structural) messages read:

```
Validation failed for <property|index> "<path>" with <kind> "<value>" because <reason>.
```

Examples:

```
Validation failed for property "name" because the property is missing.
Validation failed for index "1" because the element is missing.
Validation failed for value "undefined" because the value is required.
Validation failed for index "1" with string "x" because the string is not of type number.
Validation failed for property "a" with string "" because an empty string is not allowed.
Validation failed for object "{a:2,b:true}" because the property "b" is not allowed.
Validation failed for property "a" with object "{b:2,c:3,d:4}" because the properties "c, d" are not allowed.
Validation failed for array "[a,b]" because the index "1" is not allowed.
Validation failed for property "a" with string "b" because the string did not match /^a/.
Validation failed for property "a" with number "1" because no value is allowed.
Validation failed for property "a" with number "1" because check "big" failed.
Validation failed for property "a" with number "1" because check "boom" failed (threw: bad)
```

A custom check is named by its function name (`big`), or by its source text
when anonymous (`check "(v) => v > 1" failed`); one that throws appends the
exception's message. Builder messages read:

```
Value "<value>" for property "<path>" must be a minimum of <n> (was <actual>).
Value "<value>" for property "<path>" must be a minimum length of <n> (was <actual>).
Value "<value>" for property "<path>" must be exactly one of: admin, user
Value "<value>" for property "<path>" does not satisfy one of: String, Number
Value "<value>" for property "<path>" is not a valid email address.
```

A bound on a number reads `minimum of`/`maximum of`/`be above`/`be below`/
`exactly <n>`; on a string, array or object it reads `minimum length of`/
`maximum length of`/`have length above`/`have length below`/`exactly <n> in length`.

- A **missing** value renders as `undefined`; an explicit null renders as `null`
  and is described as `value` (`with value "null" because the value is not of
  type string`), as is `NaN`.
- Values are rendered without inner quotes and truncated to 111 characters.
- Under an **array** parent the word `index` is used instead of `property`, and
  a missing element is `the element is missing`.
- At the root there is no path, so the `for property "…"` clause is dropped.

## Customising messages

- [`Fault(message, spec)`](builders.md#required--optional--defaults) overrides the structural message.
- A custom [`Check`](../how-to/add-custom-validation.md) sets `update.err`.
- `$VALUE` and `$PATH` in a custom message are expanded to the value and path.
- `ctx.prefix` / `ctx.suffix` (TS) wrap the whole thrown message.

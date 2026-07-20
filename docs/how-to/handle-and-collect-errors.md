# How to handle and collect errors

**Goal:** react to validation failures — as an exception, a boolean, or a full
list of every problem.

## Default: fail fast

**TS** throws a `ShapeError`; **Go** returns an `error`.

**TS**

```js
try {
  Shape({ age: Number })({ age: 'old' })
} catch (err) {
  console.log(err.message)   // Validation failed for property "age" … not of type number.
}
```

**Go**

```go
out, err := shape.MustShape(map[string]any{"age": shape.Number}).Validate(
    map[string]any{"age": "old"})
if err != nil {
    // err is *shape.ValidationError
}
```

## Just a boolean

Use `match`/`Match` (no mutation, no error building) or `valid`/`Valid`.

```js
Shape({ age: Number }).match({ age: 21 })   // true
```

```go
s.Match(map[string]any{"age": 21.0})   // true
s.Valid(map[string]any{"age": 21.0})   // alias of Match
```

## Collect every error

**TS** — pass a context whose `err` is an array; Shape fills it instead of
throwing. Or call `shape.error(value)`.

```js
const shape = Shape({ a: Number, b: String })

const errs = []
shape({ a: 'x' }, { err: errs })
// errs: [ ErrDesc for a (type), ErrDesc for b (required) ]

// equivalent:
const errs2 = shape.error({ a: 'x' })
```

Set `{ err: false }` to suppress errors entirely (no throw, no collect).

**Go** — call `Error`, or pass a `*Context` to `ValidateCtx`.

```go
issues := s.Error(map[string]any{"a": "x"})   // []shape.FieldError, nil when valid

ctx := &shape.Context{}
_, err := s.ValidateCtx(input, ctx)
for _, issue := range ctx.Err {
    fmt.Printf("%s [%s]: %s\n", issue.Path, issue.Why, issue.Text)
}
```

## Inspect an error

Each issue carries structured fields (path, key, type, value, why-code, message).
The full field list is in the [errors reference](../reference/errors.md).

```js
const err = shape.error({ a: 'x' })[0]
err.path   // "a"
err.why    // "type"
err.text   // human message
```

## Customise messages

- [`Fault`](../reference/builders.md#fault) overrides the structural message for
  one node.
- A custom [`Check`](add-custom-validation.md) sets its own message via
  `update.err`.
- A `ShapeError` message can be prefixed/suffixed via `ctx.prefix` / `ctx.suffix`.

## See also

- [Errors reference](../reference/errors.md)
- [Add custom validation](add-custom-validation.md)

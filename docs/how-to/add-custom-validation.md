# How to add custom validation

**Goal:** enforce a rule that the built-in builders don't cover — a regular
expression, or arbitrary logic.

## Regular expressions

Pass a `RegExp` (TS) or `*regexp.Regexp` (Go) to `Check`.

**TS**

```js
const { Shape, Check } = require('shape')
const shape = Shape({ email: Check(/^.+@.+$/) })

shape({ email: 'a@b.co' })   // OK
shape({ email: 'nope' })     // throws: check "/^.+@.+$/" failed
```

**Go**

```go
import "regexp"

s := shape.MustShape(map[string]any{
    "email": shape.Check(regexp.MustCompile(`^.+@.+$`)),
})
```

> Go uses the RE2 engine; TypeScript uses the JavaScript engine. Stick to
> portable patterns if a schema must behave identically in both.

## A custom predicate

Pass a function to `Check`. Return `true` to pass. You may also read/replace the
value and set a custom error.

**TS**

```js
const shape = Shape({
  even: Check((val, update, state) => {
    if (typeof val !== 'number' || val % 2 !== 0) {
      update.err = 'must be an even number'
      return false
    }
    return true
  }),
})
```

**Go**

```go
s := shape.MustShape(map[string]any{
    "even": shape.Check(func(val any, u *shape.Update, s *shape.State) bool {
        n, ok := val.(float64)
        if !ok || int(n)%2 != 0 {
            u.Err = "must be an even number"
            return false
        }
        return true
    }),
})
```

The validator signature is the same in both languages:
`(val, update, state) => bool`. See
[Shape nodes](../reference/nodes.md) for the `update`/`state` fields.

## Before and after the structural checks

- [`Before`](../reference/builders.md#before) runs **before** the type check —
  use it to coerce or substitute a value.
- [`After`](../reference/builders.md#after) runs **after** — use it to validate
  the produced value.

```js
Shape({
  id: Before((val, update) => (update.val = String(val), true), String),
})
```

## Replace the message

Wrap any shape in [`Fault`](../reference/builders.md#fault) to override the
*structural* error text (custom-check messages are controlled by the check
itself):

```js
Shape({ port: Fault('port must be a number', Number) })
```

## See also

- [Compose shapes](compose-shapes.md) for `One` / `Some` / `All` / `Exact`.
- [Handle and collect errors](handle-and-collect-errors.md).

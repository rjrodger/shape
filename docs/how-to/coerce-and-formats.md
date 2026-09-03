# How to coerce values and check string formats

**Goal:** accept `"8080"` where a number is wanted, check that a string is an
email address or a URL, and replace or repair a value on its way through.

## Convert a value first: `Coerce`

`Coerce` converts the value to the node's kind before any other check, where the
conversion is unambiguous. Anything else is left alone, so the usual type error
still speaks.

**TS**

```js
const { Shape, Coerce, Integer } = require('shape')

const shape = Shape({
  port:    Coerce(Number),
  retries: Coerce(Integer),
  debug:   Coerce(Boolean),
  since:   Coerce(Date),
})

const ok = { port: '8080', retries: '3', debug: 'true', since: '2020-01-01T00:00:00Z' }
shape({ ...ok })
// → { port: 8080, retries: 3, debug: true, since: Date(2020-01-01T00:00:00Z) }

shape({ ...ok, port: '0x10' })
// throws: Validation failed for property "port" with string "0x10" because the string is not of type number.
shape({ ...ok, retries: '2.5' })
// throws: Validation failed for property "retries" with number "2.5" because the number is not of type integer.
```

**Go**

```go
s := shape.MustShape(map[string]any{
    "port":  shape.Coerce(shape.Number),
    "since": shape.Coerce(shape.Date),   // a time.Time
})
```

Coercion runs ahead of bounds as well: `Coerce(Min(2, Number))` given `"1"`
reports that `1` is below 2. The exact conversion table is in the
[builder reference](../reference/builders.md#coercion).

## Check a string format

Each format builder requires a string in that format; bare, it is a required
string.

```js
const { Shape, Email, Url, Uuid, DateTime, Ip, Ipv4, Ipv6, Optional, Min } = require('shape')

const shape = Shape({
  email:   Email,
  home:    Optional(Url),
  id:      Uuid,
  created: DateTime,
  addr:    Ip,               // v4 or v6; Ipv4 / Ipv6 for one family
  long:    Email(Min(10, String)),   // the bound is checked first
})

const valid = {
  email:   'ann@example.com',
  id:      '123e4567-e89b-12d3-a456-426614174000',
  created: '2020-01-01T00:00:00Z',
  addr:    '::1',
  long:    'long.name@example.com',
}
shape({ ...valid })                   // OK
shape({ ...valid, email: 'nope' })
// throws: Value "nope" for property "email" is not a valid email address.
```

A format only judges a present string: a missing value is still "required" and
a number is still "not of type string". Patterns are written for both regexp
engines, so a value passes or fails identically in TypeScript and Go.

## Repair, replace or describe: `Catch`, `Transform`, `Describe`

`Catch` replaces whatever fails inside — the node's own checks, its type, any
descendant — with a fallback and raises nothing:

```js
Shape({ port: Catch(8080, Min(1, Number)) })({ port: 'x' })   // → { port: 8080 }
```

`Transform` replaces a **valid** value with a function of it; an invalid one
fails as it would have:

```js
Shape({ name: Transform((v) => v.trim().toLowerCase(), String) })({ name: ' Bob ' })
// → { name: 'bob' }
```

`Describe` attaches text for tooling, without affecting validation:

```js
const n = Describe('the TCP port to listen on', Number)
n.m.description   // 'the TCP port to listen on'   (Go: n.Meta()["description"])
```

## See also

- [Builder reference](../reference/builders.md) — coercion table, formats,
  isolation.
- [Add custom validation](add-custom-validation.md) for `Check`, `Before` and
  `After`.

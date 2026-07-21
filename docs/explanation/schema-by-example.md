# Schema by example

## The big idea

> Your schema looks (almost) exactly like your data.

Most validators ask you to learn a second language — a JSON-Schema dialect, a
fluent builder chain, a DSL — and then describe your data in it. Shape inverts
that: you write an **example of the data** and it becomes the schema.

```js
{
  port: 8080,
  host: 'localhost',
}
```

read as a Shape spec means: `port` is a number defaulting to `8080`, `host` is a
string defaulting to `'localhost'`, both optional. The schema is as easy to read
as the data because it *is* the data.

## Why optional-by-default

The single most common validation task is "accept an options object, fill in the
missing bits". Shape optimizes for that: a literal value is optional and its own
default, and the default's type is what gets enforced. You only reach for extra
syntax when you need something beyond a defaulted value:

- a **required** field → use a type marker (`String`, `Number`, …)
- a **constraint** → wrap with a builder (`Min`, `Check`, …)
- **structure** rules → `Open`, `Closed`, `Child`, tuples

Simple things stay simple; complex things are possible.

## Compared to the alternatives

Shape is in the tradition of [Joi](https://joi.dev) and
[JSON-Schema](https://json-schema.org), but the developer experience is
different:

- **vs JSON-Schema** — no separate meta-language; the spec mirrors the data.
- **vs Joi** — no long builder chains for the common case; a literal is enough.
- **vs `Object.assign` / spread** — Shape fills defaults to *any depth*, not just
  the top level, and it validates types while doing so.

## Two implementations, one behaviour

Shape runs in TypeScript/JavaScript and in Go. The TypeScript implementation is
**canonical**: it defines the behaviour, and the Go port is verified against it
by a [shared conformance corpus](../../test/README.md). See
[TypeScript ↔ Go parity](ts-go-parity.md).

## Read next

- [How validation works](how-validation-works.md) — the mechanics.
- [Getting started](../tutorials/getting-started.md) — build one.

# How to validate options with defaults

**Goal:** accept a user options object, fill in any missing values, and reject
anything of the wrong type.

## Recipe

Write the spec as the object of default values. Each literal is optional and its
value is both the default and the required type.

**TS**

```js
const { Shape } = require('shape')

const applyOptions = Shape({
  port:    8080,
  host:    'localhost',
  retries: 3,
  verbose: false,
})

applyOptions({ port: 9090, verbose: true })
// → { port: 9090, host: 'localhost', retries: 3, verbose: true }
```

**Go**

```go
s := shape.MustShape(map[string]any{
    "port":    8080,
    "host":    "localhost",
    "retries": 3,
    "verbose": false,
})

out, _ := s.Validate(map[string]any{"port": 9090, "verbose": true})
```

## Notes

- A wrong type is rejected even though the field is optional:
  `applyOptions({ port: 'nope' })` fails with a type error.
- Nested option objects fill out recursively — declare them inline.
- Shape **mutates** the input to inject defaults (TS). If you need to keep the
  original untouched, clone it first. See
  [How validation works](../explanation/how-validation-works.md#mutation).
- The empty string is not a valid value for a string field by default. Use
  [`Empty`](../reference/builders.md#empty) to allow `""`.

## Make some options required

Mix literals (optional) and type markers (required) freely:

```js
Shape({
  apiKey: String,   // required
  region: 'us-east', // optional, defaults to 'us-east'
})
```

See [Require fields](require-fields.md).

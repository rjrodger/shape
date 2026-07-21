# How to use Shape in the browser

**Goal:** run the same shapes client-side.

Shape has no dependencies and runs unchanged in the browser.

## Bundled (recommended)

Import the module the usual way for your build tool and let your bundler include
it:

```js
import { Shape, Min, String } from 'shape'

const validate = Shape({ name: Min(1, String) })
```

This is the same API as on the backend — everything in these docs applies.

## Standalone script tag

A pre-minified build is published as `shape.min.js`. Loaded directly it exposes
a global `Shape` (which also carries the builders):

```html
<script src="shape.min.js"></script>
<script>
  const { Min, String } = Shape
  const validate = Shape({ name: Min(1, String) })
  console.log(validate({ name: 'ok' }))
</script>
```

## Notes

- The web entry point (`shape.web.js`) simply re-exports `Shape` as the module's
  default/global, so `Shape(...)` works and `Shape.Min`, `Shape.Open`, … are
  attached.
- Because Shape mutates its input to inject defaults, pass a fresh object if you
  need to preserve the original (browser objects are no different here).

## See also

- [Getting started](../tutorials/getting-started.md)
- [Shape API](../reference/shape-api.md)

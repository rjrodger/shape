# How to use Shape in the browser

**Goal:** run the same shapes client-side.

Shape has no dependencies and runs unchanged in the browser.

## Bundled (recommended)

Import the module the usual way for your build tool and let your bundler include
it:

```js
import { Shape, Min } from 'shape'

const validate = Shape({ name: Min(1, String) })
```

Type markers (`String`, `Number`, `Boolean`, …) are the built-in constructors,
not exports of the package.

This is the same API as on the backend—everything in these docs applies.
The package's `browser` field swaps Node's `util` (the one Node module
`shape.js` touches, only for `inspect`) for a one-line stub, so no polyfill is
needed.

## Standalone script tag

A pre-minified build is published as `dist/shape.min.js` (built by
`npm run build-web` with esbuild). Loaded directly it exposes a global `Shape`,
which also carries the builders; the same file is a CommonJS module if required:

```html
<script src="shape.min.js"></script>
<script>
  const { Min } = Shape
  const validate = Shape({ name: Min(1, String) })
  console.log(validate({ name: 'ok' }))
</script>
```

## Notes

- The web entry point (`src/shape.web.js`) simply re-exports `Shape` as the
  bundle's global, so `Shape(...)` works and `Shape.Min`, `Shape.Open`, … are
  attached. Node's `util` is replaced by a stub inside the bundle; nothing else
  is platform-specific.
- Because Shape mutates its input to inject defaults, pass a fresh object if you
  need to preserve the original (browser objects are no different here).

## See also

- [Getting started](../tutorials/getting-started.md)
- [Shape API](../reference/shape-api.md)

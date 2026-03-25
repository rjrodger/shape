# shape/go (experimental)

This folder contains an initial Go implementation of the `shape` schema-by-example validator.

## Current status
- Supports map/object schemas using `map[string]any`.
- Optional fields are inferred from literal defaults.
- Required fields are declared with sentinel tokens:
  - `shape.String`
  - `shape.Number`
  - `shape.Boolean`
  - `shape.Object`
  - `shape.Array`
- Supports object/array recursion and default injection.
- Objects are closed by default; use `shape.Open(...)` to allow unknown properties.

## Example

```go
package main

import (
  "fmt"
  "github.com/rjrodger/shape/go/shape"
)

func main() {
  schema := shape.MustShape(map[string]any{
    "port": 8080,
    "host": "localhost",
    "debug": shape.Boolean,
  })

  out, err := schema.Validate(map[string]any{
    "debug": true,
  })

  fmt.Println(out, err)
}
```

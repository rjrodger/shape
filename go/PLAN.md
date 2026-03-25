# Go Port Plan for `shape`

## Goals
- Recreate the current TypeScript validator behavior in Go with an API that still feels like “schema-by-example”.
- Preserve key semantics:
  - default injection for optional fields
  - required fields via type markers
  - object/array recursion
  - open vs closed object behavior
  - composable builders (`One`, `Min`, `Max`, etc.)

## Current TS behaviors to preserve
From `src/shape.ts` and README:
- Wrapper constructors (`String`, `Number`, `Boolean`, etc.) are interpreted as required type markers, while literal values become optional defaults.
- Constructor names are normalized through a type-native mapping and turned into internal node types.
- Rich builder map is exposed and attached onto the main `Shape` function.

## Proposed Go directory structure
```
go/
  README.md
  go.mod
  shape/
    schema.go          # user-facing API (Shape, builders)
    node.go            # internal normalized node model
    normalize.go       # nodize-equivalent
    validate.go        # validation engine + mutation/default-injection
    builders.go        # composable builder funcs
    error.go           # validation errors + formatting
    stringify.go       # schema stringify/debug
    tokens.go          # type-marker tokens (String/Number/Boolean...)
    expr.go            # optional expression parser parity layer
  examples/
    quick/main.go
  internal/testdata/
  shape_test.go
```

## Go API design (schema-by-example)
Primary API:
```go
compiled := shape.Shape(map[string]any{
  "port": 8080,         // optional + default
  "host": "localhost", // optional + default
  "debug": shape.Boolean, // required bool
})

out, err := compiled.Validate(input)
```

### Emulating TS `String` / `Number` / `Boolean` literal trick in Go
Go cannot use predeclared types (`string`, `int`, `bool`) as runtime values in map literals the way JS uses constructor values.
Use **exported sentinel values**:

- `shape.String`
- `shape.Number`
- `shape.Boolean`
- `shape.Object`
- `shape.Array`

Implementation approach:
- Define a private token type:
  - `type TypeToken struct { kind Kind }`
- Export singleton vars:
  - `var String = TypeToken{kind: KindString}`
  - `var Number = TypeToken{kind: KindNumber}`
  - etc.
- In normalization, detect `TypeToken` and mark node as required with empty/default zero values by kind.

Optional ergonomic layer:
- support `shape.Type[T]()` generic helper (`shape.Type[string]()`), useful where explicit type expression is preferred.
- support dot-import for users who want bare `String`/`Number` tokens in source:
  - `import . "github.com/.../shape"` (documented as optional due to namespace pollution).

## Type mapping strategy for `Number`
TS has a single `number`; Go has multiple numerics.
- Treat `shape.Number` as accepting all integer/float kinds (`int*`, `uint*`, `float*`) by default.
- Provide stricter builders:
  - `shape.Int`, `shape.Float64`, etc. (optional phase-2).

## Validation engine plan
1. Normalize user schema into `Node` tree (`normalize.go`).
2. Compile and cache immutable node graph in `Shape(...)`.
3. Validate input recursively:
   - inject defaults for missing optional values
   - enforce required markers
   - collect all errors
4. Return updated value + aggregated error type.

## Builders parity roadmap
Phase 1 (core parity):
- `Required`, `Optional`, `Open`, `Closed`, `One`, `Some`, `All`, `Any`, `Never`, `Min`, `Max`, `Len`, `Check`.

Phase 2 (advanced parity):
- `Before`, `After`, `Rename`, `Refer`, `Child`, `Default`, `Skip`, `Ignore`, `Rest`, key/value expression support.

## Testing strategy
- Port high-value cases from existing TS tests first:
  - required vs default behavior
  - object/array recursion
  - open/closed object handling
  - builder composition
- Add Go table-driven tests for token handling and numeric type acceptance.
- Add compatibility fixtures mirroring TS README examples.

## Milestones
1. **M1**: skeleton module + node model + normalize + basic validator.
2. **M2**: token sentinels (`String/Number/Boolean`) + required/default semantics.
3. **M3**: core builders + error aggregation + stringify.
4. **M4**: test parity against selected TS behavior.
5. **M5**: docs/examples and benchmark pass.

## Risks and mitigations
- **Numeric ambiguity** (`Number` in Go):
  - Mitigation: document broad numeric acceptance and provide strict numeric builders.
- **Mutation semantics in Go**:
  - Mitigation: define clear in-place vs copy behavior; likely return normalized output value rather than mutating arbitrary structs unless explicitly pointer-based.
- **DX drift from TS**:
  - Mitigation: keep sentinel names identical (`String`, `Number`, `Boolean`) and document dot-import option for bare-token style.

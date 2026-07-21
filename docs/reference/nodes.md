# Shape nodes reference

A compiled shape is a tree of **nodes**. You rarely touch nodes directly, but
custom validators receive an `Update` and a `State`, and introspection returns
the node tree.

## The node

`shape.node()` (TS) / `s.Node()` (Go) returns the root node. Key TS node fields:

| Field | Meaning |
| ----- | ------- |
| `t` | type name (`string`, `number`, `object`, `array`, `any`, `list`, `check`, …) |
| `v` | defining value |
| `f` | default value, if any |
| `r` | required |
| `p` | skippable (optional, no default injection) |
| `c` | default child shape (open objects / arrays) |
| `k` | final property keys, in order |
| `e` | whether match failures are reported as errors |
| `b` / `a` | before / after validator lists |
| `u` / `m` | user data / metadata |
| `z` | custom (Fault) message |

Go stores the equivalent on an unexported `node`; use `s.Spec()` for a
JSON-friendly view, or `Node.Inner()` / `Node.Kind()` for a compiled builder.

## `Update` — what a validator returns through

A custom validator (`Check`/`Before`/`After`) fills in an `update`:

| TS `Update` | Go `Update` | Meaning |
| ----------- | ----------- | ------- |
| `done` | `Done` | stop running further checks on this node |
| `val` | `Val` (+ `HasVal`) | replace the value |
| `uval` | — | replace with `undefined`/`NaN` (TS) |
| `node` | `Node` | swap in a different node (used by `Refer`) |
| `type` | — | override the type (TS) |
| `err` | `Err` | a message string, an error object, or a list of them |
| `why` | `Why` | why-code for the failure |
| `fatal` | — | force the error to be reported even under `Ignore` (TS) |

Return `true` to pass, `false` to fail. Setting `update.err` implies failure.

## `State` — the current cursor

Read-only context for a validator:

| TS `State` | Go `State` | Meaning |
| ---------- | ---------- | ------- |
| `val` | `Value` | current value |
| `key` | `Key` | current key/index |
| `path` | `Path` | path stack from the root |
| `node` | `Node` | current node |
| `parent` | `Parent` | parent container |
| `match` | `Match` | true during `match`/`Match` (no mutation) |
| `ctx` | `Ctx` | the validation context (your custom fields live here) |
| `curerr` | — | errors accumulated for the current node (TS) |

## Example

```js
const { Shape, Check } = require('shape')

Shape({
  slug: Check((val, update, state) => {
    if (typeof val !== 'string') { update.err = 'slug must be a string'; return false }
    update.val = val.toLowerCase()   // normalize
    return true
  }),
})
```

See [Add custom validation](../how-to/add-custom-validation.md).

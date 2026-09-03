# Shape nodes reference

A compiled shape is a tree of **nodes**. You rarely touch nodes directly, but
custom validators receive an `Update` and a `State`, and introspection returns
the node tree.

## The node

`shape.node()` (TS) / `s.Node()` (Go) returns the root node. Key TS node fields:

| Field | Meaning |
| ----- | ------- |
| `$` | marker that the value is a compiled node (`Shape.isShape` tests the same marker on a shape) |
| `t` | type name (`string`, `number`, `object`, `array`, `any`, `list`, `check`, …) |
| `d` | depth in the tree (the root is 0) |
| `v` | defining value |
| `f` | default value, if any |
| `n` | number of keys in the defining value |
| `r` | required |
| `p` | skippable (optional, no default injection) |
| `c` | default child shape (open objects / arrays) |
| `k` | final property keys, in order |
| `e` | whether match failures are reported as errors (`false` under `Ignore`) |
| `b` / `a` | before / after validator lists |
| `u` / `m` | user data / metadata — `u.nullable` for `Nullable`, `u.empty` for `Empty`, `u.list` and `u.discriminated` for a composition's branches, `m.description` for `Describe`, `m.rest` for `Rest` |
| `z` | custom (Fault) message |

The remaining keys are the chainable builder methods (`node.Min(2)`).

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
| `nI` / `sI` / `pI` | — | traversal cursor overrides; internal (TS) |

Return `true` to pass, `false` to fail. Setting `update.err` implies failure,
and a failed check also sets `done` unless the validator set it itself, so the
node's structural check is skipped — the other validators on the node still run.
A `Check` validator is not called for an absent (`undefined`) value; `Before`
and `After` validators are.

## `State` — the current cursor

Read-only context for a validator:

| TS `State` | Go `State` | Meaning |
| ---------- | ---------- | ------- |
| `val` | `Value` | current value |
| `valType` | — | the type name of `val` as Shape sees it (TS) |
| `key` | `Key` | current key/index |
| `path` | `Path` | path stack from the root |
| `node` | `Node` | current node |
| `parent` | `Parent` | parent container |
| `root` | — | the value passed to the shape (TS) |
| `ancestors` | — | the nodes from the root down to the current one (TS) |
| `match` | `Match` | true during `match`/`Match` (no mutation) |
| `fromDflt` | — | true when `val` was just injected from a default (TS) |
| `ctx` | `Ctx` | the validation context (your custom fields live here) |
| `curerr` | — | errors accumulated for the current node (TS) |
| `err` | — | errors accumulated for the whole run so far (TS) |

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

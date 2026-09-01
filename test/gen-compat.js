'use strict'
// Generator for the shared, language-neutral conformance corpus in this folder.
//
// Each *.tsv file here is consumed by BOTH the TypeScript harness
// (ts/test/compat.test.ts) and the Go harness (go/compat_tsv_test.go). Expected
// output/error columns are computed from the CANONICAL TypeScript build, so TS
// passes by construction and Go is measured against it — this is the parity gate.
//
// Regenerate after changing cases (run from the repo root or ts/):
//   node test/gen-compat.js
//
// Cell format (JSON, with sentinels decoded identically by both harnesses):
//   {"$type":"String"}  required type token
//   {"$open":X} {"$closed":X} {"$required":X} {"$optional":X}
//   {"$expr":"Min(2,String)"}  compile the string DSL
//   anything else is raw JSON
// A key of the form "name: Min(1)" exercises key-expression parsing.
//
// The `error` column holds the COMPLETE expected message as a JSON string, and
// both harnesses compare it exactly.

const path = require('path')
const fs = require('fs')

const S = require(path.join(__dirname, '..', 'ts', 'dist', 'shape.js'))
const Shape = S.Shape ? S.Shape : S

const { decodeSpec: decode } = require(path.join(__dirname, 'decode-spec.js'))
const decodeSpec = (v) => decode(v, Shape)

const T = { $type: 'String' }, N = { $type: 'Number' }, B = { $type: 'Boolean' }

// Cases grouped by file. Each case: [name, spec, input].
const files = {
  defaults: [
    ['default-injection', { port: 8080, host: 'localhost' }, { port: 9090 }],
    ['default-deep', { server: { port: 8080, host: 'localhost' } }, {}],
    ['required-token-missing', { name: T }, {}],
    ['required-token-present', { name: T }, { name: 'alice' }],
    ['optional-absent', { name: { $optional: T } }, {}],
    ['required-number-wrong-type', { age: N }, { age: 'x' }],
  ],
  objects: [
    ['closed-object-rejects-unknown', { a: 1 }, { a: 2, b: true }],
    ['open-object-allows-unknown', { $open: { a: 1 } }, { a: 2, b: 9 }],
    ['empty-object-is-open', {}, { a: 1, b: 2 }],
    ['child-number', { $expr: 'Child(Number)' }, { a: 1, b: 2 }],
    ['child-number-bad', { $expr: 'Child(Number)' }, { a: 1, b: 'x' }],
    ['nested-closed-rejects', { a: { b: 1 } }, { a: { b: 2, c: 3 } }],
    ['nested-required-absent-parent', { a: { b: N } }, {}],
    ['nested-required-empty-parent', { a: { b: N } }, { a: {} }],
    ['nested-required-deep-absent', { a: { b: { c: N } } }, {}],
    ['nested-required-deep-partial', { a: { b: { c: N } } }, { a: {} }],
    ['nested-required-sibling', { a: { b: T }, c: N }, { c: 1 }],
    ['nested-default-absent-parent-ok', { a: { b: 1 } }, {}],
    ['container-type-fail-single-error', { a: T }, 1],
    ['multi-error-order', { a: T }, { b: 2 }],
    ['multi-error-order-2', { a: T }, { a: 1, b: 2 }],
  ],
  arrays: [
    ['array-of-number', [N], [1, 2, 3]],
    ['array-of-number-bad', [N], [1, 'x']],
    ['array-empty-default', [N], []],
    ['tuple-fixed', [N, T], [1, 'a']],
    ['tuple-fixed-too-long', [N, T], [1, 'a', 2]],
    ['tuple-fixed-too-long-2', [N, T], [1, 'a', 2, 3]],
    ['tuple-fixed-bad', [N, T], [1, 2]],
    ['array-rest', { $expr: 'Rest(Number)' }, [1, 2, 3]],
    ['array-rest-bad-element', { $expr: 'Rest(Number)' }, [1, 'x']],
    ['array-rest-first-bad', { $expr: 'Rest(Number)' }, ['x']],
    ['array-rest-null-element', { $expr: 'Rest(Number)' }, [1, null]],
    ['array-rest-string', { $expr: 'Rest(String)' }, ['a', 'b']],
    ['array-rest-string-bad', { $expr: 'Rest(String)' }, ['a', 2]],
  ],
  builders: [
    ['dsl-type-chain-fail', { a: { $expr: 'Min(2).Array' } }, { a: [1] }],
    ['dsl-type-chain-ok', { a: { $expr: 'Min(2).Array' } }, { a: [1, 2] }],
    ['min-number-ok', { a: { $expr: 'Min(3,Number)' } }, { a: 5 }],
    ['min-number-fail', { a: { $expr: 'Min(3,Number)' } }, { a: 1 }],
    ['max-number-fail', { a: { $expr: 'Max(3,Number)' } }, { a: 9 }],
    ['above-number-fail', { a: { $expr: 'Above(3,Number)' } }, { a: 3 }],
    ['below-number-fail', { a: { $expr: 'Below(3,Number)' } }, { a: 3 }],
    ['len-number-fail', { a: { $expr: 'Len(3,Number)' } }, { a: 4 }],
    ['min-string-fail', { a: { $expr: 'Min(3,String)' } }, { a: 'hi' }],
    ['max-string-fail', { a: { $expr: 'Max(2,String)' } }, { a: 'hey' }],
    ['len-string-ok', { a: { $expr: 'Len(3,String)' } }, { a: 'abc' }],
    ['len-string-fail', { a: { $expr: 'Len(3,String)' } }, { a: 'ab' }],
    ['min-array-fail', { a: { $expr: 'Min(2)' } }, { a: [1] }],
    ['exact-ok', { role: { $expr: 'Exact("admin","user")' } }, { role: 'user' }],
    ['exact-fail', { role: { $expr: 'Exact("admin","user")' } }, { role: 'root' }],
    ['skip-absent', { a: { $expr: 'Skip(Number)' } }, {}],
    ['ignore-bad-dropped', { a: { $expr: 'Ignore(Number)' } }, { a: 'x' }],
    ['ignore-good-kept', { a: { $expr: 'Ignore(Number)' } }, { a: 5 }],
    ['default-explicit', { a: { $expr: 'Default(7,Number)' } }, {}],
    ['empty-string-allowed', { a: { $expr: 'Empty' } }, { a: '' }],
    ['empty-string-rejected', { a: T }, { a: '' }],
    ['never-fails', { a: { $expr: 'Never' } }, { a: 1 }],
    ['type-number-ok', { a: { $expr: 'Type(Number)' } }, { a: 3 }],
    ['type-number-fail', { a: { $expr: 'Type(Number)' } }, { a: 'x' }],
    ['type-string-fail', { a: { $expr: 'Type(String)' } }, { a: 3 }],
    ['type-chain-object-fail', { $expr: 'Type(Object)' }, 1],
    ['ignore-root-bad-dropped', { $expr: 'Ignore(Number)' }, 'x'],
    ['ignore-root-good-kept', { $expr: 'Ignore(Number)' }, 5],
    ['any-token-accepts-number', { a: { $type: 'Any' } }, { a: 1 }],
    ['any-token-accepts-null', { a: { $type: 'Any' } }, { a: null }],
    ['any-token-accepts-object', { a: { $type: 'Any' } }, { a: { b: 1 } }],
    ['never-absent-key', { a: { $expr: 'Never(String)' } }, {}],
    ['empty-string-literal-spec', '', ''],
    ['optional-expr-absent', { a: { $expr: 'Optional(String)' } }, {}],
    ['min-string-type-mismatch', { a: { $expr: 'Min(2,String)' } }, { a: 1 }],
    ['min-string-type-mismatch-array', { a: { $expr: 'Min(2,String)' } }, { a: [1, 2, 3] }],
    ['len-array-chain-fail', { a: { $expr: 'Len(2).Array' } }, { a: [1] }],
  ],
  composition: [
    ['one-of-ok', { a: { $expr: 'One(Number,String)' } }, { a: 'x' }],
    ['one-of-fail', { a: { $expr: 'One(Number,String)' } }, { a: true }],
    ['some-of-ok', { a: { $expr: 'Some(Number,String)' } }, { a: 5 }],
    ['all-of-fail-message', { a: { $expr: 'All(Number,Min(2))' } }, { a: 1 }],
    ['all-of-ok', { a: { $expr: 'All(Number,Min(2))' } }, { a: 5 }],
    ['some-of-fail', { a: { $expr: 'Some(Number,String)' } }, { a: true }],
  ],
  checks: [
    ['regexp-ok', { a: { $expr: 'Check(/^a.+/)' } }, { a: 'abc' }],
    ['regexp-fail', { a: { $expr: 'Check(/^a.+/)' } }, { a: 'zzz' }],
    ['regexp-check-nonstring', { a: { $expr: 'Check(/^a.+/)' } }, { a: 1 }],
    ['regexp-bare-nonstring', { a: { $expr: '/^a.+/' } }, { a: 1 }],
    ['regexp-bare-ok', { a: { $expr: '/^a.+/' } }, { a: 'abc' }],
  ],
  keyexpr: [
    ['keyexpr-min', { 'name: Min(1)': T }, { name: 'x' }],
    ['keyexpr-min-fail', { 'name: Min(2)': T }, { name: 'x' }],
  ],
  misc: [
    ['null-required', { a: { $expr: 'null' } }, { a: null }],
    ['nested-path', { user: { addr: { zip: N } } }, { user: { addr: { zip: 'x' } } }],
    ['key-parent', { a: { b: { $expr: 'Key' } } }, { a: { b: 'V' } }],
    ['key-depth-dsl', { a: { b: { $expr: 'Key(1)' } } }, { a: { b: 'V' } }],
    ['exact-null-rendering', { a: { $expr: 'Exact(1,null)' } }, { a: 0 }],
    ['exact-mixed-rendering', { a: { $expr: 'Exact(1,"a",true,null)' } }, { a: 0 }],
  ],
}

function rowFor(name, spec, input) {
  const schema = Shape(decodeSpec(spec))
  let outCell = ''
  let errCell = ''
  try {
    const out = schema(structuredClone(input))
    // Normalize undefined to null exactly as both harnesses do when they
    // compare, so a builder that drops its value (Ignore, Skip) is expressible.
    outCell = JSON.stringify(undefined === out ? null : out)
  }
  catch (e) {
    // The WHOLE message, JSON-encoded. Exact comparison is the point: a
    // substring check cannot see a wrong separator, a wrong error order or an
    // extra error, and those are precisely the ways the two languages drift.
    // JSON encoding also keeps embedded newlines out of the TSV row.
    errCell = JSON.stringify(e.message)
  }
  return [name, JSON.stringify(spec), JSON.stringify(input), outCell, errCell]
}

const header = ['name', 'spec', 'input', 'output', 'error']
for (const [file, cases] of Object.entries(files)) {
  const rows = [header, ...cases.map(c => rowFor(c[0], c[1], c[2]))]
  const dest = path.join(__dirname, file + '.tsv')
  fs.writeFileSync(dest, rows.map(r => r.join('\t')).join('\n') + '\n')
  process.stdout.write('wrote ' + dest + ' (' + cases.length + ' rows)\n')
}

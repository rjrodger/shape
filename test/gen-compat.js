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

const path = require('path')
const fs = require('fs')

const S = require(path.join(__dirname, '..', 'ts', 'dist', 'shape.js'))
const Shape = S.Shape ? S.Shape : S

function decodeSpec(v) {
  if (Array.isArray(v)) return v.map(decodeSpec)
  if (v != null && 'object' === typeof v) {
    const keys = Object.keys(v)
    if (1 === keys.length) {
      const k = keys[0]
      if ('$type' === k) {
        const native = { String, Number, Boolean, Object, Array, Symbol, Function }
        return native[v.$type] || Shape[v.$type]
      }
      if ('$open' === k) return Shape.Open(decodeSpec(v.$open))
      if ('$closed' === k) return Shape.Closed(decodeSpec(v.$closed))
      if ('$required' === k) return Shape.Required(decodeSpec(v.$required))
      if ('$optional' === k) return Shape.Optional(decodeSpec(v.$optional))
      if ('$expr' === k) return Shape.expr(v.$expr)
    }
    const out = {}
    for (const kk of keys) out[kk] = decodeSpec(v[kk])
    return out
  }
  return v
}

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
  ],
  composition: [
    ['one-of-ok', { a: { $expr: 'One(Number,String)' } }, { a: 'x' }],
    ['one-of-fail', { a: { $expr: 'One(Number,String)' } }, { a: true }],
    ['some-of-ok', { a: { $expr: 'Some(Number,String)' } }, { a: 5 }],
  ],
  checks: [
    ['regexp-ok', { a: { $expr: 'Check(/^a.+/)' } }, { a: 'abc' }],
    ['regexp-fail', { a: { $expr: 'Check(/^a.+/)' } }, { a: 'zzz' }],
  ],
  keyexpr: [
    ['keyexpr-min', { 'name: Min(1)': T }, { name: 'x' }],
    ['keyexpr-min-fail', { 'name: Min(2)': T }, { name: 'x' }],
  ],
  misc: [
    ['null-required', { a: { $expr: 'null' } }, { a: null }],
    ['nested-path', { user: { addr: { zip: N } } }, { user: { addr: { zip: 'x' } } }],
    ['key-parent', { a: { b: { $expr: 'Key' } } }, { a: { b: 'V' } }],
  ],
}

function rowFor(name, spec, input) {
  const schema = Shape(decodeSpec(spec))
  let outCell = ''
  let errCell = ''
  try {
    const out = schema(structuredClone(input))
    outCell = JSON.stringify(out)
  }
  catch (e) {
    const first = e.desc && e.desc().err && e.desc().err[0]
    errCell = first ? first.text : e.message
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

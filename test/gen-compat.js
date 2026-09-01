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
const I = { $type: 'Integer' }, D = { $type: 'Date' }
// A discriminated union over the "kind" property; each branch gets the tag added.
const DISC = { $discriminated: ['kind', { dog: { bark: B }, fish: { fins: N } }] }
// A closed object for the object algebra: a and b required, c optional.
const BASE = { a: N, b: T, c: { $optional: B } }

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
    ['closed-one-extra-key', { a: 1 }, { a: 1, b: 2 }],
    ['closed-two-extra-keys', { a: 1 }, { a: 1, b: 2, c: 3 }],
    ['closed-three-extra-keys', { a: 1 }, { a: 1, b: 2, c: 3, d: 4 }],
    ['child-ignore-drops-bad', { $expr: 'Child(Ignore(Number))' }, { a: 'x', b: 1 }],
    ['child-ignore-keeps-good', { $expr: 'Child(Ignore(Number))' }, { a: 1, b: 2 }],
    ['child-ignore-bound', { $expr: 'Child(Ignore(Min(2,Number)))' }, { a: 1, b: 3 }],
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
    ['array-ignore-drops-bad', [{ $expr: 'Ignore(Number)' }], [1, 'x']],
    ['array-ignore-keeps-good', [{ $expr: 'Ignore(Number)' }], [1, 2]],
    ['array-ignore-bound', [{ $expr: 'Ignore(Min(2,Number))' }], [1, 3]],
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
    ['empty-bare-is-untyped', { a: { $expr: 'Empty' } }, { a: 0 }],
    ['empty-bare-allows-empty-string', { a: { $expr: 'Empty' } }, { a: '' }],
    ['ignore-empty-keeps-number', { a: { $expr: 'Ignore(Empty)' } }, { a: 0 }],
    ['empty-string-literal-spec', '', ''],
    ['optional-expr-absent', { a: { $expr: 'Optional(String)' } }, {}],
    ['min-string-type-mismatch', { a: { $expr: 'Min(2,String)' } }, { a: 1 }],
    ['min-string-type-mismatch-array', { a: { $expr: 'Min(2,String)' } }, { a: [1, 2, 3] }],
    ['len-array-chain-fail', { a: { $expr: 'Len(2).Array' } }, { a: [1] }],
    ['integer-ok', { a: I }, { a: 5 }],
    ['integer-fraction-fails', { a: I }, { a: 1.5 }],
    ['integer-string-fails', { a: I }, { a: '5' }],
    ['integer-required', { a: I }, {}],
    ['integer-optional-default', { a: { $expr: 'Optional(Integer)' } }, {}],
    ['integer-min-type-first', { a: { $expr: 'Min(2,Integer)' } }, { a: 1.5 }],
    ['integer-min-bound', { a: { $expr: 'Min(2,Integer)' } }, { a: 1 }],
    ['date-string-fails', { a: D }, { a: 'x' }],
    ['date-number-fails', { a: D }, { a: 1 }],
    ['date-required', { a: D }, {}],
    ['nullable-null-ok', { a: { $expr: 'Nullable(Number)' } }, { a: null }],
    ['nullable-value-ok', { a: { $expr: 'Nullable(Number)' } }, { a: 5 }],
    ['nullable-wrong-type', { a: { $expr: 'Nullable(Number)' } }, { a: 'x' }],
    ['nullable-still-required', { a: { $expr: 'Nullable(Number)' } }, {}],
    ['nullable-optional-absent', { a: { $expr: 'Optional(Nullable(Number))' } }, {}],
    ['nullable-object-null', { a: { $expr: 'Nullable(Closed({}))' } }, { a: null }],
    ['token-args-apply', { a: { $expr: 'String(Min(2))' } }, { a: 'a' }],
    ['coerce-number-from-string', { a: { $expr: 'Coerce(Number)' } }, { a: '5' }],
    ['coerce-number-from-bool', { a: { $expr: 'Coerce(Number)' } }, { a: true }],
    ['coerce-number-bad-string', { a: { $expr: 'Coerce(Number)' } }, { a: 'x' }],
    ['coerce-number-hex-not-coerced', { a: { $expr: 'Coerce(Number)' } }, { a: '0x10' }],
    ['coerce-integer-fraction-string', { a: { $expr: 'Coerce(Integer)' } }, { a: '5.5' }],
    ['coerce-string-from-number', { a: { $expr: 'Coerce(String)' } }, { a: 1.5 }],
    ['coerce-string-from-large-number', { a: { $expr: 'Coerce(String)' } }, { a: 1000000 }],
    ['coerce-string-from-bool', { a: { $expr: 'Coerce(String)' } }, { a: false }],
    ['coerce-boolean-from-string', { a: { $expr: 'Coerce(Boolean)' } }, { a: ' TRUE ' }],
    ['coerce-boolean-from-number', { a: { $expr: 'Coerce(Boolean)' } }, { a: 0 }],
    ['coerce-boolean-bad', { a: { $expr: 'Coerce(Boolean)' } }, { a: 'yes' }],
    ['coerce-date-from-iso', { a: { $expr: 'Coerce(Date)' } }, { a: '2020-01-01T00:00:00Z' }],
    ['coerce-date-with-offset', { a: { $expr: 'Coerce(Date)' } }, { a: '2020-01-01T12:30:00.5+02:00' }],
    ['coerce-date-invalid-day', { a: { $expr: 'Coerce(Date)' } }, { a: '2020-02-30T00:00:00Z' }],
    ['coerce-date-from-millis', { a: { $expr: 'Coerce(Date)' } }, { a: 1577836800000 }],
    ['coerce-before-bound', { a: { $expr: 'Coerce(Min(2,Number))' } }, { a: '1' }],
    ['format-email-ok', { a: { $expr: 'Email' } }, { a: 'a@b.co' }],
    ['format-email-bad', { a: { $expr: 'Email' } }, { a: 'nope' }],
    ['format-email-not-string', { a: { $expr: 'Email' } }, { a: 1 }],
    ['format-email-required', { a: { $expr: 'Email' } }, {}],
    ['format-email-optional-absent', { a: { $expr: 'Optional(Email)' } }, {}],
    ['format-url-ok', { a: { $expr: 'Url' } }, { a: 'https://example.com/a?b=c#d' }],
    ['format-url-bad', { a: { $expr: 'Url' } }, { a: 'example.com' }],
    ['format-uuid-ok', { a: { $expr: 'Uuid' } }, { a: '123e4567-e89b-12d3-a456-426614174000' }],
    ['format-uuid-bad', { a: { $expr: 'Uuid' } }, { a: '123e4567e89b12d3a456426614174000' }],
    ['format-datetime-ok', { a: { $expr: 'DateTime' } }, { a: '2020-01-01T00:00:00Z' }],
    ['format-datetime-bad', { a: { $expr: 'DateTime' } }, { a: '2021-02-29T00:00:00Z' }],
    ['format-ip-v4', { a: { $expr: 'Ip' } }, { a: '127.0.0.1' }],
    ['format-ip-v6', { a: { $expr: 'Ip' } }, { a: '::1' }],
    ['format-ip-bad', { a: { $expr: 'Ip' } }, { a: '1.2.3' }],
    ['format-ipv4-rejects-v6', { a: { $expr: 'Ipv4' } }, { a: '::1' }],
    ['format-ipv6-rejects-v4', { a: { $expr: 'Ipv6' } }, { a: '1.2.3.4' }],
    ['format-ipv6-mapped', { a: { $expr: 'Ipv6' } }, { a: '::ffff:192.168.1.1' }],
    ['format-bound-order', { a: { $expr: 'Email(Min(10,String))' } }, { a: 'nope' }],
    ['fault-keeps-check-text', { a: { $expr: 'Fault("boom",Min(2,Number))' } }, { a: 1 }],
    ['fault-replaces-type-text', { a: { $expr: 'Fault("boom",Email)' } }, { a: 1 }],
    ['catch-fallback', { a: { $expr: 'Catch(0,Number)' } }, { a: 'x' }],
    ['catch-passes-through', { a: { $expr: 'Catch(0,Number)' } }, { a: 5 }],
    ['catch-inner-bound', { a: { $expr: 'Catch("none",Min(2,String))' } }, { a: 'x' }],
    ['catch-outer-bound-fails', { a: { $expr: 'Min(2,Catch(0,Number))' } }, { a: 'x' }],
    ['catch-required-absent', { a: { $expr: 'Catch(7,Number)' } }, {}],
    ['catch-optional-absent', { a: { $expr: 'Optional(Catch(7,Number))' } }, {}],
    ['catch-null-fallback', { a: { $expr: 'Catch(null,Number)' } }, { a: 'x' }],
    ['describe-keeps-validation', { a: { $expr: 'Describe("a number",Number)' } }, { a: 'x' }],
    ['ignore-inner-bound', { a: { $expr: 'Ignore(Min(2,Number))' } }, { a: 1 }],
    ['disc-branch-ok', { p: DISC }, { p: { bark: true, kind: 'dog' } }],
    ['disc-branch-error', { p: DISC }, { p: { fins: 'x', kind: 'fish' } }],
    ['disc-branch-missing-key', { p: DISC }, { p: { kind: 'dog' } }],
    ['disc-missing-tag', { p: DISC }, { p: { bark: true } }],
    ['disc-unknown-tag', { p: DISC }, { p: { kind: 'cat' } }],
    ['disc-not-object', { p: DISC }, { p: 1 }],
    ['disc-required-absent', { p: DISC }, {}],
    ['disc-optional-absent', { p: { $optional: DISC } }, {}],
    ['one-optional-absent', { a: { $expr: 'Optional(One(String,Number))' } }, {}],
    ['pick-keeps-named', { $call: ['Pick', ['a'], BASE] }, { a: 1 }],
    ['pick-dropped-is-unknown', { $call: ['Pick', ['a'], BASE] }, { a: 1, b: 'x' }],
    ['omit-removes-named', { $call: ['Omit', ['b'], BASE] }, { a: 1 }],
    ['omit-kept-still-required', { $call: ['Omit', ['b'], BASE] }, {}],
    ['partial-all-optional', { $call: ['Partial', BASE] }, {}],
    ['partial-still-typed', { $call: ['Partial', BASE] }, { a: 'x' }],
    ['extend-adds', { $call: ['Extend', { d: N }, BASE] }, { a: 1, b: 'x', d: 2 }],
    ['extend-overrides', { $call: ['Extend', { a: T }, BASE] }, { a: 'x', b: 'y' }],
    ['extend-new-required', { $call: ['Extend', { d: N }, BASE] }, { a: 1, b: 'x' }],
    ['pick-key-expression', { $call: ['Pick', ['a'], { 'a: Integer': 0, b: T }] }, { a: 1.5 }],
  ],
  composition: [
    ['one-of-ok', { a: { $expr: 'One(Number,String)' } }, { a: 'x' }],
    ['one-of-fail', { a: { $expr: 'One(Number,String)' } }, { a: true }],
    ['some-of-ok', { a: { $expr: 'Some(Number,String)' } }, { a: 5 }],
    ['all-of-fail-message', { a: { $expr: 'All(Number,Min(2))' } }, { a: 1 }],
    ['all-of-ok', { a: { $expr: 'All(Number,Min(2))' } }, { a: 5 }],
    ['some-of-fail', { a: { $expr: 'Some(Number,String)' } }, { a: true }],
    ['one-of-ignore-branch', { a: { $expr: 'One(Ignore(Min(2,Number)),String)' } }, { a: 1 }],
    ['all-of-ignore-branch', { a: { $expr: 'All(Ignore(Min(2,Number)),Number)' } }, { a: 1 }],
  ],
  checks: [
    ['regexp-ok', { a: { $expr: 'Check(/^a.+/)' } }, { a: 'abc' }],
    ['regexp-fail', { a: { $expr: 'Check(/^a.+/)' } }, { a: 'zzz' }],
    ['regexp-check-nonstring', { a: { $expr: 'Check(/^a.+/)' } }, { a: 1 }],
    ['regexp-bare-nonstring', { a: { $expr: '/^a.+/' } }, { a: 1 }],
    ['regexp-bare-ok', { a: { $expr: '/^a.+/' } }, { a: 'abc' }],
    ['regexp-in-one-match', { a: { $expr: 'One(/^a/,Number)' } }, { a: 'abc' }],
    ['regexp-in-one-number', { a: { $expr: 'One(/^a/,Number)' } }, { a: 5 }],
    ['regexp-in-one-fail', { a: { $expr: 'One(/^a/,Number)' } }, { a: true }],
    ['regexp-in-some-fail', { a: { $expr: 'Some(/^a/,Number)' } }, { a: true }],
    ['regexp-under-bound', { a: { $expr: 'Min(2,/^a/)' } }, { a: 1 }],
    ['regexp-under-bound-ok', { a: { $expr: 'Min(2,/^a/)' } }, { a: 'abc' }],
    ['bound-under-null-type', { a: { $expr: 'Min(2,null)' } }, { a: 1 }],
    ['bound-under-null-value', { a: { $expr: 'Min(2,null)' } }, { a: null }],
    ['bound-under-nan-type', { a: { $expr: 'Min(2,NaN)' } }, { a: 1 }],
  ],
  keyexpr: [
    ['keyexpr-min', { 'name: Min(1)': T }, { name: 'x' }],
    ['keyexpr-min-fail', { 'name: Min(2)': T }, { name: 'x' }],
    ['keyexpr-explicit-any-string', { 'a: Any': 0 }, { a: 'a' }],
    ['keyexpr-explicit-any-absent', { 'a: Any': 0 }, {}],
    ['keyexpr-constraint-adopts-kind', { 'a: Min(2)': 0 }, { a: 'x' }],
    ['keyexpr-optional-any-default', { 'a: Optional(Any)': 5 }, {}],
    ['keyexpr-optional-number-default', { 'a: Optional(Number)': 5 }, {}],
    ['keyexpr-optional-string-default', { 'a: Optional(String)': 'z' }, {}],
    ['keyexpr-optional-number-present', { 'a: Optional(Number)': 5 }, { a: 9 }],
    ['keyexpr-optional-number-wrong-type', { 'a: Optional(Number)': 5 }, { a: 'x' }],
    ['keyexpr-skip-no-injection', { 'a: Skip(Number)': 5 }, {}],
    ['keyexpr-child-array', { 'a: Child(Number)': [] }, { a: [1, 2] }],
    ['keyexpr-child-array-bad', { 'a: Child(Number)': [] }, { a: [1, 'x'] }],
    ['keyexpr-child-array-not-array', { 'a: Child(Number)': [] }, { a: {} }],
    ['keyexpr-bare-literal', { 'a: 5': 3 }, {}],
    ['keyexpr-bare-literal-present', { 'a: 5': 3 }, { a: 9 }],
    ['keyexpr-one-of-keeps-choice', { 'a: One(String,Number)': 5 }, { a: 'q' }],
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

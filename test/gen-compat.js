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
//   {"$call":["Pick",["a"],X]}  a builder called by name, for arguments the DSL
//                              cannot express (lists, objects)
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
// A builder the string DSL cannot express, called by name with its arguments.
const CALL = (name, ...args) => ({ $call: [name, ...args] })
const ABASE = { a: 1, b: T, c: true }

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
    ['nested-closed-one-extra-key', { a: { b: 1 } }, { a: { b: 2, c: 3 } }],
    ['nested-closed-two-extra-keys', { a: { b: 1 } }, { a: { b: 2, c: 3, d: 4 } }],
    ['nested-closed-array-extra', { a: [N, T] }, { a: [1, 'a', 2, 3] }],
    ['closed-key-with-backslash', { a: 1 }, { 'x\\y': 2 }],
    ['closed-key-with-quote', { a: 1 }, { 'x"y': 2 }],
    ['closed-value-with-backslash', { a: 1 }, { a: 'p\\q', z: 1 }],
    ['closed-value-with-html', { a: 1 }, { 'a<b': '&' }],
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
    // A bound on a missing required value stands aside for the missing error.
    ['min-under-missing', { a: { $expr: 'Min(2,String)' } }, {}],
    ['max-number-under-missing', { a: { $expr: 'Max(2,Number)' } }, {}],
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
    ['dsl-object-token-closed', { a: { $expr: 'Object' } }, { a: { z: 1 } }],
    ['dsl-object-token-ok', { a: { $expr: 'Object' } }, { a: {} }],
    ['dsl-optional-object-default', { a: { $expr: 'Optional(Object)' } }, {}],
    ['dsl-optional-object-closed', { a: { $expr: 'Optional(Object)' } }, { a: { z: 1 } }],
    ['dsl-array-token-any-elements', { a: { $expr: 'Array' } }, { a: [1, 'x'] }],
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
  ],
  composition: [
    // One, Some and All never change the value they are given: every branch
    // sees the original, and Some takes the last matching branch's result.
    ['some-open-defaults-first-wins', CALL('Some', { $open: { a: 1 } }, { $open: { a: 2 } }), {}],
    ['some-open-defaults-both', CALL('Some', { $open: { a: 1 } }, { $open: { b: 2 } }), {}],
    ['some-open-defaults-present', CALL('Some', { $open: { a: 1 } }, { $open: { a: 2 } }), { a: 5, q: 9 }],
    ['some-scalar-original', CALL('Some', { $expr: 'Coerce(Number)' }, { $expr: 'Max(2)' }), '12'],
    ['some-scalar-last-wins', CALL('Some', { $expr: 'Max(2)' }, { $expr: 'Coerce(Number)' }), '12'],
    // A branch that replaces the value leaves the next branch the original.
    ['some-replace-then-open', CALL('Some', { $expr: 'Catch(1,Number)' }, { $open: { a: 1 } }), {}],
    ['some-replace-then-open-present', CALL('Some', { $expr: 'Catch(1,Number)' }, { $open: { a: 1 } }), { a: 5 }],
    ['some-replace-then-open-scalar', CALL('Some', { $expr: 'Catch(1,Number)' }, { $open: { a: 1 } }), 3],
    // All threads the result from branch to branch; One takes its branch's.
    ['all-open-defaults', CALL('All', { $open: { a: 1 } }, { $open: { b: 2 } }), {}],
    ['all-coerce-then-min', { a: { $expr: 'All(Coerce(Number),Min(2))' } }, { a: '5' }],
    ['all-coerce-then-min-fail', { a: { $expr: 'All(Coerce(Number),Min(2))' } }, { a: '1' }],
    ['one-open-default', CALL('One', { $open: { a: 1 } }, { $expr: 'String' }), {}],
    ['all-absent-required', { a: CALL('All', { $open: { x: 1 } }, { $open: { y: 'a' } }) }, {}],
    ['some-absent-required', { a: CALL('Some', { $open: { x: 1 } }, { $expr: 'String' }) }, {}],
    ['one-absent-no-match', { a: { $expr: 'One(String,Number)' } }, {}],
    ['some-absent-no-match', { a: { $expr: 'Some(String,Number)' } }, {}],
    ['all-absent-fail', { a: { $expr: 'All(String,Number)' } }, {}],
    ['one-skip-branch-absent', { a: { $expr: 'One(Skip(Number))' } }, {}],
    ['some-skip-branch-absent', { a: { $expr: 'Some(Skip(Number))' } }, {}],
    ['all-skip-branch-absent', { a: { $expr: 'All(Skip(Number))' } }, {}],
    ['one-skip-branch-present', { a: { $expr: 'One(Skip(Number))' } }, { a: 1 }],
    ['one-absent-default-branch', { a: { $expr: 'One(String,Number)' }, b: CALL('One', { $expr: 'Number' }, { $open: { x: 1 } }) }, { a: 'x' }],
    ['some-failing-branch-leaks-nothing', CALL('Some', { x: { $expr: 'Number' }, y: 1 }, { $open: { z: 3 } }), {}],
    // Default over an untyped shape takes the default's kind and keeps the
    // shape's builders, description and fault.
    ['default-untyped-kind', { a: { $expr: 'Default(2,Required())' } }, { a: 'x' }],
    ['default-untyped-absent', { a: { $expr: 'Default(2,Required())' } }, {}],
    ['default-untyped-describe', { a: { $expr: 'Default(2,Describe("two",Required()))' } }, { a: 3 }],
    ['default-untyped-fault', { a: { $expr: 'Default(2,Fault("not two",Exact(2)))' } }, { a: 3 }],
    ['default-untyped-exact', { a: { $expr: 'Default(2,Exact(2,3))' } }, { a: 3 }],
    ['default-untyped-nullable', { a: { $expr: 'Default(2,Nullable(Required()))' } }, { a: null }],
    ['default-untyped-empty', { a: { $expr: 'Default("x",Empty(Required()))' } }, { a: '' }],
    ['all-any-token', { a: { $expr: 'All(String,Any)' } }, { a: 1 }],
    ['one-min-any-token', { a: { $expr: 'One(Number,Min(2,Any))' } }, { a: 'x' }],
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
    // A Check is not called for an absent value; the required check speaks.
    ['check-regexp-absent', { a: { $expr: 'Check(/^x/)' } }, {}],
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
    ['keyexpr-quoted-name', { '"a b": Min(1)': 0 }, { 'a b': 2 }],
    ['keyexpr-quoted-name-fail', { '"a b": Min(1)': 0 }, { 'a b': 0 }],
    ['keyexpr-quoted-name-absent', { '"a b": String': '' }, {}],
    ['keyexpr-empty-expression-is-a-literal-key', { 'a:': 1 }, { 'a:': 2 }],
    ['keyexpr-empty-expression-rejects-bare-name', { 'a:': 1 }, { a: 2 }],
    ['keyexpr-escaped-quoted-name', { '"a\\"b": Min(1)': 0 }, { 'a"b': 2 }],
    ['keyexpr-value-builder-takes-example', { 'a: Default()': 5 }, {}],
    ['keyexpr-bound-takes-example', { 'a: Min()': 3 }, { a: 1 }],
    ['keyexpr-catch-takes-example', { 'a: Catch()': 7 }, { a: 'x' }],
    ['keyexpr-exact-takes-example', { 'a: Exact()': 7 }, {}],
    ['keyexpr-exact-present-null-fails', { 'a: Exact()': 7 }, { a: null }],
    ['exact-default-absent-ok', { a: { $expr: 'Default(7,Exact(7,8))' } }, {}],
    ['exact-default-present-null-fails', { a: { $expr: 'Default(7,Exact(7,8))' } }, { a: null }],
  ],
  algebra: [
    ['pick-keeps-default', CALL('Pick', ['a'], ABASE), {}],
    ['pick-single-name', CALL('Pick', 'a', ABASE), {}],
    ['pick-required-kept', CALL('Pick', ['b'], ABASE), {}],
    ['pick-two', CALL('Pick', ['a', 'c'], ABASE), { c: false }],
    ['pick-stays-closed', CALL('Pick', ['a'], ABASE), { a: 2, b: 'x' }],
    ['pick-open-base', CALL('Pick', ['a'], { $open: ABASE }), { a: 2, z: 1 }],
    ['pick-keyexpr-source', CALL('Pick', ['a'], { 'a: Min(2)': 0, b: 1 }), { a: 1 }],
    ['omit-drops-required', CALL('Omit', ['b'], ABASE), {}],
    ['omit-unknown-ignored', CALL('Omit', ['z'], ABASE), { b: 'x' }],
    ['omit-then-extra', CALL('Omit', ['b'], ABASE), { b: 'x' }],
    ['omit-all', CALL('Omit', ['a', 'b', 'c'], ABASE), { a: 1 }],
    ['partial-absent', CALL('Partial', ABASE), {}],
    ['partial-type-kept', CALL('Partial', ABASE), { b: 1 }],
    ['partial-is-shallow', CALL('Partial', { a: { b: N } }), {}],
    ['partial-nested-present', CALL('Partial', { a: { b: N } }), { a: { b: 1 } }],
    ['extend-adds', CALL('Extend', { e: 2 }, ABASE), { b: 'x' }],
    ['extend-adds-required', CALL('Extend', { e: N }, ABASE), { b: 'x' }],
    ['extend-overrides', CALL('Extend', { b: 5 }, ABASE), {}],
    ['extend-stays-closed', CALL('Extend', { e: 2 }, ABASE), { b: 'x', z: 1 }],
    ['extend-open-base', CALL('Extend', { e: 2 }, { $open: ABASE }), { b: 'x', z: 1 }],
    ['extend-ext-openness-ignored', CALL('Extend', { $open: { e: 2 } }, ABASE), { b: 'x', z: 1 }],
    ['composed', CALL('Partial', CALL('Pick', ['b'], CALL('Extend', { e: N }, ABASE))), {}],
    ['keyexpr-pick', { 'u: Pick(["a"])': { a: 1, b: 2 } }, {}],
    ['keyexpr-omit', { 'u: Omit(["a"])': { a: 1, b: 2 } }, { u: { a: 1 } }],
    ['keyexpr-partial', { 'u: Partial': { a: T } }, {}],
    ['keyexpr-partial-present', { 'u: Partial()': { a: T } }, { u: { a: 'x' } }],
  ],
  // Specs built from a JSON Schema, {"$jsonschema": …}: the import must read
  // the same shape in both languages.
  jsonschema: [
    // A numeric exclusive bound and a plain bound both apply.
    ['js-number-min-and-exclusive-ok', { $jsonschema: { type: 'number', minimum: 1, exclusiveMinimum: 0 } }, 1],
    ['js-number-min-and-exclusive-low', { $jsonschema: { type: 'number', minimum: 1, exclusiveMinimum: 0 } }, 0.5],
    ['js-number-max-and-exclusive-high', { $jsonschema: { type: 'number', maximum: 1, exclusiveMaximum: 2 } }, 1.5],
    // Untyped, where the length keywords beside an exclusive bound are that bound.
    ['js-untyped-min-and-exclusive-low', { $jsonschema: { minimum: 1, exclusiveMinimum: 0 } }, 0.5],
    ['js-untyped-max-and-exclusive-high', { $jsonschema: { maximum: 1, exclusiveMaximum: 2 } }, 1.5],
    ['js-untyped-exclusive-lengths', { $jsonschema: { exclusiveMinimum: 1, minLength: 2, minItems: 2, minProperties: 2 } }, 'ab'],
    ['js-object-required', { $jsonschema: { type: 'object', properties: { name: { type: 'string' }, age: { type: 'integer', minimum: 0, default: 1 } }, required: ['name'] } }, { name: 'a', extra: 1 }],
    ['js-object-required-missing', { $jsonschema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } }, {}],
    ['js-object-closed', { $jsonschema: { type: 'object', properties: { a: { type: 'number' } }, additionalProperties: false } }, { a: 1, b: 2 }],
    ['js-object-child', { $jsonschema: { type: 'object', additionalProperties: { type: 'number' } } }, { a: 'x' }],
    ['js-required-undeclared', { $jsonschema: { type: 'object', required: ['a'] } }, {}],
    ['js-empty-string', { $jsonschema: { type: 'string' } }, ''],
    ['js-min-length', { $jsonschema: { type: 'string', minLength: 2 } }, 'a'],
    ['js-pattern', { $jsonschema: { type: 'string', pattern: '^[0-9]{3}$' } }, '12'],
    ['js-format', { $jsonschema: { type: 'string', format: 'email' } }, 'nope'],
    ['js-integer', { $jsonschema: { type: 'integer' } }, 1.5],
    ['js-exclusive', { $jsonschema: { type: 'number', exclusiveMinimum: 1 } }, 1],
    ['js-draft4-exclusive', { $jsonschema: { type: 'number', minimum: 1, exclusiveMinimum: true } }, 1],
    ['js-enum', { $jsonschema: { enum: ['a', 'b'] } }, 'c'],
    ['js-const', { $jsonschema: { const: 1 } }, 1],
    ['js-null', { $jsonschema: { type: 'null' } }, null],
    ['js-nullable', { $jsonschema: { type: ['string', 'null'] } }, null],
    ['js-union', { $jsonschema: { type: ['string', 'number'] } }, true],
    ['js-array-items', { $jsonschema: { type: 'array', items: { type: 'string' } } }, ['a', 1]],
    ['js-tuple-closed', { $jsonschema: { type: 'array', prefixItems: [{ type: 'string' }], items: false } }, ['a', 'b']],
    ['js-tuple-open', { $jsonschema: { type: 'array', prefixItems: [{ type: 'string' }] } }, ['a', 1]],
    ['js-tuple-rest', { $jsonschema: { type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'number' } } }, ['a', 'b']],
    ['js-min-items', { $jsonschema: { type: 'array', minItems: 1 } }, []],
    ['js-any-of', { $jsonschema: { anyOf: [{ type: 'string' }, { type: 'number' }] } }, true],
    ['js-all-of', { $jsonschema: { allOf: [{ type: 'number' }, { minimum: 1 }] } }, 0],
    ['js-untyped-bound', { $jsonschema: { minLength: 2 } }, 'a'],
    ['js-not', { $jsonschema: { not: {} } }, 1],
    ['js-bool-schema', { $jsonschema: { type: 'object', properties: { a: true, b: false } } }, { b: 1 }],
    ['js-discriminated', { $jsonschema: { oneOf: [{ type: 'object', properties: { k: { const: 'a' }, x: { type: 'number' } }, required: ['k', 'x'] }, { type: 'object', properties: { k: { const: 'b' } }, required: ['k'] }] } }, { k: 'a', x: 'no' }],
    ['js-discriminated-unknown', { $jsonschema: { oneOf: [{ type: 'object', properties: { k: { const: 'a' } }, required: ['k'] }, { type: 'object', properties: { k: { const: 'b' } }, required: ['k'] }] } }, { k: 'c' }],
    ['js-one-of-plain', { $jsonschema: { oneOf: [{ type: 'string' }, { type: 'number' }] } }, true],
    ['js-ref', { $jsonschema: { $defs: { p: { type: 'object', properties: { n: { type: 'string' } }, required: ['n'] } }, type: 'object', properties: { a: { $ref: '#/$defs/p' }, b: { $ref: '#/$defs/p' } }, required: ['a', 'b'] } }, { a: { n: 'x' }, b: {} }],
    ['js-ref-recursive', { $jsonschema: { $defs: { n: { type: 'object', properties: { v: { type: 'number' }, kids: { type: 'array', items: { $ref: '#/$defs/n' } } }, required: ['v'] } }, $ref: '#/$defs/n' } }, { v: 1, kids: [{ v: 2, kids: [{ v: 'x' }] }] }],
    ['js-ref-root', { $jsonschema: { type: 'object', properties: { v: { type: 'number' }, next: { $ref: '#' } } } }, { v: 1, next: { next: { v: 'x' } } }],
    ['js-default-object', { $jsonschema: { type: 'object', properties: { a: { type: 'object', default: { q: 1 }, additionalProperties: { type: 'number' } } } } }, {}],
    ['js-describe', { $jsonschema: { type: 'object', properties: { a: { type: 'string', description: 'd' } }, required: ['a'] } }, { a: 1 }],
    ['js-any-empty', { $jsonschema: {} }, { anything: [1] }],
    ['js-ip', { $jsonschema: { type: 'string', anyOf: [{ format: 'ipv4' }, { format: 'ipv6' }] } }, 'x'],
  ],
  misc: [
    // Refer: a name that no Define supplies does nothing, unless strict.
    ['refer-defined', { a: { $expr: 'Define("d",Number)' }, b: { $expr: 'Refer("d")' } }, { a: 1, b: 2 }],
    ['refer-defined-strict', { a: { $expr: 'Define("d",Number)' }, b: CALL('Refer', { name: 'd', strict: true }) }, { a: 1, b: 2 }],
    ['refer-defined-strict-bad', { a: { $expr: 'Define("d",Number)' }, b: CALL('Refer', { name: 'd', strict: true }) }, { a: 1, b: 'x' }],
    ['refer-undefined-lax', { b: { $expr: 'Refer("nope")' } }, { b: 2 }],
    ['refer-undefined-strict', { b: CALL('Refer', { name: 'nope', strict: true }) }, { b: 2 }],
    ['refer-undefined-strict-absent', { b: CALL('Refer', { name: 'nope', strict: true }) }, {}],
    ['refer-undefined-strict-fill', { b: CALL('Refer', { name: 'nope', strict: true, fill: true }) }, {}],
    ['null-required', { a: { $expr: 'null' } }, { a: null }],
    ['null-literal-default-injected', { a: null }, {}],
    ['null-dsl-default-injected', { a: { $expr: 'null' } }, {}],
    ['null-under-bound-absent', { a: { $expr: 'Min(2,null)' } }, {}],
    ['null-skip-absent', { a: { $expr: 'Skip(null)' } }, {}],
    ['null-required-absent', { a: { $expr: 'Required(null)' } }, {}],
    ['func-builder-is-optional', { n: { $expr: 'Func' } }, {}],
    ['func-token-is-required', { n: { $type: 'Function' } }, {}],
    ['nan-literal-default-injected', { h: { $expr: 'NaN' } }, {}],
    ['nan-under-bound-absent', { h: { $expr: 'Min(2,NaN)' } }, {}],
    ['nan-required-absent', { h: { $expr: 'Required(NaN)' } }, {}],
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

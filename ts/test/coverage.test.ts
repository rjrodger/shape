/* Copyright (c) 2021-2024 Richard Rodger and other contributors, MIT License */

// Targeted coverage tests for previously-unexercised branches of shape.ts:
// Fault / Ignore builders, Exact-from-default, expr edge tokens, Rename
// claim/keep, ctx.log ancestor traversal, and stringify/clone corners.

import { describe, test } from 'node:test'
import assert from 'node:assert'

import { Shape as ShapeX } from '../dist/shape'

let ShapeModule = require('../dist/shape')
if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}
const Shape: ShapeX = ShapeModule

const {
  Fault, Ignore, Exact, Default, Rename, Number: GNum, String: GStr,
  Min, Open, expr, stringify, nodize,
} = Shape as any


describe('coverage-extra', () => {

  test('fault-structural', () => {
    // Fault overrides the default (structural) error text.
    assert.throws(
      () => Shape({ a: Fault('must be a number', Number) })({ a: 'x' }),
      /must be a number/)

    // Standalone Fault().
    assert.ok(Shape({ a: Fault('nope') }))
  })


  test('ignore-drop-and-keep', () => {
    const g = Shape({ a: Ignore(Number) })
    // Invalid value is dropped, no error thrown.
    assert.deepEqual(JSON.parse(JSON.stringify(g({ a: 'bad' }))), {})
    // Valid value is kept.
    assert.deepEqual(g({ a: 5 }), { a: 5 })
    // Missing value is fine.
    assert.deepEqual(JSON.parse(JSON.stringify(g({}))), {})
  })


  test('exact-from-default', () => {
    // An absent, defaulted Exact node matches via its default value.
    const g = Shape({ a: Default(1, Exact(1, 2)) })
    assert.deepEqual(g({}), { a: 1 })
    // Present valid / invalid.
    assert.deepEqual(g({ a: 2 }), { a: 2 })
    assert.throws(() => g({ a: 3 }), /exactly one of/)
  })


  test('expr-edge-tokens', () => {
    // undefined / NaN literal tokens.
    assert.equal(expr('undefined'), undefined)
    assert.ok(Number.isNaN(expr('NaN')))

    // Closing-paren handling inside builder args (empty trailing arg).
    const g = Shape(expr('Min(2,String)'))
    assert.throws(() => g('x'), /minimum/)

    // Nested builder args exercise the ')' return path.
    assert.ok(expr('One(Min(1),Max(9))'))

    // A trailing ')' at top level hits the close-paren early return.
    assert.ok(expr('Min(1))'))
  })


  test('rename-keep', () => {
    // Keep retains the original key alongside the renamed one.
    const g = Shape({ a: Rename({ name: 'b', keep: true }, Number) })
    const out: any = g({ a: 1 })
    assert.equal(out.b, 1)
    assert.equal(out.a, 1)
  })


  test('rename-claim', () => {
    // Claim picks up a value from an alternate source key.
    const g = Shape({ b: Rename({ name: 'b', claim: ['a'] }, Number) })
    const out: any = g({ a: 2 })
    assert.equal(out.b, 2)
  })


  test('rename-claim-keep', () => {
    // Claim + keep: the claimed source is validated as a default at the tail.
    const g = Shape({ b: Rename({ name: 'b', claim: ['a'], keep: true }, Number) })
    const out: any = g({ a: 3 })
    assert.equal(out.b, 3)
    assert.equal(out.a, 3)
  })


  test('ctx-log-traversal', () => {
    // A log callback is invoked as the traversal ascends nested objects/arrays.
    const points: string[] = []
    const g = Shape({ a: { b: { c: 1 } }, list: [Number] })
    g({ a: { b: { c: 2 } }, list: [1, 2] }, {
      log: (point: string) => { points.push(point) },
    })
    assert.ok(0 < points.length)
    // Ascent past object/array parents emits 'eo'/'ea' style points.
    assert.ok(points.some(p => p.startsWith('e')))
  })


  test('stringify-and-clone', () => {
    // stringify of a compiled shape (node2json path).
    const g = Shape({ a: Number, b: Open({ x: 1 }) })
    assert.ok('string' === typeof g.stringify())

    // stringify of a raw node value.
    const n = nodize({ a: 1 })
    assert.ok('string' === typeof stringify(n))

    // A required Object clones its (empty) default without sharing state.
    const go = Shape(Object)
    assert.deepEqual(go({}), {})

    // stringify filters a function value by name via ignore.val.
    const s1 = stringify({ f: function foo() { } }, false, false, { val: ['foo'] })
    assert.ok(!s1.includes('foo'))

    // stringify of a container holding an incomplete shape node.
    const incomplete = { $: { shape$: true }, t: 'number', v: 5, f: 5, r: false, p: false, b: [], a: [], u: {}, m: {}, k: [], c: undefined, d: -1, n: 0, e: true }
    assert.ok('string' === typeof stringify({ x: incomplete }))
  })

})

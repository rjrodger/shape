/* Copyright (c) 2021-2024 Richard Rodger and other contributors, MIT License */

// Behaviour the documentation review of 2026-09-02 found wrong or unpinned.

import { describe, test } from 'node:test'
import assert from 'node:assert'

import { Shape as ShapeX } from '../dist/shape'

let ShapeModule = require('../dist/shape')
if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}
const Shape: ShapeX = ShapeModule
const { buildize, Min, Max, Some, Open, Coerce, fromJsonSchema } = ShapeModule

describe('review', () => {
  test('a chained Rest keeps the tuple', () => {
    const s = Shape(buildize([String, Number]).Rest(Number))
    assert.deepEqual(s(['a', 1, 2, 3]), ['a', 1, 2, 3])
    assert.throws(() => s(['a', 1, 'b']), /index "2" with string "b"/)
    assert.throws(() => s([1, 1]), /index "0" with number "1"/)
    // The top-level form is the same shape.
    assert.deepEqual(Shape(ShapeModule.Rest(Number, [String, Number]))(['a', 1, 2]), ['a', 1, 2])
    // Chained on a non-array node it is a plain element shape, as before.
    assert.deepEqual(Shape(ShapeModule.Optional().Rest(Number))([1, 2]), [1, 2])
  })

  test('pathArr under an array element', () => {
    const errs = Shape({ users: [{ email: String }] }).error({ users: [{ email: 1 }] })
    assert.deepEqual(errs.map(e => [e.path, e.pathArr]), [['users.0.email', ['users', 0, 'email']]])
    assert.deepEqual(Shape([[{ x: Number }]]).error([[{ x: 's' }]]).map(e => e.pathArr), [[0, 0, 'x']])
    assert.deepEqual(Shape({ a: { b: [String] } }).error({ a: { b: [1] } }).map(e => e.pathArr), [['a', 'b', 0]])
    assert.deepEqual(Shape([String]).error([1]).map(e => e.pathArr), [[0]])
    assert.deepEqual(Shape({ a: String }).error({ a: 1 }).map(e => e.pathArr), [['a']])
  })

  test('a bound on a missing required value defers to the missing error', () => {
    assert.throws(() => Shape({ a: Min(2, String) })({}), /property "a" because the property is missing\.$/)
    assert.throws(() => Shape({ a: Max(2, Number) })({}), /property "a" because the property is missing\.$/)
    // With a default the bound never sees the absence.
    assert.deepEqual(Shape({ a: Min(2, 'abc') })({}), { a: 'abc' })
  })

  test('Some threads an object and re-runs a scalar', () => {
    assert.deepEqual(Shape(Some(Open({ a: 1 }), Open({ a: 2 })))({}), { a: 1 })
    assert.deepEqual(Shape(Some(Open({ a: 1 }), Open({ b: 2 })))({}), { a: 1, b: 2 })
    assert.equal(Shape(Some(Coerce(Number), Max(2)))('12'), '12')
    assert.equal(Shape(Some(Max(2), Coerce(Number)))('12'), 12)
  })

  test('JSON Schema import keeps a plain bound beside an exclusive one', () => {
    const lo = Shape(fromJsonSchema({ type: 'number', minimum: 1, exclusiveMinimum: 0 }))
    assert.equal(lo(1), 1)
    assert.throws(() => lo(0.5), /minimum of 1/)
    const hi = Shape(fromJsonSchema({ type: 'number', maximum: 1, exclusiveMaximum: 2 }))
    assert.equal(hi(1), 1)
    assert.throws(() => hi(1.5), /maximum of 1/)
  })

  test('error() returns issue objects', () => {
    const errs = Shape({ a: Number }).error({ a: 'x' })
    assert.equal(errs.length, 1)
    assert.equal(errs[0].path, 'a')
    assert.equal(errs[0].why, 'type')
    assert.equal(errs[0].value, 'x')
  })
})

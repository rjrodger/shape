/* Copyright (c) 2021-2023 Richard Rodger and other contributors, MIT License */

// Canonical-semantics tests for behaviours corrected while bringing the Go
// port to parity. The declarative cases are pinned by the shared corpus in
// test/*.tsv; these cover the imperative surface the corpus cannot reach.

import { describe, test } from 'node:test'
import assert from 'node:assert'

import type { Shape as ShapeX } from '../dist/shape'

let ShapeModule = require('../dist/shape')

if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}

const Shape: ShapeX = ShapeModule


function failure(spec: any, input: any): string {
  try {
    Shape(spec)(input)
  }
  catch (e: any) {
    return e.message
  }

  throw new Error('expected validation to fail')
}


describe('parity', () => {

  test('bare builder reference means the builder applied to nothing', () => {
    // Without this a capitalized builder function falls through to the
    // class-instance branch and becomes an `instanceof` check that can
    // never pass.
    assert.deepEqual(Shape({ a: Shape.Any })({ a: 1 }), { a: 1 })
    assert.deepEqual(Shape({ a: Shape.Any })({ a: null }), { a: null })
    assert.deepEqual(Shape({ a: Shape.Any })({ a: { b: 1 } }), { a: { b: 1 } })
    assert.equal(Shape(Shape.Any)('anything'), 'anything')

    // Bare and called forms agree.
    assert.deepEqual(
      Shape({ a: Shape.Any })({ a: 1 }),
      Shape({ a: Shape.Any() })({ a: 1 }))

    assert.deepEqual(Shape({ a: Shape.Optional })({}), {})
    assert.deepEqual(Shape({ a: Shape.Skip })({}), {})
  })


  test('a bare Key reference means Key()', () => {
    // Key takes only optional arguments, so a bare reference reads as a call
    // like the other nullary builders — and the string DSL already treats it
    // that way.
    assert.deepEqual(
      Shape({ a: { b: Shape.Key } })({ a: { b: 'V' } }),
      Shape({ a: { b: Shape.Key() } })({ a: { b: 'V' } }))

    assert.deepEqual(Shape({ a: { b: Shape.Key } })({ a: { b: 'V' } }), { a: { b: 'a' } })
  })


  test('a class reference is still an instance check', () => {
    class Foo { }

    assert.ok(Shape({ a: Foo })({ a: new Foo() }).a instanceof Foo)
    assert.match(
      failure({ a: Foo }, { a: 1 }),
      /is not an instance of Foo/)
  })


  test('type check precedes a size bound', () => {
    // The bound is meaningless on a value of the wrong type, and its message
    // would mask the real error.
    assert.match(
      failure(Shape.expr('Min(2,String)'), 1),
      /the number is not of type string/)

    assert.match(
      failure(Shape.expr('Min(2,String)'), true),
      /the boolean is not of type string/)

    assert.match(
      failure(Shape.expr('Max(2,Number)'), 'xyz'),
      /the string is not of type number/)

    // A bound on a value of the right type still reports the bound.
    assert.match(
      failure(Shape.expr('Min(2,String)'), 'a'),
      /must be a minimum length of 2/)

    assert.equal(Shape(Shape.expr('Min(2,String)'))('abc'), 'abc')

    // An untyped bound applies to anything, as before.
    assert.match(
      failure(Shape.expr('Min(2)'), [1]),
      /must be a minimum length of 2/)
  })


  test('the string DSL and the builder API agree on Optional', () => {
    // Type() dropped the fallback, so the DSL lost the default that the
    // builder injects for an absent key.
    assert.deepEqual(
      Shape({ a: Shape.expr('Optional(String)') })({}),
      Shape({ a: Shape.Optional(String) })({}))

    assert.deepEqual(Shape({ a: Shape.expr('Optional(String)') })({}), { a: '' })
    assert.deepEqual(Shape({ a: Shape.expr('Optional(Number)') })({}), { a: 0 })
  })


  test('a regexp check applies to strings and does not coerce', () => {
    const digits = Shape.expr('Check(/^[0-9]+$/)')

    assert.equal(Shape(digits)('12'), '12')

    // String(1).match(/^[0-9]+$/) used to make this pass.
    assert.match(failure(digits, 1), /check "\/\^\[0-9\]\+\$\/" failed/)
    assert.match(failure(digits, true), /check "\/\^\[0-9\]\+\$\/" failed/)
    assert.match(failure(digits, null), /check "\/\^\[0-9\]\+\$\/" failed/)
  })


  test('a failed container type check does not descend', () => {
    // One error for the container, not one per declared key on top of it.
    assert.equal(
      failure({ a: String }, 1),
      'Validation failed for number "1" because the number is not of type object.')

    assert.equal(
      failure({ a: String, b: Number }, 'x'),
      'Validation failed for string "x" because the string is not of type object.')

    // A genuinely absent key inside a real object still reports as required.
    assert.match(
      failure({ a: String }, {}),
      /property "a" with value "undefined" because the value is required/)
  })


  test('a container with an explicit default injects it as-is', () => {
    // Not rebuilt from the children's defaults, which would ignore the default
    // the node was actually given.
    assert.deepEqual(
      Shape({ a: Shape.Default({}, { b: 1, c: Number }) })({}),
      { a: {} })
  })


  test('Ignore drops a failing value wherever it appears', () => {
    // The dropped slot is left undefined, which is absent once serialized —
    // the form the shared corpus compares.
    const json = (v: any) => JSON.parse(JSON.stringify(v))

    assert.deepEqual(json(Shape([Shape.Ignore(Number)])([1, 'x'])), [1, null])
    assert.deepEqual(
      json(Shape(Shape.Child(Shape.Ignore(Number)))({ a: 'x', b: 1 })),
      { b: 1 })
    assert.equal(Shape(Shape.Ignore(Number))('x'), undefined)
  })


  test('a key expression keeps its example value', () => {
    // The example is appended as the innermost builder call's final argument.
    // Where the builder has room for it, it becomes the shape and supplies the
    // kind; where the builder's arity is already satisfied it is applied as the
    // value instead. Either way it survives.
    assert.deepEqual(Shape({ 'a: Optional(Any)': 5 })({}), { a: 5 })
    assert.deepEqual(Shape({ 'a: Optional(Number)': 5 })({}), { a: 5 })
    assert.deepEqual(Shape({ 'a: Optional(String)': 'z' })({}), { a: 'z' })
    assert.deepEqual(Shape({ 'a: Any': 5 })({}), { a: 5 })

    // The expression keeps the kind it declared...
    assert.deepEqual(Shape({ 'a: Any': 0 })({ a: 'x' }), { a: 'x' })
    assert.deepEqual(Shape({ 'a: One(String,Number)': 5 })({ a: 'q' }), { a: 'q' })

    // ...and a constraint-only expression takes the example's.
    assert.match(
      failure({ 'a: Min(2)': 0 }, { a: 'x' }),
      /the string is not of type number/)

    // A builder that consumed the example uses the kind it implies.
    assert.deepEqual(Shape({ 'a: Child(Number)': [] })({ a: [1, 2] }), { a: [1, 2] })
    assert.match(
      failure({ 'a: Child(Number)': [] }, { a: [1, 'x'] }),
      /is not of type number/)

    // Skip still injects nothing, and a bare literal expression keeps its own
    // value since there is no builder to hand the example to.
    assert.deepEqual(Shape({ 'a: Skip(Number)': 5 })({}), {})
    assert.deepEqual(Shape({ 'a: 5': 3 })({}), { a: 5 })
  })


  test('Func is chainable', () => {
    const fn = () => 0
    const shape = Shape({ a: Shape.Optional().Func() })

    assert.equal(shape({ a: fn }).a, fn)
    assert.match(failure({ a: Shape.Optional().Func() }, { a: 1 }),
      /is not of type function/)
  })

})


describe('kinds: nullable, integer, date', () => {
  const { Nullable, Integer, Optional, Min } = Shape as any

  test('Nullable accepts an explicit null and nothing else new', () => {
    assert.equal(Shape(Nullable(Number))(null), null)
    assert.equal(Shape(Nullable(Number))(5), 5)
    assert.match(failure(Nullable(Number), 'x'), /the string is not of type number/)

    // Absent is still governed by required/optional.
    assert.deepEqual(Shape({ a: Nullable(String) })({ a: null }), { a: null })
    assert.match(failure({ a: Nullable(Number) }, {}), /is required/)
    assert.deepEqual(Shape({ a: Optional(Nullable(Number)) })({}), { a: 0 })

    // Containers, bare use, and the chain.
    assert.equal(Shape(Nullable({ b: 1 }))(null), null)
    assert.deepEqual(Shape({ a: Nullable })({ a: null }), { a: null })
    assert.equal(Shape(Optional().Nullable().Number())(null), null)
    assert.equal(Shape(Shape.expr('Nullable(Number)'))(null), null)
  })

  test('Integer is a number with no fractional part', () => {
    assert.equal(Shape(Integer)(5), 5)
    assert.equal(Shape(Integer)(-0), -0)
    assert.match(failure(Integer, 1.5), /the number is not of type integer/)
    assert.match(failure(Integer, '5'), /the string is not of type integer/)
    assert.match(failure(Integer, NaN), /is not of type integer/)

    // A type token: required, default 0.
    assert.match(failure({ a: Integer }, {}), /is required/)
    assert.deepEqual(Shape({ a: Optional(Integer) })({}), { a: 0 })
    assert.deepEqual(Shape({ a: Shape.Integer() })({ a: 3 }), { a: 3 })

    // Bounds defer to the type check, and Type() knows the name.
    assert.match(failure(Shape.expr('Min(2,Integer)'), 1.5), /is not of type integer/)
    assert.match(failure(Shape.expr('Min(2,Integer)'), 1), /must be a minimum of 2/)
    assert.match(failure(Shape.expr('Type(Integer)'), 2.5), /is not of type integer/)
    assert.match(failure(Shape.Type('Integer'), 2.5), /is not of type integer/)
    assert.equal(Shape(Optional().Integer())(4), 4)
    assert.match(failure({ 'a: Integer': 0 }, { a: 1.5 }), /is not of type integer/)
  })

  test('Date is a kind, not an instance check', () => {
    const d = new Date(0)
    assert.equal(Shape(Date)(d), d)
    assert.match(failure(Date, 'x'), /the string is not of type date/)
    assert.match(failure(Date, new Date('nonsense')), /is not of type date/)
    assert.match(failure({ a: Date }, {}), /is required/)

    // No default to inject for an optional date — the slot is left undefined,
    // which is absent once serialized; a literal date is a default.
    assert.deepEqual(JSON.parse(JSON.stringify(Shape({ a: Optional(Date) })({}))), {})
    assert.deepEqual(Shape({ a: d })({}), { a: d })
    assert.equal(Shape(Optional().Date())(d), d)
    assert.match(failure(Shape.expr('Date'), 1), /the number is not of type date/)

    // A bound compares the instant, and reads as a value, not a length.
    const y2020 = Date.UTC(2020, 0, 1)
    assert.equal(Shape(Min(y2020, Date))(new Date(Date.UTC(2021, 0, 1))).getTime(), Date.UTC(2021, 0, 1))
    assert.match(
      failure(Min(y2020, Date), new Date(Date.UTC(2019, 5, 1))),
      /must be a minimum of 1577836800000 \(was 1559347200000\)/)

    // A Date value in an error message renders as JSON does.
    assert.equal(
      failure(Number, d),
      'Validation failed for object "1970-01-01T00:00:00.000Z" because the object is not of type number.')
  })

  test('rendering of the new kinds', () => {
    const r = (e: string) => Shape.stringify(Shape.expr(e), true)
    assert.equal(r('Integer'), 'Integer')
    assert.equal(r('Optional(Integer)'), '0')
    assert.equal(r('Min(2,Integer)'), 'Integer.Min(2)')
    assert.equal(r('Date'), 'Date')
    assert.equal(r('Nullable(Number)'), 'Number')
    assert.equal(Shape.stringify(Shape.nodize(new Date(0)), true), '1970-01-01T00:00:00.000Z')
  })

  test('a type token with arguments applies the type to them', () => {
    assert.match(failure(Shape.expr('String(Min(2))'), 'a'), /must be a minimum length of 2/)
    assert.equal(Shape(Shape.expr('String(Min(2))'))('abc'), 'abc')
    assert.match(failure(Shape.expr('Number(Max(1))'), 5), /must be a maximum of 1/)
  })
})

/* Copyright (c) 2021-2024 Richard Rodger and other contributors, MIT License */

import { describe, test } from 'node:test'
import assert from 'node:assert'
import { deepEqual, throws } from './test-utils'

import { Shape as ShapeX } from '../dist/shape'

let ShapeModule = require('../dist/shape')
if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}
const Shape: ShapeX = ShapeModule

const {
  Catch,
  Closed,
  Default,
  Describe,
  Extend,
  Min,
  Omit,
  Open,
  Partial,
  Pick,
} = Shape

const { GPick, GOmit, GPartial, GExtend } = Shape as any


// Object algebra: Pick, Omit, Partial, Extend.
describe('algebra', () => {

  const base = () => ({ a: 1, b: String, c: true })

  test('pick', () => {
    deepEqual(Shape(Pick(['a'], base()))({}), { a: 1 })
    deepEqual(Shape(Pick('a', base()))({}), { a: 1 })
    deepEqual(Shape(Pick(['a', 'c'], base()))({ c: false }), { a: 1, c: false })
    deepEqual(Shape(Pick(['a', 'a'], base()))({}), { a: 1 })
    throws(() => Shape(Pick(['b'], base()))({}),
      'Validation failed for property "b" with value "undefined" because the value is required.')
    throws(() => Shape(Pick(['a'], base()))({ a: 2, b: 'x' }),
      'Validation failed for object "{a:2,b:x}" because the property "b" is not allowed.')
    deepEqual(Shape(Pick('a', Open(base())))({ z: 1 }), { z: 1, a: 1 })

    // Chained, and the G alias.
    deepEqual(Shape(Closed(base()).Pick('a'))({}), { a: 1 })
    deepEqual(Shape(GPick('a', base()))({}), { a: 1 })

    // An object default is narrowed with the properties.
    deepEqual(Pick('a', Default({ a: 1, b: 2 }, base())).f, { a: 1 })
    deepEqual(Shape(Pick('a', Default({ a: 1, b: 2 })))(undefined), { a: 1 })

    throws(() => Pick('z', base()), 'Shape: Pick: unknown property "z"')
    throws(() => Pick('a', String), 'Shape: Pick needs an object shape')
    throws(() => Pick('a'), 'Shape: Pick needs an object shape')
    throws(() => Pick(1 as any, base()), 'Shape: Pick needs a list of property names')
    throws(() => Pick([1] as any, base()), 'Shape: Pick needs a list of property names')
  })


  test('omit', () => {
    deepEqual(Shape(Omit('b', base()))({}), { a: 1, c: true })
    deepEqual(Shape(Omit(['z'], base()))({ b: 'x' }), { b: 'x', a: 1, c: true })
    throws(() => Shape(Omit('b', base()))({ b: 'x' }),
      'Validation failed for object "{b:x}" because the property "b" is not allowed.')
    deepEqual(Shape(Closed(base()).Omit(['b', 'c']))({}), { a: 1 })
    deepEqual(Shape(GOmit('b', base()))({}), { a: 1, c: true })

    throws(() => Omit('a', Number), 'Shape: Omit needs an object shape')
    throws(() => Omit(true as any, base()), 'Shape: Omit needs a list of property names')
  })


  test('partial', () => {
    deepEqual(Shape(Partial(base()))({}), { a: 1, b: '', c: true })
    throws(() => Shape(Partial(base()))({ b: 1 }),
      'Validation failed for property "b" with number "1" because the number is not of type string.')

    // Shallow: a nested object's own properties are as they were.
    throws(() => Shape(Partial({ a: { b: Number } }))({}),
      'Validation failed for property "a.b" with value "undefined" because the value is required.')

    // Each kind of child value is copied.
    deepEqual(Shape(Partial({ a: [Number], b: { c: 1 }, d: 'x', e: Min(2, Number) }))({}),
      { a: [], b: { c: 1 }, d: 'x', e: 0 })

    deepEqual(Shape(Closed(base()).Partial())({}), { a: 1, b: '', c: true })
    deepEqual(Shape(GPartial(base()))({}), { a: 1, b: '', c: true })
    deepEqual(Shape(Partial(Object))({ z: 1 }), { z: 1 })

    throws(() => Partial(String), 'Shape: Partial needs an object shape')
    throws(() => Partial(), 'Shape: Partial needs an object shape')
  })


  test('extend', () => {
    deepEqual(Shape(Extend({ e: 2 }, base()))({ b: 'x' }), { b: 'x', a: 1, c: true, e: 2 })
    throws(() => Shape(Extend({ e: Number }, base()))({ b: 'x' }),
      'Validation failed for property "e" with value "undefined" because the value is required.')
    deepEqual(Shape(Extend({ b: 5 }, base()))({}), { a: 1, b: 5, c: true })
    throws(() => Shape(Extend({ e: 2 }, base()))({ b: 'x', z: 1 }),
      'Validation failed for object "{b:x,z:1}" because the property "z" is not allowed.')
    deepEqual(Shape(Extend({ e: 2 }, Open(base())))({ b: 'x', z: 1 }), { b: 'x', z: 1, a: 1, c: true, e: 2 })

    // Only the extension's properties are taken, not its openness.
    throws(() => Shape(Extend(Open({ e: 2 }), base()))({ b: 'x', z: 1 }), 'the property "z" is not allowed')
    deepEqual(Shape(Extend(Object, base()))({ b: 'x' }), { b: 'x', a: 1, c: true })

    deepEqual(Shape(Closed(base()).Extend({ e: 2 }))({ b: 'x' }), { b: 'x', a: 1, c: true, e: 2 })
    deepEqual(Shape(GExtend({ e: 2 }, base()))({ b: 'x' }), { b: 'x', a: 1, c: true, e: 2 })

    throws(() => Extend('x', base()), 'Shape: Extend needs an object to extend with')
    throws(() => Extend({}, String), 'Shape: Extend needs an object shape')
  })


  test('source-untouched', () => {
    const b = base()
    const n = Closed(b)
    Pick('a', n)
    Omit('a', n)
    Partial(n)
    Extend({ e: 2 }, n)
    throws(() => Shape(n)({}), 'because the value is required')
    throws(() => Shape(n)({ b: 'x', e: 2 }), 'the property "e" is not allowed')
    deepEqual(Object.keys(b), ['a', 'b', 'c'])
  })


  test('composed', () => {
    deepEqual(Shape(Partial(Pick('b', Extend({ e: Number }, base()))))({}), { b: '' })

    // The base's own checks and metadata come along.
    const m = Pick('a', Describe('d', Min(2, base())))
    throws(() => Shape(m)({ a: 1 }), 'must be a minimum length of 2')
    assert.equal(m.m.description, 'd')

    // Key expressions in the source are compiled, so the real name is picked.
    throws(() => Shape(Pick('a', { 'a: Min(2)': 0, b: 1 }))({ a: 1 }), 'must be a minimum of 2')

    deepEqual(Shape(Omit('b', base())).jsonify(), { a: '1', c: 'true' })
  })


  test('key-expression', () => {
    // A key expression hands the example to the builder as its shape.
    deepEqual(Shape({ 'u: Pick(["a"])': { a: 1, b: 2 } })({}), { u: { a: 1 } })
    throws(() => Shape({ 'u: Omit(["a"])': { a: 1, b: 2 } })({ u: { a: 1 } }), 'the property "a" is not allowed')
    deepEqual(Shape({ 'u: Partial': { a: String } })({}), { u: { a: '' } })
    deepEqual(Shape({ 'u: Partial()': { a: String } })({ u: {} }), { u: { a: '' } })

    // Without its example the expression has nothing to work on.
    throws(() => Shape.expr('Pick(["a"])'), 'Shape: Pick needs an object shape')
    throws(() => Shape.expr('Pick(["a"],Object)'), 'Shape: Pick: unknown property "a"')
    deepEqual(Shape(Shape.expr('Partial(Object)'))({}), {})
  })


  test('catch-fallback-cloned-deep', () => {
    const s: any = Shape(Catch({ x: { y: [1] } }, Number))
    const r1 = s('a')
    const r2 = s('b')
    r1.x.y[0] = 9
    deepEqual(r2, { x: { y: [1] } })

    // Anything that is not a plain object or array is kept as-is.
    class Foo { z = 1 }
    const foo = new Foo()
    assert.equal((Shape(Catch(foo, Number)) as any)('a'), foo)
    const d = new Date(0)
    assert.equal((Shape(Catch(d, Number)) as any)('a').getTime(), 0)
    assert.equal((Shape(Catch(/a/, Number)) as any)('a').source, 'a')
  })
})

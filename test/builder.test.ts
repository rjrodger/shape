/* Copyright (c) 2021-2023 Richard Rodger and other contributors, MIT License */

import { describe, test } from 'node:test'
import assert from 'node:assert'
import { deepEqual, matchObject, throws } from './test-utils'


import type {
  Node,
  State,
  Update,
} from '../dist/shape'


import { Shape as ShapeX } from '../dist/shape'

import Pkg from '../package.json'


// Handle web (Shape) versus node ({Shape}) export.
let ShapeModule = require('../dist/shape')

if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}


const Shape: ShapeX = ShapeModule
const buildize = Shape.buildize
const makeErr = Shape.makeErr


const VERSION = Pkg.version

const {
  Above,
  After,
  All,
  Any,
  Before,
  Below,
  Check,
  Child,
  Closed,
  Default,
  Define,
  Empty,
  Exact,
  Func,
  Key,
  Len,
  Max,
  Min,
  Never,
  One,
  Open,
  Optional,
  Refer,
  Rename,
  Required,
  Skip,
  Some,
  Type,
} = Shape


class Foo {
  a = -1
  constructor(a: number) {
    this.a = a
  }
}

class Bar {
  b = -2
  constructor(b: number) {
    this.b = b
  }
}

type Zed = {
  c: number
  d: {
    e: string
  }
}


describe('builder', () => {

  test('builder-required', () => {
    let g0 = Shape({ a: Required({ x: 1 }) })
    deepEqual(g0({ a: { x: 1 } }), { a: { x: 1 } })
    throws(() => g0({}), 'Validation failed for property "a" with value "undefined" because the value is required.')
    throws(() => g0(), 'Validation failed for property "a" with value "undefined" because the value is required.')

    let g1 = Shape({ a: Required([1]) })
    deepEqual(g1({ a: [11] }), { a: [11] })
    throws(() => g1({}), 'Validation failed for property "a" with value "undefined" because the value is required.')
    throws(() => g1(), 'Validation failed for property "a" with value "undefined" because the value is required.')

    let g2 = Shape(Required(1))
    deepEqual(g2(1), 1)
    deepEqual(g2(2), 2)

    // TODO: note this in docs - deep child requires must be satisfied unless Skip
    let g3 = Shape({ a: { b: String } })
    throws(() => g3(), /"a.b".*required/)
    throws(() => g3({}), /"a.b".*required/)
    throws(() => g3({ a: {} }), /"a.b".*required/)

    let g4 = Shape({ a: Skip({ b: String }) })
    deepEqual(g4(), {})
    deepEqual(g4({}), {})
    deepEqual(g4({ a: undefined }), {})
    throws(() => g4({ a: {} }), /"a.b".*required/)

    let g5 = Shape(Required({ x: 1 }))
    deepEqual(g5({ x: 2 }), { x: 2 })
    throws(() => g5({ x: 2, y: 3 }), 'not allowed')
    throws(() => g5(), 'required')
    throws(() => g5({ y: 3 }), 'not allowed')

    let g6 = Shape(Closed(Required({ x: 1 })))
    deepEqual(g6({ x: 2 }), { x: 2 })
    throws(() => g6({ x: 2, y: 3 }), 'Validation failed for object "{x:2,y:3}" because the property "y" is not allowed.')
    throws(() => g6(), 'required')

    let g7 = Shape(Closed({ x: 1 }).Required())
    deepEqual(g7({ x: 2 }), { x: 2 })
    throws(() => g7({ x: 2, y: 3 }), 'Validation failed for object "{x:2,y:3}" because the property "y" is not allowed.')
    throws(() => g7(), 'required')

    let g8 = Shape({ a: Required(1) })
    matchObject(g8({ a: 2 }), { a: 2 })
    throws(() => g8({ a: 'x' }), /number/)
  })


  test('builder-optional', () => {
    deepEqual(Shape(Optional(1))(), 1)
    deepEqual(Shape(Optional(1))(2), 2)
    throws(() => Shape(Optional(1))(true), 'type')

    deepEqual(Shape({ a: Optional(1) })(), { a: 1 })
    deepEqual(Shape({ a: Optional(1) })({}), { a: 1 })
    deepEqual(Shape({ a: Optional(1) })({ a: undefined }), { a: 1 })
    deepEqual(Shape({ a: Optional(1) })({ a: 2 }), { a: 2 })
    throws(() => Shape({ a: Optional(1) })({ a: true }), 'type')

    deepEqual(Shape([Optional(1)])(), [])
    deepEqual(Shape([Optional(1)])([]), [])
    deepEqual(Shape([Optional(1)])([2]), [2])
    deepEqual(Shape([Optional(1)])([2, 3]), [2, 3])
    throws(() => Shape([Optional(1)])([true]), 'type')

    deepEqual(Shape([null, Optional(1)])(), [null, 1])
    deepEqual(Shape(Closed([Optional(1)]))(), [1])

    deepEqual(Shape(Optional(String))(), '')
    deepEqual(Shape(Optional(Number))(), 0)
    deepEqual(Shape(Optional(Boolean))(), false)
    deepEqual(Shape(Optional(Object))(), {})
    deepEqual(Shape(Optional(Array))(), [])

    deepEqual(Shape(Optional(Required('a')))(), 'a')
    deepEqual(Shape(Optional(Required(1)))(), 1)
    deepEqual(Shape(Optional(Required(true)))(), true)
    deepEqual(Shape(Optional(Required({})))(), {})
    deepEqual(Shape(Optional(Required([])))(), [])

    deepEqual(Shape(Optional())(), undefined)
    deepEqual(Shape(Optional())(undefined), undefined)

    deepEqual(Shape(Optional())(1), 1)
    deepEqual(Shape(Optional())('a'), 'a')
    deepEqual(Shape(Optional())(true), true)
    deepEqual(Shape(Optional())({}), {})
    deepEqual(Shape(Optional())([]), [])

    deepEqual(Shape(Optional(null))(), null)
    deepEqual(Shape(Optional(NaN))(), NaN)
    deepEqual(Shape(Optional(Infinity))(), Infinity)
    deepEqual(Shape(Optional(-Infinity))(), -Infinity)
    deepEqual(Shape(Optional(null))(null), null)
    deepEqual(Shape(Optional(NaN))(NaN), NaN)
    deepEqual(Shape(Optional(Infinity))(Infinity), Infinity)
    deepEqual(Shape(Optional(-Infinity))(-Infinity), -Infinity)
    throws(() => Shape(Optional(null))('a'), 'type')
    throws(() => Shape(Optional(NaN))('a'), 'type')
    throws(() => Shape(Optional(Infinity))('a'), 'type')
    throws(() => Shape(Optional(-Infinity))('a'), 'type')

    deepEqual(Shape(Optional(undefined))(), undefined)
    deepEqual(Shape(Optional(undefined))(undefined), undefined)
    throws(() => Shape(Optional(undefined))('a'), 'type')

    deepEqual(Shape(Empty().Optional())('a'), 'a')
    deepEqual(Shape(Optional().Empty())('b'), 'b')
  })


  test('builder-open', () => {
    deepEqual(Shape({})(), {})
    deepEqual(Shape(Open({}))(), {})

    deepEqual(Shape({})({}), {})
    deepEqual(Shape(Open({}))({}), {})

    deepEqual(Shape({})({ x: 1 }), { x: 1 })
    deepEqual(Shape(Open({}))({ x: 1 }), { x: 1 })

    throws(() => Shape({ y: 2 })({ x: 1 }), 'not allowed')
    deepEqual(Shape(Open({ y: 2 }))({ x: 1 }), { y: 2, x: 1 })

    throws(() => Shape({ y: 2 })({ x: 1, y: 3 }), 'not allowed')
    deepEqual(Shape(Open({ y: 2 }))({ x: 1, y: 3 }), { y: 3, x: 1 })


    deepEqual(Shape({ a: {} })(), { a: {} })
    deepEqual(Shape({ a: Open({}) })(), { a: {} })

    deepEqual(Shape({ a: {} })({}), { a: {} })
    deepEqual(Shape({ a: Open({}) })({}), { a: {} })

    deepEqual(Shape({ a: {} })({ a: { x: 1 } }), { a: { x: 1 } })
    deepEqual(Shape({ a: Open({}) })({ a: { x: 1 } }), { a: { x: 1 } })

    throws(() => Shape({ a: { y: 2 } })({ a: { x: 1 } }), 'not allowed')
    deepEqual(Shape({ a: Open({ y: 2 }) })({ a: { x: 1 } }), { a: { y: 2, x: 1 } })

    throws(() => Shape({ a: { y: 2 } })({ a: { x: 1, y: 3 } }), 'not allowed')
    deepEqual(Shape({ a: Open({ y: 2 }) })({ a: { x: 1, y: 3 } }), { a: { y: 3, x: 1 } })


    deepEqual(Shape({ a: Open({}).Default({ x: 1 }) })(), { a: { x: 1 } })

    // throws(() => Shape(Optional(1))(true), 'type')

  })


  test('builder-check', () => {
    let g0 = Shape(Check((v: any) => v === "x"))
    deepEqual(g0('x'), 'x')
    throws(() => g0('y'), 'Validation failed for string "y" because check "(v) => v === "x"" failed.')
    throws(() => g0(1), 'Validation failed for number "1" because check "(v) => v === "x"" failed.')
    throws(() => g0(), 'Validation failed for value "undefined" because the value is required.')
    deepEqual(Shape(Skip(g0))(), undefined)


    let g1 = Shape(Check(/a/))
    deepEqual(g1('a'), 'a')
    deepEqual(g1('qaq'), 'qaq')
    throws(() => g1('q'), 'Validation failed for string "q" because check "/a/" failed.')
    throws(() => g1(), 'Validation failed for value "undefined" because the value is required.')

    let g3 = Shape(Check('number'))
    deepEqual(g3(1), 1)
    throws(() => g3('a'), 'number')
    throws(() => g3(), 'required')

    let g4 = Shape({ x: Check('number') })
    deepEqual(g4({ x: 1 }), { x: 1 })
    throws(() => g4({ x: 'a' }), 'number')
    throws(() => g4({}), 'required')
    throws(() => g4(), 'required')

    let g5 = Shape(Check(/ul/i))
    deepEqual(g5('*UL*'), '*UL*')
    throws(() => g5(), 'required')
    throws(() => g5(undefined), 'required')
    throws(() => g5(NaN), 'check')
    throws(() => g5(null), 'check')

    let c0 = Shape(Check((v: any) => v === 1))
    deepEqual(c0(1), 1)
    throws(() => c0(2), 'Validation failed for number "2" because check "(v) => v === 1" failed.')
    throws(() => c0('x'), 'check')
    throws(() => c0(), 'required')
    deepEqual(c0.error(1), [])
    matchObject(c0.error('x'), [{ why: 'check' }])
    matchObject(c0.error(), [{ why: 'required' }])

    let c0s = Shape(Skip(c0))
    deepEqual(c0s(1), 1)
    throws(() => c0s(2), 'Validation failed for number "2" because check "(v) => v === 1" failed.')
    throws(() => c0s('x'), 'check')
    deepEqual(c0s(), undefined)
    deepEqual(c0s.error(1), [])
    matchObject(c0s.error('x'), [{ why: 'check' }])
    deepEqual(c0s.error(), [])

    let c0d = Shape(Default('foo', c0))
    deepEqual(c0d(1), 1)
    throws(() => c0d(2), 'Validation failed for number "2" because check "(v) => v === 1" failed.')
    throws(() => c0d('x'), 'check')
    deepEqual(c0d(), 'foo')
    deepEqual(c0d.error(1), [])
    matchObject(c0d.error('x'), [{ why: 'check' }])
    deepEqual(c0d.error(), [])

    let c1 = Shape(Check(/a/))
    deepEqual(c1('qaq'), 'qaq')
    throws(() => c1('qbq'), 'Validation failed for string "qbq" because check "/a/" failed.')
    throws(() => c1(1), 'check')
    throws(() => c1(), 'required')

    let c1d = Shape(Default('a', Check(/a/)))
    deepEqual(c1d('qaq'), 'qaq')
    throws(() => c1d('qbq'), 'Validation failed for string "qbq" because check "/a/" failed.')
    throws(() => c1d(1), 'check')
    deepEqual(c1d(), 'a')

    let v0 = Shape(Check((v: any) => !!v, Number))
    deepEqual(v0(1), 1)
    throws(() => v0('a'), 'number')


    let m0 = Shape({
      a: Check((v: any) => 2 === 1 + +v).Type(String)
    })
    deepEqual(m0({ a: '1' }), { a: '1' })
    throws(() => m0({ a: '2' }), 'because check')
    throws(() => m0({ a: 1 }), 'not of type string')


    let m1 = Shape({
      a: Check((v: any) => 2 === 1 + +v).String()
    })
    deepEqual(m1({ a: '1' }), { a: '1' })
    throws(() => m1({ a: '2' }), 'because check')
    throws(() => m1({ a: 1 }), 'not of type string')

  })


  test('builder-closed', () => {
    let tmp: any = {}

    let g0 = Shape({ a: { b: { c: Closed({ x: 1 }) } } })
    deepEqual(g0({ a: { b: { c: { x: 2 } } } }), { a: { b: { c: { x: 2 } } } })
    throws(() => g0({ a: { b: { c: { x: 2, y: 3 } } } }), 'Validation failed for property "a.b.c" with object "{x:2,y:3}" because ' +
        'the property "y" is not allowed.')

    let g1 = Shape(Closed([Date, RegExp]))
    deepEqual(g1(tmp.a0 = [new Date(), /a/]), tmp.a0)
    throws(() => g1([new Date(), /a/, 'Q']), 'not allowed')
    deepEqual(g1((tmp.a2 = [new Date(), /a/], tmp.a2.x = 1, tmp.a2)), tmp.a2)

    let g2 = Shape({ a: Closed([String]) })
    deepEqual(g2({ a: ['x'] }), { a: ['x'] })
    throws(() => g2({}), 'required')
    throws(() => g2({ a: undefined }), 'required')
    throws(() => g2({ a: [] }), 'required')
    throws(() => g2({ a: ['x', 'y'] }), 'not allowed')

    let g4 = Shape(Closed({ x: 1 }))
    deepEqual(g4({}), { x: 1 })
    deepEqual(g4({ x: 11 }), { x: 11 })
    throws(() => g4({ x: 11, y: 2 }), 'property \"y\" is not allowed')
  })


  test('builder-one', () => {
    let g0 = Shape(One(Number, String))
    deepEqual(g0(1), 1)
    deepEqual(g0('x'), 'x')
    throws(() => g0(true), 'Value "true" for property "" does not satisfy one of: Number, String')
    throws(() => g0(), 'Value "undefined" for property "" does not satisfy one of: Number, String')

    let g0o = Shape(Skip(One(Number, String)))
    deepEqual(g0o(1), 1)
    deepEqual(g0o('x'), 'x')
    deepEqual(g0o(), undefined)
    throws(() => g0o(true), 'Value "true" for property "" does not satisfy one of: Number, String')

    let g1 = Shape([One({ x: Number }, { x: String })])
    matchObject(g1([{ x: 1 }, { x: 'x' }, { x: 2 }, { x: 'y' }]), [{ x: 1 }, { x: 'x' }, { x: 2 }, { x: 'y' }])
    throws(() => g1([{ x: 1 }, { x: true }, { x: 2 }, { x: false }]), `Value "{x:true}" for property "1" does not satisfy one of: {"x":"Number"}, {"x":"String"}
Value "{x:false}" for property "3" does not satisfy one of: {"x":"Number"}, {"x":"String"}`)

    let g2 = Shape([One(
      { x: Exact('red'), y: String },
      { x: Exact('green'), z: Number }
    )])
    matchObject(g2([
      { x: 'red', y: 'Y' },
      { x: 'green', z: 1 },
    ]), [
      { x: 'red', y: 'Y' },
      { x: 'green', z: 1 },
    ])
    throws(() => g2([
      { x: 'green', z: 2, y: 22 },
      { x: 'red', y: 'Y', z: 'YY' }
    ]), `Value "{x:green,z:2,y:22}" for property "0" does not satisfy one of: {"x":"Exact(red)","y":"String"}, {"x":"Exact(green)","z":"Number"}
Value "{x:red,y:Y,z:YY}" for property "1" does not satisfy one of: {"x":"Exact(red)","y":"String"}, {"x":"Exact(green)","z":"Number"}`)

    throws(() => g2([
      { x: 'red', y: 3 },
      { x: 'green', z: 'Z' },
    ]), `Value "{x:red,y:3}" for property "0" does not satisfy one of: {"x":"Exact(red)","y":"String"}, {"x":"Exact(green)","z":"Number"}
Value "{x:green,z:Z}" for property "1" does not satisfy one of: {"x":"Exact(red)","y":"String"}, {"x":"Exact(green)","z":"Number"}`)
  })


  test('builder-some', () => {
    let g0 = Shape({ a: Some(Number, String) })
    deepEqual(g0({ a: 1 }), { a: 1 })
    deepEqual(g0({ a: 'x' }), { a: 'x' })
    throws(() => g0({ a: true }), `Value "true" for property "a" does not satisfy any of: Number, String`)

    throws(() => g0({}), 'Value "undefined" for property "a" does not satisfy any of: Number, String')

    let g1 = Shape(Some(Number, String))
    deepEqual(g1(1), 1)
    deepEqual(g1('x'), 'x')
    throws(() => g1(true), `Value "true" for property "" does not satisfy any of: Number, String`)

    let g2 = Shape([Some(Number, String)])
    deepEqual(g2([1]), [1])
    deepEqual(g2(['x']), ['x'])
    deepEqual(g2([1, 2]), [1, 2])
    deepEqual(g2([1, 'x']), [1, 'x'])
    deepEqual(g2(['x', 1]), ['x', 1])
    deepEqual(g2(['x', 'y']), ['x', 'y'])
    deepEqual(g2(['x', 1, 'y', 2]), ['x', 1, 'y', 2])
    throws(() =>
      g2([true]), `Value "true" for property "0" does not satisfy any of: Number, String`)

    let g3 = Shape({ a: [Some(Number, String)] })
    deepEqual(g3({ a: [1] }), { a: [1] })
    deepEqual(g3({ a: ['x'] }), { a: ['x'] })
    deepEqual(g3({ a: ['x', 1, 'y', 2] }), { a: ['x', 1, 'y', 2] })
    throws(() =>
      g3({ a: [1, 2, true] }), `Value "true" for property "a.2" does not satisfy any of: Number, String`)

    let g4 = Shape({ a: [Some(Open({ x: 1 }), Open({ x: 'X' }))] })
    deepEqual(g4({ a: [{ x: 2 }, { x: 'Q' }, { x: 3, y: true }, { x: 'W', y: false }] }), { a: [{ x: 2 }, { x: 'Q' }, { x: 3, y: true }, { x: 'W', y: false }] })

    let g5 = Shape({ a: [Some({ x: 1 }, Closed({ x: 'X' }))] })
    deepEqual(g5({ a: [{ x: 2 }, { x: 'Q' }] }), { a: [{ x: 2 }, { x: 'Q' }] })
  })


  test('builder-all', () => {

    let g0 = Shape(All(Open({ x: 1 }), Open({ y: 'a' })))

    // console.log(g0.stringify())

    deepEqual(g0.stringify(), '{"$$":"All($$ref0,$$ref1)","$$ref0":{"x":"1","$$":"Open"}' +
        ',"$$ref1":{"y":"\\"a\\"","$$":"Open"}}')
    deepEqual(g0({ x: 11, y: 'aa' }), { x: 11, y: 'aa' })
    deepEqual(g0({}), { x: 1, y: 'a' })
    throws(() => g0({ x: 'b', y: 'a' }), 
      'Value "{x:b,y:a}" for property "" does not satisfy all of:' +
      ' {x:1,$$:Open}, {y:a,$$:Open}')
    throws(() =>
      g0(), 'Validation failed for value "undefined" because the value is required.')



    let g0s = Shape(All(Open({ x: 1 }), Open({ y: 'a' })).Skip())
    deepEqual(g0s({ x: 11, y: 'aa' }), { x: 11, y: 'aa' })
    deepEqual(g0s({}), { x: 1, y: 'a' })
    throws(() => g0s({ x: 'b', y: 'a' }), 
      'Value "{x:b,y:a}" for property "" does not satisfy all of:' +
      ' {x:1,$$:Open}, {y:a,$$:Open}')
    deepEqual(g0s(), undefined)

    // TODO: Optional
    // deepEqual(g0s(), { x: 1, y: 'a' })



    let g1 = Shape({
      a: All(Check((v: number) => v > 10), Check((v: number) => v < 20))
    })
    // console.dir(g1.spec(), { depth: null })
    deepEqual(g1({ a: 11 }), { a: 11 })
    throws(() => g1({ a: 0 }), 
      'Value "0" for property "a" does not satisfy all of: ' +
      'Check((v) => v > 10), Check((v) => v < 20)')

    let g2 = Shape(All({ x: 1, y: Any() }, { x: Any(), y: 'a' }))
    deepEqual(g2({ x: 11, y: 'AA' }), { x: 11, y: 'AA' })
    // g2({ x: 11, y: true })
    throws(() => g2({ x: 11, y: true }), 'Value "{x:11,y:true}" for property "" does not satisfy all of:' +
        ' {"x":1,"y":"Any"}, {"x":"Any","y":"a"}')

    let g3 = Shape(All({ x: 1, y: Any() }, { x: Any(), y: { z: 'a' } }))
    deepEqual(g3({ x: 11, y: { z: 'AA' } }), { x: 11, y: { z: 'AA' } })
    throws(() => g3({ x: 11, y: { z: true } }), 'Value "{x:11,y:{z:true}}" for property "" does not satisfy all of:' +
        ' {"x":1,"y":"Any"}, {"x":"Any","y":{"z":"a"}}')

    let g4 = Shape(All(Open({ x: 1 }), Open({ y: 2 })))
    deepEqual(g4({ x: 11, y: 22 }), { x: 11, y: 22 })
    throws(() => g4({ x: 'X', y: 'Y' }), 
      'Value "{x:X,y:Y}" for property "" does not satisfy all of:' +
      ' {x:1,$$:Open}, {y:2,$$:Open}'
    )
  })


  test('builder-skip', () => {
    let g0a = Shape({ a: Skip(String) })
    matchObject(g0a({ a: 'x' }), { a: 'x' })

    // NOTE: Skip(Type) does not insert a default value.
    matchObject(g0a({}), {})
    throws(() => g0a({ a: 1 }), /string/)


    let g0 = Shape(Skip(String))
    deepEqual(g0('a'), 'a')
    deepEqual(g0(undefined), undefined)
    deepEqual(g0(), undefined)
    throws(() => g0(''), 'not allowed')
    throws(() => g0(null), 'type')
    throws(() => g0(NaN), 'type')

    let g1 = Shape(Skip('x'))
    deepEqual(g1('a'), 'a')
    deepEqual(g1(undefined), undefined)
    deepEqual(g1(), undefined)
    throws(() => g1(''), 'not allowed')
    throws(() => g1(null), 'type')
    throws(() => g1(NaN), 'type')

    let g2 = Shape(Skip(''))
    deepEqual(g2('a'), 'a')
    deepEqual(g2(undefined), undefined)
    deepEqual(g2(), undefined)
    deepEqual(g2(''), '')
    throws(() => g2(null), 'type')
    throws(() => g2(NaN), 'type')

    let g3 = Shape(Skip(Empty(String)))
    deepEqual(g3('a'), 'a')
    deepEqual(g3(undefined), undefined)
    deepEqual(g3(), undefined)
    deepEqual(g3(''), '')
    throws(() => g3(null), 'type')
    throws(() => g3(NaN), 'type')

    let g4 = Shape(Skip(Empty('x')))
    deepEqual(g4('a'), 'a')
    deepEqual(g4(undefined), undefined)
    deepEqual(g4(), undefined)
    deepEqual(g4(''), '')
    throws(() => g4(null), 'type')
    throws(() => g4(NaN), 'type')

    let g5 = Shape(Skip(Empty('')))
    deepEqual(g5('a'), 'a')
    deepEqual(g5(undefined), undefined)
    deepEqual(g5(), undefined)
    deepEqual(g5(''), '')
    throws(() => g5(null), 'type')
    throws(() => g5(NaN), 'type')

    let o0 = Shape({ p: Skip(String) })
    deepEqual(o0({ p: 'a' }), { p: 'a' })
    deepEqual(o0({ p: undefined }), { p: undefined })
    deepEqual(o0({}), {})
    throws(() => o0({ p: '' }), 'not allowed')
    throws(() => o0({ p: null }), 'type')
    throws(() => o0({ p: NaN }), 'type')

    let o1 = Shape({ p: Skip('x') })
    deepEqual(o1({ p: 'a' }), { p: 'a' })
    deepEqual(o1({ p: undefined }), { p: undefined })
    deepEqual(o1({}), {})
    throws(() => o1({ p: '' }), 'not allowed')
    throws(() => o1({ p: null }), 'type')
    throws(() => o1({ p: NaN }), 'type')

    let o2 = Shape({ p: Skip('') })
    deepEqual(o2({ p: 'a' }), { p: 'a' })
    deepEqual(o2({ p: undefined }), { p: undefined })
    deepEqual(o2({}), {})
    deepEqual(o2({ p: '' }), { p: '' })
    throws(() => o2({ p: null }), 'type')
    throws(() => o2({ p: NaN }), 'type')

    let o3 = Shape({ p: Skip(Empty(String)) })
    deepEqual(o3({ p: 'a' }), { p: 'a' })
    deepEqual(o3({ p: undefined }), { p: undefined })
    deepEqual(o3({}), {})
    deepEqual(o3({ p: '' }), { p: '' })
    throws(() => o3({ p: null }), 'type')
    throws(() => o3({ p: NaN }), 'type')

    let o4 = Shape({ p: Skip(Empty('x')) })
    deepEqual(o4({ p: 'a' }), { p: 'a' })
    deepEqual(o4({ p: undefined }), { p: undefined })
    deepEqual(o4({}), {})
    deepEqual(o4({ p: '' }), { p: '' })
    throws(() => o4({ p: null }), 'type')
    throws(() => o4({ p: NaN }), 'type')

    let o5 = Shape({ p: Skip(Empty('')) })
    deepEqual(o5({ p: 'a' }), { p: 'a' })
    deepEqual(o5({ p: undefined }), { p: undefined })
    deepEqual(o5({}), {})
    deepEqual(o5({ p: '' }), { p: '' })
    throws(() => o5({ p: null }), 'type')
    throws(() => o5({ p: NaN }), 'type')

    let a0 = Shape([Skip(String)])
    deepEqual(a0(['a']), ['a'])
    deepEqual(a0([undefined]), [undefined])
    deepEqual(a0([]), [])
    throws(() => a0(['']), 'not allowed')
    throws(() => a0([null]), 'type')
    throws(() => a0([NaN]), 'type')

    let a1 = Shape([Skip('x')])
    deepEqual(a1(['a']), ['a'])
    deepEqual(a1([undefined]), [undefined])
    deepEqual(a1([]), [])
    throws(() => a1(['']), 'not allowed')
    throws(() => a1([null]), 'type')
    throws(() => a1([NaN]), 'type')

    let a2 = Shape([Skip('')])
    deepEqual(a2(['a']), ['a'])
    deepEqual(a2([undefined]), [undefined])
    deepEqual(a2([]), [])
    deepEqual(a2(['']), [''])
    throws(() => a2([null]), 'type')
    throws(() => a2([NaN]), 'type')

    let a3 = Shape([Skip(Empty(String))])
    deepEqual(a3(['a']), ['a'])
    deepEqual(a3([undefined]), [undefined])
    deepEqual(a3([]), [])
    deepEqual(a3(['']), [''])
    throws(() => a3([null]), 'type')
    throws(() => a3([NaN]), 'type')

    let a4 = Shape([Skip(Empty('x'))])
    deepEqual(a4(['a']), ['a'])
    deepEqual(a4([undefined]), [undefined])
    deepEqual(a4([]), [])
    deepEqual(a4(['']), [''])
    throws(() => a4([null]), 'type')
    throws(() => a4([NaN]), 'type')

    let a5 = Shape([Skip(Empty(''))])
    deepEqual(a5(['a']), ['a'])
    deepEqual(a5([undefined]), [undefined])
    deepEqual(a5([]), [])
    deepEqual(a5(['']), [''])
    throws(() => a5([null]), 'type')
    throws(() => a5([NaN]), 'type')

  })


  test('builder-any', () => {
    let g0 = Shape({ a: Any(), b: Any('B') })
    matchObject(g0({ a: 2, b: 1 }), { a: 2, b: 1 })
    matchObject(g0({ a: 'x', b: 'y' }), { a: 'x', b: 'y' })
    deepEqual(g0({ b: 1 }), { b: 1 })
    deepEqual(g0({ a: 1, b: 'B' }), { a: 1, b: 'B' })
  })


  test('builder-never', () => {
    let g0 = Shape(Never())
    throws(() => g0(1), 'Validation failed for number "1" because no value is allowed.')
    let g1 = Shape({ a: Never() })
    throws(() => g1({ a: 'x' }), 'Validation failed for property "a" with string "x" because no value is allowed.')
  })


  test('builder-rename', () => {
    let g0 = Shape({ a: Rename('b', { x: 1 }) })
    matchObject(g0({ a: { x: 2 } }), { b: { x: 2 } })

    let g1 = Shape([
      Rename('a', String),
      Rename('b', 2),
      Rename({ name: 'c', keep: false }, true)
    ])
    matchObject(g1(['x', 22]), { 0: 'x', 1: 22, a: 'x', b: 22 })
    deepEqual('' + g1(['x', 22]), 'x,22')
    matchObject(g1(['x']), { 0: 'x', a: 'x', b: 2 })
    deepEqual('' + g1(['x']), 'x,2')
    throws(() => g1([]), 'required')
    matchObject(g1(['x', 22, false]), { 0: 'x', 1: 22, a: 'x', b: 22, c: false })

    let g2 = Shape({
      a: Number,
      b: Rename({ name: 'b', claim: ['a'], keep: false }, Number)
    })
    deepEqual(g2({ a: 1, b: 2 }), { a: 1, b: 2 })
    deepEqual(g2({ a: 1 }), { b: 1 })
  })


  test('builder-exact', () => {
    let g0 = Shape({ a: Exact(null) })
    matchObject(g0({ a: null }), { a: null })
    throws(() => g0({ a: 1 }), 'exactly one of: null')

    let g1 = Shape(Exact('foo', 'bar'))
    deepEqual(g1('foo'), 'foo')
    deepEqual(g1('bar'), 'bar')
    throws(() => g1('zed'), 'exactly one of: foo, bar')
  })


  test('builder-construct', () => {
    const SHAPE$ = Symbol.for('shape$')

    matchObject(Required('x'), {
      '$': { 'shape$': SHAPE$ },
      t: 'string',
      v: 'x',
      r: true,
    })

    matchObject(Skip(String), {
      '$': { 'shape$': SHAPE$ },
      t: 'string',
      v: '',
      r: false,
    })


    matchObject(Required(Required('x')), {
      '$': { 'shape$': SHAPE$ },
      t: 'string',
      v: 'x',
      r: true,
    })

    matchObject(Skip(Required('x')), {
      '$': { 'shape$': SHAPE$ },
      t: 'string',
      v: 'x',
      r: false,
    })

    matchObject(Required('x').Required(), {
      '$': { 'shape$': SHAPE$ },
      t: 'string',
      v: 'x',
      r: true,
    })

    matchObject(Required('x').Skip(), {
      '$': { 'shape$': SHAPE$ },
      t: 'string',
      v: 'x',
      r: false,
    })


    matchObject(Skip(Skip(String)), {
      '$': { 'shape$': SHAPE$ },
      t: 'string',
      v: '',
      r: false,
    })

    matchObject(Skip(String).Skip(), {
      '$': { 'shape$': SHAPE$ },
      t: 'string',
      v: '',
      r: false,
    })

    matchObject(Skip(String).Required(), {
      '$': { 'shape$': SHAPE$ },
      t: 'string',
      v: '',
      r: true,
    })

    matchObject(Required(Skip(String)), {
      '$': { 'shape$': SHAPE$ },
      t: 'string',
      v: '',
      r: true,
    })
  })


  test('builder-before', () => {
    // Use before to check for undefined, as it not passed to Check
    let b0 = Shape(Before((v: any) => undefined === v))
    deepEqual(b0(undefined), undefined)
    throws(() => b0(1), 'check')
  })


  test('builder-before-after-basic', () => {
    let g0 = Shape(
      Before((val: any, _update: Update) => {
        val.b = 1 + val.a
        return true
      }, Open({ a: 1 }))
        .After((val: any, _update: Update) => {
          val.c = 10 * val.a
          return true
        }))

    assert.match('' + g0, /\[Shape G\$\d+ \{"a":"1","\$\$":"Open"\}\]/)
    matchObject(g0({ a: 2 }), { a: 2, b: 3, c: 20 })

    let g1 = Shape({
      x:
        After((val: any, _update: Update) => {
          val.c = 10 * val.a
          return true
        }, Open({ a: 1 }))
          .Before((val: any, _update: Update) => {
            val.b = 1 + val.a
            return true
          })
    })
    matchObject(g1({ x: { a: 2 } }), { x: { a: 2, b: 3, c: 20 } })
  })


  test('builder-custom-hyperbole', () => {
    const Hyperbole = function <V>(this: any, shape0?: Node<V> | V): Node<V> {
      let node = buildize(this, shape0)

      node.b.push((v: any, u: Update) => {
        if ('string' === typeof (v)) {
          u.val = v.toUpperCase()
        }
        return true
      })

      node.a.push((v: any, u: Update) => {
        if ('string' === typeof (v)) {
          u.val = v + '!'
        }
        return true
      })

      return node
    }

    const g0 = Shape(Hyperbole('foo'))
    deepEqual(g0('a'), 'A!')
    throws(() => g0(1), 'type')
    deepEqual(g0(), 'foo!') // before called before processing!

    const g1 = Shape(Skip(Hyperbole(One(String, Number))))
    deepEqual(g1('a'), 'A!')
    deepEqual(g1(1), 1)
    deepEqual(g1(), undefined)
  })


  test('deep-object-basic', () => {
    let a1 = Shape({ a: 1 })
    matchObject(a1({}), { a: 1 })

    let ab1 = Shape({ a: { b: 1 } })
    matchObject(ab1({}), { a: { b: 1 } })

    let abc1 = Shape({ a: { b: { c: 1 } } })
    matchObject(abc1({}), { a: { b: { c: 1 } } })


    let ab1c2 = Shape({ a: { b: 1 }, c: 2 })
    matchObject(ab1c2({}), { a: { b: 1 }, c: 2 })

    let ab1cd2 = Shape({ a: { b: 1 }, c: { d: 2 } })
    matchObject(ab1cd2({}), { a: { b: 1 }, c: { d: 2 } })

    let abc1ade2f3 = Shape({ a: { b: { c: 1 }, d: { e: 2 } }, f: 3 })
    matchObject(abc1ade2f3({}), { a: { b: { c: 1 }, d: { e: 2 } }, f: 3 })


    let d0 = Shape({
      a: { b: { c: 1 }, d: { e: { f: 3 } } },
      h: 3,
      i: { j: { k: 4 }, l: { m: 5 } },
      n: { o: 6 }
    })
    matchObject(d0({}), {
      a: { b: { c: 1 }, d: { e: { f: 3 } } },
      h: 3,
      i: { j: { k: 4 }, l: { m: 5 } },
      n: { o: 6 }
    })

  })


  test('array-special', () => {
    let a0 = Shape([1])
    matchObject(a0(), [])
    matchObject(a0([]), [])
    matchObject(a0([11]), [11])
    matchObject(a0([11, 22]), [11, 22])

    let a1 = Shape([Number, String])
    throws(() => a1(), 'required')
    throws(() => a1([]), 'required')
    throws(() => a1([1]), 'required')
    matchObject(a1([1, 'x']), [1, 'x'])
    throws(() => a1([1, 'x', 'y']), 'not allowed')
    throws(() => a1(['x', 'y']), 'Validation failed for index "0" with string "x" because the string is not of type number.')
    throws(() => a1([1, 2]), 'Validation failed for index "1" with number "2" because the number is not of type string.')

    let a2 = Shape([9, String])
    throws(() => a2(), 'required')
    throws(() => a2([]), 'required')
    throws(() => a2([1]), 'required')
    matchObject(a2([1, 'x']), [1, 'x'])
    throws(() => a2([1, 'x', 'y']), 'not allowed')
    throws(() => a2(['x', 1]), `Validation failed for index "0" with string "x" because the string is not of type number.
Validation failed for index "1" with number "1" because the number is not of type string.`)
    throws(() => a2(['x', 'y']), 'Validation failed for index "0" with string "x" because the string is not of type number.')

    let a3 = Shape([1, 2, 3])
    deepEqual(a3(), [1, 2, 3])
    deepEqual(a3([]), [1, 2, 3])
    deepEqual(a3([11]), [11, 2, 3])
    deepEqual(a3([11, 22]), [11, 22, 3])
    matchObject(a3([11, 22, 33]), [11, 22, 33])
    throws(() => a3([11, 22, 33, 44]), 'not allowed')
    matchObject(a3([undefined, 22, 33]), [1, 22, 33])
    matchObject(a3([undefined, undefined, 33]), [1, 2, 33])
    matchObject(a3([undefined, undefined, undefined]), [1, 2, 3])

    // non-index properties on array shape are not supported
    // FEATURE: support non-index properties on array shape
    let r0: any = null
    let A0: any = [String]
    A0.x = 1
    let g3 = Shape({ a: A0 })
    deepEqual(g3({}), { a: [] })

    deepEqual(r0 = g3({ a: undefined }), { a: [] })
    assert.equal(r0.x, undefined)

    deepEqual(r0 = g3({ a: [] }), { a: [] })
    assert.equal(r0.x, undefined)
  })


  test('builder-custom-between', () => {
    const rangeCheck = Shape([Number, Number])
    const Between =
      function(this: any, inopts: any, spec?: any) {
        let vs = buildize(this || spec)
        let range: number[] = rangeCheck(inopts)

        vs.b.push((val: any, update: Update, state: State) => {
          // Don't run any more checks after this.
          update.done = true

          if ('number' === typeof (val) && range[0] < val && val < range[1]) {
            return true
          }
          else {
            update.err = [
              makeErr(state,
                `Value "$VALUE" for property "$PATH" is ` +
                `not between ${range[0]} and ${range[1]}.`)
            ]
            return false
          }
        })

        return vs
      }

    const g0 = Shape({ a: [Between([10, 20])] })
    deepEqual(g0({ a: [11, 12, 13] }), { a: [11, 12, 13] })
    throws(() => g0({ a: [11, 9, 13, 'y'] }), 'Value "9" for property "a.1" is not between 10 and 20.\nValue "y" for property "a.3" is not between 10 and 20.')
  })




  test('builder-define-refer-basic', () => {
    let g0 = Shape({ a: Define('A', { x: 1 }), b: Refer('A'), c: Refer('A') })
    deepEqual(g0({ a: { x: 2 }, b: { x: 2 } }), { a: { x: 2 }, b: { x: 2 } })
    deepEqual(g0({ a: { x: 33 }, b: { x: 44 }, c: { x: 55 } }), { a: { x: 33 }, b: { x: 44 }, c: { x: 55 } })
    throws(() => g0({ a: { x: 33 }, b: { x: 'X' } }), 'Validation failed for property "b.x" with string "X" because the string is not of type number.')

    let g1 = Shape({
      a: Define('A', { x: 1 }),
      b: Refer('A'),
      c: Refer({ name: 'A', fill: true })
    })
    deepEqual(g1({ a: { x: 2 } }), { a: { x: 2 }, c: { x: 1 } })
    deepEqual(g1({ a: { x: 2 }, b: { x: 2 } }), { a: { x: 2 }, b: { x: 2 }, c: { x: 1 } })
    deepEqual(g1({ a: { x: 2 }, b: { x: 2 }, c: {} }), { a: { x: 2 }, b: { x: 2 }, c: { x: 1 } })
    deepEqual(g1({ a: { x: 33 }, b: { x: 44 }, c: { x: 2 } }), { a: { x: 33 }, b: { x: 44 }, c: { x: 2 } })

  })


  test('builder-define-refer-recursive', () => {
    let g0 = Shape({
      a: Define('A', {
        b: {
          c: 1,
          a: Refer('A')
        }
      }),
    })

    deepEqual(g0({
      a: {
        b: {
          c: 2,
        }
      }
    }), {
      a: {
        b: {
          c: 2,
        }
      }
    })

    deepEqual(g0({
      a: {
        b: {
          c: 2,
          a: {
            b: {
              c: 3
            }
          }
        }
      }
    }), {
      a: {
        b: {
          c: 2,
          a: {
            b: {
              c: 3
            }
          }
        }
      }
    })

    throws(() => g0({
      a: {
        b: {
          c: 2,
          a: {
            b: {
              c: 'C'
            }
          }
        }
      }
    }), 'Validation failed for property "a.b.a.b.c" with string "C" because the string is not of type number.')

    deepEqual(g0({
      a: {
        b: {
          c: 2,
          a: {
            b: {
              c: 3,
              a: {
                b: {
                  c: 4
                }
              }
            }
          }
        }
      }
    }), {
      a: {
        b: {
          c: 2,
          a: {
            b: {
              c: 3,
              a: {
                b: {
                  c: 4
                }
              }
            }
          }
        }
      }
    })
  })


  test('builder-min-basic', () => {
    let g0 = Shape({
      a: Min(10),
      b: Min(2, [String]),
      c: Min(3, 'foo'),
      d: [Min(4, Number)],
      e: [Min(2, {})],
    })
    matchObject(g0({ a: 10 }), { a: 10 })
    matchObject(g0({ a: 11 }), { a: 11 })
    throws(() => g0({ a: 9 }), `Value "9" for property "a" must be a minimum of 10 (was 9).`)

    matchObject(g0({ b: ['x', 'y'] }), { b: ['x', 'y'] })
    matchObject(g0({ b: ['x', 'y', 'z'] }), { b: ['x', 'y', 'z'] })
    throws(() => g0({ b: ['x'] }), `Value "[x]" for property "b" must be a minimum length of 2 (was 1).`)
    throws(() => g0({ b: [] }), `Value "[]" for property "b" must be a minimum length of 2 (was 0).`)

    matchObject(g0({ c: 'bar' }), { c: 'bar' })
    matchObject(g0({ c: 'barx' }), { c: 'barx' })
    throws(() => g0({ c: 'ba' }), `Value "ba" for property "c" must be a minimum length of 3 (was 2).`)

    matchObject(g0({ d: [4, 5, 6] }), { d: [4, 5, 6] })
    throws(() => g0({ d: [4, 5, 6, 3] }), `Value "3" for property "d.3" must be a minimum of 4 (was 3).`)

    matchObject(g0({ e: [{ x: 1, y: 2 }] }), { e: [{ x: 1, y: 2 }] })
    matchObject(g0({ e: [{ x: 1, y: 2, z: 3 }] }), { e: [{ x: 1, y: 2, z: 3 }] })
    throws(() => g0({ e: [{ x: 1 }] }), 'Value "{x:1}" for property "e.0" must be a minimum length of 2 (was 1).')
    throws(() => g0({ e: [{}] }), 'Value "{}" for property "e.0" must be a minimum length of 2 (was 0).')
    matchObject(g0({ e: [] }), { e: [] })
  })


  test('builder-min-example', () => {
    const { Min } = Shape

    let shape = Shape({
      size: Min(2, 4)  // Minimum is 2, default is 4, type is Number, optional
    })

    deepEqual(shape({}), { size: 4 })
    deepEqual(shape({ size: 3 }), { size: 3 })
    throws(() => shape({ size: 1 }), 'minimum')
  })


  test('builder-max', () => {
    let g0 = Shape({
      a: Max(10),
      b: Max(2, [String]),
      c: Max(3, 'foo'),
      d: [Max(4, Number)],
      e: [Max(2, {})],
    })
    matchObject(g0({ a: 10 }), { a: 10 })
    matchObject(g0({ a: 9 }), { a: 9 })
    throws(() => g0({ a: 11 }), `Value "11" for property "a" must be a maximum of 10 (was 11).`)

    matchObject(g0({ b: ['x', 'y'] }), { b: ['x', 'y'] })
    matchObject(g0({ b: ['x'] }), { b: ['x'] })
    matchObject(g0({ b: [] }), { b: [] })
    throws(() => g0({ b: ['x', 'y', 'z'] }), `Value "[x,y,z]" for property "b" must be a maximum length of 2 (was 3).`)

    matchObject(g0({ c: 'bar' }), { c: 'bar' })
    matchObject(g0({ c: 'ba' }), { c: 'ba' })
    matchObject(g0({ c: 'b' }), { c: 'b' })
    throws(() => g0({ c: 'barx' }), `Value "barx" for property "c" must be a maximum length of 3 (was 4).`)
    throws(() => g0({ c: '' }), `Validation failed for property "c" with string "" because an empty string is not allowed.`)

    matchObject(g0({ d: [4, 3, 2, 1, 0, -1] }), { d: [4, 3, 2, 1, 0, -1] })
    matchObject(g0({ d: [] }), { d: [] })
    throws(() => g0({ d: [4, 5] }), `Value "5" for property "d.1" must be a maximum of 4 (was 5).`)

    matchObject(g0({ e: [{ x: 1, y: 2 }] }), { e: [{ x: 1, y: 2 }] })
    matchObject(g0({ e: [{ x: 1 }] }), { e: [{ x: 1 }] })
    matchObject(g0({ e: [{}] }), { e: [{}] })
    throws(() => g0({ e: [{ x: 1, y: 2, z: 3 }] }), 'Value "{x:1,y:2,z:3}" for property "e.0" must be a maximum length of 2 (was 3).')
    matchObject(g0({ e: [] }), { e: [] })
  })


  test('builder-above', () => {
    let g0 = Shape({
      a: Above(10),
      b: Above(2, [String]),
      c: Above(3, 'foo'),
      d: [Above(4, Number)],
      e: [Above(2, {})],
    })
    matchObject(g0({ a: 12 }), { a: 12 })
    matchObject(g0({ a: 11 }), { a: 11 })
    throws(() => g0({ a: 10 }), `Value "10" for property "a" must be above 10 (was 10).`)
    throws(() => g0({ a: 9 }), `Value "9" for property "a" must be above 10 (was 9).`)

    matchObject(g0({ b: ['x', 'y', 'z'] }), { b: ['x', 'y', 'z'] })
    throws(() => g0({ b: ['x', 'y'] }), `Value "[x,y]" for property "b" must have length above 2 (was 2).`)
    throws(() => g0({ b: ['x'] }), `Value "[x]" for property "b" must have length above 2 (was 1).`)
    throws(() => g0({ b: [] }), `Value "[]" for property "b" must have length above 2 (was 0).`)

    matchObject(g0({ c: 'barx' }), { c: 'barx' })
    throws(() => g0({ c: 'bar' }), `Value "bar" for property "c" must have length above 3 (was 3).`)
    throws(() => g0({ c: 'ba' }), `Value "ba" for property "c" must have length above 3 (was 2).`)
    throws(() => g0({ c: 'b' }), `Value "b" for property "c" must have length above 3 (was 1).`)
    throws(() => g0({ c: '' }), 'Value "" for property "c" must have length above 3 (was 0).')

    matchObject(g0({ d: [5, 6] }), { d: [5, 6] })
    throws(() => g0({ d: [4, 5, 6, 3] }), `Value "4" for property "d.0" must be above 4 (was 4).
Value "3" for property "d.3" must be above 4 (was 3).`)

    matchObject(g0({ e: [{ x: 1, y: 2, z: 3 }] }), { e: [{ x: 1, y: 2, z: 3 }] })
    throws(() => g0({ e: [{ x: 1, y: 2 }] }), 'Value "{x:1,y:2}" for property "e.0" must have length above 2 (was 2).')
    throws(() => g0({ e: [{ x: 1 }] }), 'Value "{x:1}" for property "e.0" must have length above 2 (was 1).')
    throws(() => g0({ e: [{}] }), 'Value "{}" for property "e.0" must have length above 2 (was 0).')
    matchObject(g0({ e: [] }), { e: [] })
  })


  test('builder-below', () => {
    let g0 = Shape({
      a: Below(10),
      b: Below(2, [String]),
      c: Below(3, 'foo'),
      d: [Below(4, Number)],
      e: [Below(2, {})],
    })
    matchObject(g0({ a: 8 }), { a: 8 })
    matchObject(g0({ a: 9 }), { a: 9 })
    throws(() => g0({ a: 10 }), `Value "10" for property "a" must be below 10 (was 10).`)
    throws(() => g0({ a: 11 }), `Value "11" for property "a" must be below 10 (was 11).`)

    matchObject(g0({ b: ['x'] }), { b: ['x'] })
    matchObject(g0({ b: [] }), { b: [] })
    throws(() => g0({ b: ['x', 'y', 'z'] }), `Value "[x,y,z]" for property "b" must have length below 2 (was 3).`)
    throws(() => g0({ b: ['x', 'y'] }), `Value "[x,y]" for property "b" must have length below 2 (was 2).`)

    matchObject(g0({ c: 'ba' }), { c: 'ba' })
    matchObject(g0({ c: 'b' }), { c: 'b' })
    throws(() => g0({ c: 'bar' }), `Value "bar" for property "c" must have length below 3 (was 3).`)
    throws(() => g0({ c: 'barx' }), `Value "barx" for property "c" must have length below 3 (was 4).`)
    throws(() => g0({ c: '' }), `Validation failed for property "c" with string "" because an empty string is not allowed.`)

    matchObject(g0({ d: [3, 2, 1, 0, -1] }), { d: [3, 2, 1, 0, -1] })
    matchObject(g0({ d: [] }), { d: [] })
    throws(() => g0({ d: [4, 5] }), `Value "4" for property "d.0" must be below 4 (was 4).
Value "5" for property "d.1" must be below 4 (was 5).`)

    matchObject(g0({ e: [{ x: 1 }] }), { e: [{ x: 1 }] })
    matchObject(g0({ e: [{}] }), { e: [{}] })
    throws(() => g0({ e: [{ x: 1, y: 2 }] }), 'Value "{x:1,y:2}" for property "e.0" must have length below 2 (was 2).')
    matchObject(g0({ e: [] }), { e: [] })

  })


  test('builder-len', () => {
    let g0 = Shape({
      a: Len(1),
      b: Len(2, [String]),
      c: Len(3, 'foo'),
      d: [Len(4, Number)],
      e: [Len(2, {})],
    })
    matchObject(g0({ a: 'a' }), { a: 'a' })
    matchObject(g0({ a: 1 }), { a: 1 })
    throws(() => g0({ a: 'bb' }), `Value "bb" for property "a" must be exactly 1 in length (was 2).`)

    matchObject(g0({ b: ['x', 'y'] }), { b: ['x', 'y'] })
    throws(() => g0({ b: ['x', 'y', 'z'] }), `Value "[x,y,z]" for property "b" ` +
        `must be exactly 2 in length (was 3).`)
    throws(() => g0({ b: ['x'] }), `Value "[x]" for property "b" must be exactly 2 in length (was 1).`)
    throws(() => g0({ b: [] }), `Value "[]" for property "b" must be exactly 2 in length (was 0).`)
  })


  test('builder-func', () => {
    let f0 = () => 1
    let f1 = () => 2
    let g0 = Shape(Func(f0))
    deepEqual(g0(), f0)
    deepEqual(g0(f1), f1)
    throws(() => g0(1), 'type')

    // Escapes type functions
    let g1 = Shape(Func(Number))
    deepEqual(g1(), Number)
    deepEqual(g1(Number), Number)
    throws(() => g1(1), 'type')
  })



  test('builder-key', () => {
    let g0 = Shape({
      a: {
        b: {
          c: {
            name: Key(),
            part0: Key(0),
            part1: Key(1),
            part2: Key(2),
            join: Key(3, '.'),
            self: Key(-1),
            custom: Key((path: string, _state: State) => {
              return path.length
            }),
            x: 1,
          }
        }
      }
    })

    matchObject(g0({ a: { b: { c: { x: 2 } } } }), {
      a: {
        b: {
          c: {
            name: 'c',
            self: ['self'],
            part0: [],
            part1: ['c'],
            part2: ['b', 'c'],
            join: 'a.b.c',
            custom: 5,
            x: 2,
          }
        }
      }
    })


    let g1 = Shape(Child({ name: Key() }))
    matchObject(g1({ a: {}, b: {} }), { a: { name: 'a' }, b: { name: 'b' } })
  })


  test('builder-child', () => {
    let g0 = Shape(Child(Number))
    matchObject(g0({ a: 1, b: 2 }), { a: 1, b: 2 })
    throws(() => g0({ a: 1, b: 2, c: 'c' }), 'type')

    let g1 = Shape(Child(String, { a: 1 }))
    matchObject(g1({}), {})
    matchObject(g1({ a: 2 }), { a: 2 })
    throws(() => g1({ a: 'x' }), 'type')
    matchObject(g1({ a: 2, b: 'x' }), { a: 2, b: 'x' })
    matchObject(g1({ a: 2, b: 'x', c: 'y' }), { a: 2, b: 'x', c: 'y' })
    throws(() => g1({ a: 2, b: 3 }), 'Validation failed for property "b" with number "3" because the number is not of type string.')
    throws(() => g1({ a: 2, b: 'x', c: 4 }), 'Validation failed for property "c" with number "4" because the number is not of type string.')

    throws(() => g1({ a: true, b: 'x', c: 'y' }), 'Validation failed for property "a" with boolean "true" because the boolean is not of type number.')

    throws(() => g1({ a: 'z', b: 'x', c: 'y' }), 'Validation failed for property "a" with string "z" because the string is not of type number.')

    let g2 = Shape({ a: Required({ b: 1 }).Child({ x: String }) })
    matchObject(g2({ a: { b: 2, c: { x: 'x' } } }), { a: { b: 2, c: { x: 'x' } } })
    matchObject(g2({ a: { b: 2, c: { x: 'x' }, d: { x: 'z' } } }), { a: { b: 2, c: { x: 'x' }, d: { x: 'z' } } })
    throws(() => g2({ a: { b: 2, c: 3 } }), 'Validation failed for property "a.c" with number "3" because the number is not of type object.')

    let g3 = Shape({ a: Child({ y: Number, x: Number }) })
    deepEqual(g3({ a: { b: { y: 11, x: 11 }, c: { x: 22, y: 22 } } }), { a: { b: { x: 11, y: 11 }, c: { x: 22, y: 22 } } })

    let g4 = Shape({ a: Child({}) })
    deepEqual(g4({ a: { b: { y: 11, x: 11 }, c: { x: 22, y: 22 } } }), { a: { b: { x: 11, y: 11 }, c: { x: 22, y: 22 } } })

    let g5 = Shape({ a: Child({ b: {} }) })
    deepEqual(g5({ a: { x: { b: {} }, y: { b: {} } } }), { a: { x: { b: {} }, y: { b: {} } } })

    let g6 = Shape({ a: Child({ b: Child({ c: 1 }) }) })
    deepEqual(g6({ a: { x: { b: { xx: { c: 11 } } }, y: { b: { yy: { c: 22 } } } } }), { a: { x: { b: { xx: { c: 11 } } }, y: { b: { yy: { c: 22 } } } } })

    let g7 = Shape({ a: Child({ b: 1 }) })
    deepEqual(g7.spec().v.a.c.t, 'object')

  })


  test('builder-skip', () => {

    // Skip does not insert, but does check type.
    let t0 = Shape(Skip())
    deepEqual(t0(), undefined)
    deepEqual(t0(undefined), undefined)
    deepEqual(t0(null), null)
    deepEqual(t0(NaN), NaN)
    deepEqual(t0(true), true)
    deepEqual(t0(false), false)
    deepEqual(t0(0), 0)
    deepEqual(t0(1), 1)
    deepEqual(t0('a'), 'a')
    deepEqual(t0(''), '')
    deepEqual(t0({}), {})
    deepEqual(t0([]), [])

    let t1 = Shape(Skip(1))
    deepEqual(t1(), undefined)
    deepEqual(t1(undefined), undefined)
    throws(() => t1(null), 'type')
    throws(() => t1(NaN), 'type')
    throws(() => t1(true), 'type')
    throws(() => t1(false), 'type')
    deepEqual(t1(0), 0)
    deepEqual(t1(1), 1)
    throws(() => t1('a'), 'type')
    throws(() => t1(''), 'type')
    throws(() => t1({}), 'type')
    throws(() => t1([]), 'type')

    let t2 = Shape(Skip(Number))
    deepEqual(t2(), undefined)
    deepEqual(t2(undefined), undefined)
    throws(() => t2(null), 'type')
    throws(() => t2(NaN), 'type')
    throws(() => t2(true), 'type')
    throws(() => t2(false), 'type')
    deepEqual(t2(0), 0)
    deepEqual(t2(1), 1)
    throws(() => t2('a'), 'type')
    throws(() => t2(''), 'type')
    throws(() => t2({}), 'type')
    throws(() => t2([]), 'type')

    let d1 = Shape({ a: Skip(1) })
    deepEqual(d1({}), {})
    deepEqual(d1({ a: undefined }), { a: undefined })
    throws(() => d1({ a: null }), 'type')
    throws(() => d1({ a: NaN }), 'type')
    throws(() => d1({ a: true }), 'type')
    throws(() => d1({ a: false }), 'type')
    deepEqual(d1({ a: 0 }), { a: 0 })
    deepEqual(d1({ a: 1 }), { a: 1 })
    throws(() => d1({ a: 'a' }), 'type')
    throws(() => d1({ a: '' }), 'type')
    throws(() => d1({ a: {} }), 'type')
    throws(() => d1({ a: [] }), 'type')
  })



  test('builder-default', () => {

    let d0 = Shape({
      a: 1,
      b: Default(2)
    })

    deepEqual(d0(), { a: 1, b: 2 })
    deepEqual(d0(undefined), { a: 1, b: 2 })
    throws(() => d0(null), 'type')
    deepEqual(d0({ a: 3 }), { a: 3, b: 2 })
    deepEqual(d0({ b: 4 }), { a: 1, b: 4 })
    deepEqual(d0({ a: 3, b: 4 }), { a: 3, b: 4 })


    let d1 = Shape(Default(Number))
    deepEqual(d1(11), 11)
    deepEqual(d1(undefined), 0)
    deepEqual(d1(), 0)

    let d2 = Shape({ a: Default(Number) })
    deepEqual(d2({ a: 11 }), { a: 11 })
    deepEqual(d2({ a: undefined }), { a: 0 })
    deepEqual(d2(), { a: 0 })

    let d3 = Shape(Default(Object))
    deepEqual(d3({ x: 1 }), { x: 1 })
    deepEqual(d3({}), {})
    deepEqual(d3(), {})

    let d4 = Shape({ a: Default(Object) })
    deepEqual(d4({ a: { x: 2 } }), { a: { x: 2 } })
    deepEqual(d4({ a: {} }), { a: {} })
    deepEqual(d4({ a: undefined }), { a: {} })
    deepEqual(d4({}), { a: {} })
    deepEqual(d4(), { a: {} })

    let d5 = Shape(Default({ a: null }, { a: Number }))
    deepEqual(d5({ a: 1 }), { a: 1 })
    deepEqual(d5(), { a: null })
    throws(() => d5({ a: 'x' }), 'type')

    let d6 = Shape({ a: Default(Array) })
    deepEqual(d6({ a: [1] }), { a: [1] })
    deepEqual(d6({ a: [] }), { a: [] })
    deepEqual(d6({ a: undefined }), { a: [] })
    deepEqual(d6({}), { a: [] })
    deepEqual(d6(), { a: [] })

    let d7 = Shape(Default({ a: null }, { a: [Number] }))
    deepEqual(d7({ a: [1, 2] }), { a: [1, 2] })
    deepEqual(d7(), { a: null })
    throws(() => d7({ a: 'x' }), 'type')

  })



  test('builder-type', () => {

    let s0 = {
      a: Type('Number')
    }

    let d0 = Shape(s0)

    let v0a = d0({ a: 1 })

    // let x: { a: number } & { a: string } = { a: 1 }

    deepEqual(d0.stringify(null, true), '{"a":"Number"}')
    deepEqual(v0a, { a: 1 })
    throws(() => d0({ a: 'A' }), 'not of type number')

    let s1 = {
      a: Type(Boolean)
    }

    let d1 = Shape(s1)

    let v1a = d1({ a: false })

    deepEqual(d1.stringify(null, true), '{"a":"Boolean"}')
    deepEqual(d1({ a: true }), { a: true })
    deepEqual(v1a, { a: false })
    throws(() => d1({ a: 'A' }), 'not of type boolean')


    // Type inference

    let x = {
      S: Type('String'),
      N: Type('Number'),
      B: Type('Boolean'),
      O: Type('Object'),
      A: Type('Array'),
      F: Type('Function'),
      Y: Type('Symbol'),
      s: Type(String),
      n: Type(Number),
      b: Type(Boolean),
      o: Type(Object),
      a: Type(Array),
      f: Type(Function),
      y: Type(Symbol),
      l: Type(null),
      u: Type(undefined),
      x: Type(NaN),
      d0: Type({ y: 1 }),
      d1: Type([11]),
      d2: Type(() => 0),
      d3: Type(Symbol.for('X')),
    }

    x = {
      S: 's',
      N: 11,
      B: true,
      O: {},
      A: [],
      F: () => ({ f: 1 }),
      Y: Symbol.for('Z'),
      s: 'S',
      n: 22,
      b: false,
      o: {},
      a: [],
      f: () => ({ f: 2, g: 3 }),
      y: Symbol.for('Q'),
      l: null,
      u: undefined,
      x: NaN,
      d0: { y: 2 },
      d1: [22, 33],
      d2: () => 2,
      d3: Symbol.for('Y'),
    }

    x.O = x.o = { q: 1 }
    x.A = x.a = ['q']
    x.F = x.f = () => ({ f: 3, g: 4, h: 5 })
    x.Y = x.y = Symbol.for('W')

    // console.log(x)

  })


  test('compose-minmax', () => {
    let cs: any = Symbol.for('nodejs.util.inspect.custom')

    let g0 = Shape(Min(1, Max(3)))
    deepEqual(g0(2), 2)
    deepEqual(g0.stringify(), 'Max(3).Min(1)')
    deepEqual((g0.node()[cs]()), '{t:any n:0 r:false p:false d:0 k:[] e:true u:{} a:[] b:[Max(3) Min(1)] m:{}}')

    let g1 = Shape(Max(3, Min(1)))
    deepEqual(g1(2), 2)
    deepEqual(g1.stringify(), 'Min(1).Max(3)')
    deepEqual((g1.node()[cs]()), '{t:any n:0 r:false p:false d:0 k:[] e:true u:{} a:[] b:[Min(1) Max(3)] m:{}}')

    let g2 = Shape(Min(1, Max(3, 2)))
    deepEqual(g2(2), 2)
    deepEqual(g2.stringify(), '2.Max(3).Min(1)')
    deepEqual((g2.node()[cs]()), '{t:number v:2 f:2 n:0 r:false p:false d:0 k:[] e:true' +
        ' u:{} a:[] b:[Max(3) Min(1)] m:{}}')

    let g3 = Shape(Max(3).Min(1))
    deepEqual(g3(2), 2)
    deepEqual(g3.stringify(), 'Max(3).Min(1)')
    deepEqual((g3.node()[cs]()), '{t:any n:0 r:false p:false d:0 k:[] e:true' +
        ' u:{} a:[] b:[Max(3) Min(1)] m:{}}')

    let g4 = Shape(Max(3, 2).Min(1))
    deepEqual(g4(2), 2)
    deepEqual(g4.stringify(), '2.Max(3).Min(1)')
    deepEqual((g4.node()[cs]()), '{t:number v:2 f:2 n:0 r:false p:false d:0 k:[] e:true' +
        ' u:{} a:[] b:[Max(3) Min(1)] m:{}}')

    let g5 = Shape(Min(1, 2).Max(3))
    deepEqual(g5(2), 2)
    deepEqual(g5.stringify(), '2.Min(1).Max(3)')
    deepEqual(g5.node()[cs](), '{t:number v:2 f:2 n:0 r:false p:false d:0 k:[] e:true' +
        ' u:{} a:[] b:[Min(1) Max(3)] m:{}}')

    let g6 = Shape(Min(1, { x: 11 }).Max(3))
    deepEqual(g6({ x: 22 }), { x: 22 })
    deepEqual(g6.stringify(), '{"x":"11","$$":"Min(1).Max(3)"}')
    deepEqual((g6.node()[cs]()), '{t:object v:{x:{$:{v$:' + VERSION + '} t:number v:11 f:11 n:0 r:false p:false d:1 k:[]' +
        ' e:true u:{} a:[] b:[] m:{}}} n:1 r:false p:false d:0 k:[x] e:true u:{} a:[]' +
        ' b:[Min(1) Max(3)] m:{}}')

    let g7 = Shape(Min(1).Max(3, { x: 11 }))
    deepEqual(g7({ x: 22 }), { x: 22 })
    deepEqual(g7.stringify(), '{"x":"11","$$":"Min(1).Max(3)"}')
    deepEqual((g7.node()[cs]()), '{t:object v:{x:{$:{v$:' + VERSION + '} t:number v:11 f:11 n:0 r:false p:false d:1 k:[]' +
        ' e:true u:{} a:[] b:[] m:{}}} n:1 r:false p:false d:0 k:[x] e:true u:{} a:[]' +
        ' b:[Min(1) Max(3)] m:{}}')
  })


  test('compose-node', () => {
    let g0 = Shape({ a: Required(Child({ x: String }, { b: 1 })) })
    let g1 = Shape({ a: Required({ b: 1 }).Child({ x: String }) })
    let g4 = Shape({ a: Child({ x: String }, Required({ b: 1 })) })
    let g5 = Shape({ a: Child({ x: String }, { b: 1 }).Required() })
    let g6 = Shape({ a: Child({ x: String }).Required({ b: 1 }) })
    let g7 = Shape({ a: Required().Child({ x: String }, { b: 1 }) })

    // console.dir(g0.spec(), { depth: null })

    let VERSION = Pkg.version

    let spec = {
      '$': { 'shape$': true, 'v$': VERSION },
      t: 'object',
      v: {
        a: {
          '$': { 'shape$': true, 'v$': VERSION },
          t: 'object',
          v: {
            b: {
              '$': { 'shape$': true, 'v$': VERSION },
              t: 'number',
              v: 1,
              f: 1,
              n: 0,
              r: false,
              p: false,
              d: 2,
              k: [],
              e: true,
              u: {},
              a: [],
              b: [],
              m: {}
            }
          },
          n: 1,
          c: {
            '$': { 'shape$': true, 'v$': VERSION },
            t: 'object',
            v: {
              x: {
                '$': { 'shape$': true, 'v$': VERSION },
                t: 'string',
                v: '',
                f: '',
                n: 0,
                r: true,
                p: false,
                d: 3,
                k: [],
                e: true,
                u: {},
                a: [],
                b: [],
                m: {}
              }
            },
            n: 1,
            r: false,
            p: false,
            d: 2,
            k: [],
            e: true,
            u: {},
            a: [],
            b: [],
            m: {}
          },
          r: true,
          p: false,
          d: 1,
          k: ['b'],
          e: true,
          u: {},
          a: [],
          b: [],
          m: {}
        }
      },
      n: 1,
      r: false,
      p: false,
      d: 0,
      k: ['a'],
      e: true,
      u: {},
      a: [],
      b: [],
      m: {}
    }

    const g0spec = g0.spec()
    deepEqual(g0spec, spec)
    deepEqual(g1.spec(), g0spec)
    deepEqual(g4.spec(), g0spec)
    deepEqual(g5.spec(), g0spec)
    deepEqual(g6.spec(), g0spec)
    deepEqual(g7.spec(), g0spec)
  })


  test('builder-exports', () => {
    deepEqual(JSON.stringify(Shape.Skip()), JSON.stringify(Skip()))
  })


  test('readme-shape-builder', () => {
    const userShape = Shape({
      person: Required({
        name: String,
        age: Number,
      })
    })

    throws(() => userShape({}), 'Validation failed for property "person" with value "undefined" because the value is required.')

    deepEqual(userShape({
      person: {
        name: 'Alice',
        age: 99
      }
    }), {
      person: {
        name: 'Alice',
        age: 99
      }
    })
  })


  test('api-builders-chain-compose', () => {
    let cr0s = Shape(Closed(Required({ x: 1 })), { name: 'cr0' })
    let cr1s = Shape(Required(Closed({ x: 1 })), { name: 'cr1' })
    let cr2s = Shape(Closed({ x: 1 }).Required(), { name: 'cr2' })
    let cr3s = Shape(Required({ x: 1 }).Closed(), { name: 'cr3' })

    let s0 = {
      '$': { 'shape$': true, 'v$': Pkg.version },
      t: 'object',
      v: {
        x: {
          '$': { 'shape$': true, 'v$': Pkg.version },
          t: 'number',
          v: 1,
          f: 1,
          n: 0,
          r: false,
          p: false,
          d: 1,
          u: {},
          a: [],
          b: [],
          e: true,
          k: [],
          m: {},
        }
      },
      n: 1,
      r: true,
      p: false,
      d: 0,
      u: {},
      a: [],
      b: [],
      e: true,
      k: ['x'],
      m: {},
    }

    deepEqual(cr0s.spec(), s0)
    deepEqual(cr1s.spec(), s0)
    deepEqual(cr2s.spec(), s0)
    deepEqual(cr3s.spec(), s0)

    deepEqual(cr0s({ x: 11 }), { x: 11 })
    deepEqual(cr1s({ x: 11 }), { x: 11 })
    deepEqual(cr2s({ x: 11 }), { x: 11 })
    deepEqual(cr3s({ x: 11 }), { x: 11 })

    throws(() => cr0s({ x: 11, y: 2 }), 'property "y" is not allowed.')
    throws(() => cr1s({ x: 11, y: 2 }), 'property "y" is not allowed.')
    throws(() => cr2s({ x: 11, y: 2 }), 'property "y" is not allowed.')
    throws(() => cr3s({ x: 11, y: 2 }), 'property "y" is not allowed.')

    deepEqual(cr0s({}), { x: 1 })
    deepEqual(cr1s({}), { x: 1 })
    deepEqual(cr2s({}), { x: 1 })
    deepEqual(cr3s({}), { x: 1 })
  })


  test('api-builders-examples', () => {

    let shape_AboveB0 = Shape(Above(10))
    deepEqual(shape_AboveB0(11), 11)
    throws(() => shape_AboveB0(10), 'Value "10" for property "" must be above 10 (was 10).')
    throws(() => shape_AboveB0(true), 'Value "true" for property "" must have length above 10 (was NaN).')

    let shape_AboveB1 = Shape(Above(2))
    deepEqual(shape_AboveB1('abc'), 'abc')
    throws(() => shape_AboveB1('ab'), 'Value "ab" for property "" must have length above 2 (was 2).')
    deepEqual(shape_AboveB1([1, 2, 3]), [1, 2, 3])
    throws(() => shape_AboveB1([1, 2]), 'Value "[1,2]" for property "" must have length above 2 (was 2).')
    deepEqual(shape_AboveB1({ a: 1, b: 2, c: 3 }), { a: 1, b: 2, c: 3 })
    throws(() => shape_AboveB1({ a: 1, b: 2 }), 'Value "{a:1,b:2}" for property "" must have length above 2 (was 2).')

    let shape_AboveB2 = Shape(Above(2, Number))
    deepEqual(shape_AboveB2(3), 3)
    throws(() => shape_AboveB2([1, 2, 3]), 'Validation failed for array "[1,2,3]" because the array is not of type number.')

    let shape_AboveB3 = Shape(Skip(Above(2, Number)))
    deepEqual(shape_AboveB3(3), 3)
    deepEqual(shape_AboveB3(), undefined)


    let shape_AfterB0 = Shape(After((v: any) => v > 10, 15))
    deepEqual(shape_AfterB0(11), 11)
    throws(() => shape_AfterB0(10), 'Validation failed for number "10" because check "(v) => v > 10" failed.')
    throws(() => shape_AfterB0('x'), `Validation failed for string "x" because the string is not of type number.
Validation failed for string "x" because check "(v) => v > 10" failed.`)
    deepEqual(shape_AfterB0(), 15)

    let shape_AfterB1 = Shape(Skip(Number).After((v: any) => v % 2 === 0))
    deepEqual(shape_AfterB1(2), 2)
    throws(() => shape_AfterB1(3), 'Validation failed for number "3" because check "(v) => v % 2 === 0" failed.')
    throws(() => shape_AfterB1('x'), 'Validation failed for string "x" because check "(v) => v % 2 === 0" failed.')
    deepEqual(shape_AfterB1(), undefined)

    let shape_AfterB2 = Shape(After((v: any) => v.x % 2 === 0, Required({ x: Number })))
    deepEqual(shape_AfterB2({ x: 2 }), { x: 2 })
    throws(() => shape_AfterB2({ x: 3 }), 'Validation failed for object "{x:3}" because check "(v) => v.x % 2 === 0" failed.')

    throws(() => shape_AfterB2({}), `Validation failed for object "{}" because check "(v) => v.x % 2 === 0" failed.
Validation failed for property "x" with value "undefined" because the value is required.`)

    throws(() => shape_AfterB2(), `Validation failed for value "undefined" because the value is required.`)

    // TODO: modify value


    let shape_AllB0 = Shape(All(Number, Check((v: any) => v > 10)))
    deepEqual(shape_AllB0(11), 11)
    throws(() => shape_AllB0(10), 'Value "10" for property "" does not satisfy all of: ' +
        'Number, Check((v) => v > 10)')

    let shape_AllB1 = Shape(All())
    deepEqual(shape_AllB1(123), 123)
    throws(() => shape_AllB1(), 'required')

    let shape_AllB2 =
      Shape({ a: Default({ b: 'B' }, All(Open({ b: String }), Max(2))) })
    deepEqual(shape_AllB2({}), { a: { b: 'B' } })
    deepEqual(shape_AllB2({ a: { b: 'X' } }), { a: { b: 'X' } })
    deepEqual(shape_AllB2({ a: { b: 'X', c: 'Y' } }), { a: { b: 'X', c: 'Y' } })
    throws(() => shape_AllB2({ a: { b: 'X', c: 'Y', d: 'Z' } }), 'Value "{b:X,c:Y,d:Z}" for property "a" does not satisfy all of:' +
        ' {b:String,$$:Open}, Max(2)')
    deepEqual(shape_AllB2({}), { a: { b: 'B' } })

    let shape_AllB3 = Shape({ a: Skip(All(Open({ b: String }), Max(2))) })
    deepEqual(shape_AllB3({ a: { b: 'X' } }), { a: { b: 'X' } })
    deepEqual(shape_AllB3({}), {})


    let shape_AnyB0 = Shape(Any())
    deepEqual(shape_AnyB0(11), 11)
    deepEqual(shape_AnyB0(10), 10)
    deepEqual(shape_AnyB0(), undefined)
    deepEqual(shape_AnyB0(null), null)
    deepEqual(shape_AnyB0(NaN), NaN)
    deepEqual(shape_AnyB0({}), {})
    deepEqual(shape_AnyB0([]), [])

    let shape_AnyB1 = Shape(Any({ x: 1 }))
    deepEqual(shape_AnyB1(), { x: 1 })

    let shape_BeforeB0 = Shape(Before((v: any) => v > 10, 10))
    deepEqual(shape_BeforeB0(11), 11)
    throws(() => shape_BeforeB0(10), 'Validation failed for number "10" because check "(v) => v > 10" failed.')
    // TODO: modify value

    let shape_BelowB0 = Shape(Below(10))
    deepEqual(shape_BelowB0(9), 9)
    throws(() => shape_BelowB0(10), 'Value "10" for property "" must be below 10 (was 10).')


    let shape_CheckB0 = Shape(Check((v: any) => v > 10))
    deepEqual(shape_CheckB0(11), 11)
    throws(() => shape_CheckB0(10), 'check')

    let shape_CheckB1 = Shape(Check((v: any) => !(v.foo % 2), { foo: 2 }))
    deepEqual(shape_CheckB1({ foo: 4 }), { foo: 4 })
    throws(() => shape_CheckB1({ foo: 1 }), 'check')
    deepEqual(shape_CheckB1({}), { foo: 2 })
    throws(() => shape_CheckB1(), 'required')


    let shape_ClosedB0 = Shape(Closed([Number]))
    deepEqual(shape_ClosedB0([1]), [1])
    throws(() => shape_ClosedB0([1, 2]), 'Validation failed for array "[1,2]" because the index "1" is not allowed.')


    let shape_DefineB0 = Shape({ a: Define('foo', 11), b: Refer('foo') })
    deepEqual(shape_DefineB0({ a: 10, b: 12 }), { a: 10, b: 12 })
    throws(() => shape_DefineB0({ a: 'A', b: 'B' }), `Validation failed for property "a" with string "A" because the string is not of type number.
Validation failed for property "b" with string "B" because the string is not of type number.`)

    let shape_EmptyB0 = Shape({ a: Empty(String), b: String })
    deepEqual(shape_EmptyB0({ a: '', b: 'ABC' }), { a: '', b: 'ABC' })
    throws(() => shape_EmptyB0({ a: '', b: '' }), 'Validation failed for property "b" with string "" because an empty string is not allowed.')


    let shape_ExactB0 = Shape(Exact(11, 12, true))
    deepEqual(shape_ExactB0(11), 11)
    deepEqual(shape_ExactB0(12), 12)
    deepEqual(shape_ExactB0(true), true)
    throws(() => shape_ExactB0(10), 'Value "10" for property "" must be exactly one of: 11, 12, true')
    throws(() => shape_ExactB0(false), 'Value "false" for property "" must be exactly one of: 11, 12, true')


    let shape_MaxB0 = Shape(Max(11))
    deepEqual(shape_MaxB0(11), 11)
    deepEqual(shape_MaxB0(10), 10)
    throws(() => shape_MaxB0(12), 'Value "12" for property "" must be a maximum of 11 (was 12).')


    let shape_MinB0 = Shape(Min(11))
    deepEqual(shape_MinB0(11), 11)
    deepEqual(shape_MinB0(12), 12)
    throws(() => shape_MinB0(10), 'Value "10" for property "" must be a minimum of 11 (was 10).')


    let shape_NeverB0 = Shape(Never())
    throws(() => shape_NeverB0(10), 'Validation failed for number "10" because no value is allowed.')
    throws(() => shape_NeverB0(true), 'Validation failed for boolean "true" because no value is allowed.')

    let shape_OneB0 = Shape(One(Exact(10), Exact(11), Exact(true)))
    deepEqual(shape_OneB0(10), 10)
    deepEqual(shape_OneB0(11), 11)
    deepEqual(shape_OneB0(true), true)
    throws(() => shape_OneB0(12), 'Value "12" for property "" does not satisfy one of: ' +
        'Exact(10), Exact(11), Exact(true)')
    throws(() => shape_OneB0(false), 'Value "false" for property "" does not satisfy one of: ' +
        'Exact(10), Exact(11), Exact(true)')
    throws(() => shape_OneB0(null), 'Value "null" for property "" does not satisfy one of: ' +
        'Exact(10), Exact(11), Exact(true)')
    throws(() => shape_OneB0(NaN), 'Value "NaN" for property "" does not satisfy one of: ' +
        'Exact(10), Exact(11), Exact(true)')
    throws(() => shape_OneB0(undefined), 'Value "undefined" for property "" does not satisfy one of: ' +
        'Exact(10), Exact(11), Exact(true)')
    throws(() => shape_OneB0(), 'Value "undefined" for property "" does not satisfy one of: ' +
        'Exact(10), Exact(11), Exact(true)')

    let shape_OneB1 = Shape(One(Number, String))
    deepEqual(shape_OneB1(123), 123)
    deepEqual(shape_OneB1('abc'), 'abc')
    throws(() => shape_OneB1(true), 'Value "true" for property "" does not satisfy one of: Number, String')

    // TODO: more complex objects


    let shape_SkipB0 = Shape({ a: Skip(11) })
    deepEqual(shape_SkipB0({ a: 10 }), { a: 10 })
    deepEqual(shape_SkipB0({ a: undefined }), { a: undefined })
    deepEqual(shape_SkipB0({}), {})
    throws(() => shape_SkipB0({ a: null }), 'type')
    throws(() => shape_SkipB0({ a: true }), 'type')


    let shape_ReferB0 = Shape({ a: Define('foo', 11), b: Refer('foo') })
    deepEqual(shape_ReferB0({ a: 10, b: 12 }), { a: 10, b: 12 })
    deepEqual(shape_ReferB0({ a: 10 }), { a: 10, b: undefined })
    deepEqual(shape_ReferB0({}), { a: 11, b: undefined })
    deepEqual(shape_ReferB0({ b: 12 }), { a: 11, b: 12 })
    throws(() => shape_ReferB0({ a: 'A', b: 'B' }), `Validation failed for property "a" with string "A" because the string is not of type number.
Validation failed for property "b" with string "B" because the string is not of type number.`)

    let shape_ReferB1 =
      Shape({ a: Define('foo', 11), b: Refer({ name: 'foo', fill: true }) })
    deepEqual(shape_ReferB1({ a: 10, b: 12 }), { a: 10, b: 12 })
    deepEqual(shape_ReferB1({ a: 10 }), { a: 10, b: 11 })
    deepEqual(shape_ReferB1({}), { a: 11, b: 11 })
    deepEqual(shape_ReferB1({ b: 12 }), { a: 11, b: 12 })
    throws(() => shape_ReferB1({ a: 'A', b: 'B' }), `Validation failed for property "a" with string "A" because the string is not of type number.
Validation failed for property "b" with string "B" because the string is not of type number.`)

    // TODO: also recursive


    let shape_RenameB0 = Shape({ a: Rename('b', Number) })
    deepEqual(shape_RenameB0({ a: 10 }), { b: 10 })
    throws(() => shape_RenameB0({}), 'Validation failed for property "a" with value "undefined" because the value is required.')

    let shape_RenameB1 = Shape({ a: Rename({ name: 'b', keep: true }, 123) })
    deepEqual(shape_RenameB1({ a: 10 }), { a: 10, b: 10 })
    deepEqual(shape_RenameB1({}), { a: 123, b: 123 })


    let shape_RequiredB0 = Shape(Required(11))
    deepEqual(shape_RequiredB0(11), 11)
    throws(() => shape_RequiredB0(), 'Validation failed for value "undefined" because the value is required.')


    let shape_RequiredB1 = Shape(Open(Required({ x: 1 })))
    deepEqual(shape_RequiredB1({ x: 2 }), { x: 2 })
    deepEqual(shape_RequiredB1({ x: 2, y: 3 }), { x: 2, y: 3 })
    throws(() => shape_RequiredB1(), 'Validation failed for value "undefined" because the value is required.')

    let shape_RequiredB2 = Shape(Open({ x: 1 }).Required())
    deepEqual(shape_RequiredB2({ x: 2 }), { x: 2 })
    deepEqual(shape_RequiredB2({ x: 2, y: 3 }), { x: 2, y: 3 })
    throws(() => shape_RequiredB2(), 'Validation failed for value "undefined" because the value is required.')



    // TODO: update docs - need better example where one prop differentiates
    let shape_SomeB0 = Shape(Some({ x: 1 }, { y: 2 }))

    deepEqual(shape_SomeB0({ x: 1 }), { x: 1 })
    deepEqual(shape_SomeB0({ y: 2 }), { y: 2 })
    throws(() => shape_SomeB0({ x: 11, y: 22 }), 'Value "{x:11,y:22}" for property "" does not satisfy any of: {"x":1}, {"y":2}')
    throws(() => shape_SomeB0({ x: true, y: 2 }), 'any of')
    throws(() => shape_SomeB0({ x: 1, y: true }), 'any of')
    throws(() => shape_SomeB0({ x: true, y: true }), `Value "{x:true,y:true}" for property "" does not satisfy any of: {"x":1}, {"y":2}`)
    // TODO: more complex objects


    /*
    let shape_ValueB0 = Shape(Value(Number, {}))
    deepEqual(shape_ValueB0({ x: 10 }), { x: 10 })
    deepEqual(shape_ValueB0({ x: 10, y: 11 }), { x: 10, y: 11 })
    throws(() => shape_ValueB0({ x: true }), 'Validation failed for property "x" with boolean "true" because the boolean is not of type number.')
  
    let shape_ValueB1 = Shape({
      page: Value(
        {
          title: String,
          template: 'standard'
        },
        {
          home: {
            title: 'Home',
            template: 'home'
          },
          sitemap: {
            title: 'Site Map',
            template: 'sitemap'
          },
        })
    })
  
    deepEqual(shape_ValueB1({
      page: {
        about: {
          title: 'About'
        },
        contact: {
          title: 'Contact'
        }
      }
    }), {
      page: {
        about: {
          template: 'standard',
          title: 'About',
        },
        contact: {
          template: 'standard',
          title: 'Contact',
        },
        home: {
          template: 'home',
          title: 'Home',
        },
        sitemap: {
          template: 'sitemap',
          title: 'Site Map',
        },
      },
    })
    */
  })

})


export {
  Foo,
  Bar,
}

export type {
  Zed,
}

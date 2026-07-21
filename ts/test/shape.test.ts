/* Copyright (c) 2021-2023 Richard Rodger and other contributors, MIT License */

import { describe, test } from 'node:test'
import assert from 'node:assert'
import { deepEqual, matchObject, throws } from './test-utils'

import Pkg from '../package.json'

import type {
  State,
  Update,
} from '../dist/shape'


import { Shape as ShapeX } from '../dist/shape'

const Large = require('../test/large')
const Long = require('../test/long')


// Handle web (Shape) versus node ({Shape}) export.
let ShapeModule = require('../dist/shape')

if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}


const Shape: ShapeX = ShapeModule
const G$ = Shape.G$
const stringify = Shape.stringify
const truncate = Shape.truncate
const nodize = Shape.nodize

const {
  Above,
  After,
  All,
  Any,
  Before,
  Below,
  Check,
  Closed,
  Define,
  Empty,
  Exact,
  Func,
  Max,
  Min,
  Never,
  One,
  Open,
  Refer,
  Rename,
  Required,
  Skip,
  Some,
  Child,
  Default,
  Optional,
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


describe('shape', () => {

  test('happy', () => {
    assert.notEqual(Shape(), undefined)
    assert.match(Shape().toString(), /\[Shape G\$\d+ Any\]/)
    assert.match(Shape(undefined, { name: 'foo' }).toString(), /\[Shape foo Any\]/)
    assert.match(Shape('x', { name: 'bar' }).toString(), /\[Shape bar x\]/)

    let g0 = Shape({
      a: 'foo',
      b: 100
    })

    deepEqual(g0({}), { a: 'foo', b: 100 })
    deepEqual(g0({ a: 'bar' }), { a: 'bar', b: 100 })
    deepEqual(g0({ b: 999 }), { a: 'foo', b: 999 })
    deepEqual(g0({ a: 'bar', b: 999 }), { a: 'bar', b: 999 })
    throws(() => g0({ a: 'bar', b: 999, c: true }), 'not allowed')
  })


  // (tide-display-help-buffer)
  test('type-infer', () => {
    let s0 = Shape({ a: String, b: 'B' })
    let v0 = s0({ a: 'A' })
    // console.log('v0', v0)
    deepEqual(v0, { a: 'A', b: 'B' })
    v0.a = 'AA'
    v0.b = 'BB'

    let s1 = Shape('x')
    let v1 = s1('y')
    deepEqual(v1, 'y')

    let s2 = Shape({ x: { y: Required(String) } })
    let v2 = s2({ x: { y: 'Y' } })
    deepEqual(v2, { x: { y: 'Y' } })

    let s3 = Shape({ x: { y: One(String, Number), z: One(String, Number) } })
    let v3 = s3({ x: { y: 1, z: 'Z' } })
    deepEqual(v3, { x: { y: 1, z: 'Z' } })


    let s4 = Shape({ x: Object })
    type rt4 = ReturnType<typeof s4>
    let v4 = s4({ x: { y: 'Y' } } as rt4)
    deepEqual(v4, { x: { y: 'Y' } })
    deepEqual(v4.x.y, 'Y')
  })



  // TODO: type support - remove the any's
  test('valid-basic', () => {
    let g0 = Shape({ x: 1, y: 'Y' })
    let d0 = { x: 2 }

    if (g0.valid(d0)) {
      deepEqual(d0, { x: 2, y: 'Y' })
      deepEqual(d0.x, 2)
      deepEqual(d0.y, 'Y')
    }

    let v0 = { z: true }
    deepEqual(g0.valid(v0), false)
    deepEqual(v0, { z: true, x: 1, y: 'Y' })

    v0 = { z: true }
    let ctx0: any = { err: [] }
    deepEqual(g0.valid(v0, ctx0), false)
    deepEqual(v0, { z: true, x: 1, y: 'Y' })
    deepEqual(ctx0.err[0].why, 'closed')

    let v1 = {}
    deepEqual(g0.match(v1), true)
    deepEqual(v1, {})

    let v1e = { z: true }
    deepEqual(g0.match(v1e), false)
    deepEqual(v1e, { z: true })


    let g0d = Shape(Open({ x: 1, y: 'Y' }))
    let d0d = { x: 2, z: true }
    let d0do = g0d(d0d)
    deepEqual(d0do, { x: 2, y: 'Y', z: true })
    deepEqual(d0do.x, 2)
    deepEqual(d0do.y, 'Y')
    deepEqual(d0do.z, true)


    let g1 = Shape(Open({ x: Number, y: 'Y' }))
    let d1 = { x: 2, z: true }

    if (g1.valid(d1)) {
      deepEqual(d1, { x: 2, y: 'Y', z: true })
      deepEqual(d1.x, 2)
      deepEqual(d1.y, 'Y')
      deepEqual(d1.z, true)
    }


    let g2 = Shape(Open({ x: { k: 1 }, y: 'Y' }))
    let d2 = { x: { k: 2 }, z: true }

    if (g2.valid(d2)) {
      deepEqual(d2, { x: { k: 2 }, y: 'Y', z: true })
      deepEqual(d2.x, { k: 2 })
      deepEqual(d2.y, 'Y')
      deepEqual(d2.z, true)
    }


    const shape = Shape({ x: 1, y: 'Y' })
    let data = { x: 2 }

    deepEqual(shape.valid(data), true)
    deepEqual(shape(data), { x: 2, y: 'Y' })
    deepEqual(shape(data).x, 2)
    deepEqual(shape(data).y, 'Y')
    // CONSOLE-LOG(data.q) // UNCOMMENT TO VERIFY COMPILE FAILS


    let g3 = Shape({ ...new Foo(1) })
    // let d3 = { a: 11, x: true }
    let d3 = { a: 11 }
    if (g3.valid(d3)) {
      // deepEqual(d3, { a: 11, x: true })
      deepEqual(d3, { a: 11 })
      deepEqual(d3.a, 11)
      // deepEqual(d3.x, true)
    }


    let g4 = Shape(Open({ x: 1 }) as unknown as { x: number })
    let d4 = { z: true }

    if (g4.valid(d4)) {
      deepEqual(d4.x, 1)
      deepEqual(d4.z, true)
      // CONSOLE-LOG(d4.q) // UNCOMMENT TO VERIFY COMPILE FAILS
    }

  })


  test('readme-quick', () => {

    // Property a is optional, must be a Number, and defaults to 1.
    // Property b is required, and must be a String.
    const shape = Shape({ a: 1, b: String })

    // Object shape is good! Prints `{ a: 99, b: 'foo' }`
    deepEqual(shape({ a: 99, b: 'foo' }), { a: 99, b: 'foo' })

    // Object shape is also good. Prints `{ a: 1, b: 'foo' }`
    deepEqual(shape({ b: 'foo' }), { a: 1, b: 'foo' })

    // Object shape is bad. Throws an exception:
    throws(() => shape({ a: 'BAD' }), 'Validation failed for property "a" with string "BAD" because the string is not of type number.\nValidation failed for property "b" with value "undefined" because the value is required.')

    // Object shape is bad. Throws an exception:
    throws(() => shape({ b: 'foo', c: true }), 'Validation failed for object "{b:foo,c:true}" because the property "c" is not allowed.')
  })


  test('readme-options', () => {
    const optionShape = Shape({
      host: 'localhost',
      port: 8080
    })

    // console.log(optionShape({}))

    deepEqual(optionShape(), {
      host: 'localhost',
      port: 8080
    })

    deepEqual(optionShape({}), {
      host: 'localhost',
      port: 8080
    })

    deepEqual(optionShape({ host: 'foo' }), {
      host: 'foo',
      port: 8080
    })

    deepEqual(optionShape({ host: 'foo', port: undefined }), {
      host: 'foo',
      port: 8080
    })

    deepEqual(optionShape({ host: 'foo', port: 9090 }), {
      host: 'foo',
      port: 9090
    })

    throws(() => optionShape({ host: 9090 }), 'type')
    throws(() => optionShape({ port: '9090' }), 'type')
    throws(() => optionShape({ host: '' }), 'empty string is not allowed')
  })


  test('readme-deep', () => {

    const productListShape = Shape({
      products: [
        {
          name: String,
          img: 'generic.png'
        }
      ]
    })

    deepEqual(productListShape({}), { products: [] })

    let result = productListShape({
      products: [
        { name: 'Apple', img: 'apple.png' },
        { name: 'Pear', img: 'pear.png' },
        { name: 'Banana' } // Missing image!
      ]
    })

    // console.dir(result, { depth: null })

    deepEqual(result, {
      products: [
        { name: 'Apple', img: 'apple.png' },
        { name: 'Pear', img: 'pear.png' },
        { name: 'Banana', img: 'generic.png' }
      ]
    })
  })


  test('readme-object', () => {
    let shape = Shape({
      foo: {
        bar: {
          zed: String,
          qaz: Number,
        }
      }
    })

    deepEqual(shape({
      foo: {
        bar: {
          zed: 'x',
          qaz: 1
        }
      }
    }
    ), {
      foo: {
        bar: {
          zed: 'x',
          qaz: 1
        }
      }
    })


    let openObject = Shape(Open({ a: 1 }))
    deepEqual(openObject({ a: 11, b: 22 }), { a: 11, b: 22 })
  })


  test('readme-regexp', () => {
    let shape = Shape({ countryCode: Check(/^[A-Z][A-Z]$/) })
    deepEqual(shape({ countryCode: 'IE' }), { countryCode: 'IE' })
    throws(() => shape({ countryCode: 'BAD' }), 'Validation failed for property "countryCode" with string "BAD" because check "/^[A-Z][A-Z]$/" failed.')
    throws(() => shape({}), 'Validation failed for property "countryCode" with value "undefined" because the value is required.')
    throws(() => shape({ countryCode: 123 }), 'Validation failed for property "countryCode" with number "123" because check "/^[A-Z][A-Z]$/" failed.')
  })

  test('readme-recursive', () => {
    let tree = Shape({
      root: Define('BRANCH', {
        value: String,
        left: Refer('BRANCH'),
        right: Refer('BRANCH'),
      })
    })

    matchObject(tree({
      root: {
        value: 'A',
        left: {
          value: 'AB',
          left: {
            value: 'ABC'
          },
          right: {
            value: 'ABD'
          },
        },
        right: {
          value: 'AE',
          left: {
            value: 'AEF'
          },
        },
      }
    }), {
      root: {
        value: 'A',
        left: {
          value: 'AB',
          left: {
            value: 'ABC'
          },
          right: {
            value: 'ABD'
          },
        },
        right: {
          value: 'AE',
          left: {
            value: 'AEF'
          },
        },
      }
    })

    throws(() => tree({
      root: {
        value: 'A',
        left: {
          value: 'AB',
          left: {
            value: 'ABC',
            left: {
              value: 123
            },
          },
        },
      }
    }), 'Validation failed for property "root.left.left.left.value" with number "123" because the number is not of type string')

  })


  test('scalar-optional-basic', () => {
    let g0 = Shape(1)
    deepEqual(g0(2), 2)
    deepEqual(g0(), 1)
    throws(() => g0('x'), 'Validation failed for string "x" because the string is not of type number.')
  })


  test('object-optional-basic', () => {
    let g0 = Shape(Open({ x: 1 }))
    deepEqual(g0({ x: 2, y: true, z: 's' }), { x: 2, y: true, z: 's' })
    deepEqual(g0({ x: 2 }), { x: 2 })
    deepEqual(g0({}), { x: 1 })
    deepEqual(g0(), { x: 1 })
    throws(() => g0('s'), 'Validation failed for string "s" because the string is not of type object.')
    throws(() => g0({ x: 't' }), 'Validation failed for property "x" with string "t" because the string is not of type number.')
  })


  test('array-basic-optional', () => {
    let g0 = Shape([1])
    deepEqual(g0([11, 22, 33]), [11, 22, 33])
    deepEqual(g0([11, 22]), [11, 22])
    deepEqual(g0([11]), [11])
    deepEqual(g0([]), [])
    deepEqual(g0(), [])
    throws(() => g0('s'), 'Validation failed for string "s" because the string is not of type array.')
    throws(() => g0(['t']), 'Validation failed for index "0" with string "t" because the string is not of type number.')
    throws(() => g0(['t', 22]), 'Validation failed for index "0" with string "t" because the string is not of type number.')
    throws(() => g0(['t', 33]), 'Validation failed for index "0" with string "t" because the string is not of type number.')
    throws(() => g0([11, 't']), 'Validation failed for index "1" with string "t" because the string is not of type number.')
    throws(() => g0([11, 22, 't']), 'Validation failed for index "2" with string "t" because the string is not of type number.')

    let g1 = Shape([])
    deepEqual(g1([11, 22, 33]), [11, 22, 33])
    deepEqual(g1([11, 22]), [11, 22])
    deepEqual(g1([11]), [11])
    deepEqual(g1([]), [])
    deepEqual(g1(), [])
    throws(() => g1('s'), 'Validation failed for string "s" because the string is not of type array.')
    deepEqual(g1(['t']), ['t'])
    deepEqual(g1(['t', 22]), ['t', 22])
    deepEqual(g1(['t', 33]), ['t', 33])
    deepEqual(g1([11, 't']), [11, 't'])
    deepEqual(g1([11, 22, 't']), [11, 22, 't'])
  })


  test('function-optional-basic', () => {
    let f0t = () => true
    let f0f = () => false

    let g0 = Shape(f0t)
    deepEqual(g0().toString(), '() => true')
    deepEqual(g0(f0f).toString(), '() => false')
    deepEqual(g0(() => null).toString(), '() => null')

    let g1 = Shape({ a: f0t })
    deepEqual(g1().a.toString(), '() => true')
    deepEqual(g1({ a: f0f }).a.toString(), '() => false')
    deepEqual(g1({ a: () => null }).a.toString(), '() => null')

    function f1t() { return true }
    deepEqual(g0(f1t).toString().replace(/\s/g, ''), 'functionf1t(){returntrue;}')
    deepEqual(g1({ a: f1t }).a.toString().replace(/\s/g, ''), 'functionf1t(){returntrue;}')

    function f1f() { return false }
    let g2 = Shape({ a: f1t })
    deepEqual(g2({ a: f1f }).a.toString().replace(/\s/g, ''), 'functionf1f(){returnfalse;}')
  })


  test('class-optional-basic', () => {
    class Planet {
      name: string
      constructor(name: string) {
        this.name = name
      }
    }
    const mars = new Planet('Mars')

    let g0 = Shape(Planet)
    deepEqual(g0(mars), mars)
    throws(() => g0(1), 'not an instance of Planet')
    throws(() => g0(Planet), 'not an instance of Planet')
  })


  test('array-basic-required', () => {
    let g1 = Shape(Array)
    deepEqual(g1([11, 22, 33]), [11, 22, 33])
    deepEqual(g1([11, 22]), [11, 22])
    deepEqual(g1([11]), [11])
    deepEqual(g1([]), [])
    throws(() => g1(), 'required')
    throws(() => g1('s'), 'Validation failed for string "s" because the string is not of type array.')
    deepEqual(g1(['t']), ['t'])
    deepEqual(g1(['t', 22]), ['t', 22])
    deepEqual(g1(['t', 33]), ['t', 33])
    deepEqual(g1([11, 't']), [11, 't'])
    deepEqual(g1([11, 22, 't']), [11, 22, 't'])

    let g2 = Shape(Required([]))
    deepEqual(g2([11, 22, 33]), [11, 22, 33])
    deepEqual(g2([11, 22]), [11, 22])
    deepEqual(g2([11]), [11])
    deepEqual(g2([]), [])
    throws(() => g2(), 'required')
    throws(() => g2('s'), 'Validation failed for string "s" because the string is not of type array.')
    deepEqual(g2(['t']), ['t'])
    deepEqual(g2(['t', 22]), ['t', 22])
    deepEqual(g2(['t', 33]), ['t', 33])
    deepEqual(g2([11, 't']), [11, 't'])
    deepEqual(g2([11, 22, 't']), [11, 22, 't'])
  })


  test('spec-revert-skip-required', () => {
    let or = Shape(Skip(Required(1)))
    matchObject(or.spec(), { r: false, p: true, v: 1, t: 'number' })

    let ror = Shape(Required(Skip(Required(1))))
    matchObject(ror.spec(), { r: true, p: false, v: 1, t: 'number' })

    let ro = Shape(Required(Skip(1)))
    matchObject(ro.spec(), { r: true, p: false, v: 1, t: 'number' })

    let oro = Shape(Skip(Required(Skip(1))))
    matchObject(oro.spec(), { r: false, p: true, v: 1, t: 'number' })
  })


  test('match-basic', () => {
    let tmp: any = {}

    let g0 = Shape(Number)
    deepEqual(g0.match(1), true)
    deepEqual(g0.match('x'), false)
    deepEqual(g0.match(true), false)
    deepEqual(g0.match({}), false)
    deepEqual(g0.match([]), false)

    // Match does not mutate root
    let g1 = Shape({ a: { b: 1 } })
    deepEqual(g1.match(tmp.a1 = {}), true)
    deepEqual(tmp.a1, {})

    deepEqual(g1.match(tmp.a1 = { a: {} }), true)
    deepEqual(tmp.a1, { a: {} })

    let c0 = { err: ([] as any) }
    deepEqual(g1.match(tmp.a1 = { a: 1 }, c0), false)
    deepEqual(tmp.a1, { a: 1 })
    deepEqual(c0.err[0].why, 'type')
  })


  test('error-basic', () => {
    let g0 = Shape(Number)
    deepEqual(g0(1), 1)
    throws(() => g0('x'), 'Validation failed for string "x" because the string is not of type number.')

    let ctx0 = { err: [] }
    g0('x', ctx0)
    matchObject(ctx0, {
      err: [
        {
          node: { t: 'number' },
          value: 'x',
          path: '',
          why: 'type',
          mark: 1050,
          text: 'Validation failed for string "x" because the string is not of type number.',
          use: {},
        }
      ]
    })

    try {
      g0('x')
    }
    catch (e: any) {
      deepEqual(e.message, 'Validation failed for string "x" because ' +
        'the string is not of type number.')
      matchObject(e, {
        shape: true,
        code: 'shape',
      })
      matchObject(e.desc(), 
        {
          name: 'ShapeError',
          code: 'shape',
          err: [
            {
              key: undefined,
              type: 'number',
              node: { t: 'number' },
              value: 'x',
              path: '',
              why: 'type',
              mark: 1050,
              text: 'Validation failed for string "x" because the string is not of type number.',
              use: {},
            }
          ],
          ctx: {}
        }
      )
    }

    let g1 = Shape({ q: { a: String, b: Number } })
    let ctx1 = { err: [] }
    g1({ q: { a: 1, b: 'x' } }, ctx1)
    matchObject(ctx1, 
      {
        err: [
          {
            key: 'a',
            node: { t: 'string' },
            value: 1,
            path: 'q.a',
            why: 'type',
            mark: 1050,
            text: 'Validation failed for property "q.a" with number "1" because ' +
              'the number is not of type string.',
            use: {},
          },
          {
            key: 'b',
            node: { t: 'number' },
            value: 'x',
            path: 'q.b',
            why: 'type',
            mark: 1050,
            text: 'Validation failed for property "q.b" with string "x" because the string is not of type number.',
            use: {},
          }
        ]
      })


    try {
      g1({ q: { a: 1, b: 'x' } })
    }
    catch (e: any) {
      deepEqual(e.message, `Validation failed for property "q.a" with number "1" because the number is not of type string.
Validation failed for property "q.b" with string "x" because the string is not of type number.`)
      matchObject(e, {
        shape: true,
        code: 'shape',
      })
      matchObject(e.desc(), 
        {
          name: 'ShapeError',
          code: 'shape',
          err: [
            {
              key: 'a',
              node: { t: 'string' },
              value: 1,
              path: 'q.a',
              why: 'type',
              mark: 1050,
              text: 'Validation failed for property "q.a" with number "1" because the number is not of type string.',
              use: {},
            },
            {
              key: 'b',
              node: { t: 'number' },
              value: 'x',
              path: 'q.b',
              why: 'type',
              mark: 1050,
              text: 'Validation failed for property "q.b" with string "x" because the string is not of type number.',
              use: {},
            }
          ],
          ctx: {}
        }
      )
    }

  })


  test('error-custom', () => {
    let g0 = Shape(Number, { name: 'G0' })
    let ctx0 = { prefix: 'P0', suffix: 'S0' }
    deepEqual(g0(1, ctx0), 1)
    throws(() => g0('x', ctx0), 'G0: P0: Validation failed for string "x" because ' +
        'the string is not of type number. S0')

    let ctx1 = { prefix: 'P1', suffix: 'S1' }
    deepEqual(g0(11, ctx1), 11)
    throws(() => g0('y', ctx1), 'G0: P1: Validation failed for string "y" because ' +
        'the string is not of type number. S1')
  })


  test('shapes-basic', () => {
    let tmp: any = {}


    deepEqual(Shape(String)('x'), 'x')
    deepEqual(Shape(Number)(1), 1)
    deepEqual(Shape(Boolean)(true), true)
    deepEqual(Shape(BigInt)(BigInt(1)), BigInt(1))
    deepEqual(Shape(Object)({ x: 1 }), { x: 1 })
    deepEqual(Shape(Array)([1]), [1])
    deepEqual(Shape(Function)(tmp.f0 = () => true), tmp.f0)
    deepEqual(Shape(Symbol)(tmp.s0 = Symbol('foo')), tmp.s0)
    deepEqual(Shape(Error)(tmp.e0 = new Error()), tmp.e0)
    deepEqual(Shape(Date)(tmp.d0 = new Date()), tmp.d0)
    deepEqual(Shape(RegExp)(tmp.r0 = /a/), tmp.r0)
    deepEqual(Shape(Map)(tmp.m0 = new Map()), tmp.m0)
    deepEqual(Shape(Foo)(tmp.c0 = new Foo(2)), tmp.c0)

    deepEqual(Shape('a')('x'), 'x')
    deepEqual(Shape(0)(1), 1)
    deepEqual(Shape(false)(true), true)
    deepEqual(Shape(BigInt(-1))(BigInt(1)), BigInt(1))
    deepEqual(Shape({})({ x: 1 }), { x: 1 })
    deepEqual(Shape([])([1]), [1])
    deepEqual(Shape(() => null)(tmp.f0 = () => false), tmp.f0)
    deepEqual(Shape(new Object())({ x: 1 }), { x: 1 })
    deepEqual(Shape(new Array())([1]), [1])

    // FIX: no way to tell this apart from `function anonymous() {}` ?
    // deepEqual(Shape(new Function())(tmp.nf0 = () => false), tmp.nf0)

    deepEqual(Shape(Symbol('bar'))(tmp.s0), tmp.s0)
    deepEqual(Shape(new Error('a'))(tmp.e1 = new Error('b')), tmp.e1)
    deepEqual(Shape(new Date())(tmp.d1 = new Date(Date.now() - 1111)), tmp.d1)
    // deepEqual(Shape(new RegExp('a'))(tmp.r1 = /b/), tmp.r1)
    deepEqual(Shape(new RegExp('a'))(tmp.r1 = 'a'), tmp.r1)
    deepEqual(Shape(new Foo(4))(tmp.c1 = new Foo(5)), tmp.c1)
    deepEqual(Shape(new Bar(6))(tmp.c2 = new Bar(7)), tmp.c2)
    deepEqual(Shape(G$({ v: () => null }))(tmp.f1 = () => false), tmp.f1)

    deepEqual(Shape(null)(null), null)
    throws(() => Shape(null)(1), 'Validation failed for number "1" because the number is not of type null.')

    deepEqual(Shape(Check((_v: any, u: Update) => (u.val = 1, true)))(null), 1)

    throws(() => Shape(String)(1), /not of type string/)
    throws(() => Shape(Number)('x'), /not of type number/)
    throws(() => Shape(Boolean)('x'), /not of type boolean/)
    throws(() => Shape(BigInt)('x'), /not of type bigint/)
    throws(() => Shape(Object)('x'), /not of type object/)
    throws(() => Shape(Array)('x'), /not of type array/)
    throws(() => Shape(Function)('x'), /not of type function/)
    throws(() => Shape(Symbol)('x'), /not of type symbol/)
    throws(() => Shape(Error)('x'), /not an instance of Error/)
    throws(() => Shape(Date)(/a/), /not an instance of Date/)
    throws(() => Shape(RegExp)(new Date()), /not an instance of RegExp/)
    throws(() => Shape(Foo)(tmp.c3 = new Bar(8)), /not an instance of Foo/)
    throws(() => Shape(Bar)(tmp.c4 = new Foo(9)), /not an instance of Bar/)


    throws(() => Shape('a')(1), /not of type string/)
    throws(() => Shape(0)('x'), /not of type number/)
    throws(() => Shape(false)('x'), /not of type boolean/)
    throws(() => Shape(BigInt(-1))('x'), /not of type bigint/)
    throws(() => Shape({})('x'), / not of type object/)
    throws(() => Shape([])('x'), /not of type array/)
    throws(() => Shape(() => null)('x'), /not of type function/)
    throws(() => Shape(Symbol('bar'))('x'), /not of type symbol/)
    throws(() => Shape(new Error('x'))('x'), /not an instance of Error/)
    throws(() => Shape(new Date())('x'), /not an instance of Date/)
    throws(() => Shape(new RegExp('a'))('x'), 'Validation failed for string \"x\" because the string did not match /a/.')
    throws(() => Shape(new Foo(4))('a'), /not an instance of Foo/)
    throws(() => Shape(new Bar(6))('a'), /not an instance of Bar/)
    throws(() => Shape(new Foo(10))(new Bar(11)), /not an instance of Foo/)
    throws(() => Shape(new Bar(12))(new Foo(12)), /not an instance of Bar/)

    // expect(() => Shape(G$({ v: () => null }))('x'))
    //  .toThrow(/not of type function/)


    deepEqual(Shape({ a: String })({ a: 'x' }), { a: 'x' })
    deepEqual(Shape({ a: Number })({ a: 1 }), { a: 1 })
    deepEqual(Shape({ a: Boolean })({ a: true }), { a: true })
    deepEqual(Shape({ a: Object })({ a: { x: 1 } }), { a: { x: 1 } })
    deepEqual(Shape({ a: RegExp })({ a: /x/ }), { a: /x/ })

    throws(() => Shape({ a: String })({ a: 1 }), /not of type string/)
    throws(() => Shape({ a: Number })({ a: 'x' }), /not of type number/)
    throws(() => Shape({ a: Boolean })({ a: 'x' }), /not of type boolean/)
    throws(() => Shape({ a: Object })({ a: 'x' }), /not of type object/)

    deepEqual(Shape([String])([]), [])
    deepEqual(Shape([String])(['x']), ['x'])
    deepEqual(Shape([String])(['x', 'y']), ['x', 'y'])

    deepEqual(Shape([Number])([]), [])
    deepEqual(Shape([Number])([1]), [1])
    deepEqual(Shape([Number])([1, 2]), [1, 2])

    deepEqual(Shape([Boolean])([]), [])
    deepEqual(Shape([Boolean])([true]), [true])
    deepEqual(Shape([Boolean])([true, false]), [true, false])

    deepEqual(Shape([Object])([]), [])
    deepEqual(Shape([Object])([{ x: 1 }]), [{ x: 1 }])
    deepEqual(Shape([Object])([{ x: 1 }, { y: 2 }]), [{ x: 1 }, { y: 2 }])

    deepEqual(Shape([RegExp])([]), [])
    deepEqual(Shape([RegExp])([/a/]), [/a/])
    deepEqual(Shape([RegExp])([/a/, /b/]), [/a/, /b/])

    deepEqual(Shape([Date])([]), [])
    let d0 = new Date(); deepEqual(Shape([Date])([d0]), [d0])
    let d1 = new Date(); deepEqual(Shape([Date])([d0, d1]), [d0, d1])

    throws(() => Shape([String])([1]), /not of type string/)
    throws(() => Shape([Number])(['x']), /not of type number/)
    throws(() => Shape([Boolean])(['x']), /not of type boolean/)
    throws(() => Shape([Object])([1]), /not of type object/)
    throws(() => Shape([RegExp])(['not']), /not an instance of RegExp\./)
  })


  test('shapes-fails', () => {
    let tmp: any = {}

    let string0 = Shape(String)
    deepEqual(string0('x'), 'x')
    deepEqual(string0('xy'), 'xy')
    throws(() => string0(''), /Validation failed for string "" because an empty string is not allowed./)
    throws(() => string0(1), /not of type string/)
    throws(() => string0(true), /not of type string/)
    throws(() => string0(BigInt(11)), /not of type string/)
    throws(() => string0(null), /not of type string/)
    throws(() => string0({}), /not of type string/)
    throws(() => string0([]), /not of type string/)
    throws(() => string0(/a/), /not of type string/)
    throws(() => string0(NaN), /not of type string/)
    throws(() => string0(Infinity), /not of type string/)
    throws(() => string0(undefined), /value is required/)
    throws(() => string0(new Date()), /not of type string/)
    throws(() => string0(new Foo(1)), /not of type string/)

    let number0 = Shape(Number)
    deepEqual(number0(1), 1)
    deepEqual(number0(Infinity), Infinity)
    throws(() => number0('x'), /not of type number/)
    throws(() => number0(true), /not of type number/)
    throws(() => number0(BigInt(11)), /not of type number/)
    throws(() => number0(null), /not of type number/)
    throws(() => number0({}), /not of type number/)
    throws(() => number0([]), /not of type number/)
    throws(() => number0(/a/), /not of type number/)
    throws(() => number0(NaN), /not of type number/)
    throws(() => number0(undefined), /value is required/)
    throws(() => number0(new Date()), /not of type number/)
    throws(() => number0(new Foo(1)), /not of type number/)

    let object0 = Shape(Object)
    deepEqual(object0({}), {})
    deepEqual(object0({ x: 1 }), { x: 1 })
    deepEqual(object0(tmp.r0 = /a/), tmp.r0)
    deepEqual(object0(tmp.d0 = new Date()), tmp.d0)
    deepEqual(object0(tmp.f0 = new Foo(1)), tmp.f0)
    throws(() => object0(1), /not of type object/)
    throws(() => object0('x'), /not of type object/)
    throws(() => object0(true), /not of type object/)
    throws(() => object0(BigInt(11)), /not of type object/)
    throws(() => object0(null), /not of type object/)
    throws(() => object0([]), /not of type object/)
    throws(() => object0(NaN), /not of type object/)
    throws(() => object0(undefined), /value is required/)

    let array0 = Shape(Array)
    deepEqual(array0([]), [])
    deepEqual(array0([11]), [11])
    throws(() => array0('x'), /not of type array/)
    throws(() => array0(true), /not of type array/)
    throws(() => array0(BigInt(11)), /not of type array/)
    throws(() => array0(null), /not of type array/)
    throws(() => array0({}), /not of type array/)
    throws(() => array0(/a/), /not of type array/)
    throws(() => array0(NaN), /not of type array/)
    throws(() => array0(undefined), /value is required/)
    throws(() => array0(new Date()), /not of type array/)
    throws(() => array0(new Foo(1)), /not of type array/)

  })


  test('shapes-builtins', () => {
    let d0 = new Date(2121, 1, 1)
    let g0 = Shape({ a: Date })
    deepEqual(g0({ a: d0 }), { a: d0 })
    throws(() => g0({}), 'required')
    throws(() => g0({ a: Date }), 'instance')
    throws(() => g0({ a: /QXQ/ }), /QXQ.*instance/)

    let g1 = Shape({ a: Skip(Date) })
    deepEqual(g1({ a: d0 }), { a: d0 })
    deepEqual(g1({ a: undefined }), { a: undefined })
    deepEqual(g1({}), {})

    let r0 = /a/
    let g2 = Shape({ a: RegExp })
    deepEqual(g2({ a: r0 }), { a: r0 })
    throws(() => g2({}), 'required')
    throws(() => g2({ a: RegExp }), 'instance')
    throws(() => g2({ a: d0 }), /2121.*instance/)

    let g3 = Shape({ a: Skip(RegExp) })
    deepEqual(g3({ a: r0 }), { a: r0 })
    deepEqual(g3({}), {})
  })


  test('object-basic', () => {
    let g1 = Shape({ x: 1 })
    deepEqual(g1(), { x: 1 })
    deepEqual(g1({}), { x: 1 })
    deepEqual(g1({ x: 11 }), { x: 11 })
    throws(() => g1({ x: 11, y: 22 }), 'Validation failed for object "{x:11,y:22}" because the property "y" is not allowed.')
    throws(() => g1({ x: 11, y: 22, z: 33 }), 'Validation failed for object "{x:11,y:22,z:33}" because the properties "y, z" are not allowed.')

    let g2 = Shape({ x: 1, y: 2 })
    deepEqual(g2(), { x: 1, y: 2 })
    deepEqual(g2({}), { x: 1, y: 2 })
    deepEqual(g2({ x: 11 }), { x: 11, y: 2 })
    deepEqual(g2({ x: 11, y: 22 }), { x: 11, y: 22 })
    throws(() => g2({ x: 11, y: 22, z: 33 }), 'Validation failed for object "{x:11,y:22,z:33}" because the property "z" is not allowed.')

    let g3 = Shape({ x: 1, y: 2, z: 3 })
    deepEqual(g3(), { x: 1, y: 2, z: 3 })
    deepEqual(g3({}), { x: 1, y: 2, z: 3 })
    deepEqual(g3({ x: 11 }), { x: 11, y: 2, z: 3 })
    deepEqual(g3({ x: 11, y: 22 }), { x: 11, y: 22, z: 3 })
    deepEqual(g3({ x: 11, y: 22, z: 33 }), { x: 11, y: 22, z: 33 })
    throws(() => g3({ x: 11, y: 22, z: 33, k: 44 }), 'Validation failed for object "{x:11,y:22,z:33,k:44}" because the property "k" is not allowed.')


    let g1o = Shape(Open({ x: 1 }))
    deepEqual(g1o(), { x: 1 })
    deepEqual(g1o({}), { x: 1 })
    deepEqual(g1o({ x: 11 }), { x: 11 })
    deepEqual(g1o({ x: 11, y: 22 }), { x: 11, y: 22 })
    deepEqual(g1o({ x: 11, y: 22, z: 33 }), { x: 11, y: 22, z: 33 })

    let g2o = Shape(Open({ x: 1, y: 2 }))
    deepEqual(g2o(), { x: 1, y: 2 })
    deepEqual(g2o({}), { x: 1, y: 2 })
    deepEqual(g2o({ x: 11 }), { x: 11, y: 2 })
    deepEqual(g2o({ x: 11, y: 22 }), { x: 11, y: 22 })
    deepEqual(g2o({ x: 11, y: 22, z: 33 }), { x: 11, y: 22, z: 33 })

    let g3o = Shape(Open({ x: 1, y: 2, z: 3 }))
    deepEqual(g3o(), { x: 1, y: 2, z: 3 })
    deepEqual(g3o({}), { x: 1, y: 2, z: 3 })
    deepEqual(g3o({ x: 11 }), { x: 11, y: 2, z: 3 })
    deepEqual(g3o({ x: 11, y: 22 }), { x: 11, y: 22, z: 3 })
    deepEqual(g3o({ x: 11, y: 22, z: 33 }), { x: 11, y: 22, z: 33 })
    deepEqual(g3o({ x: 11, y: 22, z: 33, k: 44 }), { x: 11, y: 22, z: 33, k: 44 })



    let g1v = Shape(Child(Number, { x: 1 }))
    deepEqual(g1v(), { x: 1 })
    deepEqual(g1v({}), { x: 1 })
    deepEqual(g1v({ x: 11 }), { x: 11 })
    deepEqual(g1v({ x: 11, y: 22 }), { x: 11, y: 22 })
    deepEqual(g1v({ x: 11, y: 22, z: 33 }), { x: 11, y: 22, z: 33 })
    throws(() => g1v({ x: 11, y: true }), 'Validation failed for property "y" with boolean "true" because the boolean is not of type number.')

    let g2v = Shape(Child(Number, { x: 1, y: 2 }))
    deepEqual(g2v(), { x: 1, y: 2 })
    deepEqual(g2v({}), { x: 1, y: 2 })
    deepEqual(g2v({ x: 11 }), { x: 11, y: 2 })
    deepEqual(g2v({ x: 11, y: 22 }), { x: 11, y: 22 })
    deepEqual(g2v({ x: 11, y: 22, z: 33 }), { x: 11, y: 22, z: 33 })
    throws(() => g2v({ x: 11, y: 22, z: true }), 'Validation failed for property "z" with boolean "true" because the boolean is not of type number.')

    let g3v = Shape(Child(Number, { x: 1, y: 2, z: 3 }))
    deepEqual(g3v(), { x: 1, y: 2, z: 3 })
    deepEqual(g3v({}), { x: 1, y: 2, z: 3 })
    deepEqual(g3v({ x: 11 }), { x: 11, y: 2, z: 3 })
    deepEqual(g3v({ x: 11, y: 22 }), { x: 11, y: 22, z: 3 })
    deepEqual(g3v({ x: 11, y: 22, z: 33 }), { x: 11, y: 22, z: 33 })
    deepEqual(g3v({ x: 11, y: 22, z: 33, k: 44 }), { x: 11, y: 22, z: 33, k: 44 })
    throws(() => g3v({ x: 11, y: 22, z: 33, k: true }), 'Validation failed for property "k" with boolean "true" because the boolean is not of type number.')


    // Empty object is Open
    let g4 = Shape({})
    deepEqual(g4(), {})
    deepEqual(g4({}), {})
    deepEqual(g4({ x: 1 }), { x: 1 })
    deepEqual(g4({ x: 1, y: 'a' }), { x: 1, y: 'a' })

    let g5 = Shape({ k: {} })
    deepEqual(g5(), { k: {} })
    deepEqual(g5({}), { k: {} })
    deepEqual(g5({ k: {} }), { k: {} })
    deepEqual(g5({ k: { n: true } }), { k: { n: true } })
    deepEqual(g5({ k: { n: true, m: NaN } }), { k: { n: true, m: NaN } })
    throws(() => g5({ x: 1 }), 'not allowed')

    throws(() => Shape({ x: 1 })('q'), /type object/)
    throws(() => Shape({ y: { x: 1 } })({ y: 'q' }), /type object/)
  })


  test('required-cover', () => {

    const v0 = Shape(Required(Any()))
    deepEqual(v0(1), 1)
    throws(() => v0(), 'required')

    const o0 = Shape({ a: Required(Any()) })
    deepEqual(o0({ a: 1 }), { a: 1 })
    throws(() => o0({}), 'required')

    const a0 = Shape([Required(Any())])
    deepEqual(a0([]), []) // empty array is allowed
    deepEqual(a0([1]), [1])
    deepEqual(a0([1, 2]), [1, 2])
    deepEqual(a0([1, 2, 3]), [1, 2, 3])


  })


  test('shapes-edges', () => {
    // NaN is actually Not-a-Number (whereas 'number' === typeof(NaN))
    const num0 = Shape(1)
    deepEqual(num0(1), 1)
    throws(() => num0(NaN), /not of type number/)

    const nan0 = Shape(NaN)
    deepEqual(nan0(NaN), NaN)
    throws(() => nan0(1), /not of type nan/)


    // Empty strings only allowed by Empty() builder.

    const rs0 = Shape(String)
    deepEqual(rs0('x'), 'x')
    throws(() => rs0(''), 'Validation failed for string "" because an empty string is not allowed.')

    const rs0e = Shape(Empty(String))
    deepEqual(rs0e('x'), 'x')
    deepEqual(rs0e(''), '')
    throws(() => rs0e(), 'required')
    throws(() => rs0e(undefined), 'required')

    const os0 = Shape('x')
    throws(() => os0(''), 'empty string is not allowed')
    deepEqual(os0(), 'x')
    deepEqual(os0(undefined), 'x')
    deepEqual(os0('x'), 'x')
    deepEqual(os0('y'), 'y')

    const os0e = Shape(Empty('x'))
    deepEqual(os0e(''), '')
    deepEqual(os0e(), 'x')
    deepEqual(os0e(undefined), 'x')
    deepEqual(os0e('x'), 'x')
    deepEqual(os0e('y'), 'y')

    const os0e2 = Shape(Empty(''))
    deepEqual(os0e2(''), '')
    deepEqual(os0e2(), '')
    deepEqual(os0e2(undefined), '')
    deepEqual(os0e2('x'), 'x')
    deepEqual(os0e2('y'), 'y')

    // Use literal '' as a shortcut
    const os0e3 = Shape('')
    deepEqual(os0e3(''), '')
    deepEqual(os0e3(), '')
    deepEqual(os0e3(undefined), '')
    deepEqual(os0e3('x'), 'x')
    deepEqual(os0e3('y'), 'y')


    const os1e = Shape(Skip(Empty(String)))
    deepEqual(os1e(), undefined)
    deepEqual(os1e(''), '')
    deepEqual(os1e('x'), 'x')

    const os2e = Shape(Skip(String).Empty())
    deepEqual(os2e(), undefined)
    deepEqual(os2e(''), '')
    deepEqual(os2e('x'), 'x')


    const os1eO = Shape({ a: Skip(Empty(String)) })
    deepEqual(os1eO({}), {})
    deepEqual(os1eO({ a: '' }), { a: '' })
    deepEqual(os1eO({ a: 'x' }), { a: 'x' })


    // Long values are truncated in error descriptions.
    throws(() =>
      Shape(Number)('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), 'Validation failed for string "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa..." because the string is not of type number.')


    // Explicit `undefined` and `null`

    const u0 = Shape({ a: undefined })
    deepEqual(u0({ a: undefined }), { a: undefined })
    deepEqual(u0({}), { a: undefined })

    const u0n = Shape({ a: null })
    deepEqual(u0n({ a: null }), { a: null })
    deepEqual(u0n({}), { a: null })
    throws(() => u0n({ a: 1 }), 'type')

    const u1 = Shape({ a: Required(undefined) })
    deepEqual(u1({ a: undefined }), { a: undefined })
    throws(() => u1({}), 'required')

    const u1n = Shape({ a: Required(null) })
    deepEqual(u1n({ a: null }), { a: null })
    throws(() => u1n({}), 'required')
    throws(() => u1n({ a: 1 }), 'type')

    const u2 = Shape({ a: Required(NaN) })
    deepEqual(u2({ a: NaN }), { a: NaN })
    throws(() => u2({}), 'required')


    // Required does inject undefined
    let r0 = Shape({ a: Boolean, b: Required({ x: Number }), c: Required([]) })
    let o0 = {}
    throws(() => r0(o0), 'required')
    deepEqual(o0, {})
    assert.ok(!(o0.hasOwnProperty('a')))
    assert.ok(!(o0.hasOwnProperty('b')))
    assert.ok(!(o0.hasOwnProperty('c')))


  })


  test('function-basic', () => {
    function Qaz() { }
    let g0 = Shape(Func(Qaz)) // needed other Foo is considered a class

    let tmp: any = {}
    deepEqual(g0(), Qaz)
    deepEqual(g0(tmp.f0 = () => true), tmp.f0)
  })


  test('regexp-basic', () => {
    let g0 = Shape(/a/)
    deepEqual(g0('a'), 'a')
    deepEqual(g0('xax'), 'xax')
    throws(() => g0('x'), 'Validation failed for string "x" because the string did not match /a/.')

    let g1 = Shape({ b: /a/ })
    deepEqual(g1({ b: 'a' }), { b: 'a' })
    deepEqual(g1({ b: 'xax' }), { b: 'xax' })
    throws(() => g1({ b: 'x' }), 'Validation failed for property "b" with string "x" because the string did not match /a/.')
    throws(() => g1({}), 'Validation failed for property "b" with value "undefined" because the value is not of type string.')

    let g2 = Shape({ b: Optional(/a/) })
    deepEqual(g2({ b: 'a' }), { b: 'a' })
    deepEqual(g2({ b: 'xax' }), { b: 'xax' })
    deepEqual(g2({}), {})
    throws(() => g2({ b: 'x' }), 'Validation failed for property "b" with string "x" because the string did not match /a/.')
  })


  test('api-object', () => {
    // This is an allowed way to get shape builders
    const { Required } = Shape

    let obj01 = Shape({
      a: { x: 1 },
      b: Skip({ y: 2 }),
      c: Skip({ z: Skip({ k: 3 }) }),
    })
    deepEqual(obj01(), { a: { x: 1 } })
    deepEqual(obj01({}), { a: { x: 1 } })
    deepEqual(obj01({ b: {} }), { a: { x: 1 }, b: { y: 2 } })
    deepEqual(obj01({ c: {} }), { a: { x: 1 }, c: {} })
    deepEqual(obj01({ c: { z: {} } }), { a: { x: 1 }, c: { z: { k: 3 } } })


    let obj11 = Shape({
      people: Required({}).Child({ name: String, age: Number })
    })

    deepEqual(obj11({
      people: {
        alice: { name: 'Alice', age: 99 },
        bob: { name: 'Bob', age: 98 },
      }
    }), {
      people: {
        alice: { name: 'Alice', age: 99 },
        bob: { name: 'Bob', age: 98 },
      }
    })

    throws(() => obj11({
      people: {
        alice: { name: 'Alice', age: 99 },
        bob: { name: 'Bob' }
      }
    }), 'Validation failed for property "people.bob.age" with value "undefined" because the value is required.')
    throws(() => obj11({}), 'Validation failed for property "people" with value "undefined" because the value is required.')


    let shape = Shape({
      foo: Number,
      bar: Required({
        zed: Boolean
      })
    })

    // This passes, returning the value unchanged.
    shape({ foo: 1, bar: { zed: false } })

    // These fail, throwing an Error.
    throws(() => shape({ bar: { zed: false } }), 'required') // foo is required
    throws(() => shape({ foo: 'abc', bar: { zed: false } }), 'number') // foo is not a number
    throws(() => shape({ foo: 1 }), 'required') // bar is required
    throws(() => shape({ foo: 1, bar: {} }), 'required') // bar.zed is required
    throws(() => shape({ foo: 1, bar: { zed: false, baz: 2 }, qaz: 3 }), 'not allowed') // new properties are not allowed


    let strictShape = Shape({ a: { b: String } })

    // Passes
    deepEqual(strictShape({ a: { b: 'ABC' } }), { a: { b: 'ABC' } })

    // Fails, even though a is not required, because a.b is required.
    throws(() => strictShape({}), 'Validation failed for property "a.b" with value "undefined" because the value is required.')


    let easyShape = Shape({ a: Skip({ b: String }) })

    // Now both pass
    deepEqual(easyShape({ a: { b: 'ABC' } }), { a: { b: 'ABC' } })
    deepEqual(easyShape({}), {})

    // This still fails, as `a` is now defined, and needs `b`
    throws(() => easyShape({ a: {} }), 'Validation failed for property "a.b" with value "undefined" because the value is required.')


    const { Open } = Shape

    shape = Shape(Open({
      a: 1
    }))

    deepEqual(shape({ a: 11, b: 22 }), { a: 11, b: 22 })
    deepEqual(shape({ b: 22, c: 'foo' }), { a: 1, b: 22, c: 'foo' })

    throws(() => shape({ a: 'foo' }), 'type')


    shape = Shape(Open({
      a: Open({
        b: 1
      })
    }))

    deepEqual(shape({ a: { b: 11, c: 22 }, d: 33 }), { a: { b: 11, c: 22 }, d: 33 })


    const { Child } = Shape
    shape = Shape(Child(String, {
      a: 123,
    }))

    // All non-explicit properties must be a String
    deepEqual(shape({ a: 11, b: 'abc' }), { a: 11, b: 'abc' }) // b is a string
    deepEqual(shape({ c: 'foo', d: 'bar' }), { a: 123, c: 'foo', d: 'bar' }) // c and d are strings

    // These fail
    throws(() => shape({ a: 'abc' }), 'number') // a must be a number
    throws(() => shape({ b: { x: 1 } }), 'string') // b must be a string

  })




  test('api-array', () => {
    let g1 = Shape([Number])
    deepEqual(g1(), [])
    deepEqual(g1([]), [])
    deepEqual(g1([1]), [1])
    deepEqual(g1([1, 2]), [1, 2])
    deepEqual(g1([1, 2, 3]), [1, 2, 3])
    deepEqual(g1([1, 2, 3, 4]), [1, 2, 3, 4])
    throws(() => g1([1, 2, 'x']), 'type')

    let g2 = Shape([{ x: 1 }])
    deepEqual(g2(), [])
    deepEqual(g2([]), [])
    deepEqual(g2([{ x: 123 }]), [{ x: 123 }])
    deepEqual(g2([{ x: 123 }, { x: 456 }]), [{ x: 123 }, { x: 456 }])
    deepEqual(g2([{}]), [{ x: 1 }])
    deepEqual(g2([{ x: 123 }, {}]), [{ x: 123 }, { x: 1 }])
    throws(() => g2([{ x: 123, y: 'a' }, { x: 456 }]), 'not allowed')
    throws(() => g2([{ x: 123 }, { x: 456, y: 'a' }]), 'not allowed')
    throws(() => g2([{ x: 'a' }]), 'type')
    throws(() => g2([{ x: 1 }, { x: 'a' }]), 'type')

    let gc1 = Shape(Closed([Number, String, Boolean]))

    deepEqual(gc1([123, 'abc', true]), [123, 'abc', true])

    throws(() => gc1(['bad']), 'type')
    throws(() => gc1([123]), 'required')
    throws(() => gc1([123, 'abc', true, 'extra']), 'not allowed')


    let gc2 = Shape(Closed([1, 'a', true]))
    deepEqual(gc2(), [1, 'a', true])
    deepEqual(gc2([]), [1, 'a', true])
    deepEqual(gc2([2]), [2, 'a', true])
    deepEqual(gc2([2, 'b']), [2, 'b', true])
    deepEqual(gc2([2, 'b', false]), [2, 'b', false])
    deepEqual(gc2([2, undefined, false]), [2, 'a', false])
    deepEqual(gc2([2, , false]), [2, 'a', false])
    throws(() => gc2([2, 'b', false, 'bad']), 'not allowed')

    // 2 or more elements, so considered Closed
    let gc3 = Shape([{ x: 1 }, Required({ y: true })])
    deepEqual(gc3([{ x: 2 }, { y: false }]), [{ x: 2 }, { y: false }])
    deepEqual(gc3([undefined, { y: false }]), [{ x: 1 }, { y: false }])
    deepEqual(gc3([{ x: 2 }, {}]), [{ x: 2 }, { y: true }])
    throws(() => gc3([{ x: 2 }, undefined]), 'required')
    throws(() => gc3([{ x: 2 }]), 'required')

    let gc4 = Shape({ a: Closed([{ x: 1 }, { y: { z: 'Z' } }]) })
    deepEqual(gc4(), { 'a': [{ 'x': 1 }, { 'y': { 'z': 'Z' } }] })
    deepEqual(gc4({}), {
      'a': [{ 'x': 1 }, {
        'y': {
          'z': 'Z'
        }
      }]
    })
    deepEqual(gc4({ a: undefined }), { 'a': [{ 'x': 1 }, { 'y': { 'z': 'Z' } }] })
    deepEqual(gc4({ a: [] }), { 'a': [{ 'x': 1 }, { 'y': { 'z': 'Z' } }] })
    throws(() => gc4({ a: {} }), 'Validation failed for property "a" with object "{}" because the object is not of type array.')
  })


  test('api-length', () => {
    let g1 = Shape(Max(2, []))
    deepEqual(g1([1]), [1])
    deepEqual(g1(['a', true]), ['a', true])
    throws(() => g1([1, 2, 3]), 'maximum length of 2')

    let g2 = Shape(Min(2, [Number]))
    deepEqual(g2([11, 22]), [11, 22])
    deepEqual(g2([11, 22, 33]), [11, 22, 33])
    throws(() => g2([11]), 'minimum')
    throws(() => g2([]), 'minimum')

    let g3 = Shape(Max(2, String))
    deepEqual(g3('a'), 'a')
    deepEqual(g3('ab'), 'ab')
    throws(() => g3('abc'), 'maximum')

    let g4 = Shape(Max(2, {}))
    deepEqual(g4({ a: 1 }), { a: 1 })
    deepEqual(g4({ a: 1, b: 2 }), { a: 1, b: 2 })
    throws(() => g4({ a: 1, b: 2, c: 3 }), 'maximum')


  })


  test('api-functions', () => {
    let f0 = () => true
    let f1 = () => false
    let { G$ } = Shape
    let shape = Shape({ fn: G$({ v: f0, f: f0 }) })

    deepEqual(shape({}), { fn: f0 })
    deepEqual(shape({ fn: f1 }), { fn: f1 })


    let tmp: any = {}

    shape = Shape({
      fn: tmp.d0 = () => true
    })

    deepEqual(shape({ fn: tmp.f0 = () => false }), { fn: tmp.f0 })
    deepEqual(shape({}), { fn: tmp.d0 })
  })


  test('api-custom', () => {
    let shape = Shape({ a: Check((v: any) => 10 < v) })
    deepEqual(shape({ a: 11 }), { a: 11 }) // passes, as 10 < 11 is true
    throws(() => shape({ a: 9 }), 'Validation failed for property "a" with number "9" because check "(v) => 10 < v" failed.')  // fails, as 10 < 9 is false

    shape = Shape({
      a: Check((value: any, update: any) => {
        update.val = value * 2
        return true // Remember to return true to indicate value is valid!
      })
    })

    deepEqual(shape({ a: 3 }), { a: 6 })


    shape = Shape({
      a: Check((_value: any, update: any) => {
        update.err = 'BAD VALUE $VALUE AT $PATH'
        return false // always fails
      })
    })
    throws(() => shape({ a: 3 }), "BAD VALUE 3 AT a")


    shape = Shape({
      a: Check((value: any, update: any, state: any) => {
        update.val = value + ` KEY=${state.key}`
        return true
      })
    })
    deepEqual(shape({ a: 3 }), { a: '3 KEY=a' }) // returns { a: '3 KEY=a'}

  })


  test('type-default-optional', () => {
    let f0 = () => true

    let g0 = Shape({
      string: 's',
      number: 1,
      boolean: true,
      object: { x: 2 },
      array: [3],
      function: G$({ t: 'function', v: f0, f: f0 })
    })

    matchObject(g0({}), {
      string: 's',
      number: 1,
      boolean: true,
      object: { x: 2 },
      array: [],
      function: f0
    })

    matchObject(g0({
      string: 'S',
      number: 11,
      boolean: false,
      object: { x: 22 },
      array: [33],
    }), {
      string: 'S',
      number: 11,
      boolean: false,
      object: { x: 22 },
      array: [33],
    })

  })


  test('type-native-required', () => {
    let g0 = Shape({
      string: String,
      number: Number,
      boolean: Boolean,
      object: Object,
      array: Array,
      function: Function,
    })

    let o0 = {
      string: 's',
      number: 1,
      boolean: true,
      object: { x: 2 },
      array: [3],
      function: () => true
    }
    matchObject(g0(o0), o0)


    let e0 = Shape({ s0: String, s1: 'x' })
    matchObject(e0({ s0: 'a' }), { s0: 'a', s1: 'x' })

    throws(() => e0({ s0: 1 }), /Validation failed for property "s0" with number "1" because the number is not of type string\./)
    throws(() => e0({ s1: 1 }), /Validation failed for property "s0" with value "undefined" because the value is required\.\nValidation failed for property "s1" with number "1" because the number is not of type string\./)

  })


  test('type-native-optional', () => {
    let { Skip } = Shape

    // Explicit Skip over native type sets no value.
    let g0 = Shape({
      string: Skip(String),
      number: Skip(Number),
      boolean: Skip(Boolean),
      object: Skip(Object),
      array: Skip(Array),
      function: Skip(Function),
    })

    deepEqual(g0({}), {})
  })


  test('array-repeating-elements', () => {
    let g0 = Shape({
      a: [String]
    })

    deepEqual(g0({ a: [] }), { a: [] })
    deepEqual(g0({ a: ['X'] }), { a: ['X'] })
    deepEqual(g0({ a: ['X', 'Y'] }), { a: ['X', 'Y'] })
    deepEqual(g0({ a: ['X', 'Y', 'Z'] }), { a: ['X', 'Y', 'Z'] })

    throws(() => g0({ a: [null] }), /"a.0".*"null".*type string/)
    throws(() => g0({ a: [''] }), 'Validation failed for index "a.0" with string "" because an empty string is not allowed.')

    throws(() => g0({ a: [11] }), /"a.0".*"11".*type string/)
    throws(() => g0({ a: ['X', 11] }), /"a.1".*"11".*type string/)
    throws(() => g0({ a: ['X', 'Y', 11] }), /"a.2".*"11".*type string/)
    throws(() => g0({ a: ['X', 'Y', 'Z', 11] }), /"a.3".*"11".*type string/)

    throws(() => g0({ a: ['X', null] }), /"a.1".*"null".*type string/)
    throws(() => g0({ a: ['X', ''] }), 'Validation failed for index "a.1" with string "" because an empty string is not allowed.')

    throws(() => g0({ a: [11, 'K'] }), /"a.0".*"11".*string/)
    throws(() => g0({ a: ['X', 11, 'K'] }), /"a.1".*"11".*string/)
    throws(() => g0({ a: ['X', 'Y', 11, 'K'] }), /"a.2".*"11".*string/)
    throws(() => g0({ a: ['X', 'Y', 'Z', 11, 'K'] }), /"a.3".*"11".*string/)

    throws(() => g0({ a: [22, 'Y', 11, 'K'] }), /"a.0".*"22".*"a.2".*"11"/s)
    throws(() => g0({ a: ['X', 'Y', 'Z', 11, 'K', 'L'] }), /"a.3".*"11"/)


    // Zero or more elements of shape.
    let g1 = Shape([String])
    deepEqual(g1(['X', 'Y']), ['X', 'Y'])
    throws(() => g1(['X', 1]), /Validation failed for index "1" with number "1" because the number is not of type string\./)


    // Empty array means any element
    let g2 = Shape([])
    deepEqual(g2(), [])
    deepEqual(g2([]), [])
    deepEqual(g2([1]), [1])
    deepEqual(g2([1, 'a']), [1, 'a'])
    deepEqual(g2([1, 'a', true]), [1, 'a', true])
    deepEqual(g2([, 1, 'a', true]), [undefined, 1, 'a', true])
    deepEqual(g2([null, 1, , 'a', true]), [null, 1, undefined, 'a', true])
    deepEqual(g2([null, 1, , 'a', true]), [null, 1, undefined, 'a', true])


    // Required with single element is redundant
    let g3 = Shape([Required({ x: 1 })])
    deepEqual(g3([{ x: 11 }]), [{ x: 11 }])
    deepEqual(g3([{ x: 11 }, { x: 22 }]), [{ x: 11 }, { x: 22 }])
    deepEqual(g3([]), [])
    deepEqual(g3(), [])


    // Single element is the same as Value(...)

    let g4 = Shape([Number])
    deepEqual(g4(), [])
    deepEqual(g4([]), [])
    deepEqual(g4([1]), [1])
    deepEqual(g4([1, 2]), [1, 2])
    deepEqual(g4([1, 2, 3]), [1, 2, 3])
    throws(() => g4(['a']), 'Validation failed for index "0" with string "a" because the string is not of type number.')
    throws(() => g4([1, 'a']), 'Validation failed for index "1" with string "a" because the string is not of type number.')
    throws(() => g4([1, 2, 'a']), 'Validation failed for index "2" with string "a" because the string is not of type number.')


    // NOTE: array without spec can hold anything.
    let g6 = Shape([])
    deepEqual(g6([null, 1, 'x', true]), [null, 1, 'x', true])

    let g7 = Shape([Never()])
    deepEqual(g7([]), [])
    throws(() => g7([1]), 'Validation failed for index "0" with number "1" because no value is allowed.')
    throws(() => g7(new Array(1)), 'Validation failed for index "0" with value "undefined" because no value is allowed.')


    let g8 = Shape([1])
    deepEqual(g8(new Array(3)), [1, 1, 1])
    let a0 = [11, 22, 33]
    delete a0[1]
    deepEqual(g8(a0), [11, 1, 33])

    let g9 = Shape([null])
    deepEqual(g9([null, null]), [null, null])

    let g10 = Shape([{ x: 1 }])
    deepEqual(g10([]), [])
    deepEqual(g10([{ x: 11 }]), [{ x: 11 }])
    deepEqual(g10([{ x: 11 }, { x: 22 }]), [{ x: 11 }, { x: 22 }])
    deepEqual(g10([{ x: 11 }, { x: 22 }, { x: 33 }]), [{ x: 11 }, { x: 22 }, { x: 33 }])

    throws(() => g10(['q']), /"0".*"q".*type object/)
    throws(() => g10([{ x: 11 }, 'q']), /"1".*"q".*type object/)
    throws(() => g10([{ x: 11 }, { y: 22 }, 'q']), /"2".*"q".*type object/)
    throws(() => g10([{ x: 11 }, { y: 22 }, { z: 33 }, 'q']), /"3".*"q".*type object/)

    throws(() => g10(['q', { k: 99 }]), /"0".*"q".*type object/)
    throws(() => g10([{ x: 11 }, 'q', { k: 99 }]), /"1".*"q".*type object/)
    throws(() => g10([{ x: 11 }, { y: 22 }, 'q', { k: 99 }]), /"2".*"q".*type object/)
    throws(() => g10([{ x: 11 }, { y: 22 }, { z: 33 }, 'q', { k: 99 }]), /"3".*"q".*type object/)
  })


  test('array-closed', () => {

    // Exact set of elements.
    let g2 = Shape([{ x: 1 }, { y: true }])
    deepEqual(g2([{ x: 2 }, { y: false }]), [{ x: 2 }, { y: false }])
    throws(() => g2([{ x: 2 }, { y: false }, 'Q']), 'Validation failed for array "[{x:2},{y:false},Q]" because the index "2" is not allowed.')
    throws(() => g2([{ x: 'X' }, { y: false }]), 'Validation failed for property "0.x" with string "X" because the string is not of type number.')
    throws(() => g2(['Q', { y: false }]), 'Validation failed for index "0" with string "Q" because the string is not of type object.')
    deepEqual(g2([{ x: 2 }]), [{ x: 2 }, { y: true }])
    deepEqual(g2([{ x: 2 }, undefined]), [{ x: 2 }, { y: true }])
    deepEqual(g2([undefined, { y: false }]), [{ x: 1 }, { y: false }])
    deepEqual(g2([, { y: false }]), [{ x: 1 }, { y: false }])


    let g3 = Shape(Closed([Any()]))
    deepEqual(g3([]), [])
    deepEqual(g3([1]), [1])
    throws(() => g3([1, 'x']), 'not allowed')
    deepEqual(g3(new Array(1)), [undefined])
    throws(() => g3(new Array(2)), 'not allowed')

    let g4 = Shape(Closed([1]))
    deepEqual(g4([]), [1])
    deepEqual(g4([1]), [1])
    throws(() => g4(['a']), 'type')
    throws(() => g4([1, 2]), 'not allowed')
    deepEqual(g4(new Array(1)), [1])
    throws(() => g4(new Array(2)), 'not allowed')

    let g5 = Shape(Closed([Number]))
    throws(() => g5([]), 'required')
    deepEqual(g5([1]), [1])
    throws(() => g5(['a']), 'type')
    throws(() => g5([1, 2]), 'not allowed')
    throws(() => g5(new Array(1)), 'required')
    throws(() => g5(new Array(2)), 'not allowed')


    let g6 = Shape(Closed([Number, String, Boolean]))
    deepEqual(g6([1, 'a', true]), [1, 'a', true])
    deepEqual(g6([0, 'b', false]), [0, 'b', false])
    throws(() => g6([0, 'b', false, 1]), 'not allowed')

    throws(() => g6(['a']), 'type')
    throws(() => g6([1, 2]), 'required')
    throws(() => g6(new Array(0)), 'required')
    throws(() => g6(new Array(1)), 'required')
    throws(() => g6(new Array(2)), 'required')
    throws(() => g6(new Array(3)), 'required')
    throws(() => g6(new Array(4)), 'not allowed')


    let g7 = Shape(Closed([1, 'a']))
    deepEqual(g7([]), [1, 'a'])
    deepEqual(g7([, 'b']), [1, 'b'])

  })


  test('object-properties', () => {

    // NOTE: unclosed object without props can hold anything
    let g0 = Shape({})
    deepEqual(g0({ a: null, b: 1, c: 'x', d: true }), { a: null, b: 1, c: 'x', d: true })

    let g1 = Shape(Closed({}))
    deepEqual(g1({}), {})
    throws(() => g1({ a: null, b: 1, c: 'x', d: true }), 'Validation failed for object "{a:null,b:1,c:x,d:true}" because the properties "a, b, c, d" are not allowed.')
  })


  test('check-basic', () => {
    let g0 = Shape({ a: Check((v: any) => v > 10) })
    matchObject(g0({ a: 11 }), { a: 11 })
    throws(() => g0({ a: 9 }), 'Validation failed for property "a" with number "9" because check "(v) => v > 10" failed.')
  })


  test('custom-basic', () => {
    let g0 = Shape({ a: Check((v: any) => v > 10) })
    matchObject(g0({ a: 11 }), { a: 11 })
    throws(() => g0({ a: 9 }), 'Validation failed for property "a" with number "9" because check "(v) => v > 10" failed.')

    let g1 = Shape({ a: Skip(Check((v: any) => v > 10)) })
    matchObject(g1({ a: 11 }), { a: 11 })
    throws(() => g1({ a: 9 }), 'Validation failed for property "a" with number "9" because check "(v) => v > 10" failed.')
    matchObject(g1({}), {})

    let g2 = Shape({ a: Required(Check((v: any) => v > 10)) })
    matchObject(g1({ a: 11 }), { a: 11 })
    throws(() => g2({ a: 9 }), 'Validation failed for property "a" with number "9" because check "(v) => v > 10" failed.')
    throws(() => g2({}), 'Validation failed for property "a" with value "undefined" because the value is required.')

    let g3 = Shape(Check((v: any) => v > 10))
    deepEqual(g3(11), 11)
    throws(() => g3(9), 'Validation failed for number "9" because check "(v) => v > 10" failed.')
  })


  test('custom-modify', () => {
    let g0 = Shape({
      a: (Skip(Check((v: number, u: Update) => (u.val = v * 2, true)))),
      b: Skip(Check((_v: any, u: Update) => {
        u.err = 'BAD VALUE $VALUE AT $PATH'
        return false
      })),
      c: Skip(Check((v: any, u: Update, s: State) =>
        (u.val = (v ? v + ` (key=${s.key})` : undefined), true))),
      d: Skip(Check((_v: any, u: Update, _s: State) => (u.val = undefined, true)))
    })

    deepEqual(g0({ a: 3 }), { a: 6 })
    throws(() => g0({ b: 1 }), 'BAD VALUE 1 AT b')
    deepEqual(g0({ c: 'x' }), { c: 'x (key=c)' })
    deepEqual(g0({ d: 'D' }), { d: 'D' })

    let g1 = Shape(Open({
      a: Skip(Check((_v: any, u: Update, _s: State) => (u.uval = undefined, true)))
    }))

    deepEqual(g1({ a: 'A' }), { a: undefined })
    deepEqual(g1({ a: 'A', b: undefined }), { a: undefined })
  })


  test('after-multiple', () => {
    let g0 = Shape(
      After(
        function v1(v: any, u: any) { u.val = v + 1; return true },
        After(
          function v2(v: any, u: any) { u.val = v * 2; return true },
          Number
        )))
    deepEqual(g0(1), 3)
    deepEqual(g0(2), 5)
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
    throws(() => a1(['x', 'y']), 'Validation failed for index "0" with string "x" because ' +
        'the string is not of type number.')
    throws(() => a1([1, 2]), 'Validation failed for index "1" with number "2" because ' +
        'the number is not of type string.')

    let a2 = Shape([9, String])
    throws(() => a2(), 'required')
    throws(() => a2([]), 'required')
    throws(() => a2([1]), 'required')
    matchObject(a2([1, 'x']), [1, 'x'])
    throws(() => a2([1, 'x', 'y']), 'not allowed')
    throws(() => a2(['x', 1]), `Validation failed for index "0" with string "x" because the string is not of type number.
Validation failed for index "1" with number "1" because the number is not of type string.`)
    throws(() => a2(['x', 'y']), 'Validation failed for index "0" with string "x" because ' +
        'the string is not of type number.')

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


  test('context-basic', () => {
    let c0 = { max: 10 }
    let g0 = Shape({
      a: Check((v: any, _u: Update, s: State) => v < s.ctx.max)
    })
    matchObject(g0({ a: 2 }, c0), { a: 2 })
    throws(() => g0({ a: 11 }, c0), 'Validation failed for property "a" with number "11" because ' +
        'check "(v, _u, s) => v < s.ctx.max" failed.')

    let g1 = Shape({
      a: { b: All(Number, Check((v: any, _u: Update, s: State) => v < s.ctx.max)) }
    })
    matchObject(g1({ a: { b: 3 } }, c0), { a: { b: 3 } })
    throws(() => g1({ a: { b: 11 } }, c0), 'Value "11" for property "a.b" does not satisfy all of: ' +
        'Number, Check((v, _u, s) => v < s.ctx.max)')
  })


  test('error-path', () => {
    let g0 = Shape({ a: { b: String } })
    deepEqual(g0({ a: { b: 'x' } }), { a: { b: 'x' } })
    throws(() => g0(1), 'not of type object')
    throws(() => g0({ a: 1 }), 'property "a"')
    throws(() => g0({ a: { b: 1 } }), 'property "a.b"')
    throws(() => g0({ a: { b: { c: 1 } } }), 'property "a.b"')

    let g1 = Shape(String)
    deepEqual(g1('x'), 'x')
    throws(() => g1(1), 'for number ')
    throws(() => g1(true), 'for boolean ')
    throws(() => g1(null), 'for value ')
    throws(() => g1(undefined), 'for value ')
    throws(() => g1([]), 'for array ')
    throws(() => g1({}), 'for object ')
    throws(() => g1(new Date()), 'for object ')
  })


  test('error-desc', () => {
    const g0 = Shape(NaN)
    let err: any = []
    let o0 = g0(1, { err })
    deepEqual(o0, 1)
    matchObject(err, [{
      node: { t: 'nan', v: NaN, r: false, d: 0, u: {} },
      value: 1,
      path: '',
      why: 'type',
      mark: 1050,
      text: 'Validation failed for number "1" because the number is not of type nan.'
    }])

    try {
      g0(1, { a: 'A' })
    }
    catch (e: any) {
      deepEqual(e.message, 'Validation failed for number "1" because the number is not of type nan.')
      deepEqual(e.code, 'shape')
      deepEqual(e.shape, true)
      deepEqual(e.name, 'ShapeError')
      matchObject(e.desc(), {
        code: 'shape',
        ctx: { a: 'A' },
        err: [
          {
            node: { t: 'nan', v: NaN, r: false, d: 0, u: {} },
            value: 1,
            path: '',
            why: 'type',
            check: 'none',
            args: {},
            mark: 1050,
            text: 'Validation failed for number "1" because the number is not of type nan.'
          }
        ]
      })

      deepEqual(JSON.stringify(e), '{"shape":true,"name":"ShapeError","code":"shape","gname":"","props":[{"path":"","what":"type","type":"nan","value":1}],"err":[{"type":"nan","node":{"$":{"v$":"' + Pkg.version + '"},"t":"nan","v":null,"f":null,"n":0,"r":false,"p":false,"d":0,"k":[],"e":true,"u":{},"a":[],"b":[],"m":{}},"value":1,"path":"","pathArr":[],"why":"type","check":"none","args":{},"mark":1050,"text":"Validation failed for number \\"1\\" because the number is not of type nan.","use":{}}],"message":"Validation failed for number \\"1\\" because the number is not of type nan."}')
    }
  })


  test('spec-basic', () => {
    matchObject(Shape(Number).spec(), {
      $: { shape$: true, v$: Pkg.version },
      d: 0, r: true, t: 'number', u: {}, v: 0,
    })

    matchObject(Shape(String).spec(), {
      $: { shape$: true, v$: Pkg.version },
      d: 0, r: true, t: 'string', u: {}, v: '',
    })

    matchObject(Shape(BigInt).spec(), {
      $: { shape$: true, v$: Pkg.version },
      d: 0, r: true, t: 'bigint', u: {}, v: "0",
    })

    matchObject(Shape(null).spec(), {
      $: { shape$: true, v$: Pkg.version },
      d: 0, r: false, t: 'null', u: {}, v: null,
    })

  })


  test('spec-required', () => {
    let g0 = Shape(Required(1))
    matchObject(g0.spec(), { d: 0, p: false, r: true, t: 'number', v: 1 })

    let g1 = Shape(Required({ a: 1 }))
    matchObject(g1.spec(), {
      d: 0, p: false, r: true, t: 'object', v: {
        a: { d: 1, p: false, r: false, t: 'number', v: 1 }
      }
    })

    let g2 = Shape(Required({ a: Required(1) }))
    matchObject(g2.spec(), {
      d: 0, p: false, r: true, t: 'object', v: {
        a: { d: 1, p: false, r: true, t: 'number', v: 1 }
      }
    })

    let g3 = Shape(Required({ a: Required({ b: 1 }) }))
    matchObject(g3.spec(), {
      d: 0, p: false, r: true, t: 'object', v: {
        a: {
          d: 1, p: false, r: true, t: 'object', v: {
            b: {
              d: 2, p: false, r: false, t: 'number', v: 1
            }
          }
        }
      }
    })

    let g4 = Shape(Required({ a: Skip({ b: 1 }) }))
    matchObject(g4.spec(), {
      d: 0, p: false, r: true, t: 'object', v: {
        a: {
          d: 1, p: true, r: false, t: 'object', v: {
            b: {
              d: 2, p: false, r: false, t: 'number', v: 1
            }
          }
        }
      }
    })

    let g5 = Shape(Skip({ a: Required({ b: 1 }) }))
    matchObject(g5.spec(), {
      d: 0, p: true, r: false, t: 'object', v: {
        a: {
          d: 1, p: false, r: true, t: 'object', v: {
            b: {
              d: 2, p: false, r: false, t: 'number', v: 1
            }
          }
        }
      }
    })
  })


  test('spec-compose', () => {
    let f0 = (v: any) => 1 === v
    let c0 = Shape(Check(f0))
    let c1 = Shape(Skip(Check(f0)))

    // TODO
    let c2 = Shape(Skip(c0))

    matchObject(c0.spec(), {
      t: 'check',
      n: 0,
      r: true,
      p: false,
      d: 0,
      u: {},
      a: [],
      b: ['f0'],
      // s: 'f0'
    })

    matchObject(c1.spec(), {
      t: 'check',
      n: 0,
      r: false,
      p: true,
      d: 0,
      u: {},
      a: [],
      b: ['f0'],
      // s: 'f0'
    })

    matchObject(c2.spec(), {
      t: 'check',
      n: 0,
      r: false,
      p: true,
      d: 0,
      u: {},
      a: [],
      b: ['f0'],
    })
  })


  test('spec-roundtrip', () => {
    let m0 = { a: 1 }
    let g0 = Shape(m0)
    deepEqual(m0, { a: 1 })

    deepEqual(g0({ a: 2 }), { a: 2 })
    deepEqual(m0, { a: 1 })

    let s0 = g0.spec()
    deepEqual(m0, { a: 1 })
    let s0s = {
      $: {
        shape$: true,
        v$: Pkg.version,
      },
      d: 0,
      r: false,
      p: false,
      t: 'object',
      u: {},
      a: [],
      b: [],
      n: 1,
      e: true,
      k: ['a'],
      m: {},
      v: {
        a: {
          $: {
            shape$: true,
            v$: Pkg.version,
          },
          d: 1,
          e: true,
          r: false,
          k: [],
          p: false,
          t: 'number',
          u: {},
          a: [],
          b: [],
          f: 1,
          v: 1,
          n: 0,
          m: {},
        },
      },
    }

    deepEqual(s0, s0s)
    deepEqual(g0({ a: 2 }), { a: 2 })

    let g0r = Shape(s0)
    deepEqual(m0, { a: 1 })
    deepEqual(s0, s0s)

    deepEqual(g0r({ a: 2 }), { a: 2 })
    deepEqual(m0, { a: 1 })
    deepEqual(s0, s0s)

    let s0r = g0r.spec()
    deepEqual(m0, { a: 1 })
    deepEqual(s0r, s0s)
    deepEqual(s0, s0s)

    deepEqual(g0r({ a: 2 }), { a: 2 })
    deepEqual(g0({ a: 2 }), { a: 2 })
    let s0_2 = g0r.spec()
    let s0r_2 = g0r.spec()
    deepEqual(m0, { a: 1 })
    deepEqual(s0r_2, s0s)
    deepEqual(s0_2, s0s)


    let m1 = { a: [1] }
    let g1 = Shape(m1)
    deepEqual(g1({ a: [2] }), { a: [2] })
    deepEqual(m1, { a: [1] })

    let s1 = g1.spec()
    let s1s = {
      $: {
        shape$: true,
        v$: Pkg.version,
      },
      d: 0,
      r: false,
      p: false,
      t: 'object',
      u: {},
      a: [],
      b: [],
      n: 1,
      e: true,
      k: ['a'],
      m: {},
      v: {
        a: {
          $: {
            shape$: true,
            v$: Pkg.version,
          },
          d: 1,
          r: false,
          p: false,
          t: 'array',
          u: {},
          a: [],
          b: [],
          v: {},
          n: 0,
          e: true,
          k: [],
          m: {},
          c: {
            $: {
              shape$: true,
              v$: Pkg.version,
            },
            d: 2,
            r: false,
            p: false,
            t: 'number',
            u: {},
            a: [],
            b: [],
            f: 1,
            v: 1,
            n: 0,
            e: true,
            k: [],
            m: {},
          },
        },
      },
    }

    deepEqual(s1, s1s)

    let g1r = Shape(s1)
    deepEqual(g1r({ a: [2] }), { a: [2] })
    deepEqual(g1({ a: [2] }), { a: [2] })
    deepEqual(m1, { a: [1] })
    deepEqual(s1, s1s)

    let s1r = g1r.spec()
    deepEqual(g1r({ a: [2] }), { a: [2] })
    deepEqual(g1({ a: [2] }), { a: [2] })
    deepEqual(m1, { a: [1] })
    deepEqual(s1, s1s)
    deepEqual(s1r, s1s)
  })


  test('compose', () => {
    let g0 = Shape(String)
    let g1 = Shape(g0)
    let g1s = Shape(g0.spec())

    deepEqual(g1('x'), 'x')
    throws(() => g1(1))
    deepEqual(g1s('x'), 'x')
    throws(() => g1s(1))


    let g2 = Shape({ a: Number })
    let g3 = Shape({ b: g2 })
    let g3s = Shape({ b: g2.spec() })
    deepEqual(g3({ b: { a: 1 } }), { b: { a: 1 } })
    throws(() => g3({ b: { a: 'x' } }))
    deepEqual(g3s({ b: { a: 1 } }), { b: { a: 1 } })
    throws(() => g3s({ b: { a: 'x' } }))

    const shape = Shape({ a: Shape({ x: Number }) })
    deepEqual(shape({ a: { x: 1 } }), { a: { x: 1 } })


    let c0 = Shape(String)
    let c1 = Shape(Skip(String))
    let c2 = Shape(Skip(c0))

    matchObject(c1.spec(), c2.spec())
  })


  test('truncate', () => {
    deepEqual(truncate(''), '')
    deepEqual(truncate('0'), '0')
    deepEqual(truncate('01'), '01')
    deepEqual(truncate('012'), '012')
    deepEqual(truncate('0123'), '0123')
    deepEqual(truncate('01234'), '01234')
    deepEqual(truncate('012345'), '012345')
    deepEqual(truncate('0123456'), '0123456')
    deepEqual(truncate('01234567'), '01234567')
    deepEqual(truncate('012345678'), '012345678')
    deepEqual(truncate('0123456789'), '0123456789')
    deepEqual(truncate('01234567890123456789012345678'), '01234567890123456789012345678')
    deepEqual(truncate('012345678901234567890123456789'), '012345678901234567890123456789')
    deepEqual(truncate('0123456789012345678901234567890'), '012345678901234567890123456...')

    deepEqual(truncate('', 6), '')
    deepEqual(truncate('0', 6), '0')
    deepEqual(truncate('01', 6), '01')
    deepEqual(truncate('012', 6), '012')
    deepEqual(truncate('0123', 6), '0123')
    deepEqual(truncate('01234', 6), '01234')
    deepEqual(truncate('012345', 6), '012345')
    deepEqual(truncate('0123456', 6), '012...')
    deepEqual(truncate('01234567', 6), '012...')
    deepEqual(truncate('012345678', 6), '012...')
    deepEqual(truncate('0123456789', 6), '012...')

    deepEqual(truncate('', 5), '')
    deepEqual(truncate('0', 5), '0')
    deepEqual(truncate('01', 5), '01')
    deepEqual(truncate('012', 5), '012')
    deepEqual(truncate('0123', 5), '0123')
    deepEqual(truncate('01234', 5), '01234')
    deepEqual(truncate('012345', 5), '01...')
    deepEqual(truncate('0123456', 5), '01...')
    deepEqual(truncate('01234567', 5), '01...')
    deepEqual(truncate('012345678', 5), '01...')
    deepEqual(truncate('0123456789', 5), '01...')

    deepEqual(truncate('', 4), '')
    deepEqual(truncate('0', 4), '0')
    deepEqual(truncate('01', 4), '01')
    deepEqual(truncate('012', 4), '012')
    deepEqual(truncate('0123', 4), '0123')
    deepEqual(truncate('01234', 4), '0...')
    deepEqual(truncate('012345', 4), '0...')
    deepEqual(truncate('0123456', 4), '0...')
    deepEqual(truncate('01234567', 4), '0...')
    deepEqual(truncate('012345678', 4), '0...')
    deepEqual(truncate('0123456789', 4), '0...')

    deepEqual(truncate('', 3), '')
    deepEqual(truncate('0', 3), '0')
    deepEqual(truncate('01', 3), '01')
    deepEqual(truncate('012', 3), '012')
    deepEqual(truncate('0123', 3), '...')
    deepEqual(truncate('01234', 3), '...')
    deepEqual(truncate('012345', 3), '...')
    deepEqual(truncate('0123456', 3), '...')
    deepEqual(truncate('01234567', 3), '...')
    deepEqual(truncate('012345678', 3), '...')
    deepEqual(truncate('0123456789', 3), '...')

    deepEqual(truncate('', 2), '')
    deepEqual(truncate('0', 2), '0')
    deepEqual(truncate('01', 2), '01')
    deepEqual(truncate('012', 2), '..')
    deepEqual(truncate('0123', 2), '..')
    deepEqual(truncate('01234', 2), '..')
    deepEqual(truncate('012345', 2), '..')
    deepEqual(truncate('0123456', 2), '..')
    deepEqual(truncate('01234567', 2), '..')
    deepEqual(truncate('012345678', 2), '..')
    deepEqual(truncate('0123456789', 2), '..')

    deepEqual(truncate('', 1), '')
    deepEqual(truncate('0', 1), '0')
    deepEqual(truncate('01', 1), '.')
    deepEqual(truncate('012', 1), '.')
    deepEqual(truncate('0123', 1), '.')
    deepEqual(truncate('01234', 1), '.')
    deepEqual(truncate('012345', 1), '.')
    deepEqual(truncate('0123456', 1), '.')
    deepEqual(truncate('01234567', 1), '.')
    deepEqual(truncate('012345678', 1), '.')
    deepEqual(truncate('0123456789', 1), '.')

    deepEqual(truncate('', 0), '')
    deepEqual(truncate('0', 0), '')
    deepEqual(truncate('01', 0), '')
    deepEqual(truncate('012', 0), '')
    deepEqual(truncate('0123', 0), '')
    deepEqual(truncate('01234', 0), '')
    deepEqual(truncate('012345', 0), '')
    deepEqual(truncate('0123456', 0), '')
    deepEqual(truncate('01234567', 0), '')
    deepEqual(truncate('012345678', 0), '')
    deepEqual(truncate('0123456789', 0), '')

    deepEqual(truncate('', -1), '')
    deepEqual(truncate('0', -1), '')
    deepEqual(truncate('01', -1), '')
    deepEqual(truncate('012', -1), '')
    deepEqual(truncate('0123', -1), '')
    deepEqual(truncate('01234', -1), '')
    deepEqual(truncate('012345', -1), '')
    deepEqual(truncate('0123456', -1), '')
    deepEqual(truncate('01234567', -1), '')
    deepEqual(truncate('012345678', -1), '')
    deepEqual(truncate('0123456789', -1), '')

    deepEqual(truncate((NaN as unknown as string), 5), 'NaN')
    deepEqual(truncate((null as unknown as string), 5), '')
    deepEqual(truncate((undefined as unknown as string), 5), '')
  })


  test('stringify', () => {
    deepEqual(stringify({ a: 1 }), '{"a":1}')

    deepEqual(stringify({ a: Number }), '{"a":"Number"}')
    deepEqual(stringify({ a: String }), '{"a":"String"}')
    deepEqual(stringify({ a: Boolean }), '{"a":"Boolean"}')

    deepEqual(stringify(Shape({ a: Number }).spec()), '{"a":"Number"}')
    deepEqual(stringify(Shape({ a: String }).spec()), '{"a":"String"}')
    deepEqual(stringify(Shape({ a: Boolean }).spec()), '{"a":"Boolean"}')

    deepEqual(stringify(Required()), `"Required"`)

    let c0: any = {}
    c0.x = c0
    deepEqual(stringify(c0), '"[object Object]"')

    function f0() { }
    class C0 { }
    deepEqual(stringify([1, f0, () => true, C0]), '[1,"f0","() => true","C0"]')

    deepEqual(stringify(/a/), '"/a/"')
  })


  test('nodize', () => {
    matchObject(nodize(1), {
      a: [],
      b: [],
      d: -1,
      n: 0,
      p: false,
      r: false,
      t: "number",
      u: {},
      v: 1,
    })

  })


  test('G-basic', () => {
    matchObject(G$({ v: 11 }), {
      '$': { v$: Pkg.version },
      t: 'number',
      v: 11,
      r: false,
      p: false,
      d: -1,
      a: [],
      b: [],
      u: {}
    })

    matchObject(G$({ v: Number }), {
      '$': { v$: Pkg.version },
      t: 'number',
      v: 0,
      r: false,
      p: false,
      d: -1,
      a: [],
      b: [],
      u: {}
    })

    matchObject(G$({ v: BigInt(11) }), {
      '$': { v$: Pkg.version },
      t: 'bigint',
      v: BigInt(11),
      r: false,
      p: false,
      d: -1,
      a: [],
      b: [],
      u: {}
    })

    let s0 = Symbol('foo')
    matchObject(G$({ v: s0 }), {
      '$': { v$: Pkg.version },
      t: 'symbol',
      v: s0,
      r: false,
      p: false,
      d: -1,
      a: [],
      b: [],
      u: {}
    })

    // NOTE: special case for plain functions.
    // Normally functions become custom validations.
    let f0 = () => true

    matchObject(G$({ v: f0 }), {
      '$': { v$: Pkg.version },
      t: 'function',
      v: f0,
      r: false,
      p: false,
      d: -1,
      a: [],
      b: [],
      u: {}
    })
  })


  test('just-large', () => {
    let m0: any = Large.m0
    let g0 = Shape(m0)
    let o0 = g0(Large.i0)
    deepEqual(o0, Large.c0)

    let m1 = Large.m1
    let g1 = Shape(m1)
    let o1 = g1(Large.i1)
    deepEqual(o1, Large.c1)
  })


  test('just-long', () => {
    deepEqual(Shape(Long.m0)(Long.i0), Long.i0)
    deepEqual(Shape(Long.m1)(Long.i1), Long.i1)
  })


  test('even-larger', () => {
    const size = 11111

    let m0: any = {}
    let c0 = m0
    for (let i = 0; i < size; i++) {
      c0 = c0.a = {}
    }
    let g0 = Shape(m0)
    deepEqual(g0(m0), m0)

    let m1: any = []
    let c1 = m1
    for (let i = 0; i < size; i++) {
      c1 = c1[0] = []
    }
    let g1 = Shape(m1)
    deepEqual(g1(m1), m1)
  })


  test('even-longer', () => {
    let m0: any = {}
    for (let i = 0; i < 11111; i++) {
      m0['a' + i] = true
    }
    let g0 = Shape(m0)
    deepEqual(g0(m0), m0)

    let m1: any = {}
    for (let i = 0; i < 11111; i++) {
      m1[i] = true
    }
    let g1 = Shape(m1)
    deepEqual(g1(m1), m1)
  })


  // Test compat with https://github.com/rjrodger/optioner
  test('legacy-optioner-compat', () => {

    // TODO:
    // * verbatim arrays - maybe use Exact?
    // * option: treat null same as undefined
    // * option: treat functon as raw default value
    // ** thus need a builder for validation functions
    // ** and a builder for raw functions
    // * Do Array, Object work?
    // * default value within One, Some, etc

    // 'happy'
    let opter = Shape({
      a: 1,
      b: { c: 2 },
      d: { e: { f: 3 } },
      g: null,
      h: 4,
      i: [5, 6],
      j: Closed([{ k: 7 }]),
    })

    deepEqual(opter(), {
      a: 1,
      b: { c: 2 },
      d: { e: { f: 3 } },
      g: null,
      h: 4,
      i: [5, 6],
      j: [{ k: 7 }],
    })


    // 'empty'
    opter = Shape({ a: 1 })
    deepEqual(opter(undefined), { a: 1 })
    // TODO: OPT: deepEqual(opter(null), { a: 1 })


    // 'array'
    opter = Shape([1, 'a'])

    throws(() => opter({}), 'not of type array')
    deepEqual(opter([]), [1, 'a'])
    deepEqual(opter([1]), [1, 'a'])


    let fx = function f(x: any) {
      return x + 1
    }

    opter = Shape({
      a: G$({ v: fx, f: fx })
    })

    let o0: any = opter({})
    deepEqual(o0.a(1), 2)

    let o1: any = opter({
      a: function(x: any) {
        return x + 2
      }
    })

    deepEqual(o1.a(1), 3)


    // 'edge'
    opter = Shape({
      a: undefined,
    })
    deepEqual(opter({}), {})


    // 'default-types'
    opter = Shape({
      a: 1,
      b: 1.1,
      c: 'x',
      d: true,
    })

    deepEqual(opter({ a: 2, b: 2.2, c: 'y', d: false }), { a: 2, b: 2.2, c: 'y', d: false })

    // TODO: SHAPE: Integer
    // throws(() => opter({ a: 3.3 }), 'integer')

    deepEqual(opter({ b: 4 }), { a: 1, b: 4, c: 'x', d: true })
    throws(() => opter({ b: 'z' }), 'number')
    throws(() => opter({ c: 1 }), 'string')
    throws(() => opter({ d: 'q' }), 'boolean')


    // 'readme'
    let optioner = Shape({
      color: 'red',
      // size: Joi.number().integer().max(5).min(1).default(3),
      size: Max(5, Min(1, 3)),
      range: [100, 200],
    })

    deepEqual(optioner({ size: 2 }), { color: 'red', size: 2, range: [100, 200] })
    deepEqual(optioner({}), { color: 'red', size: 3, range: [100, 200] })
    deepEqual(optioner({ range: [50] }), { range: [50, 200], color: 'red', size: 3 })
    throws(() => optioner({ size: 6 }), 'maximum')


    // 'check'
    optioner = Shape({
      bool: true
    })

    deepEqual(optioner({}), { bool: true })
    deepEqual(optioner({ bool: true }), { bool: true })
    deepEqual(optioner({ bool: false }), { bool: false })

    try {
      optioner({ bool: 'foo' })
      throw new Error('fail')
    } catch (e: any) {
      assert.match(e.name, /ShapeError/)
    }


    // 'ignore'
    let optioner_ignore = Shape(Open({
      a: 1,
    }))

    deepEqual(optioner_ignore({}), { a: 1 })
    deepEqual(optioner_ignore({ b: 2 }), { a: 1, b: 2 })
    deepEqual(optioner_ignore({ a: 1, b: 2 }), { a: 1, b: 2 })

    let optioner_fail = Shape(
      Closed({
        a: 1,
      })
    )

    deepEqual(optioner_fail({}), { a: 1 })

    try {
      optioner_fail({ a: 1, b: 2 })
      throw new Error('fail')
    } catch (e: any) {
      assert.match(e.name, /ShapeError/)
    }

    let optioner_ignore_deep = Shape(Open({
      a: 1,
      b: Open({ c: 2 }),
    }))

    deepEqual(optioner_ignore_deep({}), { a: 1, b: { c: 2 } })
    deepEqual(optioner_ignore_deep({ b: { d: 3 } }), {
      a: 1,
      b: { c: 2, d: 3 },
    })

    let optioner_ignore_deep_fail = Shape(
      {
        a: 1,
        b: Closed({ c: 2 }),
      },
    )

    deepEqual(optioner_ignore_deep_fail({}), { a: 1, b: { c: 2 } })

    try {
      deepEqual(optioner_ignore_deep_fail({ b: { d: 3 } }), {
        a: 1,
        b: { c: 2, d: 3 },
      })
      throw new Error('fail')
    } catch (e: any) {
      assert.match(e.name, /ShapeError/)
    }


    // 'must_match'
    let g0 = Shape(
      {
        a: Exact(1),
      },
    )

    deepEqual(g0({ a: 1 }), { a: 1 })
    throws(() => g0({ a: 1, b: 2 }), 'not allowed')

    throws(() => g0({}), 'exactly')
    throws(() => g0({ a: 2 }), 'exactly')
    throws(() => g0({ a: 'x' }), 'exactly')


    let g1 = Shape(
      Open({
        a: Exact(1),
        b: Open({ c: Exact(2) }),
      }),
    )

    deepEqual(g1({ a: 1, b: { c: 2 } }), { a: 1, b: { c: 2 } })

    deepEqual(g1({ a: 1, b: { c: 2, z: 3 }, y: 4 }), {
      a: 1,
      b: { c: 2, z: 3 },
      y: 4,
    })

    throws(() => g1({ a: 1 }), 'exactly')
    throws(() => g1({ a: 1, b: {} }), 'exactly')
    throws(() => g1({ a: 1, b: { c: 'x' } }), 'exactly')


    let g2 = Shape(
      {
        a: Exact(1),
        b: String
      },
    )

    deepEqual(g2({ a: 1, b: 'x' }), { a: 1, b: 'x' })
    throws(() => g2({ a: 1, b: 2 }), 'type')

    var g3 = Shape(
      {
        a: { b: { c: Exact(1) } },
      },
    )

    deepEqual(g3({ a: { b: { c: 1 } } }), { a: { b: { c: 1 } } })
    throws(() => g3({ a: { b: { c: 2 } } }), 'exactly')

    // TODO: fix
    // var g4 = Shape(
    //   {
    //     a: [Exact(1)],
    //   },
    // )

    // deepEqual(g4({ a: [1] }), { a: [1] })
    // deepEqual(g4({ a: [1, 2] }), { a: [1, 2] })
    // throws(() => g4({ a: [2] }), 'exactly')

    // var g5 = Shape(
    //   {
    //     a: [Any(), { b: Exact(1) }],
    //   },
    // )

    // deepEqual(g5({ a: [{ b: 1 }] }), { a: [{ b: 1 }] })
    // deepEqual(g5({ a: [{ b: 1, c: 2 }, { b: 3 }] }), {
    //   a: [{ b: 1, c: 2 }, { b: 3 }],
    // })
    // throws(() => g5({ a: [{ b: 11, c: 2 }, { b: 3 }] }), 'exactly')

    // var g6 = Shape([Never(), Exact(1)])
    // deepEqual(g6([1]), [1])
    // throws(() => g6([2]), 'exactly')

    var g7 = Shape([{}, { a: Exact(2) }, {}])
    deepEqual(g7([{ a: 1 }, { a: 2 }, { a: 3 }]), [
      { a: 1 },
      { a: 2 },
      { a: 3 },
    ])
    throws(() => g7([{ a: 1 }, { a: 3 }]), 'exactly')


    // 'empty-string'
    let opt0 = Shape({
      a: '',
      b: 'x',
    })

    let res0 = opt0({ a: 'x' })
    deepEqual(res0, { a: 'x', b: 'x' })

    let res1 = opt0({ a: '' })
    deepEqual(res1, { a: '', b: 'x' })
  })


  test('skip-vs-any', () => {
    let a0 = Shape({ x: Any() })
    let s0 = Shape({ x: Skip() })
    deepEqual(a0(), {})
    deepEqual(s0(), {})
    deepEqual(a0({}), {})
    deepEqual(s0({}), {})
    deepEqual(a0({ x: 1 }), { x: 1 })
    deepEqual(s0({ x: 1 }), { x: 1 })
    deepEqual(a0({ x: undefined }), { x: undefined })
    deepEqual(s0({ x: undefined }), { x: undefined })

    let a1 = Shape({ x: Required().Any() })
    let s1 = Shape({ x: Required().Skip() })
    throws(() => a1(), 'required')
    deepEqual(s1(), {})
    throws(() => a1({}), 'required')
    deepEqual(s1({}), {})
    deepEqual(a1({ x: 1 }), { x: 1 })
    deepEqual(s1({ x: 1 }), { x: 1 })
    throws(() => a1({ x: undefined }), 'required')
    deepEqual(s1({ x: undefined }), { x: undefined })
  })


  test('non-value-fails', () => {
    let g0 = Shape({ x: Number })
    throws(() => g0({ x: null }), 'Validation failed for property "x" with value "null" because the value is not of type number.')
    throws(() => g0({ x: undefined }), 'Validation failed for property "x" with value "undefined" because the value is required.')
    throws(() => g0({ x: NaN }), 'Validation failed for property "x" with value "NaN" because the value is not of type number.')
    throws(() => g0({}), 'Validation failed for property "x" with value "undefined" because the value is required.')
    throws(() => g0({ x: '' }), 'Validation failed for property "x" with string "" because the string is not of type number.')
  })


  test('frozen', () => {
    let g0 = Shape({ x: Object })
    deepEqual(g0({ x: { y: 1 } }), { x: { y: 1 } })
    deepEqual(g0({ x: Object.freeze({ y: 1 }) }), { x: { y: 1 } })
  })


  test('context-skipping', () => {
    let g0 = Shape({
      a: Number,
      b: Skip(Boolean),
    })

    deepEqual(g0({ a: 1 }), { a: 1 })
    deepEqual(g0({ a: 1, b: true }), { a: 1, b: true })
    throws(() => g0({ a: 1, b: true, c: 'C' }), 'not allowed')

    let g1 = Shape(Open(g0))

    deepEqual(g1({ a: 1 }), { a: 1 })
    deepEqual(g1({ a: 1, b: true }), { a: 1, b: true })
    deepEqual(g1({ a: 1, b: true, c: 'C' }), { a: 1, b: true, c: 'C' })

    deepEqual(g1({}, { skip: { depth: 1 } }), {})
    deepEqual(g1({ a: 1 }, { skip: { depth: 1 } }), { a: 1 })
    deepEqual(g1({ a: 1, b: true }, { skip: { depth: 1 } }), { a: 1, b: true })
    deepEqual(g1({ a: 1, b: true, c: 'C' }, { skip: { depth: 1 } }), { a: 1, b: true, c: 'C' })

    deepEqual(g1({}, { skip: { depth: [1] } }), {})
    deepEqual(g1({ a: 1 }, { skip: { depth: [1] } }), { a: 1 })
    deepEqual(g1({ a: 1, b: true }, { skip: { depth: [1] } }), { a: 1, b: true })
    deepEqual(g1({ a: 1, b: true, c: 'C' }, { skip: { depth: [1] } }), { a: 1, b: true, c: 'C' })

    deepEqual(g1({}, { skip: { keys: ['a'] } }), {})
    deepEqual(g1({ a: 1 }, { skip: { keys: ['a'] } }), { a: 1 })
    deepEqual(g1({ a: 1, b: true }, { skip: { keys: ['a'] } }), { a: 1, b: true })
    deepEqual(g1({ a: 1, b: true, c: 'C' }, { skip: { keys: ['a'] } }), { a: 1, b: true, c: 'C' })


    let g2 = Shape({
      a: Number,
      b: { a: Boolean }
    })

    deepEqual(g2({ b: { a: true } }, { skip: { keys: ['a'] } }), { b: { a: true } })
    deepEqual(g2({ a: 1, b: { a: true } }, { skip: { keys: ['a'] } }), { a: 1, b: { a: true } })
    throws(() => g2({ a: 1, b: {} }, { skip: { keys: ['a'] } }), 'required')

  })


  test('array-regexp', () => {
    let g0 = Shape({ x: [/a/] })
    deepEqual(g0.jsonify(), { x: ['/a/'] })
    deepEqual(g0.stringify(), '{"x":["/a/"]}')
    deepEqual(g0({ x: [] }), { x: [] })
    deepEqual(g0({ x: ['a'] }), { x: ['a'] })
    deepEqual(g0({ x: ['ba', 'ac', 'dad'] }), { x: ['ba', 'ac', 'dad'] })
    throws(() => g0({ x: ['q'] }), 'string did not match /a/')
    let g0r = Shape.build(g0.jsonify())
    deepEqual(g0r.stringify(), '{"x":["/a/"]}')
    deepEqual(g0r({ x: [] }), { x: [] })
    deepEqual(g0r({ x: ['a'] }), { x: ['a'] })
    deepEqual(g0r({ x: ['ba', 'ac', 'dad'] }), { x: ['ba', 'ac', 'dad'] })
    throws(() => g0r({ x: ['q'] }), 'string did not match /a/')
  })
})


export {
  Foo,
  Bar,
}

export type {
  Zed,
}

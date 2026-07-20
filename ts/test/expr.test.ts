/* Copyright (c) 2021-2024 Richard Rodger and other contributors, MIT License */

import { describe, test } from 'node:test'
import assert from 'node:assert'
import { deepEqual, matchObject, throws } from './test-utils'

const JP = JSON.parse



import { Shape as ShapeX } from '../dist/shape'


// Handle web (Shape) versus node ({Shape}) export.
let ShapeModule = require('../dist/shape')

if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}


const Shape: ShapeX = ShapeModule

const {
  Child,
  Min,
  Max,
  Required,
  Default,
  Above,
  Below,
  One,
  Some,
  All,
  expr,
  build,
} = Shape


const D = (x: any) => console.dir(x, { depth: null })



describe('expr', () => {

  test('meta-basic', () => {
    let g0 = Shape({
      'x$$': { foo: 99 },
      x: 1
    }, { meta: { active: true } })

    deepEqual(g0.spec().v.x.m, { short: '', foo: 99 })
  })


  test('expr-direct', () => {
    const p0 = expr({ src: 'String' })
    matchObject(p0, { t: 'string', r: true })

    throws(() => expr({ src: 'Bad' }), 'unexpected token Bad')

    const p1 = expr({ src: 'Max(2,String)' })
    deepEqual(p1.t, 'string')
    deepEqual(p1.b.map((f: any) => f.s()).join('.'), 'Max(2)')
  })


  test('expr-active', () => {
    let g0 = Shape({
      'x: Min(1)': 1
    })
    throws(() => g0({ x: 0 }), 'minimum')

    let g1 = Shape({
      'x: Min(1)': 1
    }, { keyexpr: { active: false } })
    deepEqual(g1({}), { 'x: Min(1)': 1 })
  })


  test('expr-basic', () => {
    let g0 = Shape({
      // 'x: Open': {
      x: {
        y: 1
      }
    })// , { keyexpr: { active: true } })
    // console.log(g0({ x: { y: 2, z: 'Z' } }))
    // deepEqual(g0({ x: { y: 2, z: 'Z' } }), { x: { y: 2, z: 'Z' } })
    throws(() => g0({ x: { y: 'q' } }), "Validation failed for property \"x.y\" with string \"q\" because the string is not of type number.")


    let g1 = Shape({
      'x:Min(1 Max(4))': 2,
      'y:Min(1) Max(4)': 2,
      'z:Min(1).Max(4)': 2,
    }, { keyexpr: { active: true } })

    deepEqual(g1({ x: 3 }), { x: 3, y: 2, z: 2 })
    deepEqual(g1({ y: 3 }), { x: 2, y: 3, z: 2 })
    deepEqual(g1({ z: 3 }), { x: 2, y: 2, z: 3 })

    throws(() => g1({ x: 0 }), 'Value "0" for property "x" must be a minimum of 1 (was 0)')
    throws(() => g1({ x: 5 }), 'Value "5" for property "x" must be a maximum of 4 (was 5)')

    throws(() => g1({ y: 0 }), 'Value "0" for property "y" must be a minimum of 1 (was 0)')

    throws(() => g1({ y: 5 }), 'Value "5" for property "y" must be a maximum of 4 (was 5)')

    throws(() => g1({ z: 0 }), 'Value "0" for property "z" must be a minimum of 1 (was 0)')
    // TODO: FIX: this msg is doubled
    throws(() => g1({ z: 5 }), 'Value "5" for property "z" must be a maximum of 4 (was 5)')

  })


  test('expr-syntax', () => {
    let GE = (exp: string, val: any) =>
      Shape({ ['x:' + exp]: val })

    throws(() => GE('BadBuilder', 1), 'Shape: unexpected token BadBuilder in builder expression BadBuilder')

    deepEqual(GE('1', 2)({ x: 3 }), { x: 3 })
    deepEqual(GE('1', 2)({ x: 1 }), { x: 1 })
  })


  test('expr-regexp', () => {
    let g0 = Shape({
      'x: Check(/a/)': String,
    }, { keyexpr: { active: true } })

    deepEqual(g0({ x: 'zaz' }), { x: 'zaz' })
    throws(() => g0({ x: 'zbz' }), 'check "/a/" failed')
  })


  test('expr-object-open', () => {
    let g0 = Shape({
      'a: Open': { x: 1, y: 'q' }
    })
    deepEqual(g0({ a: { z: true } }), { a: { x: 1, y: 'q', z: true } })
    throws(() => g0({ a: { x: 'q' } }), 'not of type number')

    let g1 = Shape({
      a: { b: { c: { 'd: Open': { x: 1 } } } }
    })
    deepEqual(g1({ a: { b: { c: { d: { y: 2 } } } } }), { a: { b: { c: { d: { x: 1, y: 2 } } } } })
    throws(() => g1({ a: { b: { c: { d: { x: 'q' } } } } }), 'not of type number')

    let g2 = Shape({
      'a: Child(Number)': { x: 'q' }
    })
    deepEqual(g2({ a: { z: 1 } }), { a: { x: 'q', z: 1 } })
    throws(() => g2({ a: { z: 'q' } }), 'not of type number')

  })


  test('expr-object-basic', () => {
    let g0 = Shape({
      a: Child(Number, {})
    })

    deepEqual(g0({ a: { x: 1 } }), { a: { x: 1 } })
    throws(() => g0({ a: { x: 'q' } }), 'not of type number')

    let g1 = Shape({
      'a: Child(Number)': {}
    })

    // console.log(g1({ a: { x: 1 } }))
    deepEqual(g1({ a: { x: 1 } }), { a: { x: 1 } })
    throws(() => g1({ a: { x: 'q' } }), 'not of type number')
  })


  test('expr-array', () => {
    let g0 = Shape({
      a: Child(Number, [])
    })
    deepEqual(g0({ a: [1, 2] }), { a: [1, 2] })
    throws(() => g0({ a: [1, 'x'] }), 'not of type number')

    let g1 = Shape({
      'a: Child(Number)': []
    })
    deepEqual(g1({ a: [1, 2] }), { a: [1, 2] })
    throws(() => g1({ a: [1, 'x'] }), 'not of type number')
  })


  test('expr-child', () => {
    let g0 = Shape.build('Child(Number)')
    deepEqual(g0.stringify(), 'Child(Number)')
    deepEqual(g0({ a: 1, b: 2 }), { a: 1, b: 2 })
    throws(() => g0({ c: 'C' }), 'not of type number')

    let g0d = Shape(Child(Number))
    deepEqual(g0d.stringify(), 'Child(Number)')
    deepEqual(g0d({ a: 1, b: 2 }), { a: 1, b: 2 })
    throws(() => g0d({ c: 'C' }), 'not of type number')

    let g1 = Shape.build({ a: 'Child(Number)' })
    deepEqual(g1.stringify(), '{"a":"Child(Number)"}')
    deepEqual(g1({ a: { b: 2 } }), { a: { b: 2 } })
    throws(() => g1({ a: { c: 'C' } }), 'not of type number')

    let g2 = Shape.build(['Child(Number)'])
    deepEqual(g2.stringify(), '["Child(Number)"]')
    deepEqual(g2([{ b: 2 }]), [{ b: 2 }])
    throws(() => g2([{ c: 'C' }]), 'not of type number')

    let g3 = Shape.build({ 'a:Child(Number)': undefined })
    // console.dir(g3.spec(), { depth: null })
    deepEqual(g3.stringify(), '{"a":"Child(Number)"}')
    deepEqual(g3({ a: { b: 2 } }), { a: { b: 2 } })
    throws(() => g3({ a: { c: 'C' } }), 'not of type number')

  })


  test('desc-call-order', () => {
    let g = Shape({ a: Min(1) })
    deepEqual(g({ a: 1 }), { a: 1 })
    // let gs = g.stringify(null, true)
    let gs = g.stringify()
    deepEqual(gs, '{"a":"Min(1)"}')
    let gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: 'Min(1)' })

    g = Shape({ a: Max(1) })
    deepEqual(g({ a: 1 }), { a: 1 })
    gs = g.stringify()
    deepEqual(gs, '{"a":"Max(1)"}')
    gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: 'Max(1)' })

    g = Shape({ a: Min(1, Max(3)) })
    deepEqual(g({ a: 2 }), { a: 2 })
    gs = g.stringify()
    deepEqual(gs, '{"a":"Max(3).Min(1)"}')
    gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: 'Max(3).Min(1)' })

    g = Shape({ a: Max(3, Min(1)) })
    deepEqual(g({ a: 2 }), { a: 2 })
    gs = g.stringify()
    // console.log(gs)
    deepEqual(gs, '{"a":"Min(1).Max(3)"}')
    gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: 'Min(1).Max(3)' })

    g = Shape({ a: Required(Max(3, Min(1))) })
    deepEqual(g({ a: 2 }), { a: 2 })
    gs = g.stringify()
    // console.log(gs)
    deepEqual(gs, '{"a":"Required.Min(1).Max(3)"}')
    gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: 'Required.Min(1).Max(3)' })

    g = Shape({ a: Max(3, Min(1, Required())) })
    deepEqual(g({ a: 2 }), { a: 2 })
    gs = g.stringify()
    // console.log(gs)
    deepEqual(gs, '{"a":"Required.Min(1).Max(3)"}')
    gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: 'Required.Min(1).Max(3)' })

    g = Shape({ a: Max(3, Min(1, Default(2))) })
    deepEqual(g({ a: 2 }), { a: 2 })
    deepEqual(g({}), { a: 2 })
    gs = g.stringify()
    // console.log(gs)
    deepEqual(gs, '{"a":"2.Min(1).Max(3)"}')
    gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: '2.Min(1).Max(3)' })

    g = Shape({ a: Max(3, Min(1, Default(2, Required()))) })
    deepEqual(g({ a: 2 }), { a: 2 })
    deepEqual(g({}), { a: 2 })
    gs = g.stringify()
    deepEqual(gs, '{"a":"2.Min(1).Max(3)"}')
    gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: '2.Min(1).Max(3)' })

    g = Shape({ a: Max(3, Min(1, Required(Default(2)))) })
    deepEqual(g({ a: 2 }), { a: 2 })
    gs = g.stringify()
    deepEqual(gs, '{"a":"Number.Min(1).Max(3)"}')
    gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: 'Number.Min(1).Max(3)' })
  })


  test('expr-type', () => {
    let g = Shape({ a: Number })
    deepEqual(g({ a: 1 }), { a: 1 })
    let gs = g.stringify()
    deepEqual(gs, '{"a":"Number"}')
    let gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: 'Number' })
  })


  test('expr-list', () => {
    let g = Shape({ a: One(Number, String) })
    deepEqual(g({ a: 1 }), { a: 1 })
    let gs = g.stringify()
    deepEqual(gs, '{"a":"One(Number,String)"}')
    let gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: 'One(Number,String)' })

    g = Shape({ a: All(Number, 1) })
    deepEqual(g({ a: 1 }), { a: 1 })
    gs = g.stringify()
    deepEqual(gs, '{"a":"All(Number,1)"}')
    gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: 'All(Number,1)' })

    g = Shape({ a: Some(Number, String) })
    deepEqual(g({ a: 1 }), { a: 1 })
    gs = g.stringify()
    deepEqual(gs, '{"a":"Some(Number,String)"}')
    gr = Shape.build(JP(gs))
    deepEqual(gr.jsonify(), { a: 'Some(Number,String)' })

    let listBuilders = [One, All, Some]
    for (let lb of listBuilders) {
      g = Shape({ a: lb({ x: Number }, [String]) })
      if (One === lb || Some === lb) {
        deepEqual(g({ a: { x: 1 } }), { a: { x: 1 } })
        deepEqual(g({ a: ['A', 'B'] }), { a: ['A', 'B'] })
      }

      gs = g.stringify()
      deepEqual(gs, '{"a":{"$$":"' + lb.name + '($$ref0,$$ref1)",' +
        '"$$ref0":{"x":"Number"},"$$ref1":["String"]}}')
      gr = Shape.build(JP(gs))

      if (One === lb || Some === lb) {
        deepEqual(gr({ a: { x: 1 } }), { a: { x: 1 } })
        deepEqual(gr({ a: ['A', 'B'] }), { a: ['A', 'B'] })
      }

      deepEqual(gr.jsonify(), {
        a: {
          "$$": lb.name + "($$ref0,$$ref1)",
          "$$ref0": {
            "x": "Number",
          },
          "$$ref1": [
            "String",
          ],
        }
      })
    }
  })


  test('expr-define', () => {
    const g0 = build('"Min(1)"')
    deepEqual(g0.jsonify(), '"Min(1)"')
    deepEqual(g0.stringify(), 'Min(1)')

    const g1 = build('Min(1).Max(3)')
    deepEqual(g1.stringify(), 'Min(1).Max(3)')

    const g2 = build({ a: 'Min(1)' })
    deepEqual(g2.stringify(), '{"a":"Min(1)"}')

    const g3 = build({ a: 'String().Min(1)' })
    deepEqual(g3.stringify(), '{"a":"String.Min(1)"}')

    const g3a = build({ a: 'String.Min(1)' })
    deepEqual(g3a.stringify(), '{"a":"String.Min(1)"}')

    const g3b = build({ a: 'Min(1).String()' })
    deepEqual(g3b.stringify(), '{"a":"String.Min(1)"}')

    const g3c = build({ a: 'Min(1).String' })
    deepEqual(g3c.stringify(), '{"a":"String.Min(1)"}')

    const g4 = build(['String().Min(1)'])
    deepEqual(g4.stringify(), '["String.Min(1)"]')

    const g5 = build(['String.Min(1)'])
    deepEqual(g5.stringify(), '["String.Min(1)"]')
  })


  test('desc-basic', () => {
    function pass(shape: any, json: any, str: string, pass: any, fail: any) {
      let g0 = Shape(shape)
      let j0 = g0.jsonify()
      deepEqual(j0, json)
      let s0 = g0.stringify()
      deepEqual(s0, str)
      let b0 = Shape.build(j0)
      deepEqual(b0.stringify(), s0)
      deepEqual(b0(pass), pass)
      throws(() => b0(fail))
    }

    pass({ a: 1 }, { a: "1" }, '{"a":"1"}', { a: 2 }, { a: 'A' })
    pass({ a: Number }, { a: "Number" }, '{"a":"Number"}', { a: 2 }, { a: 'A' })
    pass({ a: Min(1, Number) }, { a: "Number.Min(1)" }, '{"a":"Number.Min(1)"}',
      { a: 2 }, { a: 0 })
    pass({ a: Min(1, 2) }, { a: "2.Min(1)" }, '{"a":"2.Min(1)"}', { a: 3 }, { a: 0 })
    pass({ a: Min(1, Max(3, 2)) }, { a: "2.Max(3).Min(1)" }, '{"a":"2.Max(3).Min(1)"}',
      { a: 3 }, { a: 4 })
    pass({ a: Max(2, Number) }, { a: "Number.Max(2)" }, '{"a":"Number.Max(2)"}',
      { a: 2 }, { a: 3 })

    pass({ a: Child(Number) }, { a: "Child(Number)" }, '{"a":"Child(Number)"}',
      { a: { x: 1 } }, { a: { x: 'X' } })

    pass({ a: One(Number, String) }, { a: "One(Number,String)" }, '{"a":"One(Number,String)"}',
      { a: 1 }, { a: true })
    pass({ a: One(Number, { x: String }) },
      { a: { $$: 'One(Number,$$ref0)', $$ref0: { x: 'String' } } },
      '{"a":{"$$":"One(Number,$$ref0)","$$ref0":{"x":"String"}}}',
      { a: { x: 'X' } }, { a: { x: 1 } })



  })


  test('desc-child', () => {
    let d0 = { a: { '$$': 'Child($$child)', '$$child': { x: Number } } }
    let g0 = Shape(d0, { valexpr: { active: true } })
    //let g0 = Shape({ a: Child({ x: Number }) })
    //console.dir(g0.spec(), { depth: null })

    let v0 = g0({ a: { b: { x: 1 } } })
    deepEqual(v0, { a: { b: { x: 1 } } })
    throws(() => g0({ a: { b: { x: 'B' } } }), 'not of type number')

    let j0 = g0.jsonify()
    deepEqual(j0, { a: { '$$': 'Child($$child)', '$$child': { x: 'Number' } } })


    let b0 = Shape.build(j0)
    // console.dir(b0.spec(), { depth: null })

    let bv0 = b0({ a: { b: { x: 1 } } })
    deepEqual(bv0, { a: { b: { x: 1 } } })
    deepEqual(b0.stringify(), '{"a":{"$$":"Child($$child)","$$child":{"x":"Number"}}}')
  })


  test('desc-list', () => {
    deepEqual(Shape({ a: One(Number, String) }).stringify(), '{"a":"One(Number,String)"}')
    deepEqual(Shape({ a: Some(Number, String) }).stringify(), '{"a":"Some(Number,String)"}')
    deepEqual(Shape({ a: All(Number, String) }).stringify(), '{"a":"All(Number,String)"}')
  })


  test('build-opts', () => {
    let g0 = Shape.build({ a: 1 }, { name: 'foo' })
    deepEqual('' + g0, '[Shape foo {"a":"1"}]')
    throws(() => g0({ a: 'A' }), 'foo: Validation failed for property "a" with string "A" because ' +
        'the string is not of type number.')
  })


  test('desc-number', () => {
    let g0 = Shape({ x: Number })
    deepEqual(g0.stringify(), '{"x":"Number"}')
    deepEqual(g0.jsonify(), { x: 'Number' })

    let g1 = Shape({ x: Number })
    deepEqual(g1.jsonify(), { x: 'Number' })
    deepEqual(g1.stringify(), '{"x":"Number"}')

    let g2 = Shape({ x: Number }, { name: 'foo' })
    deepEqual(g2.toString(), '[Shape foo {"x":"Number"}]')
    deepEqual(g2.stringify(), '{"x":"Number"}')
    deepEqual(g2.jsonify(), { x: 'Number' })

    let g3 = Shape({ x: Number }, { name: 'foo' })
    deepEqual(g3.toString(), '[Shape foo {"x":"Number"}]')
    deepEqual(g3.jsonify(), { x: 'Number' })
    deepEqual(g3.stringify(), '{"x":"Number"}')
  })
})



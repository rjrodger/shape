/* Copyright (c) 2021-2023 Richard Rodger and other contributors, MIT License */

import { describe, test } from 'node:test'
import assert from 'node:assert'
import { deepEqual, throws } from './test-utils'

import type {
  State,
  Update,
} from '../dist/shape'


import { Shape as ShapeX } from '../dist/shape'


// Handle web (Shape) versus node ({Shape}) export.
let ShapeModule = require('../dist/shape')

if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}


const Shape: ShapeX = ShapeModule

const {
  MakeArgu,
  Skip,
  Rest,
  Any,
  Empty,
  One,
  Default,
} = Shape



describe('argu', () => {

  test('basic', () => {
    let Argu = MakeArgu('QAZ')

    function foo(...args: any[]) {
      let argmap = Argu(args, 'foo', {
        a: 1,
        b: 'B'
      })
      return argmap
    }


    deepEqual(foo(2, 'X'), { a: 2, b: 'X' })
    throws(() => foo(2, 3), 'QAZ (foo): Validation failed for property "b" with number "3" because the number is not of type string.')

  })


  test('skip-count', () => {
    let Argu = MakeArgu('SKIP')
    let a0: any = Argu('foo', {
      a: Skip(Number),
      b: String
    })

    function foo(...args: any[]) {
      let argmap = a0(args)
      return argmap.a + argmap.b
    }

    deepEqual(foo(2, 'X'), '2X')
    deepEqual(foo('X'), 'undefinedX')
    throws(() => foo(), 'SKIP (foo): Validation failed for property "b" with value ' +
        '"undefined" because the value is required.')
    throws(() => foo('X', 'Y'), 'SKIP (foo): ' +
        'Too many arguments for type signature (was 2, expected 1)')
    throws(() => foo(3, 4), 'SKIP (foo): Validation failed for property "b" ' +
        'with number "4" because the number is not of type string.')
    throws(() => foo(3), 'SKIP (foo): Validation failed for property "b" ' +
        'with value "undefined" because the value is required.')


    function bar(a: string | object, b?: object, c?: Function, d?: object) {
      let argmap = Argu(arguments, 'bar', {
        a: One(Empty(String), Object),
        b: Skip(Object),
        c: Skip(Function),
        d: Skip(Object),
      })
      return argmap
    }

    deepEqual(bar('s'), { a: 's' })
    throws(() => (bar as any)('s', 't'), 'SKIP (bar): Validation failed for property \"d\" ' +
        'with string \"t\" because the string is not of type object.')
  })



  test('skip-req-rest', () => {
    let Argu = MakeArgu('seneca')

    function bar(...args: any[]) {
      let argmap = Argu(args, 'bar', {
        a: Skip(String),
        b: Skip(Object),
        c: Function,
        d: Rest(Any()),
      })
      return argmap
    }


    const f0 = () => { }
    deepEqual(bar('a', { x: 1 }, f0), { a: 'a', b: { x: 1 }, c: f0, d: [] })
    deepEqual(bar({ x: 1 }, f0), { a: undefined, b: { x: 1 }, c: f0, d: [undefined] })
    deepEqual(bar('b', f0), { a: 'b', b: undefined, c: f0, d: [undefined] })
    deepEqual(bar(f0), { a: undefined, b: undefined, c: f0, d: [undefined, undefined] })

    deepEqual(bar('a', { x: 1 }, f0, 11), { a: 'a', b: { x: 1 }, c: f0, d: [11] })
    deepEqual(bar({ x: 1 }, f0, 12), { a: undefined, b: { x: 1 }, c: f0, d: [12] })
    deepEqual(bar('b', f0, 13), { a: 'b', b: undefined, c: f0, d: [13] })
    deepEqual(bar(f0, 14), { a: undefined, b: undefined, c: f0, d: [14, undefined] })

    deepEqual(bar('a', { x: 1 }, f0, 11, 12), { a: 'a', b: { x: 1 }, c: f0, d: [11, 12] })
    deepEqual(bar({ x: 1 }, f0, 21, 22), { a: undefined, b: { x: 1 }, c: f0, d: [21, 22] })
    deepEqual(bar('b', f0, 31, 32), { a: 'b', b: undefined, c: f0, d: [31, 32] })
    deepEqual(bar(f0, 41, 42), { a: undefined, b: undefined, c: f0, d: [41, 42] })

  })


  test('plugin-args', () => {
    const Argu = MakeArgu('plugin')
    const argu: any = Argu('args', {
      plugin: One(Object, Function, String),
      options: Default(undefined, One(Object, String)),
      callback: Skip(Function),
    })

    deepEqual(argu([{ x: 11 }]), { plugin: { x: 11 }, options: undefined, callback: undefined })

    deepEqual(argu([{ x: 11 }, { y: 2 }]), { plugin: { x: 11 }, options: { y: 2 }, callback: undefined })

    const f0 = () => { }
    deepEqual(argu([{ x: 11 }, { y: 2 }, f0]), { plugin: { x: 11 }, options: { y: 2 }, callback: f0 })

    deepEqual(argu([f0]), { plugin: f0, options: undefined, callback: undefined })

    deepEqual(argu([f0, { x: 1 }]), { plugin: f0, options: { x: 1 }, callback: undefined })

    const f1 = () => { }
    deepEqual(argu([f0, { x: 1 }, f1]), { plugin: f0, options: { x: 1 }, callback: f1 })

    deepEqual(argu([{ x: 1 }, { y: 2 }, f1]), { plugin: { x: 1 }, options: { y: 2 }, callback: f1 })

    throws(() => argu([f0, f1]), 'plugin (args): Value "f1" for property "options"' +
      ' does not satisfy one of: Object, String')

    deepEqual(argu([Object.freeze({ x: 11 })]), { plugin: { x: 11 }, options: undefined, callback: undefined })

    deepEqual(argu([f0, Object.freeze({ x: 11 })]), { plugin: f0, options: { x: 11 }, callback: undefined })

  })


})



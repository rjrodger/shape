/* Copyright (c) 2021-2023 Richard Rodger and other contributors, MIT License */

import { describe, test } from 'node:test'
import assert from 'node:assert'
import { deepEqual, throws } from './test-utils'


import type {
  Node,
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
const buildize = Shape.buildize
const makeErr = Shape.makeErr


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
} = Shape




describe('readme', () => {
  test('readme-optional', () => {
    let shape = Shape(Optional(String))
    deepEqual(shape(), '')
    deepEqual(shape('a'), 'a')
    throws(() => shape(1), 'type')

    shape = Shape(Optional(Some(String, Number)))
    deepEqual(shape('a'), 'a')
    deepEqual(shape(1), 1)
    deepEqual(shape(), undefined) // Overrides Some

    shape = Shape(Some(String, Number))
    deepEqual(shape('a'), 'a')
    deepEqual(shape(1), 1)
    throws(() => shape(), 'satisfy')
  })


  test('readme-default', () => {
    let shape = Shape(Default('none', String))
    deepEqual(shape(), 'none')
    deepEqual(shape('a'), 'a')
    throws(() => shape(1), 'type')

    shape = Shape(Default({ a: null }, { a: Number }))
    deepEqual(shape({ a: 1 }), { a: 1 })
    deepEqual(shape(), { a: null })
    throws(() => shape({ a: 'x' }), 'type')
  })

})


/* Copyright (c) 2021-2024 Richard Rodger and other contributors, MIT License */

import { describe, test } from 'node:test'
import assert from 'node:assert'
import { deepEqual } from './test-utils'

import { Shape as ShapeX } from '../dist/shape'

let ShapeModule = require('../dist/shape')
if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}
const Shape: ShapeX = ShapeModule

const {
  Above, All, Below, Catch, Check, Child, Closed, Coerce, Default, Define, Describe,
  Discriminated, Email, Empty, Exact, Ignore, Integer, Ip, Len, Max, Min, Never,
  Nullable, One, Open, Optional, Refer, Rest, Skip, Some, Transform, Url, Uuid,
  DateTime, Ipv4, Ipv6, Func,
} = Shape as any

const DRAFT = 'https://json-schema.org/draft/2020-12/schema'


// JSON Schema export.
describe('jsonschema', () => {

  test('kinds', () => {
    const s = Shape({
      a: String, b: Number, c: Boolean, d: Integer, e: new Date(0), f: /^b/, g: null,
      h: NaN, i: Empty, j: Optional(Object), k: Optional(Date), l: 'x', m: Never, n: Func(() => 1),
    }).jsonSchema()

    deepEqual(s, {
      $schema: DRAFT,
      type: 'object',
      properties: {
        a: { type: 'string', minLength: 1 },
        b: { type: 'number' },
        c: { type: 'boolean' },
        d: { type: 'integer' },
        e: { type: 'string', format: 'date-time', default: new Date(0) },
        f: { type: 'string', pattern: '^b' },
        g: { type: 'null', default: null },
        h: { type: 'number' },
        i: {},
        j: { type: 'object', default: {} },
        k: { type: 'string', format: 'date-time' },
        l: { type: 'string', minLength: 1, default: 'x' },
        m: { not: {} },
        n: {},
      },
      required: ['a', 'b', 'c', 'd', 'f'],
      additionalProperties: false,
    })
  })


  test('objects-and-arrays', () => {
    const s = Shape({
      a: Open({ t: 1 }), b: Child(Number), c: Closed([Number]), d: Rest(Number, [String, Boolean]),
      e: [], f: [Number], g: {}, h: Child(Number, { z: 1 }), i: Skip(Number), j: [Shape.Any],
    }).jsonSchema()

    deepEqual(s.properties, {
      a: { type: 'object', properties: { t: { type: 'number', default: 1 } } },
      b: { type: 'object', additionalProperties: { type: 'number' }, default: {} },
      c: { type: 'array', prefixItems: [{ type: 'number' }], items: false },
      d: {
        type: 'array',
        prefixItems: [{ type: 'string', minLength: 1 }, { type: 'boolean' }],
        items: { type: 'number' },
      },
      e: { type: 'array' },
      f: { type: 'array', items: { type: 'number' } },
      g: { type: 'object' },
      h: { type: 'object', properties: { z: { type: 'number', default: 1 } }, additionalProperties: { type: 'number' } },
      i: { type: 'number' },
      j: { type: 'array' },
    })
    assert.equal(s.required, undefined)
  })


  test('checks', () => {
    const s = Shape({
      a: Min(2, Number), b: Optional(Max(5, String)), c: Above(1, [Number]), d: Below(3, {}),
      e: Len(2, String), f: Exact('x', 1, null), g: Email, h: Ip, i: Check(/^a/), j: Min(1),
      k: Above(1, Number), l: Below(3, Number), m: Len(3, Number), n: Above(1, String),
      o: Below(3, String), p: Check((v: any) => true), q: Url, r: Uuid, s: DateTime, t: Ipv4, u: Ipv6,
    }).jsonSchema()

    deepEqual(s.properties, {
      a: { type: 'number', minimum: 2 },
      b: { type: 'string', minLength: 1, maxLength: 5, default: '' },
      c: { type: 'array', items: { type: 'number' }, minItems: 2 },
      d: { type: 'object', maxProperties: 2 },
      e: { type: 'string', minLength: 2, maxLength: 2 },
      f: { enum: ['x', 1, null] },
      g: { type: 'string', minLength: 1, format: 'email' },
      h: { type: 'string', minLength: 1, anyOf: [{ format: 'ipv4' }, { format: 'ipv6' }] },
      i: { pattern: '^a' },
      j: { minimum: 1, minLength: 1, minItems: 1, minProperties: 1 },
      k: { type: 'number', exclusiveMinimum: 1 },
      l: { type: 'number', exclusiveMaximum: 3 },
      m: { type: 'number', minimum: 3, maximum: 3 },
      n: { type: 'string', minLength: 2 },
      o: { type: 'string', minLength: 1, maxLength: 2 },
      p: {},
      q: { type: 'string', minLength: 1, format: 'uri' },
      r: { type: 'string', minLength: 1, format: 'uuid' },
      s: { type: 'string', minLength: 1, format: 'date-time' },
      t: { type: 'string', minLength: 1, format: 'ipv4' },
      u: { type: 'string', minLength: 1, format: 'ipv6' },
    })
  })


  test('composition-and-references', () => {
    const s = Shape({
      a: One(String, Number), b: Some(String, Number), c: All(Number, Min(1)),
      d: Discriminated('kind', { dog: { bark: Boolean }, fish: { fins: 1 }, cat: Object, bird: { kind: String, wings: 2 } }),
      e: Define('d', { z: 1 }), f: Refer('d'), g: Describe('a ref', Refer('d')),
    }).jsonSchema()

    deepEqual(s.properties, {
      a: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'number' }] },
      b: { anyOf: [{ type: 'string', minLength: 1 }, { type: 'number' }] },
      c: { allOf: [{ type: 'number' }, { minimum: 1, minLength: 1, minItems: 1, minProperties: 1 }] },
      d: {
        oneOf: [
          {
            type: 'object',
            properties: { kind: { type: 'string', const: 'bird' }, wings: { type: 'number', default: 2 } },
            required: ['kind'],
            additionalProperties: false,
          },
          { type: 'object', properties: { kind: { type: 'string', const: 'cat' } }, required: ['kind'] },
          {
            type: 'object',
            properties: { bark: { type: 'boolean' }, kind: { type: 'string', const: 'dog' } },
            required: ['bark', 'kind'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: { fins: { type: 'number', default: 1 }, kind: { type: 'string', const: 'fish' } },
            required: ['kind'],
            additionalProperties: false,
          },
        ],
      },
      e: { type: 'object', properties: { z: { type: 'number', default: 1 } }, additionalProperties: false },
      f: { $ref: '#/$defs/d' },
      g: { $ref: '#/$defs/d', description: 'a ref' },
    })
    deepEqual(s.$defs, {
      d: { type: 'object', properties: { z: { type: 'number', default: 1 } }, additionalProperties: false },
    })
  })


  test('modifiers-and-isolation', () => {
    const s = Shape({
      a: Nullable(Number), b: Nullable(), c: Describe('desc', Catch(0, Min(2, Number))),
      d: Transform((v: any) => v, Max(3, String)), e: Ignore(Min(2, Number)), f: Coerce(Boolean),
      g: Default(3, Number), h: Optional(Nullable(Integer)),
    }).jsonSchema()

    deepEqual(s.properties, {
      a: { type: ['number', 'null'] },
      b: {},
      c: { type: 'number', minimum: 2, description: 'desc' },
      d: { type: 'string', minLength: 1, maxLength: 3 },
      e: { type: 'number', minimum: 2 },
      f: { type: 'boolean' },
      g: { type: 'number', default: 3 },
      h: { type: ['integer', 'null'], default: 0 },
    })
  })


  test('root-and-export', () => {
    deepEqual(Shape(Number).jsonSchema(), { $schema: DRAFT, type: 'number' })
    deepEqual(Shape(1).jsonSchema(), { $schema: DRAFT, type: 'number', default: 1 })
    deepEqual(Shape(Never).jsonSchema(), { $schema: DRAFT, not: {} })
    deepEqual((Shape as any).jsonSchema(Shape({ a: 1 }).node()), {
      $schema: DRAFT,
      type: 'object',
      properties: { a: { type: 'number', default: 1 } },
      additionalProperties: false,
    })

    // A key expression's real name.
    deepEqual(Shape({ 'a: Min(2)': 0 }).jsonSchema().properties, { a: { type: 'number', minimum: 2, default: 0 } })
  })
})

/* Copyright (c) 2021-2026 Richard Rodger and other contributors, MIT License */

import { describe, test } from 'node:test'
import assert from 'node:assert'
import { deepEqual } from './test-utils'

import type {
  StandardSchemaV1,
  StandardSchemaV1Result,
} from '../dist/shape'

import { Shape as ShapeX } from '../dist/shape'


let ShapeModule = require('../dist/shape')
if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}
const Shape: ShapeX = ShapeModule


function getIssues<O>(r: StandardSchemaV1Result<O>) {
  assert.ok('issues' in r && r.issues, 'expected failure result')
  return r.issues
}


describe('standard-schema', () => {

  test('exposes ~standard props', () => {
    const s = Shape({ a: Number }) as unknown as StandardSchemaV1
    const std = s['~standard']
    assert.equal(std.version, 1)
    assert.equal(std.vendor, 'shape')
    assert.equal(typeof std.validate, 'function')
  })


  test('success returns value with defaults applied', () => {
    const s = Shape({ port: 8080, host: 'localhost' }) as unknown as
      StandardSchemaV1<unknown, { port: number; host: string }>
    const r = s['~standard'].validate({}) as StandardSchemaV1Result<{ port: number; host: string }>
    assert.ok(!('issues' in r && r.issues), 'should be success')
    assert.ok('value' in r)
    deepEqual((r as any).value, { port: 8080, host: 'localhost' })
  })


  test('success preserves provided values', () => {
    const s = Shape({ a: Number, b: String }) as unknown as StandardSchemaV1
    const r: any = s['~standard'].validate({ a: 2, b: 'x' })
    assert.equal(r.issues, undefined)
    deepEqual(r.value, { a: 2, b: 'x' })
  })


  test('failure returns issues with message and path', () => {
    const s = Shape({ a: Number, b: String }) as unknown as StandardSchemaV1
    const r = s['~standard'].validate({ a: 'not-a-number', b: 'ok' }) as any
    const issues = getIssues(r)
    assert.equal(issues.length, 1)
    assert.equal(typeof issues[0].message, 'string')
    assert.ok(issues[0].message.length > 0)
    deepEqual(issues[0].path, ['a'])
  })


  test('required missing property reports correct path', () => {
    const s = Shape({ a: Number, b: String }) as unknown as StandardSchemaV1
    const r = s['~standard'].validate({ a: 1 }) as any
    const issues = getIssues(r)
    assert.equal(issues.length, 1)
    deepEqual(issues[0].path, ['b'])
  })


  test('nested path emitted as array of keys', () => {
    const s = Shape({ server: { port: Number } }) as unknown as StandardSchemaV1
    const r = s['~standard'].validate({ server: { port: 'bad' } }) as any
    const issues = getIssues(r)
    assert.equal(issues.length, 1)
    deepEqual(issues[0].path, ['server', 'port'])
  })


  test('array index emitted as number in path', () => {
    const s = Shape([Number]) as unknown as StandardSchemaV1
    const r = s['~standard'].validate([1, 'two', 3]) as any
    const issues = getIssues(r)
    assert.equal(issues.length, 1)
    deepEqual(issues[0].path, [1])
    assert.equal(typeof (issues[0].path as any[])[0], 'number')
  })


  test('root-level failure uses empty path', () => {
    const s = Shape(Number) as unknown as StandardSchemaV1
    const r = s['~standard'].validate('nope') as any
    const issues = getIssues(r)
    assert.equal(issues.length, 1)
    deepEqual(issues[0].path, [])
  })


  test('multiple failures aggregate into multiple issues', () => {
    const s = Shape({ a: Number, b: String }) as unknown as StandardSchemaV1
    const r = s['~standard'].validate({ a: 'x', b: 5 }) as any
    const issues = getIssues(r)
    assert.equal(issues.length, 2)
    const paths = issues.map((i: any) => i.path[0]).sort()
    deepEqual(paths, ['a', 'b'])
  })


  test('keys containing dots survive round-trip', () => {
    const s = Shape({ 'a.b': Number }) as unknown as StandardSchemaV1
    const r = s['~standard'].validate({ 'a.b': 'bad' }) as any
    const issues = getIssues(r)
    assert.equal(issues.length, 1)
    deepEqual(issues[0].path, ['a.b'])
  })


  test('validate does not throw on invalid input', () => {
    const s = Shape({ a: Number }) as unknown as StandardSchemaV1
    // The plain shape() call would throw; ~standard.validate must not.
    const r = s['~standard'].validate({ a: 'x' })
    assert.ok(r)
    assert.ok('issues' in r)
  })

})

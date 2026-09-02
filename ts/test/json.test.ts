/* Copyright (c) 2021-2024 Richard Rodger and other contributors, MIT License */

// The declarative JSON export, shape.json(), and the build() that reads it.

import { describe, test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

import { Shape as ShapeX } from '../dist/shape'

let ShapeModule = require('../dist/shape')
if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}
const Shape: ShapeX = ShapeModule
const {
  build, expr, Min, Max, Above, Below, Len, Optional, Required, Skip, Empty, Nullable, Integer,
  Open, Closed, Child, Rest, One, Some, All, Exact, Discriminated, Any, Never, Func, Check,
  Catch, Ignore, Transform, Coerce, Define, Refer, Rename, Key, Email, Describe, Fault,
  Default, Before, After, fromJsonSchema,
} = ShapeModule

const { deepEqual, throws, equal } = assert


// The round trip: the JSON reads back as a shape with the same JSON, and the
// two shapes agree on a value.
function roundTrip(spec: any, json: any, ...vals: any[]) {
  const s = ('function' === typeof spec && undefined !== spec.node) ? spec : Shape(spec)
  deepEqual(s.json(), json)
  const b = build(JSON.parse(JSON.stringify(json)))
  deepEqual(b.json(), json)
  for (const v of vals) {
    agree(s, b, v)
  }
}

function agree(s: any, b: any, v: any) {
  let so, se, bo, be
  try { so = s(structuredClone(v)) } catch (e: any) { se = e.message.replace(/G\$\w+/g, 'G$') }
  try { bo = b(structuredClone(v)) } catch (e: any) { be = e.message.replace(/G\$\w+/g, 'G$') }
  deepEqual(bo, so)
  equal(be, se)
}


describe('json', () => {

  test('scalars', () => {
    roundTrip({ a: String }, { 'a: String': '' }, { a: 'x' }, { a: '' }, {})
    roundTrip({ a: Number, b: Boolean, c: Integer },
      { 'a: Number': 0, 'b: Boolean': false, 'c: Integer': 0 }, { a: 1, b: true, c: 2 }, { c: 1.5 })
    roundTrip({ a: 5, b: 'x', c: '', d: true, e: null },
      { a: 5, b: '"x"', c: '""', d: true, e: null }, {}, { a: 'no' }, { e: 1 })
    roundTrip({ a: Optional(String), b: Skip(Number), c: Optional(Integer), d: Required(5) },
      { 'a: String.Optional': '', 'b: Skip': 0, 'c: Integer.Optional': 0, 'd: Required': 5 },
      {}, { a: '' }, { c: 1.5 }, { d: 1 })
    roundTrip({ a: Empty(String), b: Nullable(String), c: Empty('x'), d: Nullable(5) },
      { 'a: String.Empty': '', 'b: String.Nullable': '', 'c: Empty': 'x', 'd: Nullable': 5 },
      { a: '', b: null, c: '', d: null }, {})
    roundTrip({ a: Min(2, String), b: Max(3, Optional(Number)), c: Above(1.5, Number), d: Below(-2), e: Len(3, 'abc') },
      { 'a: String.Min(2)': '', 'b: Max(3)': 0, 'c: Number.Above(1.5)': 0, d: 'Any.Below(-2)', 'e: Len(3)': 'abc' },
      {}, { a: 'a' }, { b: 4 }, { c: 1.5 }, { d: -2 }, { e: 'abcd' })
    roundTrip({ a: Email(), b: Coerce(Number), c: Describe('desc', Number), d: Fault('bad', String) },
      { 'a: String.Email': '', 'b: Number.Coerce': 0, 'c: Number.Describe("desc")': 0, 'd: String.Fault("bad")': '' },
      { a: 'a@b.co', b: '1' }, { a: 'nope' }, { d: 1 })
  })


  test('value-form', () => {
    // Under an array, a list or a mark there is no key, so the literal is
    // held by the call that says whether it is required.
    roundTrip([Skip(0)], ['Skip(0)'], [1], ['x'])
    roundTrip([Min(2, 0)], ['Optional(0).Min(2)'], [3], [1])
    roundTrip([Required(5)], ['Required(5)'], [5], [])
    roundTrip([Optional(String)], ['String.Optional'], [''], [1])
    roundTrip([Optional(Integer)], ['Integer.Optional'], [1], [1.5])
    roundTrip(['x'], ['"x"'], ['y'], [1])
    roundTrip([''], ['""'], [''], [1])
    roundTrip([Empty('x')], ['Optional("x").Empty'], [''], [1])
    roundTrip([Exact(1, 'a', null, true)], ['Any.Exact(1,"a",null,true)'], ['a'], [2])
    roundTrip({ a: Optional(7).Exact(2) }, { a: 'Optional(7).Exact(2)' }, {}, { a: 2 }, { a: 3 })
  })


  test('objects', () => {
    roundTrip({ a: { b: String }, c: {}, d: Closed({}), e: Open({ b: 1 }) },
      { a: { 'b: String': '' }, c: {}, 'd: Closed': {}, 'e: Open': { b: 1 } },
      { a: { b: 'x' }, c: { z: 1 }, d: {}, e: { b: 2, z: 1 } }, { d: { z: 1 } }, { a: {} })
    roundTrip({ a: Child(Number), b: Child(String, { c: 1 }), d: Required({ e: 1 }), f: Skip({ g: 1 }) },
      { 'a: Child(Number)': {}, 'b: Child(String)': { c: 1 }, 'd: Required': { e: 1 }, 'f: Skip': { g: 1 } },
      { a: { x: 1 }, b: { z: 'x' }, d: {} }, { a: { x: 'no' } }, {}, { f: {} })
    roundTrip({ a: Min(1, Open({ b: 1 })), c: Nullable({ d: 1 }) },
      { 'a: Min(1).Open': { b: 1 }, 'c: Nullable': { d: 1 } }, { a: {}, c: null }, { a: { b: 2 } })
    // A child shape with no expression rides in a sidecar.
    roundTrip(Child({ x: Number }), { $$: 'Child($$0)', $$0: { 'x: Number': 0 } }, { a: { x: 1 } }, { a: { x: 'no' } })
    roundTrip({ a: Child({ x: Number }, { b: 1 }) },
      { a: { b: 1, $$: 'Child($$0)', $$0: { 'x: Number': 0 } } }, { a: { c: { x: 1 } } })
    // The root and a nested object read the same way.
    roundTrip(Open({ a: String }), { 'a: String': '', $$: 'Open' }, { a: 'x', z: 1 })
    roundTrip({}, {}, { z: 1 })
    roundTrip(Closed({}), { $$: 'Closed' }, {}, { z: 1 })
  })


  test('arrays', () => {
    roundTrip({ a: [String], b: [String, Number], c: [], d: [[Number]], e: [{ x: String }] },
      { a: ['String'], b: ['String', 'Number'], c: [], d: [['Number']], e: [{ 'x: String': '' }] },
      { a: ['x'], b: ['x', 1], c: [], d: [[1]], e: [{ x: 'y' }] }, { a: [1] }, { b: ['x'] }, { c: [1] })
    // A single position is closed, which [X] cannot say.
    roundTrip({ a: Closed([String]) }, { a: { $$: 'Closed($$0)', $$0: ['String'] } }, { a: ['x'] }, { a: ['x', 'y'] })
    roundTrip({ a: Rest(Number, [String, Number]), b: Rest(Number, Closed([String])), c: Rest(Number, []) },
      {
        'a: Rest(Number)': ['String', 'Number'],
        b: { $$: 'Rest(Number,Closed($$0))', $$0: ['String'] },
        'c: Rest(Number)': [],
      },
      { a: ['x', 1, 2], b: ['x', 1], c: [1] }, { a: ['x', 1, 'y'] }, { b: ['x', 'y'] }, { c: ['x'] })
    roundTrip({ a: Min(2, [String]), b: Required([Number]), c: Skip([Number]), d: Min(1, Closed([String])) },
      {
        'a: Min(2)': ['String'], 'b: Required': ['Number'], 'c: Skip': ['Number'],
        d: { $$: 'Min(1,Closed($$0))', $$0: ['String'] },
      },
      { a: ['x', 'y'], b: [], d: ['x'] }, { a: ['x'] }, {}, { d: [] })
    roundTrip(Rest({ q: 1 }, []), { $$: 'Rest($$1,$$0)', $$0: [], $$1: { q: 1 } }, [{}], [1])
    roundTrip([Optional({ a: String })], [{ 'a: String': '' }], [{ a: 'x' }], [{}])
  })


  test('lists', () => {
    roundTrip({ a: One(String, Number) }, { a: 'One(String,Number)' }, { a: 1 }, { a: true })
    roundTrip({ a: Some({ x: 1 }, [String]) }, { a: { $$: 'Some($$0,$$1)', $$0: { x: 1 }, $$1: ['String'] } },
      { a: { x: 2 } }, { a: ['y'] })
    roundTrip({ a: Some({ x: 1 }, { y: 2 }) }, { a: { $$: 'Some($$0,$$1)', $$0: { x: 1 }, $$1: { y: 2 } } },
      { a: { x: 2 } }, { a: 1 })
    roundTrip({ a: All(Number, Min(1)) }, { a: 'All(Number,Any.Min(1))' }, { a: 1 }, { a: 0 })
    roundTrip({ a: Optional(One(String, Number)), b: Skip(One(String, Number)) },
      { a: 'One(String,Number).Optional', b: 'One(String,Number).Skip' }, {}, { a: true })
    roundTrip({ a: One(Skip(0)), b: One(Min(2, 0).Ignore(), String) },
      { a: 'One(Skip(0))', b: 'One(Skip(0).Min(2).Ignore,String)' }, {}, { a: 1 }, { b: 1 }, { b: 'x' })
    // Marks inside a branch apply to the branch.
    roundTrip(Some(Open({ a: 1 }), Open({ b: 2 })),
      { $$: 'Some($$0,$$1)', $$0: { a: 1, $$: 'Open' }, $$1: { b: 2, $$: 'Open' } }, {}, { a: 2, c: 3 })
    roundTrip({ a: Discriminated('k', { x: { a: Number }, y: { b: String, k: 'y' } }) },
      { a: { $$: 'Discriminated("k",$$0)', $$0: { x: { 'a: Number': 0 }, y: { 'b: String': '' } } } },
      { a: { k: 'x', a: 1 } }, { a: { k: 'y', b: 1 } }, { a: { k: 'z' } })
    roundTrip(Discriminated('k', { x: { k: Min(1, 'x') } }),
      { $$: 'Discriminated("k",$$0)', $$0: { x: { 'k: Min(1)': 'x' } } }, { k: 'x' })
  })


  test('kinds', () => {
    roundTrip({ a: /^a+$/, b: Check(/^b/), c: Skip(/x/), d: Min(2, /x/).Skip(), e: Optional(Check(/^b/)) },
      { a: '/^a+$/', b: 'Check(/^b/)', c: 'Skip(/x/)', d: 'Skip(/x/).Min(2)', e: 'Check(/^b/).Optional' },
      { a: 'aa', b: 'b', c: 'x', d: 'xx' }, { a: 'b' }, { b: 1 }, { d: 'x' }, { e: 'c' })
    roundTrip({ a: Any(), b: Required(), c: Never(), d: Date, e: Optional(Date), f: Func(), g: Function },
      { a: 'Any', b: 'Required', c: 'Never', d: 'Date', e: 'Optional(Date)', f: 'Optional(Function)', g: 'Function' },
      { b: 1, d: new Date(), g: () => 1 }, { c: 1 }, {})
    roundTrip({ a: Open(), b: Any(3), c: Required(undefined), d: Optional(undefined), e: Skip(Never) },
      { a: 'Any.Open', b: 'Any(3)', c: 'Required(undefined)', d: 'Optional(undefined)', e: 'Never.Skip' },
      { a: { z: 1 } }, {}, { c: 1 })
    roundTrip({ a: NaN, b: Required(NaN), c: Min(2, NaN), d: Skip(null), e: Required(null) },
      { a: 'NaN', b: 'Required(NaN)', c: 'Optional(NaN).Min(2)', d: 'Skip(null)', e: 'Required(null)' },
      { a: NaN, b: NaN, e: null }, {}, { d: 1 })
  })


  test('checks', () => {
    roundTrip({ a: Catch(0, Min(2, Number)), b: Ignore(Min(2, String)), c: Catch('x', /^a/) },
      { 'a: Number.Min(2).Catch(0)': 0, 'b: String.Min(2).Ignore': '', c: 'Catch("x",/^a/)' },
      { a: 1, b: 'a', c: 'b' }, { a: 'x' }, {})
    roundTrip({ a: Define('d', String), b: Refer('d'), c: Rename('z', String), d: Rename({ name: 'z' }, Number) },
      { 'a: String.Define("d")': '', b: 'Any.Refer("d")', 'c: String.Rename("z")': '', 'd: Number.Rename("z")': 0 },
      { a: 'x', b: 'y', c: 'q', d: 1 }, { a: 'x', b: 1 })
    roundTrip({ a: Key(), b: Key(2, '/'), c: Key(1), d: Required(Key()), e: Key().Min(1) },
      { a: 'Key', b: 'Key(2,"/")', c: 'Key(1)', d: 'Key.Required', e: 'Key.Min(1)' },
      { a: 'x' }, {})
    // Order is kept: Coerce goes ahead of the bound it converts for.
    roundTrip({ a: Min(2, Number).Coerce() }, { 'a: Number.Coerce.Min(2)': 0 }, { a: '3' }, { a: '1' })
    roundTrip({ a: Min(1, Max(3, Number)) }, { 'a: Number.Max(3).Min(1)': 0 }, { a: 2 }, { a: 4 })
  })


  test('names', () => {
    roundTrip({ 'a b': 1, 'c d': String, '"q"': 2, '': 3, 'e:': 4, ' f': Number },
      { 'a b': 1, '"c d": String': '', '"q"': 2, '': 3, 'e:': 4, '" f": Number': 0 },
      { 'a b': 2, 'c d': 'x', '"q"': 3, '': 4, 'e:': 5, ' f': 1 }, { 'c d': 1 })
    roundTrip(Shape({ 'a: b': 1 }, { keyexpr: { active: false } }), { '"a: b": Optional': 1 }, { 'a: b': 2 })
  })


  test('cannot', () => {
    const cannot = (spec: any, re: RegExp) => throws(() =>
      (('function' === typeof spec && undefined !== spec.node) ? spec : Shape(spec)).json(), re)
    cannot({ a: Check((v: any) => v > 1) }, /cannot express a check function/)
    cannot({ a: Before((v: any) => v > 1, Number) }, /cannot express a custom check/)
    cannot({ a: After((v: any) => v > 1, Number) }, /cannot express a custom after check/)
    cannot({ a: Catch(0, After((v: any) => true, Number)) }, /cannot express a custom after check/)
    cannot({ a: Transform((v: any) => v, Number) }, /cannot express Transform/)
    cannot({ a: Key((p: any) => p.join('.')) }, /cannot express the Key argument function/)
    cannot({ a: Rename({ name: 'b', keep: true }, Number) }, /cannot express the options of Rename/)
    cannot({ a: Refer({ name: 'd', fill: true }) }, /cannot express the options of Refer/)
    cannot({ a: Catch({ x: 1 }, Number) }, /cannot express the fallback object/)
    cannot({ a: Catch(undefined, Number) }, /cannot express the fallback undefined/)
    cannot({ a: Default({ q: 1 }, Child(Number)) }, /cannot express an object default/)
    cannot({ a: Default([1], [Number]) }, /cannot express an array default/)
    cannot({ a: new Date() }, /cannot express a date default/)
    cannot({ a: Symbol('s') }, /cannot express a symbol value/)
    cannot({ a: 10n }, /cannot express a bigint value/)
    cannot({ $$: 1 }, /cannot express the property name "\$\$"/)
    cannot(Shape({ 'a: b': One(1, 2) }, { keyexpr: { active: false } }), /property name "a: b" of a value with no key form/)
    cannot({ a: Child(Number).Exact(1) }, /cannot express Exact on an object/)
    cannot({ a: Shape.Rest(Number).Exact(1) }, /cannot express Exact on an array/)
    cannot({ a: Exact(undefined) }, /cannot express the Exact value undefined/)
    cannot({ a: Exact({ x: 1 }) }, /cannot express the Exact value object/)
  })


  test('reader', () => {
    // The key form keeps the kind the chain names; the example is the
    // default alone.
    throws(() => build({ 'a: String': '' })({ a: '' }), /empty string is not allowed/)
    throws(() => build({ 'a: Integer.Min(2)': 0 })({ a: 2.5 }), /not of type integer/)
    deepEqual(build({ 'a: Number.Optional': 5 })({}), { a: 5 })
    deepEqual(build({ 'a: String.Optional': 'x' })({}), { a: 'x' })
    deepEqual(build({ 'a: String.Skip': '' })({}), {})
    throws(() => build({ 'a: String.Skip': '' })({ a: '' }), /empty string is not allowed/)
    deepEqual(build({ 'a: Skip': '' })({ a: '' }), { a: '' })
    // The kind of a chain that names none is the example's.
    throws(() => build({ 'a: Min(2)': 0 })({ a: 'x' }), /not of type number/)
    deepEqual(build({ 'a: Child(Number)': [] })({ a: [1] }), { a: [1] })
    // The Object token of the string form is closed, as Type(Object) is.
    deepEqual(build({ 'a: Object': { b: String } })({ a: { b: 'x' } }), { a: { b: 'x' } })
    throws(() => build({ 'a: Object': { b: String } })({ a: { b: 'x', z: 1 } }), /"z" is not allowed/)
    deepEqual(build({ 'a: Array': [String] })({ a: ['x'] }), { a: ['x'] })
    // A fraction is one token.
    deepEqual(Shape(expr('Min(1.5)'))(1.6), 1.6)
    throws(() => Shape(expr('Min(1.5)'))(1.4), /minimum of 1.5/)
    deepEqual(Shape(expr('Max(-2.5e1)'))(-30), -30)
    deepEqual(Shape(expr('Optional(1.5)'))(undefined), 1.5)
    // A null value is the null shape.
    throws(() => build({ a: null })({ a: 1 }), /not of type null/)
    deepEqual(build({ a: null })({ a: null }), { a: null })
    // Marks are read where they are, so a branch has its own.
    deepEqual(build({ $$: 'One($$0,String)', $$0: { a: 1, $$: 'Open' } })({ z: 1 }), { a: 1, z: 1 })
    deepEqual(build({ $$: 'Min(2,$$0).Skip', $$0: ['String'] })(['a', 'b']), ['a', 'b'])
    throws(() => build({ $$: 'Min(2,$$0).Skip', $$0: ['String'] })(['a']), /minimum length of 2/)
    deepEqual(build({ $$: 'Min(2,$$0).Skip', $$0: ['String'] }).json(), { $$: 'Skip($$0).Min(2)', $$0: ['String'] })
    // The mark value that is not an expression is left alone.
    deepEqual(build({ a: 1, $$: 2 })({ a: 3, $$: 4 }), { a: 3, $$: 4 })
    // Key expressions keep the property order.
    deepEqual(Object.keys(build({ a: 1, 'b: String.Optional': '', c: true })({})), ['a', 'b', 'c'])
    deepEqual(Object.keys(build({ a: 1, 'b: String.Optional': '', c: true })({})), ['a', 'b', 'c'])
  })


  test('corpus', () => {
    // Every corpus spec round trips, but for the few that say what the
    // expression form cannot.
    const dir = path.join(process.cwd(), '..', 'test')
    let count = 0
    let cannot = 0
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.tsv')).sort()) {
      const lines = fs.readFileSync(path.join(dir, f), 'utf8').trim().split(/\r?\n/)
      const headers = lines[0].split('\t')
      for (const line of lines.slice(1)) {
        if ('' === line.trim()) continue
        const cols = line.split('\t')
        const row: any = {}
        headers.forEach((h, i) => row[h] = cols[i] || '')
        const spec = corpusSpec(cell(row.spec))
        const input = cell(row.input)
        let s: any
        try { s = Shape(spec) } catch (_e) { continue }
        let json: any
        try {
          json = s.json()
        }
        catch (e: any) {
          assert.match(e.message, /cannot express (the options of Refer|an object default)/, row.name)
          cannot++
          continue
        }
        const text = JSON.stringify(json)
        const b = build(JSON.parse(text))
        equal(JSON.stringify(b.json()), text, row.name)
        agree(s, b, input)
        count++
      }
    }
    assert(300 < count)
    assert(cannot <= 8)
  })
})


function cell(src: string): any {
  const s = src.trim()
  try { return JSON.parse(s) }
  catch (_e) {
    if (2 <= s.length && ((s[0] === "'" && s[s.length - 1] === "'") || (s[0] === '"' && s[s.length - 1] === '"'))) {
      return s.slice(1, -1)
    }
    return s
  }
}

function corpusSpec(v: any): any {
  if (Array.isArray(v)) return v.map(corpusSpec)
  if (null != v && 'object' === typeof v) {
    const ks = Object.keys(v)
    if (1 === ks.length) {
      const native: any = { String, Number, Boolean, Object, Array, Symbol, Function, Date }
      switch (ks[0]) {
        case '$type': return native[v.$type] || (ShapeModule as any)[v.$type]
        case '$open': return Open(corpusSpec(v.$open))
        case '$closed': return Closed(corpusSpec(v.$closed))
        case '$required': return Required(corpusSpec(v.$required))
        case '$optional': return Optional(corpusSpec(v.$optional))
        case '$expr': return expr(v.$expr)
        case '$jsonschema': return fromJsonSchema(v.$jsonschema)
        case '$call': {
          const [name, ...args] = v.$call
          return (ShapeModule as any)[name](...args.map(corpusSpec))
        }
        case '$discriminated': {
          const [tag, branches] = v.$discriminated
          const out: any = {}
          for (const b of Object.keys(branches)) out[b] = corpusSpec(branches[b])
          return Discriminated(tag, out)
        }
      }
    }
    const out: any = {}
    for (const k of ks) out[k] = corpusSpec(v[k])
    return out
  }
  return v
}

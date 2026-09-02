/* Copyright (c) 2021-2024 Richard Rodger and other contributors, MIT License */

// Compile-time checks of the result types Shape infers. tsc compiles this
// file with the rest of the tests, so a wrong inference fails the build;
// the one runtime test only proves the values match what the types say.

import { test } from 'node:test'
import assert from 'node:assert'

import {
  Shape, Min, Max, Optional, Skip, Nullable, Default, Exact, One, Some, All, Integer, Email,
  Key, Child, Rest, Discriminated, Transform, Catch, Pick, Omit, Partial, Extend, Type,
  Never, Required, Closed, Open, Check, Any, Func, Describe, Coerce, Ignore,
} from '../dist/shape'


type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<T extends true> = T


const shape = Shape({
  name: String,
  n: Min(1, Number),
  chained: Required(Number).Max(9),
  o: Optional(String),
  s: Skip(String),
  ig: Ignore(Number),
  nu: Nullable(Number),
  tags: [String],
  tup: [Number, String],
  anyarr: [],
  nested: { p: 8080, q: Optional({ r: Boolean }) },
  lit: 'x',
  d: Default(5),
  dd: Default('a', String),
  e: Exact('admin', 'user'),
  en: Exact(1, 2, null),
  u: One(String, Number),
  so: Some(Boolean, Number),
  al: All(Number, Min(2)),
  i: Integer,
  ic: Integer(Number),
  em: Email,
  dt: Date,
  dl: new Date(0),
  re: /^a/,
  k: Key(),
  c: Child(Number),
  co: Child(Number, { a: 1 }),
  rest: Rest(Number),
  disc: Discriminated('kind', { dog: { bark: Boolean }, fish: { fins: Number } }),
  t: Transform((v) => v.length, String),
  ca: Catch(0, Number),
  'ke: Min(2)': 0,
  'kq: Optional(Number)': 5,
  '"a b": Optional(String)': '',
  pk: Pick('a', { a: 1, b: 'x' }),
  pks: Pick(['a', 'c'], { a: 1, b: 'x', c: true }),
  om: Omit('a', { a: 1, b: 'x' }),
  pa: Partial({ a: 1, b: String }),
  ex: Extend({ z: Boolean }, { a: 1, z: 'was' }),
  ty: Type(Number),
  tn: Type('String'),
  cl: Closed({ a: 1 }),
  op: Open({ a: 1 }),
  ck: Check(/^a/, String),
  an: Any,
  fn: Func((x: number) => x),
  de: Describe('a number', Number),
  cf: Coerce(Boolean),
})

// Never called: only its types are read.
function inferred() {
  const out = shape({})
  const fromAny = shape(JSON.parse('{}'))
  const rootNum = Shape(Min(1, Number))(1)
  const rootArr = Shape([Number])([])
  const nv = Shape({ nv: Never })({})
  return { out, fromAny, rootNum, rootArr, nv }
}

type Inferred = ReturnType<typeof inferred>
type Out = Inferred['out']

type _checks = [
  Expect<Equal<Out['name'], string>>,
  Expect<Equal<Out['n'], number>>,
  Expect<Equal<Out['chained'], number>>,
  Expect<Equal<Out['o'], string>>,
  Expect<Equal<Out['s'], string | undefined>>,
  Expect<Equal<Out['ig'], number | undefined>>,
  Expect<Equal<Out['nu'], number | null>>,
  Expect<Equal<Out['tags'], string[]>>,
  Expect<Equal<Out['tup'], [number, string]>>,
  Expect<Equal<Out['anyarr'], any[]>>,
  Expect<Equal<Out['nested'], { p: number, q: { r: boolean } }>>,
  Expect<Equal<Out['lit'], string>>,
  Expect<Equal<Out['d'], number>>,
  Expect<Equal<Out['dd'], string>>,
  Expect<Equal<Out['e'], 'admin' | 'user'>>,
  Expect<Equal<Out['en'], 1 | 2 | null>>,
  Expect<Equal<Out['u'], string | number>>,
  Expect<Equal<Out['so'], boolean | number>>,
  Expect<Equal<Out['al'], any>>,
  Expect<Equal<Out['i'], number>>,
  Expect<Equal<Out['ic'], number>>,
  Expect<Equal<Out['em'], string>>,
  Expect<Equal<Out['dt'], Date>>,
  Expect<Equal<Out['dl'], Date>>,
  Expect<Equal<Out['re'], string>>,
  Expect<Equal<Out['k'], string>>,
  Expect<Equal<Out['c']['anything'], number>>,
  Expect<Equal<Out['co'], { a: number }>>,
  Expect<Equal<Out['rest'], number[]>>,
  Expect<Equal<Out['disc'], { bark: boolean, kind: 'dog' } | { fins: number, kind: 'fish' }>>,
  Expect<Equal<Out['t'], number>>,
  Expect<Equal<Out['ca'], number>>,
  Expect<Equal<Out['ke'], number>>,
  Expect<Equal<Out['kq'], number>>,
  Expect<Equal<Out['a b'], string>>,
  Expect<Equal<Out['pk'], { a: number }>>,
  Expect<Equal<Out['pks'], { a: number, c: boolean }>>,
  Expect<Equal<Out['om'], { b: string }>>,
  Expect<Equal<Out['pa'], { a: number, b: string }>>,
  Expect<Equal<Out['ex'], { a: number, z: boolean }>>,
  Expect<Equal<Out['ty'], number>>,
  Expect<Equal<Out['tn'], string>>,
  Expect<Equal<Inferred['nv']['nv'], never>>,
  Expect<Equal<Out['cl'], { a: number }>>,
  Expect<Equal<Out['op'], { a: number }>>,
  Expect<Equal<Out['ck'], string>>,
  Expect<Equal<Out['an'], any>>,
  Expect<Equal<Out['fn'], (x: number) => number>>,
  Expect<Equal<Out['de'], number>>,
  Expect<Equal<Out['cf'], boolean>>,
]

// An input typed any does not swallow the result type, and a root literal or
// builder infers on its own.
type _roots = [
  Expect<Equal<Inferred['fromAny']['n'], number>>,
  Expect<Equal<Inferred['rootNum'], number>>,
  Expect<Equal<Inferred['rootArr'], number[]>>,
]

// A key expression in the spec carries no expression text in the result.
type _keys = Expect<Equal<'ke' extends keyof Out ? true : false, true>>
type _nokeys = Expect<Equal<'ke: Min(2)' extends keyof Out ? true : false, false>>


// Review findings: the modes of Key, Type's forced kind, key-expression
// spellings, schema-owned input properties, and the hidden bare brand.
function inferredMore() {
  const keyed = Shape({
    plain: Key(),
    joined: Key(2, '.'),
    path: Key(2),
    custom: Key((path: string[]) => path.length),
  })({})
  type _k1 = Expect<Equal<typeof keyed.plain, string>>
  type _k2 = Expect<Equal<typeof keyed.joined, string>>
  type _k3 = Expect<Equal<typeof keyed.path, string[]>>
  type _k4 = Expect<Equal<typeof keyed.custom, number>>

  const typed = Shape({
    obj: Type(Object, { a: 1 }),
    num: Type('Number', 'x'),
    int: Type(Integer),
  })({})
  type _t1 = Expect<Equal<typeof typed.obj, any>>
  type _t2 = Expect<Equal<typeof typed.num, number>>
  type _t3 = Expect<Equal<typeof typed.int, number>>

  const keys = Shape({
    'x:Min(1)': 2,
    ' y:Min(1) ': 3,
    '"a: b": Min(1)': 4,
    'z:': 5,
    'not an expr': 6,
  })({})
  type _e1 = Expect<Equal<typeof keys.x, number>>
  type _e2 = Expect<Equal<typeof keys.y, number>>
  type _e3 = Expect<Equal<typeof keys['a: b'], number>>
  type _e4 = Expect<Equal<typeof keys['z:'], number>>
  type _e5 = Expect<Equal<typeof keys['not an expr'], number>>

  const coerced = Shape({ n: Coerce(Number) })({ n: '1', extra: true })
  type _c1 = Expect<Equal<typeof coerced.n, number>>
  type _c2 = Expect<Equal<typeof coerced.extra, boolean>>
  const prim = Shape({ n: Number })('not an object' as string)
  type _c3 = Expect<Equal<typeof prim, { n: number }>>

  // @ts-expect-error the brand is not a property
  Integer.bare$
  return { keyed, typed, keys, coerced, prim }
}


test('types-agree-with-values', () => {
  assert.equal(typeof inferredMore, 'function')
  const v = shape({ name: 'n', n: 2, chained: 3, nu: null, tup: [1, 'a'], nested: { q: { r: true } }, e: 'admin', en: 1,
    u: 'x', so: true, al: 2, i: 1, ic: 1, em: 'a@b.co', dt: new Date(0), re: 'abc', k: 'ignored', c: { z: 1 }, rest: [1],
    disc: { kind: 'dog', bark: true }, t: 'abc', ca: 'x', ke: 3, om: { b: 'y' }, ex: { z: true }, ty: 1, tn: 's',
    cl: { a: 2 }, op: { a: 3 }, ck: 'abc', an: 1, fn: (x: number) => x, de: 1, cf: 'true' } as any)
  assert.equal(v.t, 3)
  assert.equal(v.ca, 0)
  assert.equal(typeof v.k, 'string')
  assert.equal(v.cf, true)
  assert.deepEqual(v.pk, { a: 1 })
  assert.deepEqual(v.ex, { a: 1, z: true })
  assert.equal(v['a b'], '')
})

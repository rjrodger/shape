/* Copyright (c) 2021-2023 Richard Rodger and other contributors, MIT License */

// Canonical-semantics tests for behaviours corrected while bringing the Go
// port to parity. The declarative cases are pinned by the shared corpus in
// test/*.tsv; these cover the imperative surface the corpus cannot reach.

import { describe, test } from 'node:test'
import assert from 'node:assert'

import type { Shape as ShapeX } from '../dist/shape'

let ShapeModule = require('../dist/shape')

if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}

const Shape: ShapeX = ShapeModule


function failure(spec: any, input: any): string {
  try {
    Shape(spec)(input)
  }
  catch (e: any) {
    return e.message
  }

  throw new Error('expected validation to fail')
}


describe('parity', () => {

  test('bare builder reference means the builder applied to nothing', () => {
    // Without this a capitalized builder function falls through to the
    // class-instance branch and becomes an `instanceof` check that can
    // never pass.
    assert.deepEqual(Shape({ a: Shape.Any })({ a: 1 }), { a: 1 })
    assert.deepEqual(Shape({ a: Shape.Any })({ a: null }), { a: null })
    assert.deepEqual(Shape({ a: Shape.Any })({ a: { b: 1 } }), { a: { b: 1 } })
    assert.equal(Shape(Shape.Any)('anything'), 'anything')

    // Bare and called forms agree.
    assert.deepEqual(
      Shape({ a: Shape.Any })({ a: 1 }),
      Shape({ a: Shape.Any() })({ a: 1 }))

    assert.deepEqual(Shape({ a: Shape.Optional })({}), {})
    assert.deepEqual(Shape({ a: Shape.Skip })({}), {})
  })


  test('a bare Key reference means Key()', () => {
    // Key takes only optional arguments, so a bare reference reads as a call
    // like the other nullary builders — and the string DSL already treats it
    // that way.
    assert.deepEqual(
      Shape({ a: { b: Shape.Key } })({ a: { b: 'V' } }),
      Shape({ a: { b: Shape.Key() } })({ a: { b: 'V' } }))

    assert.deepEqual(Shape({ a: { b: Shape.Key } })({ a: { b: 'V' } }), { a: { b: 'a' } })
  })


  test('a class reference is still an instance check', () => {
    class Foo { }

    assert.ok(Shape({ a: Foo })({ a: new Foo() }).a instanceof Foo)
    assert.match(
      failure({ a: Foo }, { a: 1 }),
      /is not an instance of Foo/)
  })


  test('type check precedes a size bound', () => {
    // The bound is meaningless on a value of the wrong type, and its message
    // would mask the real error.
    assert.match(
      failure(Shape.expr('Min(2,String)'), 1),
      /the number is not of type string/)

    assert.match(
      failure(Shape.expr('Min(2,String)'), true),
      /the boolean is not of type string/)

    assert.match(
      failure(Shape.expr('Max(2,Number)'), 'xyz'),
      /the string is not of type number/)

    // A bound on a value of the right type still reports the bound.
    assert.match(
      failure(Shape.expr('Min(2,String)'), 'a'),
      /must be a minimum length of 2/)

    assert.equal(Shape(Shape.expr('Min(2,String)'))('abc'), 'abc')

    // An untyped bound applies to anything, as before.
    assert.match(
      failure(Shape.expr('Min(2)'), [1]),
      /must be a minimum length of 2/)
  })


  test('the string DSL and the builder API agree on Optional', () => {
    // Type() dropped the fallback, so the DSL lost the default that the
    // builder injects for an absent key.
    assert.deepEqual(
      Shape({ a: Shape.expr('Optional(String)') })({}),
      Shape({ a: Shape.Optional(String) })({}))

    assert.deepEqual(Shape({ a: Shape.expr('Optional(String)') })({}), { a: '' })
    assert.deepEqual(Shape({ a: Shape.expr('Optional(Number)') })({}), { a: 0 })
  })


  test('a regexp check applies to strings and does not coerce', () => {
    const digits = Shape.expr('Check(/^[0-9]+$/)')

    assert.equal(Shape(digits)('12'), '12')

    // String(1).match(/^[0-9]+$/) used to make this pass.
    assert.match(failure(digits, 1), /check "\/\^\[0-9\]\+\$\/" failed/)
    assert.match(failure(digits, true), /check "\/\^\[0-9\]\+\$\/" failed/)
    assert.match(failure(digits, null), /check "\/\^\[0-9\]\+\$\/" failed/)
  })


  test('a failed container type check does not descend', () => {
    // One error for the container, not one per declared key on top of it.
    assert.equal(
      failure({ a: String }, 1),
      'Validation failed for number "1" because the number is not of type object.')

    assert.equal(
      failure({ a: String, b: Number }, 'x'),
      'Validation failed for string "x" because the string is not of type object.')

    // A genuinely absent key inside a real object still reports as required.
    assert.match(
      failure({ a: String }, {}),
      /property "a" with value "undefined" because the value is required/)
  })


  test('a container with an explicit default injects it as-is', () => {
    // Not rebuilt from the children's defaults, which would ignore the default
    // the node was actually given.
    assert.deepEqual(
      Shape({ a: Shape.Default({}, { b: 1, c: Number }) })({}),
      { a: {} })
  })


  test('Ignore drops a failing value wherever it appears', () => {
    // The dropped slot is left undefined, which is absent once serialized —
    // the form the shared corpus compares.
    const json = (v: any) => JSON.parse(JSON.stringify(v))

    assert.deepEqual(json(Shape([Shape.Ignore(Number)])([1, 'x'])), [1, null])
    assert.deepEqual(
      json(Shape(Shape.Child(Shape.Ignore(Number)))({ a: 'x', b: 1 })),
      { b: 1 })
    assert.equal(Shape(Shape.Ignore(Number))('x'), undefined)
  })


  test('a key expression keeps its example value', () => {
    // The example is appended as the innermost builder call's final argument.
    // Where the builder has room for it, it becomes the shape and supplies the
    // kind; where the builder's arity is already satisfied it is applied as the
    // value instead. Either way it survives.
    assert.deepEqual(Shape({ 'a: Optional(Any)': 5 })({}), { a: 5 })
    assert.deepEqual(Shape({ 'a: Optional(Number)': 5 })({}), { a: 5 })
    assert.deepEqual(Shape({ 'a: Optional(String)': 'z' })({}), { a: 'z' })
    assert.deepEqual(Shape({ 'a: Any': 5 })({}), { a: 5 })

    // The expression keeps the kind it declared...
    assert.deepEqual(Shape({ 'a: Any': 0 })({ a: 'x' }), { a: 'x' })
    assert.deepEqual(Shape({ 'a: One(String,Number)': 5 })({ a: 'q' }), { a: 'q' })

    // ...and a constraint-only expression takes the example's.
    assert.match(
      failure({ 'a: Min(2)': 0 }, { a: 'x' }),
      /the string is not of type number/)

    // A builder that consumed the example uses the kind it implies.
    assert.deepEqual(Shape({ 'a: Child(Number)': [] })({ a: [1, 2] }), { a: [1, 2] })
    assert.match(
      failure({ 'a: Child(Number)': [] }, { a: [1, 'x'] }),
      /is not of type number/)

    // Skip still injects nothing, and a bare literal expression keeps its own
    // value since there is no builder to hand the example to.
    assert.deepEqual(Shape({ 'a: Skip(Number)': 5 })({}), {})
    assert.deepEqual(Shape({ 'a: 5': 3 })({}), { a: 5 })
  })


  test('Func is chainable', () => {
    const fn = () => 0
    const shape = Shape({ a: Shape.Optional().Func() })

    assert.equal(shape({ a: fn }).a, fn)
    assert.match(failure({ a: Shape.Optional().Func() }, { a: 1 }),
      /is not of type function/)
  })

})


describe('kinds: nullable, integer, date', () => {
  const { Nullable, Integer, Optional, Min } = Shape as any

  test('Nullable accepts an explicit null and nothing else new', () => {
    assert.equal(Shape(Nullable(Number))(null), null)
    assert.equal(Shape(Nullable(Number))(5), 5)
    assert.match(failure(Nullable(Number), 'x'), /the string is not of type number/)

    // Absent is still governed by required/optional.
    assert.deepEqual(Shape({ a: Nullable(String) })({ a: null }), { a: null })
    assert.match(failure({ a: Nullable(Number) }, {}), /is required/)
    assert.deepEqual(Shape({ a: Optional(Nullable(Number)) })({}), { a: 0 })

    // Containers, bare use, and the chain.
    assert.equal(Shape(Nullable({ b: 1 }))(null), null)
    assert.deepEqual(Shape({ a: Nullable })({ a: null }), { a: null })
    assert.equal(Shape(Optional().Nullable().Number())(null), null)
    assert.equal(Shape(Shape.expr('Nullable(Number)'))(null), null)
  })

  test('Integer is a number with no fractional part', () => {
    assert.equal(Shape(Integer)(5), 5)
    assert.equal(Shape(Integer)(-0), -0)
    assert.match(failure(Integer, 1.5), /the number is not of type integer/)
    assert.match(failure(Integer, '5'), /the string is not of type integer/)
    assert.match(failure(Integer, NaN), /is not of type integer/)

    // A type token: required, default 0.
    assert.match(failure({ a: Integer }, {}), /is required/)
    assert.deepEqual(Shape({ a: Optional(Integer) })({}), { a: 0 })
    assert.deepEqual(Shape({ a: Shape.Integer() })({ a: 3 }), { a: 3 })

    // Bounds defer to the type check, and Type() knows the name.
    assert.match(failure(Shape.expr('Min(2,Integer)'), 1.5), /is not of type integer/)
    assert.match(failure(Shape.expr('Min(2,Integer)'), 1), /must be a minimum of 2/)
    assert.match(failure(Shape.expr('Type(Integer)'), 2.5), /is not of type integer/)
    assert.match(failure(Shape.Type('Integer'), 2.5), /is not of type integer/)
    assert.equal(Shape(Optional().Integer())(4), 4)
    assert.match(failure({ 'a: Integer': 0 }, { a: 1.5 }), /is not of type integer/)
  })

  test('Date is a kind, not an instance check', () => {
    const d = new Date(0)
    assert.equal(Shape(Date)(d), d)
    assert.match(failure(Date, 'x'), /the string is not of type date/)
    assert.match(failure(Date, new Date('nonsense')), /is not of type date/)
    assert.match(failure({ a: Date }, {}), /is required/)

    // No default to inject for an optional date — the slot is left undefined,
    // which is absent once serialized; a literal date is a default.
    assert.deepEqual(JSON.parse(JSON.stringify(Shape({ a: Optional(Date) })({}))), {})
    assert.deepEqual(Shape({ a: d })({}), { a: d })
    assert.equal(Shape(Optional().Date())(d), d)
    assert.match(failure(Shape.expr('Date'), 1), /the number is not of type date/)

    // A bound compares the instant, and reads as a value, not a length.
    const y2020 = Date.UTC(2020, 0, 1)
    assert.equal(Shape(Min(y2020, Date))(new Date(Date.UTC(2021, 0, 1))).getTime(), Date.UTC(2021, 0, 1))
    assert.match(
      failure(Min(y2020, Date), new Date(Date.UTC(2019, 5, 1))),
      /must be a minimum of 1577836800000 \(was 1559347200000\)/)

    // A Date value in an error message renders as JSON does.
    assert.equal(
      failure(Number, d),
      'Validation failed for object "1970-01-01T00:00:00.000Z" because the object is not of type number.')
  })

  test('rendering of the new kinds', () => {
    const r = (e: string) => Shape.stringify(Shape.expr(e), true)
    assert.equal(r('Integer'), 'Integer')
    assert.equal(r('Optional(Integer)'), '0')
    assert.equal(r('Min(2,Integer)'), 'Integer.Min(2)')
    assert.equal(r('Date'), 'Date')
    assert.equal(r('Nullable(Number)'), 'Number')
    assert.equal(Shape.stringify(Shape.nodize(new Date(0)), true), '1970-01-01T00:00:00.000Z')
  })

  test('a type token with arguments applies the type to them', () => {
    assert.match(failure(Shape.expr('String(Min(2))'), 'a'), /must be a minimum length of 2/)
    assert.equal(Shape(Shape.expr('String(Min(2))'))('abc'), 'abc')
    assert.match(failure(Shape.expr('Number(Max(1))'), 5), /must be a maximum of 1/)
  })
})


describe('coerce', () => {
  const { Coerce, Integer, Optional, Min, Nullable } = Shape as any

  test('to a number or integer', () => {
    const n = Shape(Coerce(Number))
    assert.equal(n('5'), 5)
    assert.equal(n(' 5 '), 5)
    assert.equal(n('1e3'), 1000)
    assert.equal(n('.5'), 0.5)
    assert.equal(n(true), 1)
    assert.equal(n(false), 0)
    assert.equal(n(7), 7)
    // Not decimal numerals: left alone, so the type error speaks.
    assert.match(failure(Coerce(Number), '0x10'), /the string is not of type number/)
    assert.match(failure(Coerce(Number), 'Infinity'), /is not of type number/)
    assert.match(failure(Coerce(Number), ''), /is not of type number/)
    assert.match(failure(Coerce(Number), null), /is not of type number/)
    assert.equal(Shape(Coerce(Integer))('5'), 5)
    assert.match(failure(Coerce(Integer), '5.5'), /is not of type integer/)
  })

  test('to a string or boolean', () => {
    const s = Shape(Coerce(String))
    assert.equal(s(1.5), '1.5')
    assert.equal(s(1000000), '1000000')
    assert.equal(s(true), 'true')
    assert.match(failure(Coerce(String), NaN), /is not of type string/)
    assert.match(failure(Coerce(String), null), /is not of type string/)

    const b = Shape(Coerce(Boolean))
    assert.equal(b(' TRUE '), true)
    assert.equal(b('0'), false)
    assert.equal(b(1), true)
    assert.equal(b(0), false)
    assert.match(failure(Coerce(Boolean), 'yes'), /is not of type boolean/)
    assert.match(failure(Coerce(Boolean), 2), /is not of type boolean/)
  })

  test('to a date, strictly', () => {
    const d = Shape(Coerce(Date))
    assert.equal(d('2020-01-01T00:00:00Z').getTime(), Date.UTC(2020, 0, 1))
    assert.equal(d('2020-01-01T12:30:00.5+02:00').getTime(), Date.UTC(2020, 0, 1, 10, 30, 0, 500))
    assert.equal(d('2020-02-29T00:00:00Z').getTime(), Date.UTC(2020, 1, 29))
    assert.equal(d(1577836800000).getTime(), 1577836800000)
    for (const bad of ['2021-02-29T00:00:00Z', '2020-02-30T00:00:00Z', '2020-13-01T00:00:00Z',
      '2020-01-01T24:00:00Z', '2020-01-01T00:00:00+24:00', '2020-01-01', 'x', Infinity]) {
      assert.match(failure(Coerce(Date), bad), /is not of type date/)
    }
  })

  test('placement and no-ops', () => {
    // Ahead of any bound, whichever way round it is written.
    assert.equal(Shape(Coerce(Min(2, Number)))('3'), 3)
    assert.match(failure(Coerce(Min(2, Number)), '1'), /must be a minimum of 2/)
    assert.match(failure(Min(2, Coerce(Number)), '1'), /must be a minimum of 2/)
    assert.equal(Shape(Nullable(Coerce(Number)))(null), null)
    assert.equal(Shape(Optional().Coerce().Number())('4'), 4)
    assert.equal(Shape(Shape.expr('Coerce(Number)'))('4'), 4)
    // Nothing to convert to: an untyped Coerce leaves everything alone.
    assert.equal(Shape(Coerce())('x'), 'x')
    assert.equal(Shape(Coerce(Shape.Any()))('x'), 'x')
    // An absent value is still absent: nothing is injected for it to convert.
    assert.match(failure({ a: Coerce(Number) }, {}), /is required/)
    assert.deepEqual(Shape({ a: Optional(Coerce(Number)) })({}), { a: 0 })
  })
})


describe('formats', () => {
  const { Email, Url, Uuid, DateTime, Ip, Ipv4, Ipv6, Optional, Nullable, Min, Fault, Any } =
    Shape as any

  const accepts = (b: any, vals: string[]) => {
    for (const v of vals) {
      assert.equal(Shape(b)(v), v, v)
    }
  }
  const rejects = (b: any, vals: string[], what: string) => {
    for (const v of vals) {
      assert.match(failure(b, v), new RegExp(' is not a valid ' + what + '\\.$'), v)
    }
  }

  test('Email', () => {
    accepts(Email, ['a@b.co', 'first.last+tag@sub.example.org', "o'neil@example.com",
      'A_B-c@x-y.example', 'a@b.museum'])
    rejects(Email, ['nope', '@b.co', 'a@', 'a@b', 'a@b.c', 'a..b@c.co', '.a@b.co', 'a.@b.co',
      'a@-b.co', 'a@b-.co', 'a@b..co', 'a b@c.co', 'a@b.c0',
      // Length limits: a 65-character local part, a 64-character label, 260 in all.
      'x'.repeat(65) + '@b.co', 'a@' + 'b'.repeat(64) + '.co',
      'x'.repeat(64) + '@' + ('a'.repeat(63) + '.').repeat(3) + 'com'], 'email address')
  })

  test('Url', () => {
    accepts(Url, ['http://example.com', 'https://a.b/c/d?e=f#g', 'ftp://user:pw@host:21/path',
      'http://[::1]:8080/x', 'custom+scheme.x://host', 'http://localhost', 'http://1.2.3.4/'])
    rejects(Url, ['example.com', 'http://', 'http:// example.com', 'http://exa mple.com/',
      '://host', 'http://host:port', '1http://host', 'mailto:a@b.co', 'http://@host',
      'http://host/a b'], 'URL')
  })

  test('Uuid', () => {
    accepts(Uuid, ['123e4567-e89b-12d3-a456-426614174000',
      '00000000-0000-0000-0000-000000000000', 'ABCDEF01-2345-6789-ABCD-EF0123456789'])
    rejects(Uuid, ['123e4567e89b12d3a456426614174000', '123e4567-e89b-12d3-a456-42661417400',
      '123e4567-e89b-12d3-a456-4266141740000', 'g23e4567-e89b-12d3-a456-426614174000',
      '{123e4567-e89b-12d3-a456-426614174000}'], 'UUID')
  })

  test('DateTime keeps the string', () => {
    accepts(DateTime, ['2020-01-01T00:00:00Z', '2020-02-29T23:59:59.999+05:30'])
    rejects(DateTime, ['2020-01-01', '2021-02-29T00:00:00Z', '2020-01-01 00:00:00Z', 'now', ''],
      'ISO 8601 date-time')
    assert.equal(typeof Shape(DateTime)('2020-01-01T00:00:00Z'), 'string')
  })

  test('Ipv4, Ipv6 and Ip', () => {
    const v4ok = ['0.0.0.0', '127.0.0.1', '255.255.255.255', '1.2.3.4']
    const v4bad = ['256.0.0.1', '1.2.3', '1.2.3.4.5', '01.2.3.4', '1.2.3.4 ', '::1', 'a.b.c.d',
      '1.2.3.-4', '']
    const v6ok = ['::', '::1', '1::', 'fe80::1', '2001:db8::8a2e:370:7334', '1:2:3:4:5:6:7:8',
      '::ffff:192.168.1.1', '::1.2.3.4', '1:2:3:4:5:6:1.2.3.4', '1:2:3:4:5:6:7::',
      'ABCD:EF01:2345:6789:abcd:ef01:2345:6789']
    const v6bad = ['1.2.3.4', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', '1::2::3', ':::',
      ':1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8::', '12345::', 'g::1', '1::2:', 'fe80::1%eth0',
      '::1/64', '1:2:3:4:5:6::1.2.3.4', '1.2.3.4::', '1:2:3:4:5:6:7:1.2.3.4', '', ':']

    accepts(Ipv4, v4ok)
    rejects(Ipv4, v4bad, 'IPv4 address')
    accepts(Ipv6, v6ok)
    rejects(Ipv6, v6bad, 'IPv6 address')
    accepts(Ip, v4ok.concat(v6ok))
    rejects(Ip, ['x', '1.2.3', '1::2::3', ''], 'IP address')
  })

  test('placement, typing and rendering', () => {
    // A format is a shape of string: required by default, '' when optional.
    assert.match(failure({ a: Email }, {}), /is required/)
    assert.deepEqual(Shape({ a: Optional(Email) })({}), { a: '' })
    assert.deepEqual(Shape({ a: Email(Nullable(String)) })({ a: null }), { a: null })
    assert.match(failure({ a: Email }, { a: 1 }), /the number is not of type string/)
    assert.match(failure(Email(Any()), 1), /is not of type string/)

    // Like .String(), a chained format re-asserts the string type.
    assert.match(failure({ a: Optional().Email() }, {}), /is required/)
    assert.equal(Shape(Optional().Uuid())('123e4567-e89b-12d3-a456-426614174000'),
      '123e4567-e89b-12d3-a456-426614174000')

    // Befores run in the order they were added; every failing one speaks.
    assert.equal(failure(Email(Min(10, String)), 'nope'),
      'Value "nope" for property "" must be a minimum length of 10 (was 4).\n' +
      'Value "nope" for property "" is not a valid email address.')
    assert.match(failure(Min(10, Email), 'a@b.co'), /^Value "a@b.co" for property "" must be a minimum length of 10 \(was 6\)\.$/)

    // The format's own text survives Fault; the type error takes it.
    assert.equal(failure(Fault('boom', Email), 'bad'),
      'Value "bad" for property "" is not a valid email address.')
    assert.equal(failure(Fault('boom', Email), 1), 'boom')

    assert.equal(Shape(Shape.expr('Email'))('a@b.co'), 'a@b.co')
    assert.deepEqual(Shape({ a: Shape.expr('Optional(Url)') })({}), { a: '' })
    assert.match(failure(Shape.expr('Uuid(Min(2,String))'), 'x'), /minimum length of 2/)

    assert.equal(Shape.stringify(Email(String), true), 'String.Email')
    assert.equal(Shape.stringify(Shape.expr('Ipv6'), true), 'String.Ipv6')

    const ctx: any = { err: [] }
    Shape(Email)('nope', ctx)
    assert.equal(ctx.err[0].why, 'Email')
    assert.equal(ctx.err[0].check, 'Email')
  })
})


describe('checks run in order', () => {
  const { After, Before, Check, Fault, Min, Never, Optional, Skip } = Shape as any

  test('a failing before ends the structural checks; the afters still run', () => {
    assert.match(failure(After(() => false, Min(2, Number)), 1),
      /^Value "1" for property "" must be a minimum of 2 \(was 1\)\.\nValidation failed for number "1" because check ".*" failed\.$/)
    assert.match(failure(After(() => false, Number), 'x'),
      /is not of type number\.\nValidation failed for string "x" because check ".*" failed\.$/)
    assert.match(failure(After(() => false, Never()), 1),
      /no value is allowed\.\nValidation failed for number "1" because check ".*" failed\.$/)
  })

  test('Fault replaces structural text, not a check\'s own', () => {
    assert.equal(failure(Fault('boom', Min(2, Number)), 1),
      'Value "1" for property "" must be a minimum of 2 (was 1).')
    assert.equal(failure(Fault('boom', Check(() => false)), 'x'), 'boom')
    assert.equal(failure(Fault('boom', Check((_v: any, u: any) => (u.err = 'custom', false))), 'x'),
      'custom')
    assert.equal(failure(Fault('boom', After(() => false, Number)), 1), 'boom')
    assert.equal(failure(Fault('boom', String), 1), 'boom')
  })

  test('an absent value on an unrequired node raises nothing from its checks', () => {
    assert.deepEqual(Shape({ a: After(() => false, Skip(Number)) })({}), {})
    assert.deepEqual(Shape({ a: Before(() => false, Optional(Number)) })({}), { a: 0 })
    assert.match(failure({ a: Before(() => false, Number) }, {}),
      /^Validation failed for property "a" with value "undefined" because check ".*" failed\.$/)
    assert.match(failure({ a: After(() => false, Number) }, {}),
      /is required\.\nValidation failed for property "a" with value "undefined" because check ".*" failed\.$/)
    // ...unless the check insists.
    assert.match(
      failure({ a: Before((_v: any, u: any) => (u.done = true, false), Optional(Number)) }, {}),
      /check ".*" failed\.$/)
  })
})


describe('isolation: Catch, Transform, Describe, Ignore', () => {
  const { Catch, Transform, Describe, Ignore, Min, Optional, Required } = Shape as any
  const json = (v: any) => JSON.parse(JSON.stringify(v))

  test('Catch replaces whatever fails inside with the fallback', () => {
    assert.equal(Shape(Catch(0, Number))('x'), 0)
    assert.equal(Shape(Catch(0, Number))(5), 5)
    assert.deepEqual(Shape({ o: Catch({ a: 0 }, { a: Number }) })({ o: { a: 'x' } }), { o: { a: 0 } })
    assert.deepEqual(Shape({ o: Catch({ a: 0 }, { a: Number }) })({ o: { a: 1 } }), { o: { a: 1 } })

    // The checks it wraps are inside the catch; the checks that wrap it are not.
    assert.equal(Shape(Catch(0, Min(2, Number)))(1), 0)
    assert.match(failure(Min(2, Catch(0, Number)), 'x'), /must be a minimum of 2 \(was 0\)/)

    // Required and optional still apply, inside the catch.
    assert.deepEqual(Shape({ a: Catch(7, Number) })({}), { a: 7 })
    assert.deepEqual(Shape({ a: Optional(Catch(7, Number)) })({}), { a: 0 })

    // The fallback is a fresh copy each time.
    const s = Shape({ a: Catch({ n: 1 }, { n: Number }) })
    const r1 = s({ a: 'x' }), r2 = s({ a: 'x' })
    r1.a.n = 9
    assert.equal(r2.a.n, 1)
    const deep = Shape({ a: Catch({ n: { m: [1] } }, { n: Number }) })
    const d1 = deep({ a: 'x' }), d2 = deep({ a: 'x' })
    d1.a.n.m.push(2)
    assert.deepEqual(d2.a.n.m, [1])

    assert.deepEqual(Shape({ a: Catch(null, Number) })({ a: 'x' }), { a: null })
    assert.equal(Shape(Shape.expr('Catch(0,Number)'))('x'), 0)
    assert.deepEqual(Shape({ a: Shape.expr('Catch("none",Min(2,String))') })({ a: 'x' }), { a: 'none' })
    assert.equal(Shape(Required(Number).Catch(-1))('x'), -1)
    assert.equal(Shape.stringify(Catch(0, Min(2, Number)), true), 'Number.Min(2).Catch(0)')
    assert.equal(Shape.stringify(Catch('x', String), true), 'String.Catch(x)')
  })

  test('Transform maps a valid value; an invalid one fails as it would have', () => {
    const add = (o: any) => ({ ...o, n: o.a + 1 })
    assert.deepEqual(Shape({ o: Transform(add, { a: Number }) })({ o: { a: 1 } }), { o: { a: 1, n: 2 } })
    assert.equal(
      failure({ o: Transform(add, { a: Number }) }, { o: { a: 'x' } }),
      failure({ o: { a: Number } }, { o: { a: 'x' } }))
    assert.equal(
      failure({ a: Transform((v: number) => v * 2, Min(2, Number)) }, { a: 1 }),
      'Value "1" for property "a" must be a minimum of 2 (was 1).')
    assert.deepEqual(Shape({ a: Transform((v: number) => v * 2, Min(2, Number)) })({ a: 3 }), { a: 6 })

    // The produced value is what is transformed: defaults included.
    assert.deepEqual(Shape({ a: Optional(Transform((v: number) => v + 1, Number)) })({}), { a: 1 })

    // The state is at hand: here, the key.
    assert.deepEqual(Shape({ k: Transform((_v: any, s: any) => s.key, String) })({ k: 'x' }), { k: 'k' })

    assert.equal(Shape(Required(Number).Transform((v: number) => -v))(2), -2)
    assert.equal(Shape.stringify(Transform((v: any) => v, Min(2, Number)), true), 'Number.Min(2).Transform')
  })

  test('Describe attaches a description', () => {
    assert.equal(Shape.nodize(Describe('a number', Number)).m.description, 'a number')
    assert.equal(Shape.nodize(Shape.expr('Describe("a number",Number)')).m.description, 'a number')
    assert.equal(Shape(Describe('a number', Number))(1), 1)
    assert.match(failure(Describe('a number', Number), 'x'), /is not of type number/)

    // Chained, and kept when wrapped.
    assert.equal(Shape.nodize(Optional(Describe('x', Number))).m.description, 'x')
    assert.equal(Shape.nodize(Required().Describe('y').Number()).m.description, 'y')
  })

  test('Ignore swallows the whole subtree', () => {
    assert.deepEqual(json(Shape({ o: Ignore({ a: Number }) })({ o: { a: 'x' } })), {})
    assert.deepEqual(Shape({ o: Ignore({ a: Number }) })({ o: { a: 1 } }), { o: { a: 1 } })
    assert.deepEqual(json(Shape([Ignore(Number)])([1, 'x', 3])), [1, null, 3])
    assert.equal(Shape(Ignore(Number))('x'), undefined)
    assert.deepEqual(json(Shape({ a: Ignore(Min(2, Number)) })({ a: 1 })), {})
    assert.deepEqual(Shape({ a: Ignore(Min(2, Number)) })({ a: 3 }), { a: 3 })
    assert.equal(Shape.stringify(Ignore(Min(2, Number)), true), '0.Min(2)')
  })
})


describe('discriminated union', () => {
  const { Discriminated, Optional, Closed, Open } = Shape as any
  const json = (v: any) => JSON.parse(JSON.stringify(v))
  const D = Discriminated('kind', { dog: { bark: Boolean }, fish: { fins: Number } })

  test('chooses the branch by the tag and reports its errors alone', () => {
    assert.deepEqual(Shape({ p: D })({ p: { bark: true, kind: 'dog' } }), { p: { bark: true, kind: 'dog' } })
    assert.deepEqual(Shape(D)({ fins: 2, kind: 'fish' }), { fins: 2, kind: 'fish' })
    assert.equal(failure({ p: D }, { p: { fins: 'x', kind: 'fish' } }),
      'Validation failed for property "p.fins" with string "x" because the string is not of type number.')
    assert.equal(failure({ p: D }, { p: { kind: 'dog' } }),
      'Validation failed for property "p.bark" with value "undefined" because the value is required.')
  })

  test('the tag itself', () => {
    assert.equal(failure({ p: D }, { p: { bark: true } }),
      'Value "{bark:true}" for property "p" is not an object with a "kind" property.')
    assert.equal(failure({ p: D }, { p: 1 }),
      'Value "1" for property "p" is not an object with a "kind" property.')
    assert.equal(failure({ p: D }, { p: [] }),
      'Value "[]" for property "p" is not an object with a "kind" property.')
    assert.equal(failure(D, null),
      'Value "null" for property "" is not an object with a "kind" property.')
    assert.equal(failure({ p: D }, { p: { kind: 'cat' } }),
      'Value "{kind:cat}" for property "p" has unknown "kind" "cat", expected one of: dog, fish.')
    assert.equal(failure({ p: D }, { p: { kind: 1 } }),
      'Value "{kind:1}" for property "p" has unknown "kind" 1, expected one of: dog, fish.')
    assert.equal(failure({ p: D }, { p: { kind: null } }),
      'Value "{kind:null}" for property "p" has unknown "kind" null, expected one of: dog, fish.')
    // A prototype property is not a branch.
    assert.match(failure({ p: D }, { p: { kind: 'constructor' } }), /has unknown "kind" "constructor"/)
  })

  test('required, optional, arrays, and the shape of a branch', () => {
    assert.equal(failure({ p: D }, {}),
      'Validation failed for property "p" with value "undefined" because the value is required.')
    assert.deepEqual(json(Shape({ p: Optional(D) })({})), {})
    assert.equal(failure([D], [{ bark: true, kind: 'dog' }, { kind: 'cat' }]),
      'Value "{kind:cat}" for property "1" has unknown "kind" "cat", expected one of: dog, fish.')

    // The tag is added to an object branch that lacks it; an explicit one is kept.
    assert.deepEqual(
      Shape(Discriminated('kind', { dog: Closed({ kind: String, bark: Boolean }) }))({ kind: 'dog', bark: true }),
      { kind: 'dog', bark: true })
    assert.deepEqual(
      Shape(Discriminated('kind', { dog: Open({ bark: Boolean }) }))({ kind: 'dog', bark: true, x: 1 }),
      { kind: 'dog', bark: true, x: 1 })

    // A branch need not be an object shape; the value still has to be one to carry the tag.
    assert.match(failure(Discriminated('kind', { dog: String }), { kind: 'dog' }), /the object is not of type string/)
  })

  test('construction, rendering and the why-code', () => {
    assert.throws(() => Discriminated('', { a: {} }), /needs a tag property name and at least one branch/)
    assert.throws(() => Discriminated('k', {}), /needs a tag/)
    assert.throws(() => Discriminated('k', []), /needs a tag/)
    assert.equal(Shape.stringify(D, true), 'Discriminated(kind,dog,fish)')
    assert.equal(Shape.stringify(Optional(D), true), 'Discriminated(kind,dog,fish)')

    const ctx: any = { err: [] }
    Shape({ p: D })({ p: { kind: 'cat' } }, ctx)
    assert.equal(ctx.err[0].why, 'Discriminated')
    assert.equal(ctx.err[0].check, 'Discriminated')
  })
})


describe('object algebra: Pick, Omit, Partial, Extend', () => {
  const { Pick, Omit, Partial, Extend, Closed, Open, Optional, Required } = Shape as any
  const json = (v: any) => JSON.parse(JSON.stringify(v))
  const BASE = () => ({ a: Number, b: String, c: Optional(Boolean) })

  test('Pick keeps only the named properties', () => {
    assert.deepEqual(Shape(Pick(['a'], BASE()))({ a: 1 }), { a: 1 })
    assert.deepEqual(Shape(Pick(['a', 'c'], BASE()))({ a: 1 }), { a: 1, c: false })
    // What was dropped is no longer declared, so a closed object rejects it.
    assert.match(failure(Pick(['a'], BASE()), { a: 1, b: 'x' }),
      /the property "b" is not allowed/)
    // A name that is not a property is an error: there is nothing to pick.
    assert.throws(() => Pick(['a', 'zz'], BASE()), /Pick: unknown property "zz"/)
    // Omitting one is not: it is simply not there to drop.
    assert.deepEqual(Shape(Omit(['zz'], BASE()))({ a: 1, b: 'x' }), { a: 1, b: 'x', c: false })
  })

  test('Omit drops the named properties, and what is kept stays as it was', () => {
    assert.deepEqual(Shape(Omit(['b'], BASE()))({ a: 1 }), { a: 1, c: false })
    assert.match(failure(Omit(['b'], BASE()), {}), /property "a" .* is required/)
    assert.match(failure(Omit(['b'], BASE()), { a: 1, b: 'x' }),
      /the property "b" is not allowed/)
  })

  test('Partial makes every property optional, one level deep', () => {
    assert.deepEqual(Shape(Partial(BASE()))({}), { a: 0, b: '', c: false })
    // Optional, not untyped: a present value of the wrong type still fails.
    assert.match(failure(Partial(BASE()), { a: 'x' }), /is not of type number/)
    // One level only: a required grandchild stays required.
    assert.match(
      failure({ o: Partial({ a: Number, b: { c: String } }) }, { o: { b: {} } }),
      /property "o\.b\.c" .* is required/)
  })

  test('Extend adds properties, and a name in both takes the new shape', () => {
    assert.deepEqual(Shape(Extend({ d: Number }, BASE()))({ a: 1, b: 'x', d: 2 }),
      { a: 1, b: 'x', d: 2, c: false })
    assert.deepEqual(Shape(Extend({ a: String }, BASE()))({ a: 'x', b: 'y' }),
      { a: 'x', b: 'y', c: false })
    assert.match(failure(Extend({ d: Number }, BASE()), { a: 1, b: 'x' }),
      /property "d" .* is required/)
    // Whether unknown properties are allowed is not changed by extending.
    assert.deepEqual(Shape(Extend({ d: Number }, Open(BASE())))({ a: 1, b: 'x', d: 2, z: 9 }),
      { a: 1, b: 'x', d: 2, z: 9, c: false })
  })

  test('the shape given is left as it was', () => {
    const base = BASE()
    Pick(['a'], base)
    Omit(['a'], base)
    Partial(base)
    Extend({ d: Number }, base)
    assert.match(failure(base, {}), /property "a" .* is required/)
    assert.deepEqual(Shape(base)({ a: 1, b: 'x' }), { a: 1, b: 'x', c: false })
  })

  test('key expressions resolve before a name is matched', () => {
    const spec = { 'a: Integer': 0, b: String }
    assert.deepEqual(Shape(Pick(['a'], spec))({ a: 1 }), { a: 1 })
    assert.match(failure(Pick(['a'], spec), { a: 1.5 }), /is not of type integer/)
    assert.deepEqual(Shape(Omit(['b'], spec))({ a: 1 }), { a: 1 })
  })

  test('openness, chaining, the string DSL, and a non-object shape', () => {
    assert.deepEqual(Shape(Open(BASE()).Omit(['c']))({ a: 1, b: 'x', z: 9 }),
      { a: 1, b: 'x', z: 9 })
    assert.deepEqual(Shape(Closed(BASE()).Pick(['b']))({ b: 'x' }), { b: 'x' })
    assert.deepEqual(Shape(Closed({ a: Number }).Partial())({}), { a: 0 })

    assert.equal(Shape(Pick(['a'], BASE())).stringify(), '{"a":"Number"}')
    assert.deepEqual(json(Shape(Shape.expr('Partial(Closed({}))'))({})), {})
    assert.throws(() => Shape.expr('Pick(["a"],Closed({}))'), /Pick: unknown property "a"/)
    assert.deepEqual(json(Shape(Shape.expr('Omit(["a"],Closed({}))'))({})), {})

    assert.throws(() => Pick(['a'], Number), /Pick needs an object shape/)
    assert.throws(() => Omit(['a'], Number), /Omit needs an object shape/)
    assert.throws(() => Partial(Number), /Partial needs an object shape/)
    assert.throws(() => Extend({ d: Number }, Number), /Extend needs an object shape/)
    assert.throws(() => Extend(Number, BASE()), /Extend needs an object to extend with/)
  })
})

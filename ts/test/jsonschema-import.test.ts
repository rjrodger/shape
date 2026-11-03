import { test, describe } from 'node:test'
import { equal, deepEqual, throws } from 'node:assert'

import {
  Shape, fromJsonSchema, Min, Max, Above, Below, Len, Empty, Optional, Skip, Exact, One, All, Nullable,
  Never, Any, Describe, Discriminated, Define, Refer, Child, Rest, Closed, Open, Email, Url, Uuid, DateTime,
  Ipv4, Ipv6, Ip, Integer, Required, Default, Nof,
} from '../dist/shape'


// Export, import, export: the same document comes back.
function roundTrip(name: string, spec: any, expectDifferent?: boolean) {
  test('round-trip-' + name, () => {
    const a = Shape(spec).jsonSchema()
    const b = Shape(fromJsonSchema(a)).jsonSchema()
    if (expectDifferent) {
      return
    }
    deepEqual(b, a)
  })
}


describe('jsonschema-import', () => {
  roundTrip('flat', { a: Integer, b: String, c: Boolean, d: Number })
  roundTrip('defaults', { port: 8080, host: 'localhost', on: true })
  roundTrip('skip', { a: Skip(String), b: Skip({ c: 1 }) })
  roundTrip('nested', { a: { b: { c: String } }, t: [String] })
  roundTrip('open', Open({ a: 1 }))
  roundTrip('child', Child(Number, { a: 1 }))
  roundTrip('closed-empty', Closed({}))
  roundTrip('empty-open', {})
  roundTrip('tuple', [String, Number])
  roundTrip('closed-tuple', Closed([String, Number]))
  roundTrip('rest', Rest(Number, [String]))
  roundTrip('open-tuple', Rest(Any, [String, Number]))
  roundTrip('open-one-tuple', Rest(Any, Closed([String])))
  roundTrip('typed-rest-tuple', Rest(Number, Closed([String])))
  roundTrip('untyped-bounds', { a: Min(1), b: Max(3), c: Above(1), d: Below(3), e: All(Number, Min(1)) })
  roundTrip('bounds', {
    a: Min(3, String), b: Max(9, Number), c: Above(0, Integer), d: Below(1, Number), e: Len(2, [Number]),
    f: Max(2, Min(1, { x: 1 })),
  })
  roundTrip('empty-string', Empty(String))
  roundTrip('regexp', /^a+$/)
  roundTrip('regexp-bounds', Min(2, /^a+$/))
  roundTrip('formats', { a: Email, b: Url, c: Uuid, d: DateTime, e: Ipv4, f: Ipv6, g: Ip })
  roundTrip('exact', { a: Exact('x', 'y'), b: Exact(1), c: Exact(true, false) })
  roundTrip('one', One(String, Number))
  roundTrip('all', All(Number, Min(1, Number)))
  // Every count JSON Schema has a keyword for comes back as it went.
  roundTrip('nof-one', Nof(1, String, Number))
  roundTrip('nof-none', Nof(0, String))
  roundTrip('nof-none-of-many', Nof(0, String, Number))
  roundTrip('nof-every', Nof(2, String, Number))
  roundTrip('nof-some', Nof(Min(1), String, Number))
  roundTrip('nof-not-every', Nof(Max(1), String, Number))
  roundTrip('nof-property', { a: Optional(Nof(1, String, Number)) })

  // A count bounded on both sides exports anyOf and not, and comes back as
  // an allOf of the two.
  test('round-trip-nof-bounded', () => {
    const a = Shape(Nof(Max(2, Min(1)), String, Number, Boolean)).jsonSchema()
    const b = Shape(fromJsonSchema(a)).jsonSchema()
    deepEqual(b.allOf, [{ not: a.not }, { anyOf: a.anyOf }])
  })
  roundTrip('nullable', { a: Nullable(Number), b: Nullable(Empty(String)) })
  roundTrip('never', { a: Never })
  roundTrip('any', { a: Any })
  roundTrip('describe', Describe('top', { a: Describe('d', Empty(String)) }))
  roundTrip('discriminated', Discriminated('k', { a: { x: 1 }, b: { y: String } }))
  roundTrip('null-literal', { a: null })
  roundTrip('required-null', { a: Required(null) })
  roundTrip('integer-optional', { a: Optional(Integer) })
  roundTrip('default-object', { a: Default({ x: 1 }, { x: Number }) })
  roundTrip('default-child', Default({}, Child(Number, {})))

  // A recursive definition comes back as one: Define at its outermost
  // expansion, Refer within.
  test('round-trip-recursive', () => {
    const spec = Define('t', { v: 1, kids: [Refer('t')] })
    const a = Shape(spec).jsonSchema()
    const b = Shape(fromJsonSchema(a)).jsonSchema()
    deepEqual(b.$defs, a.$defs)
    deepEqual(b.properties.kids.items.properties.kids.items, { $ref: '#/$defs/t' })
    const shape = Shape(fromJsonSchema(a))
    deepEqual(shape({ kids: [{ kids: [{}] }] }), { v: 1, kids: [{ v: 1, kids: [{ v: 1 }] }] })
    throws(() => shape({ kids: [{ kids: [{ v: 'x' }] }] }), /kids\.0\.kids\.0\.v/)
  })

  test('round-trip-recursive-child', () => {
    const a = Shape(Define('t', { v: 1, more: Child(Refer('t'), {}) })).jsonSchema()
    const b = Shape(fromJsonSchema(a)).jsonSchema()
    deepEqual(b.$defs, a.$defs)
  })

  // A definition used more than once is inlined at each use; a Date exports
  // as a date-time string and comes back as one.
  test('round-trip-lossy', () => {
    const a = Shape({ b: Define('x', { q: 1 }), a: Refer('x') }).jsonSchema()
    const b = Shape(fromJsonSchema(a)).jsonSchema()
    equal(b.$defs, undefined)
    deepEqual(b.properties.a, a.$defs.x)

    const d = Shape(fromJsonSchema(Shape({ a: Date }).jsonSchema())).jsonSchema()
    deepEqual(d.properties.a, { type: 'string', minLength: 1, format: 'date-time' })
  })

  test('validates-like-the-schema', () => {
    const shape = Shape(fromJsonSchema({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer', minimum: 0, default: 1 },
        tags: { type: 'array', items: { type: 'string' } },
        addr: {
          type: 'object',
          properties: { zip: { type: 'string', pattern: '^[0-9]{5}$' } },
          required: ['zip'],
          additionalProperties: false,
        },
      },
      required: ['name'],
    }))
    deepEqual(shape({ name: 'a', extra: 1 }), { name: 'a', extra: 1, age: 1 })
    deepEqual(shape({ name: '' }), { name: '', age: 1 })
    throws(() => shape({ name: 'a', age: -1 }), /must be a minimum of 0/)
    throws(() => shape({ name: 'a', age: 1.5 }), /not of type integer/)
    throws(() => shape({ name: 'a', addr: { zip: '1' } }), /did not match/)
    throws(() => shape({ name: 'a', addr: { zip: '12345', x: 1 } }), /property "x" is not allowed/)
    throws(() => shape({}), /property "name".*missing/)
    throws(() => shape({ name: 'a', tags: [1] }), /tags\.0/)
  })

  test('keywords', () => {
    const v = (schema: any, input: any) => Shape(fromJsonSchema(schema))(input)
    // Types.
    equal(v({ type: ['string', 'number'] }, 3), 3)
    equal(v({ type: ['string', 'null'] }, null), null)
    equal(v({ type: 'null' }, null), null)
    throws(() => v({ type: 'null' }, 1), /not of type null/)
    throws(() => v({ type: ['string', 'number'] }, true), /does not satisfy one of/)
    equal(v({ type: 'boolean' }, false), false)
    equal(v({}, 'anything'), 'anything')
    deepEqual(v({ properties: { a: { type: 'number' } } }, { a: 1, b: 2 }), { a: 1, b: 2 })
    deepEqual(v({ items: { type: 'number' } }, [1]), [1])
    deepEqual(v({ required: ['a'] }, { a: 1 }), { a: 1 })
    throws(() => v({ required: ['a'] }, {}), /missing/)

    // Boolean schemas.
    deepEqual(v({ type: 'object', properties: { a: true } }, { a: 1 }), { a: 1 })
    throws(() => v({ type: 'object', properties: { b: false } }, { b: 1 }), /no value is allowed/)
    throws(() => v({ type: 'object', properties: { b: false } }, {}), /no value is allowed/)

    // Numbers, including draft-4 boolean exclusives.
    throws(() => v({ type: 'number', minimum: 1, exclusiveMinimum: true }, 1), /above 1/)
    throws(() => v({ type: 'number', maximum: 1, exclusiveMaximum: true }, 1), /below 1/)
    throws(() => v({ type: 'number', exclusiveMaximum: 1 }, 1), /below 1/)
    throws(() => v({ type: 'number', maximum: 1 }, 2), /maximum of 1/)
    equal(v({ type: 'number', minimum: 1, maximum: 1 }, 1), 1)

    // Strings.
    equal(v({ type: 'string', minLength: 1 }, 'a'), 'a')
    throws(() => v({ type: 'string', minLength: 1 }, ''), /empty string/)
    throws(() => v({ type: 'string', minLength: 2 }, 'a'), /minimum length of 2/)
    throws(() => v({ type: 'string', maxLength: 2 }, 'abc'), /maximum length of 2/)
    equal(v({ type: 'string', minLength: 0 }, ''), '')
    equal(v({ type: 'string', format: 'email' }, 'a@b.co'), 'a@b.co')
    throws(() => v({ type: 'string', format: 'email' }, 'nope'), /email/)
    equal(v({ type: 'string', format: 'unknown-format' }, ''), '')
    equal(v({ type: 'string', pattern: '^1', format: 'uuid' }, '123e4567-e89b-12d3-a456-426614174000').length, 36)
    throws(() => v({ type: 'string', pattern: '^1', format: 'uuid' }, '223e4567-e89b-12d3-a456-426614174000'), /did not match/)
    throws(() => v({ type: 'string', pattern: '^1', format: 'uuid' }, '1'), /UUID/)
    throws(() => v({ type: 'string', anyOf: [{ format: 'ipv4' }, { format: 'ipv6' }] }, 'x'), /IP address/)

    // Enum and const, with and without a type.
    throws(() => v({ type: 'string', enum: ['a', 'b'] }, 'c'), /exactly one of: a, b/)
    equal(v({ enum: [1, 2] }, 2), 2)
    throws(() => v({ const: 'x' }, 'y'), /exactly one of: x/)

    // Objects.
    throws(() => v({ type: 'object', additionalProperties: false }, { a: 1 }), /not allowed/)
    throws(() => v({ type: 'object', additionalProperties: { type: 'number' } }, { a: 'x' }), /not of type number/)
    throws(() => v({ type: 'object', minProperties: 1 }, {}), /minimum length of 1/)
    throws(() => v({ type: 'object', maxProperties: 1 }, { a: 1, b: 2 }), /maximum length of 1/)

    // Arrays.
    deepEqual(v({ type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }] }, ['a', 1, true]), ['a', 1, true])
    deepEqual(v({ type: 'array', prefixItems: [{ type: 'string' }], items: true }, ['a', 1]), ['a', 1])
    deepEqual(v({ type: 'array', items: true }, ['a', 1]), ['a', 1])
    deepEqual(v({ type: 'object', additionalProperties: true }, { z: 1 }), { z: 1 })
    deepEqual(v({ type: 'object', required: 'a' }, {}), {})
    throws(() => v({ type: 'array', prefixItems: [{ type: 'string' }], items: false }, ['a', 1]), /not allowed/)
    throws(() => v({ type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'number' } }, ['a', 'b']), /not of type number/)
    deepEqual(v({ type: 'array' }, [1, 'a']), [1, 'a'])
    throws(() => v({ type: 'array', minItems: 1 }, []), /minimum length of 1/)
    throws(() => v({ type: 'array', maxItems: 1 }, [1, 2]), /maximum length of 1/)

    // Compositions.
    // A oneOf is a count of exactly one: two branches satisfied is a failure.
    throws(() => v({ oneOf: [{ type: 'string' }, { type: 'number' }] }, true),
      /satisfies 0 of: String, Number; the count must be 1\.$/)
    throws(() => v({ oneOf: [{ type: 'number' }, { type: 'integer' }] }, 1),
      /satisfies 2 of: Number, Integer; the count must be 1\.$/)
    equal(v({ oneOf: [{ type: 'number' }, { type: 'integer' }] }, 1.5), 1.5)
    throws(() => v({ allOf: [{ type: 'number' }, { minimum: 1 }] }, 0), /does not satisfy all of: Number, Min\(1\)/)
    throws(() => v({ minLength: 2 }, 'a'), /minimum length of 2/)
    throws(() => v({ maxItems: 1 }, [1, 2]), /maximum length of 1/)
    throws(() => v({ exclusiveMinimum: 1 }, 1), /above 1/)
    throws(() => v({ minimum: 1, exclusiveMinimum: true }, 1), /above 1/)
    equal(v({ minProperties: 1, maxProperties: 9 }, 'x'), 'x')
    equal(v({ exclusiveMinimum: true }, 0), 0)
    equal(v({ pattern: '^a' }, 'a'), 'a')
    throws(() => v({ format: 'email' }, 'x'), /email/)
    throws(() => v({ anyOf: [{ format: 'ipv4' }, { format: 'ipv6' }] }, 'x'), /IP address/)
    deepEqual(v({ type: 'array', prefixItems: [{ type: 'string' }] }, ['a', 1]), ['a', 1])
    throws(() => v({ type: 'array', prefixItems: [{ type: 'string' }] }, [1]), /not of type string/)
    throws(() => v({ type: 'array', prefixItems: [{ type: 'string' }], items: false }, ['a', 'b']), /not allowed/)
    throws(() => v({ not: {} }, 1), /no value is allowed/)
    equal(v({ not: { type: 'string' } }, 1), 1)
    // Any other not is a count of none, and holds beside the other keywords.
    throws(() => v({ not: { type: 'string' } }, 'x'), /satisfies 1 of: String; the count must be 0\.$/)
    throws(() => v({ not: true }, 1), /satisfies 1 of: Any; the count must be 0\.$/)
    equal(v({ type: 'string', not: { pattern: '^a' } }, 'b'), 'b')
    throws(() => v({ type: 'string', not: { pattern: '^a' } }, 'ab'), /does not satisfy all of: Nof\(0,\/\^a\/\), String/)
    throws(() => v({ type: 'string', not: { pattern: '^a' } }, 1), /does not satisfy all of/)
    throws(() => v({ enum: ['a', 'b'], not: {} }, 'a'), /no value is allowed/)
    // Not sees the value as given, before a default fills it.
    deepEqual(v({ type: 'object', properties: { a: { default: 1 } }, not: { required: ['a'] } }, {}), { a: 1 })
    throws(() => v({ type: 'object', properties: { a: { default: 1 } }, not: { required: ['a'] } }, { a: 2 }),
      /does not satisfy all of/)

    // A discriminated oneOf, and a oneOf whose branches overlap.
    const disc = Shape(fromJsonSchema({
      oneOf: [
        { type: 'object', properties: { k: { const: 'a' }, x: { type: 'number' } }, required: ['k', 'x'] },
        { type: 'object', properties: { k: { const: 'b' } }, required: ['k'] },
      ],
    }))
    deepEqual(disc({ k: 'a', x: 1 }), { k: 'a', x: 1 })
    throws(() => disc({ k: 'a', x: 'no' }), /property "x"/)
    throws(() => disc({ k: 'c' }), /k/)
    const notDisc = Shape(fromJsonSchema({
      oneOf: [
        { type: 'object', properties: { k: { const: 'a' } }, required: ['k'] },
        { type: 'object', properties: { k: { const: 'a' } }, required: ['k'] },
      ],
    }))
    // Every value satisfies both branches or neither, so none satisfies one.
    throws(() => notDisc({ k: 'a' }), /satisfies 2 of: .*; the count must be 1\.$/)
    const noTag = Shape(fromJsonSchema({
      oneOf: [
        { type: 'object', properties: { k: { const: 'a' } }, required: ['k'] },
        { type: 'object', properties: { j: { const: 'b' } }, required: ['j'] },
      ],
    }))
    deepEqual(noTag({ j: 'b' }), { j: 'b' })
    // Exactly one of no branches: nothing passes.
    deepEqual(Shape(fromJsonSchema({ oneOf: [] })).jsonSchema().not, {})
    const twoTags = Shape(fromJsonSchema({
      oneOf: [
        { type: 'object', properties: { k: { const: 'a' }, j: { const: 'x' } }, required: ['j'] },
        { type: 'object', properties: { k: { const: 'b' }, j: { const: 'y' } }, required: ['j', 'k'] },
      ],
    }))
    deepEqual(twoTags.jsonSchema().oneOf[0].properties.j, { type: 'string', const: 'x' })
    deepEqual(twoTags({ j: 'y', k: 'b' }), { j: 'y', k: 'b' })
    const boolBranch = Shape(fromJsonSchema({
      oneOf: [{ type: 'object', properties: { k: { const: 'a' } }, required: ['k'] }, true],
    }))
    // Not discriminated: the branch's k is its own Exact, not an added tag.
    deepEqual(boolBranch.jsonSchema().oneOf[0].properties.k, { enum: ['a'] })
    equal(boolBranch(1), 1)
    throws(() => boolBranch({ k: 'a' }), /satisfies 2 of: .*, Any; the count must be 1\.$/)
    // A property before the tag in name order that is not a const.
    const skipped = Shape(fromJsonSchema({
      oneOf: [
        { type: 'object', properties: { a: { type: 'string' }, k: { const: 'a' } }, required: ['k'] },
        { type: 'object', properties: { k: { const: 'b' } }, required: ['k'] },
      ],
    }))
    deepEqual(skipped({ k: 'a', a: 'x' }), { k: 'a', a: 'x' })
    throws(() => skipped({ k: 'a', a: 1 }), /property "a"/)

    // Descriptions and defaults.
    equal(Shape(fromJsonSchema({ type: 'string', description: 'd' })).jsonSchema().description, 'd')
    deepEqual(v({ type: 'object', properties: { a: { type: 'number', default: 2 } } }, {}), { a: 2 })
    deepEqual(v({ type: 'object', properties: { a: { type: 'object', default: { q: 1 }, additionalProperties: { type: 'number' } } } }, {}), { a: { q: 1 } })
  })

  test('references', () => {
    const defs = {
      $defs: { p: { type: 'object', properties: { n: { type: 'string' } }, required: ['n'] } },
    }
    const twice = Shape(fromJsonSchema({
      ...defs, type: 'object', properties: { a: { $ref: '#/$defs/p' }, b: { $ref: '#/$defs/p' } }, required: ['a', 'b'],
    }))
    deepEqual(twice({ a: { n: 'x' }, b: { n: 'y' } }), { a: { n: 'x' }, b: { n: 'y' } })
    throws(() => twice({ a: { n: 'x' }, b: {} }), /b\.n/)

    // draft-4 definitions, and a description beside the reference.
    const legacy = Shape(fromJsonSchema({
      definitions: { p: { type: 'number' } }, type: 'object', properties: { a: { $ref: '#/definitions/p', description: 'd' } },
    }))
    equal(legacy.jsonSchema().properties.a.description, 'd')
    throws(() => legacy({ a: 'x' }), /not of type number/)

    // Recursion through the root.
    const root = Shape(fromJsonSchema({ type: 'object', properties: { v: { type: 'number' }, next: { $ref: '#' } } }))
    deepEqual(root({ v: 1, next: { v: 2 } }), { v: 1, next: { v: 2 } })
    throws(() => root({ v: 1, next: { next: { v: 'x' } } }), /next\.next\.v/)
    deepEqual(root.jsonSchema().properties.next.properties.next, { $ref: '#/$defs/$root' })

    throws(() => fromJsonSchema({ $ref: '#/$defs/zz' }), /^Error: JSON Schema: unknown \$ref "#\/\$defs\/zz" at \/$/)
    throws(() => fromJsonSchema({ type: 'object', properties: { a: { $ref: 'other.json#/x' } } }),
      /^Error: JSON Schema: unsupported \$ref "other.json#\/x" at \/properties\/a$/)
  })

  test('faults', () => {
    throws(() => fromJsonSchema(3 as any), /^Error: JSON Schema: the schema must be an object$/)
    throws(() => fromJsonSchema(null as any), /must be an object/)
    throws(() => fromJsonSchema([] as any), /must be an object/)
    throws(() => fromJsonSchema({ properties: { a: 'x' } }), /^Error: JSON Schema: a schema must be an object or boolean at \/properties\/a$/)
    throws(() => fromJsonSchema({ items: null }), /must be an object or boolean at \/items$/)
    throws(() => fromJsonSchema({ type: 'object', additionalProperties: null }), /must be an object or boolean at \/additionalProperties$/)
    throws(() => fromJsonSchema({ type: 'object', properties: 3 }), /^Error: JSON Schema: properties must be an object at \/properties$/)
    throws(() => fromJsonSchema({ type: 'array', prefixItems: {} }), /^Error: JSON Schema: prefixItems must be an array at \/prefixItems$/)
    throws(() => fromJsonSchema({ anyOf: {} }), /^Error: JSON Schema: anyOf must be an array at \/anyOf$/)
    throws(() => fromJsonSchema({ oneOf: 1 }), /^Error: JSON Schema: oneOf must be an array at \/oneOf$/)
    throws(() => fromJsonSchema({ allOf: 'x' }), /^Error: JSON Schema: allOf must be an array at \/allOf$/)
    throws(() => fromJsonSchema({ type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'x' } }), /at \/items$/)
    throws(() => fromJsonSchema({ properties: { a: { type: 'strng' } } }), /^Error: JSON Schema: unknown type "strng" at \/properties\/a$/)
    throws(() => fromJsonSchema({ type: 3 }), /unknown type "3"/)
    throws(() => fromJsonSchema({ type: ['string', 'number'], pattern: '(' }), /^Error: JSON Schema: bad pattern "\(" at \/$/)
    throws(() => fromJsonSchema({ type: ['x', 'null'] }), /unknown type "x"/)
    throws(() => fromJsonSchema({ type: 'string', pattern: '(' }), /^Error: JSON Schema: bad pattern "\(" at \/$/)
    throws(() => fromJsonSchema({ enum: [] }), /enum must be a non-empty array/)
    throws(() => fromJsonSchema({ enum: 'x' }), /enum must be a non-empty array/)
    throws(() => fromJsonSchema({ type: 'array', prefixItems: [{ type: 'x' }] }), /at \/prefixItems\/0$/)
    throws(() => fromJsonSchema({ anyOf: [{ type: 'x' }] }), /at \/anyOf\/0$/)
    throws(() => fromJsonSchema({ oneOf: [{ type: 'x' }] }), /at \/oneOf\/0$/)
    throws(() => fromJsonSchema({ allOf: [{ type: 'x' }] }), /at \/allOf\/0$/)
    throws(() => fromJsonSchema({ type: 'object', additionalProperties: { type: 'x' } }), /at \/additionalProperties$/)
  })

  test('shape-property', () => {
    equal(Shape.fromJsonSchema, fromJsonSchema)
    deepEqual(Shape(Shape.fromJsonSchema({ type: 'number', default: 1 }))(), 1)
  })
})

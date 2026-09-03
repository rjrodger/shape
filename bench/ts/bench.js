'use strict'

// The TypeScript benchmark: shape against Zod, Ajv, Joi and Valibot on the
// shared cases. Every library validates the same decoded input; shape and
// Zod return a fresh value, Ajv, Joi and Valibot check in place (Valibot's
// safeParse also copies). Prints a JSON document to stdout.

const { policy, measure, cases, largeKey } = require('../lib/harness.js')

const Shape = require('shape')
const { z } = require('zod')
const Ajv = require('ajv')
const Joi = require('joi')
const v = require('valibot')

// Versions come from the installed package files (some packages do not
// export package.json).
const versionOf = (name) =>
  JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, 'node_modules', name, 'package.json'), 'utf8')).version
const versions = { shape: versionOf('shape'), zod: versionOf('zod'), ajv: versionOf('ajv'), joi: versionOf('joi'), valibot: versionOf('valibot') }

const { Integer, Min, Max } = Shape
const S = String, N = Number, B = Boolean

// Shape specs by case name, closed objects like the JSON Schemas.
const shapes = {
  flat: { id: Integer, name: S, email: S, active: B, score: N },
  nested: {
    id: Integer,
    name: S,
    address: { street: S, city: S, zip: S },
    tags: [S],
    settings: { theme: S, notifications: B },
  },
  array: { items: [{ sku: S, qty: Integer, price: N }] },
  bounds: {
    name: Max(40, Min(3, S)),
    age: Max(150, Min(0, Integer)),
    code: /^[A-Z]{3}$/,
    ratio: Max(1, Min(0, N)),
  },
}
shapes.invalid = shapes.nested

// The large case: fifty keys cycling through the four primitive kinds, built
// for every library from one list.
const LARGE = 50
function large(kinds) {
  const spec = {}
  for (let i = 0; i < LARGE; i++) spec[largeKey(i)] = kinds[i % 4]
  return spec
}
shapes.large = large([S, Integer, B, N])

const zods = {
  flat: z.strictObject({ id: z.int(), name: z.string(), email: z.string(), active: z.boolean(), score: z.number() }),
  nested: z.strictObject({
    id: z.int(),
    name: z.string(),
    address: z.strictObject({ street: z.string(), city: z.string(), zip: z.string() }),
    tags: z.array(z.string()),
    settings: z.strictObject({ theme: z.string(), notifications: z.boolean() }),
  }),
  array: z.strictObject({ items: z.array(z.strictObject({ sku: z.string(), qty: z.int(), price: z.number() })) }),
  bounds: z.strictObject({
    name: z.string().min(3).max(40),
    age: z.int().min(0).max(150),
    code: z.string().regex(/^[A-Z]{3}$/),
    ratio: z.number().min(0).max(1),
  }),
}
zods.invalid = zods.nested
zods.large = z.strictObject(large([z.string(), z.int(), z.boolean(), z.number()]))

const jois = {
  flat: Joi.object({ id: Joi.number().integer().required(), name: Joi.string().required(), email: Joi.string().required(), active: Joi.boolean().required(), score: Joi.number().required() }),
  nested: Joi.object({
    id: Joi.number().integer().required(),
    name: Joi.string().required(),
    address: Joi.object({ street: Joi.string().required(), city: Joi.string().required(), zip: Joi.string().required() }).required(),
    tags: Joi.array().items(Joi.string()).required(),
    settings: Joi.object({ theme: Joi.string().required(), notifications: Joi.boolean().required() }).required(),
  }),
  array: Joi.object({ items: Joi.array().items(Joi.object({ sku: Joi.string().required(), qty: Joi.number().integer().required(), price: Joi.number().required() })).required() }),
  bounds: Joi.object({
    name: Joi.string().min(3).max(40).required(),
    age: Joi.number().integer().min(0).max(150).required(),
    code: Joi.string().pattern(/^[A-Z]{3}$/).required(),
    ratio: Joi.number().min(0).max(1).required(),
  }),
}
jois.invalid = jois.nested
jois.large = Joi.object(large([Joi.string().required(), Joi.number().integer().required(), Joi.boolean().required(), Joi.number().required()]))
const joiOpts = { convert: false }

const valibots = {
  flat: v.strictObject({ id: v.pipe(v.number(), v.integer()), name: v.string(), email: v.string(), active: v.boolean(), score: v.number() }),
  nested: v.strictObject({
    id: v.pipe(v.number(), v.integer()),
    name: v.string(),
    address: v.strictObject({ street: v.string(), city: v.string(), zip: v.string() }),
    tags: v.array(v.string()),
    settings: v.strictObject({ theme: v.string(), notifications: v.boolean() }),
  }),
  array: v.strictObject({ items: v.array(v.strictObject({ sku: v.string(), qty: v.pipe(v.number(), v.integer()), price: v.number() })) }),
  bounds: v.strictObject({
    name: v.pipe(v.string(), v.minLength(3), v.maxLength(40)),
    age: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(150)),
    code: v.pipe(v.string(), v.regex(/^[A-Z]{3}$/)),
    ratio: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  }),
}
valibots.invalid = valibots.nested
valibots.large = v.strictObject(large([v.string(), v.pipe(v.number(), v.integer()), v.boolean(), v.number()]))

function main() {
  const pol = policy()
  const { cases: all, hash } = cases()
  const ajv = new Ajv({ allErrors: false })
  const out = []

  for (const c of all) {
    const input = c.input
    const shape = Shape.Shape(shapes[c.name])
    const zod = zods[c.name]
    const validate = ajv.compile(c.jsonSchema)
    const joi = jois[c.name]
    const vb = valibots[c.name]

    // Each library reports a verdict without throwing. On the error path
    // every library builds its error messages, and shape's error() does too.
    const libs = {
      shape: c.valid ? () => shape.valid(input) : () => shape.error(input),
      zod: () => zod.safeParse(input),
      ajv: () => validate(input),
      joi: () => joi.validate(input, joiOpts),
      valibot: () => v.safeParse(vb, input),
    }

    // Sanity: the spec has the leaves it says (an undefined leaf would
    // read as an optional `any` and measure a different shape), and every
    // library agrees on the verdict before it is timed.
    for (const f of [S, N, B, Integer, Min, Max]) {
      if (typeof f !== 'function') throw new Error(`case ${c.name}: a spec leaf is not a function`)
    }
    if (/"t":"any"/.test(JSON.stringify(shape.node().v))) {
      throw new Error(`case ${c.name}: the shape has an untyped leaf`)
    }
    const verdicts = {
      shape: shape.valid(input),
      zod: zod.safeParse(input).success,
      ajv: validate(input),
      joi: joi.validate(input, joiOpts).error === undefined,
      valibot: v.safeParse(vb, input).success,
    }
    for (const [lib, ok] of Object.entries(verdicts)) {
      if (ok !== c.valid) throw new Error(`case ${c.name}: ${lib} says ${ok}, expected ${c.valid}`)
    }

    for (const [lib, fn] of Object.entries(libs)) {
      const r = measure(fn, pol)
      out.push({ case: c.name, lib, version: versions[lib], ...r })
      process.stderr.write(`${c.name.padEnd(8)} ${lib.padEnd(8)} ${String(r.median_ns).padStart(10)} ns/op\n`)
    }
  }

  process.stdout.write(JSON.stringify({
    lang: 'ts',
    // The harness version, folded into every row's case hash by the
    // report: the specs and inputs changed on 2026-09-03 (typed leaves, a
    // decoded large input), and a run before that is not comparable.
    harness: 2,
    runtime: { node: process.version, v8: process.versions.v8 },
    versions,
    input_hash: hash,
    policy: pol,
    benchmarks: out,
  }))
}

main()

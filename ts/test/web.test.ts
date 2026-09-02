/* Copyright (c) 2021-2024 Richard Rodger and other contributors, MIT License */

import { describe, test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import esbuild from 'esbuild'


// In the browser the package is used two ways: a bundler imports it, with
// Node's util swapped for a stub by the package's browser field; or a script
// tag loads dist/shape.min.js, a self-contained bundle exposing a global
// Shape. Both are run here in a bare context, as a browser would run them.
describe('web-bundle', () => {

  test('bundler-import', () => {
    // A consumer bundle, resolved through this package's package.json.
    const built = esbuild.buildSync({
      stdin: {
        contents: `
          import { Shape, Min, Pick } from 'shape'
          globalThis.result = [
            Shape(Min(2, Number))(5),
            Shape(Pick('a', { a: 1, b: 2 }))({}).a,
            typeof Shape.jsonSchema,
            (() => { try { Shape({ a: Number })({}) } catch (e) { return e.message } })(),
          ]`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: 'browser',
      format: 'iife',
      write: false,
      alias: { shape: process.cwd() },
      logLevel: 'silent',
    })
    const src = built.outputFiles[0].text
    assert.ok(!src.includes('require("util")'), 'util must be stubbed for the browser')

    const ctx: any = vm.createContext({})
    vm.runInContext(src, ctx)
    assert.deepEqual(ctx.result, [5, 1, 'function',
      'Validation failed for property "a" because the property is missing.'])
  })


  test('global-shape', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'dist', 'shape.min.js'), 'utf8')
    const ctx = vm.createContext({})
    vm.runInContext(src, ctx)

    const run = (code: string) => vm.runInContext(code, ctx)

    assert.equal(run('typeof Shape'), 'function')
    assert.equal(run('Shape(String)("OK")'), 'OK')
    assert.deepEqual(JSON.parse(run('JSON.stringify(Shape({ port: 8080, debug: Boolean })({ debug: true }))')),
      { port: 8080, debug: true })

    // Builders, the algebra and the JSON Schema export are all attached.
    assert.equal(run('typeof Shape.Pick'), 'function')
    assert.deepEqual(JSON.parse(run('JSON.stringify(Shape(Shape.Pick("a", { a: 1, b: 2 }))({}))')), { a: 1 })
    assert.equal(run('Shape({ a: Shape.Min(2, Number) }).jsonSchema().properties.a.minimum'), 2)
    assert.equal(run('Shape({ "a: Optional(Number)": 5 })({}).a'), 5)

    // Names survive minification, so messages read as they do in Node.
    assert.equal(run('(() => { try { Shape({ a: Number })({}) } catch (e) { return e.message } })()'),
      'Validation failed for property "a" because the property is missing.')
    assert.equal(run('(() => { try { Shape({ a: Shape.Min(2, Number) })({ a: 1 }) } catch (e) { return e.message } })()'),
      'Value "1" for property "a" must be a minimum of 2 (was 1).')

    // The same file is also a CommonJS module, for a require of it directly.
    const S = require(path.join(process.cwd(), 'dist', 'shape.min.js'))
    assert.equal(S(String)('OK'), 'OK')
    assert.equal(S.Shape, S)
  })
})

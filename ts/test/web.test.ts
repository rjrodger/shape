/* Copyright (c) 2021-2024 Richard Rodger and other contributors, MIT License */

import { describe, test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'


// The browser bundle: dist/shape.min.js, the package's browser entry, is a
// self-contained script exposing a global Shape. It is run here in a bare
// context, as a script tag would run it.
describe('web-bundle', () => {

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
      'Validation failed for property "a" with value "undefined" because the value is required.')
    assert.equal(run('(() => { try { Shape({ a: Shape.Min(2, Number) })({ a: 1 }) } catch (e) { return e.message } })()'),
      'Value "1" for property "a" must be a minimum of 2 (was 1).')
  })
})

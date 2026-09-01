'use strict'
// Differential harness, TypeScript side: run every case through the canonical
// build and record what it did. Writes JSONL so compare.js can diff it against
// the Go side line for line.
//
//   node test/differential/run-ts.js <cases.json> <out.jsonl>

const fs = require('fs')
const path = require('path')

const { decodeSpec } = require(path.join(__dirname, '..', 'decode-spec.js'))

const S = require(path.join(__dirname, '..', '..', 'ts', 'dist', 'shape.js'))
const Shape = S.Shape ? S.Shape : S

const cases = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const lines = []

for (const c of cases) {
  const rec = { name: c.name }

  let schema
  try {
    schema = Shape(decodeSpec(c.spec, Shape))
  }
  catch (e) {
    rec.build = 'ERR: ' + e.message
    lines.push(JSON.stringify(rec))
    continue
  }

  // The JSON Schema export is compared too, once per case.
  try {
    rec.schema = JSON.parse(JSON.stringify(schema.jsonSchema()))
  }
  catch (e) {
    rec.schema = 'ERR: ' + e.message
  }

  try {
    const out = schema(structuredClone(c.input))
    rec.ok = true
    // JSON-normalize: the case travels through JSON on the Go side too, so
    // undefined properties and numeric widths are erased for both.
    rec.out = JSON.parse(JSON.stringify(undefined === out ? null : out))
  }
  catch (e) {
    rec.ok = false
    rec.err = e.message
  }

  lines.push(JSON.stringify(rec))
}

fs.writeFileSync(process.argv[3], lines.join('\n') + '\n')
process.stderr.write(`ts:  ${lines.length} results -> ${process.argv[3]}\n`)

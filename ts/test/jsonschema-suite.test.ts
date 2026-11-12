/* Copyright (c) 2026 Richard Rodger and other contributors, MIT License */

// The official JSON Schema Test Suite through the import. Every schema of a
// draft's required tests is imported and every instance validated, and the
// verdict must be the suite's, but for the tests the draft's skip ledger
// lists for this port. A failing test no row covers fails the run, so does a
// covered test that passes (the change that fixed it deletes its row), and
// so does a ledger longer than its bound. The Go and Rust ports read the
// same ledgers. See test/json-schema-suite/README.md.

import { describe, test } from 'node:test'
import { deepEqual } from 'node:assert'

import * as Fs from 'node:fs'
import * as Path from 'node:path'

import { Shape, fromJsonSchema } from '../dist/shape'


// ts/dist-test/jsonschema-suite.test.js -> the vendored suite.
const SUITE = Path.join(__dirname, '..', '..', 'test', 'json-schema-suite')

const PORT = 'ts'

// A draft-7 document says so, as the import reads a $ref's siblings by it.
const DRAFT7 = 'http://json-schema.org/draft-07/schema#'


type Row = { file: string, group: string, test: string, ports: string[], text: string }
type Verdict = { file: string, group: string, test: string, pass: boolean }


function ledger(draft: string): { bound: number, rows: Row[] } {
  const lines = Fs.readFileSync(Path.join(SUITE, 'skips-' + draft + '.tsv'), 'utf8')
    .split(/\r?\n/).filter((line) => '' !== line)
  const bound = Number((lines.find((line) => line.startsWith('# bound: ')) || '').slice(9))
  const rows = lines.filter((line) => !line.startsWith('#')).map((text) => {
    const [file, group, test, ports] = text.split('\t')
    return { file, group, test, ports: (ports || '').split(' '), text }
  })
  return { bound, rows }
}


function compile(draft: string, schema: any): any {
  const doc = 'draft7' === draft && null != schema && 'object' === typeof schema &&
    undefined === schema.$schema ? { $schema: DRAFT7, ...schema } : schema
  try {
    return Shape(fromJsonSchema(doc))
  }
  catch (e: any) {
    return undefined
  }
}


function verdicts(draft: string): Verdict[] {
  const dir = Path.join(SUITE, 'tests', draft)
  const out: Verdict[] = []
  for (const file of Fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    for (const g of JSON.parse(Fs.readFileSync(Path.join(dir, file), 'utf8'))) {
      const shape = compile(draft, g.schema)
      for (const t of g.tests) {
        const pass = undefined !== shape && shape.valid(t.data) === t.valid
        out.push({ file, group: g.description, test: t.description, pass })
      }
    }
  }
  return out
}


function covers(row: Row, v: Verdict): boolean {
  return row.file === v.file && ('*' === row.group || row.group === v.group) &&
    ('*' === row.test || row.test === v.test)
}


describe('jsonschema-suite', () => {
  for (const draft of ['draft2020-12', 'draft7']) {
    test(draft, () => {
      const { bound, rows } = ledger(draft)
      const mine = rows.filter((row) => row.ports.includes(PORT))
      const vs = verdicts(draft)
      const listed = (v: Verdict) => mine.some((row) => covers(row, v))
      const name = (v: Verdict) => [v.file, v.group, v.test, PORT].join('\t')
      deepEqual({
        unlisted: vs.filter((v) => !v.pass && !listed(v)).map(name),
        passing: vs.filter((v) => v.pass && listed(v)).map(name),
        stale: rows.filter((row) => !vs.some((v) => covers(row, v))).map((row) => row.text),
        bounded: rows.length <= bound,
      }, { unlisted: [], passing: [], stale: [], bounded: true })
    })
  }
})

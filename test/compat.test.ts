import { describe, test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

type Row = {
  name: string
  spec: any
  input: any
  output: any
  error: string
}

const TSV_PATH = path.join(process.cwd(), 'test', 'compat.tsv')


function parseValueCell(src: string): any {
  const s = src.trim()

  try {
    return JSON.parse(s)
  }
  catch (_e) {
    if (2 <= s.length) {
      const q0 = s[0]
      const q1 = s[s.length - 1]
      if (("'" === q0 && "'" === q1) || ('"' === q0 && '"' === q1)) {
        return s.slice(1, -1)
      }
    }

    return s
  }
}

function parseTSV(filePath: string): Row[] {
  const src = fs.readFileSync(filePath, 'utf8').trim()
  const lines = src.split(/\r?\n/)
  const headers = lines[0].split('\t')

  return lines.slice(1)
    .filter(line => line.trim().length > 0)
    .map(line => {
      const cols = line.split('\t')
      const row: any = {}
      headers.forEach((h, i) => row[h] = cols[i] || '')

      return {
        name: row.name,
        spec: parseValueCell(row.spec),
        input: parseValueCell(row.input),
        output: parseValueCell(row.output),
        error: row.error,
      }
    })
}

function decodeSpec(v: any, Shape: any): any {
  if (Array.isArray(v)) {
    return v.map(x => decodeSpec(x, Shape))
  }

  if (null != v && 'object' === typeof v) {
    const keys = Object.keys(v)

    if (1 === keys.length && '$type' === keys[0]) {
      const t = v.$type
      const native: Record<string, any> = {
        String,
        Number,
        Boolean,
        Object,
        Array,
        Symbol,
        Function,
      }

      return native[t] || Shape[t]
    }

    if (1 === keys.length && '$open' === keys[0]) {
      return Shape.Open(decodeSpec(v.$open, Shape))
    }

    if (1 === keys.length && '$closed' === keys[0]) {
      return Shape.Closed(decodeSpec(v.$closed, Shape))
    }

    if (1 === keys.length && '$required' === keys[0]) {
      return Shape.Required(decodeSpec(v.$required, Shape))
    }

    if (1 === keys.length && '$optional' === keys[0]) {
      return Shape.Optional(decodeSpec(v.$optional, Shape))
    }

    const out: Record<string, any> = {}
    for (const k of keys) {
      out[k] = decodeSpec(v[k], Shape)
    }

    return out
  }

  return v
}


describe('compat-tsv', () => {
  let ShapeModule = require('../dist/shape')
  if (ShapeModule.Shape) {
    ShapeModule = ShapeModule.Shape
  }

  const Shape = ShapeModule

  const rows = parseTSV(TSV_PATH)

  for (const row of rows) {
    test(row.name, () => {
      const schema = Shape(decodeSpec(row.spec, Shape))

      if (row.error) {
        assert.throws(() => schema(structuredClone(row.input)), new RegExp(row.error, 'i'))
        return
      }

      const out = schema(structuredClone(row.input))
      assert.deepEqual(out, row.output)
    })
  }
})

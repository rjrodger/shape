'use strict'
// Shared sentinel decoder for the JavaScript-side test harnesses.
//
// Corpus and differential cells are JSON with sentinels (see README.md); this
// turns them into live Shape specs. gen-compat.js and differential/run-ts.js
// both use it so the two harnesses can never drift apart on what a cell means.
// (ts/test/compat.test.ts keeps a typed copy for the same grammar.)

function decodeSpec(v, Shape) {
  if (Array.isArray(v)) return v.map(x => decodeSpec(x, Shape))

  if (v != null && 'object' === typeof v) {
    const keys = Object.keys(v)

    if (1 === keys.length) {
      const k = keys[0]
      if ('$type' === k) {
        const native = { String, Number, Boolean, Object, Array, Symbol, Function, Date }
        return native[v.$type] || Shape[v.$type]
      }
      if ('$open' === k) return Shape.Open(decodeSpec(v.$open, Shape))
      if ('$closed' === k) return Shape.Closed(decodeSpec(v.$closed, Shape))
      if ('$required' === k) return Shape.Required(decodeSpec(v.$required, Shape))
      if ('$optional' === k) return Shape.Optional(decodeSpec(v.$optional, Shape))
      if ('$expr' === k) return Shape.expr(v.$expr)
      if ('$discriminated' === k) {
        const [tag, branches] = v.$discriminated
        const out = {}
        for (const b of Object.keys(branches)) out[b] = decodeSpec(branches[b], Shape)
        return Shape.Discriminated(tag, out)
      }
    }

    const out = {}
    for (const kk of keys) out[kk] = decodeSpec(v[kk], Shape)
    return out
  }

  return v
}

module.exports = { decodeSpec }

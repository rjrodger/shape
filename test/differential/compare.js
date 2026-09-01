'use strict'
// Differential harness comparator: diff the two languages' results and fail
// on any disagreement.
//
//   node test/differential/compare.js <cases.json> <ts.jsonl> <go.jsonl> [--full]
//
// Unlike the shared corpus, error text is compared EXACTLY. A separator,
// ordering or extra-error difference is a failure here, which is the whole
// reason this harness exists.

const fs = require('fs')

const SAMPLES = 3

function loadJsonl(file) {
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').trim().split('\n')) {
    const rec = JSON.parse(line)
    out[rec.name] = rec
  }
  return out
}

const J = v => JSON.stringify(undefined === v ? null : v)

const casesPath = process.argv[2]
const full = process.argv.includes('--full')

const cases = Object.fromEntries(
  JSON.parse(fs.readFileSync(casesPath, 'utf8')).map(c => [c.name, c]))
const ts = loadJsonl(process.argv[3])
const go = loadJsonl(process.argv[4])

const buckets = { build: [], verdict: [], output: [], errtext: [] }

for (const name of Object.keys(ts)) {
  const t = ts[name]
  const g = go[name]

  if (!g) {
    buckets.build.push({ name, ts: t, go: { build: 'MISSING RESULT' } })
    continue
  }

  const row = { name, spec: J(cases[name].spec), input: J(cases[name].input), ts: t, go: g }

  if (undefined !== t.build || undefined !== g.build) {
    if (J(t.build) !== J(g.build)) buckets.build.push(row)
    continue
  }

  if (t.ok !== g.ok) { buckets.verdict.push(row); continue }

  if (t.ok) {
    if (J(t.out) !== J(g.out)) buckets.output.push(row)
  }
  else if (t.err !== g.err) {
    buckets.errtext.push(row)
  }
}

const total = Object.keys(ts).length
const failed = Object.values(buckets).reduce((a, b) => a + b.length, 0)

const side = r => r.ok ? 'PASS ' + J(r.out)
  : undefined !== r.build ? 'BUILD ' + r.build
    : 'FAIL ' + JSON.stringify(r.err)

console.log(`differential: ${total} cases, ${total - failed} agree, ${failed} differ`)

const LABEL = {
  build: 'build/compile disagreement',
  verdict: 'pass-vs-fail disagreement',
  output: 'different produced value',
  errtext: 'different error text',
}

for (const [kind, rows] of Object.entries(buckets)) {
  if (0 === rows.length) continue

  console.log(`\n${LABEL[kind]}: ${rows.length}`)

  const groups = {}
  for (const r of rows) {
    const g = r.name.split('#')[0]
    ;(groups[g] = groups[g] || []).push(r)
  }

  for (const [g, rs] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${g} (${rs.length})`)
    for (const r of (full ? rs : rs.slice(0, SAMPLES))) {
      console.log(`    spec=${r.spec} input=${r.input}`)
      console.log(`      ts: ${side(r.ts)}`)
      console.log(`      go: ${side(r.go)}`)
    }
    if (!full && rs.length > SAMPLES) console.log(`    … ${rs.length - SAMPLES} more`)
  }
}

if (0 === failed) console.log('\nTS and Go agree on every case.')

process.exit(0 === failed ? 0 : 1)

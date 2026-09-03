'use strict'

// Aggregates the immutable run files under results/runs into results/latest:
//
//   index.json    every run: id, time, language, host, commit, versions
//   summary.json  the latest measurement of each (language, host, case,
//                 library), the hosts seen, and the median history of every
//                 (language, host, case, library) across runs for trends
//
// Measurements are only comparable against the same case: every row carries
// the hash of the whole cases file its run measured and the hash of its own
// case's definition in that file (read from the run's commit, so a case
// added later leaves the others' history whole), the matrix holds only rows
// measured against the file of the latest run per language and host, and a
// run from a dirty worktree is marked so the report does not attribute it to
// its commit.
//
// The site (site/) and `make bench-report` read these; nothing reads the
// run files twice.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

// caseHashes finds the bench/cases.json a run measured, by the hash the run
// recorded, and hashes each case's definition in it: the file at the run's
// commit when git can show it and it is the file measured (a dirty run may
// have measured another), else the current file when that is the one. A
// run whose file cannot be found has no case hashes, and its rows are
// compared by the file hash alone. A case that borrows another's schema
// ({"$ref": "#name"}) is hashed with the schema it borrows, so a change to
// the schema changes the hash of every case that measures it. A run that
// records a harness version (the language's harness changed what it
// measures, as the TypeScript one did on 2026-09-03) has that version
// folded into every hash, so its rows are never compared with the runs
// before the change; a run without one is version 1.
const caseHashCache = {}
function caseHashes(resultsDir, commit, inputHash, currentHash, harness) {
  const cacheKey = inputHash + '/' + harness
  if (cacheKey in caseHashCache) return caseHashCache[cacheKey]
  let raw = null
  if (commit) {
    try {
      raw = execFileSync('git', ['show', commit + ':bench/cases.json'], { cwd: resultsDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
    } catch {
      raw = null
    }
    if (null !== raw && fileHash(raw) !== inputHash) raw = null
  }
  if (null === raw && inputHash === currentHash) raw = currentCasesRaw(resultsDir)
  let hashes = null
  if (null !== raw) {
    hashes = {}
    const all = JSON.parse(raw).cases
    const byName = {}
    for (const c of all) byName[c.name] = c
    for (const c of all) {
      const ref = c.jsonSchema && typeof c.jsonSchema.$ref === 'string' && c.jsonSchema.$ref.startsWith('#') ? byName[c.jsonSchema.$ref.slice(1)] : null
      const resolved = ref ? { ...c, jsonSchema: ref.jsonSchema } : c
      const hashed = harness > 1 ? { ...resolved, harness } : resolved
      hashes[c.name] = crypto.createHash('sha256').update(JSON.stringify(hashed)).digest('hex').slice(0, 12)
    }
  }
  caseHashCache[cacheKey] = hashes
  return hashes
}
function currentCasesRaw(resultsDir) {
  const file = path.join(resultsDir, '..', 'cases.json')
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}
function fileHash(raw) {
  // LF line endings, as the harnesses hash it (a Windows checkout is CRLF).
  return crypto.createHash('sha256').update(raw.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12)
}

function readRuns(resultsDir) {
  const dir = path.join(resultsDir, 'runs')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .filter((r) => r.schema === 'shape-bench/1')
}

function build(resultsDir) {
  const runs = readRuns(resultsDir)
  const hosts = {}
  const latest = {}
  const history = []
  const index = []
  // The input hash of the newest run per language and host: the matrix
  // holds measurements against those cases only.
  const newest = {}
  const currentHash = fileHash(currentCasesRaw(resultsDir))

  for (const r of runs) {
    const h = r.host
    const harness = r.harness || 1
    const hashes = caseHashes(resultsDir, r.run.source.commit, r.input_hash, currentHash, harness)
    hosts[h.id] = hosts[h.id] || { ...h, runs: 0, first: r.run.at, last: r.run.at }
    hosts[h.id].runs++
    hosts[h.id].last = r.run.at
    if (h.label) hosts[h.id].label = h.label
    index.push({
      id: r.run.id,
      at: r.run.at,
      lang: r.run.lang,
      host: h.id,
      commit: r.run.source.commit,
      dirty: !!r.run.source.dirty,
      ref: r.run.source.ref,
      runtime: r.runtime,
      versions: r.versions,
      input_hash: r.input_hash,
      harness,
      policy: r.policy,
      cases: r.benchmarks.length,
    })
    newest[r.run.lang + '/' + h.id] = r.input_hash
    for (const b of r.benchmarks) {
      const key = [r.run.lang, h.id, r.input_hash, b.case, b.lib].join('/')
      const row = {
        lang: r.run.lang,
        host: h.id,
        input_hash: r.input_hash,
        case_hash: hashes ? hashes[b.case] : undefined,
        case: b.case,
        lib: b.lib,
        version: b.version,
        run: r.run.id,
        at: r.run.at,
        commit: r.run.source.commit,
        dirty: !!r.run.source.dirty,
        median_ns: b.median_ns,
        mean_ns: b.mean_ns,
        p05_ns: b.p05_ns,
        p95_ns: b.p95_ns,
        stddev_ns: b.stddev_ns,
        ops_per_sec: b.ops_per_sec,
        iterations: b.iterations,
      }
      latest[key] = { ...row, samples_ns: b.samples_ns }
      history.push(row)
    }
  }

  const cases = uniq(history.map((h) => h.case))
  const libs = {}
  for (const h of history) {
    libs[h.lang] = libs[h.lang] || []
    if (!libs[h.lang].includes(h.lib)) libs[h.lang].push(h.lib)
  }

  const summary = {
    schema: 'shape-bench-summary/1',
    generated: new Date().toISOString(),
    runs: runs.length,
    hosts,
    cases,
    libs,
    matrix: Object.values(latest).filter((m) => m.input_hash === newest[m.lang + '/' + m.host]),
    history,
  }

  const outDir = path.join(resultsDir, 'latest')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 1) + '\n')
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1) + '\n')
  fs.writeFileSync(path.join(outDir, 'README.md'), markdown(summary))
  return summary
}

// comparable reports whether a history row measured its case as the latest
// rows (of its language and host) define it: the same case hash when both
// are known, else the same cases file.
function comparable(h, latestRows) {
  const cur = latestRows.find((m) => m.case === h.case)
  if (!cur) return false
  if (h.case_hash && cur.case_hash) return h.case_hash === cur.case_hash
  return h.input_hash === cur.input_hash
}

function uniq(xs) {
  return xs.filter((x, i) => xs.indexOf(x) === i)
}

// markdown renders a readable table per language and host: the latest
// median for each case and library, and shape's ratio to the fastest.
function markdown(summary) {
  const lines = ['# Latest measurements', '', `Generated ${summary.generated} from ${summary.runs} run(s). Times are median nanoseconds per operation; lower is better.`, '']
  const byLangHost = {}
  for (const m of summary.matrix) {
    const k = m.lang + '/' + m.host
    byLangHost[k] = byLangHost[k] || []
    byLangHost[k].push(m)
  }
  for (const k of Object.keys(byLangHost).sort()) {
    const [lang, hostId] = k.split('/')
    const h = summary.hosts[hostId]
    const rows = byLangHost[k]
    const libs = summary.libs[lang]
    lines.push(`## ${lang} on ${h.label || hostId}`, '')
    const dirty = rows.some((r) => r.dirty) ? ' Measured from a worktree with uncommitted changes.' : ''
    lines.push(`Host \`${hostId}\`: ${h.cpu}, ${h.cores} cores, ${h.os}/${h.arch}. Last run ${rows[0].at.slice(0, 10)} (cases \`${rows[0].input_hash}\`).${dirty}`, '')
    lines.push('| case | ' + libs.join(' | ') + ' | shape / fastest |')
    lines.push('|---|' + libs.map(() => '---:').join('|') + '|---:|')
    for (const c of summary.cases) {
      // A median of zero is a run whose clock was too coarse for its batch;
      // it reads as not measured.
      const cells = libs.map((lib) => rows.find((r) => r.case === c && r.lib === lib && r.median_ns > 0))
      const measured = cells.filter(Boolean)
      const fastest = measured.length ? Math.min(...measured.map((r) => r.median_ns)) : 0
      const shape = cells[libs.indexOf('shape')]
      lines.push(
        `| ${c} | ` +
          cells.map((r) => (r ? fmt(r.median_ns) : '–')).join(' | ') +
          ` | ${shape && fastest ? (shape.median_ns / fastest).toFixed(1) + '×' : '–'} |`,
      )
    }
    lines.push('')
  }

  // The history per language and host: shape's median on every case, one
  // row per run, so a before-and-after comparison reads off this file.
  lines.push('# History', '', 'Shape\'s median per case on every run, with the 95th percentile after it, newest last; a cell is filled only when the run measured the case as it is defined now.', '')
  for (const k of Object.keys(byLangHost).sort()) {
    const [lang, hostId] = k.split('/')
    const rows = summary.history.filter((h) => h.lang === lang && h.host === hostId && h.lib === 'shape' && comparable(h, byLangHost[k]))
    const runs = uniq(rows.map((r) => r.run))
    if (runs.length < 1) continue
    lines.push(`## ${lang} on ${summary.hosts[hostId].label || hostId}`, '')
    lines.push('| run | commit | shape | ' + summary.cases.join(' | ') + ' |')
    lines.push('|---|---|---|' + summary.cases.map(() => '---:').join('|') + '|')
    for (const run of runs) {
      const first = rows.find((r) => r.run === run)
      const cells = summary.cases.map((c) => { const r = rows.find((x) => x.run === run && x.case === c); return r ? `${fmt(r.median_ns)} · ${fmt(r.p95_ns)}` : '–' })
      lines.push(`| ${first.at.slice(0, 16).replace('T', ' ')} | \`${first.commit.slice(0, 7)}\`${first.dirty ? ' (dirty)' : ''} | ${first.version} | ${cells.join(' | ')} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function fmt(ns) {
  if (!(ns > 0)) return '–'
  return ns >= 1e6 ? (ns / 1e6).toFixed(2) + ' ms' : ns >= 1e3 ? (ns / 1e3).toFixed(1) + ' µs' : ns.toFixed(0) + ' ns'
}

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'results'))
  const s = build(dir)
  process.stdout.write(fs.readFileSync(path.join(dir, 'latest', 'README.md'), 'utf8'))
  process.stderr.write(`${s.runs} run(s), ${s.matrix.length} latest measurements\n`)
}

module.exports = { comparable, build, readRuns, markdown }

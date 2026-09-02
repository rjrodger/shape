'use strict'

// Aggregates the immutable run files under results/runs into results/latest:
//
//   index.json    every run: id, time, language, host, commit, versions
//   summary.json  the latest measurement of each (language, host, case,
//                 library), the hosts seen, and the median history of every
//                 (language, host, case, library) across runs for trends
//
// The site (site/) and `make bench-report` read these; nothing reads the
// run files twice.

const fs = require('node:fs')
const path = require('node:path')

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

  for (const r of runs) {
    const h = r.host
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
      ref: r.run.source.ref,
      runtime: r.runtime,
      versions: r.versions,
      input_hash: r.input_hash,
      policy: r.policy,
      cases: r.benchmarks.length,
    })
    for (const b of r.benchmarks) {
      const key = [r.run.lang, h.id, b.case, b.lib].join('/')
      const row = {
        lang: r.run.lang,
        host: h.id,
        case: b.case,
        lib: b.lib,
        version: b.version,
        run: r.run.id,
        at: r.run.at,
        commit: r.run.source.commit,
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
    matrix: Object.values(latest),
    history,
  }

  const outDir = path.join(resultsDir, 'latest')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 1) + '\n')
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 1) + '\n')
  fs.writeFileSync(path.join(outDir, 'README.md'), markdown(summary))
  return summary
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
    lines.push(`Host \`${hostId}\`: ${h.cpu}, ${h.cores} cores, ${h.os}/${h.arch}. Last run ${rows[0].at.slice(0, 10)}.`, '')
    lines.push('| case | ' + libs.join(' | ') + ' | shape / fastest |')
    lines.push('|---|' + libs.map(() => '---:').join('|') + '|---:|')
    for (const c of summary.cases) {
      const cells = libs.map((lib) => rows.find((r) => r.case === c && r.lib === lib))
      const fastest = Math.min(...cells.filter(Boolean).map((r) => r.median_ns))
      const shape = cells[libs.indexOf('shape')]
      lines.push(
        `| ${c} | ` +
          cells.map((r) => (r ? fmt(r.median_ns) : '–')).join(' | ') +
          ` | ${shape ? (shape.median_ns / fastest).toFixed(1) + '×' : '–'} |`,
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}

function fmt(ns) {
  return ns >= 1e6 ? (ns / 1e6).toFixed(2) + ' ms' : ns >= 1e3 ? (ns / 1e3).toFixed(1) + ' µs' : ns.toFixed(0) + ' ns'
}

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'results'))
  const s = build(dir)
  process.stdout.write(fs.readFileSync(path.join(dir, 'latest', 'README.md'), 'utf8'))
  process.stderr.write(`${s.runs} run(s), ${s.matrix.length} latest measurements\n`)
}

module.exports = { build, readRuns, markdown }

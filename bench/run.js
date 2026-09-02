#!/usr/bin/env node
'use strict'

// The benchmark driver: runs the TypeScript and Go benchmarks, wraps each
// result with the host, source and timing metadata, and files it as an
// immutable run under bench/results/runs/. Then rebuilds bench/results/latest.
//
//   node bench/run.js [ts|go|all] [--dry] [--out DIR]
//
// --dry prints the run documents instead of writing them. Timing is set by
// BENCH_QUICK=1 (a smoke run), BENCH_WARMUP_MS and BENCH_TIME_MS; the host
// id by HOST_KEY and its display name by HOST_LABEL (see bench/README.md).

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { ROOT, host, gitSource, runId } = require('./lib/harness.js')
const report = require('./lib/report.js')

function main(argv) {
  let langs = ['ts', 'go']
  let dry = false
  let out = path.join(ROOT, 'results')
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === 'ts' || a === 'go') langs = [a]
    else if (a === 'all') langs = ['ts', 'go']
    else if (a === '--dry') dry = true
    else if (a === '--out') out = path.resolve(argv[++i])
    else {
      process.stderr.write(`unknown argument ${a}\n`)
      process.exit(2)
    }
  }

  const machine = host()
  const source = gitSource()
  const written = []

  for (const lang of langs) {
    process.stderr.write(`\n== ${lang} on host ${machine.id}${machine.label ? ' (' + machine.label + ')' : ''}\n`)
    const doc = run(lang)
    const at = new Date().toISOString()
    const id = runId(at, machine.id, lang)
    const record = {
      schema: 'shape-bench/1',
      run: { id, at, lang, source },
      host: machine,
      ...doc,
    }
    if (dry) {
      process.stdout.write(JSON.stringify(record, null, 2) + '\n')
      continue
    }
    const dir = path.join(out, 'runs')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, id + '.json')
    if (fs.existsSync(file)) throw new Error(`run ${id} already exists; runs are never rewritten`)
    fs.writeFileSync(file, JSON.stringify(record, null, 1) + '\n')
    written.push(file)
    process.stderr.write(`wrote ${path.relative(process.cwd(), file)}\n`)
  }

  if (!dry) {
    report.build(out)
    process.stderr.write(`rebuilt ${path.relative(process.cwd(), path.join(out, 'latest'))}\n`)
  }
}

// run executes one language's benchmark and parses its JSON document.
function run(lang) {
  let res
  if (lang === 'ts') {
    const dir = path.join(ROOT, 'ts')
    if (!fs.existsSync(path.join(dir, 'node_modules'))) {
      throw new Error('bench/ts has no node_modules: run `npm install` in bench/ts (after building ts/)')
    }
    res = spawnSync(process.execPath, ['bench.js'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 << 20 })
  } else {
    const dir = path.join(ROOT, 'go')
    res = spawnSync('go', ['run', '.', '-cases', path.join(ROOT, 'cases.json')], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 << 20 })
  }
  if (res.error) throw res.error
  if (res.status !== 0) throw new Error(`${lang} benchmark exited with ${res.status}`)
  return JSON.parse(res.stdout)
}

main(process.argv.slice(2))

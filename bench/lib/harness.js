'use strict'

// Measurement harness shared by the TypeScript runner and the driver. The Go
// runner (bench/go) implements the same policy so the two sets of samples
// are comparable: warm up for a fixed time, size a batch so it takes about a
// millisecond, then time batches for a fixed budget and record the mean
// duration per iteration of each batch as one sample.

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

// Timing policy. BENCH_QUICK=1 shrinks everything for smoke runs.
function policy(env = process.env) {
  const quick = env.BENCH_QUICK === '1'
  return {
    warmup_ms: Number(env.BENCH_WARMUP_MS || (quick ? 50 : 300)),
    time_ms: Number(env.BENCH_TIME_MS || (quick ? 100 : 2000)),
    batch_ms: 1,
    min_batches: 10,
    sample_points: 128,
  }
}

// measure runs fn under the policy and returns its statistics.
function measure(fn, pol) {
  const now = () => process.hrtime.bigint()
  const msToNs = (ms) => BigInt(Math.round(ms * 1e6))

  // Warm up.
  const warmEnd = now() + msToNs(pol.warmup_ms)
  let warm = 0
  while (now() < warmEnd || warm < 10) {
    fn()
    warm++
  }

  // Size the batch so it takes about batch_ms, and at least 50 steps of the
  // clock, so timer quantisation is under 2% of a sample (hrtime is fine
  // everywhere Node runs; the Go runner needs this on Windows, and both
  // follow the same policy).
  let target = msToNs(pol.batch_ms)
  const step = 50n * clockResolution()
  if (step > target) target = step
  let calls = 0
  let elapsed = 0n
  {
    const t0 = now()
    while (elapsed < target / 10n || calls < 10) {
      fn()
      calls++
      elapsed = now() - t0
    }
  }
  const per = elapsed / BigInt(calls)
  const batch = Math.max(1, Number(target / (per > 0n ? per : 1n)))

  // Measure.
  const samples = []
  const end = now() + msToNs(pol.time_ms)
  let iterations = 0
  while (now() < end || samples.length < pol.min_batches) {
    const t0 = now()
    for (let i = 0; i < batch; i++) fn()
    const d = now() - t0
    samples.push(Number(d) / batch)
    iterations += batch
  }
  return stats(samples, iterations, batch, pol)
}

// clockResolution is the smallest non-zero step hrtime reports.
function clockResolution() {
  let best = 0n
  for (let i = 0; i < 32; i++) {
    const t0 = process.hrtime.bigint()
    let d = 0n
    while (d === 0n) d = process.hrtime.bigint() - t0
    if (best === 0n || d < best) best = d
  }
  return best
}

// stats summarises per-iteration samples in nanoseconds.
function stats(samples, iterations, batch, pol) {
  const sorted = samples.slice().sort((a, b) => a - b)
  const n = sorted.length
  const sum = sorted.reduce((a, b) => a + b, 0)
  const mean = sum / n
  const variance = sorted.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n
  const q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))]
  return {
    iterations,
    batch,
    batches: n,
    mean_ns: round(mean),
    median_ns: round(q(0.5)),
    p05_ns: round(q(0.05)),
    p95_ns: round(q(0.95)),
    min_ns: round(sorted[0]),
    max_ns: round(sorted[n - 1]),
    stddev_ns: round(Math.sqrt(variance)),
    ops_per_sec: round(1e9 / mean),
    // Evenly spaced quantiles of the sorted samples, so a run file stays
    // small while the distribution survives.
    samples_ns: quantiles(sorted, pol.sample_points),
  }
}

function quantiles(sorted, points) {
  if (sorted.length <= points) return sorted.map(round)
  const out = []
  for (let i = 0; i < points; i++) {
    out.push(round(sorted[Math.floor((i * (sorted.length - 1)) / (points - 1))]))
  }
  return out
}

function round(x) {
  return Math.round(x * 10) / 10
}

// host describes the machine, with a stable anonymous id: the first twelve
// hex characters of a hash of a machine key under a domain separator. The
// key is HOST_KEY when set (so a machine can be renamed or several kept
// apart); on a GitHub-hosted runner it is the runner class (OS, architecture
// and image), since each run lands on a fresh machine of that class; else
// it is the hostname, platform, architecture, CPU model and core count.
function host(env = process.env) {
  const cpus = os.cpus()
  const cpu = cpus.length ? cpus[0].model.trim() : 'unknown'
  const key = env.HOST_KEY ||
    (env.GITHUB_ACTIONS === 'true' ? ['github', env.RUNNER_OS, env.RUNNER_ARCH, env.ImageOS || ''].join('|') :
      [os.hostname(), os.platform(), os.arch(), cpu, cpus.length].join('|'))
  const id = crypto.createHash('sha256').update('shape-bench-host/1\n' + key).digest('hex').slice(0, 12)
  return {
    id,
    label: env.HOST_LABEL || (env.GITHUB_ACTIONS ? `github:${env.RUNNER_OS}-${env.RUNNER_ARCH}`.toLowerCase() : ''),
    os: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu,
    cores: cpus.length,
    memory_gb: Math.round(os.totalmem() / 2 ** 30),
    ci: env.GITHUB_ACTIONS === 'true',
  }
}

// cases loads bench/cases.json, expanding generated inputs and shared
// schemas (a jsonSchema of {"$ref": "#name"} borrows another case's).
function cases() {
  const file = path.join(ROOT, 'cases.json')
  const raw = fs.readFileSync(file, 'utf8')
  const spec = JSON.parse(raw)
  const byName = {}
  for (const c of spec.cases) byName[c.name] = c
  for (const c of spec.cases) {
    if (c.generate && c.generate.items) {
      c.input.items = []
      for (let i = 0; i < c.generate.items; i++) {
        c.input.items.push({ sku: 'SKU-' + String(i).padStart(4, '0'), qty: i % 7, price: i * 1.25 })
      }
    }
    if (c.generate && c.generate.keys) {
      // The keys k00.. cycle through a string, an integer, a boolean and a
      // number; the schema is generated with them.
      const properties = {}
      const required = []
      for (let i = 0; i < c.generate.keys; i++) {
        const k = largeKey(i)
        c.input[k] = largeValue(i)
        properties[k] = { type: ['string', 'integer', 'boolean', 'number'][i % 4] }
        required.push(k)
      }
      c.jsonSchema = { type: 'object', properties, required, additionalProperties: false }
    }
    if (c.jsonSchema && typeof c.jsonSchema.$ref === 'string' && c.jsonSchema.$ref.startsWith('#')) {
      c.jsonSchema = byName[c.jsonSchema.$ref.slice(1)].jsonSchema
    }
  }
  // Hashed with LF line endings, so a Windows checkout (CRLF) measures the
  // same cases as everyone else.
  const hash = crypto.createHash('sha256').update(raw.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12)
  return { cases: spec.cases, hash }
}

// The key and value at index i of a generated large object (see cases).
function largeKey(i) {
  return 'k' + String(i).padStart(2, '0')
}
function largeValue(i) {
  return [() => 'v' + i, () => i, () => 0 === i % 8, () => i * 0.5][i % 4]()
}

// gitSource reads the commit being measured from the repository.
function gitSource() {
  const { execSync } = require('node:child_process')
  const run = (cmd) => {
    try {
      return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      return ''
    }
  }
  return {
    commit: process.env.GITHUB_SHA || run('git rev-parse HEAD'),
    ref: process.env.GITHUB_REF_NAME || run('git rev-parse --abbrev-ref HEAD'),
    dirty: run('git status --porcelain') !== '',
  }
}

// runId names a run file: time, host and language, sortable by time.
function runId(at, hostId, lang) {
  return at.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z') + '-' + hostId + '-' + lang
}

module.exports = { ROOT, policy, measure, stats, host, cases, gitSource, runId, largeKey }

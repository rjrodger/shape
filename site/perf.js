'use strict'

// The performance report: reads summary.json (built by bench/lib/report.js
// from every recorded run) and draws, per language, the latest medians on
// the chosen host as a log-scale bar chart with a table, the trend of a
// case across runs, and the hosts seen.

;(async function () {
  const root = document.getElementById('perf')
  let data
  try {
    const res = await fetch('summary.json', { cache: 'no-cache' })
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText)
    data = await res.json()
  } catch (e) {
    root.innerHTML = '<p class="muted">No measurements have been recorded yet (' + esc(String(e.message)) + ').</p>'
    return
  }
  if (!data.matrix.length) {
    root.innerHTML = '<p class="muted">No measurements have been recorded yet.</p>'
    return
  }

  const LANG = { ts: 'TypeScript', go: 'Go' }
  const hosts = Object.values(data.hosts).sort((a, b) => (b.last < a.last ? -1 : 1))
  const state = { host: hosts[0].id, trend: data.cases[0] }

  function render() {
    const host = data.hosts[state.host]
    let html = '<div class="controls">'
    html += '<label>Host <select id="host">' + hosts.map((h) => `<option value="${h.id}"${h.id === state.host ? ' selected' : ''}>${esc(hostName(h))}</option>`).join('') + '</select></label>'
    html += '<label>Trend case <select id="trend">' + data.cases.map((c) => `<option value="${c}"${c === state.trend ? ' selected' : ''}>${c}</option>`).join('') + '</select></label>'
    html += '</div>'
    html += `<p class="host-meta">Host <code>${host.id}</code>: ${esc(host.cpu)}, ${host.cores} cores, ${host.memory_gb} GB, ${host.os}/${host.arch}${host.ci ? ', a GitHub-hosted runner' : ''}. ${host.runs} run(s), last ${host.last.slice(0, 10)}.</p>`

    for (const lang of Object.keys(LANG)) {
      const rows = data.matrix.filter((m) => m.lang === lang && m.host === state.host)
      if (!rows.length) continue
      const libs = data.libs[lang]
      const versions = {}
      for (const r of rows) versions[r.lib] = r.version
      const at = rows.map((r) => r.at).sort().pop()
      const last = rows.find((r) => r.at === at)
      const dirty = rows.some((r) => r.dirty) ? ' <strong>Measured from a worktree with uncommitted changes, so the commit is approximate.</strong>' : ''
      html += `<h2 id="${lang}">${LANG[lang]}</h2>`
      html += `<p class="muted">Latest run ${at.slice(0, 10)} at <a href="https://github.com/rjrodger/shape/commit/${last.commit}"><code>${last.commit.slice(0, 7)}</code></a> against cases <code>${last.input_hash}</code>: ` + libs.map((l) => `${l} ${versions[l] || ''}`).join(', ') + `.${dirty}</p>`
      html += legend(libs)
      html += barChart(rows, libs, data.cases)
      html += table(rows, libs, data.cases)
      html += trend(lang, libs)
    }

    html += '<h2 id="hosts">Hosts</h2>' + hostsTable()
    html += `<p class="muted">Summary generated ${data.generated.slice(0, 16).replace('T', ' ')} UTC from ${data.runs} run(s). Every run is kept under <a href="https://github.com/rjrodger/shape/tree/main/bench/results/runs">bench/results/runs</a>; the <a href="latest.html">latest numbers</a> are also a plain table.</p>`
    root.innerHTML = html
    document.getElementById('host').onchange = (e) => { state.host = e.target.value; render() }
    document.getElementById('trend').onchange = (e) => { state.trend = e.target.value; render() }
  }

  function hostName(h) {
    return (h.label ? h.label + ' · ' : '') + h.id + ' (' + h.os + '/' + h.arch + ')'
  }

  function color(lib, i) {
    if (lib === 'shape') return 'var(--shape)'
    const palette = ['#5b8def', '#3fa37a', '#c99a2e', '#9b6bd6', '#d66b8f', '#4fb3c9']
    return palette[i % palette.length]
  }

  function legend(libs) {
    return '<div class="legend">' + libs.map((l, i) => `<span><i style="background:${color(l, i)}"></i>${l}</span>`).join('') + '</div>'
  }

  // barChart draws horizontal bars per case and library on a log scale.
  function barChart(rows, libs, cases) {
    const W = 760, left = 70, right = 70, barH = 14, gap = 3, groupGap = 14
    const groupH = libs.length * (barH + gap) + groupGap
    const H = cases.length * groupH + 30
    // A median of zero is a run whose clock was too coarse for its batch
    // (older Windows runs); it is shown as not measured, never plotted.
    const all = rows.map((r) => r.median_ns).filter((ns) => ns > 0)
    if (!all.length) return '<p class="muted">No usable measurements for this host.</p>'
    const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...all))))
    const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...all))))
    const x = (ns) => left + ((Math.log10(ns) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (W - left - right)
    let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="median time per validation by case and library">`
    for (let t = lo; t <= hi; t *= 10) {
      svg += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="10" y2="${H - 20}"/><text class="label" x="${x(t)}" y="${H - 6}" text-anchor="middle">${fmt(t)}</text>`
    }
    cases.forEach((c, ci) => {
      const y0 = 12 + ci * groupH
      svg += `<text x="${left - 8}" y="${y0 + (libs.length * (barH + gap)) / 2 + 4}" text-anchor="end">${c}</text>`
      libs.forEach((lib, li) => {
        const r = rows.find((m) => m.case === c && m.lib === lib)
        const y = y0 + li * (barH + gap)
        if (!r || !(r.median_ns > 0)) {
          svg += `<text class="label" x="${left + 4}" y="${y + barH - 3}">${lib}: not measured</text>`
          return
        }
        const w = Math.max(1, x(r.median_ns) - left)
        svg += `<rect x="${left}" y="${y}" width="${w}" height="${barH}" fill="${color(lib, li)}"><title>${lib} ${c}: median ${fmt(r.median_ns)}, p95 ${fmt(r.p95_ns)}</title></rect>`
        svg += `<text x="${left + w + 4}" y="${y + barH - 3}">${fmt(r.median_ns)} <tspan class="label">${lib}</tspan></text>`
      })
    })
    return svg + '</svg>'
  }

  function table(rows, libs, cases) {
    let html = '<table><thead><tr><th>case</th>' + libs.map((l) => `<th>${l}</th>`).join('') + '<th>shape / fastest</th></tr></thead><tbody>'
    for (const c of cases) {
      const cells = libs.map((l) => rows.find((m) => m.case === c && m.lib === l && m.median_ns > 0))
      const measured = cells.filter(Boolean)
      const fastest = measured.length ? Math.min(...measured.map((r) => r.median_ns)) : 0
      const shape = cells[libs.indexOf('shape')]
      html += `<tr><td>${c}</td>` + cells.map((r, i) => `<td class="num${libs[i] === 'shape' ? ' shape-cell' : ''}">${r ? `<span title="p05 ${fmt(r.p05_ns)}, p95 ${fmt(r.p95_ns)}">${fmt(r.median_ns)}</span>` : '–'}</td>`).join('')
      html += `<td class="num">${shape && fastest ? (shape.median_ns / fastest).toFixed(1) + '×' : '–'}</td></tr>`
    }
    return html + '</tbody></table>'
  }

  // trend draws the median of one case across every run on the host that
  // measured the same cases as the latest run.
  function trend(lang, libs) {
    const current = data.matrix.find((m) => m.lang === lang && m.host === state.host)
    const hash = current ? current.input_hash : undefined
    const pts = data.history.filter((h) => h.lang === lang && h.host === state.host && h.case === state.trend && h.input_hash === hash && h.median_ns > 0)
    const runs = [...new Set(pts.map((p) => p.run))].sort()
    if (runs.length < 2) return `<p class="muted">Trend for <code>${state.trend}</code>: one run so far on this host; a line appears once there are more.</p>`
    const W = 760, H = 220, left = 60, right = 20, top = 12, bottom = 28
    const all = pts.map((p) => p.median_ns)
    const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...all))))
    const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...all))))
    const x = (i) => left + (i / (runs.length - 1)) * (W - left - right)
    const y = (ns) => top + (1 - (Math.log10(ns) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (H - top - bottom)
    let svg = `<h3>Trend of <code>${state.trend}</code> across ${runs.length} runs</h3>` + legend(libs)
    svg += `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="median over time">`
    for (let t = lo; t <= hi; t *= 10) svg += `<line class="grid" x1="${left}" x2="${W - right}" y1="${y(t)}" y2="${y(t)}"/><text class="label" x="${left - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`
    runs.forEach((r, i) => {
      if (i === 0 || i === runs.length - 1 || runs.length <= 8) svg += `<text class="label" x="${x(i)}" y="${H - 8}" text-anchor="middle">${r.slice(0, 8)}</text>`
    })
    libs.forEach((lib, li) => {
      const series = runs.map((r, i) => { const p = pts.find((q) => q.run === r && q.lib === lib); return p ? [x(i), y(p.median_ns), p] : null }).filter(Boolean)
      if (!series.length) return
      svg += `<polyline class="line" stroke="${color(lib, li)}" points="${series.map((s) => s[0] + ',' + s[1]).join(' ')}"/>`
      for (const s of series) svg += `<circle cx="${s[0]}" cy="${s[1]}" r="3" fill="${color(lib, li)}"><title>${lib} ${s[2].at.slice(0, 10)}: ${fmt(s[2].median_ns)} (${s[2].commit.slice(0, 7)}${s[2].dirty ? ', uncommitted changes' : ''})</title></circle>`
    })
    return svg + '</svg>'
  }

  function hostsTable() {
    let html = '<table class="hosts"><thead><tr><th>host</th><th>label</th><th>cpu</th><th>cores</th><th>platform</th><th>runs</th><th>last</th></tr></thead><tbody>'
    for (const h of hosts) html += `<tr><td><code>${h.id}</code></td><td>${esc(h.label || '')}</td><td>${esc(h.cpu)}</td><td class="num">${h.cores}</td><td>${h.os}/${h.arch}</td><td class="num">${h.runs}</td><td>${h.last.slice(0, 10)}</td></tr>`
    return html + '</tbody></table>'
  }

  function fmt(ns) {
    return ns >= 1e6 ? (ns / 1e6).toFixed(2) + ' ms' : ns >= 1e3 ? (ns / 1e3).toFixed(1) + ' µs' : Math.round(ns) + ' ns'
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  render()
})()

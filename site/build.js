#!/usr/bin/env node
'use strict'

// Builds the static site into site/dist: every Markdown page of the
// repository's documentation rendered into a shared layout, the benchmark
// summary copied for the performance report, and a check that no link
// between pages is broken.
//
//   node site/build.js [--out DIR]

const fs = require('node:fs')
const path = require('node:path')
const { marked } = require('marked')

const ROOT = path.resolve(__dirname, '..')
const REPO = 'https://github.com/rjrodger/shape'
let OUT = path.join(__dirname, 'dist')

// Pages: source Markdown → output path. Everything under docs/ is included
// automatically; these are the other pages and where they land.
const EXTRA = {
  'README.md': 'index.html',
  'go/README.md': 'go/index.html',
  'ts/README.md': 'ts/index.html',
  'bench/README.md': 'bench/index.html',
  'bench/results/latest/README.md': 'perf/latest.html',
  'AGENTS.md': 'contributing/index.html',
}

const NAV = [
  ['Docs', 'docs/index.html'],
  ['Getting started', 'docs/tutorials/getting-started.html'],
  ['Builders', 'docs/reference/builders.html'],
  ['TypeScript', 'ts/index.html'],
  ['Go', 'go/index.html'],
  ['Performance', 'perf/index.html'],
]

function main(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') OUT = path.resolve(argv[++i])
  }
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })

  const pages = collect()
  const outputs = new Set(pages.map((p) => p.out).concat(['perf/index.html']))
  const broken = []

  for (const p of pages) {
    const md = fs.readFileSync(path.join(ROOT, p.src), 'utf8')
    const title = titleOf(md, p.src)
    let html = marked.parse(md, { gfm: true })
    html = headingIds(html)
    html = rewriteLinks(html, p, outputs, broken)
    write(p.out, layout({ title, body: html, page: p, sidebar: sidebarFor(p, pages) }))
  }

  // The performance report: a page plus the data it reads.
  write('perf/index.html', layout({ title: 'Performance', body: perfBody(), page: { out: 'perf/index.html', src: 'bench/README.md' }, sidebar: '' }))
  copy('site/perf.js', 'perf/perf.js')
  for (const f of ['summary.json', 'index.json']) {
    const src = path.join(ROOT, 'bench/results/latest', f)
    if (fs.existsSync(src)) copy(path.relative(ROOT, src), 'perf/' + f)
  }
  copy('site/style.css', 'style.css')
  write('.nojekyll', '')

  if (broken.length) {
    for (const b of broken) process.stderr.write(`broken link: ${b.from} → ${b.href}\n`)
    process.exit(1)
  }
  process.stderr.write(`built ${pages.length + 1} pages into ${path.relative(process.cwd(), OUT)}\n`)
}

// collect lists every page with its source and output path.
function collect() {
  const pages = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name)
      if (e.isDirectory()) walk(rel)
      else if (e.name.endsWith('.md')) {
        const out = e.name === 'README.md' ? rel.replace(/README\.md$/, 'index.html') : rel.replace(/\.md$/, '.html')
        pages.push({ src: rel, out })
      }
    }
  }
  walk('docs')
  for (const [src, out] of Object.entries(EXTRA)) {
    if (fs.existsSync(path.join(ROOT, src))) pages.push({ src, out })
  }
  return pages
}

function titleOf(md, src) {
  const m = md.match(/^#\s+(.+)$/m)
  return m ? m[1].replace(/[*`_]/g, '') : path.basename(src, '.md')
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function headingIds(html) {
  const seen = {}
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (m, level, inner) => {
    let id = slug(inner) || 'section'
    if (seen[id]) id += '-' + ++seen[id]
    else seen[id] = 1
    return `<h${level} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="link to this section">#</a></h${level}>`
  })
}

// rewriteLinks turns links between Markdown files into links between pages,
// and links to other repository files into links to GitHub.
function rewriteLinks(html, page, outputs, broken) {
  return html.replace(/href="([^"]+)"/g, (m, href) => {
    if (/^(https?:|mailto:|#)/.test(href)) return m
    const [target, hash = ''] = href.split('#')
    const srcDir = path.posix.dirname(page.src)
    const resolved = path.posix.normalize(path.posix.join(srcDir, target))
    let out
    if (resolved.endsWith('.md')) {
      out = resolved.endsWith('README.md') ? resolved.replace(/README\.md$/, 'index.html') : resolved.replace(/\.md$/, '.html')
      if (resolved === 'README.md') out = 'index.html'
      const extra = EXTRA[resolved]
      if (extra) out = extra
    } else if (resolved === 'docs' || resolved === 'docs/') {
      out = 'docs/index.html'
    }
    if (out && outputs.has(out)) {
      const rel = path.posix.relative(path.posix.dirname(page.out), out) || path.posix.basename(out)
      return `href="${rel}${hash ? '#' + hash : ''}"`
    }
    // Any other file in the repository links to GitHub; a file that does
    // not exist is a broken link.
    if (!fs.existsSync(path.join(ROOT, resolved))) broken.push({ from: page.src, href })
    return `href="${REPO}/blob/main/${resolved}${hash ? '#' + hash : ''}"`
  })
}

function sidebarFor(page, pages) {
  if (!page.out.startsWith('docs/')) return ''
  const sections = [
    ['Tutorials', 'docs/tutorials/'],
    ['How-to guides', 'docs/how-to/'],
    ['Reference', 'docs/reference/'],
    ['Explanation', 'docs/explanation/'],
    ['Decisions', 'docs/adr/'],
  ]
  const rel = (out) => path.posix.relative(path.posix.dirname(page.out), out)
  let html = `<nav class="side"><a class="side-top" href="${rel('docs/index.html')}">Documentation</a>`
  for (const [name, prefix] of sections) {
    const items = pages.filter((p) => p.out.startsWith(prefix) && !p.out.endsWith('index.html')).sort((a, b) => a.out.localeCompare(b.out))
    if (!items.length) continue
    html += `<h4>${name}</h4><ul>`
    for (const p of items) {
      const title = titleOf(fs.readFileSync(path.join(ROOT, p.src), 'utf8'), p.src)
      const cur = p.out === page.out ? ' class="current"' : ''
      html += `<li${cur}><a href="${rel(p.out)}">${escape(title)}</a></li>`
    }
    html += '</ul>'
  }
  return html + '</nav>'
}

function layout({ title, body, page, sidebar }) {
  const depth = page.out.split('/').length - 1
  const base = depth ? '../'.repeat(depth) : './'
  const nav = NAV.map(([name, out]) => {
    const cur = page.out === out || (out !== 'index.html' && page.out.startsWith(out.replace('index.html', ''))) ? ' class="current"' : ''
    return `<a${cur} href="${base}${out}">${name}</a>`
  }).join('')
  const source = `${REPO}/blob/main/${page.src}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · shape</title>
<link rel="stylesheet" href="${base}style.css">
</head>
<body>
<header class="top">
  <a class="brand" href="${base}index.html">shape</a>
  <nav class="main">${nav}<a href="${REPO}">GitHub</a></nav>
</header>
<div class="wrap${sidebar ? ' with-side' : ''}">
${sidebar}
<main class="content">
${body}
<footer class="foot"><a href="${source}">Edit this page on GitHub</a></footer>
</main>
</div>
</body>
</html>
`
}

function perfBody() {
  return `
<h1 id="performance">Performance</h1>
<p>How shape compares to other validators, measured on the shared cases in
<a href="../bench/index.html">bench/</a> and recorded from several hosts
over time. Times are the median nanoseconds per validation; lower is
better. The bars use a logarithmic scale.</p>
<div id="perf" class="perf"><p class="muted">Loading measurements…</p></div>
<noscript><p>The charts need JavaScript; the <a href="latest.html">latest numbers</a> are available as a table.</p></noscript>
<script src="perf.js"></script>
`
}

function escape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function write(rel, content) {
  const file = path.join(OUT, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

function copy(relSrc, relOut) {
  write(relOut, fs.readFileSync(path.join(ROOT, relSrc)))
}

main(process.argv.slice(2))

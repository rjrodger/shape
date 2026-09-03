/* Copyright (c) 2021-2026 Richard Rodger and other contributors, MIT License */

// The fast half of the prose gate: the banned list, the em-dash ration,
// the first-person rules, no emoji, and no citation of an internal
// working document. It runs with `npm test`, on every CI platform, and
// needs nothing installed.
//
// The other half is Vale (`make lint-docs`, .github/workflows/docs.yml),
// which carries spelling, Google's conventions, and the levels recorded
// in .vale.ini. The two halves split the work rather than duplicating
// it: .vale.ini switches Google.We and Google.FirstPerson OFF precisely
// BECAUSE the house rules here are stricter and know which page is a
// tutorial, which Vale cannot express.
//
// Both read the banned list from the same file. See docs/STYLE-GUIDE.md.

import { describe, test } from 'node:test'
import Assert from 'node:assert'

import * as Fs from 'node:fs'
import * as Path from 'node:path'


// ts/dist-test/docs.test.js -> the repository root.
const REPO = Path.join(__dirname, '..', '..')
const DOCS_DIR = Path.join(REPO, 'docs')


// LINE ENDINGS ARE THE CHECKOUT'S BUSINESS, not this file's. git on
// Windows checks out with CRLF by default and every pattern here anchors
// on "\n"; CI runs this suite on windows-latest.
function lf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}


// CommonMark fence opener: up to three spaces of indent, then three or
// more backticks or tildes, then an optional info string. A block opened
// with ~~~ or with four backticks is an ordinary fence, and a stripper
// that cannot see one reports a citation inside a code block -- failing
// a page that the fence exemption says is fine.
const FENCE_OPEN = /^(\s{0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/


// The closer is the same character, at least as long as the opener, per
// CommonMark -- so a four-backtick block may contain three.
function fenceCloser(fence: string): RegExp {
  return new RegExp(
    '^\\s{0,3}' + fence[0] + '{' + fence.length + ',}[ \\t]*$')
}


// Fenced blocks BLANKED rather than dropped, so a reported line number
// still matches the file. Inline code spans are kept: `CLAUDE.md` in a
// sentence is the citation being banned, not an incidental token.
function fenceless(md: string): string {
  const lines = lf(md).split('\n')
  const out = [...lines]

  for (let i = 0; i < lines.length; i++) {
    const fm = lines[i].match(FENCE_OPEN)
    if (!fm) {
      continue
    }
    const closer = fenceCloser(fm[2])
    out[i] = ''
    let j = i + 1
    for (; j < lines.length && !closer.test(lines[j]); j++) {
      out[j] = ''
    }
    if (j < lines.length) {
      out[j] = ''
    }
    i = j
  }

  return out.join('\n')
}


// Strip frontmatter, fenced blocks and inline code spans; what remains
// is prose.
function prose(md: string): string {
  return fenceless(md)
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/`[^`\n]*`/g, '')
}


// A paragraph, joined for matching, with each piece's physical line kept.
type Logical = {
  text: string
  starts: number[]
  lines: number[]
  pieces: string[]
}


// Markdown treats a newline inside a paragraph as whitespace, and these
// pages are hard-wrapped near 80 columns -- so "as the Rust\nplan
// records" is the ORDINARY shape of a multiword phrase here, not an
// exotic one. A gate matching physical lines would miss most of them,
// which makes wrapping a way through it.
//
// Lines are trimmed, whitespace-collapsed and joined per paragraph;
// `starts` maps a match offset back to the physical line, so a hit still
// names a line the reader can open.
function logical(text: string): Logical[] {
  const out: Logical[] = []
  let pieces: string[] = []
  let starts: number[] = []
  let lines: number[] = []
  let at = 0

  const flush = () => {
    if (0 < pieces.length) {
      out.push({ text: pieces.join(' '), starts, lines, pieces })
      pieces = []
      starts = []
      lines = []
      at = 0
    }
  }

  lf(text).split('\n').forEach((line, i) => {
    if ('' === line.trim()) {
      flush()
      return
    }
    const piece = line.trim().replace(/\s+/g, ' ')
    starts.push(at)
    lines.push(i + 1)
    pieces.push(piece)
    at += piece.length + 1
  })
  flush()

  return out
}


// Which physical line a match offset fell on.
function at(para: Logical, index: number): { line: number, text: string } {
  let k = 0
  for (let n = 0; n < para.starts.length; n++) {
    if (para.starts[n] <= index) {
      k = n
    }
  }
  return { line: para.lines[k], text: para.pieces[k] }
}


// Every markdown file under docs/, plus the four package READMEs.
//
// docs/design/ is excluded: the plans are working documents for
// maintainers, not documentation, and `make lint-docs` excludes them for
// the same reason. docs/STYLE-GUIDE.md is excluded because it quotes the
// banned phrases in order to ban them.
//
// Returns repo-relative labels with absolute paths.
function walk(dir: string, out: string[] = []): string[] {
  for (const e of Fs.readdirSync(Path.join(REPO, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) {
      if ('docs/design' !== rel) {
        walk(rel, out)
      }
    }
    else if (e.name.endsWith('.md') && 'docs/STYLE-GUIDE.md' !== rel) {
      out.push(rel)
    }
  }
  return out
}

const READMES = ['README.md', 'ts/README.md', 'go/README.md', 'rs/README.md']

function stylePaths(): { file: string, abs: string }[] {
  return [...walk('docs').sort(), ...READMES]
    .filter((f) => Fs.existsSync(Path.join(REPO, f)))
    .map((f) => ({ file: f, abs: Path.join(REPO, f) }))
}


// The reader-facing set for the internal-document rule: the Diátaxis
// pages, and nothing else.
//
// Deliberately NARROWER than stylePaths(), on two counts. docs/adr/ is
// excluded because a decision record citing the analysis it came from is
// doing its job -- the rule runs one way, out of documentation only. The
// READMEs are excluded because a package README is a contributor's
// doorway as well as a reader's, and pointing a would-be contributor at
// the contributor guide is part of its job; every other rule in this
// file still covers them.
function readerPaths(): { file: string, abs: string }[] {
  return stylePaths().filter(({ file }) =>
    file.startsWith('docs/') && !file.startsWith('docs/adr/'))
}


// THIS FILE HOLDS NO COPY OF THE BANNED LIST. It reads the one Vale
// reads, so the fast local gate and the CI prose gate cannot disagree
// about what is banned.
const REJECT_FILE = Path.join(
  REPO, '.vale', 'styles', 'config', 'vocabularies', 'Shape', 'reject.txt')

// Vale matches reject.txt entries case-insensitively on word
// boundaries; mirror exactly that so a phrase cannot pass one gate and
// fail the other.
function loadBanned(): [RegExp, string][] {
  return lf(Fs.readFileSync(REJECT_FILE, 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => '' !== line && !line.startsWith('#'))
    // Global, because the gate scans with matchAll: a paragraph can
    // carry two banned phrases and both should be reported.
    .map((pat) => [new RegExp(`\\b(?:${pat})\\b`, 'gi'), pat])
}

const BANNED: [RegExp, string][] = loadBanned()


// A document named by DESCRIPTION rather than by filename needs the
// shape of a citation, not the bare noun. "the performance plan for the
// next round" would be ordinary vocabulary; "as the performance plan
// records" is a source the reader has to leave the documentation to
// consult.
const CITED = '(?:rust|performance|parity|port|design) plan'
const SAYS = 'explains?|notes?|records?|says?|argues?|states?|covers?'

const CITES_ONE = new RegExp(`\\b(?:see|per|as) the (?:${CITED})\\b`, 'gi')
const ONE_SAYS = new RegExp(`\\bthe (?:${CITED}) (?:${SAYS})\\b`, 'gi')


// Internal working documents: the plans, and the files that instruct
// contributors and agents. See docs/STYLE-GUIDE.md, "Documentation does
// not cite internal documents".
//
// SHORTER THAN THE JOSTRACA LIST THIS IS PORTED FROM, by one entry:
// decision records are not on it. They are under docs/adr/ here, the
// site renders them as a section of its own, and a reader weighing
// whether to adopt shape is owed the reasoning behind a decision as
// binding as "validation is synchronous". A page may therefore link one.
// What a page may NOT do is leave a fact living only there.
//
// The NAME is banned as well as the link. "As the Rust plan records"
// strands a reader exactly as a URL does: the sentence cannot be acted
// on without leaving the documentation, and the document it points at is
// working material that moves with the code.
const INTERNAL_DOCS: [RegExp, string][] = [
  [/\bdocs\/design\//g, 'docs/design/'],
  [/\b[A-Z][A-Z0-9_]*_PLAN\.md\b/g, 'a plan file'],
  [/\b(?:rust|performance|parity|port|design)[- ]plan(?:\.md)?\b/gi, 'a plan'],
  [/\bCLAUDE\.md\b/g, 'CLAUDE.md'],
  [/\bAGENTS\.md\b/g, 'AGENTS.md'],
  [CITES_ONE, 'an internal document, cited'],
  [ONE_SAYS, 'an internal document, cited'],
]


describe('docs-style', () => {

  // Logical lines, for the reason in logical(): the list is mostly
  // MULTIWORD and the pages wrap near 80 columns, so a physical-line
  // scan would miss any phrase a wrap happened to split.
  //
  // The tests after this one stay on physical lines on purpose: `we` and
  // `I` are single tokens no wrap can split, and the em-dash ration is
  // defined per line rather than per paragraph.
  test('no-banned-phrases-in-prose', () => {
    const hits: string[] = []
    for (const { file, abs } of stylePaths()) {
      for (const para of logical(prose(Fs.readFileSync(abs, 'utf8')))) {
        for (const [re, name] of BANNED) {
          for (const m of para.text.matchAll(re)) {
            if (null == m.index) {
              continue
            }
            const { line, text } = at(para, m.index)
            const hit = `${file}:${line} "${name}": ${text}`
            if (!hits.includes(hit)) {
              hits.push(hit)
            }
          }
        }
      }
    }
    Assert.deepEqual(hits, [],
      `banned phrases (docs/STYLE-GUIDE.md):\n${hits.join('\n')}`)
  })


  // One em-dash ASIDE per line: a single trailing dash, or one matched
  // pair around a parenthetical. The guide allows the dash and rations
  // it, which is the half a reviewer forgets; three on a line is the
  // stacking the ration exists to stop.
  test('em-dashes-are-rationed', () => {
    const hits: string[] = []
    for (const { file, abs } of stylePaths()) {
      prose(Fs.readFileSync(abs, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          // A table row is a set of cells, not a sentence; two cells
          // each carrying one aside is not a stacked aside.
          if (/^\s*\|/.test(line)) {
            return
          }
          const n = (line.match(/—/g) || []).length
          if (2 < n) {
            hits.push(`${file}:${i + 1} ${n} em dashes: ${line.trim()}`)
          }
        })
    }
    Assert.deepEqual(hits, [],
      'more than one em-dash aside on a line (docs/STYLE-GUIDE.md):\n' +
      hits.join('\n'))
  })


  // First person, the house rule that .vale.ini switches Google.We and
  // Google.FirstPerson OFF in favour of. Vale cannot express "only in
  // tutorials", which is why the rule lives here instead.
  //
  // STYLE-GUIDE.md voice rule 7: talk to the reader as "you". "We"
  // appears only in tutorials, walking through code together. "I"
  // appears nowhere.
  const TUTORIALS = 'docs/tutorials/'

  test('we-appears-only-in-tutorials', () => {
    const hits: string[] = []
    for (const { file, abs } of stylePaths()) {
      if (file.startsWith(TUTORIALS)) {
        continue
      }
      prose(Fs.readFileSync(abs, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          const m = line.match(/\b(we|we'(?:ll|ve|re|d)|us|our|ours|let's)\b/i)
          if (m) {
            hits.push(`${file}:${i + 1} "${m[1]}": ${line.trim()}`)
          }
        })
    }
    Assert.deepEqual(hits, [],
      'first-person plural outside a tutorial ' +
      `(docs/STYLE-GUIDE.md, voice rule 7):\n${hits.join('\n')}`)
  })


  // "I" is stricter than Google's rule, and applies to every page.
  // I/O is a word, not a pronoun; the negative lookahead keeps it.
  test('first-person-singular-appears-nowhere', () => {
    const hits: string[] = []
    for (const { file, abs } of stylePaths()) {
      prose(Fs.readFileSync(abs, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          const m = line.match(
            /\bI(?!\/O)\b|\bI'(?:m|ve|ll|d)\b|\b(?:my|mine|myself)\b/i)
          if (m) {
            hits.push(`${file}:${i + 1} "${m[0]}": ${line.trim()}`)
          }
        })
    }
    Assert.deepEqual(hits, [],
      'first-person singular in documentation ' +
      `(docs/STYLE-GUIDE.md, voice rule 7):\n${hits.join('\n')}`)
  })


  test('no-emoji', () => {
    const hits: string[] = []
    for (const { file, abs } of stylePaths()) {
      lf(Fs.readFileSync(abs, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line)) {
            hits.push(`${file}:${i + 1}: ${line.trim()}`)
          }
        })
    }
    Assert.deepEqual(hits, [],
      `emoji are not used in documentation:\n${hits.join('\n')}`)
  })


  // A repo-layout listing that happens to show CLAUDE.md is fine; it is
  // inside a fence, and it makes no claim the reader has to follow.
  test('no-internal-doc-references', () => {
    const hits: string[] = []
    for (const { file, abs } of readerPaths()) {
      for (const para of logical(fenceless(Fs.readFileSync(abs, 'utf8')))) {
        for (const [re, name] of INTERNAL_DOCS) {
          // matchAll, not match: a paragraph can carry more than one
          // citation, and reporting only the first hides the rest behind
          // a fix for the one named.
          for (const m of para.text.matchAll(re)) {
            if (null == m.index) {
              continue
            }
            const { line, text } = at(para, m.index)
            const hit = `${file}:${line} "${name}": ${text}`
            if (!hits.includes(hit)) {
              hits.push(hit)
            }
          }
        }
      }
    }
    Assert.deepEqual(hits, [],
      'documentation cites an internal working document ' +
      `(docs/STYLE-GUIDE.md):\n${hits.join('\n')}`)
  })


  // The guide and this gate must agree; the guide names this block, so
  // a reader of either finds the other. The same for the banned list:
  // if reject.txt moves, the pointer in the guide has to move with it.
  test('the-style-guide-names-this-gate', () => {
    const guide = lf(Fs.readFileSync(
      Path.join(DOCS_DIR, 'STYLE-GUIDE.md'), 'utf8'))
    Assert.ok(guide.includes('docs.test.ts'),
      'STYLE-GUIDE.md should point at this test file')
    Assert.ok(guide.includes('vocabularies/Shape/reject.txt'),
      'STYLE-GUIDE.md should point at the banned list this gate reads')
    Assert.ok(Fs.existsSync(REJECT_FILE),
      `the banned list should exist at ${REJECT_FILE}`)
    Assert.ok(0 < BANNED.length, 'the banned list should not be empty')
  })

})

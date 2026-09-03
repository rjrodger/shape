# Documentation style guide

How the shape documentation is written. This guide is normative for
`docs/**/*.md` and for the four package READMEs (root, `ts/`, `go/`,
`rs/`), which are the first prose most readers see: npm renders `ts/`,
pkg.go.dev renders `go/`, crates.io renders `rs/`, and GitHub renders the
root. It is normative for the website too, which is those same pages
built by `site/build.js`. It exists so that a page written next year
sounds like a page written this year, and so that a reviewer can point at
a rule instead of arguing taste.

Three sources feed it, in a fixed priority order. The same order is
encoded in `.vale.ini`, and every rule switched off there names the
reason:

    house voice  ->  Google  ->  Vale defaults

1. **This file.** Where it rules, it rules. The house voice is Richard
   Rodger's blog register, and the places it wins are listed with their
   reasons rather than left as silent exceptions: first-person plural in
   tutorials, British spellings, quotation punctuation outside the
   quotes, and the parenthesis ration.
2. The [Google developer documentation style
   guide](https://developers.google.com/style) for everything this file
   does not cover: second person, present tense, active voice,
   sentence-style capitalisation in headings, serial commas, one idea
   per sentence, dash spacing.
3. [Vale](https://vale.sh) defaults, which mostly means spelling.

Two gates check it, and both run in CI:

| Gate | Runs | Checks |
|---|---|---|
| `make lint-docs` | `.github/workflows/docs.yml` | Google's rules plus the banned list, at the levels set in `.vale.ini` |
| `ts/test/docs.test.ts` | `npm test`, so every CI platform | the banned list, the em-dash ration, the first-person rules, no emoji, no internal-document citations |

The banned list is read from one file by both, so they cannot drift.
A Google rule sitting at `warning` rather than `error` was tried at
error level first and found wrong for these pages; `.vale.ini` records
what it produced and why it was demoted.

Vale is pinned twice over: the binary version in the workflow, and the
Google package by release URL in `.vale.ini`. Pinning one without the
other leaves a docs pull request able to turn red because somebody else
shipped a release.

## The structure: Diátaxis, enforced by placement

Every page is exactly one of four kinds, and the kind decides what the
page may do:

| Kind | Files | May | May not |
|---|---|---|---|
| Tutorial | `tutorials/*.md` | teach step by step, show output for every step, defer detail with a link | argue design, list every builder, assume the reader's goal |
| How-to | `how-to/*.md` | solve one named task, assume competence, link the reference | teach basics, explain design, drift into a second task |
| Reference | `reference/*.md` | state facts exhaustively and dryly, pin claims to tests | narrate, persuade, teach |
| Explanation | `explanation/*.md` | argue, compare, admit trade-offs, tell the design's story | be the only place a fact lives |

One fact appears in all four kinds at different altitudes—met in the
tutorial, used in a how-to, specified in the reference, argued in the
explanation—but the normative statement lives in the reference and
everything else links to it.

`docs/README.md` is the doorway and belongs to no kind: it routes, and
states no fact of its own that a page beneath it does not also state.

Two directories sit outside the four kinds. `docs/adr/` holds decision
records: published, linkable, and argued at a length no reference page
should carry. `docs/design/` holds the plans, which are not published at
all: `site/build.js` skips the directory and `make lint-docs` excludes
it.

## Documentation does not cite internal documents

**A documentation page never sends a reader to a plan or to an agent
instruction file.** Those are working documents: written for the people
changing this repository, argued rather than stated, and stale the moment
the code moves past them. A reader who follows a link out of the
documentation and lands in one has been handed the project's notes in
place of an answer.

The internal set, by name:

| Document | What it is |
|---|---|
| `docs/design/*.md` | the plans, revised as the code moves |
| `CLAUDE.md`, `AGENTS.md` | instructions to contributors and agents working in the repository |

The ban covers the name as much as the link. "As the Rust plan records"
fails for the same reason the URL does: the reader still cannot act on
the sentence without leaving the documentation.

State the fact instead. "TypeScript is canonical; change it first, then
bring Go and Rust into parity" is what a reader needs, and a link to the
guide that also says so adds nothing to it. Where the fact belongs in
the documentation and is missing, write it into the Diátaxis page that
owns it rather than pointing outside.

The rule runs one way. Internal documents cite each other and cite the
documentation freely, because a plan that does not show its working is
not a plan. Only the direction out of documentation is closed.

**Decision records are not on that list**, and this is where the guide
parts company with the jostraca original it is ported from. They live
under `docs/adr/`, the site renders them as a section of its own, and a
reader weighing whether to adopt Shape is owed the reasoning behind a
decision as binding as "validation is synchronous". A page may link one.
What a page may not do is leave a fact living only there: the ADR argues
the decision, the reference states what it means for the API.

Four things are not internal documents, and stay linkable. **Source** is
code: `test/*.tsv`, a file under `ts/src/`, or the test a claim is pinned
to; so are the harness READMEs those pages point at, `test/README.md`,
`test/differential/README.md` and `bench/README.md`. **The decision
records**, as previously. **This guide** is normative rather than
exploratory, and it names the internal documents in order to ban them.
**The other READMEs** are documentation themselves.

`ts/test/docs.test.ts` enforces this over the Diátaxis pages. It does not
run over `docs/adr/`, where citing the analysis a decision came from is
exactly right, nor over the four READMEs: a package README is a
contributor's doorway as well as a reader's, and pointing a would-be
contributor at `AGENTS.md` is part of its job. Every other rule in this
guide covers the READMEs. Vale does not carry this rule at all.

## The voice

The house voice is Richard Rodger's blog register, adapted per document
kind. The portable part of that voice is its *rhythm*, not its stock
phrases. Ten habits, with the register they apply in:

1. **Open with a concrete fact or a plainly stated problem, then a
   short dry beat.** Tutorials and how-tos. Reference pages open by
   stating what the thing is.
2. **Introduce code with a short colon-terminated sentence**—"Validate
   it:", "Now add a bound:". Never "The following code snippet
   demonstrates". Everywhere.
3. **After a code block, point at the one interesting thing.** Do not
   recap the code. Everywhere.
4. **Parentheses carry definitions, caveats, and at most one dry aside
   per page.** Tutorials and how-tos. In reference pages, parentheses
   carry facts only.
5. **A trade-off gets bolted on with a dash, and the dash earns its
   place.** One per paragraph at most, never two in a sentence.
6. **Alternate one long explanatory sentence with one short verdict
   sentence.** The short sentence is the payoff. Everywhere.
7. **Talk to the reader as "you", and route them** ("If you only want a
   type check, skip to…"). "We" appears only in tutorials, walking
   through code together. "I" appears nowhere.
8. **Show that the code is real.** Every claim about behaviour is one a
   test pins; where a page quotes an error message, it quotes the exact
   text the implementation produces, which the shared corpus fixes in
   all three languages.
9. **Jokes are self-directed or about the industry's mundanity, and the
   register goes fully serious the moment correctness or a reader's
   data is on the table.** Never joke about the reader, other
   validators, or the consequences of a validation that lets bad data
   through.
10. **Close by handing the reader something**: a link, a next step, one
    sentence. No summary paragraphs that restate the page.

Exclamation marks: at most one per page, in tutorials only, on a
genuine payoff.

## Banned phrases and patterns

These read as generated filler. Do not use them, in any document,
including commit messages that quote the docs.

**The list itself lives in
`.vale/styles/config/vocabularies/Shape/reject.txt`**, one regular
expression per line. That file is the single source of truth: Vale
reads it in CI, and `ts/test/docs.test.ts` (the `docs-style` block)
reads the same file rather than keeping a second copy, so the two
gates cannot disagree about what is banned. Add a phrase there and both
pick it up. What follows is a reader's summary of it, not a second
list; every phrase is shown as code so that quoting a banned phrase in
this guide does not fail the gate.

It draws on two sources: the house list this project shares with
[jostraca](https://github.com/jostraca/jostraca), and
[claudisms.ai](https://claudisms.ai/), a catalogue of the patterns that
mark machine-written prose.

**Filler and false emphasis**: `worth noting` · `important to note` ·
`it cannot be overstated` · `at its core` · `when it comes to` ·
`let's break it down` · `here's where it gets interesting` ·
`the point is` · `because it matters`.

**Inflated vocabulary**: `delve` · `dive into` · `robust` · `seamless` ·
`comprehensive` · `holistic` · `intricate` · `leverage` · `foster` ·
`shed light on` · `pave the way` · `pivotal` · `transformative` ·
`game-changing` · `cutting-edge` · `groundbreaking` · `testament to` ·
`paradigm shift` · `realm` · `landscape of` · `underscores the` ·
`lean into` · `throughline` · `double-click on` · `mature setup`.

**Consultant register**: `north star` · `key takeaways` ·
`best practices` (name the practice instead) · `at the end of the day` ·
`pressure-test` · `right-size` · `strategic imperative` ·
`three things to know` · `dispatches from` · `best operators` ·
`lessons learned`.

**Metaphor inflation**: `load-bearing` · `heavy lifting` ·
`is doing the work` · `different physics` · `hits hardest` ·
`quietly` (say `silently`, which is the term of art for a failure that
reports nothing).

**The contrast frame and its cousins**: `not just` · `not only X but Y` ·
`it's not about` · `the whole game` · `the entire point` ·
`the only thing that matters`. Say what the thing is.

**False singularity**: `the right way/answer/tool/question` ·
`the best thing you can do` · `if I had to pick` · `what struck me` ·
`stuck with me` · `struck a chord` · `hit a nerve` ·
`we've seen this movie before`.

**Reflective pose**: `sit with` · `worth exploring/considering/asking` ·
`keeps coming back to` · `that's the tell` · `where I landed`.

**Invented observation about people**: `most people` ·
`everyone I've worked with` · `a lot of folks` · `nobody I know`. If it
did not happen, do not claim to have noticed it.

**Signposting**: `let's explore` · `now let's turn to` · `moving on to` ·
`in today's rapidly evolving` · `reflecting a broader trend` ·
`great question`.

**`honest`, and every form of it**, is banned differently from the rest.
The word is fine English; it is on the list because it had become a tic
across the repositories that share this guide, where it flattered a
sentence rather than said anything the sentence did not already say:
`the honest word`, `the honest complication`, `the corpus that keeps
them honest`. In each of those the word came out and nothing was lost.

**The gate is absolute, and the lack of an inline exemption is the
point.** There is no `allow` comment and no suppression the second gate
would honour, because an escape hatch that exists is an escape hatch that
gets used, and this is a word that is easy to reach for. A use the author
wants kept is approved by changing `reject.txt`: one line, in one file,
visible in review, which is where an approval belongs.

### What is not banned, and why

Several entries on claudisms.ai are deliberately absent, because they
name things this project documents. A gate that fires on the subject
matter is a gate people learn to switch off.

| Not banned | Because |
|---|---|
| `shape` | It is the name of the package, and of the thing a spec describes. |
| `real` | `the real value` distinguishes what came out of a walk from the example that defined it. |
| `surface` | `the option surface` is how the reference describes an API. |
| `hold`, `carry`, `hands` | A node holds children, a key expression carries its example, `error()` hands back a list. |
| `lives` | `the normative statement lives in the reference` is this guide, one section up. |
| `decision record` | `docs/adr/` is full of them, and they are documentation here, not working material. |
| `regex` | The Rust port's engine is a crate called `regex`, named in three reference pages. Google's `regex` → `regular expression` substitution is therefore not in `Shape.WordChoice`. |
| `above` when capitalised | `Above` is a bound builder. `Shape.WordChoice` is case-sensitive so that the accessibility rule catches the adverb and leaves the builder alone. |

The rule behind the list: ban the phrase that adds nothing, never the
word that names a thing.

**Matching spans a line wrap.** These pages wrap near 80 columns and most
of the list is multi-word, so the gate joins each paragraph before
matching: `worth\nnoting` fails exactly as `worth noting` does. A gate
that matched physical lines would make wrapping a way through it.

**Patterns** (not mechanically checkable, enforced at review):

- Announcing structure before delivering it ("There are three things to
  understand").
- Restating the question before answering it.
- A closing one-liner that restates the thesis.
- Stacked short declaratives (four or more in a row).
- Superlative self-ranking ("the most important thing", "the part that
  matters most").
- A list of `**Bold term**: explanation` pairs, which is the single most
  recognisable machine-written list. Write sentences, or a table.

**Punctuation rulings**:

- Em dashes are allowed, and take **no space on either side**:
  `a dash—like this`. That is Google's ruling
  ([dashes](https://developers.google.com/style/dashes)) and
  `Google.EmDash` fails the build on a spaced one. They stay **rationed
  to one aside per sentence**: either a single dash before a trailing
  clause, or one matched pair around a parenthetical, never both and
  never two asides. `docs.test.ts` enforces the ration, Vale enforces
  the spacing. Prefer a comma or parentheses when the aside is mild.
  (claudisms.ai bans the em dash outright. This project keeps it,
  because the voice it also asks for uses it; the spacing follows Google
  and the ration is ours.)
  A dash that a line wrap would split has to be reflowed onto one line:
  Markdown turns the newline into a space, so `parity —\nTypeScript` and
  `parity—\nTypeScript` both render with a space the ruling forbids.
  One shape trips Vale wrongly: in a list item, bold text followed
  immediately by a dash and then a code span reads to it as spaced, even
  though it is not. Put a word after the dash, or use a colon.
- In a link list, separate the link from its gloss with a dash directly
  against the closing parenthesis, or a full stop:
  `- [Validate objects](how-to/validate-objects.md)—nesting, unknown keys…`.
- A table cell meaning "not applicable" is `n/a`, not a bare dash. The
  dash reads as an em dash to the gate and as nothing at all to a screen
  reader.
- No emoji in documentation.
- Sentence-style capitalisation in headings (Google style).
- British spellings (`-ise`, `-isation`) in prose. Google style is US
  English; this is one of the places the house voice wins, and
  `accept.txt` carries the stems. **Identifiers keep their own
  spelling**: the function is `normalize`, the sentence about it says
  "normalises".

## Terminology

- The package is `shape` in code and **Shape** in prose, capitalised
  because a sentence about "shape" and "a shape" is unreadable
  otherwise.
- **spec**—what you hand `Shape()`: an example value, a type token, a
  builder call, or a nested structure of those. Not "schema", which
  means a JSON Schema document here.
- **shape**—the compiled validator `Shape()` returns. It is callable and
  carries `valid`, `match`, `error`, `json` and the rest.
- **node**—the internal tree a spec normalises into, one per position.
  Documented in `docs/reference/nodes.md`. Not "rule".
- **builder**—one of `Min`, `Optional`, `Child`, `One` and the rest. They are
  callable and chainable. Not "combinator", and not "modifier".
- **key expression** and **value expression**—the two halves of the
  string DSL: `{'a: Min(2)': 0}` and `'Min(2)'`. Never "the DSL" alone
  when one of the two is meant.
- **produced value**—what a shape returns, which is the input plus
  defaults and any transformation. Say "produced", not "output" and not
  "coerced result"; `Coerce` is a specific builder.
- **the corpus**—`test/*.tsv`, the shared conformance rows all three
  implementations run. **The differential harness** is the generated
  comparison in `test/differential/`. They are two gates, not one.
- **port**—the Go and Rust implementations. TypeScript is
  **canonical**; it is not "the reference implementation" in one
  sentence and "canonical" in the next.
- Say **kind** for what a node accepts (`string`, `number`, `object`…),
  and reserve **type** for a TypeScript type.

## Code examples

Every fenced example is expected to run as written against the current
release, and the claims around it match what the implementation
produces. `ts/test/readme.test.ts` and `ts/test/review.test.ts` pin the
behaviour the pages depend on, and the shared corpus fixes every error
message a page quotes, in all three languages at once.

Two rules of taste:

- An example shows a moment: one spec, one value, short output. Anything
  needing a fixture corpus belongs in `ts/test/`, and the page links to
  it.
- A page that shows the same idea in more than one language shows it in
  the same order every time: TypeScript, then Go, then Rust.

## Per-kind templates

**Tutorial section**: goal sentence → snippet → output → the one
observation → forward link. Every step's output shown.

**How-to guide**: title is the task in "How to…" form; one sentence of
situation; the recipe; one paragraph of what to watch for; links (the
reference for the constructs, the tutorial for the basics it assumes).

**Reference section**: definition, then behaviour, then edge cases,
then a pinned example. Every claim that has a test can name it.

**Explanation section**: the question, the answer, the argument, the
trade-off admitted. May quote history when the history is the argument.

## Updating this guide

Change it the way behaviour changes: in the same commit as the first
page that follows the new rule, with the reasoning in the commit
message.

To ban a phrase, add the regular expression to
`.vale/styles/config/vocabularies/Shape/reject.txt` and summarise it in
the list preceding. Both gates pick it up from that one file; there is
no second list to update, and `docs.test.ts` names this file, so a drift
is a build failure with a pointer.

To accept a word the spelling gate does not know, add it to
`accept.txt`—as a regular expression that admits both casings
(`[Nn]odize`), or Vale will start enforcing the one casing you wrote.
Never add a suffix pattern such as `\w+ise`: it accepts every word
ending in those letters and empties the spelling gate.

To change a Google rule's level, edit `.vale.ini` and write down what
the rule produced on a clean run. "It was noisy" is not a reason; "it
maps `touch` to `tap`, and the mobile-UI mapping is 2 of its 18 hits"
is. A rule demoted without that note reads later as an oversight, and
gets re-promoted by someone repeating the work.

// Runs the compiled tests in dist-test/ with the Node test runner.
//
// `node --test dist-test/*.test.js` relies on someone expanding the glob:
// the shell on POSIX, or Node itself from 21 on. On Node 20 under cmd.exe
// nobody does, so the file list is built here instead. Extra arguments are
// passed through to `node --test`, e.g. `--test-name-pattern`.
const { readdirSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const dir = path.join(__dirname, '..', 'dist-test')
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.js'))
  .sort()
  .map((f) => path.join(dir, f))

const res = spawnSync(
  process.execPath,
  ['--enable-source-maps', '--test', ...process.argv.slice(2), ...files],
  { stdio: 'inherit' },
)
process.exit(null == res.status ? 1 : res.status)

'use strict'
// Emit the case matrix as JSON for both language runners.
//
//   node test/differential/gen.js <out.json>

const fs = require('fs')
const path = require('path')

const { build } = require(path.join(__dirname, 'cases.js'))

const cases = build()
fs.writeFileSync(process.argv[2], JSON.stringify(cases))
process.stderr.write(`gen: ${cases.length} cases -> ${process.argv[2]}\n`)

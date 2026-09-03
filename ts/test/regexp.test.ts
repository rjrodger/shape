/* Copyright (c) 2021-2024 Richard Rodger and other contributors, MIT License */

// The shared regexp subset (docs/reference/regexp.md): what every engine
// accepts, what every engine refuses, and with which text. The Go and Rust
// ports carry this table too.

import { describe, test } from 'node:test'
import assert from 'node:assert'

import { Shape as ShapeX } from '../dist/shape'

let ShapeModule = require('../dist/shape')
if (ShapeModule.Shape) {
  ShapeModule = ShapeModule.Shape
}
const Shape: ShapeX = ShapeModule
const { expr, Check } = ShapeModule

const REJECT: [string, string][] = [
  ["(?=a)", "lookaround, named groups and inline flags are not in the subset"],
  ["(?<n>a)", "lookaround, named groups and inline flags are not in the subset"],
  ["(?i)a", "lookaround, named groups and inline flags are not in the subset"],
  ["(a)\\1", "escape \\1 is not in the subset"],
  ["[^]", "empty character class"],
  ["[]", "empty character class"],
  ["\\u00e9", "escape \\u is not in the subset"],
  ["\\p{L}", "escape \\p is not in the subset"],
  ["[[:alpha:]]", "POSIX classes are not in the subset"],
  ["[a[b]", "[ must be escaped inside a character class"],
  ["[a&&b]", "class set operators (&&, --, ~~) are not in the subset"],
  ["[a--b]", "class set operators (&&, --, ~~) are not in the subset"],
  ["[a~~b]", "class set operators (&&, --, ~~) are not in the subset"],
  ["[\\d-z]", "a range cannot start or end at a class shorthand"],
  ["[a-\\d]", "a range cannot start or end at a class shorthand"],
  ["[\\D]", "\\D, \\W and \\S are not allowed inside a character class"],
  ["[\\b]", "\\b and \\B are not allowed inside a character class"],
  ["[\\q]", "escape \\q is not in the subset"],
  ["[\\x4]", "\\x needs two hex digits"],
  ["[a", "unterminated character class"],
  ["[a\\", "trailing backslash"],
  ["a\\", "trailing backslash"],
  ["\\x4", "\\x needs two hex digits"],
  ["\\-", "escape \\- is only allowed inside a character class"],
  ["\\q", "escape \\q is not in the subset"],
  ["a]", "unescaped ]"],
  ["(a", "unbalanced parentheses"],
  ["a)", "unbalanced parentheses"],
  ["a**", "nothing to repeat"],
  ["*a", "nothing to repeat"],
  ["^*", "nothing to repeat"],
  ["a{", "lone quantifier brace"],
  ["a}", "lone quantifier brace"],
  ["a{x}", "lone quantifier brace"],
  ["a{2x}", "lone quantifier brace"],
  ["{2}", "nothing to repeat"],
  ["a???", "nothing to repeat"],
]

const ACCEPT: [string, string, boolean][] = [
  ["^\\d+$", "12", true],
  ["^\\d+$", "\u0661\u0662", false],
  ["^\\D+$", "ab", true],
  ["^\\D+$", "a1", false],
  ["^\\w+$", "ab_1", true],
  ["^\\w+$", "\u00e9", false],
  ["^\\W+$", "\u00e9", true],
  ["^\\s+$", " \t", true],
  ["^\\s+$", "\u00a0", false],
  ["^\\S+$", "ab", true],
  ["^[\\s\\d\\w]+$", " 1a", true],
  ["^[^\\d]+$", "ab", true],
  ["^[^\\d]+$", "a1", false],
  ["^a.b$", "a\nb", false],
  ["^a.b$", "a\rb", true],
  ["^a.b$", "a\ud83d\ude00b", true],
  ["^a$", "a\n", false],
  ["\\bx\\b", "a x b", true],
  ["\\bx\\b", "axb", false],
  ["\\Bx\\B", "axb", true],
  ["^x{2,3}?$", "xx", true],
  ["^x{2}$", "xxx", false],
  ["^x{2,}$", "xxxx", true],
  ["^x+?$", "xx", true],
  ["^x*$", "", true],
  ["^(?:a|b)+$", "abab", true],
  ["^(a|b)+$", "abab", true],
  ["^\\/$", "/", true],
  ["^\\x41$", "A", true],
  ["^[a-c-]+$", "a-c", true],
  ["^[-a]+$", "-a", true],
  ["^[\\-\\]\\[]+$", "-][", true],
  ["^\u00e9+$", "\u00e9\u00e9", true],
  ["^\\t\\n\\r\\f\\v$", "\t\n\r\f\u000b", true],
  ["^[\\t\\n\\r\\f\\v]+$", "\t\n", true],
  ["^\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\^\\$\\\\$", ".*+?()[]{}|^$\\", true],
  ["^a{1}$", "a", true],
  ["^[a{]+$", "a{", true],
  ["^[a}]+$", "a}", true],
  ["^\\x41\\x62$", "Ab", true],
  ["^[\\x41-\\x43]+$", "AB", true],
  ["^[a\\x2d]+$", "a-", true],
]

describe('regexp-subset', () => {
  test('refuses what is outside the subset, with the shared text', () => {
    for (const [pattern, reason] of REJECT) {
      const want = 'Shape: invalid regexp /' + pattern + '/: ' + reason
      assert.throws(() => expr('/' + pattern + '/'), (e: any) => e.message === want, pattern + ' as an expression')
      // A RegExp outside the subset that JavaScript itself compiles.
      let re: RegExp | undefined
      try { re = new RegExp(pattern) } catch (_e) { }
      if (re) {
        assert.throws(() => Shape(re), (e: any) => e.message === want, pattern + ' as a RegExp')
        assert.throws(() => Shape(Check(re)), (e: any) => e.message === want, pattern + ' in Check')
      }
    }
    assert.throws(() => expr('/^a$/i'), (e: any) => e.message === 'Shape: invalid regexp /^a$/: flags are not supported')
    assert.throws(() => Shape(/a/i), /flags are not supported/)
    assert.throws(() => Shape(Check(/a/g)), /flags are not supported/)
    assert.throws(() => expr('//'), (e: any) => e.message === 'Shape: invalid regexp //: empty pattern')
    assert.throws(() => expr('Check(/a/i)'), (e: any) => e.message === 'Shape: invalid regexp /a/: flags are not supported')
    assert.throws(() => ShapeModule.fromJsonSchema({ type: 'string', pattern: '(?=a)' }), /bad pattern/)
  })

  test('reads what is inside the subset the same way everywhere', () => {
    for (const [pattern, input, ok] of ACCEPT) {
      const re = new RegExp(pattern)
      assert.equal(Shape(expr('/' + pattern + '/')).valid(input), ok, pattern + ' on ' + JSON.stringify(input))
      assert.equal(Shape(re).valid(input), ok, pattern + ' as a RegExp')
      assert.equal(Shape(Check(re)).valid(input), ok, pattern + ' in Check')
      assert.equal(Shape(ShapeModule.fromJsonSchema({ type: 'string', pattern })).valid(input), ok, pattern + ' imported')
    }
    // The original text is what renders and exports.
    const s = Shape({ a: /^\d+$/ })
    assert.equal(s.stringify(), '{"a":"/^\\\\d+$/"}')
    assert.equal(s.jsonSchema().properties.a.pattern, '^\\d+$')
    assert.throws(() => s({ a: '\u0661' }), /did not match \/\^\\d\+\$\//)
  })
})

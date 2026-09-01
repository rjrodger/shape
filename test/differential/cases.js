'use strict'
// Case matrix for the TS<->Go differential parity harness.
//
// This file declares (spec, input) pairs only — it computes no expectations.
// Both implementations run every pair; compare.js diffs the verdict, the
// produced value and the EXACT error text. That exactness is the point: the
// shared corpus in ../*.tsv compares errors by substring, so it cannot see
// separator, ordering or extra-error differences.
//
// Spec cells use the same sentinel encoding as the corpus (see ../README.md):
//   {"$type":"String"} {"$open":X} {"$closed":X} {"$required":X}
//   {"$optional":X} {"$expr":"Min(2,String)"}
// Anything else is raw JSON.

const T = { $type: 'String' }, N = { $type: 'Number' }, B = { $type: 'Boolean' }
const O = { $type: 'Object' }, A = { $type: 'Array' }, ANY = { $type: 'Any' }
const E = (s) => ({ $expr: s })

// Input batteries. Each spec is crossed with the battery that suits its shape,
// so one spec declaration yields a dozen or more comparisons.
const SCALARS = [
  1, 0, -1, 3.5, 'x', '', 'abc', true, false, null,
  [], [1], [1, 2, 3], {}, { a: 1 }, 'null', '0',
]

const OBJS = [
  {}, { a: 1 }, { a: 'x' }, { a: null }, { a: 1, b: 2 },
  // A second and third unknown key: a closed object reports them in one
  // pluralized message, so this pins that wording too. Keys stay in
  // alphabetical order — Go maps have no insertion order to render, so an
  // out-of-order object cannot be compared once it appears in a message.
  { a: 1, b: 2, c: 3 },
  { b: 2 }, { a: {} }, { a: [] }, null, [], 'x', 1, true,
]

const ARRS = [
  [], [1], [1, 2], [1, 2, 3], ['x'], [1, 'x'], ['x', 1],
  [null], [1, null], {}, null, 'x', 1, [[1]], [{ a: 1 }],
]

function build() {
  const cases = []
  let n = 0
  const add = (group, spec, inputs) => {
    for (const input of inputs) cases.push({ name: group + '#' + (n++), spec, input })
  }

  // Type tokens, bare and as an object property.
  for (const [k, t] of Object.entries(
    { String: T, Number: N, Boolean: B, Object: O, Array: A, Any: ANY })) {
    add('token-' + k, t, SCALARS)
    add('token-obj-' + k, { a: t }, OBJS)
  }

  // Literal defaults.
  for (const lit of [1, 'x', true, 0, '', false]) {
    add('lit-' + JSON.stringify(lit), lit, SCALARS)
    add('lit-obj-' + JSON.stringify(lit), { a: lit }, OBJS)
  }

  // Object structure.
  add('obj-empty', {}, OBJS)
  add('obj-closed', { $closed: { a: N } }, OBJS)
  add('obj-open', { $open: { a: N } }, OBJS)
  add('obj-required', { $required: { a: N } }, OBJS)
  add('obj-optional', { $optional: { a: N } }, OBJS)
  add('obj-nested', { a: { b: 1 } },
    [{}, { a: {} }, { a: { b: 2 } }, { a: { b: 'x' } }, { a: { b: 2, c: 3 } }, { a: null }, { a: 1 }])
  // Out-of-order keys, on specs that PASS: Go's JSON encoder sorts map keys and
  // TS preserves insertion order, so this exercises the comparator's canonical
  // form. They stay on passing specs because a rendered error message would
  // also carry the key order, which Go genuinely cannot reproduce.
  add('obj-open-order', { $open: {} }, [{ b: 1, a: 2 }, { c: 3, a: 1, b: 2 }, { z: 1, y: 2 }])
  add('obj-any-order', E('Child(Any)'), [{ b: 1, a: 2 }, { c: 3, a: 1, b: 2 }])

  add('obj-child-num', E('Child(Number)'), OBJS)
  add('obj-child-str', E('Child(String)'), OBJS)
  add('obj-optional-key', { a: { $optional: N } }, OBJS)
  add('obj-child-ignore', E('Child(Ignore(Number))'), OBJS)
  add('obj-child-ignore-bound', E('Child(Ignore(Min(2,Number)))'), OBJS)

  // Required fields reached through an absent parent (regression guard: Go
  // used to inject an empty default object and skip the requirement entirely).
  add('nested-required-1', { a: { b: N } }, [{}, { a: {} }, { a: { b: 1 } }, { a: { b: 'x' } }])
  add('nested-required-2', { a: { b: { c: N } } },
    [{}, { a: {} }, { a: { b: {} } }, { a: { b: { c: 1 } } }, { a: { b: { c: 'x' } } }])
  add('nested-required-3', { a: { b: T }, c: N }, [{}, { c: 1 }, { a: {}, c: 1 }, { a: { b: 'x' }, c: 1 }])
  add('nested-optional-parent', { a: { b: 1 } }, [{}, { a: {} }, { a: { b: 2 } }])

  // Arrays.
  add('arr-of-num', [N], ARRS)
  add('arr-of-str', [T], ARRS)
  add('arr-tuple', [N, T], ARRS)
  add('arr-tuple3', [N, T, B], ARRS)
  add('arr-rest', E('Rest(Number)'), ARRS)
  add('arr-rest-str', E('Rest(String)'), ARRS)
  add('arr-child', E('Child(Number)'), ARRS)
  add('arr-empty', [], ARRS)
  add('arr-nested', [[N]], [[], [[1]], [[1, 2]], [[1], [2]], [['x']], [1]])
  add('arr-ignore', [E('Ignore(Number)')], ARRS)
  add('arr-ignore-bound', [E('Ignore(Min(2,Number))')], ARRS)

  // Bounded builders, bare and with a type argument.
  for (const b of ['Min', 'Max', 'Above', 'Below', 'Len']) {
    for (const arg of [0, 1, 2]) {
      add(`b-${b}-${arg}`, E(`${b}(${arg})`), SCALARS)
      add(`b-${b}-${arg}-str`, E(`${b}(${arg},String)`), SCALARS)
      add(`b-${b}-${arg}-num`, E(`${b}(${arg},Number)`), SCALARS)
      add(`b-${b}-${arg}-arr`, E(`${b}(${arg}).Array`), ARRS)
    }
  }

  // Modifiers.
  for (const b of ['Required', 'Optional', 'Skip', 'Ignore', 'Empty', 'Never', 'Open', 'Closed']) {
    add('m-' + b, E(`${b}(String)`), SCALARS)
    add('m-obj-' + b, { a: E(`${b}(String)`) }, OBJS)
  }
  add('m-bare-Never', E('Never'), SCALARS)
  add('m-bare-Empty', E('Empty'), SCALARS)
  add('m-ignore-empty', E('Ignore(Empty)'), SCALARS)
  add('m-empty-str', E('Empty(String)'), ['', 'x', null, 1])

  // Default / Fault.
  add('d-default', E('Default(5,Number)'), SCALARS)
  add('d-default-obj', { a: E('Default(5,Number)') }, OBJS)
  add('d-fault', E('Fault("boom",Number)'), SCALARS)
  add('d-fault-obj', { a: E('Fault("boom",Number)') }, OBJS)

  // Exact.
  add('x-exact-nums', E('Exact(1,2,3)'), SCALARS)
  add('x-exact-strs', E('Exact("a","b")'), SCALARS)
  add('x-exact-mixed', E('Exact(1,"a",true,null)'), SCALARS)

  // Composition.
  add('c-one', E('One(String,Number)'), SCALARS)
  add('c-some', E('Some(String,Number)'), SCALARS)
  add('c-all', E('All(Number,Min(2))'), SCALARS)
  add('c-all-str', E('All(String,Min(2))'), SCALARS)
  add('c-one-obj', { a: E('One(String,Number)') }, OBJS)
  add('c-one-ignore', E('One(Ignore(Min(2,Number)),String)'), SCALARS)
  add('c-all-ignore', E('All(Ignore(Min(2,Number)),Number)'), SCALARS)

  // Type() — both the builder-style DSL call and a chained type token.
  for (const t of ['String', 'Number', 'Boolean', 'Object', 'Array', 'Any']) {
    add('t-Type-' + t, E(`Type(${t})`), SCALARS)
    add('t-Type-obj-' + t, { a: E(`Type(${t})`) }, OBJS)
  }

  // Chaining.
  add('ch-1', E('String.Min(2)'), SCALARS)
  add('ch-2', E('String.Min(2).Max(4)'), SCALARS)
  add('ch-3', E('Min(2).Max(4).Number'), SCALARS)
  add('ch-4', E('Number.Above(0).Below(10)'), SCALARS)
  add('ch-5', E('Optional(String).Min(2)'), SCALARS)
  add('ch-6', E('Default("ab",String).Min(2)'), SCALARS)

  // Regexp checks. A regexp is a spec value in its own right, so it also has
  // to work as a composition branch and under a bound.
  add('re-one', E('One(/^a/,Number)'), SCALARS)
  add('re-some', E('Some(/^a/,Number)'), SCALARS)
  add('re-all', E('All(/^a/,Min(2))'), SCALARS)
  add('re-bound', E('Min(2,/^a/)'), SCALARS)
  add('b-bound-null', E('Min(2,null)'), SCALARS)
  add('b-bound-nan', E('Min(2,NaN)'), SCALARS)
  add('re-obj-one', { a: E('One(/^a/,Number)') }, OBJS)
  add('re-bare', E('/^a+$/'), SCALARS)
  add('re-check', E('Check(/^[0-9]+$/)'), SCALARS)
  add('re-obj', { a: E('/^a/') }, OBJS)

  // Define / Refer.
  add('dr-1', { a: E('Define("d",Number)'), b: E('Refer("d")') },
    [{ a: 1, b: 2 }, { a: 1, b: 'x' }, { a: 'x', b: 2 }, {}])

  // Key expressions.
  add('ke-1', { 'a: Min(2)': 0 }, OBJS)
  add('ke-2', { 'a: String': '' }, OBJS)
  add('ke-any', { 'a: Any': 0 }, OBJS)
  // A builder-wrapped key expression: the example value is the author's stated
  // default and survives whether or not the builder had room for it.
  add('ke-optional-any', { 'a: Optional(Any)': 5 }, OBJS)
  add('ke-optional-number', { 'a: Optional(Number)': 5 }, OBJS)
  add('ke-optional-string', { 'a: Optional(String)': 'z' }, OBJS)
  add('ke-skip-number', { 'a: Skip(Number)': 5 }, OBJS)
  add('ke-child-array', { 'a: Child(Number)': [] }, OBJS)
  add('ke-one-of', { 'a: One(String,Number)': 5 }, OBJS)
  add('ke-bare-literal', { 'a: 5': 3 }, OBJS)

  // Func / Key.
  add('fn-1', E('Func'), SCALARS)
  add('key-1', { a: E('Key()') }, OBJS)

  // Deep nesting.
  add('deep-1', { a: { b: { c: N } } },
    [{ a: { b: { c: 1 } } }, { a: { b: { c: 'x' } } }, { a: { b: {} } }, { a: {} }, {}])
  add('deep-2', [{ a: N }], [[], [{ a: 1 }], [{ a: 'x' }], [{}], [{ a: 1 }, { a: 2 }]])

  return cases
}

module.exports = { build }

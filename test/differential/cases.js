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
//   {"$optional":X} {"$expr":"Min(2,String)"} {"$discriminated":[tag,{...}]}
//   {"$call":["Pick",["a"],X]}
// Anything else is raw JSON.

const T = { $type: 'String' }, N = { $type: 'Number' }, B = { $type: 'Boolean' }
const O = { $type: 'Object' }, A = { $type: 'Array' }, ANY = { $type: 'Any' }
const I = { $type: 'Integer' }, D = { $type: 'Date' }
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

// Strings in and around each format, plus the odd non-string.
const FORMATS = [
  'a@b.co', 'first.last+tag@sub.example.org', 'nope', 'a@b', '.a@b.co',
  'https://example.com/a?b=c#d', 'http://[::1]:8080/x', 'example.com', 'http://exa mple.com',
  '123e4567-e89b-12d3-a456-426614174000', '123e4567e89b12d3a456426614174000',
  '2020-01-01T00:00:00Z', '2021-02-29T00:00:00Z', '2020-01-01',
  '127.0.0.1', '256.0.0.1', '::1', '::ffff:192.168.1.1', '1:2:3:4:5:6:7:8:9', '1.2.3.4::',
  'fe80::1%eth0', '', ' ', 1, null, true, [], {},
]

// A discriminated union over "kind", and values around its two branches.
// Multi-key objects keep alphabetical order (see OBJS).
const DISC = { $discriminated: ['kind', { dog: { bark: B }, fish: { fins: N } }] }
const DISC_IN = [
  { bark: true, kind: 'dog' }, { kind: 'dog' }, { bark: 1, kind: 'dog' }, { fins: 2, kind: 'fish' },
  { fins: 'x', kind: 'fish' }, { kind: 'cat' }, { bark: true }, { kind: 1 }, { kind: null }, {},
  null, 1, 'dog', [], [{ kind: 'dog' }],
]

// The object algebra: a builder called by name (the DSL has no list or object
// literals), and the key-expression form, which hands the example over.
const CALL = (name, ...args) => ({ $call: [name, ...args] })
const ABASE = { a: 1, b: T, c: true }
const KE_IN = [
  {}, { u: {} }, { u: { a: 2 } }, { u: { b: 2 } }, { u: { a: 'x' } }, { u: { a: 1, b: 2, z: 3 } },
  { u: 1 }, { u: null }, { u: [] }, null, 'x',
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

  // Integer and Date kinds. No battery holds a Date instance, so every Date
  // case here is a failure and is comparable across the JSON boundary.
  add('token-Integer', I, SCALARS)
  // A builder called wrongly in the string form is a build error.
  add('expr-fault-arg', E('String.Min("x")'), SCALARS)
  add('expr-fault-nested', E('Open(Define(""))'), SCALARS)
  // A deliberate Fault on a Never node is a valid expression.
  add('expr-fault-deliberate', E('Never.Fault("f")'), SCALARS)
  // Some: an object threads through its matching branches, a scalar does not.
  // Passing inputs only: the message for a failing one lists object branches,
  // whose rendering the ports do not yet share (see the parity page).
  add('some-open-defaults', CALL('Some', { $open: { a: 1 } }, { $open: { a: 2 } }), [{}, { a: 5, q: 9 }, { a: 1 }])
  add('some-scalar-coerce', CALL('Some', E('Coerce(Number)'), E('Max(2)')), ['12', 5, '7', 1, 99])
  add('token-obj-Integer', { a: I }, OBJS)
  add('int-optional', E('Optional(Integer)'), SCALARS)
  add('int-min', E('Min(2,Integer)'), SCALARS)
  add('int-type', E('Type(Integer)'), SCALARS)
  add('int-nullable', E('Nullable(Integer)'), SCALARS)
  add('ke-integer', { 'a: Integer': 0 }, OBJS)
  add('token-Date-fail', D, SCALARS)
  add('token-obj-Date-fail', { a: D }, OBJS)
  add('date-optional-fail', E('Optional(Date)'), SCALARS)

  // Nullable: an explicit null is a value; absent is still required/optional.
  add('nullable-num', E('Nullable(Number)'), SCALARS)
  add('nullable-str-obj', { a: E('Nullable(String)') }, OBJS)
  add('nullable-optional', { a: E('Optional(Nullable(Number))') }, OBJS)
  add('nullable-object', E('Nullable(Closed({}))'), SCALARS)
  add('nullable-bare', { a: E('Nullable') }, OBJS)

  // Coerce: unambiguous conversions before the type check; anything else is
  // left alone so the usual type error speaks.
  add('coerce-num', E('Coerce(Number)'),
    SCALARS.concat(['5', ' 5 ', '5.5', '1e3', '+5', '.5', '5.', '0x10', 'Infinity', '5abc', ' ']))
  add('coerce-int', E('Coerce(Integer)'), ['5', '5.5', '1e2', true, 'x', 7])
  add('coerce-str', E('Coerce(String)'),
    SCALARS.concat([1e21, 1e-7, 0.00001, 0.000001, 1.5, 1000000, 123456789012345680000, -2.5]))
  add('coerce-bool', E('Coerce(Boolean)'), SCALARS.concat(['TRUE', ' false ', 'yes', '1', '0', 2]))
  add('coerce-date', E('Coerce(Date)'), [
    '2020-01-01T00:00:00Z', '2020-01-01T12:30:00.5+02:00', '2020-02-29T00:00:00Z',
    '2021-02-29T00:00:00Z', '2020-02-30T00:00:00Z', '2020-13-01T00:00:00Z',
    '2020-01-01T24:00:00Z', '2020-01-01T00:00:00+24:00', '2020-01-01', 1577836800000, 1.5,
    'x', null, true, [], {},
  ])
  add('coerce-obj', { a: E('Coerce(Number)') }, OBJS)
  add('coerce-bound', E('Coerce(Min(2,Number))'), ['1', '3', 'x', 1, 3])
  add('coerce-bound-outer', E('Min(2,Coerce(Number))'), ['1', '3', 'x'])
  add('coerce-nullable', E('Nullable(Coerce(Number))'), ['5', null, 'x'])
  add('coerce-bare', E('Coerce'), SCALARS)
  add('coerce-any-noop', E('Coerce(Any)'), SCALARS)

  // String formats: befores on a string-shaped node, deferring to the type
  // check, and Fault's reach — structural text only.
  for (const f of ['Email', 'Url', 'Uuid', 'DateTime', 'Ip', 'Ipv4', 'Ipv6']) {
    add('fmt-' + f, E(f), FORMATS)
    add('fmt-obj-' + f, { a: E(f) }, OBJS)
  }
  add('fmt-optional', { a: E('Optional(Email)') }, OBJS)
  add('fmt-nullable', E('Email(Nullable(String))'), FORMATS)
  add('fmt-bound-inner', E('Email(Min(10,String))'), FORMATS)
  add('fmt-bound-outer', E('Min(10,Email)'), FORMATS)
  add('fmt-any', E('Email(Any)'), FORMATS)
  add('fault-bound', E('Fault("boom",Min(2,Number))'), SCALARS)
  add('fault-format', E('Fault("boom",Email)'), FORMATS)
  add('fault-type', E('Fault("boom",String)'), SCALARS)

  // Catch, Describe and Ignore: the subtree is judged as a whole.
  add('catch-num', E('Catch(0,Number)'), SCALARS)
  add('catch-str-bound', E('Catch("none",Min(2,String))'), SCALARS)
  add('catch-outer-bound', E('Min(2,Catch(0,Number))'), SCALARS)
  add('catch-obj', { a: E('Catch(0,Number)') }, OBJS)
  add('catch-optional', { a: E('Optional(Catch(7,Number))') }, OBJS)
  add('catch-closed', E('Catch(null,Closed({}))'), SCALARS)
  add('catch-arr', [E('Catch(0,Number)')], ARRS)
  add('describe', E('Describe("a number",Number)'), SCALARS)
  add('ignore-bound', { a: E('Ignore(Min(2,Number))') }, OBJS)
  add('ignore-arr', [E('Ignore(Number)')], ARRS)

  // Discriminated unions, and composition given nothing on an optional node.
  add('disc-root', DISC, DISC_IN)
  add('disc-prop', { p: DISC }, DISC_IN.map((v) => ({ p: v })).concat([{}]))
  add('disc-optional', { p: { $optional: DISC } }, [{}, { p: { kind: 'cat' } }, { p: { bark: true, kind: 'dog' } }])
  add('disc-arr', [DISC], ARRS.concat([[{ bark: true, kind: 'dog' }, { kind: 'cat' }]]))
  add('one-optional', { a: E('Optional(One(String,Number))') }, OBJS)
  add('some-optional', { a: E('Optional(Some(String,Number))') }, OBJS)
  add('all-optional', { a: E('Optional(All(String,Min(2)))') }, OBJS)

  // Object algebra.
  add('alg-pick', CALL('Pick', ['a'], ABASE), OBJS)
  add('alg-pick-required', CALL('Pick', ['a', 'b'], ABASE), OBJS)
  add('alg-pick-open', CALL('Pick', ['a'], { $open: ABASE }), OBJS)
  add('alg-pick-keyexpr-src', CALL('Pick', ['a'], { 'a: Min(2)': 0, b: 1 }), OBJS)
  add('alg-omit', CALL('Omit', ['b'], ABASE), OBJS)
  add('alg-omit-all', CALL('Omit', ['a', 'b', 'c'], ABASE), OBJS)
  add('alg-omit-unknown', CALL('Omit', ['z'], { $closed: ABASE }), OBJS)
  add('alg-partial', CALL('Partial', ABASE), OBJS)
  add('alg-partial-nested', CALL('Partial', { a: { b: N } }), OBJS)
  add('alg-partial-bound', CALL('Partial', { a: E('Min(2,Number)') }), OBJS)
  add('alg-extend', CALL('Extend', { e: N }, ABASE), OBJS.concat([{ a: 1, b: 'x', e: 2 }, { b: 'x', e: 'z' }]))
  add('alg-extend-override', CALL('Extend', { a: T }, ABASE), OBJS)
  add('alg-extend-open', CALL('Extend', { e: 1 }, { $open: ABASE }), OBJS)
  add('alg-extend-open-ext', CALL('Extend', { $open: { e: 1 } }, ABASE), OBJS)
  add('alg-composed', CALL('Partial', CALL('Pick', ['b'], CALL('Extend', { e: N }, ABASE))), OBJS)
  add('alg-optional', { a: { $optional: CALL('Pick', ['b'], ABASE) } }, OBJS)
  add('alg-arr', [CALL('Omit', ['b'], ABASE)], ARRS)
  add('alg-ke-pick', { 'u: Pick(["a"])': { a: 1, b: 2 } }, KE_IN)
  add('alg-ke-omit', { 'u: Omit(["a"])': { a: 1, b: 2 } }, KE_IN)
  add('alg-ke-partial', { 'u: Partial': { a: T, b: N } }, KE_IN)
  add('alg-ke-partial-called', { 'u: Partial()': { a: T, b: N } }, KE_IN)

  // A type token with arguments applies the type to them.
  add('dsl-token-args-str', E('String(Min(2))'), SCALARS)
  add('dsl-token-args-num', E('Number(Max(1))'), SCALARS)
  add('dsl-token-args-nested', E('Optional(String(Min(2)))'), SCALARS)
  add('b-large-bound', E('Min(1000000,Number)'), SCALARS)

  // Literal defaults.
  for (const lit of [1, 'x', true, 0, '', false]) {
    add('lit-' + JSON.stringify(lit), lit, SCALARS)
    add('lit-obj-' + JSON.stringify(lit), { a: lit }, OBJS)
  }

  // A null literal is an optional null defaulting to null.
  add('lit-obj-null', { a: null }, OBJS)
  add('null-optional', { a: E('Optional(null)') }, OBJS)
  add('null-skip', { a: E('Skip(null)') }, OBJS)
  add('null-required', { a: E('Required(null)') }, OBJS)
  add('null-nested', { a: { b: null } }, OBJS)
  add('arr-any', [ANY], ARRS)

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

  // A bare type token in the DSL is Type(token): Object is closed there.
  for (const t of ['String', 'Number', 'Boolean', 'Object', 'Array', 'Any', 'Integer']) {
    add('dsl-bare-' + t, E(t), SCALARS)
    add('dsl-bare-obj-' + t, { a: E(t) }, OBJS)
    add('dsl-bare-optional-' + t, { a: E(`Optional(${t})`) }, OBJS)
  }
  add('dsl-bare-Array-arr', E('Array'), ARRS)
  add('dsl-one-Object', E('One(Object,Number)'), SCALARS)

  // Several disallowed keys on a nested closed object.
  add('nested-closed-multi', { a: { b: 1 } },
    [{ a: { b: 2, c: 3, d: 4 } }, { a: { c: 3, d: 4 } }, { a: { b: 2, c: 3 } }, { a: [1, 2] }])
  add('nested-closed-arr-multi', { a: [N, T] }, [{ a: [1, 'a', 2, 3] }, { a: [1, 'a', 2] }, { a: [1] }])
  // Keys and values holding a backslash or a quote render raw inside the message.
  add('closed-odd-keys', { a: 1 }, [{ 'x\\y': 2 }, { 'x"y': 2 }, { 'x\\"y': 2 }, { a: 'p\\q', z: 1 }, { a: 'p"q', z: 1 }, { 'a<b': '&' }])
  add('type-odd-values', { a: N }, [{ a: 'p\\q' }, { a: 'p"q' }, { a: { 'k\\': 'v"' } }])

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
  // A quoted name holds a space; an empty expression is no expression at all.
  add('ke-quoted-name', { '"a b": Min(1)': 0 }, [{ 'a b': 2 }, { 'a b': 0 }, { 'a b': 'x' }, {}, { a: 1 }])
  add('ke-quoted-string', { '"a b": String': '' }, [{ 'a b': 'x' }, { 'a b': 1 }, {}])
  add('ke-empty-expr', { 'a:': 1 }, [{ 'a:': 2 }, { 'a:': 'x' }, { a: 1 }, {}])
  add('ke-escaped-name', { '"a\\"b": Min(1)': 0 }, [{ 'a"b': 2 }, { 'a"b': 0 }, { 'a\\"b': 2 }, {}])
  // A value-taking builder reads the example as its value.
  add('ke-default-empty', { 'a: Default()': 5 }, OBJS)
  add('ke-min-empty', { 'a: Min()': 3 }, OBJS)
  add('ke-catch-empty', { 'a: Catch()': 7 }, OBJS)
  add('ke-exact-empty', { 'a: Exact()': 7 }, OBJS)

  // Func / Key. Func is a builder, so it is optional; the Function token is
  // required. A NaN literal is an optional NaN default.
  add('fn-1', E('Func'), SCALARS)
  add('fn-obj', { a: E('Func') }, OBJS)
  add('fn-token-obj', { a: { $type: 'Function' } }, OBJS)
  add('nan-obj', { a: E('NaN') }, OBJS)
  add('nan-optional', { a: E('Optional(NaN)') }, OBJS)
  add('nan-required', { a: E('Required(NaN)') }, OBJS)
  add('nan-bound-obj', { a: E('Min(2,NaN)') }, OBJS)
  add('key-1', { a: E('Key()') }, OBJS)

  // Deep nesting.
  add('deep-1', { a: { b: { c: N } } },
    [{ a: { b: { c: 1 } } }, { a: { b: { c: 'x' } } }, { a: { b: {} } }, { a: {} }, {}])
  add('deep-2', [{ a: N }], [[], [{ a: 1 }], [{ a: 'x' }], [{}], [{ a: 1 }, { a: 2 }]])

  return cases
}

module.exports = { build }

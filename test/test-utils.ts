import assert from 'node:assert'


function clean(val: any, seen?: Set<any>, depth?: number): any {
  if (val === null || val === undefined) return val
  if (typeof val !== 'object' && typeof val !== 'function') return val
  if (!seen) seen = new Set()
  if (!depth) depth = 0
  if (depth > 500 || seen.has(val)) return val
  seen.add(val)
  if (Array.isArray(val)) {
    const arr: any[] = new Array(val.length)
    for (let i = 0; i < val.length; i++) {
      arr[i] = clean(val[i], seen, depth + 1)
    }
    return arr
  }
  const result: any = {}
  for (const [k, v] of Object.entries(val)) {
    if (v !== undefined) {
      result[k] = clean(v, seen, depth + 1)
    }
  }
  return result
}


function deepEqual(actual: any, expected: any): void {
  assert.deepStrictEqual(clean(actual), clean(expected))
}


function matchObject(actual: any, expected: any): void {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `Expected array but got ${typeof actual}`)
    for (let i = 0; i < expected.length; i++) {
      matchObject(actual[i], expected[i])
    }
  } else if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object',
      `Expected object but got ${typeof actual}`)
    for (const key of Object.keys(expected)) {
      matchObject(actual[key], expected[key])
    }
  } else {
    assert.deepStrictEqual(actual, expected)
  }
}


function throws(fn: () => void, match?: string | RegExp): void {
  try {
    fn()
    assert.fail('Expected function to throw')
  } catch (e: any) {
    if (e.code === 'ERR_ASSERTION') throw e
    if (match != null) {
      if (match instanceof RegExp) {
        assert.match(e.message, match)
      } else {
        assert.ok(e.message.includes(match),
          `Expected error to include "${match}" but got "${e.message}"`)
      }
    }
  }
}


export { deepEqual, matchObject, throws }

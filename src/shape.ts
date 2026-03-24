/* Copyright (c) 2021-2024 Richard Rodger and other contributors, MIT License */

// FIX: does not work if Shape is inside a Proxy - jest fails

// FEATURE: validator on completion of object or array
// FEATURE: support non-index properties on array shape
// FEATURE: state should indicate if value was present, not just undefined
// FEATURE: support custom builder registration so that can chain on builtins
// FEATURE: merge shapes (allows extending given shape - e.g. adding object props)
// FEATURE: Key validation by RegExp

// TODO: Validation of Builder parameters
// TODO: ShapeShape.d is damaged by composition
// TODO: Better stringifys for builder shapes
// TODO: Error messages should state property is missing, not `value ""`
// TODO: node.s can be a lazy function to avoid unnecessary string building
// TODO: Finish Default shape-builder
// FIX: Shape(Shape(..)) should work

// DOC: Skip also makes value optional - thus Skip() means any value, or nonexistent
// DOC: Optional


import { inspect } from 'util'


// Package version.
const VERSION = '9.0.0'

// Unique symbol for marking and recognizing Shape shapes.
const SHAPE$ = Symbol.for('shape$')

// A singleton for fast equality checks.
const SHAPE = { shape$: SHAPE$, v$: VERSION }

// TODO SHAPE$UNDEF for explicit undefined
// A special marker for property abscence.
// const SHAPE$UNDEF = Symbol.for('shape$undef')

// RegExp: first letter is upper case
const UPPER_CASE_FIRST_RE = /^[A-Z]/

// RegExp: key expression pattern (hoisted from inner loop for performance)
const KEY_EXPR_RE = /^\s*("(\\.|[^"\\])*"|[^\s]+):\s*(.*?)\s*$/


const { toString } = Object.prototype


// Options for creating a ShapeShape.
type ShapeOptions = {
  name?: string // Name this Shape shape.

  // Meta properties
  meta?: {
    active?: boolean // If true, recognize meta properties. Default: false.
    suffix?: string // Key suffix to mark meta properties. Default: '$$'
  }

  // Key expressions ({'a: Open':1})
  keyexpr?: {
    active?: boolean // If true, recognize key expressions. Default: true.
  }

  // TODO: should be valexpr
  // Special keys to define value expr for parent object or array.
  valexpr?: {
    active?: boolean // If true, recognize keyspec in object. Default: false.
    keymark?: string // Special key to mark parent object expr. Default: meta.suffix.
  }
}


// User context for a given Shape validation run.
// Add your own references here for use in your own custom validations.
// The reserved properties are: `err`.
type Context = Record<string, any> & {
  // Provide an array to collect errors, instead of throwing.
  err?: ErrDesc[] | boolean
  log?: (point: string, state: State) => void
  skip?: {
    depth?: number | number[]
    keys?: string[]
  }
  prefix?: string
  suffix?: string
}


// The semantic types recognized by Shape.
// Not that Shape considers values to be subtypes.
type ValType =
  'any' |       // Any type.
  'array' |     // An array.
  'bigint' |    // A BigInt value.
  'boolean' |   // The values `true` or `false`.
  'function' |  // A function.
  'instance' |  // An instance of a constructed object.
  'list' |      // A list of types under a given logical rule.
  'nan' |       // The `NaN` value.
  'never' |     // No type.
  'null' |      // The `null` value.
  'number' |    // A number.
  'object' |    // A plain object.
  'string' |    // A string (but *not* the empty string).
  'symbol' |    // A symbol reference.
  'regexp' |    // A regular expression.
  'check' |     // A check function.
  'undefined'   // The `undefined` value.


// A node in the validation tree structure.
type Node<V> = {
  $: typeof SHAPE         // Special marker to indicate normalized.
  // o: any
  t: ValType             // Value type name.
  d: number              // Depth.
  v: any                 // Defining value.
  f: any                 // Default, if any.
  r: boolean             // Value is required.
  p: boolean             // Value is skippable - can be missing or undefined.
  n: number              // Number of keys in default value
  c: any                 // Default child.
  k: string[]            // Final keys of value, in order of appearance.
  e: boolean             // If false, match failures are not an error.
  u: Record<string, any> // Custom user meta data
  b: Validate[]          // Custom before validation functions.
  a: Validate[]          // Custom after vaidation functions.
  // TODO: use u
  m: NodeMeta            // Meta data.
  // s?: string | Function  // Custom stringification.
  z?: string             // Custom error message.
} & { [name: string]: Builder<V> }


// Meta data for shape node.
type NodeMeta = Record<string, any>


// A validation Node builder.
type Builder<S> = (
  opts?: any,     // Builder options.
  ...vals: any[]  // Values for the builder. 
) => Node<S>


// Validate a given value, potentially updating the value and state.
type Validate =
  ((val: any, update: Update, state: State) => boolean) &
  {
    s?: (n: Node<any>) => string, // stringify validator of builder
    a?: any[] // args to the builder
    n?: string // name of builder
  }


type ShapeResult<T> =
  T extends Node<any> ? any :
  T extends StringConstructor ? string :
  T extends NumberConstructor ? number :
  T extends BooleanConstructor ? boolean :
  T extends ArrayConstructor ? any[] :
  T extends ObjectConstructor ? any :
  T extends FunctionConstructor ? Function :
  T extends SymbolConstructor ? symbol :
  T extends { [key: string]: any } ? { [K in keyof T]: ShapeResult<T[K]> } :
  T


// TODO: make this work
// type Shape<S> = (<V>(root?: V, ctx?: Context) => V & ShapeResult<S>)


// Help the minifier
const S = {
  shape: 'shape',
  name: 'name',
  nan: 'nan',
  never: 'never',
  number: 'number',
  required: 'required',
  array: 'array',
  function: 'function',
  object: 'object',
  string: 'string',
  boolean: 'boolean',
  undefined: 'undefined',
  any: 'any',
  list: 'list',
  instance: 'instance',
  null: 'null',
  type: 'type',
  closed: 'closed',
  check: 'check',
  regexp: 'regexp',

  String: 'String',
  Number: 'Number',
  Boolean: 'Boolean',
  Object: 'Object',
  Array: 'Array',
  Symbol: 'Symbol',
  Function: 'Function',
  Value: 'Value',

  Above: 'Above',
  After: 'After',
  All: 'All',
  Any: 'Any',
  Before: 'Before',
  Below: 'Below',
  Check: 'Check',
  Child: 'Child',
  Closed: 'Closed',
  Define: 'Define',
  Default: 'Default',
  Empty: 'Empty',
  Exact: 'Exact',
  Func: 'Func',
  Key: 'Key',
  Max: 'Max',
  Min: 'Min',
  Never: 'Never',
  Len: 'Len',
  One: 'One',
  Open: 'Open',
  Optional: 'Optional',
  Refer: 'Refer',
  Rename: 'Rename',
  Required: 'Required',
  Skip: 'Skip',
  Ignore: 'Ignore',
  Some: 'Some',
  Fault: 'Fault',
  Rest: 'Rest',

  forprop: ' for property ',
  $PATH: '"$PATH"',
  $VALUE: '"$VALUE"',
}


const TNAT = {
  [S.String]: String,
  [S.Number]: Number,
  [S.Boolean]: Boolean,
  [S.Object]: Object,
  [S.Array]: Array,
  [S.Symbol]: Symbol,
  [S.Function]: Function,
}


// Utility shortcuts.
const keys = (arg: any) => Object.keys(arg)
const defprop = (o: any, p: any, a: any) => Object.defineProperty(o, p, a)
const isarr = (arg: any) => Array.isArray(arg)
const JP = (arg: string) => JSON.parse(arg)
const JS = (a0: any, a1?: any) => JSON.stringify(a0, a1)


// The current validation state.
class State {
  match: boolean = false

  dI: number = 0  // Node depth.
  nI: number = 2  // Next free slot in nodes.
  cI: number = -1 // Pointer to next node.
  pI: number = 0  // Pointer to current node.
  sI: number = -1 // Pointer to next sibling node.

  valType: string = S.never
  isRoot: boolean = false

  key: string = ''
  type: string = S.never

  stop: boolean = true
  nextSibling: boolean = true

  fromDflt: boolean = false

  // NOTE: tri-valued; undefined = soft ignore
  ignoreVal: boolean | undefined = undefined

  curerr: any[] = []
  err: any[] = []

  // TODO: is this needed - try using ancestors instead
  parents: Node<any>[] = []

  keys: string[] = []

  ancestors: Node<any>[] = []

  // NOTE: not "clean"!
  // Actual path is always only path[0,dI+1]
  path: string[] = []

  node: Node<any>

  root: any

  val: any
  parent: any
  nodes: (Node<any> | number)[]
  vals: any[]
  ctx: any
  oval: any

  check?: Function
  checkargs?: Record<string, any>

  constructor(
    root: any,
    top: Node<any>,
    ctx?: Context,
    match?: boolean
  ) {
    this.root = root
    this.vals = [root, -1]
    this.node = top
    this.nodes = [top, -1]
    this.ctx = ctx || {}
    this.match = !!match
  }

  next() {
    // Uncomment for debugging (definition below). DO NOT REMOVE.
    // this.printStacks()

    this.stop = false
    this.fromDflt = false
    this.ignoreVal = undefined
    this.isRoot = 0 === this.pI
    this.check = undefined

    // Dereference the back pointers to ancestor siblings.
    // Only objects|arrays can be nodes, so a number is a back pointer.
    // NOTE: terminates because (+{...} -> NaN, +[] -> 0) -> false (JS wat FTW!)
    let nextNode = this.nodes[this.pI]

    // See note for path below.
    this.ancestors[this.dI] = this.node

    while (+nextNode) {
      this.dI--

      this.ctx.log &&
        -1 < this.dI &&
        this.ctx.log('e' +
          (isarr(this.parents[this.pI]) ? 'a' : 'o'),
          this)

      this.pI = +nextNode
      nextNode = this.nodes[this.pI]
    }

    if (!nextNode) {
      this.stop = true
      return
    }
    else {
      this.node = (nextNode as Node<any>)
    }

    this.updateVal(this.vals[this.pI])
    this.key = this.keys[this.pI]

    this.cI = this.pI
    this.sI = this.pI + 1

    // TODO: remove and use ancestors?
    if (Object.isFrozen(this.parents[this.pI])) {
      this.parents[this.pI] = { ...this.parents[this.pI] }
    }
    this.parent = this.parents[this.pI]

    this.nextSibling = true

    this.type = this.node.t

    // NOTE: this is always correct for the current node, up to dI, because
    // previous values at dI get overwritten. Avoids need to duplicate on each descent.
    // ancestors uses same approach.
    this.path[this.dI] = this.key

    this.oval = this.val

    this.curerr.length = 0
  }


  updateVal(val: any) {
    this.val = val
    this.valType = typeof (this.val)
    if (S.number === this.valType && isNaN(this.val)) {
      this.valType = S.nan
    }
    if (this.isRoot && !this.match) {
      this.root = this.val
    }
  }

  // UNCOMMENT TO DEBUG - DO NOT REMOVE
  /*
  printStacks() {
    console.log('\nNODE',
      'd=' + this.dI,
      'c=' + this.cI,
      'p=' + this.pI,
      'n=' + this.nI,
      +this.node,
      this.node.t,
      this.path,
      this.err.length)
    console.log('A:' + this.ancestors
      .map((a: any, i: number) => i + '=' + stringify(a)).join('  '))
    for (let i = 0;
      i < this.nodes.length ||
      i < this.vals.length ||
      i < this.parents.length
      ;
      i++) {
      console.log(i, '\t',
        ('' + (isNaN(+this.nodes[i]) ?
          this.keys[i] + ':' + (this.nodes[i] as any)?.t :
          +this.nodes[i])).padEnd(32, ' '),
        stringify(this.vals[i]).padEnd(32, ' '),
        stringify(this.parents[i]),
      )
    }
  }
  */

}


// Return updates to the validation state.
type Update = {
  done?: boolean
  val?: any
  uval?: any // Use for undefined and NaN
  node?: Node<any>
  type?: ValType
  nI?: number
  sI?: number
  pI?: number
  err?: string | ErrDesc | ErrDesc[]
  why?: string
  fatal?: boolean
}


// Validation error description.
type ErrDesc = {
  key: string                // Key of failing value.
  type: string               // type of node
  node: Node<any>            // Failing shape node.
  value: any                 // Failing value.
  path: string               // Key path to value.
  why: string                // Error code ("why").
  check: string              // Check function name.
  args: Record<string, any>  // Builder args.
  mark: number               // Error mark for debugging.
  text: string               // Error message text.
  use: any                   // User custom info.
}


// Custom Error class.
class ShapeError extends TypeError {
  shape = true
  code: string
  gname: string
  props: ({
    path: string,
    type: string,
    value: any,
  }[])
  desc: () => ({ name: string, code: string, err: ErrDesc[], ctx: any })

  constructor(
    code: string,
    gname: string | undefined,
    err: ErrDesc[],
    ctx: any,
  ) {
    gname = (null == gname) ? '' : (!gname.startsWith('G$') ? gname + ': ' : '')
    const prefix = (null == ctx.prefix ? '' : ctx.prefix + ': ')
    const suffix = (null == ctx.suffix ? '' : ' ' + ctx.suffix)

    super(gname + prefix + err.map((e: ErrDesc) => e.text).join('\n') + suffix)

    let name = 'ShapeError'
    let ge = this as unknown as any
    ge.name = name

    this.code = code
    this.gname = gname
    this.desc = () => ({ name, code, err, ctx, })
    this.stack = this.stack?.replace(/.*\/shape\/shape\.[tj]s.*\n/g, '')

    this.props = err.map((e: ErrDesc) => ({
      path: e.path,
      what: e.why,
      type: e.node?.t,
      value: e.value
    }))

  }

  toJSON() {
    return {
      ...this,
      err: (this as any).desc().err,
      name: this.name,
      message: this.message,
    }
  }
}


// TODO: There are a lot more!!! Error, Blob, etc
// Identify JavaScript wrapper types by name.
const IS_TYPE: { [name: string]: boolean } = {
  Array: true,
  BigInt: true,
  Boolean: true,
  Function: true,
  Number: true,
  Object: true,
  String: true,
  Symbol: true,
}


// Empty values for each type.
const EMPTY_VAL: { [name: string]: any } = {
  string: '',
  number: 0,
  boolean: false,
  object: {},
  array: [],
  symbol: Symbol(''),
  bigint: BigInt(0),
  null: null,
  regexp: /.*/,
}


// Normalize a value into a Node<S>.
function nodize<S>(shape?: any, depth?: number, meta?: NodeMeta): Node<S> {

  // If using builder as property of Shape, `this` is just Shape, not a node.
  if (shapify === shape) {
    shape = undefined
  }

  // Is this a (possibly incomplete) Node<S>?
  else if (null != shape && shape.$?.shape$) {

    // Assume complete if shape$ has special internal reference.
    if (SHAPE$ === shape.$.shape$) {
      shape.d = null == depth ? shape.d : depth
      return shape
    }

    // Normalize an incomplete Node<S>, avoiding any recursive calls to norm.
    else if (true === shape.$.shape$) {
      let node = { ...shape }
      node.$ = { v$: VERSION, ...node.$, shape$: SHAPE$ }

      node.v =
        (null != node.v && S.object === typeof (node.v)) ? { ...node.v } : node.v

      // Leave as-is: node.c

      node.t = node.t || typeof (node.v)
      if (S.function === node.t && IS_TYPE[node.v.name]) {
        node.t = (node.v.name.toLowerCase() as ValType)
        node.v = clone(EMPTY_VAL[node.t])
        node.f = node.v
      }

      node.r = !!node.r
      node.p = !!node.p
      node.d = null == depth ? null == node.d ? -1 : node.d : depth

      node.b = node.b || []
      node.a = node.a || []

      node.u = node.u || {}

      node.m = node.m || meta || {}

      return node
    }
  }

  // Not a Node<S>, so build one based on value and its type.
  let t: ValType | 'undefined' = (null === shape ? (S.null as ValType) : typeof (shape))
  t = (S.undefined === t ? S.any : t) as ValType

  let v = shape
  let f = v
  let c: any = undefined
  let r = false // Not required by default.
  let p = false // Only true when Skip builder is used.
  let u: any = {}

  let a: any[] = []
  let b: any[] = []

  if (S.object === t) {
    f = undefined
    if (isarr(v)) {
      t = (S.array as ValType)
      if (1 === v.length) {
        c = v[0]
        v = []
      }
      // Else no child, thus closed.
    }
    else if (
      null != v &&
      Function !== v.constructor &&
      Object !== v.constructor &&
      null != v.constructor
    ) {
      let strdesc = toString.call(v)

      if ('[object RegExp]' === strdesc) {
        t = (S.regexp as ValType)
        r = true
      }
      else {
        t = (S.instance as ValType)
        u.n = v.constructor.name
        u.i = v.constructor
      }

      f = v
    }

    else {
      // Empty object "{}" is considered Open
      if (0 === keys(v).length) {
        c = Any()
      }
    }
  }

  // NOTE: use Check for validation functions
  else if (S.function === t) {
    if (IS_TYPE[shape.name]) {
      t = (shape.name.toLowerCase() as ValType)
      r = true
      v = clone(EMPTY_VAL[t])
      f = v

      // Required "Object" is considered Open
      if (S.Object === shape.name) {
        c = Any()
      }
    }
    else if (v.shape === SHAPE || true === v.$?.shape) {
      let gs = v.node ? v.node() : v
      t = gs.t
      v = gs.v
      f = v
      r = gs.r
      u = { ...gs.u }
      a = [...gs.a]
      b = [...gs.b]
    }

    // Instance of a class.
    // Note: uses the convention that a class name is captialized.
    else if (
      S.Function === v.constructor.name &&
      UPPER_CASE_FIRST_RE.test(v.name)
    ) {
      t = (S.instance as ValType)
      r = true
      u.n = v.prototype?.constructor?.name
      u.i = v
    }
  }
  else if (S.number === t && isNaN(v)) {
    t = (S.nan as ValType)
  }
  else if (S.string === t && '' === v) {
    u.empty = true
  }

  let vmap = (null != v && (S.object === t || S.array === t)) ? { ...v } : v

  let node = ({
    $: SHAPE,
    t,
    v: vmap,
    f,
    n: null != vmap && S.object === typeof (vmap) ? keys(vmap).length : 0,
    c,
    r,
    p,
    d: null == depth ? -1 : depth,
    k: [],
    e: true,
    u,
    a,
    b,
    m: meta || {},
    [Symbol.for('nodejs.util.inspect.custom')]() {
      const nd: any = { ...this }
      delete nd.$
      return JSON.stringify(
        nd,
        (_k, v) => 'function' === typeof v &&
          !(BuilderMap as any)[v.name] && !TNAT[v.name] ? v.name : v
      ).replace(/"/g, '').replace(/,/g, ' ')
    }
  } as unknown as Node<S>)

  return node
}


function nodizeDeep(root: any, depth: number) {
  const nodes = [[{}, 'root', root, depth]]

  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i]
    const n = p[0][p[1]] = nodize(p[2], p[3])

    if (undefined !== n.c) {
      if (!n.c.$?.shape$) {
        nodes.push([n, 'c', n.c, n.d])
      }
    }

    let vt = typeof n.v
    if (S.object === vt && null != n.v) {
      const vkeys = keys(n.v)
      for (let kI = 0; kI < vkeys.length; kI++) {
        const k = vkeys[kI]
        if (!n.v[k]?.$?.shape$) {
          nodes.push([n.v, k, n.v[k], n.d + 1])
        }
      }
    }
  }

  return nodes[0][0].root
}


// Create a ShapeShape from a shape specification.
function shapify<S>(intop?: S | Node<S>, inopts?: ShapeOptions) {
  const opts: ShapeOptions = null == inopts ? {} : inopts

  // TODO: move to prepopts utility function

  // Ironically, we can't Shape ShapeOptions, so we have to set
  // option defaults manually.
  opts.name =
    null == opts.name ?
      'G$' + ('' + Math.random()).substring(2, 8) : '' + opts.name

  // Meta properties are off by default.
  let optsmeta = opts.meta = opts.meta || ({} as any)
  optsmeta.active = (true === optsmeta.active) || false
  optsmeta.suffix = S.string == typeof optsmeta.suffix ? optsmeta.suffix : '$$'

  // Key expressions are on by default.
  let optskeyexpr = opts.keyexpr = opts.keyexpr || ({} as any)
  optskeyexpr.active = (false !== optskeyexpr.active)

  // Key specs are off by default.
  let optsvalexpr = opts.valexpr = (opts.valexpr || ({} as any))
  optsvalexpr.active = (true === optsvalexpr.active)
  optsvalexpr.keymark =
    S.string == typeof optsvalexpr.keymark ? optsvalexpr.keymark : optsmeta.suffix

  let top: Node<S> = nodize<S>(intop, 0)
  let desc: string = ''
  let json: any = undefined

  // Lazily execute top against root to see if they match
  function exec(
    root: any,
    ctx?: Context,
    match?: boolean // Suppress errors and return boolean result (true if match)
  ): any {
    const skipd = ctx?.skip?.depth
    const skipa = Array.isArray(ctx?.skip?.depth) ? new Set(ctx.skip.depth) : null
    const skipk = Array.isArray(ctx?.skip?.keys) ? new Set(ctx.skip.keys) : null

    const s = new State(root, top, ctx, match)

    // Iterative depth-first traversal of the shape using append-only array stacks.
    // Stack entries are either sub-nodes to validate, or back pointers to
    // next depth-first sub-node index.
    while (true) {
      s.next()

      if (s.stop) {
        break
      }

      let n = s.node
      let done = false
      let fatal = false

      // Context skip can override node skip
      let skip = (n.d === skipd ||
        (skipa && skipa.has(n.d)) ||
        (skipk && 1 === n.d && skipk.has(s.key))) ? true : n.p

      // Call Befores
      if (0 < n.b.length) {
        for (let bI = 0; bI < n.b.length; bI++) {
          let update = handleValidate(n.b[bI], s)
          n = s.node
          if (undefined !== update.done) {
            done = update.done
          }
          fatal = fatal || !!update.fatal
        }
      }

      if (!done) {
        let descend = true
        let valundef = undefined === s.val

        if (S.never === s.type) {
          s.curerr.push(makeErrImpl(S.never, s, 1070))
        }

        // Handle objects.
        else if (S.object === s.type) {
          let val

          if (undefined !== n.c) {
            n.c = nodizeDeep(n.c, 1 + s.dI)
          }

          if (n.r && valundef) {
            s.ignoreVal = true
            s.curerr.push(makeErrImpl(S.required, s, 1010))
          }
          else if (
            !valundef && (
              null === s.val ||
              S.object !== s.valType ||
              isarr(s.val)
            )
          ) {
            s.curerr.push(makeErrImpl(S.type, s, 1020))
            val = isarr(s.val) ? s.val : {}
          }

          // Not skippable, use default or create object
          else if (!skip && valundef && undefined !== n.f) {
            s.updateVal(n.f)
            s.fromDflt = true
            val = s.val
            descend = false
          }
          else if (!skip || !valundef) {
            // Descend into object, constructing child defaults
            s.updateVal(s.val || (s.fromDflt = true, {}))
            val = s.val
          }

          if (descend) {
            val = null == val && false === s.ctx.err ? {} : val

            if (null != val) {
              s.ctx.log && s.ctx.log('so', s)

              let hasKeys = false
              let vkeys = keys(n.v)
              let knownKeys = new Set(n.k)
              let start = s.nI

              if (0 < vkeys.length) {
                hasKeys = true
                s.pI = start
                //for (let k of vkeys) {
                for (let kI = 0; kI < vkeys.length; kI++) {
                  let k = vkeys[kI]
                  let meta: NodeMeta | undefined = undefined

                  // TODO: make optional, needs tests
                  // Experimental feature for jsonic docs

                  // NOTE: Meta key *must* immediately preceed key:
                  // { x$$: <META>, x: 1 }}
                  if (optsmeta.active && k.endsWith(optsmeta.suffix)) {
                    meta = { short: '' }
                    if (S.string === typeof (n.v[k])) {
                      meta.short = n.v[k]
                    }
                    else {
                      meta = { ...meta, ...n.v[k] }
                    }
                    delete n.v[k]
                    kI++
                    if (vkeys.length <= kI) {
                      break
                    }
                    if (vkeys[kI] !== k
                      .substring(0, k.length - optsmeta.suffix.length)) {
                      throw new Error('Invalid meta key: ' + k)
                    }
                    k = vkeys[kI]
                  }

                  let rk = k
                  let ov: any = n.v[k]

                  if (optskeyexpr.active) {
                    let m = KEY_EXPR_RE.exec(k)
                    if (m) {
                      rk = m[1]
                      let src = m[3]

                      ov = expr({ src, d: 1 + s.dI, meta }, ov)
                      delete n.v[k]
                    }
                  }

                  if (optsvalexpr.active && k.startsWith(optsvalexpr.keymark)) {
                    if (k === optsvalexpr.keymark) {
                      let outn = expr({
                        src: ov, d: 1 + s.dI, meta,
                        ancestors: s.ancestors,
                        node: n,
                      }, n)
                      Object.assign(n, outn)
                    }
                    else {
                      n.m.$$ = (n.m.$$ || {})
                      n.m.$$[k.substring(optsvalexpr.keymark.length)] = n.v[k]
                    }
                    delete n.v[k]
                    continue
                  }


                  let nvs = nodize(ov, 1 + s.dI, meta)
                  n.v[rk] = nvs

                  if (!knownKeys.has(rk)) {
                    n.k.push(rk)
                    knownKeys.add(rk)
                  }

                  s.nodes[s.nI] = nvs
                  s.vals[s.nI] = val[rk]
                  s.parents[s.nI] = val
                  s.keys[s.nI] = rk
                  s.nI++
                }
              }

              let extra: string[] = []
              let valKeys = keys(val)
              for (let vkI = 0; vkI < valKeys.length; vkI++) {
                if (undefined === n.v[valKeys[vkI]]) {
                  extra.push(valKeys[vkI])
                }
              }

              if (0 < extra.length) {
                if (undefined === n.c) {
                  s.ignoreVal = true
                  s.curerr.push(makeErrImpl(
                    S.closed, s, 1100, undefined, { k: extra }))
                }
                else {
                  hasKeys = true
                  s.pI = start
                  for (let k of extra) {
                    let nvs = n.c = nodize(n.c, 1 + s.dI)
                    s.nodes[s.nI] = nvs
                    s.vals[s.nI] = val[k]
                    s.parents[s.nI] = val
                    s.keys[s.nI] = k
                    s.nI++
                  }
                }
              }

              if (hasKeys) {
                s.dI++
                s.nodes[s.nI] = s.sI
                s.parents[s.nI] = val
                s.nextSibling = false
                s.nI++
              }
              else {
                s.ctx.log && s.ctx.log('eo', s)
              }
            }
          }
        }

        // Handle arrays.
        else if (S.array === s.type) {
          if (n.r && valundef) {
            s.ignoreVal = true
            s.curerr.push(makeErrImpl(S.required, s, 1030))
          }
          else if (!valundef && !isarr(s.val)) {
            s.curerr.push(makeErrImpl(S.type, s, 1040))
          }
          else if (!skip && valundef && undefined !== n.f) {
            s.updateVal(n.f)
            s.fromDflt = true
          }
          else if (!skip || null != s.val) {
            s.updateVal(s.val || (s.fromDflt = true, []))

            // n.c set by nodize for array with len=1
            let hasChildShape = undefined !== n.c
            let hasValueElements = 0 < s.val.length
            let elementKeys: string[] = []
            let nvKeys = keys(n.v)
            for (let ekI = 0; ekI < nvKeys.length; ekI++) {
              if (!isNaN(+nvKeys[ekI])) {
                elementKeys.push(nvKeys[ekI])
              }
            }
            let hasFixedElements = 0 < elementKeys.length

            if (hasChildShape) {
              n.c = nodizeDeep(n.c, 1 + s.dI)
            }

            s.ctx.log && s.ctx.log('sa', s)

            if (hasValueElements || hasFixedElements) {
              s.pI = s.nI

              let elementIndex = 0

              // Fixed element array means match shapes at each index only.
              if (hasFixedElements) {
                if (elementKeys.length < s.val.length && !hasChildShape) {
                  s.ignoreVal = true
                  s.curerr.push(makeErrImpl(S.closed, s, 1090, undefined,
                    { k: elementKeys.length }))
                }
                else {
                  for (; elementIndex < elementKeys.length; elementIndex++) {
                    let elementShape =
                      n.v[elementIndex] =
                      nodize(n.v[elementIndex], 1 + s.dI)
                    s.nodes[s.nI] = elementShape
                    s.vals[s.nI] = s.val[elementIndex]
                    s.parents[s.nI] = s.val
                    s.keys[s.nI] = '' + elementIndex
                    s.nI++
                  }
                }
              }

              // Single element array shape means 0 or more elements of shape
              if (hasChildShape && hasValueElements) {
                let elementShape: Node<S> = n.c // = nodize(n.c, 1 + s.dI)
                for (; elementIndex < s.val.length; elementIndex++) {
                  s.nodes[s.nI] = elementShape
                  s.vals[s.nI] = s.val[elementIndex]
                  s.parents[s.nI] = s.val
                  s.keys[s.nI] = '' + elementIndex
                  s.nI++
                }
              }

              if (!s.ignoreVal) {
                s.dI++
                s.nodes[s.nI] = s.sI
                s.parents[s.nI] = s.val
                s.nextSibling = false
                s.nI++
              }
            }
            else {
              // Ensure single element array still generates log
              // for the element when only walking shape.
              s.ctx.log &&
                hasChildShape &&
                undefined == root &&
                s.ctx.log('kv', { ...s, key: 0, val: n.c })

              s.ctx.log && s.ctx.log('ea', s)
            }
          }
        }

        // Handle regexps.
        else if (S.regexp === s.type) {
          if (valundef && !n.r) {
            s.ignoreVal = true
          }
          else if (S.string !== s.valType) {
            s.ignoreVal = true
            s.curerr.push(makeErrImpl(S.type, s, 1045))
          }
          else if (!s.val.match(n.v)) {
            s.ignoreVal = true
            s.curerr.push(makeErrImpl(S.regexp, s, 1045))
          }
        }

        // Invalid type.
        else if (!(
          S.any === s.type ||
          S.list === s.type ||
          S.check === s.type ||
          undefined === s.val ||
          s.type === s.valType ||
          (S.instance === s.type && n.u.i && s.val instanceof n.u.i) ||
          (S.null === s.type && null === s.val)
        )) {
          s.curerr.push(makeErrImpl(S.type, s, 1050))
        }

        // Value itself, or default.
        else if (undefined === s.val) {
          let parentKey = s.path[s.dI]

          if (
            !skip &&
            n.r &&
            (S.undefined !== s.type || !s.parent.hasOwnProperty(parentKey))
          ) {
            s.ignoreVal = true
            s.curerr.push(makeErrImpl(S.required, s, 1060))
          }
          else if (
            // undefined !== n.v &&
            undefined !== n.f &&
            !skip ||
            S.undefined === s.type
          ) {
            // Inject default value.
            s.updateVal(n.f)
            s.fromDflt = true
          }
          else if (S.any === s.type) {
            s.ignoreVal = undefined === s.ignoreVal ? true : s.ignoreVal
          }

          // TODO: ensure object,array points called even if errors
          s.ctx.log && s.ctx.log('kv', s)
        }

        // Empty strings fail even if string is optional. Use Empty() to allow.
        else if (S.string === s.type && '' === s.val && !n.u.empty) {
          s.curerr.push(makeErrImpl(S.required, s, 1080))
          s.ctx.log && s.ctx.log('kv', s)
        }

        else {
          s.ctx.log && s.ctx.log('kv', s)
        }
      }

      // Call Afters
      if (0 < n.a.length) {
        for (let aI = 0; aI < n.a.length; aI++) {
          let update = handleValidate(n.a[aI], s)
          n = s.node
          if (undefined !== update.done) {
            done = update.done
          }
          fatal = fatal || !!update.fatal
        }
      }

      // Explicit ignoreVal overrides Skip
      // let ignoreVal = s.node.p ? false === s.ignoreVal ? false : true : !!s.ignoreVal
      let ignoreVal = skip ? false === s.ignoreVal ? false : true : !!s.ignoreVal
      let setParent = !s.match && null != s.parent && !done && !ignoreVal

      if (setParent) {
        s.parent[s.key] = s.val
      }

      if (s.nextSibling) {
        s.pI = s.sI
      }

      if (s.node.e || fatal) {
        s.err.push(...s.curerr)
      }
    }

    // s.err = s.err.filter(e => null != e)
    if (0 < s.err.length) {
      if (isarr(s.ctx.err)) {
        s.ctx.err.push(...s.err)
      }
      else if (!s.match && false !== s.ctx.err) {
        throw new ShapeError(S.shape, opts.name, s.err, s.ctx)
      }
    }

    return s.match ? 0 === s.err.length : s.root
  }


  const shape =
    <V>(root?: V, ctx?: Context):
      V & ShapeResult<S> => {
      return (exec(root, ctx, false))
    }

  function valid<V>(root?: V, ctx?: Context): root is (V & S) {
    let actx: any = ctx || {}
    actx.err = actx.err || []
    exec(root, actx, false)
    return 0 === actx.err.length
  }
  shape.valid = valid


  shape.match = (root?: any, ctx?: Context): boolean => {
    ctx = ctx || {}
    return (exec(root, ctx, true) as boolean)
  }


  // List the errors from a given root value.
  shape.error = (root?: any, ctx?: Context): ShapeError[] => {
    let actx: any = ctx || {}
    actx.err = actx.err || []
    exec(root, actx, false)
    return actx.err
  }


  shape.spec = () => {
    // Normalize spec, discard errors.
    shape(undefined, { err: false })
    const str = stringify(top, false, true, { key: Object.keys(TNAT) },
      (_key: string, val: any) => {
        if (SHAPE$ === val) {
          return true
        }
        return val
      })
    return JP(str)
  }


  shape.node = (): Node<S> => {
    shape.spec()
    return top
  }


  shape.stringify = (...rest: any[]) => {
    const json = shape.jsonify()

    return '' === desc ?
      (desc = ('string' === typeof json ? json.replace(/^"(.*)"$/, '$1') :
        JSON.stringify(json, ...rest))) : desc
  }

  shape.jsonify = () => {
    return null == json ? (json = node2json(shape.node())) : json
  }


  shape.toString = function(this: any) {
    desc = '' === desc ? this.stringify() : desc
    return `[Shape ${opts.name} ${truncate(desc)}]`
  }

  if (inspect && inspect.custom) {
    (shape as any)[inspect.custom] = shape.toString
  }

  shape.shape = SHAPE

  // Validate shape spec. This will throw if there's an issue with the spec.
  shape.spec()

  return shape
}


// Parse a builder expression into actual Builders.
// Function call syntax; Depth first; literals must be JSON values;
// Commas are optional. Top level builders are applied in order.
// Dot-concatenated builders are applied in order.
// Primary value is passed as Builder `this` context.
// Examples:
// Shape({
//   'x: Open': {},
//   'y: Min(1) Max(4)': 2,
//   'z: Required(Min(1))': 2,
//   'q: Min(1).Below(4)': 3,
// })
function expr(
  spec: {
    src: string
    keymark?: string
    val?: any
    d?: number
    meta?: NodeMeta
    ancestors?: Node<any>[],
    node?: Node<any>,
    tokens?: string[]
    i?: number
    refs?: any
  } | string,
  current?: any
) {
  let g: any = undefined

  let top = false

  if ('string' === typeof spec) {
    spec = { src: spec }
  }

  spec.keymark = spec.keymark || '$$'

  const currentIsNode = current?.$?.shape$

  spec.i = spec.i || 0

  if (null == spec.tokens) {
    g = undefined != spec.val ? nodize(spec.val, (spec.d || 0) + 1, spec.meta) : undefined

    top = true
    spec.tokens = []

    //         A       BC      D L   E         F  M   H        N        I        JK
    let tre = /\s*,?\s*([)(\.]|"(\\.|[^"\\])*"|\/(\\.|[^\/\\])*\/[a-z]?|[^)(,.\s]+)\s*/g
    // A: prefixing space and/or comma
    // B-J: the next token is submatch 1, containing a set of alternates
    // C: class parens-dot
    // D: quoted string
    // L: backslash escape within string
    // E: unescaped char (not a quote or backslash)
    // F: regexp
    // M: literal dot
    // H: not a regexp escape or end slash
    // N: regexp end and flags
    // I: not a char token (thus a builder name)
    // K: suffix space

    let t = null
    while (t = tre.exec(spec.src)) {
      spec.tokens.push(t[1])
    }

    // Append current into leftmost deepest Builder args
    if (!currentIsNode) {
      let tI = 0
      let paren = false
      // for (; tI < spec.tokens.length && ')' !== spec.tokens[tI]; tI++);
      for (; tI < spec.tokens.length; tI++) {
        if (')' == spec.tokens[tI]) {
          paren = true
          break
        }
      }
      if (paren || tI === spec.tokens.length) {
        //let ctj = JSON.stringify(current)
        // if (undefined !== ctj) {
        if (undefined !== current) {
          let refname = 'token_' + spec.d + '_' + spec.i
          spec.refs = (spec.refs || {})
          spec.refs[refname] = current

          if (paren) {
            // spec.tokens.splice(tI, 0, ctj)
            spec.tokens.splice(tI, 0, spec.keymark + refname)
          }
          else {
            // spec.tokens.push('(', ctj, ')')
            spec.tokens.push('(', spec.keymark + refname, ')')
          }
        }
      }
    }

  }


  let head = spec.tokens[spec.i]
  let fn = (BuilderMap as any)[head]

  if (')' === spec.tokens[spec.i]) {
    spec.i++
    return current
  }

  spec.i++


  let args = []


  if (null == fn) {
    try {
      let m

      // let val = TNAT[head]
      if (TNAT[head]) {
        fn = Type
        args.unshift(head)
      }
      else if (S.undefined === head) {
        return undefined
      }
      else if ('NaN' === head) {
        return NaN
      }
      else if (head.match(/^\/.+\/$/)) {
        return new RegExp(head.substring(1, head.length - 1))
      }
      else if (m = head.match(/^\$\$([^$]+)$/)) {
        return spec.node ?
          ((spec.node.m?.$$ || {})[m[1]] || spec.node.v['$$' + m[1]])
          : (spec.refs ? spec.refs[m[1]] : undefined)
      }
      else {
        let val = JP(head)
        if (top) {
          fn = Default
          args.unshift(val)
        }
        else {
          return val
        }
      }
    }
    catch (je: any) {
      throw new SyntaxError(
        `Shape: unexpected token ${head} in builder expression ${spec.src}`)
    }
  }


  if ('(' === spec.tokens[spec.i]) {
    spec.i++

    let t = null
    while (null != (t = spec.tokens[spec.i]) && ')' !== t) {
      let ev = expr(spec)
      args.push(ev)
    }
    spec.i++
  }


  if (!currentIsNode) {
    g = fn.call(undefined, ...args)
  }
  else {
    g = fn.call(current, ...args)
  }

  if ('.' === spec.tokens[spec.i]) {
    spec.i++
    g = expr(spec, g)
  }
  else if (top && spec.i < spec.tokens.length) {
    g = expr(spec, g)
  }

  return g
}


function build(v: any, opts: ShapeOptions = {}, top = true) {
  let out: any
  const t = Array.isArray(v) ? 'array' : null === v ? 'null' : typeof v

  if ('string' === t) {
    out = expr(v)
  }
  else if ('number' === t || 'boolean' === t) {
    out = v
  }
  else if (S.object === t) {
    out = Object.entries(v).reduce((a: any, n: any[]) => {
      a[n[0]] = (opts.valexpr?.keymark || '$$') === n[0] ? n[1] : build(n[1], opts, false)
      return a
    }, {})
  }
  else if (S.array === t) {
    out = v.map((n: any) => build(n, opts, false))
  }

  if (top) {
    opts.valexpr = opts.valexpr || {}
    opts.valexpr.active = true
    let g = Shape(out, opts)
    return g
  }

  return out
}


function handleValidate(vf: Validate, s: State): Update {
  let update: Update = {}

  let valid = false
  let thrown

  try {
    // Check does not have to deal with `undefined`
    valid = undefined === s.val && ((vf as any).shape$?.Check) ? true :
      (s.check = vf, vf(s.val, update, s))
  }
  catch (ve: any) {
    thrown = ve
  }

  let hasErrs =
    isarr(update.err) ? 0 < (update.err as Array<any>).length : null != update.err

  if (!valid || hasErrs) {

    // Skip allows undefined
    if (undefined === s.val && (s.node.p || !s.node.r) && true !== update.done) {
      delete update.err
      return update
    }

    let w = update.why || S.check
    let path = pathstr(s)

    if (S.string === typeof (update.err)) {
      s.curerr.push(makeErr(s, (update.err as string)))
    }
    else if (S.object === typeof (update.err)) {
      // Assumes makeErr already called
      const errsrc = update.err
      if (isarr(errsrc)) {
        for (let eI = 0; eI < (errsrc as any[]).length; eI++) {
          const e = (errsrc as any[])[eI]
          if (null != e) {
            e.path = null == e.path ? path : e.path
            e.mark = null == e.mark ? 2010 : e.mark
            s.curerr.push(e)
          }
        }
      } else if (null != errsrc) {
        ;(errsrc as any).path = null == (errsrc as any).path ? path : (errsrc as any).path
        ;(errsrc as any).mark = null == (errsrc as any).mark ? 2010 : (errsrc as any).mark
        s.curerr.push(errsrc)
      }
    }
    else {
      let fname = vf.name
      if (null == fname || '' == fname) {
        fname = truncate(vf.toString().replace(/[ \t\r\n]+/g, ' '))
      }
      s.curerr.push(makeErrImpl(
        w, s, 1045, undefined, { thrown }, fname))
    }

    update.done = null == update.done ? true : update.done
  }

  // Use uval for undefined and NaN
  if (update.hasOwnProperty('uval')) {
    s.updateVal(update.uval)
    s.ignoreVal = false
  }
  else if (undefined !== update.val && !Number.isNaN(update.val)) {
    s.updateVal(update.val)
    s.ignoreVal = false
  }

  if (undefined !== update.node) {
    s.node = update.node
  }

  if (undefined !== update.type) {
    s.type = update.type
  }

  return update
}


// Create string description of property path, using "dot notation".
function pathstr(s: State) {
  let out = ''
  for (let i = 1; i <= s.dI; i++) {
    const p = s.path[i]
    if (null != p) {
      if (out.length > 0) out += '.'
      out += p
    }
  }
  return out
}


function valueLen(val: any) {
  return S.number === typeof (val) ? val :
    S.number === typeof (val?.length) ? val.length :
      null != val && S.object === typeof (val) ? keys(val).length :
        NaN
}


function truncate(str?: string, len?: number): string {
  let strval = String(str)
  let outlen = null == len || isNaN(len) ? 30 : len < 0 ? 0 : ~~len
  let strlen = null == str ? 0 : strval.length
  let substr = null == str ? '' : strval.substring(0, strlen)
  substr = outlen < strlen ? substr.substring(0, outlen - 3) + '...' : substr
  return substr.substring(0, outlen)
}



// Builder Definitions
// ===================


// Value is required.
const Required = function <V>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)

  node.r = true
  node.p = false

  if (undefined === shape) {
    node.f = undefined

    // Handle an explicit undefined.
    if (1 === arguments.length) {
      node.t = (S.undefined as ValType)
      node.v = undefined
    }
  }

  // Required(foo) by itself does set default value = foo,
  // which might then be used later. But if chained, the default cannot survive.
  else if (this?.$?.shape$) {
    node.f = undefined
  }


  return node
}


// Value can contain additional undeclared properties.
const Open = function <V>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.c = Any()
  return node
}


// Value is optional.
const Optional = function <V>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.r = false

  // Handle an explicit undefined.
  if (undefined === shape && 1 === arguments.length) {
    node.t = (S.undefined as ValType)
    node.v = undefined
  }
  return node
}


// Value can be anything.
const Any = function <V>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.t = (S.any as ValType)
  if (undefined !== shape) {
    node.v = shape
    node.f = shape
  }
  return node
}


// Custom error message.
const Fault = function <V>(this: any, msg: string, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.z = msg
  return node
}


// Value is skipped if not present (optional, but no default).
const Skip = function <V>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.r = false

  // Do not insert empty arrays and objects.
  node.p = true

  return node
}


// Errors for this value are ignored, and the value is undefined.
const Ignore = function <V>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.r = false

  // Do not insert empty arrays and objects.
  node.p = true

  node.e = false

  node.a.push(function Ignore(_val: any, update: Update, state: State) {
    if (0 < state.curerr.length) {
      update.uval = undefined
      update.done = false
    }
    return true
  })

  return node
}


// Value must be a function.
const Func = function <V>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this)
  node.t = (S.function as ValType)
  node.v = shape
  node.f = shape
  return node
}


// Specify default value.
const Default = function <V>(this: any, dval?: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, dval)

  if (undefined !== shape) {
    node = buildize(node, shape)
  }

  node.r = false
  node.f = dval

  if (undefined === shape) {
    let t = typeof dval
    if (S.function === t && IS_TYPE[dval.name]) {
      node.t = (dval.name.toLowerCase() as ValType)
      node.f = clone(EMPTY_VAL[node.t])
    }
  }
  else {
    const sn = nodize(shape)
    node.t = sn.t
  }

  // Always insert default.
  node.p = false

  return node
}


// String can be empty.
const Empty = function <V>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.u.empty = true
  return node
}


// Value will never match anything.
const Never = function <V>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.t = (S.never as ValType)
  return node
}


// Inject the key path of the value.
// OR: provide validation of Key - depth could also be a RegExp
const Key = function(this: any, depth?: number | Function, join?: string) {
  let node = buildize(this)

  let ascend = S.number === typeof depth
  node.t = (S.string as ValType)

  if (ascend && null == join) {
    node = nodize([])
  }

  let custom: any = null
  if (S.function === typeof depth) {
    custom = depth
    node = Any()
  }

  node.b.push(function Key(_val: any, update: Update, state: State) {
    if (custom) {
      update.val = custom(state.path, state)
    }
    else if (ascend) {
      let d = (depth as number)
      update.val = state.path.slice(
        state.path.length - 1 - (0 <= d ? d : 0),
        state.path.length - 1 + (0 <= d ? 0 : 1),
      )

      if (S.string === typeof join) {
        update.val = update.val.join(join)
      }
    }
    else if (null == depth) {
      update.val = state.path[state.path.length - 2]
    }

    return true
  })

  return node
}


// Pass only if all match. Does not short circuit (as defaults may be missed).
const All = function(this: any, ...inshapes: any[]) {
  const node = buildize(this)
  node.t = (S.list as ValType)
  node.r = true

  const shapes = inshapes.map(s => Shape(s))
  node.u.list = shapes.map(g => g.node())

  const validator = function All(val: any, update: Update, state: State) {
    let pass = true

    // let err: any = []
    for (let shape of shapes) {
      let subctx = { ...state.ctx, err: [] }
      shape(val, subctx)
      if (0 < subctx.err.length) {
        pass = false
      }
    }

    if (!pass) {
      update.why = S.All
      update.err = [
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ' does not satisfy all of: ' +
          `${inshapes.map(x => stringify(x, true)).join(', ')}`)
      ]
    }

    return pass
  }

  validator.n = S.All
  validator.a = inshapes

  node.b.push(validator)

  return node
}


// Pass if some match. Note: all are evaluated, does not short circuit. This ensures
// defaults are not missed.
const Some = function(this: any, ...inshapes: any[]) {
  let node = buildize(this)
  node.t = (S.list as ValType)
  node.r = true

  let shapes = inshapes.map(s => Shape(s))
  node.u.list = shapes.map(g => g.node())


  const validator = function Some(val: any, update: Update, state: State) {
    let pass = false

    for (let shape of shapes) {
      let subctx = { ...state.ctx, err: [] }
      let match = shape.match(val, subctx)

      if (match) {
        update.val = shape(val, subctx)
      }

      pass ||= match
    }

    if (!pass) {
      update.why = S.Some
      update.err = [
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ' does not satisfy any of: ' +
          `${inshapes.map(x => stringify(x, true)).join(', ')}`)
      ]
    }

    return pass
  }

  validator.n = S.Some
  validator.a = inshapes

  node.b.push(validator)

  return node
}


// Pass if exactly one matches. Does not short circuit (as defaults may be missed).
const One = function(this: any, ...inshapes: any[]) {
  let node = buildize(this)
  node.t = (S.list as ValType)
  node.r = true

  let shapes = inshapes.map(s => Shape(s))
  // node.u.list = inshapes
  node.u.list = shapes.map(g => g.node())

  const validator = function One(val: any, update: Update, state: State) {
    let passN = 0

    for (let shape of shapes) {
      let subctx = { ...state.ctx, err: [] }
      if (shape.match(val, subctx)) {
        passN++
        update.val = shape(val, subctx)
        // TODO: update docs - short circuits!
        break
      }
    }

    if (1 !== passN) {
      update.why = S.One
      update.err = [
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ' does not satisfy one of: ' +
          `${inshapes.map(x => stringify(x, true)).join(', ')}`)
      ]
    }

    return true
  }

  validator.n = S.One
  validator.a = inshapes

  node.b.push(validator)

  return node
}


// Value must match excatly one of the literal values provided.
const Exact = function(this: any, ...vals: any[]) {
  const node = buildize(this)

  const validator = function Exact(val: any, update: Update, state: State) {
    for (let i = 0; i < vals.length; i++) {
      if (val === vals[i]) {
        return true
      }
    }

    const hasDftl = state.node.hasOwnProperty('f')
    if (hasDftl && undefined === val) {
      const valDftl = state.node.f
      for (let i = 0; i < vals.length; i++) {
        if (valDftl === vals[i]) {
          return true
        }
      }
    }

    update.err =
      makeErr(state,
        S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH + ' must be exactly one of: ' +
        vals.map((v: any) => stringify(v, true)).join(', ')
      )

    update.done = true

    return false
  }

  validator.n = S.Exact
  validator.a = vals
  validator.s =
    () => S.Exact + '(' + vals.map((v: any) => stringify(v, true)).join(',') + ')'

  node.b.push(validator)

  return node
}


// Define a custom operation to run before standard matching.
const Before = function <V>(
  this: any,
  validate: Validate,
  shape?: Node<V> | V
): Node<V> {
  let node = buildize(this, shape)
  node.b.push(validate)
  return node
}


// Define a custom operation to run after standard matching.
const After = function <V>(
  this: any,
  validate: Validate,
  shape?: Node<V> | V
): Node<V> {
  let node = buildize(this, shape)
  node.a.push(validate)
  return node
}


// Define a customer validation function.
const Check = function <V>(
  this: any,
  check: Validate | RegExp | string,
  shape?: Node<V> | V
): Node<V> {
  let node = buildize(this, shape)

  node.r = true

  if (S.function === typeof check) {
    let c$ = check as any
    c$.shape$ = c$.shape$ || {}
    c$.shape$.Check = true
    c$.s = () => S.Check + '(' + stringify(check, true) + ')'
    node.b.push((check as Validate))

    node.t = (S.check as ValType)
  }
  else if (S.object === typeof check) {
    let dstr = Object.prototype.toString.call(check)
    if (dstr.includes('RegExp')) {
      let refn: any = (v: any) =>
        (null == v || Number.isNaN(v)) ? false : !!String(v).match(check as string)
      defprop(refn, S.name, {
        value: String(check)
      })
      defprop(refn, 'shape$', { value: { Check: true } })
      refn.s = () => S.Check + '(' + stringify(check, true) + ')'
      node.b.push(refn)

      node.t = (S.check as ValType)
    }
  }
  // string is type name.
  // TODO: validate check is ValType
  else if (S.string === typeof check) {
    node.t = check as ValType
  }

  if (undefined !== shape) {
    const sn = nodize(shape)
    node.t = sn.t
  }

  return node
}


// Value cannot contain undeclared properties or elements.
const Closed = function <V>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)

  // Makes one element array fixed.
  if (S.array === node.t && undefined !== node.c && 0 === node.n) {
    node.v = [node.c]
  }
  node.c = undefined

  return node
}


// Define a named reference to this value. See Refer.
const Define = function <V>(this: any, inopts: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)

  let opts = S.object === typeof inopts ? inopts || {} : {}
  let name = S.string === typeof inopts ? inopts : opts.name


  if (null != name && '' != name) {
    node.b.push(function Define(_val: any, _update: Update, state: State) {
      let ref = state.ctx.ref = state.ctx.ref || {}
      ref[name] = state.node
      return true
    })
  }

  return node
}


// TODO: copy option to copy value instead of node - need index of value in stack
// Inject a referenced value. See Define.
const Refer = function <V>(this: any, inopts: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)

  let opts = S.object === typeof inopts ? inopts || {} : {}
  let name = S.string === typeof inopts ? inopts : opts.name

  // Fill should be false (the default) if used recursively, to prevent loops.
  let fill = !!opts.fill

  if (null != name && '' != name) {
    node.b.push(function Refer(val: any, update: Update, state: State) {
      if (undefined !== val || fill) {
        let ref = state.ctx.ref = state.ctx.ref || {}

        if (undefined !== ref[name]) {
          let node = { ...ref[name] }
          node.t = node.t || S.never

          update.node = node
          update.type = node.t

        }
      }

      // TODO: option to fail if ref not found?
      return true
    })
  }

  return node
}


// TODO: no mutate is State.match
// Rename a property.
const Rename = function <V>(this: any, inopts: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)

  let opts = S.object === typeof inopts ? inopts || {} : {}
  let name = S.string === typeof inopts ? inopts : opts.name
  let keep = S.boolean === typeof opts.keep ? opts.keep : undefined

  // NOTE: Rename claims are experimental.
  let claim = isarr(opts.claim) ? opts.claim : []

  if (null != name && '' != name) {

    // If there is a claim, grab the value so that validations
    // can be applied to it.
    let before = (val: any, update: Update, s: State) => {
      if (undefined === val && 0 < claim.length) {
        s.ctx.Rename = (s.ctx.Rename || {})
        s.ctx.Rename.fromDflt = (s.ctx.Rename.fromDflt || {})

        for (let cn of claim) {
          let fromDflt = s.ctx.Rename.fromDflt[cn] || {}

          // Only use claim if it was not a default value.
          if (undefined !== s.parent[cn] && !fromDflt.yes) {
            update.val = s.parent[cn]
            if (!s.match) {
              s.parent[name] = update.val
            }
            update.node = fromDflt.node

            // Old errors on the claimed value are no longer valid.
            // Use in-place compaction instead of splice to avoid O(n²) shifting.
            let writeIdx = 0
            for (let eI = 0; eI < s.err.length; eI++) {
              if (s.err[eI].k !== fromDflt.key) {
                s.err[writeIdx++] = s.err[eI]
              }
            }
            s.err.length = writeIdx

            if (!keep) {
              delete s.parent[cn]
            }
            else {
              let j = s.cI + 1

              // Add the default to the end of the node set to ensure it
              // is properly validated. Shift all four arrays simultaneously
              // instead of four separate splice calls.
              for (let si = s.nI; si > j; si--) {
                s.nodes[si] = s.nodes[si - 1]
                s.vals[si] = s.vals[si - 1]
                s.parents[si] = s.parents[si - 1]
                s.keys[si] = s.keys[si - 1]
              }
              s.nodes[j] = nodize(fromDflt.dval)
              s.vals[j] = undefined
              s.parents[j] = s.parent
              s.keys[j] = cn
              s.nI++
              s.pI++
            }

            break
          }
        }

        if (undefined === update.val) {
          update.val = s.node.v
        }

      }
      return true
    }
    defprop(before, S.name, { value: 'Rename:' + name })
    node.b.push(before)

    let after = (val: any, update: Update, s: State) => {
      s.parent[name] = val

      if (!s.match &&
        !keep &&
        s.key !== name &&
        // Arrays require explicit deletion as validation is based on index
        // and will be lost.
        !(isarr(s.parent) && false !== keep)
      ) {
        delete s.parent[s.key]
        update.done = true
      }

      s.ctx.Rename = (s.ctx.Rename || {})
      s.ctx.Rename.fromDflt = (s.ctx.Rename.fromDflt || {})
      s.ctx.Rename.fromDflt[name] = {
        yes: s.fromDflt,
        key: s.key,
        dval: s.node.v,
        node: s.node
      }

      return true
    }
    defprop(after, S.name, { value: 'Rename:' + name })
    node.a.push(after)
  }

  return node
}



// Children must have a specified shape.
const Child = function <V>(
  this: any,
  child?: any,
  shape?: Node<V> | V
): Node<V> {
  // Child provides implicit open object if no shape defined.
  let node = buildize(this, shape)
  node.c = nodize(child)

  if (undefined === node.v) {
    node.t = 'object'
    node.v = {}
    node.f = {}
  }

  return node
}





const Rest = function <V>(
  this: any,
  child?: any,
  shape?: Node<V> | V
): Node<V> {
  let node = buildize(this, shape || [])
  node.t = 'array'
  node.c = nodize(child)
  node.m = node.m || {}
  node.m.rest = true
  return node
}


const Type = function <V extends
  'Number' |
  'String' |
  'Boolean' |
  'Object' |
  'Array' |
  'Function' |
  'Symbol' |
  StringConstructor |
  NumberConstructor |
  BooleanConstructor |
  ArrayConstructor |
  ObjectConstructor |
  FunctionConstructor |
  SymbolConstructor | Symbol |
  Record<any, any> |
  null | undefined | typeof NaN
>(
  this: any,
  tref: V,
  shape?: any
): (
    V extends 'Number' | NumberConstructor ? number :
    V extends 'Boolean' | BooleanConstructor ? boolean :
    V extends 'String' | StringConstructor ? string :
    V extends 'Array' | ArrayConstructor ? any[] :
    V extends 'Object' | ObjectConstructor ? any :
    V extends 'Function' | FunctionConstructor ? Function :
    V extends 'Symbol' | SymbolConstructor ? Symbol :
    V extends null ? null :
    V extends undefined ? undefined :
    V) {
  let tnat = nodize(TNAT[tref as string] || tref)

  let node = buildize(this, shape)
  if (node !== tnat) {
    node.t = tnat.t
    node.r = tnat.r
    node.p = tnat.p
    node.v = tnat.v
  }

  return (node as any)
}


// Size Builders: Min, Max, Above, Below, Len
// ==========================================

function makeSizeBuilder(
  self: any,
  size: any,
  shape: any,
  name: string,
  valid: (vsize: number, size: number, val: any, update: Update, state: State) => boolean
) {
  let node = buildize(self, shape)
  size = +size

  let validator: any = function(val: any, update: Update, state: State) {
    return valid(valueLen(val), size, val, update, state)
  }

  Object.defineProperty(validator, S.name, { value: name })

  validator.n = name
  validator.a = [size]
  validator.s = () => name + '(' + size + ')'

  validator[Symbol.for('nodejs.util.inspect.custom')] = validator.s()
  validator.toJSON = () => validator.s()

  node.b.push(validator)

  return node
}


// Specific a minimum value or length.
const Min = function <V>(
  this: any,
  min: number | string,
  shape?: Node<V> | V
): Node<V> {
  return makeSizeBuilder(this, min, shape, S.Min,
    (vsize: number, min: number, val: any, update: Update, state: State) => {
      if (min <= vsize) {
        return true
      }

      state.checkargs = { min: 1 }
      let errmsgpart = S.number === typeof (val) ? '' : 'length '
      update.err =
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ` must be a minimum ${errmsgpart}of ${min} (was ${vsize}).`)
      return false
    })
}


// Specific a maximum value or length.
const Max = function <V>(
  this: any,
  max: number | string,
  shape?: Node<V> | V
): Node<V> {
  return makeSizeBuilder(this, max, shape, S.Max,
    (vsize: number, max: number, val: any, update: Update, state: State) => {
      if (vsize <= max) {
        return true
      }

      let errmsgpart = S.number === typeof (val) ? '' : 'length '
      update.err =
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ` must be a maximum ${errmsgpart}of ${max} (was ${vsize}).`)
      return false
    })
}


// Specify a lower bound value or length.
const Above = function <V>(
  this: any,
  above: number | string,
  shape?: Node<V> | V
): Node<V> {
  return makeSizeBuilder(this, above, shape, S.Above,
    (vsize: number, above: number, val: any, update: Update, state: State) => {
      if (above < vsize) {
        return true
      }

      let errmsgpart = S.number === typeof (val) ? 'be' : 'have length'
      update.err =
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ` must ${errmsgpart} above ${above} (was ${vsize}).`)
      return false
    })
}


// Specify an upper bound value or length.
const Below = function <V>(
  this: any,
  below: number | string,
  shape?: Node<V> | V
): Node<V> {
  return makeSizeBuilder(this, below, shape, S.Below,
    (vsize: number, below: number, val: any, update: Update, state: State) => {
      if (vsize < below) {
        return true
      }

      let errmsgpart = S.number === typeof (val) ? 'be' : 'have length'
      update.err =
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ` must ${errmsgpart} below ${below} (was ${vsize}).`)
      return false
    })
}


// Value must have a specific length.
const Len = function <V>(
  this: any,
  len: number,
  shape?: Node<V> | V
): Node<V> {
  return makeSizeBuilder(this, len, shape, S.Below,
    (vsize: number, len: number, val: any, update: Update, state: State) => {
      if (len === vsize) {
        return true
      }

      let errmsgpart = S.number === typeof (val) ? '' : ' in length'
      update.err =
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ` must be exactly ${len}${errmsgpart} (was ${vsize}).`)
      return false
    })
}



// Make a Node chainable with Builder methods.
function buildize<V>(self?: any, shape?: any): Node<V> {
  // Detect chaining. If not chained, ignore `this` if it is the global context.

  let globalNode = null != self && (self.window === self || self.global === self)
  let node: Node<V>

  if ((undefined === self || globalNode) && undefined !== shape) {
    node = nodize(shape)
  }
  else if (undefined !== self && !globalNode) {
    // Merge self into shape, retaining previous chained builders.
    if (undefined !== shape) {
      node = nodize(shape)
      let selfNode = nodize(self)

      // TODO: need a more robust way to prevent Builders breaking each other.
      if (undefined === node.v && 'list' !== node.t) {
        node.v = selfNode.v
        node.t = selfNode.t
      }

      ;['f', 'r', 'p', 'c', 'e', 'z'].map((pn: string) =>
        node[pn] = undefined !== selfNode[pn] ? selfNode[pn] : node[pn])

      node.u = Object.assign({}, selfNode.u, node.u)
      node.m = Object.assign({}, selfNode.m, node.m)
      node.a = selfNode.a.concat(node.a)
      node.b = selfNode.b.concat(node.b)

    }
    else {
      node = nodize(self)
    }
  }
  else {
    node = nodize(undefined)
  }


  // Only add chainable Builders.
  // NOTE: One, Some, All not chainable.
  return node.Above ? node : // No need if already made chainable
    Object.assign(node, {
      Above,
      After,
      Any,
      Before,
      Below,
      Check,
      Child,
      Closed,
      Default,
      Define,
      Empty,
      Exact,
      Fault,
      Ignore,
      Len,
      Max,
      Min,
      Never,
      Open,
      Optional,
      Refer,
      Rename,
      Required,
      Rest,
      Skip,
      Type,

      String: () => Type.call(node, String),
      Number: () => Type.call(node, Number),
      Boolean: () => Type.call(node, Boolean),
      Object: () => Type.call(node, Object),
      Array: () => Type.call(node, Array),
      Function: () => Type.call(node, Function),
      Symbol: () => Type.call(node, Symbol),
    })
}


// External utility to make ErrDesc objects.
function makeErr(state: State, text?: string, why?: string, user?: any) {
  return makeErrImpl(
    why || S.check,
    state,
    4000,
    text,
    user,
  )
}


// Internal utility to make ErrDesc objects.
function makeErrImpl(
  why: string,
  s: State,
  mark: number,
  text?: string,
  user?: any,
  fname?: string,
): ErrDesc {
  let err: ErrDesc = {
    key: s.key,
    type: s.node.t,
    node: s.node,
    value: s.val,
    path: pathstr(s),
    why: why,
    check: s.check?.name || 'none',
    args: s.checkargs || {},
    mark: mark,
    text: '',
    use: user || {},
  }

  // TODO: truncate len, and ignore should be ShapeOptions
  let jstr = undefined === s.val ? S.undefined :
    stringify(s.val, false, false, { key: [/\$$/] }
    )
  let valstr = truncate(jstr.replace(/"/g, ''), 111)

  text = text || s.node.z

  if (null == text || '' === text) {
    let valkind = valstr.startsWith('[') ? S.array :
      valstr.startsWith('{') ? S.object :
        (null == s.val || (S.number === typeof s.val && isNaN(s.val))
          ? 'value' : (typeof s.val))

    let propkind = (valstr.startsWith('[') || isarr(s.parents[s.pI])) ?
      'index' : 'property'
    let propkindverb = 'is'
    let propkey = user?.k

    propkey = isarr(propkey) ?
      (propkind = (1 < propkey.length ?
        (propkindverb = 'are', 'properties') : propkind),
        propkey.join(', ')) :
      propkey

    err.text = `Validation failed for ` +
      (0 < err.path.length ? `${propkind} "${err.path}" with ` : '') +
      `${valkind} "${valstr}" because ` +

      (
        S.type === why ?
          (
            S.instance === s.node.t ?
              `the ${valkind} is not an instance of ${s.node.u.n}` :
              `the ${valkind} is not of type ${S.regexp === s.node.t ? S.string : s.node.t}`
          )
          :
          S.required === why ?
            (
              '' === s.val ?
                'an empty string is not allowed'
                :
                `the ${valkind} is required`
            )
            :
            'closed' === why ?
              `the ${propkind} "${propkey}" ${propkindverb} not allowed`
              :
              S.regexp === why ?
                'the string did not match ' + s.node.v
                :
                S.never === why ?
                  'no value is allowed'
                  :
                  `check "${null == fname ? why : fname}" failed`
      )

      + (err.use.thrown ? ' (threw: ' + err.use.thrown.message + ')' : '.')
  }
  else {
    err.text = text
      .replace(/\$VALUE/g, valstr)
      .replace(/\$PATH/g, err.path)
  }

  return err
}


// Convert Node to JSON suitable for Shape.build.
function node2json(n: Node<any>): any {
  let t = n.t

  const fixed: any = {
    number: S.Number,
    string: S.String,
    boolean: S.Boolean,
  }


  if (fixed[t]) {
    let s = ''

    if (n.r) {
      s += fixed[t]
    }

    if ('' === s) {
      s = JSON.stringify(n.v)
    }

    s += n.b.map((v: any) => v.s ? ('.' + v.s(n)) : '').join('')

    return s
  }
  else if (S.any === t) {
    let s = ''

    if (n.r) {
      s += S.Required
    }

    if (S.any == n.c?.t) {
      s += ('' === s ? '' : '.') + S.Open
    }

    s += n.b.map((v: any) => v.s ? ('.' + v.s(n)) : '').join('')

    if (s.startsWith('.')) {
      s = s.slice(1)
    }

    if ('' === s) {
      s = S.Any
    }

    return s
  }
  else if (S.check === t) {
    let s = ''

    // Required is implicit with Check

    s += n.b.map((v: any) => v.s ? ('.' + v.s(n)) : '').join('')

    if (s.startsWith('.')) {
      s = s.slice(1)
    }

    return s
  }
  else if (S.object === t) {
    let o: any = {}
    for (let k in n.v) {
      o[k] = node2json(n.v[k])
    }

    if (undefined !== n.c) {
      if (fixed[n.c.t]) {
        o.$$ = S.Child + '(' + fixed[n.c.t] + ')'
      }
      else if ('any' === n.c.t) {
        o.$$ = S.Open
      }
      else {
        o.$$ = S.Child + '($$child)'
        o.$$child = node2json(n.c)
      }
    }

    if (0 < n.b.length) {
      if (undefined === o.$$) {
        o.$$ = ''
      }
      o.$$ += n.b.map((v: any) => v.s ? ('.' + v.s(n)) : '').join('')
      if (o.$$.startsWith('.')) {
        o.$$ = o.$$.slice(1)
      }
    }

    // naturalize, since `Child(Number)` implies `Child(Number,{})`
    if (o.$$ && 1 === Object.keys(o).length && o.$$.startsWith(S.Child)) {
      return o.$$
    }
    return o
  }
  else if (S.list === t) {
    let refs: any = {}
    let rI = 0
    let list = n.u.list
      .map((n: any) => node2json(n))
      .map((n: any, _: any) => S.object === typeof n ? (refs[_ = '$$ref' + (rI++)] = n, _) : n)
    let s = (n.b[0].n || n.b[0].name) + '(' + list.join(',') + ')'
    return 0 === rI ? s : { $$: s, ...refs }
  }
  else if (S.array === t) {
    let a: any[] = []
    if (undefined !== n.c) {
      a[0] = node2json(n.c)
    }
    else {
      a = Object.keys(n.v)
        .reduce((a: any[], i: any) => (a[+i] = n.v[i], a), [])
        .map((n: any) => node2json(n))
    }
    return a
  }
  else if (S.regexp === t) {
    return n.v.toString()
  }
}


function stringify(
  src: any,
  dequote?: boolean,
  expand?: boolean,
  ignore?: { key?: (string | RegExp)[], val?: (string | RegExp)[] },
  replacer?: any,
) {
  let str: string

  const use_node2str = !expand &&
    !!(src && src.$) && (SHAPE$ === src.$.shape$ || true === (src.$ as any).shape$)

  if (use_node2str) {
    src = JSON.stringify(node2json(src))
    if (dequote) {
      src = 'string' === typeof src ? src.replace(/\\/g, '').replace(/"/g, '') : ''
    }
    return src
  }


  try {
    str = JS(src, (key: any, val: any) => {
      if (replacer) {
        val = replacer(key, val)
      }

      if (
        ignore?.key?.reduce((a, n) =>
          (a ? a : n === key || key.match(n)), false)
        ||
        ignore?.val?.reduce((a, n) =>
          (a ? a : n === val || key.match(n)), false)
      ) {
        val = undefined
      }
      else if (
        null != val &&
        S.object === typeof (val) &&
        val.constructor &&
        S.Object !== val.constructor.name &&
        S.Array !== val.constructor.name
      ) {

        let strdesc = toString.call(val)
        if ('[object RegExp]' === strdesc) {
          val = val.toString()
        }
        else {
          val =
            S.function === typeof val.toString ? val.toString() : val.constructor.name
        }

      }
      else if (!expand && SHAPE$ === val?.$?.shape$) {
        if ('number' === val.t || 'string' === val.t || 'boolean' === val.t) {
          val = val.v
        }
        else {
          val = node2json(val)
          val = JSON.stringify(val)
          if (dequote) {
            val = 'string' === typeof val ? val.replace(/\\/g, '').replace(/"/g, '') : ''
          }
        }
      }
      else if (S.function === typeof (val)) {
        if (S.function === typeof ((shapify as any)[val.name]) && isNaN(+key)) {
          val = undefined
        }
        else if (ignore?.val?.reduce((a, n) =>
          (a ? a : n === val.name || val.name.match(n)), false)) {
          val = undefined
        }
        else if (null != val.name && '' !== val.name) {
          val = val.name
        }
        else {
          val = truncate(val.toString().replace(/[ \t\r\n]+/g, ' '))
        }
      }
      else if ('bigint' === typeof (val)) {
        val = String(val.toString())
      }
      else if (Number.isNaN(val)) {
        val = 'NaN'
      }
      else if (true !== expand &&
        (true === val?.$?.shape$ || SHAPE$ === val?.$?.shape$)) {
        val = JSON.stringify(node2json(val))
      }

      return val
    })

    str = String(str)
  }
  catch (e: any) {
    str = JS(String(src))
  }

  if (true === dequote) {
    str = str.replace(/^"/, '').replace(/"$/, '')
  }

  return str
}


function clone(x: any) {
  if (null == x || S.object !== typeof x) return x
  if (isarr(x)) return x.slice()
  if (x instanceof RegExp) return new RegExp(x.source, x.flags)
  if (x instanceof Date) return new Date(x.getTime())
  const out: any = {}
  for (const k in x) {
    if (x.hasOwnProperty(k)) out[k] = x[k]
  }
  return out
}


const G$ = (node: any): Node<any> => nodize({
  ...node,
  $: { shape$: true }
})


const BuilderMap = {
  Above,
  After,
  All,
  Any,
  Before,
  Below,
  Check,
  Child,
  Closed,
  Default,
  Define,
  Empty,
  Exact,
  Fault,
  Func,
  Ignore,
  Key,
  Len,
  Max,
  Min,
  Never,
  One,
  Open,
  Optional,
  Refer,
  Rename,
  Required,
  Skip,
  Some,
  Rest,
  Type,
}


// Fix builder names after terser mangles them.
/* istanbul ignore next */
if (S.undefined !== typeof (window)) {
  for (let builderName in BuilderMap) {
    defprop((BuilderMap as any)[builderName], S.name, { value: builderName })
  }
}


Object.assign(shapify, {
  Shape: shapify,

  // Builders by name, allows `const { Open } = Shape`.
  ...BuilderMap,

  // Builders by alias, allows `const { GOpen } = Shape`, to avoid naming conflicts.
  ...(Object.entries(BuilderMap).reduce((a: any, n) =>
    (a['G' + n[0]] = n[1], a), {})),

  isShape: (v: any) => (v && SHAPE === v.shape),

  G$,
  buildize,
  makeErr,
  stringify,
  truncate,
  nodize,
  expr,
  build,
  MakeArgu,
})


type ShapeShape = ReturnType<typeof shapify> &
{
  valid: <D, S>(root?: D, ctx?: any) => root is (D & S),
  match: (root?: any, ctx?: any) => boolean,
  error: (root?: any, ctx?: Context) => ShapeError[],
  spec: () => any,
  node: () => Node<any>,
  isShape: (v: any) => boolean,
  shape: typeof SHAPE
}



type Shape = typeof shapify & typeof BuilderMap & {
  G$: typeof G$,
  buildize: typeof buildize,
  makeErr: typeof makeErr,
  stringify: typeof stringify,
  truncate: typeof truncate,
  nodize: typeof nodize,
  expr: typeof expr,
  build: typeof build,
  MakeArgu: typeof MakeArgu,
}

defprop(shapify, S.name, { value: S.shape })


// The primary export.
const Shape: Shape = (shapify as Shape)


// "G" Namespaced builders for convenient use in case of conflicts.
const GAbove = Above
const GAfter = After
const GAll = All
const GAny = Any
const GBefore = Before
const GBelow = Below
const GCheck = Check
const GChild = Child
const GRest = Rest
const GClosed = Closed
const GDefault = Default
const GDefine = Define
const GEmpty = Empty
const GExact = Exact
const GFault = Fault
const GFunc = Func
const GIgnore = Ignore
const GKey = Key
const GLen = Len
const GMax = Max
const GMin = Min
const GNever = Never
const GOne = One
const GOpen = Open
const GOptional = Optional
const GRefer = Refer
const GRename = Rename
const GRequired = Required
const GSkip = Skip
const GSome = Some
const GType = Type


type args = any[] | IArguments

type Argu = (
  args: args | string,
  whence: string | Record<string, any>,
  spec?: Record<string, any>
) => (typeof args extends string ? ((args: args) => Record<string, any>) : Record<string, any>)


function MakeArgu(name: string): Argu {

  // TODO: caching, make arguments optionals
  return function Argu(
    args: args | string,
    whence: string | Record<string, any>,
    argSpec?: Record<string, any>
  ) {
    let partial = false
    if (S.string === typeof args) {
      partial = true
      argSpec = (whence as Record<string, any>)
      whence = (args as string | Record<string, any>)
    }

    argSpec = argSpec || (whence as Record<string, any>)
    whence = S.string === typeof whence ? ' (' + whence + ')' : ''
    const shape = Shape(argSpec, { name: name + whence })

    const top = shape.node()

    const keys = top.k
    let inargs = args
    let argmap: any = {}
    let kI = 0
    let skips = 0

    for (; kI < keys.length; kI++) {
      let kn = top.v[keys[kI]]

      // Skip in arg shape means a literal skip,
      // shifting all following agument elements down.
      if (kn.p) {
        // if (0 === kI) {
        kn = top.v[keys[kI]] =
          ((kI) => After(function Skipper(
            _val: any,
            update: Update,
            state: State
          ) {
            if (0 < state.curerr.length) {
              skips++

              for (let sI = keys.length - 1;
                sI > kI;
                sI--) {

                // Subtract kI as state.pI has already advanced kI along val list.
                // If Rest, append to array at correct position.
                if (top.v[keys[sI]].m.rest) {
                  argmap[keys[sI]]
                    .splice(top.v[keys[sI]].m.rest_pos + kI - sI, 0,
                      argmap[keys[sI - 1]])
                }
                else {
                  state.vals[state.pI + sI - kI] = state.vals[state.pI + sI - kI - 1]
                  argmap[keys[sI]] = argmap[keys[sI - 1]]
                }

              }

              update.uval = undefined
              update.done = false
            }

            return true
          }, kn))(kI)
        kn.e = false
      }

      if (kI === keys.length - 1 && !top.v[keys[kI]].m.rest) {
        top.v[keys[kI]] = After(function ArgCounter(
          _val: any,
          update: Update,
          state: State
        ) {
          if ((keys.length - skips) < inargs.length) {
            if (0 === state.curerr.length) {
              update.err =
                `Too many arguments for type signature ` +
                `(was ${inargs.length}, expected ${keys.length - skips})`
            }
            update.fatal = true
            return false
          }
          return true
        }, top.v[keys[kI]])
      }
    }

    function buildArgMap(args: args) {
      for (let kI = 0; kI < keys.length; kI++) {
        let kn = top.v[keys[kI]]
        if (kn.m.rest) {
          argmap[keys[kI]] = [...args].slice(kI)
          kn.m.rest_pos = argmap[keys[kI]].length
        }
        else {
          argmap[keys[kI]] = args[kI]
        }
      }
      return argmap
    }

    return partial ?
      function PartialArgu(args: args) {
        inargs = args
        argmap = {}
        kI = 0
        skips = 0
        return shape(buildArgMap(args))
      } :
      shape(buildArgMap((args as args)))
  }
}


/* Type inference test
let s0 = { x: Number }

let g0 = Shape(s0)
let g1 = Shape(Required(s0))
let g2 = Shape(Open(s0))
let g3 = Shape(Required(Open(s0)))
let g4 = Shape(Required(Open(Min(2, s0))))

let v0 = { x: 1 }

let o0 = g0(v0)
let o1 = g1(v0)
let o2 = g2(v0)



console.log(o0, o0.x, o1, o1.x, o2, o2.x)


let v1 = { x: 1, y: 2 }
let o3 = g2(v1)
let o4 = g3(v1)
let o5 = g4(v1)

console.log(o3, o3.x, o3.y, o4, o4.x, o4.y, o5, o5.x, o5.y)


type Pass<Vx> = {
  foo: number
  bar: number
  v: any
}


function buildFinal<Sx>(s: Sx) {
  return function final<Vx>(p: Pass<Vx>): Vx & Sx {
    p.v.foo = p.foo
    p.v.bar = p.bar
    return p.v
  }
}

function Foo<Vx>(p: Pass<Vx>, v?: Vx): Pass<Vx> {
  p.v = v || p.v
  p.foo = 1
  return p
}

function Bar<Vx>(p: Pass<Vx>, v?: Vx): Pass<Vx> {
  p.v = v || p.v
  p.bar = 2
  return p
}


let a = { x: 1 }
let s = { x: -1, foo: -1, bar: -1 }
let final = buildFinal(s)

let p0 = { foo: 0, bar: 0, v: null }
let f0 = final(Bar(Foo(p0, a)))

console.log(f0.x, f0.foo, f0.bar)
*/

export type {
  Validate,
  Update,
  Context,
  Builder,
  Node,
  State,
  ShapeShape,
}

export {
  Shape,
  G$,
  nodize,
  buildize,
  makeErr,
  stringify,
  truncate,
  expr,
  MakeArgu,
  build,

  Above,
  After,
  All,
  Any,
  Before,
  Below,
  Check,
  Child,
  Closed,
  Default,
  Define,
  Empty,
  Exact,
  Fault,
  Func,
  Ignore,
  Key,
  Len,
  Max,
  Min,
  Never,
  One,
  Open,
  Optional,
  Refer,
  Rename,
  Required,
  Skip,
  Some,
  Type,
  Rest,

  GAbove,
  GAfter,
  GAll,
  GAny,
  GBefore,
  GBelow,
  GCheck,
  GChild,
  GClosed,
  GDefault,
  GDefine,
  GEmpty,
  GExact,
  GFault,
  GFunc,
  GIgnore,
  GKey,
  GLen,
  GMax,
  GMin,
  GNever,
  GOne,
  GOpen,
  GOptional,
  GRefer,
  GRename,
  GRequired,
  GSkip,
  GSome,
  GType,
  GRest,
}


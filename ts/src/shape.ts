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
const VERSION = '11.1.0'

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

// The children of an object or array node, as the walk needs them, compiled
// on the node's first visit and reused after: the object's keys in the order
// they were first seen with their nodes, or the array's fixed element nodes.
// Kept off the node itself so nothing leaks into its spec or its JSON.
// A compiled child list: the keys, their nodes, and for each the leaf fast
// path it may take (see fastKind; 0 when it may not).
type Compiled = { keys: string[], nodes: Node<any>[], fast: number[] }
const COMPILED = new WeakMap<object, Compiled>()

// Child shapes (Child, Rest, a one-element array) normalized to their full
// depth once; a later visit only refreshes the depth.
const DEEP = new WeakSet<object>()

// The inline check a child may take in place of a full visit: a String,
// Number, Boolean or Integer with no befores or afters. A present value that
// passes the kind's whole check (the empty string, NaN and fraction rules
// included) needs no frame; anything else takes the general path. An object
// takes it for all of its children or none: a custom validator on one child
// may read the frames of its siblings (the argument parser does), so a
// sibling of a validator is always given a frame.
const FAST_STRING = 1
const FAST_NUMBER = 2
const FAST_BOOLEAN = 3
const FAST_INTEGER = 4
function fastKind(cn: Node<any>): number {
  if (0 < cn.b.length || 0 < cn.a.length) return 0
  return S.string === cn.t ? FAST_STRING :
    S.number === cn.t ? FAST_NUMBER :
      S.boolean === cn.t ? FAST_BOOLEAN :
        S.integer === cn.t ? FAST_INTEGER : 0
}

function fastValid(f: number, cv: any): boolean {
  const tv = typeof cv
  return FAST_STRING === f ? (S.string === tv && '' !== cv) :
    FAST_NUMBER === f ? (S.number === tv && cv === cv) :
      FAST_BOOLEAN === f ? S.boolean === tv :
        (S.number === tv && Number.isInteger(cv))
}

function childNode(c: any, depth: number): Node<any> {
  if (null != c && DEEP.has(c)) {
    c.d = depth
    return c
  }
  const node = nodizeDeep(c, depth)
  DEEP.add(node)
  return node
}


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
  'date' |      // A Date instance.
  'function' |  // A function.
  'integer' |   // A number with no fractional part.
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
  readonly __v?: V        // The spec type, for inference only; never set.
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
    a?: readonly any[] // args to the builder
    n?: string // name of builder
  }


// The value a spec produces, by type. A builder's node carries the spec it
// was given (or the type it stands for), so the result is read through it;
// a type marker is its primitive; a literal is itself; a one-element array
// is an array of that element and a longer one a tuple; an object maps its
// properties, with a key expression ("a: Min(2)") reduced to its name.
type IsAny<T> = 0 extends (1 & T) ? true : false

// The runtime grammar (KEY_EXPR_RE): optional whitespace, a quoted or a
// whitespace-free name, a colon, then a non-empty expression; anything else
// is a plain key.
type Trim<S extends string> =
  S extends ` ${infer R}` ? Trim<R> : S extends `${infer R} ` ? Trim<R> : S

type KeyName<K> =
  K extends string ? (
    Trim<K> extends `"${infer Q}":${infer E}` ? ('' extends Trim<E> ? K : Q) :
    Trim<K> extends `${infer N}:${infer E}` ?
    (N extends `${string} ${string}` ? K : '' extends Trim<E> ? K : N) :
    K
  ) : K

// A result object keeps the input's own extra properties; a property the
// spec declares is the spec's (Coerce turns a string into a number).
type Produced<V, R> =
  IsAny<V> extends true ? R :
  R extends readonly any[] ? R :
  R extends object ? (V extends object ? Omit<V, keyof R> & R : R) :
  R

// A builder used bare (`{ n: Integer }`) carries the type it stands for. The
// brand's key is a symbol this module does not export, so nothing can read
// it at runtime.
declare const BARE: unique symbol
type Bare<R> = { readonly [BARE]: R }

// An Exact value list: its literals are the result, not their widened kinds.
type Literal<L> = { readonly literal$: L }

type ShapeResult<T> =
  IsAny<T> extends true ? any :
  T extends Literal<infer L> ? L :
  T extends Node<infer V> ? ShapeResult<V> :
  T extends StringConstructor ? string :
  T extends NumberConstructor ? number :
  T extends BooleanConstructor ? boolean :
  T extends DateConstructor ? Date :
  T extends ArrayConstructor ? any[] :
  T extends ObjectConstructor ? any :
  T extends FunctionConstructor ? Function :
  T extends SymbolConstructor ? symbol :
  T extends 'String' | 'string' ? string :
  T extends 'Number' | 'number' | 'Integer' | 'integer' ? number :
  T extends 'Boolean' | 'boolean' ? boolean :
  T extends 'Date' | 'date' ? Date :
  T extends 'Array' | 'array' ? any[] :
  T extends 'Object' | 'object' | 'Function' | 'function' | 'Symbol' | 'symbol' ? any :
  T extends RegExp ? string :
  T extends Date ? Date :
  T extends readonly [] ? any[] :
  T extends readonly [infer E] ? ShapeResult<E>[] :
  T extends readonly any[] ? { -readonly [K in keyof T]: ShapeResult<T[K]> } :
  T extends Bare<infer R> ? R :
  T extends (this: any, ...args: any[]) => Node<any> ? any :
  T extends (...args: any[]) => any ? T :
  T extends { [key: string]: any } ? { -readonly [K in keyof T as KeyName<K>]: ShapeResult<T[K]> } :
  T extends string ? string :
  T extends number ? number :
  T extends boolean ? boolean :
  T


// Brand a builder with the type it stands for when used bare.
function bare<R>() {
  return <F>(f: F): F & Bare<R> => f as F & Bare<R>
}


// The result type an algebra builder produces from a spec type.
type Names<N> = N extends string ? N : N extends readonly (infer S)[] ? S : never

type PickResult<V, N> = { [K in keyof V as KeyName<K> extends Names<N> ? K : never]: V[K] }

type OmitResult<V, N> = { [K in keyof V as KeyName<K> extends Names<N> ? never : K]: V[K] }

type ExtendResult<V, E> =
  { [K in keyof V as KeyName<K> extends KeyName<keyof E> ? never : K]: V[K] } & E


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
  integer: 'integer',
  date: 'date',

  String: 'String',
  Number: 'Number',
  Boolean: 'Boolean',
  Object: 'Object',
  Array: 'Array',
  Symbol: 'Symbol',
  Function: 'Function',
  Integer: 'Integer',
  Date: 'Date',
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
  Nullable: 'Nullable',
  Catch: 'Catch',
  Coerce: 'Coerce',
  Describe: 'Describe',
  Discriminated: 'Discriminated',
  Pick: 'Pick',
  Omit: 'Omit',
  Partial: 'Partial',
  Extend: 'Extend',
  DateTime: 'DateTime',
  Email: 'Email',
  Ip: 'Ip',
  Ipv4: 'Ipv4',
  Ipv6: 'Ipv6',
  Url: 'Url',
  Uuid: 'Uuid',
  Len: 'Len',
  One: 'One',
  Open: 'Open',
  Optional: 'Optional',
  Refer: 'Refer',
  Rename: 'Rename',
  Required: 'Required',
  Skip: 'Skip',
  Transform: 'Transform',
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
  [S.Date]: Date,
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

  // The last parent object seen and whether it was frozen (see next).
  lastParent: any = undefined
  lastFrozen: boolean = false

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
    // Only objects|arrays can be nodes, so a number is a back pointer (a
    // zero or the end of the stack stops the walk below).
    let nextNode = this.nodes[this.pI]

    // See note for path below.
    this.ancestors[this.dI] = this.node

    while (S.number === typeof nextNode && 0 !== nextNode) {
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

    // A frozen parent is copied so its children can be written; siblings
    // share a parent, so the check runs once per parent object.
    const parent = this.parents[this.pI]
    if (parent !== this.lastParent) {
      this.lastParent = parent
      this.lastFrozen = Object.isFrozen(parent)
    }
    if (this.lastFrozen) {
      this.parents[this.pI] = { ...parent }
    }
    this.parent = this.parents[this.pI]

    this.nextSibling = true

    this.type = this.node.t

    // NOTE: this is always correct for the current node, up to dI, because
    // previous values at dI get overwritten. Avoids need to duplicate on each descent.
    // ancestors uses same approach.
    this.path[this.dI] = this.key

    this.oval = this.val

    if (0 < this.curerr.length) {
      this.curerr = []
    }
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
  pathArr: (string | number)[] // Key path as array (numeric array indices as numbers).
  why: string                // Error code ("why").
  check: string              // Check function name.
  args: Record<string, any>  // Builder args.
  mark: number               // Error mark for debugging.
  text: string               // Error message text.
  use: any                   // User custom info.
}


// Standard Schema V1 interop types (vendored from https://standardschema.dev/).
// Kept inline to avoid adding a runtime/type dependency.

type StandardSchemaV1Issue = {
  readonly message: string
  readonly path?: ReadonlyArray<PropertyKey | StandardSchemaV1PathSegment>
}

type StandardSchemaV1PathSegment = {
  readonly key: PropertyKey
}

type StandardSchemaV1Result<Output> =
  | StandardSchemaV1SuccessResult<Output>
  | StandardSchemaV1FailureResult

type StandardSchemaV1SuccessResult<Output> = {
  readonly value: Output
  readonly issues?: undefined
}

type StandardSchemaV1FailureResult = {
  readonly issues: ReadonlyArray<StandardSchemaV1Issue>
}

type StandardSchemaV1Types<Input = unknown, Output = Input> = {
  readonly input: Input
  readonly output: Output
}

type StandardSchemaV1Props<Input = unknown, Output = Input> = {
  readonly version: 1
  readonly vendor: string
  readonly validate: (
    value: unknown
  ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>
  readonly types?: StandardSchemaV1Types<Input, Output>
}

type StandardSchemaV1<Input = unknown, Output = Input> = {
  readonly '~standard': StandardSchemaV1Props<Input, Output>
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
  Date: true,
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
  integer: 0,
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

  // A bare builder reference (`{ a: Any }`) means that builder applied to
  // nothing. Without this it falls through to the class-instance branch below
  // and becomes an `instanceof` check that can never pass.
  if (S.function === typeof shape && true === (shape as any).nullary$) {
    shape = shape()
  }

  // Is this a (possibly incomplete) Node<S>?
  if (null != shape && shape.$?.shape$) {

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
      else if ('[object Date]' === strdesc) {
        t = (S.date as ValType)
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
function shapify<const S>(intop?: S, inopts?: ShapeOptions) {
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

    // A log callback is called for every node, so nothing is skipped for it.
    const fastOk = !s.ctx.log

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

        // Nullable: an explicit null is accepted as the value.
        if (null === s.val && n.u.nullable) {
          s.ctx.log && s.ctx.log('kv', s)
        }

        else if (S.never === s.type) {
          s.curerr.push(makeErrImpl(S.never, s, 1070))
        }

        // Handle objects.
        else if (S.object === s.type) {
          let val

          if (undefined !== n.c) {
            n.c = childNode(n.c, 1 + s.dI)
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

            // The container is the wrong type, so its declared keys are
            // meaningless. Descending would add a spurious "is required" error
            // for every one of them on top of the real type error.
            descend = false
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
              let start = s.nI
              const compiled = COMPILED.get(n)

              if (undefined !== compiled) {
                // Compiled on an earlier visit: the children in first-seen
                // order, no key expressions or meta keys left to read.
                const ckeys = compiled.keys
                const cnodes = compiled.nodes
                const cfast = compiled.fast
                if (0 < ckeys.length) {
                  s.pI = start
                  for (let kI = 0; kI < ckeys.length; kI++) {
                    const rk = ckeys[kI]
                    const cv = val[rk]
                    if (fastOk && 0 !== cfast[kI] && fastValid(cfast[kI], cv)) {
                      // A validator attached since the compile keeps its frame.
                      const cn = cnodes[kI]
                      if (0 === cn.b.length && 0 === cn.a.length) {
                        continue
                      }
                    }
                    s.nodes[s.nI] = cnodes[kI]
                    s.vals[s.nI] = cv
                    s.parents[s.nI] = val
                    s.keys[s.nI] = rk
                    s.nI++
                  }
                  hasKeys = start < s.nI
                }
              }
              else {
              let vkeys = keys(n.v)
              let knownKeys = new Set(n.k)

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
                    if (m && '' !== m[3]) {
                      rk = keyExprName(m[1])
                      let src = m[3]

                      ov = keyExprNode(src, ov, 1 + s.dI, meta)
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

              // Every key is now a node under its final name, so later
              // visits can take the compiled list. Value expressions read
              // the ancestors at validation time, so they stay uncompiled.
              if (!optsvalexpr.active) {
                COMPILED.set(n, {
                  keys: n.k.slice(),
                  nodes: n.k.map((k: string) => n.v[k]),
                  fast: n.k.some((k: string) => 0 < n.v[k].b.length || 0 < n.v[k].a.length) ?
                    n.k.map(() => 0) : n.k.map((k: string) => fastKind(n.v[k])),
                })
              }
              }

              let extra: string[] | null = null
              let valKeys = keys(val)
              for (let vkI = 0; vkI < valKeys.length; vkI++) {
                if (undefined === n.v[valKeys[vkI]]) {
                  (extra ??= []).push(valKeys[vkI])
                }
              }

              if (null !== extra) {
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

            // The fixed element shapes, compiled on the first visit.
            let compiled = COMPILED.get(n)
            if (undefined === compiled) {
              let elementKeys: string[] = []
              let nvKeys = keys(n.v)
              for (let ekI = 0; ekI < nvKeys.length; ekI++) {
                if (!isNaN(+nvKeys[ekI])) {
                  elementKeys.push(nvKeys[ekI])
                }
              }
              const elementNodes: Node<any>[] = []
              for (let ekI = 0; ekI < elementKeys.length; ekI++) {
                elementNodes.push(n.v[ekI] = nodize(n.v[ekI], 1 + s.dI))
              }
              compiled = { keys: elementKeys, nodes: elementNodes, fast: [] }
              COMPILED.set(n, compiled)
            }
            const elementKeys = compiled.keys
            const elementNodes = compiled.nodes
            let hasFixedElements = 0 < elementKeys.length

            if (hasChildShape) {
              n.c = childNode(n.c, 1 + s.dI)
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
                    let elementShape = elementNodes[elementIndex]
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
                const efast = fastOk ? fastKind(elementShape) : 0
                for (; elementIndex < s.val.length; elementIndex++) {
                  if (0 !== efast && fastValid(efast, s.val[elementIndex])) {
                    continue
                  }
                  s.nodes[s.nI] = elementShape
                  s.vals[s.nI] = s.val[elementIndex]
                  s.parents[s.nI] = s.val
                  s.keys[s.nI] = '' + elementIndex
                  s.nI++
                }
              }

              if (!s.ignoreVal && s.pI < s.nI) {
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
          (S.null === s.type && null === s.val) ||
          (S.integer === s.type && S.number === s.valType && Number.isInteger(s.val)) ||
          (S.date === s.type && s.val instanceof Date && !isNaN(s.val.getTime()))
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

      if (0 < s.curerr.length && (s.node.e || fatal)) {
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


  // The produced value: the spec's result, keeping the input's own extra
  // properties when both are objects.
  const shape =
    <V>(root?: V, ctx?: Context): Produced<V, ShapeResult<S>> => {
      return (exec(root, ctx, false))
    }

  function valid<V>(root?: V, ctx?: Context): root is (V & ShapeResult<S>) {
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

  // JSON Schema (draft 2020-12) for the values this shape accepts.
  shape.jsonSchema = () => jsonSchema(shape.node())


  shape.toString = function(this: any) {
    desc = '' === desc ? this.stringify() : desc
    return `[Shape ${opts.name} ${truncate(desc)}]`
  }

  if (inspect && inspect.custom) {
    (shape as any)[inspect.custom] = shape.toString
  }

  shape.shape = SHAPE

  // Standard Schema V1 interop (https://standardschema.dev/).
  ;(shape as any)['~standard'] = {
    version: 1,
    vendor: 'shape',
    validate(value: unknown) {
      const sctx: Context = { err: [] }
      const out = exec(value, sctx, false)
      const errs = sctx.err as ErrDesc[]
      if (0 === errs.length) {
        return { value: out }
      }
      return {
        issues: errs.map((e: ErrDesc) => ({
          message: e.text,
          path: e.pathArr,
        })),
      }
    },
  }

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


// The property name of a key expression. A name may be quoted to hold a
// space, a colon or an escaped quote: `{ '"a b": Min(1)': 0 }` declares the
// property "a b", and `{ '"a\\"b": Min(1)': 0 }` the property a"b.
function keyExprName(name: string): string {
  if (2 <= name.length && '"' === name[0] && '"' === name[name.length - 1]) {
    try {
      return JP(name)
    }
    catch (_e: any) {
      return name.substring(1, name.length - 1)
    }
  }
  return name
}


// Build the node for a key expression such as `{ 'a: Optional(Number)': 5 }`.
//
// expr() splices the example value in as the innermost builder call's last
// argument. Where that lands in a shape slot the builder reads, it does the
// right thing: `Min(2)` becomes `Min(2, 5)` and takes the example's kind and
// default, `Child(Number)` becomes `Child(Number, [])` and becomes an array.
// But a builder whose arity is already satisfied drops it silently —
// `Optional(Number, 5)` ignores the 5 and injects the Number token's 0 — and
// the example is the author's stated default, so it should survive.
//
// Building both ways tells the two apart: if the example made no difference to
// the node, the builder ignored it, and it is applied as the value/default
// instead. The kind is left alone, since only the builder knows whether it
// declared one or merely defaulted to it.
function keyExprNode(src: string, example: any, depth: number, meta?: NodeMeta) {
  const node: any = expr({ src, d: depth, meta }, example)

  if (undefined === example || null == node || !node.$?.shape$) {
    return node
  }

  let bare: any
  try {
    bare = expr({ src, d: depth, meta })
  }
  catch (_e: any) {
    // The expression cannot be built without the example — Pick(["a"]) has
    // nothing to pick from — so the example plainly made a difference.
    return node
  }

  if (null == bare || !bare.$?.shape$ || !sameShapeNode(node, bare)) {
    return node
  }

  const ex: any = nodize(example, depth, meta)

  node.v = ex.v
  node.f = ex.f
  node.n = null != ex.v && S.object === typeof (ex.v) ? keys(ex.v).length : 0

  return node
}


// Structural comparison of the parts of a node a key expression's example
// could have influenced.
function sameShapeNode(x: any, y: any): boolean {
  return x.t === y.t &&
    x.r === y.r &&
    x.p === y.p &&
    x.b.length === y.b.length &&
    x.a.length === y.a.length &&
    JSON.stringify(x.v) === JSON.stringify(y.v) &&
    JSON.stringify(x.f) === JSON.stringify(y.f) &&
    JSON.stringify(x.c) === JSON.stringify(y.c)
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
    let patha = patharr(s)

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
            e.pathArr = null == e.pathArr ? patha : e.pathArr
            e.mark = null == e.mark ? 2010 : e.mark
            s.curerr.push(e)
          }
        }
      } else if (null != errsrc) {
        ;(errsrc as any).path = null == (errsrc as any).path ? path : (errsrc as any).path
        ;(errsrc as any).pathArr = null == (errsrc as any).pathArr ? patha : (errsrc as any).pathArr
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
  let out = null == s.ctx.path$ ? '' : s.ctx.path$.join('.')
  for (let i = 1; i <= s.dI; i++) {
    const p = s.path[i]
    if (null != p) {
      if (out.length > 0) out += '.'
      out += p
    }
  }
  return out
}


// Create an array form of the property path. Numeric entries for array
// element indices are emitted as numbers; object keys remain strings.
function patharr(s: State): (string | number)[] {
  const out: (string | number)[] = null == s.ctx.path$ ? [] : s.ctx.path$.slice()
  for (let i = 1; i <= s.dI; i++) {
    const p = s.path[i]
    if (null != p) {
      const parentNode = s.ancestors[i - 1]
      out.push(parentNode && S.array === parentNode.t ? Number(p) : p)
    }
  }
  return out
}


// A bound on a number or a date compares the value itself; anything else is
// measured by its length or key count.
const isNumeric = (val: any) => S.number === typeof (val) || val instanceof Date


function valueLen(val: any) {
  return S.number === typeof (val) ? val :
    S.number === typeof (val?.length) ? val.length :
      val instanceof Date ? val.getTime() :
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
const Required = function <V = any>(this: any, shape?: Node<V> | V): Node<V> {
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
const Open = function <V = any>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.c = Any()
  return node
}


// Value is optional.
const Optional = function <V = any>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.r = false

  // Handle an explicit undefined.
  if (undefined === shape && 1 === arguments.length) {
    node.t = (S.undefined as ValType)
    node.v = undefined
  }
  return node
}


// Strict ISO 8601 / RFC 3339 date-time: the one form both implementations parse
// identically. Calendar ranges are checked so that 2024-02-30 is rejected
// rather than rolled over into March.
const ISO_DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/

function isoDateTime(s: string): boolean {
  const m = ISO_DATETIME_RE.exec(s)
  if (null == m) {
    return false
  }

  const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], sec = +m[6]
  if (mo < 1 || 12 < mo || 23 < h || 59 < mi || 59 < sec) {
    return false
  }

  const leap = (0 === y % 4 && 0 !== y % 100) || 0 === y % 400
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]
  if (d < 1 || days < d) {
    return false
  }

  if ('Z' !== m[8] && (23 < +m[8].substring(1, 3) || 59 < +m[8].substring(4, 6))) {
    return false
  }

  return true
}


// Decimal numeric strings only: no hex, no Infinity, nothing JS's Number()
// would accept that a Go strconv would not.
const NUMERIC_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/


// The value a Coerce node converts to for kind t, or undefined to leave it as
// it is (and let the type check report it).
function coerceTo(t: string, val: any): any {
  const vt = typeof val

  if (S.number === t || S.integer === t) {
    if (S.string === vt) {
      const str = val.trim()
      return NUMERIC_RE.test(str) && isFinite(Number(str)) ? Number(str) : undefined
    }
    if (S.boolean === vt) {
      return val ? 1 : 0
    }
  }
  else if (S.string === t) {
    if (S.number === vt) {
      return isFinite(val) ? String(val) : undefined
    }
    if (S.boolean === vt) {
      return val ? 'true' : 'false'
    }
  }
  else if (S.boolean === t) {
    if (S.string === vt) {
      const str = val.trim().toLowerCase()
      return 'true' === str || '1' === str ? true :
        'false' === str || '0' === str ? false : undefined
    }
    if (S.number === vt) {
      return 1 === val ? true : 0 === val ? false : undefined
    }
  }
  else if (S.date === t) {
    if (S.string === vt) {
      const str = val.trim()
      return isoDateTime(str) ? new Date(str) : undefined
    }
    if (S.number === vt) {
      return isFinite(val) ? new Date(val) : undefined
    }
  }

  return undefined
}


// Convert the value to the node's kind where the conversion is unambiguous,
// before the type check: a decimal string to a number, "true"/"false"/"1"/"0"
// to a boolean, a number or boolean to a string, an ISO 8601 string or a time
// value to a Date. Anything else is left alone, so the usual type error speaks.
const Coerce = function <V = any>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)

  const coercer: any = function Coerce(val: any, update: Update, state: State) {
    const c = coerceTo(state.node.t, val)
    if (undefined !== c) {
      update.val = c
    }
    return true
  }
  coercer.n = S.Coerce

  // Ahead of any bound, so a bound sees the converted value.
  node.b.unshift(coercer)

  return node
}


// String Formats: Email, Url, Uuid, DateTime, Ip, Ipv4, Ipv6
// ==========================================================
// Every pattern here is written so that the JavaScript engine and RE2 agree on
// it: ASCII classes only, no lookaround, explicit whitespace.

// A pragmatic RFC 5322 addr-spec: a dot-atom local part of at most 64
// characters, then a dotted domain ending in an alphabetic top-level label,
// 254 characters in all. No quoted local parts, no address literals.
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/

function isEmail(s: string): boolean {
  return s.length <= 254 && s.indexOf('@') <= 64 && EMAIL_RE.test(s)
}


// scheme://[user@]host[:port][/path][?query][#fragment]: an absolute URL with
// a non-empty host and no whitespace. Nothing is decoded or resolved.
const URL_RE =
  /^[A-Za-z][A-Za-z0-9+.-]*:\/\/(?:[^ \t\r\n\/?#@]+@)?(?:\[[0-9A-Fa-f:.]+\]|[^ \t\r\n\/?#@:\[\]]+)(?::\d{1,5})?(?:[\/?#][^ \t\r\n]*)?$/


// 8-4-4-4-12 hex digits; any version, including the nil UUID.
const UUID_RE =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/


// A dotted quad of decimal octets 0-255 without leading zeros.
const IPV4_RE =
  /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

const HEX4_RE = /^[0-9A-Fa-f]{1,4}$/


// RFC 4291 text form: eight 16-bit hex groups, one optional "::" standing for
// a run of zero groups, and optionally a trailing dotted quad in place of the
// last two groups. No zone index and no prefix length.
function isIpv6(s: string): boolean {
  const parts = s.split('::')
  if (2 < parts.length) {
    return false
  }

  const head = '' === parts[0] ? [] : parts[0].split(':')
  const tail = 2 === parts.length && '' !== parts[1] ? parts[1].split(':') : []
  const groups = head.concat(tail)

  let count = 0
  for (let gI = 0; gI < groups.length; gI++) {
    if (HEX4_RE.test(groups[gI])) {
      count++
    }

    // A dotted quad may only end the address, so not ahead of a "::".
    else if (gI === groups.length - 1 && (1 === parts.length || head.length <= gI) &&
      IPV4_RE.test(groups[gI])) {
      count += 2
    }
    else {
      return false
    }
  }

  return 2 === parts.length ? count <= 7 : 8 === count
}


// A format is a before on a string-shaped node. It speaks only once the value
// is known to be present and of the node's kind; otherwise the structural
// check reports the real problem.
function makeFormatBuilder(
  self: any,
  shape: any,
  name: string,
  what: string,
  valid: (str: string) => boolean
) {
  let node = buildize(self, shape)

  // A format is a shape of string, so an untyped node becomes one.
  if (S.any === node.t) {
    Type.call(node, String)
  }

  let validator: any = function(val: any, update: Update, state: State) {
    if (undefined === val || typeWillFail(state)) {
      return true
    }
    if (S.string === typeof val && valid(val)) {
      return true
    }
    update.err = makeErr(state,
      S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH + ' is not a valid ' + what + '.',
      name)
    return false
  }

  Object.defineProperty(validator, S.name, { value: name })

  validator.n = name
  validator.s = () => name

  validator[Symbol.for('nodejs.util.inspect.custom')] = name
  validator.toJSON = () => name

  node.b.push(validator)

  return node
}


const Email = bare<string>()(function Email <V = string>(this: any, shape?: Node<V> | V): Node<V> {
  return makeFormatBuilder(this, shape, S.Email, 'email address', isEmail)
})

const Url = bare<string>()(function Url <V = string>(this: any, shape?: Node<V> | V): Node<V> {
  return makeFormatBuilder(this, shape, S.Url, 'URL', (s) => URL_RE.test(s))
})

const Uuid = bare<string>()(function Uuid <V = string>(this: any, shape?: Node<V> | V): Node<V> {
  return makeFormatBuilder(this, shape, S.Uuid, 'UUID', (s) => UUID_RE.test(s))
})

// The string form of a date-time; the value stays a string. Coerce(Date) is
// the one that produces a Date.
const DateTime = bare<string>()(function DateTime <V = string>(this: any, shape?: Node<V> | V): Node<V> {
  return makeFormatBuilder(this, shape, S.DateTime, 'ISO 8601 date-time', isoDateTime)
})

const Ip = bare<string>()(function Ip <V = string>(this: any, shape?: Node<V> | V): Node<V> {
  return makeFormatBuilder(this, shape, S.Ip, 'IP address',
    (s) => IPV4_RE.test(s) || isIpv6(s))
})

const Ipv4 = bare<string>()(function Ipv4 <V = string>(this: any, shape?: Node<V> | V): Node<V> {
  return makeFormatBuilder(this, shape, S.Ipv4, 'IPv4 address', (s) => IPV4_RE.test(s))
})

const Ipv6 = bare<string>()(function Ipv6 <V = string>(this: any, shape?: Node<V> | V): Node<V> {
  return makeFormatBuilder(this, shape, S.Ipv6, 'IPv6 address', isIpv6)
})


// Isolated Validation: Catch, Transform, Ignore
// =============================================
// These builders take the checks a node carries — its befores, its afters —
// inside, and validate the node as a whole (those checks, the structural
// check, every descendant) in a sub-run before the node itself proceeds. Only
// then is the outcome of the entire subtree known: a node's afters run before
// its children are visited, so an after alone cannot see a descendant fail.

type Inner = { b: Validate[], a: Validate[] }

function takeInner(node: Node<any>): Inner {
  const inner = { b: node.b, a: node.a }
  node.b = []
  node.a = []
  return inner
}


// Render the taken checks ahead of the taking builder, so that the shape
// still reads Number.Min(2).Catch(0).
function innerDesc(inner: Inner, n: Node<any>): string {
  return inner.b.concat(inner.a).map((v: any) => v.s ? v.s(n) + '.' : '').join('')
}


const probeShapes = new WeakMap<Inner, { top: any, exec: any }>()

// Validate the node as it stands, with the taken checks, in isolation. Errors
// are collected, with their full paths, rather than thrown; Define names are
// shared with the run that is probing.
function probeNode(state: State, inner: Inner, val: any): { out: any, errs: ErrDesc[] } {
  // Errors must be observable, so the probe is never silent (Ignore's e).
  let ps = probeShapes.get(inner)
  if (undefined === ps) {
    const top: any = { ...state.node, b: inner.b, a: inner.a, e: true }
    ps = { top, exec: shapify(top) }
    probeShapes.set(inner, ps)
  }
  else {
    // The node may have been wrapped further since (Optional, Default, ...).
    Object.assign(ps.top, state.node, { b: inner.b, a: inner.a, e: true })
  }

  const errs: ErrDesc[] = []
  const ref = state.ctx.ref = state.ctx.ref || {}
  const out = ps.exec(val, { err: errs, ref, log: state.ctx.log, path$: patharr(state) })
  return { out, errs }
}


// The taken checks and the structural check ran in the probe; the value still
// goes back to the parent, which a lone done would prevent.
const release: Validate = function release(_val: any, update: Update) {
  update.done = false
  return true
}


function jsonText(val: any): string {
  return '' + JSON.stringify(val)
}


// Whatever fails inside is replaced by the fallback, and raises nothing.
const Catch = function <F, V = any>(this: any, fallback: F, shape?: Node<V> | V): Node<V | F> {
  let node = buildize(this, shape)
  const inner = takeInner(node)

  const catcher: any = function Catch(val: any, update: Update, state: State) {
    const { out, errs } = probeNode(state, inner, val)
    update.uval = 0 < errs.length ? clone(fallback) : out
    update.done = true
    return true
  }
  catcher.n = S.Catch
  catcher.a = [fallback]
  catcher.s = (n: Node<any>) => innerDesc(inner, n) + S.Catch + '(' + jsonText(fallback) + ')'
  catcher.inner = inner
  node.b.push(catcher)
  node.a.push(release)

  return node
}


// Replace a valid value with a function of it. An invalid one fails as it
// would have, with the same errors.
const Transform = function <V = any, R = any>(
  this: any,
  transform: (val: ShapeResult<V>, state: State) => R,
  shape?: Node<V> | V
): Node<R> {
  let node = buildize(this, shape)
  const inner = takeInner(node)

  const transformer: any = function Transform(val: any, update: Update, state: State) {
    const { out, errs } = probeNode(state, inner, val)
    if (0 < errs.length) {
      update.err = errs
      return false
    }
    update.uval = transform(out, state)
    update.done = true
    return true
  }
  transformer.n = S.Transform
  transformer.s = (n: Node<any>) => innerDesc(inner, n) + S.Transform
  transformer.inner = inner
  node.b.push(transformer)
  node.a.push(release)

  return node
}


// Attach a description to the node, read back as node.m.description.
const Describe = function <V = any>(this: any, description: string, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.m = node.m || {}
  node.m.description = '' + description
  return node
}


// Discriminated Union
// ===================

// Choose the branch by the value of a tag property, then validate against that
// branch alone, so the errors are its own rather than a list of every
// alternative. An object-shaped branch without the tag property has it added,
// as the literal it is keyed by.
const Discriminated = function <T extends string, B extends Record<string, any>>(
  this: any, tag: T, branches: B
): Node<{ [K in keyof B]: B[K] & { [P in T]: Literal<K> } }[keyof B]> {
  if (S.string !== typeof tag || '' === tag || null == branches ||
    S.object !== typeof branches || isarr(branches) || 0 === keys(branches).length) {
    throw new Error('Shape: Discriminated needs a tag property name and at least one branch')
  }

  let node = buildize(this)
  node.t = (S.list as ValType)
  node.r = true

  const tags = keys(branches).sort()
  const shapes = new Map<string, any>()
  for (const t of tags) {
    const bn = nodize(branches[t])
    if (S.object === bn.t && null != bn.v && undefined === bn.v[tag]) {
      bn.v[tag] = nodize(t)
    }
    shapes.set(t, shapify(bn))
  }
  node.u.list = tags.map((t) => shapes.get(t).node())
  node.u.discriminated = { tag, tags }

  const validator: any = function Discriminated(val: any, update: Update, state: State) {
    // Required or optional is for the structural check to say.
    if (undefined === val) {
      return true
    }

    const tv = null != val && S.object === typeof val && !isarr(val) ? val[tag] : undefined
    if (undefined === tv) {
      update.err = makeErr(state,
        S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
        ' is not an object with a "' + tag + '" property.',
        S.Discriminated)
      return false
    }

    const shape = S.string === typeof tv ? shapes.get(tv) : undefined
    if (undefined === shape) {
      update.err = makeErr(state,
        S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
        ' has unknown "' + tag + '" ' + JSON.stringify(tv) +
        ', expected one of: ' + tags.join(', ') + '.',
        S.Discriminated)
      return false
    }

    const errs: ErrDesc[] = []
    const ref = state.ctx.ref = state.ctx.ref || {}
    const out = shape(val, { err: errs, ref, log: state.ctx.log, path$: patharr(state) })
    if (0 < errs.length) {
      update.err = errs
      return false
    }
    update.val = out
    return true
  }

  validator.n = S.Discriminated
  validator.a = [tag, branches]
  node.b.push(validator)

  return node
}


// Object Algebra
// ==============
// Build a new object shape out of an existing one. The result is a fresh
// node, so the source is left as it was and one base can be reshaped many
// times. Key expressions in the source (`{ 'a: Min(2)': 0 }`) are compiled
// here, since the algebra has to know the real property names.

type Entry = { key: string, child: any }

function objectEntries(n: Node<any>): Entry[] {
  const out: Entry[] = []
  const vkeys = keys(n.v)
  for (let kI = 0; kI < vkeys.length; kI++) {
    const k = vkeys[kI]
    const m = KEY_EXPR_RE.exec(k)
    if (m && '' !== m[3]) {
      out.push({ key: keyExprName(m[1]), child: keyExprNode(m[3], n.v[k], 0) })
    }
    else {
      out.push({ key: k, child: n.v[k] })
    }
  }
  return out
}


// A structural copy of a node: the same settings, with its own value and
// check lists, so that changing the copy leaves the original as it was.
function copyNode(n: Node<any>, over?: Record<string, any>): Node<any> {
  const v = isarr(n.v) ? n.v.slice() :
    (null != n.v && S.object === typeof n.v) ? { ...n.v } : n.v
  const copy = {
    $: SHAPE,
    t: n.t, d: n.d, v, f: n.f, n: n.n, c: n.c, r: n.r, p: n.p, k: [], e: n.e, z: n.z,
    u: { ...n.u }, b: n.b.slice(), a: n.a.slice(), m: { ...n.m },
    ...over,
  } as unknown as Node<any>
  return buildize(copy)
}


function ownprop(o: any, k: string, value: any) {
  defprop(o, k, { value, enumerable: true, writable: true, configurable: true })
}


function objectBase(self: any, shape: any, name: string): Node<any> {
  const base = buildize(self, shape)
  if (S.object !== base.t) {
    throw new Error('Shape: ' + name + ' needs an object shape')
  }
  return base
}


// The base's settings with just these properties. An object default is
// narrowed to them too.
function objectNode(base: Node<any>, entries: Entry[]): Node<any> {
  // Own properties, so that a "__proto__" key is a property and not the
  // prototype.
  const v: any = {}
  for (const e of entries) {
    ownprop(v, e.key, e.child)
  }

  let f = base.f
  if (null != f && S.object === typeof f && !isarr(f)) {
    f = {}
    for (const e of entries) {
      if (undefined !== base.f[e.key]) {
        ownprop(f, e.key, base.f[e.key])
      }
    }
  }

  return copyNode(base, { v, f, n: entries.length })
}


function keyList(names: any, name: string): string[] {
  const list = isarr(names) ? names : [names]
  for (const k of list) {
    if (S.string !== typeof k) {
      throw new Error('Shape: ' + name + ' needs a list of property names')
    }
  }
  return list
}


// Keep only the named properties. Naming one the shape does not declare is
// an error: there is nothing there to pick.
const Pick = function <const N extends string | readonly string[], V = any>(
  this: any, names: N, shape?: Node<V> | V
): Node<PickResult<V, N>> {
  const base = objectBase(this, shape, S.Pick)
  const want = keyList(names, S.Pick)
  const entries = objectEntries(base)
  for (const k of want) {
    if (undefined === entries.find((e) => e.key === k)) {
      throw new Error('Shape: ' + S.Pick + ': unknown property "' + k + '"')
    }
  }
  return objectNode(base, entries.filter((e) => want.includes(e.key)))
}


// Drop the named properties. A name the shape does not declare is simply not
// there to drop.
const Omit = function <const N extends string | readonly string[], V = any>(
  this: any, names: N, shape?: Node<V> | V
): Node<OmitResult<V, N>> {
  const base = objectBase(this, shape, S.Omit)
  const want = keyList(names, S.Omit)
  return objectNode(base, objectEntries(base).filter((e) => !want.includes(e.key)))
}


// Every declared property becomes optional, as Optional would make it: a
// type token then injects its empty value, a literal its own. Shallow: a
// nested object's own properties are as they were.
const Partial = function <V = any>(this: any, shape?: Node<V> | V): Node<V> {
  const base = objectBase(this, shape, S.Partial)
  return objectNode(base, objectEntries(base).map((e) => ({
    key: e.key,
    child: copyNode(nodize(e.child), { r: false }),
  })))
}


// Add the properties of another object shape; a property both declare takes
// the extension's. Only its properties are taken: the result stays open or
// closed as the base was.
const Extend = function <E, V = any>(this: any, extra: E, shape?: Node<V> | V): Node<ExtendResult<V, E>> {
  const base = objectBase(this, shape, S.Extend)
  const ext = nodize(extra)
  if (S.object !== ext.t) {
    throw new Error('Shape: ' + S.Extend + ' needs an object to extend with')
  }

  const entries = objectEntries(base)
  for (const e of objectEntries(ext)) {
    const i = entries.findIndex((x) => x.key === e.key)
    if (-1 === i) {
      entries.push(e)
    }
    else {
      entries[i] = e
    }
  }
  return objectNode(base, entries)
}


// Value may also be null. Absent is still governed by required/optional.
const Nullable = function <V = any>(this: any, shape?: Node<V> | V): Node<V | null> {
  let node = buildize(this, shape)
  node.u.nullable = true
  return node
}


// A number with no fractional part. Behaves as a type token: required, with
// the default 0, so Optional(Integer) injects 0 and Integer alone demands one.
const Integer = bare<number>()(function Integer <V = number>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.t = (S.integer as ValType)
  node.r = true
  node.p = false
  node.v = 0
  node.f = 0
  return node
})


// Value can be anything.
const Any = bare<any>()(function Any <V = any>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.t = (S.any as ValType)

  // Any is a kind the spec asked for, not an absent one: a key expression's
  // example value supplies the default but must not narrow it. (Type marks its
  // own nodes; Any is a builder, so it never passes through Type.)
  node.u.tset = true

  if (undefined !== shape) {
    node.v = shape
    node.f = shape
  }
  return node
})


// Custom error message.
const Fault = function <V = any>(this: any, msg: string, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.z = msg
  return node
}


// Value is skipped if not present (optional, but no default).
const Skip = function <V = any>(this: any, shape?: Node<V> | V): Node<V | undefined> {
  let node = buildize(this, shape)
  node.r = false

  // Do not insert empty arrays and objects.
  node.p = true

  return node
}


// Errors for this value are ignored, and the value is undefined. The whole
// subtree is probed, so a failing descendant is swallowed too.
const Ignore = function <V = any>(this: any, shape?: Node<V> | V): Node<V | undefined> {
  let node = buildize(this, shape)
  node.r = false

  // Do not insert empty arrays and objects.
  node.p = true

  node.e = false

  const inner = takeInner(node)

  const ignorer: any = function Ignore(val: any, update: Update, state: State) {
    const { out, errs } = probeNode(state, inner, val)
    update.uval = 0 < errs.length ? undefined : out
    update.done = true
    return true
  }
  ignorer.n = S.Ignore
  ignorer.s = (n: Node<any>) => innerDesc(inner, n).replace(/\.$/, '')
  ignorer.inner = inner
  node.b.push(ignorer)
  node.a.push(release)

  return node
}


// Value must be a function.
const Func = bare<Function>()(function Func <V = Function>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this)
  node.t = (S.function as ValType)
  node.v = shape
  node.f = shape
  return node
})


// Specify default value.
const Default = function <D = any, V = D>(this: any, dval?: D, shape?: Node<V> | V): Node<V> {
  // The node is the shape's when one is given, so an object or array shape
  // keeps its children and child shape; the default is only the value. An
  // untyped shape (Required(), Exact(1)) is built over the default instead,
  // and so takes the default's kind.
  let node: Node<any>
  if (undefined === shape) {
    node = buildize(this, dval)
  }
  else if (S.any === nodize(shape).t) {
    node = buildize(buildize(this, dval), shape)
  }
  else {
    node = buildize(this, shape)
  }

  node.r = false
  node.f = dval

  if (undefined === shape) {
    let t = typeof dval
    if (S.function === t && IS_TYPE[(dval as any).name]) {
      node.t = ((dval as any).name.toLowerCase() as ValType)
      node.f = clone(EMPTY_VAL[node.t])
    }
  }

  // Always insert default.
  node.p = false

  return node
}


// String can be empty.
const Empty = function <V = any>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)
  node.u.empty = true
  return node
}


// Value will never match anything.
const Never = bare<never>()(function Never <V = never>(this: any, shape?: Node<V> | V): Node<never> {
  let node = buildize(this, shape)
  node.t = (S.never as ValType)
  return node as Node<never>
})


// Inject the key path of the value.
// OR: provide validation of Key - depth could also be a RegExp
// Key yields the parent key, the path up to a depth (joined with a
// separator when one is given), or whatever a function of the path returns.
interface KeyBuilder {
  (this: any): Node<string>
  (this: any, depth: number, join: string): Node<string>
  (this: any, depth: number): Node<string[]>
  <R>(this: any, depth: (path: string[], state: State) => R): Node<R>
}

const Key = bare<string>()(function Key(this: any, depth?: number | Function, join?: string): Node<any> {
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
} as KeyBuilder)


// Pass only if all match. Does not short circuit (as defaults may be missed).
const All = function <const S extends readonly any[]>(this: any, ...inshapes: S): Node<S[number]> {
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
const Some = function <const S extends readonly any[]>(this: any, ...inshapes: S): Node<S[number]> {
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
const One = function <const S extends readonly any[]>(this: any, ...inshapes: S): Node<S[number]> {
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
const Exact = function <const T extends readonly any[]>(this: any, ...vals: T): Node<Literal<T[number]>> {
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
const Before = function <V = any>(
  this: any,
  validate: Validate,
  shape?: Node<V> | V
): Node<V> {
  let node = buildize(this, shape)
  node.b.push(validate)
  return node
}


// Define a custom operation to run after standard matching.
const After = function <V = any>(
  this: any,
  validate: Validate,
  shape?: Node<V> | V
): Node<V> {
  let node = buildize(this, shape)
  node.a.push(validate)
  return node
}


// Define a customer validation function.
const Check = function <V = any>(
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
      // Only a string can match. Coercing first (String(1).match(/^[0-9]+$/))
      // let Check(/re/) accept values that a bare /re/ rejects outright.
      let refn: any = (v: any) =>
        (S.string === typeof v) && !!v.match(check as string)
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
const Closed = function <V = any>(this: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)

  // Makes one element array fixed.
  if (S.array === node.t && undefined !== node.c && 0 === node.n) {
    node.v = [node.c]
  }
  node.c = undefined

  return node
}


// Define a named reference to this value. See Refer.
const Define = function <V = any>(this: any, inopts: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)

  let opts = S.object === typeof inopts ? inopts || {} : {}
  let name = S.string === typeof inopts ? inopts : opts.name


  if (null != name && '' != name) {
    const definer: any = function Define(_val: any, _update: Update, state: State) {
      let ref = state.ctx.ref = state.ctx.ref || {}
      ref[name] = state.node
      return true
    }
    definer.n = S.Define
    definer.a = [name]
    node.b.push(definer)
  }

  return node
}


// TODO: copy option to copy value instead of node - need index of value in stack
// Inject a referenced value. See Define.
const Refer = function <V = any>(this: any, inopts: any, shape?: Node<V> | V): Node<V> {
  let node = buildize(this, shape)

  let opts = S.object === typeof inopts ? inopts || {} : {}
  let name = S.string === typeof inopts ? inopts : opts.name

  // Fill should be false (the default) if used recursively, to prevent loops.
  let fill = !!opts.fill

  if (null != name && '' != name) {
    const referrer: any = function Refer(val: any, update: Update, state: State) {
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
    }
    referrer.n = S.Refer
    referrer.a = [name]
    node.b.push(referrer)
  }

  return node
}


// TODO: no mutate is State.match
// Rename a property.
const Rename = function <V = any>(this: any, inopts: any, shape?: Node<V> | V): Node<V> {
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

            // Old errors on the claimed value are no longer valid. Matched by
            // key: the stale closed/required error for the claimed key is what
            // must be dropped once the claim supplies a value. Use in-place
            // compaction instead of splice to avoid O(n²) shifting. The keep
            // branch is only taken when an unrelated error coexists during a
            // claim — a rare experimental combination not exercised by the suite.
            let writeIdx = 0
            for (let eI = 0; eI < s.err.length; eI++) {
              /* node:coverage disable */
              if (s.err[eI].key !== fromDflt.key) {
                s.err[writeIdx++] = s.err[eI]
              }
              /* node:coverage enable */
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
const Child = function <C = any, V = unknown>(
  this: any,
  child?: C,
  shape?: Node<V> | V
): Node<unknown extends V ? { [key: string]: C } : V> {
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





const Rest = function <C = any, V = unknown>(
  this: any,
  child?: C,
  shape?: Node<V> | V
): Node<unknown extends V ? C[] : V> {
  let node = buildize(this, shape || [])
  node.t = 'array'
  node.c = nodize(child)
  node.m = node.m || {}
  node.m.rest = true
  return node
}


type TypeRef =
  'Number' | 'String' | 'Boolean' | 'Object' | 'Array' | 'Function' | 'Symbol' |
  'Integer' | 'Date' |
  DateConstructor | StringConstructor | NumberConstructor | BooleanConstructor |
  ArrayConstructor | ObjectConstructor | FunctionConstructor |
  SymbolConstructor | Symbol | Record<any, any> | null | undefined | typeof NaN

// The result is the forced kind's; the spec's structure is discarded.
const Type = function <K extends TypeRef>(
  this: any,
  tref: K,
  shape?: any
): Node<ShapeResult<K>> {
  let tnat = nodize(TNAT[tref as string] || (S.Integer === tref ? Integer : tref))

  let node = buildize(this, shape)
  if (node !== tnat) {
    node.t = tnat.t
    node.r = tnat.r
    node.p = tnat.p
    node.v = tnat.v

    // Carry the fallback too. Omitting it made the string DSL disagree with
    // the builder API: expr('Optional(String)') dropped the '' default that
    // Optional(String) injects for an absent key.
    node.f = tnat.f
  }

  // Record that the kind came from the spec rather than being left open, so a
  // key expression's example value does not overwrite it.
  node.u.tset = true

  return (node as any)
}


// Size Builders: Min, Max, Above, Below, Len
// ==========================================

// True when the node declares a concrete type that this value does not have.
// The structural check is about to report a type error, and a size bound on a
// value of the wrong type is meaningless — `Min(2,String)` against 1 would
// otherwise complain about the number 1 being below a minimum of 2, masking
// the real problem. Mirrors the type tests in the validate loop.
function typeWillFail(state: State): boolean {
  const n: any = state.node
  const t: string = n.t
  const val = state.val

  if (undefined === val) return false
  if (S.any === t || S.list === t || S.check === t || S.never === t) return false

  if (S.object === t) return null === val || S.object !== state.valType || isarr(val)
  if (S.array === t) return !isarr(val)
  if (S.null === t) return null !== val
  if (S.instance === t) return !(n.u.i && val instanceof n.u.i)
  if (S.regexp === t) return S.string !== state.valType
  if (S.integer === t) return !Number.isInteger(val)
  if (S.date === t) return !(val instanceof Date)

  return t !== state.valType
}


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
    if (typeWillFail(state)) {
      return true
    }
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
const Min = function <V = any>(
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
      let errmsgpart = isNumeric(val) ? '' : 'length '
      update.err =
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ` must be a minimum ${errmsgpart}of ${min} (was ${vsize}).`)
      return false
    })
}


// Specific a maximum value or length.
const Max = function <V = any>(
  this: any,
  max: number | string,
  shape?: Node<V> | V
): Node<V> {
  return makeSizeBuilder(this, max, shape, S.Max,
    (vsize: number, max: number, val: any, update: Update, state: State) => {
      if (vsize <= max) {
        return true
      }

      let errmsgpart = isNumeric(val) ? '' : 'length '
      update.err =
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ` must be a maximum ${errmsgpart}of ${max} (was ${vsize}).`)
      return false
    })
}


// Specify a lower bound value or length.
const Above = function <V = any>(
  this: any,
  above: number | string,
  shape?: Node<V> | V
): Node<V> {
  return makeSizeBuilder(this, above, shape, S.Above,
    (vsize: number, above: number, val: any, update: Update, state: State) => {
      if (above < vsize) {
        return true
      }

      let errmsgpart = isNumeric(val) ? 'be' : 'have length'
      update.err =
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ` must ${errmsgpart} above ${above} (was ${vsize}).`)
      return false
    })
}


// Specify an upper bound value or length.
const Below = function <V = any>(
  this: any,
  below: number | string,
  shape?: Node<V> | V
): Node<V> {
  return makeSizeBuilder(this, below, shape, S.Below,
    (vsize: number, below: number, val: any, update: Update, state: State) => {
      if (vsize < below) {
        return true
      }

      let errmsgpart = isNumeric(val) ? 'be' : 'have length'
      update.err =
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ` must ${errmsgpart} below ${below} (was ${vsize}).`)
      return false
    })
}


// Value must have a specific length.
const Len = function <V = any>(
  this: any,
  len: number,
  shape?: Node<V> | V
): Node<V> {
  return makeSizeBuilder(this, len, shape, S.Len,
    (vsize: number, len: number, val: any, update: Update, state: State) => {
      if (len === vsize) {
        return true
      }

      let errmsgpart = isNumeric(val) ? '' : ' in length'
      update.err =
        makeErr(state,
          S.Value + ' ' + S.$VALUE + S.forprop + S.$PATH +
          ` must be exactly ${len}${errmsgpart} (was ${vsize}).`)
      return false
    })
}



// Make a Node chainable with Builder methods.
function buildize<V = any>(self?: any, shape?: any): Node<V> {
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
      let selfNode: Node<any> = nodize(self)

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
  return (node as any).Above ? node : // No need if already made chainable
    Object.assign(node, {
      Above,
      After,
      Any,
      Before,
      Below,
      Catch,
      Check,
      Child,
      Closed,
      Coerce,
      DateTime,
      Default,
      Define,
      Describe,
      Empty,
      Email,
      Exact,
      Extend,
      Fault,
      Func,
      Ignore,
      Integer,
      Ip,
      Ipv4,
      Ipv6,
      Len,
      Max,
      Min,
      Never,
      Nullable,
      Omit,
      Open,
      Optional,
      Partial,
      Pick,
      Refer,
      Rename,
      Required,
      Rest,
      Skip,
      Transform,
      Type,
      Url,
      Uuid,

      String: () => Type.call(node, String),
      Number: () => Type.call(node, Number),
      Boolean: () => Type.call(node, Boolean),
      Object: () => Type.call(node, Object),
      Array: () => Type.call(node, Array),
      Function: () => Type.call(node, Function),
      Symbol: () => Type.call(node, Symbol),
      Date: () => Type.call(node, Date),
    } as any)
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
    pathArr: patharr(s),
    why: why,
    check: s.check?.name || 'none',
    args: s.checkargs || {},
    mark: mark,
    text: '',
    use: user || {},
  }

  // TODO: truncate len, and ignore should be ShapeOptions
  // A primitive renders as its JSON, as it would through the replacer.
  const vt = typeof s.val
  let jstr = undefined === s.val ? S.undefined :
    (S.string === vt || S.boolean === vt) ? JS(s.val) :
      S.number === vt ? (s.val === s.val ? JS(s.val) : 'NaN') :
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

    // The disallowed keys of a closed object are listed in one error, so the
    // clause about them pluralizes; the path before it names one value.
    let listkind = propkind
    let propkindverb = 'is'
    let propkey = user?.k

    propkey = isarr(propkey) ?
      (listkind = (1 < propkey.length ?
        (propkindverb = 'are', 'properties') : listkind),
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
              `the ${listkind} "${propkey}" ${propkindverb} not allowed`
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
// The builder suffixes of a node's checks, skipping any that render as nothing.
function bdesc(n: Node<any>): string {
  return n.b
    .map((v: any) => v.s ? v.s(n) : '')
    .filter((d: string) => '' !== d)
    .map((d: string) => '.' + d)
    .join('')
}


function node2json(n: Node<any>): any {
  let t = n.t

  const fixed: any = {
    number: S.Number,
    string: S.String,
    boolean: S.Boolean,
    integer: S.Integer,
  }


  if (fixed[t]) {
    let s = ''

    if (n.r) {
      s += fixed[t]
    }

    if ('' === s) {
      s = JSON.stringify(n.v)
    }

    s += bdesc(n)

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

    s += bdesc(n)

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

    s += bdesc(n)

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
      o.$$ += bdesc(n)
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
  else if (S.list === t && n.u.discriminated) {
    return S.Discriminated + '(' + n.u.discriminated.tag + ',' + n.u.discriminated.tags.join(',') + ')'
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
  else if (S.date === t) {
    let s = n.r ? S.Date : JSON.stringify(n.v)
    s += bdesc(n)
    return s
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


// Deep, so that a Catch fallback holding an object is never shared between
// two results; anything that is not a plain object or array is kept as-is.
// A cycle, or an object reached twice, is reproduced rather than followed.
function clone(x: any, seen?: Map<any, any>): any {
  if (null == x || S.object !== typeof x) return x
  if (x instanceof RegExp) return new RegExp(x.source, x.flags)
  if (x instanceof Date) return new Date(x.getTime())
  if (!isarr(x)) {
    const proto = Object.getPrototypeOf(x)
    if (Object.prototype !== proto && null !== proto) return x
  }

  seen = seen || new Map()
  if (seen.has(x)) return seen.get(x)

  if (isarr(x)) {
    const out: any[] = []
    seen.set(x, out)
    for (let i = 0; i < x.length; i++) {
      out.push(clone(x[i], seen))
    }
    return out
  }

  const out: any = {}
  seen.set(x, out)
  for (const k of keys(x)) {
    defprop(out, k, { value: clone(x[k], seen), enumerable: true, writable: true, configurable: true })
  }
  return out
}


// JSON Schema
// ===========
// Export a node as a JSON Schema (draft 2020-12) describing the values it
// accepts. Every kind, bound, format, literal set, composition, reference and
// default has a rendering; a check that is a function, and the builders that
// only change what comes out (Coerce, Catch, Transform, Rename, Key), have
// none. The Go port renders the same schema for the same shape, and the
// differential harness compares the two.

const JSON_SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema'

function jsonSchema(top: Node<any>): any {
  const defs: any = {}
  const body = nodeSchema(top, defs)
  const out: any = { $schema: JSON_SCHEMA_DRAFT, ...body }
  if (0 < keys(defs).length) {
    out.$defs = defs
  }
  return out
}


const JSON_SCHEMA_TYPE: any = {
  string: 'string',
  number: 'number',
  nan: 'number',
  integer: 'integer',
  boolean: 'boolean',
  null: 'null',
  object: 'object',
  array: 'array',
  date: 'string',
  regexp: 'string',
}


const JSON_SCHEMA_FORMAT: any = {
  Email: 'email',
  Url: 'uri',
  Uuid: 'uuid',
  DateTime: 'date-time',
  Ipv4: 'ipv4',
  Ipv6: 'ipv6',
}


function nodeSchema(raw: any, defs: any): any {
  const n = nodize(raw)
  const s: any = {}

  // A reference stands for the named shape, which is rendered where it is
  // defined.
  const referrer: any = n.b.find((v: any) => S.Refer === v.n)
  if (undefined !== referrer) {
    s.$ref = '#/$defs/' + referrer.a[0]
    return describe(n, s)
  }

  if (undefined !== JSON_SCHEMA_TYPE[n.t]) {
    s.type = JSON_SCHEMA_TYPE[n.t]
  }

  if (S.string === n.t && !n.u.empty) {
    s.minLength = 1
  }
  else if (S.date === n.t) {
    s.format = 'date-time'
  }
  else if (S.regexp === n.t) {
    s.pattern = n.v.source
  }
  else if (S.never === n.t) {
    s.not = {}
  }
  else if (S.object === n.t) {
    objectSchema(n, s, defs)
  }
  else if (S.array === n.t) {
    arraySchema(n, s, defs)
  }
  else if (S.list === n.t) {
    listSchema(n, s, defs)
  }

  checkSchema(n, s)

  if (n.u.nullable && undefined !== s.type) {
    s.type = [s.type, 'null']
  }

  if (!n.r && !n.p && undefined !== n.f && S.function !== typeof n.f && !isNaN2(n.f)) {
    s.default = n.f
  }

  describe(n, s)

  const definer: any = n.b.find((v: any) => S.Define === v.n)
  if (undefined !== definer) {
    defs[definer.a[0]] = s
  }

  return s
}


function isNaN2(v: any): boolean {
  return S.number === typeof v && isNaN(v)
}


function describe(n: Node<any>, s: any): any {
  if (S.string === typeof n.m?.description) {
    s.description = n.m.description
  }
  return s
}


function objectSchema(n: Node<any>, s: any, defs: any) {
  const entries = objectEntries(n)
  const props: any = {}
  const required: string[] = []
  for (const e of entries) {
    const cn = nodize(e.child)
    ownprop(props, e.key, nodeSchema(cn, defs))
    if (cn.r) {
      required.push(e.key)
    }
  }
  if (0 < entries.length) {
    s.properties = props
  }
  if (0 < required.length) {
    s.required = required.sort()
  }
  if (undefined === n.c) {
    s.additionalProperties = false
  }
  else if (!isAnySchema(n.c)) {
    s.additionalProperties = nodeSchema(n.c, defs)
  }
}


// A child shape of Any says nothing, unless it stands for a reference.
function isAnySchema(child: any): boolean {
  const cn = nodize(child)
  return S.any === cn.t && undefined === cn.b.find((v: any) => S.Refer === v.n)
}


function arraySchema(n: Node<any>, s: any, defs: any) {
  const fixed = keys(n.v)
    .filter((k: string) => !isNaN(+k))
    .sort((a: string, b: string) => +a - +b)
    .map((k: string) => nodeSchema(n.v[k], defs))
  // An element shape of Any says nothing, as an Any rest shape does not for
  // an object.
  const child = undefined === n.c || isAnySchema(n.c) ? undefined : n.c
  if (0 < fixed.length) {
    s.prefixItems = fixed
    // Nothing may follow a closed tuple; an Any rest says nothing.
    if (undefined === n.c) {
      s.items = false
    }
    else if (undefined !== child) {
      s.items = nodeSchema(child, defs)
    }
  }
  else if (undefined !== child) {
    s.items = nodeSchema(child, defs)
  }
}


function listSchema(n: Node<any>, s: any, defs: any) {
  const branches = n.u.list.map((bn: any) => nodeSchema(bn, defs))
  const disc = n.u.discriminated
  if (undefined !== disc) {
    for (let bI = 0; bI < branches.length; bI++) {
      const b = branches[bI]
      b.properties = b.properties || {}
      b.properties[disc.tag] = { type: S.string, const: disc.tags[bI] }
      b.required = (b.required || []).filter((k: string) => k !== disc.tag).concat(disc.tag).sort()
    }
    s.oneOf = branches
  }
  else {
    s[S.All === n.b[0].n ? 'allOf' : 'anyOf'] = branches
  }
}


// The bounds a size builder puts on a value: the number families for a
// number, the length families for a string, array or object, and every
// family for a node that has not said.
const SIZE_FAMILIES: any = {
  number: ['minimum'],
  nan: ['minimum'],
  integer: ['minimum'],
  string: ['minLength'],
  array: ['minItems'],
  object: ['minProperties'],
}

const SIZE_MAX: any = {
  minimum: 'maximum',
  minLength: 'maxLength',
  minItems: 'maxItems',
  minProperties: 'maxProperties',
}


function checkSchema(n: Node<any>, s: any) {
  const families = SIZE_FAMILIES[n.t] || keys(SIZE_MAX)
  const vs: any[] = n.b.concat(n.a)

  for (let vI = 0; vI < vs.length; vI++) {
    const v = vs[vI]

    // Catch, Transform and Ignore take the node's checks inside.
    if (undefined !== v.inner) {
      vs.push(...v.inner.b, ...v.inner.a)
      continue
    }

    const name = v.n || v.name
    if (S.Exact === name) {
      s.enum = v.a.slice()
    }
    else if (undefined !== JSON_SCHEMA_FORMAT[name]) {
      s.format = JSON_SCHEMA_FORMAT[name]
    }
    else if (S.Ip === name) {
      s.anyOf = [{ format: 'ipv4' }, { format: 'ipv6' }]
    }
    else if (S.Min === name || S.Max === name || S.Above === name || S.Below === name ||
      S.Len === name) {
      const size = +v.a[0]
      for (const lo of families) {
        const hi = SIZE_MAX[lo]
        const numeric = 'minimum' === lo
        if (S.Min === name) {
          s[lo] = size
        }
        else if (S.Max === name) {
          s[hi] = size
        }
        else if (S.Above === name) {
          numeric ? (s.exclusiveMinimum = size) : (s[lo] = size + 1)
        }
        else if (S.Below === name) {
          numeric ? (s.exclusiveMaximum = size) : (s[hi] = size - 1)
        }
        else {
          s[lo] = size
          s[hi] = size
        }
      }
    }
    else if (S.string === typeof name && v.shape$?.Check && name.startsWith('/')) {
      s.pattern = name.substring(1, name.lastIndexOf('/'))
    }
  }
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
  Catch,
  Check,
  Child,
  Closed,
  Coerce,
  DateTime,
  Default,
  Define,
  Describe,
  Discriminated,
  Email,
  Empty,
  Exact,
  Extend,
  Fault,
  Func,
  Ignore,
  Integer,
  Ip,
  Ipv4,
  Ipv6,
  Key,
  Len,
  Max,
  Min,
  Never,
  Nullable,
  Omit,
  One,
  Open,
  Optional,
  Partial,
  Pick,
  Refer,
  Rename,
  Required,
  Skip,
  Some,
  Transform,
  Rest,
  Type,
  Url,
  Uuid,
}


// Builders that mean something applied to nothing, so a bare reference to one
// in a spec (`{ a: Any }`) is read as a call. See nodize.
const NULLARY_BUILDERS =
  [Any, Closed, Coerce, DateTime, Email, Empty, Func, Ignore, Integer, Ip, Ipv4, Ipv6,
    Key, Never, Nullable, Open, Optional, Required, Skip, Url, Uuid]

for (let builder of NULLARY_BUILDERS) {
  defprop(builder, 'nullary$', { value: true })
}


// Fix builder names after terser mangles them.
/* node:coverage ignore next 5 */
if (S.undefined !== typeof (window)) {
  for (let builderName in BuilderMap) {
    defprop((BuilderMap as any)[builderName], S.name, { value: builderName })
  }
}


// JSON Schema import
// ==================
// Build a spec from a JSON Schema (draft 2020-12, and the common keywords of
// earlier drafts), the inverse of the export above: a type becomes a token,
// bounds become size builders, formats and patterns their builders, enum and
// const become Exact, properties and items become objects and arrays, the
// compositions become One, All and Discriminated, and a definition is inlined
// where it is referenced — Define and Refer only where a definition refers to
// itself. A property that is not required and has no default is Skip. Unknown
// keywords are ignored; an unknown type or reference is an error. The Go port
// builds the same spec, and the differential harness compares the export of
// what each imports.

const JSON_SCHEMA_KIND: any = {
  string: 1, number: 1, integer: 1, boolean: 1, null: 1, object: 1, array: 1,
}

const JSON_SCHEMA_FORMAT_BUILDER: any = {
  email: 'Email',
  uri: 'Url',
  uuid: 'Uuid',
  'date-time': 'DateTime',
  ipv4: 'Ipv4',
  ipv6: 'Ipv6',
}


function fromJsonSchema(schema: any): any {
  if (null == schema || S.object !== typeof schema || Array.isArray(schema)) {
    throw new Error('JSON Schema: the schema must be an object')
  }
  const ctx = {
    root: schema,
    defs: schema.$defs || schema.definitions || {},
    stack: [] as string[],
    recursive: {} as any,
  }
  return importSchema(schema, ctx, '')
}


function jsonSchemaFault(msg: string, path: string): Error {
  return new Error('JSON Schema: ' + msg + ' at ' + ('' === path ? '/' : path))
}


function importSchema(s: any, ctx: any, path: string): any {
  if (true === s) {
    return Any()
  }
  if (false === s) {
    return Never()
  }
  if (null == s || S.object !== typeof s || Array.isArray(s)) {
    throw jsonSchemaFault('a schema must be an object or boolean', path)
  }

  let spec: any
  if (S.string === typeof s.$ref) {
    spec = importRef(s.$ref, ctx, path)
  }
  else {
    spec = importKeywords(s, ctx, path)
  }

  if (S.string === typeof s.description) {
    spec = Describe(s.description, spec)
  }
  return spec
}


// A definition is inlined at each reference, so validation order cannot
// matter; a definition that refers to itself is Defined at its outermost
// expansion and Referred within.
function importRef(ref: string, ctx: any, path: string): any {
  let name: string
  let def: any
  const m = ref.match(/^#\/(\$defs|definitions)\/([^/]+)$/)
  if (null != m) {
    name = decodeURIComponent(m[2])
    def = ctx.defs[name]
    if (undefined === def) {
      throw jsonSchemaFault('unknown $ref "' + ref + '"', path)
    }
  }
  else if ('#' === ref) {
    name = ''
    def = ctx.root
  }
  else {
    throw jsonSchemaFault('unsupported $ref "' + ref + '"', path)
  }

  const refname = '' === name ? '$root' : name
  if (ctx.stack.includes(name)) {
    ctx.recursive[name] = true
    return Refer(refname)
  }

  ctx.stack.push(name)
  const wasRecursive = ctx.recursive[name]
  ctx.recursive[name] = false
  const spec = importSchema(def, ctx, path)
  const recursive = ctx.recursive[name]
  ctx.recursive[name] = wasRecursive
  ctx.stack.pop()

  return recursive ? Define(refname, spec) : spec
}


function importKeywords(s: any, ctx: any, path: string): any {
  let spec: any

  if (undefined !== s.enum) {
    if (!Array.isArray(s.enum) || 0 === s.enum.length) {
      throw jsonSchemaFault('enum must be a non-empty array', path)
    }
    spec = Exact(...s.enum)
  }
  else if (undefined !== s.const) {
    spec = Exact(s.const)
  }
  else if (undefined !== s.allOf) {
    spec = All(...importBranches(s.allOf, ctx, path + '/allOf'))
  }
  else if (undefined !== s.oneOf) {
    spec = importDiscriminated(importBranchList(s.oneOf, path + '/oneOf'), ctx, path + '/oneOf') ||
      One(...importBranches(s.oneOf, ctx, path + '/oneOf'))
  }
  else if (undefined !== s.anyOf && !isIpFormats(s.anyOf)) {
    spec = One(...importBranches(s.anyOf, ctx, path + '/anyOf'))
  }
  else if (undefined !== s.not && isEmptyObject(s.not)) {
    spec = Never()
  }
  else {
    spec = importTyped(s, ctx, path)
  }

  if (undefined !== s.default) {
    spec = Default(s.default, spec)
  }
  return spec
}


function importBranchList(list: any, path: string): any[] {
  if (!Array.isArray(list)) {
    throw jsonSchemaFault(path.slice(path.lastIndexOf('/') + 1) + ' must be an array', path)
  }
  return list
}


function importBranches(list: any, ctx: any, path: string): any[] {
  return importBranchList(list, path).map((b: any, i: number) => importSchema(b, ctx, path + '/' + i))
}


function isPlainObject(v: any): boolean {
  return null != v && S.object === typeof v && !Array.isArray(v)
}


function isEmptyObject(v: any): boolean {
  return isPlainObject(v) && 0 === keys(v).length
}


// The export's rendering of Ip: an anyOf of the two address formats.
function isIpFormats(anyOf: any): boolean {
  return Array.isArray(anyOf) && 2 === anyOf.length &&
    anyOf.every((b: any) => null != b && S.object === typeof b && 1 === keys(b).length) &&
    'ipv4' === anyOf[0].format && 'ipv6' === anyOf[1].format
}


function importTyped(s: any, ctx: any, path: string): any {
  let types: any[] = Array.isArray(s.type) ? s.type : (undefined === s.type ? [] : [s.type])
  const nullable = types.includes('null') && 1 < types.length
  types = nullable ? types.filter((t: any) => 'null' !== t) : types

  for (const t of types) {
    if (S.string !== typeof t || undefined === JSON_SCHEMA_KIND[t]) {
      throw jsonSchemaFault('unknown type "' + t + '"', path)
    }
  }

  if (0 === types.length) {
    // No type: the shape the keywords imply, or anything.
    if (undefined !== s.properties || undefined !== s.additionalProperties || undefined !== s.required) {
      types = ['object']
    }
    else if (undefined !== s.items || undefined !== s.prefixItems) {
      types = ['array']
    }
    else {
      return importUntyped(s, path)
    }
  }

  let spec: any = 1 === types.length ?
    importKind(types[0], s, ctx, path) :
    One(...types.map((t: any) => importKind(t, s, ctx, path)))

  return nullable ? Nullable(spec) : spec
}


function importKind(t: string, s: any, ctx: any, path: string): any {
  if ('string' === t) {
    return importString(s, path)
  }
  if ('number' === t || 'integer' === t) {
    return importNumber('integer' === t ? Integer() : Number, s)
  }
  if ('boolean' === t) {
    return Boolean
  }
  if ('null' === t) {
    return Required(null)
  }
  if ('object' === t) {
    return importObject(s, ctx, path)
  }
  return importArray(s, ctx, path)
}


// Keywords without a type: a pattern or format reads as a string, a bound
// applies to whatever kind the value turns out to be (as a bare Min does),
// and anything else says nothing.
function importUntyped(s: any, path: string): any {
  if (S.string === typeof s.pattern || undefined !== JSON_SCHEMA_FORMAT_BUILDER[s.format] || isIpFormats(s.anyOf)) {
    return importString(s, path)
  }
  const view = {
    minimum: firstNumber(s.minimum, s.minLength, s.minItems, s.minProperties),
    maximum: firstNumber(s.maximum, s.maxLength, s.maxItems, s.maxProperties),
    exclusiveMinimum: s.exclusiveMinimum,
    exclusiveMaximum: s.exclusiveMaximum,
  }
  // A bare bound (Min(1)) rather than one on an Any node, as a user writes.
  const spec = importNumber(undefined, view)
  return undefined === spec ? Any() : spec
}


function firstNumber(...vals: any[]): number | undefined {
  return vals.find((v: any) => S.number === typeof v)
}


function importString(s: any, path: string): any {
  let spec: any
  if (S.string === typeof s.pattern) {
    try {
      spec = new RegExp(s.pattern)
    }
    catch (e: any) {
      throw jsonSchemaFault('bad pattern "' + s.pattern + '"', path)
    }
  }
  else {
    spec = String
  }

  const format = JSON_SCHEMA_FORMAT_BUILDER[s.format]
  if (undefined !== format) {
    // Called bare: a builder invoked as a method takes its receiver as the
    // shape to extend.
    const build = (BuilderMap as any)[format]
    spec = build(spec)
  }
  else if (Array.isArray(s.anyOf) && isIpFormats(s.anyOf)) {
    spec = Ip(spec)
  }
  else if (String === spec && !(0 < s.minLength)) {
    // A string with no lower bound is allowed to be empty; a pattern or
    // format decides for itself.
    spec = Empty(spec)
  }

  if (S.number === typeof s.minLength && 1 < s.minLength) {
    spec = Min(s.minLength, spec)
  }
  if (S.number === typeof s.maxLength) {
    spec = Max(s.maxLength, spec)
  }
  return spec
}


function importNumber(spec: any, s: any): any {
  if (S.number === typeof s.exclusiveMinimum) {
    spec = Above(s.exclusiveMinimum, spec)
  }
  else if (S.number === typeof s.minimum) {
    spec = true === s.exclusiveMinimum ? Above(s.minimum, spec) : Min(s.minimum, spec)
  }
  if (S.number === typeof s.exclusiveMaximum) {
    spec = Below(s.exclusiveMaximum, spec)
  }
  else if (S.number === typeof s.maximum) {
    spec = true === s.exclusiveMaximum ? Below(s.maximum, spec) : Max(s.maximum, spec)
  }
  return spec
}


function importObject(s: any, ctx: any, path: string): any {
  if (undefined !== s.properties && !isPlainObject(s.properties)) {
    throw jsonSchemaFault('properties must be an object', path + '/properties')
  }
  const props: any = s.properties || {}
  const required: string[] = Array.isArray(s.required) ? s.required : []
  const obj: any = {}
  for (const k of keys(props)) {
    ownprop(obj, k, importProperty(props[k], required.includes(k), ctx, path + '/properties/' + k))
  }
  // A required name with no property schema must still be present.
  for (const k of required) {
    if (S.string === typeof k && undefined === obj[k]) {
      ownprop(obj, k, Required())
    }
  }

  let spec: any
  if (false === s.additionalProperties) {
    spec = 0 === keys(obj).length ? Closed(obj) : obj
  }
  else if (undefined === s.additionalProperties || true === s.additionalProperties) {
    spec = Open(obj)
  }
  else {
    spec = Child(importSchema(s.additionalProperties, ctx, path + '/additionalProperties'), obj)
  }

  if (S.number === typeof s.minProperties) {
    spec = Min(s.minProperties, spec)
  }
  if (S.number === typeof s.maxProperties) {
    spec = Max(s.maxProperties, spec)
  }
  return spec
}


// A property is required when listed, has its default when given, and is
// otherwise Skip: absent stays absent.
function importProperty(ps: any, required: boolean, ctx: any, path: string): any {
  const spec = importSchema(ps, ctx, path)
  if (null != ps && S.object === typeof ps && undefined !== ps.default) {
    return spec
  }
  return required ? Required(spec) : Skip(spec)
}


function importArray(s: any, ctx: any, path: string): any {
  if (undefined !== s.prefixItems && !Array.isArray(s.prefixItems)) {
    throw jsonSchemaFault('prefixItems must be an array', path + '/prefixItems')
  }
  let spec: any
  if (undefined !== s.prefixItems) {
    // Closed makes a one-element list a tuple rather than an element shape;
    // items says what may follow (anything, when it is absent or true).
    const tuple = Closed(s.prefixItems.map((e: any, i: number) => importSchema(e, ctx, path + '/prefixItems/' + i)))
    if (false === s.items) {
      spec = tuple
    }
    else if (undefined === s.items || true === s.items) {
      spec = Rest(Any(), tuple)
    }
    else {
      spec = Rest(importSchema(s.items, ctx, path + '/items'), tuple)
    }
  }
  else if (undefined === s.items || true === s.items) {
    spec = []
  }
  else {
    spec = [importSchema(s.items, ctx, path + '/items')]
  }

  if (S.number === typeof s.minItems) {
    spec = Min(s.minItems, spec)
  }
  if (S.number === typeof s.maxItems) {
    spec = Max(s.maxItems, spec)
  }
  return spec
}


// A oneOf of objects that each require one property with a distinct string
// const is a discriminated union on that property.
function importDiscriminated(branches: any[], ctx: any, path: string): any {
  if (0 === branches.length) {
    return undefined
  }
  let tag: string | undefined
  const tags: string[] = []
  for (const b of branches) {
    if (null == b || S.object !== typeof b || null == b.properties || !Array.isArray(b.required)) {
      return undefined
    }
    // Candidates in name order, so both implementations pick the same tag.
    const found = keys(b.properties).sort().filter((k: string) =>
      null != b.properties[k] && S.string === typeof b.properties[k].const && b.required.includes(k))
    if (undefined === tag) {
      tag = found.find((k: string) =>
        branches.every((o: any) => null != o && null != o.properties && null != o.properties[k] &&
          S.string === typeof o.properties[k].const))
      if (undefined === tag) {
        return undefined
      }
    }
    const t = b.properties[tag].const
    if (tags.includes(t)) {
      return undefined
    }
    tags.push(t)
  }

  const out: any = {}
  for (let bI = 0; bI < branches.length; bI++) {
    const b = branches[bI]
    const props: any = {}
    for (const k of keys(b.properties)) {
      if (k !== tag) {
        ownprop(props, k, b.properties[k])
      }
    }
    const required = b.required.filter((k: string) => k !== tag)
    out[tags[bI]] = importObject({ ...b, properties: props, required }, ctx, path + '/' + bI)
  }
  return Discriminated(tag as string, out)
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
  jsonSchema,
  fromJsonSchema,
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
  jsonSchema: () => any,
  isShape: (v: any) => boolean,
  shape: typeof SHAPE
} & StandardSchemaV1



type Shape = typeof shapify & typeof BuilderMap & {
  G$: typeof G$,
  buildize: typeof buildize,
  makeErr: typeof makeErr,
  stringify: typeof stringify,
  jsonSchema: typeof jsonSchema,
  fromJsonSchema: typeof fromJsonSchema,
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
const GInteger = Integer
const GCoerce = Coerce
const GCatch = Catch
const GDescribe = Describe
const GDiscriminated = Discriminated
const GPick = Pick
const GOmit = Omit
const GPartial = Partial
const GExtend = Extend
const GTransform = Transform
const GDateTime = DateTime
const GEmail = Email
const GIp = Ip
const GIpv4 = Ipv4
const GIpv6 = Ipv6
const GUrl = Url
const GUuid = Uuid
const GNullable = Nullable
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
  ): any {
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


export type {
  Validate,
  Update,
  Context,
  Builder,
  Node,
  State,
  ShapeShape,
  StandardSchemaV1,
  StandardSchemaV1Props,
  StandardSchemaV1Result,
  StandardSchemaV1Issue,
  StandardSchemaV1PathSegment,
  StandardSchemaV1Types,
}

// Module-level export declarations are not executable statements, so V8 line
// coverage never records them.
/* node:coverage disable */
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
  fromJsonSchema,

  Above,
  After,
  All,
  Any,
  Before,
  Below,
  Catch,
  Check,
  Child,
  Closed,
  Coerce,
  DateTime,
  Default,
  Define,
  Describe,
  Discriminated,
  Extend,
  Omit,
  Partial,
  Pick,
  Email,
  Empty,
  Exact,
  Fault,
  Func,
  Ignore,
  Integer,
  Ip,
  Ipv4,
  Ipv6,
  Key,
  Len,
  Max,
  Min,
  Never,
  Nullable,
  One,
  Open,
  Optional,
  Refer,
  Rename,
  Required,
  Skip,
  Some,
  Transform,
  Type,
  Rest,
  Url,
  Uuid,

  GAbove,
  GAfter,
  GAll,
  GAny,
  GBefore,
  GBelow,
  GCheck,
  GChild,
  GClosed,
  GCoerce,
  GCatch,
  GDescribe,
  GDiscriminated,
  GPick,
  GOmit,
  GPartial,
  GExtend,
  GTransform,
  GDateTime,
  GEmail,
  GIp,
  GIpv4,
  GIpv6,
  GUrl,
  GUuid,
  GDefault,
  GDefine,
  GEmpty,
  GExact,
  GFault,
  GFunc,
  GIgnore,
  GInteger,
  GKey,
  GLen,
  GMax,
  GMin,
  GNever,
  GNullable,
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


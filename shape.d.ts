declare const SHAPE: {
    shape$: symbol;
    v$: string;
};
type ShapeOptions = {
    name?: string;
    meta?: {
        active?: boolean;
        suffix?: string;
    };
    keyexpr?: {
        active?: boolean;
    };
    valexpr?: {
        active?: boolean;
        keymark?: string;
    };
};
type Context = Record<string, any> & {
    err?: ErrDesc[] | boolean;
    log?: (point: string, state: State) => void;
    skip?: {
        depth?: number | number[];
        keys?: string[];
    };
    prefix?: string;
    suffix?: string;
};
type ValType = 'any' | // Any type.
'array' | // An array.
'bigint' | // A BigInt value.
'boolean' | // The values `true` or `false`.
'function' | // A function.
'instance' | // An instance of a constructed object.
'list' | // A list of types under a given logical rule.
'nan' | // The `NaN` value.
'never' | // No type.
'null' | // The `null` value.
'number' | // A number.
'object' | // A plain object.
'string' | // A string (but *not* the empty string).
'symbol' | // A symbol reference.
'regexp' | // A regular expression.
'check' | // A check function.
'undefined';
type Node<V> = {
    $: typeof SHAPE;
    t: ValType;
    d: number;
    v: any;
    f: any;
    r: boolean;
    p: boolean;
    n: number;
    c: any;
    k: string[];
    e: boolean;
    u: Record<string, any>;
    b: Validate[];
    a: Validate[];
    m: NodeMeta;
    z?: string;
} & {
    [name: string]: Builder<V>;
};
type NodeMeta = Record<string, any>;
type Builder<S> = (opts?: any, // Builder options.
...vals: any[]) => Node<S>;
type Validate = ((val: any, update: Update, state: State) => boolean) & {
    s?: (n: Node<any>) => string;
    a?: any[];
    n?: string;
};
type ShapeResult<T> = T extends Node<any> ? any : T extends StringConstructor ? string : T extends NumberConstructor ? number : T extends BooleanConstructor ? boolean : T extends ArrayConstructor ? any[] : T extends ObjectConstructor ? any : T extends FunctionConstructor ? Function : T extends SymbolConstructor ? symbol : T extends {
    [key: string]: any;
} ? {
    [K in keyof T]: ShapeResult<T[K]>;
} : T;
declare class State {
    match: boolean;
    dI: number;
    nI: number;
    cI: number;
    pI: number;
    sI: number;
    valType: string;
    isRoot: boolean;
    key: string;
    type: string;
    stop: boolean;
    nextSibling: boolean;
    fromDflt: boolean;
    ignoreVal: boolean | undefined;
    curerr: any[];
    err: any[];
    parents: Node<any>[];
    keys: string[];
    ancestors: Node<any>[];
    path: string[];
    node: Node<any>;
    root: any;
    val: any;
    parent: any;
    nodes: (Node<any> | number)[];
    vals: any[];
    ctx: any;
    oval: any;
    check?: Function;
    checkargs?: Record<string, any>;
    constructor(root: any, top: Node<any>, ctx?: Context, match?: boolean);
    next(): void;
    updateVal(val: any): void;
}
type Update = {
    done?: boolean;
    val?: any;
    uval?: any;
    node?: Node<any>;
    type?: ValType;
    nI?: number;
    sI?: number;
    pI?: number;
    err?: string | ErrDesc | ErrDesc[];
    why?: string;
    fatal?: boolean;
};
type ErrDesc = {
    key: string;
    type: string;
    node: Node<any>;
    value: any;
    path: string;
    why: string;
    check: string;
    args: Record<string, any>;
    mark: number;
    text: string;
    use: any;
};
declare class ShapeError extends TypeError {
    shape: boolean;
    code: string;
    gname: string;
    props: ({
        path: string;
        type: string;
        value: any;
    }[]);
    desc: () => ({
        name: string;
        code: string;
        err: ErrDesc[];
        ctx: any;
    });
    constructor(code: string, gname: string | undefined, err: ErrDesc[], ctx: any);
    toJSON(): this & {
        err: any;
        name: string;
        message: string;
    };
}
declare function nodize<S>(shape?: any, depth?: number, meta?: NodeMeta): Node<S>;
declare function shapify<S>(intop?: S | Node<S>, inopts?: ShapeOptions): {
    <V>(root?: V, ctx?: Context): V & ShapeResult<S>;
    valid: <V>(root?: V, ctx?: Context) => root is (V & S);
    match(root?: any, ctx?: Context): boolean;
    error(root?: any, ctx?: Context): ShapeError[];
    spec(): any;
    node(): Node<S>;
    stringify(...rest: any[]): string;
    jsonify(): any;
    toString(this: any): string;
    shape: {
        shape$: symbol;
        v$: string;
    };
};
declare function expr(spec: {
    src: string;
    keymark?: string;
    val?: any;
    d?: number;
    meta?: NodeMeta;
    ancestors?: Node<any>[];
    node?: Node<any>;
    tokens?: string[];
    i?: number;
    refs?: any;
} | string, current?: any): any;
declare function build(v: any, opts?: ShapeOptions, top?: boolean): any;
declare function truncate(str?: string, len?: number): string;
declare const Required: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const Open: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const Optional: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const Any: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const Fault: <V>(this: any, msg: string, shape?: Node<V> | V) => Node<V>;
declare const Skip: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const Ignore: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const Func: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const Default: <V>(this: any, dval?: any, shape?: Node<V> | V) => Node<V>;
declare const Empty: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const Never: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const Key: (this: any, depth?: number | Function, join?: string) => Node<unknown>;
declare const All: (this: any, ...inshapes: any[]) => Node<unknown>;
declare const Some: (this: any, ...inshapes: any[]) => Node<unknown>;
declare const One: (this: any, ...inshapes: any[]) => Node<unknown>;
declare const Exact: (this: any, ...vals: any[]) => Node<unknown>;
declare const Before: <V>(this: any, validate: Validate, shape?: Node<V> | V) => Node<V>;
declare const After: <V>(this: any, validate: Validate, shape?: Node<V> | V) => Node<V>;
declare const Check: <V>(this: any, check: Validate | RegExp | string, shape?: Node<V> | V) => Node<V>;
declare const Closed: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const Define: <V>(this: any, inopts: any, shape?: Node<V> | V) => Node<V>;
declare const Refer: <V>(this: any, inopts: any, shape?: Node<V> | V) => Node<V>;
declare const Rename: <V>(this: any, inopts: any, shape?: Node<V> | V) => Node<V>;
declare const Child: <V>(this: any, child?: any, shape?: Node<V> | V) => Node<V>;
declare const Rest: <V>(this: any, child?: any, shape?: Node<V> | V) => Node<V>;
declare const Type: <V extends "Number" | "String" | "Boolean" | "Object" | "Array" | "Function" | "Symbol" | StringConstructor | NumberConstructor | BooleanConstructor | ArrayConstructor | ObjectConstructor | FunctionConstructor | SymbolConstructor | Symbol | Record<any, any> | null | undefined | typeof NaN>(this: any, tref: V, shape?: any) => (V extends "Number" | NumberConstructor ? number : V extends "Boolean" | BooleanConstructor ? boolean : V extends "String" | StringConstructor ? string : V extends "Array" | ArrayConstructor ? any[] : V extends "Object" | ObjectConstructor ? any : V extends "Function" | FunctionConstructor ? Function : V extends "Symbol" | SymbolConstructor ? Symbol : V extends null ? null : V extends undefined ? undefined : V);
declare const Min: <V>(this: any, min: number | string, shape?: Node<V> | V) => Node<V>;
declare const Max: <V>(this: any, max: number | string, shape?: Node<V> | V) => Node<V>;
declare const Above: <V>(this: any, above: number | string, shape?: Node<V> | V) => Node<V>;
declare const Below: <V>(this: any, below: number | string, shape?: Node<V> | V) => Node<V>;
declare const Len: <V>(this: any, len: number, shape?: Node<V> | V) => Node<V>;
declare function buildize<V>(self?: any, shape?: any): Node<V>;
declare function makeErr(state: State, text?: string, why?: string, user?: any): ErrDesc;
declare function stringify(src: any, dequote?: boolean, expand?: boolean, ignore?: {
    key?: (string | RegExp)[];
    val?: (string | RegExp)[];
}, replacer?: any): any;
declare const G$: (node: any) => Node<any>;
declare const BuilderMap: {
    Above: <V>(this: any, above: number | string, shape?: Node<V> | V) => Node<V>;
    After: <V>(this: any, validate: Validate, shape?: Node<V> | V) => Node<V>;
    All: (this: any, ...inshapes: any[]) => Node<unknown>;
    Any: <V>(this: any, shape?: Node<V> | V) => Node<V>;
    Before: <V>(this: any, validate: Validate, shape?: Node<V> | V) => Node<V>;
    Below: <V>(this: any, below: number | string, shape?: Node<V> | V) => Node<V>;
    Check: <V>(this: any, check: Validate | RegExp | string, shape?: Node<V> | V) => Node<V>;
    Child: <V>(this: any, child?: any, shape?: Node<V> | V) => Node<V>;
    Closed: <V>(this: any, shape?: Node<V> | V) => Node<V>;
    Default: <V>(this: any, dval?: any, shape?: Node<V> | V) => Node<V>;
    Define: <V>(this: any, inopts: any, shape?: Node<V> | V) => Node<V>;
    Empty: <V>(this: any, shape?: Node<V> | V) => Node<V>;
    Exact: (this: any, ...vals: any[]) => Node<unknown>;
    Fault: <V>(this: any, msg: string, shape?: Node<V> | V) => Node<V>;
    Func: <V>(this: any, shape?: Node<V> | V) => Node<V>;
    Ignore: <V>(this: any, shape?: Node<V> | V) => Node<V>;
    Key: (this: any, depth?: number | Function, join?: string) => Node<unknown>;
    Len: <V>(this: any, len: number, shape?: Node<V> | V) => Node<V>;
    Max: <V>(this: any, max: number | string, shape?: Node<V> | V) => Node<V>;
    Min: <V>(this: any, min: number | string, shape?: Node<V> | V) => Node<V>;
    Never: <V>(this: any, shape?: Node<V> | V) => Node<V>;
    One: (this: any, ...inshapes: any[]) => Node<unknown>;
    Open: <V>(this: any, shape?: Node<V> | V) => Node<V>;
    Optional: <V>(this: any, shape?: Node<V> | V) => Node<V>;
    Refer: <V>(this: any, inopts: any, shape?: Node<V> | V) => Node<V>;
    Rename: <V>(this: any, inopts: any, shape?: Node<V> | V) => Node<V>;
    Required: <V>(this: any, shape?: Node<V> | V) => Node<V>;
    Skip: <V>(this: any, shape?: Node<V> | V) => Node<V>;
    Some: (this: any, ...inshapes: any[]) => Node<unknown>;
    Rest: <V>(this: any, child?: any, shape?: Node<V> | V) => Node<V>;
    Type: <V extends "Number" | "String" | "Boolean" | "Object" | "Array" | "Function" | "Symbol" | StringConstructor | NumberConstructor | BooleanConstructor | ArrayConstructor | ObjectConstructor | FunctionConstructor | SymbolConstructor | Symbol | Record<any, any> | null | undefined | typeof NaN>(this: any, tref: V, shape?: any) => (V extends "Number" | NumberConstructor ? number : V extends "Boolean" | BooleanConstructor ? boolean : V extends "String" | StringConstructor ? string : V extends "Array" | ArrayConstructor ? any[] : V extends "Object" | ObjectConstructor ? any : V extends "Function" | FunctionConstructor ? Function : V extends "Symbol" | SymbolConstructor ? Symbol : V extends null ? null : V extends undefined ? undefined : V);
};
type ShapeShape = ReturnType<typeof shapify> & {
    valid: <D, S>(root?: D, ctx?: any) => root is (D & S);
    match: (root?: any, ctx?: any) => boolean;
    error: (root?: any, ctx?: Context) => ShapeError[];
    spec: () => any;
    node: () => Node<any>;
    isShape: (v: any) => boolean;
    shape: typeof SHAPE;
};
type Shape = typeof shapify & typeof BuilderMap & {
    G$: typeof G$;
    buildize: typeof buildize;
    makeErr: typeof makeErr;
    stringify: typeof stringify;
    truncate: typeof truncate;
    nodize: typeof nodize;
    expr: typeof expr;
    build: typeof build;
    MakeArgu: typeof MakeArgu;
};
declare const Shape: Shape;
declare const GAbove: <V>(this: any, above: number | string, shape?: Node<V> | V) => Node<V>;
declare const GAfter: <V>(this: any, validate: Validate, shape?: Node<V> | V) => Node<V>;
declare const GAll: (this: any, ...inshapes: any[]) => Node<unknown>;
declare const GAny: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const GBefore: <V>(this: any, validate: Validate, shape?: Node<V> | V) => Node<V>;
declare const GBelow: <V>(this: any, below: number | string, shape?: Node<V> | V) => Node<V>;
declare const GCheck: <V>(this: any, check: Validate | RegExp | string, shape?: Node<V> | V) => Node<V>;
declare const GChild: <V>(this: any, child?: any, shape?: Node<V> | V) => Node<V>;
declare const GRest: <V>(this: any, child?: any, shape?: Node<V> | V) => Node<V>;
declare const GClosed: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const GDefault: <V>(this: any, dval?: any, shape?: Node<V> | V) => Node<V>;
declare const GDefine: <V>(this: any, inopts: any, shape?: Node<V> | V) => Node<V>;
declare const GEmpty: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const GExact: (this: any, ...vals: any[]) => Node<unknown>;
declare const GFault: <V>(this: any, msg: string, shape?: Node<V> | V) => Node<V>;
declare const GFunc: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const GIgnore: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const GKey: (this: any, depth?: number | Function, join?: string) => Node<unknown>;
declare const GLen: <V>(this: any, len: number, shape?: Node<V> | V) => Node<V>;
declare const GMax: <V>(this: any, max: number | string, shape?: Node<V> | V) => Node<V>;
declare const GMin: <V>(this: any, min: number | string, shape?: Node<V> | V) => Node<V>;
declare const GNever: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const GOne: (this: any, ...inshapes: any[]) => Node<unknown>;
declare const GOpen: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const GOptional: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const GRefer: <V>(this: any, inopts: any, shape?: Node<V> | V) => Node<V>;
declare const GRename: <V>(this: any, inopts: any, shape?: Node<V> | V) => Node<V>;
declare const GRequired: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const GSkip: <V>(this: any, shape?: Node<V> | V) => Node<V>;
declare const GSome: (this: any, ...inshapes: any[]) => Node<unknown>;
declare const GType: <V extends "Number" | "String" | "Boolean" | "Object" | "Array" | "Function" | "Symbol" | StringConstructor | NumberConstructor | BooleanConstructor | ArrayConstructor | ObjectConstructor | FunctionConstructor | SymbolConstructor | Symbol | Record<any, any> | null | undefined | typeof NaN>(this: any, tref: V, shape?: any) => (V extends "Number" | NumberConstructor ? number : V extends "Boolean" | BooleanConstructor ? boolean : V extends "String" | StringConstructor ? string : V extends "Array" | ArrayConstructor ? any[] : V extends "Object" | ObjectConstructor ? any : V extends "Function" | FunctionConstructor ? Function : V extends "Symbol" | SymbolConstructor ? Symbol : V extends null ? null : V extends undefined ? undefined : V);
type args = any[] | IArguments;
type Argu = (args: args | string, whence: string | Record<string, any>, spec?: Record<string, any>) => (typeof args extends string ? ((args: args) => Record<string, any>) : Record<string, any>);
declare function MakeArgu(name: string): Argu;
export type { Validate, Update, Context, Builder, Node, State, ShapeShape, };
export { Shape, G$, nodize, buildize, makeErr, stringify, truncate, expr, MakeArgu, build, Above, After, All, Any, Before, Below, Check, Child, Closed, Default, Define, Empty, Exact, Fault, Func, Ignore, Key, Len, Max, Min, Never, One, Open, Optional, Refer, Rename, Required, Skip, Some, Type, Rest, GAbove, GAfter, GAll, GAny, GBefore, GBelow, GCheck, GChild, GClosed, GDefault, GDefine, GEmpty, GExact, GFault, GFunc, GIgnore, GKey, GLen, GMax, GMin, GNever, GOne, GOpen, GOptional, GRefer, GRename, GRequired, GSkip, GSome, GType, GRest, };

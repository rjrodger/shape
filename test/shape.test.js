"use strict";
/* Copyright (c) 2021-2023 Richard Rodger and other contributors, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bar = exports.Foo = void 0;
const package_json_1 = __importDefault(require("../package.json"));
const Large = require('./large');
const Long = require('./long');
// Handle web (Shape) versus node ({Shape}) export.
let ShapeModule = require('../shape');
if (ShapeModule.Shape) {
    ShapeModule = ShapeModule.Shape;
}
const Shape = ShapeModule;
const G$ = Shape.G$;
const stringify = Shape.stringify;
const truncate = Shape.truncate;
const nodize = Shape.nodize;
const { Above, After, All, Any, Before, Below, Check, Closed, Define, Empty, Exact, Func, Max, Min, Never, One, Open, Refer, Rename, Required, Skip, Some, Child, Default, Optional, } = Shape;
class Foo {
    constructor(a) {
        this.a = -1;
        this.a = a;
    }
}
exports.Foo = Foo;
class Bar {
    constructor(b) {
        this.b = -2;
        this.b = b;
    }
}
exports.Bar = Bar;
describe('shape', () => {
    test('happy', () => {
        expect(Shape()).toBeDefined();
        expect(Shape().toString()).toMatch(/\[Shape G\$\d+ Any\]/);
        expect(Shape(undefined, { name: 'foo' }).toString()).toMatch(/\[Shape foo Any\]/);
        expect(Shape('x', { name: 'bar' }).toString()).toMatch(/\[Shape bar x\]/);
        let g0 = Shape({
            a: 'foo',
            b: 100
        });
        expect(g0({})).toEqual({ a: 'foo', b: 100 });
        expect(g0({ a: 'bar' })).toEqual({ a: 'bar', b: 100 });
        expect(g0({ b: 999 })).toEqual({ a: 'foo', b: 999 });
        expect(g0({ a: 'bar', b: 999 })).toEqual({ a: 'bar', b: 999 });
        expect(() => g0({ a: 'bar', b: 999, c: true })).toThrow('not allowed');
    });
    // (tide-display-help-buffer)
    test('type-infer', () => {
        let s0 = Shape({ a: String, b: 'B' });
        let v0 = s0({ a: 'A' });
        // console.log('v0', v0)
        expect(v0).toEqual({ a: 'A', b: 'B' });
        v0.a = 'AA';
        v0.b = 'BB';
        let s1 = Shape('x');
        let v1 = s1('y');
        expect(v1).toEqual('y');
        let s2 = Shape({ x: { y: Required(String) } });
        let v2 = s2({ x: { y: 'Y' } });
        expect(v2).toEqual({ x: { y: 'Y' } });
        let s3 = Shape({ x: { y: One(String, Number), z: One(String, Number) } });
        let v3 = s3({ x: { y: 1, z: 'Z' } });
        expect(v3).toEqual({ x: { y: 1, z: 'Z' } });
        let s4 = Shape({ x: Object });
        let v4 = s4({ x: { y: 'Y' } });
        expect(v4).toEqual({ x: { y: 'Y' } });
        expect(v4.x.y).toEqual('Y');
    });
    // TODO: type support - remove the any's
    test('valid-basic', () => {
        let g0 = Shape({ x: 1, y: 'Y' });
        let d0 = { x: 2 };
        if (g0.valid(d0)) {
            expect(d0).toEqual({ x: 2, y: 'Y' });
            expect(d0.x).toEqual(2);
            expect(d0.y).toEqual('Y');
        }
        let v0 = { z: true };
        expect(g0.valid(v0)).toEqual(false);
        expect(v0).toEqual({ z: true, x: 1, y: 'Y' });
        v0 = { z: true };
        let ctx0 = { err: [] };
        expect(g0.valid(v0, ctx0)).toEqual(false);
        expect(v0).toEqual({ z: true, x: 1, y: 'Y' });
        expect(ctx0.err[0].why).toEqual('closed');
        let v1 = {};
        expect(g0.match(v1)).toEqual(true);
        expect(v1).toEqual({});
        let v1e = { z: true };
        expect(g0.match(v1e)).toEqual(false);
        expect(v1e).toEqual({ z: true });
        let g0d = Shape(Open({ x: 1, y: 'Y' }));
        let d0d = { x: 2, z: true };
        let d0do = g0d(d0d);
        expect(d0do).toEqual({ x: 2, y: 'Y', z: true });
        expect(d0do.x).toEqual(2);
        expect(d0do.y).toEqual('Y');
        expect(d0do.z).toEqual(true);
        let g1 = Shape(Open({ x: Number, y: 'Y' }));
        let d1 = { x: 2, z: true };
        if (g1.valid(d1)) {
            expect(d1).toEqual({ x: 2, y: 'Y', z: true });
            expect(d1.x).toEqual(2);
            expect(d1.y).toEqual('Y');
            expect(d1.z).toEqual(true);
        }
        let g2 = Shape(Open({ x: { k: 1 }, y: 'Y' }));
        let d2 = { x: { k: 2 }, z: true };
        if (g2.valid(d2)) {
            expect(d2).toEqual({ x: { k: 2 }, y: 'Y', z: true });
            expect(d2.x).toEqual({ k: 2 });
            expect(d2.y).toEqual('Y');
            expect(d2.z).toEqual(true);
        }
        const shape = Shape({ x: 1, y: 'Y' });
        let data = { x: 2 };
        expect(shape.valid(data)).toEqual(true);
        expect(shape(data)).toEqual({ x: 2, y: 'Y' });
        expect(shape(data).x).toEqual(2);
        expect(shape(data).y).toEqual('Y');
        // CONSOLE-LOG(data.q) // UNCOMMENT TO VERIFY COMPILE FAILS
        let g3 = Shape({ ...new Foo(1) });
        // let d3 = { a: 11, x: true }
        let d3 = { a: 11 };
        if (g3.valid(d3)) {
            // expect(d3).toEqual({ a: 11, x: true })
            expect(d3).toEqual({ a: 11 });
            expect(d3.a).toEqual(11);
            // expect(d3.x).toEqual(true)
        }
        let g4 = Shape(Open({ x: 1 }));
        let d4 = { z: true };
        if (g4.valid(d4)) {
            expect(d4.x).toEqual(1);
            expect(d4.z).toEqual(true);
            // CONSOLE-LOG(d4.q) // UNCOMMENT TO VERIFY COMPILE FAILS
        }
    });
    test('readme-quick', () => {
        // Property a is optional, must be a Number, and defaults to 1.
        // Property b is required, and must be a String.
        const shape = Shape({ a: 1, b: String });
        // Object shape is good! Prints `{ a: 99, b: 'foo' }`
        expect(shape({ a: 99, b: 'foo' })).toEqual({ a: 99, b: 'foo' });
        // Object shape is also good. Prints `{ a: 1, b: 'foo' }`
        expect(shape({ b: 'foo' })).toEqual({ a: 1, b: 'foo' });
        // Object shape is bad. Throws an exception:
        expect(() => shape({ a: 'BAD' })).toThrow('Validation failed for property "a" with string "BAD" because the string is not of type number.\nValidation failed for property "b" with value "undefined" because the value is required.');
        // Object shape is bad. Throws an exception:
        expect(() => shape({ b: 'foo', c: true })).toThrow('Validation failed for object "{b:foo,c:true}" because the property "c" is not allowed.');
    });
    test('readme-options', () => {
        const optionShape = Shape({
            host: 'localhost',
            port: 8080
        });
        // console.log(optionShape({}))
        expect(optionShape()).toEqual({
            host: 'localhost',
            port: 8080
        });
        expect(optionShape({})).toEqual({
            host: 'localhost',
            port: 8080
        });
        expect(optionShape({ host: 'foo' })).toEqual({
            host: 'foo',
            port: 8080
        });
        expect(optionShape({ host: 'foo', port: undefined })).toEqual({
            host: 'foo',
            port: 8080
        });
        expect(optionShape({ host: 'foo', port: 9090 })).toEqual({
            host: 'foo',
            port: 9090
        });
        expect(() => optionShape({ host: 9090 })).toThrow('type');
        expect(() => optionShape({ port: '9090' })).toThrow('type');
        expect(() => optionShape({ host: '' })).toThrow('empty string is not allowed');
    });
    test('readme-deep', () => {
        const productListShape = Shape({
            products: [
                {
                    name: String,
                    img: 'generic.png'
                }
            ]
        });
        expect(productListShape({})).toEqual({ products: [] });
        let result = productListShape({
            products: [
                { name: 'Apple', img: 'apple.png' },
                { name: 'Pear', img: 'pear.png' },
                { name: 'Banana' } // Missing image!
            ]
        });
        // console.dir(result, { depth: null })
        expect(result).toEqual({
            products: [
                { name: 'Apple', img: 'apple.png' },
                { name: 'Pear', img: 'pear.png' },
                { name: 'Banana', img: 'generic.png' }
            ]
        });
    });
    test('readme-object', () => {
        let shape = Shape({
            foo: {
                bar: {
                    zed: String,
                    qaz: Number,
                }
            }
        });
        expect(shape({
            foo: {
                bar: {
                    zed: 'x',
                    qaz: 1
                }
            }
        })).toEqual({
            foo: {
                bar: {
                    zed: 'x',
                    qaz: 1
                }
            }
        });
        let openObject = Shape(Open({ a: 1 }));
        expect(openObject({ a: 11, b: 22 })).toEqual({ a: 11, b: 22 });
    });
    test('readme-regexp', () => {
        let shape = Shape({ countryCode: Check(/^[A-Z][A-Z]$/) });
        expect(shape({ countryCode: 'IE' })).toEqual({ countryCode: 'IE' });
        expect(() => shape({ countryCode: 'BAD' })).toThrow('Validation failed for property "countryCode" with string "BAD" because check "/^[A-Z][A-Z]$/" failed.');
        expect(() => shape({})).toThrow('Validation failed for property "countryCode" with value "undefined" because the value is required.');
        expect(() => shape({ countryCode: 123 })).toThrow('Validation failed for property "countryCode" with number "123" because check "/^[A-Z][A-Z]$/" failed.');
    });
    test('readme-recursive', () => {
        let tree = Shape({
            root: Define('BRANCH', {
                value: String,
                left: Refer('BRANCH'),
                right: Refer('BRANCH'),
            })
        });
        expect(tree({
            root: {
                value: 'A',
                left: {
                    value: 'AB',
                    left: {
                        value: 'ABC'
                    },
                    right: {
                        value: 'ABD'
                    },
                },
                right: {
                    value: 'AE',
                    left: {
                        value: 'AEF'
                    },
                },
            }
        })).toMatchObject({
            root: {
                value: 'A',
                left: {
                    value: 'AB',
                    left: {
                        value: 'ABC'
                    },
                    right: {
                        value: 'ABD'
                    },
                },
                right: {
                    value: 'AE',
                    left: {
                        value: 'AEF'
                    },
                },
            }
        });
        expect(() => tree({
            root: {
                value: 'A',
                left: {
                    value: 'AB',
                    left: {
                        value: 'ABC',
                        left: {
                            value: 123
                        },
                    },
                },
            }
        })).toThrow('Validation failed for property "root.left.left.left.value" with number "123" because the number is not of type string');
    });
    test('scalar-optional-basic', () => {
        let g0 = Shape(1);
        expect(g0(2)).toEqual(2);
        expect(g0()).toEqual(1);
        expect(() => g0('x')).toThrow('Validation failed for string "x" because the string is not of type number.');
    });
    test('object-optional-basic', () => {
        let g0 = Shape(Open({ x: 1 }));
        expect(g0({ x: 2, y: true, z: 's' })).toEqual({ x: 2, y: true, z: 's' });
        expect(g0({ x: 2 })).toEqual({ x: 2 });
        expect(g0({})).toEqual({ x: 1 });
        expect(g0()).toEqual({ x: 1 });
        expect(() => g0('s')).toThrow('Validation failed for string "s" because the string is not of type object.');
        expect(() => g0({ x: 't' })).toThrow('Validation failed for property "x" with string "t" because the string is not of type number.');
    });
    test('array-basic-optional', () => {
        let g0 = Shape([1]);
        expect(g0([11, 22, 33])).toEqual([11, 22, 33]);
        expect(g0([11, 22])).toEqual([11, 22]);
        expect(g0([11])).toEqual([11]);
        expect(g0([])).toEqual([]);
        expect(g0()).toEqual([]);
        expect(() => g0('s')).toThrow('Validation failed for string "s" because the string is not of type array.');
        expect(() => g0(['t'])).toThrow('Validation failed for index "0" with string "t" because the string is not of type number.');
        expect(() => g0(['t', 22])).toThrow('Validation failed for index "0" with string "t" because the string is not of type number.');
        expect(() => g0(['t', 33])).toThrow('Validation failed for index "0" with string "t" because the string is not of type number.');
        expect(() => g0([11, 't'])).toThrow('Validation failed for index "1" with string "t" because the string is not of type number.');
        expect(() => g0([11, 22, 't'])).toThrow('Validation failed for index "2" with string "t" because the string is not of type number.');
        let g1 = Shape([]);
        expect(g1([11, 22, 33])).toEqual([11, 22, 33]);
        expect(g1([11, 22])).toEqual([11, 22]);
        expect(g1([11])).toEqual([11]);
        expect(g1([])).toEqual([]);
        expect(g1()).toEqual([]);
        expect(() => g1('s')).toThrow('Validation failed for string "s" because the string is not of type array.');
        expect(g1(['t'])).toEqual(['t']);
        expect(g1(['t', 22])).toEqual(['t', 22]);
        expect(g1(['t', 33])).toEqual(['t', 33]);
        expect(g1([11, 't'])).toEqual([11, 't']);
        expect(g1([11, 22, 't'])).toEqual([11, 22, 't']);
    });
    test('function-optional-basic', () => {
        let f0t = () => true;
        let f0f = () => false;
        let g0 = Shape(f0t);
        expect(g0().toString()).toEqual('() => true');
        expect(g0(f0f).toString()).toEqual('() => false');
        expect(g0(() => null).toString()).toEqual('() => null');
        let g1 = Shape({ a: f0t });
        expect(g1().a.toString()).toEqual('() => true');
        expect(g1({ a: f0f }).a.toString()).toEqual('() => false');
        expect(g1({ a: () => null }).a.toString()).toEqual('() => null');
        function f1t() { return true; }
        expect(g0(f1t).toString().replace(/\s/g, ''))
            .toEqual('functionf1t(){returntrue;}');
        expect(g1({ a: f1t }).a.toString().replace(/\s/g, ''))
            .toEqual('functionf1t(){returntrue;}');
        function f1f() { return false; }
        let g2 = Shape({ a: f1t });
        expect(g2({ a: f1f }).a.toString().replace(/\s/g, ''))
            .toEqual('functionf1f(){returnfalse;}');
    });
    test('class-optional-basic', () => {
        class Planet {
            constructor(name) {
                this.name = name;
            }
        }
        const mars = new Planet('Mars');
        let g0 = Shape(Planet);
        expect(g0(mars)).toEqual(mars);
        expect(() => g0(1)).toThrow('not an instance of Planet');
        expect(() => g0(Planet)).toThrow('not an instance of Planet');
    });
    test('array-basic-required', () => {
        let g1 = Shape(Array);
        expect(g1([11, 22, 33])).toEqual([11, 22, 33]);
        expect(g1([11, 22])).toEqual([11, 22]);
        expect(g1([11])).toEqual([11]);
        expect(g1([])).toEqual([]);
        expect(() => g1()).toThrow('required');
        expect(() => g1('s')).toThrow('Validation failed for string "s" because the string is not of type array.');
        expect(g1(['t'])).toEqual(['t']);
        expect(g1(['t', 22])).toEqual(['t', 22]);
        expect(g1(['t', 33])).toEqual(['t', 33]);
        expect(g1([11, 't'])).toEqual([11, 't']);
        expect(g1([11, 22, 't'])).toEqual([11, 22, 't']);
        let g2 = Shape(Required([]));
        expect(g2([11, 22, 33])).toEqual([11, 22, 33]);
        expect(g2([11, 22])).toEqual([11, 22]);
        expect(g2([11])).toEqual([11]);
        expect(g2([])).toEqual([]);
        expect(() => g2()).toThrow('required');
        expect(() => g2('s')).toThrow('Validation failed for string "s" because the string is not of type array.');
        expect(g2(['t'])).toEqual(['t']);
        expect(g2(['t', 22])).toEqual(['t', 22]);
        expect(g2(['t', 33])).toEqual(['t', 33]);
        expect(g2([11, 't'])).toEqual([11, 't']);
        expect(g2([11, 22, 't'])).toEqual([11, 22, 't']);
    });
    test('spec-revert-skip-required', () => {
        let or = Shape(Skip(Required(1)));
        expect(or.spec()).toMatchObject({ r: false, p: true, v: 1, t: 'number' });
        let ror = Shape(Required(Skip(Required(1))));
        expect(ror.spec()).toMatchObject({ r: true, p: false, v: 1, t: 'number' });
        let ro = Shape(Required(Skip(1)));
        expect(ro.spec()).toMatchObject({ r: true, p: false, v: 1, t: 'number' });
        let oro = Shape(Skip(Required(Skip(1))));
        expect(oro.spec()).toMatchObject({ r: false, p: true, v: 1, t: 'number' });
    });
    test('match-basic', () => {
        let tmp = {};
        let g0 = Shape(Number);
        expect(g0.match(1)).toEqual(true);
        expect(g0.match('x')).toEqual(false);
        expect(g0.match(true)).toEqual(false);
        expect(g0.match({})).toEqual(false);
        expect(g0.match([])).toEqual(false);
        // Match does not mutate root
        let g1 = Shape({ a: { b: 1 } });
        expect(g1.match(tmp.a1 = {})).toEqual(true);
        expect(tmp.a1).toEqual({});
        expect(g1.match(tmp.a1 = { a: {} })).toEqual(true);
        expect(tmp.a1).toEqual({ a: {} });
        let c0 = { err: [] };
        expect(g1.match(tmp.a1 = { a: 1 }, c0)).toEqual(false);
        expect(tmp.a1).toEqual({ a: 1 });
        expect(c0.err[0].why).toEqual('type');
    });
    test('error-basic', () => {
        let g0 = Shape(Number);
        expect(g0(1)).toEqual(1);
        expect(() => g0('x'))
            .toThrow('Validation failed for string "x" because the string is not of type number.');
        let ctx0 = { err: [] };
        g0('x', ctx0);
        expect(ctx0).toMatchObject({
            err: [
                {
                    node: { t: 'number' },
                    value: 'x',
                    path: '',
                    why: 'type',
                    mark: 1050,
                    text: 'Validation failed for string "x" because the string is not of type number.',
                    use: {},
                }
            ]
        });
        try {
            g0('x');
        }
        catch (e) {
            expect(e.message).toEqual('Validation failed for string "x" because ' +
                'the string is not of type number.');
            expect(e).toMatchObject({
                shape: true,
                code: 'shape',
            });
            expect(e.desc()).toMatchObject({
                name: 'ShapeError',
                code: 'shape',
                err: [
                    {
                        key: undefined,
                        type: 'number',
                        node: { t: 'number' },
                        value: 'x',
                        path: '',
                        why: 'type',
                        mark: 1050,
                        text: 'Validation failed for string "x" because the string is not of type number.',
                        use: {},
                    }
                ],
                ctx: {}
            });
        }
        let g1 = Shape({ q: { a: String, b: Number } });
        let ctx1 = { err: [] };
        g1({ q: { a: 1, b: 'x' } }, ctx1);
        expect(ctx1).toMatchObject({
            err: [
                {
                    key: 'a',
                    node: { t: 'string' },
                    value: 1,
                    path: 'q.a',
                    why: 'type',
                    mark: 1050,
                    text: 'Validation failed for property "q.a" with number "1" because ' +
                        'the number is not of type string.',
                    use: {},
                },
                {
                    key: 'b',
                    node: { t: 'number' },
                    value: 'x',
                    path: 'q.b',
                    why: 'type',
                    mark: 1050,
                    text: 'Validation failed for property "q.b" with string "x" because the string is not of type number.',
                    use: {},
                }
            ]
        });
        try {
            g1({ q: { a: 1, b: 'x' } });
        }
        catch (e) {
            expect(e.message).toEqual(`Validation failed for property "q.a" with number "1" because the number is not of type string.
Validation failed for property "q.b" with string "x" because the string is not of type number.`);
            expect(e).toMatchObject({
                shape: true,
                code: 'shape',
            });
            expect(e.desc()).toMatchObject({
                name: 'ShapeError',
                code: 'shape',
                err: [
                    {
                        key: 'a',
                        node: { t: 'string' },
                        value: 1,
                        path: 'q.a',
                        why: 'type',
                        mark: 1050,
                        text: 'Validation failed for property "q.a" with number "1" because the number is not of type string.',
                        use: {},
                    },
                    {
                        key: 'b',
                        node: { t: 'number' },
                        value: 'x',
                        path: 'q.b',
                        why: 'type',
                        mark: 1050,
                        text: 'Validation failed for property "q.b" with string "x" because the string is not of type number.',
                        use: {},
                    }
                ],
                ctx: {}
            });
        }
    });
    test('error-custom', () => {
        let g0 = Shape(Number, { name: 'G0' });
        let ctx0 = { prefix: 'P0', suffix: 'S0' };
        expect(g0(1, ctx0)).toEqual(1);
        expect(() => g0('x', ctx0))
            .toThrow('G0: P0: Validation failed for string "x" because ' +
            'the string is not of type number. S0');
        let ctx1 = { prefix: 'P1', suffix: 'S1' };
        expect(g0(11, ctx1)).toEqual(11);
        expect(() => g0('y', ctx1))
            .toThrow('G0: P1: Validation failed for string "y" because ' +
            'the string is not of type number. S1');
    });
    test('shapes-basic', () => {
        let tmp = {};
        expect(Shape(String)('x')).toEqual('x');
        expect(Shape(Number)(1)).toEqual(1);
        expect(Shape(Boolean)(true)).toEqual(true);
        expect(Shape(BigInt)(BigInt(1))).toEqual(BigInt(1));
        expect(Shape(Object)({ x: 1 })).toEqual({ x: 1 });
        expect(Shape(Array)([1])).toEqual([1]);
        expect(Shape(Function)(tmp.f0 = () => true)).toEqual(tmp.f0);
        expect(Shape(Symbol)(tmp.s0 = Symbol('foo'))).toEqual(tmp.s0);
        expect(Shape(Error)(tmp.e0 = new Error())).toEqual(tmp.e0);
        expect(Shape(Date)(tmp.d0 = new Date())).toEqual(tmp.d0);
        expect(Shape(RegExp)(tmp.r0 = /a/)).toEqual(tmp.r0);
        expect(Shape(Map)(tmp.m0 = new Map())).toEqual(tmp.m0);
        expect(Shape(Foo)(tmp.c0 = new Foo(2))).toEqual(tmp.c0);
        expect(Shape('a')('x')).toEqual('x');
        expect(Shape(0)(1)).toEqual(1);
        expect(Shape(false)(true)).toEqual(true);
        expect(Shape(BigInt(-1))(BigInt(1))).toEqual(BigInt(1));
        expect(Shape({})({ x: 1 })).toEqual({ x: 1 });
        expect(Shape([])([1])).toEqual([1]);
        expect(Shape(() => null)(tmp.f0 = () => false)).toEqual(tmp.f0);
        expect(Shape(new Object())({ x: 1 })).toEqual({ x: 1 });
        expect(Shape(new Array())([1])).toEqual([1]);
        // FIX: no way to tell this apart from `function anonymous() {}` ?
        // expect(Shape(new Function())(tmp.nf0 = () => false)).toEqual(tmp.nf0)
        expect(Shape(Symbol('bar'))(tmp.s0)).toEqual(tmp.s0);
        expect(Shape(new Error('a'))(tmp.e1 = new Error('b'))).toEqual(tmp.e1);
        expect(Shape(new Date())(tmp.d1 = new Date(Date.now() - 1111))).toEqual(tmp.d1);
        // expect(Shape(new RegExp('a'))(tmp.r1 = /b/)).toEqual(tmp.r1)
        expect(Shape(new RegExp('a'))(tmp.r1 = 'a')).toEqual(tmp.r1);
        expect(Shape(new Foo(4))(tmp.c1 = new Foo(5))).toEqual(tmp.c1);
        expect(Shape(new Bar(6))(tmp.c2 = new Bar(7))).toEqual(tmp.c2);
        expect(Shape(G$({ v: () => null }))(tmp.f1 = () => false)).toEqual(tmp.f1);
        expect(Shape(null)(null)).toEqual(null);
        expect(() => Shape(null)(1)).toThrow('Validation failed for number "1" because the number is not of type null.');
        expect(Shape(Check((_v, u) => (u.val = 1, true)))(null)).toEqual(1);
        expect(() => Shape(String)(1)).toThrow(/not of type string/);
        expect(() => Shape(Number)('x')).toThrow(/not of type number/);
        expect(() => Shape(Boolean)('x')).toThrow(/not of type boolean/);
        expect(() => Shape(BigInt)('x')).toThrow(/not of type bigint/);
        expect(() => Shape(Object)('x')).toThrow(/not of type object/);
        expect(() => Shape(Array)('x')).toThrow(/not of type array/);
        expect(() => Shape(Function)('x')).toThrow(/not of type function/);
        expect(() => Shape(Symbol)('x')).toThrow(/not of type symbol/);
        expect(() => Shape(Error)('x')).toThrow(/not an instance of Error/);
        expect(() => Shape(Date)(/a/)).toThrow(/not an instance of Date/);
        expect(() => Shape(RegExp)(new Date()))
            .toThrow(/not an instance of RegExp/);
        expect(() => Shape(Foo)(tmp.c3 = new Bar(8)))
            .toThrow(/not an instance of Foo/);
        expect(() => Shape(Bar)(tmp.c4 = new Foo(9)))
            .toThrow(/not an instance of Bar/);
        expect(() => Shape('a')(1)).toThrow(/not of type string/);
        expect(() => Shape(0)('x')).toThrow(/not of type number/);
        expect(() => Shape(false)('x')).toThrow(/not of type boolean/);
        expect(() => Shape(BigInt(-1))('x')).toThrow(/not of type bigint/);
        expect(() => Shape({})('x')).toThrow(/ not of type object/);
        expect(() => Shape([])('x')).toThrow(/not of type array/);
        expect(() => Shape(() => null)('x'))
            .toThrow(/not of type function/);
        expect(() => Shape(Symbol('bar'))('x')).toThrow(/not of type symbol/);
        expect(() => Shape(new Error('x'))('x')).toThrow(/not an instance of Error/);
        expect(() => Shape(new Date())('x')).toThrow(/not an instance of Date/);
        expect(() => Shape(new RegExp('a'))('x'))
            .toThrow('Validation failed for string \"x\" because the string did not match /a/.');
        expect(() => Shape(new Foo(4))('a')).toThrow(/not an instance of Foo/);
        expect(() => Shape(new Bar(6))('a')).toThrow(/not an instance of Bar/);
        expect(() => Shape(new Foo(10))(new Bar(11)))
            .toThrow(/not an instance of Foo/);
        expect(() => Shape(new Bar(12))(new Foo(12)))
            .toThrow(/not an instance of Bar/);
        // expect(() => Shape(G$({ v: () => null }))('x'))
        //  .toThrow(/not of type function/)
        expect(Shape({ a: String })({ a: 'x' })).toEqual({ a: 'x' });
        expect(Shape({ a: Number })({ a: 1 })).toEqual({ a: 1 });
        expect(Shape({ a: Boolean })({ a: true })).toEqual({ a: true });
        expect(Shape({ a: Object })({ a: { x: 1 } })).toEqual({ a: { x: 1 } });
        expect(Shape({ a: RegExp })({ a: /x/ })).toEqual({ a: /x/ });
        expect(() => Shape({ a: String })({ a: 1 }))
            .toThrow(/not of type string/);
        expect(() => Shape({ a: Number })({ a: 'x' }))
            .toThrow(/not of type number/);
        expect(() => Shape({ a: Boolean })({ a: 'x' }))
            .toThrow(/not of type boolean/);
        expect(() => Shape({ a: Object })({ a: 'x' }))
            .toThrow(/not of type object/);
        expect(Shape([String])([])).toEqual([]);
        expect(Shape([String])(['x'])).toEqual(['x']);
        expect(Shape([String])(['x', 'y'])).toEqual(['x', 'y']);
        expect(Shape([Number])([])).toEqual([]);
        expect(Shape([Number])([1])).toEqual([1]);
        expect(Shape([Number])([1, 2])).toEqual([1, 2]);
        expect(Shape([Boolean])([])).toEqual([]);
        expect(Shape([Boolean])([true])).toEqual([true]);
        expect(Shape([Boolean])([true, false])).toEqual([true, false]);
        expect(Shape([Object])([])).toEqual([]);
        expect(Shape([Object])([{ x: 1 }])).toEqual([{ x: 1 }]);
        expect(Shape([Object])([{ x: 1 }, { y: 2 }])).toEqual([{ x: 1 }, { y: 2 }]);
        expect(Shape([RegExp])([])).toEqual([]);
        expect(Shape([RegExp])([/a/])).toEqual([/a/]);
        expect(Shape([RegExp])([/a/, /b/])).toEqual([/a/, /b/]);
        expect(Shape([Date])([])).toEqual([]);
        let d0 = new Date();
        expect(Shape([Date])([d0])).toEqual([d0]);
        let d1 = new Date();
        expect(Shape([Date])([d0, d1])).toEqual([d0, d1]);
        expect(() => Shape([String])([1]))
            .toThrow(/not of type string/);
        expect(() => Shape([Number])(['x']))
            .toThrow(/not of type number/);
        expect(() => Shape([Boolean])(['x']))
            .toThrow(/not of type boolean/);
        expect(() => Shape([Object])([1]))
            .toThrow(/not of type object/);
        expect(() => Shape([RegExp])(['not']))
            .toThrow(/not an instance of RegExp\./);
    });
    test('shapes-fails', () => {
        let tmp = {};
        let string0 = Shape(String);
        expect(string0('x')).toEqual('x');
        expect(string0('xy')).toEqual('xy');
        expect(() => string0('')).toThrow(/Validation failed for string "" because an empty string is not allowed./);
        expect(() => string0(1)).toThrow(/not of type string/);
        expect(() => string0(true)).toThrow(/not of type string/);
        expect(() => string0(BigInt(11))).toThrow(/not of type string/);
        expect(() => string0(null)).toThrow(/not of type string/);
        expect(() => string0({})).toThrow(/not of type string/);
        expect(() => string0([])).toThrow(/not of type string/);
        expect(() => string0(/a/)).toThrow(/not of type string/);
        expect(() => string0(NaN)).toThrow(/not of type string/);
        expect(() => string0(Infinity)).toThrow(/not of type string/);
        expect(() => string0(undefined)).toThrow(/value is required/);
        expect(() => string0(new Date())).toThrow(/not of type string/);
        expect(() => string0(new Foo(1))).toThrow(/not of type string/);
        let number0 = Shape(Number);
        expect(number0(1)).toEqual(1);
        expect(number0(Infinity)).toEqual(Infinity);
        expect(() => number0('x')).toThrow(/not of type number/);
        expect(() => number0(true)).toThrow(/not of type number/);
        expect(() => number0(BigInt(11))).toThrow(/not of type number/);
        expect(() => number0(null)).toThrow(/not of type number/);
        expect(() => number0({})).toThrow(/not of type number/);
        expect(() => number0([])).toThrow(/not of type number/);
        expect(() => number0(/a/)).toThrow(/not of type number/);
        expect(() => number0(NaN)).toThrow(/not of type number/);
        expect(() => number0(undefined)).toThrow(/value is required/);
        expect(() => number0(new Date())).toThrow(/not of type number/);
        expect(() => number0(new Foo(1))).toThrow(/not of type number/);
        let object0 = Shape(Object);
        expect(object0({})).toEqual({});
        expect(object0({ x: 1 })).toEqual({ x: 1 });
        expect(object0(tmp.r0 = /a/)).toEqual(tmp.r0);
        expect(object0(tmp.d0 = new Date())).toEqual(tmp.d0);
        expect(object0(tmp.f0 = new Foo(1))).toEqual(tmp.f0);
        expect(() => object0(1)).toThrow(/not of type object/);
        expect(() => object0('x')).toThrow(/not of type object/);
        expect(() => object0(true)).toThrow(/not of type object/);
        expect(() => object0(BigInt(11))).toThrow(/not of type object/);
        expect(() => object0(null)).toThrow(/not of type object/);
        expect(() => object0([])).toThrow(/not of type object/);
        expect(() => object0(NaN)).toThrow(/not of type object/);
        expect(() => object0(undefined)).toThrow(/value is required/);
        let array0 = Shape(Array);
        expect(array0([])).toEqual([]);
        expect(array0([11])).toEqual([11]);
        expect(() => array0('x')).toThrow(/not of type array/);
        expect(() => array0(true)).toThrow(/not of type array/);
        expect(() => array0(BigInt(11))).toThrow(/not of type array/);
        expect(() => array0(null)).toThrow(/not of type array/);
        expect(() => array0({})).toThrow(/not of type array/);
        expect(() => array0(/a/)).toThrow(/not of type array/);
        expect(() => array0(NaN)).toThrow(/not of type array/);
        expect(() => array0(undefined)).toThrow(/value is required/);
        expect(() => array0(new Date())).toThrow(/not of type array/);
        expect(() => array0(new Foo(1))).toThrow(/not of type array/);
    });
    test('shapes-builtins', () => {
        let d0 = new Date(2121, 1, 1);
        let g0 = Shape({ a: Date });
        expect(g0({ a: d0 })).toEqual({ a: d0 });
        expect(() => g0({})).toThrow('required');
        expect(() => g0({ a: Date })).toThrow('instance');
        expect(() => g0({ a: /QXQ/ })).toThrow(/QXQ.*instance/);
        let g1 = Shape({ a: Skip(Date) });
        expect(g1({ a: d0 })).toEqual({ a: d0 });
        expect(g1({ a: undefined })).toEqual({ a: undefined });
        expect(g1({})).toEqual({});
        let r0 = /a/;
        let g2 = Shape({ a: RegExp });
        expect(g2({ a: r0 })).toEqual({ a: r0 });
        expect(() => g2({})).toThrow('required');
        expect(() => g2({ a: RegExp })).toThrow('instance');
        expect(() => g2({ a: d0 })).toThrow(/2121.*instance/);
        let g3 = Shape({ a: Skip(RegExp) });
        expect(g3({ a: r0 })).toEqual({ a: r0 });
        expect(g3({})).toEqual({});
    });
    test('object-basic', () => {
        let g1 = Shape({ x: 1 });
        expect(g1()).toEqual({ x: 1 });
        expect(g1({})).toEqual({ x: 1 });
        expect(g1({ x: 11 })).toEqual({ x: 11 });
        expect(() => g1({ x: 11, y: 22 })).toThrow('Validation failed for object "{x:11,y:22}" because the property "y" is not allowed.');
        expect(() => g1({ x: 11, y: 22, z: 33 })).toThrow('Validation failed for object "{x:11,y:22,z:33}" because the properties "y, z" are not allowed.');
        let g2 = Shape({ x: 1, y: 2 });
        expect(g2()).toEqual({ x: 1, y: 2 });
        expect(g2({})).toEqual({ x: 1, y: 2 });
        expect(g2({ x: 11 })).toEqual({ x: 11, y: 2 });
        expect(g2({ x: 11, y: 22 })).toEqual({ x: 11, y: 22 });
        expect(() => g2({ x: 11, y: 22, z: 33 })).toThrow('Validation failed for object "{x:11,y:22,z:33}" because the property "z" is not allowed.');
        let g3 = Shape({ x: 1, y: 2, z: 3 });
        expect(g3()).toEqual({ x: 1, y: 2, z: 3 });
        expect(g3({})).toEqual({ x: 1, y: 2, z: 3 });
        expect(g3({ x: 11 })).toEqual({ x: 11, y: 2, z: 3 });
        expect(g3({ x: 11, y: 22 })).toEqual({ x: 11, y: 22, z: 3 });
        expect(g3({ x: 11, y: 22, z: 33 })).toEqual({ x: 11, y: 22, z: 33 });
        expect(() => g3({ x: 11, y: 22, z: 33, k: 44 })).toThrow('Validation failed for object "{x:11,y:22,z:33,k:44}" because the property "k" is not allowed.');
        let g1o = Shape(Open({ x: 1 }));
        expect(g1o()).toEqual({ x: 1 });
        expect(g1o({})).toEqual({ x: 1 });
        expect(g1o({ x: 11 })).toEqual({ x: 11 });
        expect(g1o({ x: 11, y: 22 })).toEqual({ x: 11, y: 22 });
        expect(g1o({ x: 11, y: 22, z: 33 })).toEqual({ x: 11, y: 22, z: 33 });
        let g2o = Shape(Open({ x: 1, y: 2 }));
        expect(g2o()).toEqual({ x: 1, y: 2 });
        expect(g2o({})).toEqual({ x: 1, y: 2 });
        expect(g2o({ x: 11 })).toEqual({ x: 11, y: 2 });
        expect(g2o({ x: 11, y: 22 })).toEqual({ x: 11, y: 22 });
        expect(g2o({ x: 11, y: 22, z: 33 })).toEqual({ x: 11, y: 22, z: 33 });
        let g3o = Shape(Open({ x: 1, y: 2, z: 3 }));
        expect(g3o()).toEqual({ x: 1, y: 2, z: 3 });
        expect(g3o({})).toEqual({ x: 1, y: 2, z: 3 });
        expect(g3o({ x: 11 })).toEqual({ x: 11, y: 2, z: 3 });
        expect(g3o({ x: 11, y: 22 })).toEqual({ x: 11, y: 22, z: 3 });
        expect(g3o({ x: 11, y: 22, z: 33 })).toEqual({ x: 11, y: 22, z: 33 });
        expect(g3o({ x: 11, y: 22, z: 33, k: 44 }))
            .toEqual({ x: 11, y: 22, z: 33, k: 44 });
        let g1v = Shape(Child(Number, { x: 1 }));
        expect(g1v()).toEqual({ x: 1 });
        expect(g1v({})).toEqual({ x: 1 });
        expect(g1v({ x: 11 })).toEqual({ x: 11 });
        expect(g1v({ x: 11, y: 22 })).toEqual({ x: 11, y: 22 });
        expect(g1v({ x: 11, y: 22, z: 33 })).toEqual({ x: 11, y: 22, z: 33 });
        expect(() => g1v({ x: 11, y: true })).toThrow('Validation failed for property "y" with boolean "true" because the boolean is not of type number.');
        let g2v = Shape(Child(Number, { x: 1, y: 2 }));
        expect(g2v()).toEqual({ x: 1, y: 2 });
        expect(g2v({})).toEqual({ x: 1, y: 2 });
        expect(g2v({ x: 11 })).toEqual({ x: 11, y: 2 });
        expect(g2v({ x: 11, y: 22 })).toEqual({ x: 11, y: 22 });
        expect(g2v({ x: 11, y: 22, z: 33 })).toEqual({ x: 11, y: 22, z: 33 });
        expect(() => g2v({ x: 11, y: 22, z: true })).toThrow('Validation failed for property "z" with boolean "true" because the boolean is not of type number.');
        let g3v = Shape(Child(Number, { x: 1, y: 2, z: 3 }));
        expect(g3v()).toEqual({ x: 1, y: 2, z: 3 });
        expect(g3v({})).toEqual({ x: 1, y: 2, z: 3 });
        expect(g3v({ x: 11 })).toEqual({ x: 11, y: 2, z: 3 });
        expect(g3v({ x: 11, y: 22 })).toEqual({ x: 11, y: 22, z: 3 });
        expect(g3v({ x: 11, y: 22, z: 33 })).toEqual({ x: 11, y: 22, z: 33 });
        expect(g3v({ x: 11, y: 22, z: 33, k: 44 }))
            .toEqual({ x: 11, y: 22, z: 33, k: 44 });
        expect(() => g3v({ x: 11, y: 22, z: 33, k: true })).toThrow('Validation failed for property "k" with boolean "true" because the boolean is not of type number.');
        // Empty object is Open
        let g4 = Shape({});
        expect(g4()).toEqual({});
        expect(g4({})).toEqual({});
        expect(g4({ x: 1 })).toEqual({ x: 1 });
        expect(g4({ x: 1, y: 'a' })).toEqual({ x: 1, y: 'a' });
        let g5 = Shape({ k: {} });
        expect(g5()).toEqual({ k: {} });
        expect(g5({})).toEqual({ k: {} });
        expect(g5({ k: {} })).toEqual({ k: {} });
        expect(g5({ k: { n: true } })).toEqual({ k: { n: true } });
        expect(g5({ k: { n: true, m: NaN } })).toEqual({ k: { n: true, m: NaN } });
        expect(() => g5({ x: 1 })).toThrow('not allowed');
        expect(() => Shape({ x: 1 })('q')).toThrow(/type object/);
        expect(() => Shape({ y: { x: 1 } })({ y: 'q' })).toThrow(/type object/);
    });
    test('required-cover', () => {
        const v0 = Shape(Required(Any()));
        expect(v0(1)).toEqual(1);
        expect(() => v0()).toThrow('required');
        const o0 = Shape({ a: Required(Any()) });
        expect(o0({ a: 1 })).toEqual({ a: 1 });
        expect(() => o0({})).toThrow('required');
        const a0 = Shape([Required(Any())]);
        expect(a0([])).toEqual([]); // empty array is allowed
        expect(a0([1])).toEqual([1]);
        expect(a0([1, 2])).toEqual([1, 2]);
        expect(a0([1, 2, 3])).toEqual([1, 2, 3]);
    });
    test('shapes-edges', () => {
        // NaN is actually Not-a-Number (whereas 'number' === typeof(NaN))
        const num0 = Shape(1);
        expect(num0(1)).toEqual(1);
        expect(() => num0(NaN)).toThrow(/not of type number/);
        const nan0 = Shape(NaN);
        expect(nan0(NaN)).toEqual(NaN);
        expect(() => nan0(1)).toThrow(/not of type nan/);
        // Empty strings only allowed by Empty() builder.
        const rs0 = Shape(String);
        expect(rs0('x')).toEqual('x');
        expect(() => rs0('')).toThrow('Validation failed for string "" because an empty string is not allowed.');
        const rs0e = Shape(Empty(String));
        expect(rs0e('x')).toEqual('x');
        expect(rs0e('')).toEqual('');
        expect(() => rs0e()).toThrow('required');
        expect(() => rs0e(undefined)).toThrow('required');
        const os0 = Shape('x');
        expect(() => os0('')).toThrow('empty string is not allowed');
        expect(os0()).toEqual('x');
        expect(os0(undefined)).toEqual('x');
        expect(os0('x')).toEqual('x');
        expect(os0('y')).toEqual('y');
        const os0e = Shape(Empty('x'));
        expect(os0e('')).toEqual('');
        expect(os0e()).toEqual('x');
        expect(os0e(undefined)).toEqual('x');
        expect(os0e('x')).toEqual('x');
        expect(os0e('y')).toEqual('y');
        const os0e2 = Shape(Empty(''));
        expect(os0e2('')).toEqual('');
        expect(os0e2()).toEqual('');
        expect(os0e2(undefined)).toEqual('');
        expect(os0e2('x')).toEqual('x');
        expect(os0e2('y')).toEqual('y');
        // Use literal '' as a shortcut
        const os0e3 = Shape('');
        expect(os0e3('')).toEqual('');
        expect(os0e3()).toEqual('');
        expect(os0e3(undefined)).toEqual('');
        expect(os0e3('x')).toEqual('x');
        expect(os0e3('y')).toEqual('y');
        const os1e = Shape(Skip(Empty(String)));
        expect(os1e()).toEqual(undefined);
        expect(os1e('')).toEqual('');
        expect(os1e('x')).toEqual('x');
        const os2e = Shape(Skip(String).Empty());
        expect(os2e()).toEqual(undefined);
        expect(os2e('')).toEqual('');
        expect(os2e('x')).toEqual('x');
        const os1eO = Shape({ a: Skip(Empty(String)) });
        expect(os1eO({})).toEqual({});
        expect(os1eO({ a: '' })).toEqual({ a: '' });
        expect(os1eO({ a: 'x' })).toEqual({ a: 'x' });
        // Long values are truncated in error descriptions.
        expect(() => Shape(Number)('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
            .toThrow('Validation failed for string "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa..." because the string is not of type number.');
        // Explicit `undefined` and `null`
        const u0 = Shape({ a: undefined });
        expect(u0({ a: undefined })).toEqual({ a: undefined });
        expect(u0({})).toEqual({ a: undefined });
        const u0n = Shape({ a: null });
        expect(u0n({ a: null })).toEqual({ a: null });
        expect(u0n({})).toEqual({ a: null });
        expect(() => u0n({ a: 1 })).toThrow('type');
        const u1 = Shape({ a: Required(undefined) });
        expect(u1({ a: undefined })).toEqual({ a: undefined });
        expect(() => u1({})).toThrow('required');
        const u1n = Shape({ a: Required(null) });
        expect(u1n({ a: null })).toEqual({ a: null });
        expect(() => u1n({})).toThrow('required');
        expect(() => u1n({ a: 1 })).toThrow('type');
        const u2 = Shape({ a: Required(NaN) });
        expect(u2({ a: NaN })).toEqual({ a: NaN });
        expect(() => u2({})).toThrow('required');
        // Required does inject undefined
        let r0 = Shape({ a: Boolean, b: Required({ x: Number }), c: Required([]) });
        let o0 = {};
        expect(() => r0(o0)).toThrow('required');
        expect(o0).toEqual({});
        expect(o0.hasOwnProperty('a')).toBeFalsy();
        expect(o0.hasOwnProperty('b')).toBeFalsy();
        expect(o0.hasOwnProperty('c')).toBeFalsy();
    });
    test('function-basic', () => {
        function Qaz() { }
        let g0 = Shape(Func(Qaz)); // needed other Foo is considered a class
        let tmp = {};
        expect(g0()).toEqual(Qaz);
        expect(g0(tmp.f0 = () => true)).toEqual(tmp.f0);
    });
    test('regexp-basic', () => {
        let g0 = Shape(/a/);
        expect(g0('a')).toEqual('a');
        expect(g0('xax')).toEqual('xax');
        expect(() => g0('x')).toThrow('Validation failed for string "x" because the string did not match /a/.');
        let g1 = Shape({ b: /a/ });
        expect(g1({ b: 'a' })).toEqual({ b: 'a' });
        expect(g1({ b: 'xax' })).toEqual({ b: 'xax' });
        expect(() => g1({ b: 'x' })).toThrow('Validation failed for property "b" with string "x" because the string did not match /a/.');
        expect(() => g1({})).toThrow('Validation failed for property "b" with value "undefined" because the value is not of type string.');
        let g2 = Shape({ b: Optional(/a/) });
        expect(g2({ b: 'a' })).toEqual({ b: 'a' });
        expect(g2({ b: 'xax' })).toEqual({ b: 'xax' });
        expect(g2({})).toEqual({});
        expect(() => g2({ b: 'x' })).toThrow('Validation failed for property "b" with string "x" because the string did not match /a/.');
    });
    test('api-object', () => {
        // This is an allowed way to get shape builders
        const { Required } = Shape;
        let obj01 = Shape({
            a: { x: 1 },
            b: Skip({ y: 2 }),
            c: Skip({ z: Skip({ k: 3 }) }),
        });
        expect(obj01()).toEqual({ a: { x: 1 } });
        expect(obj01({})).toEqual({ a: { x: 1 } });
        expect(obj01({ b: {} })).toEqual({ a: { x: 1 }, b: { y: 2 } });
        expect(obj01({ c: {} })).toEqual({ a: { x: 1 }, c: {} });
        expect(obj01({ c: { z: {} } })).toEqual({ a: { x: 1 }, c: { z: { k: 3 } } });
        let obj11 = Shape({
            people: Required({}).Child({ name: String, age: Number })
        });
        expect(obj11({
            people: {
                alice: { name: 'Alice', age: 99 },
                bob: { name: 'Bob', age: 98 },
            }
        })).toEqual({
            people: {
                alice: { name: 'Alice', age: 99 },
                bob: { name: 'Bob', age: 98 },
            }
        });
        expect(() => obj11({
            people: {
                alice: { name: 'Alice', age: 99 },
                bob: { name: 'Bob' }
            }
        })).toThrow('Validation failed for property "people.bob.age" with value "undefined" because the value is required.');
        expect(() => obj11({})).toThrow('Validation failed for property "people" with value "undefined" because the value is required.');
        let shape = Shape({
            foo: Number,
            bar: Required({
                zed: Boolean
            })
        });
        // This passes, returning the value unchanged.
        shape({ foo: 1, bar: { zed: false } });
        // These fail, throwing an Error.
        expect(() => shape({ bar: { zed: false } })).toThrow('required'); // foo is required
        expect(() => shape({ foo: 'abc', bar: { zed: false } })).toThrow('number'); // foo is not a number
        expect(() => shape({ foo: 1 })).toThrow('required'); // bar is required
        expect(() => shape({ foo: 1, bar: {} })).toThrow('required'); // bar.zed is required
        expect(() => shape({ foo: 1, bar: { zed: false, baz: 2 }, qaz: 3 })).toThrow('not allowed'); // new properties are not allowed
        let strictShape = Shape({ a: { b: String } });
        // Passes
        expect(strictShape({ a: { b: 'ABC' } })).toEqual({ a: { b: 'ABC' } });
        // Fails, even though a is not required, because a.b is required.
        expect(() => strictShape({})).toThrow('Validation failed for property "a.b" with value "undefined" because the value is required.');
        let easyShape = Shape({ a: Skip({ b: String }) });
        // Now both pass
        expect(easyShape({ a: { b: 'ABC' } })).toEqual({ a: { b: 'ABC' } });
        expect(easyShape({})).toEqual({});
        // This still fails, as `a` is now defined, and needs `b`
        expect(() => easyShape({ a: {} })).toThrow('Validation failed for property "a.b" with value "undefined" because the value is required.');
        const { Open } = Shape;
        shape = Shape(Open({
            a: 1
        }));
        expect(shape({ a: 11, b: 22 })).toEqual({ a: 11, b: 22 });
        expect(shape({ b: 22, c: 'foo' })).toEqual({ a: 1, b: 22, c: 'foo' });
        expect(() => shape({ a: 'foo' })).toThrow('type');
        shape = Shape(Open({
            a: Open({
                b: 1
            })
        }));
        expect(shape({ a: { b: 11, c: 22 }, d: 33 }))
            .toEqual({ a: { b: 11, c: 22 }, d: 33 });
        const { Child } = Shape;
        shape = Shape(Child(String, {
            a: 123,
        }));
        // All non-explicit properties must be a String
        expect(shape({ a: 11, b: 'abc' })).toEqual({ a: 11, b: 'abc' }); // b is a string
        expect(shape({ c: 'foo', d: 'bar' })).toEqual({ a: 123, c: 'foo', d: 'bar' }); // c and d are strings
        // These fail
        expect(() => shape({ a: 'abc' })).toThrow('number'); // a must be a number
        expect(() => shape({ b: { x: 1 } })).toThrow('string'); // b must be a string
    });
    test('api-array', () => {
        let g1 = Shape([Number]);
        expect(g1()).toEqual([]);
        expect(g1([])).toEqual([]);
        expect(g1([1])).toEqual([1]);
        expect(g1([1, 2])).toEqual([1, 2]);
        expect(g1([1, 2, 3])).toEqual([1, 2, 3]);
        expect(g1([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
        expect(() => g1([1, 2, 'x'])).toThrow('type');
        let g2 = Shape([{ x: 1 }]);
        expect(g2()).toEqual([]);
        expect(g2([])).toEqual([]);
        expect(g2([{ x: 123 }])).toEqual([{ x: 123 }]);
        expect(g2([{ x: 123 }, { x: 456 }])).toEqual([{ x: 123 }, { x: 456 }]);
        expect(g2([{}])).toEqual([{ x: 1 }]);
        expect(g2([{ x: 123 }, {}])).toEqual([{ x: 123 }, { x: 1 }]);
        expect(() => g2([{ x: 123, y: 'a' }, { x: 456 }]))
            .toThrow('not allowed');
        expect(() => g2([{ x: 123 }, { x: 456, y: 'a' }]))
            .toThrow('not allowed');
        expect(() => g2([{ x: 'a' }])).toThrow('type');
        expect(() => g2([{ x: 1 }, { x: 'a' }])).toThrow('type');
        let gc1 = Shape(Closed([Number, String, Boolean]));
        expect(gc1([123, 'abc', true])).toEqual([123, 'abc', true]);
        expect(() => gc1(['bad'])).toThrow('type');
        expect(() => gc1([123])).toThrow('required');
        expect(() => gc1([123, 'abc', true, 'extra'])).toThrow('not allowed');
        let gc2 = Shape(Closed([1, 'a', true]));
        expect(gc2()).toEqual([1, 'a', true]);
        expect(gc2([])).toEqual([1, 'a', true]);
        expect(gc2([2])).toEqual([2, 'a', true]);
        expect(gc2([2, 'b'])).toEqual([2, 'b', true]);
        expect(gc2([2, 'b', false])).toEqual([2, 'b', false]);
        expect(gc2([2, undefined, false])).toEqual([2, 'a', false]);
        expect(gc2([2, , false])).toEqual([2, 'a', false]);
        expect(() => gc2([2, 'b', false, 'bad'])).toThrow('not allowed');
        // 2 or more elements, so considered Closed
        let gc3 = Shape([{ x: 1 }, Required({ y: true })]);
        expect(gc3([{ x: 2 }, { y: false }])).toEqual([{ x: 2 }, { y: false }]);
        expect(gc3([undefined, { y: false }])).toEqual([{ x: 1 }, { y: false }]);
        expect(gc3([{ x: 2 }, {}])).toEqual([{ x: 2 }, { y: true }]);
        expect(() => gc3([{ x: 2 }, undefined])).toThrow('required');
        expect(() => gc3([{ x: 2 }])).toThrow('required');
        let gc4 = Shape({ a: Closed([{ x: 1 }, { y: { z: 'Z' } }]) });
        expect(gc4()).toEqual({ 'a': [{ 'x': 1 }, { 'y': { 'z': 'Z' } }] });
        expect(gc4({})).toEqual({
            'a': [{ 'x': 1 }, {
                    'y': {
                        'z': 'Z'
                    }
                }]
        });
        expect(gc4({ a: undefined }))
            .toEqual({ 'a': [{ 'x': 1 }, { 'y': { 'z': 'Z' } }] });
        expect(gc4({ a: [] })).toEqual({ 'a': [{ 'x': 1 }, { 'y': { 'z': 'Z' } }] });
        expect(() => gc4({ a: {} })).toThrow('Validation failed for property "a" with object "{}" because the object is not of type array.');
    });
    test('api-length', () => {
        let g1 = Shape(Max(2, []));
        expect(g1([1])).toEqual([1]);
        expect(g1(['a', true])).toEqual(['a', true]);
        expect(() => g1([1, 2, 3])).toThrow('maximum length of 2');
        let g2 = Shape(Min(2, [Number]));
        expect(g2([11, 22])).toEqual([11, 22]);
        expect(g2([11, 22, 33])).toEqual([11, 22, 33]);
        expect(() => g2([11])).toThrow('minimum');
        expect(() => g2([])).toThrow('minimum');
        let g3 = Shape(Max(2, String));
        expect(g3('a')).toEqual('a');
        expect(g3('ab')).toEqual('ab');
        expect(() => g3('abc')).toThrow('maximum');
        let g4 = Shape(Max(2, {}));
        expect(g4({ a: 1 })).toEqual({ a: 1 });
        expect(g4({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
        expect(() => g4({ a: 1, b: 2, c: 3 })).toThrow('maximum');
    });
    test('api-functions', () => {
        let f0 = () => true;
        let f1 = () => false;
        let { G$ } = Shape;
        let shape = Shape({ fn: G$({ v: f0, f: f0 }) });
        expect(shape({})).toEqual({ fn: f0 });
        expect(shape({ fn: f1 })).toEqual({ fn: f1 });
        let tmp = {};
        shape = Shape({
            fn: tmp.d0 = () => true
        });
        expect(shape({ fn: tmp.f0 = () => false })).toEqual({ fn: tmp.f0 });
        expect(shape({})).toEqual({ fn: tmp.d0 });
    });
    test('api-custom', () => {
        let shape = Shape({ a: Check((v) => 10 < v) });
        expect(shape({ a: 11 })).toEqual({ a: 11 }); // passes, as 10 < 11 is true
        expect(() => shape({ a: 9 })).toThrow('Validation failed for property "a" with number "9" because check "(v) => 10 < v" failed.'); // fails, as 10 < 9 is false
        shape = Shape({
            a: Check((value, update) => {
                update.val = value * 2;
                return true; // Remember to return true to indicate value is valid!
            })
        });
        expect(shape({ a: 3 })).toEqual({ a: 6 });
        shape = Shape({
            a: Check((_value, update) => {
                update.err = 'BAD VALUE $VALUE AT $PATH';
                return false; // always fails
            })
        });
        expect(() => shape({ a: 3 })).toThrow("BAD VALUE 3 AT a");
        shape = Shape({
            a: Check((value, update, state) => {
                update.val = value + ` KEY=${state.key}`;
                return true;
            })
        });
        expect(shape({ a: 3 })).toEqual({ a: '3 KEY=a' }); // returns { a: '3 KEY=a'}
    });
    test('type-default-optional', () => {
        let f0 = () => true;
        let g0 = Shape({
            string: 's',
            number: 1,
            boolean: true,
            object: { x: 2 },
            array: [3],
            function: G$({ t: 'function', v: f0, f: f0 })
        });
        expect(g0({})).toMatchObject({
            string: 's',
            number: 1,
            boolean: true,
            object: { x: 2 },
            array: [],
            function: f0
        });
        expect(g0({
            string: 'S',
            number: 11,
            boolean: false,
            object: { x: 22 },
            array: [33],
        })).toMatchObject({
            string: 'S',
            number: 11,
            boolean: false,
            object: { x: 22 },
            array: [33],
        });
    });
    test('type-native-required', () => {
        let g0 = Shape({
            string: String,
            number: Number,
            boolean: Boolean,
            object: Object,
            array: Array,
            function: Function,
        });
        let o0 = {
            string: 's',
            number: 1,
            boolean: true,
            object: { x: 2 },
            array: [3],
            function: () => true
        };
        expect(g0(o0)).toMatchObject(o0);
        let e0 = Shape({ s0: String, s1: 'x' });
        expect(e0({ s0: 'a' })).toMatchObject({ s0: 'a', s1: 'x' });
        expect(() => e0({ s0: 1 })).toThrow(/Validation failed for property "s0" with number "1" because the number is not of type string\./);
        expect(() => e0({ s1: 1 })).toThrow(/Validation failed for property "s0" with value "undefined" because the value is required\.\nValidation failed for property "s1" with number "1" because the number is not of type string\./);
    });
    test('type-native-optional', () => {
        let { Skip } = Shape;
        // Explicit Skip over native type sets no value.
        let g0 = Shape({
            string: Skip(String),
            number: Skip(Number),
            boolean: Skip(Boolean),
            object: Skip(Object),
            array: Skip(Array),
            function: Skip(Function),
        });
        expect(g0({})).toEqual({});
    });
    test('array-repeating-elements', () => {
        let g0 = Shape({
            a: [String]
        });
        expect(g0({ a: [] })).toEqual({ a: [] });
        expect(g0({ a: ['X'] })).toEqual({ a: ['X'] });
        expect(g0({ a: ['X', 'Y'] })).toEqual({ a: ['X', 'Y'] });
        expect(g0({ a: ['X', 'Y', 'Z'] })).toEqual({ a: ['X', 'Y', 'Z'] });
        expect(() => g0({ a: [null] })).toThrow(/"a.0".*"null".*type string/);
        expect(() => g0({ a: [''] })).toThrow('Validation failed for index "a.0" with string "" because an empty string is not allowed.');
        expect(() => g0({ a: [11] })).toThrow(/"a.0".*"11".*type string/);
        expect(() => g0({ a: ['X', 11] })).toThrow(/"a.1".*"11".*type string/);
        expect(() => g0({ a: ['X', 'Y', 11] })).toThrow(/"a.2".*"11".*type string/);
        expect(() => g0({ a: ['X', 'Y', 'Z', 11] })).toThrow(/"a.3".*"11".*type string/);
        expect(() => g0({ a: ['X', null] })).toThrow(/"a.1".*"null".*type string/);
        expect(() => g0({ a: ['X', ''] })).toThrow('Validation failed for index "a.1" with string "" because an empty string is not allowed.');
        expect(() => g0({ a: [11, 'K'] })).toThrow(/"a.0".*"11".*string/);
        expect(() => g0({ a: ['X', 11, 'K'] })).toThrow(/"a.1".*"11".*string/);
        expect(() => g0({ a: ['X', 'Y', 11, 'K'] })).toThrow(/"a.2".*"11".*string/);
        expect(() => g0({ a: ['X', 'Y', 'Z', 11, 'K'] })).toThrow(/"a.3".*"11".*string/);
        expect(() => g0({ a: [22, 'Y', 11, 'K'] })).toThrow(/"a.0".*"22".*"a.2".*"11"/s);
        expect(() => g0({ a: ['X', 'Y', 'Z', 11, 'K', 'L'] })).toThrow(/"a.3".*"11"/);
        // Zero or more elements of shape.
        let g1 = Shape([String]);
        expect(g1(['X', 'Y'])).toEqual(['X', 'Y']);
        expect(() => g1(['X', 1])).toThrow(/Validation failed for index "1" with number "1" because the number is not of type string\./);
        // Empty array means any element
        let g2 = Shape([]);
        expect(g2()).toEqual([]);
        expect(g2([])).toEqual([]);
        expect(g2([1])).toEqual([1]);
        expect(g2([1, 'a'])).toEqual([1, 'a']);
        expect(g2([1, 'a', true])).toEqual([1, 'a', true]);
        expect(g2([, 1, 'a', true])).toEqual([undefined, 1, 'a', true]);
        expect(g2([null, 1, , 'a', true])).toEqual([null, 1, undefined, 'a', true]);
        expect(g2([null, 1, , 'a', true])).toEqual([null, 1, undefined, 'a', true]);
        // Required with single element is redundant
        let g3 = Shape([Required({ x: 1 })]);
        expect(g3([{ x: 11 }])).toEqual([{ x: 11 }]);
        expect(g3([{ x: 11 }, { x: 22 }])).toEqual([{ x: 11 }, { x: 22 }]);
        expect(g3([])).toEqual([]);
        expect(g3()).toEqual([]);
        // Single element is the same as Value(...)
        let g4 = Shape([Number]);
        expect(g4()).toEqual([]);
        expect(g4([])).toEqual([]);
        expect(g4([1])).toEqual([1]);
        expect(g4([1, 2])).toEqual([1, 2]);
        expect(g4([1, 2, 3])).toEqual([1, 2, 3]);
        expect(() => g4(['a'])).toThrow('Validation failed for index "0" with string "a" because the string is not of type number.');
        expect(() => g4([1, 'a'])).toThrow('Validation failed for index "1" with string "a" because the string is not of type number.');
        expect(() => g4([1, 2, 'a'])).toThrow('Validation failed for index "2" with string "a" because the string is not of type number.');
        // NOTE: array without spec can hold anything.
        let g6 = Shape([]);
        expect(g6([null, 1, 'x', true])).toEqual([null, 1, 'x', true]);
        let g7 = Shape([Never()]);
        expect(g7([])).toEqual([]);
        expect(() => g7([1])).toThrow('Validation failed for index "0" with number "1" because no value is allowed.');
        expect(() => g7(new Array(1))).toThrow('Validation failed for index "0" with value "undefined" because no value is allowed.');
        let g8 = Shape([1]);
        expect(g8(new Array(3))).toEqual([1, 1, 1]);
        let a0 = [11, 22, 33];
        delete a0[1];
        expect(g8(a0)).toEqual([11, 1, 33]);
        let g9 = Shape([null]);
        expect(g9([null, null])).toEqual([null, null]);
        let g10 = Shape([{ x: 1 }]);
        expect(g10([])).toEqual([]);
        expect(g10([{ x: 11 }])).toEqual([{ x: 11 }]);
        expect(g10([{ x: 11 }, { x: 22 }])).toEqual([{ x: 11 }, { x: 22 }]);
        expect(g10([{ x: 11 }, { x: 22 }, { x: 33 }]))
            .toEqual([{ x: 11 }, { x: 22 }, { x: 33 }]);
        expect(() => g10(['q'])).toThrow(/"0".*"q".*type object/);
        expect(() => g10([{ x: 11 }, 'q'])).toThrow(/"1".*"q".*type object/);
        expect(() => g10([{ x: 11 }, { y: 22 }, 'q'])).toThrow(/"2".*"q".*type object/);
        expect(() => g10([{ x: 11 }, { y: 22 }, { z: 33 }, 'q'])).toThrow(/"3".*"q".*type object/);
        expect(() => g10(['q', { k: 99 }])).toThrow(/"0".*"q".*type object/);
        expect(() => g10([{ x: 11 }, 'q', { k: 99 }])).toThrow(/"1".*"q".*type object/);
        expect(() => g10([{ x: 11 }, { y: 22 }, 'q', { k: 99 }]))
            .toThrow(/"2".*"q".*type object/);
        expect(() => g10([{ x: 11 }, { y: 22 }, { z: 33 }, 'q', { k: 99 }]))
            .toThrow(/"3".*"q".*type object/);
    });
    test('array-closed', () => {
        // Exact set of elements.
        let g2 = Shape([{ x: 1 }, { y: true }]);
        expect(g2([{ x: 2 }, { y: false }])).toEqual([{ x: 2 }, { y: false }]);
        expect(() => g2([{ x: 2 }, { y: false }, 'Q'])).toThrow('Validation failed for array "[{x:2},{y:false},Q]" because the index "2" is not allowed.');
        expect(() => g2([{ x: 'X' }, { y: false }])).toThrow('Validation failed for property "0.x" with string "X" because the string is not of type number.');
        expect(() => g2(['Q', { y: false }])).toThrow('Validation failed for index "0" with string "Q" because the string is not of type object.');
        expect(g2([{ x: 2 }])).toEqual([{ x: 2 }, { y: true }]);
        expect(g2([{ x: 2 }, undefined])).toEqual([{ x: 2 }, { y: true }]);
        expect(g2([undefined, { y: false }])).toEqual([{ x: 1 }, { y: false }]);
        expect(g2([, { y: false }])).toEqual([{ x: 1 }, { y: false }]);
        let g3 = Shape(Closed([Any()]));
        expect(g3([])).toEqual([]);
        expect(g3([1])).toEqual([1]);
        expect(() => g3([1, 'x'])).toThrow('not allowed');
        expect(g3(new Array(1))).toEqual([undefined]);
        expect(() => g3(new Array(2))).toThrow('not allowed');
        let g4 = Shape(Closed([1]));
        expect(g4([])).toEqual([1]);
        expect(g4([1])).toEqual([1]);
        expect(() => g4(['a'])).toThrow('type');
        expect(() => g4([1, 2])).toThrow('not allowed');
        expect(g4(new Array(1))).toEqual([1]);
        expect(() => g4(new Array(2))).toThrow('not allowed');
        let g5 = Shape(Closed([Number]));
        expect(() => g5([])).toThrow('required');
        expect(g5([1])).toEqual([1]);
        expect(() => g5(['a'])).toThrow('type');
        expect(() => g5([1, 2])).toThrow('not allowed');
        expect(() => g5(new Array(1))).toThrow('required');
        expect(() => g5(new Array(2))).toThrow('not allowed');
        let g6 = Shape(Closed([Number, String, Boolean]));
        expect(g6([1, 'a', true])).toEqual([1, 'a', true]);
        expect(g6([0, 'b', false])).toEqual([0, 'b', false]);
        expect(() => g6([0, 'b', false, 1])).toThrow('not allowed');
        expect(() => g6(['a'])).toThrow('type');
        expect(() => g6([1, 2])).toThrow('required');
        expect(() => g6(new Array(0))).toThrow('required');
        expect(() => g6(new Array(1))).toThrow('required');
        expect(() => g6(new Array(2))).toThrow('required');
        expect(() => g6(new Array(3))).toThrow('required');
        expect(() => g6(new Array(4))).toThrow('not allowed');
        let g7 = Shape(Closed([1, 'a']));
        expect(g7([])).toEqual([1, 'a']);
        expect(g7([, 'b'])).toEqual([1, 'b']);
    });
    test('object-properties', () => {
        // NOTE: unclosed object without props can hold anything
        let g0 = Shape({});
        expect(g0({ a: null, b: 1, c: 'x', d: true }))
            .toEqual({ a: null, b: 1, c: 'x', d: true });
        let g1 = Shape(Closed({}));
        expect(g1({})).toEqual({});
        expect(() => g1({ a: null, b: 1, c: 'x', d: true })).toThrow('Validation failed for object "{a:null,b:1,c:x,d:true}" because the properties "a, b, c, d" are not allowed.');
    });
    test('check-basic', () => {
        let g0 = Shape({ a: Check((v) => v > 10) });
        expect(g0({ a: 11 })).toMatchObject({ a: 11 });
        expect(() => g0({ a: 9 })).toThrow('Validation failed for property "a" with number "9" because check "(v) => v > 10" failed.');
    });
    test('custom-basic', () => {
        let g0 = Shape({ a: Check((v) => v > 10) });
        expect(g0({ a: 11 })).toMatchObject({ a: 11 });
        expect(() => g0({ a: 9 })).toThrow('Validation failed for property "a" with number "9" because check "(v) => v > 10" failed.');
        let g1 = Shape({ a: Skip(Check((v) => v > 10)) });
        expect(g1({ a: 11 })).toMatchObject({ a: 11 });
        expect(() => g1({ a: 9 })).toThrow('Validation failed for property "a" with number "9" because check "(v) => v > 10" failed.');
        expect(g1({})).toMatchObject({});
        let g2 = Shape({ a: Required(Check((v) => v > 10)) });
        expect(g1({ a: 11 })).toMatchObject({ a: 11 });
        expect(() => g2({ a: 9 })).toThrow('Validation failed for property "a" with number "9" because check "(v) => v > 10" failed.');
        expect(() => g2({}))
            .toThrow('Validation failed for property "a" with value "undefined" because the value is required.');
        let g3 = Shape(Check((v) => v > 10));
        expect(g3(11)).toEqual(11);
        expect(() => g3(9)).toThrow('Validation failed for number "9" because check "(v) => v > 10" failed.');
    });
    test('custom-modify', () => {
        let g0 = Shape({
            a: (Skip(Check((v, u) => (u.val = v * 2, true)))),
            b: Skip(Check((_v, u) => {
                u.err = 'BAD VALUE $VALUE AT $PATH';
                return false;
            })),
            c: Skip(Check((v, u, s) => (u.val = (v ? v + ` (key=${s.key})` : undefined), true))),
            d: Skip(Check((_v, u, _s) => (u.val = undefined, true)))
        });
        expect(g0({ a: 3 })).toEqual({ a: 6 });
        expect(() => g0({ b: 1 })).toThrow('BAD VALUE 1 AT b');
        expect(g0({ c: 'x' })).toEqual({ c: 'x (key=c)' });
        expect(g0({ d: 'D' })).toEqual({ d: 'D' });
        let g1 = Shape(Open({
            a: Skip(Check((_v, u, _s) => (u.uval = undefined, true)))
        }));
        expect(g1({ a: 'A' })).toEqual({ a: undefined });
        expect(g1({ a: 'A', b: undefined })).toEqual({ a: undefined });
    });
    test('after-multiple', () => {
        let g0 = Shape(After(function v1(v, u) { u.val = v + 1; return true; }, After(function v2(v, u) { u.val = v * 2; return true; }, Number)));
        expect(g0(1)).toEqual(3);
        expect(g0(2)).toEqual(5);
    });
    test('deep-object-basic', () => {
        let a1 = Shape({ a: 1 });
        expect(a1({})).toMatchObject({ a: 1 });
        let ab1 = Shape({ a: { b: 1 } });
        expect(ab1({})).toMatchObject({ a: { b: 1 } });
        let abc1 = Shape({ a: { b: { c: 1 } } });
        expect(abc1({})).toMatchObject({ a: { b: { c: 1 } } });
        let ab1c2 = Shape({ a: { b: 1 }, c: 2 });
        expect(ab1c2({})).toMatchObject({ a: { b: 1 }, c: 2 });
        let ab1cd2 = Shape({ a: { b: 1 }, c: { d: 2 } });
        expect(ab1cd2({})).toMatchObject({ a: { b: 1 }, c: { d: 2 } });
        let abc1ade2f3 = Shape({ a: { b: { c: 1 }, d: { e: 2 } }, f: 3 });
        expect(abc1ade2f3({})).toMatchObject({ a: { b: { c: 1 }, d: { e: 2 } }, f: 3 });
        let d0 = Shape({
            a: { b: { c: 1 }, d: { e: { f: 3 } } },
            h: 3,
            i: { j: { k: 4 }, l: { m: 5 } },
            n: { o: 6 }
        });
        expect(d0({})).toMatchObject({
            a: { b: { c: 1 }, d: { e: { f: 3 } } },
            h: 3,
            i: { j: { k: 4 }, l: { m: 5 } },
            n: { o: 6 }
        });
    });
    test('array-special', () => {
        let a0 = Shape([1]);
        expect(a0()).toMatchObject([]);
        expect(a0([])).toMatchObject([]);
        expect(a0([11])).toMatchObject([11]);
        expect(a0([11, 22])).toMatchObject([11, 22]);
        let a1 = Shape([Number, String]);
        expect(() => a1()).toThrow('required');
        expect(() => a1([])).toThrow('required');
        expect(() => a1([1])).toThrow('required');
        expect(a1([1, 'x'])).toMatchObject([1, 'x']);
        expect(() => a1([1, 'x', 'y'])).toThrow('not allowed');
        expect(() => a1(['x', 'y']))
            .toThrow('Validation failed for index "0" with string "x" because ' +
            'the string is not of type number.');
        expect(() => a1([1, 2]))
            .toThrow('Validation failed for index "1" with number "2" because ' +
            'the number is not of type string.');
        let a2 = Shape([9, String]);
        expect(() => a2()).toThrow('required');
        expect(() => a2([])).toThrow('required');
        expect(() => a2([1])).toThrow('required');
        expect(a2([1, 'x'])).toMatchObject([1, 'x']);
        expect(() => a2([1, 'x', 'y'])).toThrow('not allowed');
        expect(() => a2(['x', 1]))
            .toThrow(`Validation failed for index "0" with string "x" because the string is not of type number.
Validation failed for index "1" with number "1" because the number is not of type string.`);
        expect(() => a2(['x', 'y']))
            .toThrow('Validation failed for index "0" with string "x" because ' +
            'the string is not of type number.');
        let a3 = Shape([1, 2, 3]);
        expect(a3()).toEqual([1, 2, 3]);
        expect(a3([])).toEqual([1, 2, 3]);
        expect(a3([11])).toEqual([11, 2, 3]);
        expect(a3([11, 22])).toEqual([11, 22, 3]);
        expect(a3([11, 22, 33])).toMatchObject([11, 22, 33]);
        expect(() => a3([11, 22, 33, 44])).toThrow('not allowed');
        expect(a3([undefined, 22, 33])).toMatchObject([1, 22, 33]);
        expect(a3([undefined, undefined, 33])).toMatchObject([1, 2, 33]);
        expect(a3([undefined, undefined, undefined])).toMatchObject([1, 2, 3]);
        // non-index properties on array shape are not supported
        // FEATURE: support non-index properties on array shape
        let r0 = null;
        let A0 = [String];
        A0.x = 1;
        let g3 = Shape({ a: A0 });
        expect(g3({})).toEqual({ a: [] });
        expect(r0 = g3({ a: undefined })).toEqual({ a: [] });
        expect(r0.x).toBeUndefined();
        expect(r0 = g3({ a: [] })).toEqual({ a: [] });
        expect(r0.x).toBeUndefined();
    });
    test('context-basic', () => {
        let c0 = { max: 10 };
        let g0 = Shape({
            a: Check((v, _u, s) => v < s.ctx.max)
        });
        expect(g0({ a: 2 }, c0)).toMatchObject({ a: 2 });
        expect(() => g0({ a: 11 }, c0))
            .toThrow('Validation failed for property "a" with number "11" because ' +
            'check "(v, _u, s) => v < s.ctx.max" failed.');
        let g1 = Shape({
            a: { b: All(Number, Check((v, _u, s) => v < s.ctx.max)) }
        });
        expect(g1({ a: { b: 3 } }, c0)).toMatchObject({ a: { b: 3 } });
        expect(() => g1({ a: { b: 11 } }, c0))
            .toThrow('Value "11" for property "a.b" does not satisfy all of: ' +
            'Number, Check((v, _u, s) => v < s.ctx.max)');
    });
    test('error-path', () => {
        let g0 = Shape({ a: { b: String } });
        expect(g0({ a: { b: 'x' } })).toEqual({ a: { b: 'x' } });
        expect(() => g0(1)).toThrow('not of type object');
        expect(() => g0({ a: 1 })).toThrow('property "a"');
        expect(() => g0({ a: { b: 1 } })).toThrow('property "a.b"');
        expect(() => g0({ a: { b: { c: 1 } } })).toThrow('property "a.b"');
        let g1 = Shape(String);
        expect(g1('x')).toEqual('x');
        expect(() => g1(1)).toThrow('for number ');
        expect(() => g1(true)).toThrow('for boolean ');
        expect(() => g1(null)).toThrow('for value ');
        expect(() => g1(undefined)).toThrow('for value ');
        expect(() => g1([])).toThrow('for array ');
        expect(() => g1({})).toThrow('for object ');
        expect(() => g1(new Date())).toThrow('for object ');
    });
    test('error-desc', () => {
        const g0 = Shape(NaN);
        let err = [];
        let o0 = g0(1, { err });
        expect(o0).toEqual(1);
        expect(err).toMatchObject([{
                node: { t: 'nan', v: NaN, r: false, d: 0, u: {} },
                value: 1,
                path: '',
                why: 'type',
                mark: 1050,
                text: 'Validation failed for number "1" because the number is not of type nan.'
            }]);
        try {
            g0(1, { a: 'A' });
        }
        catch (e) {
            expect(e.message)
                .toEqual('Validation failed for number "1" because the number is not of type nan.');
            expect(e.code).toEqual('shape');
            expect(e.shape).toEqual(true);
            expect(e.name).toEqual('ShapeError');
            expect(e.desc()).toMatchObject({
                code: 'shape',
                ctx: { a: 'A' },
                err: [
                    {
                        node: { t: 'nan', v: NaN, r: false, d: 0, u: {} },
                        value: 1,
                        path: '',
                        why: 'type',
                        check: 'none',
                        args: {},
                        mark: 1050,
                        text: 'Validation failed for number "1" because the number is not of type nan.'
                    }
                ]
            });
            expect(JSON.stringify(e)).toEqual('{"shape":true,"name":"ShapeError","code":"shape","gname":"","props":[{"path":"","what":"type","type":"nan","value":1}],"err":[{"type":"nan","node":{"$":{"v$":"' + package_json_1.default.version + '"},"t":"nan","v":null,"f":null,"n":0,"r":false,"p":false,"d":0,"k":[],"e":true,"u":{},"a":[],"b":[],"m":{}},"value":1,"path":"","why":"type","check":"none","args":{},"mark":1050,"text":"Validation failed for number \\"1\\" because the number is not of type nan.","use":{}}],"message":"Validation failed for number \\"1\\" because the number is not of type nan."}');
        }
    });
    test('spec-basic', () => {
        expect(Shape(Number).spec()).toMatchObject({
            $: { shape$: true, v$: package_json_1.default.version },
            d: 0, r: true, t: 'number', u: {}, v: 0,
        });
        expect(Shape(String).spec()).toMatchObject({
            $: { shape$: true, v$: package_json_1.default.version },
            d: 0, r: true, t: 'string', u: {}, v: '',
        });
        expect(Shape(BigInt).spec()).toMatchObject({
            $: { shape$: true, v$: package_json_1.default.version },
            d: 0, r: true, t: 'bigint', u: {}, v: "0",
        });
        expect(Shape(null).spec()).toMatchObject({
            $: { shape$: true, v$: package_json_1.default.version },
            d: 0, r: false, t: 'null', u: {}, v: null,
        });
    });
    test('spec-required', () => {
        let g0 = Shape(Required(1));
        expect(g0.spec()).toMatchObject({ d: 0, p: false, r: true, t: 'number', v: 1 });
        let g1 = Shape(Required({ a: 1 }));
        expect(g1.spec()).toMatchObject({
            d: 0, p: false, r: true, t: 'object', v: {
                a: { d: 1, p: false, r: false, t: 'number', v: 1 }
            }
        });
        let g2 = Shape(Required({ a: Required(1) }));
        expect(g2.spec()).toMatchObject({
            d: 0, p: false, r: true, t: 'object', v: {
                a: { d: 1, p: false, r: true, t: 'number', v: 1 }
            }
        });
        let g3 = Shape(Required({ a: Required({ b: 1 }) }));
        expect(g3.spec()).toMatchObject({
            d: 0, p: false, r: true, t: 'object', v: {
                a: {
                    d: 1, p: false, r: true, t: 'object', v: {
                        b: {
                            d: 2, p: false, r: false, t: 'number', v: 1
                        }
                    }
                }
            }
        });
        let g4 = Shape(Required({ a: Skip({ b: 1 }) }));
        expect(g4.spec()).toMatchObject({
            d: 0, p: false, r: true, t: 'object', v: {
                a: {
                    d: 1, p: true, r: false, t: 'object', v: {
                        b: {
                            d: 2, p: false, r: false, t: 'number', v: 1
                        }
                    }
                }
            }
        });
        let g5 = Shape(Skip({ a: Required({ b: 1 }) }));
        expect(g5.spec()).toMatchObject({
            d: 0, p: true, r: false, t: 'object', v: {
                a: {
                    d: 1, p: false, r: true, t: 'object', v: {
                        b: {
                            d: 2, p: false, r: false, t: 'number', v: 1
                        }
                    }
                }
            }
        });
    });
    test('spec-compose', () => {
        let f0 = (v) => 1 === v;
        let c0 = Shape(Check(f0));
        let c1 = Shape(Skip(Check(f0)));
        // TODO
        let c2 = Shape(Skip(c0));
        expect(c0.spec()).toMatchObject({
            t: 'check',
            n: 0,
            r: true,
            p: false,
            d: 0,
            u: {},
            a: [],
            b: ['f0'],
            // s: 'f0'
        });
        expect(c1.spec()).toMatchObject({
            t: 'check',
            n: 0,
            r: false,
            p: true,
            d: 0,
            u: {},
            a: [],
            b: ['f0'],
            // s: 'f0'
        });
        expect(c2.spec()).toMatchObject({
            t: 'check',
            n: 0,
            r: false,
            p: true,
            d: 0,
            u: {},
            a: [],
            b: ['f0'],
        });
    });
    test('spec-roundtrip', () => {
        let m0 = { a: 1 };
        let g0 = Shape(m0);
        expect(m0).toEqual({ a: 1 });
        expect(g0({ a: 2 })).toEqual({ a: 2 });
        expect(m0).toEqual({ a: 1 });
        let s0 = g0.spec();
        expect(m0).toEqual({ a: 1 });
        let s0s = {
            $: {
                shape$: true,
                v$: package_json_1.default.version,
            },
            d: 0,
            r: false,
            p: false,
            t: 'object',
            u: {},
            a: [],
            b: [],
            n: 1,
            e: true,
            k: ['a'],
            m: {},
            v: {
                a: {
                    $: {
                        shape$: true,
                        v$: package_json_1.default.version,
                    },
                    d: 1,
                    e: true,
                    r: false,
                    k: [],
                    p: false,
                    t: 'number',
                    u: {},
                    a: [],
                    b: [],
                    f: 1,
                    v: 1,
                    n: 0,
                    m: {},
                },
            },
        };
        expect(s0).toEqual(s0s);
        expect(g0({ a: 2 })).toEqual({ a: 2 });
        let g0r = Shape(s0);
        expect(m0).toEqual({ a: 1 });
        expect(s0).toEqual(s0s);
        expect(g0r({ a: 2 })).toEqual({ a: 2 });
        expect(m0).toEqual({ a: 1 });
        expect(s0).toEqual(s0s);
        let s0r = g0r.spec();
        expect(m0).toEqual({ a: 1 });
        expect(s0r).toEqual(s0s);
        expect(s0).toEqual(s0s);
        expect(g0r({ a: 2 })).toEqual({ a: 2 });
        expect(g0({ a: 2 })).toEqual({ a: 2 });
        let s0_2 = g0r.spec();
        let s0r_2 = g0r.spec();
        expect(m0).toEqual({ a: 1 });
        expect(s0r_2).toEqual(s0s);
        expect(s0_2).toEqual(s0s);
        let m1 = { a: [1] };
        let g1 = Shape(m1);
        expect(g1({ a: [2] })).toEqual({ a: [2] });
        expect(m1).toEqual({ a: [1] });
        let s1 = g1.spec();
        let s1s = {
            $: {
                shape$: true,
                v$: package_json_1.default.version,
            },
            d: 0,
            r: false,
            p: false,
            t: 'object',
            u: {},
            a: [],
            b: [],
            n: 1,
            e: true,
            k: ['a'],
            m: {},
            v: {
                a: {
                    $: {
                        shape$: true,
                        v$: package_json_1.default.version,
                    },
                    d: 1,
                    r: false,
                    p: false,
                    t: 'array',
                    u: {},
                    a: [],
                    b: [],
                    v: {},
                    n: 0,
                    e: true,
                    k: [],
                    m: {},
                    c: {
                        $: {
                            shape$: true,
                            v$: package_json_1.default.version,
                        },
                        d: 2,
                        r: false,
                        p: false,
                        t: 'number',
                        u: {},
                        a: [],
                        b: [],
                        f: 1,
                        v: 1,
                        n: 0,
                        e: true,
                        k: [],
                        m: {},
                    },
                },
            },
        };
        expect(s1).toEqual(s1s);
        let g1r = Shape(s1);
        expect(g1r({ a: [2] })).toEqual({ a: [2] });
        expect(g1({ a: [2] })).toEqual({ a: [2] });
        expect(m1).toEqual({ a: [1] });
        expect(s1).toEqual(s1s);
        let s1r = g1r.spec();
        expect(g1r({ a: [2] })).toEqual({ a: [2] });
        expect(g1({ a: [2] })).toEqual({ a: [2] });
        expect(m1).toEqual({ a: [1] });
        expect(s1).toEqual(s1s);
        expect(s1r).toEqual(s1s);
    });
    test('compose', () => {
        let g0 = Shape(String);
        let g1 = Shape(g0);
        let g1s = Shape(g0.spec());
        expect(g1('x')).toEqual('x');
        expect(() => g1(1)).toThrow();
        expect(g1s('x')).toEqual('x');
        expect(() => g1s(1)).toThrow();
        let g2 = Shape({ a: Number });
        let g3 = Shape({ b: g2 });
        let g3s = Shape({ b: g2.spec() });
        expect(g3({ b: { a: 1 } })).toEqual({ b: { a: 1 } });
        expect(() => g3({ b: { a: 'x' } })).toThrow();
        expect(g3s({ b: { a: 1 } })).toEqual({ b: { a: 1 } });
        expect(() => g3s({ b: { a: 'x' } })).toThrow();
        const shape = Shape({ a: Shape({ x: Number }) });
        expect(shape({ a: { x: 1 } })).toEqual({ a: { x: 1 } });
        let c0 = Shape(String);
        let c1 = Shape(Skip(String));
        let c2 = Shape(Skip(c0));
        expect(c1.spec()).toMatchObject(c2.spec());
    });
    test('truncate', () => {
        expect(truncate('')).toEqual('');
        expect(truncate('0')).toEqual('0');
        expect(truncate('01')).toEqual('01');
        expect(truncate('012')).toEqual('012');
        expect(truncate('0123')).toEqual('0123');
        expect(truncate('01234')).toEqual('01234');
        expect(truncate('012345')).toEqual('012345');
        expect(truncate('0123456')).toEqual('0123456');
        expect(truncate('01234567')).toEqual('01234567');
        expect(truncate('012345678')).toEqual('012345678');
        expect(truncate('0123456789')).toEqual('0123456789');
        expect(truncate('01234567890123456789012345678')).toEqual('01234567890123456789012345678');
        expect(truncate('012345678901234567890123456789')).toEqual('012345678901234567890123456789');
        expect(truncate('0123456789012345678901234567890')).toEqual('012345678901234567890123456...');
        expect(truncate('', 6)).toEqual('');
        expect(truncate('0', 6)).toEqual('0');
        expect(truncate('01', 6)).toEqual('01');
        expect(truncate('012', 6)).toEqual('012');
        expect(truncate('0123', 6)).toEqual('0123');
        expect(truncate('01234', 6)).toEqual('01234');
        expect(truncate('012345', 6)).toEqual('012345');
        expect(truncate('0123456', 6)).toEqual('012...');
        expect(truncate('01234567', 6)).toEqual('012...');
        expect(truncate('012345678', 6)).toEqual('012...');
        expect(truncate('0123456789', 6)).toEqual('012...');
        expect(truncate('', 5)).toEqual('');
        expect(truncate('0', 5)).toEqual('0');
        expect(truncate('01', 5)).toEqual('01');
        expect(truncate('012', 5)).toEqual('012');
        expect(truncate('0123', 5)).toEqual('0123');
        expect(truncate('01234', 5)).toEqual('01234');
        expect(truncate('012345', 5)).toEqual('01...');
        expect(truncate('0123456', 5)).toEqual('01...');
        expect(truncate('01234567', 5)).toEqual('01...');
        expect(truncate('012345678', 5)).toEqual('01...');
        expect(truncate('0123456789', 5)).toEqual('01...');
        expect(truncate('', 4)).toEqual('');
        expect(truncate('0', 4)).toEqual('0');
        expect(truncate('01', 4)).toEqual('01');
        expect(truncate('012', 4)).toEqual('012');
        expect(truncate('0123', 4)).toEqual('0123');
        expect(truncate('01234', 4)).toEqual('0...');
        expect(truncate('012345', 4)).toEqual('0...');
        expect(truncate('0123456', 4)).toEqual('0...');
        expect(truncate('01234567', 4)).toEqual('0...');
        expect(truncate('012345678', 4)).toEqual('0...');
        expect(truncate('0123456789', 4)).toEqual('0...');
        expect(truncate('', 3)).toEqual('');
        expect(truncate('0', 3)).toEqual('0');
        expect(truncate('01', 3)).toEqual('01');
        expect(truncate('012', 3)).toEqual('012');
        expect(truncate('0123', 3)).toEqual('...');
        expect(truncate('01234', 3)).toEqual('...');
        expect(truncate('012345', 3)).toEqual('...');
        expect(truncate('0123456', 3)).toEqual('...');
        expect(truncate('01234567', 3)).toEqual('...');
        expect(truncate('012345678', 3)).toEqual('...');
        expect(truncate('0123456789', 3)).toEqual('...');
        expect(truncate('', 2)).toEqual('');
        expect(truncate('0', 2)).toEqual('0');
        expect(truncate('01', 2)).toEqual('01');
        expect(truncate('012', 2)).toEqual('..');
        expect(truncate('0123', 2)).toEqual('..');
        expect(truncate('01234', 2)).toEqual('..');
        expect(truncate('012345', 2)).toEqual('..');
        expect(truncate('0123456', 2)).toEqual('..');
        expect(truncate('01234567', 2)).toEqual('..');
        expect(truncate('012345678', 2)).toEqual('..');
        expect(truncate('0123456789', 2)).toEqual('..');
        expect(truncate('', 1)).toEqual('');
        expect(truncate('0', 1)).toEqual('0');
        expect(truncate('01', 1)).toEqual('.');
        expect(truncate('012', 1)).toEqual('.');
        expect(truncate('0123', 1)).toEqual('.');
        expect(truncate('01234', 1)).toEqual('.');
        expect(truncate('012345', 1)).toEqual('.');
        expect(truncate('0123456', 1)).toEqual('.');
        expect(truncate('01234567', 1)).toEqual('.');
        expect(truncate('012345678', 1)).toEqual('.');
        expect(truncate('0123456789', 1)).toEqual('.');
        expect(truncate('', 0)).toEqual('');
        expect(truncate('0', 0)).toEqual('');
        expect(truncate('01', 0)).toEqual('');
        expect(truncate('012', 0)).toEqual('');
        expect(truncate('0123', 0)).toEqual('');
        expect(truncate('01234', 0)).toEqual('');
        expect(truncate('012345', 0)).toEqual('');
        expect(truncate('0123456', 0)).toEqual('');
        expect(truncate('01234567', 0)).toEqual('');
        expect(truncate('012345678', 0)).toEqual('');
        expect(truncate('0123456789', 0)).toEqual('');
        expect(truncate('', -1)).toEqual('');
        expect(truncate('0', -1)).toEqual('');
        expect(truncate('01', -1)).toEqual('');
        expect(truncate('012', -1)).toEqual('');
        expect(truncate('0123', -1)).toEqual('');
        expect(truncate('01234', -1)).toEqual('');
        expect(truncate('012345', -1)).toEqual('');
        expect(truncate('0123456', -1)).toEqual('');
        expect(truncate('01234567', -1)).toEqual('');
        expect(truncate('012345678', -1)).toEqual('');
        expect(truncate('0123456789', -1)).toEqual('');
        expect(truncate(NaN, 5)).toEqual('NaN');
        expect(truncate(null, 5)).toEqual('');
        expect(truncate(undefined, 5)).toEqual('');
    });
    test('stringify', () => {
        expect(stringify({ a: 1 })).toEqual('{"a":1}');
        expect(stringify({ a: Number })).toEqual('{"a":"Number"}');
        expect(stringify({ a: String })).toEqual('{"a":"String"}');
        expect(stringify({ a: Boolean })).toEqual('{"a":"Boolean"}');
        expect(stringify(Shape({ a: Number }).spec())).toEqual('{"a":"Number"}');
        expect(stringify(Shape({ a: String }).spec())).toEqual('{"a":"String"}');
        expect(stringify(Shape({ a: Boolean }).spec())).toEqual('{"a":"Boolean"}');
        expect(stringify(Required())).toEqual(`"Required"`);
        let c0 = {};
        c0.x = c0;
        expect(stringify(c0)).toEqual('"[object Object]"');
        function f0() { }
        class C0 {
        }
        expect(stringify([1, f0, () => true, C0])).toEqual('[1,"f0","() => true","C0"]');
        expect(stringify(/a/)).toEqual('"/a/"');
    });
    test('nodize', () => {
        expect(nodize(1)).toMatchObject({
            a: [],
            b: [],
            d: -1,
            n: 0,
            p: false,
            r: false,
            t: "number",
            u: {},
            v: 1,
        });
    });
    test('G-basic', () => {
        expect(G$({ v: 11 })).toMatchObject({
            '$': { v$: package_json_1.default.version },
            t: 'number',
            v: 11,
            r: false,
            p: false,
            d: -1,
            a: [],
            b: [],
            u: {}
        });
        expect(G$({ v: Number })).toMatchObject({
            '$': { v$: package_json_1.default.version },
            t: 'number',
            v: 0,
            r: false,
            p: false,
            d: -1,
            a: [],
            b: [],
            u: {}
        });
        expect(G$({ v: BigInt(11) })).toMatchObject({
            '$': { v$: package_json_1.default.version },
            t: 'bigint',
            v: BigInt(11),
            r: false,
            p: false,
            d: -1,
            a: [],
            b: [],
            u: {}
        });
        let s0 = Symbol('foo');
        expect(G$({ v: s0 })).toMatchObject({
            '$': { v$: package_json_1.default.version },
            t: 'symbol',
            v: s0,
            r: false,
            p: false,
            d: -1,
            a: [],
            b: [],
            u: {}
        });
        // NOTE: special case for plain functions.
        // Normally functions become custom validations.
        let f0 = () => true;
        expect(G$({ v: f0 })).toMatchObject({
            '$': { v$: package_json_1.default.version },
            t: 'function',
            v: f0,
            r: false,
            p: false,
            d: -1,
            a: [],
            b: [],
            u: {}
        });
    });
    test('just-large', () => {
        let m0 = Large.m0;
        let g0 = Shape(m0);
        let o0 = g0(Large.i0);
        expect(o0).toEqual(Large.c0);
        let m1 = Large.m1;
        let g1 = Shape(m1);
        let o1 = g1(Large.i1);
        expect(o1).toEqual(Large.c1);
    });
    test('just-long', () => {
        expect(Shape(Long.m0)(Long.i0)).toEqual(Long.i0);
        expect(Shape(Long.m1)(Long.i1)).toEqual(Long.i1);
    });
    test('even-larger', () => {
        const size = 11111;
        let m0 = {};
        let c0 = m0;
        for (let i = 0; i < size; i++) {
            c0 = c0.a = {};
        }
        let g0 = Shape(m0);
        expect(g0(m0)).toEqual(m0);
        let m1 = [];
        let c1 = m1;
        for (let i = 0; i < size; i++) {
            c1 = c1[0] = [];
        }
        let g1 = Shape(m1);
        expect(g1(m1)).toEqual(m1);
    });
    test('even-longer', () => {
        let m0 = {};
        for (let i = 0; i < 11111; i++) {
            m0['a' + i] = true;
        }
        let g0 = Shape(m0);
        expect(g0(m0)).toEqual(m0);
        let m1 = {};
        for (let i = 0; i < 11111; i++) {
            m1[i] = true;
        }
        let g1 = Shape(m1);
        expect(g1(m1)).toEqual(m1);
    });
    // Test compat with https://github.com/rjrodger/optioner
    test('legacy-optioner-compat', () => {
        // TODO:
        // * verbatim arrays - maybe use Exact?
        // * option: treat null same as undefined
        // * option: treat functon as raw default value
        // ** thus need a builder for validation functions
        // ** and a builder for raw functions
        // * Do Array, Object work?
        // * default value within One, Some, etc
        // 'happy'
        let opter = Shape({
            a: 1,
            b: { c: 2 },
            d: { e: { f: 3 } },
            g: null,
            h: 4,
            i: [5, 6],
            j: Closed([{ k: 7 }]),
        });
        expect(opter()).toEqual({
            a: 1,
            b: { c: 2 },
            d: { e: { f: 3 } },
            g: null,
            h: 4,
            i: [5, 6],
            j: [{ k: 7 }],
        });
        // 'empty'
        opter = Shape({ a: 1 });
        expect(opter(undefined)).toEqual({ a: 1 });
        // TODO: OPT: expect(opter(null)).toEqual({ a: 1 })
        // 'array'
        opter = Shape([1, 'a']);
        expect(() => opter({})).toThrow('not of type array');
        expect(opter([])).toEqual([1, 'a']);
        expect(opter([1])).toEqual([1, 'a']);
        let fx = function f(x) {
            return x + 1;
        };
        opter = Shape({
            a: G$({ v: fx, f: fx })
        });
        let o0 = opter({});
        expect(o0.a(1)).toEqual(2);
        let o1 = opter({
            a: function (x) {
                return x + 2;
            }
        });
        expect(o1.a(1)).toEqual(3);
        // 'edge'
        opter = Shape({
            a: undefined,
        });
        expect(opter({})).toEqual({});
        // 'default-types'
        opter = Shape({
            a: 1,
            b: 1.1,
            c: 'x',
            d: true,
        });
        expect(opter({ a: 2, b: 2.2, c: 'y', d: false })).toEqual({ a: 2, b: 2.2, c: 'y', d: false });
        // TODO: SHAPE: Integer
        // expect(() => opter({ a: 3.3 })).toThrow('integer')
        expect(opter({ b: 4 })).toEqual({ a: 1, b: 4, c: 'x', d: true });
        expect(() => opter({ b: 'z' })).toThrow('number');
        expect(() => opter({ c: 1 })).toThrow('string');
        expect(() => opter({ d: 'q' })).toThrow('boolean');
        // 'readme'
        let optioner = Shape({
            color: 'red',
            // size: Joi.number().integer().max(5).min(1).default(3),
            size: Max(5, Min(1, 3)),
            range: [100, 200],
        });
        expect(optioner({ size: 2 })).toEqual({ color: 'red', size: 2, range: [100, 200] });
        expect(optioner({})).toEqual({ color: 'red', size: 3, range: [100, 200] });
        expect(optioner({ range: [50] })).toEqual({ range: [50, 200], color: 'red', size: 3 });
        expect(() => optioner({ size: 6 })).toThrow('maximum');
        // 'check'
        optioner = Shape({
            bool: true
        });
        expect(optioner({})).toEqual({ bool: true });
        expect(optioner({ bool: true })).toEqual({ bool: true });
        expect(optioner({ bool: false })).toEqual({ bool: false });
        try {
            optioner({ bool: 'foo' });
            throw new Error('fail');
        }
        catch (e) {
            expect(e.name).toMatch(/ShapeError/);
        }
        // 'ignore'
        let optioner_ignore = Shape(Open({
            a: 1,
        }));
        expect(optioner_ignore({})).toEqual({ a: 1 });
        expect(optioner_ignore({ b: 2 })).toEqual({ a: 1, b: 2 });
        expect(optioner_ignore({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
        let optioner_fail = Shape(Closed({
            a: 1,
        }));
        expect(optioner_fail({})).toEqual({ a: 1 });
        try {
            optioner_fail({ a: 1, b: 2 });
            throw new Error('fail');
        }
        catch (e) {
            expect(e.name).toMatch(/ShapeError/);
        }
        let optioner_ignore_deep = Shape(Open({
            a: 1,
            b: Open({ c: 2 }),
        }));
        expect(optioner_ignore_deep({})).toEqual({ a: 1, b: { c: 2 } });
        expect(optioner_ignore_deep({ b: { d: 3 } })).toEqual({
            a: 1,
            b: { c: 2, d: 3 },
        });
        let optioner_ignore_deep_fail = Shape({
            a: 1,
            b: Closed({ c: 2 }),
        });
        expect(optioner_ignore_deep_fail({})).toEqual({ a: 1, b: { c: 2 } });
        try {
            expect(optioner_ignore_deep_fail({ b: { d: 3 } })).toEqual({
                a: 1,
                b: { c: 2, d: 3 },
            });
            throw new Error('fail');
        }
        catch (e) {
            expect(e.name).toMatch(/ShapeError/);
        }
        // 'must_match'
        let g0 = Shape({
            a: Exact(1),
        });
        expect(g0({ a: 1 })).toEqual({ a: 1 });
        expect(() => g0({ a: 1, b: 2 })).toThrow('not allowed');
        expect(() => g0({})).toThrow('exactly');
        expect(() => g0({ a: 2 })).toThrow('exactly');
        expect(() => g0({ a: 'x' })).toThrow('exactly');
        let g1 = Shape(Open({
            a: Exact(1),
            b: Open({ c: Exact(2) }),
        }));
        expect(g1({ a: 1, b: { c: 2 } })).toEqual({ a: 1, b: { c: 2 } });
        expect(g1({ a: 1, b: { c: 2, z: 3 }, y: 4 })).toEqual({
            a: 1,
            b: { c: 2, z: 3 },
            y: 4,
        });
        expect(() => g1({ a: 1 })).toThrow('exactly');
        expect(() => g1({ a: 1, b: {} })).toThrow('exactly');
        expect(() => g1({ a: 1, b: { c: 'x' } })).toThrow('exactly');
        let g2 = Shape({
            a: Exact(1),
            b: String
        });
        expect(g2({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' });
        expect(() => g2({ a: 1, b: 2 })).toThrow('type');
        var g3 = Shape({
            a: { b: { c: Exact(1) } },
        });
        expect(g3({ a: { b: { c: 1 } } })).toEqual({ a: { b: { c: 1 } } });
        expect(() => g3({ a: { b: { c: 2 } } })).toThrow('exactly');
        // TODO: fix
        // var g4 = Shape(
        //   {
        //     a: [Exact(1)],
        //   },
        // )
        // expect(g4({ a: [1] })).toEqual({ a: [1] })
        // expect(g4({ a: [1, 2] })).toEqual({ a: [1, 2] })
        // expect(() => g4({ a: [2] })).toThrow('exactly')
        // var g5 = Shape(
        //   {
        //     a: [Any(), { b: Exact(1) }],
        //   },
        // )
        // expect(g5({ a: [{ b: 1 }] })).toEqual({ a: [{ b: 1 }] })
        // expect(g5({ a: [{ b: 1, c: 2 }, { b: 3 }] })).toEqual({
        //   a: [{ b: 1, c: 2 }, { b: 3 }],
        // })
        // expect(() => g5({ a: [{ b: 11, c: 2 }, { b: 3 }] })).toThrow('exactly')
        // var g6 = Shape([Never(), Exact(1)])
        // expect(g6([1])).toEqual([1])
        // expect(() => g6([2])).toThrow('exactly')
        var g7 = Shape([{}, { a: Exact(2) }, {}]);
        expect(g7([{ a: 1 }, { a: 2 }, { a: 3 }])).toEqual([
            { a: 1 },
            { a: 2 },
            { a: 3 },
        ]);
        expect(() => g7([{ a: 1 }, { a: 3 }])).toThrow('exactly');
        // 'empty-string'
        let opt0 = Shape({
            a: '',
            b: 'x',
        });
        let res0 = opt0({ a: 'x' });
        expect(res0).toEqual({ a: 'x', b: 'x' });
        let res1 = opt0({ a: '' });
        expect(res1).toEqual({ a: '', b: 'x' });
    });
    test('skip-vs-any', () => {
        let a0 = Shape({ x: Any() });
        let s0 = Shape({ x: Skip() });
        expect(a0()).toEqual({});
        expect(s0()).toEqual({});
        expect(a0({})).toEqual({});
        expect(s0({})).toEqual({});
        expect(a0({ x: 1 })).toEqual({ x: 1 });
        expect(s0({ x: 1 })).toEqual({ x: 1 });
        expect(a0({ x: undefined })).toEqual({ x: undefined });
        expect(s0({ x: undefined })).toEqual({ x: undefined });
        let a1 = Shape({ x: Required().Any() });
        let s1 = Shape({ x: Required().Skip() });
        expect(() => a1()).toThrow('required');
        expect(s1()).toEqual({});
        expect(() => a1({})).toThrow('required');
        expect(s1({})).toEqual({});
        expect(a1({ x: 1 })).toEqual({ x: 1 });
        expect(s1({ x: 1 })).toEqual({ x: 1 });
        expect(() => a1({ x: undefined })).toThrow('required');
        expect(s1({ x: undefined })).toEqual({ x: undefined });
    });
    test('non-value-fails', () => {
        let g0 = Shape({ x: Number });
        expect(() => g0({ x: null })).toThrow('Validation failed for property "x" with value "null" because the value is not of type number.');
        expect(() => g0({ x: undefined })).toThrow('Validation failed for property "x" with value "undefined" because the value is required.');
        expect(() => g0({ x: NaN })).toThrow('Validation failed for property "x" with value "NaN" because the value is not of type number.');
        expect(() => g0({})).toThrow('Validation failed for property "x" with value "undefined" because the value is required.');
        expect(() => g0({ x: '' })).toThrow('Validation failed for property "x" with string "" because the string is not of type number.');
    });
    test('frozen', () => {
        let g0 = Shape({ x: Object });
        expect(g0({ x: { y: 1 } })).toEqual({ x: { y: 1 } });
        expect(g0({ x: Object.freeze({ y: 1 }) })).toEqual({ x: { y: 1 } });
    });
    test('context-skipping', () => {
        let g0 = Shape({
            a: Number,
            b: Skip(Boolean),
        });
        expect(g0({ a: 1 })).toEqual({ a: 1 });
        expect(g0({ a: 1, b: true })).toEqual({ a: 1, b: true });
        expect(() => g0({ a: 1, b: true, c: 'C' })).toThrow('not allowed');
        let g1 = Shape(Open(g0));
        expect(g1({ a: 1 })).toEqual({ a: 1 });
        expect(g1({ a: 1, b: true })).toEqual({ a: 1, b: true });
        expect(g1({ a: 1, b: true, c: 'C' })).toEqual({ a: 1, b: true, c: 'C' });
        expect(g1({}, { skip: { depth: 1 } })).toEqual({});
        expect(g1({ a: 1 }, { skip: { depth: 1 } })).toEqual({ a: 1 });
        expect(g1({ a: 1, b: true }, { skip: { depth: 1 } })).toEqual({ a: 1, b: true });
        expect(g1({ a: 1, b: true, c: 'C' }, { skip: { depth: 1 } }))
            .toEqual({ a: 1, b: true, c: 'C' });
        expect(g1({}, { skip: { depth: [1] } })).toEqual({});
        expect(g1({ a: 1 }, { skip: { depth: [1] } })).toEqual({ a: 1 });
        expect(g1({ a: 1, b: true }, { skip: { depth: [1] } })).toEqual({ a: 1, b: true });
        expect(g1({ a: 1, b: true, c: 'C' }, { skip: { depth: [1] } }))
            .toEqual({ a: 1, b: true, c: 'C' });
        expect(g1({}, { skip: { keys: ['a'] } })).toEqual({});
        expect(g1({ a: 1 }, { skip: { keys: ['a'] } })).toEqual({ a: 1 });
        expect(g1({ a: 1, b: true }, { skip: { keys: ['a'] } })).toEqual({ a: 1, b: true });
        expect(g1({ a: 1, b: true, c: 'C' }, { skip: { keys: ['a'] } }))
            .toEqual({ a: 1, b: true, c: 'C' });
        let g2 = Shape({
            a: Number,
            b: { a: Boolean }
        });
        expect(g2({ b: { a: true } }, { skip: { keys: ['a'] } })).toEqual({ b: { a: true } });
        expect(g2({ a: 1, b: { a: true } }, { skip: { keys: ['a'] } }))
            .toEqual({ a: 1, b: { a: true } });
        expect(() => g2({ a: 1, b: {} }, { skip: { keys: ['a'] } })).toThrow('required');
    });
    test('array-regexp', () => {
        let g0 = Shape({ x: [/a/] });
        expect(g0.jsonify()).toEqual({ x: ['/a/'] });
        expect(g0.stringify()).toEqual('{"x":["/a/"]}');
        expect(g0({ x: [] })).toEqual({ x: [] });
        expect(g0({ x: ['a'] })).toEqual({ x: ['a'] });
        expect(g0({ x: ['ba', 'ac', 'dad'] })).toEqual({ x: ['ba', 'ac', 'dad'] });
        expect(() => g0({ x: ['q'] })).toThrow('string did not match /a/');
        let g0r = Shape.build(g0.jsonify());
        expect(g0r.stringify()).toEqual('{"x":["/a/"]}');
        expect(g0r({ x: [] })).toEqual({ x: [] });
        expect(g0r({ x: ['a'] })).toEqual({ x: ['a'] });
        expect(g0r({ x: ['ba', 'ac', 'dad'] })).toEqual({ x: ['ba', 'ac', 'dad'] });
        expect(() => g0r({ x: ['q'] })).toThrow('string did not match /a/');
    });
});
//# sourceMappingURL=shape.test.js.map
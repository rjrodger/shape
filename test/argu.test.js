"use strict";
/* Copyright (c) 2021-2023 Richard Rodger and other contributors, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
// Handle web (Shape) versus node ({Shape}) export.
let ShapeModule = require('../shape');
if (ShapeModule.Shape) {
    ShapeModule = ShapeModule.Shape;
}
const Shape = ShapeModule;
const { MakeArgu, Skip, Rest, Any, Empty, One, Default, } = Shape;
describe('argu', () => {
    test('basic', () => {
        let Argu = MakeArgu('QAZ');
        function foo(...args) {
            let argmap = Argu(args, 'foo', {
                a: 1,
                b: 'B'
            });
            return argmap;
        }
        expect(foo(2, 'X')).toEqual({ a: 2, b: 'X' });
        expect(() => foo(2, 3)).toThrow('QAZ (foo): Validation failed for property "b" with number "3" because the number is not of type string.');
    });
    test('skip-count', () => {
        let Argu = MakeArgu('SKIP');
        let a0 = Argu('foo', {
            a: Skip(Number),
            b: String
        });
        function foo(...args) {
            let argmap = a0(args);
            return argmap.a + argmap.b;
        }
        expect(foo(2, 'X')).toEqual('2X');
        expect(foo('X')).toEqual('undefinedX');
        expect(() => foo())
            .toThrow('SKIP (foo): Validation failed for property "b" with value ' +
            '"undefined" because the value is required.');
        expect(() => foo('X', 'Y'))
            .toThrow('SKIP (foo): ' +
            'Too many arguments for type signature (was 2, expected 1)');
        expect(() => foo(3, 4))
            .toThrow('SKIP (foo): Validation failed for property "b" ' +
            'with number "4" because the number is not of type string.');
        expect(() => foo(3))
            .toThrow('SKIP (foo): Validation failed for property "b" ' +
            'with value "undefined" because the value is required.');
        function bar(a, b, c, d) {
            let argmap = Argu(arguments, 'bar', {
                a: One(Empty(String), Object),
                b: Skip(Object),
                c: Skip(Function),
                d: Skip(Object),
            });
            return argmap;
        }
        expect(bar('s')).toEqual({ a: 's' });
        expect(() => bar('s', 't'))
            .toThrow('SKIP (bar): Validation failed for property \"d\" ' +
            'with string \"t\" because the string is not of type object.');
    });
    test('skip-req-rest', () => {
        let Argu = MakeArgu('seneca');
        function bar(...args) {
            let argmap = Argu(args, 'bar', {
                a: Skip(String),
                b: Skip(Object),
                c: Function,
                d: Rest(Any()),
            });
            return argmap;
        }
        const f0 = () => { };
        expect(bar('a', { x: 1 }, f0)).toEqual({ a: 'a', b: { x: 1 }, c: f0, d: [] });
        expect(bar({ x: 1 }, f0)).toEqual({ a: undefined, b: { x: 1 }, c: f0, d: [] });
        expect(bar('b', f0)).toEqual({ a: 'b', b: undefined, c: f0, d: [] });
        expect(bar(f0)).toEqual({ a: undefined, b: undefined, c: f0, d: [] });
        expect(bar('a', { x: 1 }, f0, 11))
            .toEqual({ a: 'a', b: { x: 1 }, c: f0, d: [11] });
        expect(bar({ x: 1 }, f0, 12))
            .toEqual({ a: undefined, b: { x: 1 }, c: f0, d: [12] });
        expect(bar('b', f0, 13))
            .toEqual({ a: 'b', b: undefined, c: f0, d: [13] });
        expect(bar(f0, 14))
            .toEqual({ a: undefined, b: undefined, c: f0, d: [14] });
        expect(bar('a', { x: 1 }, f0, 11, 12))
            .toEqual({ a: 'a', b: { x: 1 }, c: f0, d: [11, 12] });
        expect(bar({ x: 1 }, f0, 21, 22))
            .toEqual({ a: undefined, b: { x: 1 }, c: f0, d: [21, 22] });
        expect(bar('b', f0, 31, 32))
            .toEqual({ a: 'b', b: undefined, c: f0, d: [31, 32] });
        expect(bar(f0, 41, 42))
            .toEqual({ a: undefined, b: undefined, c: f0, d: [41, 42] });
    });
    test('plugin-args', () => {
        const Argu = MakeArgu('plugin');
        const argu = Argu('args', {
            plugin: One(Object, Function, String),
            options: Default(undefined, One(Object, String)),
            callback: Skip(Function),
        });
        expect(argu([{ x: 11 }]))
            .toEqual({ plugin: { x: 11 }, options: undefined, callback: undefined });
        expect(argu([{ x: 11 }, { y: 2 }]))
            .toEqual({ plugin: { x: 11 }, options: { y: 2 }, callback: undefined });
        const f0 = () => { };
        expect(argu([{ x: 11 }, { y: 2 }, f0]))
            .toEqual({ plugin: { x: 11 }, options: { y: 2 }, callback: f0 });
        expect(argu([f0]))
            .toEqual({ plugin: f0, options: undefined, callback: undefined });
        expect(argu([f0, { x: 1 }]))
            .toEqual({ plugin: f0, options: { x: 1 }, callback: undefined });
        const f1 = () => { };
        expect(argu([f0, { x: 1 }, f1]))
            .toEqual({ plugin: f0, options: { x: 1 }, callback: f1 });
        expect(argu([{ x: 1 }, { y: 2 }, f1]))
            .toEqual({ plugin: { x: 1 }, options: { y: 2 }, callback: f1 });
        expect(() => argu([f0, f1])).toThrow('plugin (args): Value "f1" for property "options"' +
            ' does not satisfy one of: Object, String');
        expect(argu([Object.freeze({ x: 11 })]))
            .toEqual({ plugin: { x: 11 }, options: undefined, callback: undefined });
        expect(argu([f0, Object.freeze({ x: 11 })]))
            .toEqual({ plugin: f0, options: { x: 11 }, callback: undefined });
    });
});
//# sourceMappingURL=argu.test.js.map
"use strict";
/* Copyright (c) 2021-2023 Richard Rodger and other contributors, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bar = exports.Foo = void 0;
const package_json_1 = __importDefault(require("../package.json"));
// Handle web (Shape) versus node ({Shape}) export.
let ShapeModule = require('../shape');
if (ShapeModule.Shape) {
    ShapeModule = ShapeModule.Shape;
}
const Shape = ShapeModule;
const buildize = Shape.buildize;
const makeErr = Shape.makeErr;
const VERSION = package_json_1.default.version;
const { Above, After, All, Any, Before, Below, Check, Child, Closed, Default, Define, Empty, Exact, Func, Key, Len, Max, Min, Never, One, Open, Optional, Refer, Rename, Required, Skip, Some, Type, } = Shape;
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
describe('builder', () => {
    test('builder-required', () => {
        let g0 = Shape({ a: Required({ x: 1 }) });
        expect(g0({ a: { x: 1 } })).toEqual({ a: { x: 1 } });
        expect(() => g0({})).toThrow('Validation failed for property "a" with value "undefined" because the value is required.');
        expect(() => g0()).toThrow('Validation failed for property "a" with value "undefined" because the value is required.');
        let g1 = Shape({ a: Required([1]) });
        expect(g1({ a: [11] })).toEqual({ a: [11] });
        expect(() => g1({})).toThrow('Validation failed for property "a" with value "undefined" because the value is required.');
        expect(() => g1()).toThrow('Validation failed for property "a" with value "undefined" because the value is required.');
        let g2 = Shape(Required(1));
        expect(g2(1)).toEqual(1);
        expect(g2(2)).toEqual(2);
        // TODO: note this in docs - deep child requires must be satisfied unless Skip
        let g3 = Shape({ a: { b: String } });
        expect(() => g3()).toThrow(/"a.b".*required/);
        expect(() => g3({})).toThrow(/"a.b".*required/);
        expect(() => g3({ a: {} })).toThrow(/"a.b".*required/);
        let g4 = Shape({ a: Skip({ b: String }) });
        expect(g4()).toEqual({});
        expect(g4({})).toEqual({});
        expect(g4({ a: undefined })).toEqual({});
        expect(() => g4({ a: {} })).toThrow(/"a.b".*required/);
        let g5 = Shape(Required({ x: 1 }));
        expect(g5({ x: 2 })).toEqual({ x: 2 });
        expect(() => g5({ x: 2, y: 3 })).toThrow('not allowed');
        expect(() => g5()).toThrow('required');
        expect(() => g5({ y: 3 })).toThrow('not allowed');
        let g6 = Shape(Closed(Required({ x: 1 })));
        expect(g6({ x: 2 })).toEqual({ x: 2 });
        expect(() => g6({ x: 2, y: 3 })).toThrow('Validation failed for object "{x:2,y:3}" because the property "y" is not allowed.');
        expect(() => g6()).toThrow('required');
        let g7 = Shape(Closed({ x: 1 }).Required());
        expect(g7({ x: 2 })).toEqual({ x: 2 });
        expect(() => g7({ x: 2, y: 3 })).toThrow('Validation failed for object "{x:2,y:3}" because the property "y" is not allowed.');
        expect(() => g7()).toThrow('required');
        let g8 = Shape({ a: Required(1) });
        expect(g8({ a: 2 })).toMatchObject({ a: 2 });
        expect(() => g8({ a: 'x' })).toThrow(/number/);
    });
    test('builder-optional', () => {
        expect(Shape(Optional(1))()).toEqual(1);
        expect(Shape(Optional(1))(2)).toEqual(2);
        expect(() => Shape(Optional(1))(true)).toThrow('type');
        expect(Shape({ a: Optional(1) })()).toEqual({ a: 1 });
        expect(Shape({ a: Optional(1) })({})).toEqual({ a: 1 });
        expect(Shape({ a: Optional(1) })({ a: undefined })).toEqual({ a: 1 });
        expect(Shape({ a: Optional(1) })({ a: 2 })).toEqual({ a: 2 });
        expect(() => Shape({ a: Optional(1) })({ a: true })).toThrow('type');
        expect(Shape([Optional(1)])()).toEqual([]);
        expect(Shape([Optional(1)])([])).toEqual([]);
        expect(Shape([Optional(1)])([2])).toEqual([2]);
        expect(Shape([Optional(1)])([2, 3])).toEqual([2, 3]);
        expect(() => Shape([Optional(1)])([true])).toThrow('type');
        expect(Shape([null, Optional(1)])()).toEqual([null, 1]);
        expect(Shape(Closed([Optional(1)]))()).toEqual([1]);
        expect(Shape(Optional(String))()).toEqual('');
        expect(Shape(Optional(Number))()).toEqual(0);
        expect(Shape(Optional(Boolean))()).toEqual(false);
        expect(Shape(Optional(Object))()).toEqual({});
        expect(Shape(Optional(Array))()).toEqual([]);
        expect(Shape(Optional(Required('a')))()).toEqual('a');
        expect(Shape(Optional(Required(1)))()).toEqual(1);
        expect(Shape(Optional(Required(true)))()).toEqual(true);
        expect(Shape(Optional(Required({})))()).toEqual({});
        expect(Shape(Optional(Required([])))()).toEqual([]);
        expect(Shape(Optional())()).toEqual(undefined);
        expect(Shape(Optional())(undefined)).toEqual(undefined);
        expect(Shape(Optional())(1)).toEqual(1);
        expect(Shape(Optional())('a')).toEqual('a');
        expect(Shape(Optional())(true)).toEqual(true);
        expect(Shape(Optional())({})).toEqual({});
        expect(Shape(Optional())([])).toEqual([]);
        expect(Shape(Optional(null))()).toEqual(null);
        expect(Shape(Optional(NaN))()).toEqual(NaN);
        expect(Shape(Optional(Infinity))()).toEqual(Infinity);
        expect(Shape(Optional(-Infinity))()).toEqual(-Infinity);
        expect(Shape(Optional(null))(null)).toEqual(null);
        expect(Shape(Optional(NaN))(NaN)).toEqual(NaN);
        expect(Shape(Optional(Infinity))(Infinity)).toEqual(Infinity);
        expect(Shape(Optional(-Infinity))(-Infinity)).toEqual(-Infinity);
        expect(() => Shape(Optional(null))('a')).toThrow('type');
        expect(() => Shape(Optional(NaN))('a')).toThrow('type');
        expect(() => Shape(Optional(Infinity))('a')).toThrow('type');
        expect(() => Shape(Optional(-Infinity))('a')).toThrow('type');
        expect(Shape(Optional(undefined))()).toEqual(undefined);
        expect(Shape(Optional(undefined))(undefined)).toEqual(undefined);
        expect(() => Shape(Optional(undefined))('a')).toThrow('type');
        expect(Shape(Empty().Optional())('a')).toEqual('a');
        expect(Shape(Optional().Empty())('b')).toEqual('b');
    });
    test('builder-open', () => {
        expect(Shape({})()).toEqual({});
        expect(Shape(Open({}))()).toEqual({});
        expect(Shape({})({})).toEqual({});
        expect(Shape(Open({}))({})).toEqual({});
        expect(Shape({})({ x: 1 })).toEqual({ x: 1 });
        expect(Shape(Open({}))({ x: 1 })).toEqual({ x: 1 });
        expect(() => Shape({ y: 2 })({ x: 1 })).toThrow('not allowed');
        expect(Shape(Open({ y: 2 }))({ x: 1 })).toEqual({ y: 2, x: 1 });
        expect(() => Shape({ y: 2 })({ x: 1, y: 3 })).toThrow('not allowed');
        expect(Shape(Open({ y: 2 }))({ x: 1, y: 3 })).toEqual({ y: 3, x: 1 });
        expect(Shape({ a: {} })()).toEqual({ a: {} });
        expect(Shape({ a: Open({}) })()).toEqual({ a: {} });
        expect(Shape({ a: {} })({})).toEqual({ a: {} });
        expect(Shape({ a: Open({}) })({})).toEqual({ a: {} });
        expect(Shape({ a: {} })({ a: { x: 1 } })).toEqual({ a: { x: 1 } });
        expect(Shape({ a: Open({}) })({ a: { x: 1 } })).toEqual({ a: { x: 1 } });
        expect(() => Shape({ a: { y: 2 } })({ a: { x: 1 } })).toThrow('not allowed');
        expect(Shape({ a: Open({ y: 2 }) })({ a: { x: 1 } })).toEqual({ a: { y: 2, x: 1 } });
        expect(() => Shape({ a: { y: 2 } })({ a: { x: 1, y: 3 } })).toThrow('not allowed');
        expect(Shape({ a: Open({ y: 2 }) })({ a: { x: 1, y: 3 } })).toEqual({ a: { y: 3, x: 1 } });
        expect(Shape({ a: Open({}).Default({ x: 1 }) })()).toEqual({ a: { x: 1 } });
        // expect(() => Shape(Optional(1))(true)).toThrow('type')
    });
    test('builder-check', () => {
        let g0 = Shape(Check((v) => v === "x"));
        expect(g0('x')).toEqual('x');
        expect(() => g0('y'))
            .toThrow('Validation failed for string "y" because check "(v) => v === "x"" failed.');
        expect(() => g0(1))
            .toThrow('Validation failed for number "1" because check "(v) => v === "x"" failed.');
        expect(() => g0())
            .toThrow('Validation failed for value "undefined" because the value is required.');
        expect(Shape(Skip(g0))()).toEqual(undefined);
        let g1 = Shape(Check(/a/));
        expect(g1('a')).toEqual('a');
        expect(g1('qaq')).toEqual('qaq');
        expect(() => g1('q'))
            .toThrow('Validation failed for string "q" because check "/a/" failed.');
        expect(() => g1())
            .toThrow('Validation failed for value "undefined" because the value is required.');
        let g3 = Shape(Check('number'));
        expect(g3(1)).toEqual(1);
        expect(() => g3('a')).toThrow('number');
        expect(() => g3()).toThrow('required');
        let g4 = Shape({ x: Check('number') });
        expect(g4({ x: 1 })).toEqual({ x: 1 });
        expect(() => g4({ x: 'a' })).toThrow('number');
        expect(() => g4({})).toThrow('required');
        expect(() => g4()).toThrow('required');
        let g5 = Shape(Check(/ul/i));
        expect(g5('*UL*')).toEqual('*UL*');
        expect(() => g5()).toThrow('required');
        expect(() => g5(undefined)).toThrow('required');
        expect(() => g5(NaN)).toThrow('check');
        expect(() => g5(null)).toThrow('check');
        let c0 = Shape(Check((v) => v === 1));
        expect(c0(1)).toEqual(1);
        expect(() => c0(2))
            .toThrow('Validation failed for number "2" because check "(v) => v === 1" failed.');
        expect(() => c0('x')).toThrow('check');
        expect(() => c0()).toThrow('required');
        expect(c0.error(1)).toEqual([]);
        expect(c0.error('x')).toMatchObject([{ why: 'check' }]);
        expect(c0.error()).toMatchObject([{ why: 'required' }]);
        let c0s = Shape(Skip(c0));
        expect(c0s(1)).toEqual(1);
        expect(() => c0s(2))
            .toThrow('Validation failed for number "2" because check "(v) => v === 1" failed.');
        expect(() => c0s('x')).toThrow('check');
        expect(c0s()).toEqual(undefined);
        expect(c0s.error(1)).toEqual([]);
        expect(c0s.error('x')).toMatchObject([{ why: 'check' }]);
        expect(c0s.error()).toEqual([]);
        let c0d = Shape(Default('foo', c0));
        expect(c0d(1)).toEqual(1);
        expect(() => c0d(2))
            .toThrow('Validation failed for number "2" because check "(v) => v === 1" failed.');
        expect(() => c0d('x')).toThrow('check');
        expect(c0d()).toEqual('foo');
        expect(c0d.error(1)).toEqual([]);
        expect(c0d.error('x')).toMatchObject([{ why: 'check' }]);
        expect(c0d.error()).toEqual([]);
        let c1 = Shape(Check(/a/));
        expect(c1('qaq')).toEqual('qaq');
        expect(() => c1('qbq'))
            .toThrow('Validation failed for string "qbq" because check "/a/" failed.');
        expect(() => c1(1)).toThrow('check');
        expect(() => c1()).toThrow('required');
        let c1d = Shape(Default('a', Check(/a/)));
        expect(c1d('qaq')).toEqual('qaq');
        expect(() => c1d('qbq'))
            .toThrow('Validation failed for string "qbq" because check "/a/" failed.');
        expect(() => c1d(1)).toThrow('check');
        expect(c1d()).toEqual('a');
        let v0 = Shape(Check((v) => !!v, Number));
        expect(v0(1)).toEqual(1);
        expect(() => v0('a')).toThrow('number');
        let m0 = Shape({
            a: Check((v) => 2 === 1 + +v).Type(String)
        });
        expect(m0({ a: '1' })).toEqual({ a: '1' });
        expect(() => m0({ a: '2' })).toThrow('because check');
        expect(() => m0({ a: 1 })).toThrow('not of type string');
        let m1 = Shape({
            a: Check((v) => 2 === 1 + +v).String()
        });
        expect(m1({ a: '1' })).toEqual({ a: '1' });
        expect(() => m1({ a: '2' })).toThrow('because check');
        expect(() => m1({ a: 1 })).toThrow('not of type string');
    });
    test('builder-closed', () => {
        let tmp = {};
        let g0 = Shape({ a: { b: { c: Closed({ x: 1 }) } } });
        expect(g0({ a: { b: { c: { x: 2 } } } })).toEqual({ a: { b: { c: { x: 2 } } } });
        expect(() => g0({ a: { b: { c: { x: 2, y: 3 } } } }))
            .toThrow('Validation failed for property "a.b.c" with object "{x:2,y:3}" because ' +
            'the property "y" is not allowed.');
        let g1 = Shape(Closed([Date, RegExp]));
        expect(g1(tmp.a0 = [new Date(), /a/])).toEqual(tmp.a0);
        expect(() => g1([new Date(), /a/, 'Q'])).toThrow('not allowed');
        expect(g1((tmp.a2 = [new Date(), /a/], tmp.a2.x = 1, tmp.a2))).toEqual(tmp.a2);
        let g2 = Shape({ a: Closed([String]) });
        expect(g2({ a: ['x'] })).toEqual({ a: ['x'] });
        expect(() => g2({})).toThrow('required');
        expect(() => g2({ a: undefined })).toThrow('required');
        expect(() => g2({ a: [] })).toThrow('required');
        expect(() => g2({ a: ['x', 'y'] })).toThrow('not allowed');
        let g4 = Shape(Closed({ x: 1 }));
        expect(g4({})).toEqual({ x: 1 });
        expect(g4({ x: 11 })).toEqual({ x: 11 });
        expect(() => g4({ x: 11, y: 2 })).toThrow('property \"y\" is not allowed');
    });
    test('builder-one', () => {
        let g0 = Shape(One(Number, String));
        expect(g0(1)).toEqual(1);
        expect(g0('x')).toEqual('x');
        expect(() => g0(true)).toThrow('Value "true" for property "" does not satisfy one of: Number, String');
        expect(() => g0()).toThrow('Value "undefined" for property "" does not satisfy one of: Number, String');
        let g0o = Shape(Skip(One(Number, String)));
        expect(g0o(1)).toEqual(1);
        expect(g0o('x')).toEqual('x');
        expect(g0o()).toEqual(undefined);
        expect(() => g0o(true))
            .toThrow('Value "true" for property "" does not satisfy one of: Number, String');
        let g1 = Shape([One({ x: Number }, { x: String })]);
        expect(g1([{ x: 1 }, { x: 'x' }, { x: 2 }, { x: 'y' }]))
            .toMatchObject([{ x: 1 }, { x: 'x' }, { x: 2 }, { x: 'y' }]);
        expect(() => g1([{ x: 1 }, { x: true }, { x: 2 }, { x: false }]))
            .toThrow(`Value "{x:true}" for property "1" does not satisfy one of: {"x":"Number"}, {"x":"String"}
Value "{x:false}" for property "3" does not satisfy one of: {"x":"Number"}, {"x":"String"}`);
        let g2 = Shape([One({ x: Exact('red'), y: String }, { x: Exact('green'), z: Number })]);
        expect(g2([
            { x: 'red', y: 'Y' },
            { x: 'green', z: 1 },
        ])).toMatchObject([
            { x: 'red', y: 'Y' },
            { x: 'green', z: 1 },
        ]);
        expect(() => g2([
            { x: 'green', z: 2, y: 22 },
            { x: 'red', y: 'Y', z: 'YY' }
        ])).toThrow(`Value "{x:green,z:2,y:22}" for property "0" does not satisfy one of: {"x":"Exact(red)","y":"String"}, {"x":"Exact(green)","z":"Number"}
Value "{x:red,y:Y,z:YY}" for property "1" does not satisfy one of: {"x":"Exact(red)","y":"String"}, {"x":"Exact(green)","z":"Number"}`);
        expect(() => g2([
            { x: 'red', y: 3 },
            { x: 'green', z: 'Z' },
        ])).toThrow(`Value "{x:red,y:3}" for property "0" does not satisfy one of: {"x":"Exact(red)","y":"String"}, {"x":"Exact(green)","z":"Number"}
Value "{x:green,z:Z}" for property "1" does not satisfy one of: {"x":"Exact(red)","y":"String"}, {"x":"Exact(green)","z":"Number"}`);
    });
    test('builder-some', () => {
        let g0 = Shape({ a: Some(Number, String) });
        expect(g0({ a: 1 })).toEqual({ a: 1 });
        expect(g0({ a: 'x' })).toEqual({ a: 'x' });
        expect(() => g0({ a: true }))
            .toThrow(`Value "true" for property "a" does not satisfy any of: Number, String`);
        expect(() => g0({}))
            .toThrow('Value "undefined" for property "a" does not satisfy any of: Number, String');
        let g1 = Shape(Some(Number, String));
        expect(g1(1)).toEqual(1);
        expect(g1('x')).toEqual('x');
        expect(() => g1(true)).toThrow(`Value "true" for property "" does not satisfy any of: Number, String`);
        let g2 = Shape([Some(Number, String)]);
        expect(g2([1])).toEqual([1]);
        expect(g2(['x'])).toEqual(['x']);
        expect(g2([1, 2])).toEqual([1, 2]);
        expect(g2([1, 'x'])).toEqual([1, 'x']);
        expect(g2(['x', 1])).toEqual(['x', 1]);
        expect(g2(['x', 'y'])).toEqual(['x', 'y']);
        expect(g2(['x', 1, 'y', 2])).toEqual(['x', 1, 'y', 2]);
        expect(() => g2([true]))
            .toThrow(`Value "true" for property "0" does not satisfy any of: Number, String`);
        let g3 = Shape({ a: [Some(Number, String)] });
        expect(g3({ a: [1] })).toEqual({ a: [1] });
        expect(g3({ a: ['x'] })).toEqual({ a: ['x'] });
        expect(g3({ a: ['x', 1, 'y', 2] })).toEqual({ a: ['x', 1, 'y', 2] });
        expect(() => g3({ a: [1, 2, true] }))
            .toThrow(`Value "true" for property "a.2" does not satisfy any of: Number, String`);
        let g4 = Shape({ a: [Some(Open({ x: 1 }), Open({ x: 'X' }))] });
        expect(g4({ a: [{ x: 2 }, { x: 'Q' }, { x: 3, y: true }, { x: 'W', y: false }] }))
            .toEqual({ a: [{ x: 2 }, { x: 'Q' }, { x: 3, y: true }, { x: 'W', y: false }] });
        let g5 = Shape({ a: [Some({ x: 1 }, Closed({ x: 'X' }))] });
        expect(g5({ a: [{ x: 2 }, { x: 'Q' }] }))
            .toEqual({ a: [{ x: 2 }, { x: 'Q' }] });
    });
    test('builder-all', () => {
        let g0 = Shape(All(Open({ x: 1 }), Open({ y: 'a' })));
        // console.log(g0.stringify())
        expect(g0.stringify())
            .toEqual('{"$$":"All($$ref0,$$ref1)","$$ref0":{"x":"1","$$":"Open"}' +
            ',"$$ref1":{"y":"\\"a\\"","$$":"Open"}}');
        expect(g0({ x: 11, y: 'aa' })).toEqual({ x: 11, y: 'aa' });
        expect(g0({})).toEqual({ x: 1, y: 'a' });
        expect(() => g0({ x: 'b', y: 'a' })).toThrow('Value "{x:b,y:a}" for property "" does not satisfy all of:' +
            ' {x:1,$$:Open}, {y:a,$$:Open}');
        expect(() => g0()).toThrow('Validation failed for value "undefined" because the value is required.');
        let g0s = Shape(All(Open({ x: 1 }), Open({ y: 'a' })).Skip());
        expect(g0s({ x: 11, y: 'aa' })).toEqual({ x: 11, y: 'aa' });
        expect(g0s({})).toEqual({ x: 1, y: 'a' });
        expect(() => g0s({ x: 'b', y: 'a' })).toThrow('Value "{x:b,y:a}" for property "" does not satisfy all of:' +
            ' {x:1,$$:Open}, {y:a,$$:Open}');
        expect(g0s()).toEqual(undefined);
        // TODO: Optional
        // expect(g0s()).toEqual({ x: 1, y: 'a' })
        let g1 = Shape({
            a: All(Check((v) => v > 10), Check((v) => v < 20))
        });
        // console.dir(g1.spec(), { depth: null })
        expect(g1({ a: 11 })).toEqual({ a: 11 });
        expect(() => g1({ a: 0 })).toThrow('Value "0" for property "a" does not satisfy all of: ' +
            'Check((v) => v > 10), Check((v) => v < 20)');
        let g2 = Shape(All({ x: 1, y: Any() }, { x: Any(), y: 'a' }));
        expect(g2({ x: 11, y: 'AA' })).toEqual({ x: 11, y: 'AA' });
        // g2({ x: 11, y: true })
        expect(() => g2({ x: 11, y: true }))
            .toThrow('Value "{x:11,y:true}" for property "" does not satisfy all of:' +
            ' {"x":1,"y":"Any"}, {"x":"Any","y":"a"}');
        let g3 = Shape(All({ x: 1, y: Any() }, { x: Any(), y: { z: 'a' } }));
        expect(g3({ x: 11, y: { z: 'AA' } })).toEqual({ x: 11, y: { z: 'AA' } });
        expect(() => g3({ x: 11, y: { z: true } }))
            .toThrow('Value "{x:11,y:{z:true}}" for property "" does not satisfy all of:' +
            ' {"x":1,"y":"Any"}, {"x":"Any","y":{"z":"a"}}');
        let g4 = Shape(All(Open({ x: 1 }), Open({ y: 2 })));
        expect(g4({ x: 11, y: 22 })).toEqual({ x: 11, y: 22 });
        expect(() => g4({ x: 'X', y: 'Y' })).toThrow('Value "{x:X,y:Y}" for property "" does not satisfy all of:' +
            ' {x:1,$$:Open}, {y:2,$$:Open}');
    });
    test('builder-skip', () => {
        let g0a = Shape({ a: Skip(String) });
        expect(g0a({ a: 'x' })).toMatchObject({ a: 'x' });
        // NOTE: Skip(Type) does not insert a default value.
        expect(g0a({})).toMatchObject({});
        expect(() => g0a({ a: 1 })).toThrow(/string/);
        let g0 = Shape(Skip(String));
        expect(g0('a')).toEqual('a');
        expect(g0(undefined)).toEqual(undefined);
        expect(g0()).toEqual(undefined);
        expect(() => g0('')).toThrow('not allowed');
        expect(() => g0(null)).toThrow('type');
        expect(() => g0(NaN)).toThrow('type');
        let g1 = Shape(Skip('x'));
        expect(g1('a')).toEqual('a');
        expect(g1(undefined)).toEqual(undefined);
        expect(g1()).toEqual(undefined);
        expect(() => g1('')).toThrow('not allowed');
        expect(() => g1(null)).toThrow('type');
        expect(() => g1(NaN)).toThrow('type');
        let g2 = Shape(Skip(''));
        expect(g2('a')).toEqual('a');
        expect(g2(undefined)).toEqual(undefined);
        expect(g2()).toEqual(undefined);
        expect(g2('')).toEqual('');
        expect(() => g2(null)).toThrow('type');
        expect(() => g2(NaN)).toThrow('type');
        let g3 = Shape(Skip(Empty(String)));
        expect(g3('a')).toEqual('a');
        expect(g3(undefined)).toEqual(undefined);
        expect(g3()).toEqual(undefined);
        expect(g3('')).toEqual('');
        expect(() => g3(null)).toThrow('type');
        expect(() => g3(NaN)).toThrow('type');
        let g4 = Shape(Skip(Empty('x')));
        expect(g4('a')).toEqual('a');
        expect(g4(undefined)).toEqual(undefined);
        expect(g4()).toEqual(undefined);
        expect(g4('')).toEqual('');
        expect(() => g4(null)).toThrow('type');
        expect(() => g4(NaN)).toThrow('type');
        let g5 = Shape(Skip(Empty('')));
        expect(g5('a')).toEqual('a');
        expect(g5(undefined)).toEqual(undefined);
        expect(g5()).toEqual(undefined);
        expect(g5('')).toEqual('');
        expect(() => g5(null)).toThrow('type');
        expect(() => g5(NaN)).toThrow('type');
        let o0 = Shape({ p: Skip(String) });
        expect(o0({ p: 'a' })).toEqual({ p: 'a' });
        expect(o0({ p: undefined })).toEqual({ p: undefined });
        expect(o0({})).toEqual({});
        expect(() => o0({ p: '' })).toThrow('not allowed');
        expect(() => o0({ p: null })).toThrow('type');
        expect(() => o0({ p: NaN })).toThrow('type');
        let o1 = Shape({ p: Skip('x') });
        expect(o1({ p: 'a' })).toEqual({ p: 'a' });
        expect(o1({ p: undefined })).toEqual({ p: undefined });
        expect(o1({})).toEqual({});
        expect(() => o1({ p: '' })).toThrow('not allowed');
        expect(() => o1({ p: null })).toThrow('type');
        expect(() => o1({ p: NaN })).toThrow('type');
        let o2 = Shape({ p: Skip('') });
        expect(o2({ p: 'a' })).toEqual({ p: 'a' });
        expect(o2({ p: undefined })).toEqual({ p: undefined });
        expect(o2({})).toEqual({});
        expect(o2({ p: '' })).toEqual({ p: '' });
        expect(() => o2({ p: null })).toThrow('type');
        expect(() => o2({ p: NaN })).toThrow('type');
        let o3 = Shape({ p: Skip(Empty(String)) });
        expect(o3({ p: 'a' })).toEqual({ p: 'a' });
        expect(o3({ p: undefined })).toEqual({ p: undefined });
        expect(o3({})).toEqual({});
        expect(o3({ p: '' })).toEqual({ p: '' });
        expect(() => o3({ p: null })).toThrow('type');
        expect(() => o3({ p: NaN })).toThrow('type');
        let o4 = Shape({ p: Skip(Empty('x')) });
        expect(o4({ p: 'a' })).toEqual({ p: 'a' });
        expect(o4({ p: undefined })).toEqual({ p: undefined });
        expect(o4({})).toEqual({});
        expect(o4({ p: '' })).toEqual({ p: '' });
        expect(() => o4({ p: null })).toThrow('type');
        expect(() => o4({ p: NaN })).toThrow('type');
        let o5 = Shape({ p: Skip(Empty('')) });
        expect(o5({ p: 'a' })).toEqual({ p: 'a' });
        expect(o5({ p: undefined })).toEqual({ p: undefined });
        expect(o5({})).toEqual({});
        expect(o5({ p: '' })).toEqual({ p: '' });
        expect(() => o5({ p: null })).toThrow('type');
        expect(() => o5({ p: NaN })).toThrow('type');
        let a0 = Shape([Skip(String)]);
        expect(a0(['a'])).toEqual(['a']);
        expect(a0([undefined])).toEqual([undefined]);
        expect(a0([])).toEqual([]);
        expect(() => a0([''])).toThrow('not allowed');
        expect(() => a0([null])).toThrow('type');
        expect(() => a0([NaN])).toThrow('type');
        let a1 = Shape([Skip('x')]);
        expect(a1(['a'])).toEqual(['a']);
        expect(a1([undefined])).toEqual([undefined]);
        expect(a1([])).toEqual([]);
        expect(() => a1([''])).toThrow('not allowed');
        expect(() => a1([null])).toThrow('type');
        expect(() => a1([NaN])).toThrow('type');
        let a2 = Shape([Skip('')]);
        expect(a2(['a'])).toEqual(['a']);
        expect(a2([undefined])).toEqual([undefined]);
        expect(a2([])).toEqual([]);
        expect(a2([''])).toEqual(['']);
        expect(() => a2([null])).toThrow('type');
        expect(() => a2([NaN])).toThrow('type');
        let a3 = Shape([Skip(Empty(String))]);
        expect(a3(['a'])).toEqual(['a']);
        expect(a3([undefined])).toEqual([undefined]);
        expect(a3([])).toEqual([]);
        expect(a3([''])).toEqual(['']);
        expect(() => a3([null])).toThrow('type');
        expect(() => a3([NaN])).toThrow('type');
        let a4 = Shape([Skip(Empty('x'))]);
        expect(a4(['a'])).toEqual(['a']);
        expect(a4([undefined])).toEqual([undefined]);
        expect(a4([])).toEqual([]);
        expect(a4([''])).toEqual(['']);
        expect(() => a4([null])).toThrow('type');
        expect(() => a4([NaN])).toThrow('type');
        let a5 = Shape([Skip(Empty(''))]);
        expect(a5(['a'])).toEqual(['a']);
        expect(a5([undefined])).toEqual([undefined]);
        expect(a5([])).toEqual([]);
        expect(a5([''])).toEqual(['']);
        expect(() => a5([null])).toThrow('type');
        expect(() => a5([NaN])).toThrow('type');
    });
    test('builder-any', () => {
        let g0 = Shape({ a: Any(), b: Any('B') });
        expect(g0({ a: 2, b: 1 })).toMatchObject({ a: 2, b: 1 });
        expect(g0({ a: 'x', b: 'y' })).toMatchObject({ a: 'x', b: 'y' });
        expect(g0({ b: 1 })).toEqual({ b: 1 });
        expect(g0({ a: 1, b: 'B' })).toEqual({ a: 1, b: 'B' });
    });
    test('builder-never', () => {
        let g0 = Shape(Never());
        expect(() => g0(1)).toThrow('Validation failed for number "1" because no value is allowed.');
        let g1 = Shape({ a: Never() });
        expect(() => g1({ a: 'x' })).toThrow('Validation failed for property "a" with string "x" because no value is allowed.');
    });
    test('builder-rename', () => {
        let g0 = Shape({ a: Rename('b', { x: 1 }) });
        expect(g0({ a: { x: 2 } })).toMatchObject({ b: { x: 2 } });
        let g1 = Shape([
            Rename('a', String),
            Rename('b', 2),
            Rename({ name: 'c', keep: false }, true)
        ]);
        expect(g1(['x', 22])).toMatchObject({ 0: 'x', 1: 22, a: 'x', b: 22 });
        expect('' + g1(['x', 22])).toEqual('x,22');
        expect(g1(['x'])).toMatchObject({ 0: 'x', a: 'x', b: 2 });
        expect('' + g1(['x'])).toEqual('x,2');
        expect(() => g1([])).toThrow('required');
        expect(g1(['x', 22, false]))
            .toMatchObject({ 0: 'x', 1: 22, a: 'x', b: 22, c: false });
        let g2 = Shape({
            a: Number,
            b: Rename({ name: 'b', claim: ['a'], keep: false }, Number)
        });
        expect(g2({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
        expect(g2({ a: 1 })).toEqual({ b: 1 });
    });
    test('builder-exact', () => {
        let g0 = Shape({ a: Exact(null) });
        expect(g0({ a: null })).toMatchObject({ a: null });
        expect(() => g0({ a: 1 })).toThrow('exactly one of: null');
        let g1 = Shape(Exact('foo', 'bar'));
        expect(g1('foo')).toEqual('foo');
        expect(g1('bar')).toEqual('bar');
        expect(() => g1('zed')).toThrow('exactly one of: foo, bar');
    });
    test('builder-construct', () => {
        const SHAPE$ = Symbol.for('shape$');
        expect(Required('x')).toMatchObject({
            '$': { 'shape$': SHAPE$ },
            t: 'string',
            v: 'x',
            r: true,
        });
        expect(Skip(String)).toMatchObject({
            '$': { 'shape$': SHAPE$ },
            t: 'string',
            v: '',
            r: false,
        });
        expect(Required(Required('x'))).toMatchObject({
            '$': { 'shape$': SHAPE$ },
            t: 'string',
            v: 'x',
            r: true,
        });
        expect(Skip(Required('x'))).toMatchObject({
            '$': { 'shape$': SHAPE$ },
            t: 'string',
            v: 'x',
            r: false,
        });
        expect(Required('x').Required()).toMatchObject({
            '$': { 'shape$': SHAPE$ },
            t: 'string',
            v: 'x',
            r: true,
        });
        expect(Required('x').Skip()).toMatchObject({
            '$': { 'shape$': SHAPE$ },
            t: 'string',
            v: 'x',
            r: false,
        });
        expect(Skip(Skip(String))).toMatchObject({
            '$': { 'shape$': SHAPE$ },
            t: 'string',
            v: '',
            r: false,
        });
        expect(Skip(String).Skip()).toMatchObject({
            '$': { 'shape$': SHAPE$ },
            t: 'string',
            v: '',
            r: false,
        });
        expect(Skip(String).Required()).toMatchObject({
            '$': { 'shape$': SHAPE$ },
            t: 'string',
            v: '',
            r: true,
        });
        expect(Required(Skip(String))).toMatchObject({
            '$': { 'shape$': SHAPE$ },
            t: 'string',
            v: '',
            r: true,
        });
    });
    test('builder-before', () => {
        // Use before to check for undefined, as it not passed to Check
        let b0 = Shape(Before((v) => undefined === v));
        expect(b0(undefined)).toEqual(undefined);
        expect(() => b0(1)).toThrow('check');
    });
    test('builder-before-after-basic', () => {
        let g0 = Shape(Before((val, _update) => {
            val.b = 1 + val.a;
            return true;
        }, Open({ a: 1 }))
            .After((val, _update) => {
            val.c = 10 * val.a;
            return true;
        }));
        expect('' + g0).toMatch(/\[Shape G\$\d+ \{"a":"1","\$\$":"Open"\}\]/);
        expect(g0({ a: 2 })).toMatchObject({ a: 2, b: 3, c: 20 });
        let g1 = Shape({
            x: After((val, _update) => {
                val.c = 10 * val.a;
                return true;
            }, Open({ a: 1 }))
                .Before((val, _update) => {
                val.b = 1 + val.a;
                return true;
            })
        });
        expect(g1({ x: { a: 2 } })).toMatchObject({ x: { a: 2, b: 3, c: 20 } });
    });
    test('builder-custom-hyperbole', () => {
        const Hyperbole = function (shape0) {
            let node = buildize(this, shape0);
            node.b.push((v, u) => {
                if ('string' === typeof (v)) {
                    u.val = v.toUpperCase();
                }
                return true;
            });
            node.a.push((v, u) => {
                if ('string' === typeof (v)) {
                    u.val = v + '!';
                }
                return true;
            });
            return node;
        };
        const g0 = Shape(Hyperbole('foo'));
        expect(g0('a')).toEqual('A!');
        expect(() => g0(1)).toThrow('type');
        expect(g0()).toEqual('foo!'); // before called before processing!
        const g1 = Shape(Skip(Hyperbole(One(String, Number))));
        expect(g1('a')).toEqual('A!');
        expect(g1(1)).toEqual(1);
        expect(g1()).toEqual(undefined);
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
        expect(() => a1(['x', 'y'])).toThrow('Validation failed for index "0" with string "x" because the string is not of type number.');
        expect(() => a1([1, 2])).toThrow('Validation failed for index "1" with number "2" because the number is not of type string.');
        let a2 = Shape([9, String]);
        expect(() => a2()).toThrow('required');
        expect(() => a2([])).toThrow('required');
        expect(() => a2([1])).toThrow('required');
        expect(a2([1, 'x'])).toMatchObject([1, 'x']);
        expect(() => a2([1, 'x', 'y'])).toThrow('not allowed');
        expect(() => a2(['x', 1])).toThrow(`Validation failed for index "0" with string "x" because the string is not of type number.
Validation failed for index "1" with number "1" because the number is not of type string.`);
        expect(() => a2(['x', 'y'])).toThrow('Validation failed for index "0" with string "x" because the string is not of type number.');
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
    test('builder-custom-between', () => {
        const rangeCheck = Shape([Number, Number]);
        const Between = function (inopts, spec) {
            let vs = buildize(this || spec);
            let range = rangeCheck(inopts);
            vs.b.push((val, update, state) => {
                // Don't run any more checks after this.
                update.done = true;
                if ('number' === typeof (val) && range[0] < val && val < range[1]) {
                    return true;
                }
                else {
                    update.err = [
                        makeErr(state, `Value "$VALUE" for property "$PATH" is ` +
                            `not between ${range[0]} and ${range[1]}.`)
                    ];
                    return false;
                }
            });
            return vs;
        };
        const g0 = Shape({ a: [Between([10, 20])] });
        expect(g0({ a: [11, 12, 13] })).toEqual({ a: [11, 12, 13] });
        expect(() => g0({ a: [11, 9, 13, 'y'] })).toThrow('Value "9" for property "a.1" is not between 10 and 20.\nValue "y" for property "a.3" is not between 10 and 20.');
    });
    test('builder-define-refer-basic', () => {
        let g0 = Shape({ a: Define('A', { x: 1 }), b: Refer('A'), c: Refer('A') });
        expect(g0({ a: { x: 2 }, b: { x: 2 } }))
            .toEqual({ a: { x: 2 }, b: { x: 2 } });
        expect(g0({ a: { x: 33 }, b: { x: 44 }, c: { x: 55 } }))
            .toEqual({ a: { x: 33 }, b: { x: 44 }, c: { x: 55 } });
        expect(() => g0({ a: { x: 33 }, b: { x: 'X' } }))
            .toThrow('Validation failed for property "b.x" with string "X" because the string is not of type number.');
        let g1 = Shape({
            a: Define('A', { x: 1 }),
            b: Refer('A'),
            c: Refer({ name: 'A', fill: true })
        });
        expect(g1({ a: { x: 2 } }))
            .toEqual({ a: { x: 2 }, c: { x: 1 } });
        expect(g1({ a: { x: 2 }, b: { x: 2 } }))
            .toEqual({ a: { x: 2 }, b: { x: 2 }, c: { x: 1 } });
        expect(g1({ a: { x: 2 }, b: { x: 2 }, c: {} }))
            .toEqual({ a: { x: 2 }, b: { x: 2 }, c: { x: 1 } });
        expect(g1({ a: { x: 33 }, b: { x: 44 }, c: { x: 2 } }))
            .toEqual({ a: { x: 33 }, b: { x: 44 }, c: { x: 2 } });
    });
    test('builder-define-refer-recursive', () => {
        let g0 = Shape({
            a: Define('A', {
                b: {
                    c: 1,
                    a: Refer('A')
                }
            }),
        });
        expect(g0({
            a: {
                b: {
                    c: 2,
                }
            }
        })).toEqual({
            a: {
                b: {
                    c: 2,
                }
            }
        });
        expect(g0({
            a: {
                b: {
                    c: 2,
                    a: {
                        b: {
                            c: 3
                        }
                    }
                }
            }
        })).toEqual({
            a: {
                b: {
                    c: 2,
                    a: {
                        b: {
                            c: 3
                        }
                    }
                }
            }
        });
        expect(() => g0({
            a: {
                b: {
                    c: 2,
                    a: {
                        b: {
                            c: 'C'
                        }
                    }
                }
            }
        })).toThrow('Validation failed for property "a.b.a.b.c" with string "C" because the string is not of type number.');
        expect(g0({
            a: {
                b: {
                    c: 2,
                    a: {
                        b: {
                            c: 3,
                            a: {
                                b: {
                                    c: 4
                                }
                            }
                        }
                    }
                }
            }
        })).toEqual({
            a: {
                b: {
                    c: 2,
                    a: {
                        b: {
                            c: 3,
                            a: {
                                b: {
                                    c: 4
                                }
                            }
                        }
                    }
                }
            }
        });
    });
    test('builder-min-basic', () => {
        let g0 = Shape({
            a: Min(10),
            b: Min(2, [String]),
            c: Min(3, 'foo'),
            d: [Min(4, Number)],
            e: [Min(2, {})],
        });
        expect(g0({ a: 10 })).toMatchObject({ a: 10 });
        expect(g0({ a: 11 })).toMatchObject({ a: 11 });
        expect(() => g0({ a: 9 }))
            .toThrow(`Value "9" for property "a" must be a minimum of 10 (was 9).`);
        expect(g0({ b: ['x', 'y'] })).toMatchObject({ b: ['x', 'y'] });
        expect(g0({ b: ['x', 'y', 'z'] })).toMatchObject({ b: ['x', 'y', 'z'] });
        expect(() => g0({ b: ['x'] }))
            .toThrow(`Value "[x]" for property "b" must be a minimum length of 2 (was 1).`);
        expect(() => g0({ b: [] }))
            .toThrow(`Value "[]" for property "b" must be a minimum length of 2 (was 0).`);
        expect(g0({ c: 'bar' })).toMatchObject({ c: 'bar' });
        expect(g0({ c: 'barx' })).toMatchObject({ c: 'barx' });
        expect(() => g0({ c: 'ba' }))
            .toThrow(`Value "ba" for property "c" must be a minimum length of 3 (was 2).`);
        expect(g0({ d: [4, 5, 6] })).toMatchObject({ d: [4, 5, 6] });
        expect(() => g0({ d: [4, 5, 6, 3] }))
            .toThrow(`Value "3" for property "d.3" must be a minimum of 4 (was 3).`);
        expect(g0({ e: [{ x: 1, y: 2 }] })).toMatchObject({ e: [{ x: 1, y: 2 }] });
        expect(g0({ e: [{ x: 1, y: 2, z: 3 }] }))
            .toMatchObject({ e: [{ x: 1, y: 2, z: 3 }] });
        expect(() => g0({ e: [{ x: 1 }] })).toThrow('Value "{x:1}" for property "e.0" must be a minimum length of 2 (was 1).');
        expect(() => g0({ e: [{}] })).toThrow('Value "{}" for property "e.0" must be a minimum length of 2 (was 0).');
        expect(g0({ e: [] })).toMatchObject({ e: [] });
    });
    test('builder-min-example', () => {
        const { Min } = Shape;
        let shape = Shape({
            size: Min(2, 4) // Minimum is 2, default is 4, type is Number, optional
        });
        expect(shape({})).toEqual({ size: 4 });
        expect(shape({ size: 3 })).toEqual({ size: 3 });
        expect(() => shape({ size: 1 })).toThrow('minimum');
    });
    test('builder-max', () => {
        let g0 = Shape({
            a: Max(10),
            b: Max(2, [String]),
            c: Max(3, 'foo'),
            d: [Max(4, Number)],
            e: [Max(2, {})],
        });
        expect(g0({ a: 10 })).toMatchObject({ a: 10 });
        expect(g0({ a: 9 })).toMatchObject({ a: 9 });
        expect(() => g0({ a: 11 }))
            .toThrow(`Value "11" for property "a" must be a maximum of 10 (was 11).`);
        expect(g0({ b: ['x', 'y'] })).toMatchObject({ b: ['x', 'y'] });
        expect(g0({ b: ['x'] })).toMatchObject({ b: ['x'] });
        expect(g0({ b: [] })).toMatchObject({ b: [] });
        expect(() => g0({ b: ['x', 'y', 'z'] }))
            .toThrow(`Value "[x,y,z]" for property "b" must be a maximum length of 2 (was 3).`);
        expect(g0({ c: 'bar' })).toMatchObject({ c: 'bar' });
        expect(g0({ c: 'ba' })).toMatchObject({ c: 'ba' });
        expect(g0({ c: 'b' })).toMatchObject({ c: 'b' });
        expect(() => g0({ c: 'barx' }))
            .toThrow(`Value "barx" for property "c" must be a maximum length of 3 (was 4).`);
        expect(() => g0({ c: '' }))
            .toThrow(`Validation failed for property "c" with string "" because an empty string is not allowed.`);
        expect(g0({ d: [4, 3, 2, 1, 0, -1] })).toMatchObject({ d: [4, 3, 2, 1, 0, -1] });
        expect(g0({ d: [] })).toMatchObject({ d: [] });
        expect(() => g0({ d: [4, 5] }))
            .toThrow(`Value "5" for property "d.1" must be a maximum of 4 (was 5).`);
        expect(g0({ e: [{ x: 1, y: 2 }] })).toMatchObject({ e: [{ x: 1, y: 2 }] });
        expect(g0({ e: [{ x: 1 }] }))
            .toMatchObject({ e: [{ x: 1 }] });
        expect(g0({ e: [{}] }))
            .toMatchObject({ e: [{}] });
        expect(() => g0({ e: [{ x: 1, y: 2, z: 3 }] })).toThrow('Value "{x:1,y:2,z:3}" for property "e.0" must be a maximum length of 2 (was 3).');
        expect(g0({ e: [] })).toMatchObject({ e: [] });
    });
    test('builder-above', () => {
        let g0 = Shape({
            a: Above(10),
            b: Above(2, [String]),
            c: Above(3, 'foo'),
            d: [Above(4, Number)],
            e: [Above(2, {})],
        });
        expect(g0({ a: 12 })).toMatchObject({ a: 12 });
        expect(g0({ a: 11 })).toMatchObject({ a: 11 });
        expect(() => g0({ a: 10 }))
            .toThrow(`Value "10" for property "a" must be above 10 (was 10).`);
        expect(() => g0({ a: 9 }))
            .toThrow(`Value "9" for property "a" must be above 10 (was 9).`);
        expect(g0({ b: ['x', 'y', 'z'] })).toMatchObject({ b: ['x', 'y', 'z'] });
        expect(() => g0({ b: ['x', 'y'] }))
            .toThrow(`Value "[x,y]" for property "b" must have length above 2 (was 2).`);
        expect(() => g0({ b: ['x'] }))
            .toThrow(`Value "[x]" for property "b" must have length above 2 (was 1).`);
        expect(() => g0({ b: [] }))
            .toThrow(`Value "[]" for property "b" must have length above 2 (was 0).`);
        expect(g0({ c: 'barx' })).toMatchObject({ c: 'barx' });
        expect(() => g0({ c: 'bar' }))
            .toThrow(`Value "bar" for property "c" must have length above 3 (was 3).`);
        expect(() => g0({ c: 'ba' }))
            .toThrow(`Value "ba" for property "c" must have length above 3 (was 2).`);
        expect(() => g0({ c: 'b' }))
            .toThrow(`Value "b" for property "c" must have length above 3 (was 1).`);
        expect(() => g0({ c: '' }))
            .toThrow('Value "" for property "c" must have length above 3 (was 0).');
        expect(g0({ d: [5, 6] })).toMatchObject({ d: [5, 6] });
        expect(() => g0({ d: [4, 5, 6, 3] }))
            .toThrow(`Value "4" for property "d.0" must be above 4 (was 4).
Value "3" for property "d.3" must be above 4 (was 3).`);
        expect(g0({ e: [{ x: 1, y: 2, z: 3 }] }))
            .toMatchObject({ e: [{ x: 1, y: 2, z: 3 }] });
        expect(() => g0({ e: [{ x: 1, y: 2 }] }))
            .toThrow('Value "{x:1,y:2}" for property "e.0" must have length above 2 (was 2).');
        expect(() => g0({ e: [{ x: 1 }] }))
            .toThrow('Value "{x:1}" for property "e.0" must have length above 2 (was 1).');
        expect(() => g0({ e: [{}] }))
            .toThrow('Value "{}" for property "e.0" must have length above 2 (was 0).');
        expect(g0({ e: [] })).toMatchObject({ e: [] });
    });
    test('builder-below', () => {
        let g0 = Shape({
            a: Below(10),
            b: Below(2, [String]),
            c: Below(3, 'foo'),
            d: [Below(4, Number)],
            e: [Below(2, {})],
        });
        expect(g0({ a: 8 })).toMatchObject({ a: 8 });
        expect(g0({ a: 9 })).toMatchObject({ a: 9 });
        expect(() => g0({ a: 10 }))
            .toThrow(`Value "10" for property "a" must be below 10 (was 10).`);
        expect(() => g0({ a: 11 }))
            .toThrow(`Value "11" for property "a" must be below 10 (was 11).`);
        expect(g0({ b: ['x'] })).toMatchObject({ b: ['x'] });
        expect(g0({ b: [] })).toMatchObject({ b: [] });
        expect(() => g0({ b: ['x', 'y', 'z'] }))
            .toThrow(`Value "[x,y,z]" for property "b" must have length below 2 (was 3).`);
        expect(() => g0({ b: ['x', 'y'] }))
            .toThrow(`Value "[x,y]" for property "b" must have length below 2 (was 2).`);
        expect(g0({ c: 'ba' })).toMatchObject({ c: 'ba' });
        expect(g0({ c: 'b' })).toMatchObject({ c: 'b' });
        expect(() => g0({ c: 'bar' }))
            .toThrow(`Value "bar" for property "c" must have length below 3 (was 3).`);
        expect(() => g0({ c: 'barx' }))
            .toThrow(`Value "barx" for property "c" must have length below 3 (was 4).`);
        expect(() => g0({ c: '' }))
            .toThrow(`Validation failed for property "c" with string "" because an empty string is not allowed.`);
        expect(g0({ d: [3, 2, 1, 0, -1] })).toMatchObject({ d: [3, 2, 1, 0, -1] });
        expect(g0({ d: [] })).toMatchObject({ d: [] });
        expect(() => g0({ d: [4, 5] }))
            .toThrow(`Value "4" for property "d.0" must be below 4 (was 4).
Value "5" for property "d.1" must be below 4 (was 5).`);
        expect(g0({ e: [{ x: 1 }] }))
            .toMatchObject({ e: [{ x: 1 }] });
        expect(g0({ e: [{}] }))
            .toMatchObject({ e: [{}] });
        expect(() => g0({ e: [{ x: 1, y: 2 }] })).toThrow('Value "{x:1,y:2}" for property "e.0" must have length below 2 (was 2).');
        expect(g0({ e: [] })).toMatchObject({ e: [] });
    });
    test('builder-len', () => {
        let g0 = Shape({
            a: Len(1),
            b: Len(2, [String]),
            c: Len(3, 'foo'),
            d: [Len(4, Number)],
            e: [Len(2, {})],
        });
        expect(g0({ a: 'a' })).toMatchObject({ a: 'a' });
        expect(g0({ a: 1 })).toMatchObject({ a: 1 });
        expect(() => g0({ a: 'bb' }))
            .toThrow(`Value "bb" for property "a" must be exactly 1 in length (was 2).`);
        expect(g0({ b: ['x', 'y'] })).toMatchObject({ b: ['x', 'y'] });
        expect(() => g0({ b: ['x', 'y', 'z'] }))
            .toThrow(`Value "[x,y,z]" for property "b" ` +
            `must be exactly 2 in length (was 3).`);
        expect(() => g0({ b: ['x'] }))
            .toThrow(`Value "[x]" for property "b" must be exactly 2 in length (was 1).`);
        expect(() => g0({ b: [] }))
            .toThrow(`Value "[]" for property "b" must be exactly 2 in length (was 0).`);
    });
    test('builder-func', () => {
        let f0 = () => 1;
        let f1 = () => 2;
        let g0 = Shape(Func(f0));
        expect(g0()).toEqual(f0);
        expect(g0(f1)).toEqual(f1);
        expect(() => g0(1)).toThrow('type');
        // Escapes type functions
        let g1 = Shape(Func(Number));
        expect(g1()).toEqual(Number);
        expect(g1(Number)).toEqual(Number);
        expect(() => g1(1)).toThrow('type');
    });
    test('builder-key', () => {
        let g0 = Shape({
            a: {
                b: {
                    c: {
                        name: Key(),
                        part0: Key(0),
                        part1: Key(1),
                        part2: Key(2),
                        join: Key(3, '.'),
                        self: Key(-1),
                        custom: Key((path, _state) => {
                            return path.length;
                        }),
                        x: 1,
                    }
                }
            }
        });
        expect(g0({ a: { b: { c: { x: 2 } } } })).toMatchObject({
            a: {
                b: {
                    c: {
                        name: 'c',
                        self: ['self'],
                        part0: [],
                        part1: ['c'],
                        part2: ['b', 'c'],
                        join: 'a.b.c',
                        custom: 5,
                        x: 2,
                    }
                }
            }
        });
        let g1 = Shape(Child({ name: Key() }));
        expect(g1({ a: {}, b: {} })).toMatchObject({ a: { name: 'a' }, b: { name: 'b' } });
    });
    test('builder-child', () => {
        let g0 = Shape(Child(Number));
        expect(g0({ a: 1, b: 2 })).toMatchObject({ a: 1, b: 2 });
        expect(() => g0({ a: 1, b: 2, c: 'c' })).toThrow('type');
        let g1 = Shape(Child(String, { a: 1 }));
        expect(g1({})).toMatchObject({});
        expect(g1({ a: 2 })).toMatchObject({ a: 2 });
        expect(() => g1({ a: 'x' })).toThrow('type');
        expect(g1({ a: 2, b: 'x' })).toMatchObject({ a: 2, b: 'x' });
        expect(g1({ a: 2, b: 'x', c: 'y' })).toMatchObject({ a: 2, b: 'x', c: 'y' });
        expect(() => g1({ a: 2, b: 3 })).toThrow('Validation failed for property "b" with number "3" because the number is not of type string.');
        expect(() => g1({ a: 2, b: 'x', c: 4 })).toThrow('Validation failed for property "c" with number "4" because the number is not of type string.');
        expect(() => g1({ a: true, b: 'x', c: 'y' })).toThrow('Validation failed for property "a" with boolean "true" because the boolean is not of type number.');
        expect(() => g1({ a: 'z', b: 'x', c: 'y' })).toThrow('Validation failed for property "a" with string "z" because the string is not of type number.');
        let g2 = Shape({ a: Required({ b: 1 }).Child({ x: String }) });
        expect(g2({ a: { b: 2, c: { x: 'x' } } }))
            .toMatchObject({ a: { b: 2, c: { x: 'x' } } });
        expect(g2({ a: { b: 2, c: { x: 'x' }, d: { x: 'z' } } }))
            .toMatchObject({ a: { b: 2, c: { x: 'x' }, d: { x: 'z' } } });
        expect(() => g2({ a: { b: 2, c: 3 } })).toThrow('Validation failed for property "a.c" with number "3" because the number is not of type object.');
        let g3 = Shape({ a: Child({ y: Number, x: Number }) });
        expect(g3({ a: { b: { y: 11, x: 11 }, c: { x: 22, y: 22 } } }))
            .toEqual({ a: { b: { x: 11, y: 11 }, c: { x: 22, y: 22 } } });
        let g4 = Shape({ a: Child({}) });
        expect(g4({ a: { b: { y: 11, x: 11 }, c: { x: 22, y: 22 } } }))
            .toEqual({ a: { b: { x: 11, y: 11 }, c: { x: 22, y: 22 } } });
        let g5 = Shape({ a: Child({ b: {} }) });
        expect(g5({ a: { x: { b: {} }, y: { b: {} } } }))
            .toEqual({ a: { x: { b: {} }, y: { b: {} } } });
        let g6 = Shape({ a: Child({ b: Child({ c: 1 }) }) });
        expect(g6({ a: { x: { b: { xx: { c: 11 } } }, y: { b: { yy: { c: 22 } } } } }))
            .toEqual({ a: { x: { b: { xx: { c: 11 } } }, y: { b: { yy: { c: 22 } } } } });
        let g7 = Shape({ a: Child({ b: 1 }) });
        expect(g7.spec().v.a.c.t).toEqual('object');
    });
    test('builder-skip', () => {
        // Skip does not insert, but does check type.
        let t0 = Shape(Skip());
        expect(t0()).toEqual(undefined);
        expect(t0(undefined)).toEqual(undefined);
        expect(t0(null)).toEqual(null);
        expect(t0(NaN)).toEqual(NaN);
        expect(t0(true)).toEqual(true);
        expect(t0(false)).toEqual(false);
        expect(t0(0)).toEqual(0);
        expect(t0(1)).toEqual(1);
        expect(t0('a')).toEqual('a');
        expect(t0('')).toEqual('');
        expect(t0({})).toEqual({});
        expect(t0([])).toEqual([]);
        let t1 = Shape(Skip(1));
        expect(t1()).toEqual(undefined);
        expect(t1(undefined)).toEqual(undefined);
        expect(() => t1(null)).toThrow('type');
        expect(() => t1(NaN)).toThrow('type');
        expect(() => t1(true)).toThrow('type');
        expect(() => t1(false)).toThrow('type');
        expect(t1(0)).toEqual(0);
        expect(t1(1)).toEqual(1);
        expect(() => t1('a')).toThrow('type');
        expect(() => t1('')).toThrow('type');
        expect(() => t1({})).toThrow('type');
        expect(() => t1([])).toThrow('type');
        let t2 = Shape(Skip(Number));
        expect(t2()).toEqual(undefined);
        expect(t2(undefined)).toEqual(undefined);
        expect(() => t2(null)).toThrow('type');
        expect(() => t2(NaN)).toThrow('type');
        expect(() => t2(true)).toThrow('type');
        expect(() => t2(false)).toThrow('type');
        expect(t2(0)).toEqual(0);
        expect(t2(1)).toEqual(1);
        expect(() => t2('a')).toThrow('type');
        expect(() => t2('')).toThrow('type');
        expect(() => t2({})).toThrow('type');
        expect(() => t2([])).toThrow('type');
        let d1 = Shape({ a: Skip(1) });
        expect(d1({})).toEqual({});
        expect(d1({ a: undefined })).toEqual({ a: undefined });
        expect(() => d1({ a: null })).toThrow('type');
        expect(() => d1({ a: NaN })).toThrow('type');
        expect(() => d1({ a: true })).toThrow('type');
        expect(() => d1({ a: false })).toThrow('type');
        expect(d1({ a: 0 })).toEqual({ a: 0 });
        expect(d1({ a: 1 })).toEqual({ a: 1 });
        expect(() => d1({ a: 'a' })).toThrow('type');
        expect(() => d1({ a: '' })).toThrow('type');
        expect(() => d1({ a: {} })).toThrow('type');
        expect(() => d1({ a: [] })).toThrow('type');
    });
    test('builder-default', () => {
        let d0 = Shape({
            a: 1,
            b: Default(2)
        });
        expect(d0()).toEqual({ a: 1, b: 2 });
        expect(d0(undefined)).toEqual({ a: 1, b: 2 });
        expect(() => d0(null)).toThrow('type');
        expect(d0({ a: 3 })).toEqual({ a: 3, b: 2 });
        expect(d0({ b: 4 })).toEqual({ a: 1, b: 4 });
        expect(d0({ a: 3, b: 4 })).toEqual({ a: 3, b: 4 });
        let d1 = Shape(Default(Number));
        expect(d1(11)).toEqual(11);
        expect(d1(undefined)).toEqual(0);
        expect(d1()).toEqual(0);
        let d2 = Shape({ a: Default(Number) });
        expect(d2({ a: 11 })).toEqual({ a: 11 });
        expect(d2({ a: undefined })).toEqual({ a: 0 });
        expect(d2()).toEqual({ a: 0 });
        let d3 = Shape(Default(Object));
        expect(d3({ x: 1 })).toEqual({ x: 1 });
        expect(d3({})).toEqual({});
        expect(d3()).toEqual({});
        let d4 = Shape({ a: Default(Object) });
        expect(d4({ a: { x: 2 } })).toEqual({ a: { x: 2 } });
        expect(d4({ a: {} })).toEqual({ a: {} });
        expect(d4({ a: undefined })).toEqual({ a: {} });
        expect(d4({})).toEqual({ a: {} });
        expect(d4()).toEqual({ a: {} });
        let d5 = Shape(Default({ a: null }, { a: Number }));
        expect(d5({ a: 1 })).toEqual({ a: 1 });
        expect(d5()).toEqual({ a: null });
        expect(() => d5({ a: 'x' })).toThrow('type');
        let d6 = Shape({ a: Default(Array) });
        expect(d6({ a: [1] })).toEqual({ a: [1] });
        expect(d6({ a: [] })).toEqual({ a: [] });
        expect(d6({ a: undefined })).toEqual({ a: [] });
        expect(d6({})).toEqual({ a: [] });
        expect(d6()).toEqual({ a: [] });
        let d7 = Shape(Default({ a: null }, { a: [Number] }));
        expect(d7({ a: [1, 2] })).toEqual({ a: [1, 2] });
        expect(d7()).toEqual({ a: null });
        expect(() => d7({ a: 'x' })).toThrow('type');
    });
    test('builder-type', () => {
        let s0 = {
            a: Type('Number')
        };
        let d0 = Shape(s0);
        let v0a = d0({ a: 1 });
        // let x: { a: number } & { a: string } = { a: 1 }
        expect(d0.stringify(null, true)).toEqual('{"a":"Number"}');
        expect(v0a).toEqual({ a: 1 });
        expect(() => d0({ a: 'A' })).toThrow('not of type number');
        let s1 = {
            a: Type(Boolean)
        };
        let d1 = Shape(s1);
        let v1a = d1({ a: false });
        expect(d1.stringify(null, true)).toEqual('{"a":"Boolean"}');
        expect(d1({ a: true })).toEqual({ a: true });
        expect(v1a).toEqual({ a: false });
        expect(() => d1({ a: 'A' })).toThrow('not of type boolean');
        // Type inference
        let x = {
            S: Type('String'),
            N: Type('Number'),
            B: Type('Boolean'),
            O: Type('Object'),
            A: Type('Array'),
            F: Type('Function'),
            Y: Type('Symbol'),
            s: Type(String),
            n: Type(Number),
            b: Type(Boolean),
            o: Type(Object),
            a: Type(Array),
            f: Type(Function),
            y: Type(Symbol),
            l: Type(null),
            u: Type(undefined),
            x: Type(NaN),
            d0: Type({ y: 1 }),
            d1: Type([11]),
            d2: Type(() => 0),
            d3: Type(Symbol.for('X')),
        };
        x = {
            S: 's',
            N: 11,
            B: true,
            O: {},
            A: [],
            F: () => ({ f: 1 }),
            Y: Symbol.for('Z'),
            s: 'S',
            n: 22,
            b: false,
            o: {},
            a: [],
            f: () => ({ f: 2, g: 3 }),
            y: Symbol.for('Q'),
            l: null,
            u: undefined,
            x: NaN,
            d0: { y: 2 },
            d1: [22, 33],
            d2: () => 2,
            d3: Symbol.for('Y'),
        };
        x.O = x.o = { q: 1 };
        x.A = x.a = ['q'];
        x.F = x.f = () => ({ f: 3, g: 4, h: 5 });
        x.Y = x.y = Symbol.for('W');
        // console.log(x)
    });
    test('compose-minmax', () => {
        let cs = Symbol.for('nodejs.util.inspect.custom');
        let g0 = Shape(Min(1, Max(3)));
        expect(g0(2)).toEqual(2);
        expect(g0.stringify()).toEqual('Max(3).Min(1)');
        expect((g0.node()[cs]()))
            .toEqual('{t:any n:0 r:false p:false d:0 k:[] e:true u:{} a:[] b:[Max(3) Min(1)] m:{}}');
        let g1 = Shape(Max(3, Min(1)));
        expect(g1(2)).toEqual(2);
        expect(g1.stringify()).toEqual('Min(1).Max(3)');
        expect((g1.node()[cs]()))
            .toEqual('{t:any n:0 r:false p:false d:0 k:[] e:true u:{} a:[] b:[Min(1) Max(3)] m:{}}');
        let g2 = Shape(Min(1, Max(3, 2)));
        expect(g2(2)).toEqual(2);
        expect(g2.stringify()).toEqual('2.Max(3).Min(1)');
        expect((g2.node()[cs]()))
            .toEqual('{t:number v:2 f:2 n:0 r:false p:false d:0 k:[] e:true' +
            ' u:{} a:[] b:[Max(3) Min(1)] m:{}}');
        let g3 = Shape(Max(3).Min(1));
        expect(g3(2)).toEqual(2);
        expect(g3.stringify()).toEqual('Max(3).Min(1)');
        expect((g3.node()[cs]()))
            .toEqual('{t:any n:0 r:false p:false d:0 k:[] e:true' +
            ' u:{} a:[] b:[Max(3) Min(1)] m:{}}');
        let g4 = Shape(Max(3, 2).Min(1));
        expect(g4(2)).toEqual(2);
        expect(g4.stringify()).toEqual('2.Max(3).Min(1)');
        expect((g4.node()[cs]()))
            .toEqual('{t:number v:2 f:2 n:0 r:false p:false d:0 k:[] e:true' +
            ' u:{} a:[] b:[Max(3) Min(1)] m:{}}');
        let g5 = Shape(Min(1, 2).Max(3));
        expect(g5(2)).toEqual(2);
        expect(g5.stringify()).toEqual('2.Min(1).Max(3)');
        expect(g5.node()[cs]())
            .toEqual('{t:number v:2 f:2 n:0 r:false p:false d:0 k:[] e:true' +
            ' u:{} a:[] b:[Min(1) Max(3)] m:{}}');
        let g6 = Shape(Min(1, { x: 11 }).Max(3));
        expect(g6({ x: 22 })).toEqual({ x: 22 });
        expect(g6.stringify()).toEqual('{"x":"11","$$":"Min(1).Max(3)"}');
        expect((g6.node()[cs]()))
            .toEqual('{t:object v:{x:{$:{v$:' + VERSION + '} t:number v:11 f:11 n:0 r:false p:false d:1 k:[]' +
            ' e:true u:{} a:[] b:[] m:{}}} n:1 r:false p:false d:0 k:[x] e:true u:{} a:[]' +
            ' b:[Min(1) Max(3)] m:{}}');
        let g7 = Shape(Min(1).Max(3, { x: 11 }));
        expect(g7({ x: 22 })).toEqual({ x: 22 });
        expect(g7.stringify()).toEqual('{"x":"11","$$":"Min(1).Max(3)"}');
        expect((g7.node()[cs]()))
            .toEqual('{t:object v:{x:{$:{v$:' + VERSION + '} t:number v:11 f:11 n:0 r:false p:false d:1 k:[]' +
            ' e:true u:{} a:[] b:[] m:{}}} n:1 r:false p:false d:0 k:[x] e:true u:{} a:[]' +
            ' b:[Min(1) Max(3)] m:{}}');
    });
    test('compose-node', () => {
        let g0 = Shape({ a: Required(Child({ x: String }, { b: 1 })) });
        let g1 = Shape({ a: Required({ b: 1 }).Child({ x: String }) });
        let g4 = Shape({ a: Child({ x: String }, Required({ b: 1 })) });
        let g5 = Shape({ a: Child({ x: String }, { b: 1 }).Required() });
        let g6 = Shape({ a: Child({ x: String }).Required({ b: 1 }) });
        let g7 = Shape({ a: Required().Child({ x: String }, { b: 1 }) });
        // console.dir(g0.spec(), { depth: null })
        let VERSION = package_json_1.default.version;
        let spec = {
            '$': { 'shape$': true, 'v$': VERSION },
            t: 'object',
            v: {
                a: {
                    '$': { 'shape$': true, 'v$': VERSION },
                    t: 'object',
                    v: {
                        b: {
                            '$': { 'shape$': true, 'v$': VERSION },
                            t: 'number',
                            v: 1,
                            f: 1,
                            n: 0,
                            r: false,
                            p: false,
                            d: 2,
                            k: [],
                            e: true,
                            u: {},
                            a: [],
                            b: [],
                            m: {}
                        }
                    },
                    n: 1,
                    c: {
                        '$': { 'shape$': true, 'v$': VERSION },
                        t: 'object',
                        v: {
                            x: {
                                '$': { 'shape$': true, 'v$': VERSION },
                                t: 'string',
                                v: '',
                                f: '',
                                n: 0,
                                r: true,
                                p: false,
                                d: 3,
                                k: [],
                                e: true,
                                u: {},
                                a: [],
                                b: [],
                                m: {}
                            }
                        },
                        n: 1,
                        r: false,
                        p: false,
                        d: 2,
                        k: [],
                        e: true,
                        u: {},
                        a: [],
                        b: [],
                        m: {}
                    },
                    r: true,
                    p: false,
                    d: 1,
                    k: ['b'],
                    e: true,
                    u: {},
                    a: [],
                    b: [],
                    m: {}
                }
            },
            n: 1,
            r: false,
            p: false,
            d: 0,
            k: ['a'],
            e: true,
            u: {},
            a: [],
            b: [],
            m: {}
        };
        const g0spec = g0.spec();
        expect(g0spec).toEqual(spec);
        expect(g1.spec()).toEqual(g0spec);
        expect(g4.spec()).toEqual(g0spec);
        expect(g5.spec()).toEqual(g0spec);
        expect(g6.spec()).toEqual(g0spec);
        expect(g7.spec()).toEqual(g0spec);
    });
    test('builder-exports', () => {
        expect(JSON.stringify(Shape.Skip())).toEqual(JSON.stringify(Skip()));
    });
    test('readme-shape-builder', () => {
        const userShape = Shape({
            person: Required({
                name: String,
                age: Number,
            })
        });
        expect(() => userShape({})).toThrow('Validation failed for property "person" with value "undefined" because the value is required.');
        expect(userShape({
            person: {
                name: 'Alice',
                age: 99
            }
        })).toEqual({
            person: {
                name: 'Alice',
                age: 99
            }
        });
    });
    test('api-builders-chain-compose', () => {
        let cr0s = Shape(Closed(Required({ x: 1 })), { name: 'cr0' });
        let cr1s = Shape(Required(Closed({ x: 1 })), { name: 'cr1' });
        let cr2s = Shape(Closed({ x: 1 }).Required(), { name: 'cr2' });
        let cr3s = Shape(Required({ x: 1 }).Closed(), { name: 'cr3' });
        let s0 = {
            '$': { 'shape$': true, 'v$': package_json_1.default.version },
            t: 'object',
            v: {
                x: {
                    '$': { 'shape$': true, 'v$': package_json_1.default.version },
                    t: 'number',
                    v: 1,
                    f: 1,
                    n: 0,
                    r: false,
                    p: false,
                    d: 1,
                    u: {},
                    a: [],
                    b: [],
                    e: true,
                    k: [],
                    m: {},
                }
            },
            n: 1,
            r: true,
            p: false,
            d: 0,
            u: {},
            a: [],
            b: [],
            e: true,
            k: ['x'],
            m: {},
        };
        expect(cr0s.spec()).toEqual(s0);
        expect(cr1s.spec()).toEqual(s0);
        expect(cr2s.spec()).toEqual(s0);
        expect(cr3s.spec()).toEqual(s0);
        expect(cr0s({ x: 11 })).toEqual({ x: 11 });
        expect(cr1s({ x: 11 })).toEqual({ x: 11 });
        expect(cr2s({ x: 11 })).toEqual({ x: 11 });
        expect(cr3s({ x: 11 })).toEqual({ x: 11 });
        expect(() => cr0s({ x: 11, y: 2 })).toThrow('property "y" is not allowed.');
        expect(() => cr1s({ x: 11, y: 2 })).toThrow('property "y" is not allowed.');
        expect(() => cr2s({ x: 11, y: 2 })).toThrow('property "y" is not allowed.');
        expect(() => cr3s({ x: 11, y: 2 })).toThrow('property "y" is not allowed.');
        expect(cr0s({})).toEqual({ x: 1 });
        expect(cr1s({})).toEqual({ x: 1 });
        expect(cr2s({})).toEqual({ x: 1 });
        expect(cr3s({})).toEqual({ x: 1 });
    });
    test('api-builders-examples', () => {
        let shape_AboveB0 = Shape(Above(10));
        expect(shape_AboveB0(11)).toEqual(11);
        expect(() => shape_AboveB0(10))
            .toThrow('Value "10" for property "" must be above 10 (was 10).');
        expect(() => shape_AboveB0(true))
            .toThrow('Value "true" for property "" must have length above 10 (was NaN).');
        let shape_AboveB1 = Shape(Above(2));
        expect(shape_AboveB1('abc')).toEqual('abc');
        expect(() => shape_AboveB1('ab'))
            .toThrow('Value "ab" for property "" must have length above 2 (was 2).');
        expect(shape_AboveB1([1, 2, 3])).toEqual([1, 2, 3]);
        expect(() => shape_AboveB1([1, 2]))
            .toThrow('Value "[1,2]" for property "" must have length above 2 (was 2).');
        expect(shape_AboveB1({ a: 1, b: 2, c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
        expect(() => shape_AboveB1({ a: 1, b: 2 }))
            .toThrow('Value "{a:1,b:2}" for property "" must have length above 2 (was 2).');
        let shape_AboveB2 = Shape(Above(2, Number));
        expect(shape_AboveB2(3)).toEqual(3);
        expect(() => shape_AboveB2([1, 2, 3]))
            .toThrow('Validation failed for array "[1,2,3]" because the array is not of type number.');
        let shape_AboveB3 = Shape(Skip(Above(2, Number)));
        expect(shape_AboveB3(3)).toEqual(3);
        expect(shape_AboveB3()).toEqual(undefined);
        let shape_AfterB0 = Shape(After((v) => v > 10, 15));
        expect(shape_AfterB0(11)).toEqual(11);
        expect(() => shape_AfterB0(10))
            .toThrow('Validation failed for number "10" because check "(v) => v > 10" failed.');
        expect(() => shape_AfterB0('x'))
            .toThrow(`Validation failed for string "x" because the string is not of type number.
Validation failed for string "x" because check "(v) => v > 10" failed.`);
        expect(shape_AfterB0()).toEqual(15);
        let shape_AfterB1 = Shape(Skip(Number).After((v) => v % 2 === 0));
        expect(shape_AfterB1(2)).toEqual(2);
        expect(() => shape_AfterB1(3))
            .toThrow('Validation failed for number "3" because check "(v) => v % 2 === 0" failed.');
        expect(() => shape_AfterB1('x'))
            .toThrow('Validation failed for string "x" because check "(v) => v % 2 === 0" failed.');
        expect(shape_AfterB1()).toEqual(undefined);
        let shape_AfterB2 = Shape(After((v) => v.x % 2 === 0, Required({ x: Number })));
        expect(shape_AfterB2({ x: 2 })).toEqual({ x: 2 });
        expect(() => shape_AfterB2({ x: 3 }))
            .toThrow('Validation failed for object "{x:3}" because check "(v) => v.x % 2 === 0" failed.');
        expect(() => shape_AfterB2({}))
            .toThrow(`Validation failed for object "{}" because check "(v) => v.x % 2 === 0" failed.
Validation failed for property "x" with value "undefined" because the value is required.`);
        expect(() => shape_AfterB2())
            .toThrow(`Validation failed for value "undefined" because the value is required.`);
        // TODO: modify value
        let shape_AllB0 = Shape(All(Number, Check((v) => v > 10)));
        expect(shape_AllB0(11)).toEqual(11);
        expect(() => shape_AllB0(10))
            .toThrow('Value "10" for property "" does not satisfy all of: ' +
            'Number, Check((v) => v > 10)');
        let shape_AllB1 = Shape(All());
        expect(shape_AllB1(123)).toEqual(123);
        expect(() => shape_AllB1()).toThrow('required');
        let shape_AllB2 = Shape({ a: Default({ b: 'B' }, All(Open({ b: String }), Max(2))) });
        expect(shape_AllB2({})).toEqual({ a: { b: 'B' } });
        expect(shape_AllB2({ a: { b: 'X' } })).toEqual({ a: { b: 'X' } });
        expect(shape_AllB2({ a: { b: 'X', c: 'Y' } })).toEqual({ a: { b: 'X', c: 'Y' } });
        expect(() => shape_AllB2({ a: { b: 'X', c: 'Y', d: 'Z' } }))
            .toThrow('Value "{b:X,c:Y,d:Z}" for property "a" does not satisfy all of:' +
            ' {b:String,$$:Open}, Max(2)');
        expect(shape_AllB2({})).toEqual({ a: { b: 'B' } });
        let shape_AllB3 = Shape({ a: Skip(All(Open({ b: String }), Max(2))) });
        expect(shape_AllB3({ a: { b: 'X' } })).toEqual({ a: { b: 'X' } });
        expect(shape_AllB3({})).toEqual({});
        let shape_AnyB0 = Shape(Any());
        expect(shape_AnyB0(11)).toEqual(11);
        expect(shape_AnyB0(10)).toEqual(10);
        expect(shape_AnyB0()).toEqual(undefined);
        expect(shape_AnyB0(null)).toEqual(null);
        expect(shape_AnyB0(NaN)).toEqual(NaN);
        expect(shape_AnyB0({})).toEqual({});
        expect(shape_AnyB0([])).toEqual([]);
        let shape_AnyB1 = Shape(Any({ x: 1 }));
        expect(shape_AnyB1()).toEqual({ x: 1 });
        let shape_BeforeB0 = Shape(Before((v) => v > 10, 10));
        expect(shape_BeforeB0(11)).toEqual(11);
        expect(() => shape_BeforeB0(10))
            .toThrow('Validation failed for number "10" because check "(v) => v > 10" failed.');
        // TODO: modify value
        let shape_BelowB0 = Shape(Below(10));
        expect(shape_BelowB0(9)).toEqual(9);
        expect(() => shape_BelowB0(10))
            .toThrow('Value "10" for property "" must be below 10 (was 10).');
        let shape_CheckB0 = Shape(Check((v) => v > 10));
        expect(shape_CheckB0(11)).toEqual(11);
        expect(() => shape_CheckB0(10)).toThrow('check');
        let shape_CheckB1 = Shape(Check((v) => !(v.foo % 2), { foo: 2 }));
        expect(shape_CheckB1({ foo: 4 })).toEqual({ foo: 4 });
        expect(() => shape_CheckB1({ foo: 1 })).toThrow('check');
        expect(shape_CheckB1({})).toEqual({ foo: 2 });
        expect(() => shape_CheckB1()).toThrow('required');
        let shape_ClosedB0 = Shape(Closed([Number]));
        expect(shape_ClosedB0([1])).toEqual([1]);
        expect(() => shape_ClosedB0([1, 2]))
            .toThrow('Validation failed for array "[1,2]" because the index "1" is not allowed.');
        let shape_DefineB0 = Shape({ a: Define('foo', 11), b: Refer('foo') });
        expect(shape_DefineB0({ a: 10, b: 12 })).toEqual({ a: 10, b: 12 });
        expect(() => shape_DefineB0({ a: 'A', b: 'B' }))
            .toThrow(`Validation failed for property "a" with string "A" because the string is not of type number.
Validation failed for property "b" with string "B" because the string is not of type number.`);
        let shape_EmptyB0 = Shape({ a: Empty(String), b: String });
        expect(shape_EmptyB0({ a: '', b: 'ABC' })).toEqual({ a: '', b: 'ABC' });
        expect(() => shape_EmptyB0({ a: '', b: '' }))
            .toThrow('Validation failed for property "b" with string "" because an empty string is not allowed.');
        let shape_ExactB0 = Shape(Exact(11, 12, true));
        expect(shape_ExactB0(11)).toEqual(11);
        expect(shape_ExactB0(12)).toEqual(12);
        expect(shape_ExactB0(true)).toEqual(true);
        expect(() => shape_ExactB0(10))
            .toThrow('Value "10" for property "" must be exactly one of: 11, 12, true');
        expect(() => shape_ExactB0(false))
            .toThrow('Value "false" for property "" must be exactly one of: 11, 12, true');
        let shape_MaxB0 = Shape(Max(11));
        expect(shape_MaxB0(11)).toEqual(11);
        expect(shape_MaxB0(10)).toEqual(10);
        expect(() => shape_MaxB0(12))
            .toThrow('Value "12" for property "" must be a maximum of 11 (was 12).');
        let shape_MinB0 = Shape(Min(11));
        expect(shape_MinB0(11)).toEqual(11);
        expect(shape_MinB0(12)).toEqual(12);
        expect(() => shape_MinB0(10))
            .toThrow('Value "10" for property "" must be a minimum of 11 (was 10).');
        let shape_NeverB0 = Shape(Never());
        expect(() => shape_NeverB0(10))
            .toThrow('Validation failed for number "10" because no value is allowed.');
        expect(() => shape_NeverB0(true))
            .toThrow('Validation failed for boolean "true" because no value is allowed.');
        let shape_OneB0 = Shape(One(Exact(10), Exact(11), Exact(true)));
        expect(shape_OneB0(10)).toEqual(10);
        expect(shape_OneB0(11)).toEqual(11);
        expect(shape_OneB0(true)).toEqual(true);
        expect(() => shape_OneB0(12))
            .toThrow('Value "12" for property "" does not satisfy one of: ' +
            'Exact(10), Exact(11), Exact(true)');
        expect(() => shape_OneB0(false))
            .toThrow('Value "false" for property "" does not satisfy one of: ' +
            'Exact(10), Exact(11), Exact(true)');
        expect(() => shape_OneB0(null))
            .toThrow('Value "null" for property "" does not satisfy one of: ' +
            'Exact(10), Exact(11), Exact(true)');
        expect(() => shape_OneB0(NaN))
            .toThrow('Value "NaN" for property "" does not satisfy one of: ' +
            'Exact(10), Exact(11), Exact(true)');
        expect(() => shape_OneB0(undefined))
            .toThrow('Value "undefined" for property "" does not satisfy one of: ' +
            'Exact(10), Exact(11), Exact(true)');
        expect(() => shape_OneB0())
            .toThrow('Value "undefined" for property "" does not satisfy one of: ' +
            'Exact(10), Exact(11), Exact(true)');
        let shape_OneB1 = Shape(One(Number, String));
        expect(shape_OneB1(123)).toEqual(123);
        expect(shape_OneB1('abc')).toEqual('abc');
        expect(() => shape_OneB1(true))
            .toThrow('Value "true" for property "" does not satisfy one of: Number, String');
        // TODO: more complex objects
        let shape_SkipB0 = Shape({ a: Skip(11) });
        expect(shape_SkipB0({ a: 10 })).toEqual({ a: 10 });
        expect(shape_SkipB0({ a: undefined })).toEqual({ a: undefined });
        expect(shape_SkipB0({})).toEqual({});
        expect(() => shape_SkipB0({ a: null })).toThrow('type');
        expect(() => shape_SkipB0({ a: true })).toThrow('type');
        let shape_ReferB0 = Shape({ a: Define('foo', 11), b: Refer('foo') });
        expect(shape_ReferB0({ a: 10, b: 12 })).toEqual({ a: 10, b: 12 });
        expect(shape_ReferB0({ a: 10 })).toEqual({ a: 10, b: undefined });
        expect(shape_ReferB0({})).toEqual({ a: 11, b: undefined });
        expect(shape_ReferB0({ b: 12 })).toEqual({ a: 11, b: 12 });
        expect(() => shape_ReferB0({ a: 'A', b: 'B' }))
            .toThrow(`Validation failed for property "a" with string "A" because the string is not of type number.
Validation failed for property "b" with string "B" because the string is not of type number.`);
        let shape_ReferB1 = Shape({ a: Define('foo', 11), b: Refer({ name: 'foo', fill: true }) });
        expect(shape_ReferB1({ a: 10, b: 12 })).toEqual({ a: 10, b: 12 });
        expect(shape_ReferB1({ a: 10 })).toEqual({ a: 10, b: 11 });
        expect(shape_ReferB1({})).toEqual({ a: 11, b: 11 });
        expect(shape_ReferB1({ b: 12 })).toEqual({ a: 11, b: 12 });
        expect(() => shape_ReferB1({ a: 'A', b: 'B' }))
            .toThrow(`Validation failed for property "a" with string "A" because the string is not of type number.
Validation failed for property "b" with string "B" because the string is not of type number.`);
        // TODO: also recursive
        let shape_RenameB0 = Shape({ a: Rename('b', Number) });
        expect(shape_RenameB0({ a: 10 })).toEqual({ b: 10 });
        expect(() => shape_RenameB0({}))
            .toThrow('Validation failed for property "a" with value "undefined" because the value is required.');
        let shape_RenameB1 = Shape({ a: Rename({ name: 'b', keep: true }, 123) });
        expect(shape_RenameB1({ a: 10 })).toEqual({ a: 10, b: 10 });
        expect(shape_RenameB1({})).toEqual({ a: 123, b: 123 });
        let shape_RequiredB0 = Shape(Required(11));
        expect(shape_RequiredB0(11)).toEqual(11);
        expect(() => shape_RequiredB0())
            .toThrow('Validation failed for value "undefined" because the value is required.');
        let shape_RequiredB1 = Shape(Open(Required({ x: 1 })));
        expect(shape_RequiredB1({ x: 2 })).toEqual({ x: 2 });
        expect(shape_RequiredB1({ x: 2, y: 3 })).toEqual({ x: 2, y: 3 });
        expect(() => shape_RequiredB1())
            .toThrow('Validation failed for value "undefined" because the value is required.');
        let shape_RequiredB2 = Shape(Open({ x: 1 }).Required());
        expect(shape_RequiredB2({ x: 2 })).toEqual({ x: 2 });
        expect(shape_RequiredB2({ x: 2, y: 3 })).toEqual({ x: 2, y: 3 });
        expect(() => shape_RequiredB2())
            .toThrow('Validation failed for value "undefined" because the value is required.');
        // TODO: update docs - need better example where one prop differentiates
        let shape_SomeB0 = Shape(Some({ x: 1 }, { y: 2 }));
        expect(shape_SomeB0({ x: 1 })).toEqual({ x: 1 });
        expect(shape_SomeB0({ y: 2 })).toEqual({ y: 2 });
        expect(() => shape_SomeB0({ x: 11, y: 22 }))
            .toThrow('Value "{x:11,y:22}" for property "" does not satisfy any of: {"x":1}, {"y":2}');
        expect(() => shape_SomeB0({ x: true, y: 2 })).toThrow('any of');
        expect(() => shape_SomeB0({ x: 1, y: true })).toThrow('any of');
        expect(() => shape_SomeB0({ x: true, y: true }))
            .toThrow(`Value "{x:true,y:true}" for property "" does not satisfy any of: {"x":1}, {"y":2}`);
        // TODO: more complex objects
        /*
        let shape_ValueB0 = Shape(Value(Number, {}))
        expect(shape_ValueB0({ x: 10 })).toEqual({ x: 10 })
        expect(shape_ValueB0({ x: 10, y: 11 })).toEqual({ x: 10, y: 11 })
        expect(() => shape_ValueB0({ x: true })).toThrow('Validation failed for property "x" with boolean "true" because the boolean is not of type number.')
      
        let shape_ValueB1 = Shape({
          page: Value(
            {
              title: String,
              template: 'standard'
            },
            {
              home: {
                title: 'Home',
                template: 'home'
              },
              sitemap: {
                title: 'Site Map',
                template: 'sitemap'
              },
            })
        })
      
        expect(shape_ValueB1({
          page: {
            about: {
              title: 'About'
            },
            contact: {
              title: 'Contact'
            }
          }
        })).toEqual({
          page: {
            about: {
              template: 'standard',
              title: 'About',
            },
            contact: {
              template: 'standard',
              title: 'Contact',
            },
            home: {
              template: 'home',
              title: 'Home',
            },
            sitemap: {
              template: 'sitemap',
              title: 'Site Map',
            },
          },
        })
        */
    });
});
//# sourceMappingURL=builder.test.js.map
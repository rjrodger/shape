"use strict";
/* Copyright (c) 2021-2023 Richard Rodger and other contributors, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
// Handle web (Shape) versus node ({Shape}) export.
let ShapeModule = require('../shape');
if (ShapeModule.Shape) {
    ShapeModule = ShapeModule.Shape;
}
const Shape = ShapeModule;
const buildize = Shape.buildize;
const makeErr = Shape.makeErr;
const { Above, After, All, Any, Before, Below, Check, Child, Closed, Default, Define, Empty, Exact, Func, Key, Len, Max, Min, Never, One, Open, Optional, Refer, Rename, Required, Skip, Some, } = Shape;
describe('readme', () => {
    test('readme-optional', () => {
        let shape = Shape(Optional(String));
        expect(shape()).toEqual('');
        expect(shape('a')).toEqual('a');
        expect(() => shape(1)).toThrow('type');
        shape = Shape(Optional(Some(String, Number)));
        expect(shape('a')).toEqual('a');
        expect(shape(1)).toEqual(1);
        expect(shape()).toEqual(undefined); // Overrides Some
        shape = Shape(Some(String, Number));
        expect(shape('a')).toEqual('a');
        expect(shape(1)).toEqual(1);
        expect(() => shape()).toThrow('satisfy');
    });
    test('readme-default', () => {
        let shape = Shape(Default('none', String));
        expect(shape()).toEqual('none');
        expect(shape('a')).toEqual('a');
        expect(() => shape(1)).toThrow('type');
        shape = Shape(Default({ a: null }, { a: Number }));
        expect(shape({ a: 1 })).toEqual({ a: 1 });
        expect(shape()).toEqual({ a: null });
        expect(() => shape({ a: 'x' })).toThrow('type');
    });
});
//# sourceMappingURL=readme.test.js.map
declare class Foo {
    a: number;
    constructor(a: number);
}
declare class Bar {
    b: number;
    constructor(b: number);
}
type Zed = {
    c: number;
    d: {
        e: string;
    };
};
export { Foo, Bar, };
export type { Zed, };

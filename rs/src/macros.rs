//! `shape!`: a spec written as the example it is, in the style of
//! `serde_json::json!`. Objects in braces, arrays in brackets, the type
//! tokens bare (`String`, `Number`, `Boolean`, `Object`, `Array`,
//! `Function`, `Integer`, `Date`, `Any`), and any other Rust expression a
//! spec can be made from: a literal, a builder call, a node.
//!
//! ```
//! use shape::{min, shape, Token};
//! let s = shape::Schema::new(shape!({
//!     "name": String,
//!     "port": 8080,
//!     "tags": [String],
//!     "age": min(0, Token::Integer),
//!     "addr": { "zip": String },
//! }));
//! assert!(s.valid(&shape::Value::from(serde_json::json!({ "name": "x", "age": 3, "addr": { "zip": "1" } }))));
//! ```

/// A spec written as the example it is; see the module documentation.
#[macro_export]
macro_rules! shape {
    ({ $($body:tt)* }) => { $crate::__shape_obj!([] $($body)*) };
    ([ $($body:tt)* ]) => { $crate::__shape_arr!([] $($body)*) };
    ($t:ident) => { $crate::__shape_token!($t) };
    ($e:expr) => { $crate::Spec::from($e) };
}

#[doc(hidden)]
#[macro_export]
macro_rules! __shape_token {
    (String) => {
        $crate::Spec::from($crate::Token::String)
    };
    (Number) => {
        $crate::Spec::from($crate::Token::Number)
    };
    (Boolean) => {
        $crate::Spec::from($crate::Token::Boolean)
    };
    (Object) => {
        $crate::Spec::from($crate::Token::Object)
    };
    (Array) => {
        $crate::Spec::from($crate::Token::Array)
    };
    (Function) => {
        $crate::Spec::from($crate::Token::Function)
    };
    (Integer) => {
        $crate::Spec::from($crate::Token::Integer)
    };
    (Date) => {
        $crate::Spec::from($crate::Token::Date)
    };
    (BigInt) => {
        $crate::Spec::from($crate::Token::BigInt)
    };
    (Any) => {
        $crate::Spec::from($crate::Token::Any)
    };
    ($other:ident) => {
        $crate::Spec::from($other)
    };
}

#[doc(hidden)]
#[macro_export]
macro_rules! __shape_key {
    ($k:literal) => {
        $k.to_string()
    };
    ($k:ident) => {
        stringify!($k).to_string()
    };
}

#[doc(hidden)]
#[macro_export]
macro_rules! __shape_obj {
    ([$($acc:tt)*]) => { $crate::Spec::Obj(vec![$($acc)*]) };
    ([$($acc:tt)*] , $($rest:tt)*) => { $crate::__shape_obj!([$($acc)*] $($rest)*) };
    ([$($acc:tt)*] $k:literal : { $($v:tt)* } $($rest:tt)*) => {
        $crate::__shape_obj!([$($acc)* ($crate::__shape_key!($k), $crate::shape!({ $($v)* })),] $($rest)*)
    };
    ([$($acc:tt)*] $k:ident : { $($v:tt)* } $($rest:tt)*) => {
        $crate::__shape_obj!([$($acc)* ($crate::__shape_key!($k), $crate::shape!({ $($v)* })),] $($rest)*)
    };
    ([$($acc:tt)*] $k:literal : [ $($v:tt)* ] $($rest:tt)*) => {
        $crate::__shape_obj!([$($acc)* ($crate::__shape_key!($k), $crate::shape!([ $($v)* ])),] $($rest)*)
    };
    ([$($acc:tt)*] $k:ident : [ $($v:tt)* ] $($rest:tt)*) => {
        $crate::__shape_obj!([$($acc)* ($crate::__shape_key!($k), $crate::shape!([ $($v)* ])),] $($rest)*)
    };
    ([$($acc:tt)*] $k:literal : $v:ident , $($rest:tt)*) => {
        $crate::__shape_obj!([$($acc)* ($crate::__shape_key!($k), $crate::__shape_token!($v)),] $($rest)*)
    };
    ([$($acc:tt)*] $k:literal : $v:ident) => {
        $crate::__shape_obj!([$($acc)* ($crate::__shape_key!($k), $crate::__shape_token!($v)),])
    };
    ([$($acc:tt)*] $k:ident : $v:ident , $($rest:tt)*) => {
        $crate::__shape_obj!([$($acc)* ($crate::__shape_key!($k), $crate::__shape_token!($v)),] $($rest)*)
    };
    ([$($acc:tt)*] $k:ident : $v:ident) => {
        $crate::__shape_obj!([$($acc)* ($crate::__shape_key!($k), $crate::__shape_token!($v)),])
    };
    ([$($acc:tt)*] $k:literal : $v:expr , $($rest:tt)*) => {
        $crate::__shape_obj!([$($acc)* ($crate::__shape_key!($k), $crate::Spec::from($v)),] $($rest)*)
    };
    ([$($acc:tt)*] $k:literal : $v:expr) => {
        $crate::__shape_obj!([$($acc)* ($crate::__shape_key!($k), $crate::Spec::from($v)),])
    };
    ([$($acc:tt)*] $k:ident : $v:expr , $($rest:tt)*) => {
        $crate::__shape_obj!([$($acc)* ($crate::__shape_key!($k), $crate::Spec::from($v)),] $($rest)*)
    };
    ([$($acc:tt)*] $k:ident : $v:expr) => {
        $crate::__shape_obj!([$($acc)* ($crate::__shape_key!($k), $crate::Spec::from($v)),])
    };
}

#[doc(hidden)]
#[macro_export]
macro_rules! __shape_arr {
    ([$($acc:tt)*]) => { $crate::Spec::Arr(vec![$($acc)*]) };
    ([$($acc:tt)*] , $($rest:tt)*) => { $crate::__shape_arr!([$($acc)*] $($rest)*) };
    ([$($acc:tt)*] { $($v:tt)* } $($rest:tt)*) => {
        $crate::__shape_arr!([$($acc)* $crate::shape!({ $($v)* }),] $($rest)*)
    };
    ([$($acc:tt)*] [ $($v:tt)* ] $($rest:tt)*) => {
        $crate::__shape_arr!([$($acc)* $crate::shape!([ $($v)* ]),] $($rest)*)
    };
    ([$($acc:tt)*] $v:ident , $($rest:tt)*) => {
        $crate::__shape_arr!([$($acc)* $crate::__shape_token!($v),] $($rest)*)
    };
    ([$($acc:tt)*] $v:ident) => {
        $crate::__shape_arr!([$($acc)* $crate::__shape_token!($v),])
    };
    ([$($acc:tt)*] $v:expr , $($rest:tt)*) => {
        $crate::__shape_arr!([$($acc)* $crate::Spec::from($v),] $($rest)*)
    };
    ([$($acc:tt)*] $v:expr) => {
        $crate::__shape_arr!([$($acc)* $crate::Spec::from($v),])
    };
}

#[cfg(test)]
mod tests {
    use crate::builders::min;
    use crate::{Schema, Spec, Token, Value};

    fn j(s: &str) -> Value {
        Value::from(serde_json::from_str::<serde_json::Value>(s).unwrap())
    }

    #[test]
    fn writes_specs_as_examples() {
        let spec = shape!({
            "name": String,
            port: 8080,
            "tags": [String],
            "pair": [Number, "x"],
            "age": min(0, Token::Integer),
            "addr": { "zip": String, "lines": [{ "text": String }] },
            "empty": {},
            "anything": Any,
        });
        let s = Schema::new(spec);
        let out = s
            .validate(j(
                r#"{"name":"x","pair":[1],"age":3,"addr":{"zip":"1","lines":[{"text":"t"}]},"empty":{"k":1}}"#,
            ))
            .unwrap();
        assert_eq!(
            serde_json::Value::from(out),
            serde_json::json!({"name":"x","port":8080,"tags":[],"pair":[1,"x"],"age":3,"addr":{"zip":"1","lines":[{"text":"t"}]},"empty":{"k":1}})
        );
        assert!(matches!(shape!(String), Spec::Token(Token::String)));
        assert!(matches!(shape!(Number), Spec::Token(Token::Number)));
        assert!(matches!(shape!(Boolean), Spec::Token(Token::Boolean)));
        assert!(matches!(shape!(Object), Spec::Token(Token::Object)));
        assert!(matches!(shape!(Array), Spec::Token(Token::Array)));
        assert!(matches!(shape!(Function), Spec::Token(Token::Function)));
        assert!(matches!(shape!(Integer), Spec::Token(Token::Integer)));
        assert!(matches!(shape!(Date), Spec::Token(Token::Date)));
        assert!(matches!(shape!(BigInt), Spec::Token(Token::BigInt)));
        assert!(matches!(shape!(Any), Spec::Token(Token::Any)));
        let node = min(1, Token::Number);
        assert!(matches!(shape!(node), Spec::Node(_)));
        assert!(matches!(shape!(5), Spec::Value(Value::Num(_))));
        assert!(matches!(shape!([]), Spec::Arr(_)));
        assert!(matches!(shape!([1,]), Spec::Arr(_)));
        assert!(matches!(shape!({ a: 1, }), Spec::Obj(_)));
        assert!(matches!(
            shape!({ "a": [Number], b: { c: String } }),
            Spec::Obj(_)
        ));
    }
}

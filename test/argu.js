
const {
  MakeArgu,
  Rest,
  Skip,
  Min,
  Ignore,
  Any,
} = require('../dist/shape')


let Argu = MakeArgu('QAZ')

// function foo() {
//   let args = Argu(arguments, 'foo', {
//     a: 1,
//     b: 'B'
//   })
//   console.log(arguments, args)
// }


// foo(2,'X')
// try { foo(2,3) } catch(e) { console.log(e.message) }



// function bar() {
//   let args = Argu(arguments, 'bar', {
//     'a: One(String,{})': {},
//     'b: Ignore(One(String,{}))': {},
//     c: Function,
//   })
//   console.log(arguments, args)
// }


// // bar('a','b',()=>{})
// // bar('a',()=>{})
// // bar({x:1}) // ,'b',()=>{})
// // bar(true) // ,'b',()=>{})


// function zed() {
//   let args = Argu(arguments, 'bar', {
//     a: String,
//     b: Rest(Number),
//   })
//   console.log(arguments, args)
// }

// zed('a')
// zed('a',1)
// zed('a',1,2)
// zed('a',1,2,'x')


let arguSpec = Argu('qaz', {
  a: Skip(String),
  b: Skip(Object),
  c: Function,
  d: Rest(Any()),
})

function qaz() {
  let args = arguSpec(arguments)
  console.log(arguments, args)
}

function f0(){}


// qaz(11)
qaz('s0',{b:1},f0)
qaz('s1',{a:'A'},f0)

// qaz({b:1},f0)
// qaz('s',f0)
// qaz(f0)
// // qaz()
// qaz('s',{b:1},f0,11)
// qaz('s',{b:1},f0,11,22)
// qaz('s',f0,11)
// qaz({b:1},f0,11)
// qaz({b:1},f0,11,22)
// qaz(f0,11,22)


// qaz('s',{x:1},f0)
// qaz({x:1},f0)

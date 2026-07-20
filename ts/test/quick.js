

const {
  Shape,
  Args,
  G$,
  nodize,
  stringify,
  One,
  Some,
  All,
  Closed,
  Rename,
  Required,
  Define,
  Default,
  Refer,
  Skip,
  Empty,
  Exact,
  Never,
  Value,
  Min,
  Max,
  Above,
  Below,
  Any,
  Check,
  Open,
  Key,
  Child,
  Optional,
  expr,
  build,
} = require('../dist/shape')

function D(x) { console.dir(x,{depth:null}) }

function J(x,s) {
  console.log(null == x ? '' : JSON.stringify(x,null,s).replace(/"/g, ''))
}

let tmp = {}


let log = (point,state)=>{
  console.log(
    'LOG',
    point,
    'd='+state.dI,
    // 'p='+state.pI,
    state.path.slice(1,state.dI+1).join('.'),
    'kv'===point?(state.key+'='+state.val):'',
    // 'kv'===point?state:'',
    ''
  )
}


// // class Foo {}

// let aR = /a/
// console.log(typeof aR)
// console.log(aR.constructor)


// // console.log(RegExp)
// // console.log(RegExp.constructor)


// let g1 = Shape({a:Optional(/x/)})
// // let g1 = Shape({a:Foo})
// // let g1 = Shape({a:RegExp})

// console.log(g1.stringify())
// D(g1.spec())
// console.log(g1({a:'x'}))
// console.log(g1({}))
// // console.log(g1({a:1}))
// console.log(g1({a:'y'}))


// console.dir(Shape({a:expr({src:'Min(2,Max(4, String))'})}).spec(),{depth:null})
// console.log(Shape({a:expr({src:'Min(2,Max(4, String))'})}).stringify(null,true))

// console.log(Shape({a:expr({src:'Min(2) Max(4) String'})}).stringify(null,true))
//console.log(Shape({a:expr({src:'Min(2) Max(4) String()'})}).spec())

// console.log(Shape({a:expr({src:'Min(2).Max(4).String'})}).stringify(null,true))
// console.log(Shape({a:expr({src:'Min(2).Max(4).String'})}).spec())



// does Min(1, Max(2)) == Min(1).Max(2) ?


// console.log(Shape(Min(1, Max(2, String))).spec())
// console.log(Shape(Min(1).Max(2, String)).spec())
// console.log(Shape(Min(1)).spec())


// console.dir(Shape({a:expr({src:'Child(Number)'})}).spec(),{depth:null})

// const g2 = Shape({a: Child(Number,{x:'q'})})
// const g2 = Shape({'a: Child(Number)':{x:'q'}})
// const g2 = Shape({'a: Number':1})
// const g2 = Shape({a:1})
// const g2 = Shape({'a:Number':1})
// const g2 = Shape({a:Min(1,2)})
// const g2 = Shape({'a:Min(1) Max(3)':1})
// const g2 = Shape({a:2})
// console.dir(g2.spec(),{depth:null})
// console.log('==========')
// console.log(g2({ a: 3 }))
// console.log(g2({}))



// const s0 = build('Min(1)')
// // console.log(s0)
// const g0 = Shape(s0)
// console.log(g0.stringify())


// const s1 = build('Min(1).Max(3)')
// // console.log(s1)
// const g1 = Shape(s1)
// console.log(g1.stringify())


// const s2 = build({a:'Min(1)'})
// // console.log(s2)
// const g2 = Shape(s2)
// console.log(g2.stringify())


// const s3 = build({a:'String().Min(1)'})
// // console.log(s3)
// const g3 = Shape(s3)
// console.log(g3.stringify())


// const s3a = build({a:'String.Min(1)'})
// // console.log(s3a)
// const g3a = Shape(s3a)
// console.log(g3a.stringify())


// const s3b = build({a:'Min(1).String()'})
// // console.log(s3b)
// const g3b = Shape(s3b)
// console.log(g3b.stringify())


// const s3c = build({a:'Min(1).String'})
// // console.log(s3c)
// const g3c = Shape(s3c)
// console.log(g3c.stringify())


// const s3d = build({a:'Min(1,String)'})
// // console.log(s3d)
// const g3d = Shape(s3d)
// console.log(g3d.stringify())


// const s4 = build(['String().Min(1)'])
// // console.log(s4)
// const g4 = Shape(s4)
// // console.log(g4.spec())
// console.log(g4.stringify())


// const s5 = build(['String.Min(1)'])
// // console.log(s5)
// const g5 = Shape(s5)
// console.log(g5.stringify())

// let gr = Shape(Child(Number))
// let gx = Shape.expr('Child(Number)')
// console.log(gx)
// let gr = Shape(gx)
// console.log(gr.spec())
// console.log(gr({x:1}))

// let g1 = Shape({
//   // a: Child(Number,{}),
//   'a: Child(Number)': {}
//   // 'a: Number':1
// })
// console.dir(g1.spec(),{depth:null})
// // console.log(g1({ a: { x: 1 } }))

/*
let g1 =
    // Shape(Open({
    //   a: 1,
    //   b: 2,
    // }))
    Shape({
      a: 1,
      // $$: 'Open',
      b: 2,
      // 'd:Child($$z)':0,
      d:{
      $$:'Child($$z)',
      $$z: {x:Number},
      e:3
      },

    }, {keyspec:{active:true}})

// console.dir(g1,{depth:null})
// console.dir(g1.spec(),{depth:null})
console.log(g1.stringify())
console.log(g1({ a: 11 }))
console.log(g1({ a: 11, d: {f:{x:22}} }))
console.log(g1({ a: 11, d: {f:{x:'X'}} }))
*/

/*
let m0 =
    Open({})
    // Number
    //    Min(2,String)
    // Max(3, Min(1, Default(2)))
    // Max(3, Min(1, Required(Default(2))))
    // Max(3, Min(1, Default(2, Required())))
    // Min(2)
    // Child(Number)
    // Max(2,Number)
    // One(Number,String)
    // One(Number,{x:1}) // FIX
    // [Number]
    // [Number,String]
    // [{x:1}]
    // [{x:1},{y:Number}]
let g0 = Shape({a:m0})
console.log(g0.node())
// console.dir(g0.spec(),{depth:null})
// console.log(g0({a:'AAA'}))
//console.dir(g0.spec(),{depth:null})
//console.dir(g0.node(),{depth:null})
// console.dir(g0.node().v.a.b,{depth:null})
let j0 = g0.jsonify()
console.log(j0)
// let s0 = g0.stringify()
//console.log(s0)
// let j0 = { a: 'Min(1).String()' }
// let j0 = { a: 'String().Min(1)' }
// let j0 = ['String.Min(1)']
// let j0 = {a:'Open({})'}
*/

// console.log('======')
// let b0 = Shape.build({"x":"11","$$":"Min(1).Max(3)"})
// console.dir(b0.spec(),{depth:null})
// console.log(b0.jsonify())

// console.log(Shape(b0).spec())




/*
let g1 = Shape({
  // 'x:Min(1,Max(4))': 2,
  // 'x:Min(1).Max(4)': 2,
  // x: 'Min(1, Max(4, 2))',
  'a: Open': {x:1,y:2}
}
,{
  keyexpr: { active: true }
//  keyspec: { active: true }
})

D(g1.spec())
console.log(g1({a:{x:3}}))
*/



//console.log(Min(1,Max(4)))



/*
let d5 = Shape(
  //2
  // Default(2)
  // Default(2, Required())
  Max(3, Min(1, Default(2, Required())))

  
  // Min(1,{z:11}).Max(2,{y:22})
  // Min(1).Max(2,{y:22})
  // Max(2)
  // Max(2,{x:11,y:22})
  // Max(2,{x:11,y:22}).Min(1)
  // Min(1).Max(2,{x:11,y:22})
  // Min(1, Max(2,{x:11,y:22}))
  
  // Object
  // Default(Object)
  // Default({ a: null }, { a: Number })
  // Max(2).Min(1,{x:2})
  )

// let d5 = Shape.build('String')
console.log('===========')
console.log(d5.spec())
console.log('QQQ',d5.stringify())
// console.dir(d5.node())


// console.log(d5({x:1,y:2}))

// console.log(d5.spec())
*/


//console.log(nodize({x:Number}))
//console.log(nodize({x:1}))

// D(Child({ x: String }))
// D(Required({ b: 1 }).Child({ x: String }))
// D( Child({ x: String }).Required({b:1}) )

/*
let g0 = Shape({ a: Required({ b: 1 }).Child({ x: String }) })
// let g0 = Shape({ a: Required({ b: 1 })})
// let g0 = Shape({ a: Child({ x: String },{b:1})})
// let g0 = Shape({ a: Child({ x: String },Required({b:1}))})
// let g0 = Shape({ a: Required(Child({ x: String },{b:1}))})
// let g0 = Shape({ a: Child({ x: String },{b:1}).Required() })
// let g0 = Shape({ a: Child({ x: String }).Required({b:1}) })
// let g0 = Shape({ a: Required().Child({ x: String },{b:1}) })
*/


// let g0 = Shape({ a: One(Number,String) })
// let g0 = Shape({ a: All(Number,String) })
// let g0 = Shape({ a: Some(Number,String) })
// let g0 = Shape({ a: Some({x:1}) })    
// let g0 = Shape({ a: Child({ x: String }).Required({ b: 1 }) })    
// let g0 = Shape(Child(Number))
//let g= Shape({a:Child({x:Number})})
// let g0 = Shape.build({"a":{"$$":"Some($$ref0)","$$ref0":{"x":"1"}}})
//D(g0.node())
//D(g0.spec())
//console.log(g0.stringify())
//let g0 = Shape(All(Open({ x: 1 }), Open({ y: 'a' })))
// let g0 = Shape(Closed(Required({ x: 1 })), { name: 'cr0' })
// let g0 = Shape(Required({ x: 1 }), { name: 'cr0' })
//console.log(stringify({a:'A'}))
// console.log(g0.node())
// console.log(g0.spec())
//D(g.node())
//D(g.spec())
// console.log(g.stringify())
//let j0 = g.jsonify()
//console.log(j0)
// let g1= Shape.build(j0)
// console.log(g1.stringify())

// console.log(JSON.stringify(Skip()))
// console.log(JSON.stringify(Shape.Skip()))


// let g0 = Shape(Open({a:1}))
// let c0 = Shape(Check((v) => v === 1))
// let g0 = Shape(Default('foo', c0))
// let g0 = Shape(Check((v) => !!v, Number))
// let g0 = Shape({ a: Exact(null) })
// let g0 = Shape(Optional(Required('a')))
//let g0 = Shape({ a: Child({ x: String }).Required({ b: 1 }) })
// let g0 = Shape({ a: Required({ b: 1 }) })
// let g0 = Shape({ a: Child({ x: String }) })

///let g0 = Shape({ a: Default({ b: 'B' }, All(Open({ b: String }), Max(2))) })
// let g0 = Shape({ a: All(Open({ b: String }), Max(2)) })

// let g0 = Shape(Exact('red'))


/*
let g0 = Shape({
  a: Number,
  b: Skip(Boolean),
})

let g1 = Shape(Open(g0))


console.log('=========')
// console.log(c0.stringify())
// console.log(c0(1))
console.dir(g1.spec(),{depth:null})
console.log(g1.stringify())
// console.log(g0())
// console.log(g0())
//console.log(g0('a'))

// console.log(stringify(1,null,true))

// console.log(g0({}))
// console.log(g0({ a: {} }))
// console.log(g0({ a: { b: { x: 'X' } } }))
//console.log(g0({ a: { b: 'X', c: 'Y' } }))

console.log(g1({ a: 1, b: true }))
console.log(g1({ a: 1 }))
console.log(g1({ a: 1, b: false, c: 'C' }))

try {
  console.log(g1({},{skip:{depth:1}}))
}
catch(e) {
  console.log(e.desc())
}
*/



let g0 = Shape({x:Number})
console.log(g0.stringify())



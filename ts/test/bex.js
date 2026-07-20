

const F = {
  foo: (x,y)=>({
    [x]: y
  }),

  bar: (x,y,z)=>(x[y]=z,x),

  qaz: (x)=>((x.q=1+(x.q||0)),x),

  zed: (x)=>(x=x||{},(x.z=1+(x.z||0)),x),
}

console.log('foo', F.foo('a',1))
console.log('bar', F.bar({q:0},'a',11))


console.log(P('aaa'))
console.log(P('aaa()'))
console.log(P('aaa(1)'))
console.log(P('aaa(1 "a")'))
console.log(P('aaa(1 "a" true)'))
console.log(P('aaa(bbb(1) ccc)'))
console.log(P('aaa(bbb(1) ccc(11 22))'))

let x = null
console.log(x=[1],bex(x))
console.log(x=['"a"'],bex(x))
console.log(x=['zed'],bex(x))
console.log(x=['zed','(',')'],bex(x))
console.log(x=['zed','(','{}',')'],bex(x))
console.log(x=['zed','(','zed',')'],bex(x))
console.log(x=['zed','(','zed','(',')',')'],bex(x))
console.log(x=['qaz','(',"{}",')'],bex(x))

console.log('========')
console.log(x=P`zed zed`,bex(x))
console.log(x=P`qaz(qaz({}))`,bex(x))
console.log(x=P`qaz qaz zed`,bex(x))
console.log(x=P`foo "a" 1`,bex(x))
console.log(x=P`bar {} "a" 1`,bex(x))
console.log(x=P`bar foo("b" 2) "a" 1`,bex(x))
console.log(x=P`foo 0 "(\\" )"`,bex(x))

function P(str) {
  let ts = []
  let tre = /\s*([)(]|"(\\.|[^"\\])*"|[^)(\s]+)\s*/g
  let t = null
  while(t = tre.exec(str)) {
    ts.push(t[1])
  }
  return ts
}


function bex(t,s) {
  s = s || {i:0}
  let h = t[s.i]
  let fn = F[h]

  s.i++

  if(null==fn) {
    return JSON.parse(h)    
  }

  // if('(' !== t[s.i]) {
  //   return F[h]()
  // }
  // s.i++

  if('(' === t[s.i]) {
    s.i++
  }
  
  let args = []
  let x = null
  while(null != (x = t[s.i]) && ')'!=x) {
    args.push(bex(t,s))
  }
  s.i++

  // console.log('CALL',s.i,h,args)
  
  return F[h](...args)
}

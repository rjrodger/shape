
const {
  expr
} = require('../dist/shape')


const P = (s)=>(console.log((s={src:''+s}).src,(expr(s),s.tokens)))

//P('Min(1)')
P('Min(1 Max(2))')
P('Min(1) Max(3)')

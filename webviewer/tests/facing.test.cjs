const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../src/scene/fittings.js'),'utf8');
const start=s.indexOf('export function facing'),end=s.indexOf('\n}\n',start)+2;
const facing=new Function(s.slice(start,end).replace('export ','')+';return facing;')();
test('furniture faces away from the closest wall surface, even along a long wall',()=>{
  const o={c:[4,0,-0.4],yaw:0};
  const blockers=[{x:0,z:0,yaw:0,hx:5,hz:0.075},{x:4,z:-2,yaw:0,hx:0.3,hz:0.075}];
  assert.equal(facing({blockers},o),-1);
});
test('a nearby side wall does not reverse the front of a cabinet',()=>{
  const o={c:[0.2,0,0.5],yaw:0};
  assert.equal(facing({blockers:[{x:0,z:0.5,yaw:Math.PI/2,hx:3,hz:0.075},{x:0,z:0,yaw:0,hx:3,hz:0.075}]},o),1);
  assert.equal(facing({blockers:[]},o),1);
});

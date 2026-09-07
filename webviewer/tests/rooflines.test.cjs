const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(`${__dirname}/../src/scene/rooflines.js`,'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const {roofCut,roofVertices}=new Function(source+';return {roofCut,roofVertices};')();
const rooms=JSON.parse(fs.readFileSync(`${__dirname}/../photos.json`)).rooms;
test('photo roof wedges meet the flat ceiling and stay inside their rotated slab cuts',()=>{
 for(const room of rooms.filter(r=>r.finishes?.roof)){
  const s=room.finishes.roof,cut=roofCut(s),v=roofVertices(s,2.657,2.365);
  assert.ok(s.low>1.3&&s.high>=s.low&&s.high<=2.365);
  for(const p of [...v.slope,...v.returns]){
   assert.ok(p.every(Number.isFinite));
   const dx=p[0]-cut.x,dz=p[2]-cut.z,c=Math.cos(cut.yaw),sin=Math.sin(cut.yaw);
   assert.ok(Math.abs(c*dx-sin*dz)<=cut.hx+1e-9);
   assert.ok(Math.abs(sin*dx+c*dz)<=cut.hz+1e-9);
   assert.ok(p[1]>=2.657+s.low-1e-9&&p[1]<=5.022+1e-9);
  }
  assert.ok(v.returns.some(p=>Math.abs(p[1]-5.022)<1e-9));
 }
});

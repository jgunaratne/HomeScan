const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(`${__dirname}/../src/photo/daylight.js`,'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const THREE={DataTexture:class{constructor(data,width,height){this.image={data,width,height};}},Vector3:class{constructor(x,y,z){Object.assign(this,{x,y,z});}}};
const onFloor=(_,x,z)=>x>=0&&x<=6&&z>=0&&z<=4;
const {clearDaylight,blocksDaylight,windowPortals,bakeDaylight}=new Function('THREE','onFloor','skyAt',source+';return {clearDaylight,blocksDaylight,windowPortals,bakeDaylight};')(THREE,onFloor,()=>0);
const divider=holes=>({c:[3,1.2,2],w:4,h:2.4,yaw:Math.PI/2,holes});
const opening={k:'door',x0:-.5,x1:.5,y0:-1.2,y1:.8};
test('daylight rays respect solid walls, door openings and headers',()=>{
 assert.equal(clearDaylight({walls:[divider([])]},[1,1,2],[5,1,2]),false);
 assert.equal(clearDaylight({walls:[divider([opening])]},[1,1,2],[5,1,2]),true);
 assert.equal(clearDaylight({walls:[divider([opening])]},[1,2.2,2],[5,2.2,2]),false);
 assert.equal(clearDaylight({walls:[divider([opening])]},[1,1,.5],[5,1,.5]),false);
});
test('interior doors cannot become daylight emitters',()=>{
 assert.equal(windowPortals({walls:[divider([opening])]}).length,0);
 const exterior=divider([{...opening,k:'window'}]);exterior.c[0]=0;
 assert.equal(windowPortals({walls:[exterior]}).length,1);
});
test('large furnishing blockers respect height, rotation and points on their own bounds',()=>{
 const o={c:[0,1,0],d:[2,2,1],yaw:Math.PI/4};
 assert.equal(blocksDaylight(o,[-3,1,0],[3,1,0]),true);
 assert.equal(blocksDaylight(o,[-3,3,0],[3,3,0]),false);
 assert.equal(blocksDaylight(o,[0,1,0],[3,1,0]),false);
});
test('roof slopes stop light crossing the soffit',()=>{
 const L={walls:[],elevation:0,rooms:[{finishes:{roof:{yaw:0,u0:0,u1:2,v0:0,v1:2,high:2.4,low:1.4}}}]};
 assert.equal(clearDaylight(L,[1,1,1],[1,2.3,1]),false);
 assert.equal(clearDaylight(L,[3,1,1],[3,2.3,1]),true);
});
test('baked daylight falls toward the window and does not cross a sealed partition',()=>{
 const exterior=divider([{k:'window',x0:-.6,x1:.6,y0:-.4,y1:.8}]);exterior.c[0]=0;
 const L={bounds:{x0:0,x1:6,z0:0,z1:4},elevation:0,ceiling:2.4,walls:[exterior,divider([])],rooms:[],sky:{}};
 const f=bakeDaylight(L),sample=(x,z)=>{
  const i=Math.round(x/f.g),j=Math.round(z/f.g),k=4;
  return f.texture.image.data.slice((j*f.nx*f.ny+k*f.nx+i)*4,(j*f.nx*f.ny+k*f.nx+i)*4+4);
 };
 const near=sample(.64,1.92),far=sample(4.8,1.92);
 assert.ok(near[3]>far[3],'window must provide more light than sealed room');
 assert.ok(near[0]<120,'directional moment must point toward the west window');
 assert.ok(Math.abs(far[0]-128)<=1,'no direct window light through partition');
});

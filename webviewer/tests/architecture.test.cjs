const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
// The viewer uses a concatenating bundler. Load the pure geometry functions
// without constructing its browser-only renderer or shared material objects.
const architecture = read('scene/architecture.js');
const cutSlabQuad = new Function(architecture.slice(architecture.indexOf('export function cutSlabQuad')).replace('export ','')+';return cutSlabQuad;')();
const area = polygon => Math.abs(polygon.reduce((sum,p,i)=>{
  const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];
},0))/2;

test('stair opening preserves area at aligned and rotated angles',()=>{
  const quad=[[-2,-2],[2,-2],[2,2],[-2,2]];
  for(const yaw of [0,Math.PI/2,0.51445,1.05635,2.1]){
    const cut={x:0,z:0,yaw,hx:0.6,hz:1};
    const pieces=cutSlabQuad(quad,cut);
    assert.ok(Math.abs(pieces.reduce((sum,p)=>sum+area(p),0)-13.6)<1e-8);
    for(const p of pieces){
      // Check triangle centroids: no emitted surface may bridge the opening.
      for(let i=1;i<p.length-1;i++){
        if(area([p[0],p[i],p[i+1]])<1e-10)continue;
        const x=(p[0][0]+p[i][0]+p[i+1][0])/3,z=(p[0][1]+p[i][1]+p[i+1][1])/3;
        assert.ok(Math.abs(Math.cos(yaw)*x-Math.sin(yaw)*z)>=0.6-1e-9 || Math.abs(Math.sin(yaw)*x+Math.cos(yaw)*z)>=1-1e-9);
      }
    }
  }
});

test('stair clipping handles absent, disjoint, and fully covering cuts',()=>{
  const quad=[[0,0],[1,0],[1,1],[0,1]];
  assert.deepEqual(cutSlabQuad(quad,null),[quad]);
  assert.equal(cutSlabQuad(quad,{x:0.5,z:0.5,yaw:0,hx:2,hz:2}).length,0);
  assert.equal(cutSlabQuad(quad,{x:5,z:5,yaw:0.5,hx:1,hz:1}).reduce((s,p)=>s+area(p),0),1);
});

test('indirect daylight respects a sealed dividing wall',()=>{
  const source=read('photo/sky.js').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
  const onFloor=(_,x,z)=>x>=0&&x<=6&&z>=0&&z<=4;
  const bakeSky=new Function('onFloor','clamp',source+';return bakeSky;')(onFloor,(v,a,b)=>Math.max(a,Math.min(v,b)));
  const wall=(x,z,w,yaw,holes=[])=>({c:[x,1.2,z],w,yaw,holes});
  const L={bounds:{x0:0,x1:6,z0:0,z1:4},walls:[
    wall(0,2,4,Math.PI/2,[{x0:-0.6,x1:0.6}]),wall(6,2,4,Math.PI/2),
    wall(3,0,6,0),wall(3,4,6,0),wall(3,2,4,Math.PI/2)
  ]};
  const sky=bakeSky(L);
  const sample=(x,z)=>sky.v[Math.round((z-sky.z0)/sky.g)*sky.nx+Math.round((x-sky.x0)/sky.g)];
  assert.ok(sample(1,2)>0.05,'window should admit daylight');
  assert.ok(sample(4.5,2)<0.001,'bounce must not cross the sealed wall');
  assert.ok([...sky.v].every(v=>Number.isFinite(v)&&v>=0&&v<=1));
});

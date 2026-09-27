const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(`${__dirname}/../src/photo/garden.js`,'utf8')
 .replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
class Attribute{constructor(array,size){this.array=Float32Array.from(array);this.itemSize=size;this.count=this.array.length/size;}}
class BufferGeometry{
 constructor(){this.attributes={};}
 setAttribute(name,attribute){this.attributes[name]=attribute;}
 setIndex(index){this.index=index;}
}
class Mesh{constructor(geometry,material){this.geometry=geometry;this.material=material;}}
const THREE={BufferGeometry,Mesh,Float32BufferAttribute:Attribute};
const {lawnGround,LAWN_TILE}=new Function('THREE',source+';return {lawnGround,LAWN_TILE};')(THREE);
const at=(attribute,i)=>Array.from(attribute.array.slice(i*attribute.itemSize,(i+1)*attribute.itemSize));

test('the lawn faces the sky: every triangle winds up and every normal is +y',()=>{
 const {attributes:{position,normal},index}=lawnGround({},0,34,-0.28).geometry;
 for(let i=0;i<normal.count;i++)assert.deepEqual(at(normal,i),[0,1,0]);
 let faces=0;
 for(let t=0;t<index.length;t+=3){
  const [a,b,c]=[index[t],index[t+1],index[t+2]].map(i=>at(position,i));
  // y of (b-a)x(c-a): positive faces up; zero only at the degenerate centre.
  const y=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
  assert.ok(y>=-1e-9,'a downward face is culled from above');
  if(y>1e-9)faces++;
 }
 assert.ok(faces>index.length/3*0.9);
});

test('the lawn and the far field meet without a seam in texture or shade',()=>{
 const near=lawnGround({},0,34,-0.28).geometry,far=lawnGround({},34,132,-0.28).geometry;
 const rim=new Map();
 for(let i=0;i<near.attributes.position.count;i++){
  const [x,y,z]=at(near.attributes.position,i);
  if(Math.abs(Math.hypot(x,z)-34)<1e-6)rim.set(`${x.toFixed(4)},${z.toFixed(4)}`,i);
 }
 let shared=0;
 for(let i=0;i<far.attributes.position.count;i++){
  const [x,y,z]=at(far.attributes.position,i);
  const j=rim.get(`${x.toFixed(4)},${z.toFixed(4)}`);
  if(j===undefined)continue;
  shared++;
  assert.deepEqual(at(far.attributes.uv,i),at(near.attributes.uv,j));
  assert.deepEqual(at(far.attributes.color,i),at(near.attributes.color,j));
 }
 assert.equal(shared,rim.size);
 // World metres over the tile, so a repeat is LAWN_TILE metres wherever it is laid.
 const [x,,z]=at(far.attributes.position,0),[u,v]=at(far.attributes.uv,0);
 assert.ok(Math.abs(u*LAWN_TILE-x)<1e-4&&Math.abs(-v*LAWN_TILE-z)<1e-4);
});

test('broad patches vary the lawn by a sixth at most, never to black or white',()=>{
 const {color}=lawnGround({},0,132,-0.28).geometry.attributes;
 const values=Array.from(color.array);
 assert.ok(Math.min(...values)>0.75&&Math.max(...values)<1.25);
 assert.ok(Math.max(...values)-Math.min(...values)>0.2,'the patches have to be there to be seen');
});

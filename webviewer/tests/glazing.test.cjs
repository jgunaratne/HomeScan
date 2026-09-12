const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(`${__dirname}/../src/scene/joinery.js`,'utf8')
 .replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
class Group{
 constructor(){this.children=[];this.position={set:(x,y,z)=>Object.assign(this.position,{x,y,z})};this.rotation={};}
 add(...children){this.children.push(...children);}
}
class Mesh extends Group{constructor(geometry,material){super();this.geometry=geometry;this.material=material;}}
class PlaneGeometry{constructor(w,h){this.w=w;this.h=h;}}
const MAT={black:{},charcoal:{},slab:{},trim:{},steel:{},pane:{transparent:true},glassy:{transparent:true}};
const box=(mat,w,h,d,x,y,z)=>({mat,w,h,d,x,y,z,isBox:true});
const closedLeaves=new Function('THREE','MAT','box','tube',source+';return closedLeaves;')
 ({Group,Mesh,PlaneGeometry},MAT,box,()=>({}));
for(const [kind,width,count] of [['slider',1.66,2],['door',0.9,1],['door',1.8,2]]){
 test(`${kind} ${width}m has clear glazing openings with no opaque backing`,()=>{
  const host=new Group();
  closedLeaves(host,{c:[0,1.1,0],yaw:0},{x0:-width/2,x1:width/2,y0:-1.1,y1:1.1},kind);
  const children=host.children[0].children;
  const panes=children.filter(m=>m.geometry instanceof PlaneGeometry);
  assert.equal(panes.length,count,'one double-sided pane per leaf');
  const frames=children.filter(m=>m.isBox);
  assert.ok(frames.every(b=>b.w>0&&b.h>0&&b.d>0));
  for(const pane of panes){
   assert.equal(pane.material.transparent,true);
   for(const u of [-0.4,0,0.4])for(const v of [-0.4,0,0.4]){
    const x=pane.position.x+u*pane.geometry.w,y=pane.position.y+v*pane.geometry.h;
    assert.ok(!frames.some(b=>Math.abs(x-b.x)<b.w/2&&Math.abs(y-b.y)<b.h/2),
     'view ray through the glass must not hit a solid leaf');
   }
  }
 });
}
test('closet sliders retain their opaque leaves',()=>{
 const host=new Group();
 closedLeaves(host,{c:[0,1.1,0],yaw:0},{x0:-1,x1:1,y0:-1.1,y1:1.1},'closet-slider');
 assert.equal(host.children[0].children.filter(m=>m.mat===MAT.slab).length,2);
});

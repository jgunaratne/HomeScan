const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const result=JSON.parse(execFileSync('python3',['-B','-c',`
import runpy,json,copy
from pathlib import Path
b=runpy.run_path('build.py')
s=b['build_scene'](Path('../floor-data-saved'))
before=copy.deepcopy(s)
b['cut_openings'](s,Path('photos.json'))
edited=copy.deepcopy(before)
b['edit_walls'](edited,Path('photos.json'))
print(json.dumps({'before':before,'after':s,'edited':edited}))
`],{cwd:root,encoding:'utf8'}));
const roomMap=JSON.parse(fs.readFileSync(path.join(root,'photos.json')));

test('photo corrections preserve scan dimensions and existing openings',()=>{
 for(let level=0;level<result.before.levels.length;level++){
  const before=result.before.levels[level],after=result.after.levels[level];
  assert.deepEqual(after.floors,before.floors);
  assert.equal(after.walls.length,before.walls.length);
  before.walls.forEach((wall,i)=>{
   const changed=after.walls[i];
   for(const key of ['c','w','h','yaw'])assert.deepEqual(changed[key],wall[key]);
   wall.holes.forEach((hole,j)=>{
    const {style,...geometry}=changed.holes[j];
    assert.deepEqual(geometry,hole);
   });
  });
 }
});

test('east office gets a floor-level entrance; the one closet left with sliders is the media room\'s',()=>{
 const walls=result.after.levels[1].walls;
 const entrance=walls.find(w=>w.c[0]===1.189&&w.c[2]===-3.382);
 assert.equal(entrance.holes.length,1);
 const hole=entrance.holes[0];
 assert.equal(hole.k,'door');
 assert.ok(Math.abs(hole.x1-hole.x0-0.8)<1e-9);
 assert.ok(Math.abs(entrance.c[1]+hole.y0-result.after.levels[1].elevation)<0.002);
 assert.ok(hole.x0>=-entrance.w/2&&hole.x1<=entrance.w/2);
 const closets=result.after.levels.flatMap(l=>l.walls.flatMap(w=>w.holes.filter(h=>h.style==='closet-slider')));
 assert.equal(closets.length,1);
 assert.ok(closets.every(h=>h.x1-h.x0>1.7));
});

// The closet wall is removed by annotation and its strip given to the room
// as floor, so the roof is measured against the scan's own wall and the
// patch that replaced it.
test('east office: the closet wall is gone, its floor is the room\'s, and the roof still stops before the high side window',()=>{
 const roof=roomMap.rooms.find(r=>r.name==='East office').finishes.roof;
 const walls=result.after.levels[1].walls;
 const closet=walls.find(w=>w.c[0]===2.801);
 assert.ok(closet,'the scan has the closet wall');
 const edited=result.edited.levels[1];
 assert.ok(!edited.walls.some(w=>w.c[0]===2.801),'and the annotation takes it out');
 assert.equal(edited.floors.length,result.before.levels[1].floors.length+1,'with the closet strip added as floor');
 const toV=(x,z)=>Math.sin(roof.yaw)*x+Math.cos(roof.yaw)*z;
 const closetEnd=toV(closet.c[0],closet.c[2])+closet.w/2;
 assert.ok(Math.abs(roof.v1-closetEnd)<0.02);
 const side=walls.find(w=>w.c[0]===4.637);
 for(const h of side.holes){
  const ends=[h.x0,h.x1].map(t=>toV(side.c[0]+Math.cos(side.yaw)*t,side.c[2]-Math.sin(side.yaw)*t));
  assert.ok(roof.v1<Math.min(...ends),'slope must stop before the high window');
 }
});

test('West bedroom bed clears the full swing radius of every adjoining door',()=>{
 const room=roomMap.rooms.find(r=>r.name==='West bedroom');
 const bed=room.place.find(p=>p.product==='roomandboard/hudson-bed-queen');
 const c=Math.cos(bed.yaw),s=Math.sin(bed.yaw);
 const walls=result.after.levels[1].walls.filter(w=>w.c[0]===-2.572||w.c[0]===-3.714);
 for(const w of walls)for(const h of w.holes){
  for(const along of [h.x0,h.x1]){
   const x=w.c[0]+Math.cos(w.yaw)*along-bed.at[0];
   const z=w.c[2]-Math.sin(w.yaw)*along-bed.at[1];
   const dx=Math.max(0,Math.abs(c*x-s*z)-1.63/2);
   const dz=Math.max(0,Math.abs(s*x+c*z)-2.13/2);
   assert.ok(Math.hypot(dx,dz)>h.x1-h.x0+0.05,'door swing must clear the bed, from either hinge');
  }
 }
});

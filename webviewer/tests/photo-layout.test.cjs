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
full=copy.deepcopy(edited)
b['cut_openings'](full,Path('photos.json'))
print(json.dumps({'before':before,'after':s,'edited':edited,'full':full}))
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
   // A scanned hole survives untouched, unless an annotated opening on the
   // same wall swallows it whole — a closet opened across its width has no
   // use for its old door, a window widened has no use for its old frame —
   // in which case it is gone and the annotation covers it.
   for(const hole of wall.holes){
    const kept=changed.holes.find(h=>['k','x0','x1','y0','y1'].every(k=>h[k]===hole[k]));
    if(kept)continue;
    const swallowed=changed.holes.find(h=>(h.k==='opening'||h.k===hole.k)&&h.x0<=hole.x0+0.01&&h.x1>=hole.x1-0.01);
    assert.ok(swallowed,`a hole on wall ${i} of level ${level} vanished without an opening over it`);
   }
  });
 }
});

test('east office: its west wall stays solid, the door is cut in the annotated wall that fills the gap beside it, and the closet\'s side wall is gone; only the west bedroom\'s closet keeps a slider',()=>{
 const edited=result.edited.levels[1].walls;
 assert.ok(edited.some(w=>w.c[0]===1.189&&w.c[2]===-3.382),'the west wall stands');
 assert.ok(!edited.some(w=>w.c[0]===1.859&&w.c[2]===-3.714),'the closet side wall beside the desk is gone');
 const west=result.after.levels[1].walls.find(w=>w.c[0]===1.189&&w.c[2]===-3.382);
 assert.equal(west.holes.length,0,'with no door in it');
 const gap=result.full.levels[1].walls.find(w=>w.c[0]===0.737&&w.c[2]===-2.502);
 assert.ok(gap,'the gap between it and the landing wall is walled');
 assert.equal(gap.holes.length,1,'with the door in it');
 assert.ok(Math.abs(gap.holes[0].x1-gap.holes[0].x0-0.7)<1e-9);
 const landing=result.after.levels[1].walls.find(w=>w.c[0]===2.087&&w.c[2]===-1.337);
 assert.equal(landing.holes.length,0,'and none in the wall to the landing');
 const closets=result.after.levels.flatMap(l=>l.walls.filter(w=>w.holes.some(h=>h.style==='closet-slider')));
 assert.deepEqual(closets.map(w=>[w.c[0],w.c[2]]),[[-2.572,3.457]]);
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

// The scan left the strip between the south office and the west bedroom open
// from the landing to the facade: past the office doorway, a hallway that ran
// out onto the lawn. It is closed as a closet by annotation — a wall with a
// shut door across the landing end, the facade across the far end.
test('the strip beside the south office is a closet: a shut door across its landing end, the facade across its far end',()=>{
 const walls=result.full.levels[1].walls;
 const near=(x,z)=>walls.find(w=>Math.hypot(w.c[0]-x,w.c[2]-z)<0.01);
 const ends=w=>[-1,1].map(k=>[w.c[0]+k*Math.cos(w.yaw)*w.w/2,w.c[2]-k*Math.sin(w.yaw)*w.w/2]);
 const offLine=(p,w)=>Math.abs((p[0]-w.c[0])*Math.sin(w.yaw)+(p[1]-w.c[2])*Math.cos(w.yaw));
 const along=(p,w)=>(p[0]-w.c[0])*Math.cos(w.yaw)-(p[1]-w.c[2])*Math.sin(w.yaw);
 const front=near(-0.994,1.463),office=near(-0.628,1.699),bedroom=near(-1.553,1.582);
 assert.ok(front&&office&&bedroom,'the front wall stands between the office\'s west wall and the bedroom\'s east wall');
 const [a,b]=ends(front),[onOffice,onBedroom]=offLine(a,office)<offLine(b,office)?[a,b]:[b,a];
 assert.ok(offLine(onOffice,office)<0.01&&offLine(onBedroom,bedroom)<0.01,'meeting both on their centre lines');
 // Clear of the office door's casing (45 mm) by more than half a wall.
 const t=along(onOffice,office);
 for(const h of office.holes)assert.ok(Math.min(Math.abs(h.x0-t),Math.abs(h.x1-t))>0.045+0.055,'clear of the office doorway');
 assert.equal(front.holes.length,1,'with one door in it');
 assert.equal(front.holes[0].k,'door');
 assert.ok(Math.abs(front.holes[0].x1-front.holes[0].x0-0.61)<1e-9);
 const key=front.c[0].toFixed(2)+','+front.c[2].toFixed(2);
 assert.ok(roomMap.rooms.some(r=>(r.finishes?.closedDoors||[]).some(([x,z])=>x.toFixed(2)+','+z.toFixed(2)===key)),'and that door is shut');
 // The facade spans the gap from the end of the bedroom's east wall to the end
 // of the office's west wall, and runs a little past each so the joints close.
 const spans=(w,p)=>offLine(p,w)<0.01&&Math.abs(along(p,w))<w.w/2;
 const gapEnds=[near(-2.572,3.457),near(-1.933,4.24)].map(side=>ends(side).sort((p,q)=>q[1]-p[1])[0]);
 const facade=walls.find(w=>w.conf==='annotated'&&gapEnds.every(p=>spans(w,p)));
 assert.ok(facade,'the facade is closed from the end of the bedroom\'s wall to the end of the office\'s');
 assert.equal(facade.holes.length,0);
});

// The scan stood a short wall through the flight and its balustrade, where
// the entry is open to the stair. The annotation takes it out: nothing in the
// edited storey stands inside the flight.
test('entry: no wall stands inside the stair\'s footprint',()=>{
 const level=result.edited.levels[0];
 const stair=level.objects.find(o=>o.cat==='stairs');
 assert.ok(stair,'the scan has the stair');
 const c=Math.cos(stair.yaw),s=Math.sin(stair.yaw);
 const inside=walls=>walls.filter(w=>{
  for(let k=0;k<=20;k++){
   const a=-w.w/2+w.w*k/20,x=w.c[0]+Math.cos(w.yaw)*a-stair.c[0],z=w.c[2]-Math.sin(w.yaw)*a-stair.c[2];
   if(Math.abs(c*x-s*z)<stair.d[0]/2-0.02&&Math.abs(s*x+c*z)<stair.d[2]/2-0.02)return true;
  }
  return false;
 });
 assert.equal(inside(result.before.levels[0].walls).length,1,'the scan has one wall through the flight');
 assert.deepEqual(inside(level.walls),[],'and the annotation takes it out');
});

test('West bedroom bed clears the full swing radius of every adjoining door',()=>{
 const room=roomMap.rooms.find(r=>r.name==='West bedroom');
 const bed=room.place.find(p=>/-bed-/.test(p.product));
 const [bw,,bd]={'westelm/anton-bed-full':[1.42,0.86,1.98],'roomandboard/hudson-bed-queen':[1.63,0.91,2.13]}[bed.product];
 const c=Math.cos(bed.yaw),s=Math.sin(bed.yaw);
 const walls=result.after.levels[1].walls.filter(w=>w.c[0]===-2.572||w.c[0]===-3.714);
 for(const w of walls)for(const h of w.holes){
  for(const along of [h.x0,h.x1]){
   const x=w.c[0]+Math.cos(w.yaw)*along-bed.at[0];
   const z=w.c[2]-Math.sin(w.yaw)*along-bed.at[1];
   const dx=Math.max(0,Math.abs(c*x-s*z)-bw/2);
   const dz=Math.max(0,Math.abs(s*x+c*z)-bd/2);
   assert.ok(Math.hypot(dx,dz)>h.x1-h.x0+0.05,'door swing must clear the bed, from either hinge');
  }
 }
});

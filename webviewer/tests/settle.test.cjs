const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/scene/settle.js'),'utf8');
const settle=new Function(source.replace(/^export /gm,'')+';return settle;')();

// A room 4 m by 3 m with its wall faces at x=0, x=4, z=0 and z=3.
const room=(x,z)=>x>0&&x<4&&z>0&&z<3;

test('a piece already clear of the walls stays where it is',()=>{
  const at=settle(room,2,1.5,0,1,0.5);
  assert.deepEqual(at,{x:2,z:1.5,moved:0});
});
test('a piece scanned into the wall behind it comes forward, and no further',()=>{
  // Back edge 10 cm into the wall at z=0, front toward +z.
  const at=settle(room,2,0.15,0,1,0.5,1);
  assert.ok(at,'somewhere fits');
  assert.equal(at.x,2,'it does not slide sideways when forward is enough');
  assert.ok(Math.abs(at.z-0.26)<0.021,`front-most placement that clears: z=${at.z}`);
});
test('facing is respected: forward is the piece\'s front, not +z',()=>{
  const at=settle(room,2,2.85,0,1,0.5,-1);   // front toward -z, back in the wall at z=3
  assert.ok(at&&at.z<2.85&&Math.abs(at.x-2)<1e-9);
});
test('a piece wider than its alcove slides along the wall rather than forward',()=>{
  // Left edge 20 cm into the wall at x=0; forward alone never clears that.
  const at=settle(room,0.3,1.5,0,1,0.5,1);
  assert.ok(at&&at.x>0.5-1e-9&&Math.abs(at.z-1.5)<1e-9);
});
test('nothing within reach is reported as partial, at the least bad place',()=>{
  const lost=settle(room,10,10,0,1,1);
  assert.ok(lost.partial&&lost.bad===9,'nowhere near the room at all: every sample out, and it says so');
  const at=settle(room,2,1.5,0,5,0.5);
  assert.ok(at&&at.partial,'a piece wider than the room fits nowhere, but stands somewhere');
  assert.ok(at.bad>0&&at.bad<9,`most of it is still in the room: ${at.bad} samples out`);
  assert.ok(Math.abs(at.x-2)<1e-9||at.moved<=0.6,'and it did not wander off for nothing');
});
test('rotation is honoured',()=>{
  // A 2 m long piece turned across the room's 3 m width, sitting 10 cm into
  // the wall at z=0 along its own +x: it must move along world z.
  const at=settle(room,2,0.9,Math.PI/2,2,0.4,1);
  assert.ok(at&&at.moved>0&&at.moved<0.2);
});

// A point test alone lets a piece stand with a wall through it: the far side
// of a wall is floor too. The footprint's edges have to be tested for crossing.
const crossesBox=new Function(source.replace(/^export /gm,'')+';return crossesBox;')();
test('a footprint edge through a wall is a failure even when its corners are on floor',()=>{
  const wall={x:2,z:1.5,yaw:0,hx:1.5,hz:0.055};              // a wall across the room at z=1.5
  const open=()=>true;                                       // everything is "floor"
  const crossing=(ax,az,bx,bz)=>crossesBox(ax,az,bx,bz,wall,0.02);
  const at=settle(open,2,1.5,0,1,0.6,1,crossing);            // a piece straddling the wall
  assert.ok(at&&!at.partial&&at.moved>0.3,`it moves clear of the wall: ${JSON.stringify(at)}`);
  assert.ok(crossesBox(1,1,3,2,wall,0)&&!crossesBox(1,2,3,2.5,wall,0));
});

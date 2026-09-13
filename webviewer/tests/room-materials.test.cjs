const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'../src/photo/rooms.js'),'utf8');
const source=s.slice(s.indexOf('export function roomAt')).replace(/^export /gm,'');
const {roomAt,clearRoomRay}=new Function('ROOM_REACH',source+';return {roomAt,clearRoomRay};')(9);
test('wall paint comes from a visible room rather than a nearer room through a wall',()=>{
 const behind={name:'Bathroom',at:[0,-0.2]},visible={name:'Bedroom',at:[2,0.5]};
 const L={rooms:[behind,visible],blockers:[{x:0,z:0,yaw:0,hx:3,hz:0.06}]};
 assert.equal(roomAt(L,0,0.3,true),visible);
 assert.equal(roomAt(L,0,0.3),behind);
 assert.equal(clearRoomRay(L,0,0.3,0,-0.2),false);
 assert.equal(clearRoomRay({blockers:[]},0,0.3,0,-0.2),true);
});
test('material lookup retains a nearest-anchor fallback for incomplete room geometry',()=>{
 const r={at:[0,-1]};const L={rooms:[r],blockers:[{x:0,z:0,yaw:0,hx:3,hz:0.06}]};
 assert.equal(roomAt(L,0,1,true),r);
 assert.equal(roomAt(L,30,30,true),null);
});
test('a room may say how far its finishes carry',()=>{
 const closet={name:'Laundry',at:[0,0],reach:1.6},hall={name:'Hall',at:[4,0]};
 const L={rooms:[closet,hall],blockers:[]};
 assert.equal(roomAt(L,1,0,true),closet,'inside its reach the closet still wins');
 assert.equal(roomAt(L,2,0,true),hall,'past it the corridor takes over, though it is further');
 // Without the limit the closet would hold everything up to the halfway line.
 const unbounded={name:'Laundry',at:[0,0]};
 assert.equal(roomAt({rooms:[unbounded,hall],blockers:[]},2,0,true),unbounded);
});

// Floor finishes are assigned by walking distance from each room's anchor, not
// by straight-line distance, because a bathroom's anchor is nearer to the hall
// outside its door than to its own far corner. No radius can separate those;
// the wall between them can.
const src=fs.readFileSync(path.join(__dirname,'../src/photo/rooms.js'),'utf8');
const flood=new Function('ROOM_REACH','roomAt',
  src.slice(src.indexOf('const DOORWAY')).replace(/^export /gm,'')
  +';return {assignFloor,barriers};')(9,()=>null);

// One room, one corridor, one wall with a door-width hole between them.
const room=(name,at)=>({name,at});
function strip(walls,rooms,nx=20,nz=1,g=0.5){
  const b={x0:0,z0:0,x1:nx*g,z1:nz*g};
  const L={walls,rooms};
  const own=flood.assignFloor(L,g,b,nx,nz,()=>true);
  return own.map(r=>r?r.name[0]:'.').join('');
}
test('a doorway stops a floor finish; a wide opening carries it through',()=>{
  // A wall across the strip at x=5, with a 0.9 m hole in it — a door.
  const door=[{c:[5,1.2,0.25],w:4,h:2.4,yaw:Math.PI/2,holes:[{x0:-0.45,x1:0.45,y0:-1.2}]}];
  const laid=strip(door,[room('Bathroom',[2.5,0.25]),room('Hall',[7.5,0.25])]);
  assert.match(laid,/^B+H+$/,'the two finishes must meet exactly once');
  assert.equal(laid.indexOf('H'),10,'and they meet at the wall, not between the anchors');

  // The same wall with a 2.4 m hole is a cased opening, and the boards run on.
  const opening=[{c:[5,1.2,0.25],w:4,h:2.4,yaw:Math.PI/2,holes:[{x0:-1.2,x1:1.2,y0:-1.2}]}];
  const through=strip(opening,[room('Bathroom',[2.5,0.25]),room('Hall',[7.5,0.25])]);
  assert.match(through,/^B+H+$/);
  assert.equal(through.indexOf('H'),11,
    'with nothing to stop it the boundary falls where the two floods meet, past the wall');
});
test('floor left unreachable from any anchor still gets a room',()=>{
  const sealed=[{c:[5,1.2,0.25],w:4,yaw:Math.PI/2,holes:[]}];
  const laid=strip(sealed,[room('Kitchen',[2.5,0.25])]);
  // Past the solid wall nothing can be walked to, so the fallback answers.
  assert.match(laid,/^K+\.+$/);
  assert.equal(laid.indexOf('.'),10);
});

// A wide hole that starts above the floor — a pass-through over a bar — is
// not a way through: the floor finish stops at the wall under it.
test('a pass-through above the floor does not carry a floor finish through',()=>{
  const hatch=[{c:[5,1.2,0.25],w:4,h:2.4,yaw:Math.PI/2,holes:[{x0:-1.2,x1:1.2,y0:-0.15}]}];
  const laid=strip(hatch,[room('Kitchen',[2.5,0.25]),room('Hall',[7.5,0.25])]);
  assert.match(laid,/^K+H+$/);
  assert.equal(laid.indexOf('H'),10,'the boundary stays at the wall under the hatch');
});

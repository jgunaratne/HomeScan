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

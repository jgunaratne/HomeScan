import { PHOTOS, ROOMS } from '../core/data.js';
import { levels } from '../scene/levels.js';

// The scan carries geometry and nothing at all about how the house looks. What
// the photographs are for is the surfaces: every wall face, floor and ceiling is
// assigned to a room, and each room takes its material from the pictures taken
// in it — a patch of plain wall, a patch of floor, a patch of ceiling, lifted
// out of the photograph and tiled at real-world scale.
//
// This is not a projection. There are no camera poses, so nothing here claims to
// put a pixel back where it was seen. What it does claim is weaker and true: the
// sage-green living room comes out sage green, the kitchen comes out grey-blue
// over cherry boards, and the bathrooms come out tiled.
//
// photos.json says which room each picture belongs to; the geometry decides the
// rest. Rooms with no photograph keep the flat survey palette.
export const TILE = {wall:1.15, floor:1.55, ceil:1.9};   // metres of wall per texture repeat
export const ROOM_REACH = 9;        // a surface further than this from every anchor stays flat
export const BANDS = {              // where in a photograph each surface tends to sit
  ceil:  [0.02, 0.19],
  wall:  [0.22, 0.58],
  floor: [0.66, 0.99],
};
// How hard to iron the baked light out of a patch. A ceiling is paint and only
// ever paint, so it goes all the way to its own flat colour — tiling a 128px
// crop of one across a 15 m room is what speckles it. Walls keep enough for tile
// to read as tile; floors keep most of it, because the grain is the point.
export const FLATTEN = {ceil:1, wall:0.72, floor:0.34};
export const photoRooms = [];       // {level, name, at, shots, mats}

// Group the file's photographs by the room they were taken in, and give every
// storey the groups it hangs its surfaces and prints on.
export function indexPhotos(){
  for (const L of levels){
    L.prints = new THREE.Group();  L.group.add(L.prints);
    L.roomFloor = new THREE.Group(); L.shell.add(L.roomFloor);
    L.roomCeil = new THREE.Group();  L.ceil.add(L.roomCeil);
    L.shots = [];
    L.rooms = [];
  }

  for (const ph of PHOTOS || []){
    let room = photoRooms.find(r => r.level === ph.level && r.name === ph.room);
    if (!room){
      room = {level:ph.level, name:ph.room, at:ph.at, floorFrom:ph.floorFrom, finishes:ph.finishes,
              reach:ph.reach, shots:[], mats:null};
      photoRooms.push(room);
      if (levels[ph.level]) levels[ph.level].rooms.push(room);
    }
    room.shots.push(ph);
  }
  for (const r of photoRooms) r.shots.sort((a,b) => a.seq - b.seq);

  // The rooms nobody photographed. They are here for their anchor above all:
  // a space with no anchor belongs to whichever room's anchor happens to be
  // nearest, and a hall's nearest neighbour is usually a bathroom.
  for (const r of ROOMS || []){
    const room = {level:r.level, name:r.name, at:r.at, floorFrom:r.floorFrom,
                  finishes:r.finishes, reach:r.reach, shots:[], mats:null, declared:true};
    photoRooms.push(room);
    if (levels[r.level]) levels[r.level].rooms.push(room);
  }
}

// Which room a point on this storey belongs to. Anchors are room centres, so the
// boundary falls near the wall between them — near enough that the wall itself
// hides it, and in an open plan there is no boundary to hide.
export function roomAt(L, x, z, visible = false){
  let best = null, bd = ROOM_REACH;
  let fallback = null, fallbackDistance = ROOM_REACH;
  for (const r of L.rooms){
    const d = Math.hypot(r.at[0] - x, r.at[1] - z);
    // Most anchors are room centres and want the default reach. A few are not:
    // the laundry's is its washer/dryer, standing against one wall of a
    // cupboard, and nearest-anchor handed that cupboard four times its own
    // floor. `reach` is for that case — a corridor with an anchor of its own
    // needs none.
    if (d > Math.min(ROOM_REACH, r.reach ?? ROOM_REACH)) continue;
    if (d < fallbackDistance){ fallback = r; fallbackDistance = d; }
    if (d < bd && (!visible || clearRoomRay(L,x,z,r.at[0],r.at[1]))){ bd = d; best = r; }
  }
  return best || fallback;
}

// Do not paint a wall face with a nearer room that sits behind another wall.
// Clip the segment to each oriented blocker; open doorways are already absent.
export function clearRoomRay(L,x,z,tx,tz){
  for(const b of L.blockers){
    const c=Math.cos(b.yaw),s=Math.sin(b.yaw),dx=x-b.x,dz=z-b.z;
    const origin=[c*dx-s*dz,s*dx+c*dz],delta=[c*(tx-x)-s*(tz-z),s*(tx-x)+c*(tz-z)];
    let enter=0,leave=1;
    for(let axis=0;axis<2;axis++){
      const half=axis===0?b.hx:b.hz;
      if(Math.abs(delta[axis])<1e-9){if(Math.abs(origin[axis])>half){enter=2;break;}continue;}
      let a=(-half-origin[axis])/delta[axis],d=(half-origin[axis])/delta[axis];
      if(a>d)[a,d]=[d,a];enter=Math.max(enter,a);leave=Math.min(leave,d);
    }
    if(enter<leave&&leave>0.02&&enter<0.98)return false;
  }
  return true;
}

// Which room each patch of floor belongs to, for the purpose of what is laid on
// it. Nearest anchor is the wrong question here and was the cause of every
// bleed: a bathroom's anchor is two metres from the hall outside its door and
// three from its own far corner, so no radius can separate them. What separates
// one floor finish from the next is not distance, it is the wall — flooring
// stops at a doorway and carries through a cased opening.
//
// So the floor is flood-filled from the anchors instead, over a barrier set of
// every wall with its wide openings cut out. A hole a door could hang in stays
// a barrier; anything wider is an opening two rooms share, and the boards run
// through it. The door width is the one `doorLeaf` already uses to decide
// whether an opening gets a leaf at all.
const DOORWAY = 1.25;               // wider than this and it is an opening
// RoomPlan's walls do not quite meet at the corners, and a flood fill leaks
// through a two-centimetre gap as happily as through a door. Each barrier is
// run on a little past both ends to close them.
const OVERRUN = 0.2;

function barriers(L){
  if (L.barriers) return L.barriers;
  const out = [];
  for (const w of L.walls){
    const c = Math.cos(w.yaw), s = -Math.sin(w.yaw), half = w.w/2;
    // Everything but the wide holes, as intervals along the wall's own axis.
    const gaps = (w.holes || [])
      .filter(h => h.x1 - h.x0 > DOORWAY)
      .map(h => [Math.max(-half, h.x0), Math.min(half, h.x1)])
      .sort((a, b) => a[0] - b[0]);
    let at = -half;
    for (const [x0, x1] of gaps.concat([[half, half]])){
      if (x0 > at){
        // Only the outer ends overrun; a stub beside a cased opening must not
        // grow across the opening it stands next to.
        const a = at - (at <= -half ? OVERRUN : 0), bEnd = x0 + (x1 <= x0 ? OVERRUN : 0);
        out.push([w.c[0] + c*a, w.c[2] + s*a, w.c[0] + c*bEnd, w.c[2] + s*bEnd]);
      }
      at = Math.max(at, x1);
    }
  }
  return (L.barriers = out);
}

const crosses = (bar, ax, az, bx, bz) => {
  const side = (x1,z1,x2,z2,px,pz) => (x2-x1)*(pz-z1) - (z2-z1)*(px-x1);
  for (const [x1,z1,x2,z2] of bar){
    const d1 = side(x1,z1,x2,z2,ax,az), d2 = side(x1,z1,x2,z2,bx,bz);
    const d3 = side(ax,az,bx,bz,x1,z1), d4 = side(ax,az,bx,bz,x2,z2);
    if (((d1>0)!==(d2>0)) && ((d3>0)!==(d4>0))) return true;
  }
  return false;
};

// Multi-source breadth-first over the floor cells: every room starts at its own
// anchor and spreads until it meets a wall or another room. What that measures
// is how far away a room is by walking, which is the question a floor answers.
// Cells no room can walk to — the garage — keep the nearest-anchor answer.
export function assignFloor(L, g, b, nx, nz, onFloorAt){
  const bar = barriers(L);
  const own = new Array(nx*nz).fill(undefined);
  const at = (i,j) => [b.x0 + (i+0.5)*g, b.z0 + (j+0.5)*g];
  let queue = [];
  for (const r of L.rooms){
    const i = Math.round((r.at[0] - b.x0)/g - 0.5), j = Math.round((r.at[1] - b.z0)/g - 0.5);
    if (i < 0 || i >= nx || j < 0 || j >= nz) continue;
    const k = j*nx + i;
    if (!onFloorAt(k) || own[k] !== undefined) continue;
    own[k] = r; queue.push(k);
  }
  for (let head = 0; head < queue.length; head++){
    const k = queue[head], i = k % nx, j = (k - i)/nx;
    const [ax, az] = at(i, j);
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const ni = i + di, nj = j + dj;
      if (ni < 0 || ni >= nx || nj < 0 || nj >= nz) continue;
      const nk = nj*nx + ni;
      if (own[nk] !== undefined || !onFloorAt(nk)) continue;
      const [bx, bz] = at(ni, nj);
      if (crosses(bar, ax, az, bx, bz)) continue;
      own[nk] = own[k]; queue.push(nk);
    }
  }
  for (let k = 0; k < own.length; k++){
    if (own[k] !== undefined || !onFloorAt(k)) continue;
    const i = k % nx, j = (k - i)/nx, [x, z] = at(i, j);
    own[k] = roomAt(L, x, z, true);          // sealed off from every anchor
  }
  return own;
}

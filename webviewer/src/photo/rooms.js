import { PHOTOS } from '../core/data.js';
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
      room = {level:ph.level, name:ph.room, at:ph.at, floorFrom:ph.floorFrom,
              shots:[], mats:null};
      photoRooms.push(room);
      if (levels[ph.level]) levels[ph.level].rooms.push(room);
    }
    room.shots.push(ph);
  }
  for (const r of photoRooms) r.shots.sort((a,b) => a.seq - b.seq);
}

// Which room a point on this storey belongs to. Anchors are room centres, so the
// boundary falls near the wall between them — near enough that the wall itself
// hides it, and in an open plan there is no boundary to hide.
export function roomAt(L, x, z){
  let best = null, bd = ROOM_REACH;
  for (const r of L.rooms){
    const d = Math.hypot(r.at[0] - x, r.at[1] - z);
    if (d < bd){ bd = d; best = r; }
  }
  return best;
}

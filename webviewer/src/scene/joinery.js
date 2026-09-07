import { WALL_T } from '../core/constants.js';
import { onFloor } from '../core/geometry.js';
import { MAT } from './materials.js';
import { box, tube } from './fittings.js';
import { blocks } from '../player/collision.js';

// A cased opening, the way a real one is trimmed: head, two jambs, and for a
// window a sill that stands proud of the wall.
export function casing(host, w, o, elev, t, sill){
  const ow = o.x1 - o.x0, oh = o.y1 - o.y0;
  const mid = (o.x0 + o.x1)/2, ymid = w.c[1] + (o.y0 + o.y1)/2;
  const D = WALL_T + 0.04;
  const put = (lx, ly, sx, sy, sz, lz = 0, mat = MAT.trim) => {
    if (sx < 0.003 || sy < 0.003) return;
    const m = box(mat, sx, sy, sz || D,
      w.c[0] + Math.cos(w.yaw)*(mid + lx) + Math.sin(w.yaw)*lz, ymid + ly,
      w.c[2] - Math.sin(w.yaw)*(mid + lx) + Math.cos(w.yaw)*lz);
    m.rotation.y = w.yaw;
    host.add(m);
  };
  put(0, oh/2 + t/2, ow + t*2, t);
  put(-(ow/2 + t/2), 0, t, oh);
  put( (ow/2 + t/2), 0, t, oh);
  if(!sill){
    // Recessed jamb liners and stops give a doorway depth beyond the face trim.
    for(const s of [-1,1]){
      put(s*(ow/2-0.012),0,0.024,oh,WALL_T);
      put(s*(ow/2-0.03),0,0.012,oh,0.028);
    }
    put(0,oh/2-0.012,ow,0.024,WALL_T);
    put(0,oh/2-0.03,ow-0.048,0.012,0.028);
  }
  // A raised outer bead on each face catches daylight along the casing.
  for (const side of [-1, 1]){
    const z = side*(D/2 + 0.006);
    put(0, oh/2 + t*0.78, ow + t*2, t*0.22, 0.012, z);
    for (const s of [-1, 1])
      put(s*(ow/2 + t*0.78), 0, t*0.22, oh, 0.012, z);
  }
  if (sill){
    put(0, -(oh/2 + t/2), ow + t*2, t, D + 0.06);
    // Recessed sash rails and a narrow gasket give the glass a visible seat.
    for (const side of [-1, 1]){
      const depth = side*WALL_T*0.23;
      for (const s of [-1, 1]){
        put(s*(ow/2-0.024), 0, 0.048, oh, 0.034, depth);
        put(0, s*(oh/2-0.024), ow, 0.048, 0.034, depth);
        put(s*(ow/2-0.051), 0, 0.006, Math.max(0.01, oh-0.096), 0.008, depth, MAT.dark);
      }
      put(0, -oh/2+0.055, Math.max(0.01, ow-0.096), 0.006, 0.01, depth, MAT.steel);
    }
    // Divided lites. Every window in these photographs has them, and a single
    // sheet of glass three metres wide is the giveaway that it is not one.
    const n = Math.max(1, Math.round(ow/0.85));
    for (let i=1;i<n;i++) put(-ow/2 + ow*i/n, 0, 0.042, oh, WALL_T + 0.012);
    if (oh > 1.3) put(0, oh*0.16, ow, 0.038, WALL_T + 0.012);
  }
}

// A door left standing open. RoomPlan reports the hole, not the leaf or which
// way it swings, so all four ways are tried and the first that lands on clear
// floor wins. If none does — a doorway too tight to swing into — there is no
// leaf, which is better than one buried in a wall.
export function doorLeaf(host, L, w, o, blockers){
  const ow = o.x1 - o.x0, oh = o.y1 - o.y0;
  if (ow < 0.6 || ow > 1.25 || oh < 1.4) return;
  const mid = (o.x0 + o.x1)/2;
  for (const hs of [-1, 1]) for (const sw of [-1, 1]){
    const xh = mid + hs*ow/2;
    const hx = w.c[0] + Math.cos(w.yaw)*xh, hz = w.c[2] - Math.sin(w.yaw)*xh;
    const rot = w.yaw + sw*Math.PI/2;
    const cx = hx - hs*Math.cos(rot)*ow/2, cz = hz + hs*Math.sin(rot)*ow/2;
    if (!onFloor(L, cx, cz)) continue;
    let clear = true;
    // Check the full open leaf, not only its centre: the latch edge can
    // otherwise pass through a return wall in a narrow doorway.
    for(let i=0;i<=6&&clear;i++){
      const along=0.18+(ow-0.21)*i/6;
      const x=hx-hs*Math.cos(rot)*along,z=hz+hs*Math.sin(rot)*along;
      if(!onFloor(L,x,z)||blockers.some(b=>blocks(x,z,b,0.035)))clear=false;
    }
    if (!clear) continue;
    const leaf = new THREE.Group();
    leaf.position.set(cx, w.c[1] + (o.y0 + o.y1)/2, cz);
    leaf.rotation.y = rot;
    leaf.add(box(MAT.trim, ow - 0.02, oh - 0.03, 0.04, 0, 0, 0));
    // Shaker rails stand proud of the centre panels on both sides.
    const rail = Math.min(0.095, ow*0.12), width = ow - 0.024, height = oh - 0.034;
    const handleX = -hs*(ow/2 - 0.09), handleY = -oh*0.06;
    for (const side of [-1, 1]){
      const z = side*0.025;
      for (const s of [-1, 1]){
        leaf.add(box(MAT.trim, rail, height, 0.012, s*(width-rail)/2, 0, z));
        leaf.add(box(MAT.trim, width-rail*2, rail, 0.012, 0, s*(height-rail)/2, z));
      }
      leaf.add(box(MAT.trim, width-rail*2, rail, 0.012, 0, -height*0.12, z));
      leaf.add(tube(MAT.steel, 0.027, 0.012, handleX, handleY, side*0.038, 'z'));
      leaf.add(tube(MAT.steel, 0.009, 0.042, handleX, handleY, side*0.059, 'z'));
      leaf.add(tube(MAT.steel, 0.009, 0.105, handleX+hs*0.045, handleY, side*0.08, 'x'));
    }
    for (const y of [-height*0.36, 0, height*0.36])
      leaf.add(tube(MAT.steel, 0.012, 0.075, hs*width/2, y, 0));
    host.add(leaf);
    return;
  }
}
export const FIXTURES = new Set(['toilet','sink','bathtub','oven','stove','refrigerator',
  'dishwasher','washerDryer','television','fireplace']);

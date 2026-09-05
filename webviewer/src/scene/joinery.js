import { WALL_T } from '../core/constants.js';
import { onFloor } from '../core/geometry.js';
import { MAT } from './materials.js';
import { tube } from './fittings.js';
import { blocks } from '../player/collision.js';

// A cased opening, the way a real one is trimmed: head, two jambs, and for a
// window a sill that stands proud of the wall.
export function casing(host, w, o, elev, t, sill){
  const ow = o.x1 - o.x0, oh = o.y1 - o.y0;
  const mid = (o.x0 + o.x1)/2, ymid = w.c[1] + (o.y0 + o.y1)/2;
  const D = WALL_T + 0.04;
  const put = (lx, ly, sx, sy, sz) => {
    if (sx < 0.02 || sy < 0.02) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz || D), MAT.trim);
    m.position.set(w.c[0] + Math.cos(w.yaw)*(mid + lx), ymid + ly,
                   w.c[2] - Math.sin(w.yaw)*(mid + lx));
    m.rotation.y = w.yaw;
    host.add(m);
  };
  put(0, oh/2 + t/2, ow + t*2, t);
  put(-(ow/2 + t/2), 0, t, oh);
  put( (ow/2 + t/2), 0, t, oh);
  if (sill){
    put(0, -(oh/2 + t/2), ow + t*2, t, D + 0.06);
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
    for (const b of blockers) if (blocks(cx, cz, b, 0.14)){ clear = false; break; }
    if (!clear) continue;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(ow - 0.02, oh - 0.03, 0.04), MAT.trim);
    leaf.position.set(cx, w.c[1] + (o.y0 + o.y1)/2, cz);
    leaf.rotation.y = rot;
    host.add(leaf);
    const kn = tube(MAT.steel, 0.022, 0.07,
                    cx + Math.cos(rot)*hs*(ow/2 - 0.09), w.c[1] + (o.y0 + o.y1)/2 - oh*0.06,
                    cz - Math.sin(rot)*hs*(ow/2 - 0.09), 'z');
    kn.rotation.y = rot;
    host.add(kn);
    return;
  }
}
export const FIXTURES = new Set(['toilet','sink','bathtub','oven','stove','refrigerator',
  'dishwasher','washerDryer','television','fireplace']);

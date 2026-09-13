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
  // No bead: the renovation's casing is a square-edged flat stock, which
  // reads as one clean line around the opening rather than a moulding.
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
      put(0, -oh/2+0.055, Math.max(0.01, ow-0.096), 0.006, 0.01, depth, MAT.dark);
    }
    // Divided lites. Every window in these photographs has them, and a single
    // sheet of glass three metres wide is the giveaway that it is not one.
    const n = Math.max(1, Math.round(ow/0.85));
    for (let i=1;i<n;i++) put(-ow/2 + ow*i/n, 0, 0.042, oh, WALL_T + 0.012);
    if (oh > 1.3) put(0, oh*0.16, ow, 0.038, WALL_T + 0.012);
  }
}

// A closed leaf in the plane of the wall, for the doors to outside: nobody
// walks around with the front door standing open. One slab up to 1.25 m; a
// pair above that, and glazed, the way the photographs show the entry — or,
// if the annotation calls the opening a slider, two panes of glass in a slim
// frame, one of them the fixed one.
// Four frame members leave an actual opening behind the transparent glass.
// A pane laid over a solid leaf only reveals the leaf, never the outside.
export function glazedFrame(host, mat, width, height, depth, x, z, liteWidth, liteHeight, liteY = 0){
  const stile = (width - liteWidth)/2;
  for (const side of [-1, 1])
    host.add(box(mat, stile, height, depth, x + side*(width + liteWidth)/4, 0, z));
  const bottom = liteY - liteHeight/2, top = liteY + liteHeight/2;
  host.add(box(mat, liteWidth, height/2 + bottom, depth, x, (bottom - height/2)/2, z));
  host.add(box(mat, liteWidth, height/2 - top, depth, x, (top + height/2)/2, z));
}

function closedLeaves(host, w, o, kind){
  const ow = o.x1 - o.x0, oh = o.y1 - o.y0, mid = (o.x0 + o.x1)/2;
  const g = new THREE.Group();
  g.position.set(w.c[0] + Math.cos(w.yaw)*mid, w.c[1] + (o.y0 + o.y1)/2, w.c[2] - Math.sin(w.yaw)*mid);
  g.rotation.y = w.yaw;
  if (kind === 'closet-slider'){
    // Opaque bypass leaves occupy parallel tracks within the scanned opening.
    for (const side of [-1, 1]){
      const width = ow/2 + 0.015, x = side*(ow/4 - 0.0075), z = side*0.022;
      g.add(box(MAT.slab,width,oh-0.035,0.032,x,0,z));
      for(const face of [-1,1])
        g.add(tube(MAT.steel,0.018,0.004,x+side*(width/2-0.07),-oh*0.08,z+face*0.018,'z'));
    }
    g.add(box(MAT.trim,ow,0.025,0.085,0,oh/2-0.0125,0));
    g.name='Sliding closet doors';
  } else if (kind === 'garage'){
    // A sectional overhead door, closed: one slab, so no daylight comes
    // through between the panels, with the three panel joints drawn on it.
    g.add(box(MAT.slab, ow - 0.02, oh - 0.02, 0.04, 0, 0, 0));
    for (let i=1;i<4;i++) for (const side of [-1, 1])
      g.add(box(MAT.dark, ow - 0.04, 0.012, 0.006, 0, -oh/2 + oh/4*i, side*0.021));
    g.name='Garage door';
  } else if (kind === 'slab'){
    // An interior door, shut: the flush slab with its black lever, in the
    // plane of the wall.
    g.add(box(MAT.slab, ow - 0.02, oh - 0.03, 0.04, 0, 0, 0));
    for (const side of [-1, 1]){
      g.add(box(MAT.black, 0.05, 0.05, 0.008, ow/2 - 0.075, -oh*0.06, side*0.024));
      g.add(tube(MAT.black, 0.008, 0.05, ow/2 - 0.075, -oh*0.06, side*0.05, 'z'));
      g.add(tube(MAT.black, 0.008, 0.12, ow/2 - 0.075 - 0.055, -oh*0.06, side*0.072, 'x'));
    }
  } else if (kind === 'slider'){
    for (const s of [-1, 1]){
      const pw = ow/2 + 0.02;
      glazedFrame(g, MAT.black, pw, oh - 0.02, 0.035, s*ow/4, s*0.03, pw - 0.08, oh - 0.1);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(pw - 0.08, oh - 0.1), MAT.pane);
      pane.position.set(s*ow/4, 0, s*0.03); g.add(pane);
      g.add(box(MAT.black, 0.05, oh - 0.02, 0.05, s*ow/4 + s*(pw/2 - 0.025), 0, s*0.03));
    }
    g.add(tube(MAT.black, 0.012, 0.28, -0.05, 0, 0.06, 'y'));
  } else {
    const leaves = ow > 1.3 ? 2 : 1, lw = ow/leaves - 0.01;
    for (let i=0;i<leaves;i++){
      const x = -ow/2 + ow/leaves*(i + 0.5);
      glazedFrame(g, MAT.charcoal, lw, oh - 0.02, 0.045, x, 0, lw - 0.24, oh - 0.5, 0.05);
      // A tall lite in each leaf, a hand's width in from the edges.
      const lite = new THREE.Mesh(new THREE.PlaneGeometry(lw - 0.24, oh - 0.5), MAT.glassy);
      lite.position.set(x, 0.05, 0); g.add(lite);
      const hs = leaves === 2 ? (i === 0 ? 1 : -1) : -1;
      for (const side of [-1, 1])
        g.add(tube(MAT.black, 0.011, 0.3, x + hs*(lw/2 - 0.08), -0.05, side*0.045, 'y'));
    }
  }
  host.add(g);
}

// A door left standing open. RoomPlan reports the hole, not the leaf or which
// way it swings, so all four ways are tried and the first that lands on clear
// floor wins. If none does — a doorway too tight to swing into — there is no
// leaf, which is better than one buried in a wall. A door to outside — one
// side of it off the floor — is closed instead, see above.
export function doorLeaf(host, L, w, o, blockers, sliders = new Set(), closed = new Set()){
  const ow = o.x1 - o.x0, oh = o.y1 - o.y0;
  if (ow < 0.6 || oh < 1.4) return;
  if(o.style === 'closet-slider'){
    closedLeaves(host,w,o,'closet-slider');
    return;
  }
  const mid = (o.x0 + o.x1)/2;
  {
    const nx = Math.sin(w.yaw), nz = Math.cos(w.yaw);
    const cx = w.c[0] + Math.cos(w.yaw)*mid, cz = w.c[2] - Math.sin(w.yaw)*mid;
    const inside = onFloor(L, cx + nx*0.4, cz + nz*0.4) && onFloor(L, cx - nx*0.4, cz - nz*0.4);
    const key = w.c[0].toFixed(2) + ',' + w.c[2].toFixed(2);
    if (!inside){
      closedLeaves(host, w, o, ow > 2.4 ? 'garage' : sliders.has(key) ? 'slider' : 'door');
      return;
    }
    if (closed.has(key)){ closedLeaves(host, w, o, 'slab'); return; }
  }
  if (ow > 1.25) return;
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
    // A flush slab door — no rails, no panels — with a matte black lever on
    // a slim rose, hinged on the pivot edge.
    leaf.add(box(MAT.slab, ow - 0.02, oh - 0.03, 0.04, 0, 0, 0));
    const width = ow - 0.024, height = oh - 0.034;
    const handleX = -hs*(ow/2 - 0.075), handleY = -oh*0.06;
    for (const side of [-1, 1]){
      leaf.add(box(MAT.black, 0.05, 0.05, 0.008, handleX, handleY, side*0.024));
      leaf.add(tube(MAT.black, 0.008, 0.05, handleX, handleY, side*0.05, 'z'));
      leaf.add(tube(MAT.black, 0.008, 0.12, handleX+hs*0.055, handleY, side*0.072, 'x'));
    }
    for (const y of [-height*0.36, 0, height*0.36])
      leaf.add(tube(MAT.black, 0.01, 0.075, hs*width/2, y, 0));
    host.add(leaf);
    return;
  }
}
export const FIXTURES = new Set(['toilet','sink','bathtub','oven','stove','refrigerator',
  'dishwasher','washerDryer','television','fireplace']);

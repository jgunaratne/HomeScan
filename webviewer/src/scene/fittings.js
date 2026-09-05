import { MAT } from './materials.js';

// RoomPlan reports a fitting as a category, a size and a transform: a sofa is a
// 1.94 x 1.05 x 0.85 box that knows it is a sofa. That is exactly the input a
// parametric maker wants, so rather than draw the box, each category is built
// out of it — a sofa as base, back, arms and cushions; a run of storage as
// carcass, door fronts, toe kick and worktop. Nothing here is measured; the
// proportions are the ordinary ones, hung on dimensions that are real.
//
// The survey keeps the boxes. A block is the honest drawing of a bounding box,
// and this is not that.
export function box(mat, w, h, d, x, y, z){
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(w, 0.006), Math.max(h, 0.006), Math.max(d, 0.006)), mat);
  m.position.set(x, y, z);
  return m;
}
export function tube(mat, r, len, x, y, z, axis){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
  m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI/2;
  if (axis === 'z') m.rotation.x = Math.PI/2;
  return m;
}

// Which way a fitting faces: away from whatever wall it is standing against.
// RoomPlan's own axis does not say, and a fridge with its doors to the wall is
// worse than a box.
export function facing(L, o){
  let bd = 1e9, best = null;
  for (const b of L.blockers){
    const d = Math.hypot(b.x - o.c[0], b.z - o.c[2]);
    if (d < bd){ bd = d; best = b; }
  }
  if (!best || bd > 2.6) return 1;
  const dx = o.c[0] - best.x, dz = o.c[2] - best.z;
  return (dx*Math.sin(o.yaw) + dz*Math.cos(o.yaw)) >= 0 ? 1 : -1;
}

// Door and drawer fronts across a carcass, with a reveal between them and a
// handle on each. This is what makes a run of kitchen units read as kitchen.
export function fronts(g, mat, w, h, d, y, f, handles){
  const n = Math.max(1, Math.round(w/0.52));
  const gap = 0.009, fw = (w - gap*(n + 1))/n;
  for (let i=0;i<n;i++){
    const x = -w/2 + gap*(i + 1) + fw*(i + 0.5);
    g.add(box(mat, fw, h - gap*2, 0.019, x, y, f*(d/2 + 0.008)));
    if (handles)
      g.add(tube(MAT.steel, 0.008, Math.min(fw*0.5, 0.14),
                 x, y + h*0.5 - 0.055, f*(d/2 + 0.03), 'x'));
  }
}

export const FITTING = {
  sofa(g, w, h, d){
    const y0 = -h/2, at = (a, b) => y0 + h*(a + b)/2, hi = (a, b) => h*(b - a);
    const arm = Math.min(0.17, w*0.13), bk = Math.min(0.19, d*0.24);
    g.add(box(MAT.fabric, w, hi(0.16, 0.50), d, 0, at(0.16, 0.50), 0));
    g.add(box(MAT.fabric, w - arm*2, hi(0.50, 0.64), d - bk, 0, at(0.50, 0.64), bk/2));
    g.add(box(MAT.fabric, w, hi(0.16, 1.0), bk, 0, at(0.16, 1.0), -(d - bk)/2));
    for (const s of [-1, 1])
      g.add(box(MAT.fabric, arm, hi(0.16, 0.78), d, s*(w - arm)/2, at(0.16, 0.78), 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(MAT.wood, 0.05, h*0.16, 0.05, sx*(w/2 - 0.08), y0 + h*0.08, sz*(d/2 - 0.08)));
  },
  bed(g, w, h, d, f){
    const y0 = -h/2, at = (a, b) => y0 + h*(a + b)/2, hi = (a, b) => h*(b - a);
    const head = -f;                       // the headboard goes against the wall
    g.add(box(MAT.wood, w, hi(0.10, 0.44), d, 0, at(0.10, 0.44), 0));
    g.add(box(MAT.white, w*0.98, hi(0.44, 0.78), d*0.98, 0, at(0.44, 0.78), 0));
    g.add(box(MAT.fabric, w*0.99, hi(0.76, 0.86), d*0.66, 0, at(0.76, 0.86), -head*d*0.16));
    for (const s of [-1, 1])
      g.add(box(MAT.white, w*0.42, hi(0.78, 0.90), d*0.17,
                s*w*0.24, at(0.78, 0.90), head*(d/2 - d*0.11)));
    g.add(box(MAT.wood, w, h*0.95, 0.055, 0, y0 + h*0.62, head*(d/2 + 0.03)));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(MAT.wood, 0.06, h*0.10, 0.06, sx*(w/2 - 0.08), y0 + h*0.05, sz*(d/2 - 0.08)));
  },
  table(g, w, h, d){
    const y0 = -h/2, t = Math.min(0.05, h*0.14), leg = Math.min(0.07, w*0.12);
    g.add(box(MAT.wood, w, t, d, 0, y0 + h - t/2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(MAT.wood, leg, h - t, leg,
                sx*(w/2 - leg*0.8), y0 + (h - t)/2, sz*(d/2 - leg*0.8)));
  },
  chair(g, w, h, d, f){
    const y0 = -h/2, at = (a, b) => y0 + h*(a + b)/2, hi = (a, b) => h*(b - a);
    g.add(box(MAT.wood, w, 0.045, d, 0, y0 + h*0.47, 0));
    g.add(box(MAT.wood, w*0.92, hi(0.49, 1.0), 0.042, 0, at(0.49, 1.0), -f*(d/2 - 0.03)));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(MAT.wood, 0.038, h*0.47, 0.038,
                sx*(w/2 - 0.045), y0 + h*0.235, sz*(d/2 - 0.045)));
  },
  storage(g, w, h, d, f, base){
    const y0 = -h/2;
    if (h > 1.5){                                        // wardrobe or tall unit
      g.add(box(MAT.white, w, h - 0.09, d - 0.03, 0, y0 + 0.09 + (h - 0.09)/2, 0));
      g.add(box(MAT.trim, w, 0.09, d - 0.12, 0, y0 + 0.045, -f*0.045));
      fronts(g, MAT.white, w, h - 0.13, d - 0.03, y0 + 0.09 + (h - 0.09)/2, f, true);
    } else if (base > 1.05){                             // hung on the wall
      g.add(box(MAT.white, w, h, d - 0.02, 0, 0, 0));
      fronts(g, MAT.white, w, h - 0.02, d - 0.02, 0, f, true);
    } else {                                             // base unit, with a top
      const toe = Math.min(0.11, h*0.14), top = 0.038;
      const carc = h - toe - top;
      g.add(box(MAT.trim, w, toe, d - 0.09, 0, y0 + toe/2, -f*0.045));
      g.add(box(MAT.white, w, carc, d, 0, y0 + toe + carc/2, 0));
      fronts(g, MAT.white, w, carc - 0.012, d, y0 + toe + carc/2, f, true);
      g.add(box(MAT.stone, w + 0.02, top, d + 0.026, 0, y0 + h - top/2, f*0.013));
    }
  },
  refrigerator(g, w, h, d, f){
    const y0 = -h/2;
    g.add(box(MAT.steel, w, h, d, 0, 0, 0));
    const split = y0 + h*0.62;
    for (const [a, b] of [[0.02, 0.60], [0.64, 0.98]]){
      g.add(box(MAT.steel, w - 0.02, h*(b - a), 0.026, 0, y0 + h*(a + b)/2, f*(d/2 + 0.012)));
    }
    for (const yy of [y0 + h*0.52, y0 + h*0.72])
      g.add(tube(MAT.steel, 0.011, h*0.2, w*0.32, yy, f*(d/2 + 0.045), 'y'));
  },
  oven(g, w, h, d, f){
    const y0 = -h/2;
    g.add(box(MAT.steel, w, h, d, 0, 0, 0));
    g.add(box(MAT.screen, w*0.82, h*0.52, 0.02, 0, y0 + h*0.44, f*(d/2 + 0.016)));
    g.add(tube(MAT.steel, 0.012, w*0.86, 0, y0 + h*0.76, f*(d/2 + 0.05), 'x'));
    g.add(box(MAT.steel, w, h*0.14, 0.02, 0, y0 + h*0.92, f*(d/2 + 0.012)));
  },
  stove(g, w, h, d){
    g.add(box(MAT.screen, w, h, d, 0, 0, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(tube(MAT.trim, Math.min(w, d)*0.16, 0.006,
                 sx*w*0.24, h/2 + 0.004, sz*d*0.22, 'y'));
  },
  sink(g, w, h, d, f){
    const y0 = -h/2;
    g.add(box(MAT.white, w, h, d, 0, 0, 0));
    g.add(box(MAT.steel, w*0.78, h*0.55, d*0.7, 0, y0 + h*0.3, 0));
    g.add(tube(MAT.steel, 0.016, 0.24, 0, y0 + h + 0.12, -f*(d/2 - 0.05), 'y'));
    g.add(tube(MAT.steel, 0.014, d*0.5, 0, y0 + h + 0.23, -f*(d/2 - 0.05 - d*0.25), 'z'));
  },
  toilet(g, w, h, d, f){
    const y0 = -h/2, at = (a, b) => y0 + h*(a + b)/2, hi = (a, b) => h*(b - a);
    g.add(box(MAT.white, w*0.66, hi(0, 0.52), d*0.72, 0, at(0, 0.52), f*d*0.1));
    g.add(box(MAT.white, w*0.84, hi(0.52, 0.62), d*0.78, 0, at(0.52, 0.62), f*d*0.09));
    g.add(box(MAT.white, w, hi(0.52, 1.0), d*0.26, 0, at(0.52, 1.0), -f*(d/2 - d*0.13)));
  },
  washerDryer(g, w, h, d, f){
    const y0 = -h/2;
    const n = w > 1.0 ? 2 : 1, ww = w/n;
    for (let i=0;i<n;i++){
      const x = -w/2 + ww*(i + 0.5);
      g.add(box(MAT.white, ww - 0.012, h, d, x, 0, 0));
      const port = new THREE.Mesh(new THREE.CircleGeometry(Math.min(ww, h)*0.29, 22), MAT.screen);
      port.position.set(x, y0 + h*0.46, f*(d/2 + 0.011));
      port.rotation.y = f > 0 ? 0 : Math.PI;
      g.add(port);
      g.add(box(MAT.trim, ww - 0.06, h*0.11, 0.016, x, y0 + h*0.9, f*(d/2 + 0.009)));
    }
  },
  television(g, w, h, d, f){
    const y0 = -h/2;
    g.add(box(MAT.screen, w, h*0.94, Math.max(d, 0.035), 0, y0 + h*0.53, 0));
    g.add(box(MAT.screen, w*0.3, h*0.06, Math.max(d, 0.035)*2.4, 0, y0 + h*0.03, 0));
  },
};

// One fitting, built out. Returns null for anything with no maker, which keeps
// its box.
export function fitting(L, o){
  const make = FITTING[o.cat];
  if (!make) return null;
  const g = new THREE.Group();
  const f = facing(L, o);
  make(g, o.d[0], o.d[1], o.d[2], f, o.c[1] - o.d[1]/2 - L.elevation);
  if (!g.children.length) return null;
  g.position.set(o.c[0], o.c[1], o.c[2]);
  g.rotation.y = o.yaw;
  return g;
}

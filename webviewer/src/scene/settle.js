// Where a piece of furniture actually fits. RoomPlan's box for a piece that
// stands against a wall usually reaches into the wall — the scanner sees the
// front and guesses the back — and a product drawn on that box inherits the
// overlap, or makes it worse where the product is wider than the box. So every
// built piece is settled before it is placed: its footprint is sampled at the
// corners, the edge midpoints and the centre, and if any sample is off the
// floor or inside a wall the piece is walked forward and sideways, in 2 cm
// steps up to 60 cm, to the nearest placement where none is. Forward is
// tried first at every distance, because a piece backed into a wall wants to
// come out of it, not slide along it.
//
// `fits(x, z)` says whether a point is on the floor and clear of the walls;
// it is passed in so this stays plain geometry. Returns the placement, or null
// when nothing within reach clears, in which case the caller decides — try
// the smaller box the scan gave, or leave the scan's word as it stands.
const REACH = 0.6, STEP = 0.02, INSET = 0.005;

function samples(w, d){
  const hx = w/2 - INSET, hz = d/2 - INSET;
  return [[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz],[0,-hz],[0,hz],[-hx,0],[hx,0],[0,0]];
}

// Whether the segment a-b passes through the oriented box `b`, grown by `r`:
// the slab test in the box's own frame. A footprint's edge crossing a wall
// is what a point test misses — a point on the far side of a wall is on the
// floor and clear of the wall, and the wall is through the piece.
export function crossesBox(ax, az, bx, bz, box, r){
  const c = Math.cos(box.yaw), s = Math.sin(box.yaw);
  const dx = ax - box.x, dz = az - box.z, ex = bx - box.x, ez = bz - box.z;
  const o = [dx*c - dz*s, dx*s + dz*c], e = [ex*c - ez*s, ex*s + ez*c];
  const half = [box.hx + r, box.hz + r];
  let enter = 0, leave = 1;
  for (let i=0;i<2;i++){
    const delta = e[i] - o[i];
    if (Math.abs(delta) < 1e-9){ if (Math.abs(o[i]) > half[i]) return false; continue; }
    let t0 = (-half[i] - o[i])/delta, t1 = (half[i] - o[i])/delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0); leave = Math.min(leave, t1);
  }
  return enter < leave;
}

export function settle(fits, x, z, yaw, w, d, f = 1, crossing = null){
  const cs = Math.cos(yaw), sn = Math.sin(yaw), pts = samples(w, d);
  const hx = w/2 - INSET, hz = d/2 - INSET, corners = [[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]];
  const failing = (cx, cz) => {
    const at = ([lx, lz]) => [cx + cs*lx + sn*lz, cz - sn*lx + cs*lz];
    let n = pts.reduce((n, p) => n + (fits(...at(p)) ? 0 : 1), 0);
    if (crossing) for (let i=0;i<4;i++){
      const [ax, az] = at(corners[i]), [bx, bz] = at(corners[(i + 1)%4]);
      if (crossing(ax, az, bx, bz)) n += 3;                 // an edge through a wall outweighs a corner near one
    }
    return n;
  };
  if (!failing(x, z)) return {x, z, moved:0};
  // The nearest placement that clears; failing that, the one that clears the
  // most of its samples, nearest first, since a piece the scan wedged between
  // two walls is better mostly out of one than left in both. `partial` says
  // which it was.
  let best = null, least = null;
  for (let dz = 0; dz <= REACH + 1e-9; dz += STEP){
    for (let i = 0; i*STEP <= REACH + 1e-9; i++){
      for (const dx of i ? [i*STEP, -i*STEP] : [0]){
        const moved = Math.hypot(dx, dz);
        if (best && moved >= best.moved) continue;
        const cx = x + cs*dx + sn*f*dz, cz = z - sn*dx + cs*f*dz;
        const bad = failing(cx, cz);
        if (!bad) best = {x:cx, z:cz, moved};
        else if (!least || bad < least.bad || (bad === least.bad && moved < least.moved)) least = {x:cx, z:cz, moved, bad, partial:true};
      }
    }
  }
  return best || least;
}

// Where the walls are, for `fits`: every wall's full run less its doors and
// cased openings, as boxes. A window stays solid — a sofa does not stand in
// one — and so does the low wall under a sill, which the body-height
// blockers leave out because you can lean over it. `L.walls` is the scan's
// own list; the yaw convention is the viewer's.
export function wallBoxes(walls, thickness = 0.11){
  const out = [];
  for (const w of walls){
    const half = w.w/2, c = Math.cos(w.yaw), s = -Math.sin(w.yaw);
    const gaps = (w.holes || []).filter(h => h.k !== 'window')
      .map(h => [Math.max(-half, h.x0), Math.min(half, h.x1)]).sort((a, b) => a[0] - b[0]);
    let at = -half;
    for (const [x0, x1] of gaps.concat([[half, half]])){
      if (x0 > at + 0.01){
        const mid = (at + x0)/2;
        out.push({x:w.c[0] + c*mid, z:w.c[2] + s*mid, yaw:w.yaw, hx:(x0 - at)/2, hz:thickness/2});
      }
      at = Math.max(at, x1);
    }
  }
  return out;
}

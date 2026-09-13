import { WALL_T } from '../core/constants.js';
import { MAT } from './materials.js';
import { box, cushion, tube, fronts } from './fittings.js';

// A kitchen laid out rather than scanned. RoomPlan reports the cabinets it saw
// as boxes, and the boxes say where the old kitchen was; `finishes.kitchen`
// says where the new one goes, as runs of units along named walls and an
// island placed outright. Everything is drawn against the scanned walls at
// standard cabinet dimensions, so the layout is testable against the room —
// a run that does not fit its wall is visible at once — and the pieces of
// the scanned kitchen it replaces are dropped from the dressed view.
//
//   "kitchen": {
//     "runs": [{"wallAt": [x, z], "start": m, "units": [["sink", 0.9], ...],
//               "uppers": true}],
//     "island": {"at": [x, z], "yaw": r, "length": 1.6, "width": 0.8}
//   }
//
// `start` is metres along the wall from its local -w/2 end, and may run past
// the record's own ends onto a collinear neighbour: the south wall of this
// kitchen is two records on one line. Which side of the wall the kitchen is
// on comes from the room's anchor, as it does for the fireplace.

const COUNTER = 0.9, TOE = 0.1, TOP = 0.02, BASE_D = 0.6, TALL_D = 0.65;
const UPPER_LO = 1.45, UPPER_D = 0.35, SPLASH = 0.012;

// The kitchen is two-tone: oak below the counter, white above, quartz across.
const lower = () => MAT.oak, upper = () => MAT.matte, top = () => MAT.quartz;

// A base carcass with its toe kick, and the fronts on it: drawers unless told
// otherwise. `w` along the wall, `d` out from it, `f`=+1 fronts toward +z.
function baseUnit(g, w, d, kind){
  const carc = COUNTER - TOE - TOP;
  g.add(box(MAT.dark, w, TOE, d - 0.06, 0, TOE/2, -0.03));
  g.add(box(lower(), w, carc, d, 0, TOE + carc/2, 0));
  if (kind === 'sink' || kind === 'corner'){
    // A false front over the bowl, doors under it; a blind corner is one door
    // on its open half and a filler panel over the rest.
    const doorW = kind === 'corner' ? Math.min(0.45, w*0.5) : w;
    const x = kind === 'corner' ? w/2 - doorW/2 : 0;
    if (kind === 'corner') g.add(box(lower(), w - doorW, carc - 0.012, 0.019, -doorW/2, TOE + carc/2, d/2 + 0.008));
    const sub = new THREE.Group(); sub.position.set(x, 0, 0); g.add(sub);
    fronts(sub, lower(), doorW, 0.18, d, TOE + carc - 0.09, 1, false, {n:1});
    fronts(sub, lower(), doorW, carc - 0.2, d, TOE + (carc - 0.19)/2, 1, true, {n: doorW > 0.5 ? 2 : 1});
  } else {
    // Three drawers — a shallow one over two deep — is the contemporary stack.
    const rows = [0.18, (carc - 0.18)/2, (carc - 0.18)/2];
    let y = TOE + carc;
    for (const h of rows){
      fronts(g, lower(), w, h, d, y - h/2, 1, true, {n:1, drawers:true});
      y -= h;
    }
  }
}

function counterTop(g, w, d, over = 0.025){
  g.add(box(top(), w, TOP, d + over, 0, COUNTER - TOP/2, over/2));
}

// A slide-in range at counter height: a stainless body, a black glass cooktop
// with four burners, an oven door with a full-width bar.
function range(g, w, d){
  g.add(box(MAT.inox, w, COUNTER - 0.02, d, 0, (COUNTER - 0.02)/2, 0));
  g.add(box(MAT.screen, w - 0.02, 0.015, d - 0.05, 0, COUNTER - 0.005, 0.01));
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    g.add(tube(MAT.dark, 0.075, 0.004, sx*w*0.25, COUNTER + 0.004, 0.02 + sz*d*0.2, 'y'));
  g.add(box(MAT.screen, w*0.86, 0.42, 0.02, 0, 0.42, d/2 + 0.012));
  g.add(tube(MAT.inox, 0.011, w*0.88, 0, 0.66, d/2 + 0.05, 'x'));
  g.add(box(MAT.inox, w, 0.08, 0.02, 0, COUNTER - 0.06, d/2 + 0.012));
  for (const x of [-0.3, -0.15, 0.15, 0.3])
    g.add(tube(MAT.dark, 0.016, 0.02, x*w, COUNTER - 0.06, d/2 + 0.03, 'z'));
}

// A wall hood over the range: a slim black canopy and a chimney to the ceiling.
function hood(g, w, ceiling){
  const y = 1.55;
  g.add(box(MAT.black, w, 0.05, 0.5, 0, y + 0.025, 0.05));
  g.add(box(MAT.black, 0.3, ceiling - y - 0.05, 0.3, 0, y + 0.05 + (ceiling - y - 0.05)/2, -0.1));
  g.add(box(MAT.lamp, w*0.6, 0.004, 0.06, 0, y - 0.002, 0.15));
}

// A counter-depth French-door refrigerator in stainless, with a cabinet over
// it up to the ceiling so the tall bank reads as one piece.
function fridge(g, w, d, ceiling){
  const h = 1.78;
  g.add(box(MAT.inox, w, h, d, 0, h/2, 0));
  for (const s of [-1, 1]) g.add(box(MAT.inox, w/2 - 0.012, h*0.62 - 0.02, 0.02, s*(w/4), h*0.69, d/2 + 0.01));
  g.add(box(MAT.inox, w - 0.02, h*0.36, 0.02, 0, h*0.19, d/2 + 0.01));
  for (const s of [-1, 1]) g.add(tube(MAT.black, 0.01, h*0.42, s*0.04, h*0.69, d/2 + 0.04, 'y'));
  g.add(tube(MAT.black, 0.01, w*0.5, 0, h*0.33, d/2 + 0.04, 'x'));
  const over = ceiling - 0.02 - h;
  g.add(box(upper(), w, over, d, 0, h + over/2, 0));
  fronts(g, upper(), w, over - 0.012, d, h + over/2, 1, true, {n:2});
}

// A full-height pantry, one slab door or two, to the ceiling.
function pantry(g, w, d, ceiling){
  const h = ceiling - 0.02;
  g.add(box(MAT.dark, w, TOE, d - 0.06, 0, TOE/2, -0.03));
  g.add(box(upper(), w, h - TOE, d, 0, TOE + (h - TOE)/2, 0));
  fronts(g, upper(), w, h - TOE - 0.012, d, TOE + (h - TOE)/2, 1, true, {n: w > 0.6 ? 2 : 1});
}

function dishwasher(g, w, d){
  g.add(box(MAT.dark, w, TOE, d - 0.06, 0, TOE/2, -0.03));
  g.add(box(MAT.inox, w, COUNTER - TOP - TOE, d, 0, TOE + (COUNTER - TOP - TOE)/2, 0));
  g.add(box(MAT.inox, w - 0.012, COUNTER - TOP - TOE - 0.012, 0.02, 0, TOE + (COUNTER - TOP - TOE)/2, d/2 + 0.01));
  g.add(box(MAT.black, w*0.8, 0.014, 0.014, 0, COUNTER - TOP - 0.03, d/2 + 0.03));
}

// The basin let into the sink unit's counter, and a tall black mixer behind it.
function basin(g, w, d){
  const bw = Math.min(0.72, w - 0.12), bd = 0.42, depth = 0.2;
  g.add(box(MAT.inox, bw, 0.004, bd, 0, COUNTER - depth, 0.02));
  for (const s of [-1, 1]){
    g.add(box(MAT.inox, 0.004, depth, bd, s*bw/2, COUNTER - depth/2, 0.02));
    g.add(box(MAT.inox, bw, depth, 0.004, 0, COUNTER - depth/2, 0.02 + s*bd/2));
  }
  g.add(tube(MAT.black, 0.014, 0.28, 0, COUNTER + 0.14, -d/2 + 0.05, 'y'));
  g.add(tube(MAT.black, 0.011, 0.2, 0, COUNTER + 0.27, -d/2 + 0.15, 'z'));
}

// The island: an oak block with a drawer stack on its working side, a flat
// panel on the other, and a quartz top that waterfalls down both ends.
function island(g, len, wid, ceiling, pendant){
  const carc = COUNTER - TOE - TOP;
  g.add(box(MAT.dark, len - 0.04, TOE, wid - 0.06, 0, TOE/2, 0));
  g.add(box(lower(), len - 0.04, carc, wid, 0, TOE + carc/2, 0));
  const n = Math.max(2, Math.round((len - 0.04)/0.6)), fw = (len - 0.04)/n;
  for (let i=0;i<n;i++){
    const sub = new THREE.Group(); sub.position.set(-(len - 0.04)/2 + fw*(i + 0.5), 0, 0); g.add(sub);
    let y = TOE + carc;
    for (const h of [0.18, (carc - 0.18)/2, (carc - 0.18)/2]){
      fronts(sub, lower(), fw, h, wid, y - h/2, -1, true, {n:1, drawers:true});
      y -= h;
    }
  }
  g.add(box(lower(), len - 0.04, carc, 0.019, 0, TOE + carc/2, wid/2 + 0.008));
  g.add(box(top(), len, TOP, wid + 0.05, 0, COUNTER - TOP/2, 0));
  for (const s of [-1, 1]) g.add(box(top(), TOP, COUNTER, wid + 0.05, s*(len - TOP)/2, COUNTER/2, 0));
  if (pendant){
    // One linear pendant, matte black, on two rods from the ceiling.
    const y = 1.85, pl = Math.min(1.1, len*0.7);
    g.add(box(MAT.black, pl, 0.05, 0.07, 0, y, 0));
    g.add(box(MAT.lamp, pl - 0.04, 0.004, 0.03, 0, y - 0.027, 0));
    for (const s of [-1, 1]) g.add(tube(MAT.black, 0.004, ceiling - y - 0.05, s*pl*0.35, y + (ceiling - y)/2, 0));
    g.add(tube(MAT.black, 0.06, 0.02, 0, ceiling - 0.01, 0));
  }
}

// A breakfast bar: a quartz top at bar height on white panel ends, open
// underneath, with a counter stool tucked in for every 55 cm of it — leather
// seat on a black frame with a footrest ring.
const BAR_H = 1.0, BAR_D = 0.5;
function bar(g, w){
  g.add(box(MAT.quartz, w + 0.02, 0.03, BAR_D + 0.02, 0, BAR_H - 0.015, 0.01));
  for (const s of [-1, 1]) g.add(box(MAT.matte, 0.05, BAR_H - 0.03, BAR_D - 0.02, s*(w/2 - 0.025), (BAR_H - 0.03)/2, 0));
  g.add(box(MAT.matte, w - 0.1, BAR_H - 0.03, 0.02, 0, (BAR_H - 0.03)/2, -BAR_D/2 + 0.01));
  // West Elm's Slope counter stool, to go with the Slope chairs at the
  // table: an oatmeal upholstered seat with a low curved back, on splayed oak
  // legs with an oak footrest.
  const n = Math.max(1, Math.round(w/0.55)), pitch = w/n;
  for (let i=0;i<n;i++){
    const x = -w/2 + pitch*(i + 0.5), z = BAR_D/2 + 0.06, seat = 0.7;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      const leg = tube(MAT.oak, 0.014, seat - 0.05, x + sx*0.16, (seat - 0.05)/2, z + sz*0.16);
      leg.rotation.z = -sx*0.07; leg.rotation.x = sz*0.07; g.add(leg);
    }
    for (const sz of [-1, 1]) g.add(tube(MAT.oak, 0.012, 0.32, x, 0.26, z + sz*0.16, 'x'));
    g.add(cushion(MAT.oatmeal, 0.42, 0.07, 0.4, x, seat - 0.035, z));
    const back = cushion(MAT.oatmeal, 0.42, 0.22, 0.05, x, seat + 0.1, z + 0.17);
    back.rotation.x = 0.12; g.add(back);
  }
}

const UNIT = {
  base:      (g, w) => { baseUnit(g, w, BASE_D, 'base');   counterTop(g, w, BASE_D); },
  corner:    (g, w) => { baseUnit(g, w, BASE_D, 'corner'); counterTop(g, w, BASE_D); },
  sink:      (g, w) => { baseUnit(g, w, BASE_D, 'sink');   counterTop(g, w, BASE_D); basin(g, w, BASE_D); },
  dishwasher:(g, w) => { dishwasher(g, w, BASE_D); counterTop(g, w, BASE_D); },
  range:     (g, w) => range(g, w, BASE_D),
  fridge:    (g, w, c) => fridge(g, w, TALL_D, c),
  pantry:    (g, w, c) => pantry(g, w, TALL_D, c),
  bar:       (g, w) => bar(g, w),
};
const TALL = new Set(['fridge', 'pantry']);
const depthOf = kind => TALL.has(kind) ? TALL_D : kind === 'bar' ? BAR_D : BASE_D;

// Lay one kitchen out for a room, into `host`. Returns what the rest of the
// viewer needs to know about it: where the body cannot walk, what stops
// daylight, and what to draw on the plan.
export function buildKitchen(L, room, host){
  const spec = room.finishes?.kitchen;
  if (!spec) return null;
  const out = {blockers:[], daylight:[], plan:[], group:new THREE.Group()};
  out.group.name = 'Kitchen, as proposed';
  host.add(out.group);
  const ceiling = L.ceiling;

  const claim = (w, h, d, x, z, yaw, tall) => {
    out.blockers.push({x, z, yaw, hx:w/2, hz:d/2});
    out.plan.push({c:[x, L.elevation + h/2, z], d:[w, h, d], yaw});
    if (tall) out.daylight.push({cat:'storage', c:[x, L.elevation + h/2, z], d:[w, h, d], yaw});
  };

  for (const run of spec.runs || []){
    const w = L.walls.find(w => Math.hypot(w.c[0] - run.wallAt[0], w.c[2] - run.wallAt[1]) < 0.1);
    if (!w) continue;
    const dir = [Math.cos(w.yaw), -Math.sin(w.yaw)], n = [Math.sin(w.yaw), Math.cos(w.yaw)];
    const side = (room.at[0] - w.c[0])*n[0] + (room.at[1] - w.c[2])*n[1] >= 0 ? 1 : -1;
    const yaw = w.yaw + (side < 0 ? Math.PI : 0);
    // Every window on this wall, in the wall's own metres, so the uppers and
    // the splashback can stop for them.
    const windows = w.holes.filter(h => h.k === 'window').map(h => ({x0:h.x0, x1:h.x1, y0:w.c[1] + h.y0 - L.elevation}));
    const place = (g, along, width, depth, y = 0) => {
      const off = WALL_T/2 + depth/2;
      g.position.set(w.c[0] + dir[0]*along + n[0]*side*off, L.elevation + y, w.c[2] + dir[1]*along + n[1]*side*off);
      g.rotation.y = yaw;
      out.group.add(g);
    };
    let at = (run.start ?? -w.w/2), baseFrom = null, baseTo = null, rangeAt = null, counters = false;
    for (const [kind, width] of run.units){
      const make = UNIT[kind];
      if (!make){ at += width; continue; }
      const g = new THREE.Group();
      make(g, width, ceiling);
      const depth = depthOf(kind), mid = at + width/2;
      place(g, mid, width, depth);
      const h = TALL.has(kind) ? ceiling - 0.02 : kind === 'bar' ? BAR_H : COUNTER;
      claim(width, h, depth, g.position.x, g.position.z, yaw, TALL.has(kind));
      if (!TALL.has(kind)){ baseFrom = baseFrom ?? at; baseTo = at + width; if (kind !== 'bar') counters = true; }
      if (kind === 'range') rangeAt = mid;
      at += width;
    }
    if (baseFrom === null || !counters) continue;             // a bar alone wants no splashback or uppers
    // A quartz splashback between counter and uppers along every base unit,
    // dropping to the sill where a window sits in it.
    const splash = (x0, x1, y0, y1) => {
      if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return;
      const g = new THREE.Group();
      g.add(box(top(), x1 - x0, y1 - y0, SPLASH, 0, (y0 + y1)/2, 0));
      place(g, (x0 + x1)/2, x1 - x0, SPLASH);
    };
    const spans = cutOut([[baseFrom, baseTo]], windows.map(win => [win.x0 - 0.02, win.x1 + 0.02]));
    for (const [x0, x1] of spans) splash(x0, x1, COUNTER, UPPER_LO);
    for (const win of windows) if (win.x1 > baseFrom && win.x0 < baseTo)
      splash(Math.max(baseFrom, win.x0 - 0.02), Math.min(baseTo, win.x1 + 0.02), COUNTER, Math.min(UPPER_LO, win.y0 - 0.01));
    if (!run.uppers) continue;
    // Uppers to the ceiling over the base run, stopping for windows and for
    // the hood over the range.
    const holes = windows.map(win => [win.x0 - 0.05, win.x1 + 0.05]);
    if (rangeAt !== null) holes.push([rangeAt - 0.45, rangeAt + 0.45]);
    for (const [x0, x1] of cutOut([[baseFrom, baseTo]], holes)){
      if (x1 - x0 < 0.25) continue;
      const g = new THREE.Group(), h = ceiling - 0.02 - UPPER_LO;
      g.add(box(upper(), x1 - x0, h, UPPER_D, 0, h/2, 0));
      fronts(g, upper(), x1 - x0, h - 0.012, UPPER_D, h/2, 1, true);
      place(g, (x0 + x1)/2, x1 - x0, UPPER_D, UPPER_LO);
    }
    if (rangeAt !== null){
      const g = new THREE.Group();
      hood(g, 0.9, ceiling);
      place(g, rangeAt, 0.9, 0.5);
    }
  }

  if (spec.island){
    const s = spec.island, g = new THREE.Group();
    island(g, s.length, s.width, ceiling, s.pendant !== false);
    g.position.set(s.at[0], L.elevation, s.at[1]); g.rotation.y = s.yaw;
    out.group.add(g);
    claim(s.length, COUNTER, s.width, s.at[0], s.at[1], s.yaw, false);
  }
  return out;
}

// Intervals minus intervals, on a line.
function cutOut(spans, holes){
  for (const [h0, h1] of holes){
    const next = [];
    for (const [a, b] of spans){
      if (h1 <= a || h0 >= b){ next.push([a, b]); continue; }
      if (h0 > a) next.push([a, h0]);
      if (h1 < b) next.push([h1, b]);
    }
    spans = next;
  }
  return spans;
}

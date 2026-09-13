import { HOUSE, PHOTOS, ROOMS } from '../core/data.js';
import { WALL_T, BAND_LO, BAND_HI } from '../core/constants.js';
import { panels, boxEdges, shapeFrom } from '../core/geometry.js';
import { scene } from './stage.js';
import { MAT, REAL } from './materials.js';
import { casing, doorLeaf, FIXTURES } from './joinery.js';
import { fitting } from './fittings.js';

// Exterior doors photos.json calls sliders, by the centre of their wall: a
// `"sliders": [[x, z], ...]` under a room's finishes. Every other door to
// outside is a hinged leaf, or a pair.
const SLIDERS = new Set();
for (const r of [...(PHOTOS || []), ...(ROOMS || [])])
  for (const [x, z] of r.finishes?.sliders || []) SLIDERS.add(x.toFixed(2) + ',' + z.toFixed(2));

export const levels = HOUSE.levels.map(L => build(L));

export function build(L){
  const tint = L.tint ?? 0xC9D0D8;
  const group = new THREE.Group();
  const shell = new THREE.Group(), ceil = new THREE.Group();
  group.add(shell); group.add(ceil);

  // The flat survey slabs. Once the photographs are in, per-room pieces take
  // their place — these stay for the storey's untextured reading.
  const slabs = [], caps = [];
  for (const f of L.floors){
    const g = shapeFrom(f.poly);
    const slab = new THREE.Mesh(g, MAT.floor);
    slab.position.y = L.elevation + 0.005;
    shell.add(slab); slabs.push(slab);
    const cap = new THREE.Mesh(g.clone(), MAT.ceil);
    cap.position.y = L.elevation + f.ceiling;
    ceil.add(cap); caps.push(cap);
  }

  const edges = [], objEdges = [], blockers = [], objBlockers = [], plan = [];
  const wallMeshes = [], objMeshes = [], holeWalls = [];
  // Joinery and downlights: architecture, but the sketch-grade survey never had
  // them, so they come and go with the photographic dressing.
  const trim = new THREE.Group(); group.add(trim);
  const furn = new THREE.Group(); group.add(furn);
  const stairMat = new THREE.MeshLambertMaterial({color:tint, transparent:true, opacity:0.5});
  const panes = [];

  for (const w of L.walls){
    const mat = w.conf === 'low' ? MAT.wallLow : MAT.wall;
    for (const p of panels(w.w, w.h, w.holes)){
      // Ceilings sit at the storey's median wall height, so a wall shorter than
      // that used to leave a slot open at the top. Harmless against a black
      // background; a bright line of sky once there is a sky. Any panel that
      // reaches its wall's top grows to meet the ceiling.
      let top = p.y1;
      if (Math.abs(p.y1 - w.h/2) < 0.002)
        top = Math.max(p.y1, L.elevation + L.ceiling - w.c[1]);
      const pw = p.x1-p.x0, ph = top-p.y0;
      const cx = w.c[0] + Math.cos(w.yaw)*(p.x0+p.x1)/2;
      const cz = w.c[2] - Math.sin(w.yaw)*(p.x0+p.x1)/2;
      const cy = w.c[1] + (p.y0+top)/2;
      // Segmented so the baked light can vary across a wall rather than only
      // between its corners. The uv scaling below covers every face, so the
      // 11 cm end grain is stretched — nobody has ever looked at it.
      const m = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, WALL_T,
        Math.max(1, Math.round(pw/0.7)), Math.max(1, Math.round(ph/0.7)), 1), mat);
      m.position.set(cx, cy, cz); m.rotation.y = w.yaw;
      shell.add(m);
      wallMeshes.push({mesh:m, x:cx, z:cz, yaw:w.yaw, w:pw, h:ph, flat:mat, low:w.conf === 'low'});
      boxEdges(edges, cx, cy, cz, pw/2, ph/2, WALL_T/2, w.yaw);

      // A skirting on every stretch that reaches the floor — which, because
      // panels() has already cut the openings out, is exactly the right ones.
      if (cy - ph/2 - L.elevation < 0.03 && ph > 0.4){
        const bh = 0.07;                   // a flat 70 mm skirting, square-edged
        const b = new THREE.Mesh(new THREE.BoxGeometry(pw, bh, WALL_T + 0.024), MAT.trim);
        b.position.set(cx, L.elevation + bh/2 + 0.008, cz); b.rotation.y = w.yaw;
        trim.add(b);
      }

      // Blocks the body only if it stands in the way at body height — which is
      // why you walk through doorways but a window stops you.
      const lo = cy - ph/2 - L.elevation, hi = cy + ph/2 - L.elevation;
      if (hi > BAND_LO && lo < BAND_HI){
        const b = {x:cx, z:cz, yaw:w.yaw, hx:pw/2, hz:WALL_T/2};
        blockers.push(b); plan.push(b);
      }
    }
    // Closed closet panels must also stop the player and read closed in plan.
    for(const o of w.holes.filter(o=>o.style==='closet-slider')){
      const mid=(o.x0+o.x1)/2;
      const b={x:w.c[0]+Math.cos(w.yaw)*mid,z:w.c[2]-Math.sin(w.yaw)*mid,
        yaw:w.yaw,hx:(o.x1-o.x0)/2,hz:WALL_T/2};
      blockers.push(b);plan.push(b);
    }
    holeWalls.push(w);
  }

  // Openings are trimmed after every wall is up: a door leaf has to know what
  // it would swing into, and that is not known until the last panel exists.
  for (const w of holeWalls){
    for (const o of w.holes){
      // An opening cut to the ceiling is a recess, not a doorway: no head to
      // case, and jambs would only draw a frame around a room.
      if (o.y1 < w.h/2 - 0.01) casing(trim, w, o, L.elevation, 0.045, o.k === 'window');
      if (o.k === 'door') doorLeaf(trim, L, w, o, blockers, SLIDERS);
      if (o.k !== 'window') continue;
      const cx = w.c[0] + Math.cos(w.yaw)*(o.x0+o.x1)/2;
      const cz = w.c[2] - Math.sin(w.yaw)*(o.x0+o.x1)/2;
      const g = new THREE.Mesh(new THREE.PlaneGeometry(o.x1-o.x0, o.y1-o.y0), MAT.glass);
      g.position.set(cx, w.c[1] + (o.y0+o.y1)/2, cz); g.rotation.y = w.yaw;
      shell.add(g);
      panes.push(g);
    }
  }

  for (const o of L.objects){
    const isStair = o.cat === 'stairs';
    const m = new THREE.Mesh(new THREE.BoxGeometry(o.d[0], o.d[1], o.d[2]),
      isStair ? stairMat : (FIXTURES.has(o.cat) ? MAT.fix : MAT.furn));
    m.position.set(o.c[0], o.c[1], o.c[2]); m.rotation.y = o.yaw;
    // The stairs are the route between storeys, not a furnishing — they stay put.
    (isStair ? shell : furn).add(m);
    // Preserve the original box for survey mode. Photo dressing can replace
    // it with a flight when an explicit ascent annotation is available.
    const rec = {mesh:m, category:o.cat, src:o, flat:m.material,
                 real: isStair ? MAT.wood : (MAT[REAL[o.cat]] || m.material), built:null};
    if (!isStair){
      const g = fitting({blockers, elevation:L.elevation}, o);
      if (g){ g.visible = false; furn.add(g); rec.built = g; }
    }
    objMeshes.push(rec);
    boxEdges(isStair ? edges : objEdges,
      o.c[0], o.c[1], o.c[2], o.d[0]/2, o.d[1]/2, o.d[2]/2, o.yaw);
    const base = o.c[1] - o.d[1]/2 - L.elevation;
    if (!isStair && o.d[1] > 0.45 && base < BAND_HI - 0.2)
      objBlockers.push({x:o.c[0], z:o.c[2], yaw:o.yaw, hx:o.d[0]/2, hz:o.d[2]/2, src:o});
  }

  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position',
      new THREE.Float32BufferAttribute(edges, 3)),
    new THREE.LineBasicMaterial({color:0x1A2029, transparent:true, opacity:0.55}));
  shell.add(lines);
  const objLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position',
      new THREE.Float32BufferAttribute(objEdges, 3)),
    new THREE.LineBasicMaterial({color:0x1A2029, transparent:true, opacity:0.55}));
  furn.add(objLines);

  scene.add(group);

  const bx = L.floors.flatMap(f => f.poly).reduce((a,[x,z]) => ({
    x0:Math.min(a.x0,x), x1:Math.max(a.x1,x), z0:Math.min(a.z0,z), z1:Math.max(a.z1,z)
  }), {x0:1e9,x1:-1e9,z0:1e9,z1:-1e9});

  const seed = L.sections.find(s => s.label !== 'unidentified') || L.sections[0]
    || {x:(bx.x0+bx.x1)/2, z:(bx.z0+bx.z1)/2};

  return {...L, tint, group, shell, ceil, furn, trim, slabs, caps, panes,
          wallMeshes, objMeshes, stairMat, wire:[lines, objLines],
          blockers, objBlockers, plan, bounds:bx, spawn:{x:seed.x, z:seed.z}};
}

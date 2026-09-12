import { dressRooflines } from './rooflines.js';
import { inStairCut, cutSlabQuad } from './architecture.js';
import { $ } from '../core/util.js';
import { WALL_T } from '../core/constants.js';
import { onFloor } from '../core/geometry.js';
import { flags } from '../core/state.js';
import { scene, setLightRig } from './stage.js';
import { MAT } from './materials.js';
import { levels } from './levels.js';
import { TILE, roomAt, assignFloor } from '../photo/rooms.js';
import { avgMats } from '../photo/relight.js';
import { outdoorWorld } from '../photo/outside.js';
import { facing, box, fitting } from './fittings.js';
import { settle, wallBoxes, crossesBox } from './settle.js';
import { blocks } from '../player/collision.js';
import { PRODUCTS, pickProduct, product } from './products.js';
import { buildKitchen } from './kitchen.js';
import { buildBath, vanity, dropped } from './bath.js';

// A wall has two faces and they can be in different rooms — the kitchen side of
// the bathroom wall is kitchen. BoxGeometry keeps a material group per face, so
// +Z and -Z take their own room's paint.
export function dressWalls(L){
  for (const p of L.wallMeshes){
    const nx = Math.sin(p.yaw), nz = Math.cos(p.yaw), off = WALL_T/2 + 0.3;
    const front = roomAt(L, p.x + nx*off, p.z + nz*off, true);
    const back  = roomAt(L, p.x - nx*off, p.z - nz*off, true);
    const side = m => (m && m.wall) || avgMats().wall;
    p.photo = [p.flat, p.flat, p.flat, p.flat, side(front?.mats), side(back?.mats)];
    // The repeat lives in the geometry, so every wall in a room shares a material.
    const uv = p.mesh.geometry.attributes.uv;
    for (let i=0;i<uv.count;i++)
      uv.setXY(i, uv.getX(i)*p.w/TILE.wall, uv.getY(i)*p.h/TILE.wall);
    uv.needsUpdate = true;
  }
}

// Floors and ceilings come as one slab per storey, so they are re-cut per room:
// walk a grid over the footprint, keep each cell's room, then merge each row's
// runs into quads. Boundaries land on the 10 cm grid, which is finer than the
// walls that sit on top of them.
export function dressSlabs(L){
  dressRooflines(L);
  const g = 0.1, b = L.bounds;
  const nx = Math.ceil((b.x1-b.x0)/g), nz = Math.ceil((b.z1-b.z0)/g);
  // false = off the storey's floor entirely; null = on it but in no room.
  const floor = new Array(nx*nz).fill(false);
  for (let j=0;j<nz;j++) for (let i=0;i<nx;i++)
    floor[j*nx+i] = onFloor(L, b.x0 + (i+0.5)*g, b.z0 + (j+0.5)*g);
  const filled = assignFloor(L, g, b, nx, nz, k => floor[k]);
  const own = filled.map((r, k) => floor[k] ? (r || null) : false);
  // The whole footprint has to be covered exactly once. Cells no room claims —
  // the garage, the far end of a hall — go in their own bucket and keep the flat
  // survey slab material, because the storey above is directly overhead and a
  // hole in the ceiling looks straight up into its floorboards.
  const BARE = {mats:avgMats(), bare:true};
  const runs = new Map();
  for (let j=0;j<nz;j++){
    for (let i=0;i<nx;){
      const cell = own[j*nx+i];
      if (cell === false){ i++; continue; }
      const r = cell && cell.mats ? cell : BARE;
      let e = i;
      while (e+1 < nx && own[j*nx+e+1] !== false &&
        (own[j*nx+e+1] && own[j*nx+e+1].mats ? own[j*nx+e+1] : BARE) === r) e++;
      if (!runs.has(r)) runs.set(r, []);
      runs.get(r).push([b.x0 + i*g, b.x0 + (e+1)*g, b.z0 + j*g, b.z0 + (j+1)*g]);
      i = e + 1;
    }
  }
  for (const [room, quads] of runs){
    for (const [kind, host, y, up] of [
      ['floor', L.roomFloor, L.elevation + 0.006, 1],
      ['ceil',  L.roomCeil,  L.elevation + L.ceiling, -1]]){
      const mat = room.mats[kind] || BARE.mats[kind];
      if (!mat) continue;
      const pos = [], uv = [], nor = [], T = TILE[kind];
      // Boards run along `finishes.boards`, a wall yaw: the house sits thirty
      // degrees off the scene's axes, and boards laid on those axes run
      // diagonally across every room. A ceiling has no direction to keep.
      const theta = kind === 'floor' ? (room.finishes?.boards ?? 0) : 0;
      const ct = Math.cos(theta), st = Math.sin(theta);
      for (const [x0,x1,z0,z1] of quads){
        // Short quads keep the baked daylight interpolation smooth across
        // adjacent scan rows, especially on broad ceilings.
        const cut = kind === 'ceil' ? L.ceilingCut : L.floorCut;
        const steps = Math.max(1, Math.ceil((x1-x0)/0.3));
        for (let q=0;q<steps;q++){
          const a = x0+(x1-x0)*q/steps, b = x0+(x1-x0)*(q+1)/steps;
          const c = [[a,z0],[b,z0],[b,z1],[a,z1]];
          // Keep ceiling winding consistent with its downward normals.
          let pieces=cutSlabQuad(c,cut);
          if(kind==='ceil')for(const roof of L.roofCuts)pieces=pieces.flatMap(p=>cutSlabQuad(p,roof));
          for(const polygon of pieces)for(let i=1;i<polygon.length-1;i++){
            const [p0,p1,p2]=[polygon[0],polygon[i],polygon[i+1]];
            if(Math.abs((p1[0]-p0[0])*(p2[1]-p0[1])-(p2[0]-p0[0])*(p1[1]-p0[1]))<1e-10)continue;
            for(const t of (up>0 ? [0,i+1,i] : [0,i,i+1])){
              const [x,z]=polygon[t];
              pos.push(x,y,z);uv.push((x*st+z*ct)/T,(x*ct-z*st)/T);nor.push(0,up,0);
            }
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      host.add(new THREE.Mesh(geo, mat));
    }
    // Downlights on a 2.4 m grid over the room's own ceiling. They are lamps to
    // look at rather than lamps that light: one light per room would mean a
    // dozen in a single forward-rendered pass.
    if (room.bare || room.finishes?.roof) continue;
    const seen = new Set();
    for (const [x0,x1,z0,z1] of quads){
      const gz = Math.round((z0+z1)/2/2.4)*2.4;
      if (Math.abs(gz - (z0+z1)/2) > 0.06) continue;
      for (let x = Math.ceil(x0/2.4)*2.4; x < x1; x += 2.4){
        if (inStairCut(L.ceilingCut,x,gz)) continue;
        const key = x.toFixed(1) + ',' + gz.toFixed(1);
        if (seen.has(key)) continue;
        seen.add(key);
        const rim = new THREE.Mesh(new THREE.RingGeometry(0.072, 0.096, 24), MAT.trim);
        rim.rotation.x = Math.PI/2;
        rim.position.set(x, L.elevation + L.ceiling - 0.015, gz);
        L.roomCeil.add(rim);
        const baffle = new THREE.Mesh(new THREE.RingGeometry(0.056, 0.072, 24), MAT.dark);
        baffle.rotation.x = Math.PI/2;
        baffle.position.set(x, L.elevation + L.ceiling - 0.014, gz);
        L.roomCeil.add(baffle);
        const d = new THREE.Mesh(new THREE.CircleGeometry(0.056, 24), MAT.lamp);
        d.rotation.x = Math.PI/2;
        d.position.set(x, L.elevation + L.ceiling - 0.012, gz);
        L.roomCeil.add(d);
      }
    }
  }
}

// The furniture the renovation proposes, room by room. A room in photos.json
// may carry `furnishings`, a map from a scanned category to a product — the
// sofa the scan saw becomes the Andes, the bed the Hudson — and each is built
// in its own silhouette at its catalogue size, on the scanned footprint,
// facing the way the scanned box does. A room with a kitchen or bath
// annotation has its scanned kitchen or bath fittings dropped and the
// annotated ones laid out instead; those come with their own collision, plan
// boxes and daylight blockers, since the scan's boxes no longer describe
// what is standing there.
const KITCHEN = new Set(['storage','oven','stove','refrigerator','dishwasher']);

// A contact shadow: the dark, soft-edged patch a piece of furniture makes on
// the floor beneath and just around itself, where the sky and the walls are
// blocked from it. The screen-space occlusion in the lens does some of this
// and only when the lens is on; a plane with a rounded gradient under every
// piece does it always, and it is most of what makes furniture sit on a floor
// rather than float over it.
let shadowMap = null;
function contactShadow(w, d, strength){
  if (!shadowMap){
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    const cx = c.getContext('2d'), img = cx.createImageData(N, N);
    for (let y=0;y<N;y++) for (let x=0;x<N;x++){
      // Distance to the edge of an inset rounded rectangle, eased.
      const u = Math.abs(x/(N-1) - 0.5)*2, v = Math.abs(y/(N-1) - 0.5)*2;
      const edge = Math.max(0, Math.hypot(Math.max(0, u - 0.55), Math.max(0, v - 0.55)));
      const a = Math.max(0, 1 - edge/0.45);
      const i = (y*N + x)*4;
      img.data[i] = img.data[i+1] = img.data[i+2] = 0; img.data[i+3] = 255*a*a;
    }
    cx.putImageData(img, 0, 0);
    shadowMap = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.4, d + 0.4),
    new THREE.MeshBasicMaterial({map:shadowMap, transparent:true, depthWrite:false, opacity:strength}));
  m.rotation.x = -Math.PI/2;
  m.renderOrder = 1;
  return m;
}
// Legged pieces let most of the light under; upholstered and cased ones do not.
const LIGHT_UNDER = /chair|table|console|nightstand|end-table|coffee/;
// A rug goes under the seating and the beds: the one thing that most makes a
// furnished room read as lived in, and a plane of woven cloth on the floor.
const RUGGED = /sofa|sectional|bed-/;
export function dressFittings(L){
  L.designed = []; L.planBoxes = []; L.daylightExtra = [];
  const extraBlockers = [];
  const take = built => {
    if (!built) return;
    L.designed.push(built.group);
    L.planBoxes.push(...built.plan);
    L.daylightExtra.push(...built.daylight);
    extraBlockers.push(...built.blockers);
  };
  for (const room of L.rooms){
    take(buildKitchen(L, room, L.furn));
    take(buildBath(L, room, L.furn));
  }
  // On the floor and clear of every wall — the whole wall, windows and the
  // low panels under them included, not only the stretches that stop the
  // body — with a couple of centimetres to spare: what a footprint has to
  // satisfy to be settled.
  const walls = wallBoxes(L.walls, WALL_T);
  const fits = (x, z) => onFloor(L, x, z) && !walls.some(b => blocks(x, z, b, 0.035));
  const crossing = (ax, az, bx, bz) => walls.some(b => crossesBox(ax, az, bx, bz, b, 0.02));
  const swap = (o, g) => {
    if (o.built){ o.built.visible = false; o.built.parent?.remove(o.built); }
    if (!g){ g = new THREE.Group(); o.src.replaced = true; }
    g.visible = false; L.furn.add(g); o.built = g;
  };
  // Walk a built piece out of the wall it was scanned into, if it is in one.
  const place = (g, dims, src, f) => {
    const at = settle(fits, g.position.x, g.position.z, src.yaw, dims[0], dims[2], f, crossing);
    if (at){ g.position.x = at.x; g.position.z = at.z; }
    return !!at && !at.partial;
  };
  // Build a piece at the size that will settle. `build(dims)` makes and stands
  // it; the sizes tried are the one asked for, then the scan's own box if that
  // differs, then that box shrunk in plan by steps down to three quarters —
  // because a scan does put a 2.07 m bed between walls 2.07 m apart, and a
  // bed drawn a little short is a bed, where a bed through a wall is not.
  // What comes back is the first that settled clean, or the smallest tried,
  // standing where it clears the most.
  const fitted = (build, dims0, src, f) => {
    const tries = [dims0];
    if (dims0[0] !== src.d[0] || dims0[2] !== src.d[2]) tries.push(src.d.slice());
    const base = tries[tries.length - 1];
    for (const k of [0.94, 0.88, 0.82, 0.76]) tries.push([base[0]*k, base[1], base[2]*k]);
    let last = null;
    for (const dims of tries){
      const g = build(dims);
      if (!g) return null;
      last = {g, dims};
      if (place(g, dims, src, f)) return last;
    }
    return last;
  };
  // The shadow goes into the piece's own group, so it moves with it when the
  // piece is settled, and rides two centimetres up so it lies on a rug too.
  const shade = (g, key, dims) => {
    const sh = contactShadow(dims[0], dims[2], LIGHT_UNDER.test(key || '') ? 0.3 : 0.7);
    sh.position.set(0, -dims[1]/2 + 0.02, 0);
    g.add(sh);
  };
  const rug = (g, key, dims, src, f, room) => {
    if (!RUGGED.test(key) || (room.place || []).some(p => p.rug)) return;
    const bed = /bed-/.test(key);
    let rw = dims[0] + (bed ? 1.2 : 0.6), rd = bed ? dims[2]*0.75 : dims[2] + 1.0;
    const ahead = bed ? dims[2]*0.2 : 0.45;
    const x = g.position.x + Math.sin(src.yaw)*f*ahead, z = g.position.z + Math.cos(src.yaw)*f*ahead;
    for (let i=0;i<4;i++, rw *= 0.85, rd *= 0.85){
      const at = settle(fits, x, z, src.yaw, rw, rd, f, crossing);
      if (!at || at.partial || at.moved > 0.3) continue;
      // A flatweave in mid greige with a pale border, a centimetre thick.
      const m = new THREE.Group();
      m.add(box(MAT.rugEdge, rw, 0.010, rd, 0, 0.005, 0));
      m.add(box(MAT.rug, rw - 0.16, 0.012, rd - 0.16, 0, 0.006, 0));
      m.position.set(at.x, L.elevation + 0.004, at.z);
      m.rotation.y = src.yaw; m.visible = false; L.furn.add(m); L.designed.push(m);
      return;
    }
  };
  for (const o of L.objMeshes){
    if (o.category === 'stairs') continue;
    const src = o.src, p = o.mesh.position, room = roomAt(L, p.x, p.z, true);
    if (!room) continue;
    const spec = room.finishes || {};
    const inBath = !!spec.bath;
    if ((spec.kitchen && KITCHEN.has(o.category)) || dropped(spec.bath, p.x, p.z)
        || dropped(room, p.x, p.z) || (inBath && o.category === 'sink')){
      swap(o, null);
      continue;
    }
    const f = facing({blockers:L.blockers}, src);
    const pick = pickProduct(room.furnishings?.[o.category], src.d);
    if (pick){
      // Stand it on the floor where the scanned piece stood, its back where
      // the scanned back was: a deeper sofa grows forward, not into the wall.
      const built = fitted(dims => {
        const g = product(pick.key, dims, f);
        if (!g) return null;
        g.position.set(src.c[0] - Math.sin(src.yaw)*f*(dims[2] - src.d[2])/2,
                       L.elevation + dims[1]/2,
                       src.c[2] - Math.cos(src.yaw)*f*(dims[2] - src.d[2])/2);
        g.rotation.y = src.yaw;
        return g;
      }, pick.dims, src, f);
      if (!built) continue;
      shade(built.g, pick.key, built.dims);
      swap(o, built.g);
      rug(built.g, pick.key, built.dims, src, f, room);
      continue;
    }
    const base = p.y - src.d[1]/2 - L.elevation;
    if (o.category === 'television' && o.built){
      // Hung on the wall, not stood on the floor: its back goes to the face
      // of the nearest wall behind it, a centimetre proud.
      const nx = Math.sin(src.yaw)*f, nz = Math.cos(src.yaw)*f;
      let depth = Infinity;
      for (const b of walls){
        const c = Math.cos(b.yaw), sn = Math.sin(b.yaw), dx = src.c[0] - b.x, dz = src.c[2] - b.z;
        const lx = dx*c - dz*sn, lz = dx*sn + dz*c;
        if (Math.abs(lx) > b.hx || Math.abs(lz) > 0.6) continue;
        if (Math.abs(Math.cos(b.yaw)*Math.cos(src.yaw) + Math.sin(b.yaw)*Math.sin(src.yaw)) < 0.9) continue;
        const face = Math.abs(lz) - b.hz;                 // distance from the wall face
        const sign = (lz*(nx*Math.sin(b.yaw) + nz*Math.cos(b.yaw)) >= 0) ? 1 : -1;
        if (sign > 0 && face < depth) depth = face;        // the wall is behind it
      }
      if (depth < 0.6){
        const move = src.d[2]/2 + 0.01 - depth;
        o.built.position.x += nx*move; o.built.position.z += nz*move;
      }
      continue;
    }
    if (inBath && o.category === 'storage' && base < 0.4 && src.d[1] < 1.2){
      const built = fitted(dims => {
        const g = new THREE.Group();
        vanity(g, dims[0], dims[1], dims[2], f);
        g.position.set(src.c[0], src.c[1], src.c[2]); g.rotation.y = src.yaw;
        return g;
      }, src.d.slice(), src, f);
      if (!built) continue;
      shade(built.g, 'vanity', built.dims);
      swap(o, built.g);
      continue;
    }
    if (!o.built) continue;
    // A generic fitting, rebuilt smaller if the scan's box for it will not
    // settle — its maker takes the box it is given.
    const built = fitted(dims => fitting({blockers:L.blockers, elevation:L.elevation}, {...src, d:dims}),
                         src.d.slice(), src, f);
    if (!built) continue;
    shade(built.g, o.category, built.dims);
    swap(o, built.g);
  }
  // Pieces the scan never saw — a coffee table in a room scanned without
  // one — placed outright by `place`, settled the same way, and given a
  // collision box and a plan box since no scanned box stands in for them.
  for (const room of L.rooms) for (const spec of room.place || []){
    if (spec.tv){
      // A television on a named wall: a black panel on the wall face, its
      // centre `height` above the floor, `along` metres from the wall's centre.
      const w = L.walls.find(w => Math.hypot(w.c[0] - spec.wallAt[0], w.c[2] - spec.wallAt[1]) < 0.1);
      if (!w) continue;
      const dir = [Math.cos(w.yaw), -Math.sin(w.yaw)], n = [Math.sin(w.yaw), Math.cos(w.yaw)];
      const side = (room.at[0] - w.c[0])*n[0] + (room.at[1] - w.c[2])*n[1] >= 0 ? 1 : -1;
      const along = spec.along ?? 0, tw = spec.tv, th = tw*9/16, off = WALL_T/2 + 0.025;
      const g = new THREE.Group();
      g.add(box(MAT.black, tw, th, 0.03, 0, 0, 0));
      g.add(box(MAT.screen, tw - 0.02, th - 0.02, 0.006, 0, 0, 0.018));
      g.position.set(w.c[0] + dir[0]*along + n[0]*side*off, L.elevation + (spec.height ?? 1.3), w.c[2] + dir[1]*along + n[1]*side*off);
      g.rotation.y = w.yaw + (side < 0 ? Math.PI : 0);
      g.visible = false; L.furn.add(g); L.designed.push(g);
      continue;
    }
    if (spec.rug){
      // A rug placed outright, at its own size, with the same border.
      const [rw, rd] = spec.rug, yaw = spec.yaw ?? 0;
      const at = settle(fits, spec.at[0], spec.at[1], yaw, rw, rd, 1, crossing);
      if (!at || at.partial) continue;
      const m = new THREE.Group();
      m.add(box(MAT.rugEdge, rw, 0.010, rd, 0, 0.005, 0));
      m.add(box(MAT.rug, rw - 0.16, 0.012, rd - 0.16, 0, 0.006, 0));
      m.position.set(at.x, L.elevation + 0.004, at.z); m.rotation.y = yaw;
      m.visible = false; L.furn.add(m); L.designed.push(m);
      continue;
    }
    const p = PRODUCTS[spec.product];
    if (!p) continue;
    const dims = p.dims, f = 1, g = product(spec.product, dims, f);
    if (!g) continue;
    g.position.set(spec.at[0], L.elevation + dims[1]/2, spec.at[1]); g.rotation.y = spec.yaw ?? 0;
    const at = settle(fits, g.position.x, g.position.z, g.rotation.y, dims[0], dims[2], f, crossing);
    if (!at) continue;
    g.position.x = at.x; g.position.z = at.z;
    shade(g, spec.product, dims);
    g.visible = false; L.furn.add(g); L.designed.push(g);
    const c = [at.x, L.elevation + dims[1]/2, at.z];
    if (dims[1] > 0.45) extraBlockers.push({x:at.x, z:at.z, yaw:g.rotation.y, hx:dims[0]/2, hz:dims[2]/2});
    L.planBoxes.push({c, d:dims.slice(), yaw:g.rotation.y});
  }
  L.objBlockers = L.objBlockers.filter(b => !b.src?.replaced).concat(extraBlockers);
}

// Shadow flags are set once, on everything: three skips a mesh's shadow work
// when the map is off, so leaving them on costs nothing in the survey.
function castAll(root){
  root.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    const clear = m && (m.transparent || m.isMeshBasicMaterial);
    o.castShadow = !clear;
    o.receiveShadow = true;
  });
}

export function setSurfaces(on){
  flags.surfaced = on;
  for (const L of levels){
    L.roomFloor.visible = on; L.roomCeil.visible = on;
    const bare = !on || !L.roomFloor.children.length;
    for (const m of L.slabs) m.visible = bare;
    for (const m of L.caps)  m.visible = bare;
    for (const p of L.wallMeshes) p.mesh.material = on && p.photo ? p.photo : p.flat;
    for (const o of L.objMeshes){
      o.mesh.material = on ? o.real : o.flat;
      // A built fitting replaces its box outright; the box stays for the survey.
      if (o.built){ o.built.visible = on; o.mesh.visible = !on; }
    }
    for (const g of L.designed || []) g.visible = on;
    for (const g of L.panes) g.material = on ? MAT.pane : MAT.glass;
    L.trim.visible = on;
    if(L.exterior)L.exterior.visible=on;
    // The wireframe is how you read a sketch, and the last thing a room needs.
    for (const w of L.wire) w.visible = !on;
    castAll(L.group);
    // The stair marker is a storey-tinted volume. Against flat grey it reads as
    // a highlight; against paint it reads as a wall someone painted yellow.
    L.stairMat.opacity = 0.5;
  }
  const world = outdoorWorld();
  if (world){
    world.group.visible = on;
    scene.environment = on ? world.env : null;
  }
  setLightRig(on);
  for (const id of ['surftog','surftog2']) $(id).setAttribute('aria-pressed', String(on));
}

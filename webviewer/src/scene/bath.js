import { WALL_T } from '../core/constants.js';
import { MAT } from './materials.js';
import { tileCanvases } from './textures.js';
import { box, tube, fronts } from './fittings.js';

// The bathrooms, brought up to date. The scan gives each one a toilet, a
// vanity and a basin as boxes, and nothing else — no tub, no shower, and in
// one room the vanity and a toilet twice over. `finishes.bath` says what to do
// about that:
//
//   "bath": {
//     "drop":    [[x, z], ...],                    scanned boxes not to draw
//     "showers": [{"wallAt": [x, z], "width": w, "depth": d, "along": m}],
//     "vanities":[{"wallAt": [x, z], "width": w, "along": m}]
//   }
//
// A shower stands against the named wall, centred on it or `along` metres
// from its centre, tiled on three sides with a fixed glass panel on the
// fourth. A vanity annotated here is one the scan never saw; the vanities it
// did see are restyled in place by `vanity()` below — floating, in oak, with
// a quartz top, an undermount basin and a frameless mirror over it.

let tileMat = null;
function wallTile(){
  if (tileMat) return tileMat;
  // 600 mm large-format on the walls, a shade lighter than the floor.
  const tiles = tileCanvases({r:222, g:219, b:213}, {across:2, grout:0.003});
  const map = new THREE.CanvasTexture(tiles.colour);
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.encoding = THREE.sRGBEncoding;
  map.repeat.set(1/1.2, 1/1.2);
  const rough = new THREE.CanvasTexture(tiles.roughness);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping; rough.repeat.copy(map.repeat);
  tileMat = new THREE.MeshStandardMaterial({map, roughnessMap:rough, roughness:0.35, metalness:0, envMapIntensity:0.5});
  return tileMat;
}

// A panel of wall tile, `w` wide and `h` high, lying in the XY plane facing +z.
function tilePanel(w, h, x, y, z, ry = 0){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallTile());
  const uv = m.geometry.attributes.uv;
  for (let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*w, uv.getY(i)*h);
  m.position.set(x, y, z); m.rotation.y = ry;
  return m;
}

// The shower, built facing +z: the back wall at -depth/2, the opening at the
// front. Tiled back and sides, a low tray with a linear drain, a fixed glass
// panel over the wider part of the front, black fittings on the back wall.
function shower(g, w, d){
  const H = 2.1;
  g.add(box(MAT.quartz, w, 0.035, d, 0, 0.0175, 0));
  g.add(box(MAT.black, w - 0.16, 0.006, 0.03, 0, 0.037, -d/2 + 0.06));
  g.add(tilePanel(w, H, 0, H/2, -d/2 + 0.006));
  for (const s of [-1, 1]) g.add(tilePanel(d, H, s*(w/2 - 0.006), H/2, 0, -s*Math.PI/2));
  const glassW = Math.max(0.5, w*0.6);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(glassW, 2.0), MAT.glassy);
  glass.position.set(-(w - glassW)/2, 1.035, d/2 - 0.01); g.add(glass);
  g.add(box(MAT.black, glassW, 0.02, 0.02, -(w - glassW)/2, 2.04, d/2 - 0.01));
  g.add(box(MAT.black, 0.02, 2.0, 0.02, -w/2 + 0.01, 1.035, d/2 - 0.01));
  g.add(tube(MAT.black, 0.011, 0.3, 0, 2.05, -d/2 + 0.15, 'z'));
  g.add(tube(MAT.black, 0.12, 0.01, 0, 2.05, -d/2 + 0.3, 'y'));
  g.add(box(MAT.black, 0.06, 0.16, 0.05, 0, 1.1, -d/2 + 0.03));
  g.add(tube(MAT.black, 0.012, 0.09, 0, 1.1, -d/2 + 0.08, 'z'));
  // A shampoo niche in the back wall, and a towel bar on the glass.
  g.add(box(MAT.black, 0.3, 0.3, 0.01, w*0.25, 1.35, -d/2 + 0.004));
}

// A floating vanity in the box the scan reported, facing +z*f. The carcass
// hangs 0.35 m off the floor; the basin is let into the quartz top; the mirror
// and sconces are on the wall behind, which is where the box's back face is.
export function vanity(g, w, h, d, f){
  const y0 = -h/2, top = 0.02, carc = Math.min(0.5, h - 0.35 - top), bottom = h - carc - top;
  g.add(box(MAT.oak, w, carc, d - 0.01, 0, y0 + bottom + carc/2, 0));
  const drawers = w > 1.1 ? 2 : 1, dw = w/drawers;
  for (let i=0;i<drawers;i++){
    const sub = new THREE.Group(); sub.position.set(-w/2 + dw*(i + 0.5), 0, 0); g.add(sub);
    fronts(sub, MAT.oak, dw, carc/2, d - 0.01, y0 + bottom + carc*0.75, f, true, {n:1, drawers:true});
    fronts(sub, MAT.oak, dw, carc/2, d - 0.01, y0 + bottom + carc*0.25, f, true, {n:1, drawers:true});
  }
  g.add(box(MAT.quartz, w + 0.02, top, d + 0.02, 0, y0 + h - top/2, f*0.01));
  const bw = Math.min(0.55, w*0.45), bd = Math.min(0.38, d*0.7), depth = 0.14;
  g.add(box(MAT.porcelain, bw, 0.004, bd, 0, y0 + h - depth, 0));
  for (const s of [-1, 1]){
    g.add(box(MAT.porcelain, 0.004, depth, bd, s*bw/2, y0 + h - depth/2, 0));
    g.add(box(MAT.porcelain, bw, depth, 0.004, 0, y0 + h - depth/2, s*bd/2));
  }
  g.add(tube(MAT.black, 0.013, 0.2, 0, y0 + h + 0.1, -f*(d/2 - 0.06), 'y'));
  g.add(tube(MAT.black, 0.01, 0.14, 0, y0 + h + 0.19, -f*(d/2 - 0.12), 'z'));
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 0.2, 1.2), 0.85), MAT.mirror);
  // The mirror and sconces sit a hair inside the vanity's back plane rather
  // than beyond it: the back plane is where the wall is, or as near as the
  // settling leaves it, and anything past it is in the wall.
  mirror.position.set(0, y0 + h + 0.6, -f*(d/2 - 0.006)); mirror.rotation.y = f > 0 ? 0 : Math.PI;
  g.add(mirror);
  for (const s of [-1, 1]){
    const x = s*(Math.min(w - 0.2, 1.2)/2 + 0.12);
    if (Math.abs(x) > w/2 - 0.04) continue;          // no sconce past the vanity's end, where a side wall may be
    g.add(tube(MAT.black, 0.02, 0.3, x, y0 + h + 0.65, -f*(d/2 - 0.025), 'y'));
    g.add(tube(MAT.lamp, 0.024, 0.06, x, y0 + h + 0.83, -f*(d/2 - 0.025), 'y'));
  }
}

// Build what `finishes.bath` annotates for one room, into `host`.
export function buildBath(L, room, host){
  const spec = room.finishes?.bath;
  if (!spec) return null;
  const out = {blockers:[], daylight:[], plan:[], group:new THREE.Group()};
  out.group.name = 'Bathroom, as proposed';
  host.add(out.group);
  const against = (wallAt, along, depth) => {
    const w = L.walls.find(w => Math.hypot(w.c[0] - wallAt[0], w.c[2] - wallAt[1]) < 0.1);
    if (!w) return null;
    const dir = [Math.cos(w.yaw), -Math.sin(w.yaw)], n = [Math.sin(w.yaw), Math.cos(w.yaw)];
    const side = (room.at[0] - w.c[0])*n[0] + (room.at[1] - w.c[2])*n[1] >= 0 ? 1 : -1;
    const off = WALL_T/2 + depth/2;
    return {x: w.c[0] + dir[0]*along + n[0]*side*off, z: w.c[2] + dir[1]*along + n[1]*side*off,
            yaw: w.yaw + (side < 0 ? Math.PI : 0)};
  };
  for (const s of spec.showers || []){
    const at = against(s.wallAt, s.along ?? 0, s.depth);
    if (!at) continue;
    const g = new THREE.Group();
    shower(g, s.width, s.depth);
    g.position.set(at.x, L.elevation, at.z); g.rotation.y = at.yaw;
    out.group.add(g);
    out.blockers.push({x:at.x, z:at.z, yaw:at.yaw, hx:s.width/2, hz:s.depth/2});
    out.plan.push({c:[at.x, L.elevation + 1, at.z], d:[s.width, 2.1, s.depth], yaw:at.yaw});
  }
  for (const v of spec.vanities || []){
    const d = 0.5, h = 0.85, at = against(v.wallAt, v.along ?? 0, d);
    if (!at) continue;
    const g = new THREE.Group();
    vanity(g, v.width, h, d, 1);
    g.position.set(at.x, L.elevation + h/2, at.z); g.rotation.y = at.yaw;
    out.group.add(g);
    out.blockers.push({x:at.x, z:at.z, yaw:at.yaw, hx:v.width/2, hz:d/2});
    out.plan.push({c:[at.x, L.elevation + h/2, at.z], d:[v.width, h, d], yaw:at.yaw});
  }
  return out;
}

// Whether a scanned box is one the annotation says not to draw.
export function dropped(spec, x, z){
  return (spec?.drop || []).some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 0.35);
}

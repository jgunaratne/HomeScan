import { $ } from '../core/util.js';
import { WALL_T } from '../core/constants.js';
import { onFloor } from '../core/geometry.js';
import { flags } from '../core/state.js';
import { scene, setLightRig } from './stage.js';
import { MAT } from './materials.js';
import { levels } from './levels.js';
import { TILE, roomAt } from '../photo/rooms.js';
import { avgMats } from '../photo/relight.js';
import { paintSky } from '../photo/sky.js';
import { outdoorWorld } from '../photo/outside.js';

// A wall has two faces and they can be in different rooms — the kitchen side of
// the bathroom wall is kitchen. BoxGeometry keeps a material group per face, so
// +Z and -Z take their own room's paint.
export function dressWalls(L){
  for (const p of L.wallMeshes){
    const nx = Math.sin(p.yaw), nz = Math.cos(p.yaw), off = WALL_T/2 + 0.3;
    const front = roomAt(L, p.x + nx*off, p.z + nz*off);
    const back  = roomAt(L, p.x - nx*off, p.z - nz*off);
    const side = m => (m || avgMats()).wall;
    p.photo = [p.flat, p.flat, p.flat, p.flat, side(front?.mats), side(back?.mats)];
    // The repeat lives in the geometry, so every wall in a room shares a material.
    const uv = p.mesh.geometry.attributes.uv;
    for (let i=0;i<uv.count;i++)
      uv.setXY(i, uv.getX(i)*p.w/TILE.wall, uv.getY(i)*p.h/TILE.wall);
    uv.needsUpdate = true;
    paintSky(p.mesh.geometry, L.sky, p.mesh, 1.0, 0.10);
  }
}

// Floors and ceilings come as one slab per storey, so they are re-cut per room:
// walk a grid over the footprint, keep each cell's room, then merge each row's
// runs into quads. Boundaries land on the 10 cm grid, which is finer than the
// walls that sit on top of them.
export function dressSlabs(L){
  const g = 0.1, b = L.bounds;
  const nx = Math.ceil((b.x1-b.x0)/g), nz = Math.ceil((b.z1-b.z0)/g);
  // false = off the storey's floor entirely; null = on it but in no room.
  const own = new Array(nx*nz).fill(false);
  for (let j=0;j<nz;j++) for (let i=0;i<nx;i++){
    const x = b.x0 + (i+0.5)*g, z = b.z0 + (j+0.5)*g;
    if (onFloor(L, x, z)) own[j*nx+i] = roomAt(L, x, z);
  }
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
      while (e+1 < nx && (own[j*nx+e+1] && own[j*nx+e+1].mats ? own[j*nx+e+1] : BARE) === r) e++;
      if (!runs.has(r)) runs.set(r, []);
      runs.get(r).push([b.x0 + i*g, b.x0 + (e+1)*g, b.z0 + j*g, b.z0 + (j+1)*g]);
      i = e + 1;
    }
  }
  for (const [room, quads] of runs){
    for (const [kind, host, y, up] of [
      ['floor', L.roomFloor, L.elevation + 0.006, 1],
      ['ceil',  L.roomCeil,  L.elevation + L.ceiling, -1]]){
      const mat = room.mats[kind];
      if (!mat) continue;
      const pos = [], uv = [], nor = [], T = TILE[kind];
      for (const [x0,x1,z0,z1] of quads){
        const c = [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
        for (const t of [0,2,1, 0,3,2]){
          const [x,z] = c[t];
          pos.push(x, y, z); uv.push(x/T, z/T); nor.push(0, up, 0);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      paintSky(geo, L.sky, null, kind === 'ceil' ? 0.86 : 1.0, kind === 'floor' ? 0.07 : 0.05);
      host.add(new THREE.Mesh(geo, mat));
    }
    // Downlights on a 2.4 m grid over the room's own ceiling. They are lamps to
    // look at rather than lamps that light: one light per room would mean a
    // dozen in a single forward-rendered pass.
    if (room.bare) continue;
    const seen = new Set();
    for (const [x0,x1,z0,z1] of quads){
      const gz = Math.round((z0+z1)/2/2.4)*2.4;
      if (Math.abs(gz - (z0+z1)/2) > 0.06) continue;
      for (let x = Math.ceil(x0/2.4)*2.4; x < x1; x += 2.4){
        const key = x.toFixed(1) + ',' + gz.toFixed(1);
        if (seen.has(key)) continue;
        seen.add(key);
        const d = new THREE.Mesh(new THREE.CircleGeometry(0.085, 14), MAT.lamp);
        d.rotation.x = Math.PI/2;
        d.position.set(x, L.elevation + L.ceiling - 0.012, gz);
        L.roomCeil.add(d);
      }
    }
  }
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
    for (const g of L.panes) g.material = on ? MAT.pane : MAT.glass;
    L.trim.visible = on;
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
  $('surftog').textContent = on ? 'Flat surfaces' : 'Photo surfaces';
  $('surftog2').textContent = $('surftog').textContent;
  for (const id of ['surftog','surftog2']) $(id).setAttribute('aria-pressed', String(on));
}

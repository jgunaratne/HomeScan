import { clamp } from '../core/util.js';
import { WALL_T } from '../core/constants.js';
import { player, view, flags, focus } from '../core/state.js';
import { panels, onFloor } from '../core/geometry.js';
import { renderer } from '../scene/stage.js';
import { castFrom, ray } from '../scene/picking.js';
import { levels } from '../scene/levels.js';
import { blocks } from '../player/collision.js';
import { photoRooms, roomAt } from './rooms.js';
import { paintShot } from '../ui/modes.js';

// The photographs themselves, hung on the wall of the room they came from. The
// surfaces are the point now, so these are off until asked for — they are how
// you get from a room back to the picture its paint was lifted out of.
const PH_H = 0.94;        // picture height where the wall allows it
const PH_MID = 1.50;      // hung just under eye level
const SLOT = 1.36;        // wall frontage one picture claims
const MIN_SPAN = 0.80;    // narrowest stretch worth hanging on
const MIN_TALL = 0.66;    // shortest clear band worth hanging in
const PH_SPREAD = 1.5;    // keep this much between two pictures
const PH_REACH = 7.5;     // how far from the anchor a wall may be

// Every place on this storey a picture could hang, nearest the anchor first.
// panels() has already cut the openings out, so a slot is solid wall by
// construction — a print never lands over a door or a window, and a stretch too
// narrow or too short for a full-size picture takes a smaller one instead.
function photoSlots(L, at, rivals){
  const out = [];
  for (const w of L.walls){
    for (const q of panels(w.w, w.h, w.holes)){
      const span = q.x1 - q.x0;
      if (span < MIN_SPAN) continue;
      const bot = Math.max(w.c[1] + q.y0 - L.elevation, 0.72) + 0.04;
      const top = Math.min(w.c[1] + q.y1 - L.elevation, 2.32) - 0.04;
      if (top - bot < MIN_TALL) continue;
      const n = Math.max(1, Math.floor(span/SLOT));
      for (let i=0;i<n;i++){
        const off = q.x0 + span*(i + 0.5)/n;
        const x = w.c[0] + Math.cos(w.yaw)*off;
        const z = w.c[2] - Math.sin(w.yaw)*off;
        const d = Math.hypot(x - at[0], z - at[1]);
        if (d > PH_REACH) continue;
        // A wall has two faces; the picture goes on the one the room is on.
        const face = Math.sin(w.yaw)*(at[0] - x) + Math.cos(w.yaw)*(at[1] - z) >= 0 ? 1 : -1;
        // Sight alone leaks through doorways — a header is not a blocker, so the
        // far wall of the next room is in plain view. Whoever's anchor is nearest
        // the spot in front of the wall owns it.
        const fx = x + Math.sin(w.yaw)*face*0.3, fz = z + Math.cos(w.yaw)*face*0.3;
        const mine = Math.hypot(fx - at[0], fz - at[1]);
        if (rivals.some(r => Math.hypot(fx - r[0], fz - r[1]) < mine - 0.25)) continue;
        out.push({x, z, yaw:w.yaw, face, d, wide:span/n, bot, top});
      }
    }
  }
  return out.sort((a,b) => a.d - b.d);
}

// Same room, or merely the same storey? Walk the line and see: it has to stay on
// the floor and clear of every body-height panel, which is exactly the test for
// "you could stand in the room and look straight at it".
function inSight(L, at, m){
  const bx = m.x + Math.sin(m.yaw)*m.face*0.28, bz = m.z + Math.cos(m.yaw)*m.face*0.28;
  const n = Math.max(2, Math.ceil(Math.hypot(bx - at[0], bz - at[1])/0.22));
  for (let i=1;i<=n;i++){
    const t = i/n, x = at[0] + (bx - at[0])*t, z = at[1] + (bz - at[1])*t;
    if (!onFloor(L, x, z)) return false;
    for (const b of L.blockers) if (blocks(x, z, b, 0.07)) return false;
  }
  return true;
}

// Give every print a wall in its own room. Only the spacing gives — a picture
// that cannot find room here is left for the lightbox rather than hung next door.
function placeRoom(L, at, rivals, n){
  const slots = photoSlots(L, at, rivals).filter(m => inSight(L, at, m));
  const out = [];
  for (const gap of [PH_SPREAD, 0.95, 0.5, 0]){
    for (const m of slots){
      if (out.length >= n) return out;
      if (out.includes(m)) continue;
      if (out.some(o => Math.hypot(o.x - m.x, o.z - m.z) < gap)) continue;
      out.push(m);
    }
  }
  return out;
}

// How big the picture can be here, and where its centre lands: as close to
// PH_MID as the clear band allows, never wider than the stretch of wall.
function fitPhoto(m, aspect){
  let h = Math.min(PH_H, m.top - m.bot);
  let w = h*aspect;
  if (w > m.wide - 0.12){ w = m.wide - 0.12; h = w/aspect; }
  return {w, h, y: clamp(PH_MID, m.bot + h/2, m.top - h/2)};
}

export const frameMat = new THREE.MeshBasicMaterial({color:0x10151C});
export const frameLit = new THREE.MeshBasicMaterial({color:0xF2C230});

export function hangPrints(){
  for (const room of photoRooms){
    const L = levels[room.level];
    if (!L) continue;
    const rivals = photoRooms.filter(r => r !== room && r.level === room.level).map(r => r.at);
    const mounts = placeRoom(L, room.at, rivals, room.shots.length);
    room.shots.forEach((ph, i) => {
      ph.room_ = room; ph.index = i;
      const m = mounts[i];
      // No wall wide enough: the picture is still in the room's reel, reachable
      // with the arrow keys from any of its neighbours.
      if (!m || !ph.img) return;
      const fit = fitPhoto(m, ph.img.naturalWidth/ph.img.naturalHeight || 4/3);
      const g = new THREE.Group();
      g.position.set(m.x + Math.sin(m.yaw)*m.face*(WALL_T/2 + 0.012),
                     L.elevation + fit.y,
                     m.z + Math.cos(m.yaw)*m.face*(WALL_T/2 + 0.012));
      g.rotation.y = m.face > 0 ? m.yaw : m.yaw + Math.PI;
      L.prints.add(g);

      // Square power-of-two canvas: WebGL1 only mipmaps those, and the stretch
      // is undone exactly by the picture's own aspect, so nothing looks squashed.
      const cv = document.createElement('canvas');
      cv.width = cv.height = 512;
      cv.getContext('2d').drawImage(ph.img, 0, 0, 512, 512);
      const tex = new THREE.CanvasTexture(cv);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

      const frame = new THREE.Mesh(new THREE.PlaneGeometry(fit.w + 0.06, fit.h + 0.06), frameMat);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(fit.w, fit.h),
                                 new THREE.MeshBasicMaterial({map:tex}));
      pic.position.z = 0.004;
      g.add(frame); g.add(pic);

      pic.userData.ph = ph;
      ph.frame = frame; ph.slot = m; ph.mark = {x:m.x, z:m.z, yaw:m.yaw};
      L.shots.push(pic);
    });
  }
}

export function setPrints(on){
  flags.showPrints = on;
  for (const L of levels) L.prints.visible = on;
  if (!on){ focus.hoverShot = null; paintShot(); }
  for (const id of ['printtog','printtog2']) $(id).setAttribute('aria-pressed', String(on));
}

// Which print the cursor is on. Only this storey's while walking — from
// downstairs you should not be able to reach through the ceiling — and only one
// standing between you and it, since the ray itself passes through walls.
export function shotAt(sx, sy){
  if (!flags.showPrints) return null;
  const pool = view.mode === 'walk' ? levels[player.level].shots
                               : levels.flatMap(L => L.shots);
  if (!pool.length) return null;
  castFrom(sx, sy);
  const h = ray.intersectObjects(pool, false);
  if (!h.length) return null;
  const ph = h[0].object.userData.ph;
  if (view.mode === 'view') return ph;
  return h[0].distance < 14 && inSight(levels[player.level], [player.x, player.z], ph.slot)
    ? ph : null;
}

// Click the wall itself and you get the pictures its paint came from. The room
// is read off the face you hit, not off where you are standing, so a wall seen
// through a doorway answers for the room on the far side.
export function wallShotAt(sx, sy){
  const L = levels[player.level];
  castFrom(sx, sy);
  const h = ray.intersectObjects(L.wallMeshes.map(p => p.mesh), false);
  if (!h.length || h[0].distance > 14) return null;
  const n = h[0].face.normal.clone().applyQuaternion(h[0].object.getWorldQuaternion(new THREE.Quaternion()));
  const p = h[0].point.clone().addScaledVector(n, 0.3);
  const room = roomAt(L, p.x, p.z);
  return room && room.shots.length ? room.shots[0] : null;
}

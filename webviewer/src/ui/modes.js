import { $, clamp } from '../core/util.js';
import { EYE } from '../core/constants.js';
import { len, area, toggleUnit, unitName } from '../core/units.js';
import { player, view, nav, flags, pointer, focus } from '../core/state.js';
import { canvas } from '../scene/stage.js';
import { levels } from '../scene/levels.js';
import { setSurfaces } from '../scene/dressing.js';
import { ring } from '../player/pointing.js';
import { frameMat, frameLit, setPrints } from '../photo/prints.js';
import { paintMeta, paintStoreys } from './hud.js';

export function syncCursor(){
  const walking = view.mode === 'walk';
  $('cross').hidden = !(walking && pointer.lockLook);
  canvas.style.cursor = focus.hoverShot && !pointer.lockLook ? 'pointer'
    : !walking ? 'grab' : pointer.lockLook ? 'none' : 'crosshair';
  $('looktog').textContent = pointer.lockLook ? 'Free cursor' : 'Mouse look';
  paintShot();
}
let litShot = null;
export function paintShot(){
  const ph = focus.lbShot ? null : focus.hoverShot;
  if (ph === litShot) return;
  if (litShot && litShot.frame) litShot.frame.material = frameMat;
  litShot = ph;
  $('shot').hidden = !ph;
  if (!ph) return;
  if (ph.frame){
    frameLit.color.setHex(levels[player.level].tint);
    ph.frame.material = frameLit;
  }
  $('shot-room').textContent = ph.room;
  $('shot-cap').textContent = ph.caption || '';
}
export function toWalk(lock){
  view.mode = 'walk';
  $('gate').hidden = true; $('viewbar').hidden = true;
  $('walkbar').hidden = false; $('here').hidden = false;
  setLook(!!lock);
}
export function setLook(on){
  pointer.lockLook = on;
  if (on) canvas.requestPointerLock?.();
  else document.exitPointerLock?.();
  syncCursor();
}
export function toView(){
  view.mode = 'view';
  pointer.lockLook = false; nav.goTarget = null; nav.hover = null; focus.hoverShot = null; ring.visible = false;
  document.exitPointerLock?.();
  $('viewbar').hidden = false; $('walkbar').hidden = true;
  $('here').hidden = true; $('prompt').hidden = true;
  syncCursor();
}

export function setFurniture(on){
  flags.showFurniture = on;
  for (const L of levels) L.furn.visible = on;
  for (const id of ['furntog','furntog2']){
    $(id).textContent = on ? 'Hide furniture' : 'Show furniture';
    $(id).setAttribute('aria-pressed', String(!on));
  }
}
export function paintGap(){
  const L = levels[player.level];
  $('gap').hidden = L.sealed.area < 1;
  $('gap-a').textContent = area(L.sealed.area);
}
export function setGhost(on){
  flags.ghost = on;
  $('ghosttog').textContent = on ? 'Solid walls' : 'Pass through walls';
  $('ghosttog').setAttribute('aria-pressed', String(on));
}

// Eye height. Kept per browser: it is a property of the viewer and their screen,
// not of the scan, so it should outlive a reload.
function setEye(m){
  flags.eyeH = clamp(m, 1.15, 1.80);
  $('eyeh').value = flags.eyeH;
  $('eyeh-v').textContent = len(flags.eyeH);
  try { localStorage.setItem('storeywalk.eye', flags.eyeH); } catch {}
}

// Every control the two toolbars carry, wired in one place.
export function initControls(){
  // Esc gives the pointer back; walking carries on with the cursor free.
  document.addEventListener('pointerlockchange', () => {
    if (pointer.lockLook && document.pointerLockElement !== canvas){ pointer.lockLook = false; syncCursor(); }
  });
  $('start').onclick   = () => toWalk(false);
  $('walkbtn').onclick = () => toWalk(false);
  $('looktog').onclick = () => setLook(!pointer.lockLook);
  $('backview').onclick = toView;
  $('surftog').onclick   = () => setSurfaces(!flags.surfaced);
  $('surftog2').onclick  = () => setSurfaces(!flags.surfaced);
  $('printtog').onclick  = () => setPrints(!flags.showPrints);
  $('printtog2').onclick = () => setPrints(!flags.showPrints);
  $('ghosttog').onclick = () => setGhost(!flags.ghost);
  $('furntog').onclick  = () => setFurniture(!flags.showFurniture);
  $('furntog2').onclick = () => setFurniture(!flags.showFurniture);
  $('justlook').onclick = () => { $('gate').hidden = true; toView(); };
  $('explode').oninput = e => { view.explode = +e.target.value; };

  $('eyeh').oninput = e => setEye(+e.target.value);
  let saved = null;
  try { saved = localStorage.getItem('storeywalk.eye'); } catch {}
  setEye(saved === null ? EYE : +saved || EYE);

  $('units').onclick = () => {
    const u = toggleUnit();
    $('units').textContent = u;
    $('sec-unit').textContent = unitName();
    paintMeta(); paintStoreys(); paintGap();
    $('eyeh-v').textContent = len(flags.eyeH);
  };
}

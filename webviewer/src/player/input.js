import { clamp } from '../core/util.js';
import { HOUSE } from '../core/data.js';
import { player, nav, view, orbit, flags, pointer, keys, focus } from '../core/state.js';
import { onFloor } from '../core/geometry.js';
import { canvas } from '../scene/stage.js';
import { levels } from '../scene/levels.js';
import { floorPoint } from './pointing.js';
import { spawnOn, stairsNear, useStairs } from './movement.js';
import { shotAt, wallShotAt, setPrints } from '../photo/prints.js';
import { setSurfaces } from '../scene/dressing.js';
import { openShot, stepShot, closeShot } from '../ui/lightbox.js';
import { syncCursor, toView, setFurniture, setGhost } from '../ui/modes.js';
import { openEnhance, closeEnhance } from '../ui/enhance.js';
import { CAN_POST, togglePost } from '../render/passes.js';

// Keyboard, mouse, wheel and touch. Nothing here decides anything: every
// handler moves a value in core/state.js and lets the frame read it.
export function initInput(){
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    // A field the reader is typing into owns its own keystrokes: the viewer's
    // single-letter toggles must not fire inside the Nano Banana prompt, and
    // the arrow keys belong to the eye-height slider while it has the focus.
    const el = e.target;
    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')){
      if (k === 'escape') el.blur();
      return;
    }
    if (focus.enhancing){                                // so does the render panel
      if (k === 'escape') closeEnhance();
      e.preventDefault();
      return;
    }
    if (focus.lbShot){                                   // the lightbox owns the keyboard
      if (k === 'escape') closeShot();
      if (k === 'arrowleft') stepShot(-1);
      if (k === 'arrowright') stepShot(1);
      e.preventDefault();
      return;
    }
    keys[k] = true;
    if (k === 'tab'){ e.preventDefault(); toView(); }
    if (k === 'f') setFurniture(!flags.showFurniture);
    if (k === 'p') setSurfaces(!flags.surfaced);
    if (k === 'o') setPrints(!flags.showPrints);
    if (k === 'q' && CAN_POST) togglePost();
    if (k === 'g') setGhost(!flags.ghost);
    if (k === 'n') openEnhance();
    if (k === 'e' && view.mode === 'walk' && stairsNear()) useStairs();
    const n = parseInt(k, 10);
    if (view.mode === 'walk' && n >= 1 && n <= levels.length) spawnOn(n - 1, HOUSE.stairs);
  });
  addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    pointer.drag  = {x:e.clientX, y:e.clientY};
    pointer.press = {x:e.clientX, y:e.clientY, moved:false};
    if (view.mode === 'walk' && !pointer.lockLook) canvas.style.cursor = 'grabbing';
  });
  addEventListener('mousemove', e => {
    if (view.mode === 'walk' && pointer.lockLook && document.pointerLockElement === canvas){
      player.yaw   -= e.movementX * 0.0022;
      player.pitch  = clamp(player.pitch - e.movementY * 0.0022, -1.45, 1.45);
      return;
    }
    if (pointer.press && (Math.abs(e.clientX - pointer.press.x) > 4 || Math.abs(e.clientY - pointer.press.y) > 4))
      pointer.press.moved = true;
    if (pointer.drag && pointer.press && pointer.press.moved){
      if (view.mode === 'walk'){
        player.yaw   -= (e.clientX - pointer.drag.x) * 0.0045;
        player.pitch  = clamp(player.pitch - (e.clientY - pointer.drag.y) * 0.0038, -1.45, 1.45);
      } else {
        orbit.theta -= (e.clientX - pointer.drag.x) * 0.006;
        orbit.phi    = clamp(orbit.phi - (e.clientY - pointer.drag.y) * 0.005, 0.12, 1.5);
      }
      pointer.drag = {x:e.clientX, y:e.clientY};
      return;
    }
    if (focus.lbShot) return;
    focus.hoverShot = pointer.lockLook ? null : shotAt(e.clientX, e.clientY);
    if (view.mode === 'walk' && !pointer.lockLook) nav.hover = focus.hoverShot ? null : floorPoint(e.clientX, e.clientY);
    syncCursor();
  });
  addEventListener('mouseup', e => {
    // A press that never moved is a click. A click on a photograph opens it; a
    // click on the floor is a destination.
    if (pointer.press && !pointer.press.moved && !focus.lbShot){
      const ph = pointer.lockLook ? shotAt(innerWidth/2, innerHeight/2) : shotAt(e.clientX, e.clientY);
      if (ph){
        openShot(ph);
        pointer.drag = null; pointer.press = null; syncCursor();
        return;
      }
      if (view.mode === 'walk' && !pointer.lockLook){
        const t = floorPoint(e.clientX, e.clientY);
        if (t){ nav.goTarget = t; nav.stuckT = 0; }
        // Nothing to walk to means you clicked up at a wall, and a wall answers
        // with the photographs its paint was lifted out of.
        else {
          const w = wallShotAt(e.clientX, e.clientY);
          if (w){ openShot(w); pointer.drag = null; pointer.press = null; syncCursor(); return; }
        }
      }
    }
    pointer.drag = null; pointer.press = null;
    syncCursor();
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (view.mode === 'view'){ orbit.dist = clamp(orbit.dist + e.deltaY * 0.02, 8, 70); return; }
    const step = clamp(-e.deltaY * 0.012, -1.6, 1.6);
    const from = nav.goTarget || {x:player.x, z:player.z};
    const t = {x: from.x - Math.sin(player.yaw)*step, z: from.z - Math.cos(player.yaw)*step};
    if (onFloor(levels[player.level], t.x, t.z)){ nav.goTarget = t; nav.stuckT = 0; }
  }, {passive:false});
  // touch: left half drives, right half looks
  canvas.addEventListener('touchstart', e => {
    for (const t of e.changedTouches){
      if (view.mode === 'view'){ pointer.drag = {x:t.clientX, y:t.clientY}; continue; }
      if (t.clientX < innerWidth/2 && !pointer.stick) pointer.stick = {id:t.identifier, x:t.clientX, y:t.clientY, dx:0, dy:0};
      else if (!pointer.look) pointer.look = {id:t.identifier, x:t.clientX, y:t.clientY};
    }
  }, {passive:true});
  canvas.addEventListener('touchmove', e => {
    for (const t of e.changedTouches){
      if (view.mode === 'view' && pointer.drag){
        orbit.theta -= (t.clientX - pointer.drag.x) * 0.008;
        orbit.phi    = clamp(orbit.phi - (t.clientY - pointer.drag.y) * 0.006, 0.12, 1.5);
        pointer.drag = {x:t.clientX, y:t.clientY};
      }
      if (pointer.stick && t.identifier === pointer.stick.id){
        pointer.stick.dx = clamp((t.clientX - pointer.stick.x)/60, -1, 1);
        pointer.stick.dy = clamp((t.clientY - pointer.stick.y)/60, -1, 1);
      }
      if (pointer.look && t.identifier === pointer.look.id){
        player.yaw   -= (t.clientX - pointer.look.x) * 0.006;
        player.pitch  = clamp(player.pitch - (t.clientY - pointer.look.y) * 0.005, -1.45, 1.45);
        pointer.look = {id:pointer.look.id, x:t.clientX, y:t.clientY};
      }
    }
  }, {passive:true});
  canvas.addEventListener('touchend', e => {
    for (const t of e.changedTouches){
      if (pointer.stick && t.identifier === pointer.stick.id) pointer.stick = null;
      if (pointer.look && t.identifier === pointer.look.id) pointer.look = null;
      pointer.drag = null;
    }
  }, {passive:true});
}

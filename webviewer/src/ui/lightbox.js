import { $ } from '../core/util.js';
import { focus } from '../core/state.js';
import { paintShot, syncCursor } from './modes.js';

export function openShot(ph){
  focus.lbShot = ph;
  document.exitPointerLock?.();
  $('lb-img').src = ph.src;
  $('lb-img').alt = ph.room + ' — ' + (ph.caption || 'room photograph');
  $('lb-room').textContent = ph.room;
  $('lb-cap').textContent = ph.caption || '';
  $('lb-of').textContent = `${ph.index + 1} / ${ph.room_.shots.length}`;
  const many = ph.room_.shots.length > 1;
  $('lb-prev').hidden = $('lb-next').hidden = !many;
  $('lb').hidden = false;
  paintShot();
}
export function stepShot(d){
  if (!focus.lbShot) return;
  const list = focus.lbShot.room_.shots;
  openShot(list[(focus.lbShot.index + d + list.length) % list.length]);
}
export function closeShot(){
  focus.lbShot = null;
  $('lb').hidden = true;
  $('lb-img').removeAttribute('src');
  focus.hoverShot = null;
  syncCursor();
}

export function initLightbox(){
  $('lb-x').onclick = closeShot;
  $('lb-prev').onclick = () => stepShot(-1);
  $('lb-next').onclick = () => stepShot(1);
  $('lb').addEventListener('mousedown', e => { if (e.target === $('lb')) closeShot(); });
}

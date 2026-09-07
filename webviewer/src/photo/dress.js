import { dressDaylight } from './daylight.js';
import { dressArchitecture } from '../scene/architecture.js';
import { $ } from '../core/util.js';
import { levels } from '../scene/levels.js';
import { dressWalls, dressSlabs, dressFittings, setSurfaces } from '../scene/dressing.js';
import { photoRooms } from './rooms.js';
import { dressRoom, computeAverage, canReadPixels } from './relight.js';
import { bakeSky } from './sky.js';
import { buildOutdoors } from './outside.js';
import { hangPrints, setPrints } from './prints.js';

// Everything the photographs pay for, in the order it has to happen. They are
// already in the file as data URIs, so this is a decode, not a fetch — a few
// hundred milliseconds during which the house is the flat survey it was before.
export function dressHouse(){
  if (!photoRooms.length){
    for (const id of ['surftog','surftog2','printtog','printtog2']) $(id).hidden = true;
    return;
  }
  let left = 0, started = false;
  const flat = why => {
    console.warn('storeywalk: ' + why + ' The house stays the flat survey. Serve '
      + 'the folder (npm start), or build with --inline-photos for one portable file.');
    for (const id of ['surftog','surftog2','printtog','printtog2']) $(id).hidden = true;
  };
  const settle = () => {
    if (--left > 0) return;
    const first = photoRooms.flatMap(r => r.shots).find(ph => ph.img);
    if (!first) return flat('none of the photographs loaded.');
    if (!canReadPixels(first.img))
      return flat('the photographs are linked files and this page is not being served, '
                  + 'so the browser will not let their pixels be read.');
    for (const r of photoRooms) r.mats = dressRoom(r);
    // A room photographed from its doorway can show no floor at all — the
    // kitchen's bottom band is worktop — so photos.json may name a room to
    // borrow the boards from.
    for (const r of photoRooms){
      if (!r.floorFrom || !r.mats) continue;
      const donor = photoRooms.find(d => d.name === r.floorFrom && d.level === r.level);
      if (donor && donor.mats && donor.mats.floor) r.mats.floor = donor.mats.floor;
    }
    computeAverage();
    buildOutdoors();
    levels.forEach((L,i) => dressArchitecture(L,levels[i+1]));
    for (const L of levels){
      L.sky = bakeSky(L);
      dressWalls(L); dressSlabs(L); dressFittings(L);
      dressDaylight(L);
    }
    hangPrints();
    // The full-size decodes have done their work; hold only the canvases.
    for (const r of photoRooms) for (const ph of r.shots) ph.img = null;
    setSurfaces(true);
    setPrints(false);
  };
  for (const r of photoRooms) for (const ph of r.shots){
    left++;
    const img = new Image();
    img.onload = () => { ph.img = img; settle(); };
    img.onerror = settle;
    img.src = ph.src;
  }
  started = left > 0;
  if (!started) settle();
}

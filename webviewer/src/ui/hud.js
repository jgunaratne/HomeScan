import { $, titleise } from '../core/util.js';
import { HOUSE, PHOTOS } from '../core/data.js';
import { len, area } from '../core/units.js';
import { player } from '../core/state.js';
import { levels } from '../scene/levels.js';
import { roomAt } from '../photo/rooms.js';
import { spawnOn } from '../player/movement.js';

export function paintMeta(){
  const walls = HOUSE.levels.reduce((a,L) => a + L.walls.length, 0);
  const holes = HOUSE.levels.reduce((a,L) =>
    a + L.walls.reduce((b,w) => b + w.holes.length, 0), 0);
  const fits  = HOUSE.levels.reduce((a,L) => a + L.objects.length, 0);
  $('m-name').textContent = HOUSE.name;
  $('g-name').textContent = HOUSE.name;
  $('m-dev').textContent = [HOUSE.device, HOUSE.os && 'iOS ' + HOUSE.os]
    .filter(Boolean).join(' · ');
  const shots = PHOTOS ? PHOTOS.length : 0;
  $('g-counts').textContent =
    `${walls} walls, ${holes} door and window openings, ${fits} fittings`
    + (shots ? `, and ${shots} photographs the rooms take their surfaces from` : '');
  $('m-shots').hidden = !shots;
  $('m-nshots').textContent = shots;
  $('m-area').textContent = area(HOUSE.levels.reduce((a,L) => a + L.areaSqM, 0));
  const many = HOUSE.levels.length > 1;
  $('m-storeys').hidden = !many;
  if (many){
    $('m-nlev').textContent = HOUSE.levels.length;
    $('m-rise').textContent = len(HOUSE.storeyRise);
  }
}
export function paintStoreys(){
  const host = $('storeys');
  host.innerHTML = '';
  [...levels].reverse().forEach(L => {
    const i = levels.indexOf(L);
    const b = document.createElement('button');
    b.className = 'storey hit';
    b.setAttribute('aria-current', String(i === player.level));
    b.style.setProperty('--tint', '#' + L.tint.toString(16).padStart(6,'0'));
    b.innerHTML =
      `<span class="lvl">${L.elevation > 0 ? '+' : ''}${L.elevation.toFixed(2)}</span>` +
      `<span class="nm">${L.name}</span>` +
      `<span class="ar">${area(L.areaSqM)}</span>`;
    b.title = `${L.name} · ${L.walls.length} walls · ${len(L.ceiling)} ceiling`;
    b.onclick = () => spawnOn(i, HOUSE.stairs);
    host.appendChild(b);
  });
}

export function whereAmI(){
  const L = levels[player.level];
  // photos.json names rooms RoomPlan had no label for — great room, entry,
  // laundry — so it answers first where it has an answer.
  const room = roomAt(L, player.x, player.z);
  if (room) return room.name;
  let best = null, bd = 1e9;
  for (const s of L.sections){
    const d = Math.hypot(s.x - player.x, s.z - player.z);
    if (d < bd){ bd = d; best = s; }
  }
  return best ? titleise(best.label) : L.name;
}

import { HOUSE } from '../core/data.js';
import { player, nav } from '../core/state.js';
import { onFloor } from '../core/geometry.js';
import { levels } from '../scene/levels.js';
import { ring } from './pointing.js';
import { paintStoreys } from '../ui/hud.js';
import { paintGap } from '../ui/modes.js';

export function spawnOn(i, at){
  const L = levels[i];
  player.level = i;
  const ok = at && onFloor(L, at.x, at.z);
  player.x = ok ? at.x : L.spawn.x;
  player.z = ok ? at.z : L.spawn.z;
  player.vx = player.vz = 0;
  if (!ok) player.yaw = Math.atan2(-(0 - player.x), -(0 - player.z)) + Math.PI;
  nav.lastGood = {x:player.x, z:player.z};
  nav.goTarget = null; nav.hover = null; nav.stuckT = 0;
  ring.material.color.setHex(L.tint);
  document.documentElement.style.setProperty('--accent',
    '#' + L.tint.toString(16).padStart(6,'0'));
  paintStoreys();
  paintGap();
}

export function stairsNear(){
  if (!HOUSE.stairs) return false;
  return Math.hypot(player.x - HOUSE.stairs.x, player.z - HOUSE.stairs.z) < 2.4;
}

export function useStairs(){
  const to = player.level === 0 ? 1 : 0;
  spawnOn(to, HOUSE.stairs);
}

import { clamp } from '../core/util.js';
import { BODY_R } from '../core/constants.js';
import { onFloor } from '../core/geometry.js';
import { levels } from '../scene/levels.js';

export function pushOut(p, it, r){
  const c = Math.cos(it.yaw), s = Math.sin(it.yaw);
  const dx = p.x - it.x, dz = p.z - it.z;
  const lx = dx*c - dz*s, lz = dx*s + dz*c;
  const qx = clamp(lx, -it.hx, it.hx), qz = clamp(lz, -it.hz, it.hz);
  let ox = lx - qx, oz = lz - qz;
  let d = Math.hypot(ox, oz);
  if (d > r) return;
  if (d < 1e-6){                     // centre is inside the box: leave by the nearest face
    const gx = it.hx - Math.abs(lx), gz = it.hz - Math.abs(lz);
    const nlx = gx < gz ? (Math.sign(lx) || 1) * (it.hx + r) : lx;
    const nlz = gx < gz ? lz : (Math.sign(lz) || 1) * (it.hz + r);
    p.x = it.x + nlx*c + nlz*s;
    p.z = it.z - nlx*s + nlz*c;
    return;
  }
  const k = (r - d)/d;
  const nlx = lx + ox*k, nlz = lz + oz*k;
  p.x = it.x + nlx*c + nlz*s;
  p.z = it.z - nlx*s + nlz*c;
}

export function blocks(px, pz, it, r){
  const c = Math.cos(it.yaw), s = Math.sin(it.yaw);
  const dx = px - it.x, dz = pz - it.z;
  const lx = dx*c - dz*s, lz = dx*s + dz*c;
  return Math.hypot(lx - clamp(lx,-it.hx,it.hx), lz - clamp(lz,-it.hz,it.hz)) < r;
}

// Flood the floor from the spawn point. Anything left over is floor the scan
// enclosed with no way in — a capture gap, not a rendering fault, and the app
// should say which rather than let it read as a missing door.
export function detectSealed(L){
  const g = 0.15, b = L.bounds;
  const nx = Math.ceil((b.x1-b.x0)/g), nz = Math.ceil((b.z1-b.z0)/g);
  const free = new Uint8Array(nx*nz);
  for (let j=0;j<nz;j++) for (let i=0;i<nx;i++){
    const x = b.x0+(i+0.5)*g, z = b.z0+(j+0.5)*g;
    if (!onFloor(L, x, z)) continue;
    let ok = true;
    for (const bl of L.blockers) if (blocks(x, z, bl, BODY_R*0.75)){ ok = false; break; }
    if (ok) free[j*nx+i] = 1;
  }
  const si = clamp(Math.round((L.spawn.x-b.x0)/g-0.5), 0, nx-1);
  const sj = clamp(Math.round((L.spawn.z-b.z0)/g-0.5), 0, nz-1);
  const seen = new Uint8Array(nx*nz), st = [sj*nx+si];
  seen[st[0]] = 1;
  while (st.length){
    const k = st.pop(), i = k%nx, j = (k-i)/nx;
    for (const [a,c] of [[i+1,j],[i-1,j],[i,j+1],[i,j-1]]){
      if (a<0||c<0||a>=nx||c>=nz) continue;
      const m = c*nx+a;
      if (seen[m] || !free[m]) continue;
      seen[m] = 1; st.push(m);
    }
  }
  const cells = [];
  for (let k=0;k<free.length;k++) if (free[k] && !seen[k]) cells.push(k);
  return {g, nx, b, cells, area: cells.length*g*g};
}

// Run once the storeys are built: each one learns which of its floor it walled
// off from the spawn point.
export function markSealed(){
  for (const L of levels) L.sealed = detectSealed(L);
}

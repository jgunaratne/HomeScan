import { clamp } from '../core/util.js';
import { onFloor } from '../core/geometry.js';

// A connected-floor visibility bake supplies low-frequency indirect bounce
// to the directional daylight volume. Walls stop propagation; openings allow
// light to reach neighbouring rooms. Direct window light is handled in 3D by
// daylight.js, so this planar term only stands in for diffuse interreflection.
const SKY_G = 0.16;          // metres per cell
const SKY_RAYS = 24;
const SKY_FAR = 26;          // metres a ray walks before it counts as out

export function bakeSky(L){
  const b = L.bounds, pad = 1.2;
  const x0 = b.x0 - pad, z0 = b.z0 - pad;
  const nx = Math.ceil((b.x1 - b.x0 + pad*2)/SKY_G);
  const nz = Math.ceil((b.z1 - b.z0 + pad*2)/SKY_G);
  const solid = new Uint8Array(nx*nz);

  // Stamp a wall segment's footprint into the grid, or clear an opening's.
  const stamp = (cx, cz, yaw, hw, val) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const steps = Math.ceil(hw*2/(SKY_G*0.5)) + 1;
    for (let i=0;i<=steps;i++){
      const t = -hw + (2*hw)*i/steps;
      for (let o=-1;o<=1;o++){
        const px = cx + c*t + s*o*SKY_G*0.6, pz = cz - s*t + c*o*SKY_G*0.6;
        const gi = Math.round((px - x0)/SKY_G), gj = Math.round((pz - z0)/SKY_G);
        if (gi >= 0 && gj >= 0 && gi < nx && gj < nz) solid[gj*nx + gi] = val;
      }
    }
  };
  for (const w of L.walls) stamp(w.c[0], w.c[2], w.yaw, w.w/2, 1);
  for (const w of L.walls){
    for (const h of w.holes){
      const mid = (h.x0 + h.x1)/2;
      stamp(w.c[0] + Math.cos(w.yaw)*mid, w.c[2] - Math.sin(w.yaw)*mid,
            w.yaw, (h.x1 - h.x0)/2, 0);
    }
  }

  const sky = new Float32Array(nx*nz);
  const dirs = [];
  for (let a=0;a<SKY_RAYS;a++){
    const t = (a + 0.5)/SKY_RAYS*Math.PI*2;
    dirs.push([Math.cos(t), Math.sin(t)]);
  }
  const maxStep = Math.ceil(SKY_FAR/SKY_G);
  for (let j=0;j<nz;j++) for (let i=0;i<nx;i++){
    if (solid[j*nx + i]) continue;
    const px = x0 + i*SKY_G, pz = z0 + j*SKY_G;
    if (!onFloor(L, px, pz)) continue;
    let open = 0;
    for (const [dx, dz] of dirs){
      let k = 1;
      for (; k<=maxStep; k++){
        const gi = Math.round((px + dx*k*SKY_G - x0)/SKY_G);
        const gj = Math.round((pz + dz*k*SKY_G - z0)/SKY_G);
        if (gi < 0 || gj < 0 || gi >= nx || gj >= nz){ open++; break; }
        if (solid[gj*nx + gi]) break;
        // Out of the footprint and past the walls: this ray reached daylight.
        if (!onFloor(L, px + dx*k*SKY_G, pz + dz*k*SKY_G)){ open++; break; }
      }
      if (k > maxStep) open++;
    }
    sky[j*nx + i] = open/SKY_RAYS;
  }

  // Diffuse a reflected daylight term through connected free cells. Solid
  // walls stop propagation; doorways carry light into neighbouring spaces.
  // This is a static approximation of bounce, not a global illumination solve.
  const inside = new Uint8Array(nx*nz);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)
    inside[j*nx+i]=!solid[j*nx+i]&&onFloor(L,x0+i*SKY_G,z0+j*SKY_G)?1:0;
  let bounce=Float32Array.from(sky);
  for(let pass=0;pass<40;pass++){
    const next=Float32Array.from(bounce);
    for(let j=1;j<nz-1;j++)for(let i=1;i<nx-1;i++){
      const k=j*nx+i;if(!inside[k])continue;
      let sum=0,n=0;
      for(const neighbour of [k-1,k+1,k-nx,k+nx]){
        if(!inside[neighbour])continue;
        sum+=bounce[neighbour];n++;
      }
      if(n)next[k]=Math.max(sky[k],sum/n*0.985);
    }
    bounce=next;
  }
  for(let k=0;k<sky.length;k++)if(inside[k])sky[k]=sky[k]*0.55+bounce[k]*0.45;
  // Smooth ray quantisation without pulling dark wall cells into the room.
  for(let pass=0;pass<3;pass++){
    const next=Float32Array.from(sky);
    for(let j=1;j<nz-1;j++)for(let i=1;i<nx-1;i++){
      const k=j*nx+i;if(!inside[k])continue;
      let sum=sky[k]*2,n=2;
      for(const neighbour of [k-1,k+1,k-nx,k+nx]){
        if(!inside[neighbour])continue;
        sum+=sky[neighbour];n++;
      }
      next[k]=sum/n;
    }
    sky.set(next);
  }

  // A cell inside a wall has no value of its own; borrow the brightest of its
  // neighbours so surfaces sampled at the wall line are not black.
  const grown = Float32Array.from(sky);
  for (let j=0;j<nz;j++) for (let i=0;i<nx;i++){
    if (!solid[j*nx + i]) continue;
    let m = 0;
    for (let dj=-2;dj<=2;dj++) for (let di=-2;di<=2;di++){
      const a = i + di, c = j + dj;
      if (a < 0 || c < 0 || a >= nx || c >= nz) continue;
      if (sky[c*nx + a] > m) m = sky[c*nx + a];
    }
    grown[j*nx + i] = m;
  }
  return {g:SKY_G, x0, z0, nx, nz, v:grown};
}

// Bilinear, and generous at the edges: this is a lighting term, not a lookup.
export function skyAt(S, x, z){
  const fx = (x - S.x0)/S.g, fz = (z - S.z0)/S.g;
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const at = (a, c) => {
    a = clamp(a, 0, S.nx - 1); c = clamp(c, 0, S.nz - 1);
    return S.v[c*S.nx + a];
  };
  return (at(i, j)*(1 - tx) + at(i + 1, j)*tx)*(1 - tz) +
         (at(i, j + 1)*(1 - tx) + at(i + 1, j + 1)*tx)*tz;
}

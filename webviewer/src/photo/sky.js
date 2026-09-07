import { clamp } from '../core/util.js';
import { onFloor } from '../core/geometry.js';

// One hemisphere light means a corner eight metres from the glazing is exactly
// as bright as the sill, and that is the most artificial thing left in the
// frame. There is no global illumination here, but the plan knows where the
// light gets in: solid wall stops it, an opening does not. So each storey is
// rasterised once — walls blocked, every door, window and opening punched back
// open — and from each cell a fan of rays is walked until it hits something or
// leaves the building. The fraction that get out is how much sky that spot can
// see, and it is baked into the vertex colours of the walls, floors and
// ceilings. Rooms then go bright at the glass and fall away into their corners
// because of where the windows are, not because a number was chosen.
const SKY_G = 0.16;          // metres per cell
const SKY_RAYS = 24;
const SKY_FAR = 26;          // metres a ray walks before it counts as out
const SKY_FLOOR = 0.46;      // no surface goes fully dark

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
function skyAt(S, x, z){
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

// Smooth value noise, metres in. Real paint on real plaster is never one tone
// across four metres, and the eye reads perfectly even colour as plastic.
function mottle(x, z){
  const h = (a, b) => {
    const n = Math.sin(a*127.1 + b*311.7)*43758.5453;
    return n - Math.floor(n);
  };
  const f = (sx, sz) => {
    const i = Math.floor(sx), j = Math.floor(sz);
    const tx = sx - i, tz = sz - j;
    const u = tx*tx*(3 - 2*tx), v = tz*tz*(3 - 2*tz);
    return (h(i, j)*(1 - u) + h(i + 1, j)*u)*(1 - v) +
           (h(i, j + 1)*(1 - u) + h(i + 1, j + 1)*u)*v;
  };
  return f(x*0.42, z*0.42)*0.68 + f(x*1.35, z*1.35)*0.32;
}

// Paint the term into a geometry's vertex colours. Ceilings sit deeper than
// floors because light arrives from below and from the window head, and a
// ceiling that reads as bright as its floor is the giveaway of a fake room.
export function paintSky(geo, S, obj, lift, grain){
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count*3);
  const v = new THREE.Vector3();
  for (let i=0;i<pos.count;i++){
    v.fromBufferAttribute(pos, i);
    if (obj) obj.localToWorld(v);
    const s = Math.pow(clamp(skyAt(S, v.x, v.z), 0, 1), 0.78)*lift;
    let c = clamp(SKY_FLOOR + (1 - SKY_FLOOR)*s, 0, 1);
    if (grain) c *= 1 + (mottle(v.x + v.y*0.7, v.z) - 0.5)*grain;
    col[i*3] = col[i*3 + 1] = col[i*3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

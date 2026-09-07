import { MAT } from './materials.js';

// RoomPlan reports a fitting as a category, a size and a transform: a sofa is a
// 1.94 x 1.05 x 0.85 box that knows it is a sofa. That is exactly the input a
// parametric maker wants, so rather than draw the box, each category is built
// out of it — a sofa as base, back, arms and cushions; a run of storage as
// carcass, door fronts, toe kick and worktop. Nothing here is measured; the
// proportions are the ordinary ones, hung on dimensions that are real.
//
// The survey keeps the boxes. A block is the honest drawing of a bounding box,
// and this is not that.
export function box(mat, w, h, d, x, y, z){
  // Project a subdivided box onto a rounded box: actual bevels catch light.
  w = Math.max(w, 0.006); h = Math.max(h, 0.006); d = Math.max(d, 0.006);
  const soft = mat === MAT.fabric || mat === MAT.linen || mat === MAT.accent;
  const r = Math.min(w, h, d)* (soft ? 0.24 : 0.10);
  const geo = new THREE.BoxGeometry(w, h, d, soft ? 6 : 4, soft ? 6 : 4, soft ? 6 : 4);
  const pos = geo.attributes.position, normal = geo.attributes.normal;
  const v = new THREE.Vector3(), core = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i=0; i<pos.count; i++){
    v.fromBufferAttribute(pos, i);
    // Put vertices at the bevel boundary, leaving the middle of every face
    // planar. Uniform subdivisions smeared corner normals across whole boards.
    const edgeCoordinate=(value,extent)=>{
      const t=value/(extent/2),a=Math.abs(t),sign=Math.sign(t);
      if(a<0.01)return 0;
      if(a>0.99)return sign*extent/2;
      return sign*(extent/2-r*(soft&&a>0.5?0.3:1));
    };
    v.set(edgeCoordinate(v.x,w),edgeCoordinate(v.y,h),edgeCoordinate(v.z,d));
    core.set(THREE.MathUtils.clamp(v.x, -w/2+r, w/2-r),
             THREE.MathUtils.clamp(v.y, -h/2+r, h/2-r),
             THREE.MathUtils.clamp(v.z, -d/2+r, d/2-r));
    n.copy(v).sub(core).normalize();
    v.copy(core).addScaledVector(n, r);
    pos.setXYZ(i, v.x, v.y, v.z); normal.setXYZ(i, n.x, n.y, n.z);
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
export function tube(mat, r, len, x, y, z, axis){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
  m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI/2;
  if (axis === 'z') m.rotation.x = Math.PI/2;
  return m;
}

function cushionSeam(g, w, d, x, y, z){
  const r = Math.min(w,d)*0.09, points = [];
  for (let corner=0;corner<4;corner++){
    const angle = corner*Math.PI/2;
    const cx = (corner===0 || corner===3 ? 1 : -1)*(w/2-r);
    const cz = (corner<2 ? 1 : -1)*(d/2-r);
    for (let i=0;i<=4;i++){
      const a = angle+i*Math.PI/8;
      points.push(new THREE.Vector3(cx+Math.cos(a)*r,0,cz+Math.sin(a)*r));
    }
  }
  const curve = new THREE.CatmullRomCurve3(points, true);
  const seam = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.002, 4, true), MAT.fabric);
  seam.position.set(x,y,z); g.add(seam);
}

// Which way a fitting faces: away from whatever wall it is standing against.
// RoomPlan's own axis does not say, and a fridge with its doors to the wall is
// worse than a box.
export function facing(L, o){
  let distance=Infinity,offset=null;
  const fx=Math.sin(o.yaw),fz=Math.cos(o.yaw);
  for(const b of L.blockers){
    const c=Math.cos(b.yaw),s=Math.sin(b.yaw);
    if(Math.abs(fx*s+fz*c)<0.65)continue;
    const dx=o.c[0]-b.x,dz=o.c[2]-b.z;
    const lx=c*dx-s*dz,lz=s*dx+c*dz;
    const px=Math.max(-b.hx,Math.min(b.hx,lx)),pz=Math.max(-b.hz,Math.min(b.hz,lz));
    const vx=dx-(c*px+s*pz),vz=dz-(-s*px+c*pz),d=Math.hypot(vx,vz);
    if(d<distance){distance=d;offset=[vx,vz];}
  }
  if(!offset||distance>2.6)return 1;
  return offset[0]*fx+offset[1]*fz>=0?1:-1;
}

// Door and drawer fronts across a carcass, with a reveal between them and a
// handle on each. This is what makes a run of kitchen units read as kitchen.
export function fronts(g, mat, w, h, d, y, f, handles){
  const n = Math.max(1, Math.round(w/0.52));
  const gap = 0.009, fw = (w - gap*(n + 1))/n;
  for (let i=0;i<n;i++){
    const x = -w/2 + gap*(i + 1) + fw*(i + 0.5);
    g.add(box(mat, fw, h - gap*2, 0.019, x, y, f*(d/2 + 0.008)));
    if (h > 0.25){
      const rail = Math.min(0.045, fw*0.14);
      for (const side of [-1, 1]){
        g.add(box(mat, rail, h-gap*2, 0.009, x+side*(fw-rail)/2, y, f*(d/2+0.022)));
        g.add(box(mat, fw-rail*2, rail, 0.009, x, y+side*(h-gap*2-rail)/2, f*(d/2+0.022)));
      }
    }
    if (handles)
      g.add(tube(MAT.steel, 0.008, Math.min(fw*0.5, 0.14),
                 x, y + h*0.5 - 0.055, f*(d/2 + 0.03), 'x'));
  }
}

export const FITTING = {
  sofa(g, w, h, d, f){
    const y0 = -h/2, at = (a, b) => y0 + h*(a + b)/2, hi = (a, b) => h*(b - a);
    const arm = Math.min(0.17, w*0.13), bk = Math.min(0.19, d*0.24);
    g.add(box(MAT.fabric, w, hi(0.16, 0.50), d, 0, at(0.16, 0.50), 0));
    const count = Math.max(2, Math.round(w/0.72)), cw = (w-arm*2)/count;
    for (let i=0; i<count; i++){
      const x = -(w-arm*2)/2 + cw*(i+0.5);
      g.add(box(MAT.fabric, cw-0.018, h*0.18, d-bk-0.035, x, at(0.49,0.67), f*bk/2));
      cushionSeam(g, cw-0.032, d-bk-0.049, x, at(0.49,0.67)+h*0.06, f*bk/2);
      const back = box(MAT.fabric, cw-0.015, h*0.43, bk, x, at(0.57,1), -f*(d-bk)/2);
      back.rotation.x = -f*0.10; g.add(back);
    }
    for (const s of [-1, 1]){
      g.add(box(MAT.fabric, arm, hi(0.16, 0.78), d, s*(w-arm)/2, at(0.16,0.78), 0));
      const pillow = box(s < 0 ? MAT.accent : MAT.linen, Math.min(w*0.23,0.42), h*0.36, 0.14,
        s*(w/2-arm-0.18), at(0.63,0.99), -f*d*0.17);
      pillow.rotation.set(-f*0.18, s*0.12, s*0.14); g.add(pillow);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(MAT.wood, 0.05, h*0.16, 0.05, sx*(w/2 - 0.08), y0 + h*0.08, sz*(d/2 - 0.08)));
  },
  bed(g, w, h, d, f){
    const y0 = -h/2, at = (a, b) => y0 + h*(a + b)/2, hi = (a, b) => h*(b - a);
    const head = -f;                       // the headboard goes against the wall
    g.add(box(MAT.wood, w, hi(0.10, 0.44), d, 0, at(0.10, 0.44), 0));
    g.add(box(MAT.linen, w*0.98, hi(0.44, 0.78), d*0.98, 0, at(0.44, 0.78), 0));
    const quilt = box(MAT.fabric, w*0.99, hi(0.76, 0.86), d*0.66, 0, at(0.76, 0.86), -head*d*0.16);
    const qp = quilt.geometry.attributes.position;
    for (let i=0;i<qp.count;i++){
      const x = qp.getX(i), z = qp.getZ(i);
      const fade = Math.max(0, 1-Math.abs(x)/(w*0.495));
      qp.setY(i, qp.getY(i)+Math.sin(x/w*24+z/d*3)*Math.min(0.012,h*0.018)*fade);
    }
    quilt.geometry.computeVertexNormals();
    g.add(quilt);
    g.add(box(MAT.linen, w*0.98, h*0.045, d*0.12, 0, at(0.85,0.895), head*d*0.12));
    for (const s of [-1, 1])
      g.add(box(MAT.linen, w*0.42, hi(0.78, 0.90), d*0.17,
                s*w*0.24, at(0.78, 0.90), head*(d/2 - d*0.11)));
    g.add(box(MAT.wood, w, h*0.95, 0.055, 0, y0 + h*0.62, head*(d/2 + 0.03)));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(MAT.wood, 0.06, h*0.10, 0.06, sx*(w/2 - 0.08), y0 + h*0.05, sz*(d/2 - 0.08)));
  },
  table(g, w, h, d){
    const y0 = -h/2, t = Math.min(0.05, h*0.14), leg = Math.min(0.07, w*0.12);
    g.add(box(MAT.wood, w, t, d, 0, y0 + h - t/2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(MAT.wood, leg, h - t, leg,
                sx*(w/2 - leg*0.8), y0 + (h - t)/2, sz*(d/2 - leg*0.8)));
  },
  chair(g, w, h, d, f){
    const y0 = -h/2, at = (a, b) => y0 + h*(a + b)/2, hi = (a, b) => h*(b - a);
    g.add(box(MAT.wood, w, 0.045, d, 0, y0 + h*0.47, 0));
    g.add(box(MAT.wood, w*0.92, hi(0.49, 1.0), 0.042, 0, at(0.49, 1.0), -f*(d/2 - 0.03)));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(MAT.wood, 0.038, h*0.47, 0.038,
                sx*(w/2 - 0.045), y0 + h*0.235, sz*(d/2 - 0.045)));
  },
  storage(g, w, h, d, f, base){
    const y0 = -h/2;
    if (h > 1.5){                                        // wardrobe or tall unit
      g.add(box(MAT.white, w, h - 0.09, d - 0.03, 0, y0 + 0.09 + (h - 0.09)/2, 0));
      g.add(box(MAT.trim, w, 0.09, d - 0.12, 0, y0 + 0.045, -f*0.045));
      fronts(g, MAT.white, w, h - 0.13, d - 0.03, y0 + 0.09 + (h - 0.09)/2, f, true);
    } else if (base > 1.05){                             // hung on the wall
      g.add(box(MAT.white, w, h, d - 0.02, 0, 0, 0));
      fronts(g, MAT.white, w, h - 0.02, d - 0.02, 0, f, true);
    } else {                                             // base unit, with a top
      const toe = Math.min(0.11, h*0.14), top = 0.038;
      const carc = h - toe - top;
      g.add(box(MAT.trim, w, toe, d - 0.09, 0, y0 + toe/2, -f*0.045));
      g.add(box(MAT.white, w, carc, d, 0, y0 + toe + carc/2, 0));
      fronts(g, MAT.white, w, carc - 0.012, d, y0 + toe + carc/2, f, true);
      g.add(box(MAT.stone, w + 0.02, top, d + 0.026, 0, y0 + h - top/2, f*0.013));
    }
  },
  refrigerator(g, w, h, d, f){
    const y0 = -h/2;
    g.add(box(MAT.steel, w, h, d, 0, 0, 0));
    for (const [a, b] of [[0.02, 0.60], [0.64, 0.98]]){
      g.add(box(MAT.steel, w - 0.02, h*(b - a), 0.026, 0, y0 + h*(a + b)/2, f*(d/2 + 0.012)));
    }
    for (const yy of [y0 + h*0.52, y0 + h*0.72])
      g.add(tube(MAT.steel, 0.011, h*0.2, w*0.32, yy, f*(d/2 + 0.045), 'y'));
  },
  oven(g, w, h, d, f){
    const y0 = -h/2;
    g.add(box(MAT.steel, w, h, d, 0, 0, 0));
    g.add(box(MAT.screen, w*0.82, h*0.52, 0.02, 0, y0 + h*0.44, f*(d/2 + 0.016)));
    g.add(tube(MAT.steel, 0.012, w*0.86, 0, y0 + h*0.76, f*(d/2 + 0.05), 'x'));
    g.add(box(MAT.steel, w, h*0.14, 0.02, 0, y0 + h*0.92, f*(d/2 + 0.012)));
    for (const x of [-w*0.32,w*0.32]){
      const dial = tube(MAT.dark,Math.min(w,h)*0.035,0.024,x,y0+h*0.92,f*(d/2+0.034),'z');
      g.add(dial);
    }
    g.add(box(MAT.screen,w*0.23,h*0.065,0.008,0,y0+h*0.92,f*(d/2+0.027)));
  },
  stove(g, w, h, d){
    g.add(box(MAT.screen, w, h, d, 0, 0, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(tube(MAT.trim, Math.min(w, d)*0.16, 0.006,
                 sx*w*0.24, h/2 + 0.004, sz*d*0.22, 'y'));
  },
  sink(g, w, h, d, f){
    const y0 = -h/2;
    // Open basin: rim, recessed bottom and four sides, never a solid cap.
    const rim = Math.min(w,d)*0.09;
    g.add(box(MAT.white, w, h*0.12, d, 0, y0+h*0.06, 0));
    for (const side of [-1,1]){
      g.add(box(MAT.white, rim, h, d, side*(w-rim)/2, 0, 0));
      g.add(box(MAT.white, w-rim*2, h, rim, 0, 0, side*(d-rim)/2));
    }
    g.add(tube(MAT.steel, Math.min(w,d)*0.055, 0.008, 0, y0+h*0.13, 0));
    g.add(tube(MAT.steel, 0.016, 0.24, 0, y0 + h + 0.12, -f*(d/2 - 0.05), 'y'));
    g.add(tube(MAT.steel, 0.014, d*0.5, 0, y0 + h + 0.23, -f*(d/2 - 0.05 - d*0.25), 'z'));
  },
  toilet(g, w, h, d, f){
    const y0 = -h/2, at = (a, b) => y0 + h*(a + b)/2, hi = (a, b) => h*(b - a);
    const pedestal = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), MAT.white);
    pedestal.scale.set(w*0.35,h*0.30,d*0.34);
    pedestal.position.set(0,y0+h*0.30,f*d*0.10); g.add(pedestal);
    const seat = new THREE.Mesh(new THREE.TorusGeometry(1,0.15,12,40), MAT.white);
    seat.rotation.x = Math.PI/2; seat.scale.set(w*0.36,d*0.32,h*0.22);
    seat.position.set(0,y0+h*0.59,f*d*0.10); g.add(seat);
    g.add(box(MAT.white,w*0.84,h*0.46,d*0.25,0,y0+h*0.76,-f*d*0.35));
    g.add(tube(MAT.steel,w*0.055,0.009,0,y0+h*0.995,-f*d*0.35));
  },
  washerDryer(g, w, h, d, f){
    const y0 = -h/2;
    const n = w > 1.0 ? 2 : 1, ww = w/n;
    for (let i=0;i<n;i++){
      const x = -w/2 + ww*(i + 0.5);
      g.add(box(MAT.white, ww - 0.012, h, d, x, 0, 0));
      const port = new THREE.Mesh(new THREE.CircleGeometry(Math.min(ww, h)*0.25, 40), MAT.screen);
      port.position.set(x, y0 + h*0.46, f*(d/2 + 0.011));
      port.rotation.y = f > 0 ? 0 : Math.PI;
      g.add(port);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(Math.min(ww,h)*0.27,0.025,10,40),MAT.steel);
      rim.position.copy(port.position); rim.position.z += f*0.012; g.add(rim);
      g.add(tube(MAT.steel,Math.min(ww,h)*0.035,0.025,x-ww*0.28,y0+h*0.9,f*(d/2+0.034),'z'));
      g.add(box(MAT.trim, ww - 0.06, h*0.11, 0.016, x, y0 + h*0.9, f*(d/2 + 0.009)));
    }
  },
  bathtub(g, w, h, d, f){
    FITTING.sink(g,w,h,d,f);
  },
  dishwasher(g, w, h, d, f){
    g.add(box(MAT.steel,w,h,d,0,0,0));
    g.add(box(MAT.dark,w*0.94,h*0.09,0.018,0,h*0.40,f*(d/2+0.01)));
    g.add(tube(MAT.steel,0.012,w*0.65,0,h*0.29,f*(d/2+0.045),'x'));
  },
  television(g, w, h, d, f){
    const y0 = -h/2;
    g.add(box(MAT.screen, w, h*0.94, Math.max(d, 0.035), 0, y0 + h*0.53, 0));
    g.add(box(MAT.screen, w*0.3, h*0.06, Math.max(d, 0.035)*2.4, 0, y0 + h*0.03, 0));
  },
};

// One fitting, built out. Returns null for anything with no maker, which keeps
// its box.
export function fitting(L, o){
  const make = FITTING[o.cat];
  if (!make) return null;
  const g = new THREE.Group();
  const f = facing(L, o);
  make(g, o.d[0], o.d[1], o.d[2], f, o.c[1] - o.d[1]/2 - L.elevation);
  if (!g.children.length) return null;
  g.position.set(o.c[0], o.c[1], o.c[2]);
  g.rotation.y = o.yaw;
  return g;
}

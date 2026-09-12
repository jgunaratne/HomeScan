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
export function box(mat, w, h, d, x, y, z, puff = 0){
  // Project a subdivided box onto a rounded box: actual bevels catch light.
  w = Math.max(w, 0.006); h = Math.max(h, 0.006); d = Math.max(d, 0.006);
  const soft = mat === MAT.fabric || mat === MAT.linen || mat === MAT.accent || !!mat.userData.soft;
  const r = Math.min(w, h, d)* (soft ? 0.3 : 0.10);
  const geo = new THREE.BoxGeometry(w, h, d, soft ? 6 : 4, soft ? 6 : 4, soft ? 6 : 4);
  const pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
  const v = new THREE.Vector3(), core = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i=0; i<pos.count; i++){
    v.fromBufferAttribute(pos, i);
    // UVs in metres, read off the flat box before it is rounded: which face a
    // vertex is on is which axis its normal points along, and the other two
    // coordinates are its place on that face. Every tile is sized in metres
    // to match, so grain and weave run at one scale across the house.
    const ax = Math.abs(normal.getX(i)), ay = Math.abs(normal.getY(i));
    if (ax > 0.5) uv.setXY(i, v.z, v.y);
    else if (ay > 0.5) uv.setXY(i, v.x, v.z);
    else uv.setXY(i, v.x, v.y);
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
    // A cushion is stuffed: its faces bow out toward their middles. `puff` is
    // how far, in metres, the centre of a face stands proud of its edges.
    if (puff > 0){
      const fx = Math.abs(v.x)/(w/2), fy = Math.abs(v.y)/(h/2), fz = Math.abs(v.z)/(d/2);
      const inner = ax > 0.5 ? (1-fy*fy)*(1-fz*fz) : ay > 0.5 ? (1-fx*fx)*(1-fz*fz) : (1-fx*fx)*(1-fy*fy);
      v.addScaledVector(n, puff*inner);
    }
    pos.setXYZ(i, v.x, v.y, v.z); normal.setXYZ(i, n.x, n.y, n.z);
  }
  if (puff > 0) geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
// A cushion: a soft box that bows out, by an eighth of its thinnest side.
export function cushion(mat, w, h, d, x, y, z){
  return box(mat, w, h, d, x, y, z, Math.min(w, h, d)*0.12);
}
export function tube(mat, r, len, x, y, z, axis){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
  m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI/2;
  if (axis === 'z') m.rotation.x = Math.PI/2;
  return m;
}

export function cushionSeam(g, w, d, x, y, z, mat = MAT.fabric){
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
  const seam = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.002, 4, true), mat);
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
// pull on each. This is what makes a run of kitchen units read as kitchen.
// The fronts are flat slabs: the renovation's joinery is handleless-looking,
// with a slim black edge pull rather than a Shaker frame and a bar.
export function fronts(g, mat, w, h, d, y, f, handles, opts = {}){
  const wide = opts.wide ?? 0.52;
  const n = opts.n ?? Math.max(1, Math.round(w/wide));
  const gap = 0.006, fw = (w - gap*(n + 1))/n;
  for (let i=0;i<n;i++){
    const x = -w/2 + gap*(i + 1) + fw*(i + 0.5);
    g.add(box(mat, fw, h - gap*2, 0.019, x, y, f*(d/2 + 0.008)));
    if (handles){
      // A drawer front takes its pull centred at the top; a door takes it at
      // the latch edge, high, as an edge pull would sit.
      const drawer = h < 0.36 || opts.drawers;
      const px = drawer ? x : x + (i < n/2 ? 1 : -1)*(fw/2 - 0.045);
      g.add(box(MAT.black, drawer ? Math.min(fw*0.45, 0.24) : 0.02, 0.011, 0.012,
                px, y + h/2 - gap - 0.028, f*(d/2 + 0.024)));
    }
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
    g.add(box(MAT.oak, w, t, d, 0, y0 + h - t/2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(MAT.oak, leg, h - t, leg,
                sx*(w/2 - leg*0.8), y0 + (h - t)/2, sz*(d/2 - leg*0.8)));
  },
  chair(g, w, h, d, f){
    const y0 = -h/2, at = (a, b) => y0 + h*(a + b)/2, hi = (a, b) => h*(b - a);
    g.add(box(MAT.oak, w, 0.045, d, 0, y0 + h*0.47, 0));
    g.add(box(MAT.oak, w*0.92, hi(0.49, 1.0), 0.042, 0, at(0.49, 1.0), -f*(d/2 - 0.03)));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(MAT.oak, 0.038, h*0.47, 0.038,
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
      const toe = Math.min(0.11, h*0.14), top = 0.02;
      const carc = h - toe - top;
      g.add(box(MAT.dark, w, toe, d - 0.09, 0, y0 + toe/2, -f*0.045));
      g.add(box(MAT.white, w, carc, d, 0, y0 + toe + carc/2, 0));
      fronts(g, MAT.white, w, carc - 0.012, d, y0 + toe + carc/2, f, true);
      g.add(box(MAT.quartz, w + 0.02, top, d + 0.026, 0, y0 + h - top/2, f*0.013));
    }
  },
  refrigerator(g, w, h, d, f){
    const y0 = -h/2;
    g.add(box(MAT.inox, w, h, d, 0, 0, 0));
    for (const [a, b] of [[0.02, 0.60], [0.64, 0.98]]){
      g.add(box(MAT.inox, w - 0.02, h*(b - a), 0.026, 0, y0 + h*(a + b)/2, f*(d/2 + 0.012)));
    }
    for (const yy of [y0 + h*0.52, y0 + h*0.72])
      g.add(tube(MAT.inox, 0.011, h*0.2, w*0.32, yy, f*(d/2 + 0.045), 'y'));
  },
  oven(g, w, h, d, f){
    const y0 = -h/2;
    g.add(box(MAT.inox, w, h, d, 0, 0, 0));
    g.add(box(MAT.screen, w*0.82, h*0.52, 0.02, 0, y0 + h*0.44, f*(d/2 + 0.016)));
    g.add(tube(MAT.inox, 0.012, w*0.86, 0, y0 + h*0.76, f*(d/2 + 0.05), 'x'));
    g.add(box(MAT.inox, w, h*0.14, 0.02, 0, y0 + h*0.92, f*(d/2 + 0.012)));
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
  // A rectangular undermount basin — a slab of porcelain with the bowl cut
  // out of it — and a tall black mixer behind it against the wall.
  sink(g, w, h, d, f){
    const y0 = -h/2;
    const rim = Math.min(w,d)*0.07;
    g.add(box(MAT.porcelain, w, h*0.12, d, 0, y0+h*0.06, 0));
    for (const side of [-1,1]){
      g.add(box(MAT.porcelain, rim, h, d, side*(w-rim)/2, 0, 0));
      g.add(box(MAT.porcelain, w-rim*2, h, rim, 0, 0, side*(d-rim)/2));
    }
    g.add(tube(MAT.black, Math.min(w,d)*0.045, 0.006, 0, y0+h*0.13, 0));
    g.add(tube(MAT.black, 0.014, 0.22, 0, y0 + h + 0.11, -f*(d/2 - 0.045), 'y'));
    g.add(tube(MAT.black, 0.011, d*0.42, 0, y0 + h + 0.21, -f*(d/2 - 0.045 - d*0.21), 'z'));
  },
  // A one-piece skirted toilet: a closed rounded skirt to the floor, a low
  // slim tank against the wall, and a thin seat.
  toilet(g, w, h, d, f){
    const y0 = -h/2;
    const skirt = box(MAT.porcelain, w*0.72, h*0.48, d*0.62, 0, y0+h*0.24, f*d*0.12);
    g.add(skirt);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), MAT.porcelain);
    bowl.scale.set(w*0.38, h*0.10, d*0.34);
    bowl.position.set(0, y0+h*0.48, f*d*0.12); g.add(bowl);
    const seat = new THREE.Mesh(new THREE.TorusGeometry(1,0.12,10,40), MAT.porcelain);
    seat.rotation.x = Math.PI/2; seat.scale.set(w*0.36, d*0.32, h*0.12);
    seat.position.set(0, y0+h*0.53, f*d*0.12); g.add(seat);
    g.add(box(MAT.porcelain, w*0.86, h*0.42, d*0.22, 0, y0+h*0.75, -f*d*0.37));
    g.add(box(MAT.black, w*0.14, 0.008, 0.03, w*0.25, y0+h*0.965, -f*d*0.37));
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
    g.add(box(MAT.inox,w,h,d,0,0,0));
    g.add(box(MAT.dark,w*0.94,h*0.09,0.018,0,h*0.40,f*(d/2+0.01)));
    g.add(box(MAT.black,w*0.8,0.014,0.014,0,h*0.29,f*(d/2+0.03)));
  },
  television(g, w, h, d, f, base){
    const y0 = -h/2, t = Math.min(d, 0.035);
    // A screen scanned well off the floor is on the wall, and gets a bracket
    // behind it rather than a stand under it: a stand stuck through the wall
    // was how a wall-mounted television used to be drawn.
    if (base > 0.3){
      g.add(box(MAT.screen, w, h*0.94, t, 0, y0 + h*0.5, f*(d/2 - t/2)));
      g.add(box(MAT.black, w*0.4, h*0.5, Math.max(0.006, d - t - 0.004), 0, y0 + h*0.5, -f*(t/2 + 0.002)));
      return;
    }
    g.add(box(MAT.screen, w, h*0.94, t, 0, y0 + h*0.53, 0));
    g.add(box(MAT.screen, w*0.3, h*0.06, t*2.4, 0, y0 + h*0.03, 0));
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

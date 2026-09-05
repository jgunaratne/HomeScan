import { clamp } from './util.js';

// Split a wall panel around its openings: sweep the width, then subtract each
// opening's height range from that column. Exact for the rectangular holes
// RoomPlan reports, and it is what makes a doorway something you can walk through.
export function panels(w, h, holes){
  const hw = w/2, hh = h/2;
  const cuts = new Set([-hw, hw]);
  for (const o of holes){ cuts.add(clamp(o.x0,-hw,hw)); cuts.add(clamp(o.x1,-hw,hw)); }
  const xs = [...cuts].sort((a,b)=>a-b), out = [];
  for (let i=0;i<xs.length-1;i++){
    const a = xs[i], b = xs[i+1];
    if (b-a < 0.02) continue;
    const mid = (a+b)/2;
    const spans = holes.filter(o => o.x0 <= mid && o.x1 >= mid)
      .map(o => [clamp(o.y0,-hh,hh), clamp(o.y1,-hh,hh)])
      .sort((p,q) => p[0]-q[0]);
    let y = -hh;
    for (const [y0,y1] of spans){
      if (y0 - y > 0.02) out.push({x0:a, x1:b, y0:y, y1:y0});
      y = Math.max(y, y1);
    }
    if (hh - y > 0.02) out.push({x0:a, x1:b, y0:y, y1:hh});
  }
  return out;
}

export function boxEdges(arr, cx,cy,cz, hx,hy,hz, yaw){
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = [];
  for (const sx of [-1,1]) for (const sy of [-1,1]) for (const sz of [-1,1])
    P.push([cx + c*sx*hx + s*sz*hz, cy + sy*hy, cz - s*sx*hx + c*sz*hz]);
  const E = [[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
  for (const [i,j] of E) arr.push(...P[i], ...P[j]);
}

export function shapeFrom(poly){
  const s = new THREE.Shape();
  poly.forEach(([x,z],i) => i ? s.lineTo(x,-z) : s.moveTo(x,-z));
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI/2);
  return g;
}

export function onFloor(L, x, z){ return L.floors.some(f => inside(f.poly, x, z)); }

export function inside(poly, x, z){
  let hit = false;
  for (let i=0, j=poly.length-1; i<poly.length; j=i++){
    const [xi,zi] = poly[i], [xj,zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj-xi)*(z-zi)/(zj-zi) + xi) hit = !hit;
  }
  return hit;
}

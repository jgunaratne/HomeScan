import { WALL_T } from '../core/constants.js';
import { surfaceTile, brickFace } from './textures.js';
import { MAT } from './materials.js';
import { box, tube } from './fittings.js';
import { avgMats } from '../photo/relight.js';
import { TILE } from '../photo/rooms.js';

// Explicit photo annotations supply the ascent and exposed side; RoomPlan's
// bounds alone cannot establish either. Geometry stays in the scan's footprint.
// `wallFace`, where the scan has a wall along the closed side, is where that
// wall's face stands across the flight (see wallAgainst): the flight is built
// up to it rather than to its own scanned edge, which the wall overlaps.
function stairFlight(o, elevation, rise, annotation, ceiling, wallFace){
  const g = new THREE.Group(), w = o.d[0], run = o.d[2];
  // Only the treads carry the oak flooring; the rest is painted trim.
  const timber=avgMats().floor.clone();
  // Floor UVs use tile units; stair boxes use metres. Preserve board scale.
  for (const key of ['map','normalMap','roughnessMap']){
    if (!timber[key]) continue;
    timber[key]=timber[key].clone();
    timber[key].repeat.multiplyScalar(1/TILE.floor);
    timber[key].needsUpdate=true;
  }
  const direction = annotation.riseToward === 1 ? 1 : -1;
  const side = annotation.railSide === -1 ? -1 : 1;
  const n = Math.max(3, Math.round(rise/0.18)), going = run/n, riser = rise/n;
  const zAt = t => direction*(-run/2+t*run), tAt = z => (direction*z + run/2)/run;
  // Across the flight, distances are measured toward the open side; X turns
  // one into the group's own x, whichever side the balustrade is on.
  const X = u => side*u;
  // The line of the nosings, as a height for any point along the flight:
  // everything else is set off it — the stringers' edges, the balusters'
  // feet, the handrail.
  const nosing = t => riser + t*rise;
  const STRINGER = 0.045, NOSE = 0.03, TREAD = 0.032;
  const pitch = Math.atan2(rise,run), cos = Math.cos(pitch), slope = Math.hypot(run,rise), tTop = (n-1)/n;
  const well = annotation.well, closet = annotation.closet, from = closet?.from ?? 0.45;
  // A bar laid along the flight at its pitch, from t0 to t1 of the run, its
  // centre `height` over the nosings.
  const sloped = (mat, sx, sy, x, t0, t1, height) => {
    const tm = (t0 + t1)/2, m = box(mat, sx, sy, slope*(t1 - t0), x, nosing(tm) + height, zAt(tm));
    m.rotation.x = -direction*pitch; g.add(m);
  };
  // Uprights of one kind as a single mesh — there are dozens of balusters —
  // each given as [x, bottom, top, z].
  const rods = (mat, r, list) => {
    if (!list.length) return;
    const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r, 1, 10), mat, list.length), at = new THREE.Object3D();
    list.forEach(([x, y0, y1, z], i) => {
      at.position.set(x, (y0 + y1)/2, z); at.scale.set(1, y1 - y0, 1); at.updateMatrix();
      m.setMatrixAt(i, at.matrix);
    });
    // Culled by one unit bar's bounds at the group's origin, the lot would
    // vanish whenever the middle of the flight left the screen.
    m.frustumCulled = false; g.add(m);
  };

  // Closed stringers, the way the photographs have them: deep painted boards,
  // the top edge 5 cm over the nosings and the bottom edge 27 cm under, so
  // the treads and risers are housed between them and the flight reads from
  // the room as one clean sloping band rather than a sawtooth of tread ends.
  // Cut plumb at the foot; at the head run level into the landing, a hair
  // over its last tread, and stopped just inside the edge of the floor above.
  const top = t => nosing(t) + 0.05, bottom = t => nosing(t) - 0.27;
  const level = rise + 0.003, zHead = zAt(1) + direction*0.045, zFoot = zAt(0) - direction*0.05;
  // The newel stands on the landing 3 cm behind its nosing; the bottom edge
  // meets the floor where the nosings are 27 cm up.
  const tPost = tTop + 0.03/run, tFloor = (0.27 - riser)/rise;
  const boardMat = MAT.trim.clone(); boardMat.side = THREE.DoubleSide;
  // A board standing in the flight's side from ua to ub across it, cut to an
  // outline of [z, y] points.
  const board = (pts, ua, ub) => {
    const shape = new THREE.Shape();
    pts.forEach(([z, y], k) => k ? shape.lineTo(z, y) : shape.moveTo(z, y));
    shape.closePath();
    const x0 = Math.min(X(ua), X(ub)), x1 = Math.max(X(ua), X(ub));
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {depth:x1 - x0, bevelEnabled:false}), boardMat);
    // The profile is drawn in (z, y) and turned to stand in the flight's
    // side; the extrusion then runs toward -x from the mesh's position.
    m.rotation.y = -Math.PI/2; m.position.x = x1;
    g.add(m);
  };
  const head = [[zHead, level], [zHead, bottom(tAt(zHead))], [zAt(tFloor), 0]];
  board([[zFoot, 0], [zFoot, top(tAt(zFoot))], [zAt(tPost), top(tPost)], [zAt(tPost), level], ...head], w/2 - STRINGER, w/2);
  // Against a wall the closed side is a skirt board, on the same lines but
  // run out past the foot until its top edge comes down to the room's
  // skirting and meets it; free-standing, it is a second stringer.
  const inner = wallFace != null ? wallFace + 0.025 : -w/2 + STRINGER, tLevel = (level - 0.05 - riser)/rise;
  if (wallFace != null){
    const tToe = (0.078 - 0.05 - riser)/rise;
    board([[zAt(tToe), 0], [zAt(tToe), 0.078], [zAt(tLevel), level], ...head], wallFace, inner);
  } else board([[zFoot, 0], [zFoot, top(tAt(zFoot))], [zAt(tLevel), level], ...head], -w/2, inner);
  // Treads housed in the boards either side, each overhanging its riser by a
  // nosing; risers tucked under the tread above. The last tread is the
  // landing's nosing, and runs back under the edge of the floor above.
  const u0 = inner - 0.012, u1 = w/2 - STRINGER + 0.012, span = u1 - u0, mid = X((u0 + u1)/2);
  for (let i=0;i<n;i++){
    const y = (i+1)*riser, front = zAt(i/n), back = i === n-1 ? zHead : zAt((i+1)/n) + direction*0.01;
    g.add(box(MAT.trim, span, riser - TREAD, 0.02, mid, y - TREAD - (riser - TREAD)/2, front + direction*0.01));
    const z0 = front - direction*NOSE;
    g.add(box(timber, span, TREAD, Math.abs(back - z0), mid, y - TREAD/2, (z0 + back)/2));
  }
  // A plastered soffit closes the underside of the flight, the way the
  // photographs show it: one sloping plane a centimetre under the treads'
  // lowest corners, from the floor to the landing, its edges behind the
  // deeper stringers.
  sloped(MAT.trim, span, 0.018, mid, (0.228 - riser)/rise, 1, -0.228 - 0.009/cos);

  // The pantry under the upper flight, where the photographs have one:
  // closed in to the floor on both sides from `closet.from` of the run up,
  // and across the top end under the landing, in the risers' white, with a
  // cased door in that end wall — the door you face from the kitchen. A
  // spandrel with `"finish": "drywall"` closes in the lower flight as well:
  // the same drywall, carried on down to where the stringer meets the floor.
  const drywalled = annotation.spandrel?.finish === 'drywall';
  const lo = drywalled ? tFloor : from, hi = closet ? 1 : from;
  if(hi > lo){
    const under=t=>nosing(t)-0.24;      // up behind the stringer, never above the slope
    // The drywall stands 2 cm behind the stringers' inner faces, so the
    // stringer runs past it as one unbroken board with a shadow line under.
    // Against a wall, the wall is the closet's other side.
    const near = w/2 - STRINGER - 0.02, sheet = [[zAt(lo), 0], [zAt(hi), 0], [zAt(hi), under(hi)], [zAt(lo), under(lo)]];
    board(sheet, near - 0.02, near);
    if (wallFace == null) board(sheet, -near, -near + 0.02);
    // A partition across its low end, where the open space under the lower
    // flight stops — drywalled, the closet's back wall, or with no closet
    // the spandrel's end.
    const far = wallFace ?? -near;
    g.add(box(MAT.trim, near - far, under(from), 0.02, X((near + far)/2), under(from)/2, zAt(from) + direction*0.01));
    // Drywalled, it is a wall of the room and has the room's flat 70 mm
    // skirting along its foot, coming out from behind the stringer near the
    // foot of the flight and running on to the end wall under the landing.
    if (drywalled) for (const s of wallFace == null ? [1, -1] : [1])
      g.add(box(MAT.trim, 0.012, 0.07, Math.abs(zAt(hi) - zAt(lo)), X(s*(near + 0.006)), 0.043, (zAt(lo) + zAt(hi))/2));
  }
  if(closet){
    // The end wall, up under the landing's tread — so it also closes the
    // floor's depth over the kitchen hall — with the doorway let into it and
    // cased on the hall side: head and jambs, and a slab door in the frame,
    // shut, hung on the balustrade side with its lever on the other, as the
    // kitchen photograph has it.
    const zEnd = zAt(1), out = direction, T = 0.045, H = rise - TREAD - 0.002, e0 = wallFace ?? -w/2, e1 = w/2;
    const ec = (e0 + e1)/2, dw = 0.7, dh = Math.min(2.03, H - 0.1), zc = zEnd + out*T/2;
    g.add(box(MAT.trim, ec - dw/2 - e0, H, T, X((e0 + ec - dw/2)/2), H/2, zc));
    g.add(box(MAT.trim, e1 - ec - dw/2, H, T, X((ec + dw/2 + e1)/2), H/2, zc));
    g.add(box(MAT.trim, dw, H - dh, T, X(ec), dh + (H - dh)/2, zc));
    for(const s of [-1,1]) g.add(box(MAT.trim, 0.045, dh + 0.045, 0.02, X(ec + s*(dw/2 + 0.0225)), (dh + 0.045)/2, zEnd + out*(T + 0.01)));
    g.add(box(MAT.trim, dw + 0.09, 0.045, 0.02, X(ec), dh + 0.0225, zEnd + out*(T + 0.01)));
    g.add(box(MAT.slab, dw - 0.02, dh - 0.02, 0.04, X(ec), dh/2, zEnd + out*(T - 0.02)));
    const lever = ec - dw/2 + 0.07;
    g.add(tube(MAT.black, 0.008, 0.05, X(lever), 1.0, zEnd + out*(T + 0.005), 'z'));
    g.add(tube(MAT.black, 0.008, 0.12, X(lever + 0.05), 1.0, zEnd + out*(T + 0.02), 'x'));
    g.userData.closet={z0:zAt(from),z1:zEnd+out*0.05,dw,foot:zAt(0)};
  } else {
    // With no closet, a painted header closes the floor's depth across the
    // head of the flight, from the ceiling below up to the landing's tread.
    const e0 = wallFace ?? -w/2, y0 = ceiling + 0.002, y1 = rise - TREAD - 0.002;
    if (y1 > y0) g.add(box(MAT.trim, w/2 - e0, y1 - y0, 0.045, X((e0 + w/2)/2), (y0 + y1)/2, zAt(1) + direction*0.0225));
  }
  // The spandrel under the lower flight on the open side, from where the
  // stringer meets the floor to the closet: a black steel frame — a rail on
  // the floor, a rail under the stringer, a post at the closet's end —
  // filled with round oak spindles, as the living-room photographs show it.
  // Drywalled, it is closed in above instead.
  if(annotation.spandrel && !drywalled){
    const F = 0.025, xs = X(w/2 - 0.022), zs = zAt(from);
    g.add(box(MAT.black, F, F, Math.abs(zs - zAt(tFloor)), xs, F/2, (zs + zAt(tFloor))/2));
    g.add(box(MAT.black, F, bottom(from), F, xs, bottom(from)/2, zs - direction*F/2));
    sloped(MAT.black, F, F, xs, tFloor, from, -0.27 - F/2/cos);
    const k = Math.max(2, Math.round((from - tFloor)*run/0.11)), spindles = [];
    for (let j=1;j<k;j++){
      const t = tFloor + (from - tFloor)*j/k, y1 = bottom(t) - F/cos;
      if (y1 - F > 0.05) spindles.push([xs, F - 0.003, y1 + 0.003, zAt(t)]);
    }
    rods(MAT.oakPale, 0.011, spindles);
  }

  // The balustrade, as the photographs have it: an oak handrail 90 cm over
  // the nosings on slim black posts — one at the foot, one over the
  // spandrel's end, a newel on the landing — with round black balusters some
  // 14 cm apart standing in a black shoe along the stringer's top. At the
  // foot the rail runs on past its post, and a scroll of the same steel
  // curls back from under its end into the post.
  const RAIL = 0.90, GUARD = 0.915, RW = 0.056, RH = 0.046, POST = 0.035, SHOE = 0.016, BAR = 0.0065;
  const railU = w/2 - STRINGER/2, rx = X(railU);
  const axis = t => nosing(t) + RAIL - RH/2/cos, underside = t => nosing(t) + RAIL - RH/cos;
  const tFoot = 0.5/n, tMid = annotation.spandrel ? from : (tFoot + tPost)/2;
  // Whether the well's guard meets the flight's balustrade at its newel.
  const tEdge = Math.min(well?.to ?? 0.6, tTop), guarded = !!well && tEdge > tTop - 1e-6;
  // The rail's section: wider than it is deep, its corners well rounded.
  const section = new THREE.Shape(), r = 0.018, hx = RW/2 - r, hy = RH/2 - r;
  section.moveTo(-hx, -RH/2); section.lineTo(hx, -RH/2); section.absarc(hx, -hy, r, -Math.PI/2, 0, false);
  section.lineTo(RW/2, hy); section.absarc(hx, hy, r, 0, Math.PI/2, false);
  section.lineTo(-hx, RH/2); section.absarc(-hx, hy, r, Math.PI/2, Math.PI, false);
  section.lineTo(-RW/2, -hy); section.absarc(-hx, -hy, r, Math.PI, Math.PI*1.5, false);
  // A length of rail swept straight from a to b, its ends cut plumb, the way
  // a rail is cut to die into a post, and the oak's grain run along it.
  // ExtrudeGeometry shades its sides facet by facet; the section's own
  // normals are put back so the rounds read round.
  const handrail = (a, b) => {
    const D = b.clone().sub(a), len = D.length(); D.divideScalar(len);
    const N = new THREE.Vector3(0, 1, 0).addScaledVector(D, -D.y).normalize(), S = new THREE.Vector3().crossVectors(N, D);
    const H = new THREE.Vector3(D.x, 0, D.z).normalize(), lean = N.dot(H)/D.dot(H);
    const geo = new THREE.ExtrudeGeometry(section, {depth:1, bevelEnabled:false, curveSegments:4});
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, lid = geo.groups[0];
    const p = new THREE.Vector3();
    for (let i=0;i<pos.count;i++){
      const px = pos.getX(i), py = pos.getY(i), end = pos.getZ(i) > 0.5, along = (end ? len : 0) - py*lean;
      p.copy(a).addScaledVector(S, px).addScaledVector(N, py).addScaledVector(D, along);
      pos.setXYZ(i, p.x, p.y, p.z);
      if (i >= lid.start && i < lid.start + lid.count) p.copy(H).multiplyScalar(end ? 1 : -1);
      else {
        const nx = px - Math.max(-hx, Math.min(hx, px)), ny = py - Math.max(-hy, Math.min(hy, py)), l = Math.hypot(nx, ny) || 1;
        p.copy(S).multiplyScalar(nx/l).addScaledVector(N, ny/l);
        uv.setXY(i, along, uv.getX(i));
      }
      nor.setXYZ(i, p.x, p.y, p.z);
    }
    geo.computeBoundingSphere();
    // The treads' white oak, not the joinery's warmer oak: in the photographs
    // rail and treads are one timber, and MAT.oak beside the pale boards read
    // as a different, orange wood.
    g.add(new THREE.Mesh(geo, MAT.oakPale));
  };
  // Where the well's guard meets it, the sloping rail runs on over the newel
  // to the guard rail's far side and stands a little proud of it there, as
  // at the head in the photographs; otherwise it stops at the newel's face.
  const at = (t, y) => new THREE.Vector3(rx, y, zAt(t));
  const tRail = tFoot - 0.09/run, tEnd = tPost + (guarded ? RW/2 - 0.002 : POST/2)/run;
  handrail(at(tRail, axis(tRail)), at(tEnd, axis(tEnd)));
  // The posts stand on the stringer — down to where its top meets their
  // lower face — and run up into the rail.
  for (const t of [tFoot, tMid]){
    const y0 = top(t) - POST/2*rise/run - 0.002, y1 = underside(t) + 0.02;
    g.add(box(MAT.black, POST, y1 - y0, POST, rx, (y0 + y1)/2, zAt(t)));
  }
  const newel = Math.max(underside(tPost), guarded ? rise + GUARD - RH : 0) + 0.02;
  g.add(box(MAT.black, POST, newel - rise, POST, rx, (rise + newel)/2, zAt(tPost)));
  sloped(MAT.black, 0.02, SHOE, rx, tFoot, tPost, 0.05 + SHOE/2/cos);
  const bars = [];
  for (const [ta, tb] of [[tFoot, tMid], [tMid, tPost]]){
    const k = Math.max(1, Math.round((tb - ta)*run/0.14));
    for (let j=1;j<k;j++){
      const t = ta + (tb - ta)*j/k;
      bars.push([rx, top(t) + SHOE/cos - 0.004, underside(t) + 0.006, zAt(t)]);
    }
  }
  rods(MAT.black, BAR, bars);
  // The scroll: from under the rail's end, out and down, and back into the
  // post some 19 cm under the rail.
  const zP = zAt(tFoot), yEnd = underside(tFoot) - 0.07*rise/run;
  const curl = new THREE.CatmullRomCurve3([[0.07, 0.004], [0.092, -0.03], [0.078, -0.075], [0.045, -0.098], [0.012, -0.1]]
    .map(([d, dy]) => new THREE.Vector3(rx, yEnd + dy, zP - direction*d)), false, 'centripetal');
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curl, 20, 0.0075, 8, false), MAT.black));

  // The stairwell open beside the flight on the rail side, where the
  // photographs show the entry two storeys tall: `well.width` metres of the
  // upper floor cut away between the flight and the wall beyond it, from
  // `well.past` metres beyond the foot up to `well.to` of the run, where the
  // landing begins behind a guard — the balustrade's oak rail, level, on
  // black balusters and a bottom rail, over a painted fascia that closes the
  // floor's depth at the void's edge.
  if(well){
    const zEdge = zAt(tEdge), zG = zEdge + direction*0.03, uFar = w/2 + well.width, uNear = guarded ? railU : w/2 + POST/2;
    const yG = rise + GUARD, foot = rise + 0.056, last = uFar - POST/2;
    handrail(new THREE.Vector3(X(uNear), yG - RH/2, zG), new THREE.Vector3(X(uFar), yG - RH/2, zG));
    g.add(box(MAT.black, uFar - uNear, SHOE, 0.02, X((uNear + uFar)/2), foot + SHOE/2, zG));
    for (const u of guarded ? [last] : [uNear, last])
      g.add(box(MAT.black, POST, yG - RH + 0.02 - rise, POST, X(u), (rise + yG - RH + 0.02)/2, zG));
    const k = Math.max(1, Math.round((last - uNear)/0.115)), guard = [];
    for (let j=1;j<k;j++) guard.push([X(uNear + (last - uNear)*j/k), foot + SHOE - 0.004, yG - RH + 0.006, zG]);
    rods(MAT.black, BAR, guard);
    g.add(box(MAT.trim, well.width, level - ceiling - 0.002, 0.045, X(w/2 + well.width/2), (ceiling + 0.002 + level)/2, zEdge + direction*0.0225));
    g.userData.well={x0:Math.min(X(w/2),X(uFar)),x1:Math.max(X(w/2),X(uFar)),z0:zEdge,z1:zAt(0)-direction*(well.past??0)};
  }
  // The opening the flight needs in the floor above: across, from the wall's
  // centre line on the closed side — or 8 cm clear of the flight — to the
  // stringer's face, or 8 cm clear of it where no well opens beside it;
  // along, from just past the head to just past the foot, or as far past
  // the foot as the well runs.
  const uw = wallFace != null ? wallFace - WALL_T/2 : -w/2 - 0.08, ur = w/2 + (well ? 0 : 0.08);
  const za = zAt(1) + direction*0.04, zb = zAt(0) - direction*Math.max(0.04, well?.past ?? 0);
  g.userData.cut = {x0:Math.min(X(uw), X(ur)), x1:Math.max(X(uw), X(ur)), z0:Math.min(za, zb), z1:Math.max(za, zb)};
  g.position.set(o.c[0],elevation,o.c[2]); g.rotation.y=o.yaw;
  g.name='Photo-guided staircase';
  return g;
}

// The brick surround the photographs show: a raised brick hearth, a field of
// running-bond brick either side of a firebox insert under a shallow
// segmental arch of bricks on end, a reclaimed beam for a mantel. In its
// own brick, sampled from the photograph, or — `"finish": "whitewash"` —
// limewashed, every brick drawn in the face of a whitewashed one.
function brickFireplace(w,h,d,photoBrick,tv,finish){
  const g = new THREE.Group(), base=0.14;
  const washed = finish==='whitewash';
  let brick;
  if(washed){
    const face=brickFace();
    brick=new THREE.MeshStandardMaterial({color:0xFFFFFF,map:face,bumpMap:face,bumpScale:0.0025,roughness:0.95,envMapIntensity:0.3});
  } else {
    brick = photoBrick || new THREE.MeshStandardMaterial({color:0xa66c50,roughness:0.93,envMapIntensity:0.3});
    if(!photoBrick){brick.color.convertSRGBToLinear();
      brick.bumpMap=surfaceTile('stone');brick.bumpScale=0.002;}
  }
  const mortar = new THREE.MeshStandardMaterial({color:washed ? 0xD8D3C9 : 0x8e897d,roughness:1,envMapIntensity:0.25});
  mortar.color.convertSRGBToLinear();
  const iron = new THREE.MeshStandardMaterial({color:0x161916,roughness:0.72,envMapIntensity:0.15});
  iron.color.convertSRGBToLinear();
  const mantel = MAT.wood.clone();mantel.color.setHex(0x625a4c).convertSRGBToLinear();mantel.envMapIntensity=0.3;
  const blocks=[];
  const bh=0.075, bw=0.24, gap=0.009;
  // The opening: a rectangle the insert's size from the hearth up, closed
  // by a shallow arch — a circle through its top corners with a rise of a
  // brick — the way the photograph has it, not a round arch.
  const ow=Math.min(0.8,w*0.47), spring=base+0.52, rise=0.08, R=(ow*ow/4+rise*rise)/(2*rise), cy=spring+rise-R;
  const ring=0.2, a0=Math.atan2(R-rise,ow/2), a1=Math.PI-a0;
  const skew=[(R+ring)*Math.cos(a0),cy+(R+ring)*Math.sin(a0)];       // the ring's outer corner
  const opening = new THREE.Shape();
  opening.moveTo(-ow/2,base); opening.lineTo(ow/2,base); opening.lineTo(ow/2,spring);
  opening.absarc(0,cy,R,a0,a1,false); opening.lineTo(-ow/2,base);
  const insert = new THREE.Mesh(new THREE.ShapeGeometry(opening,24),iron);
  insert.position.z=d/2-0.055; g.add(insert);
  // How far from centre the field bricks stop at a height: the jamb, then
  // the arch's skewback, then its outer curve.
  const half = y => y<spring ? ow/2
    : y<skew[1] ? ow/2+(y-spring)*(skew[0]-ow/2)/(skew[1]-spring)
    : y<cy+R+ring ? Math.sqrt(Math.max(0,(R+ring)**2-(y-cy)**2)) : 0;
  for(let y=base;y<h-0.16;y+=bh){
    const row=Math.round((y-base)/bh);
    for(let x=-w/2-(row%2)*bw/2;x<w/2;x+=bw){
      const left=Math.max(-w/2,x),right=Math.min(w/2,x+bw);
      const cut=Math.max(half(y),half(y+bh));
      const spans=cut>0 ? [[left,Math.min(right,-cut)],[Math.max(left,cut),right]] : [[left,right]];
      for(const [a,b] of spans)if(b-a>gap)blocks.push([b-a-gap,bh-gap,d,(a+b)/2,y+bh/2,0]);
    }
  }
  // Bricks on end round the arch, each a wedge of the ring.
  const nv=Math.max(7,Math.round(R*(a1-a0)/0.078));
  for(let i=0;i<nv;i++){
    const a=a0+(a1-a0)*i/nv+0.006,b=a0+(a1-a0)*(i+1)/nv-0.006;
    const shape=new THREE.Shape();
    shape.absarc(0,cy,R+ring,a,b,false);
    shape.absarc(0,cy,R,b,a,true); shape.closePath();
    const voussoir=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,curveSegments:2}),brick);
    voussoir.position.z=-d/2;g.add(voussoir);
  }
  // Mortar backing behind the masonry, never across the firebox.
  for(const s of [-1,1])g.add(box(mortar,(w-ow)/2,h-base-0.16,d-0.02,s*(w/2+ow/2)/2,(h+base-0.16)/2,-0.012));
  g.add(box(mortar,w,h-0.16-(spring+rise),d-0.02,0,(h-0.16+spring+rise)/2,-0.012));
  // The raised hearth, two courses of brick standing well out into the room.
  const hearth=0.36;
  g.add(box(mortar,w,base,d+hearth,0,base/2,hearth/2));
  for(let y=0;y<base-0.01;y+=bh){
    const row=Math.round(y/bh);
    for(let x=-w/2-(row%2)*bw/2;x<w/2;x+=bw){
      const left=Math.max(-w/2,x),right=Math.min(w/2,x+bw);
      if(right-left>gap)blocks.push([right-left-gap,bh-gap,d+hearth-gap,(left+right)/2,y+bh/2,hearth/2]);
    }
  }
  const masonry=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),brick,blocks.length);
  const transform=new THREE.Object3D(),colour=new THREE.Color();
  blocks.forEach(([sx,sy,sz,x,y,z],i)=>{
    transform.position.set(x,y,z);transform.scale.set(sx,sy,sz);transform.updateMatrix();
    masonry.setMatrixAt(i,transform.matrix);
    // Brick to brick the colour shifts: a little under limewash, more in clay.
    if(washed)colour.setRGB(0.94+(i%7)*0.009,0.94+(i%5)*0.011,0.93+(i%3)*0.015);
    else colour.setRGB(0.85+(i%7)*0.023,0.85+(i%5)*0.025,0.82+(i%3)*0.04);
    masonry.setColorAt(i,colour);
  });g.add(masonry);
  g.add(box(mantel,w+0.10,0.15,d+0.085,0,h-0.075,0.025));
  // The television over the mantel, on the wall above the brick — where the
  // August photographs have it.
  if(tv>0){
    const th=tv*9/16,y=h+0.12+th/2;
    g.add(box(MAT.black,tv,th,0.03,0,y,-d/2+0.03));
    g.add(box(MAT.screen,tv-0.02,th-0.02,0.006,0,y,-d/2+0.048));
  }
  // The gas insert in the opening: a black steel frame round a sheet of
  // dark glass, set a little back from the face of the brick.
  g.add(box(iron,ow-0.02,spring-base-0.02,0.02,0,(base+spring)/2,d/2-0.035));
  g.add(box(MAT.screen,ow-0.14,spring-base-0.14,0.006,0,(base+spring)/2+0.02,d/2-0.022));
  g.add(box(MAT.steel,ow-0.1,0.012,0.01,0,base+0.05,d/2-0.018));
  g.name='Photo-guided brick fireplace';return g;
}

// A contemporary surround for the same opening: a smooth plastered chimney
// breast the full width of the annotation, a wide low firebox in black steel
// with a slot of flame-black glass, a raised quartz hearth, and a floating oak
// mantel shelf. Drawn when the annotation says `"finish": "plaster"`; the
// brick surround the photographs show is the default.
function plasterFireplace(w,h,d,tv){
  const g=new THREE.Group();
  const iron=new THREE.MeshStandardMaterial({color:0x161916,roughness:0.72,envMapIntensity:0.15});
  iron.color.convertSRGBToLinear();
  g.add(box(MAT.plaster,w,h,d,0,h/2,0));
  const fw=Math.min(w*0.62,1.1),fh=Math.min(h*0.34,0.5),fy=0.14+fh/2;
  g.add(box(iron,fw,fh,0.04,0,fy,d/2-0.012));
  g.add(box(MAT.screen,fw-0.05,fh-0.05,0.02,0,fy,d/2-0.026));
  g.add(box(MAT.lamp,fw*0.7,0.012,0.02,0,fy-fh/2+0.05,d/2-0.03));
  g.add(box(MAT.quartz,w+0.16,0.06,d+0.32,0,0.03,0.16));
  g.add(box(MAT.oak,w*0.9,0.05,0.2,0,h*0.62,d/2+0.1));
  // A television over the mantel, flush-mounted on the breast: a slim black
  // panel with a dark screen, its bottom edge a hand above the shelf.
  if(tv>0){
    const th=tv*9/16,y=h*0.62+0.03+0.14+th/2;
    g.add(box(MAT.black,tv,th,0.03,0,y,d/2+0.015));
    g.add(box(MAT.screen,tv-0.02,th-0.02,0.006,0,y,d/2+0.033));
  }
  g.name='Plaster fireplace, as proposed';return g;
}

export function dressArchitecture(L,next){
  for(const room of L.rooms){
    const annotation=room.finishes?.stair;
    if(annotation&&next){
      const index=L.objects.findIndex(o=>o.cat==='stairs');
      if(index>=0){
        const o=L.objects[index],rise=next.elevation-L.elevation;
        if(rise>1&&rise<4.5&&o.d[0]>0.4&&o.d[2]>1){
          const side=annotation.railSide===-1?-1:1;
          const g=stairFlight(o,L.elevation,rise,annotation,L.ceiling,wallAgainst(L,o,side));
          // The closet under the flight is walled: the scanned stair's
          // blocker shrinks to the open part of the flight, and the closet's
          // own walls — the two sides and the end wall with its shut door —
          // block instead.
          if(g.userData.closet){
            const {z0,z1,dw,foot}=g.userData.closet,cs=Math.cos(o.yaw),sn=Math.sin(o.yaw),w=o.d[0];
            const at=(lx,lz)=>({x:o.c[0]+cs*lx+sn*lz,z:o.c[2]-sn*lx+cs*lz,yaw:o.yaw});
            const stair=L.objBlockers.find(b=>b.src===o);
            if(stair) Object.assign(stair,at(0,(foot+z0)/2),{hz:Math.abs(foot-z0)/2});
            const zm=(z0+z1)/2,hz=Math.abs(z1-z0)/2;
            for(const s of [-1,1]) L.objBlockers.push({...at(s*(w/2-0.02),zm),hx:0.03,hz});
            L.objBlockers.push({...at(0,z1),hx:w/2,hz:0.04});    // the end wall, door shut
          }
          L.shell.add(g);L.objMeshes[index].built=g;
          // The opening through the upper floor: the flight's rectangle, and
          // the well's beside it if there is one — an L, so two rectangles,
          // which leaves the landing beside the top of the flight as floor.
          const cs=Math.cos(o.yaw),sn=Math.sin(o.yaw);
          const rect=(lx0,lx1,lz0,lz1)=>{
            const mx=(lx0+lx1)/2,mz=(lz0+lz1)/2;
            return {x:o.c[0]+cs*mx+sn*mz,z:o.c[2]-sn*mx+cs*mz,yaw:o.yaw,hx:(lx1-lx0)/2,hz:(lz1-lz0)/2};
          };
          const flight=g.userData.cut,cut=[rect(flight.x0,flight.x1,flight.z0,flight.z1)];
          const well=g.userData.well;
          if(well){
            const wellRect=rect(well.x0,well.x1,Math.min(well.z0,well.z1),Math.max(well.z0,well.z1));
            cut.push(wellRect);
            next.objBlockers.push({...wellRect});           // nobody walks off the landing into it
          }
          L.ceilingCut=cut;next.floorCut=cut;
          bridgeStoreys(L,next,cut);
        }
      }
    }
    const spec=room.finishes?.fireplace;
    if(!spec)continue;
    const w=L.walls.find(w=>Math.hypot(w.c[0]-spec.wallAt[0],w.c[2]-spec.wallAt[1])<0.1);
    if(!w||!(spec.width>0&&spec.height>0&&spec.depth>0))continue;
    // Require solid wall behind the entire annotated surround.
    if(spec.width>w.w||w.holes.some(o=>o.x0<spec.width/2&&o.x1>-spec.width/2&&w.c[1]+o.y0<L.elevation+spec.height))continue;
    const nx=Math.sin(w.yaw),nz=Math.cos(w.yaw);
    const side=(room.at[0]-w.c[0])*nx+(room.at[1]-w.c[2])*nz>=0?1:-1;
    const g=spec.finish==='plaster'?plasterFireplace(spec.width,spec.height,spec.depth,spec.tv)
      :brickFireplace(spec.width,spec.height,spec.depth,room.mats?.brick,spec.tv,spec.finish);
    g.position.set(w.c[0]+nx*side*(WALL_T/2+spec.depth/2),L.elevation,w.c[2]+nz*side*(WALL_T/2+spec.depth/2));
    g.rotation.y=w.yaw+(side<0?Math.PI:0);L.trim.add(g);
  }
}

// The wall a flight is built against, if the scan has one: parallel to the
// flight along its closed side, as long as the flight, up to the ceiling,
// and with nothing let into it. Returned as where its face stands across
// the flight, measured toward the open side — where the skirt board goes.
function wallAgainst(L,o,side){
  const c=Math.cos(o.yaw),s=Math.sin(o.yaw),w=o.d[0],run=o.d[2];
  for(const wall of L.walls){
    if(Math.abs(Math.sin(o.yaw-wall.yaw))<0.9998||wall.holes.length)continue;
    const dx=wall.c[0]-o.c[0],dz=wall.c[2]-o.c[2],u=side*(c*dx-s*dz),along=s*dx+c*dz;
    const overlap=Math.min(along+wall.w/2,run/2)-Math.max(along-wall.w/2,-run/2);
    if(Math.abs(u+w/2)<0.15&&overlap>0.9*run&&wall.c[1]+wall.h/2>=L.elevation+L.ceiling-0.05)
      return u+WALL_T/2;
  }
  return null;
}

// Where one storey is opened into the next, the depth of the floor between
// them shows all round the opening as a slot: the ceiling below stops, the
// floor above stops, and between the two is a view into the joists — here,
// the underside of the upper storey's boards. Each wall at the opening's edge
// is carried across that depth, the lower storey's up to the floor above and
// the upper storey's down to the ceiling below where no wall stands under it,
// so the stairwell reads as one tall room. A wall is carried only along the
// stretch that borders the opening, sampled every 5 cm and grown by a sample
// either way — never past its own panel, though, where a neighbour's box in
// the same plane would flicker against it.
function bridgeStoreys(L,next,cut){
  const lo=L.elevation+L.ceiling,hi=next.elevation,step=0.05,reach=WALL_T/2+0.08;
  const head=p=>p.mesh.position.y+p.h/2,foot=p=>p.mesh.position.y-p.h/2;
  const point=(p,a)=>[p.x+Math.cos(p.yaw)*a,p.z-Math.sin(p.yaw)*a];
  const borders=(p,a)=>{
    const [x,z]=point(p,a),nx=Math.sin(p.yaw)*reach,nz=Math.cos(p.yaw)*reach;
    return inStairCut(cut,x+nx,z+nz)||inStairCut(cut,x-nx,z-nz);
  };
  const lower=L.wallMeshes.filter(p=>head(p)>=lo-0.05);
  // A lower wall on the same line, under this point of an upper one.
  const under=(p,a)=>{
    const [x,z]=point(p,a);
    return lower.some(q=>{
      if(Math.abs(Math.sin(q.yaw-p.yaw))>0.1)return false;
      const c=Math.cos(q.yaw),s=Math.sin(q.yaw),dx=x-q.x,dz=z-q.z;
      return Math.abs(c*dx-s*dz)<q.w/2+0.05&&Math.abs(s*dx+c*dz)<0.15;
    });
  };
  const carry=(host,p,test,y0,y1)=>{
    const k=Math.max(1,Math.ceil(p.w/step)),da=p.w/k;
    let first=-1;
    for(let i=0;i<=k+1;i++){
      if(i<=k&&test(p,-p.w/2+i*da)){if(first<0)first=i;continue;}
      if(first<0)continue;
      const a0=Math.max(-p.w/2,-p.w/2+(first-1)*da),a1=Math.min(p.w/2,-p.w/2+i*da),[x,z]=point(p,(a0+a1)/2);
      first=-1;
      if(a1-a0<0.01||y1-y0<0.005)continue;
      const m=new THREE.Mesh(new THREE.BoxGeometry(a1-a0,y1-y0,WALL_T),MAT.trim);
      m.position.set(x,(y0+y1)/2,z);m.rotation.y=p.yaw;host.trim.add(m);
      // A wall panel like any other, so it takes each side's room paint.
      host.wallMeshes.push({mesh:m,x,z,yaw:p.yaw,w:a1-a0,h:y1-y0,flat:MAT.trim,low:false});
    }
  };
  for(const p of lower)if(head(p)<hi-0.01)carry(L,p,borders,head(p),hi+0.01);
  for(const p of next.wallMeshes.filter(p=>foot(p)<=hi+0.03))
    carry(next,p,(q,a)=>borders(q,a)&&!under(q,a),lo+0.002,foot(p));
}

// A cut is one rotated rectangle, or a list of them — the flight and the
// well beside it make an L that one rectangle cannot draw.
export function inStairCut(cut,x,z){
  if(!cut)return false;
  if(Array.isArray(cut))return cut.some(c=>inStairCut(c,x,z));
  const dx=x-cut.x,dz=z-cut.z,c=Math.cos(cut.yaw),s=Math.sin(cut.yaw);
  return Math.abs(c*dx-s*dz)<cut.hx&&Math.abs(s*dx+c*dz)<cut.hz;
}

// Subtract the rotated stair rectangle exactly. Each clipping edge emits its
// outside fragment; only the final polygon inside all four edges is discarded.
export function cutSlabQuad(quad,cut){
  if(!cut)return [quad];
  if(Array.isArray(cut))return cut.reduce((pieces,c)=>pieces.flatMap(p=>cutSlabQuad(p,c)),[quad]);
  const c=Math.cos(cut.yaw),s=Math.sin(cut.yaw);
  const local=([x,z])=>[c*(x-cut.x)-s*(z-cut.z),s*(x-cut.x)+c*(z-cut.z)];
  const planes=[p=>local(p)[0]-cut.hx,p=>-local(p)[0]-cut.hx,
    p=>local(p)[1]-cut.hz,p=>-local(p)[1]-cut.hz];
  const out=[];let remaining=quad;
  for(const distance of planes){
    if(!remaining.length)break;
    const inside=[],outside=[];
    for(let i=0;i<remaining.length;i++){
      const a=remaining[i],b=remaining[(i+1)%remaining.length],da=distance(a),db=distance(b);
      if(da<=0)inside.push(a);
      if(da>=0)outside.push(a);
      if((da<0&&db>0)||(da>0&&db<0)){
        const t=da/(da-db),p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
        inside.push(p);outside.push(p);
      }
    }
    if(outside.length>=3)out.push(outside);
    remaining=inside;
  }
  return out;
}

import { WALL_T } from '../core/constants.js';
import { surfaceTile, brickFace } from './textures.js';
import { MAT } from './materials.js';
import { box, tube } from './fittings.js';
import { avgMats } from '../photo/relight.js';
import { TILE } from '../photo/rooms.js';

// Explicit photo annotations supply the ascent and exposed side; RoomPlan's
// bounds alone cannot establish either. Geometry stays in the scan's footprint.
function stairFlight(o, elevation, rise, annotation, ceiling){
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
  const zAt = t => direction*(-run/2+t*run);
  // The line of the nosings, as a height for any point along the flight:
  // everything else is set off it — the stringers' edges, the balusters'
  // feet, the handrail.
  const nosing = t => riser + t*rise;
  const STRINGER = 0.045, NOSE = 0.03, TREAD = 0.032;
  // Closed stringers: a slim painted board either side, its top edge just
  // above the nosings and its bottom edge just under the treads, so the
  // treads and risers are housed between them and the flight reads as one
  // clean sloping line from the room rather than a sawtooth of tread ends.
  // Cut square at the foot and level at the landing.
  const stringerMat = MAT.trim.clone(); stringerMat.side = THREE.DoubleSide;
  const profile = new THREE.Shape();
  const pts = [[0, 0], [0, nosing(0) + 0.06], [(n-1)/n, rise + 0.06], [1, rise + 0.06], [1, nosing(1) - 0.10]];
  pts.forEach(([t, y], k) => k ? profile.lineTo(zAt(t), y) : profile.moveTo(zAt(t), y));
  profile.closePath();
  for (const s of [-1,1]){
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(profile, {depth:STRINGER, bevelEnabled:false}), stringerMat);
    // The profile is drawn in (z, y) and turned to stand in the flight's
    // side; the extrusion then runs toward -x from the mesh's position.
    m.rotation.y = -Math.PI/2; m.position.x = s > 0 ? w/2 : -w/2 + STRINGER;
    g.add(m);
  }
  // Treads housed between the stringers, each overhanging its riser by a
  // nosing; risers tucked under the tread above, and a thin board under
  // each tread from riser to riser so the flight reads solid from below.
  const inner = w - 2*STRINGER + 0.02;
  for (let i=0;i<n;i++){
    const y = (i+1)*riser, front = zAt(i/n), back = zAt((i+1)/n);
    g.add(box(MAT.trim, inner, riser - TREAD, 0.02, 0, y - TREAD - (riser - TREAD)/2, front + direction*0.01));
    g.add(box(MAT.trim, inner, 0.012, Math.abs(back - front), 0, y - TREAD - 0.006, (front + back)/2));
    const z0 = front - direction*NOSE, z1 = back + direction*0.01;
    g.add(box(timber, inner, TREAD, Math.abs(z1 - z0), 0, y - TREAD/2, (z0 + z1)/2));
  }
  // No soffit: the photographs show the flight open underneath — treads and
  // risers seen from below between two slim stringers — with nothing under
  // it but the closet at the top end.
  const pitch = Math.atan2(rise,run);
  // The balustrade is the renovation's black steel, and no more of it than
  // it needs: a square post at the foot and the head, one slim square
  // baluster a tread between them, and a flat bar for a handrail 90 cm over
  // the nosings, all standing on the open stringer's top edge.
  const railX = side*(w/2 - STRINGER/2), RAIL = 0.90;
  for (let i=0;i<n;i++){
    const t = (i+0.5)/n, foot = nosing(t) + 0.09, top = nosing(t) + RAIL - 0.006;
    g.add(box(MAT.black, 0.012, top - foot, 0.012, railX, (foot + top)/2, zAt(t)));
  }
  for (const t of [0.4/n, 1 - 0.6/n]){
    const foot = nosing(t) + 0.09, top = nosing(t) + RAIL + 0.006;
    g.add(box(MAT.black, 0.045, top - foot, 0.045, railX, (foot + top)/2, zAt(t)));
  }
  const t0 = 0.4/n, t1 = 1 - 0.6/n, len = Math.hypot(run, rise)*(t1 - t0) + 0.045;
  const rail = box(MAT.black, 0.045, 0.012, len, railX, nosing((t0 + t1)/2) + RAIL, zAt((t0 + t1)/2));
  rail.rotation.x = -direction*pitch; g.add(rail);
  // The pantry under the upper flight, where the photographs have one:
  // closed in to the floor on both sides from `closet.from` of the run up,
  // and across the top end under the landing, in the risers' white, with a
  // cased doorway in that end wall — the opening you face from the kitchen
  // — standing open, so the space under the stair can be walked into.
  const closet=annotation.closet;
  if(closet){
    const from=closet.from??0.45, under=t=>nosing(t)-0.11;      // to the stringer's bottom edge, not above the slope
    const sideMat=MAT.trim.clone(); sideMat.side=THREE.DoubleSide;
    const profile=new THREE.Shape();
    profile.moveTo(zAt(from),0); profile.lineTo(zAt(1),0); profile.lineTo(zAt(1),under(1)); profile.lineTo(zAt(from),under(from));
    profile.closePath();
    for(const s of [-1,1]){
      const m=new THREE.Mesh(new THREE.ExtrudeGeometry(profile,{depth:0.02,bevelEnabled:false}),sideMat);
      m.rotation.y=-Math.PI/2; m.position.x=s>0 ? w/2-0.01 : -w/2+0.03;
      g.add(m);
    }
    // The end wall, to the ceiling, with the doorway let into it and cased
    // on the hall side: head and jambs, no leaf.
    const zEnd=zAt(1), out=direction, H=Math.min(ceiling-0.02,under(1)), dw=0.7, dh=Math.min(2.03,H-0.1);
    for(const s of [-1,1]) g.add(box(MAT.trim,(w-dw)/2,H,0.02,s*(w+dw)/4,H/2,zEnd+out*0.01));
    g.add(box(MAT.trim,dw,H-dh,0.02,0,dh+(H-dh)/2,zEnd+out*0.01));
    for(const s of [-1,1]) g.add(box(MAT.trim,0.045,dh+0.045,0.02,s*(dw/2+0.0225),(dh+0.045)/2,zEnd+out*0.035));
    g.add(box(MAT.trim,dw+0.09,0.045,0.02,0,dh+0.0225,zEnd+out*0.035));
    g.userData.closet={z0:zAt(from),z1:zEnd+out*0.05,dw,foot:zAt(0)};
  }
  // The stairwell open beside the flight on the rail side, where the
  // photographs show the entry two storeys tall: `well.width` metres of the
  // upper floor cut away between the flight and the wall beyond it, from
  // `well.past` metres beyond the foot up to `well.to` of the run, where the
  // landing begins behind a guard — the same black steel as the balustrade,
  // across the void's edge.
  const well=annotation.well;
  if(well){
    const to=well.to??0.6, x0=w/2, x1=w/2+well.width;
    const zEdge=zAt(to)+direction*0.03, y0=rise, top=y0+RAIL;
    for(const x of [x0+0.0225, x1-0.0225]) g.add(box(MAT.black,0.045,RAIL+0.006,0.045,x,y0+(RAIL+0.006)/2,zEdge));
    const nb=Math.max(1,Math.round((x1-x0)/0.12));
    for(let i=1;i<nb;i++) g.add(box(MAT.black,0.012,RAIL-0.006,0.012,x0+(x1-x0)*i/nb,y0+(RAIL-0.006)/2,zEdge));
    g.add(box(MAT.black,x1-x0,0.012,0.045,(x0+x1)/2,top,zEdge));
    g.userData.well={x0,x1,z0:zAt(to),z1:zAt(0)-direction*(well.past??0)};
  }
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
          const g=stairFlight(o,L.elevation,rise,annotation,L.ceiling);
          // The closet under the flight can be walked into through its
          // doorway: the scanned stair's blocker shrinks to the open part
          // of the flight, and the closet's own walls — the two sides and
          // the end wall either side of the doorway — block instead.
          if(g.userData.closet){
            const {z0,z1,dw,foot}=g.userData.closet,cs=Math.cos(o.yaw),sn=Math.sin(o.yaw),w=o.d[0];
            const at=(lx,lz)=>({x:o.c[0]+cs*lx+sn*lz,z:o.c[2]-sn*lx+cs*lz,yaw:o.yaw});
            const stair=L.objBlockers.find(b=>b.src===o);
            if(stair) Object.assign(stair,at(0,(foot+z0)/2),{hz:Math.abs(foot-z0)/2});
            const zm=(z0+z1)/2,hz=Math.abs(z1-z0)/2;
            for(const s of [-1,1]) L.objBlockers.push({...at(s*(w/2-0.02),zm),hx:0.03,hz});
            for(const s of [-1,1]) L.objBlockers.push({...at(s*(w+dw)/4,z1),hx:(w-dw)/4,hz:0.04});
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
          const cut=[rect(-o.d[0]/2-0.08,o.d[0]/2+0.08,-o.d[2]/2-0.04,o.d[2]/2+0.04)];
          const well=g.userData.well;
          if(well){
            const wellRect=rect(well.x0,well.x1,Math.min(well.z0,well.z1),Math.max(well.z0,well.z1));
            cut.push(wellRect);
            next.objBlockers.push({...wellRect});           // nobody walks off the landing into it
          }
          L.ceilingCut=cut;next.floorCut=cut;
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

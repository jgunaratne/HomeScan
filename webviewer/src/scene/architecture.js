import { WALL_T } from '../core/constants.js';
import { surfaceTile } from './textures.js';
import { MAT } from './materials.js';
import { box, tube } from './fittings.js';
import { avgMats } from '../photo/relight.js';
import { TILE } from '../photo/rooms.js';

function railBetween(g, material, a, b, radius){
  const delta = new THREE.Vector3().subVectors(b,a);
  const m = tube(material, radius, delta.length(), 0,0,0);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
  g.add(m);
}

// Explicit photo annotations supply the ascent and exposed side; RoomPlan's
// bounds alone cannot establish either. Geometry stays in the scan's footprint.
function stairFlight(o, elevation, rise, annotation){
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
  for (let i=0;i<n;i++){
    const y = (i+1)*riser, z = zAt((i+0.5)/n);
    g.add(box(MAT.trim,w,riser,0.025,0,y-riser/2,zAt(i/n)));
    g.add(box(timber,w,0.032,going+0.014,0,y-0.016,z));
    const railX = side*(w/2-0.055);
    railBetween(g,MAT.dark,new THREE.Vector3(railX,y,z),new THREE.Vector3(railX,y+0.88,z),0.009);
  }
  for (const s of [-1,1]){
    const stringer = box(MAT.trim,0.045,0.20,Math.hypot(run,rise),s*(w/2-0.025),rise/2-0.08,0);
    stringer.rotation.x = -direction*Math.atan2(rise,run); g.add(stringer);
  }
  // Close the underside of the flight: separate treads otherwise expose a
  // sawtooth silhouette and let daylight through the stair from below.
  const soffit=box(MAT.trim,w-0.06,0.055,Math.hypot(run,rise),0,rise/2-0.09,0);
  soffit.rotation.x=-direction*Math.atan2(rise,run);g.add(soffit);
  // The handrail terminates in painted posts.
  for(const t of [0.5/n,1-0.5/n]){
    const y=(Math.floor(t*n)+1)*riser;
    g.add(box(MAT.trim,0.065,0.96,0.065,side*(w/2-0.055),y+0.45,zAt(t)));
  }
  const x = side*(w/2-0.055);
  railBetween(g,MAT.trim,new THREE.Vector3(x,riser+0.90,zAt(0.5/n)),
    new THREE.Vector3(x,rise+0.90,zAt(1-0.5/n)),0.027);
  g.position.set(o.c[0],elevation,o.c[2]); g.rotation.y=o.yaw;
  g.name='Photo-guided staircase';
  return g;
}

function brickFireplace(w,h,d,photoBrick,tv){
  const g = new THREE.Group(), radius=w*0.255, base=h*0.13, spring=h*0.48;
  const brick = photoBrick || new THREE.MeshStandardMaterial({color:0xa66c50,roughness:0.93,envMapIntensity:0.3});
  if(!photoBrick){brick.color.convertSRGBToLinear();
    brick.bumpMap=surfaceTile('stone');brick.bumpScale=0.002;}
  const mortar = new THREE.MeshStandardMaterial({color:0x8e897d,roughness:1,envMapIntensity:0.25});
  mortar.color.convertSRGBToLinear();
  const iron = new THREE.MeshStandardMaterial({color:0x161916,roughness:0.72,envMapIntensity:0.15});
  iron.color.convertSRGBToLinear();
  const mantel = MAT.wood.clone();mantel.color.setHex(0x625a4c).convertSRGBToLinear();mantel.envMapIntensity=0.3;
  const blocks=[];
  const bh=0.075, bw=0.24, gap=0.009;
  // Recessed arched insert, closed and unlit as in the reference photograph.
  const arch = new THREE.Shape();
  arch.moveTo(-radius,base); arch.lineTo(radius,base); arch.lineTo(radius,spring);
  arch.absarc(0,spring,radius,0,Math.PI,false); arch.lineTo(-radius,base);
  const insert = new THREE.Mesh(new THREE.ShapeGeometry(arch,32),iron);
  insert.position.z=d/2-0.055; g.add(insert);
  for(let y=base;y<h-0.16;y+=bh){
    const row=Math.round((y-base)/bh);
    for(let x=-w/2-(row%2)*bw/2;x<w/2;x+=bw){
      const left=Math.max(-w/2,x),right=Math.min(w/2,x+bw);
      const above=y>spring ? Math.sqrt(Math.max(0,(radius+0.095)**2-(y-spring)**2)) : radius+0.075;
      const spans=y<spring+radius+0.095 ? [[left,Math.min(right,-above)],[Math.max(left,above),right]] : [[left,right]];
      for(const [a,b] of spans)if(b-a>gap)blocks.push([b-a-gap,bh-gap,d,(a+b)/2,y+bh/2,0]);
    }
  }
  // Individually angled arch bricks keep the opening round rather than stepped.
  for(let i=0;i<17;i++){
    const a=i*Math.PI/17+0.012,b=(i+1)*Math.PI/17-0.012;
    const shape=new THREE.Shape(),outer=radius+0.105;
    shape.absarc(0,spring,outer,a,b,false);
    shape.absarc(0,spring,radius,b,a,true); shape.closePath();
    const voussoir=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,curveSegments:3}),brick);
    voussoir.position.z=-d/2;g.add(voussoir);
  }
  // Mortar backing behind the outer masonry, never across the firebox.
  for(const s of [-1,1])g.add(box(mortar,(w-radius*2)/2,h-base-0.16,d-0.02,
    s*(w/2+radius)/2,(h+base-0.16)/2,-0.012));
  g.add(box(mortar,w,h-spring-radius-0.15,d-0.02,0,(h-0.15+spring+radius)/2,-0.012));
  g.add(box(mortar,w,base,d+0.18,0,base/2,0.07));
  for(let x=-w/2;x<w/2;x+=bw){
    const width=Math.min(bw,w/2-x);
    blocks.push([width-gap,base-0.014,d+0.18-gap,x+width/2,base/2,0.07]);
  }
  const masonry=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),brick,blocks.length);
  const transform=new THREE.Object3D(),colour=new THREE.Color();
  blocks.forEach(([sx,sy,sz,x,y,z],i)=>{
    transform.position.set(x,y,z);transform.scale.set(sx,sy,sz);transform.updateMatrix();
    masonry.setMatrixAt(i,transform.matrix);
    colour.setRGB(0.85+(i%7)*0.023,0.85+(i%5)*0.025,0.82+(i%3)*0.04);masonry.setColorAt(i,colour);
  });g.add(masonry);
  g.add(box(mantel,w+0.10,0.15,d+0.085,0,h-0.075,0.025));
  // The television over the mantel, on the wall above the brick — where the
  // August photographs have it.
  if(tv>0){
    const th=tv*9/16,y=h+0.12+th/2;
    g.add(box(MAT.black,tv,th,0.03,0,y,-d/2+0.03));
    g.add(box(MAT.screen,tv-0.02,th-0.02,0.006,0,y,-d/2+0.048));
  }
  g.add(box(iron,radius*1.58,h*0.29,0.015,0,base+h*0.18,d/2-0.035));
  for(const s of [-1,1])g.add(box(MAT.steel,0.015,h*0.29,0.02,s*radius*0.8,base+h*0.18,d/2-0.023));
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
          const g=stairFlight(o,L.elevation,rise,annotation);
          L.shell.add(g);L.objMeshes[index].built=g;
          const cut={x:o.c[0],z:o.c[2],yaw:o.yaw,hx:o.d[0]/2+0.08,hz:o.d[2]/2+0.04};
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
      :brickFireplace(spec.width,spec.height,spec.depth,room.mats?.brick,spec.tv);
    g.position.set(w.c[0]+nx*side*(WALL_T/2+spec.depth/2),L.elevation,w.c[2]+nz*side*(WALL_T/2+spec.depth/2));
    g.rotation.y=w.yaw+(side<0?Math.PI:0);L.trim.add(g);
  }
}

export function inStairCut(cut,x,z){
  if(!cut)return false;
  const dx=x-cut.x,dz=z-cut.z,c=Math.cos(cut.yaw),s=Math.sin(cut.yaw);
  return Math.abs(c*dx-s*dz)<cut.hx&&Math.abs(s*dx+c*dz)<cut.hz;
}

// Subtract the rotated stair rectangle exactly. Each clipping edge emits its
// outside fragment; only the final polygon inside all four edges is discarded.
export function cutSlabQuad(quad,cut){
  if(!cut)return [quad];
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

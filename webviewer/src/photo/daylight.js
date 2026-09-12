import { onFloor } from '../core/geometry.js';
import { skyAt } from './sky.js';

// A static, low-resolution directional irradiance volume. Windows are area
// emitters; wall panels and their actual openings determine visibility. Store
// energy and its first directional moment, then shade each fragment's normal.
export function windowPortals(L){
  const result=[];
  for(const w of L.walls)for(const h of w.holes){
    if(h.k!=='window'&&h.k!=='door')continue;
    const c=Math.cos(w.yaw),s=Math.sin(w.yaw),u=(h.x0+h.x1)/2;
    const x=w.c[0]+c*u,z=w.c[2]-s*u;
    // Interior doors transfer baked bounce; they must not emit outdoor light.
    if(onFloor(L,x+s*0.35,z+c*0.35)&&onFloor(L,x-s*0.35,z-c*0.35))continue;
    result.push({x,y:w.c[1]+(h.y0+h.y1)/2,z,c,s,
      width:h.x1-h.x0,height:h.y1-h.y0});
  }
  return result;
}

export function clearDaylight(L,p,q){
  for(const w of L.walls){
    const c=Math.cos(w.yaw),s=Math.sin(w.yaw);
    const a=(p[0]-w.c[0])*s+(p[2]-w.c[2])*c;
    const b=(q[0]-w.c[0])*s+(q[2]-w.c[2])*c;
    if(Math.abs(a-b)<1e-8)continue;
    const t=a/(a-b);if(t<0.002||t>0.998)continue;
    const x=p[0]+(q[0]-p[0])*t,z=p[2]+(q[2]-p[2])*t;
    const u=(x-w.c[0])*c-(z-w.c[2])*s,y=p[1]+(q[1]-p[1])*t-w.c[1];
    if(Math.abs(u)>w.w/2+0.01||y<-w.h/2||y>w.h/2+0.02)continue;
    if(!w.holes.some(h=>u>h.x0&&u<h.x1&&y>h.y0&&y<h.y1))return false;
  }
  // The photo-inferred soffits also stop skylight; otherwise their hidden
  // volume would illuminate the ceiling directly below it.
  for(const r of L.rooms||[]){
    const roof=r.finishes?.roof;if(!roof)continue;
    const c=Math.cos(roof.yaw),s=Math.sin(roof.yaw);
    const local=v=>[c*v[0]-s*v[2],v[1]-L.elevation,s*v[0]+c*v[2]];
    const a=local(p),b=local(q),gradient=(roof.low-roof.high)/(roof.u1-roof.u0);
    const d=v=>v[1]-roof.high-(v[0]-roof.u0)*gradient;
    const da=d(a),db=d(b),t=da/(da-db);
    if(t>0.002&&t<0.998){
      const u=a[0]+(b[0]-a[0])*t,v=a[2]+(b[2]-a[2])*t;
      if(u>roof.u0&&u<roof.u1&&v>roof.v0&&v<roof.v1)return false;
    }
  }
  for(const o of L.daylightBlockers||[])if(blocksDaylight(o,p,q))return false;
  return true;
}

// Large opaque furnishings occlude window light. Open frames (tables/chairs)
// are excluded because their RoomPlan boxes include mostly empty air.
export function blocksDaylight(o,p,q){
  const c=Math.cos(o.yaw),s=Math.sin(o.yaw);
  const local=v=>[c*(v[0]-o.c[0])-s*(v[2]-o.c[2]),v[1]-o.c[1],s*(v[0]-o.c[0])+c*(v[2]-o.c[2])];
  const a=local(p),b=local(q),half=o.d.map(v=>v/2);
  if(a.every((v,i)=>Math.abs(v)<half[i]+0.015))return false;
  let enter=0,leave=1;
  for(let i=0;i<3;i++){
    const delta=b[i]-a[i];
    if(Math.abs(delta)<1e-8){if(Math.abs(a[i])>half[i])return false;continue;}
    let lo=(-half[i]-a[i])/delta,hi=(half[i]-a[i])/delta;
    if(lo>hi)[lo,hi]=[hi,lo];enter=Math.max(enter,lo);leave=Math.min(leave,hi);
  }
  return enter<leave&&enter<0.998&&leave>0.002;
}

export function bakeDaylight(L){
  const g=0.32,b=L.bounds,nx=Math.ceil((b.x1-b.x0)/g)+1,nz=Math.ceil((b.z1-b.z0)/g)+1,ny=8;
  // The scanned boxes, less any the dressing replaced, plus what it laid out.
  L.daylightBlockers=(L.objects||[]).filter(o=>!o.replaced&&['storage','refrigerator','washerDryer','oven'].includes(o.cat))
    .concat(L.daylightExtra||[]);
  const portals=windowPortals(L),bytes=new Uint8Array(nx*nz*ny*4);
  const samples=[];
  for(let v=0;v<4;v++)for(let u=0;u<4;u++)samples.push([(u+0.5)/4-0.5,(v+0.5)/4-0.5]);
  for(let k=0;k<ny;k++)for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const p=[b.x0+i*g,L.elevation+0.08+k*(L.ceiling-0.16)/(ny-1),b.z0+j*g];
    let energy=0,mx=0,my=0,mz=0;
    for(const a of portals)for(const [u,v] of samples){
      const q=[a.x+a.c*u*a.width,a.y+v*a.height,a.z-a.s*u*a.width];
      const dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2],d=Math.hypot(dx,dy,dz);
      if(d<0.02||!clearDaylight(L,p,q))continue;
      const area=a.width*a.height;
      const e=area*Math.abs((dx*a.s+dz*a.c)/d)/(d*d+area)/samples.length;
      energy+=e;mx+=dx/d*e;my+=dy/d*e;mz+=dz/d*e;
    }
    const idx=(j*nx*ny+k*nx+i)*4;
    // Moments encode signed values in [-2,2]; alpha holds non-directional
    // bounce only. Direct window light is evaluated against the surface normal,
    // so it cannot light the back of a window wall as an ambient source.
    bytes[idx]=Math.round(127.5+Math.max(-2,Math.min(2,mx))*63.75);
    bytes[idx+1]=Math.round(127.5+Math.max(-2,Math.min(2,my))*63.75);
    bytes[idx+2]=Math.round(127.5+Math.max(-2,Math.min(2,mz))*63.75);
    const bounce=0.055+Math.pow(Math.max(0,skyAt(L.sky,p[0],p[2])),0.65)*0.65;
    bytes[idx+3]=Math.round(Math.min(1,(bounce+energy*0.08)/2)*255);
  }
  const texture=new THREE.DataTexture(bytes,nx*ny,nz,THREE.RGBAFormat);
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  return {texture,origin:new THREE.Vector3(b.x0,L.elevation+0.08,b.z0),nx,nz,ny,g,x:b.x0,z:b.z0,y:L.elevation+0.08,height:L.ceiling-0.16,portals:portals.length};
}

function daylightMaterial(material,field){
  const m=material.clone();
  m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{
      daylightMap:{value:field.texture},daylightOrigin:{value:field.origin},
      daylightSize:{value:new THREE.Vector4(field.nx,field.nz,field.ny,field.g)},daylightHeight:{value:field.height},
    });
    shader.vertexShader='varying vec3 vDaylightPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
      vec4 daylightLocal=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
        daylightLocal=instanceMatrix*daylightLocal;
      #endif
      vDaylightPosition=(modelMatrix*daylightLocal).xyz;`);
    shader.fragmentShader=`varying vec3 vDaylightPosition;
      uniform sampler2D daylightMap;
      uniform vec3 daylightOrigin;
      uniform vec4 daylightSize;
      uniform float daylightHeight;
      vec4 daylightSlice(vec2 cell,float slice){
        return texture2D(daylightMap,vec2((cell.x+0.5+slice*daylightSize.x)/(daylightSize.x*daylightSize.z),(cell.y+0.5)/daylightSize.y));
      }
      `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`#include <lights_fragment_maps>
      vec3 daylightP=vDaylightPosition-daylightOrigin;
      vec2 daylightCell=clamp(daylightP.xz/daylightSize.w,vec2(0.0),daylightSize.xy-1.0);
      float layer=clamp(daylightP.y/daylightHeight,0.0,1.0)*(daylightSize.z-1.0);
      vec4 field=mix(daylightSlice(daylightCell,floor(layer)),daylightSlice(daylightCell,min(floor(layer)+1.0,daylightSize.z-1.0)),fract(layer));
      vec3 daylightNormal=inverseTransformDirection(normal,viewMatrix);
      // Remove the byte encoding's half-step offset before taking the cosine.
      vec3 windowMoment=(field.rgb*255.0-128.0)/63.75;
      float windowLight=field.a*2.0+max(0.0,dot(daylightNormal,windowMoment))*0.9;
      // Light in a room comes in at the windows and up off the floor: a face
      // that looks up is lit a little more, a ceiling a little less, and a
      // wall between the two — the gradient every photograph of a room has.
      windowLight*=0.86+0.26*clamp(daylightNormal.y*0.5+0.5,0.0,1.0);
      irradiance=PI*windowLight*vec3(1.0,0.985,0.955)*2.2;
      // Exterior environment supplies restrained specular reflections; diffuse
      // indoor illumination comes from windows rather than an unoccluded sky.
      iblIrradiance*=0.025;
      radiance*=0.45;
    `);
  };
  m.customProgramCacheKey=()=> 'window-daylight-v2';
  return m;
}

export function dressDaylight(L){
  const field=L.daylight=bakeDaylight(L),cache=new Map();
  const material=m=>{
    if(cache.has(m))return cache.get(m);
    if(!m?.isMeshStandardMaterial||m.transparent)return m;
    const lit=daylightMaterial(m,field);cache.set(m,lit);cache.set(lit,lit);
    return cache.get(m);
  };
  for(const p of L.wallMeshes)p.photo=p.photo.map(material);
  for(const host of [L.roomFloor,L.roomCeil,L.trim,L.furn,L.shell])host.traverse(o=>{
    if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(material):material(o.material);
  });
  for(const o of L.objMeshes)o.real=material(o.real);
}

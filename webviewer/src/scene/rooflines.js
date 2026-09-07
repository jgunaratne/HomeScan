
// Photo-inferred soffits in the scan's rotated plan frame. Each wedge replaces
// its part of the flat slab and closes back up to it along the exposed edges.
export function roofCut(spec){
  const c=Math.cos(spec.yaw),s=Math.sin(spec.yaw);
  const u=(spec.u0+spec.u1)/2,v=(spec.v0+spec.v1)/2;
  return {x:c*u+s*v,z:-s*u+c*v,yaw:spec.yaw,hx:(spec.u1-spec.u0)/2,hz:(spec.v1-spec.v0)/2};
}

export function roofVertices(spec, elevation, ceiling){
  const c=Math.cos(spec.yaw),s=Math.sin(spec.yaw);
  const point=(u,v,h)=>[c*u+s*v,elevation+h,-s*u+c*v];
  const a=point(spec.u0,spec.v0,spec.high),b=point(spec.u1,spec.v0,spec.low);
  const d=point(spec.u0,spec.v1,spec.high),e=point(spec.u1,spec.v1,spec.low);
  const A=point(spec.u0,spec.v0,ceiling),B=point(spec.u1,spec.v0,ceiling);
  const D=point(spec.u0,spec.v1,ceiling),E=point(spec.u1,spec.v1,ceiling);
  return {slope:[a,b,e,a,e,d],returns:[a,A,B,a,B,b,d,e,E,d,E,D,b,B,E,b,E,e,a,d,D,a,D,A]};
}

export function dressRooflines(L){
  L.roofCuts=[];
  for(const room of L.rooms){
    const spec=room.finishes?.roof;
    if(!spec||!room.mats?.ceil)continue;
    L.roofCuts.push(roofCut(spec));
    const vertices=roofVertices(spec,L.elevation,L.ceiling);
    for(const kind of ['slope','returns']){
      const geo=new THREE.BufferGeometry(),pos=vertices[kind].flat();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      geo.setAttribute('uv',new THREE.Float32BufferAttribute(vertices[kind].flatMap(p=>[p[0]/1.9,p[2]/1.9+p[1]/1.9]),2));
      geo.computeVertexNormals();
      const mat=(kind==='slope'||spec.returnFinish==='ceil'?room.mats.ceil:room.mats.wall).clone();mat.side=THREE.DoubleSide;
      const mesh=new THREE.Mesh(geo,mat);mesh.name=room.name+' roof '+kind;
      L.roomCeil.add(mesh);
    }
  }
}

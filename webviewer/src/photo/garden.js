import { box, tube } from '../scene/fittings.js';
import { MAT } from '../scene/materials.js';
import { onFloor } from '../core/geometry.js';

// Near geometry is photo-guided staging. The scan supplies the attachment
// wall; deck size and garden layout are annotations, not surveyed boundaries.
export function buildGarden(world,levels){
  for(const L of levels)for(const room of L.rooms){
    const spec=room.finishes?.deck;if(!spec)continue;
    const wall=L.walls.find(w=>Math.hypot(w.c[0]-spec.wallAt[0],w.c[2]-spec.wallAt[1])<0.1);
    if(!wall||!wall.holes.some(h=>h.k==='door')||!(spec.width>1&&spec.width<12&&spec.depth>1&&spec.depth<8))continue;
    const nx=Math.sin(wall.yaw),nz=Math.cos(wall.yaw);
    const side=(room.at[0]-wall.c[0])*nx+(room.at[1]-wall.c[2])*nz>0?-1:1;
    const w=spec.width,d=spec.depth,deck=new THREE.Group();
    deck.position.set(wall.c[0]+nx*side*0.13,L.elevation-0.045,wall.c[2]+nz*side*0.13);
    deck.rotation.y=wall.yaw+(side<0?Math.PI:0);deck.name='Photo-guided deck';
    const timber=MAT.wood.clone();timber.color.setHex(0x817866).convertSRGBToLinear();timber.roughness=0.78;timber.envMapIntensity=0.35;
    const metal=MAT.dark.clone();metal.color.setHex(0x424b49).convertSRGBToLinear();metal.roughness=0.55;
    const count=Math.ceil(w/0.14),board=w/count;
    for(let i=0;i<count;i++)deck.add(box(timber,board-0.006,0.045,d,-w/2+board*(i+0.5),0,d/2));
    deck.add(box(timber,w,0.18,0.04,0,-0.065,d));
    // Front cable railing and open pergola as seen in the deck photographs.
    for(const x of [-w/2,0,w/2]){
      deck.add(box(metal,0.07,1.0,0.07,x,0.5,d));
      deck.add(box(metal,0.16,0.018,0.16,x,0.035,d));
    }
    deck.add(box(timber,w+0.06,0.055,0.09,0,1.02,d));
    for(let y=0.18;y<0.94;y+=0.14)deck.add(tube(metal,0.003,w,0,y,d,'x'));
    for(const x of [-w/2,w/2]){
      deck.add(box(metal,0.09,2.45,0.09,x,1.225,d));
      deck.add(box(timber,0.08,0.055,d,x,1.02,d/2));
      for(let y=0.18;y<0.94;y+=0.14)deck.add(tube(metal,0.003,d,x,y,d/2,'z'));
    }
    deck.add(box(metal,w+0.12,0.11,0.09,0,2.45,d));
    for(let x=-w/2;x<=w/2+0.01;x+=w/6)deck.add(box(metal,0.045,0.10,d+0.15,x,2.48,d/2));
    deck.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    L.group.add(deck);L.exterior=deck;deck.updateMatrixWorld(true);

    const leaf=new THREE.MeshStandardMaterial({color:0x53783a,roughness:1,envMapIntensity:0.25});leaf.color.convertSRGBToLinear();
    const plants=[],transform=new THREE.Object3D(),point=new THREE.Vector3();
    const hash=n=>{const v=Math.sin(n*91.7+13)*43758.5453;return v-Math.floor(v);};
    for(let shrub=0;shrub<18;shrub++){
      point.set((shrub%9-4)*1.65,0,d+3.5+Math.floor(shrub/9)*4);deck.localToWorld(point);
      const x=point.x,z=point.z;
      // Keep entire shrubs clear of the scanned building on every storey.
      if(levels.some(level=>[-1,0,1].some(dx=>[-1,0,1].some(dz=>onFloor(level,x+dx,z+dz)))))continue;
      for(let i=0;i<96;i++){
        const a=hash(shrub*101+i)*Math.PI*2,r=Math.sqrt(hash(i*17+shrub))*0.65;
        plants.push([x+Math.cos(a)*r,levels[0].elevation-0.18+0.3+hash(i*7+shrub)*0.45,z+Math.sin(a)*r,0.08+hash(i+shrub)*0.08]);
      }
    }
    const foliage=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),leaf,plants.length);
    plants.forEach(([x,y,z,r],i)=>{
      transform.position.set(x,y,z);transform.scale.set(r,r*0.7,r);transform.rotation.set(i,hash(i),i*0.2);transform.updateMatrix();
      foliage.setMatrixAt(i,transform.matrix);foliage.setColorAt(i,new THREE.Color().setScalar(0.7+hash(i)*0.4));
    });
    foliage.name='Near garden planting';foliage.castShadow=true;foliage.receiveShadow=true;world.add(foliage);
  }
}

// A lawn is not one green. From a window, or from the air, it is patches —
// yellower where it dries, darker where it grows thick — over a grain of
// blades, and the flat median of the photographed crop was neither: it read as
// baize. (Its bump was a fabric checker, which from a distance beat into
// stripes; r128 gives every map the colour map's repeat, so it was never at the
// scale it asked for either.) The crop still sets the palette. Its own detail,
// photographed light and fence wire, stays out: the patches and the grain are
// drawn here on a periodic lattice, so the tile has no seam and can repeat
// plainly, and lawnGround's vertex colours carry what is broader than a tile.
//
// The crop is also a photograph of lawn in sun, exposed for a room. Taken as
// albedo at half strength and lit again by the sun, it came out nearly as
// bright as the white walls beside it: lime, from the air. Grass sends back
// about a tenth of the light that falls on it; at 0.27 the sunlit lawn in the
// section view is the photograph's own green, rgb(95,136,59), against walls at
// 200-220, and through a window it is what the listing shows.
export const LAWN_TILE = 9;   // metres of ground per repeat of the lawn texture
export function lawnMaterial(img,rect,lawn){
  let base=new THREE.Color(lawn).toArray().map(v=>v*255);
  if(rect){
    const c=document.createElement('canvas');c.width=c.height=64;
    const ctx=c.getContext('2d');
    ctx.drawImage(img,rect[0]*img.naturalWidth,rect[1]*img.naturalHeight,rect[2]*img.naturalWidth,rect[3]*img.naturalHeight,0,0,64,64);
    const data=ctx.getImageData(0,0,64,64).data,channels=[[],[],[]];
    for(let i=0;i<data.length;i+=4)for(let ch=0;ch<3;ch++)channels[ch].push(data[i+ch]);
    base=channels.map(values=>values.sort((a,b)=>a-b)[values.length>>1]);
  }
  const N=512,c=document.createElement('canvas');c.width=c.height=N;
  const ctx=c.getContext('2d'),pixels=ctx.createImageData(N,N),px=pixels.data;
  let seed=1907;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  // Patches from about 4.5 m down to 14 cm, each octave a lattice that wraps.
  const octaves=[[2,0.34],[4,0.26],[8,0.18],[16,0.12],[32,0.06],[64,0.04]].map(([n,amp])=>
    ({n,amp,v:Float32Array.from({length:n*n},()=>random()*2-1)}));
  const ease=t=>t*t*(3-2*t);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    let patch=0;
    for(const {n,amp,v} of octaves){
      const fx=x*n/N,fy=y*n/N,ix=Math.floor(fx),iy=Math.floor(fy),tx=ease(fx-ix),ty=ease(fy-iy);
      const x1=(ix+1)%n,y1=(iy+1)%n,a=v[iy*n+ix],b=v[iy*n+x1],d=v[y1*n+ix],e=v[y1*n+x1];
      patch+=amp*(a+(b-a)*tx+(d-a)*ty+(a-b-d+e)*tx*ty);
    }
    const light=1+0.22*patch+0.08*(random()*2-1),dry=Math.max(0,patch-0.18),i=(y*N+x)*4;
    px[i]=base[0]*light*(1+0.35*dry);px[i+1]=base[1]*light*(1+0.04*dry);px[i+2]=base[2]*light*(1-0.4*dry);px[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;
  return new THREE.MeshStandardMaterial({map:t,color:new THREE.Color(0.27,0.27,0.27),vertexColors:true,roughness:1,envMapIntensity:0.3});
}

// Ground in rings about the house, from radius `inner` to `outer` at height
// `y`. A vertex's uv is its own x and z over LAWN_TILE, so two of these meet
// without a seam, and its colour is a sum of slow waves, 17 to 65 m long —
// patches a tile of texture is too small to hold, which also stop the tile
// from showing as a grid when the lawn is seen from the air.
export function lawnGround(material,inner,outer,y){
  const rings=Math.max(1,Math.ceil((outer-inner)/2)),sides=128,pos=[],uv=[],col=[],nrm=[],index=[];
  for(let i=0;i<=rings;i++){
    const r=inner+(outer-inner)*i/rings;
    for(let j=0;j<sides;j++){
      const a=j/sides*Math.PI*2,x=r*Math.sin(a),z=r*Math.cos(a);
      const wave=0.5*Math.sin(x*0.083+z*0.051+1.7)+0.35*Math.sin(z*0.121-x*0.047+0.4)
                +0.25*Math.sin(x*0.173-z*0.139+2.9)+0.15*Math.sin(x*0.29+z*0.23+5.1);
      const k=1+0.14*wave;
      pos.push(x,y,z);uv.push(x/LAWN_TILE,-z/LAWN_TILE);nrm.push(0,1,0);col.push(k*(1+0.03*wave),k,k*(1-0.05*wave));
    }
  }
  for(let i=0;i<rings;i++)for(let j=0;j<sides;j++){
    const a=i*sides+j,b=i*sides+(j+1)%sides;
    index.push(a,a+sides,b,b,a+sides,b+sides);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  geometry.setIndex(index);
  const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;
  return mesh;
}

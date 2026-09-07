import { box, tube } from '../scene/fittings.js';
import { MAT } from '../scene/materials.js';
import { onFloor } from '../core/geometry.js';
import { surfaceTile } from '../scene/textures.js';

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

export function lawnMaterial(img,rect,lawn){
  const material=new THREE.MeshStandardMaterial({color:new THREE.Color(lawn).convertSRGBToLinear(),roughness:1,envMapIntensity:0.3});
  if(rect){
    const c=document.createElement('canvas');c.width=c.height=256;
    c.getContext('2d').drawImage(img,rect[0]*img.naturalWidth,rect[1]*img.naturalHeight,rect[2]*img.naturalWidth,rect[3]*img.naturalHeight,0,0,256,256);
    // Strongly remove photographed lighting and fence wires before tiling.
    // The crop supplies the lawn palette and only a little high-frequency detail.
    const ctx=c.getContext('2d'),pixels=ctx.getImageData(0,0,256,256),channels=[[],[],[]];
    for(let i=0;i<pixels.data.length;i+=4)for(let ch=0;ch<3;ch++)channels[ch].push(pixels.data[i+ch]);
    const median=channels.map(values=>values.sort((a,b)=>a-b)[values.length>>1]);
    for(let i=0;i<pixels.data.length;i+=4)for(let ch=0;ch<3;ch++)pixels.data[i+ch]=median[ch]*0.96+pixels.data[i+ch]*0.04;
    ctx.putImageData(pixels,0,0);
    const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.wrapS=t.wrapT=THREE.MirroredRepeatWrapping;t.repeat.set(24,24);t.anisotropy=4;
    material.map=t;material.color.setHex(0x888888);
  }
  material.bumpMap=surfaceTile('fabric');material.bumpMap.repeat.set(80,80);material.bumpScale=0.008;
  return material;
}

import { plankCanvases } from '../scene/textures.js';
import { renderer } from '../scene/stage.js';
import { BANDS, FLATTEN, photoRooms } from './rooms.js';

// Read the picture down to a size worth scanning. Everything below works on this
// copy; the winning patch is then re-cut from the full-resolution original.
function analyse(img){
  const w = 320, h = Math.max(1, Math.round(img.naturalHeight/img.naturalWidth*w));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return {px: c.getContext('2d').getImageData(0,0,w,h).data, w, h};
}

function patchStats(A, x0, y0, S){
  let r=0, g=0, b=0;
  const n = S*S;
  for (let y=y0;y<y0+S;y++) for (let x=x0;x<x0+S;x++){
    const i = (y*A.w + x)*4;
    r += A.px[i]; g += A.px[i+1]; b += A.px[i+2];
  }
  r/=n; g/=n; b/=n;
  let v = 0;
  for (let y=y0;y<y0+S;y++) for (let x=x0;x<x0+S;x++){
    const i = (y*A.w + x)*4;
    v += (A.px[i]-r)**2 + (A.px[i+1]-g)**2 + (A.px[i+2]-b)**2;
  }
  return {r, g, b, sd:Math.sqrt(v/(n*3)), x:x0, y:y0, S};
}

// The best patch is the flattest one that also sits closest to the band's own
// median colour — which is what picks painted wall over the picture hanging on
// it, and floorboards over the rug. Blown-out windows and black voids are out.
function bestPatch(A, band, medianWeight, ceiling, lowBias){
  const S = 24, step = 12;
  const y0 = Math.round(A.h*band[0]), y1 = Math.max(y0, Math.round(A.h*band[1]) - S);
  const cand = [];
  for (let y=y0; y<=y1; y+=step) for (let x=0; x<=A.w-S; x+=step){
    const p = patchStats(A, x, y, S);
    const lum = 0.299*p.r + 0.587*p.g + 0.114*p.b;
    // A blown-out window is out; a white ceiling under downlights is not, and
    // the one cutoff used to throw every ceiling in the house away.
    if (lum > ceiling || lum < 20) continue;
    cand.push(p);
  }
  if (!cand.length) return null;
  const med = k => { const v = cand.map(c => c[k]).sort((a,b) => a-b); return v[v.length>>1]; };
  const mr = med('r'), mg = med('g'), mb = med('b');
  let best = null, bs = Infinity;
  for (const p of cand){
    // Floors want the bottom of the frame: the kitchen's own band is mostly
    // worktop, and only the last rows are the boards you are standing on.
    const up = (y1 > y0) ? 1 - (p.y - y0)/(y1 - y0) : 0;
    const s = p.sd + Math.hypot(p.r-mr, p.g-mg, p.b-mb)*medianWeight + up*lowBias;
    if (s < bs){ bs = s; best = p; }
  }
  best.score = bs;
  return best;
}

// Cut the winning patch out of the full-resolution photograph and iron it flat.
// A photograph carries its own light; pulling each pixel toward the patch mean
// takes the gradient out, so a tiled wall reads as paint rather than banding.
// Floors keep most of their contrast — the grain is the point.
function patchCanvas(img, A, p, flatten){
  const N = 256, k = img.naturalWidth / A.w;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const cx = c.getContext('2d');
  cx.drawImage(img, p.x*k, p.y*k, p.S*k, p.S*k, 0, 0, N, N);
  const d = cx.getImageData(0, 0, N, N);
  for (let i=0;i<d.data.length;i+=4){
    d.data[i]   += (p.r - d.data[i])   * flatten;
    d.data[i+1] += (p.g - d.data[i+1]) * flatten;
    d.data[i+2] += (p.b - d.data[i+2]) * flatten;
  }
  cx.putImageData(d, 0, 0);
  return c;
}

function tiling(canvas, colour = true){
  const t = new THREE.CanvasTexture(canvas);
  // Mirrored, so a 128px patch tiles a 4 m wall without a seam every 1.15 m.
  t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
  t.encoding = colour ? THREE.sRGBEncoding : THREE.LinearEncoding;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// A height field read straight off the patch: where the photograph is darker
// the surface is lower. On a wall that has been ironed flat this comes out to
// almost nothing, which is correct — paint is flat. On boards it is the grain,
// and on tile it is the grout, and both of them catch the light.
function reliefFrom(canvas, strength){
  const N = canvas.width;
  const src = canvas.getContext('2d').getImageData(0, 0, N, N).data;
  const out = document.createElement('canvas');
  out.width = out.height = N;
  const cx = out.getContext('2d');
  const d = cx.createImageData(N, N);
  const lum = (x, y) => {
    const i = (((y + N) % N)*N + ((x + N) % N))*4;
    return (src[i]*0.299 + src[i+1]*0.587 + src[i+2]*0.114)/255;
  };
  for (let y=0;y<N;y++) for (let x=0;x<N;x++){
    const nx = -(lum(x+1, y) - lum(x-1, y))*strength;
    const ny = -(lum(x, y+1) - lum(x, y-1))*strength;
    const l = Math.hypot(nx, ny, 1);
    const i = (y*N + x)*4;
    d.data[i] = (nx/l*0.5 + 0.5)*255;
    d.data[i+1] = (ny/l*0.5 + 0.5)*255;
    d.data[i+2] = (1/l*0.5 + 0.5)*255;
    d.data[i+3] = 255;
  }
  cx.putImageData(d, 0, 0);
  return out;
}

// The photographs are lit; the scene lights them again. Holding the material
// colour below white is what keeps a sunlit wall from blowing out indoors.
const PHYS = {
  wall:  {roughness:0.94, relief:5.0,  scale:0.35, env:0.38},
  floor: {roughness:0.30, relief:11.0, scale:0.55, env:0.58},
  ceil:  {roughness:0.98, relief:0.0,  scale:0.0,  env:0.30},
};
function surfMat(canvas, tint, extra, kind){
  const k = PHYS[kind] || PHYS.wall;
  const m = new THREE.MeshStandardMaterial(Object.assign({
    map: tiling(canvas), color: tint, vertexColors: true,
    roughness: k.roughness, metalness: 0.0, envMapIntensity: k.env,
  }, extra || {}));
  if (k.relief > 0){
    m.normalMap = tiling(reliefFrom(canvas, k.relief), false);
    m.normalScale = new THREE.Vector2(k.scale, k.scale);
  }
  return m;
}

function timberFloor(pick){
  const tiles = plankCanvases(pick);
  const m = surfMat(tiles.colour, 0xD0D0D0, {side:THREE.DoubleSide}, 'floor');
  m.normalMap.dispose();
  m.normalMap = tiling(reliefFrom(tiles.height, 2), false);
  m.normalScale.set(0.28, 0.28);
  m.roughnessMap = tiling(tiles.roughness, false);
  m.roughness = 0.64;
  for (const t of [m.map, m.normalMap, m.roughnessMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return m;
}

export function dressRoom(room){
  const pick = room.pick = {};
  for (const ph of room.shots){
    if (!ph.img) continue;
    const A = analyse(ph.img);
    for (const kind of ['wall','floor','ceil']){
      const p = bestPatch(A, BANDS[kind], kind === 'ceil' ? 0.2 : 0.6,
                          kind === 'ceil' ? 253 : 240, kind === 'floor' ? 9 : 0);
      if (p && (!pick[kind] || p.score < pick[kind].score))
        pick[kind] = {canvas:patchCanvas(ph.img, A, p, kind==='wall'&&room.finishes?.wall==='paint' ? 1 : FLATTEN[kind]),
                      score:p.score, r:p.r, g:p.g, b:p.b};
    }
  }
  // Reviewed rectangles override automatic selection only when their source
  // decoded successfully. Bad annotations retain the automatic fallback.
  for(const [kind,sample] of Object.entries(room.finishes?.samples || {})){
    const ph=room.shots.find(p=>p.file===sample?.file&&p.img);
    if(!ph||!validSampleRect(sample?.rect))continue;
    const [x,y,w,h]=sample.rect,c=document.createElement('canvas');c.width=c.height=256;
    const ctx=c.getContext('2d');
    ctx.drawImage(ph.img,x*ph.img.naturalWidth,y*ph.img.naturalHeight,w*ph.img.naturalWidth,h*ph.img.naturalHeight,0,0,256,256);
    const pixels=ctx.getImageData(0,0,256,256);let r=0,g=0,b=0;
    for(let i=0;i<pixels.data.length;i+=4){r+=pixels.data[i];g+=pixels.data[i+1];b+=pixels.data[i+2];}
    r/=65536;g/=65536;b/=65536;
    const flatten=kind==='wall' ? 1 : (FLATTEN[kind] ?? 0.55);
    for(let i=0;i<pixels.data.length;i+=4){
      pixels.data[i]+=(r-pixels.data[i])*flatten;
      pixels.data[i+1]+=(g-pixels.data[i+1])*flatten;
      pixels.data[i+2]+=(b-pixels.data[i+2])*flatten;
    }
    ctx.putImageData(pixels,0,0);
    pick[kind]={canvas:c,r,g,b,score:0,reviewed:true,file:sample.file,rect:sample.rect};
  }
  if (!pick.wall) return null;
  // A low-confidence wall is brown in the flat survey and painted here: this
  // view is about what the house looks like, and P still gives the other one.
  const wall = surfMat(pick.wall.canvas, 0xBFBFBF, null, 'wall');
  return {
    wall, wallLow: wall,
    counter: pick.counter && detailMaterial(pick.counter,0.36),
    brick: pick.brick && detailMaterial(pick.brick,0.94),
    floor: pick.floor && (room.finishes?.floor === 'timber' ? timberFloor(pick.floor) :
      surfMat(pick.floor.canvas, 0xB6B6B6, {side:THREE.DoubleSide}, 'floor')),
    ceil:  pick.ceil  && surfMat(pick.ceil.canvas,  0xC6C6C6, {side:THREE.DoubleSide}, 'ceil'),
  };
}

// Surfaces no room claims — the garage, the far end of a hall — take the house's
// own average rather than the flat survey grey. Standing in a photographed room
// and seeing one brown low-confidence panel among the paint reads as a fault;
// a neutral wall the colour of the rest of the house does not, and it is still
// the photographs talking. Which panels those are is in the flat view.
let AVG = null;
function houseAverage(){
  const flat = (kind, extra) => {
    let r=0, g=0, b=0, n=0;
    for (const room of photoRooms){
      const p = room.pick && room.pick[kind];
      if (p){ r += p.r; g += p.g; b += p.b; n++; }
    }
    if (!n) return null;
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const cx = c.getContext('2d');
    cx.fillStyle = `rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})`;
    cx.fillRect(0, 0, 8, 8);
    return surfMat(c, kind === 'floor' ? 0xB6B6B6 : kind === 'ceil' ? 0xC6C6C6 : 0xBFBFBF,
                   extra, kind);
  };
  return {
    wall: flat('wall'),
    floor: flat('floor', {side:THREE.DoubleSide}),
    ceil: flat('ceil', {side:THREE.DoubleSide}),
  };
}

// A linked photograph taints the canvas when the page is opened over file://,
// and every surface below is read back pixel by pixel. Ask once, before any of
// it, rather than letting the house die half-dressed.
export function canReadPixels(img){
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0, 1, 1);
    cx.getImageData(0, 0, 1, 1);
    return true;
  } catch { return false; }
}

// The average is computed once, after every room has been read.
export function computeAverage(){ return AVG = houseAverage(); }
export const avgMats = () => AVG;

export function validSampleRect(rect){
  return Array.isArray(rect)&&rect.length===4&&rect.every(Number.isFinite)&&
    rect[0]>=0&&rect[1]>=0&&rect[2]>0&&rect[3]>0&&rect[0]+rect[2]<=1&&rect[1]+rect[3]<=1;
}
function detailMaterial(pick,roughness){
  const map=tiling(pick.canvas),bump=tiling(pick.canvas,false);
  return new THREE.MeshStandardMaterial({map,bumpMap:bump,bumpScale:0.0008,
    roughness,envMapIntensity:0.3,color:0xffffff});
}

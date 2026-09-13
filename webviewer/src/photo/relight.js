import { plankCanvases, tileCanvases, surfaceTile } from '../scene/textures.js';
import { renderer } from '../scene/stage.js';
import { BANDS, FLATTEN, photoRooms } from './rooms.js';
import { swatchesLoaded } from '../scene/swatches.js';

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
function surfMat(canvas, tint, extra, kind, coated = false){
  const k = PHYS[kind] || PHYS.wall;
  // A coated floor is physical: the oil on the boards is a thin clear layer
  // that mirrors the windows sharply where the wood beneath only glows.
  const m = new (coated ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)(Object.assign({
    map: tiling(canvas), color: tint,
    roughness: k.roughness, metalness: 0.0, envMapIntensity: k.env,
  }, coated ? {clearcoat:0.35, clearcoatRoughness:0.4} : {}, extra || {}));
  if (k.relief > 0){
    m.normalMap = tiling(reliefFrom(canvas, k.relief), false);
    m.normalScale = new THREE.Vector2(k.scale, k.scale);
  }
  if(kind==='wall'||kind==='ceil'){
    // Independent micro-relief catches grazing light without tiling shadows
    // or fixtures from the source photograph into otherwise clean paint.
    m.bumpMap=surfaceTile('plaster');
    m.bumpScale=kind==='wall'?0.00035:0.00020;
  }
  return m;
}

// Boards are laid as planks rather than tiled as a patch, and the wood is named
// after itself — timber-cherry, timber-maple — so that two floors of different
// wood can both be boards without becoming one another.
const isTimber = finish => typeof finish === 'string' && finish.startsWith('timber');

// Finishes the house does not have yet. A wood named here is laid from this
// table rather than sampled from the photographs — the photographs show cherry,
// and the point of naming white oak is to see the house without it. The colour
// is the boards' own under neutral light; `boards` is how many make up one
// 1.55 m tile, so 8 is a 190 mm contemporary wide plank against the 155 mm
// board the sampled woods use, with quieter board-to-board variation and a
// matte oil finish. A wood not in the table keeps the sampling.
export const WOODS = {
  'timber-white-oak': {r:192, g:172, b:146, boards:8, length:3.6, vary:0.10, contrast:0.7, roughness:0.52,
                       swatch:'white_oak', lift:0.14, desat:0.35},
};
// Large-format porcelain for the bathrooms, `across` tiles to the 1.55 m
// repeat — two, so each is 775 mm, a 30" rectified tile.
export const TILES = {
  'tile-porcelain': {r:206, g:203, b:197, across:2, roughness:0.5},
  // A garage floor: one slab, no joints, the cloud of a trowelled finish.
  'concrete': {r:152, g:151, b:148, across:1, grout:0, roughness:0.85},
};
// A wall or ceiling finish may name a paint outright, as '#rrggbb'. That is
// what "paint all the walls white" is: not a sample flattened to its own
// colour, but a colour the photographs never had.
export const paintOf = finish => {
  if (typeof finish !== 'string' || !/^#[0-9a-f]{6}$/i.test(finish)) return null;
  const n = parseInt(finish.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const cx = c.getContext('2d');
  cx.fillStyle = finish; cx.fillRect(0, 0, 8, 8);
  return {canvas:c, r, g, b, score:0, named:true};
};

function timberFloor(pick, spec = {}){
  const tiles = plankCanvases(pick, spec);
  const m = surfMat(tiles.colour, 0xD0D0D0, {side:THREE.DoubleSide}, 'floor', true);
  m.normalMap.dispose();
  m.normalMap = tiling(reliefFrom(tiles.height, 2), false);
  m.normalScale.set(spec.boards ? 0.2 : 0.28, spec.boards ? 0.2 : 0.28);
  m.roughnessMap = tiling(tiles.roughness, false);
  m.roughness = spec.roughness ?? 0.64;
  for (const t of [m.map, m.normalMap, m.roughnessMap]){
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // The floor's UVs are in 1.55 m tiles; a longer tile repeats less often
    // along the boards.
    if (spec.length > 0) t.repeat.set(1, 1.55/spec.length);
  }
  return m;
}
function tileFloor(pick, spec){
  const tiles = tileCanvases(pick, spec);
  const m = surfMat(tiles.colour, 0xD0D0D0, {side:THREE.DoubleSide}, 'floor');
  m.normalMap.dispose();
  m.normalMap = tiling(reliefFrom(tiles.height, 1.5), false);
  m.normalScale.set(0.2, 0.2);
  m.roughnessMap = tiling(tiles.roughness, false);
  m.roughness = spec.roughness ?? 0.5;
  for (const t of [m.map, m.normalMap, m.roughnessMap]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return m;
}
// A floor named from the tables above, or null for one that is sampled.
function namedFloor(finish){
  const spec = WOODS[finish] || TILES[finish];
  if (!spec) return null;
  // A wood with a swatch is cut from the retailer's photograph of the board
  // rather than drawn; the palette colour stands in if the swatch is missing.
  const image = spec.swatch && swatchesLoaded[spec.swatch]?.img;
  return {spec, mat: WOODS[finish] ? timberFloor(spec, image ? {...spec, image} : spec) : tileFloor(spec, spec)};
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
  // A named paint replaces whatever the photographs offered, and scores zero
  // so it wins its group the way a reviewed crop does.
  for (const kind of ['wall','ceil']){
    const paint = paintOf(room.finishes?.[kind]);
    if (paint) pick[kind] = paint;
  }
  const named = namedFloor(room.finishes?.floor);
  if (named) pick.floor = {score:0, named:true, r:named.spec.r, g:named.spec.g, b:named.spec.b};
  // A declared room — a hall, say — has no photographs at all. It still gets a
  // materials object, empty, because the finish groups fill its floor and
  // ceiling by name and its walls fall back to the house average — or to a
  // paint it names itself. A room that has photographs but no usable wall in
  // any of them is a different case, and stays undressed.
  if (!room.shots.length && !pick.wall) return {wall:null, wallLow:null, floor:null, ceil:null};
  if (!pick.wall) return null;
  // A low-confidence wall is brown in the flat survey and painted here: this
  // view is about what the house looks like, and P still gives the other one.
  const wall = surfMat(pick.wall.canvas, 0xBFBFBF, null, 'wall');
  return {
    wall, wallLow: wall,
    counter: pick.counter && detailMaterial(pick.counter,0.36),
    brick: pick.brick && detailMaterial(pick.brick,0.94),
    floor: named?.mat || (pick.floor && (isTimber(room.finishes?.floor) ? timberFloor(pick.floor) :
      surfMat(pick.floor.canvas, 0xB6B6B6, {side:THREE.DoubleSide}, 'floor'))),
    ceil:  pick.ceil  && surfMat(pick.ceil.canvas,  0xC6C6C6, {side:THREE.DoubleSide}, 'ceil'),
  };
}

// Rooms that share a finish have to share a material, not merely a similar one.
// Every room picks its own patch out of its own photographs, and two pictures of
// one ceiling — taken from different corners, under different daylight — do not
// pick the same off-white. On screen that reads as the ceiling changing colour
// at a doorway, which is a thing the house does not do.
//
// A ceiling is one paint over a storey, so every room on the storey joins one
// group. A floor is not: tile, boards and vinyl are all real, so only rooms that
// say they have the same floor share one. The clearest patch in the group wins
// — the lowest score is the flattest and the closest to its band's median, and a
// reviewed rectangle from photos.json scores zero and so always wins. A room
// with no usable patch of its own inherits the group's, which is how a bathroom
// photographed from the doorway gets a ceiling at all.
//
// `finishes.ceil` is free to name something other than paint; a room that does
// forms its own group and keeps its own material.
export function shareFinishes(){
  const groups = new Map();
  // A ceiling groups by storey: it is one paint over one storey, and the storey
  // above may well have been painted on a different day. A floor groups across
  // the whole house, because what it declares is the material itself — a room
  // that says timber-cherry means the same boards wherever it is standing. That
  // is also why the two hardwoods in this house are named apart rather than
  // separated by which storey they happen to be on.
  const keyOf = (room, kind) => {
    if (kind === 'ceil') return `${room.level}/ceil/${room.finishes?.ceil ?? 'paint'}`;
    return room.finishes?.floor ? `floor/${room.finishes.floor}` : null;
  };
  for (const room of photoRooms){
    if (!room.mats) continue;
    for (const kind of ['floor','ceil']){
      const key = keyOf(room, kind);
      if (!key) continue;
      let group = groups.get(key);
      // The kind is carried, not parsed back out of the key: the two kinds no
      // longer key alike, and reading it off by position quietly wrote the
      // material to room.mats['timber-cherry'] instead of room.mats.floor.
      if (!group) groups.set(key, group = {kind, rooms:[], best:null});
      group.rooms.push(room);
      const pick = room.pick && room.pick[kind];
      if (pick && room.mats[kind] && (!group.best || pick.score < group.best.score))
        group.best = {score: pick.score, mat: room.mats[kind]};
    }
  }
  for (const group of groups.values()){
    if (!group.best) continue;
    for (const room of group.rooms) room.mats[group.kind] = group.best.mat;
  }
  return groups;
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

// Small deterministic material tiles; no asset downloads or runtime dependencies.
// `metres` is the real-world size of one repeat: box() lays its UVs out in
// metres, so a tile given a size repeats at that size on every piece it is on,
// however big the piece — the weave on a sofa is the weave on a chair.
export function surfaceTile(kind, metres){
  if (kind === 'carpet') return carpetFiberTile(metres);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d'), pixels = ctx.createImageData(256, 256);
  let seed = 731;
  const random = () => { seed = (1664525*seed + 1013904223) >>> 0; return seed/4294967296; };
  for (let y=0; y<256; y++) for (let x=0; x<256; x++){
    const noise = random() - 0.5;
    let v;
    if (kind === 'wood'){
      // Long grain along x, drifting slowly, with a finer figure over it and
      // the occasional darker streak.
      const drift = Math.sin(y*0.025)*2 + Math.sin(y*0.08)*0.5;
      const grain = Math.sin(x*0.34 + drift), fine = Math.sin(x*1.7 + Math.sin(y*0.04));
      const streak = Math.max(0, Math.sin(y*0.05 + Math.sin(x*0.01)*3) - 0.85)*20;
      v = 229 + grain*4 + fine*2 + noise*5 - streak;
    } else if (kind === 'plaster'){
      v = 180 + noise*45;
    } else if (kind === 'fabric'){
      v = 235 + ((x%4 < 2) !== (y%4 < 2) ? 2 : -2) + noise*5;
    } else if (kind === 'weave'){
      // A basket weave: warp and weft as crossing ridges, each thread a
      // rounded bump, with slubs of noise so it is not a grid.
      const warp = Math.sin(x*Math.PI/4), weft = Math.sin(y*Math.PI/4);
      const over = ((x>>3) + (y>>3)) % 2 ? warp : weft;
      v = 200 + over*22 + Math.abs(warp*weft)*10 + noise*18;
    } else if (kind === 'boucle'){
      // Loops: bright knots on a dark ground, at random, overlapping.
      const kx = Math.sin(x*0.9 + Math.sin(y*0.31)*4), ky = Math.sin(y*0.8 + Math.sin(x*0.27)*4);
      v = 170 + Math.max(0, kx*ky)*70 + noise*30;
    } else {
      v = 232 + Math.sin(x*0.04 + Math.sin(y*0.03)*3)*6 + noise*10;
    }
    const i = (y*256+x)*4;
    pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = Math.max(0, Math.min(255, v));
    pixels.data[i+3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  if (metres) texture.repeat.set(1/metres, 1/metres);
  else texture.repeat.set(kind === 'fabric' ? 5 : 2, kind === 'fabric' ? 5 : 2);
  texture.anisotropy = 4;
  return texture;
}

// Close-packed yarn tufts: a shadowed root, a curved bundle, and fine lit
// strands. Wrap strokes at the edges so the pile has no visible tile seam.
function carpetFiberTile(metres){
  const size=1024, canvas=document.createElement('canvas');
  canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#999999';ctx.fillRect(0,0,size,size);
  ctx.lineCap='round';
  let seed=731;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<24000;i++){
    const x=random()*size, y=random()*size, angle=random()*Math.PI*2;
    const length=7+random()*14, dx=Math.cos(angle)*length, dy=Math.sin(angle)*length;
    const bend=(random()-0.5)*9, bx=-Math.sin(angle)*bend, by=Math.cos(angle)*bend;
    const tone=Math.round(175+random()*55);
    const xs=[0], ys=[0];
    if(x<30)xs.push(size);if(x>size-30)xs.push(-size);
    if(y<30)ys.push(size);if(y>size-30)ys.push(-size);
    for(const ox of xs)for(const oy of ys){
      const strand=(width,shade,offset)=>{
        ctx.lineWidth=width;ctx.strokeStyle=`rgb(${shade},${shade},${shade})`;
        ctx.beginPath();ctx.moveTo(x+ox+offset,y+oy+offset);
        ctx.quadraticCurveTo(x+ox+dx*0.5+bx+offset,y+oy+dy*0.5+by+offset,x+ox+dx,y+oy+dy);
        ctx.stroke();
      };
      strand(4.5,tone*0.55,1.6);
      strand(2.8,tone,0);
      strand(0.8,Math.min(255,tone+30),-0.7);
    }
  }
  const texture=new THREE.CanvasTexture(canvas);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(1/metres,1/metres);
  texture.anisotropy=8;
  return texture;
}

// One tile of boards: `boards` of them across a `size` metre square, with
// staggered end joints. Colour is the wood's own; seams and grain are
// representative geometry. A wide contemporary plank is the same drawing with
// fewer, wider boards and quieter colour variation board to board.
export function plankCanvases(pick, spec = {}){
  // A tile is 1.55 m across the boards and, by default, 1.55 m along them,
  // with one end joint per board: boards about 0.75 m long. `length` makes
  // the tile that many metres along the boards instead, with two joints per
  // board at varying places, and doubles the resolution to pay for it — a
  // 3.6 m tile gives boards from 1.4 m to 2.2 m, the lengths a contemporary
  // wide plank is sold in.
  const long = spec.length > 0;
  const N = long ? 1024 : 512, result = {}, data = {};
  const boards = spec.boards ?? 10, vary = spec.vary ?? 0.24, contrast = spec.contrast ?? 1;
  const stretch = long ? spec.length/1.55 : 1;
  for (const kind of ['colour', 'height', 'roughness']){
    const c = document.createElement('canvas'); c.width = c.height = N;
    result[kind] = c; data[kind] = c.getContext('2d').createImageData(N, N);
  }
  const hash = n => { const v = Math.sin(n*127.1 + 71.7)*43758.5453; return v-Math.floor(v); };
  // With a swatch — a retailer's photograph of the board, grain running down
  // it — each board is cut from a slice of it: its own place across the
  // photograph, its own offset along it, mirrored end to end so the grain
  // never repeats within a board, and brightened or darkened a little as one
  // board is against the next.
  let sw = null;
  if (spec.image){
    const c = document.createElement('canvas'), img = spec.image;
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    sw = {px:c.getContext('2d').getImageData(0, 0, c.width, c.height).data, w:c.width, h:c.height,
          metres: spec.swatchMetres ?? 0.4};
  }
  const sample = (row, across, along) => {
    // `across` in 0..1 over one board of width 1.55/boards m; `along` in 0..1
    // over the tile's length. The photograph covers sw.metres of each.
    const boardW = 1.55/boards, tileL = long ? spec.length : 1.55;
    const px = ((hash(row*5 + 1)*0.4 + across*boardW/sw.metres)%1)*(sw.w - 1);
    let py = (hash(row*11 + 2)*sw.h + along*tileL/sw.metres*sw.h)%(sw.h*2);
    if (py >= sw.h) py = sw.h*2 - 1 - py;                      // mirror
    const i = ((py|0)*sw.w + (px|0))*4;
    // The retailer photographs the board under warm light; a floor of it
    // wants the wood a shade paler and greyer than a tabletop — `lift` toward
    // white and `desat` toward its own grey, both from the wood's spec.
    const lum = 0.299*sw.px[i] + 0.587*sw.px[i+1] + 0.114*sw.px[i+2];
    const lift = spec.lift ?? 0, desat = spec.desat ?? 0;
    return [sw.px[i], sw.px[i+1], sw.px[i+2]].map(c => (c*(1-desat) + lum*desat)*(1-lift) + 255*lift);
  };
  for (let y=0;y<N;y++) for (let x=0;x<N;x++){
    const u = x/N*boards, row = Math.floor(u), across = u-row;
    const along = (y/N + hash(row)*0.8)%1;
    const joint = long ? 0.42 + 0.16*(hash(row*7+3) - 0.5) : 0.48;
    const segment = along < joint ? 0 : 1;
    const variation = (hash(row*13+segment*43)-0.5)*vary;
    const seamW = 0.012*10/boards, endW = 0.002/stretch;
    const seam = across < seamW || across > 1-seamW || along < endW || Math.abs(along-joint)<endW;
    const wave = Math.sin(y/N*Math.PI*2*stretch+row)*1.6;
    const grain = (Math.sin(across*95 + wave + row)*0.012
      + Math.sin(across*283 + wave*2.3)*0.006
      + (hash(x+y*N)-0.5)*0.009)*contrast;
    const bevel = Math.min(1, Math.min(across,1-across)/(0.026*10/boards));
    const i = (y*N+x)*4;
    const photo = sw ? sample(row, across, y/N) : null;
    for (const [kind, out] of Object.entries(data)){
      for (let ch=0;ch<3;ch++){
        const base = photo ? photo[ch] : [pick.r,pick.g,pick.b][ch];
        const tone = photo ? 1 + variation*0.6 : 1 + variation + grain;
        out.data[i+ch] = kind === 'colour' ? base*tone*(seam?0.8:1) :
          kind === 'height' ? (seam?120:160+bevel*20+grain*160) : (seam?225:155+variation*100+grain*150);
      }
      out.data[i+3]=255;
    }
  }
  for (const kind of Object.keys(result)) result[kind].getContext('2d').putImageData(data[kind],0,0);
  return result;
}

// Large-format porcelain: `across` tiles to a side of a square tile of `size`
// metres, rectified, with a 2 mm grout line and the faint cloud of a matte
// stone-look glaze. Contemporary bathrooms are tiled this way rather than in
// the hexagons and subway courses the photographs show.
export function tileCanvases(pick, spec = {}){
  const N = 512, across = spec.across ?? 2, result = {}, data = {};
  for (const kind of ['colour', 'height', 'roughness']){
    const c = document.createElement('canvas'); c.width = c.height = N;
    result[kind] = c; data[kind] = c.getContext('2d').createImageData(N, N);
  }
  const hash = n => { const v = Math.sin(n*127.1 + 71.7)*43758.5453; return v-Math.floor(v); };
  const grout = spec.grout ?? 0.004;
  for (let y=0;y<N;y++) for (let x=0;x<N;x++){
    const u = x/N*across, v = y/N*across, cu = u-Math.floor(u), cv = v-Math.floor(v);
    const tile = Math.floor(u) + Math.floor(v)*across;
    const seam = Math.min(cu, 1-cu, cv, 1-cv) < grout*across;
    const cloud = Math.sin(u*7.1+tile)*Math.sin(v*5.3+tile*1.7)*0.02
      + Math.sin(u*23+v*17)*0.008 + (hash(x+y*N)-0.5)*0.01;
    const shade = 1 + (hash(tile*31)-0.5)*0.04 + cloud;
    const i = (y*N+x)*4;
    for (const [kind, out] of Object.entries(data)){
      for (let ch=0;ch<3;ch++){
        const base = [pick.r,pick.g,pick.b][ch];
        out.data[i+ch] = kind === 'colour' ? (seam ? base*0.86 : base*shade) :
          kind === 'height' ? (seam ? 110 : 170) : (seam ? 235 : 190 + cloud*400);
      }
      out.data[i+3]=255;
    }
  }
  for (const kind of Object.keys(result)) result[kind].getContext('2d').putImageData(data[kind],0,0);
  return result;
}

// Small deterministic material tiles; no asset downloads or runtime dependencies.
export function surfaceTile(kind){
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d'), pixels = ctx.createImageData(256, 256);
  let seed = 731;
  const random = () => { seed = (1664525*seed + 1013904223) >>> 0; return seed/4294967296; };
  for (let y=0; y<256; y++) for (let x=0; x<256; x++){
    const noise = random() - 0.5;
    let v;
    if (kind === 'wood'){
      const grain = Math.sin(x*0.34 + Math.sin(y*0.025)*2 + Math.sin(y*0.08)*0.5);
      v = 229 + grain*4 + noise*5 + Math.sin(x*1.7 + Math.sin(y*0.04))*2;
    } else if (kind === 'fabric'){
      v = 235 + ((x%4 < 2) !== (y%4 < 2) ? 2 : -2) + noise*5;
    } else {
      v = 232 + Math.sin(x*0.04 + Math.sin(y*0.03)*3)*6 + noise*10;
    }
    const i = (y*256+x)*4;
    pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = v;
    pixels.data[i+3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'fabric' ? 5 : 2, kind === 'fabric' ? 5 : 2);
  texture.anisotropy = 4;
  return texture;
}

// A 1.55 m square: ten 155 mm boards with staggered end joints. Colour is
// sampled from the room photo; seams and grain are representative geometry.
export function plankCanvases(pick){
  const N = 512, result = {}, data = {};
  for (const kind of ['colour', 'height', 'roughness']){
    const c = document.createElement('canvas'); c.width = c.height = N;
    result[kind] = c; data[kind] = c.getContext('2d').createImageData(N, N);
  }
  const hash = n => { const v = Math.sin(n*127.1 + 71.7)*43758.5453; return v-Math.floor(v); };
  for (let y=0;y<N;y++) for (let x=0;x<N;x++){
    const u = x/N*10, row = Math.floor(u), across = u-row;
    const along = (y/N + hash(row)*0.8)%1;
    const segment = along < 0.48 ? 0 : 1;
    const variation = (hash(row*13+segment*43)-0.5)*0.24;
    const seam = across < 0.012 || across > 0.988 || along < 0.002 || Math.abs(along-0.48)<0.002;
    const grain = Math.sin(across*95 + Math.sin(y/N*Math.PI*2)*1.6 + row)*0.018;
    const i = (y*N+x)*4;
    for (const [kind, out] of Object.entries(data)){
      for (let ch=0;ch<3;ch++){
        const base = [pick.r,pick.g,pick.b][ch];
        out.data[i+ch] = kind === 'colour' ? base*(1+variation+grain)*(seam?0.72:1) :
          kind === 'height' ? (seam?105:180+grain*160) : (seam?225:155+variation*100+grain*150);
      }
      out.data[i+3]=255;
    }
  }
  for (const kind of Object.keys(result)) result[kind].getContext('2d').putImageData(data[kind],0,0);
  return result;
}

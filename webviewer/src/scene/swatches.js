import { SWATCHES } from '../core/data.js';
import { MAT } from './materials.js';

// The retailers' own swatches, on the materials the drawn products are made
// of. Until these arrive the materials carry their procedural tiles; once they
// have, every sofa is upholstered in the photograph of its cloth and every oak
// piece — and the floor — is faced in the photograph of the board. Which
// swatch goes on which material is the table below, and it has to have run
// before the house is dressed, because the daylight shading clones every
// material it touches and a texture that lands afterwards lands on the
// original.
export const WEARS = {
  oak:'white_oak', oakPale:'whiteoak', walnut:'walnut', wood:'white_oak',
  fabric:'tepicivory', ivory:'orlaivory', oatmeal:'sumnerlinen', slate:'tepicgrey',
  charcoal:'vickcharcoal', leather:'leccocognac', cotton:'sumnerivory',
  rug:'tatumnatural', rugEdge:'sumnerlinen',
};

// The images to load, alongside the photographs.
export function swatchList(){
  return Object.entries(SWATCHES || {}).map(([name, s]) => ({name, src:s.src, metres:s.metres, img:null}));
}

// A swatch as a texture repeating every `metres` — box() lays its UVs out in
// metres, so this is all the scaling there is.
export function swatchTexture(sw, metres = sw.metres){
  const t = new THREE.Texture(sw.img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1/metres, 1/metres);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

export function applySwatches(list){
  const byName = Object.fromEntries(list.filter(s => s.img).map(s => [s.name, s]));
  const cache = {};
  for (const [mat, name] of Object.entries(WEARS)){
    const sw = byName[name], m = MAT[mat];
    if (!sw || !m) continue;
    const t = cache[name] || (cache[name] = swatchTexture(sw));
    m.map = t;
    // The swatch's own light and dark is its relief too; a photograph of a
    // weave is bumped by the weave.
    m.bumpMap = t; m.bumpScale = m.userData.soft ? 0.0012 : 0.0006;
    // The photograph carries the colour now; the tint under it goes to white,
    // a touch below for the pale cloths, which otherwise blow out in the sun.
    m.color.setHex(m.userData.soft ? 0xE6E6E6 : 0xF2F2F2).convertSRGBToLinear();
    m.needsUpdate = true;
  }
  Object.assign(swatchesLoaded, byName);
  return byName;
}
// The swatches that arrived, by name, for anything else that wants the image
// itself — the floor planks are cut from the oak.
export const swatchesLoaded = {};

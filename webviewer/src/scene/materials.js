import { surfaceTile } from './textures.js';

export const MAT = {
  wall:    new THREE.MeshLambertMaterial({color:0xC9D0D8}),
  wallLow: new THREE.MeshLambertMaterial({color:0xB9A897}),
  floor:   new THREE.MeshLambertMaterial({color:0x7D8794, side:THREE.DoubleSide}),
  ceil:    new THREE.MeshLambertMaterial({color:0xA7AEB7, side:THREE.DoubleSide}),
  glass:   new THREE.MeshLambertMaterial({color:0x8FD3E8, transparent:true, opacity:0.22,
             side:THREE.DoubleSide, depthWrite:false}),
  // Once there is a world outside, a window's job is to show it, not to be blue
  // — and to catch the sky at a grazing angle, which is what reads as glass.
  pane:    new THREE.MeshStandardMaterial({color:0xF2F8FC, transparent:true, opacity:0.11,
             roughness:0.08, metalness:0.0, envMapIntensity:1.2,
             side:THREE.DoubleSide, depthWrite:false}),
  furn:    new THREE.MeshLambertMaterial({color:0x63707F, transparent:true, opacity:0.9}),
  fix:     new THREE.MeshLambertMaterial({color:0x7A8794, transparent:true, opacity:0.9}),
  // Painted joinery, and the fittings as they actually are: white goods white,
  // the fridge steel, the television black, tables and chairs wood. These are
  // the dressed house's, so they are physical — roughness is most of what tells
  // eggshell paint from a satin worktop from a stainless door.
  trim:    new THREE.MeshStandardMaterial({color:0xF2F0EC, roughness:0.42, metalness:0.0}),
  lamp:    new THREE.MeshBasicMaterial({color:0xFFF6E2}),
  white:   new THREE.MeshStandardMaterial({color:0xEDEBE7, roughness:0.36, metalness:0.0}),
  steel:   new THREE.MeshStandardMaterial({color:0xC2C7CC, roughness:0.28, metalness:0.85}),
  screen:  new THREE.MeshStandardMaterial({color:0x14171C, roughness:0.14, metalness:0.2}),
  wood:    new THREE.MeshStandardMaterial({color:0x9C6E4C, roughness:0.38, metalness:0.0}),
  fabric:  new THREE.MeshStandardMaterial({color:0xB6AFA4, roughness:0.92, metalness:0.0}),
  stone:   new THREE.MeshStandardMaterial({color:0xB9B3A8, roughness:0.24, metalness:0.0})
};
// What each fitting is made of, once the house is dressed.
export const REAL = {
  toilet:'white', sink:'white', bathtub:'white', oven:'white', stove:'white',
  dishwasher:'white', washerDryer:'white', storage:'white', fireplace:'white',
  refrigerator:'steel', television:'screen',
  table:'wood', chair:'wood', bed:'fabric', sofa:'fabric'
};

// Colour and relief share the same grain so highlights follow the surface.
// The tiles are sized in metres — box() lays UVs out in metres — so grain runs
// at the same scale on a table top as on a chair leg: a wood tile is 60 cm of
// board, a weave 12 cm of cloth.
for (const [name, kind, depth, metres] of [['wood','wood',0.0015,0.6], ['fabric','weave',0.0009,0.12], ['stone','stone',0.0006,0.8]]){
  const tile = surfaceTile(kind, metres);
  MAT[name].map = tile;
  MAT[name].bumpMap = tile;
  MAT[name].bumpScale = depth;
}
MAT.linen = MAT.fabric.clone();
MAT.linen.color.setHex(0xeee7da);
MAT.accent = MAT.fabric.clone();
MAT.accent.color.setHex(0x536e68);
MAT.dark = new THREE.MeshStandardMaterial({color:0x252a29, roughness:0.48, metalness:0.35});

// The contemporary palette the renovation is drawn in. White oak carries the
// house — floors, the stair, most of the furniture — against white paint, with
// matte black for every handle, tap, leg and frame, and quartz where the
// photographs had granite. The upholstery is the retailers' own fabric
// families, reduced to a colour: oatmeal and ivory bouclé-type weaves, one
// slate sofa, one saddle leather chair.
const weave = (hex, roughness = 0.92) => {
  const m = new THREE.MeshPhysicalMaterial({color:hex, roughness, metalness:0,
    map:MAT.fabric.map, bumpMap:MAT.fabric.bumpMap, bumpScale:MAT.fabric.bumpScale,
    sheen:new THREE.Color(0x8a8378)});
  m.userData.soft = true;                       // box() rounds it like a cushion
  return m;
};
MAT.oak     = MAT.wood.clone();  MAT.oak.color.setHex(0xC9B08D);  MAT.oak.roughness = 0.58;
MAT.oakPale = MAT.wood.clone();  MAT.oakPale.color.setHex(0xD8C4A4); MAT.oakPale.roughness = 0.62;
MAT.black   = new THREE.MeshStandardMaterial({color:0x1C1C1C, roughness:0.46, metalness:0.55});
// Brushed stainless for the appliances: `steel` is polished enough to mirror
// the sky, and a refrigerator that reflects the lake reads as blue glass.
MAT.inox    = new THREE.MeshStandardMaterial({color:0xC9C7C1, roughness:0.52, metalness:0.55, envMapIntensity:0.5});
// Physically based where it shows: a clear coat on the quartz and the
// leather, the way a polished stone and a finished hide reflect a window as
// a sharp highlight over a soft one; a sheen on the cloths, which is what a
// bouclé does at a grazing angle and a flat diffuse never will.
MAT.quartz  = new THREE.MeshPhysicalMaterial({color:0xF1EFEA, roughness:0.32, metalness:0.0, clearcoat:0.6, clearcoatRoughness:0.25});
MAT.matte   = new THREE.MeshStandardMaterial({color:0xF3F2EE, roughness:0.62, metalness:0.0});
MAT.slab    = new THREE.MeshStandardMaterial({color:0xEDEBE6, roughness:0.48, metalness:0.0});
MAT.glassy  = new THREE.MeshStandardMaterial({color:0xDCE8EA, transparent:true, opacity:0.18,
               roughness:0.05, metalness:0.0, side:THREE.DoubleSide, depthWrite:false});
MAT.mirror  = new THREE.MeshStandardMaterial({color:0xCFD6DA, roughness:0.02, metalness:0.9});
MAT.porcelain = new THREE.MeshStandardMaterial({color:0xF6F5F2, roughness:0.18, metalness:0.0});
MAT.oatmeal = weave(0xD3CABA);
MAT.ivory   = weave(0xE2DCD0);
MAT.slate   = weave(0x6E7378);
MAT.charcoal= weave(0x3E4043);
// Bouclé for the ivory and oatmeal pieces: the loops are what make a pale
// sofa read as cloth rather than as a painted block.
for (const m of [MAT.oatmeal, MAT.ivory]){
  m.map = m.bumpMap = surfaceTile('boucle', 0.1); m.bumpScale = 0.0016; m.roughness = 0.96;
}
MAT.leather = new THREE.MeshPhysicalMaterial({color:0xA86F44, roughness:0.5, metalness:0.0, clearcoat:0.25, clearcoatRoughness:0.5});
MAT.leather.bumpMap = surfaceTile('plaster', 0.3); MAT.leather.bumpScale = 0.0004;
MAT.leather.userData.soft = true;
// A flat-woven wool rug, and the cotton of bedding.
MAT.rug     = weave(0x8C877F, 1.0);
MAT.rug.map = MAT.rug.bumpMap = surfaceTile('weave', 0.06); MAT.rug.bumpScale = 0.0012;
MAT.rugEdge = weave(0xD6CFC2, 1.0);
MAT.rugEdge.map = MAT.rugEdge.bumpMap = MAT.rug.map; MAT.rugEdge.bumpScale = 0.0012;
MAT.cotton  = weave(0xF1EEE8, 0.85);
MAT.cotton.map = MAT.cotton.bumpMap = surfaceTile('fabric', 0.05); MAT.cotton.bumpScale = 0.0005;
MAT.shade   = new THREE.MeshStandardMaterial({color:0xEFE9DC, roughness:0.9, metalness:0.0, side:THREE.DoubleSide});
MAT.walnut  = MAT.wood.clone();  MAT.walnut.color.setHex(0x5E4531); MAT.walnut.roughness = 0.5;
MAT.plaster = new THREE.MeshStandardMaterial({color:0xF2F0EB, roughness:0.96, metalness:0.0});
MAT.plaster.bumpMap = surfaceTile('plaster'); MAT.plaster.bumpScale = 0.0009;

// The sky rig already supplies diffuse fill; strong environment response on
// every matte furnishing erased grain and made timber look like ivory.
for(const name of ['trim','white','wood','fabric','linen','accent','stone','oak','oakPale',
                   'matte','slab','oatmeal','ivory','slate','charcoal','leather','walnut','plaster','porcelain','rug','rugEdge','cotton','shade'])
  MAT[name].envMapIntensity=0.45;

// r128 takes literal material colours as linear values. These palette entries
// are display swatches, so decode them once before physically based shading.
for(const m of new Set(Object.values(MAT)))if(m.isMeshStandardMaterial)m.color.convertSRGBToLinear();

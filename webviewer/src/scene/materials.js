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
             roughness:0.03, metalness:0.0, envMapIntensity:2.2,
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

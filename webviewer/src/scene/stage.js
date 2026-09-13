import { $ } from '../core/util.js';

export const canvas = $('view');
export const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
// Tone mapping happens at the end of the post chain, in one place, on linear
// values — so the renderer must not also do it on the way into the buffer.
renderer.toneMapping = THREE.NoToneMapping;
// PCF, soft. Variance maps were tried for a wider penumbra and lost the sun
// altogether indoors — the walls' depth variance shadows everything past them.
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.setClearColor(0x0C0F14);

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0C0F14, 8, 42);
export const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 260);

// Two rigs. The survey's is flat and even, because its job is to let you read
// geometry. The dressed house's job is the opposite: daylight comes in off the
// lake, the sky fills from above, and the far side of a room falls away — which
// is most of what makes a room feel like a room rather than a diagram.
const sky = new THREE.HemisphereLight(0xC5D8EE, 0x2A303A, 0.95);
const key = new THREE.DirectionalLight(0xFFF4E2, 0.62);
key.position.set(6, 14, 4);
const fill = new THREE.DirectionalLight(0x9FC4E8, 0.28);
fill.position.set(-7, 6, -5);
// Without a shadow map the sun lights every wall in the house at once, inside
// and out, and no room ever has a lit side and a dark one. This is the single
// biggest thing between a lit box and a room: the light has to be stopped by
// the wall it falls on, and land on the floor in the shape of the window.
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
key.shadow.camera.left = -11; key.shadow.camera.right = 11;
key.shadow.camera.top = 11; key.shadow.camera.bottom = -11;
key.shadow.camera.near = 1; key.shadow.camera.far = 70;
key.shadow.bias = -0.00005;
key.shadow.normalBias = 0.008;
scene.add(sky); scene.add(key); scene.add(fill);

export function setLightRig(dressed){
  sky.color.setHex(dressed ? 0xDCE9F6 : 0xC5D8EE);
  sky.groundColor.setHex(dressed ? 0xB7B0A3 : 0x2A303A);
  // Indoor diffuse fill is supplied by the window irradiance volume. This
  // hemisphere remains for exterior meshes that do not use that volume.
  sky.intensity = dressed ? 0.65 : 0.95;
  // The lake is north-east of the house and every view window faces it.
  key.color.setHex(dressed ? 0xFFF1DA : 0xFFF4E2);
  key.intensity = dressed ? 1.8 : 0.62;
  key.position.set(dressed ? 17 : 6, dressed ? 21 : 14, dressed ? -13 : 4);
  fill.intensity = dressed ? 0.0 : 0.28;
  key.castShadow = dressed;
  renderer.shadowMap.enabled = dressed;
  renderer.shadowMap.needsUpdate = true;
  scene.fog.color.setHex(dressed ? 0x1A1E24 : 0x0C0F14);
  renderer.setClearColor(dressed ? 0x1A1E24 : 0x0C0F14);
}

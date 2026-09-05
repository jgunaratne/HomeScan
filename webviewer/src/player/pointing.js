import { player } from '../core/state.js';
import { onFloor } from '../core/geometry.js';
import { scene } from '../scene/stage.js';
import { castFrom, ray } from '../scene/picking.js';
import { levels } from '../scene/levels.js';

// The cursor addresses the storey you are standing on, so a click means "walk
// there" rather than "walk to whatever surface the ray happened to strike".
export const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.25, 0.34, 40),
  new THREE.MeshBasicMaterial({color:0xF2C230, transparent:true, opacity:0.92,
    side:THREE.DoubleSide, depthTest:false}));
ring.rotation.x = -Math.PI/2; ring.renderOrder = 9; ring.visible = false;
scene.add(ring);

const hit = new THREE.Vector3();

export function floorPoint(sx, sy){
  const L = levels[player.level];
  castFrom(sx, sy);
  const plane = new THREE.Plane(new THREE.Vector3(0,1,0), -(L.elevation + 0.01));
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  return onFloor(L, hit.x, hit.z) ? {x:hit.x, z:hit.z} : null;
}

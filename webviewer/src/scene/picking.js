import { camera } from './stage.js';

// One raycaster for the whole app. Screen pixels in, a ray through the scene
// out; what each caller does with it — floor, print, wall — is its own business.
export const ray = new THREE.Raycaster();
export const ndc = new THREE.Vector2();

export function castFrom(sx, sy){
  ndc.set((sx/innerWidth)*2 - 1, -(sy/innerHeight)*2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray;
}

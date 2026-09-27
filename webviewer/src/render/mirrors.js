import { renderer, scene, camera } from '../scene/stage.js';
import { MIRRORS } from '../scene/materials.js';

// A mirror, drawn as one. The glass over a vanity was polished metal, and all
// polished metal can reflect is the environment map: the sky, the horizon and
// the lawn, blurred — so from across the room it read as a television showing
// the weather. What makes a mirror glass is that it shows the room, sharp.
//
// Each pane in view is drawn as a window onto the room behind it: the eye is
// reflected through the pane's plane and looks back out through the pane as
// through a frame, its frustum cut to the pane's four edges and its near plane
// laid on the glass, so nothing behind the wall is ever drawn and every pixel
// rendered lands on the pane. The main pass then pins that picture to the
// pane. It is the same linear light as the rest of the frame, so the lens
// exposes, blooms and tone-maps it with the room. The picture is as sharp as
// the pane is large on screen and no sharper — a pane across the room costs a
// postage stamp — and a pane out of view, edge-on or across the house keeps
// the polished-metal fallback it was built with.
//
// The bundle is one scope, so everything at the top of this file is named
// for it.
const MIRROR_SHADER = {
  vertexShader: `
uniform mat4 uMirror;
varying vec4 vMirror;
void main(){
  vec4 world = modelMatrix * vec4(position, 1.0);
  vMirror = uMirror * world;
  gl_Position = projectionMatrix * viewMatrix * world;
}`,
  fragmentShader: `
uniform sampler2D tMirror;
uniform vec2 uScale, uEdge;
uniform vec3 uTint;
varying vec4 vMirror;
void main(){
  vec2 uv = clamp(vMirror.xy / vMirror.w, uEdge, 1.0 - uEdge) * uScale;
  gl_FragColor = vec4(min(max(texture2D(tMirror, uv).rgb, vec3(0.0)), vec3(64.0)) * uTint, 1.0);
}`,
};
// Silvered glass returns about nine tenths of the light, a shade green.
const MIRROR_TINT = new THREE.Color(0.86, 0.88, 0.86);
const MIRROR_REACH = 9;          // metres; past this a pane is a few pixels
const MIRROR_CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
const MIRROR_BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5,  0, 0.5, 0, 0.5,  0, 0, 0.5, 0.5,  0, 0, 0, 1);
const mirrorEye = new THREE.PerspectiveCamera();
const mirrorScratch = {
  frustum:new THREE.Frustum(), viewProjection:new THREE.Matrix4(), basis:new THREE.Matrix4(),
  at:new THREE.Vector3(), normal:new THREE.Vector3(), viewer:new THREE.Vector3(),
  x:new THREE.Vector3(), y:new THREE.Vector3(), z:new THREE.Vector3(),
  corner:new THREE.Vector3(), local:new THREE.Vector3(),
};
const mirrorPanes = new Map();

// 2 if the mesh is in the scene and every ancestor is shown, 1 if it is in
// the scene but hidden, 0 if it has been taken out of it.
function mirrorStanding(o){
  let shown = true;
  for (; o; o = o.parent){
    if (!o.visible) shown = false;
    if (o === scene) return shown ? 2 : 1;
  }
  return 0;
}

function mirrorPane(mesh, size, type){
  let p = mirrorPanes.get(mesh);
  if (p && p.size === size && p.type === type) return p;
  if (p) p.target.dispose();
  const target = new THREE.WebGLRenderTarget(size, size, {type, format:THREE.RGBAFormat,
    minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, depthBuffer:true, stencilBuffer:false});
  target.texture.generateMipmaps = false;
  target.scissorTest = true;
  const material = p ? p.material : new THREE.ShaderMaterial({
    uniforms:{tMirror:{value:null}, uMirror:{value:new THREE.Matrix4()},
      uScale:{value:new THREE.Vector2(1, 1)}, uEdge:{value:new THREE.Vector2()}, uTint:{value:MIRROR_TINT}},
    vertexShader:MIRROR_SHADER.vertexShader, fragmentShader:MIRROR_SHADER.fragmentShader});
  material.uniforms.tMirror.value = target.texture;
  p = {target, material, size, type};
  mirrorPanes.set(mesh, p);
  return p;
}

// Draw every pane in view into its own picture, `size` texels at most on a
// side (0 draws none), in the scene buffer's texel `type`; the scene buffer
// is `w` by `h`. Returns what to hand back to restoreMirrors once the main
// pass has been drawn with the panes as mirrors.
export function drawMirrors(size, type, w, h){
  const drawn = [];
  if (!size || !MIRRORS.size) return drawn;
  const {frustum, viewProjection, basis, at, normal, viewer, x, y, z, corner, local} = mirrorScratch;
  const eye = mirrorEye;
  camera.updateMatrixWorld();
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProjection);
  viewer.setFromMatrixPosition(camera.matrixWorld);
  for (const mesh of MIRRORS){
    const state = mirrorStanding(mesh);
    if (!state){
      MIRRORS.delete(mesh);
      const p = mirrorPanes.get(mesh);
      if (p){ p.target.dispose(); p.material.dispose(); mirrorPanes.delete(mesh); }
      continue;
    }
    if (state < 2 || !mesh.geometry.parameters) continue;
    mesh.updateWorldMatrix(true, false);
    if (!frustum.intersectsObject(mesh)) continue;
    at.setFromMatrixPosition(mesh.matrixWorld);
    normal.set(0, 0, 1).transformDirection(mesh.matrixWorld);
    const distance = local.subVectors(viewer, at).dot(normal);
    if (distance < 0.05 || viewer.distanceTo(at) > MIRROR_REACH) continue;

    // The eye behind the glass, looking out of it along the pane's normal
    // with the world's up (or the pane's own, were one laid flat).
    eye.position.copy(viewer).addScaledVector(normal, -2*distance);
    z.copy(normal).negate();
    y.set(0, 1, 0).addScaledVector(z, -z.y);
    if (y.lengthSq() < 1e-6) y.set(0, 1, 0).transformDirection(mesh.matrixWorld);
    y.normalize();
    x.crossVectors(y, z);
    eye.quaternion.setFromRotationMatrix(basis.makeBasis(x, y, z));
    eye.updateMatrixWorld();

    // The frustum through the pane's corners, on the glass; and how large the
    // pane is on screen, which is as sharp as its picture needs to be.
    const {width, height} = mesh.geometry.parameters;
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity, near = false;
    for (const [u, v] of MIRROR_CORNERS){
      corner.set(u*width, v*height, 0).applyMatrix4(mesh.matrixWorld);
      local.copy(corner).applyMatrix4(eye.matrixWorldInverse);
      left = Math.min(left, local.x); right = Math.max(right, local.x);
      bottom = Math.min(bottom, local.y); top = Math.max(top, local.y);
      local.copy(corner).applyMatrix4(camera.matrixWorldInverse);
      if (local.z > -camera.near){ near = true; continue; }
      local.applyMatrix4(camera.projectionMatrix);
      sx0 = Math.min(sx0, local.x); sx1 = Math.max(sx1, local.x);
      sy0 = Math.min(sy0, local.y); sy1 = Math.max(sy1, local.y);
    }
    const across = near ? size : Math.ceil(Math.min(sx1 - sx0, 2)*w/2);
    const up = near ? size : Math.ceil(Math.min(sy1 - sy0, 2)*h/2);
    const vw = Math.max(16, Math.min(size, across)), vh = Math.max(16, Math.min(size, up));
    eye.projectionMatrix.makePerspective(left, right, top, bottom, distance, camera.far);
    eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert();

    const p = mirrorPane(mesh, size, type), uniforms = p.material.uniforms;
    p.target.viewport.set(0, 0, vw, vh);
    p.target.scissor.set(0, 0, vw, vh);
    uniforms.uScale.value.set(vw/size, vh/size);
    uniforms.uEdge.value.set(0.5/vw, 0.5/vh);
    uniforms.uMirror.value.multiplyMatrices(MIRROR_BIAS, eye.projectionMatrix).multiply(eye.matrixWorldInverse);
    mesh.visible = false;
    renderer.setRenderTarget(p.target);
    renderer.render(scene, eye);
    mesh.visible = true;
    drawn.push([mesh, mesh.material]);
  }
  // Only now, so no pane is seen as a mirror in another's picture: that one
  // would be showing the room from here, not from there.
  for (const [mesh] of drawn) mesh.material = mirrorPanes.get(mesh).material;
  return drawn;
}

export function restoreMirrors(drawn){
  for (const [mesh, material] of drawn) mesh.material = material;
}

import { flags } from '../core/state.js';
import { renderer, scene, camera } from '../scene/stage.js';

// three.js ships its post-processing in examples/js, and this file loads only
// the core UMD build, so the chain is written out here. Five passes: the scene
// into a linear buffer, ambient occlusion off the depth, a bloom pyramid, a
// composite that also does depth-of-field and ACES, and FXAA to put the edges
// back that rendering off-screen took away.
//
// It runs only over the dressed house. The survey wants to be legible, not
// photographed, and a crisp aliased edge is easier to measure against.
const QUAD = (() => {
  // One triangle rather than two: no seam down the diagonal, one fewer vertex.
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 3,-1,0, -1,3,0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 2,0, 0,2], 2));
  const mesh = new THREE.Mesh(g, null);
  mesh.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(mesh);
  return {sc, cam:new THREE.OrthographicCamera(-1,1,1,-1,0,1), mesh};
})();

const VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const shader = (uniforms, frag) => new THREE.ShaderMaterial({
  uniforms, vertexShader:VERT, fragmentShader:frag, depthTest:false, depthWrite:false});

function draw(mat, target){
  QUAD.mesh.material = mat;
  renderer.setRenderTarget(target || null);
  renderer.render(QUAD.sc, QUAD.cam);
}

// Depth textures are core in WebGL2 and an extension before it. Without one
// there is no occlusion and no focus, so the chain steps aside entirely.
export const CAN_POST = renderer.capabilities.isWebGL2 ||
                 !!renderer.extensions.get('WEBGL_depth_texture');

// Depth is the only geometry the post chain gets, so both the occlusion and the
// circle of confusion are read back out of it.
const DEPTH_FNS = `
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform float uNear, uFar;
float linearise(float d){
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
vec3 viewPos(vec2 uv){
  float d = texture2D(tDepth, uv).x;
  vec4 c = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return c.xyz / c.w;
}`;

// Horizon-free hemisphere SSAO. Normals are rebuilt from the depth derivatives
// rather than rendered again: one less full pass over the scene, and at this
// radius the difference does not survive the blur anyway.
const aoMat = shader({
  tDepth:{value:null}, uProjInv:{value:new THREE.Matrix4()},
  uNear:{value:0.05}, uFar:{value:260}, uTexel:{value:new THREE.Vector2()},
  uRadius:{value:0.38}, uBias:{value:0.018}, uProj:{value:new THREE.Matrix4()},
}, DEPTH_FNS + `
varying vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius, uBias;
uniform mat4 uProj;
const int K = 12;
// A spiral, not a random cloud: even coverage from few taps.
vec3 kernel(int i){
  float f = (float(i) + 0.5) / float(K);
  float a = float(i) * 2.39996;
  float r = pow(f, 0.7);
  return vec3(cos(a) * r, sin(a) * r, 0.35 + 0.65 * f);
}
void main(){
  vec3 p = viewPos(vUv);
  if (-p.z > uFar * 0.5){ gl_FragColor = vec4(1.0); return; }
  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  if (dot(n, -normalize(p)) < 0.0) n = -n;      // the hemisphere faces the viewer
  float rot = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
  float ca = cos(rot), sa = sin(rot);
  vec3 t = normalize(abs(n.z) < 0.9 ? cross(n, vec3(0.0,0.0,1.0)) : vec3(1.0,0.0,0.0));
  vec3 b = cross(n, t);
  float occ = 0.0;
  for (int i = 0; i < K; i++){
    vec3 k = kernel(i);
    vec2 rk = vec2(k.x * ca - k.y * sa, k.x * sa + k.y * ca);
    vec3 s = p + (t * rk.x + b * rk.y + n * k.z) * uRadius;
    vec4 clip = uProj * vec4(s, 1.0);
    vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float sz = viewPos(suv).z;
    float range = smoothstep(0.0, 1.0, uRadius / max(0.0001, abs(p.z - sz)));
    occ += (sz >= s.z + uBias ? 1.0 : 0.0) * range;
  }
  gl_FragColor = vec4(vec3(clamp(1.0 - occ / float(K), 0.0, 1.0)), 1.0);
}`);
aoMat.extensions = {derivatives:true};

// Depth-aware filtering keeps contact shadows on their own surfaces instead
// of smearing furniture silhouettes and window recesses onto the room behind.
const aoBlurMat = shader({
  tSrc:{value:null}, tDepth:{value:null}, uDir:{value:new THREE.Vector2()},
  uNear:{value:0.05}, uFar:{value:260},
}, `
varying vec2 vUv;
uniform sampler2D tSrc, tDepth;
uniform vec2 uDir;
uniform float uNear, uFar;
float distanceAt(vec2 uv){
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return 2.0*uNear*uFar/(uFar+uNear-z*(uFar-uNear));
}
void main(){
  float centre = distanceAt(vUv), sum = 0.0, weight = 0.0;
  for (int i=-4; i<=4; i++){
    float f = float(i);
    vec2 uv = vUv + uDir*f;
    float w = exp(-f*f/8.0) * exp(-abs(distanceAt(uv)-centre)/0.12);
    sum += texture2D(tSrc, uv).r*w; weight += w;
  }
  gl_FragColor = vec4(vec3(sum/max(weight,0.0001)),1.0);
}`);

const blurMat = shader({
  tSrc:{value:null}, uDir:{value:new THREE.Vector2()},
}, `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uDir;
void main(){
  vec4 s = texture2D(tSrc, vUv) * 0.2270270;
  s += (texture2D(tSrc, vUv + uDir * 1.3846153) +
        texture2D(tSrc, vUv - uDir * 1.3846153)) * 0.3162162;
  s += (texture2D(tSrc, vUv + uDir * 3.2307692) +
        texture2D(tSrc, vUv - uDir * 3.2307692)) * 0.0702702;
  gl_FragColor = s;
}`);

// Only what is brighter than the room blooms — which, indoors, means the
// windows and the downlights, and that is exactly what blooms in a photograph.
const brightMat = shader({
  tSrc:{value:null}, uCut:{value:1.55}, uKnee:{value:0.6},
}, `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform float uCut, uKnee;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(uCut - uKnee, uCut + uKnee, l), 1.0);
}`);

// Screen-space reflection, floors only. There is no G-buffer here, so which
// pixels are floor is decided the only way available: rebuild the normal from
// depth and keep the ones facing up. A ray is walked in view space and the
// colour buffer read where it lands — so the floor reflects the room, the
// window and the light in it, which is what a polished board actually does and
// what an environment map alone can never give. What is off-screen is not
// reflected; that is the standing bargain with this technique.
const ssrMat = shader({
  tColor:{value:null}, tDepth:{value:null},
  uProj:{value:new THREE.Matrix4()}, uProjInv:{value:new THREE.Matrix4()},
  uNear:{value:0.05}, uFar:{value:260},
  uUp:{value:new THREE.Vector3(0,1,0)}, uStride:{value:0.34},
}, DEPTH_FNS + `
varying vec2 vUv;
uniform sampler2D tColor;
uniform mat4 uProj;
uniform vec3 uUp;
uniform float uStride;
void main(){
  vec3 p = viewPos(vUv);
  if (-p.z > 40.0){ gl_FragColor = vec4(0.0); return; }
  // A depth-derived normal comes out with whichever sign the derivatives give,
  // so it is turned to face the camera — which is the only way a visible
  // surface can point. Flipping it toward world up instead, as this first did,
  // makes every ceiling pass for a floor and reflect the room onto itself.
  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  if (dot(n, -normalize(p)) < 0.0) n = -n;
  if (dot(n, uUp) < 0.80){ gl_FragColor = vec4(0.0); return; }
  vec3 r = reflect(normalize(p), n);
  vec3 q = p;
  float stride = uStride * (1.0 + fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) * 0.4);
  for (int i = 0; i < 22; i++){
    q += r * stride;
    vec4 c = uProj * vec4(q, 1.0);
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float sz = viewPos(uv).z;
    if (sz > q.z + 0.03 && sz < q.z + 1.4){
      vec2 e = abs(uv - 0.5) * 2.0;
      float edge = smoothstep(1.0, 0.62, max(e.x, e.y));
      float run = 1.0 - float(i) / 22.0;
      gl_FragColor = vec4(texture2D(tColor, uv).rgb, edge * run);
      return;
    }
    stride *= 1.14;
  }
  gl_FragColor = vec4(0.0);
}`);
ssrMat.extensions = {derivatives:true};

const compMat = shader({
  tColor:{value:null}, tAO:{value:null}, tBloom:{value:null}, tFar:{value:null},
  tSSR:{value:null}, uSSR:{value:0.30},
  tDepth:{value:null}, uProjInv:{value:new THREE.Matrix4()},
  uNear:{value:0.05}, uFar:{value:260},
  uExposure:{value:0.98}, uBloom:{value:0.10}, uAO:{value:0.72},
  uFocus:{value:5.5}, uRange:{value:16.0}, uDof:{value:0.55},
  uVignette:{value:0.16}, uGrain:{value:0.004}, uTime:{value:0},
}, DEPTH_FNS + `
varying vec2 vUv;
uniform sampler2D tColor, tAO, tBloom, tFar, tSSR;
uniform float uExposure, uBloom, uAO, uFocus, uRange, uDof, uVignette, uGrain, uTime, uSSR;

// ACES, fitted. Rolls the window highlights off instead of clipping them white.
vec3 aces(vec3 x){
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main(){
  vec3 col = texture2D(tColor, vUv).rgb;

  // Depth of field. The eye holds a room at about four metres; everything
  // nearer and further goes soft, which is most of why a still looks taken
  // rather than drawn.
  float z = linearise(texture2D(tDepth, vUv).x);
  float coc = clamp(abs(z - uFocus) / uRange, 0.0, 1.0) * uDof;
  col = mix(col, texture2D(tFar, vUv).rgb, coc * coc);

  vec4 ssr = texture2D(tSSR, vUv);
  col += ssr.rgb * ssr.a * uSSR;

  col *= mix(1.0, texture2D(tAO, vUv).r, uAO);
  col += texture2D(tBloom, vUv).rgb * uBloom;
  col = aces(col * uExposure);

  vec2 d = vUv - 0.5;
  col *= 1.0 - uVignette * dot(d, d) * 1.9;

  // Grain last, and in display space, so it reads as film rather than noise.
  float g = fract(sin(dot(vUv * (1.0 + uTime), vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;

  gl_FragColor = vec4(pow(max(col, 0.0), vec3(0.4545454)), 1.0);
}`);

// Rendering off-screen loses the multisampling, so the edges come back here.
const fxaaMat = shader({
  tSrc:{value:null}, uTexel:{value:new THREE.Vector2()},
}, `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uTexel;
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec3 m  = texture2D(tSrc, vUv).rgb;
  float lM = lum(m);
  float lNW = lum(texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb);
  float lNE = lum(texture2D(tSrc, vUv + vec2( 1.0, -1.0) * uTexel).rgb);
  float lSW = lum(texture2D(tSrc, vUv + vec2(-1.0,  1.0) * uTexel).rgb);
  float lSE = lum(texture2D(tSrc, vUv + vec2( 1.0,  1.0) * uTexel).rgb);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax * 0.125)){ gl_FragColor = vec4(m, 1.0); return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float sc = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * sc, -8.0, 8.0) * uTexel;
  vec3 a = 0.5 * (texture2D(tSrc, vUv + dir * (1.0/3.0 - 0.5)).rgb +
                  texture2D(tSrc, vUv + dir * (2.0/3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tSrc, vUv - dir * 0.5).rgb +
                             texture2D(tSrc, vUv + dir * 0.5).rgb);
  float lB = lum(b);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
}`);

// Five full-screen passes and a 2048 shadow map is a lot to ask of a laptop
// running this off a CDN. If the frame budget goes for a couple of seconds the
// lens comes off by itself — once, and never again if the reader has an opinion.
let postForced = false, slowFor = 0;
export function watchBudget(dt){
  if (postForced || !postOn || !flags.surfaced) return;
  slowFor = dt > 0.055 ? slowFor + dt : 0;
  if (slowFor > 2.2){ postOn = false; slowFor = 0; }
}

const RTS = {};
let postOn = CAN_POST, postReady = false;
export function makeTargets(w, h){
  if (!CAN_POST) return;
  for (const k in RTS){ RTS[k].dispose(); delete RTS[k]; }
  const hdr = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const opt = t => ({minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
                     format:THREE.RGBAFormat, type:t, depthBuffer:true, stencilBuffer:false});
  RTS.scene = new THREE.WebGLRenderTarget(w, h, opt(hdr));
  RTS.scene.depthTexture = new THREE.DepthTexture(w, h);
  RTS.scene.depthTexture.type = renderer.capabilities.isWebGL2
    ? THREE.UnsignedIntType : THREE.UnsignedShortType;
  const half = o => new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), o);
  const quarter = o => new THREE.WebGLRenderTarget(Math.max(1, w >> 2), Math.max(1, h >> 2), o);
  RTS.ao  = half(opt(THREE.UnsignedByteType));
  RTS.aoT = half(opt(THREE.UnsignedByteType));
  RTS.b0  = half(opt(hdr));
  RTS.b1  = half(opt(hdr));
  RTS.q0  = quarter(opt(hdr));
  RTS.q1  = quarter(opt(hdr));
  RTS.d0  = quarter(opt(hdr));
  RTS.d1  = quarter(opt(hdr));
  RTS.ssr = half(opt(hdr));
  RTS.comp = new THREE.WebGLRenderTarget(w, h, opt(THREE.UnsignedByteType));
  for (const k of ['ao','aoT','b0','b1','q0','q1','d0','d1','ssr','comp'])
    RTS[k].depthBuffer = false;
  postReady = true;
}

function blur(src, tmp, dst, texel, spread){
  blurMat.uniforms.tSrc.value = src.texture;
  blurMat.uniforms.uDir.value.set(texel.x * spread, 0);
  draw(blurMat, tmp);
  blurMat.uniforms.tSrc.value = tmp.texture;
  blurMat.uniforms.uDir.value.set(0, texel.y * spread);
  draw(blurMat, dst);
}

export function renderFrame(){
  if (!postOn || !postReady || !flags.surfaced){
    // Keep highlight rolloff when the optional lens is disabled or too slow.
    renderer.toneMapping=flags.surfaced?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;
    renderer.toneMappingExposure=compMat.uniforms.uExposure.value;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return;
  }
  renderer.toneMapping=THREE.NoToneMapping;
  const w = RTS.scene.width, h = RTS.scene.height;

  renderer.setRenderTarget(RTS.scene);
  renderer.render(scene, camera);

  const projInv = new THREE.Matrix4().copy(camera.projectionMatrix).invert();
  for (const m of [aoMat, compMat]){
    m.uniforms.tDepth.value = RTS.scene.depthTexture;
    m.uniforms.uProjInv.value.copy(projInv);
    m.uniforms.uNear.value = camera.near;
    m.uniforms.uFar.value = camera.far;
  }
  aoMat.uniforms.uProj.value.copy(camera.projectionMatrix);
  const half = new THREE.Vector2(1/(w>>1), 1/(h>>1));
  const quarter = new THREE.Vector2(1/(w>>2), 1/(h>>2));
  aoMat.uniforms.uTexel.value.copy(half);
  draw(aoMat, RTS.ao);
  aoBlurMat.uniforms.tDepth.value = RTS.scene.depthTexture;
  aoBlurMat.uniforms.uNear.value = camera.near;
  aoBlurMat.uniforms.uFar.value = camera.far;
  for (const radius of [1.0, 2.0]){
    aoBlurMat.uniforms.tSrc.value = RTS.ao.texture;
    aoBlurMat.uniforms.uDir.value.set(half.x*radius, 0);
    draw(aoBlurMat, RTS.aoT);
    aoBlurMat.uniforms.tSrc.value = RTS.aoT.texture;
    aoBlurMat.uniforms.uDir.value.set(0, half.y*radius);
    draw(aoBlurMat, RTS.ao);
  }

  // Reflections before the bloom, while b1 is still free to blur them in.
  ssrMat.uniforms.tColor.value = RTS.scene.texture;
  ssrMat.uniforms.tDepth.value = RTS.scene.depthTexture;
  ssrMat.uniforms.uProjInv.value.copy(projInv);
  ssrMat.uniforms.uProj.value.copy(camera.projectionMatrix);
  ssrMat.uniforms.uNear.value = camera.near;
  ssrMat.uniforms.uFar.value = camera.far;
  ssrMat.uniforms.uUp.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
  draw(ssrMat, RTS.ssr);
  blur(RTS.ssr, RTS.b1, RTS.ssr, half, 1.5);   // gloss, not a mirror

  brightMat.uniforms.tSrc.value = RTS.scene.texture;
  draw(brightMat, RTS.b0);
  blur(RTS.b0, RTS.b1, RTS.b0, half, 1.4);
  // Half to quarter, blurring on the way down: the wide tail of the bloom for
  // two more passes rather than a fifth of the pyramid.
  blurMat.uniforms.tSrc.value = RTS.b0.texture;
  blurMat.uniforms.uDir.value.set(half.x * 2.0, 0);
  draw(blurMat, RTS.q1);
  blurMat.uniforms.tSrc.value = RTS.q1.texture;
  blurMat.uniforms.uDir.value.set(0, quarter.y * 2.0);
  draw(blurMat, RTS.q0);
  blur(RTS.q0, RTS.q1, RTS.q0, quarter, 2.4);

  // Out of focus is its own chain. Reusing the bloom pyramid for it was the
  // obvious economy and quite wrong: that buffer holds the bright pass, so
  // everything soft came back milky with the windows smeared through it.
  blurMat.uniforms.tSrc.value = RTS.scene.texture;
  blurMat.uniforms.uDir.value.set(2.0/w, 0);
  draw(blurMat, RTS.d1);
  blurMat.uniforms.tSrc.value = RTS.d1.texture;
  blurMat.uniforms.uDir.value.set(0, quarter.y * 2.0);
  draw(blurMat, RTS.d0);
  blur(RTS.d0, RTS.d1, RTS.d0, quarter, 2.0);

  compMat.uniforms.tColor.value = RTS.scene.texture;
  compMat.uniforms.tAO.value = RTS.ao.texture;
  compMat.uniforms.tBloom.value = RTS.q0.texture;
  compMat.uniforms.tFar.value = RTS.d0.texture;
  compMat.uniforms.tSSR.value = RTS.ssr.texture;
  compMat.uniforms.uTime.value = performance.now() * 0.0002;
  draw(compMat, RTS.comp);

  fxaaMat.uniforms.tSrc.value = RTS.comp.texture;
  fxaaMat.uniforms.uTexel.value.set(1/w, 1/h);
  draw(fxaaMat, null);
}

// The reader's own opinion about the lens, from the Q key.
export function togglePost(){ postOn = !postOn; postForced = true; }

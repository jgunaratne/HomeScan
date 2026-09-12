import { $ } from '../core/util.js';
import { TEMPORAL_FRAGMENT, HISTORY_DEPTH_FRAGMENT, temporalJitter } from './temporal.js';
import { QUALITY_PRESETS, qualityBudget } from './quality.js';
import { levels } from '../scene/levels.js';
import { flags, view, player } from '../core/state.js';
import { renderer, scene, camera } from '../scene/stage.js';

// Linear HDR scene -> SSAO / screen-space bounce / SSR -> bilateral filters
// -> bloom and tone mapping -> reprojected TAA -> FXAA presentation.
// Screen-space effects supplement the baked window irradiance volume; they
// cannot see hidden geometry and are not hardware ray tracing.
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
                 (!!renderer.extensions.get('WEBGL_depth_texture') &&
                  !!renderer.extensions.get('OES_standard_derivatives'));
const CAN_HDR = renderer.capabilities.isWebGL2
  ? !!renderer.extensions.get('EXT_color_buffer_float')
  : !!renderer.extensions.get('EXT_color_buffer_half_float') && !!renderer.extensions.get('OES_texture_half_float_linear');

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
  uSamples:{value:24}, uPhase:{value:0}, uRadius:{value:0.55}, uBias:{value:0.018}, uProj:{value:new THREE.Matrix4()},
}, DEPTH_FNS + `
varying vec2 vUv;
uniform vec2 uTexel;
uniform float uRadius, uBias, uPhase, uSamples;
uniform mat4 uProj;
const int K = 24;
// A spiral, not a random cloud: even coverage from few taps.
vec3 kernel(int i){
  float f = (float(i) + 0.5) / uSamples;
  float a = float(i) * 2.39996;
  float r = pow(f, 0.7);
  return vec3(cos(a) * r, sin(a) * r, 0.35 + 0.65 * f);
}
void main(){
  vec3 p = viewPos(vUv);
  if (-p.z > uFar * 0.5){ gl_FragColor = vec4(1.0); return; }
  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  if (dot(n, -normalize(p)) < 0.0) n = -n;      // the hemisphere faces the viewer
  float rot = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853 + uPhase;
  float ca = cos(rot), sa = sin(rot);
  vec3 t = normalize(abs(n.z) < 0.9 ? cross(n, vec3(0.0,0.0,1.0)) : vec3(1.0,0.0,0.0));
  vec3 b = cross(n, t);
  float occ = 0.0;
  for (int i = 0; i < K; i++){
    if(float(i)>=uSamples)break;
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
  gl_FragColor = vec4(vec3(clamp(1.0 - occ / uSamples, 0.0, 1.0)), 1.0);
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

// Bilateral colour blur rejects samples across depth discontinuities. Use
// premultiplied colour for reflections so invalid rays cannot make dark halos.
const lensBlurMat = shader({
  tSrc:{value:null}, tDepth:{value:null}, uDir:{value:new THREE.Vector2()},
  uNear:{value:0.05},uFar:{value:260},uDepthScale:{value:0.25},
}, DEPTH_FNS + `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uDir;
uniform float uDepthScale;
void main(){
  float centre=linearise(texture2D(tDepth,vUv).x);
  vec4 colour=vec4(0.0);float total=0.0;
  for(int i=-4;i<=4;i++){
    float f=float(i);vec2 uv=clamp(vUv+uDir*f,vec2(0.0),vec2(1.0));
    float depth=linearise(texture2D(tDepth,uv).x);
    float weight=exp(-f*f/8.0)*exp(-abs(depth-centre)/max(uDepthScale,centre*0.015));
    colour+=texture2D(tSrc,uv)*weight;total+=weight;
  }
  gl_FragColor=colour/max(total,0.0001);
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
  uWorldY:{value:new THREE.Vector4()}, uFloorY:{value:new THREE.Vector2()},
  uUp:{value:new THREE.Vector3(0,1,0)}, uSteps:{value:36}, uStride:{value:0.18},
}, DEPTH_FNS + `
varying vec2 vUv;
uniform sampler2D tColor;
uniform mat4 uProj;
uniform vec3 uUp;
uniform vec4 uWorldY;
uniform vec2 uFloorY;
uniform float uStride, uSteps;
void main(){
  vec3 p = viewPos(vUv);
  if (-p.z > 40.0){ gl_FragColor = vec4(0.0); return; }
  // A depth-derived normal comes out with whichever sign the derivatives give,
  // so it is turned to face the camera — which is the only way a visible
  // surface can point. Flipping it toward world up instead, as this first did,
  // makes every ceiling pass for a floor and reflect the room onto itself.
  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  if (dot(n, -normalize(p)) < 0.0) n = -n;
  float worldY=dot(uWorldY,vec4(p,1.0));
  float floorDistance=min(abs(worldY-uFloorY.x),abs(worldY-uFloorY.y));
  if (floorDistance>0.035 || dot(n, uUp) < 0.80){ gl_FragColor = vec4(0.0); return; }
  vec3 r = reflect(normalize(p), n);
  vec3 q = p + n*0.025;
  float stride = uStride * (1.0 + fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) * 0.4);
  // Bracket the first depth crossing, then refine it instead of accepting
  // whichever coarse step happens to land inside a fixed thickness slab.
  for (int i = 0; i < 36; i++){
    if(float(i)>=uSteps)break;
    vec3 before=q;
    q += r * stride;
    if(q.z>=-uNear)break;
    vec4 c = uProj * vec4(q, 1.0);
    vec2 uv = c.xy / c.w * 0.5 + 0.5;
    if (c.w <= 0.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float sz = viewPos(uv).z;
    if (sz > q.z + 0.015){
      vec3 lo=before,hi=q;
      for(int j=0;j<5;j++){
        vec3 mid=(lo+hi)*0.5;
        vec4 clip=uProj*vec4(mid,1.0);
        vec2 at=clip.xy/clip.w*0.5+0.5;
        if(viewPos(at).z>mid.z)hi=mid;else lo=mid;
      }
      vec4 hit=uProj*vec4(hi,1.0);
      uv=hit.xy/hit.w*0.5+0.5;
      float gap=viewPos(uv).z-hi.z;
      if(gap<0.0 || gap>0.12)break; // reject silhouette crossings
      vec2 e = abs(uv - 0.5) * 2.0;
      float edge = 1.0 - smoothstep(0.62, 1.0, max(e.x, e.y));
      float run = 1.0 - smoothstep(5.0,12.0,length(hi-p));
      float fresnel=0.04+0.96*pow(1.0-max(dot(n,-normalize(p)),0.0),5.0);
      float confidence=edge*run*fresnel;
      gl_FragColor = vec4(texture2D(tColor, uv).rgb*confidence, confidence);
      return;
    }
    stride = min(stride*1.08,0.55);
  }
  gl_FragColor = vec4(0.0);
}`);
ssrMat.extensions = {derivatives:true};

// Local diffuse colour transfer from visible surfaces. This deliberately
// supplies only a small bounce over the baked irradiance, with distance and
// two cosine terms rejecting unrelated surfaces. It is an approximation to
// SSGI, not a replacement for off-screen global illumination.
const giMat = shader({
  tColor:{value:null},tDepth:{value:null},uProjInv:{value:new THREE.Matrix4()},
  uProj:{value:new THREE.Matrix4()},uNear:{value:0.05},uFar:{value:260},
  uTexel:{value:new THREE.Vector2()},uPhase:{value:0},uSamples:{value:12},
}, DEPTH_FNS + `
varying vec2 vUv;
uniform sampler2D tColor;
uniform mat4 uProj;
uniform vec2 uTexel;
uniform float uPhase, uSamples;
vec3 giNormal(vec2 uv){
  vec3 p=viewPos(uv);
  vec3 left=p-viewPos(uv-vec2(uTexel.x,0.0));
  vec3 right=viewPos(uv+vec2(uTexel.x,0.0))-p;
  vec3 down=p-viewPos(uv-vec2(0.0,uTexel.y));
  vec3 up=viewPos(uv+vec2(0.0,uTexel.y))-p;
  vec3 n=normalize(cross(abs(left.z)<abs(right.z)?left:right,abs(down.z)<abs(up.z)?down:up));
  return dot(n,-p)<0.0?-n:n;
}
void main(){
  vec3 p=viewPos(vUv),n=giNormal(vUv),sum=vec3(0.0);
  if(-p.z>30.0){gl_FragColor=vec4(0.0);return;}
  float angle=fract(sin(dot(vUv,vec2(12.9898,78.233)))*43758.5453)*6.2831853+uPhase;
  vec2 radius=vec2(uProj[0][0],uProj[1][1])*0.65/max(-p.z,0.2);
  for(int i=0;i<12;i++){
    if(float(i)>=uSamples)break;
    float f=(float(i)+0.5)/uSamples,a=angle+float(i)*2.399963;
    vec2 uv=vUv+vec2(cos(a),sin(a))*sqrt(f)*radius;
    if(any(lessThan(uv,uTexel))||any(greaterThan(uv,vec2(1.0)-uTexel)))continue;
    vec3 q=viewPos(uv),delta=q-p;
    float distance=length(delta);
    if(distance<0.06||distance>1.5)continue;
    vec3 direction=delta/distance;
    float weight=max(dot(n,direction)-0.05,0.0)*max(dot(giNormal(uv),-direction),0.0);
    weight*=1.0-smoothstep(0.2,1.5,distance);
    sum+=min(texture2D(tColor,uv).rgb,vec3(2.0))*weight;
  }
  gl_FragColor=vec4(sum/uSamples,1.0);
}`);

const temporalMat = shader({
  tCurrent:{value:null},tHistory:{value:null},tDepth:{value:null},tHistoryDepth:{value:null},
  uCurrentInv:{value:new THREE.Matrix4()},uPrevious:{value:new THREE.Matrix4()},
  uTexel:{value:new THREE.Vector2()},uValid:{value:0},uNear:{value:0.05},uFar:{value:260},
}, TEMPORAL_FRAGMENT);
const historyDepthMat = shader({tDepth:{value:null}},HISTORY_DEPTH_FRAGMENT);

const compMat = shader({
  tColor:{value:null}, tAO:{value:null}, tBloom:{value:null}, tFar:{value:null},
  tSSR:{value:null}, uSSR:{value:0.38}, tGI:{value:null}, uGI:{value:0.65},
  tDepth:{value:null}, uProjInv:{value:new THREE.Matrix4()},
  uNear:{value:0.05}, uFar:{value:260},
  uExposure:{value:1.0}, uBloom:{value:0.13}, uAO:{value:0.88},
  uFocus:{value:5.5}, uRange:{value:16.0}, uDof:{value:0.30},
  uVignette:{value:0.15}, uGrain:{value:0.002}, uTime:{value:0},
}, DEPTH_FNS + `
varying vec2 vUv;
uniform sampler2D tColor, tAO, tBloom, tFar, tSSR, tGI;
uniform float uExposure, uBloom, uAO, uFocus, uRange, uDof, uVignette, uGrain, uTime, uSSR, uGI;

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
  // Confidence is already in the blurred RGB. Blend radiance instead of
  // adding energy, which made pale floors glow and doubled window highlights.
  col = col*(1.0-ssr.a*uSSR) + ssr.rgb*uSSR;

  // Occlusion, curved: the blurred map is mostly pale, and the eye wants the
  // corners and the undersides to go properly dark.
  col *= mix(1.0, pow(texture2D(tAO, vUv).r, 1.5), uAO);
  col += texture2D(tGI,vUv).rgb * (col/(col+vec3(0.35))) * uGI;
  col += texture2D(tBloom, vUv).rgb * uBloom;
  col = aces(col * uExposure);
  // A photograph's tone curve, not a renderer's: a quarter of a smoothstep
  // for contrast in the midtones, and a slight warmth — daylight indoors is
  // sunlight bounced off oak and off-white, not the sky's blue.
  col = mix(col, col*col*(3.0 - 2.0*col), 0.28);
  col *= vec3(1.02, 1.0, 0.965);

  vec2 d = vUv - 0.5;
  col *= 1.0 - uVignette * dot(d, d) * 1.9;

  // Exact linear-to-sRGB transfer, followed by low-amplitude display grain.
  col=mix(col*12.92,1.055*pow(max(col,0.0),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),col));
  float g = fract(sin(dot(vUv * (1.0 + uTime), vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;

  gl_FragColor = vec4(clamp(col,0.0,1.0), 1.0);
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

const qualityState = {mode:'auto',tier:'high',slow:0,elapsed:0};
let targetWidth=0,targetHeight=0,historyValid=false,historyIndex=0,temporalFrame=0;
let historyState='',lastPostTime=0;
const previousViewProjection=new THREE.Matrix4(),baseProjection=new THREE.Matrix4();
const previousCameraPosition=new THREE.Vector3(),previousCameraRotation=new THREE.Quaternion();
function qualityLabel(){
  const select=$('graphics-quality');
  select.value=qualityState.mode;
  select.options[0].textContent='Auto ('+qualityState.tier+')';
}
export function initGraphics(){
  try{
    const saved=localStorage.getItem('storeywalk.graphics');
    if(saved==='auto'||QUALITY_PRESETS[saved])qualityState.mode=saved;
  }catch{}
  qualityState.tier=qualityState.mode==='auto'?'high':qualityState.mode;
  const select=$('graphics-quality');
  select.disabled=!CAN_POST;
  if(!CAN_POST)select.title='Post-processing is unavailable on this graphics device';
  qualityLabel();
  select.addEventListener('change',()=>{
    qualityState.mode=select.value;
    qualityState.tier=select.value==='auto'?'high':select.value;
    qualityState.slow=0;qualityState.elapsed=0;
    try{localStorage.setItem('storeywalk.graphics',select.value);}catch{}
    qualityLabel();makeTargets(targetWidth,targetHeight);
  });
}
export function watchBudget(dt){
  if(!postOn||!flags.surfaced||document.hidden)return;
  if(qualityBudget(qualityState,dt)){
    qualityLabel();makeTargets(targetWidth,targetHeight);
  }
}

const RTS = {};
let postOn = CAN_POST, postReady = false;
export function makeTargets(w, h){
  if (!CAN_POST) return;
  targetWidth=w;targetHeight=h;
  const scale=Math.min(renderer.getPixelRatio(),QUALITY_PRESETS[qualityState.tier].scale);
  w=Math.max(2,Math.round(w*scale));h=Math.max(2,Math.round(h*scale));
  historyValid=false;temporalFrame=0;
  for (const k in RTS){ RTS[k].dispose(); delete RTS[k]; }
  const hdr = CAN_HDR ? THREE.HalfFloatType : THREE.UnsignedByteType;
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
  RTS.gi = half(opt(hdr));
  RTS.giT = half(opt(hdr));
  for(const name of ['history0','history1','historyDepth']){
    RTS[name]=new THREE.WebGLRenderTarget(w,h,opt(THREE.UnsignedByteType));
    RTS[name].depthBuffer=false;
  }
  RTS.historyDepth.texture.minFilter=RTS.historyDepth.texture.magFilter=THREE.NearestFilter;
  RTS.comp = new THREE.WebGLRenderTarget(w, h, opt(THREE.UnsignedByteType));
  for (const k of ['ao','aoT','b0','b1','q0','q1','d0','d1','ssr','gi','giT','comp'])
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

function lensBlur(src,tmp,dst,texel,spread){
  const u=lensBlurMat.uniforms;
  u.tDepth.value=RTS.scene.depthTexture;u.uNear.value=camera.near;u.uFar.value=camera.far;
  u.tSrc.value=src.texture;u.uDir.value.set(texel.x*spread,0);draw(lensBlurMat,tmp);
  u.tSrc.value=tmp.texture;u.uDir.value.set(0,texel.y*spread);draw(lensBlurMat,dst);
}

export function renderFrame(){
  if (!postOn || !postReady || !flags.surfaced){
    historyValid=false;
    // Keep highlight rolloff when the optional lens is disabled or too slow.
    renderer.toneMapping=flags.surfaced?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;
    renderer.toneMappingExposure=compMat.uniforms.uExposure.value;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return;
  }
  const preset=QUALITY_PRESETS[qualityState.tier];
  const useTemporal=preset.temporal && renderer.capabilities.isWebGL2;
  const now=performance.now();
  const state=[view.mode,view.explode,player.level,flags.showFurniture,flags.showPrints,flags.surfaced].join(':');
  if(state!==historyState || now-lastPostTime>250 || renderer.shadowMap.needsUpdate ||
     camera.position.distanceTo(previousCameraPosition)>0.8 ||
     camera.quaternion.angleTo(previousCameraRotation)>0.35)historyValid=false;
  historyState=state;lastPostTime=now;
  previousCameraPosition.copy(camera.position);previousCameraRotation.copy(camera.quaternion);
  renderer.toneMapping=THREE.NoToneMapping;
  const w = RTS.scene.width, h = RTS.scene.height;

  baseProjection.copy(camera.projectionMatrix);
  if(useTemporal){
    const jitter=temporalJitter(temporalFrame++);
    camera.projectionMatrix.elements[8]+=2*jitter[0]/w;
    camera.projectionMatrix.elements[9]+=2*jitter[1]/h;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  renderer.setRenderTarget(RTS.scene);
  renderer.render(scene, camera);

  const projInv = new THREE.Matrix4().copy(camera.projectionMatrix).invert();
  for (const m of [aoMat, compMat]){
    m.uniforms.tDepth.value = RTS.scene.depthTexture;
    m.uniforms.uProjInv.value.copy(projInv);
    m.uniforms.uNear.value = camera.near;
    m.uniforms.uFar.value = camera.far;
  }
  aoMat.uniforms.uSamples.value=preset.ao;
  aoMat.uniforms.uProj.value.copy(camera.projectionMatrix);
  const half = new THREE.Vector2(1/RTS.ao.width, 1/RTS.ao.height);
  const quarter = new THREE.Vector2(1/RTS.q0.width, 1/RTS.q0.height);
  aoMat.uniforms.uTexel.value.copy(half);
  aoMat.uniforms.uPhase.value=useTemporal?(temporalFrame%8)*0.785398:0;
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

  if(preset.bounce){
    const u=giMat.uniforms;
    u.tColor.value=RTS.scene.texture;u.tDepth.value=RTS.scene.depthTexture;
    u.uProjInv.value.copy(projInv);u.uProj.value.copy(camera.projectionMatrix);
    u.uNear.value=camera.near;u.uFar.value=camera.far;u.uTexel.value.set(1/w,1/h);
    u.uSamples.value=preset.gi;
    u.uPhase.value=useTemporal?(temporalFrame%8)*0.785398:0;
    draw(giMat,RTS.gi);lensBlur(RTS.gi,RTS.giT,RTS.gi,half,1.5);
  }
  if(preset.reflections){
  // Reflections before the bloom, while b1 is still free to blur them in.
  ssrMat.uniforms.uSteps.value=preset.steps;
  ssrMat.uniforms.uStride.value=qualityState.tier==='high'?0.18:0.25;
  ssrMat.uniforms.tColor.value = RTS.scene.texture;
  ssrMat.uniforms.tDepth.value = RTS.scene.depthTexture;
  ssrMat.uniforms.uProjInv.value.copy(projInv);
  ssrMat.uniforms.uProj.value.copy(camera.projectionMatrix);
  ssrMat.uniforms.uNear.value = camera.near;
  ssrMat.uniforms.uFar.value = camera.far;
  const world=camera.matrixWorld.elements;
  ssrMat.uniforms.uWorldY.value.set(world[1],world[5],world[9],world[13]);
  const floorY=i=>levels[i]?levels[i].elevation+levels[i].group.position.y+0.006:-10000;
  ssrMat.uniforms.uFloorY.value.set(floorY(0),floorY(1));
  ssrMat.uniforms.uUp.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
  draw(ssrMat, RTS.ssr);
  lensBlur(RTS.ssr, RTS.b1, RTS.ssr, half, 1.3);   // gloss, not a mirror

  }

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
  lensBlur(RTS.scene, RTS.d1, RTS.d0, quarter, 0.75);

  compMat.uniforms.tColor.value = RTS.scene.texture;
  compMat.uniforms.tAO.value = RTS.ao.texture;
  compMat.uniforms.tBloom.value = RTS.q0.texture;
  compMat.uniforms.tFar.value = RTS.d0.texture;
  compMat.uniforms.tSSR.value = RTS.ssr.texture;
  compMat.uniforms.tGI.value=RTS.gi.texture;
  compMat.uniforms.uGI.value=preset.bounce?0.65:0;
  compMat.uniforms.uSSR.value=preset.reflections?0.38:0;
  compMat.uniforms.uTime.value = performance.now() * 0.0002;
  draw(compMat, RTS.comp);

  let resolved=RTS.comp;
  if(useTemporal){
    const currentVP=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const u=temporalMat.uniforms;
    u.tCurrent.value=RTS.comp.texture;u.tHistory.value=RTS['history'+(1-historyIndex)].texture;
    u.tDepth.value=RTS.scene.depthTexture;u.tHistoryDepth.value=RTS.historyDepth.texture;
    u.uCurrentInv.value.copy(currentVP).invert();u.uPrevious.value.copy(previousViewProjection);
    u.uTexel.value.set(1/w,1/h);u.uValid.value=historyValid?1:0;
    u.uNear.value=camera.near;u.uFar.value=camera.far;
    resolved=RTS['history'+historyIndex];draw(temporalMat,resolved);
    historyDepthMat.uniforms.tDepth.value=RTS.scene.depthTexture;
    draw(historyDepthMat,RTS.historyDepth);
    previousViewProjection.copy(currentVP);historyIndex=1-historyIndex;historyValid=true;
  }else historyValid=false;
  camera.projectionMatrix.copy(baseProjection);
  camera.projectionMatrixInverse.copy(baseProjection).invert();
  fxaaMat.uniforms.tSrc.value = resolved.texture;
  fxaaMat.uniforms.uTexel.value.set(1/w, 1/h);
  draw(fxaaMat, null);
}

// The reader's own opinion about the lens, from the Q key.
export function togglePost(){ postOn = CAN_POST && !postOn; historyValid=false; }

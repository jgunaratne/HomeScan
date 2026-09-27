import { $ } from '../core/util.js';
import { TEMPORAL_FRAGMENT, HISTORY_DEPTH_FRAGMENT, temporalJitter } from './temporal.js';
import { QUALITY_PRESETS, qualityBudget } from './quality.js';
import { levels } from '../scene/levels.js';
import { flags, view, player } from '../core/state.js';
import { renderer, scene, camera } from '../scene/stage.js';
import { onFloor } from '../core/geometry.js';
import { daylightAt } from '../photo/daylight.js';
import { drawMirrors, restoreMirrors } from './mirrors.js';

// Planar mirrors -> linear HDR scene -> GTAO / screen-space bounce / SSR ->
// bilateral filters -> metered exposure, bloom and tone mapping ->
// reprojected TAA -> FXAA presentation.
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

// Normals rebuilt from depth, taking on each axis whichever neighbour lies on
// the same surface — the nearer in depth. Plain derivatives average across
// every silhouette and crease, and each of those pixels came out as a dark
// fleck in the occlusion and a stray ray in the reflections.
const NORMAL_FNS = `
uniform vec2 uTexel;
vec3 surfaceNormal(vec2 uv, vec3 p){
  vec3 l = p - viewPos(uv - vec2(uTexel.x, 0.0));
  vec3 r = viewPos(uv + vec2(uTexel.x, 0.0)) - p;
  vec3 d = p - viewPos(uv - vec2(0.0, uTexel.y));
  vec3 u = viewPos(uv + vec2(0.0, uTexel.y)) - p;
  vec3 n = normalize(cross(abs(l.z) < abs(r.z) ? l : r, abs(d.z) < abs(u.z) ? d : u));
  return dot(n, -p) < 0.0 ? -n : n;
}`;

// Interleaved gradient noise, moved on every frame so the temporal filter
// averages a new pattern each time instead of refining the same one.
const IGN = `
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`;

// Ground-truth-style ambient occlusion (Jimenez et al. 2016, after XeGTAO).
// For a few directions across the screen it walks outward on both sides,
// keeps the highest horizon it meets, and integrates the cosine-weighted sky
// left between the two — so a corner, the gap under a sofa and the reveal of
// a window darken by how much of the room they actually cannot see. The
// hemisphere sampling this replaced counted points, not angles, and went
// grey on every open wall while barely touching the corners.
const aoMat = shader({
  tDepth:{value:null}, uProjInv:{value:new THREE.Matrix4()}, uProj:{value:new THREE.Matrix4()},
  uNear:{value:0.05}, uFar:{value:260}, uTexel:{value:new THREE.Vector2()},
  uSlices:{value:3}, uSteps:{value:6}, uRadius:{value:0.9}, uFrame:{value:0}, uPower:{value:1.5},
}, DEPTH_FNS + NORMAL_FNS + IGN + `
varying vec2 vUv;
uniform mat4 uProj;
uniform float uSlices, uSteps, uRadius, uFrame, uPower;
const float HALF_PI = 1.5707963;
void main(){
  // From the centre of a full-resolution pixel, so every tap lands on one:
  // a slope measured between texel corners is a slope of noise.
  vec2 uv = (floor(vUv / uTexel) + 0.5) * uTexel;
  vec3 p = viewPos(uv);
  if (-p.z > uFar * 0.5){ gl_FragColor = vec4(1.0); return; }
  vec3 v = normalize(-p);
  vec3 n = surfaceNormal(uv, p);
  // The radius is fixed in metres, so its size on screen falls with distance.
  float radius = min(uRadius * uProj[1][1] * 0.5 / (-p.z * uTexel.y), 256.0);
  if (radius < 2.0){ gl_FragColor = vec4(1.0); return; }
  float sliceNoise = ign(gl_FragCoord.xy + uFrame * 5.588238);
  float stepNoise = ign(gl_FragCoord.yx + vec2(37.0, 17.0) + uFrame * 5.588238);
  float falloff = uRadius * 0.6;
  float visibility = 0.0;
  for (int s = 0; s < 4; s++){
    if (float(s) >= uSlices) break;
    float phi = (float(s) + sliceNoise) / uSlices * 3.14159265;
    vec2 dir = vec2(cos(phi), sin(phi));
    vec3 ortho = vec3(dir, 0.0) - dot(vec3(dir, 0.0), v) * v;
    vec3 axis = normalize(cross(ortho, v));
    vec3 pn = n - axis * dot(n, axis);
    float pnLength = length(pn);
    float cosN = clamp(dot(pn, v) / max(pnLength, 1e-4), 0.0, 1.0);
    float an = sign(dot(ortho, pn)) * acos(cosN);
    // Horizons start at the tangent plane: nothing below it can occlude.
    float low0 = cos(an + HALF_PI), low1 = cos(an - HALF_PI);
    float c0 = low0, c1 = low1;
    for (int j = 0; j < 8; j++){
      if (float(j) >= uSteps) break;
      float t = (float(j) + fract(stepNoise + float(s + j * 4) * 0.618034)) / uSteps;
      vec2 off = floor(dir * (t * t * radius + 1.3) + 0.5) * uTexel;
      vec2 a = uv + off, b = uv - off;
      vec3 d0 = viewPos(a) - p, d1 = viewPos(b) - p;
      float l0 = length(d0), l1 = length(d1);
      // Distant geometry fades out rather than occluding from across the room,
      // and a tap off the edge of the screen knows nothing.
      float w0 = clamp((uRadius - l0) / falloff, 0.0, 1.0) * step(0.0, a.x) * step(a.x, 1.0) * step(0.0, a.y) * step(a.y, 1.0);
      float w1 = clamp((uRadius - l1) / falloff, 0.0, 1.0) * step(0.0, b.x) * step(b.x, 1.0) * step(0.0, b.y) * step(b.y, 1.0);
      c0 = max(c0, mix(low0, dot(d0, v) / max(l0, 1e-4), w0));
      c1 = max(c1, mix(low1, dot(d1, v) / max(l1, 1e-4), w1));
    }
    float h0 = an + clamp(-acos(clamp(c1, -1.0, 1.0)) - an, -HALF_PI, HALF_PI);
    float h1 = an + clamp(acos(clamp(c0, -1.0, 1.0)) - an, -HALF_PI, HALF_PI);
    float sn = sin(an);
    visibility += mix(pnLength, 1.0, 0.05) * 0.25 *
      (2.0 * cosN + 2.0 * (h0 + h1) * sn - cos(2.0 * h0 - an) - cos(2.0 * h1 - an));
  }
  visibility = pow(clamp(visibility / uSlices, 0.0, 1.0), uPower);
  gl_FragColor = vec4(vec3(visibility), 1.0);
}`);

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
// Inputs are clamped: one non-finite pixel from a degenerate triangle would
// otherwise be blurred into a black block, and the meter would read it.
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
    colour+=min(max(texture2D(tSrc,uv),vec4(0.0)),vec4(64.0))*weight;total+=weight;
  }
  gl_FragColor=colour/max(total,0.0001);
}`);

// Only what is brighter than the room blooms — which, indoors, means the
// windows, the sun on the floor and the downlights, and that is exactly what
// blooms in a photograph. The threshold is on the exposed value, so what
// counts as bright follows the eye as it adapts.
const EXPOSURE_FNS = `
uniform sampler2D tExposure;
uniform float uAuto, uFixed;
float exposure(){ return uAuto > 0.5 ? texture2D(tExposure, vec2(0.5)).r : uFixed; }`;
// What is seen through window glass is developed a stop or so down from the
// room — the window pull an interior photographer composites in by hand —
// and the glass has cleared the alpha of every pixel it covers to say which
// those are (MAT.pane). The eye does the same: from inside, the lake is blue
// and the hills are green, not a white rectangle in the wall.
const PULL_FNS = `
uniform float uPull;
vec3 pulled(vec4 c){ return c.rgb * mix(uPull, 1.0, clamp(c.a, 0.0, 1.0)); }`;
const WINDOW_PULL = 0.5;
const brightMat = shader({
  tSrc:{value:null}, uCut:{value:1.3}, uKnee:{value:0.5},
  tExposure:{value:null}, uAuto:{value:0}, uFixed:{value:1}, uPull:{value:1},
}, EXPOSURE_FNS + PULL_FNS + `
varying vec2 vUv;
uniform sampler2D tSrc;
uniform float uCut, uKnee;
void main(){
  vec3 c = min(max(pulled(texture2D(tSrc, vUv)), vec3(0.0)), vec3(64.0));
  float l = max(c.r, max(c.g, c.b)) * exposure();
  gl_FragColor = vec4(c * smoothstep(uCut - uKnee, uCut + uKnee, l), 1.0);
}`);

// The eye's adaptation, metered the way a photographer meters a room: mostly
// by the light falling where you stand (`uIncident`, read from the baked
// field — see daylightAt), and only partly by what the frame sends back. A
// meter that reads only the frame is fooled by paint: it takes a room with a
// dark accent wall for a dark room and opens up until the paint is pale.
// Incident light is blind to paint, so a dark wall stays dark and a white one
// white; the frame's share (`uReflect`) keeps the part that is real — look
// into a bright window and the eye stops down a little for it. That share is
// a centre-weighted log average of the blurred frame, so no single pixel can
// decide it. `uCard` turns incident light into the luminance of an average
// room under it, so both readings are in the same units: 0.42 is what the
// white rooms measure. The exposure moves toward what the reading asks for at
// the pace an eye does, in stops, a little quicker to stop down for glare
// than to open up for shade, and only partly: `uAdapt` below one leaves a dim
// hall a little dim, as it looks when you walk in. Outside, with no field,
// the frame decides, against its own key (`uKeyFrame`): the orbit is a
// sunlit house on a lawn, exposed for the white walls in the sun, not for a
// room.
const adaptMat = shader({
  tSrc:{value:null}, tPrev:{value:null}, uBlend:{value:new THREE.Vector2(1, 1)},
  uKey:{value:0.8}, uKeyFrame:{value:0.34}, uAdapt:{value:0.7}, uRef:{value:0.3}, uMin:{value:0.3}, uMax:{value:6.0},
  uIncident:{value:0}, uCard:{value:0.42}, uReflect:{value:0.35},
}, `
varying vec2 vUv;
uniform sampler2D tSrc, tPrev;
uniform vec2 uBlend;
uniform float uKey, uKeyFrame, uAdapt, uRef, uMin, uMax, uIncident, uCard, uReflect;
void main(){
  float sum = 0.0, total = 0.0;
  for (int y = 0; y < 12; y++) for (int x = 0; x < 16; x++){
    vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(16.0, 12.0);
    float l = dot(texture2D(tSrc, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
    l = min(max(l, 0.002), 12.0);
    vec2 d = (uv - vec2(0.5, 0.48)) * vec2(1.6, 2.0);
    float w = exp(-dot(d, d) * 1.5);
    sum += log2(l) * w; total += w;
  }
  float average = exp2(sum / total);
  bool indoors = uIncident > 0.0;
  float metered = indoors
    ? exp2(mix(log2(max(uIncident * uCard, 0.002)), log2(average), uReflect))
    : average;
  float target = clamp((indoors ? uKey : uKeyFrame) / (pow(metered, uAdapt) * pow(uRef, 1.0 - uAdapt)), uMin, uMax);
  float previous = min(max(texture2D(tPrev, vec2(0.5)).r, uMin), uMax);
  float blend = target < previous ? uBlend.x : uBlend.y;
  gl_FragColor = vec4(exp2(mix(log2(previous), log2(target), blend)), average, target, metered);
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
  uNear:{value:0.05}, uFar:{value:260}, uTexel:{value:new THREE.Vector2()},
  uWorldY:{value:new THREE.Vector4()}, uFloorY:{value:new THREE.Vector2()},
  uUp:{value:new THREE.Vector3(0,1,0)}, uSteps:{value:36}, uStride:{value:0.18},
}, DEPTH_FNS + NORMAL_FNS + `
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
  vec3 n = surfaceNormal(vUv, p);
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
      gl_FragColor = vec4(min(max(texture2D(tColor, uv).rgb, vec3(0.0)), vec3(64.0))*confidence, confidence);
      return;
    }
    stride = min(stride*1.08,0.55);
  }
  gl_FragColor = vec4(0.0);
}`);

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
  uNear:{value:0.05}, uFar:{value:260}, uAOSize:{value:new THREE.Vector2(1, 1)},
  tExposure:{value:null}, uAuto:{value:0}, uFixed:{value:1.0},
  uBloom:{value:0.13}, uAO:{value:1.0}, uContrast:{value:0.12}, uTint:{value:new THREE.Vector3(1.01, 1.0, 0.985)},
  uFocus:{value:5.5}, uRange:{value:16.0}, uDof:{value:0.30},
  uVignette:{value:0.15}, uGrain:{value:0.002}, uTime:{value:0}, uPull:{value:1},
}, DEPTH_FNS + EXPOSURE_FNS + PULL_FNS + `
varying vec2 vUv;
uniform sampler2D tColor, tAO, tBloom, tFar, tSSR, tGI;
uniform vec2 uAOSize;
uniform vec3 uTint;
uniform float uBloom, uAO, uContrast, uFocus, uRange, uDof, uVignette, uGrain, uTime, uSSR, uGI;

// The ACES fit three.js itself applies when the lens is off — Hill's RRT and
// ODT with their colour matrices — so both paths develop the same picture.
// The per-channel curve this replaced pushed saturated highlights toward
// their primaries: white oak went orange in the sun and the lawn went neon.
vec3 aces(vec3 color){
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = IN * (color / 0.6);
  vec3 a = color * (color + 0.0245786) - 0.000090537;
  vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
  return clamp(OUT * (a / b), 0.0, 1.0);
}

// Occlusion comes up from half resolution with each of the four texels
// weighted by how close its depth is to this pixel's, so a chair's contact
// shadow stays on the floor instead of hazing the wall seen past it.
float occlusion(float z){
  vec2 st = vUv * uAOSize - 0.5;
  vec2 i = floor(st), f = st - i;
  float sum = 0.0, total = 0.0;
  for (int k = 0; k < 4; k++){
    vec2 o = vec2(mod(float(k), 2.0), floor(float(k) * 0.5));
    vec2 uv = (i + o + 0.5) / uAOSize;
    vec2 b = mix(1.0 - f, f, o);
    float w = b.x * b.y * exp(-abs(linearise(texture2D(tDepth, uv).x) - z) / (0.02 + 0.03 * z)) + 1e-5;
    sum += texture2D(tAO, uv).r * w; total += w;
  }
  return sum / total;
}

// What a corner does not receive directly still reaches it after a bounce off
// the pale surfaces round it (Jimenez et al.'s multi-bounce fit, for an
// albedo of 0.7): a white room's corners do not go as dark as the raw term.
float multiBounce(float v){
  const float albedo = 0.7;
  float a = 2.0404 * albedo - 0.3324, b = -4.7951 * albedo + 0.6417, c = 2.7552 * albedo + 0.6903;
  return max(v, ((v * a + b) * v + c) * v);
}

void main(){
  vec3 col = min(max(pulled(texture2D(tColor, vUv)), vec3(0.0)), vec3(64.0));

  // Depth of field. The eye holds a room at about four metres; everything
  // nearer and further goes soft, which is most of why a still looks taken
  // rather than drawn.
  float z = linearise(texture2D(tDepth, vUv).x);
  float coc = clamp(abs(z - uFocus) / uRange, 0.0, 1.0) * uDof;
  col = mix(col, pulled(texture2D(tFar, vUv)), coc * coc);

  vec4 ssr = texture2D(tSSR, vUv);
  // Confidence is already in the blurred RGB. Blend radiance instead of
  // adding energy, which made pale floors glow and doubled window highlights.
  col = col*(1.0-ssr.a*uSSR) + ssr.rgb*uSSR;

  col *= mix(1.0, multiBounce(occlusion(z)), uAO);
  col += texture2D(tGI,vUv).rgb * (col/(col+vec3(0.35))) * uGI;
  col += texture2D(tBloom, vUv).rgb * uBloom;
  col = aces(col * exposure());
  // A photograph's tone curve, not a renderer's: a touch of smoothstep for
  // midtone contrast, and the faintest warmth — daylight indoors is sunlight
  // bounced off oak and off-white, not the sky's blue.
  col = mix(col, col*col*(3.0 - 2.0*col), uContrast);
  col *= uTint;

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
// A bump map's perturbed normal is normalize(|det|·n − gradient), and where a
// triangle is seen exactly edge-on both terms vanish; a mesh with a collapsed
// vertex normal does the same one step earlier. normalize(0) is not a number,
// and one such pixel was enough to be bloomed and blurred into a black block
// floating in the room. Both are guarded before the first program compiles.
function guardNormals(){
  const chunk = THREE.ShaderChunk;
  chunk.bumpmap_pars_fragment = chunk.bumpmap_pars_fragment.replace(
    'return normalize( abs( fDet ) * surf_norm - vGrad );',
    'vec3 bumped = abs( fDet ) * surf_norm - vGrad;\n' +
    '\t\tfloat bumpedLength = dot( bumped, bumped );\n' +
    '\t\treturn bumpedLength > 1e-24 ? bumped * inversesqrt( bumpedLength ) : surf_norm;');
  chunk.normal_fragment_begin = chunk.normal_fragment_begin.replace(
    'vec3 normal = normalize( vNormal );',
    'vec3 normal = dot( vNormal, vNormal ) > 1e-24 ? normalize( vNormal ) : vec3( 0.0, 0.0, 1.0 );');
}
export function initGraphics(){
  guardNormals();
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
let postOn = CAN_POST, postReady = false, exposureReady = false, exposureIndex = 0;
export function makeTargets(w, h){
  if (!CAN_POST) return;
  targetWidth=w;targetHeight=h;
  const scale=Math.min(renderer.getPixelRatio(),QUALITY_PRESETS[qualityState.tier].scale);
  w=Math.max(2,Math.round(w*scale));h=Math.max(2,Math.round(h*scale));
  historyValid=false;temporalFrame=0;exposureReady=false;
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
  // The exposure is one pixel, read and written in turn. An eight-bit buffer
  // cannot hold it or see past white to meter by, so without half floats the
  // lens keeps a fixed exposure instead.
  if (CAN_HDR) for (const k of ['exp0','exp1']){
    RTS[k] = new THREE.WebGLRenderTarget(1, 1, {minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter,
      format:THREE.RGBAFormat, type:THREE.HalfFloatType, depthBuffer:false, stencilBuffer:false});
  }
  compMat.uniforms.uAOSize.value.set(RTS.ao.width, RTS.ao.height);
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

// The light meter held where you stand and a stride ahead, where the room you
// are looking into begins (adaptMat): log-averaged, so a doorway blends the
// two rooms rather than switching between them. Only on foot indoors is there
// a baked field to read; the orbit meters the frame alone.
const meterAhead = new THREE.Vector3();
function incidentLight(){
  const L = levels[player.level];
  if (view.mode !== 'walk' || !L || !L.daylight) return 0;
  camera.getWorldDirection(meterAhead);
  const len = Math.hypot(meterAhead.x, meterAhead.z) || 1, p = camera.position;
  let sum = 0, n = 0;
  for (const step of [0, 1]){
    const x = p.x + meterAhead.x / len * step, z = p.z + meterAhead.z / len * step;
    if (step && !onFloor(L, x, z)) break;
    sum += Math.log2(Math.max(daylightAt(L.daylight, x, p.y, z), 0.002)); n++;
  }
  return Math.pow(2, sum / n);
}

// Where there is no meter to set the exposure — the lens off, or no float
// buffer to meter in — about what it settles on: indoors, and on the orbit.
const fixedExposure = () => view.mode === 'walk' ? 2.4 : 1.3;

export function renderFrame(){
  if (!postOn || !postReady || !flags.surfaced){
    historyValid=false;exposureReady=false;
    // Keep highlight rolloff when the optional lens is disabled or too slow.
    renderer.toneMapping=flags.surfaced?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;
    renderer.toneMappingExposure=fixedExposure();
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return;
  }
  const preset=QUALITY_PRESETS[qualityState.tier];
  const useTemporal=preset.temporal && renderer.capabilities.isWebGL2;
  const now=performance.now();
  const dt=Math.min(Math.max((now-lastPostTime)/1000,0),0.25);
  const state=[view.mode,view.explode,player.level,flags.showFurniture,flags.showPrints,flags.surfaced].join(':');
  // A cut — another storey or mode, a teleport, a stall — starts the history
  // and the eye's adaptation afresh rather than dissolving from the last shot.
  const cut=state!==historyState || now-lastPostTime>250 || renderer.shadowMap.needsUpdate ||
     camera.position.distanceTo(previousCameraPosition)>0.8 ||
     camera.quaternion.angleTo(previousCameraRotation)>0.35;
  if(cut)historyValid=false;
  historyState=state;lastPostTime=now;
  previousCameraPosition.copy(camera.position);previousCameraRotation.copy(camera.quaternion);
  renderer.toneMapping=THREE.NoToneMapping;
  const w = RTS.scene.width, h = RTS.scene.height;

  // The mirrors first, each drawing the room into its own picture, which the
  // main pass then shows on the glass (mirrors.js). Only on foot: from the
  // orbit a mirror is a few pixels at the bottom of a dollhouse.
  const mirrored=view.mode==='walk'?drawMirrors(preset.mirrors,RTS.scene.texture.type,w,h):[];
  baseProjection.copy(camera.projectionMatrix);
  if(useTemporal){
    const jitter=temporalJitter(temporalFrame++);
    camera.projectionMatrix.elements[8]+=2*jitter[0]/w;
    camera.projectionMatrix.elements[9]+=2*jitter[1]/h;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  renderer.setRenderTarget(RTS.scene);
  renderer.render(scene, camera);
  restoreMirrors(mirrored);

  const projInv = new THREE.Matrix4().copy(camera.projectionMatrix).invert();
  for (const m of [aoMat, compMat]){
    m.uniforms.tDepth.value = RTS.scene.depthTexture;
    m.uniforms.uProjInv.value.copy(projInv);
    m.uniforms.uNear.value = camera.near;
    m.uniforms.uFar.value = camera.far;
  }
  const half = new THREE.Vector2(1/RTS.ao.width, 1/RTS.ao.height);
  const quarter = new THREE.Vector2(1/RTS.q0.width, 1/RTS.q0.height);
  // Occlusion is drawn at half size but measured on the full-size depth.
  aoMat.uniforms.uProj.value.copy(camera.projectionMatrix);
  aoMat.uniforms.uTexel.value.set(1/w, 1/h);
  aoMat.uniforms.uSlices.value=preset.aoSlices;
  aoMat.uniforms.uSteps.value=preset.aoSteps;
  aoMat.uniforms.uFrame.value=useTemporal?temporalFrame%64:0;
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
  ssrMat.uniforms.uTexel.value.set(1/w, 1/h);
  const world=camera.matrixWorld.elements;
  ssrMat.uniforms.uWorldY.value.set(world[1],world[5],world[9],world[13]);
  const floorY=i=>levels[i]?levels[i].elevation+levels[i].group.position.y+0.006:-10000;
  ssrMat.uniforms.uFloorY.value.set(floorY(0),floorY(1));
  ssrMat.uniforms.uUp.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
  draw(ssrMat, RTS.ssr);
  lensBlur(RTS.ssr, RTS.b1, RTS.ssr, half, 1.3);   // gloss, not a mirror

  }

  // Out of focus is its own chain. Reusing the bloom pyramid for it was the
  // obvious economy and quite wrong: that buffer holds the bright pass, so
  // everything soft came back milky with the windows smeared through it.
  lensBlur(RTS.scene, RTS.d1, RTS.d0, quarter, 0.75);

  // The meter reads the soft copy: it is small, and already free of the
  // single bright pixels that would otherwise twitch the exposure.
  let exposure=null;
  if(RTS.exp0){
    const a=adaptMat.uniforms;
    a.tSrc.value=RTS.d0.texture;
    a.tPrev.value=RTS['exp'+exposureIndex].texture;
    a.uIncident.value=incidentLight();
    if(cut||!exposureReady)a.uBlend.value.set(1,1);
    else a.uBlend.value.set(1-Math.exp(-dt/0.5),1-Math.exp(-dt/1.1));
    exposureIndex=1-exposureIndex;
    draw(adaptMat,RTS['exp'+exposureIndex]);
    exposure=RTS['exp'+exposureIndex].texture;exposureReady=true;
  }
  // The window pull is for the inside of the house; from the orbit it is all
  // outdoors, developed as one.
  const pull=view.mode==='walk'?WINDOW_PULL:1;
  for(const m of [brightMat,compMat]){
    m.uniforms.tExposure.value=exposure;
    m.uniforms.uAuto.value=exposure?1:0;
    m.uniforms.uFixed.value=fixedExposure();
    m.uniforms.uPull.value=pull;
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

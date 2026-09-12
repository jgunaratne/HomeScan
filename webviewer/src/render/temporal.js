// Camera-reprojected TAA for the static house. History is clipped to the
// current neighbourhood and rejected at disocclusions, cuts and layout edits.
export const TEMPORAL_FRAGMENT = `
#include <packing>
varying vec2 vUv;
uniform sampler2D tCurrent, tHistory, tDepth, tHistoryDepth;
uniform mat4 uCurrentInv, uPrevious;
uniform vec2 uTexel;
uniform float uValid, uNear, uFar;
float temporalDistance(float d){
  return 2.0*uNear*uFar/(uFar+uNear-(d*2.0-1.0)*(uFar-uNear));
}
void main(){
  vec3 current=texture2D(tCurrent,vUv).rgb;
  float depth=texture2D(tDepth,vUv).r;
  vec4 world=uCurrentInv*vec4(vUv*2.0-1.0,depth*2.0-1.0,1.0);
  vec4 previous=uPrevious*world;
  vec3 ndc=previous.xyz/previous.w;
  vec2 uv=ndc.xy*0.5+0.5;
  if(uValid<0.5 || depth>0.99999 || previous.w<=0.0 ||
     any(lessThan(uv,uTexel)) || any(greaterThan(uv,vec2(1.0)-uTexel)) || abs(ndc.z)>1.0){
    gl_FragColor=vec4(current,1.0);return;
  }
  float oldDepth=unpackRGBAToDepth(texture2D(tHistoryDepth,uv));
  float expected=temporalDistance(ndc.z*0.5+0.5);
  if(abs(temporalDistance(oldDepth)-expected)>max(0.025,expected*0.005)){
    gl_FragColor=vec4(current,1.0);return;
  }
  vec3 lo=current,hi=current,mean=vec3(0.0),square=vec3(0.0);
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec3 c=texture2D(tCurrent,vUv+vec2(float(x),float(y))*uTexel).rgb;
    lo=min(lo,c);hi=max(hi,c);mean+=c;square+=c*c;
  }
  mean/=9.0;
  vec3 sigma=sqrt(max(square/9.0-mean*mean,vec3(0.0)));
  lo=max(lo,mean-1.25*sigma);hi=min(hi,mean+1.25*sigma);
  vec3 history=clamp(texture2D(tHistory,uv).rgb,lo,hi);
  float motion=length((uv-vUv)/uTexel);
  float weight=mix(0.90,0.65,clamp(motion/12.0,0.0,1.0));
  gl_FragColor=vec4(mix(current,history,weight),1.0);
}`;

export const HISTORY_DEPTH_FRAGMENT = `
#include <packing>
varying vec2 vUv;
uniform sampler2D tDepth;
void main(){gl_FragColor=packDepthToRGBA(min(texture2D(tDepth,vUv).r,0.999999));}
`;

export function temporalJitter(frame){
  const radical=(n,base)=>{
    let f=1,value=0;
    while(n>0){f/=base;value+=f*(n%base);n=Math.floor(n/base);}
    return value-0.5;
  };
  const n=frame%8+1;
  return [radical(n,2),radical(n,3)];
}

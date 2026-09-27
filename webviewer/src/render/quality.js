// Auto reduces resolution/effects after sustained slow frames. Explicit
// choices remain fixed; tab suspension and startup stalls are not GPU samples.
// Occlusion is counted in horizon slices and steps along each (passes.js).
// `mirrors` is the most texels on a side a mirror's picture may have; none on
// Performance, where the panes keep their polished-metal fallback.
export const QUALITY_PRESETS = {
  high:{aoSlices:3,aoSteps:6,gi:12,steps:36,scale:1.5, temporal:true, bounce:true, reflections:true, mirrors:1024},
  balanced:{aoSlices:2,aoSteps:5,gi:6,steps:24,scale:1, temporal:true, bounce:true, reflections:true, mirrors:512},
  performance:{aoSlices:2,aoSteps:4,gi:0,steps:0,scale:0.75, temporal:false, bounce:false, reflections:false, mirrors:0},
};
export function qualityBudget(state,dt){
  if(state.mode!=='auto'||dt<=0||dt>2)return false;
  dt=Math.min(dt,0.1); // very slow GPUs still count; one stall cannot choose a tier
  state.elapsed+=dt;
  if(state.elapsed<4)return false;
  state.slow=dt>0.042?state.slow+dt:Math.max(0,state.slow-dt*0.5);
  if(state.slow<2.5||state.tier==='performance')return false;
  state.tier=state.tier==='high'?'balanced':'performance';
  state.slow=0;state.elapsed=0;
  return true;
}

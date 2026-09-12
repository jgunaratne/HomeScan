// Auto reduces resolution/effects after sustained slow frames. Explicit
// choices remain fixed; tab suspension and startup stalls are not GPU samples.
export const QUALITY_PRESETS = {
  high:{ao:24,gi:12,steps:36,scale:1.5, temporal:true, bounce:true, reflections:true},
  balanced:{ao:16,gi:6,steps:24,scale:1, temporal:true, bounce:true, reflections:true},
  performance:{ao:8,gi:0,steps:0,scale:0.75, temporal:false, bounce:false, reflections:false},
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

export const $ = id => document.getElementById(id);
export const clamp = (v,a,b) => v<a?a:v>b?b:v;
export const titleise = s => s === 'unidentified' ? 'Unnamed space'
  : s.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const quality=fs.readFileSync(`${__dirname}/../src/render/quality.js`,'utf8').replace(/^export /gm,'');
const temporal=fs.readFileSync(`${__dirname}/../src/render/temporal.js`,'utf8').replace(/^export /gm,'');
const {qualityBudget,temporalJitter}=vm.runInNewContext(`${quality}\n${temporal}\n;({qualityBudget,temporalJitter})`);
const fresh=()=>({mode:'auto',tier:'high',slow:0,elapsed:0});
test('auto degrades sustained slow rendering in two steps, never disables the lens',()=>{
 const s=fresh();for(let i=0;i<150;i++)qualityBudget(s,0.06);
 assert.equal(s.tier,'balanced');
 for(let i=0;i<150;i++)qualityBudget(s,0.06);
 assert.equal(s.tier,'performance');
});
test('startup, tab suspension and isolated hitches do not lower quality',()=>{
 const s=fresh();for(let i=0;i<600;i++)qualityBudget(s,i%60===0?1:1/60);
 assert.equal(s.tier,'high');
});
test('very slow GPUs still trigger automatic reduction',()=>{
 const s=fresh();for(let i=0;i<150;i++)qualityBudget(s,0.5);
 assert.equal(s.tier,'performance');
});
test('manual quality survives slow frames',()=>{
 const s={...fresh(),mode:'high'};for(let i=0;i<1000;i++)qualityBudget(s,0.1);
 assert.equal(s.tier,'high');
});
test('temporal samples cover distinct subpixel positions and repeat deterministically',()=>{
 const samples=Array.from({length:8},(_,i)=>temporalJitter(i));
 assert.equal(new Set(samples.map(s=>s.join(','))).size,8);
 assert.ok(samples.flat().every(v=>v>=-0.5&&v<=0.5));
 assert.deepEqual(temporalJitter(0),temporalJitter(8));
});

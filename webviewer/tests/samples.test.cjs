const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/photo/relight.js'),'utf8');
const start=source.indexOf('export function validSampleRect');
const valid=new Function(source.slice(start).replace('export ','')+';return validSampleRect;')();
test('reviewed photo crops must be finite and wholly inside the photo',()=>{
  for(const rect of [[0,0,1,1],[0.2,0.4,0.1,0.3]])assert.equal(valid(rect),true);
  for(const rect of [null,[],[0,0,0,1],[-0.1,0,1,1],[0.9,0,0.2,1],[0,0,1,Infinity],[0,NaN,1,1],['0',0,1,1]])assert.equal(valid(rect),false);
});
test('configured samples refer to a photograph belonging to their room',()=>{
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../photos.json'),'utf8'));
  for(const room of data.rooms)for(const sample of Object.values(room.finishes?.samples||{})){
    assert.equal(valid(sample.rect),true);
    assert.ok(room.photos.some(photo=>photo.file===sample.file));
  }
});

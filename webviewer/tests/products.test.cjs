const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/scene/products.js'),'utf8');
// The catalogue and the sizing rule are plain data and plain arithmetic; the
// makers below them need THREE, so only the top of the module is loaded.
const cut=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to)).replace(/^export /gm,'');
const {PRODUCTS,productDims,pickProduct}=new Function(
  cut('export const PRODUCTS','// A product is drawn')+cut('export function productDims','const M = name')
  +';return {PRODUCTS,productDims,pickProduct};')();

test('every product names one of the three retailers, a link and catalogue dimensions',()=>{
  const retailers=new Set(['Crate & Barrel','Room & Board','West Elm']);
  for(const [key,p] of Object.entries(PRODUCTS)){
    assert.ok(retailers.has(p.retailer),`${key}: ${p.retailer}`);
    assert.match(key,/^(crateandbarrel|roomandboard|westelm)\//,key);
    assert.match(p.url,/^https:\/\/www\.(crateandbarrel|roomandboard|westelm)\.com\//,key);
    assert.equal(p.dims.length,3,key);
    assert.ok(p.dims.every(v=>v>0.2&&v<3),`${key} is not furniture-sized: ${p.dims}`);
  }
});

test('a product takes its catalogue size on a box that agrees with it',()=>{
  const bed=PRODUCTS['roomandboard/hudson-bed-queen'];
  assert.deepEqual(productDims(bed,[1.66,0.96,2.40]),bed.dims,'a queen on a queen-sized box');
  const table=PRODUCTS['roomandboard/linden-table-72'];
  assert.deepEqual(productDims(table,[1.61,0.91,1.02]),table.dims,'a 72" table where a 63" one stood');
  const full=PRODUCTS['westelm/anton-bed-full'];
  assert.deepEqual(productDims(full,[1.28,1.65,2.07]),full.dims,'a tall headboard box still takes the bed');
});
test('a product is hung on a smaller box, and declines one nothing like it',()=>{
  const shelf=PRODUCTS['roomandboard/woodwind-bookcase'];
  assert.deepEqual(productDims(shelf,[0.47,0.96,0.32]),[0.47,0.96,0.32],'a 30" bookcase on a 19" box takes the box');
  const dresser=PRODUCTS['roomandboard/hudson-dresser'];
  assert.equal(productDims(dresser,[0.95,1.96,0.73]),null,'a dresser is not a wardrobe');
  const stand=PRODUCTS['roomandboard/hudson-nightstand'];
  assert.equal(productDims(stand,[1.00,1.61,0.45]),null,'a nightstand is not a tall cabinet');
});
test('a room may list candidates per category, and the first the box takes wins',()=>{
  const keys=['roomandboard/hudson-dresser','roomandboard/hudson-nightstand'];
  assert.equal(pickProduct(keys,[1.50,1.09,0.34])?.key,'roomandboard/hudson-dresser');
  assert.equal(pickProduct(keys,[0.69,0.78,0.46])?.key,'roomandboard/hudson-nightstand');
  assert.equal(pickProduct(keys,[0.95,1.96,0.73]),null);
  assert.equal(pickProduct('roomandboard/hudson-nightstand',[0.61,0.80,0.41])?.key,'roomandboard/hudson-nightstand','a bare string is a list of one');
  assert.equal(pickProduct(undefined,[1,1,1]),null);
});

test('every product photos.json asks for is in the catalogue',()=>{
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../photos.json'),'utf8'));
  let asked=0;
  for(const room of data.rooms){
    for(const keys of Object.values(room.furnishings||{}))
      for(const key of [].concat(keys)){assert.ok(PRODUCTS[key],`${room.name} asks for ${key}`);asked++;}
    for(const p of room.place||[])if(p.product){assert.ok(PRODUCTS[p.product],`${room.name} places ${p.product}`);asked++;}
  }
  assert.ok(asked>10);
});

// A maker named by the catalogue has to exist: a product whose maker is
// missing is silently drawn as the generic fitting instead, and that was
// how the living room lost its sofa, chair and console to an edit that
// sliced them out of MAKERS.
test('every product names a maker that exists',()=>{
  const makers=[...source.matchAll(/^  ([a-zA-Z]+)\(g, w, h, d/gm)].map(m=>m[1]);
  for(const [key,p] of Object.entries(PRODUCTS))
    assert.ok(makers.includes(p.make),`${key} wants maker ${p.make}, which is not defined`);
});

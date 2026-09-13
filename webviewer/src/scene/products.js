import { MAT } from './materials.js';
import { box, cushion, tube, cushionSeam } from './fittings.js';

// The furniture the renovation proposes, by retailer and product. None of these
// retailers publish 3D models, so nothing here is downloaded: each product is
// drawn parametrically in its own silhouette — track arms and a bench cushion
// for the Andes, loose back cushions on a plinth for the Gather, a flat oak
// panel headboard for the Hudson — at the retailer's catalogue dimensions,
// which is what `dims` records ([width, height, depth], metres). A product is
// drawn at its own size when the scan's box agrees with it and hung on the box
// when it does not; see `productDims`.
//
// These are representative drawings of named products, not the products.
export const PRODUCTS = {
  'westelm/andes-sofa-76': {
    retailer:'West Elm', name:'Andes Sofa (76")', dims:[1.93, 0.81, 1.02],
    url:'https://www.westelm.com/products/andes-sofa-h1844/',
    finish:'Performance Basketweave, Alabaster', make:'trackSofa', mats:{fabric:'ivory', leg:'black'}},
  'westelm/andes-sectional': {
    retailer:'West Elm', name:'Andes 2-Piece Chaise Sectional', dims:[2.26, 0.81, 1.60],
    url:'https://www.westelm.com/shop/furniture/upholstered-furniture-collection/andes-collection/',
    finish:'Performance Basketweave, Alabaster', make:'sectional', mats:{fabric:'oatmeal', leg:'black'}},
  'crateandbarrel/lounge-ii-sectional': {
    retailer:'Crate & Barrel', name:'Lounge II 2-Piece Sectional with Chaise', dims:[2.67, 0.84, 1.6],
    url:'https://www.crateandbarrel.com/search?query=lounge%20ii%20sectional',
    finish:'Taft, Cement', make:'sectional', mats:{fabric:'ivory', leg:'black'}},
  'crateandbarrel/gather-sofa-84': {
    retailer:'Crate & Barrel', name:'Gather Sofa (84")', dims:[2.13, 0.84, 0.94],
    url:'https://www.crateandbarrel.com/gather-sofa-77-99/f95805',
    finish:'Wells, Slate', make:'looseSofa', mats:{fabric:'slate', leg:'oak'}},
  'westelm/slope-leather-chair': {
    retailer:'West Elm', name:'Slope Leather Lounge Chair', dims:[0.71, 0.79, 0.76],
    url:'https://www.westelm.com/search/results.html?words=slope+leather+chair',
    finish:'Saddle Leather', make:'slopeLounge', mats:{fabric:'leather', leg:'black'}},
  'westelm/slope-dining-chair': {
    retailer:'West Elm', name:'Slope Upholstered Dining Chair', dims:[0.48, 0.79, 0.56],
    url:'https://www.westelm.com/search/results.html?words=slope+dining+chair',
    finish:'Performance Basketweave, Oatmeal, on oak legs', make:'slopeChair', mats:{fabric:'oatmeal', leg:'oak'}},
  'roomandboard/linden-table-72': {
    retailer:'Room & Board', name:'Linden Dining Table (72")', dims:[1.83, 0.74, 0.91],
    url:'https://www.roomandboard.com/search?query=linden%20table',
    finish:'White oak', make:'diningTable', mats:{top:'oak', leg:'oak'}},
  'roomandboard/linden-table-96': {
    retailer:'Room & Board', name:'Linden Dining Table (96")', dims:[2.44, 0.74, 1.02],
    url:'https://www.roomandboard.com/search?query=linden%20table',
    finish:'White oak', make:'diningTable', mats:{top:'oak', leg:'oak'}},
  'roomandboard/slim-end-table': {
    retailer:'Room & Board', name:'Slim End Table', dims:[0.51, 0.56, 0.51],
    url:'https://www.roomandboard.com/search?query=slim%20end%20table',
    finish:'Natural steel with white oak top', make:'endTable', mats:{top:'oak', leg:'black'}},
  'westelm/volume-side-table': {
    retailer:'West Elm', name:'Volume Round Side Table', dims:[0.51, 0.55, 0.51],
    url:'https://www.westelm.com/search/results.html?words=volume+round+side+table',
    finish:'White oak', make:'pedestalTable', mats:{top:'oak', leg:'oak'}},
  'roomandboard/hudson-bed-queen': {
    retailer:'Room & Board', name:'Hudson Bed, Queen', dims:[1.63, 0.91, 2.13],
    url:'https://www.roomandboard.com/search?query=hudson%20bed',
    finish:'White oak', make:'platformBed', mats:{frame:'oak'}},
  'westelm/anton-bed-full': {
    retailer:'West Elm', name:'Anton Solid Wood Bed, Full', dims:[1.42, 0.86, 1.98],
    url:'https://www.westelm.com/search/results.html?words=anton+bed',
    finish:'Natural oak', make:'platformBed', mats:{frame:'oakPale'}},
  'roomandboard/hudson-nightstand': {
    retailer:'Room & Board', name:'Hudson One-Drawer Nightstand', dims:[0.51, 0.61, 0.51],
    url:'https://www.roomandboard.com/search?query=hudson%20nightstand',
    finish:'White oak', make:'nightstand', mats:{frame:'oak'}},
  'roomandboard/hudson-dresser': {
    retailer:'Room & Board', name:'Hudson Six-Drawer Dresser', dims:[1.52, 0.86, 0.51],
    url:'https://www.roomandboard.com/search?query=hudson%20dresser',
    finish:'White oak', make:'dresser', mats:{frame:'oak'}},
  'roomandboard/copenhagen-media': {
    retailer:'Room & Board', name:'Copenhagen Media Cabinet (76")', dims:[1.93, 0.66, 0.51],
    url:'https://www.roomandboard.com/search?query=copenhagen%20media%20cabinet',
    finish:'White oak', make:'mediaCabinet', mats:{frame:'oak', base:'black'}},
  'westelm/anton-media-console': {
    retailer:'West Elm', name:'Anton Solid Wood Media Console (72")', dims:[1.83, 0.61, 0.46],
    url:'https://www.westelm.com/search/results.html?words=anton+media+console',
    finish:'Natural oak', make:'mediaCabinet', mats:{frame:'oakPale', base:'oakPale'}},
  'roomandboard/woodwind-bookcase': {
    retailer:'Room & Board', name:'Woodwind Bookcase (30w 48h)', dims:[0.76, 1.22, 0.43],
    url:'https://www.roomandboard.com/search?query=woodwind%20bookcase',
    finish:'White oak', make:'bookcase', mats:{frame:'oak'}},
  'roomandboard/metro-sofa-86': {
    retailer:'Room & Board', name:'Metro Sofa (86")', dims:[2.18, 0.81, 0.97],
    url:'https://www.roomandboard.com/search?query=metro%20sofa',
    finish:'Tepic, Ivory, on a natural steel base', make:'tightSofa', mats:{fabric:'ivory', leg:'black'}},
  'roomandboard/metro-sofa-98': {
    retailer:'Room & Board', name:'Metro Sofa (98")', dims:[2.49, 0.81, 0.97],
    url:'https://www.roomandboard.com/search?query=metro%20sofa',
    finish:'Tepic, Ivory, on a natural steel base', make:'tightSofa', mats:{fabric:'ivory', leg:'black'}},
  'crateandbarrel/lounge-ii-sofa-105': {
    retailer:'Crate & Barrel', name:'Lounge II Sofa (105")', dims:[2.67, 0.84, 1.04],
    url:'https://www.crateandbarrel.com/search?query=lounge%20ii%20105%20sofa',
    finish:'Taft, Cement', make:'deepSofa', mats:{fabric:'oatmeal', leg:'black'}},
  'crateandbarrel/cavett-leather-chair': {
    retailer:'Crate & Barrel', name:'Cavett Leather Chair', dims:[0.74, 0.76, 0.79],
    url:'https://www.crateandbarrel.com/search?query=cavett%20leather%20chair',
    finish:'Saddle leather on a walnut frame', make:'slingChair', mats:{fabric:'leather', leg:'walnut'}},
  'westelm/mid-century-media-console-80': {
    retailer:'West Elm', name:'Mid-Century Media Console (80")', dims:[2.03, 0.61, 0.46],
    url:'https://www.westelm.com/search/results.html?words=mid-century+media+console',
    finish:'Acorn walnut', make:'taperedConsole', mats:{frame:'walnut'}},
  'crateandbarrel/parsons-coffee-table': {
    retailer:'Crate & Barrel', name:'Parsons Coffee Table (48")', dims:[1.22, 0.41, 0.61],
    url:'https://www.crateandbarrel.com/search?query=parsons%20coffee%20table',
    finish:'White oak top on a black steel base', make:'coffeeTable', mats:{top:'oak', leg:'black'}},
  'roomandboard/woodwind-bookcase-72': {
    retailer:'Room & Board', name:'Woodwind Bookcase (36w 72h)', dims:[0.91, 1.83, 0.43],
    url:'https://www.roomandboard.com/search?query=woodwind%20bookcase',
    finish:'White oak', make:'bookcase', mats:{frame:'oak'}},
  'roomandboard/parsons-desk-60': {
    retailer:'Room & Board', name:'Parsons Desk (60")', dims:[1.52, 0.74, 0.76],
    url:'https://www.roomandboard.com/search?query=parsons%20desk',
    finish:'White oak top on a natural steel base', make:'desk', mats:{top:'oak', leg:'black'}},
  'roomandboard/parsons-desk-72': {
    retailer:'Room & Board', name:'Parsons Desk (72")', dims:[1.83, 0.74, 0.76],
    url:'https://www.roomandboard.com/search?query=parsons%20desk',
    finish:'White oak top on a natural steel base, with two 32" monitors', make:'workstation', mats:{top:'oak', leg:'black'}},
  'westelm/slope-office-chair': {
    retailer:'West Elm', name:'Slope Office Chair', dims:[0.6, 0.86, 0.6],
    url:'https://www.westelm.com/search/results.html?words=slope+office+chair',
    finish:'Saddle leather on a black base', make:'officeChair', mats:{fabric:'leather', leg:'black'}},
  'crateandbarrel/parsons-console': {
    retailer:'Crate & Barrel', name:'Parsons Console Table', dims:[1.22, 0.74, 0.41],
    url:'https://www.crateandbarrel.com/search?query=parsons%20console%20table',
    finish:'White oak top on a black steel base', make:'console', mats:{top:'oak', leg:'black'}},
};

// A product is drawn at its catalogue size when that fits the box the scan
// reported for the piece it replaces — within a third either way in plan, and
// a little more in height, since a bed's box is as tall as its headboard: a
// queen Hudson goes where a queen bed was measured, a 72" Linden where a 63"
// table stood. Where the box is smaller than that — a 30" bookcase asked to
// stand where a 19" one did — the product's proportions are hung on the
// scan's box instead, which is what the generic fittings already do with
// every box. And where the box is nothing like the product — a wardrobe twice
// the height of the dresser its room maps `storage` to — the product does not
// apply at all, and the generic fitting stands there; null says so.
export function productDims(product, scan){
  const p = product.dims, ratio = p.map((v, i) => v/scan[i]);
  const within = (r, lo, hi) => r >= lo && r <= hi;
  if (within(ratio[0], 0.6, 1.34) && within(ratio[1], 0.5, 1.4) && within(ratio[2], 0.6, 1.34)) return p.slice();
  if (ratio.every(r => within(r, 0.5, 1.8))) return scan.slice();
  return null;
}
// A room maps a category to one product or to a list of them, tried in order:
// the first the box will take is the one that stands there.
export function pickProduct(keys, scan){
  for (const key of [].concat(keys || [])){
    const dims = PRODUCTS[key] && productDims(PRODUCTS[key], scan);
    if (dims) return {key, dims};
  }
  return null;
}

const M = name => MAT[name] || MAT.oak;

// Slim legs under a piece, inset from its corners: square in oak, round in
// steel, which is how the two are made.
function legs(g, mat, w, h, d, y0, leg, inset, tall){
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    g.add(mat === MAT.black
      ? tube(mat, leg/2, tall, sx*(w/2 - inset), y0 + tall/2, sz*(d/2 - inset))
      : box(mat, leg, tall, leg, sx*(w/2 - inset), y0 + tall/2, sz*(d/2 - inset)));
}

// What makes a room read as lived in rather than furnished: a pillow leant
// into a corner, a throw over an arm, a lamp on the nightstand, books on the
// table. Each is a few centimetres of geometry and worth more than any amount
// of polish on the piece under it.
function pillow(g, mat, size, x, y, z, lean, turn){
  const p = cushion(mat, size, size, size*0.28, x, y, z);
  p.rotation.set(lean, turn, turn*0.6); g.add(p);
}
function throwOver(g, mat, armW, x, y, z, side){
  // Folded over the arm: a layer on top of it, a long flap down the outside
  // and a shorter one down the inside, all the length of the arm.
  g.add(cushion(mat, armW + 0.06, 0.035, 0.46, x, y + 0.017, z));
  g.add(cushion(mat, 0.03, 0.34, 0.44, x + side*(armW/2 + 0.03), y - 0.15, z));
  g.add(cushion(mat, 0.03, 0.2, 0.44, x - side*(armW/2 + 0.03), y - 0.08, z));
}
function lamp(g, x, y, z){
  g.add(tube(MAT.black, 0.06, 0.012, x, y + 0.006, z));
  g.add(tube(MAT.black, 0.007, 0.3, x, y + 0.16, z));
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.17, 24, 1, true), MAT.shade);
  shade.position.set(x, y + 0.38, z); g.add(shade);
  g.add(tube(MAT.lamp, 0.02, 0.03, x, y + 0.34, z));
}
function books(g, x, y, z, turn = 0.2){
  let top = y;
  for (const [mat, w, d, t] of [[MAT.slate, 0.24, 0.17, 0.028], [MAT.oatmeal, 0.21, 0.15, 0.022], [MAT.charcoal, 0.19, 0.14, 0.018]]){
    const b = box(mat, w, t, d, x, top + t/2, z); b.rotation.y = turn*(top - y)*30; g.add(b);
    top += t;
  }
}
function bowl(g, x, y, z, r = 0.14){
  // A turned profile with a real wall: outside up to the rim, then back down
  // the inside to a foot. A hemisphere with one face culled looked like a
  // hole in the table.
  const pts = [];
  for (let i=0;i<=8;i++){ const a = i/8*Math.PI/2; pts.push(new THREE.Vector2(r*0.25 + r*0.75*Math.sin(a), r*0.5*(1 - Math.cos(a)))); }
  for (let i=8;i>=0;i--){ const a = i/8*Math.PI/2; pts.push(new THREE.Vector2(Math.max(0.001, (r - 0.008)*0.25 + (r - 0.008)*0.75*Math.sin(a)), 0.012 + r*0.5*(1 - Math.cos(a)))); }
  pts.unshift(new THREE.Vector2(0.001, 0)); pts.push(new THREE.Vector2(0.001, 0.012));
  const b = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), MAT.porcelain);
  b.position.set(x, y, z); g.add(b);
}
function vase(g, x, y, z){
  g.add(tube(MAT.charcoal, 0.045, 0.26, x, y + 0.13, z));
  g.add(tube(MAT.charcoal, 0.02, 0.06, x, y + 0.29, z));
  const stem = tube(MAT.oak, 0.003, 0.5, x + 0.01, y + 0.5, z); stem.rotation.z = 0.12; g.add(stem);
}

export const MAKERS = {
  // West Elm Andes: a low box on slim legs, track arms, one bench seat cushion
  // and loose back cushions that sit a little proud of the arms.
  trackSofa(g, w, h, d, f, m){
    const y0 = -h/2, legH = 0.14, arm = 0.10, back = 0.20, frame = 0.08, seatTop = 0.44;
    const fabric = M(m.fabric);
    legs(g, M(m.leg), w, h, d, y0, 0.03, 0.06, legH);
    g.add(box(fabric, w, seatTop - legH - 0.12, d, 0, y0 + legH + (seatTop - legH - 0.12)/2, 0));
    // A continuous upholstered frame closes the rear beneath the loose cushions.
    g.add(box(fabric, w - arm*2, h - legH - 0.06, frame, 0, y0 + legH + (h - legH - 0.06)/2, -f*(d - frame)/2));
    g.add(cushion(fabric, w - arm*2, 0.13, d - back - frame - 0.02, 0, y0 + seatTop - 0.065, f*((back + frame)/2)));
    cushionSeam(g, w - arm*2 - 0.02, d - back - frame - 0.04, 0, y0 + seatTop + 0.0, f*((back + frame)/2), fabric);
    for (const s of [-1, 1])
      g.add(box(fabric, arm, h - legH - 0.14, d, s*(w - arm)/2, y0 + legH + (h - legH - 0.14)/2, 0));
    const n = Math.max(2, Math.round((w - arm*2)/0.75)), cw = (w - arm*2)/n;
    for (let i=0;i<n;i++){
      const x = -(w - arm*2)/2 + cw*(i + 0.5);
      const b = cushion(fabric, cw - 0.02, h - seatTop - 0.02, back, x, y0 + seatTop + (h - seatTop - 0.02)/2, -f*(d/2 - frame - back/2));
      b.rotation.x = -f*0.08; g.add(b);
    }
    pillow(g, MAT.oatmeal, 0.45, (w/2 - arm - 0.28), y0 + seatTop + 0.22, -f*(d - back)/2 + f*0.2, -f*0.16, 0.18);
    pillow(g, MAT.slate, 0.4, -(w/2 - arm - 0.26), y0 + seatTop + 0.2, -f*(d - back)/2 + f*0.2, -f*0.18, -0.22);
    throwOver(g, MAT.oatmeal, arm, -(w - arm)/2, y0 + h - 0.14, 0, -1);
  },
  // Crate & Barrel Gather: a plinth base, low square arms flush with the seat
  // back, and deep loose cushions front and back.
  looseSofa(g, w, h, d, f, m){
    const y0 = -h/2, legH = 0.06, arm = 0.14, back = 0.22, seatTop = 0.46;
    const fabric = M(m.fabric);
    legs(g, M(m.leg), w, h, d, y0, 0.05, 0.05, legH);
    g.add(box(fabric, w, seatTop - legH - 0.14, d, 0, y0 + legH + (seatTop - legH - 0.14)/2, 0));
    const n = Math.max(2, Math.round((w - arm*2)/0.85)), cw = (w - arm*2)/n;
    for (let i=0;i<n;i++){
      const x = -(w - arm*2)/2 + cw*(i + 0.5);
      g.add(cushion(fabric, cw - 0.02, 0.15, d - back - 0.03, x, y0 + seatTop - 0.07, f*back/2));
      cushionSeam(g, cw - 0.04, d - back - 0.05, x, y0 + seatTop + 0.005, f*back/2, fabric);
      const b = cushion(fabric, cw - 0.02, h - seatTop, back + 0.04, x, y0 + seatTop + (h - seatTop)/2, -f*(d - back)/2);
      b.rotation.x = -f*0.1; g.add(b);
    }
    for (const s of [-1, 1])
      g.add(box(fabric, arm, h - legH - 0.2, d, s*(w - arm)/2, y0 + legH + (h - legH - 0.2)/2, 0));
    pillow(g, MAT.ivory, 0.5, -(w/2 - arm - 0.3), y0 + seatTop + 0.25, -f*(d - back)/2 + f*0.22, -f*0.14, -0.15);
    pillow(g, MAT.oatmeal, 0.42, (w/2 - arm - 0.27), y0 + seatTop + 0.21, -f*(d - back)/2 + f*0.22, -f*0.16, 0.25);
    throwOver(g, MAT.ivory, arm, (w - arm)/2, y0 + h - 0.2, 0, 1);
  },
  // The Andes sectional: the sofa with a chaise on its right, the seat cushion
  // running out to the end of it. The box is deep because the chaise is.
  sectional(g, w, h, d, f, m){
    const fabric = M(m.fabric), y0 = -h/2, legH = 0.14, arm = 0.10, back = 0.20, seatTop = 0.44;
    const body = 0.95;                                    // the sofa's own depth
    const zBody = -f*(d - body)/2;                        // sofa along the back edge
    legs(g, M(m.leg), w, h, body, y0, 0.03, 0.06, legH);
    g.add(box(fabric, w, seatTop - legH - 0.12, body, 0, y0 + legH + (seatTop - legH - 0.12)/2, zBody));
    const chaiseW = Math.min(0.9, w*0.42);
    g.add(box(fabric, chaiseW, seatTop - legH - 0.12, d - body + 0.02, (w - chaiseW)/2 - arm, y0 + legH + (seatTop - legH - 0.12)/2, f*(body/2 - 0.01) + zBody));
    g.add(box(M(m.leg), 0.03, legH, 0.03, w/2 - arm - 0.06, y0 + legH/2, f*(d/2 - 0.06)));
    g.add(box(M(m.leg), 0.03, legH, 0.03, w/2 - arm - chaiseW + 0.06, y0 + legH/2, f*(d/2 - 0.06)));
    // Seat: one cushion over the sofa, one long one down the chaise.
    g.add(cushion(fabric, w - arm*2 - chaiseW, 0.13, body - back - 0.02, -(chaiseW)/2, y0 + seatTop - 0.065, zBody + f*back/2));
    g.add(cushion(fabric, chaiseW - 0.02, 0.13, d - back - 0.02, (w - chaiseW)/2 - arm, y0 + seatTop - 0.065, zBody + f*(back/2 + (d - body)/2)));
    for (const s of [-1, 1])
      g.add(box(fabric, arm, h - legH - 0.14, body, s*(w - arm)/2, y0 + legH + (h - legH - 0.14)/2, zBody));
    const n = Math.max(2, Math.round((w - arm*2)/0.75)), cw = (w - arm*2)/n;
    for (let i=0;i<n;i++){
      const x = -(w - arm*2)/2 + cw*(i + 0.5);
      const b = cushion(fabric, cw - 0.02, h - seatTop - 0.02, back, x, y0 + seatTop + (h - seatTop - 0.02)/2, zBody - f*(body - back)/2);
      b.rotation.x = -f*0.08; g.add(b);
    }
    pillow(g, MAT.slate, 0.45, -(w/2 - arm - 0.28), y0 + seatTop + 0.22, zBody - f*(body - back)/2 + f*0.2, -f*0.16, -0.2);
    throwOver(g, MAT.slate, arm, -(w - arm)/2, y0 + h - 0.14, zBody, -1);
  },
  // West Elm Slope: an upholstered shell — seat and a curved back in one — on
  // four splayed legs.
  slopeChair(g, w, h, d, f, m){
    const y0 = -h/2, seat = 0.46, fabric = M(m.fabric), leg = M(m.leg);
    g.add(cushion(fabric, w, 0.07, d, 0, y0 + seat - 0.035, 0));
    const b = cushion(fabric, w, h - seat, 0.06, 0, y0 + seat + (h - seat)/2 - 0.01, -f*(d/2 - 0.04));
    b.rotation.x = -f*0.14; g.add(b);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      const l = tube(leg, 0.014, seat - 0.05, sx*(w/2 - 0.05), y0 + (seat - 0.05)/2, sz*(d/2 - 0.06));
      l.rotation.z = -sx*0.08; l.rotation.x = sz*0.08; g.add(l);
    }
  },
  // The Slope lounge chair: the same shell, wider and lower, in leather on a
  // black frame.
  slopeLounge(g, w, h, d, f, m){
    const y0 = -h/2, seat = 0.40, fabric = M(m.fabric), leg = M(m.leg);
    g.add(cushion(fabric, w, 0.09, d, 0, y0 + seat - 0.045, 0));
    const b = cushion(fabric, w, h - seat + 0.02, 0.08, 0, y0 + seat + (h - seat)/2, -f*(d/2 - 0.05));
    b.rotation.x = -f*0.2; g.add(b);
    for (const s of [-1, 1]){
      g.add(box(fabric, 0.06, 0.18, d - 0.1, s*(w/2 - 0.03), y0 + seat + 0.07, 0));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      const l = tube(leg, 0.014, seat - 0.06, sx*(w/2 - 0.06), y0 + (seat - 0.06)/2, sz*(d/2 - 0.07));
      l.rotation.z = -sx*0.1; l.rotation.x = sz*0.1; g.add(l);
    }
  },
  // Room & Board Linden: a thick oak top, square legs flush with the corners.
  diningTable(g, w, h, d, f, m){
    const y0 = -h/2, t = 0.045, leg = 0.075;
    g.add(box(M(m.top), w, t, d, 0, y0 + h - t/2, 0));
    g.add(box(M(m.top), w - leg*2, 0.06, d - leg*2, 0, y0 + h - t - 0.03, 0));
    legs(g, M(m.leg), w, h, d, y0, leg, leg/2, h - t);
    bowl(g, 0, y0 + h, 0, 0.16);
  },
  // Room & Board Slim: a square steel frame with a floating oak top.
  endTable(g, w, h, d, f, m){
    const y0 = -h/2, r = 0.008, top = 0.03;
    g.add(box(M(m.top), w, top, d, 0, y0 + h - top/2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(tube(M(m.leg), r, h - top, sx*(w/2 - r), y0 + (h - top)/2, sz*(d/2 - r)));
    for (const s of [-1, 1]){
      g.add(tube(M(m.leg), r, w - r*2, 0, y0 + h - top - r, s*(d/2 - r), 'x'));
      g.add(tube(M(m.leg), r, d - r*2, s*(w/2 - r), y0 + h - top - r, 0, 'z'));
    }
    books(g, 0, y0 + h, 0);
  },
  // West Elm Volume: a round top on a fat cylindrical pedestal.
  pedestalTable(g, w, h, d, f, m){
    const y0 = -h/2, r = Math.min(w, d)/2;
    g.add(tube(M(m.top), r, 0.03, 0, y0 + h - 0.015, 0));
    g.add(tube(M(m.leg), r*0.42, h - 0.06, 0, y0 + (h - 0.06)/2 + 0.02, 0));
    g.add(tube(M(m.leg), r*0.7, 0.02, 0, y0 + 0.01, 0));
    bowl(g, 0, y0 + h, 0, r*0.5);
  },
  // Hudson and Anton beds: a low platform in solid oak, the mattress recessed
  // into a lipped frame, a flat panel headboard. Bedding in white with one
  // oatmeal throw folded across the foot.
  platformBed(g, w, h, d, f, m){
    const y0 = -h/2, head = -f, frame = M(m.frame), lip = 0.04, base = 0.30, matt = 0.22;
    g.add(box(frame, w, base, d, 0, y0 + base/2, 0));
    g.add(box(frame, w, 0.05, d, 0, y0 + base + 0.025, 0));
    g.add(box(MAT.cotton, w - lip*2, matt, d - lip - 0.02, 0, y0 + base + matt/2 + 0.02, -head*0.01));
    // The duvet: folded back a third of the way, its top rippled the way a
    // filled cover lies rather than a slab.
    const top = y0 + base + matt + 0.02;
    const duvet = cushion(MAT.cotton, w - lip*2 + 0.06, 0.07, d*0.62, 0, top + 0.035, -head*d*0.17);
    const dp = duvet.geometry.attributes.position, dn = duvet.geometry.attributes.normal;
    for (let i=0;i<dp.count;i++){
      if (dn.getY(i) < 0.5) continue;
      const x = dp.getX(i), z = dp.getZ(i), fade = Math.max(0, 1 - Math.abs(x)/(w*0.48));
      dp.setY(i, dp.getY(i) + Math.sin(x*14 + z*3)*0.012*fade + Math.sin(z*9)*0.006*fade);
    }
    duvet.geometry.computeVertexNormals(); g.add(duvet);
    g.add(cushion(MAT.cotton, w - lip*2 + 0.06, 0.05, 0.16, 0, top + 0.09, -head*d*0.17 + head*d*0.31));
    g.add(cushion(MAT.oatmeal, w*0.62, 0.05, 0.36, w*0.06, top + 0.075, -head*d*0.4));
    for (const s of [-1, 1]){
      g.add(cushion(MAT.cotton, w*0.36, 0.13, 0.3, s*w*0.21, top + 0.075, head*(d/2 - 0.24)));
      const euro = cushion(MAT.oatmeal, w*0.34, 0.36, 0.1, s*w*0.2, top + 0.2, head*(d/2 - 0.1));
      euro.rotation.x = head*0.22; g.add(euro);
    }
    // The headboard stands inside the box's back edge: the scan's box for a
    // bed ends at the wall, and a panel put past it is a panel in the wall.
    g.add(box(frame, w, h - 0.02, 0.04, 0, y0 + h/2, head*(d/2 - 0.02)));
    legs(g, frame, w, h, d, y0, 0.05, 0.08, 0.001);
  },
  // Hudson nightstand: an oak cube, one drawer with a recessed pull, an open
  // shelf below.
  nightstand(g, w, h, d, f, m){
    const y0 = -h/2, frame = M(m.frame), t = 0.02;
    g.add(box(frame, w, t, d, 0, y0 + h - t/2, 0));
    g.add(box(frame, w, t, d, 0, y0 + h*0.45, 0));
    g.add(box(frame, w, t, d, 0, y0 + 0.05 + t/2, 0));
    for (const s of [-1, 1]) g.add(box(frame, t, h - 0.05, d, s*(w - t)/2, y0 + 0.05 + (h - 0.05)/2, 0));
    g.add(box(frame, w - t*2, h - 0.05, t, 0, y0 + 0.05 + (h - 0.05)/2, -f*(d - t)/2));
    g.add(box(frame, w - t*2 - 0.006, h*0.55 - t - 0.006, 0.018, 0, y0 + h*0.45 + t/2 + (h*0.55 - t)/2, f*(d/2 - 0.005)));
    g.add(box(MAT.black, w*0.4, 0.012, 0.006, 0, y0 + h*0.7, f*(d/2 + 0.006)));
    legs(g, MAT.black, w, h, d, y0, 0.02, 0.03, 0.05);
    lamp(g, 0, y0 + h, 0);
  },
  // Hudson dresser: two columns of three drawers, each with a recessed pull.
  dresser(g, w, h, d, f, m){
    const y0 = -h/2, frame = M(m.frame), plinth = 0.06, gap = 0.008;
    g.add(box(frame, w, h - plinth, d, 0, y0 + plinth + (h - plinth)/2, 0));
    g.add(box(MAT.black, w - 0.06, plinth, d - 0.08, 0, y0 + plinth/2, 0));
    const cols = w > 1.0 ? 2 : 1, rows = 3, fw = (w - gap*(cols + 1))/cols, fh = (h - plinth - gap*(rows + 1))/rows;
    for (let c=0;c<cols;c++) for (let r=0;r<rows;r++){
      const x = -w/2 + gap*(c + 1) + fw*(c + 0.5), y = y0 + plinth + gap*(r + 1) + fh*(r + 0.5);
      g.add(box(frame, fw, fh, 0.018, x, y, f*(d/2 + 0.005)));
      g.add(box(MAT.black, fw*0.35, 0.012, 0.006, x, y + fh/2 - 0.03, f*(d/2 + 0.017)));
    }
  },
  // Copenhagen and Anton media cabinets: a long low oak box on a recessed base,
  // three slab doors, the top a single board.
  mediaCabinet(g, w, h, d, f, m){
    const y0 = -h/2, frame = M(m.frame), plinth = 0.07, gap = 0.008;
    g.add(box(frame, w, h - plinth, d, 0, y0 + plinth + (h - plinth)/2, 0));
    g.add(box(M(m.base), w - 0.1, plinth, d - 0.1, 0, y0 + plinth/2, 0));
    const n = Math.max(2, Math.round(w/0.6)), fw = (w - gap*(n + 1))/n;
    for (let i=0;i<n;i++){
      const x = -w/2 + gap*(i + 1) + fw*(i + 0.5);
      g.add(box(frame, fw, h - plinth - gap*2, 0.018, x, y0 + plinth + (h - plinth)/2, f*(d/2 + 0.005)));
    }
  },
  // Woodwind: an open oak frame with adjustable shelves and no back — a few
  // books and a bowl on it, or it reads as a ladder.
  bookcase(g, w, h, d, f, m){
    const y0 = -h/2, frame = M(m.frame), t = 0.022;
    for (const s of [-1, 1]) g.add(box(frame, t, h, d, s*(w - t)/2, 0, 0));
    const n = Math.max(2, Math.round(h/0.34));
    for (let i=0;i<=n;i++) g.add(box(frame, w - t*2, t, d, 0, y0 + 0.03 + (h - 0.06)*i/n, 0));
    g.add(box(frame, w - t*2, h - 0.06, 0.01, 0, 0, -f*(d/2 - 0.005)));
    // Books on every shelf but the bottom, each shelf its own run of spines
    // in its own order, leaning where a run ends short; a bowl and a plant
    // where a shelf is left half empty.
    const spines = [[MAT.slate, 0.16], [MAT.oatmeal, 0.12], [MAT.charcoal, 0.2], [MAT.leather, 0.1],
                    [MAT.ivory, 0.14], [MAT.walnut, 0.09], [MAT.slate, 0.11], [MAT.charcoal, 0.15]];
    for (let i=1;i<=n;i++){
      const shelf = y0 + 0.03 + (h - 0.06)*(i - 1)/n + t/2;
      const fill = 0.45 + 0.4*((i*7)%3)/2, start = (i%2) ? -w/2 + t + 0.03 : w/2 - t - 0.03;
      let x = start;
      for (let k=0;k<spines.length;k++){
        const [mat, bw] = spines[(k + i*3)%spines.length], dir = (i%2) ? 1 : -1;
        if (Math.abs(x - start) + bw > (w - t*2 - 0.06)*fill) break;
        const bh = 0.2 + (bw*0.6) + 0.03*((k + i)%3);
        g.add(box(mat, bw, bh, 0.17 + 0.02*(k%2), x + dir*bw/2, shelf + bh/2, 0.02*((k+i)%2)));
        x += dir*(bw + 0.008);
      }
      if (fill < 0.6){
        const cx = -start*0.5;
        if (i%3 === 1) bowl(g, cx, shelf, 0, 0.08);
        else g.add(tube(MAT.charcoal, 0.05, 0.12, cx, shelf + 0.06, 0));
      }
    }
  },
  // Room & Board Metro: a boxy, low sofa with a tight back and slim track
  // arms, two seat cushions, on a thin steel base — the plainest of the three.
  tightSofa(g, w, h, d, f, m){
    const y0 = -h/2, legH = 0.12, arm = 0.09, back = 0.16, seatTop = 0.43;
    const fabric = M(m.fabric);
    legs(g, M(m.leg), w, h, d, y0, 0.025, 0.05, legH);
    g.add(box(fabric, w, seatTop - legH - 0.11, d, 0, y0 + legH + (seatTop - legH - 0.11)/2, 0));
    const inner = w - arm*2;
    for (const s of [-1, 1]){
      g.add(cushion(fabric, inner/2 - 0.015, 0.12, d - back - 0.03, s*inner/4, y0 + seatTop - 0.06, f*back/2));
      cushionSeam(g, inner/2 - 0.03, d - back - 0.05, s*inner/4, y0 + seatTop + 0.003, f*back/2, fabric);
      g.add(box(fabric, arm, h - legH - 0.1, d, s*(w - arm)/2, y0 + legH + (h - legH - 0.1)/2, 0));
    }
    g.add(cushion(fabric, inner, h - seatTop + 0.06, back, 0, y0 + seatTop - 0.06 + (h - seatTop + 0.06)/2, -f*(d - back)/2));
    pillow(g, MAT.slate, 0.45, (inner/2 - 0.27), y0 + seatTop + 0.22, -f*(d - back)/2 + f*0.19, -f*0.15, 0.2);
    pillow(g, MAT.oatmeal, 0.45, -(inner/2 - 0.27), y0 + seatTop + 0.22, -f*(d - back)/2 + f*0.19, -f*0.15, -0.2);
    throwOver(g, MAT.charcoal, arm, (w - arm)/2, y0 + h - 0.12, 0, 1);
  },
  // Crate & Barrel Lounge II: deep and low, a plinth base with the arms
  // barely above the seat, two thick seat cushions and two fat loose back
  // cushions that lean, stuffed rather than tailored — the sofa you sink into.
  deepSofa(g, w, h, d, f, m){
    const y0 = -h/2, plinth = 0.05, arm = 0.2, back = 0.28, seatTop = 0.45;
    const fabric = M(m.fabric);
    g.add(box(MAT.black, w - 0.06, plinth, d - 0.08, 0, y0 + plinth/2, 0));
    g.add(box(fabric, w, seatTop - plinth - 0.17, d, 0, y0 + plinth + (seatTop - plinth - 0.17)/2, 0));
    // The upholstered back frame, full width and full height, that the loose
    // cushions lean on — without it the sofa was open at the back.
    const frame = 0.12;
    g.add(box(fabric, w, h - plinth - 0.01, frame, 0, y0 + plinth + (h - plinth - 0.01)/2, -f*(d - frame)/2));
    const inner = w - arm*2;
    for (const s of [-1, 1]){
      const seat = cushion(fabric, inner/2 - 0.015, 0.18, d - back - frame - 0.03, s*inner/4, y0 + seatTop - 0.08, f*((back + frame)/2 - 0.01));
      g.add(seat);
      cushionSeam(g, inner/2 - 0.04, d - back - frame - 0.06, s*inner/4, y0 + seatTop + 0.012, f*((back + frame)/2 - 0.01), fabric);
      const b = cushion(fabric, inner/2 - 0.03, h - seatTop + 0.06, back, s*inner/4, y0 + seatTop - 0.02 + (h - seatTop + 0.06)/2, -f*(d/2 - frame - back/2));
      b.rotation.x = -f*0.12; g.add(b);
      g.add(box(fabric, arm, seatTop + 0.1 - plinth, d, s*(w - arm)/2, y0 + plinth + (seatTop + 0.1 - plinth)/2, 0));
    }
    pillow(g, MAT.ivory, 0.5, -(inner/2 - 0.3), y0 + seatTop + 0.26, -f*(d - back)/2 + f*0.24, -f*0.16, -0.18);
    pillow(g, MAT.slate, 0.45, (inner/2 - 0.28), y0 + seatTop + 0.24, -f*(d - back)/2 + f*0.24, -f*0.16, 0.2);
    pillow(g, MAT.charcoal, 0.4, (inner/2 - 0.62), y0 + seatTop + 0.21, -f*(d - back)/2 + f*0.28, -f*0.18, 0.1);
    throwOver(g, MAT.ivory, arm, -(w - arm)/2, y0 + seatTop + 0.1, 0, -1);
  },
  // Crate & Barrel Cavett: a leather sling — seat and back one curved
  // sheet — hung between two walnut side frames.
  slingChair(g, w, h, d, f, m){
    const y0 = -h/2, leather = M(m.fabric), frame = M(m.leg), seat = 0.40;
    for (const s of [-1, 1]){
      const x = s*(w/2 - 0.02);
      g.add(box(frame, 0.035, seat + 0.2, 0.05, x, y0 + (seat + 0.2)/2, f*(d/2 - 0.06)));
      const rear = box(frame, 0.035, h - 0.02, 0.05, x, y0 + (h - 0.02)/2, -f*(d/2 - 0.1));
      rear.rotation.x = f*0.2; g.add(rear);
      g.add(box(frame, 0.035, 0.05, d - 0.1, x, y0 + seat + 0.18, 0));
    }
    g.add(box(frame, w - 0.07, 0.04, 0.04, 0, y0 + seat - 0.04, f*(d/2 - 0.06)));
    g.add(box(frame, w - 0.07, 0.04, 0.04, 0, y0 + seat - 0.04, -f*(d/2 - 0.12)));
    g.add(cushion(leather, w - 0.09, 0.07, d - 0.16, 0, y0 + seat, f*0.02));
    const back = cushion(leather, w - 0.09, h - seat - 0.02, 0.06, 0, y0 + seat + (h - seat)/2, -f*(d/2 - 0.12));
    back.rotation.x = f*0.24; g.add(back);
  },
  // West Elm Mid-Century console: a walnut case on splayed tapered legs, two
  // sliding doors between two drawers.
  taperedConsole(g, w, h, d, f, m){
    const y0 = -h/2, frame = M(m.frame), legH = 0.14, gap = 0.008;
    g.add(box(frame, w, h - legH, d, 0, y0 + legH + (h - legH)/2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      const leg = tube(frame, 0.016, legH + 0.02, sx*(w/2 - 0.08), y0 + legH/2, sz*(d/2 - 0.08));
      leg.rotation.z = -sx*0.1; leg.rotation.x = sz*0.1; g.add(leg);
    }
    const drawerW = w*0.22, doorW = (w - drawerW*2 - gap*4)/2, ch = h - legH - gap*2;
    for (const s of [-1, 1]){
      const x = s*(w/2 - gap - drawerW/2);
      g.add(box(frame, drawerW, ch/2 - gap, 0.018, x, y0 + legH + ch*0.75, f*(d/2 + 0.005)));
      g.add(box(frame, drawerW, ch/2 - gap, 0.018, x, y0 + legH + ch*0.25, f*(d/2 + 0.005)));
      g.add(box(frame, doorW, ch, 0.018, s*(doorW/2 + gap), y0 + legH + ch/2 + gap, f*(d/2 + (s > 0 ? 0.005 : 0.02))));
      g.add(box(MAT.black, 0.012, ch*0.5, 0.008, s*(doorW/2 + gap) + s*(doorW/2 - 0.03), y0 + legH + ch/2 + gap, f*(d/2 + (s > 0 ? 0.018 : 0.033))));
    }
    bowl(g, -w*0.28, y0 + h, 0, 0.12);
    books(g, w*0.3, y0 + h, 0, 0.1);
  },
  // Parsons coffee table: the console's frame, lower and deeper, with a tray
  // of things on it.
  coffeeTable(g, w, h, d, f, m){
    const y0 = -h/2, top = 0.03;
    g.add(box(M(m.top), w, top, d, 0, y0 + h - top/2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(M(m.leg), 0.025, h - top, 0.025, sx*(w/2 - 0.0125), y0 + (h - top)/2, sz*(d/2 - 0.0125)));
    for (const s of [-1, 1]) g.add(box(M(m.leg), w, 0.025, 0.025, 0, y0 + h - top - 0.0125, s*(d/2 - 0.0125)));
    g.add(box(MAT.black, 0.42, 0.012, 0.3, -w*0.22, y0 + h + 0.006, 0));
    books(g, -w*0.22, y0 + h + 0.012, 0, 0.15);
    bowl(g, w*0.25, y0 + h, 0, 0.11);
  },
  // Parsons desk: the same frame at desk height, with a laptop open on it, a
  // lamp at one end and a pot of pens.
  desk(g, w, h, d, f, m){
    const y0 = -h/2, top = 0.03;
    g.add(box(M(m.top), w, top, d, 0, y0 + h - top/2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(M(m.leg), 0.025, h - top, 0.025, sx*(w/2 - 0.0125), y0 + (h - top)/2, sz*(d/2 - 0.0125)));
    for (const s of [-1, 1]) g.add(box(M(m.leg), w, 0.025, 0.025, 0, y0 + h - top - 0.0125, s*(d/2 - 0.0125)));
    g.add(box(MAT.inox, 0.31, 0.012, 0.22, 0, y0 + h + 0.006, f*0.02));
    const lid = box(MAT.inox, 0.31, 0.21, 0.006, 0, y0 + h + 0.115, -f*0.10); lid.rotation.x = f*0.25; g.add(lid);
    const screen = box(MAT.screen, 0.29, 0.19, 0.002, 0, y0 + h + 0.115, -f*0.096); screen.rotation.x = f*0.25; g.add(screen);
    lamp(g, -w*0.38, y0 + h, -f*d*0.2);
    g.add(tube(MAT.charcoal, 0.04, 0.1, w*0.33, y0 + h + 0.05, -f*d*0.15));
  },
  // The Parsons desk as a workstation: two 32" monitors side by side on slim
  // stands, angled a little toward the chair, a keyboard and mouse in front,
  // the lamp at the far end.
  workstation(g, w, h, d, f, m){
    const y0 = -h/2, top = 0.03;
    g.add(box(M(m.top), w, top, d, 0, y0 + h - top/2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(M(m.leg), 0.025, h - top, 0.025, sx*(w/2 - 0.0125), y0 + (h - top)/2, sz*(d/2 - 0.0125)));
    for (const s of [-1, 1]) g.add(box(M(m.leg), w, 0.025, 0.025, 0, y0 + h - top - 0.0125, s*(d/2 - 0.0125)));
    const mw = 0.71, mh = 0.41, deskTop = y0 + h;
    for (const s of [-1, 1]){
      const mon = new THREE.Group();
      mon.position.set(s*(mw/2 + 0.01), deskTop, -f*(d/2 - 0.16)); mon.rotation.y = -s*f*0.12;
      mon.add(box(MAT.black, 0.22, 0.012, 0.18, 0, 0.006, 0));
      mon.add(box(MAT.black, 0.04, 0.16, 0.02, 0, 0.09, 0));
      mon.add(box(MAT.black, mw, mh, 0.03, 0, 0.14 + mh/2, 0.02));
      mon.add(box(MAT.screen, mw - 0.02, mh - 0.02, 0.004, 0, 0.14 + mh/2, f*0.037));
      g.add(mon);
    }
    g.add(box(MAT.black, 0.36, 0.012, 0.13, -0.05, deskTop + 0.006, f*0.12));
    g.add(cushion(MAT.black, 0.06, 0.03, 0.1, 0.28, deskTop + 0.015, f*0.12));
    lamp(g, w*0.42, deskTop, -f*d*0.22);
  },
  // West Elm Slope office chair: the Slope shell on a five-star base with
  // casters, a gas lift between.
  officeChair(g, w, h, d, f, m){
    const y0 = -h/2, seat = 0.46, fabric = M(m.fabric), leg = M(m.leg);
    g.add(cushion(fabric, w, 0.07, d, 0, y0 + seat - 0.035, 0));
    const b = cushion(fabric, w, h - seat, 0.06, 0, y0 + seat + (h - seat)/2 - 0.01, -f*(d/2 - 0.04));
    b.rotation.x = -f*0.14; g.add(b);
    g.add(tube(leg, 0.02, seat - 0.12, 0, y0 + 0.06 + (seat - 0.12)/2, 0));
    for (let i=0;i<5;i++){
      const a = i*Math.PI*2/5, arm = tube(leg, 0.012, 0.3, Math.sin(a)*0.15, y0 + 0.05, Math.cos(a)*0.15);
      arm.rotation.z = Math.PI/2; arm.rotation.y = -a + Math.PI/2; g.add(arm);
      g.add(tube(leg, 0.025, 0.02, Math.sin(a)*0.29, y0 + 0.025, Math.cos(a)*0.29, 'x'));
    }
  },
  // Parsons: an oak slab on a black steel frame, open below.
  console(g, w, h, d, f, m){
    const y0 = -h/2, top = 0.03;
    g.add(box(M(m.top), w, top, d, 0, y0 + h - top/2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(box(M(m.leg), 0.025, h - top, 0.025, sx*(w/2 - 0.0125), y0 + (h - top)/2, sz*(d/2 - 0.0125)));
    for (const s of [-1, 1]) g.add(box(M(m.leg), w, 0.025, 0.025, 0, y0 + h - top - 0.0125, s*(d/2 - 0.0125)));
    vase(g, -w*0.3, y0 + h, 0);
    books(g, w*0.2, y0 + h, 0);
  },
};

// Build one product in a box `dims` wide, high and deep, facing `f`.
export function product(key, dims, f, mats = {}){
  const p = PRODUCTS[key];
  if (!p || !MAKERS[p.make]) return null;
  const g = new THREE.Group();
  MAKERS[p.make](g, dims[0], dims[1], dims[2], f, {...p.mats, ...mats});
  g.name = `${p.retailer} ${p.name}`;
  return g;
}

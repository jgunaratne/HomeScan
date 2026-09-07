// Every value the app mutates as you use it, in one place and grouped by what
// owns it. They are objects rather than loose `let`s because a module cannot
// assign to a binding it imported: the field is the seam between modules.
import { EYE } from './constants.js';

export const player = {x:0, z:0, yaw:0, pitch:0, level:0, vx:0, vz:0};

// Where the player is trying to get to, and the last place they legitimately
// stood — the fallback when a step lands off the floor.
export const nav = {goTarget:null, hover:null, stuckT:0, lastGood:{x:0, z:0}};

export const view = {mode:'view', explode:0};                 // 'view' | 'walk'
export const orbit = {theta:0.72, phi:0.95, dist:26, tx:0, ty:2.4, tz:0};

// What the house is showing: photographic surfaces or the flat survey, the
// prints, the furniture, walls you can pass through, and how high the eye sits.
export const flags = {surfaced:true, showPrints:false, showFurniture:true,
                      ghost:false, eyeH:EYE};

// Pointer and touch. lockLook is pointer-locked FPS look, off by default;
// stick and look are the two halves of the touch screen.
export const pointer = {drag:null, press:null, lockLook:false, stick:null, look:null};
export const keys = Object.create(null);

// The photograph under the cursor, the one open full-size over everything, and
// whether the Nano Banana panel is up — each of the three owns the keyboard
// while it is, so the frame and the input both have to be able to ask.
export const focus = {hoverShot:null, lbShot:null, enhancing:false};

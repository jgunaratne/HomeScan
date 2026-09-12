import { initGraphics } from './render/passes.js';
import { indexPhotos } from './photo/rooms.js';
import { markSealed } from './player/collision.js';
import { dressHouse } from './photo/dress.js';
import { initLightbox } from './ui/lightbox.js';
import { initEnhance } from './ui/enhance.js';
import { initControls, syncCursor } from './ui/modes.js';
import { initInput } from './player/input.js';
import { paintMeta } from './ui/hud.js';
import { spawnOn } from './player/movement.js';
import { startLoop, frameHouse } from './render/loop.js';

// Entry point: the order the house comes up in.
//
// Everything below is a function call rather than a module side effect, so this
// file is the whole boot sequence — nothing happens because of where a file
// happens to sit in the bundle.

indexPhotos();          // group the photographs by room
markSealed();           // find floor the scan enclosed with no way in
dressHouse();           // decode the pictures, then dress the house (async)

initLightbox();
initEnhance();
initControls();
initGraphics();
initInput();

frameHouse();           // stand the overview camera back far enough to see it
paintMeta();
spawnOn(0);
syncCursor();
startLoop();

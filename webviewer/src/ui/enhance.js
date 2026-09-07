import { $ } from '../core/util.js';
import { player, view, focus } from '../core/state.js';
import { canvas } from '../scene/stage.js';
import { ring } from '../player/pointing.js';
import { renderFrame } from '../render/passes.js';
import { whereAmI } from './hud.js';
import { syncCursor } from './modes.js';

// Nano Banana: hand the frame just drawn to Gemini's image model and get a
// photograph of the same room back. The scan is sketch-grade geometry with
// paint lifted off photographs — convincing as a survey, never as a picture —
// and this is the one place the viewer stops pretending otherwise.
//
// The photograph fills the screen at the size the walkthrough runs at, and N
// flips between the two. That is the whole point: the same room, the same
// camera, one of them measured and one of them imagined, and nothing in the
// way of putting them side by side in time rather than side by side in space.
//
// The key lives in the server's .env and never reaches the page, so the whole
// exchange is one POST to serve.mjs. A viewer opened straight off disk has no
// server behind it; that is a message in the bar, not a broken button.

// What the model is actually asked for. The first draft of this led with what
// had to be preserved — "keep the camera, keep the geometry" — and the model
// obliged by handing the render straight back with the bricks slightly redrawn.
// The instruction has to lead with the change and fence the geometry after it.
const BRIEF = [
  'This is an untextured 3D model render of a real room. Reproduce it as a photorealistic',
  'interior photograph of the same room, shot from the same camera position on a full-frame',
  'camera with a 24mm lens.',
  '',
  'Keep every wall, window, doorway, stair and piece of furniture exactly where it is and the',
  'same size. The plan of the room must not change, and nothing new may be added to it.',
  '',
  'Change everything else. Give every surface a real material: plank joints and grain in the',
  'floor, painted drywall with the faint texture of a roller, irregular brick with weathered',
  'mortar, fabric weave and creases in upholstery, real glass in the windows. Light it with',
  'true daylight coming through the windows, with soft falloff across the walls, bounced light',
  'on the ceiling, and contact shadows under everything that touches the floor. Add the small',
  'honest details a photograph has and a render does not: crisp skirting reveals, faint',
  'reflections, slight vignetting, fine sensor grain.',
  '',
  'No text, labels or watermarks.',
].join(' ');

// Gemini sees pixels, not metres. Its input is resampled to about a megapixel
// anyway, so a retina drawing buffer costs upload time and buys nothing.
const MAX_EDGE = 1536;

// `shot` is the photograph, `at` is where the camera stood when it was taken.
let shot = null, at = null, open = false, busy = false;

function say(text, kind = ''){
  const el = $('nb-status');
  el.textContent = text;
  el.className = 'nb-status' + (kind ? ' is-' + kind : '');
}

// The drawing buffer is only readable inside the task that drew it — this
// renderer has no preserveDrawingBuffer — so the render and the read have to
// happen without yielding in between.
function grabFrame(){
  const wasRing = ring.visible;
  ring.visible = false;                     // the floor marker is UI, not room
  renderFrame();
  const scale = Math.min(1, MAX_EDGE / Math.max(canvas.width, canvas.height));
  const frame = document.createElement('canvas');
  frame.width = Math.max(1, Math.round(canvas.width * scale));
  frame.height = Math.max(1, Math.round(canvas.height * scale));
  frame.getContext('2d').drawImage(canvas, 0, 0, frame.width, frame.height);
  ring.visible = wasRing;
  at = {mode: view.mode, level: player.level, x: player.x, z: player.z,
        yaw: player.yaw, pitch: player.pitch,
        room: view.mode === 'walk' ? whereAmI() : 'Section view'};
  return frame.toDataURL('image/jpeg', 0.92);
}

// Whether the photograph is still of what you are looking at. The section view
// turns on its own, so there it is never anything but stale and saying so would
// be noise; in walk mode it is the difference between a comparison and a pair
// of unrelated pictures.
function stale(){
  if (!at || at.mode !== view.mode) return !!at;
  if (view.mode !== 'walk') return false;
  return at.level !== player.level
    || Math.hypot(at.x - player.x, at.z - player.z) > 0.25
    || Math.abs(at.yaw - player.yaw) > 0.05 || Math.abs(at.pitch - player.pitch) > 0.05;
}

// Three states: the photograph over everything, the live view with a chip to
// get back, and gone. `focus.enhancing` is the first of them — the keyboard
// belongs to the walkthrough again the moment the photograph is out of the way.
function paint(){
  const over = open && !!shot && focus.enhancing;
  $('nb').hidden = !(open && (over || busy));
  $('nb-img').hidden = !over;
  $('nb-chip').hidden = !(open && shot && !over);
  $('nb-bar').hidden = !(open && (over || busy));
  $('nb-spin').hidden = !busy;
  $('nb-run').disabled = busy;
  $('nb-toggle').disabled = !shot;
  $('nb-save').hidden = !shot;
  $('nb-where').textContent = at ? at.room : '';
  $('nb-stale').hidden = !(over && stale());
  if (shot){
    $('nb-img').src = shot;
    $('nb-save').href = shot;
    // Which of PNG or JPEG comes back is the model's choice, and a file saved
    // under the wrong extension is one the desktop opens with the wrong thing.
    $('nb-save').download = 'storeywalk-photograph.'
      + (shot.startsWith('data:image/png') ? 'png' : 'jpg');
  }
  syncCursor();
}

function show(photograph){
  focus.enhancing = !!photograph;
  if (photograph) document.exitPointerLock?.();
  paint();
}

export function closeEnhance(){
  open = false;
  focus.enhancing = false;
  shot = null; at = null;
  $('nb-img').removeAttribute('src');
  say('');
  paint();
}

async function render(){
  if (busy) return;
  const original = grabFrame();
  const extra = $('nb-prompt').value.trim();
  open = true; busy = true;
  show(!!shot);                 // a re-render leaves the previous one on screen
  say('Rendering — this takes a few seconds.', 'busy');
  let trouble = '';
  try {
    const res = await fetch('api/nano-banana', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        image: original,
        prompt: BRIEF + (at.mode === 'walk'
          ? ` The room is the ${at.room.toLowerCase()}.`
          : ' The subject is a cutaway architectural model of a whole house with its roof off,'
            + ' seen from above and standing on open ground: photograph it as a model, not as'
            + ' a room you are standing in.')
          + (extra ? ` ${extra}` : ''),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
    shot = data.image;
  } catch (err) {
    // fetch only rejects when there was nobody to answer: opened off disk, or
    // served by something that is not serve.mjs.
    trouble = err instanceof TypeError
      ? 'Nano Banana needs the local server. Run npm start, with GEMINI_API_KEY in .env.'
      : err.message;
  }
  busy = false;
  if (!open) return;            // closed while the post was still out
  if (trouble){
    say(trouble, 'bad');
    if (!shot) open = false;    // nothing to show and nothing to go back to
    paint();
    return;
  }
  say('');
  show(true);
}

// The N key and the button both land here: flip if there is something to flip
// to, and otherwise go and get one.
export function toggleEnhance(){
  if (busy) return;
  if (shot) show(!focus.enhancing);
  else render();
}

export function initEnhance(){
  for (const id of ['nbbtn', 'nbbtn2', 'nb-toggle', 'nb-chip']) $(id).onclick = toggleEnhance;
  $('nb-img').onclick = () => show(false);
  $('nb-x').onclick = closeEnhance;
  $('nb-run').onclick = render;
  // Enter sends it; the field still takes a newline on Shift, like a message box.
  $('nb-prompt').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); render(); }
  });
}

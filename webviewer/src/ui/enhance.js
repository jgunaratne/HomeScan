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

// What the model is actually asked for, and the whole feature. Three drafts:
//
//  1. Lead with what to preserve — "keep the camera, keep the geometry, add
//     nothing" — and gemini-2.5-flash hands the render straight back with the
//     bricks redrawn. Faithful, and not a photograph.
//  2. Lead with the change — "change everything else" — and you get a
//     photograph of a room that is not this one: a plain bench comes back as an
//     upholstered armchair, plain boards as herringbone parquet, painted walls
//     with a course of brick through them.
//  3. Lead with the change, then spend most of the brief fencing it. Name what
//     must survive, list what may not be added, and say the two images have to
//     lie on top of each other. That is this.
//
// Measured against the frame it was given, on edge-map correlation over three
// runs each, (3) holds 0.695 against (2)'s 0.657 and has a much better worst
// case. Temperature was tried at 0.1, 0.2 and 0.4 and moved nothing outside the
// ±0.03 a repeat run moves on its own, so it is not set: it would be a
// superstition in the request. The prompt is the only lever that worked.
const brief = walking => [
  walking
    ? 'Re-photograph this image. It is a 3D model of a real room, and the result must be the'
      + ' same image — the same room, the same view — photographed instead of rendered. It is'
      + ' not a new picture of a similar room.'
    : 'Re-photograph this image. It is a 3D cutaway model of a real house with its roof off,'
      + ' standing on open ground and seen from above, and the result must be the same image —'
      + ' the same model, the same view — photographed instead of rendered. It is a photograph'
      + ' of this model, not a new picture of a similar house.',
  '',
  'Everything below must come out of this unchanged, matching the input pixel for pixel:',
  '- the camera position, angle and field of view, and the framing at the edges',
  '- the position, size and outline of every wall, floor, ceiling, window, door, doorway,'
    + ' stair and railing',
  '- the number of windows and doors, and the pattern of glazing bars in each window',
  '- the position, size and shape of every piece of furniture and every fixture already in frame',
  ...(walking ? [] : ['- the outline of the building on the ground, its room divisions,'
    + ' and the ground it stands on']),
  '- the colour of every surface: a sage wall stays that sage, a pale floor stays that tone',
  '',
  'Add nothing at all. No extra furniture, rugs, cushions, throws, curtains, blinds, plants,'
    + ' artwork, books, ornaments, lamps, ceiling lights, switches, sockets, radiators, fires,'
    + ' people or animals. A bare wall stays bare. An empty corner stays empty.'
    + (walking
        ? ' Whatever is visible through a window stays what is visible through it.'
        : ' No roof, no extra storey, no landscaping that is not already there.')
    + ' Remove nothing either.',
  '',
  'Change one thing only: how real the surfaces and the light are. Give the surfaces that are'
    + ' already there their true material — grain and plank joints in wood, the tooth of painted'
    + ' plaster, irregular brick with real mortar, weave in fabric, real glass — and light it'
    + (walking
        ? ' with daylight through the windows that are already in the frame, with soft falloff,'
          + ' bounce, and contact shadows where objects already meet the floor.'
        : ' with real daylight from the same direction as the shadow already on the ground.')
    + " Add the ordinary imperfections of a photograph: slight vignetting, fine grain, a real"
    + " lens's depth of field.",
  '',
  'Someone who knows this house must be able to lay your photograph over the render and find'
    + ' every edge in the same place. No text, labels or watermarks.',
].join('\n');

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
        prompt: brief(at.mode === 'walk')
          + (at.mode === 'walk' ? `\n\nThe room is the ${at.room.toLowerCase()}.` : '')
          + (extra ? `\n\n${extra}` : ''),
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

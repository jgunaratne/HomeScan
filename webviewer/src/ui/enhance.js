import { $ } from '../core/util.js';
import { view, focus } from '../core/state.js';
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
// The key lives in the server's .env and never reaches the page, so the whole
// exchange is one POST to serve.mjs. A viewer opened straight off disk has no
// server behind it; that is a message in the panel, not a broken button.

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

const MAX_EDGE = 1536;

let original = null, result = null, busy = false, showing = 'result', probed = false;

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
  const shot = document.createElement('canvas');
  shot.width = Math.max(1, Math.round(canvas.width * scale));
  shot.height = Math.max(1, Math.round(canvas.height * scale));
  shot.getContext('2d').drawImage(canvas, 0, 0, shot.width, shot.height);
  ring.visible = wasRing;
  return shot.toDataURL('image/jpeg', 0.92);
}

function show(which){
  showing = result && which === 'result' ? 'result' : 'original';
  $('nb-img').src = showing === 'result' ? result : original;
  $('nb-swap').textContent = showing === 'result' ? 'Show the render' : 'Show the photograph';
  $('nb-swap').disabled = !result;
  $('nb-save').hidden = !result;
  if (result){
    $('nb-save').href = result;
    // Which of PNG or JPEG comes back is the model's choice, and a file saved
    // under the wrong extension is one the desktop opens with the wrong thing.
    $('nb-save').download = 'storeywalk-photograph.'
      + (result.startsWith('data:image/png') ? 'png' : 'jpg');
  }
}

// Whether there is a key behind the server, asked once and only when the panel
// is first opened: a viewer that never presses the button should not go looking
// for a server, and one opened off a memory stick has none to find.
async function probe(){
  if (probed) return;
  probed = true;
  let trouble = '';
  try {
    const state = await (await fetch('api/nano-banana')).json();
    if (!state.configured) trouble = 'The server has no GEMINI_API_KEY. Put one in .env and restart it.';
  } catch {
    trouble = 'Nano Banana needs the local server. Run npm start, with GEMINI_API_KEY in .env.';
  }
  // The answer can land after the reader has already pressed Render.
  if (trouble && !busy && !$('nb-status').textContent) say(trouble, 'bad');
}

export function openEnhance(){
  if (busy) return;
  original = grabFrame();
  result = null;
  focus.enhancing = true;
  document.exitPointerLock?.();
  $('nb-where').textContent = view.mode === 'walk' ? whereAmI() : 'Section view';
  $('nb').hidden = false;
  show('original');
  say('');
  $('nb-run').disabled = false;
  syncCursor();
  probe();
}

export function closeEnhance(){
  focus.enhancing = false;
  $('nb').hidden = true;
  $('nb-img').removeAttribute('src');
  original = result = null;
  syncCursor();
}

async function run(){
  if (busy || !original) return;
  const extra = $('nb-prompt').value.trim();
  busy = true;
  $('nb-run').disabled = true;
  $('nb-veil').hidden = false;
  say('Rendering — this takes a few seconds.', 'busy');
  try {
    const res = await fetch('api/nano-banana', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        image: original,
        prompt: `${BRIEF} The room is the ${$('nb-where').textContent.toLowerCase()}.`
          + (extra ? ` ${extra}` : ''),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `The server answered ${res.status}.`);
    result = data.image;
    show('result');
    say(data.text || 'Rendered by ' + (data.model || 'Gemini') + '.', 'good');
  } catch (err) {
    // fetch only rejects when there was nobody to answer: opened off disk, or
    // served by something that is not serve.mjs.
    say(err instanceof TypeError
      ? 'Nano Banana needs the local server. Run npm start, with GEMINI_API_KEY in .env.'
      : err.message, 'bad');
  } finally {
    busy = false;
    $('nb-run').disabled = false;
    $('nb-veil').hidden = true;
  }
}

export function initEnhance(){
  for (const id of ['nbbtn', 'nbbtn2']) $(id).onclick = openEnhance;
  $('nb-x').onclick = closeEnhance;
  $('nb-run').onclick = run;
  $('nb-swap').onclick = () => show(showing === 'result' ? 'original' : 'result');
  $('nb').addEventListener('mousedown', e => { if (e.target === $('nb')) closeEnhance(); });
  // Enter sends it; the field still takes a newline on Shift, like a message box.
  $('nb-prompt').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); run(); }
  });
}

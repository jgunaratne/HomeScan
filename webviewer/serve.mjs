#!/usr/bin/env node
// Static server for the walkthrough. No dependencies on purpose: `npm start`
// should work on a fresh clone with nothing installed and no network.
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync, watch } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };

const PORT = Number(opt('--port', process.env.PORT || 5173));
// Every interface by default, so a phone on the LAN can open the walkthrough
// straight off `npm start`; `--host 127.0.0.1` for a deployment where nginx is
// the only thing meant to reach it (see deploy/).
const HOST = opt('--host', process.env.HOST || '0.0.0.0');
const WATCH = flag('--watch');
// What index.html is built from; any of them going newer means a rebuild. The
// viewer's own source is the src/ tree, walked rather than listed.
const SOURCES = ['template.html', 'build.py', 'photos.json'];
const SRC = 'src';

async function sources() {
  const out = [...SOURCES];
  const walk = async dir => {
    for (const e of await readdir(join(ROOT, dir), { withFileTypes: true })) {
      const rel = join(dir, e.name);
      if (e.isDirectory()) await walk(rel);
      else if (e.name.endsWith('.js')) out.push(rel);
    }
  };
  if (existsSync(join(ROOT, SRC))) await walk(SRC).catch(() => {});
  return out;
}
const OPEN = !flag('--no-open');

// .env, read the way the other projects in this tree read it: KEY=value lines,
// optional quotes, `#` comments, and a real shell variable always wins. Both
// the repo root and webviewer/ are looked at so the key can live wherever the
// rest of the toolbox keeps it. No dotenv dependency — see the note above.
function loadEnv(){
  for (const file of [resolve(ROOT, '..', '.env'), join(ROOT, '.env')]){
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of text.split('\n')){
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let v = m[2].trim();
      if (/^"(.*)"$|^'(.*)'$/s.test(v)) v = v.slice(1, -1);
      else v = v.replace(/\s+#.*$/, '').trim();
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}
loadEnv();

// Nano Banana. The walkthrough posts the frame it just drew and gets a
// photograph of it back. The key stays here: the page never sees it, which is
// the whole reason this is a server route and not a fetch from the browser.
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
// Nano Banana 2 by default. On the same frame and the same brief, 2.5-flash
// returns the render with better bricks; 3.1-flash returns a photograph. The
// older model stays as the fallback because not every key is cleared for the
// newer one, and a 404 for the model is indistinguishable from a typo in .env.
const NB_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const NB_FALLBACK = 'gemini-2.5-flash-image';
const NB_MAX = 24 * 1024 * 1024;    // a cap, not an expectation: a frame is ~150 KB

const json = (res, code, body) => res.writeHead(code, {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
}).end(JSON.stringify(body));

async function readBody(req, res){
  const chunks = [];
  let size = 0;
  for await (const chunk of req){
    size += chunk.length;
    if (size > NB_MAX){ json(res, 413, {error: 'Frame too large.'}); req.destroy(); return null; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { json(res, 400, {error: 'Body was not JSON.'}); return null; }
}

async function nanoBanana(req, res){
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  // A health check for the route: `curl localhost:5173/api/nano-banana` says
  // whether a key was found without spending one.
  if (req.method === 'GET') return json(res, 200, {configured: !!key, model: NB_MODEL});
  if (req.method !== 'POST') return json(res, 405, {error: 'POST a frame here.'});
  if (!key) return json(res, 503, {
    error: 'No GEMINI_API_KEY. Put one in .env next to package.json, then restart the server.',
  });

  const body = await readBody(req, res);
  if (!body) return;
  const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/s.exec(body.image || '');
  if (!m) return json(res, 400, {error: 'No frame in the request.'});
  const prompt = String(body.prompt || '').trim();
  if (!prompt) return json(res, 400, {error: 'No prompt in the request.'});

  const ask = model => fetch(`${GEMINI}/${model}:generateContent`, {
    method: 'POST',
    headers: {'content-type': 'application/json', 'x-goog-api-key': key},
    body: JSON.stringify({
      contents: [{role: 'user', parts: [
        {inlineData: {mimeType: m[1], data: m[2]}},
        {text: prompt},
      ]}],
      generationConfig: {responseModalities: ['TEXT', 'IMAGE']},
    }),
  });

  let data, model = NB_MODEL;
  try {
    let r = await ask(model);
    if (r.status === 404 && model !== NB_FALLBACK){ model = NB_FALLBACK; r = await ask(model); }
    data = await r.json();
    if (!r.ok) return json(res, r.status, {error: data?.error?.message || `Gemini returned ${r.status}.`});
  } catch (err) {
    return json(res, 502, {error: `Could not reach Gemini: ${err.message}`});
  }

  const candidate = data?.candidates?.[0];
  let image = null, text = '';
  for (const part of candidate?.content?.parts || []){
    const inline = part.inlineData || part.inline_data;
    if (inline && !image) image = `data:${inline.mimeType || inline.mime_type};base64,${inline.data}`;
    else if (part.text) text += part.text;
  }
  // A refusal comes back as a perfectly successful response with prose in it,
  // so the reason has to be dug out rather than reported as "no image".
  if (!image) return json(res, 502, {
    error: text.trim() || `${model} returned no image`
      + (candidate?.finishReason ? ` (${candidate.finishReason}).` : '.'),
  });
  json(res, 200, {image, text: text.trim(), model});
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.usdz': 'model/vnd.usdz+zip',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

// index.html is generated. Rebuild it when its sources have moved on, but never
// let a missing python3 or scan folder stop the server from coming up.
function rebuild(reason) {
  const r = spawnSync('python3', [join(ROOT, 'build.py')], { encoding: 'utf8' });
  if (r.status === 0) {
    process.stdout.write(`  rebuilt (${reason})\n${r.stdout.replace(/^/gm, '  ')}`);
    return true;
  }
  const why = r.error ? r.error.message : (r.stderr || '').trim().split('\n').pop();
  console.warn(`  could not rebuild (${why}) — serving the committed index.html`);
  return false;
}

async function staleness() {
  try {
    const out = await stat(join(ROOT, 'index.html'));
    for (const src of await sources()) {
      // photos.json is optional — a scan with no photo map is not stale.
      const s = await stat(join(ROOT, src)).catch(() => null);
      if (s && s.mtimeMs > out.mtimeMs) return src;
    }
  } catch { return 'index.html missing'; }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const rel = decodeURIComponent(url.pathname);
  if (rel === '/api/nano-banana'){
    await nanoBanana(req, res).catch(err => json(res, 500, {error: err.message}));
    return;
  }
  const file = resolve(ROOT, '.' + (rel === '/' ? '/index.html' : rel));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found: ' + rel);
  }
});

server.on('error', err => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Port ${PORT} is busy. Try: npm start -- --port ${PORT + 1}`);
  process.exit(1);
});

const why = await staleness();
if (why) rebuild(why + ' is newer');

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\n  HomeScan walkthrough  ${url}`);
  console.log(`  serving ${ROOT}${WATCH ? '  (watching src/, template.html, photos.json)' : ''}`);
  console.log('  Ctrl-C to stop\n');
  if (OPEN) {
    const cmd = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawnSync(cmd, [url], { shell: process.platform === 'win32', stdio: 'ignore' });
  }
});

if (WATCH) {
  let pending = null;
  const onChange = what => {
    clearTimeout(pending);
    pending = setTimeout(() => rebuild(what + ' changed'), 120);
  };
  for (const src of SOURCES) {
    if (!existsSync(join(ROOT, src))) continue;
    watch(join(ROOT, src), () => onChange(src));
  }
  // One recursive watch for the module tree, so a new file needs no restart.
  if (existsSync(join(ROOT, SRC)))
    watch(join(ROOT, SRC), { recursive: true }, (_e, f) => onChange(join(SRC, f || '')));
}

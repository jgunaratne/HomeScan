#!/usr/bin/env node
// Static server for the walkthrough. No dependencies on purpose: `npm start`
// should work on a fresh clone with nothing installed and no network.
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i < 0 ? d : args[i + 1]; };

const PORT = Number(opt('--port', process.env.PORT || 5173));
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

server.listen(PORT, () => {
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

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const serve=fs.readFileSync(`${__dirname}/../serve.mjs`,'utf8');
const enhance=fs.readFileSync(`${__dirname}/../src/ui/enhance.js`,'utf8');

// loadEnv() lifted out of the server, with the file read swapped for the text
// itself: it decides whether the button works at all, and a mishandled quote or
// trailing comment reads downstream as a key Google simply refuses.
const src=serve.slice(serve.indexOf('function loadEnv()'),serve.indexOf('loadEnv();'))
  .replace('function loadEnv(){','function loadEnv(process, text){')
  .replace(/for \(const file of \[[^\]]*\]\)\{[\s\S]*?catch \{ continue; \}/,'{');
const loadEnv=new Function(src+';return loadEnv;')();
const parse=text=>{const env={};loadEnv({env},text);return env;};

test('.env values survive quotes, comments, export and an already-set variable',()=>{
  const env=parse([
    'GEMINI_API_KEY=AIzaPlain',
    'QUOTED="a b c"',
    "SINGLE='d e'",
    'TRAILING=key   # the comment goes',
    'export EXPORTED=yes',
    '# GEMINI_IMAGE_MODEL=commented-out',
    'not a line at all',
    '',
  ].join('\n'));
  assert.equal(env.GEMINI_API_KEY,'AIzaPlain');
  assert.equal(env.QUOTED,'a b c');
  assert.equal(env.SINGLE,'d e');
  assert.equal(env.TRAILING,'key');
  assert.equal(env.EXPORTED,'yes');
  assert.equal(env.GEMINI_IMAGE_MODEL,undefined);
});
test('a real shell variable is not overwritten by the file',()=>{
  const env={GEMINI_API_KEY:'from-the-shell'};
  loadEnv({env},'GEMINI_API_KEY=from-the-file\nOTHER=x');
  assert.equal(env.GEMINI_API_KEY,'from-the-shell');
  assert.equal(env.OTHER,'x');
});

// The data URL the browser posts and the one the server accepts have to agree,
// and the frame is JPEG because a lossless 1536px screenshot is 20x the upload.
test('the frame the viewer posts is the shape the server unpacks',()=>{
  const accepts=/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/s;
  assert.ok(enhance.includes("toDataURL('image/jpeg', 0.92)"));
  assert.ok(accepts.test('data:image/jpeg;base64,/9j/4AAQ'));
  assert.ok(!accepts.test('data:image/jpeg,notbase64'));
  assert.ok(!accepts.test(''));
});

// The brief is the whole feature: an earlier one that led with what to preserve
// got the render handed straight back. Change first, geometry fenced after.
test('the brief asks for a photograph before it asks to keep the plan',()=>{
  const brief=enhance.slice(enhance.indexOf('const BRIEF'),enhance.indexOf('].join'));
  assert.ok(brief.indexOf('photorealistic')<brief.indexOf('must not change'));
  assert.ok(/no text, labels or watermarks/i.test(brief));
});

// Every element the module reaches for has to exist in the page it is bundled
// into; a typo here is a null on boot and a viewer that never comes up.
test('every id the panel drives is in the template',()=>{
  const page=fs.readFileSync(`${__dirname}/../template.html`,'utf8');
  const ids=new Set([...enhance.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map(m=>m[1]));
  assert.ok(ids.size>8);
  for(const id of ids) assert.ok(page.includes(`id="${id}"`),`${id} is missing from template.html`);
});

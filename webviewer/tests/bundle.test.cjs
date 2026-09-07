const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(`${__dirname}/../index.html`,'utf8');
const bundle=html.slice(html.indexOf('(function(){'),html.lastIndexOf('})();')+5);

// build.py strips the module keywords by regex rather than parsing, so a form
// it has not been taught survives into the page as a SyntaxError that takes the
// whole viewer down with it. `export async function` was one such form, and
// nothing else in the suite would have noticed.
test('the bundled viewer parses as one script',()=>{
  assert.ok(bundle.length>1000);
  assert.doesNotThrow(()=>new Function(bundle));
});
test('no import or export keyword survives the bundler',()=>{
  for(const line of bundle.split('\n')){
    assert.ok(!/^\s*export\s/.test(line),`export survived: ${line.trim().slice(0,72)}`);
    assert.ok(!/^\s*import\s*[{'"]/.test(line),`import survived: ${line.trim().slice(0,72)}`);
  }
});

// Every export in src/ has to be a form the stripping regex recognises, whether
// or not the bundle happens to parse today.
test('every export in src uses a form the bundler strips',()=>{
  const strips=/^export (?=const |let |async |function |class )/;
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    const full=path.join(dir,e.name);
    return e.isDirectory()?walk(full):e.name.endsWith('.js')?[full]:[];
  });
  for(const file of walk(path.join(__dirname,'../src'))){
    const src=fs.readFileSync(file,'utf8');
    for(const line of src.split('\n').filter(l=>/^export\s/.test(l)))
      assert.ok(strips.test(line),`${path.basename(file)}: ${line.slice(0,72)}`);
  }
});

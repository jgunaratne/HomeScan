const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(`${__dirname}/../src/photo/relight.js`,'utf8');
const start=source.indexOf('export function shareFinishes()');
const end=source.indexOf('\n}\n',start)+3;
// photoRooms is the module's own import; the extracted copy takes it as an argument.
const make=rooms=>new Function('photoRooms',
  source.slice(start,end).replace('export ','')+';return shareFinishes;')(rooms);

// Rooms are stubs: a pick is only a score here, and a material is only an
// identity, because that is all the grouping looks at.
const room=(level,name,finishes,picks)=>({
  level, name, finishes, pick:{}, mats:{},
  ...(()=>{const r={pick:{},mats:{}};
    for(const [kind,[score,mat]] of Object.entries(picks||{})){
      if(score!==null)r.pick[kind]={score};
      if(mat)r.mats[kind]=mat;
    }
    return r;})(),
});

test('one ceiling to a storey, and the clearest patch supplies it',()=>{
  const a=room(0,'Kitchen',{},{ceil:[9,'ceilA']});
  const b=room(0,'Hall',{},{ceil:[2,'ceilB']});      // the flattest patch wins
  const c=room(0,'Bath',{},{ceil:[5,'ceilC']});
  make([a,b,c])();
  assert.equal(a.mats.ceil,'ceilB');
  assert.equal(b.mats.ceil,'ceilB');
  assert.equal(c.mats.ceil,'ceilB');
});

test('a room whose photographs never showed a ceiling inherits the storey\'s',()=>{
  const seen=room(0,'Great room',{},{ceil:[3,'ceilA']});
  const blind=room(0,'Laundry',{},{});
  make([seen,blind])();
  assert.equal(blind.mats.ceil,'ceilA');
});

test('storeys do not borrow each other\'s ceilings',()=>{
  const down=room(0,'Great room',{},{ceil:[1,'ceilDown']});
  const up=room(1,'Bedroom',{},{ceil:[8,'ceilUp']});
  make([down,up])();
  assert.equal(down.mats.ceil,'ceilDown');
  assert.equal(up.mats.ceil,'ceilUp');
});

// Floors are the other way round: what a room declares is the material itself,
// so the same boards laid on two storeys are the same boards.
test('one floor finish is one material wherever in the house it is laid',()=>{
  const down=room(0,'Great room',{floor:'timber-oak'},{floor:[7,'downstairs']});
  const up=room(1,'Landing',{floor:'timber-oak'},{floor:[3,'upstairs']});
  make([down,up])();
  assert.equal(down.mats.floor,'upstairs');
  assert.equal(up.mats.floor,'upstairs');
});
test('two woods named apart stay apart',()=>{
  const cherry=room(0,'Great room',{floor:'timber-cherry'},{floor:[5,'cherry']});
  const maple=room(1,'Bedroom',{floor:'timber-maple'},{floor:[2,'maple']});
  make([cherry,maple])();
  assert.equal(cherry.mats.floor,'cherry');
  assert.equal(maple.mats.floor,'maple');
});

test('a room that names a different ceiling keeps its own',()=>{
  const paint=room(1,'Landing',{},{ceil:[7,'paintA']});
  const boards=room(1,'Attic',{ceil:'timber'},{ceil:[9,'timberA']});
  make([paint,boards])();
  assert.equal(paint.mats.ceil,'paintA');
  assert.equal(boards.mats.ceil,'timberA');
});

// Floors are the opposite case: tile, boards and vinyl are all real, so only a
// declared match may merge them.
test('floors merge only across rooms that declare the same finish',()=>{
  const east=room(1,'East bedroom',{floor:'timber-maple'},{floor:[6,'boardsE']});
  const west=room(1,'West bedroom',{floor:'timber-maple'},{floor:[2,'boardsW']});
  const bath=room(1,'Bathroom',{floor:'tile'},{floor:[4,'tileA']});
  const undeclared=room(1,'Landing',{},{floor:[1,'ownFloor']});
  make([east,west,bath,undeclared])();
  assert.equal(east.mats.floor,'boardsW');
  assert.equal(west.mats.floor,'boardsW');
  assert.equal(bath.mats.floor,'tileA');
  assert.equal(undeclared.mats.floor,'ownFloor','an undeclared floor is nobody else\'s');
});

test('a reviewed rectangle scores zero, so it wins its group',()=>{
  const reviewed=room(0,'Great room',{floor:'timber-cherry'},{floor:[0,'reviewed']});
  const auto=room(0,'Living room',{floor:'timber-cherry'},{floor:[0.5,'automatic']});
  make([reviewed,auto])();
  assert.equal(auto.mats.floor,'reviewed');
});

test('an undressed room contributes nothing and receives nothing',()=>{
  const dressed=room(0,'Great room',{floor:'timber-cherry'},{floor:[4,'boards']});
  const undressed={level:0,name:'Garage',finishes:{floor:'timber-cherry'},pick:{floor:{score:1}},mats:null};
  make([dressed,undressed])();
  assert.equal(dressed.mats.floor,'boards','a room with no materials must not supply one');
  assert.equal(undressed.mats,null);
});

// The scan this viewer ships with, as a guard on the data rather than the code.
test('the shipped scan declares finishes that group into one ceiling a storey',()=>{
  const rooms=JSON.parse(fs.readFileSync(`${__dirname}/../photos.json`,'utf8')).rooms;
  for(const level of [0,1]){
    const on=rooms.filter(r=>r.level===level);
    assert.ok(on.length>1);
    assert.ok(on.every(r=>!r.finishes?.ceil),
      `L${level} names a ceiling finish, so it no longer groups into one`);
  }
  const woods=new Map();
  for(const r of rooms){
    const f=r.finishes?.floor;
    if(!f) continue;
    assert.match(f,/^timber-[a-z]+$/,`${r.name} names a floor the plank builder will not lay`);
    if(!woods.has(f)) woods.set(f,new Set());
    woods.get(f).add(r.level);
  }
  assert.deepEqual([...woods.keys()].sort(),['timber-cherry','timber-maple']);
  // Every room the photographs show as hardwood has to say so, or it samples
  // its own boards and reads as a third wood the house does not have.
  for(const name of ['Great room','Living room','Main-floor bedroom'])
    assert.equal(rooms.find(r=>r.name===name).finishes.floor,'timber-cherry',name);
  for(const name of ['Upper family room','East bedroom','South bedroom','West bedroom'])
    assert.equal(rooms.find(r=>r.name===name).finishes.floor,'timber-maple',name);
});

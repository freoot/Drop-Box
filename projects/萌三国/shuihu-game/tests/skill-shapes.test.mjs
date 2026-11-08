import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
function load() {
  const nodes = new Map();
  class El { constructor(){this.dataset={};this.style={};this.classList={add(){},remove(){}};this.innerHTML='';} closest(){return this} querySelectorAll(){return []} }
  const ctx = vm.createContext({ window:{}, Element:El, console, confirm:()=>true, requestAnimationFrame(){},
    setTimeout(){return 0}, clearTimeout(){},
    document:{ querySelector(s){ if(!nodes.has(s)) nodes.set(s,new El()); return nodes.get(s); }, addEventListener(){} },
    localStorage:{ getItem(){return null}, setItem(){}, removeItem(){} } });
  for (const f of ['data/shuihu.js','data/portraits.js','data/journey.js','journey.js','game.js'])
    vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'), ctx, { filename:f });
  return e => vm.runInContext(e, ctx);
}
const run = load();
const key = cells => JSON.stringify(cells.map(c=>`${c.x},${c.y}`).sort());

test('shape library footprints at board centre', () => {
  const o='{x:1,y:1}', t='{x:4,y:1}';
  for (const [shape,n] of [['row',8],['single',1],['line2',2],['xcross',5],['cross5',5],['fan',4],['column',4],['line',4],['six',6],['ring8',8],['square9',9],['all',32]])
    assert.equal(run(`shapeCells('${shape}',${o},${t}).length`), n, shape);
});

test('directional shapes extend away from the caster', () => {
  assert.equal(key(run("shapeCells('line2',{x:1,y:1},{x:4,y:1})")), key([{x:4,y:1},{x:5,y:1}]));
  assert.equal(key(run("shapeCells('line2',{x:6,y:1},{x:4,y:1})")), key([{x:4,y:1},{x:3,y:1}]));
  assert.equal(key(run("shapeCells('fan',{x:1,y:2},{x:4,y:2})")), key([{x:4,y:2},{x:5,y:1},{x:5,y:2},{x:5,y:3}]));
});

test('shapes clip at board edges', () => {
  assert.equal(run("shapeCells('square9',{x:0,y:0},{x:7,y:0}).length"), 4);
  assert.equal(run("shapeCells('fan',{x:0,y:0},{x:7,y:3}).length"), 1);
});

test('six shape always returns six cells even at the bottom edge', () => {
  // Previously 'six' extended only downward (y===ty||y===ty+1), so a target at y=3
  // lost half the shape (ty+1 is off-board). The fix adapts to the row above.
  for (const ty of [0,1,2,3])
    assert.equal(run(`shapeCells('six',{x:1,y:1},{x:3,y:${ty}}).length`), 6, `six at ty=${ty}`);
});

test('legacy effects keep previous footprints through the shared function', () => {
  assert.equal(run("skillCells({x:1,y:1},{x:4,y:1},{effect:{type:'cleave',radius:1}}).length"), 5);
  assert.equal(run("skillCells({x:1,y:1},{x:4,y:1},{effect:{type:'pierce'}}).length"), 4);
  assert.equal(run("skillCells({x:1,y:1},{x:4,y:1},{effect:{type:'damage'}}).length"), 1);
});

const PREMIUM=[1,3,4,6,9,13,14,22,30,36,37,59];
test('premium heroes each own a unique signature shape with balanced multipliers', () => {
  const rows = JSON.parse(run(`JSON.stringify(DATA.heroes.filter(h=>h.skills.some(s=>s.effect.signature)).map(h=>({rank:h.rank,sk:h.skills.map(s=>({shape:s.effect.shape,sig:s.effect.signature,m:s.effect.multiplier,type:s.effect.type,id:s.id}))})))`));
  assert.deepEqual(rows.map(r=>r.rank).sort((a,b)=>a-b), [...PREMIUM].sort((a,b)=>a-b));
  const shapes = JSON.parse(run('JSON.stringify(DATA.skillShapes)'));
  const sigs = rows.map(r=>r.sk.filter(s=>s.sig));
  assert.ok(sigs.every(s=>s.length===1), 'exactly one signature skill per hero');
  const used = sigs.map(s=>s[0].shape);
  assert.equal(new Set(used).size, used.length, 'no two premium heroes share a shape');
  for (const r of rows) for (const s of r.sk) {
    if (!s.sig) assert.ok(!s.shape, `rank ${r.rank} secondary skill must stay single-target`);
    else if (s.m) assert.ok(s.m <= shapes[s.shape].multiplier + 1e-9, `rank ${r.rank} above template multiplier`);
  }
  const list = Object.values(shapes).sort((a,b)=>a.cells-b.cells);
  for (const a of list) for (const b of list) if (a.cells>b.cells) assert.ok(a.multiplier <= b.multiplier, `${a.label} vs ${b.label}`);
  // premium kits must not reuse profession skill ids/names
  assert.equal(run(`DATA.heroes.filter(h=>${JSON.stringify(PREMIUM)}.includes(h.rank)).some(h=>h.skills.some(s=>s.name.includes('·')))`), false);
});

test('area guard shields every ally in the shape (宋江 义旗护阵)', () => {
  run(`startBattle('campaign',1);beginBattle(state.battle);var g=state.battle;g.animating=false;
    var sj=g.allies.find(a=>a.id==='hero-001');sj.activeSkill=0;sj.acted=false;sj.skillUsed=false;g.allies.forEach(a=>{a.status={};});
    g.allies.forEach((a,i)=>{a.x=[1,2,1,0,2][i];a.y=[1,1,2,3,3][i];});`);
  run('performSkill(g,sj,sj)');
  assert.equal(run('g.allies.filter(a=>a.status.shield>0).length'), 3);
});

test('preview, resolution and FX share identical cells', () => {
  run(`startBattle('campaign',1);beginBattle(state.battle);var b=state.battle;b.animating=false;
    var actor=b.allies[0];actor.id='hero-037';actor.activeSkill=1;actor.x=3;actor.y=1;actor.acted=false;actor.skillUsed=false;b.selectedId=actor.uid;b.intent='skill';
    b.enemies.forEach((e,i)=>{e.hp=900;e.maxHp=900;e.x=[4,5,7][i]??7;e.y=[1,2,3][i]??3;});
    var expected=skillCells(actor,b.enemies[0],heroMeta('hero-037').skills[1]);previewSkill(b,actor,b.enemies[0]);`);
  assert.equal(run('expected.length'), 9);
  assert.ok(run('battlePage()').includes('skill-area-preview'));
  run('previewSkill(b,actor,b.enemies[0])');
  assert.equal(run('JSON.stringify(b.fx.cells)===JSON.stringify(expected)'), true);
  assert.ok(run('b.enemies[1].hp') < 900);
  assert.equal(run('b.enemies[2].hp'), 900);
  assert.ok(run('battlePage()').includes('skill-area-fx'));
});

// ---- 聚义酒肆 regressions ----
function freshGame(saved) {
  const nodes=new Map(), store=new Map(saved?[['shangshan-shuihu-v1',saved]]:[]), listeners={};
  class El { constructor(d={}){this.dataset=d;this.style={};this.classList={add(){},remove(){}};this.innerHTML='';} closest(){return this} querySelectorAll(){return []} }
  const ctx=vm.createContext({window:{},Element:El,console,confirm:()=>true,requestAnimationFrame(){},setTimeout(){return 0},clearTimeout(){},
    document:{querySelector(s){if(!nodes.has(s))nodes.set(s,new El());return nodes.get(s)},addEventListener(t,f){(listeners[t]||=[]).push(f)}},
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}});
  for (const f of ['data/shuihu.js','data/portraits.js','data/journey.js','journey.js','game.js'])
    vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
  return {run:e=>vm.runInContext(e,ctx),store,listeners};
}

test('bug: an open tavern dialog was saved and re-opened as a blocking modal after reload', () => {
  const g=freshGame();
  g.run("state.page='recruit';clickAction({target:new Element({action:'tavern-owner'})});save();");
  const saved=g.store.get('shangshan-shuihu-v1');
  assert.equal(JSON.parse(saved).tavernMenu, false);
  const legacy=JSON.stringify({...JSON.parse(saved),tavernMenu:true});
  const g2=freshGame(legacy);
  assert.equal(g2.run('state.tavernMenu'), false);
  assert.ok(!g2.run('recruitPage()').includes('tavern-dialog'));
});

test('bug: strolling guests overlapped each other', () => {
  const g=freshGame();
  g.run("for(const id of ['hero-002','hero-005','hero-007','hero-008'])obtainHero(id)");
  const html=g.run('recruitPage()');
  const pos=[...html.matchAll(/class="tavern-guest" style="[^"]*left:([\d.]+)%;top:([\d.]+)%/g)].map(m=>[+m[1],+m[2]]);
  assert.equal(pos.length,5);
  // guest box 8% wide + stroll drift ~1%: centres must be >= 10% apart horizontally, or 18%+ vertically
  for (let i=0;i<pos.length;i++) for (let j=i+1;j<pos.length;j++)
    assert.ok(Math.abs(pos[i][0]-pos[j][0])>=10 || Math.abs(pos[i][1]-pos[j][1])>=18, `guests ${i},${j} overlap`);
  // and none sits on the 掌柜 (anchored at TAVERN_OWNER, drawn ~12% wide and ~26% tall above that point)
  const o=JSON.parse(g.run('JSON.stringify(TAVERN_OWNER)'));
  for (const [x,y] of pos) assert.ok(Math.abs(x-o.x)>=11 || y-18>o.y, `guest at ${x},${y} covers the shopkeeper`);
});

test('bug: 掌柜 could be scrolled off-screen on phones; heading and caption also open recruiting', () => {
  const g=freshGame();g.run("state.page='recruit'");
  const html=g.run('recruitPage()');
  assert.ok((html.match(/data-action="tavern-owner"/g)||[]).length>=3);
  g.run("clickAction({target:new Element({action:'tavern-owner'})})");
  assert.ok(g.run('recruitPage()').includes('recruit-one'));
});

test('bug: no keyboard way to dismiss the recruit dialog', () => {
  const g=freshGame();g.run("state.page='recruit';state.tavernMenu=true");
  for (const f of g.listeners.keydown||[]) f({key:'Escape'});
  assert.equal(g.run('state.tavernMenu'), false);
});

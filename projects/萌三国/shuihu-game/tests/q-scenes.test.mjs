import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
function game() {
  const nodes = new Map();
  class El { constructor(d={}){this.dataset=d;this.style={};this.classList={add(){},remove(){}};this.innerHTML='';} closest(){return this} querySelectorAll(){return []} }
  const ctx = vm.createContext({ window:{}, Element:El, console, confirm:()=>true, requestAnimationFrame(){}, setTimeout(){return 0}, clearTimeout(){},
    document:{ querySelector(s){ if(!nodes.has(s)) nodes.set(s,new El()); return nodes.get(s); }, addEventListener(){} },
    localStorage:{ getItem(){return null}, setItem(){}, removeItem(){} } });
  for (const f of ['data/shuihu.js','data/portraits.js','data/journey.js','journey.js','hero-power.js','battle-vfx.js','battle-motion.js','game.js']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'), ctx, { filename:f });
  return e => vm.runInContext(e, ctx);
}
const run = game();
const css = fs.readFileSync(path.join(root,'game.css'),'utf8');
test('shield dome follows remaining protection and idle archer has a rest image',()=>{
 run("startBattle('campaign',1)");
 run('state.battle.allies[0].status.shield=45');
 assert.match(run('battlePage()'),/shield-dome/);
 run('state.battle.allies.forEach(u=>u.status.shield=0)');
 assert.doesNotMatch(run('battlePage()'),/shield-dome/);
 assert.match(run("artHTML(heroMeta('hero-009'),'unit-art')"),/battle-rest-art/);
 assert.match(run('battlePage()'),/排兵布阵/);
});

test('Q scene images exist and are referenced; old paintings kept on disk as fallback', () => {
  for (const s of ['city-q','tavern-q','map-q','battle-q']) {
    const f = `assets/q/scenes/${s}.jpg`, buf = fs.readFileSync(path.join(root,f));
    assert.equal(buf[0],0xff); assert.equal(buf[1],0xd8, f+' is JPEG');
    assert.ok(css.includes(f), f+' referenced in game.css');
  }
  for (const old of ['liangshan-city-painted.png','liangshan-battlefield-painted.png','liangshan-journey-map.png','tavern-interior.png'])
    assert.ok(fs.existsSync(path.join(root,'assets',old)), 'fallback kept: '+old);
});

test('city hotspots sit on their buildings in city-q.jpg and every page exists', () => {
  const spots = JSON.parse(run('JSON.stringify(CITY_HOTSPOTS)'));
  const expect = { heroes:[52,27], activity:[33,13], recruit:[19,44], gear:[80,46], arena:[74,12], campaign:[47,66] }; // 忠义堂, 告示榜, 酒肆, 工坊, 演武场, 城门
  for (const [id,[x,y]] of Object.entries(expect)) {
    const s = spots.find(h=>h.id===id); assert.ok(s, id);
    assert.ok(Math.abs(s.x-x)<=4 && Math.abs(s.y-y)<=4, `${id} moved off its building`);
  }
  for (const s of spots) assert.ok(s.x>=5&&s.x<=95&&s.y>=5&&s.y<=90, `${s.id} inside the stage`);
  for (let i=0;i<spots.length;i++) for (let j=i+1;j<spots.length;j++)
    assert.ok(Math.abs(spots[i].x-spots[j].x)>=10||Math.abs(spots[i].y-spots[j].y)>=10, `${spots[i].id}/${spots[j].id} labels overlap`);
  const html = run('cityPage()');
  for (const s of spots) assert.ok(html.includes(`data-page="${s.id}"`), s.id);
  for (const s of spots) { run(`state.page='${s.id}';render()`); }
  run("state.page='city';render()");
});

test('journey nodes are placed on the six landmarks of map-q.jpg', () => {
  const J = JSON.parse(run('JSON.stringify(window.SHUIHU_JOURNEY)'));
  const expect = { '梁山水寨':[18,30], '景阳冈':[51,16], '祝家庄':[82,31], '东京汴梁':[62,47], '大名府':[30,60], '江南水乡':[81,71] };
  assert.deepEqual(J.map(j=>j.landmark).sort(), Object.keys(expect).sort());
  for (const j of J) { const [x,y]=expect[j.landmark]; assert.ok(Math.abs(j.x-x)<=3 && Math.abs(j.y-y)<=3, j.landmark); }
  assert.match(run('campaignMapPage()'), /景阳冈 · /);
});

test('8x4 battle grid lies on the grass field and preview cells match boardPoint', () => {
  const g = JSON.parse(run('JSON.stringify(BOARD_GEOM)'));
  const right = g.left + 8*g.cellW, bottom = g.top + 4*g.cellH;
  assert.ok(g.left>=11 && right<=89, 'inside the stones/flags on both sides');
  assert.ok(g.top>=16 && bottom<=80, 'below the river, above the fences');
  run("startBattle('campaign',1)");
  const html = run('battlePage()');
  const m = html.match(/data-cell-x="7" data-cell-y="3"/); assert.ok(m);
  const p = JSON.parse(run('JSON.stringify(boardPoint(7,3))'));
  assert.ok(Math.abs(p.x/10-(g.left+7.5*g.cellW))<0.01);
});

test('roster cards carry rarity frames', () => {
  const html = run("renderHeroCard(heroMeta('hero-001'))");
  assert.match(html, /hero-card rarity-diamond/);
  for (const q of ['blue','purple','red','diamond']) assert.ok(css.includes(`.hero-card.rarity-${q}`));
});

test('character studio lists all 12 Q heroes with frame strips', () => {
  const src = fs.readFileSync(path.join(root,'character-studio.js'),'utf8');
  const ids = [...src.matchAll(/id:'(hero-\d{3})'/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size, 12);
  for (const id of ids) assert.ok(run(`!!ART['${id}'].frames`), id);
});

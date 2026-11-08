import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(root, 'game.css'), 'utf8');
const vfxCss = fs.readFileSync(path.join(root, 'battle-vfx.css'), 'utf8');
const readabilityCss = fs.readFileSync(path.join(root, 'battle-readability.css'), 'utf8');

function loadGame() {
  const nodes = new Map();
  class El { constructor(d={}){this.dataset=d;this.style={};this.classList={add(){},remove(){}};this.innerHTML='';} closest(){return this} querySelectorAll(){return[]} }
  const ctx = vm.createContext({ window:{}, Element:El, console, confirm:()=>true, requestAnimationFrame(){}, setTimeout(){return 0}, clearTimeout(){},
    document:{ querySelector(s){ if(!nodes.has(s)) nodes.set(s,new El()); return nodes.get(s); }, addEventListener(){} },
    localStorage:{ getItem(){return null}, setItem(){}, removeItem(){} } });
  for (const f of ['data/shuihu.js','data/portraits.js','data/journey.js','journey.js','game.js'])
    vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'), ctx, { filename:f });
  return { run: e=>vm.runInContext(e,ctx), nodes };
}

test('VFX-001: huarong rest art is constrained and hidden during actions', () => {
  // The rest art must have size/position constraints so it does not overflow the frame.
  assert.match(css, /\.battle-rest-art\{[^}]*width:170%/, 'rest art sized to match frame strip');
  assert.match(css, /\.battle-rest-art\{[^}]*bottom:0/, 'rest art foot-aligned');
  // During move/attack/hit/dead the rest art must hide so the frame strip takes over.
  assert.match(css, /\.unit-sprite\.moving \.battle-rest-art[^{]*\{display:none\}/);
  assert.match(css, /\.unit-sprite\.attacking \.battle-rest-art[^{]*\{display:none\}/);
  assert.match(css, /\.unit-sprite\.hit \.battle-rest-art[^{]*\{display:none\}/);
  assert.match(css, /\.unit-sprite\.dead \.battle-rest-art[^{]*\{display:none\}/);
});

test('VFX-001: rest art is data-driven from portraits.js, not hardcoded to one hero', () => {
  // artHTML must read asset.restArt instead of hardcoding hero-009's path.
  const src = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  assert.doesNotMatch(src, /hero-009.*huarong\.png/, 'no hardcoded hero-009 rest path in game.js');
  assert.match(src, /asset\.restArt/, 'artHTML reads restArt from the portrait asset');
  // portraits.js registers restArt for the three heroes that have a rest image.
  const portraits = fs.readFileSync(path.join(root, 'data/portraits.js'), 'utf8');
  assert.match(portraits, /"hero-006"[\s\S]*?"restArt":\s*"assets\/tavern\/rest\/linchong\.png"/, 'linchong rest art registered');
  assert.match(portraits, /"hero-009"[\s\S]*?"restArt":\s*"assets\/tavern\/rest\/huarong\.png"/, 'huarong rest art registered');
  assert.match(portraits, /"hero-022"[\s\S]*?"restArt":\s*"assets\/tavern\/rest\/likui\.png"/, 'likui rest art registered');
  // artHTML renders the rest img for any hero whose asset has restArt.
  const { run } = loadGame();
  run("startBattle('campaign',1);beginBattle(state.battle);var b=state.battle;b.animating=false;b.fx=null;");
  const html = run('battlePage()');
  // At least linchong and huarong are in the starting party and should have rest art.
  assert.ok(html.includes('assets/tavern/rest/linchong.png'), 'linchong rest art rendered');
  assert.ok(html.includes('assets/tavern/rest/huarong.png'), 'huarong rest art rendered');
});

test('VFX-001: idle frame does not replay the attack motion', () => {
  // When there is no fx, actorState returns empty classes — idle uses figure-breathe, not bow-shot.
  const state = { id: 'hero-009', role: '射手' };
  const ctx2 = vm.createContext({ window: {}, console });
  vm.runInContext(fs.readFileSync(path.join(root, 'battle-motion.js'), 'utf8'), ctx2);
  const idle = vm.runInContext(`window.SHUIHU_MOTION.actorState(${JSON.stringify(state)},null,false,false)`, ctx2);
  assert.equal(idle.classes, '', 'idle has no action classes');
  assert.equal(idle.cueClass, '', 'idle has no attack cue');
  // With a strike fx, the archer gets the bow-shot cue — confirming idle vs attack separation.
  const attacking = vm.runInContext(`window.SHUIHU_MOTION.actorState(${JSON.stringify(state)},{kind:'strike'},true,false)`, ctx2);
  assert.match(attacking.classes, /performing-action/);
  assert.equal(attacking.cueClass, 'cue-arrow');
});

test('VFX-001: shield dome only appears on units with positive shield', () => {
  const { run } = loadGame();
  run("startBattle('campaign',1);beginBattle(state.battle);var b=state.battle;b.animating=false;b.fx=null;");
  // Grant a shield to ally-0 and ensure the dome renders.
  run("b.allies[0].status.shield=50");
  const htmlWith = run('battlePage()');
  assert.match(htmlWith, /shield-dome/, 'shield dome present when shield>0');
  // Remove the shield and the dome must disappear.
  run("b.allies[0].status.shield=0");
  const htmlWithout = run('battlePage()');
  assert.doesNotMatch(htmlWithout, /shield-dome/, 'shield dome absent when shield=0');
  // Shield dome has a continuous breathing animation for persistent feedback.
  assert.match(readabilityCss, /\.shield-dome\{[^}]*animation:ward-breathe/);
  assert.match(readabilityCss, /@keyframes ward-breathe/);
});

test('VFX-001: healing and shield use distinct pop colours', () => {
  // Healing stays green; shield gains its own blue pop so players can tell them apart.
  assert.match(css, /\.hit-pop\.healing\{[^}]*color:#eaffcf/, 'healing pop is green');
  assert.match(css, /\.hit-pop\.shield-pop\{[^}]*color:#d7eeff/, 'shield pop is blue');
  // The game assigns shield-pop when the hit grants shield but not heal.
  const src = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  assert.match(src, /shield-pop/, 'game.js uses shield-pop class for shield grants');
});

test('VFX-001: lightning, rocks, fire and tactics map to the correct heroes and skill shapes', () => {
  const { run, nodes } = loadGame();
  const data = run('window.SHUIHU_DATA');
  // hero-004 公孙胜: 五雷引诀(stun) → thunder; 呼风唤雨(cleave all) → wind.
  const gs = data.heroes.find(h => h.name === '公孙胜');
  assert.equal(gs.skills[0].name, '五雷引诀');
  assert.equal(gs.skills[1].name, '呼风唤雨');
  // hero-003 吴用: 落石伏阵(cleave column) → rocks.
  const wy = data.heroes.find(h => h.name === '吴用');
  assert.equal(wy.skills[1].name, '落石伏阵');
  assert.equal(wy.skills[1].effect.shape, 'column');
  // hero-001 宋江: guard → banner (support banner, not damage).
  const sj = data.heroes.find(h => h.name === '宋江');
  assert.equal(sj.skills[0].effect.type, 'guard');
  // battleEffects maps hero-004 to thunder/wind, hero-003 to rocks/tactics, burn to meteor.
  const src = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
  assert.match(src, /hero-004.*thunder|hero-004.*wind/);
  assert.match(src, /hero-003.*rocks|hero-003.*tactics/);
  assert.match(src, /burn.*meteor/);
  // VFX geometry: thunder has bolt, rocks have falling-rock, meteor has tail, tactics has rune.
  assert.match(vfxCss, /\.spell-bolt/, 'thunder bolt styled');
  assert.match(vfxCss, /\.falling-rock/, 'rocks styled');
  assert.match(vfxCss, /\.meteor-tail/, 'meteor styled');
  assert.match(vfxCss, /\.tactic-rune/, 'tactics styled');
});

test('VFX-001: frame strips share a ground line and transparent corners (feet aligned)', () => {
  // This is already covered by q-frames.test.mjs; here we assert the CSS ground-line contract.
  assert.match(css, /\.frame-strip\{[^}]*transform-origin:center bottom/, 'frame origin at bottom (feet)');
  assert.match(css, /\.battle-rest-art\{[^}]*object-position:center bottom/, 'rest art aligned to bottom');
});

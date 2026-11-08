import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

// Loader that keeps document event listeners so keyboard/submit handlers can be exercised.
function makeGame(previousSave) {
  const entries = new Map(previousSave ? [['shangshan-shuihu-v1', previousSave]] : []);
  const nodes = new Map();
  const timers = new Map();
  const listeners = {};
  let nextTimer = 0;
  class FakeElement {
    constructor(dataset = {}) {
      this.dataset = dataset;
      this.style = {};
      this.classList = { add() {}, remove() {} };
      this.innerHTML = '';
      this.textContent = '';
    }
    closest() { return this; }
    querySelectorAll() { return []; }
    focus() {}
  }
  const document = {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, new FakeElement());
      const el = nodes.get(selector);
      // input value mirrors what tests set, so submit handler can read it back.
      return el;
    },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); }
  };
  const context = vm.createContext({
    window: {}, document, Element: FakeElement,
    localStorage: {
      getItem(key) { return entries.get(key) ?? null; },
      setItem(key, value) { entries.set(key, value); },
      removeItem(key) { entries.delete(key); }
    },
    confirm: () => true,
    requestAnimationFrame() {},
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    console
  });
  for (const f of ['data/shuihu.js', 'data/portraits.js', 'data/journey.js', 'journey.js', 'hero-power.js', 'battle-vfx.js', 'battle-motion.js', 'game.js'])
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
  const run = expression => vm.runInContext(expression, context);
  return { context, run, entries, nodes, listeners, FakeElement };
}

test('Enter submits the naming form and Escape cancels rename when a name exists', () => {
  const g = makeGame();
  // First-time naming: simulate form submit with a valid value via the submit listener.
  g.run('editingProfile=true;renderProfileSetup()');
  // The submit handler reads #player-name-input value; set it on the queried node.
  g.run("document.querySelector('#player-name-input').value='清风客'");
  const form = g.run("document.querySelector('#profile-form')");
  form.id = 'profile-form'; // submit handler checks e.target.id
  for (const fn of g.listeners.submit || []) fn({ target: form, preventDefault() {} });
  assert.equal(g.run('state.playerName'), '清风客');
  assert.equal(g.run('editingProfile'), false);

  // Rename flow: clicking the header name opens the editor again.
  g.run('clickAction({target:new Element({action:"edit-profile"})})');
  assert.equal(g.run('editingProfile'), true);
  // Escape while a name already exists cancels rename without clearing the name.
  for (const fn of g.listeners.keydown || []) fn({ key: 'Escape' });
  assert.equal(g.run('editingProfile'), false);
  assert.equal(g.run('state.playerName'), '清风客');
});

test('Escape does not exit first-time naming when no name exists yet', () => {
  const g = makeGame();
  g.run('editingProfile=true;renderProfileSetup()');
  assert.equal(g.run('state.playerName'), '');
  for (const fn of g.listeners.keydown || []) fn({ key: 'Escape' });
  // First-time naming must not silently produce an empty/anonymous save.
  assert.equal(g.run('editingProfile'), true);
  assert.equal(g.run('state.playerName'), '');
});

test('rename preserves heroes, resources and stage progress across reload', () => {
  const g = makeGame();
  // Set progress first, then rename — setPlayerName calls save(), persisting everything.
  g.run("state.gold=4321;state.stageUnlocked=3;state.heroes[0].level=5;setPlayerName('初到客')");
  const saved = g.entries.get('shangshan-shuihu-v1');
  const r = makeGame(saved);
  assert.equal(r.run('state.playerName'), '初到客');
  assert.equal(r.run('state.gold'), 4321);
  assert.equal(r.run('state.stageUnlocked'), 3);
  assert.equal(r.run('state.heroes[0].level'), 5);
});

test('combat power uses one transparent formula for both sides', () => {
  const g = makeGame();
  // Allies and enemies share SHUIHU_POWER.calculate; allies add gear bonuses, enemies have no gear.
  const allyPower = g.run("heroPower(state.heroes.find(h=>h.id==='hero-006'))");
  const baseAlly = g.run("window.SHUIHU_POWER.calculate(state.heroes.find(h=>h.id==='hero-006'))");
  assert.ok(allyPower >= baseAlly, 'ally power includes non-negative gear bonus');
  // The pre-battle roster shows both sides' power using the same label and function.
  g.run("startBattle('campaign',1)");
  const roster = g.run('prebattleRoster()');
  assert.match(roster, /我方总武力值/);
  assert.match(roster, /敌方总武力值/);
  assert.equal(g.run('typeof window.SHUIHU_POWER.calculate'), 'function');
});

test('Song Jiang is support (shield/heal) and Wu Yong is control (weaken/falling rocks)', () => {
  const g = makeGame();
  const data = g.context.window.SHUIHU_DATA;
  const sj = data.heroes.find(h => h.name === '宋江');
  const wy = data.heroes.find(h => h.name === '吴用');
  // 宋江：两项主动技均为辅助（guard 护盾 / heal 治疗），目标为友军。
  assert.ok(sj.skills.every(s => s.target === 'ally_single'), '宋江技能均以友军为目标');
  assert.ok(sj.skills.some(s => s.effect.type === 'guard'), '宋江有护盾技');
  assert.ok(sj.skills.some(s => s.effect.type === 'heal'), '宋江有治疗技');
  // 吴用：落石伏阵为 cleave（纵列范围），另一项为虚弱控制；目标为敌军。
  assert.ok(wy.skills.every(s => s.target === 'enemy_single'), '吴用技能均以敌军为目标');
  const rocks = wy.skills.find(s => s.name === '落石伏阵');
  assert.ok(rocks, '吴用有落石伏阵');
  assert.equal(rocks.effect.type, 'cleave');
  assert.equal(rocks.effect.shape, 'column');
  assert.ok(wy.skills.some(s => s.effect.type === 'weaken'), '吴用有虚弱控制');
});

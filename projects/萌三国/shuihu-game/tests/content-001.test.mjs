import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const ctx = vm.createContext({ window: {}, console });
vm.runInContext(fs.readFileSync(path.join(root, 'data/shuihu.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data/hero-stories.js'), 'utf8'), ctx);
const STORIES = ctx.window.SHUIHU_STORIES;
const DATA = ctx.window.SHUIHU_DATA;
const HEROES = DATA.heroes;

test('the first twelve heroes each have a vetted short biography', () => {
  const first12 = HEROES.slice(0, 12);
  for (const h of first12) {
    const s = STORIES[h.id];
    assert.ok(s, `${h.epithet}·${h.name} (${h.id}) missing story`);
    assert.ok(s.title && s.text && s.thread, `${h.name} story missing fields`);
    assert.ok(s.text.length >= 30, `${h.name} story too short`);
    assert.ok(s.text.includes(h.name) || s.title.includes(h.name), `${h.name} not named in story`);
    assert.ok(s.text.includes('游戏改编') || s.thread.includes('游戏改编') || s.text.includes('小说'),
      `${h.name} must distinguish adaptation from history`);
  }
});

test('Song Jiang story highlights support role (shield and healing)', () => {
  const sj = STORIES['hero-001'];
  assert.match(sj.text, /辅助/);
  assert.match(sj.text, /护盾|治疗/);
  // Skill data confirms support target.
  const data = HEROES.find(h => h.name === '宋江');
  assert.ok(data.skills.every(s => s.target === 'ally_single'));
});

test('Wu Yong story highlights strategist control role', () => {
  const wy = STORIES['hero-003'];
  assert.match(wy.text, /谋略|军师/);
  assert.match(wy.text, /控制|虚弱|落石/);
  const data = HEROES.find(h => h.name === '吴用');
  assert.ok(data.skills.some(s => s.effect.type === 'weaken'));
  assert.ok(data.skills.some(s => s.effect.shape === 'column'));
});

test('Wu Song story places the tiger fight at Jingyang Ridge', () => {
  const ws = STORIES['hero-014'];
  assert.match(ws.text, /景阳冈/);
});

test('story text distinguishes novel adaptation from claimed history', () => {
  for (const s of Object.values(STORIES)) {
    // Every story must mark itself as adaptation or derived from the novel, not history.
    assert.ok(s.text.includes('游戏改编') || s.thread.includes('游戏改编') || s.text.includes('小说'),
      'story must distinguish adaptation from history');
  }
});

test('hero stories do not alter combat IDs, ranks, roles, or skill effects', () => {
  // hero-stories.js only attaches SHUIHU_STORIES text; it must not mutate SHUIHU_DATA heroes.
  const bare = vm.createContext({ window: {}, console });
  vm.runInContext(fs.readFileSync(path.join(root, 'data/shuihu.js'), 'utf8'), bare);
  const beforeHero6 = JSON.stringify(bare.window.SHUIHU_DATA.heroes[5]); // hero-006
  const beforeHero1 = JSON.stringify(bare.window.SHUIHU_DATA.heroes[0]); // hero-001
  vm.runInContext(fs.readFileSync(path.join(root, 'data/hero-stories.js'), 'utf8'), bare);
  assert.equal(JSON.stringify(bare.window.SHUIHU_DATA.heroes[5]), beforeHero6);
  assert.equal(JSON.stringify(bare.window.SHUIHU_DATA.heroes[0]), beforeHero1);
  assert.equal(bare.window.SHUIHU_DATA.heroes.length, 108);
});

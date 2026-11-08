import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

function makeGame(previousSave) {
  const entries = new Map(previousSave ? [['shangshan-shuihu-v1', previousSave]] : []);
  const nodes = new Map();
  const timers = new Map();
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
  }
  const document = {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, new FakeElement());
      return nodes.get(selector);
    },
    addEventListener() {}
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
  for (const f of ['data/shuihu.js', 'data/portraits.js', 'data/journey.js', 'journey.js',
                   'hero-power.js', 'battle-vfx.js', 'battle-motion.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
  }
  const run = expression => vm.runInContext(expression, context);
  return { context, run, entries, nodes };
}

const MARK_WIN = '——若此战得胜——';
const MARK_LOSE = '——若此战不利——';

test('CH-002 第一关 beats 用两条哨兵切成开场 / 胜利 / 失败三段', () => {
  const { run } = makeGame();
  const seg = run('storySegments(1)');
  assert.equal(seg.open.length, 5, '开场段应为 5 条');
  assert.equal(seg.win.length, 3, '胜利段应为 3 条');
  assert.equal(seg.lose.length, 3, '失败段应为 3 条');
  assert.equal(run('JOURNEY[0].beats.length'), 13);
  const all = [...seg.open, ...seg.win, ...seg.lose];
  for (const beat of all) {
    assert.notEqual(beat[1], MARK_WIN, '哨兵行不应出现在任何分段内');
    assert.notEqual(beat[1], MARK_LOSE, '哨兵行不应出现在任何分段内');
  }
  assert.equal(all.length, 11);
  assert.equal(run('JOURNEY[0].beats.length') - all.length, 2, '两条哨兵被剔除');
});

test('CH-002 beatLinesFor 按胜负返回对应台词并显示名', () => {
  const { run } = makeGame();
  for (const kind of ['win', 'lose']) {
    const lines = run(`beatLinesFor(1,'${kind}')`);
    assert.equal(lines.length, 3);
    for (const l of lines) {
      assert.ok(l.name && l.text, '每条台词都要有显示名与正文');
      assert.ok(!l.text.startsWith('——'), '台词不得是哨兵行');
    }
  }
  const win = run("beatLinesFor(1,'win')");
  const lose = run("beatLinesFor(1,'lose')");
  assert.notDeepEqual(win.map(l => l.text), lose.map(l => l.text), '胜负台词不应相同');
  assert.equal(win[1].name, '宋江');
  assert.equal(lose[1].name, '林冲');
  assert.equal(run("beatLinesFor(1,'win')[0].name"), '山河记', '旁白的显示名应为山河记');
});

test('CH-002 剧情页只播开场段，进度分母为开场段长度', () => {
  const { run } = makeGame();
  run("enterStory(1,'normal')");
  const html = run('storyPage()');
  assert.match(html, /公元 1119 年/);
  assert.match(html, /1 \/ 5/, '进度分母应为开场段长度 5，而不是 beats 全长 13');
  assert.doesNotMatch(html, /若此战得胜/, '哨兵行不应在剧情页朗读');
  assert.match(html, /进入战场|继续故事/);
});

test('CH-002 开场段播完后进入布阵，且只按开场段计数', () => {
  const { run } = makeGame();
  run("enterStory(1,'normal')");
  for (let i = 0; i < 4; i++) run('advanceStory()');
  assert.equal(run('state.page'), 'story');
  assert.match(run('storyPage()'), /5 \/ 5/);
  run('advanceStory()');
  assert.equal(run('state.page'), 'battle');
  assert.equal(run('state.battle.phase'), 'deploy');
});

test('CH-002 存档中的旧下标越界时不抛错', () => {
  const { run } = makeGame();
  run("enterStory(1,'normal')");
  run('state.story.index=99');
  assert.doesNotThrow(() => run('storyPage()'), '下标越界应被钳制而不是抛错');
  assert.match(run('storyPage()'), /5 \/ 5/);
});

test('CH-002 胜利结算挂胜利台词，失败结算挂失败台词', () => {
  const { run } = makeGame();
  run("enterStory(1,'normal')");
  run('advanceStory(true)');
  run('finishBattle(state.battle,true)');
  const winLines = run('state.battle.result.lines');
  assert.equal(winLines.length, 3);
  assert.deepEqual(winLines.map(l => l.text), run("beatLinesFor(1,'win')").map(l => l.text));
  assert.match(run('battlePage()'), /story-line/, '结算卡片应渲染台词行');
  assert.match(run('battlePage()'), /渡口安静下来/);

  const g2 = makeGame();
  g2.run("enterStory(1,'normal')");
  g2.run('advanceStory(true)');
  g2.run('finishBattle(state.battle,false)');
  const loseLines = g2.run('state.battle.result.lines');
  assert.equal(loseLines.length, 3);
  assert.deepEqual(loseLines.map(l => l.text), g2.run("beatLinesFor(1,'lose')").map(l => l.text));
  assert.match(g2.run('battlePage()'), /粮车退回渡口/);
});

test('CH-002 非战役模式不挂剧情台词', () => {
  const { run } = makeGame();
  run("startBattle('arena',1,0,'normal')");
  run('finishBattle(state.battle,true)');
  assert.equal(run('state.battle.result.lines').length, 0, '非战役模式不应挂剧情台词');
});

test('CH-002 首章胜利推进进度并写入存档，刷新后保持', () => {
  const { run, entries } = makeGame();
  run("enterStory(1,'normal')");
  run('advanceStory(true)');
  run('finishBattle(state.battle,true)');
  assert.equal(run('state.clearedStages[1]'), true);
  assert.equal(run('state.stageUnlocked'), 2);
  const saved = entries.get('shangshan-shuihu-v1');
  assert.ok(saved, '胜利后应写入存档');
  const reloaded = makeGame(saved);
  assert.equal(reloaded.run('state.clearedStages[1]'), true);
  assert.equal(reloaded.run('state.stageUnlocked'), 2);
  assert.equal(reloaded.run('state.campaignWins'), 1);
});

test('CH-002 首章失败不推进关卡进度', () => {
  const { run, entries } = makeGame();
  run("enterStory(1,'normal')");
  run('advanceStory(true)');
  run('finishBattle(state.battle,false)');
  assert.notEqual(run('state.clearedStages[1]'), true);
  assert.equal(run('state.stageUnlocked'), 1);
  const reloaded = makeGame(entries.get('shangshan-shuihu-v1'));
  assert.equal(reloaded.run('state.stageUnlocked'), 1);
});

test('CH-002 首章台词不含绝对化用语，且标注改编', () => {
  const { run } = makeGame();
  const seg = run('storySegments(1)');
  const banned = ['一定', '必然', '史上最', '100%', '必得', '定能', '必定'];
  const texts = [...seg.open, ...seg.win, ...seg.lose].map(b => b[1]);
  assert.equal(texts.length, 11);
  for (const t of texts) {
    for (const word of banned) {
      assert.ok(!t.includes(word), `台词含绝对化用语「${word}」：${t}`);
    }
  }
  assert.ok(texts.some(t => t.includes('公元 1119 年')), '应保留既有断言所需的纪年句');
  assert.match(fs.readFileSync(path.join(root, 'journey.js'), 'utf8'), /游戏改编/);
});

test('CH-002 其余五关仍只有开场段且不误伤', () => {
  const { run } = makeGame();
  for (let stage = 2; stage <= 6; stage++) {
    const seg = run(`storySegments(${stage})`);
    assert.ok(seg.open.length >= 3, `第 ${stage} 关开场段不应为空`);
    assert.equal(seg.win.length, 0, `第 ${stage} 关暂无胜利段`);
    assert.equal(seg.lose.length, 0, `第 ${stage} 关暂无失败段`);
  }
});

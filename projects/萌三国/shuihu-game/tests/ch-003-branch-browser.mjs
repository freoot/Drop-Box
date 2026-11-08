/* CH-003 首章分支复核的浏览器端实证（不扩章节，只复核第 1 关）。
 *
 * 复核的分支：开场触发 / 胜利 / 失败 / 跳过 / 重入。
 * 全程只用页面按钮操作（不注入 finishBattle），结果与截图写入
 * docs/evidence/CMD-007/story/；任何 pageerror 都会以非零码退出。
 *
 * 依赖与运行（不含任何个人本机路径）：
 *   npm i -D playwright && npx playwright install chromium
 *   或 PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.mjs
 *      PLAYWRIGHT_CHROMIUM_EXECUTABLE=/abs/path/to/chrome-headless-shell
 *   起服务：shuihu-game/tools/serve.sh（默认 8765）
 *   跑本脚本：node tests/ch-003-branch-browser.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const PAGE_URL = `${BASE}/shuihu-game/index.html`;

let chromium;
try {
  ({chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch (e) {
  console.error('无法加载 playwright：' + e.message);
  console.error('请先安装：npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
try {
  const probe = await fetch(PAGE_URL);
  if (!probe.ok) throw new Error('HTTP ' + probe.status);
} catch (e) {
  console.error(`打不开 ${PAGE_URL}（${e.message}）`);
  console.error('请先在仓库根起服务：shuihu-game/tools/serve.sh');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/evidence/CMD-007/story');
fs.mkdirSync(out, {recursive: true});

const launchOpts = {headless: true};
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}
const browser = await chromium.launch(launchOpts);
const allErrors = [];
const shots = [];
const findings = [];

function check(label, ok, detail) {
  findings.push({item: label, pass: !!ok, detail});
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label} — ${detail}`);
}

async function session(label) {
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
  const p = await ctx.newPage();
  p.on('pageerror', e => allErrors.push(`[${label}] ${e}`));
  return {ctx, p};
}
const shot = async (p, name) => {
  await p.screenshot({path: path.join(out, name)});
  shots.push(name);
};

async function enterCampaign(p) {
  await p.goto(PAGE_URL);
  const nameInput = p.locator('#player-name-input');
  if (await nameInput.count()) {
    await nameInput.fill('分支复核客');
    await p.locator('#profile-form button[type=submit]').click();
  }
  await p.waitForSelector('#footer [data-page=campaign]', {timeout: 15000});
  await p.locator('#footer [data-page=campaign]').click();
  await p.waitForSelector('.journey-page', {timeout: 15000});
}

const snap = p => p.evaluate(() => ({
  page: state.page,
  stageUnlocked: state.stageUnlocked,
  stamina: state.stamina,
  cleared: Array.isArray(state.clearedStages) ? state.clearedStages.slice() : state.clearedStages,
  storyIndex: state.story ? state.story.index : null,
  battlePhase: state.battle ? state.battle.phase : null,
  battleTurn: state.battle ? state.battle.turn : null,
  battleResult: state.battle && state.battle.result ? state.battle.result.win : null,
  resultRevealed: state.battle ? state.battle.resultRevealed : null,
  unitAlive: state.battle && Array.isArray(state.battle.units)
    ? state.battle.units.filter(u => u.side === 'ally' && u.hp > 0).length : null,
}));

/* ------------------------------------------------------------ 分支 1：开场 + 跳过 */
{
  const {ctx, p} = await session('opening+skip');
  await enterCampaign(p);
  const before = await snap(p);
  await p.locator('[data-action=campaign-battle][data-difficulty=normal]').first().click();
  await p.waitForSelector('.story-scene', {timeout: 15000});
  const firstBeat = await p.locator('.story-dialogue .eyebrow').innerText();
  const firstText = await p.locator('.story-dialogue p').first().innerText();
  check('开场触发：进入关 1 即播开场', /1\s*\/\s*5/.test(firstBeat), `进度条="${firstBeat}"`);
  check('开场首句为关 1 beats 首条', firstText.includes('公元 1119 年'), `首句="${firstText.slice(0, 24)}…"`);
  await shot(p, '01-opening-first-beat.png');

  // 推进一拍，确认「继续故事」有效
  await p.locator('[data-action=story-next]').click();
  await p.waitForTimeout(150);
  const secondBeat = await p.locator('.story-dialogue .eyebrow').innerText();
  check('开场推进：第二拍生效', /2\s*\/\s*5/.test(secondBeat), `进度条="${secondBeat}"`);

  // 跳过：直接从第 2 拍跳到布阵，不播完开场
  await p.locator('[data-action=story-skip]').click();
  await p.waitForSelector('[data-action=begin-battle]', {timeout: 20000});
  const afterSkip = await snap(p);
  check('跳过分支：中途跳过直接进入布阵', afterSkip.battlePhase === 'deploy',
    `page=${afterSkip.page} phase=${afterSkip.battlePhase}`);
  check('跳过分支：不再停留在剧情页', afterSkip.storyIndex === null, `storyIndex=${afterSkip.storyIndex}`);
  check('跳过分支：体力在进入战斗时已扣除（普通 2）', before.stamina - afterSkip.stamina === 2,
    `${before.stamina} → ${afterSkip.stamina}`);
  await shot(p, '02-skip-to-deploy.png');

  /* ---------------------------------------------------------- 分支 2：胜利 */
  await p.locator('[data-action=begin-battle]').click();
  await p.waitForSelector('[data-action=auto-battle]', {timeout: 20000});
  await p.locator('[data-action=auto-battle]').click();
  await p.waitForSelector('.result-card', {timeout: 120000});
  const winLines = await p.locator('.result-card .story-line').allInnerTexts();
  const winTitle = await p.locator('.result-card h3, .result-card h2, .result-card .eyebrow').first().innerText().catch(() => '');
  check('胜利分支：结算卡片出现胜利台词', winLines.length === 3, `台词 ${winLines.length} 条：${winLines.map(t => t.slice(0, 12)).join(' | ')}`);
  check('胜利分支：台词取自胜利段', winLines.some(t => t.includes('渡口安静下来')),
    `含「渡口安静下来」=${winLines.some(t => t.includes('渡口安静下来'))}`);
  check('胜利分支：结算标题为胜利', /胜/.test(winTitle), `标题="${winTitle}"`);
  await shot(p, '03-win-result.png');
  const afterWin = await snap(p);
  check('胜利后进度推进到第 2 关', afterWin.stageUnlocked === 2, `stageUnlocked=${afterWin.stageUnlocked}`);

  /* ---------------------------------------------------------- 分支 5：重入（已通关后再进） */
  await p.locator('[data-action=battle-return]').click();
  await p.waitForSelector('.journey-page', {timeout: 20000});
  const staminaBeforeReentry = (await snap(p)).stamina;
  await p.locator('[data-action=campaign-battle][data-difficulty=normal]').first().click();
  await p.waitForSelector('.story-scene', {timeout: 15000});
  const reBeat = await p.locator('.story-dialogue .eyebrow').innerText();
  check('重入分支：通关后再进仍从头播开场', /1\s*\/\s*5/.test(reBeat), `进度条="${reBeat}"`);
  await shot(p, '04-reentry-replays-opening.png');
  // 体力在 startBattle（进入战斗）时扣，不在进剧情页时扣——先确认这一点再进入战斗
  const onStory = await snap(p);
  check('重入分支：进入剧情页本身不扣体力', onStory.stamina === staminaBeforeReentry,
    `${staminaBeforeReentry} → ${onStory.stamina}（扣费发生在进入战斗时）`);
  await p.locator('[data-action=story-skip]').click();
  await p.waitForSelector('[data-action=begin-battle]', {timeout: 20000});
  const afterReentry = await snap(p);
  check('重入分支：已通关后再战仍扣满体力（无减免）',
    staminaBeforeReentry - afterReentry.stamina === 2,
    `${staminaBeforeReentry} → ${afterReentry.stamina}`);
  check('重入分支：stageUnlocked 未被重复推进', afterReentry.stageUnlocked === 2,
    `stageUnlocked=${afterReentry.stageUnlocked}`);

  // 更关键的一条：已通关后再打赢一次，进度不能被推到第 3 关
  // （game.js:476 用 Math.max(state.stageUnlocked, stage+1)，此处实测验证）
  await p.locator('[data-action=begin-battle]').click();
  await p.waitForSelector('[data-action=auto-battle]', {timeout: 20000});
  await p.locator('[data-action=auto-battle]').click();
  await p.waitForSelector('.result-card', {timeout: 120000});
  const afterReplay = await snap(p);
  const replayLines = await p.locator('.result-card .story-line').allInnerTexts();
  check('重入分支：重复通关不把进度推到第 3 关', afterReplay.stageUnlocked === 2,
    `stageUnlocked=${afterReplay.stageUnlocked}`);
  check('重入分支：重复通关仍播胜利段台词', replayLines.length === 3,
    `台词 ${replayLines.length} 条`);
  await shot(p, '05-replay-win-still-stage2.png');
  await ctx.close();
}

/* ------------------------------------------------------------ 分支 3：失败（真实判负） */
{
  const {ctx, p} = await session('defeat');
  await enterCampaign(p);
  await p.locator('[data-action=campaign-battle][data-difficulty=normal]').first().click();
  await p.waitForSelector('.story-scene', {timeout: 15000});
  // 真实操作推进完整开场（不跳过），确认末拍按钮变为「进入战场」
  let lastLabel = '';
  for (let i = 0; i < 8; i++) {
    const next = p.locator('[data-action=story-next]');
    if (!(await next.count())) break;
    lastLabel = await next.innerText();
    await next.click();
    await p.waitForTimeout(120);
    if (lastLabel.includes('进入战场')) break;
  }
  check('开场末拍按钮变为「进入战场」', lastLabel.includes('进入战场'), `末拍按钮="${lastLabel}"`);
  await p.waitForSelector('[data-action=begin-battle]', {timeout: 20000});
  await p.locator('[data-action=begin-battle]').click();
  // 提到 3× 速度，让「只结束回合」的判负在可接受时间内自然发生（不改任何游戏逻辑）
  for (let i = 0; i < 2; i++) {
    const speed = p.locator('[data-action=battle-speed]');
    if (await speed.count()) {
      await speed.click();
      await p.waitForTimeout(150);
    }
  }

  // 只点「结束回合」不还手，直到真实判负。
  // 注意：敌方回合内该按钮会被 disabled，直接 locator.click 会一直重试到超时，
  // 所以先判断可用再点（仍是页面上的同一个按钮，不是注入结算）。
  let rounds = 0;
  let lost = false;
  for (let i = 0; i < 1200; i++) {
    if (await p.locator('.result-card').count()) {lost = true; break;}
    const clicked = await p.evaluate(() => {
      const b = document.querySelector('[data-action=end-turn]');
      if (!b || b.disabled) return false;
      b.click();
      return true;
    });
    if (clicked) rounds++;
    await p.waitForTimeout(80);
  }
  if (!lost) {
    const dbg = await snap(p);
    console.log('DEBUG 未出现结算：' + JSON.stringify(dbg));
    await shot(p, 'debug-defeat-state.png');
  }
  check('失败分支：只结束回合可真实判负', lost, `结束回合 ${rounds} 次后出现结算`);
  if (lost) {
    const loseLines = await p.locator('.result-card .story-line').allInnerTexts();
    check('失败分支：结算卡片出现失败台词', loseLines.length === 3, `台词 ${loseLines.length} 条`);
    check('失败分支：台词取自失败段', loseLines.some(t => t.includes('粮车退回渡口')),
      `含「粮车退回渡口」=${loseLines.some(t => t.includes('粮车退回渡口'))}`);
    await shot(p, '06-defeat-result.png');
    const afterLose = await snap(p);
    check('失败后进度不推进', afterLose.stageUnlocked === 1, `stageUnlocked=${afterLose.stageUnlocked}`);
    // 失败后重新挑战
    await p.locator('[data-action=battle-return]').click();
    await p.waitForSelector('.journey-page', {timeout: 20000});
    await p.locator('[data-action=campaign-battle][data-difficulty=normal]').first().click();
    await p.waitForSelector('.story-scene', {timeout: 15000});
    check('失败后可重新进入关 1 并再次播开场',
      /1\s*\/\s*5/.test(await p.locator('.story-dialogue .eyebrow').innerText()), '进度条=1/5');
    await shot(p, '07-retry-after-defeat.png');
  }
  await ctx.close();
}

await browser.close();

const failed = findings.filter(f => !f.pass);
console.log(`\n分支复核：共 ${findings.length} 项，PASS ${findings.length - failed.length}，FAIL ${failed.length}`);
console.log(`截图 ${shots.length} 张 → docs/evidence/CMD-007/story/`);
fs.writeFileSync(path.join(out, 'branch-check.json'),
  JSON.stringify({findings, shots, pageErrors: allErrors}, null, 1));
console.log(`pageError 总数=${allErrors.length}`);
for (const e of allErrors) console.error('PAGEERROR ' + e);

if (failed.length || allErrors.length) process.exit(1);
console.log('CH003_BRANCH_OK');

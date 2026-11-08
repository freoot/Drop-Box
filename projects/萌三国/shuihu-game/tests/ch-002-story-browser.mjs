/* CH-002 首章单关剧情接入的浏览器端实证。
 *
 * 截图写入**持久证据目录** docs/evidence/CH-002/，不再放 /tmp。
 *
 * 依赖与运行（不含任何个人本机路径）：
 *   1) 安装 playwright（本工程不携带 node_modules，需自行安装）：
 *        npm i -D playwright
 *        npx playwright install chromium
 *   2) 若本机已有其它位置的 playwright，可用环境变量指向它（可选）：
 *        PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.mjs
 *        PLAYWRIGHT_CHROMIUM_EXECUTABLE=/abs/path/to/chrome-headless-shell
 *   3) 起本地静态服务（必须在仓库根起，页面按相对路径加载 data/ 与 assets/）：
 *        shuihu-game/tools/serve.sh            # 默认 8765
 *        PORT=9000 shuihu-game/tools/serve.sh
 *   4) 跑本脚本：
 *        node tests/ch-002-story-browser.mjs
 *        BASE_URL=http://127.0.0.1:9000 node tests/ch-002-story-browser.mjs
 *
 * 用例分两类，截图命名即标注：
 *   - **真实操作**：*real-battle-*.png / *retry-*.png / *after-reload*.png
 *     全程只用页面按钮（推进剧情 → 布阵完成 · 开战 → 自动/结束回合 → 返回）
 *   - **注入测试**：*injected*.png
 *     用 evaluate 直接调用 finishBattle 强制结算，只证明结算卡片渲染，
 *     不代表真实战斗结果；截图时会在页面顶部插入红色标注条说明这一点。
 *
 * 任何 pageerror 都会导致本脚本以非零码退出。
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const PAGE_URL = `${BASE}/shuihu-game/index.html`;

// 依赖解析：默认从 node_modules 取 playwright，失败时给出可复制的安装命令
let chromium;
try {
  ({chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch (e) {
  console.error('无法加载 playwright：' + e.message);
  console.error('请先安装依赖：npm i -D playwright && npx playwright install chromium');
  console.error('或指向已有安装：PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.mjs');
  process.exit(2);
}

// 服务可用性自检：没起服务时给出明确指引，而不是超时后一堆难懂的报错
try {
  const probe = await fetch(PAGE_URL);
  if (!probe.ok) throw new Error('HTTP ' + probe.status);
} catch (e) {
  console.error(`打不开 ${PAGE_URL}（${e.message}）`);
  console.error('请先在**仓库根**起服务：shuihu-game/tools/serve.sh');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/evidence/CH-002');
fs.mkdirSync(out, {recursive: true});

const launchOpts = {headless: true};
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}
const browser = await chromium.launch(launchOpts);

const shots = [];
const allErrors = [];

async function session(label) {
  const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
  const p = await ctx.newPage();
  p.on('pageerror', e => allErrors.push(`[${label}] ${e}`));
  return {ctx, p, label};
}
const shot = async (p, name) => {
  await p.screenshot({path: path.join(out, name), fullPage: false});
  shots.push(name);
};

/** 进入征战地图；若存档不存在则先取名 */
async function enterCampaign(p) {
  await p.goto(PAGE_URL);
  const nameInput = p.locator('#player-name-input');
  if (await nameInput.count()) {
    await nameInput.fill('巡寨测试客');
    await p.locator('#profile-form button[type=submit]').click();
  }
  await p.waitForSelector('#footer [data-page=campaign]', {timeout: 15000});
  await p.locator('#footer [data-page=campaign]').click();
  await p.waitForSelector('.journey-page', {timeout: 15000});
}

/** 进入第 1 关并推进到部署阶段 */
async function enterStage1Deploy(p, {skipStory = false} = {}) {
  await p.locator('[data-action=campaign-battle][data-difficulty=normal]').first().click();
  await p.waitForSelector('.story-scene', {timeout: 15000});
  if (skipStory) {
    await p.locator('[data-action=story-skip]').click();
  } else {
    // 真实操作：连续点「继续故事」直到末拍，再进入战场
    for (let i = 0; i < 8; i++) {
      const next = p.locator('[data-action=story-next]');
      if (!(await next.count())) break;
      const label = await next.innerText();
      await next.click();
      await p.waitForTimeout(120);
      if (label.includes('进入战场')) break;
    }
  }
  await p.waitForSelector('[data-action=begin-battle]', {timeout: 20000});
}

/** 把战斗速度切到最快（速度按钮为 1× → 2× → 3× 循环，点两次到 3×） */
async function maxSpeed(p) {
  const sp = p.locator('[data-action=battle-speed]');
  if (!(await sp.count())) return;
  await sp.click();
  await p.waitForTimeout(80);
  await sp.click();
  await p.waitForTimeout(80);
}

/** 真实操作打完一场：布阵完成 · 开战 → 自动战斗 → 等结算 */
async function fightAuto(p, timeoutMs = 120000) {
  await maxSpeed(p);
  await p.locator('[data-action=begin-battle]').click();
  await p.waitForTimeout(300);
  await p.locator('[data-action=auto-battle]').click();
  await p.waitForSelector('.result-card', {timeout: timeoutMs});
}

/** 真实操作打到失败：开战后只点「结束回合」不还手，直到分出胜负 */
async function fightByEndTurnOnly(p, timeoutMs = 180000) {
  await maxSpeed(p);
  await p.locator('[data-action=begin-battle]').click();
  await p.waitForTimeout(300);
  const deadline = Date.now() + timeoutMs;
  let clicks = 0;
  while (Date.now() < deadline) {
    if (await p.locator('.result-card').count()) break;
    const endTurn = p.locator('[data-action=end-turn]');
    if ((await endTurn.count()) && !(await endTurn.isDisabled().catch(() => true))) {
      await endTurn.click();
      clicks++;
    }
    await p.waitForTimeout(200);
  }
  await p.waitForSelector('.result-card', {timeout: 30000});
  return clicks;
}

let failed = null;
try {
  // ---------- 场次 1：真实操作打赢第 1 关 → 返回 → 刷新恢复 ----------
  {
    const {ctx, p} = await session('real-win');
    await enterCampaign(p);
    await shot(p, '01-campaign-map.png');

    // 开场段：断言 1 / 5 后逐拍推进到 5 / 5
    await p.locator('[data-action=campaign-battle][data-difficulty=normal]').first().click();
    await p.waitForSelector('.story-scene', {timeout: 15000});
    const first = await p.locator('.story-dialogue .eyebrow').innerText();
    assert.match(first, /1 \/ 5/, `开场进度分母应为 5，实际：${first}`);
    await shot(p, '02-story-opening.png');
    // 逐拍推进直到末拍（末拍按钮会变成「进入战场」，故先停在 5 / 5 再单独点）
    for (let i = 0; i < 8; i++) {
      const cur = await p.locator('.story-dialogue .eyebrow').innerText();
      if (/5 \/ 5/.test(cur)) break;
      await p.locator('[data-action=story-next]').click();
      await p.waitForTimeout(120);
    }
    const last = await p.locator('.story-dialogue .eyebrow').innerText();
    assert.match(last, /5 \/ 5/, `末拍应为 5 / 5，实际：${last}`);
    await shot(p, '03-story-last-beat.png');

    // 末拍按钮进入战场
    await p.locator('[data-action=story-next]').click();
    await p.waitForSelector('[data-action=begin-battle]', {timeout: 20000});
    await shot(p, '04-battle-deploy.png');

    await fightAuto(p);
    const win = await p.evaluate(() => state.battle?.result?.win);
    assert.equal(win, true, '正常操作（开战 + 自动）应当取得胜利');
    const winLines = await p.locator('.result-card .story-line').count();
    assert.equal(winLines, 3, `胜利结算应渲染 3 条台词，实际 ${winLines}`);
    const winText = await p.locator('.result-card .story-lines').innerText();
    assert.match(winText, /渡口安静下来/, '胜利台词未出现');
    await shot(p, '09-real-battle-win.png');

    // 返回 → 进度推进
    await p.locator('[data-action=battle-return]').click();
    await p.waitForTimeout(400);
    const unlocked = await p.evaluate(() => state.stageUnlocked);
    assert.equal(unlocked, 2, `通关后 stageUnlocked 应推进到 2，实际 ${unlocked}`);

    // 刷新恢复：reload 后进度与名字应保持
    await p.reload();
    await p.waitForSelector('#footer [data-page=campaign]', {timeout: 15000});
    const after = await p.evaluate(() => ({
      unlocked: state.stageUnlocked,
      name: state.playerName,
      cleared: Object.keys(state.clearedStages || {}).length,
    }));
    assert.equal(after.unlocked, 2, `刷新后进度应保持 2，实际 ${after.unlocked}`);
    assert.equal(after.name, '巡寨测试客', `刷新后名字应保持，实际 ${after.name}`);
    assert.ok(after.cleared >= 1, `刷新后通关记录应保留，实际 ${after.cleared}`);
    await shot(p, '10-after-reload.png');
    console.log('场次1（真实胜利 + 刷新恢复）完成');
    await ctx.close();
  }

  // ---------- 场次 2：真实操作打到失败 → 重试再战 ----------
  {
    const {ctx, p} = await session('real-lose');
    await enterCampaign(p);
    await enterStage1Deploy(p, {skipStory: true});

    const beforeUnlocked = await p.evaluate(() => state.stageUnlocked);
    const turns = await fightByEndTurnOnly(p);
    const lost = await p.evaluate(() => state.battle?.result?.win);
    assert.equal(lost, false, `只点「结束回合」不还手应当判负，实际 win=${lost}`);
    const loseLines = await p.locator('.result-card .story-line').count();
    assert.equal(loseLines, 3, `失败结算应渲染 3 条台词，实际 ${loseLines}`);
    const loseText = await p.locator('.result-card .story-lines').innerText();
    assert.match(loseText, /粮车退回渡口/, '失败台词未出现');
    const afterUnlocked = await p.evaluate(() => state.stageUnlocked);
    assert.equal(afterUnlocked, beforeUnlocked,
      `失败后不应推进关卡：before=${beforeUnlocked} after=${afterUnlocked}`);
    await shot(p, '11-real-battle-lose.png');
    console.log(`场次2（真实失败）：结束回合 ${turns} 次后判负，进度保持 ${afterUnlocked}`);

    // 重试：返回后再次正常开战并取胜
    await p.locator('[data-action=battle-return]').click();
    await p.waitForTimeout(400);
    await enterStage1Deploy(p, {skipStory: true});
    await fightAuto(p);
    const retryWin = await p.evaluate(() => state.battle?.result?.win);
    assert.equal(retryWin, true, '失败重试后正常操作应当取胜');
    await shot(p, '12-retry-after-lose.png');
    console.log('场次2（失败后重试）完成');
    await ctx.close();
  }

  // ---------- 场次 3：注入测试（强制结算，仅验证展示） ----------
  {
    const {ctx, p} = await session('injected');
    await enterCampaign(p);
    await enterStage1Deploy(p, {skipStory: true});
    await p.evaluate(() => {
      const d = document.createElement('div');
      d.textContent = '注入测试：本图由脚本 evaluate 直接调用 finishBattle 生成，只验证结算文案渲染，非真实战斗结果';
      d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#b3261e;color:#fff;font-size:14px;line-height:1.5;padding:6px 10px;text-align:center';
      document.body.appendChild(d);
    });
    await p.evaluate(() => {finishBattle(state.battle, true); render();});
    await p.waitForTimeout(400);
    const n1 = await p.locator('.result-card .story-line').count();
    assert.equal(n1, 3, `注入胜利结算应渲染 3 条台词，实际 ${n1}`);
    await shot(p, '05-result-win-injected.png');
    await ctx.close();
  }
  {
    const {ctx, p} = await session('injected-lose');
    await enterCampaign(p);
    await enterStage1Deploy(p, {skipStory: true});
    await p.evaluate(() => {
      const d = document.createElement('div');
      d.textContent = '注入测试：本图由脚本 evaluate 直接调用 finishBattle(false) 生成，只验证结算文案渲染，非真实战斗结果';
      d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#b3261e;color:#fff;font-size:14px;line-height:1.5;padding:6px 10px;text-align:center';
      document.body.appendChild(d);
    });
    await p.evaluate(() => {finishBattle(state.battle, false); render();});
    await p.waitForTimeout(400);
    const n2 = await p.locator('.result-card .story-line').count();
    assert.equal(n2, 3, `注入失败结算应渲染 3 条台词，实际 ${n2}`);
    const t2 = await p.locator('.result-card .story-lines').innerText();
    assert.match(t2, /粮车退回渡口/, '失败台词未出现');
    await shot(p, '06-result-lose-injected.png');
    await ctx.close();
  }

  // ---------- 场次 4：音乐试听 + 动作预览 ----------
  {
    const {ctx, p} = await session('media');
    await p.goto(`${BASE}/shuihu-game/audio-audition.html`);
    await p.waitForSelector('#status', {timeout: 15000});
    await p.waitForTimeout(900);
    const status = await p.locator('#status').innerText();
    assert.match(status, /已载入默认曲 2 首、候选曲 5 首/, `试听页载入异常：${status}`);
    await shot(p, '07-audio-audition.png');

    await p.goto(`${BASE}/shuihu-game/docs/motion/ACT-004/03_preview/preview.html`);
    await p.waitForTimeout(1200);
    await shot(p, '08-action-preview.png');
    await ctx.close();
  }
} catch (e) {
  failed = e;
  console.error('CH002_BROWSER_FAIL', e.message);
} finally {
  await browser.close();
}

console.log('截图目录：' + out);
console.log(shots.join('\n'));
console.log(`pageerror 总数=${allErrors.length}`);
if (allErrors.length) console.log(allErrors.join('\n'));

if (failed) process.exitCode = 1;
else if (allErrors.length) {
  console.error('CH002_BROWSER_FAIL：存在未捕获的 pageerror');
  process.exitCode = 1;
} else {
  console.log('CH002_BROWSER_OK shots=' + shots.length);
}

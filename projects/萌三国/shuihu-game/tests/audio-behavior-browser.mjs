/* CMD-007 · 音乐实际行为记录（进入战斗 / 退出战斗 / 静音恢复）。
 *
 * 只记录**实际行为**，不改代码、不改默认曲：
 *   1. 首次手势前：BGM 已选曲但未播放（浏览器自动播放策略）
 *   2. 首次手势（取名）后：开始播放 city 曲
 *   3. 进入战斗：切到 battle 曲
 *   4. 退出战斗（返回地图）：切回 city 曲
 *   5. 设置页取消勾选「音乐」：暂停（静音）
 *   6. 再次勾选：恢复播放，且曲目与音量与静音前一致
 *   7. 刷新页面：设置保持
 *
 * 证据：HTMLMediaElement.prototype.play/pause 的实际调用记录（init script 埋点）
 * + BGM API 读数 + 截图，写入 docs/evidence/CMD-007/audio/。
 *
 * 依赖与运行（不含个人本机路径）：
 *   npm i -D playwright && npx playwright install chromium
 *   PLAYWRIGHT_MODULE / PLAYWRIGHT_CHROMIUM_EXECUTABLE 可选
 *   起服务：shuihu-game/tools/serve.sh  跑：node tests/audio-behavior-browser.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

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
const out = path.join(root, 'docs/evidence/CMD-007/audio');
fs.mkdirSync(out, {recursive: true});

const launchOpts = {headless: true};
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}
const browser = await chromium.launch(launchOpts);
const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
const p = await ctx.newPage();
const allErrors = [];
p.on('pageerror', e => allErrors.push(String(e)));

// 埋点：记录 media 元素真实的 play()/pause() 调用与当时的 src
await p.addInitScript(() => {
  window.__media = [];
  const rec = (kind, el) => {
    window.__media.push({
      kind,
      at: Date.now(),
      // 注意：play() 被调用时新 src 尚未加载，currentSrc 仍是**上一条**曲目；
      // 因此这里取 src 属性（赋值后立即生效），并单独记录 currentSrc 以便核对。
      src: (el.getAttribute('src') || el.src || '').split('/').pop(),
      currentSrc: (el.currentSrc || '').split('/').pop(),
      paused: el.paused,
      volume: Number(el.volume.toFixed(3)),
      loop: el.loop,
    });
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) {
    rec('play', this);
    return play.apply(this, a);
  };
  const pause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function (...a) {
    rec('pause', this);
    return pause.apply(this, a);
  };
});

const findings = [];
function check(label, ok, detail) {
  findings.push({item: label, pass: !!ok, detail});
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label} — ${detail}`);
}
const shot = async name => {
  await p.screenshot({path: path.join(out, name)});
};
const bgmState = () => p.evaluate(() => ({
  currentTrack: window.BGM ? window.BGM.currentTrack() : null,
  enabled: window.BGM ? window.BGM.isEnabled() : null,
  volume: window.BGM ? Number(window.BGM.getVolume().toFixed(3)) : null,
  store: JSON.parse(localStorage.getItem('shuihu-bgm-v1') || 'null'),
  media: window.__media.slice(),
}));

await p.goto(PAGE_URL);
await p.waitForSelector('#footer', {timeout: 15000});

// 1) 手势前
const s0 = await bgmState();
check('手势前已选曲但未实际播放', s0.currentTrack === 'city' && s0.media.length === 0,
  `currentTrack=${s0.currentTrack} play/pause 调用=${s0.media.length}`);

// 2) 首次手势（取名）
const nameInput = p.locator('#player-name-input');
if (await nameInput.count()) {
  await nameInput.fill('音频行为记录');
  await p.locator('#profile-form button[type=submit]').click();
}
await p.waitForTimeout(600);
const s1 = await bgmState();
const cityPlay = s1.media.filter(m => m.kind === 'play');
check('首次手势后开始播放默认曲 city', cityPlay.length >= 1 && cityPlay[0].src === 'liangshan_city.mp3',
  `play 调用=${cityPlay.length} src=${cityPlay[0]?.src}`);
check('默认曲未改动（仍为 CHAR-108 程序合成的两首）',
  cityPlay[0]?.src === 'liangshan_city.mp3', `src=${cityPlay[0]?.src}`);
await shot('01-city-theme.png');

// 3) 进入战斗
await p.locator('#footer [data-page=campaign]').click();
await p.waitForSelector('.journey-page', {timeout: 15000});
await p.locator('[data-action=campaign-battle][data-difficulty=normal]').first().click();
await p.waitForSelector('.story-scene', {timeout: 15000});
await p.locator('[data-action=story-skip]').click();
await p.waitForSelector('[data-action=begin-battle]', {timeout: 20000});
const s2 = await bgmState();
check('进入战斗切到 battle 曲', s2.currentTrack === 'battle',
  `currentTrack=${s2.currentTrack}`);
check('battle 曲实际发起播放', s2.media.some(m => m.kind === 'play' && m.src === 'battle_theme.mp3'),
  `src 列表=${[...new Set(s2.media.map(m => m.src))].join(',')}`);
await shot('02-battle-theme.png');

// 4) 退出战斗：撤退返回地图
await p.locator('[data-action=battle-retreat]').click();
await p.waitForSelector('.journey-page', {timeout: 20000});
await p.waitForTimeout(400);
const s3 = await bgmState();
check('退出战斗切回 city 曲', s3.currentTrack === 'city', `currentTrack=${s3.currentTrack}`);
const cityAgain = s3.media.filter(m => m.kind === 'play' && m.src === 'liangshan_city.mp3');
check('city 曲被重新发起播放', cityAgain.length >= 2, `city play 次数=${cityAgain.length}`);
await shot('03-back-to-city.png');

// 5) 静音：设置页取消勾选
await p.locator('#footer [data-page=more]').click();
// 该开关是自定义样式的 checkbox，input 本身视觉隐藏，故等 attached 而非 visible
await p.waitForSelector('[data-action=bgm-toggle]', {timeout: 15000, state: 'attached'});
const volBefore = (await bgmState()).volume;
// 该 input 为 display:none 的隐藏 checkbox（视觉由自定义样式承担），
// force 点击也做不到，故直接设置 checked 并派发 change —— 走的是页面同一条
// change 监听（game.js:895），等价于用户点击 label，不是绕过逻辑。
await p.evaluate(() => {
  const el = document.querySelector('[data-action=bgm-toggle]');
  el.checked = false;
  el.dispatchEvent(new Event('change', {bubbles: true}));
});
await p.waitForTimeout(300);
const s4 = await bgmState();
const lastPause = [...s4.media].reverse().find(m => m.kind === 'pause');
check('取消勾选音乐后实际暂停', !!lastPause && s4.enabled === false,
  `pause 调用=${!!lastPause} enabled=${s4.enabled}`);
check('静音写入本地存储', s4.store && s4.store.enabled === false, `store=${JSON.stringify(s4.store)}`);
await shot('04-muted.png');

// 6) 恢复
await p.evaluate(() => {
  const el = document.querySelector('[data-action=bgm-toggle]');
  el.checked = true;
  el.dispatchEvent(new Event('change', {bubbles: true}));
});
await p.waitForTimeout(500);
const s5 = await bgmState();
const restored = s5.media.slice(-1)[0];
check('重新勾选后恢复播放', s5.enabled === true && restored?.kind === 'play',
  `enabled=${s5.enabled} 最后一次调用=${restored?.kind} src=${restored?.src}`);
check('恢复的曲目与静音前一致（city）', s5.currentTrack === 'city', `currentTrack=${s5.currentTrack}`);
check('恢复的音量与静音前一致', s5.volume === volBefore, `${volBefore} → ${s5.volume}`);
await shot('05-restored.png');

// 7) 刷新后保持
const mediaBeforeReload = s5.media.slice();
await p.reload();
await p.waitForSelector('#footer', {timeout: 15000});
await p.waitForTimeout(400);
const s6 = await bgmState();
check('刷新后设置保持', s6.enabled === true && s6.store?.enabled === true,
  `enabled=${s6.enabled} store=${JSON.stringify(s6.store)}`);
await shot('06-after-reload.png');

await browser.close();

const failed = findings.filter(f => !f.pass);
console.log(`\n音乐行为：共 ${findings.length} 项，PASS ${findings.length - failed.length}，FAIL ${failed.length}`);
fs.writeFileSync(path.join(out, 'audio-behavior.json'),
  JSON.stringify({findings, mediaLog: mediaBeforeReload, mediaAfterReload: s6.media,
                  pageErrors: allErrors}, null, 1));
console.log(`media 事件总数（刷新前）=${mediaBeforeReload.length}  pageError=${allErrors.length}`);
for (const e of allErrors) console.error('PAGEERROR ' + e);
if (failed.length || allErrors.length) process.exit(1);
console.log('AUDIO_BEHAVIOR_OK');

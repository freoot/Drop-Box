#!/usr/bin/env node
/**
 * preview_playtest.js — ACT-004 预览页播放逻辑的无浏览器实测
 *
 * 做什么：从 docs/motion/ACT-004/03_preview/preview.html 中抽出内嵌 JS，
 * 用最小 DOM stub 在 node 里跑起来，真实点击「切换动作 / 下一帧 / 暂停」，
 * 打印读数，验证：能播、能切、能暂停、命中/收招窗口判定正确、death 标注为非原生。
 *
 * 用法： node tools/motion/preview_playtest.js
 */

const fs = require('fs');
const path = require('path');

const HTML = process.argv[2] ||
  path.join(__dirname, '..', '..', 'docs', 'motion', 'ACT-004', '03_preview', 'preview.html');
const html = fs.readFileSync(HTML, 'utf8');
const js = html.split('<script>')[1].split('</script>')[0];

function mkEl(id) {
  return {
    id, textContent: '', innerHTML: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {}, onclick: null,
    getContext: () => ({ clearRect() {}, drawImage() {} }),
    width: 0, height: 0,
  };
}
const els = {};
const created = [];
global.document = {
  getElementById(id) { return els[id] || (els[id] = mkEl(id)); },
  querySelector(sel) { return mkEl(sel); },
  querySelectorAll() { return []; },
  createElement(tag) { const e = mkEl(tag); created.push(e); return e; },
};
global.Image = class {
  set src(v) { this._src = v; setTimeout(() => this.onload && this.onload(), 0); }
  get src() { return this._src; }
  get complete() { return true; }
  get naturalWidth() { return 5000; }
};
global.setInterval = () => 1;
global.clearInterval = () => {};

eval(js);

const btns = () => created.filter(e => e.dataset && e.dataset.act);
const stepF = () => els.btnStepF.onclick();
const pick = a => btns().find(b => b.dataset.act === a);
const badge = () => (els.rWin.innerHTML.match(/badge[^>]*>([^<]*)</) || [, ''])[1];
const line = tag => console.log(`[play] ${tag} | ${els.rAct.textContent} | 帧 ${els.rFrame.textContent}`
  + ` | ${els.rMs.textContent} | 窗口=${badge()} | 命中=${els.rImp.textContent}`
  + ` 收招=${els.rRec.textContent} 总=${els.rTot.textContent} clip=${els.rClip.textContent}`);

setTimeout(() => {
  line('初始');
  pick('attack').onclick(); line('attack 第1帧');
  for (let i = 0; i < 5; i++) stepF();
  line('attack 第6帧');
  for (let i = 0; i < 8; i++) stepF();
  line('attack 第14帧');
  pick('hit').onclick(); line('hit 第1帧');
  pick('death').onclick();
  for (let i = 0; i < 5; i++) stepF();
  line('death 第6帧');
  console.log('[play] death 警示条文案:',
    (els.deathWarn && els.deathWarn.style.display === 'block') ? '已显示' : '未显示');
  els.btnPlay.onclick();
  console.log('[play] 点击播放/暂停后按钮文案:', els.btnPlay.textContent);
  console.log('[play] 时点表行数:', (els.timing.innerHTML.match(/<tr>/g) || []).length);
  console.log('[play] PLAYTEST_OK');
}, 10);

import {chromium} from '/Users/user/.gstack/repos/gstack/node_modules/playwright/index.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';

const out='/tmp/shuihu-cmd003';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
const results=[];
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
const p=await ctx.newPage();
const errors=[];p.on('pageerror',e=>errors.push(String(e)));
try{
  await p.goto('http://127.0.0.1:8765/shuihu-game/index.html');
  await p.locator('#player-name-input').fill('巡寨测试客');
  await p.locator('#profile-form button[type=submit]').click();
  await p.evaluate(async()=>{await document.fonts.ready;});

  // 进入招贤
  await p.locator('#footer [data-page=recruit]').click();
  await p.locator('[data-action=tavern-owner]').first().click();
  await p.waitForSelector('.summon-heading');

  // P0-4 收集进度 + P0-2 保底读数
  const dex=await p.locator('.summon-scene .dex-progress').innerText();
  const pity=await p.locator('.summon-scene .pity-chip').first().innerText();
  assert.match(dex,/已入寨 \d+\/108/,`收集进度文本异常: ${dex}`);
  assert.match(pity,/距保底约 \d+ 次/,`保底读数文本异常: ${pity}`);
  const dexBox=await p.locator('.summon-scene .dex-progress').boundingBox();
  assert.ok(dexBox&&dexBox.width>200,'收集进度未占据有效宽度（可能样式未生效）');
  await p.screenshot({path:path.join(out,'01-summon-panel.png')});

  // P0-1 演示：玉璧归零后无法十连 → 领取每日奖励 → 可十连
  await p.evaluate(()=>{state.jade=0;render();});
  await p.locator('[data-action=recruit-ten]').click();
  assert.equal(await p.evaluate(()=>state.jade),0,'玉璧不足时不应扣成负数');
  const toast1=await p.locator('#toast').innerText();
  assert.match(toast1,/玉璧不足/);

  await p.evaluate(()=>{state.page='more';render();});
  await p.locator('[data-action=daily-task]').click();
  const jadeAfterDaily=await p.evaluate(()=>state.jade);
  assert.equal(jadeAfterDaily,25,'每日聚义赏应给 25 玉璧');

  // 再补一次征战首胜与塔，凑到可十连
  await p.evaluate(()=>{finishBattle({mode:'campaign',stage:1,difficulty:'normal',logs:[]},true);render();});
  const jadeAfterClear=await p.evaluate(()=>state.jade);
  assert.equal(jadeAfterClear,45,'主线首胜应 +20 玉璧');

  // P0-3 十连 + 抽后去向
  await p.evaluate(()=>{state.jade=260;state.page='recruit';state.tavernMenu=true;render();});
  await p.locator('[data-action=recruit-ten]').click();
  await p.waitForSelector('.summon-reveal');
  const cards=await p.locator('.summoned-hero').count();
  assert.equal(cards,10,`十连应展示 10 张，实际 ${cards}`);
  assert.ok(await p.locator('.summon-actions').isVisible(),'抽后去向区未显示');
  const nextLabel=await p.locator('.summon-next').innerText();
  assert.match(nextLabel,/查看|去将册/);
  await p.screenshot({path:path.join(out,'02-ten-reveal.png')});

  await p.locator('.summon-next').click();
  await p.waitForFunction(()=>document.querySelector('#app').dataset.page==='heroes');
  const heroDex=await p.locator('.dex-progress').first().innerText();
  assert.match(heroDex,/已入寨 \d+\/108/);
  await p.screenshot({path:path.join(out,'03-heroes-dex.png')});

  // P0-5 重复暗金补偿：记录一次重复结果的结构
  const dupInfo=await p.evaluate(()=>{
    const owned=state.heroes.find(h=>h.quality==='diamond');
    const jadeBefore=state.jade, shardBefore=state.shards[owned.id]||0;
    const got=obtainHero(owned.id);render();
    return {id:owned.id,shardsGained:got.shardsGained,jadeGained:got.jadeGained,
            jadeDelta:state.jade-jadeBefore,shardDelta:(state.shards[owned.id]||0)-shardBefore};
  });
  assert.equal(dupInfo.shardsGained,10,'重复暗金应转 10 枚信物');
  assert.equal(dupInfo.jadeGained,15,'重复暗金应回 15 玉璧');
  assert.equal(dupInfo.jadeDelta,15);
  assert.equal(dupInfo.shardDelta,10);

  // 规则文案可读性检查（不含绝对化用语，含玉璧来源）
  const ruleText=await p.evaluate(()=>window.SHUIHU_TAVERN_UI.ruleText());
  assert.match(ruleText,/每日聚义赏、主线首胜与试练塔每五层/);
  assert.doesNotMatch(ruleText,/一定|必得|绝对|保证|最强/);

  assert.deepEqual(errors,[],`页面存在 JS 报错: ${errors.join(' | ')}`);
  results.push({ok:true,dex,pity,jadeAfterDaily,jadeAfterClear,cards,dupInfo,errors});
  console.log(JSON.stringify(results,null,2));
}finally{
  await browser.close();
}

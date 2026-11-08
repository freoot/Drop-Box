import { chromium } from '/Users/user/.gstack/repos/gstack/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:8765/shuihu-game/';
const out=path.resolve(import.meta.dirname,'../assets/releases/ENG-002/evidence');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
const results=[];
try{
 for(const [name,width,height] of [['desktop',1440,900],['portrait',390,844],['landscape',844,390]]){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'index.html');
  await page.locator('#player-name-input').fill('回归测试客');await page.locator('#profile-form button[type="submit"]').click();
  await page.locator('[data-action="collect-tax"]').click();await page.locator('[data-action="collect-grain"]').click();
  assert.equal(await page.locator('[data-action="collect-tax"]').isDisabled(),true);
  assert.equal(await page.locator('[data-action="collect-grain"]').isDisabled(),true);
  await page.screenshot({path:path.join(out,name+'-city.png'),fullPage:true});
  await page.locator('#footer [data-page="more"]').click();
  const slider=page.locator('[data-action="bgm-volume"]');
  await slider.focus();await slider.press('Home');await slider.press('ArrowRight');
  assert.equal(await page.evaluate(()=>BGM.getVolume()),.05);
  assert.equal(await page.locator('a[href="combat-motion-studio.html"]').getAttribute('target'),'_blank');
  await page.screenshot({path:path.join(out,name+'-more.png'),fullPage:true});
  await page.locator('#footer [data-page="recruit"]').click();
  await page.locator('[data-action="tavern-owner"]').first().click();
  assert.equal(await page.locator('.tavern-dialog').count(),1);
  await page.screenshot({path:path.join(out,name+'-recruit.png'),fullPage:true});
  await page.locator('[data-action="tavern-close"]').click();
  await page.locator('#footer [data-page="campaign"]').click();
  await page.screenshot({path:path.join(out,name+'-campaign.png'),fullPage:true});
  // A-level isolated state fixture: UI navigation/cancellation is exercised with real clicks.
  await page.evaluate(()=>startBattle('campaign',1));
  assert.equal(await page.evaluate(()=>state.stamina),98);
  await page.reload();await page.locator('[data-action="battle-retreat"]').click();
  assert.equal(await page.evaluate(()=>state.stamina),100);
  await page.reload();assert.equal(await page.evaluate(()=>state.stamina),100);
  assert.equal(await page.evaluate(()=>state.playerName),'回归测试客');
  assert.deepEqual(errors,[]);
  results.push({name,width,height,pageErrors:errors,checks:'naming, city claims, keyboard music slider, recruit dialog, campaign deploy cancel across reload'});
  await context.close();
 }
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({date:new Date().toISOString(),base,results},null,2));
 console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}

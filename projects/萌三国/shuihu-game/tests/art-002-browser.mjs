import {chromium} from '/Users/user/.gstack/repos/gstack/node_modules/playwright/index.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const out=path.resolve(import.meta.dirname,'../assets/releases/ART-002/evidence');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
const results=[];
try{for(const [name,width,height] of [['desktop',1440,900],['portrait',390,844],['landscape',844,390]]){
 const ctx=await browser.newContext({viewport:{width,height}}),p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.goto('http://127.0.0.1:8765/shuihu-game/index.html');await p.locator('#player-name-input').fill('巡寨测试客');await p.locator('#profile-form button[type=submit]').click();
 await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});
 const pages=['heroes','activity','recruit','gear','arena','tower','market','campaign'];
 for(const target of pages){const spot=p.locator('.city-spot[data-page="'+target+'"]');await spot.scrollIntoViewIfNeeded();const visible=await spot.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el.contains(hit);});assert.equal(visible,true,`${name}: ${target} is covered`);await spot.click();assert.equal(await p.locator('#app').getAttribute('data-page'),target);await p.locator('#footer [data-page=city]').click();}
 await p.locator('.city-spot[data-page="market"]').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(out,name+'-east.png')});
 await p.evaluate(()=>{document.querySelector('.city-stage-scroll').scrollLeft=0;document.querySelector('#screen').scrollTop=0});await p.screenshot({path:path.join(out,name+'-west.png')});
 assert.equal(await p.locator('.city-pan-hint').evaluate(el=>Number(getComputedStyle(el).opacity)),1);
 const geometry=await p.evaluate(()=>{const map=document.querySelector('.city-stage').getBoundingClientRect(),note=document.querySelector('.city-footer-note').getBoundingClientRect(),footer=document.querySelector('#footer').getBoundingClientRect();return {mapRatio:map.width/map.height,bottomGap:footer.top-note.bottom};});assert.ok(Math.abs(geometry.mapRatio-16/9)<.02);if(name==='portrait')assert.ok(geometry.bottomGap<32,`unused bottom space: ${geometry.bottomGap}`);assert.deepEqual(errors,[]);results.push({name,width,height,allEightEntriesClickable:true,geometry,errors});await ctx.close();
}fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}

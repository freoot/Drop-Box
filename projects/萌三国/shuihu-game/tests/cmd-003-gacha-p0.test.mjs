import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const root=new URL('../',import.meta.url);
function game(){
 const saved=new Map(),nodes=new Map();
 class El{constructor(action){this.dataset={action};this.style={};this.classList={add(){},remove(){},contains(){return false}};this.innerHTML=''}closest(){return this}querySelectorAll(){return[]}}
 const ctx=vm.createContext({window:{},Element:El,document:{querySelector(s){if(!nodes.has(s))nodes.set(s,new El());return nodes.get(s)},addEventListener(){}},localStorage:{getItem(k){return saved.get(k)||null},setItem(k,v){saved.set(k,v)},removeItem(k){saved.delete(k)}},setTimeout(){},clearTimeout(){},requestAnimationFrame(){},confirm(){return true},console});
 for(const f of ['data/shuihu.js','data/portraits.js','data/journey.js','journey.js','tavern-life.js','tavern-gait.js','tavern-ui.js','hero-power.js','data/hero-stories.js','game.js'])vm.runInContext(fs.readFileSync(new URL(f,root),'utf8'),ctx);
 return {run:s=>vm.runInContext(s,ctx),saved,El,ctx};
}

// P0-1 玉璧产出：每日聚义赏
test('P0-1 每日聚义赏给 25 玉璧，且当日不可重复领取',()=>{
 const g=game();const before=g.run('state.jade');
 g.ctx.e={target:new g.El('daily-task')};g.run('clickAction(e)');
 assert.equal(g.run('state.jade'),before+25,'daily-task 应 +25 玉璧');
 g.run('clickAction(e)');
 assert.equal(g.run('state.jade'),before+25,'重复领取不应再加玉璧');
});

// P0-1 玉璧产出：主线首胜只给一次
test('P0-1 主线首胜给 20 玉璧，二次通关不再给',()=>{
 const g=game();const before=g.run('state.jade');
 g.run("finishBattle({mode:'campaign',stage:1,difficulty:'normal',logs:[]},true)");
 assert.equal(g.run('state.jade'),before+20,'首胜应 +20 玉璧');
 const afterFirst=g.run('state.jade');
 g.run("finishBattle({mode:'campaign',stage:1,difficulty:'normal',logs:[]},true)");
 assert.equal(g.run('state.jade'),afterFirst,'非首胜不应再加玉璧');
});

// P0-1 玉璧产出：试练塔每五层
test('P0-1 试练塔通过第 5 层时给 15 玉璧',()=>{
 const g=game();g.run('state.towerFloor=5');const before=g.run('state.jade');
 g.run("finishBattle({mode:'tower',stage:5,difficulty:'normal',logs:[]},true)");
 assert.equal(g.run('state.towerFloor'),6);
 assert.equal(g.run('state.jade'),before+15,'每五层应 +15 玉璧');
});

// P0-2 跨轮硬保底：两次独立单抽之间累计
test('P0-2 跨轮保底累计到 10 次后，下一次单抽为暗金',()=>{
 const g=game();
 g.run('state.jadePity.pulls=9;Math.random=()=>0.99;state.dailyA=9');
 g.run("recruit('normal')");
 assert.equal(g.run('state.lastRecruit[0].quality'),'red','第 10 抽本身仍按权重');
 assert.equal(g.run('state.jadePity.pulls'),10,'未出暗金应累计到 10');
 g.run("recruit('normal')");
 assert.equal(g.run('state.lastRecruit[0].quality'),'diamond','累计 10 次后下一次应为暗金');
 assert.equal(g.run('state.jadePity.pulls'),0,'出暗金后计数归零');
});

// P0-2 十连末位保底仍然生效，且与跨轮计数并存
test('P0-2 十连第 10 位为暗金保底位，抽完计数归零',()=>{
 const g=game();
 g.run('state.jade=200;state.jadePity.pulls=0;Math.random=()=>0.99');
 g.run("recruit('ten')");
 assert.equal(g.run('state.lastRecruit.length'),10);
 assert.equal(g.run('state.lastRecruit[9].quality'),'diamond');
 assert.equal(g.run('state.jade'),0);
 assert.equal(g.run('state.jadePity.pulls'),0);
});

test('P0-2 保底读数随计数变化，且不出现绝对化表述',()=>{
 const g=game();
 g.run('state.jadePity.pulls=3');
 assert.equal(g.run('pityLeft()'),7);
 const html=g.run('pityLine()');
 assert.match(html,/距保底约 7 次/);
 assert.doesNotMatch(html,/一定|必然|绝对|保证/);
});

// P0-3 抽后去向
test('P0-3 结果页给出「查看该好汉」与「再来一次」，点击后进入将册',()=>{
 const g=game();
 g.run("state.lastRecruit=[{...heroMeta('hero-002'),duplicate:false,quality:'diamond'}];state.lastRecruitMode='ten'");
 const html=g.run('window.SHUIHU_TAVERN_UI.revealActions()');
 assert.match(html,/data-action="reveal-hero" data-id="hero-002"/);
 assert.match(html,/data-action="reveal-again" data-mode="ten"/);
 assert.match(html,/再来十次/);
 const el=new g.El('reveal-hero');el.dataset.id='hero-002';g.ctx.e={target:el};
 g.run('clickAction(e)');
 assert.equal(g.run('state.page'),'heroes');
 assert.equal(g.run('state.selectedHero'),'hero-002');
 assert.equal(g.run('state.recruitReveal'),false);
});

test('P0-3 结果页「再来一次」会按上次池子再抽',()=>{
 const g=game();
 g.run("state.lastRecruit=[{...heroMeta('hero-002'),duplicate:false,quality:'diamond'}];state.lastRecruitMode='normal';state.dailyA=1");
 const before=g.run('state.heroes.length');
 const el=new g.El('reveal-again');el.dataset.mode='normal';g.ctx.e={target:el};
 g.run('clickAction(e)');
 assert.equal(g.run('state.dailyA'),0,'应消耗当日免费次数');
 assert.ok(g.run('state.heroes.length')+g.run('state.lastRecruit.length')>0);
 assert.equal(g.run('state.lastRecruitMode'),'normal');
 assert.ok(g.run('state.heroes.length')>=before,'再次抽取应有结果');
});

// P0-4 收集进度
test('P0-4 将册与招贤面板都显示已入寨 n/108',()=>{
 const g=game();
 const line=g.run('dexLine()');
 assert.match(line,/已入寨 \d+\/108/);
 assert.match(line,/暗金 \d+\/14/);
 g.run("state.page='heroes'");
 assert.match(g.run('heroPage()'),/已入寨 \d+\/108/);
 g.run('state.tavernMenu=true');
 assert.match(g.run('recruitPage()'),/已入寨 \d+\/108/,'招贤弹层展开时应显示收集进度');
});

// P0-5 重复暗金补偿
test('P0-5 重复暗金转 10 枚信物并回 15 玉璧',()=>{
 const g=game();
 g.run("state.shards['hero-001']=0");const jadeBefore=g.run('state.jade');
 const got=g.run("obtainHero('hero-001')");
 assert.equal(got.duplicate,true);
 assert.equal(got.shardsGained,10);
 assert.equal(got.jadeGained,15);
 assert.equal(g.run("state.shards['hero-001']"),10);
 assert.equal(g.run('state.jade'),jadeBefore+15);
});

test('P0-5 重复紫将仍转 5 枚信物、不回玉璧',()=>{
 const g=game();
 g.run("obtainHero('hero-037')");
 g.run("state.shards['hero-037']=0");const jadeBefore=g.run('state.jade');
 const got=g.run("obtainHero('hero-037')");
 assert.equal(got.shardsGained,5);
 assert.equal(got.jadeGained,0);
 assert.equal(g.run('state.jade'),jadeBefore);
});

// 规则文案：概率由常量生成，且写清玉璧来源
test('规则文案由常量生成，含玉璧来源与本地存档说明',()=>{
 const g=game();
 const text=g.run('window.SHUIHU_TAVERN_UI.ruleText()');
 assert.match(text,/蓝 53% · 紫 34% · 红 13%/);
 assert.match(text,/红 83% · 暗金 17%/);
 assert.match(text,/每日聚义赏、主线首胜与试练塔每五层/);
 assert.match(text,/保底位/);
 assert.doesNotMatch(text,/一定|必得|绝对|保证/);
});

// 旧档兼容：缺字段时不崩
test('旧存档缺少 jadePity 时自动补默认值',()=>{
 const saved=new Map(),nodes=new Map();
 class El{constructor(action){this.dataset={action};this.style={};this.classList={add(){},remove(){},contains(){return false}};this.innerHTML=''}closest(){return this}querySelectorAll(){return[]}}
 const legacy=JSON.stringify({page:'city',jade:260,heroes:[],shards:{}});
 const ctx=vm.createContext({window:{},Element:El,document:{querySelector(s){if(!nodes.has(s))nodes.set(s,new El());return nodes.get(s)},addEventListener(){}},localStorage:{getItem(k){return k==='shangshan-shuihu-v1'?legacy:null},setItem(k,v){saved.set(k,v)},removeItem(){}},setTimeout(){},clearTimeout(){},requestAnimationFrame(){},confirm(){return true},console});
 for(const f of ['data/shuihu.js','data/portraits.js','data/journey.js','journey.js','tavern-life.js','tavern-gait.js','tavern-ui.js','hero-power.js','data/hero-stories.js','game.js'])vm.runInContext(fs.readFileSync(new URL(f,root),'utf8'),ctx);
 const run=s=>vm.runInContext(s,ctx);
 assert.equal(JSON.stringify(run('({...state.jadePity})')),JSON.stringify({pulls:0,eliteMiss:0}));
 assert.equal(run("pullQuality('normal')!==undefined"),true);
 assert.equal(run('dexLine()').includes('已入寨'),true);
});

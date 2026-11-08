import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
function load(previous){
 const entries=new Map(previous?[['shangshan-shuihu-v1',previous]]:[]),nodes=new Map(),listeners={};
 class Element{
  constructor(dataset={}){this.dataset=dataset;this.style={};this.classList={add(){},remove(){}};this.innerHTML='';this.textContent='';}
  closest(){return this;}querySelectorAll(){return [];}focus(){}
 }
 const document={querySelector(s){if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s);},addEventListener(t,f){(listeners[t]||=[]).push(f);}};
 const BGM={volume:.35,enabled:true,isEnabled(){return this.enabled;},getVolume(){return this.volume;},setVolume(v){this.volume=v;},setEnabled(v){this.enabled=v;},play(){}};
 const context=vm.createContext({window:{BGM},BGM,document,Element,localStorage:{getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)},setTimeout:()=>1,clearTimeout(){},requestAnimationFrame(){},confirm:()=>true,console});
 for(const f of ['data/shuihu.js','data/portraits.js','data/journey.js','journey.js','hero-power.js','battle-vfx.js','battle-motion.js','game.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context,{filename:f});
 const run=s=>vm.runInContext(s,context);
 return {run,entries,nodes,BGM,dispatch(type,el){for(const f of listeners[type]||[])f({target:el});},element:data=>new Element(data)};
}
for(const difficulty of ['normal','elite'])test(`cancel ${difficulty} deployment refunds only its reserved cost, including after reload`,()=>{
 const g=load();g.run(`startBattle('campaign',1,0,'${difficulty}')`);
 assert.equal(g.run('state.stamina'),difficulty==='elite'?95:98);
 const restored=load(g.entries.get('shangshan-shuihu-v1'));
 restored.run('clickAction({target:new Element({action:"battle-retreat"})})');
 assert.equal(restored.run('state.stamina'),100);
 restored.run('clickAction({target:new Element({action:"battle-retreat"})})');
 assert.equal(restored.run('state.stamina'),100);
});
test('activity deployment cancellation refunds once; started retreat consumes the attempt',()=>{
 const g=load();g.run("startBattle('activity',1,0);clickAction({target:new Element({action:'battle-retreat'})})");
 assert.equal(g.run('state.activityLeft'),5);
 g.run("startBattle('activity',1,0);beginBattle(state.battle);clickAction({target:new Element({action:'battle-retreat'})})");
 assert.equal(g.run('state.activityLeft'),4);
});
test('started campaign retreat keeps charge; legacy deployment without reservation is not credited',()=>{
 const g=load();g.run("startBattle('campaign',1);beginBattle(state.battle);clickAction({target:new Element({action:'battle-retreat'})})");
 assert.equal(g.run('state.stamina'),98);
 g.run("startBattle('campaign',1);delete state.battle.reservation;clickAction({target:new Element({action:'battle-retreat'})})");
 assert.equal(g.run('state.stamina'),96);
});
test('a coin-priced targeted recruit never silently spends a token; explicit token payment works once',()=>{
 const g=load();g.run("state.gold=299;clickAction({target:new Element({action:'recruit-target',id:'hero-059'})})");
 assert.equal(g.run('state.recruitTokens'),4);assert.equal(g.run("!!hero('hero-059')"),false);
 g.run("clickAction({target:new Element({action:'recruit-target',id:'hero-059',payment:'token'})})");
 assert.equal(g.run('state.gold'),299);assert.equal(g.run('state.recruitTokens'),3);assert.equal(g.run("!!hero('hero-059')"),true);
 g.run("clickAction({target:new Element({action:'recruit-target',id:'hero-059',payment:'token'})})");
 assert.equal(g.run('state.recruitTokens'),3);
});
test('audio slider responds to input and keyboard change without re-rendering the control',()=>{
 const g=load(),range=g.element({action:'bgm-volume'});range.value='0.7';
 const before=g.nodes.get('#screen').innerHTML;g.dispatch('input',range);assert.equal(g.BGM.volume,.7);
 range.value='0.25';g.dispatch('change',range);assert.equal(g.BGM.volume,.25);
 assert.equal(g.nodes.get('#screen').innerHTML,before);
 const toggle=g.element({action:'bgm-toggle'});toggle.checked=false;g.dispatch('change',toggle);assert.equal(g.BGM.enabled,false);
});
test('claimed city resources render disabled controls and cannot be awarded twice',()=>{
 const g=load();g.run("clickAction({target:new Element({action:'collect-tax'})});clickAction({target:new Element({action:'collect-grain'})})");
 const values=g.run('JSON.stringify([state.gold,state.grain])');
 const markup=g.run('cityPage()');
 assert.match(markup,/<button[^>]*data-action="collect-tax"[^>]*disabled/);
 assert.match(markup,/<button[^>]*data-action="collect-grain"[^>]*disabled/);
 g.run("clickAction({target:new Element({action:'collect-tax'})});clickAction({target:new Element({action:'collect-grain'})})");
 assert.equal(g.run('JSON.stringify([state.gold,state.grain])'),values);
});
test('play menu offers the existing motion studio and preserves the live game in its tab',()=>{
 const g=load();const markup=g.run('morePage()');
 assert.match(markup,/<a[^>]*href="combat-motion-studio.html"[^>]*target="_blank"[^>]*rel="noopener"/);
 assert.match(markup,/<a[^>]*href="character-studio.html"[^>]*target="_blank"/);
 assert.doesNotMatch(markup,/login-page/);
});
test('collaboration protocol records real task owners and protects the game baseline',()=>{
 const text=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
 for(const id of ['ENG-002','AUDIO-002','ART-002','QA-002'])assert.ok(text.includes(id));
 assert.match(text,/B：音乐与音效/);assert.match(text,/D：独立试玩/);assert.match(text,/login-page\/.*不接入/);
});

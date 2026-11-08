import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const dataCode = fs.readFileSync(path.join(root, 'data/shuihu.js'), 'utf8');
const journeyDataCode = fs.readFileSync(path.join(root, 'data/journey.js'), 'utf8');
const journeyCode = fs.readFileSync(path.join(root, 'journey.js'), 'utf8');
const gameCode = fs.readFileSync(path.join(root, 'game.js'), 'utf8');

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
  vm.runInContext(dataCode, context, { filename: 'data/shuihu.js' });
  vm.runInContext(fs.readFileSync(path.join(root,'data/portraits.js'),'utf8'), context);
  vm.runInContext(journeyDataCode, context, { filename: 'data/journey.js' });
  vm.runInContext(journeyCode, context, { filename: 'journey.js' });
  for(const f of ['hero-power.js','battle-vfx.js','battle-motion.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context);
  vm.runInContext(gameCode, context, { filename: 'game.js' });
  const run = expression => vm.runInContext(expression, context);
  async function settleUntil(predicate, limit = 3000) {
    for (let i = 0; i < limit; i++) {
      if (predicate()) return;
      const item = timers.entries().next().value;
      if (item) { timers.delete(item[0]); item[1](); }
      await Promise.resolve();
    }
    assert.fail('timed out while resolving battle turns');
  }
  return { context, run, entries, nodes, FakeElement, settleUntil };
}

test('player naming validates input and preserves existing progress on reload',()=>{
 const g=makeGame();
 assert.equal(g.run('state.playerName'),'');
 assert.equal(g.run("setPlayerName('<script>')"),false);
 assert.equal(g.run("setPlayerName(' ')"),false);
 assert.equal(g.run("setPlayerName('一')"),false);
 g.run('state.gold=4321;state.stageUnlocked=3');
 assert.equal(g.run("setPlayerName('  清风客  ')"),true);
 const restored=makeGame(g.entries.get('shangshan-shuihu-v1'));
 assert.equal(restored.run('state.playerName'),'清风客');
 assert.equal(restored.run('state.gold'),4321);
 assert.equal(restored.run('state.stageUnlocked'),3);
 assert.match(restored.nodes.get('#header').innerHTML,/清风客/);
 assert.equal(restored.nodes.get('#profile-setup').innerHTML,'');
});

test('108 seats are complete, unique and directly usable in battle', () => {
  const { context } = makeGame();
  const data = context.window.SHUIHU_DATA;
  assert.equal(data.heroes.length, 108);
  assert.equal(new Set(data.heroes.map(h => h.id)).size, 108);
  assert.deepEqual(Array.from(data.heroes, h => h.rank), Array.from({ length: 108 }, (_, i) => i + 1));
  assert.equal(data.heroes[0].name, '宋江');
  assert.equal(data.heroes[107].name, '段景住');
  assert.equal(data.heroes.find(h => h.name === '扈三娘').gender, '女');
  assert.equal(data.heroes.find(h => h.name === '顾大嫂').gender, '女');
  assert.equal(data.heroes.find(h => h.name === '孙二娘').gender, '女');
  assert.equal(data.heroes.find(h => h.name === '花荣').skills[0].name, '落羽箭雨');
  assert.equal(data.heroes.find(h => h.name === '林冲').skills[0].name, '雪夜回枪');
  for (const hero of data.heroes) {
    assert.ok(hero.name && hero.epithet && hero.star && hero.bio && hero.faction && hero.designStatus);
    assert.ok(['blue', 'purple', 'red', 'diamond'].includes(hero.quality));
    assert.ok(['战士', '射手', '谋士'].includes(hero.role));
    assert.ok(hero.hp > 0 && hero.atk > 0 && hero.move >= 2 && hero.range >= 1);
    assert.ok(hero.passive.name && hero.passive.trigger && hero.passive.code);
    assert.equal(hero.skills.length, 2);
    for (const skill of hero.skills) {
      assert.ok(skill.name && skill.trigger && skill.condition && skill.description);
      assert.ok(skill.range >= 1 && skill.effect.type && skill.target);
      assert.ok(Number.isFinite(skill.effect.duration));
    }
    assert.equal(hero.materials.shardsToRecruit, 30);
    assert.ok(hero.acquisition.method && hero.materials.levelCoin > 0);
  }
  assert.equal(data.bosses.length, 4);
  for (const boss of data.bosses) {
    assert.ok(boss.identity && boss.mechanic && boss.strategy && boss.skill && boss.reward);
  }
  for (const chapter of data.chapters) {
    assert.ok(data.heroes.some(h => h.rank === chapter.rewardHeroRank));
    if (chapter.bossId) assert.ok(data.bosses.some(b => b.id === chapter.bossId));
  }
  assert.ok(fs.existsSync(path.join(root, 'assets/liangshan-city-painted.png')));
  assert.ok(fs.existsSync(path.join(root, 'assets/liangshan-battlefield-painted.png')));
  assert.ok(fs.existsSync(path.join(root, 'assets/liangshan-journey-map.png')));
  assert.ok(!fs.readFileSync(path.join(root, 'game.css'), 'utf8').includes('battlefield-changban.png'));
});

test('campaign uses six illustrated route nodes with adaptation chronology', () => {
  const game = makeGame();
  assert.equal(game.context.window.SHUIHU_JOURNEY.length, 6);
  assert.match(game.run('campaignPage()'), /聚义山河/);
  assert.equal(game.run("(campaignPage().match(/class=\"map-node/g)||[]).length"), 6);
  assert.match(game.run('campaignPage()'), /年代、行程与对话为游戏改编/);
});

test('story prologue consumes stamina only when entering deployment', () => {
  const game = makeGame();
  const before = game.run('state.stamina');
  game.run("enterStory(1,'normal')");
  assert.equal(game.run('state.page'), 'story');
  assert.equal(game.run('state.stamina'), before);
  assert.match(game.run('storyPage()'), /公元 1119 年/);
  game.run('advanceStory(true)');
  assert.equal(game.run('state.page'), 'battle');
  assert.equal(game.run('state.battle.phase'), 'deploy');
  assert.equal(game.run('state.stamina'), before - 2);
});

test('returning from a prologue leaves the battle and stamina untouched', () => {
  const game = makeGame();
  game.run("enterStory(1,'elite')");
  game.run("journeyAction('story-back',new Element())");
  assert.equal(game.run('state.page'), 'campaign');
  assert.equal(game.run('state.battle'), null);
  assert.equal(game.run('state.stamina'), 100);
});

test('Godot compatibility shell keeps the route map data driven', () => {
  const project = fs.readFileSync(path.join(root, 'project.godot'), 'utf8');
  const scene = fs.readFileSync(path.join(root, 'godot/journey_map/journey_map.tscn'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'godot/journey_map/journey_map.gd'), 'utf8');
  assert.match(project, /renderer\/rendering_method="gl_compatibility"/);
  assert.match(project, /viewport_width=1920/);
  assert.match(scene, /liangshan-journey-map\.png/);
  assert.equal((script.match(/"id": \d/g) || []).length, 6);
  assert.match(script, /年代、行程与对话为游戏改编/);
});

test('manual movement, range and class restraint alter a real battle', async () => {
  const game = makeGame();
  assert.equal(game.run("roleMultiplier('战士','射手')"), 1.35);
  assert.equal(game.run("roleMultiplier('射手','谋士')"), 1.35);
  assert.equal(game.run("roleMultiplier('谋士','战士')"), 1.35);
  game.run("startBattle('campaign',1);beginBattle(state.battle)");
  await game.settleUntil(()=>!game.run('state.battle.animating'));
  assert.equal(game.run('state.battle.allies.length'), 5);
  assert.equal(game.run('state.battle.enemies.length'), 3);
  assert.equal(game.run("canMoveCell(state.battle,state.battle.allies[2],5,1)"), true);
  assert.equal(game.run("canMoveCell(state.battle,state.battle.allies[2],6,1)"), false);
  game.run("selectUnit('ally-2')");
  game.run('clickCell(5,1)');
  assert.equal(game.run('state.battle.allies[2].x'), 2);
  game.run('clickCell(5,1)');
  await game.settleUntil(() => !game.run('state.battle.animating'));
  assert.equal(game.run('state.battle.allies[2].x'), 5);
  const before = game.run('state.battle.enemies[0].hp');
  game.run("selectUnit('enemy-0')");
  assert.ok(game.run('state.battle.enemies[0].hp') < before);
  assert.equal(game.run('state.battle.allies[2].acted'), true);
  assert.match(game.run('state.battle.message'), /造成 \d+ 点伤害/);
  const archerHit = game.run('battleDamage(state.battle.allies[2],state.battle.enemies[1])');
  const warriorHit = game.run('battleDamage(state.battle.allies[2],state.battle.enemies[0])');
  assert.ok(archerHit > warriorHit);
});

test('skill preview preserves resources and confirms the same affected targets', () => {
  const game=makeGame();
  game.run(`startBattle('campaign',1);beginBattle(state.battle);
    const b=state.battle; b.animating=false; b.fx=null;
    const actor=b.allies.find(a=>a.id==='hero-003');
    actor.activeSkill=1; actor.x=2; actor.y=1; b.selectedId=actor.uid; b.intent='skill';
    b.enemies.forEach((e,i)=>{e.hp=500;e.maxHp=500;e.x=i===2?7:4;e.y=i===1?2:1;});
    selectUnit(b.enemies[0].uid);`);
  assert.equal(game.run('state.battle.enemies[0].hp'),500);
  assert.equal(game.run('!!playerUnit(state.battle).skillUsed'),false);
  assert.equal(game.run('skillCells(actor,b.enemies[0],heroMeta(actor.id).skills[1]).length'),4); // 吴用落石伏阵 = column
  assert.match(game.run('battlePage()'),/skill-area-preview/);
  game.run('selectUnit(b.enemies[0].uid)');
  assert.ok(game.run('b.enemies[0].hp')<500);
  assert.ok(game.run('b.enemies[1].hp')<500);
  assert.equal(game.run('b.enemies[2].hp'),500);
  assert.equal(game.run('actor.skillUsed'),true);
});

test('skill range clips at borders and rejects invalid previews', () => {
  const game=makeGame();
  assert.equal(game.run("skillCells({x:1,y:0},{x:0,y:0},{effect:{type:'cleave',radius:1}}).length"),3);
  game.run(`startBattle('campaign',1);beginBattle(state.battle);const b=state.battle;b.animating=false;
    const actor=b.allies.find(a=>a.id==='hero-003');actor.activeSkill=1;actor.x=0;actor.y=0;`);
  assert.equal(game.run('previewSkill(b,actor,b.enemies[0])'),false);
  assert.equal(game.run('previewSkill(b,actor,b.allies[0])'),false);
  assert.equal(game.run('!!b.skillPreview'),false);
});

test('normal, elite and boss fights expose correct mechanics and rewards', () => {
  const game = makeGame();
  game.run('state.stageUnlocked=6');
  game.run("startBattle('campaign',4,0,'elite');beginBattle(state.battle)");
  assert.equal(game.run('state.battle.enemies.length'), 4);
  assert.equal(game.run('state.battle.enemies.find(e=>e.boss).mechanic'), 'formationShield');
  const guarded = game.run('battleDamage(state.battle.allies[2],state.battle.enemies.find(e=>e.boss),1,state.battle,false)');
  game.run('state.battle.enemies.filter(e=>e.formationGuard).forEach(e=>e.hp=0)');
  const exposed = game.run('battleDamage(state.battle.allies[2],state.battle.enemies.find(e=>e.boss),1,state.battle,false)');
  assert.ok(exposed > guarded);
  const fragments = game.run('state.gearFragments');
  game.run('finishBattle(state.battle,true)');
  assert.equal(game.run('state.gearFragments') - fragments, 7);
  assert.equal(game.run('state.clearedStages[4]'), true);
  assert.equal(game.run("state.heroes.some(h=>h.name==='扈三娘')"), true);
});

test('a defeated rally boss cannot fire its half-health counterattack', () => {
  const game = makeGame();
  game.run('state.stageUnlocked=6');
  game.run("startBattle('campaign',6);beginBattle(state.battle)");
  game.run('state.battle.allies[0].status.shield=0');
  const originalHp = game.run('state.battle.allies[0].hp');
  game.run('state.battle.enemies.find(e=>e.boss).hp=0');
  game.run('updateBossThresholds(state.battle)');
  assert.equal(game.run('state.battle.allies[0].hp'), originalHp);
  game.run('state.battle.enemies.find(e=>e.boss).hp=100');
  game.run('updateBossThresholds(state.battle)');
  assert.ok(game.run('state.battle.allies[0].hp') < originalHp);
  assert.equal(game.run('state.battle.enemies.find(e=>e.boss).rallyUsed'), true);
});

test('equipment can be equipped, removed, changed and saved per hero', () => {
  const game = makeGame();
  const initial = game.run("gearBonus(hero('hero-006'),'atk')");
  assert.ok(initial > 0);
  game.run("state.selectedHero='hero-006'");
  game.run("clickAction({target:new Element({action:'unequip-gear',slot:'weapon'})})");
  assert.ok(game.run("gearBonus(hero('hero-006'),'atk')") < initial);
  game.run("clickAction({target:new Element({action:'unlock-gear',key:'战士:weapon:1'})})");
  game.run("clickAction({target:new Element({action:'equip-gear',slot:'weapon',variant:'1'})})");
  assert.equal(game.run("gearChoice(hero('hero-006'),'weapon')"), 1);
  assert.ok(game.run("gearBonus(hero('hero-006'),'hp')") > 0);
  game.run("state.gearLevels['战士:boots']=2;startBattle('campaign',1);beginBattle(state.battle)");
  const saved = game.entries.get('shangshan-shuihu-v1');
  const restored = makeGame(saved);
  assert.equal(restored.run("gearChoice(hero('hero-006'),'weapon')"), 1);
  assert.equal(restored.run("state.gearOwned['战士:weapon:1']"), true);
  assert.equal(restored.run("state.battle.allies.find(h=>h.id==='hero-006').move"), 4);
});

test('recruiting and resource purchases have disclosed results', () => {
  const game = makeGame();
  game.run("recruit('ten')");
  assert.equal(game.run('state.lastRecruit.length'), 10);
  assert.ok(game.run("state.lastRecruit.some(h=>h.quality==='diamond')"));
  const before = game.run('state.cultivation');
  game.run("clickAction({target:new Element({action:'buy-exp'})})");
  assert.equal(game.run('state.cultivation') - before, 15);
  game.run('state.stamina=0');
  game.run("clickAction({target:new Element({action:'refill-stamina'})})");
  assert.equal(game.run('state.stamina'), 100);
});

test('automatic battle completes and victory survives reload', async () => {
  const game = makeGame();
  game.run("startBattle('campaign',1);beginBattle(state.battle)");
  game.run("clickAction({target:new Element({action:'battle-speed'})})");
  assert.equal(game.run('state.battle.speed'), 2);
  game.run('autoBattle()');
  await game.settleUntil(() => Boolean(game.run('state.battle.result')), 6000);
  assert.equal(game.run('state.battle.result.win'), true);
  assert.ok(game.run('state.stageUnlocked') >= 2);
  const restored = makeGame(game.entries.get('shangshan-shuihu-v1'));
  assert.ok(restored.run('state.stageUnlocked') >= 2);
  assert.equal(restored.run('state.battle.result.win'), true);
});


test('five heroes of one profession deploy to separate cells', () => {
  for (const role of ['战士', '射手', '谋士']) {
    const game = makeGame();
    game.run(`state.heroes=HERO_CATALOG.filter(h=>h.role==='${role}').slice(0,5).map(h=>({...clone(h),inParty:true,level:1,skillLevel:1}))`);
    game.run("startBattle('campaign',1);beginBattle(state.battle)");
    assert.equal(game.run('new Set(state.battle.allies.map(h=>h.x+","+h.y)).size'), 5);
  }
});

test('burn affects allies, expires, and can end a battle', async () => {
  const game = makeGame();
  game.run("startBattle('campaign',1);beginBattle(state.battle)");
  game.run('state.battle.allies.forEach(a=>{a.hp=1;a.status={burn:2}})');
  game.run('enemyPhase(state.battle)');
  await game.settleUntil(() => Boolean(game.run('state.battle.result')));
  assert.equal(game.run('state.battle.result.win'), false);
  assert.equal(game.run('state.battle.allies.every(a=>a.status.burn===1)'), true);
});

test('ally weak ticks at enemy phase even if the ally only moved (no attack)', async () => {
  const game = makeGame();
  game.run("startBattle('campaign',1);beginBattle(state.battle)");
  // Apply weak=2 to every ally and simulate a turn where no one attacks (only the
  // turn rollover happens). Before the fix, weak never ticked because it was only
  // decremented inside performAttack/performSkill.
  game.run('state.battle.allies.forEach(a=>{a.status.weak=2})');
  game.run('state.battle.animating=false;state.battle.fx=null;');
  // Mark all allies as having acted so enemyPhase starts immediately.
  game.run('state.battle.allies.forEach(a=>{a.acted=true;a.moved=true})');
  game.run('enemyPhase(state.battle)');
  await game.settleUntil(() => game.run('state.battle.phase') === 'player');
  // After one enemy phase, weak should have ticked once: 2 → 1 for every living ally.
  assert.equal(game.run('state.battle.allies.filter(a=>a.hp>0).every(a=>a.status.weak===1)'), true);
  // A second enemy phase should tick again: 1 → 0.
  game.run('state.battle.allies.forEach(a=>{a.acted=true;a.moved=true})');
  game.run('enemyPhase(state.battle)');
  await game.settleUntil(() => game.run('state.battle.phase') === 'player');
  assert.equal(game.run('state.battle.allies.filter(a=>a.hp>0).every(a=>a.status.weak===0)'), true);
});

test('unyielding shield triggers on the hit that crosses 50% and absorbs part of it', () => {
  const game = makeGame();
  game.run("startBattle('campaign',1);beginBattle(state.battle)");
  // Find an ally with the unyielding passive.
  game.run('var u=state.battle.allies.find(a=>a.passive&&a.passive.code==="unyielding")');
  // If none in the starting party, inject the passive on ally-0.
  game.run('if(!u){u=state.battle.allies[0];u.passive={code:"unyielding",shieldRatio:.14}}');
  game.run('u.maxHp=100;u.hp=51;u.status={};');
  // A hit of 20 damage would bring HP to 31 (below 50%). The unyielding shield (14)
  // must trigger BEFORE the damage so it absorbs part of the blow.
  const result = game.run('JSON.stringify(applyDamage(u,20))');
  const parsed = JSON.parse(result);
  // Shield = 14% of 100 = 14. Absorbed 14 of the 20 damage.
  assert.equal(parsed.absorbed, 14, 'unyielding shield absorbed 14 of the 20 damage');
  // HP should be 51 - (20-14) = 45, not 31.
  assert.equal(game.run('u.hp'), 45, 'HP is 45 after shield absorbed part of the hit');
  assert.equal(game.run('u.status.unyieldingUsed'), true, 'unyielding marked as used');
  // A second hit that would drop below 50% again must NOT re-trigger (already used).
  game.run('u.hp=51'); // reset HP but keep unyieldingUsed
  const result2 = game.run('JSON.stringify(applyDamage(u,30))');
  const parsed2 = JSON.parse(result2);
  assert.equal(parsed2.absorbed, 0, 'no shield on second crossing — already used this battle');
});

test('unyielding does not trigger when already below 50%', () => {
  const game = makeGame();
  game.run("startBattle('campaign',1);beginBattle(state.battle)");
  game.run('var u=state.battle.allies[0];u.passive={code:"unyielding",shieldRatio:.14}');
  game.run('u.maxHp=100;u.hp=30;u.status={};'); // already below 50%
  const result = game.run('JSON.stringify(applyDamage(u,10))');
  const parsed = JSON.parse(result);
  assert.equal(parsed.absorbed, 0, 'no shield — unit was already below 50%');
  assert.equal(game.run('u.status.unyieldingUsed||false'), false, 'unyielding not consumed');
  assert.equal(game.run('u.hp'), 20, 'damage applied normally');
});


test('switching to auto cannot grant a second move in the same turn', async () => {
  const game = makeGame();
  game.run("startBattle('campaign',1);beginBattle(state.battle)");
  await game.settleUntil(()=>!game.run('state.battle.animating'));
  game.run('state.battle.allies.forEach(a=>a.acted=true);state.battle.allies[2].acted=false;state.battle.allies[2].moved=true');
  const position = game.run('state.battle.allies[2].x+","+state.battle.allies[2].y');
  game.run('autoBattle()');
  assert.equal(game.run('state.battle.allies[2].x+","+state.battle.allies[2].y'), position);
  assert.equal(game.run('state.battle.allies[2].acted'), true);
  game.run('state.battle.auto=false');
});


test('deployment is free, bounded to three columns, and opening effects happen once', () => {
  const game = makeGame();
  game.run("startBattle('campaign',1)");
  assert.equal(game.run('state.battle.phase'),'deploy');
  const before=game.run('state.battle.enemies[0].hp');
  game.run('clickCell(1,3)');
  assert.equal(game.run('state.battle.allies[0].x'),1);
  game.run('clickCell(4,3)');
  assert.equal(game.run('state.battle.allies[0].x'),1);
  game.run('beginBattle(state.battle)');
  const after=game.run('state.battle.enemies[0].hp');
  assert.ok(after<before);
  game.run('beginBattle(state.battle)');
  assert.equal(game.run('state.battle.enemies[0].hp'),after);
});

test('move preview follows an unoccupied route and can be undone before attacking',async()=>{
  const game=makeGame();
  game.run("startBattle('campaign',1);beginBattle(state.battle)");
  await game.settleUntil(()=>!game.run('state.battle.animating'));
  game.run("selectUnit('ally-2');clickCell(5,1)");
  assert.equal(game.run('state.battle.previewPath.length'),4);
  game.run('clickCell(5,1)');
  await game.settleUntil(()=>!game.run('state.battle.animating'));
  game.run('undoMove(state.battle)');
  assert.equal(game.run('state.battle.allies[2].x'),2);
  assert.equal(game.run('state.battle.allies[2].moved'),false);
  await game.settleUntil(()=>!game.run('state.battle.animating'));
  game.run('state.battle.allies[2].acted=true;state.battle.allies[2].moveOrigin={x:1,y:1};undoMove(state.battle)');
  assert.equal(game.run('state.battle.allies[2].x'),2);
});

test('dedicated portraits are used by both roster and battle renderers',()=>{
  const game=makeGame();
  for(const id of ['hero-001','hero-003','hero-006','hero-009','hero-022']){
    assert.ok(fs.existsSync(path.join(root,`assets/portraits/${id}.png`)));
    assert.match(game.run(`artHTML(heroMeta('${id}'))`),/painted-portrait/);
    assert.match(game.run(`artHTML(heroMeta('${id}'),'unit-art')`),/painted-portrait/);
  }
});

test('all registered portrait and pose files are square RGBA PNGs',()=>{
 const game=makeGame();
 const assets=game.run('Object.values(ART)');
 // 108 heroes + 4 enemy types = 112 entries (CHAR-108 batch + premium)
 assert.equal(assets.length,112);
 for(const asset of assets)for(const file of [asset.portrait,asset.actions,asset.cast].filter(Boolean)){
  const buffer=fs.readFileSync(path.join(root,file));
  assert.equal(buffer.toString('ascii',1,4),'PNG');
  assert.equal(buffer.readUInt32BE(16),buffer.readUInt32BE(20),file);
  assert.ok(buffer.readUInt32BE(16)>=1024,file);
  assert.equal(buffer[25],6,'RGBA transparency: '+file);
 }
});

test('representative heroes have action atlases and deployment does not claim a triggered combo',()=>{
 const game=makeGame();
 for(const id of ['hero-006','hero-009','hero-003']){
  assert.match(game.run(`artHTML(heroMeta('${id}'),'unit-art')`),/frame-strip/); // new Q frame strips; atlases kept as fallback
 }
 game.run("startBattle('campaign',1)");
 assert.doesNotMatch(game.nodes.get('#screen').innerHTML,/已发动/);
 assert.match(game.nodes.get('#screen').innerHTML,/开战后触发羁绊/);
});

test('auto mode rejects manual target attacks',()=>{
 const game=makeGame();game.run("startBattle('campaign',1);beginBattle(state.battle)");
 game.run('state.battle.auto=true;state.battle.enemies[0].x=3;state.battle.enemies[0].y=1;state.battle.selectedId="ally-2"');
 const hp=game.run('state.battle.enemies[0].hp');
 game.run('selectUnit(state.battle.enemies[0].uid)');
 assert.equal(game.run('state.battle.enemies[0].hp'),hp);
});

test('character studio switches heroes and six actions without accessing saved progress',()=>{
 const nodes=new Map();const events={};const timers=new Map();let id=0;
 const node=key=>{if(!nodes.has(key))nodes.set(key,{dataset:{},style:{setProperty(){}},attributes:{},setAttribute(k,v){this.attributes[k]=v;}});return nodes.get(key);};
 const context=vm.createContext({window:{},document:{getElementById:node,addEventListener(k,v){events[k]=v;}},setInterval(fn){timers.set(++id,fn);return id;},clearInterval(key){timers.delete(key);}});
 vm.runInContext(fs.readFileSync(path.join(root,'data/portraits.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'character-studio.js'),'utf8'),context);
 assert.equal(node('name').textContent,'林冲');
 events.click({target:{closest:()=>({dataset:{hero:'hero-009'}})}});
 assert.equal(node('name').textContent,'花荣');
 for(const pose of ['idle','walk','attack','skill','hit','defeat']){
  events.click({target:{closest:()=>({dataset:{pose}})}});
  assert.equal(node('actor').dataset.action,pose);
  assert.ok(node('motion-note').textContent.length>5);
 }
 node('loop').onclick();assert.equal(timers.size,1);
 [...timers.values()][0]();assert.equal(node('actor').dataset.action,'idle');
 node('loop').onclick();assert.equal(timers.size,0);
 node('speed').onclick();assert.equal(node('speed').textContent,'快速 · 2×');
 events.click({target:{closest:()=>({dataset:{hero:'hero-003'}})}});
 events.click({target:{closest:()=>({dataset:{pose:'skill'}})}});
 assert.match(node('pose').style.backgroundImage,/assets\/q\/wuyong-sheet\.png/);
 assert.equal(node('pose').style.backgroundSize,'700% 100%');
 assert.equal(node('pose').style.backgroundPosition,'66.6667% 0');
 events.click({target:{closest:()=>({dataset:{pose:'defeat'}})}});
 assert.equal(node('pose').dataset.frame,'down');
 events.click({target:{closest:()=>({dataset:{pose:'walk'}})}});
 assert.equal(node('pose').dataset.frame,'walkA');
 [...timers.values()].at(-1)();assert.equal(node('pose').dataset.frame,'walkB');
 events.click({target:{closest:()=>({dataset:{pose:'idle'}})}});
 assert.equal(node('pose').style.backgroundPosition,'0.0000% 0');
});

test('stamina migration grants 100 once and elite costs exactly five', () => {
  const old=makeGame();const snapshot=JSON.parse(old.entries.get('shangshan-shuihu-v1')||old.run('JSON.stringify(state)'));delete snapshot.staminaVersion;snapshot.stamina=0;
  const g=makeGame(JSON.stringify(snapshot));assert.equal(g.run('state.stamina'),100);
  g.run("startBattle('campaign',1,0,'elite');save()");assert.equal(g.run('state.stamina'),95);
  const reloaded=makeGame(g.entries.get('shangshan-shuihu-v1'));assert.equal(reloaded.run('state.stamina'),95);
  g.run('state.stamina=4;state.battle=null;startBattle("campaign",1,0,"elite")');assert.equal(g.run('state.battle'),null);assert.equal(g.run('state.stamina'),4);
});

test('support has no hit animation and direct attacks cannot harm friends', () => {
  const g=makeGame();g.run("startBattle('campaign',1);beginBattle(state.battle);const b=state.battle;b.animating=false;const u=b.allies[0];u.activeSkill=0;const ally=b.allies[1];ally.x=u.x+1;ally.y=u.y;");
  const hp=g.run('ally.hp');assert.equal(g.run('performAttack(b,u,ally)'),false);assert.equal(g.run('ally.hp'),hp);
  assert.equal(g.run('performSkill(b,u,ally)'),true);assert.equal(g.run('b.fx.kind'),'support');assert.equal(g.run('battleEffects(b)'),'');assert.equal(g.run('ally.hp'),hp);assert.match(g.run('battlePage()'),/护盾 \+/);assert.doesNotMatch(g.run('battlePage()'),/combat-shake/);
});

test('critical rolls use 20 percent boundary and 1.5 damage multiplier', () => {
  for(const [roll,critical] of [[.199,true],[.2,false],[.9,false]]){
    const g=makeGame();g.run(`Math.random=()=>${roll};startBattle('campaign',1);beginBattle(state.battle);const b=state.battle;b.animating=false;const u=b.allies[2],e=b.enemies[0];u.x=5;u.y=1;e.x=6;e.y=1;e.hp=1000;e.maxHp=1000;e.status={};`);
    const base=g.run('battleDamage(u,e,1,b,false)');g.run('performAttack(b,u,e)');assert.equal(g.run('b.fx.hits[0].critical'),critical);assert.equal(g.run('1000-e.hp'),Math.round(base*(critical?1.5:1)));
  }
});

test('authored skills cover six cells, eight neighbors, and the whole board', () => {
  const g=makeGame();
  for(const [id,index,count] of [['hero-009',0,6],['hero-013',0,8],['hero-004',1,32]])assert.equal(g.run(`skillCells({x:1,y:1},{x:4,y:1},heroMeta('${id}').skills[${index}]).length`),count);
  assert.equal(g.run("heroMeta('hero-006').skills[0].range"),2);
});

test('tavern starts as a scene and innkeeper opens disclosed recruitment', () => {
  const g=makeGame();assert.match(g.run('recruitPage()'),/tavern-owner/);assert.doesNotMatch(g.run('recruitPage()'),/recruit-one/);
  g.run("clickAction({target:new Element({action:'tavern-owner'})})");assert.match(g.run('recruitPage()'),/蓝 53%/);assert.match(g.run('recruitPage()'),/recruit-one/);
  g.run("clickAction({target:new Element({action:'tavern-close'})})");assert.doesNotMatch(g.run('recruitPage()'),/recruit-one/);
});

test('elite volley is telegraphed for a full player turn and can be dodged', () => {
  const g=makeGame();g.run("startBattle('campaign',1,0,'elite');const b=state.battle;const u=b.allies[0];b.allies.forEach((a,i)=>{a.x=i===0?3:0;a.status={};});const before=u.hp;resolveEliteVolley(b);");
  assert.equal(g.run('u.hp'),g.run('before'));assert.equal(g.run('b.danger.x'),3);
  g.run('u.x=2;resolveEliteVolley(b)');assert.equal(g.run('u.hp'),g.run('before'));
  g.run('resolveEliteVolley(b)');assert.equal(g.run('u.hp'),g.run('before-Math.round(u.maxHp*.18)'));
});

const STAMINA_MAX=100;
const campaignCost=difficulty=>difficulty==='elite'?5:2;
const SAVE_KEY = 'shangshan-shuihu-v1';
const DATA = window.SHUIHU_DATA;
const CHAPTERS = DATA.chapters;
const BOSSES = DATA.bosses;
const ART = window.SHUIHU_ART || {};
const ROLES = ['战士','射手','谋士'];
const QUALITY = { diamond:'暗金', red:'红', purple:'紫', blue:'蓝' };
// CMD-003 · 抽卡欲望环 P0：概率与保底的口径集中在此，文案由常量生成，避免公示与实现脱节。
const GACHA = {
  normal:{blue:53,purple:34,red:13},   // 把酒相邀：蓝/紫/红（%）
  elite:{red:83,diamond:17},           // 名士来访：红/暗金（%）
  hardPity:10,                         // 跨轮硬保底：连续 10 次未见暗金后，下一次为暗金
  softPity:8,                          // 名士来访软保底：连续 8 次未见暗金后，每次递增
  softStep:3,                          // 软保底每次递增的暗金权重（百分点）
  dupShards:{diamond:10,red:7,purple:5,blue:5}, // 重复转信物
  dupJade:{diamond:15,red:0,purple:0,blue:0}    // 重复暗金额外回玉
};
const HERO_CATALOG = DATA.heroes.map(h=>({...h,level:1,skillLevel:1,activeSkill:0,inParty:h.ownedAtStart}));
const SKILLS = Object.fromEntries(HERO_CATALOG.map(h=>[h.id,[[h.passive.name,h.passive.description],...h.skills.map(s=>[s.name,s.description])]]));
const COMBOS = DATA.bonds.map(b=>({...b,members:b.members.map(rank=>`hero-${String(rank).padStart(3,'0')}`),target:b.target.replace('敌方','敌')}));
const GEAR = {
  战士:[['weapon','雁翎刀','🗡️','atk'],['armor','梁山铁札甲','🛡️','hp'],['boots','踏水战靴','👢','move'],['charm','聚义腰牌','🏮','hp']],
  射手:[['weapon','穿云弓','🏹','atk'],['armor','轻鳞短褂','🪶','hp'],['boots','飞燕靴','🥾','move'],['charm','鹰眼护符','🦅','range']],
  谋士:[['weapon','军师令旗','🚩','atk'],['armor','青布长衫','📜','hp'],['boots','行军草履','👣','move'],['charm','水泊罗盘','🧭','range']]
};
const clone=x=>JSON.parse(JSON.stringify(x));
const initialState=()=>({playerName:'',page:'city',gold:1800,jade:260,grain:120,exp:0,cityLevel:3,prosperity:48,cultivation:36,stamina:100,staminaVersion:2,recruitTokens:4,jadePity:{pulls:0,eliteMiss:0},lastRecruitMode:'',shards:{},shardTarget:'hero-002',honor:0,arenaPoints:0,arenaWins:0,arenaStreak:0,towerFloor:1,stageUnlocked:1,mapStage:1,story:null,campaignWins:0,clearedStages:{},activityLeft:5,dailyA:1,dailyB:1,taskClaimed:false,lastDailyDate:new Date().toLocaleDateString(),heroes:clone(HERO_CATALOG.filter(h=>h.ownedAtStart)),selectedHero:'hero-006',selectedPartyMax:5,cityClaimed:false,farmClaimed:false,equipment:{},gearOwned:{},gearLevels:{},gearAdvanced:{},blueprints:3,gearFragments:24,battle:null,activityKind:0,log:[]});
let state;try{state=Object.assign(initialState(),JSON.parse(localStorage.getItem(SAVE_KEY)||'{}'));}catch(e){state=initialState();}
state.playerName=typeof state.playerName==='string'?state.playerName:'';
let editingProfile=false;
state.tavernMenu=false;
try{if(!JSON.parse(localStorage.getItem(SAVE_KEY)||'{}')?.staminaVersion){state.stamina=STAMINA_MAX;state.staminaVersion=2;}}catch{}
const todayKey=new Date().toLocaleDateString();if(state.lastDailyDate!==todayKey){state.lastDailyDate=todayKey;state.dailyA=1;state.dailyB=1;state.activityLeft=5;state.stamina=STAMINA_MAX;state.cityClaimed=false;state.farmClaimed=false;state.taskClaimed=false;}
state.heroes=(state.heroes||[]).map(savedHero=>{const canonical=HERO_CATALOG.find(h=>h.id===savedHero.id);return canonical?{...clone(canonical),...savedHero,role:canonical.role,move:canonical.move,range:canonical.range,gender:canonical.gender,icon:canonical.icon,bio:canonical.bio,skills:canonical.skills,passive:canonical.passive,materials:canonical.materials,exclusiveTrait:canonical.exclusiveTrait}:null}).filter(Boolean);
if(!state.heroes.length)state.heroes=clone(initialState().heroes);
if(!HERO_CATALOG.some(h=>h.id===state.selectedHero))state.selectedHero=state.heroes[0].id;
if(!HERO_CATALOG.some(h=>h.id===state.shardTarget))state.shardTarget='hero-002';
state.equipment=state.equipment||{};
// 旧档兼容：CMD-003 新增字段一律在读取后补默认值，避免 undefined 参与计数
state.jadePity=Object.assign({pulls:0,eliteMiss:0},state.jadePity||{});
state.lastRecruitMode=typeof state.lastRecruitMode==='string'?state.lastRecruitMode:'';
state.shards=state.shards||{};
state.gearOwned=state.gearOwned||{};
state.clearedStages=state.clearedStages||{};
for(const unit of state.battle?.allies||[]){const canonical=HERO_CATALOG.find(h=>h.id===unit.id);if(canonical){unit.role=canonical.role;unit.move=canonical.move+gearBonus(hero(unit.id)||canonical,'move');unit.range=canonical.range+gearBonus(hero(unit.id)||canonical,'range');}}
function save(){
  try{
    const snapshot=clone(state);
    snapshot.tavernMenu=false;
    snapshot.recruitReveal=false;
    if(snapshot.battle){
      snapshot.battle.animating=false;
      snapshot.battle.fx=null;
      if(snapshot.battle.result&&snapshot.battle.resultRevealed===false)snapshot.battle.resultRevealed=true;
      snapshot.battle.moveFxUid='';
      snapshot.battle.moveFxFrom=null;
      snapshot.battle.pendingEnemyPhase=false;
      snapshot.battle.enemyPhasePromise=null;
      snapshot.battle.enemyPhaseRunning=false;
      snapshot.battle.auto=false;
      if(snapshot.battle.phase==='enemy')snapshot.battle.phase='player';
    }
    localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot));
  }catch(e){}
}
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function hero(id){return state.heroes.find(h=>h.id===id)}
function heroMeta(id){return HERO_CATALOG.find(h=>h.id===id)||{id,name:id,role:'战士',quality:'blue',icon:'🛡️',hp:170,atk:34,move:2,range:1,level:1,skillLevel:1,activeSkill:0}}
// Frame strip: one row of equal frames (idle, walkA, walkB, attack, skill, hit, down); CSS picks the frame by unit state.
function frameStripHTML(asset){const f=asset.frames,n=f.order.length;return `<span class="frame-strip" style="background-image:url('${f.sheet}');--frame-count:${n};--frame-ratio:${f.frameWidth}/${f.frameHeight}"></span>`}
function framePosition(asset,pose){const f=asset?.frames;if(!f)return null;const i=f.order.indexOf(pose);return i<0?null:`${(i/(f.order.length-1)*100).toFixed(4)}% 0`}
function artHTML(h,cls='hero-art'){
  const asset=ART[h.id]||(h.id?.startsWith('enemy-formation')?ART['enemy-vanguard']:null);
  if(asset){
    const frames=cls==='unit-art'&&asset.frames;
    if(frames)return `<div class="hero-portrait painted-portrait ${cls} has-frames" aria-label="${esc(h.name)}">${asset.restArt?`<img class="battle-rest-art" src="${asset.restArt}" alt="${esc(h.name)}待命">`:''}${frameStripHTML(asset)}</div>`;
    const atlas=cls==='unit-art'&&asset.actions;
    return `<div class="hero-portrait painted-portrait ${cls} ${atlas?'has-atlas':''}" aria-label="${esc(h.name)}">${atlas?`<span class="action-atlas ${asset.cast?'has-cast':''}" style="background-image:url('${asset.actions}');${asset.cast?`--cast-image:url('${asset.cast}')`:''}"></span>`:`<img class="character-image" src="${asset.portrait}" alt="${esc(h.name)}专属立绘" draggable="false" ${cls==='hero-art'?'loading="lazy"':''}>`}</div>`;
  }
  const color=h.color||'#806b56';
  const role=h.role||'战士';
  const female=h.gender==='女';
  const rank=Number(h.rank)||0;
  const trim=role==='谋士'?'#b7dfd2':role==='射手'?'#f0d390':'#ead0a1';
  const skin=rank%7===0?'#d9a77e':'#f2cba1';
  const backWeapon=role==='射手'
    ?'<path d="M76 22 Q95 49 77 84 M79 23 Q65 52 80 84" fill="none" stroke="#6a4631" stroke-width="4"/><path d="M79 23 79 84" stroke="#ead4a0" stroke-width="1.4"/>'
    :role==='战士'
      ?'<path d="M16 93 28 35" stroke="#553d32" stroke-width="6" stroke-linecap="round"/><path d="M20 45 27 18 34 38Z" fill="#d9c499" stroke="#705e4f" stroke-width="2"/>'
      :'<path d="M77 91 83 34" stroke="#6b4a34" stroke-width="5"/><path d="M70 37 91 29 87 48Z" fill="#d1bb7e" stroke="#725c43" stroke-width="2"/>';
  const hair=female
    ?'<path d="M27 29 Q25 10 48 7 Q75 5 76 31 L74 67 66 72 63 39 34 39 33 70 25 65Z" fill="#292725"/><path d="M31 20 Q23 6 31 5 Q40 4 42 16 M62 17 Q66 3 75 7 Q80 12 69 24" fill="#292725"/>'
    :'<path d="M25 31 Q25 8 48 7 Q76 7 76 30 L69 25 62 29 53 21 41 29 33 26Z" fill="#292a2a"/>';
  const headwear=female
    ?'<path d="M31 21 Q49 14 68 21" fill="none" stroke="#efcf81" stroke-width="4"/><circle cx="50" cy="16" r="4" fill="#f7e3a8"/>'
    :role==='谋士'
      ?'<path d="M24 21 Q49 14 76 21 L81 27 Q51 35 20 27Z" fill="#314b50" stroke="#dec590" stroke-width="2"/><path d="M38 15 36 4 64 4 62 15Z" fill="#314b50" stroke="#dec590" stroke-width="2"/>'
      :role==='射手'
        ?'<path d="M27 27 Q49 7 73 27" fill="none" stroke="#68513d" stroke-width="7"/><path d="M34 22 66 22" stroke="#edc77b" stroke-width="3"/>'
        :'<path d="M25 24 Q49 8 75 24 L74 31 Q50 23 26 31Z" fill="#5b5c59" stroke="#d7bb7e" stroke-width="2"/><path d="M49 11 49 5" stroke="#e2bd70" stroke-width="4"/>';
  const facialHair=!female&&rank%4===0?'<path d="M42 53 Q50 59 58 53 M44 54 Q40 66 49 70 Q60 64 56 54" fill="#574238" stroke="#574238" stroke-width="2"/>':'';
  const accessory=role==='谋士'
    ?'<path d="M70 70 84 67 82 87 68 88Z" fill="#f5e6bc" stroke="#8f754d" stroke-width="2"/><path d="M72 75 80 73 M72 80 79 78" stroke="#ae8a56"/>'
    :role==='射手'
      ?'<path d="M72 73 83 70 84 92 73 91Z" fill="#6a4938" stroke="#c6aa70" stroke-width="2"/><path d="M77 70 77 57 M81 70 83 58" stroke="#d7c496" stroke-width="2"/>'
      :'<path d="M14 68 22 69 17 94 9 91Z" fill="#cfb784" stroke="#765d42" stroke-width="2"/>';
  return `<div class="hero-portrait ${cls} ${role==='战士'?'warrior':role==='射手'?'ranger':'tactician'}" style="--robe:${color};--trim:${trim}" aria-label="${esc(h.name)}"><svg viewBox="0 0 100 112" role="img" aria-hidden="true"><ellipse cx="50" cy="105" rx="34" ry="6" fill="#302822" opacity=".22"/>${backWeapon}<path d="M31 82 28 104 43 104 48 83 M56 82 60 104 75 104 70 80" fill="#52463d" stroke="#49372e" stroke-width="3"/><path d="M20 103 24 71 Q26 54 39 53 L61 53 Q76 57 78 71 L82 103Z" fill="var(--robe)" stroke="#594338" stroke-width="3"/><path d="M23 74 10 90 18 96 34 80 M76 74 90 90 82 96 66 80" fill="var(--robe)" stroke="#594338" stroke-width="3"/><path d="M36 57 50 76 64 57 M31 93 69 93" fill="none" stroke="var(--trim)" stroke-width="3"/><path d="M45 76 55 76 57 102 43 102Z" fill="var(--trim)" opacity=".75"/>${accessory}${hair}<ellipse cx="50" cy="39" rx="22" ry="25" fill="${skin}" stroke="#6a4739" stroke-width="2.6"/><path d="M27 29 Q34 12 50 12 Q67 12 73 29 L63 23 51 28 40 24Z" fill="#292a2a"/><circle cx="42" cy="40" r="2.6" fill="#3c3029"/><circle cx="58" cy="40" r="2.6" fill="#3c3029"/><path d="M44 51 Q50 55 56 51" fill="none" stroke="#af6a60" stroke-width="2" stroke-linecap="round"/>${facialHair}${headwear}</svg><span class="portrait-icon">${h.icon}</span><span class="portrait-name">${esc(h.name)}</span></div>`;
}
function party(){return state.heroes.filter(h=>h.inParty).slice(0,state.selectedPartyMax)}
function partyCount(){return party().length}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),1900)}
function levelUpExp(n){let value=state.prosperity+n;while(value>=100){value-=100;state.cityLevel++;state.gold+=150;toast('主城升到 Lv.'+state.cityLevel+'，额外获得铜钱！')}state.prosperity=value;}
function setPlayerName(value){
  const name=String(value||'').trim();
  if(!/^[\p{L}\p{N}· _-]{2,12}$/u.test(name))return false;
  state.playerName=name;editingProfile=false;save();return true;
}
function renderProfileSetup(){
  let host=document.querySelector('#profile-setup');
  if(!host)return;
  host.innerHTML=state.playerName&&!editingProfile?'':`<div class="profile-backdrop"><form class="profile-sheet" id="profile-form" role="dialog" aria-modal="true" aria-labelledby="profile-title"><span class="profile-seal">义</span><small>水泊梁山 · 初逢江湖</small><h1 id="profile-title">${state.playerName?'更改江湖名号':'好汉，如何称呼？'}</h1><p>为自己的江湖故事取一个名字。<br>已有的好汉、资源和征战进度都会保留。</p><label for="player-name-input">你的名字</label><input id="player-name-input" name="playerName" autocomplete="nickname" maxlength="12" placeholder="请输入 2—12 个字" value="${esc(state.playerName)}" required autofocus><p id="profile-error" role="alert"></p><button type="submit">${state.playerName?'保存名字':'落款 · 入梁山'}</button>${state.playerName?'<button type="button" data-action="cancel-profile">暂不修改</button>':''}<small>无需注册账号 · 进度保存在此浏览器</small></form></div>`;
  const input=document.querySelector('#player-name-input');
  if(input)try{input.focus();input.setSelectionRange(input.value.length,input.value.length);}catch(e){}
}
function renderHeader(){const percent=state.prosperity%100;$('#header').innerHTML=`<div class="topline"><div class="profile"><div class="profile-badge">🏮</div><div><button class="player-name profile-name" data-action="edit-profile" aria-label="修改角色名字">${esc(state.playerName||'初到梁山')} <small>✎</small></button><div class="player-sub">山寨 Lv.${state.cityLevel} · ${esc(CHAPTERS[Math.min(state.stageUnlocked-1,CHAPTERS.length-1)].name)}</div></div></div><div class="resources"><span class="resource"><span class="ico">🪙</span>${state.gold}</span><span class="resource"><span class="ico">🌾</span>${state.grain}</span><span class="resource"><span class="ico">📜</span>${state.cultivation}</span><span class="resource"><span class="ico">💠</span>${state.jade}</span></div></div><div class="progress-row"><span>山寨兴盛</span><div class="bar"><i style="width:${percent}%"></i></div><span>${percent}/100</span><span>⚡ ${state.stamina}/${STAMINA_MAX}</span></div>`}
function renderFooter(){const items=[['city','🏯','山寨'],['heroes','🧑‍🤝‍🧑','好汉'],['campaign','🗺️','征战'],['recruit','🍶','招贤'],['more','🎐','玩法']];const f=$('#footer');if(state.page==='battle'||state.page==='story'){f.style.display='none';return}f.style.display='flex';f.innerHTML=items.map(([id,icon,label])=>`<button class="${state.page===id?'active':''}" data-action="page" data-page="${id}"><span>${icon}</span>${label}</button>`).join('')}
// Hotspots in % of the 16:9 city-q.jpg stage (x,y = label anchor on the building).
const CITY_HOTSPOTS=[
  {id:'heroes',cls:'city-heroes',x:52,y:27,icon:'🏯',name:'忠义堂',sub:'一百单八将 · 编队'},
  {id:'activity',cls:'city-activity',x:33,y:13,icon:'📜',name:'告示榜',sub:'义举 · 列传 · 访贤'},
  {id:'recruit',cls:'city-tavern',x:19,y:44,icon:'🍶',name:'聚义酒肆',sub:'招贤纳士'},
  {id:'gear',cls:'city-gear',x:80,y:46,icon:'⚒️',name:'神兵坊',sub:'强化 · 进阶'},
  {id:'arena',cls:'city-arena',x:74,y:12,icon:'🥋',name:'演武场',sub:'梁山擂台'},
  {id:'tower',cls:'city-tower',x:90,y:27,icon:'🗼',name:'试练塔',sub:''},
  {id:'market',cls:'city-market',x:92,y:68,icon:'⛵',name:'水寨黑市',sub:'信物 · 补给'},
  {id:'campaign',cls:'city-gate',x:47,y:66,icon:'🚩',name:'山河征途',sub:'出寨征战'}
];
function cityPage(){const chapter=CHAPTERS[Math.min(state.stageUnlocked-1,CHAPTERS.length-1)];return `<div class="city-scene city-q"><div class="city-stage-scroll"><div class="city-pan-hint" aria-hidden="true">‹ 左右滑动巡寨 ›</div><div class="city-stage">${CITY_HOTSPOTS.map(h=>`<button class="building city-spot ${h.cls}" data-action="page" data-page="${h.id}" style="left:${h.x}%;top:${h.y}%"><i>${h.icon}</i><span><b>${h.name}</b>${h.id==='tower'?`<small>第 ${state.towerFloor} 层</small>`:h.id==='arena'?`<small>荣誉 ${state.honor}</small>`:h.sub?`<small>${h.sub}</small>`:''}</span></button>`).join('')}<button class="city-claim tax" data-action="collect-tax" ${state.cityClaimed?'disabled':''} style="left:63%;top:57%"><i>🪙</i><span>${state.cityClaimed?'今日已领':'账房 · 领铜钱'}</span></button><button class="city-claim grain" data-action="collect-grain" ${state.farmClaimed?'disabled':''} style="left:31%;top:60%"><i>🌾</i><span>${state.farmClaimed?'今日已领':'粮仓 · 领粮草'}</span></button></div></div><button class="quest-card" data-action="page" data-page="campaign"><span class="quest-stamp">出山</span><span class="quest-copy"><b>${esc(chapter.name)} · ${esc(chapter.title)}</b><small>${chapter.isBoss?'头目战 · 留意首领机制':'普通战役 · 熟悉棋盘与职业克制'}　·　前往征战</small></span><span class="arrow">›</span></button><div class="city-footer-note">${state.heroes.length}/108 位好汉已归寨</div></div>`}
function campaignPage(){return campaignMapPage()}
function heroPower(h){const current=hero(h.id)||h;const bonus=hero(h.id)?Object.fromEntries(['hp','atk','move','range'].map(k=>[k,gearBonus(current,k)])):{};return window.SHUIHU_POWER.calculate(current,bonus);}
function heroFullName(h){return `${h.epithet} · ${h.name}`;}
function prebattleRoster(mode,stage=1){
 const difficulty=mode==='campaign'?(state.previewDifficulty||'normal'):'normal';
 const enemies=enemiesFor(mode,stage,difficulty),team=party();
 const own=team.reduce((n,h)=>n+heroPower(h),0),foe=enemies.reduce((n,h)=>n+window.SHUIHU_POWER.calculate(h),0);
 const card=(h,enemy=false)=>`<article class="scout-card ${enemy?'enemy':h.inParty?'chosen':'reserve'}">${artHTML(h)}<b>${esc(enemy?h.name:heroFullName(h))}</b><small>${enemy?'守关单位':'等级 '+h.level} · ${esc(h.role)}</small><strong>武力值 ${enemy?window.SHUIHU_POWER.calculate(h):heroPower(h)}</strong><small>移动 ${h.move+(enemy?0:gearBonus(h,'move'))} · 射程 ${h.range+(enemy?0:gearBonus(h,'range'))}</small>${enemy?'':`<button class="outline-btn" data-action="toggle-party" data-id="${h.id}" aria-pressed="${!!h.inParty}">${h.inParty?'已上阵 · 撤下':'安排上阵'}</button>`}</article>`;
 return `<section class="prebattle-roster"><header><span><small>出战准备</small><h3>点将 · 知己知彼</h3></span><b>${team.length}/${state.selectedPartyMax} 位上阵</b></header>${mode==='campaign'?`<div class="action-row"><button class="${difficulty==='normal'?'primary-btn':'outline-btn'}" data-action="preview-difficulty" data-difficulty="normal">普通守军 · 2 体力</button><button class="${difficulty==='elite'?'primary-btn':'outline-btn'}" data-action="preview-difficulty" data-difficulty="elite">精英守军 · 5 体力</button></div>`:''}<div class="power-comparison"><span>我方总武力值<strong>${own}</strong></span><span>${difficulty==='elite'?'精英':'当前'}敌方总武力值<strong>${foe}</strong></span></div><p class="muted-note">${own<foe?'敌方综合数值较高，可先养成或调整克制阵容。':'我方综合数值不低，仍需留意首领机制与走位。'}武力值不等于胜率。</p><h4>我方上阵</h4><div class="scout-cards">${team.map(h=>card(h)).join('')||'<p>请安排好汉上阵</p>'}</div><details class="reserve-list"><summary>替补好汉 · ${state.heroes.filter(h=>!h.inParty).length} 位（展开选人）</summary><div class="scout-cards">${state.heroes.filter(h=>!h.inParty).map(h=>card(h)).join('')||'<p>暂无替补，可先去酒馆结识好汉。</p>'}</div></details><h4>敌方守军 · ${difficulty==='elite'?'精英':'普通'}</h4><div class="scout-cards">${enemies.map(h=>card(h,true)).join('')}</div></section>`;
}
function renderHeroCard(h){const owned=Boolean(hero(h.id));return `<button class="hero-card rarity-${h.quality} ${state.selectedHero===h.id?'selected':''} ${owned?'owned':'unowned'}" data-action="select-hero" data-id="${h.id}">${artHTML(h)}<b>${esc(heroFullName(h))}</b><small>武力值 ${heroPower(h)}</small><span class="quality ${h.quality}">${QUALITY[h.quality]}</span><small>${owned?(h.inParty?'上阵中':'已入寨'):'第'+h.rank+'席'}</small></button>`}
function heroPage(){const selected=HERO_CATALOG.find(h=>h.id===state.selectedHero)||state.heroes[0];const owned=hero(selected.id);const skills=SKILLS[selected.id];const team=party();const active=owned?.activeSkill||0;const bondNames=selected.bonds.map(id=>DATA.bonds.find(b=>b.id===id)?.name).filter(Boolean);return `<div class="section"><div class="section-head"><div><span class="eyebrow">108 LIANGSHAN HEROES</span><strong class="section-title">一百单八将</strong></div><span class="soft-badge">已归寨 ${state.heroes.length}/108 · 上阵 ${team.length}/${state.selectedPartyMax}</span></div>${dexLine()}<div class="hero-detail card">${artHTML(selected)}<div class="hero-info"><span class="quality ${selected.quality}">${QUALITY[selected.quality]} · ${esc(selected.role)} · 第 ${selected.rank} 席</span><h2>${esc(heroFullName(selected))}</h2><span class="power-badge">武力值 ${heroPower(selected)}</span><span class="art-status">${ART[selected.id]?'专属立绘 · '+ART[selected.id].motion:'示意造型 · 专属美术待制作'}</span><div class="subline">${esc(selected.star)} · ${esc(selected.faction)} · Lv.${owned?.level||1} · 移动 ${selected.move+(owned?gearBonus(owned,'move'):0)} 格 · 射程 ${selected.range+(owned?gearBonus(owned,'range'):0)} 格</div><p class="hero-bio">${esc(selected.bio)}</p>${typeof heroStoryHTML==='function'?heroStoryHTML(selected):''}${[['生命',(owned?.hp||selected.hp)+(owned?gearBonus(owned,'hp'):0)],['攻击',(owned?.atk||selected.atk)+(owned?gearBonus(owned,'atk'):0)],['移动',selected.move+(owned?gearBonus(owned,'move'):0)],['射程',selected.range+(owned?gearBonus(owned,'range'):0)]].map(([k,v])=>`<div class="stat-line"><span>${k}</span><div class="bar"><i style="width:${Math.min(100,k==='生命'?v/3:k==='攻击'?v*2:v*22)}%"></i></div><b>${v}</b></div>`).join('')}</div></div><div class="formation-row">${Array.from({length:state.selectedPartyMax},(_,i)=>{const h=team[i];return `<div class="formation-slot ${h?'filled':''}">${h?`${h.icon} ${esc(h.name)}`:`空位 ${i+1}`}</div>`}).join('')}</div><div class="action-row">${owned?`<button class="primary-btn" data-action="toggle-party" data-id="${selected.id}">${owned.inParty?'撤下好汉':'安排上阵'}</button><button class="soft-btn" data-action="train-hero" data-id="${selected.id}">升一级 · 🪙 ${owned.materials.levelCoin+(owned.level-1)*owned.materials.levelCoinStep}</button>`:`<button class="primary-btn" data-action="recruit-target" data-id="${selected.id}">定向招募 · 🪙 300</button><button class="soft-btn" data-action="recruit-target" data-id="${selected.id}" data-payment="token">定向招募 · 招贤符 ×1</button>`}</div><div class="skills-box card"><h3>被动与名将技 ${owned?`· 技能等级 ${owned.skillLevel||1}`:'· 收录于将册'}</h3><div class="skill-row"><span class="skill-chip">常驻被动</span><b>${esc(skills[0][0])}</b><small>${esc(skills[0][1])}</small></div>${selected.skills.map((skill,i)=>`<div class="skill-row">${owned?`<button class="skill-chip ${active===i?'on':''}" data-action="choose-skill" data-index="${i}">${active===i?'当前':'带入'}</button>`:`<span class="skill-chip">名将技 ${i+1}</span>`}<b>${esc(skill.name)}</b><small>${esc(skill.description)} · 范围 ${skill.range} 格 · 每场一次</small></div>`).join('')}${selected.exclusiveTrait?`<div class="trait-note"><b>专属特性 · ${esc(selected.exclusiveTrait.name)}</b><span>${esc(selected.exclusiveTrait.description)}</span></div>`:''}<div class="action-row">${owned?`<button class="outline-btn" data-action="upgrade-skill">修为升级 · 📜 ${owned.skillLevel>=5?'已满':owned.materials.skillCultivation+(owned.skillLevel-1)*owned.materials.skillCultivationStep}</button>`:''}${owned?`<button class="soft-btn" data-action="gear-page">为好汉配装</button>`:'<span class="soft-badge">入寨后可配装</span>'}</div></div>${bondNames.length?`<div class="skills-box card"><h3>人物羁绊</h3><p>${bondNames.map(esc).join(' · ')}</p></div>`:''}<div class="skills-box card"><h3>阵容合击 · 当前队伍</h3>${comboFor(team)?`<span class="quality diamond">${esc(comboFor(team).name)}</span><p class="muted-note">${esc(comboFor(team).description)}</p>`:'<p class="muted-note">上阵羁绊名单中的好汉，战斗开始时发动合击。</p>'}<button class="outline-btn" data-action="combo-book">查看合击图鉴</button></div><div class="skills-box card"><h3>梁山将册 · 108 席</h3><p class="muted-note">选择任一好汉查看生平、数值、被动与两项主动技；未招募角色可用铜钱或招贤符定向获得。</p><div class="hero-strip">${HERO_CATALOG.map(renderHeroCard).join('')}</div></div></div>`}
// Guest slots: 11% apart horizontally (guest width 8% + stroll drift), clear of the 掌柜 box (left 62%+, top 22-54%).
// Tables in tavern-q.jpg: far-left (13%,64%), left (24%,52%), middle (44%,50%), front (60%,78%); counter = right side.
const TAVERN_GUEST_SLOTS=[[10,74],[23,60],[38,58],[49,82],[61,90]];
const TAVERN_OWNER={x:79,y:44};
// CMD-003 · P0：集合进度与保底读数的单一口径出口，招贤面板与将册共用，避免多处各算一份
function dexSummary(){
  const order=['diamond','red','purple','blue'];
  const rows=order.map(q=>({quality:q,label:QUALITY[q],own:state.heroes.filter(h=>h.quality===q).length,all:HERO_CATALOG.filter(h=>h.quality===q).length}));
  return {own:state.heroes.length,all:HERO_CATALOG.length,rows};
}
function dexLine(){
  const s=dexSummary();
  return `<div class="dex-progress" data-dex="${s.own}/${s.all}"><b>已入寨 ${s.own}/${s.all}</b><span>${s.rows.map(r=>`${r.label} ${r.own}/${r.all}`).join(' · ')}</span></div>`;
}
function pityLeft(){return Math.max(0,GACHA.hardPity-(state.jadePity?.pulls||0))}
function pityLine(){
  const left=pityLeft(),miss=state.jadePity?.eliteMiss||0;
  return `<span class="pity-chip" data-pity-left="${left}">距保底约 ${left} 次${miss?` · 名士已 ${miss} 次未出暗金`:''}</span>`;
}
function shardProgressLine(){
  const id=state.shardTarget||'hero-002';const got=state.shards?.[id]||0;
  return `<span class="shard-chip" data-shard="${id}:${got}">${heroMeta(id).name} 信物 ${got}/30</span>`;
}
function recruitPage(){
  if(window.SHUIHU_TAVERN_UI)return window.SHUIHU_TAVERN_UI.page();
  const guests=state.heroes.slice(0,5);
  return `<section class="tavern-page"><div class="tavern-heading"><small>LIANGSHAN · THE WINE HOUSE</small><h1>聚义酒肆</h1><p>一壶温酒，四方好汉。点掌柜寻访新朋友。</p><button class="tavern-quick soft-btn" data-action="tavern-owner">🍶 找掌柜招贤</button></div><div class="tavern-scroll"><div class="tavern-room"><button class="tavern-owner" style="left:${TAVERN_OWNER.x}%;top:${TAVERN_OWNER.y}%" data-action="tavern-owner" aria-label="与酒馆掌柜交谈，招募好汉">${artHTML({name:"酒肆掌柜",role:"谋士",color:"#b2763d",icon:"酒"},"owner-figure")}<b>掌柜 · 招贤</b><small>客官，里面请！</small></button>${guests.map((h,i)=>{const [gx,gy]=TAVERN_GUEST_SLOTS[i];return `<div class="tavern-guest" style="--guest:${i};--delay:-${i*3}s;left:${gx}%;top:${gy}%">${artHTML(h)}<span>${esc(h.name)}</span></div>`}).join('')}<button class="tavern-caption" data-action="tavern-owner">已归寨的好汉正在歇脚 · 点这里找掌柜招贤</button></div></div>${state.tavernMenu?`<div class="tavern-dialog" role="dialog" aria-label="掌柜招贤"><button class="soft-btn" data-action="tavern-close">收起招贤 · 返回酒肆</button>${recruitOptions()}</div>`:''}</section>`;
}
function recruitOptions(){return `<div class="section"><div class="section-head"><div><span class="eyebrow">LIANGSHAN TAVERN</span><strong class="section-title">聚义酒肆 · 招贤</strong></div><span class="soft-badge">招贤符 ${state.recruitTokens} · 💠 ${state.jade}</span></div>${dexLine()}<div class="pity-row">${pityLine()}${shardProgressLine()}</div><div class="chapter-banner"><span class="em">🍶</span><span><b>好汉相逢 · 一同上山</b><small>没有真实付费。定向招募可直接选将；随机寻访的概率和十次保底写明在下方。</small></span></div><div class="recruit-card card"><div class="recruit-banner one"><span class="large">🏮</span><span><b>把酒招贤</b><small>每日免费 1 次；之后消耗 1 招贤符。蓝 53% · 紫 34% · 红 13%</small></span></div><button class="primary-btn" data-action="recruit-one">免费寻访 / 用招贤符</button><span class="history-chip">已拥有角色重复获得时，转为 5 枚本人信物</span></div><div class="recruit-card card"><div class="recruit-banner two"><span class="large">⭐</span><span><b>名士荐举</b><small>每日免费 1 次；之后消耗 30 玉璧。红将 83% · 暗金 17%</small></span></div><button class="primary-btn" data-action="recruit-elite">免费 / 30 玉璧荐举</button></div><div class="recruit-card card"><div class="recruit-banner ten"><span class="large">🌟</span><span><b>十次寻访</b><small>200 玉璧 · 每十次至少获得 1 名暗金好汉，不额外收费</small></span></div><button class="primary-btn" data-action="recruit-ten">十次招贤 · 💠 200</button></div><div class="skills-box card"><h3>直接定向招募</h3><p class="muted-note">在「好汉」将册中点选未入寨角色，可用 300 铜钱或 1 招贤符直接招募。30 枚信物也可合成。</p><button class="outline-btn" data-action="page" data-page="heroes">打开 108 将册</button></div>${(state.lastRecruit||[]).length?`<div class="skills-box card"><h3>本次招贤</h3>${state.lastRecruit.map(h=>`<div class="roster-row">${artHTML(h)}<span class="copy"><b>${esc(h.name)}</b><small><span class="quality ${h.quality}">${QUALITY[h.quality]}</span> · ${h.role} · ${h.duplicate?'重复转信物':h.inParty?'已在阵中':'已入将册'}</small></span></div>`).join('')}</div>`:''}<div class="muted-note">每日免费次数次日恢复；保底进度随本地存档保存；玉璧可从每日聚义赏、主线首胜与试练塔每五层获得；不使用真实支付。</div></div>`}
function morePage(){const items=[['tower','🗼','试练塔','逐层挑战，获得铜钱、修为和进阶图纸'],['arena','🥋','梁山擂台','与本地模拟队伍切磋，赢取荣誉与积分'],['activity','📯','义举活动','人物列传、赈济百姓、探访名士'],['market','🪙','黑市','信物合成、装备和修为材料'],['gear','🛡️','兵器作坊','按职业强化装备、查看属性变化']];const bgmOn=window.BGM?BGM.isEnabled():true;const bgmVol=window.BGM?BGM.getVolume():0.35;return `<div class="section"><div class="section-head"><div><span class="eyebrow">LIANGSHAN SIDE MODES</span><strong class="section-title">山寨诸事</strong></div><span class="soft-badge">今日活动 ${state.activityLeft}/5</span></div>${items.map(([id,icon,name,desc])=>`<button class="feature-tile card" data-action="page" data-page="${id}"><span class="tile-ico">${icon}</span><span class="copy"><b>${name}</b><small>${desc}</small></span><span class="arrow">›</span></button>`).join('')}<div class="chapter-banner"><span class="em">🎐</span><span><b>每日聚义赏</b><small>铜钱、招贤符和修为；连续游玩不是领取条件。</small></span><button class="soft-btn" data-action="daily-task">${state.taskClaimed?'已领取':'领取'}</button></div><a class="feature-tile card" href="character-studio.html" target="_blank" rel="noopener"><span class="tile-ico">🎨</span><span class="copy"><b>好汉造型室</b><small>查看林冲、花荣、吴用的造型与动作样板</small></span><span class="arrow">›</span></a><a class="feature-tile card" href="combat-motion-studio.html" target="_blank" rel="noopener"><span class="tile-ico">⚔️</span><span class="copy"><b>动作演武场</b><small>查看待机、行走、普攻与专属技动作</small></span><span class="arrow">›</span></a><div class="skills-box card"><h3>🎵 背景音乐</h3><p class="muted-note">首次点击屏幕后开始播放；主城与战斗各有主题。</p><div class="bgm-row"><label class="switch"><input type="checkbox" data-action="bgm-toggle" ${bgmOn?'checked':''}><span class="slider"></span></label><span class="bgm-label">${bgmOn?'已开启':'已关闭'}</span></div><div class="bgm-row"><span class="bgm-label">音量</span><input type="range" min="0" max="1" step="0.05" value="${bgmVol}" data-action="bgm-volume" class="bgm-slider" ${bgmOn?'':'disabled'}></div></div><div class="skills-box card"><h3>⚔️ 战斗音效</h3><p class="muted-note">挥击、箭矢、法术与命中反馈；可独立于背景音乐关闭。</p><div class="bgm-row"><label class="switch"><input type="checkbox" data-action="sfx-toggle" ${window.SFX?.isEnabled()?'checked':''}><span class="slider"></span></label><span class="bgm-label">${window.SFX?.isEnabled()?'已开启':'已关闭'}</span></div><div class="bgm-row"><span class="bgm-label">音效音量</span><input type="range" min="0" max="1" step="0.05" value="${window.SFX?.getVolume()??.45}" data-action="sfx-volume" class="bgm-slider" ${window.SFX?.isEnabled()?'':'disabled'}></div></div><div class="skills-box card"><h3>本地进度</h3><p class="muted-note">存档只保存在当前浏览器。清除后无法恢复。</p><button class="outline-btn" data-action="reset-save">重置本地存档</button></div></div>`}
function towerPage(){return `<div class="section"><div class="section-head"><div><span class="eyebrow">TRIAL TOWER</span><strong class="section-title">梁山试练塔</strong></div><span class="soft-badge">第 ${state.towerFloor} 层</span></div><div class="chapter-banner"><span class="em">🗼</span><span><b>逐层登高，磨合阵容</b><small>层数越高奖励越丰厚；每五层额外获得进阶图纸。</small></span></div><div class="reward-grid"><div class="reward-item">🪙<b>铜钱</b></div><div class="reward-item">📜<b>修为</b></div><div class="reward-item">🎁<b>五层图纸</b></div></div>${prebattleRoster('tower')}<button class="primary-btn button-wide" data-action="tower-battle">挑战第 ${state.towerFloor} 层</button><div class="stage-card card"><span class="stage-node">${state.towerFloor}</span><span class="stage-copy"><b>当前守关：${state.towerFloor%5===0?'水泊精锐头领':'官军巡哨队'}</b><small>守军逐层增强 · 上方列出当前真实属性折算武力值</small></span></div></div>`}
function arenaPage(){const team=party().slice(0,3);return `<div class="section"><div class="section-head"><div><span class="eyebrow">LOCAL MIRROR MATCH</span><strong class="section-title">梁山擂台</strong><p class="power-badge">我方阵容武力值 ${party().reduce((sum,h)=>sum+heroPower(h),0)}</p></div><span class="soft-badge">积分 ${state.arenaPoints} · 荣誉 ${state.honor}</span></div><div class="chapter-banner"><span class="em">🏆</span><span><b>与山寨镜像队切磋</b><small>对手由本地预设队伍模拟；不连接服务器，胜利增加积分与荣誉。</small></span></div><div class="stage-card card"><span class="stage-node">⚔</span><span class="stage-copy"><b>擂主 · 祝家庄巡防队</b><small>${team.map(h=>esc(h.name)).join(' · ')||'安排好汉后即可开战'} 的强化镜像</small></span><span class="quality red">${state.arenaStreak} 连胜</span></div><div class="arena-hero-powers">${party().map(h=>`<article>${artHTML(h)}<b>${esc(heroFullName(h))}</b><small>等级 ${h.level} · ${h.role}</small><strong>武力值 ${heroPower(h)}</strong></article>`).join('')}</div><p class="muted-note">武力值是我方养成参考；站位、射程、克制与技能范围仍决定战局。</p><button class="primary-btn button-wide" data-action="arena-battle">开始切磋</button><div class="skills-box card"><h3>擂台商铺</h3><p class="muted-note">积分和荣誉可兑换好汉信物、修为与装备图纸。</p><button class="outline-btn" data-action="page" data-page="market">前往黑市 ›</button></div></div>`}
function activityPage(){return `<div class="section"><div class="section-head"><div><span class="eyebrow">DAILY GOOD DEEDS</span><strong class="section-title">义举活动</strong></div><span class="soft-badge">今日 ${state.activityLeft}/5 次</span></div>${DATA.activities.map((activity,i)=>`<button class="feature-tile card" data-action="activity-battle" data-kind="${i}"><span class="tile-ico">${['📜','🌾','📚'][i]}</span><span class="copy"><b>${esc(activity.name)}</b><small>${esc(activity.objective)} · 奖励：${esc(activity.reward)}</small></span><span class="primary-btn">进入</span></button>`).join('')}<div class="muted-note">每日开放 5 次；重置时间按本机自然日计算。</div></div>`}
function marketPage(){const id=state.shardTarget||'hero-002';const h=heroMeta(id);const shards=state.shards[id]||0;return `<div class="section"><div class="section-head"><div><span class="eyebrow">BLACK MARKET</span><strong class="section-title">山寨黑市</strong></div><span class="soft-badge">擂台荣誉 ${state.honor}</span></div><div class="skills-box card"><h3>好汉信物 · 30 枚合成</h3><label class="muted-note">选择目标： <select id="shard-target">${HERO_CATALOG.map(x=>`<option value="${x.id}" ${x.id===id?'selected':''}>${x.rank}. ${x.name} · ${QUALITY[x.quality]}</option>`).join('')}</select></label><div class="roster-row">${artHTML(h)}<span class="copy"><b>${h.name}信物</b><small>${shards}/30 枚 · 直招需 300 铜钱或 1 招贤符</small></span><button class="outline-btn" data-action="synthesize" data-id="${h.id}" ${shards<30?'disabled':''}>合成</button></div><button class="primary-btn" data-action="buy-shards" data-id="${h.id}">用 100 荣誉兑换 10 枚</button><button class="soft-btn" data-action="recruit-target" data-id="${h.id}">300 铜钱定向招募</button><button class="soft-btn" data-action="recruit-target" data-id="${h.id}" data-payment="token">1 招贤符定向招募</button></div><div class="feature-tile card"><span class="tile-ico">🧪</span><span class="copy"><b>修为丹</b><small>修为 +15 · 80 铜钱</small></span><button class="soft-btn" data-action="buy-exp">兑换</button></div><div class="feature-tile card"><span class="tile-ico">📐</span><span class="copy"><b>进阶图纸</b><small>装备进阶 · 120 荣誉</small></span><button class="soft-btn" data-action="buy-blueprint">兑换</button></div><div class="muted-note">所有物资均使用游戏内资源兑换。</div></div>`}
function gearStatText(stats){return [['atk','攻击'],['hp','生命'],['move','移动'],['range','射程']].filter(([key])=>stats[key]>0).map(([key,label])=>`${label} +${stats[key]}`).join(' · ')||'暂未获得属性'}
function gearPage(){
  const selected=hero(state.selectedHero)||state.heroes[0];
  const rows=GEAR[selected.role]||GEAR['战士'];
  return `<div class="section"><div class="section-head"><div><span class="eyebrow">LIANGSHAN ARMORY</span><strong class="section-title">${selected.role}神兵坊</strong></div><span class="soft-badge">图纸 ${state.blueprints} · 碎片 ${state.gearFragments}</span></div><div class="hero-detail card">${artHTML(selected)}<div class="hero-info"><h2>${esc(heroFullName(selected))} · 配装</h2><div class="subline">每位好汉可独立穿戴、卸下和更换。强化等级不超过山寨 Lv.${state.cityLevel}</div></div></div>${rows.map(([slot,name,icon])=>{
    const choice=gearChoice(selected,slot);
    return `<div class="skills-box card"><h3>${icon} ${name}位 · ${choice===null?'未装备':choice===1?'精制款':'常备款'}</h3>${[0,1].map(variant=>{
      const key=gearKey(selected.role,slot,variant),owned=variant===0||!!state.gearOwned[key],level=state.gearLevels[key]||0,advanced=!!state.gearAdvanced[key],stats=gearStats(selected.role,slot,variant,level,advanced),next=gearStats(selected.role,slot,variant,level+1,advanced);
      return `<div class="equip-row"><span class="equip-icon">${variant===1?'✨':icon}</span><span class="copy"><b>${variant===1?'精制':''}${esc(name)} ${advanced?'· 进阶':''} +${level}</b><small>${gearStatText(stats)} · 下级 ${gearStatText(next)}</small><small>${owned?`强化需 ${80+level*45} 铜钱、2 碎片${level>=3&&!advanced?' · 进阶需 1 图纸':''}`:'解锁需 100 铜钱、4 碎片'}</small></span>${owned?`<button class="outline-btn" data-action="equip-gear" data-slot="${slot}" data-variant="${variant}">${choice===variant?'已穿戴':'穿戴'}</button><button class="soft-btn" data-action="upgrade-gear" data-key="${key}" data-role="${selected.role}" data-level="${level}">强化</button>${level>=3&&!advanced?`<button class="outline-btn" data-action="advance-gear" data-key="${key}">进阶</button>`:''}`:`<button class="soft-btn" data-action="unlock-gear" data-key="${key}">打造</button>`}</div>`;
    }).join('')}<button class="text-btn" data-action="unequip-gear" data-slot="${slot}" ${choice===null?'disabled':''}>卸下此栏装备</button></div>`;
  }).join('')}<div class="muted-note">装备强化与进阶保留在物品上；更换后会按新装备的属性重新计算战斗数值。</div></div>`;
}
function comboFor(team){const ids=team.map(h=>h.id);return COMBOS.filter(c=>c.members.every(id=>ids.includes(id))).sort((a,b)=>b.members.length-a.members.length)[0]||null}
function comboBook(){return `<div class="modal-scrim"><div class="modal-card"><button class="modal-close" data-action="close-modal">×</button><h3>梁山合击图鉴</h3><p>上阵名单中的指定好汉，战斗开始时释放一次合击。</p>${COMBOS.map(c=>`<div class="skill-row"><b>${esc(c.name)}</b><small>${c.members.map(id=>esc(heroMeta(id).name)).join(' + ')} · ${esc(c.target)} · ${Math.round(c.ratio*100)}%全队攻击</small></div><p class="muted-note">${esc(c.description)}</p>`).join('')}</div></div>`}
function render(){
  if(state.page==='story'){$('#header').innerHTML='';$('#header').style.display='none';}else{$('#header').style.display='';renderHeader();}
  renderFooter();
  $('#app').dataset.page=state.page;
  const screen=$('#screen');
  screen.className='screen'+(state.page==='battle'?' battle-mode':'');
  if(state.page==='city')screen.innerHTML=cityPage();
  else if(state.page==='heroes')screen.innerHTML=heroPage();
  else if(state.page==='campaign')screen.innerHTML=campaignPage();
  else if(state.page==='recruit')screen.innerHTML=recruitPage();
  else if(state.page==='more')screen.innerHTML=morePage();
  else if(state.page==='tower')screen.innerHTML=towerPage();
  else if(state.page==='arena')screen.innerHTML=arenaPage();
  else if(state.page==='activity')screen.innerHTML=activityPage();
  else if(state.page==='market')screen.innerHTML=marketPage();
  else if(state.page==='gear')screen.innerHTML=gearPage();
  else if(state.page==='story')screen.innerHTML=storyPage();
  else if(state.page==='battle')screen.innerHTML=battlePage();
  else screen.innerHTML=cityPage();
  const b=state.page==='battle'?state.battle:null;
  if(b?.moveFxUid&&b.moveFxFrom&&b.moveFxAppliedSeq!==b.moveFxSeq){
    const seq=b.moveFxSeq;
    b.moveFxAppliedSeq=seq;
    requestAnimationFrame(()=>animateRenderedMove(b,screen,seq));
  }
  if(window.SFX){
    if(b?.fx&&b.soundAppliedSeq!==b.fx.seq){
      b.soundAppliedSeq=b.fx.seq;const fx=b.fx,attacker=[...b.allies,...b.enemies].find(u=>u.uid===fx.attacker);
      requestAnimationFrame(()=>{if(state.battle===b&&b.fx===fx)window.SFX.playCue({...fx,attacker,contactMs:window.SHUIHU_MOTION?.contactMs(attacker,fx.kind,b.speed)||0},()=>state.page==='battle'&&state.battle===b&&b.fx===fx);});
    }else if(!b?.fx)window.SFX.cancel();
  }
  renderProfileSetup();
  save();
  if(state.page==='story')scheduleStory();
  // BGM track follows page context
  if(window.BGM){
    if(state.page==='battle')BGM.play('battle');
    else BGM.play('city');
  }
}
function animateRenderedMove(b,screen,seq){
  if(state.battle!==b||b.moveFxSeq!==seq||!b.moveFxFrom)return;
  const actor=Array.from(screen.querySelectorAll('.unit-sprite')).find(el=>el.dataset.unit===b.moveFxUid);
  const from=screen.querySelector(`[data-cell-x="${b.moveFxFrom.x}"][data-cell-y="${b.moveFxFrom.y}"]`);
  const to=actor?.closest('.cell');
  if(!actor||!from||!to)return;
  const z=to.getBoundingClientRect();
  const depth=Number.parseFloat(actor.style.getPropertyValue('--depth-scale'))||1;
  const path=b.moveFxPath?.length?b.moveFxPath:[b.moveFxFrom,{x:Number(to.dataset.cellX),y:Number(to.dataset.cellY)}];
  const frames=path.map((p,index)=>{
    const cell=screen.querySelector(`[data-cell-x="${p.x}"][data-cell-y="${p.y}"]`),rect=cell?.getBoundingClientRect()||z;
    const dx=rect.left+rect.width/2-z.left-z.width/2,dy=rect.bottom-z.bottom;
    return {transform:`translate(calc(-50% + ${dx}px), ${dy}px) scale(${.82+p.y*.055})`,opacity:1,offset:index/(path.length-1||1)};
  });
  actor.classList.add('traveling');
  const movement=actor.animate(frames,{duration:battleDelay(b,420),easing:'linear'});
  movement.onfinish=()=>actor.classList.remove('traveling');
}
function dist(a,b){return Math.abs(a.x-b.x)+Math.abs(a.y-b.y)}
function gearKey(role,slot,variant){return `${role}:${slot}${variant===1?':1':''}`}
function gearChoice(h,slot){const slots=state.equipment[h.id];return slots&&Object.prototype.hasOwnProperty.call(slots,slot)?slots[slot]:0}
function gearStats(role,slot,variant,level,advanced=false){
  const base=GEAR[role].find(row=>row[0]===slot);
  const stat=base[3];
  const values={atk:0,hp:0,move:0,range:0};
  if(variant===0){
    if(stat==='atk')values.atk=5+level*5;
    if(stat==='hp')values.hp=12+level*24;
    if(stat==='move')values.move=Math.floor(level/2);
    if(stat==='range')values.range=Math.floor(level/3);
  }else{
    if(slot==='weapon'){values.atk=4+level*4;values.hp=12+level*8;}
    if(slot==='armor'){values.hp=12+level*14;values.atk=3+level*2;}
    if(slot==='boots'){values.move=Math.floor((level+1)/2);values.hp=6+level*6;}
    if(slot==='charm'&&stat==='hp'){values.hp=8+level*12;values.atk=2+level*2;}
    if(slot==='charm'&&stat==='range'){values.range=Math.floor((level+2)/3);values.hp=6+level*6;}
  }
  if(advanced){values.atk=Math.ceil(values.atk*1.2);values.hp=Math.ceil(values.hp*1.2);if(level>=3){if(values.move)values.move++;if(values.range)values.range++;}}
  return values;
}
function gearBonus(h,stat){let total=0;for(const row of GEAR[h.role]||[]){const slot=row[0],variant=gearChoice(h,slot);if(variant===null)continue;if(variant===1&&!state.gearOwned[gearKey(h.role,slot,1)])continue;const key=gearKey(h.role,slot,variant);total+=gearStats(h.role,slot,variant,state.gearLevels[key]||0,!!state.gearAdvanced[key])[stat]||0;}return total}
function activeSkillName(h){const s=SKILLS[h.id];return s?(s[1+(h.activeSkill||0)]||s[1])[0]:'聚义冲阵'}
function skillInfo(h){const s=SKILLS[h.id];return s?(s[1+(h.activeSkill||0)]||s[1]):['聚义冲阵','造成攻击伤害。']}
function enemiesFor(mode,stage,difficulty='normal',kind=0){
  const chapter=mode==='campaign'?CHAPTERS[Math.max(0,Math.min(stage-1,CHAPTERS.length-1))]:null;
  const boss=chapter?.bossId?BOSSES.find(b=>b.id===chapter.bossId):null;
  const scale=(mode==='tower'?1+state.towerFloor*.11:mode==='campaign'?1+Math.max(0,stage-1)*.065:mode==='arena'?1.04:1)*(difficulty==='elite'?1.38:1);
  const names=mode==='activity'?['列传守将','拦路官军','山道伏兵']:mode==='arena'?['擂台刀手','擂台弓手','擂台军师']:[chapter?.enemyName||'山道巡哨','官军侧翼弓手','官军传令兵'];
  let list=[
    {id:'enemy-vanguard',name:names[0],role:'战士',icon:'🪓',hp:116,atk:27,move:2,range:1,x:6,y:1},
    {id:'enemy-archer',name:names[1],role:'射手',icon:'🏹',hp:88,atk:24,move:2,range:3,x:7,y:0},
    {id:'enemy-strategist',name:names[2],role:'谋士',icon:'📜',hp:94,atk:22,move:2,range:3,x:7,y:2}
  ];
  if(boss){list=[
    {id:'enemy-formation-1',name:'阵旗护卫',role:'战士',icon:'🚩',hp:104,atk:24,move:2,range:1,x:6,y:0,formationGuard:true},
    {id:'enemy-archer',name:chapter.id===5?'曾头市弓手':'庄丁弓手',role:'射手',icon:'🏹',hp:92,atk:26,move:2,range:3,x:6,y:2,formationGuard:true},
    {id:'enemy-formation-2',name:'联防刀手',role:'战士',icon:'🛡️',hp:112,atk:25,move:2,range:1,x:7,y:3,formationGuard:true},
    {...boss,id:boss.id,boss:true,role:boss.role,icon:boss.icon,x:7,y:1}
  ];}
  if(mode==='activity'){
    const activity=DATA.activities[kind];
    list[0].name=activity?.name==='赈济百姓'?'拦粮官兵':activity?.name==='探访名士'?'拦路守卫':'列传守将';
    list[1].name='巡路弓手';list[2].name='阵前军师';
  }
  return list.map((e,i)=>{const hp=Math.round(e.hp*scale),atk=Math.round(e.atk*scale);return {...e,uid:`enemy-${i}`,hp,maxHp:hp,atk,baseAtk:atk,alive:true,status:{},acted:false,skillUsed:false,activeSkill:0};});
}
function applyOpeningCombo(b){const combo=b.combo;if(!combo)return;const living=b.enemies.filter(e=>e.hp>0);if(!living.length)return;const sum=b.allies.reduce((n,h)=>n+h.atk,0);let targets=[];const hitSeries=combo.target.match(/随机([235])次/);if(combo.target.includes('敌全体')||combo.target.includes('全体'))targets=living.slice();else if(combo.target.includes('前排'))targets=[living.reduce((a,e)=>e.x<a.x?e:a,living[0])];else if(hitSeries){for(let i=0;i<Number(hitSeries[1]);i++)targets.push(living[Math.floor(Math.random()*living.length)])}else{const count=combo.target.includes('三名')?3:combo.target.includes('两名')?2:combo.target.includes('五名')?5:1;const pool=living.slice().sort(()=>Math.random()-.5);targets=pool.slice(0,Math.min(count,pool.length))}targets.forEach(e=>{const shieldFactor=e.boss&&e.mechanic==='formationShield'&&b.enemies.some(g=>g.formationGuard&&g.hp>0)?.55:1;applyDamage(e,Math.round(sum*combo.ratio*shieldFactor));if(combo.target.includes('眩晕'))e.status.stun=1;if(combo.target.includes('虚弱'))e.status.weak=1;if(combo.target.includes('灼烧'))e.status.burn=2});b.message=`合击「${combo.name}」开场发动：${combo.target}受到压制。`}
function applyOpeningPassives(b){
  for(const u of b.allies){const p=u.passive;if(!p)continue;if(p.hpRatio){u.maxHp=Math.round(u.maxHp*(1+p.hpRatio));u.hp=u.maxHp}if(p.atkRatio&&p.code!=='vanguard')u.atk=Math.round(u.atk*(1+p.atkRatio));if(p.code==='vanguard'&&b.allies.filter(a=>a!==u&&dist(a,u)===1).length<2)u.atk=Math.round(u.atk*(1+p.atkRatio));if(p.code==='guard')u.status.shield=Math.round(u.maxHp*(p.shieldRatio||.08));}
  const ward=b.allies.find(u=>u.passive?.code==='ward');if(ward){const low=b.allies.slice().sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp)[0];low.status.shield=(low.status.shield||0)+Math.round(low.maxHp*(ward.passive?.shieldRatio||.12));}
  b.teamSkillBonus=b.allies.some(u=>u.passive?.code==='tactician')?.08:0;
}
function startBattle(mode,stage=1,kind=0,difficulty='normal'){
  if(state.battle&&!state.battle.result)return;
  const roster=party();
  if(!roster.length)return toast('先安排武将上阵');
  if(mode==='campaign'&&state.stamina<campaignCost(difficulty))return toast('体力不足，稍后再来');
  if(mode==='activity'&&state.activityLeft<=0)return toast('今日活动副本次数已用完');
  if(mode==='campaign')state.stamina-=campaignCost(difficulty);
  if(mode==='activity'){state.activityLeft--;state.activityKind=kind;}
  const chapter=CHAPTERS[Math.max(0,Math.min(stage-1,CHAPTERS.length-1))];
  const boss=mode==='campaign'&&chapter?.bossId?BOSSES.find(b=>b.id===chapter.bossId):null;
  const title=mode==='tower'?`试练塔 · 第${state.towerFloor}层`:mode==='arena'?'梁山擂台 · 本地镜像队':mode==='activity'?DATA.activities[kind]?.name||'义举活动':chapter.title+(difficulty==='elite'?' · 精英':'');
  const frontRows=[1,2,0,3],backRows=[1,2,0,3];
  let front=0,rear=0;
  const deployment=new Set();
  const allies=roster.map((h,index)=>{
    const gear=gearBonus(h,'atk');
    const frontliner=h.role==='战士';
    const row=frontliner?frontRows[front++%frontRows.length]:backRows[rear++%backRows.length];
    const columns=frontliner?[2,1,0]:[0,1,2];
    const slots=columns.flatMap(x=>[row,...[0,1,2,3].filter(y=>y!==row)].map(y=>({x,y})));
    const slot=slots.find(p=>!deployment.has(`${p.x},${p.y}`));
    deployment.add(`${slot.x},${slot.y}`);
    return {uid:'ally-'+index,id:h.id,name:h.name,rank:h.rank,gender:h.gender,role:h.role,quality:h.quality,icon:h.icon,color:h.color,hp:h.hp+gearBonus(h,'hp'),maxHp:h.hp+gearBonus(h,'hp'),atk:h.atk+gear,move:h.move+gearBonus(h,'move'),range:h.range+gearBonus(h,'range'),x:slot.x,y:slot.y,acted:false,moved:false,skillUsed:false,activeSkill:h.activeSkill||0,status:{},passive:clone(h.passive),exclusiveTrait:clone(h.exclusiveTrait)};
  });
  const enemies=enemiesFor(mode,stage,difficulty,kind);
  const combo=comboFor(roster);
  state.battle={mode,stage,kind,difficulty,title,reservation:{stamina:mode==='campaign'?campaignCost(difficulty):0,activity:mode==='activity'?1:0,date:state.lastDailyDate},bossId:boss?.id||null,returnPage:mode==='campaign'?'campaign':mode==='tower'?'tower':mode==='arena'?'arena':'activity',turn:1,speed:1,phase:'deploy',intent:'select',previewPath:[],guideStep:0,selectedId:allies[0]?.uid||'',allies,enemies,combo,result:null,auto:false,animating:false,pendingEnemyPhase:false,momentum:0,message:boss?`首领机制「${boss.mechanicName}」：${boss.mechanicDescription}`:'战士守前排，射手与谋士在后排；选好站位再出手。'};

  state.page='battle';
  render();
}
function beginBattle(b){
  if(!b||b.phase!=='deploy'||b.result)return;
  b.phase='player';b.reservation=null;b.previewPath=[];
  applyOpeningPassives(b);applyOpeningCombo(b);
  const prepared=b.allies.filter(u=>u.role!=='战士');
  for(const u of prepared){u.status.prepared=true;}
  if(prepared.length){b.message=(b.combo?b.message+' ':'')+'远程整备：射手凝神、谋士运筹，前两回合伤害 +12%；准备完成后按射程出手，不回复生命。';playBattleFx(b,null,prepared.map(u=>({uid:u.uid,x:u.x,y:u.y,buff:u.role==='射手'?'凝神 · 伤害 +12%':'运筹 · 伤害 +12%'})),'support');}
  else if(!b.combo)b.message='布阵完成，点击好汉，再点绿色格预览路径。';
  render();
}
function findPath(b,u,x,y,from=u){
  const start={x:from.x,y:from.y};
  const queue=[[start]],seen=new Set([`${start.x},${start.y}`]);
  for(let i=0;i<queue.length;i++){
    const path=queue[i],last=path[path.length-1];
    if(last.x===x&&last.y===y)return path;
    for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){
      const next={x:last.x+dx,y:last.y+dy},key=`${next.x},${next.y}`;
      if(next.x<0||next.x>=8||next.y<0||next.y>=4||seen.has(key))continue;
      const blocked=[...b.allies,...b.enemies].some(a=>a!==u&&a.hp>0&&a.x===next.x&&a.y===next.y);
      if(blocked)continue;
      seen.add(key);queue.push([...path,next]);
    }
  }
  return [];
}
function undoMove(b){
  const u=playerUnit(b),origin=u?.moveOrigin;
  if(!u||!origin||u.acted||b.auto||b.animating||b.phase!=='player')return;
  if(occupied(b,origin.x,origin.y))return toast('原位置已被占用，无法撤回');
  const from={x:u.x,y:u.y};u.travelPath=findPath(b,u,origin.x,origin.y);
  u.x=origin.x;u.y=origin.y;u.moved=false;u.moveOrigin=null;b.previewPath=[];
  logBattle(b,`${u.name}撤回走位，可以重新选择路线。`);playMoveFx(b,u,from);render();
}
// 8x4 grid laid flat on the grass of battle-q.jpg (percent of the 16:9 arena). Left 3 columns = blue camp, right = red.
const BOARD_GEOM={left:13,top:18,cellW:9.25,cellH:15};
function boardPoint(x,y){return {x:(BOARD_GEOM.left+(x+.5)*BOARD_GEOM.cellW)*10,y:(BOARD_GEOM.top+(y+.82)*BOARD_GEOM.cellH)*10};}
function battleEffects(b){
  if(!b.fx||b.fx.kind==='support')return '';
  const attacker=[...b.allies,...b.enemies].find(u=>u.uid===b.fx.attacker);
  if(!attacker)return '';
  if(attacker.role==='谋士'&&window.SHUIHU_VFX){const skill=heroMeta(attacker.id)?.skills?.[attacker.activeSkill||0];const effect=attacker.id==='hero-004'?(attacker.activeSkill===1?'wind':'thunder'):skill?.effect?.type==='burn'?'meteor':attacker.id==='hero-003'?(attacker.activeSkill===1?'rocks':'tactics'):attacker.id==='hero-001'?'banner':'tactics';return window.SHUIHU_VFX.magicSvg(effect,b.fx.hits.map(hit=>boardPoint(hit.x,hit.y)),b.speed);}
  if(attacker.id==='hero-004'&&b.fx.kind==='skill')return `<svg class="battle-effects thunder-effects" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${b.fx.hits.map(hit=>{const t=boardPoint(hit.x,hit.y);return `<path d="M${t.x+28},0 L${t.x-25},${t.y*.4} L${t.x+20},${t.y*.4} L${t.x},${t.y-30}" fill="none" stroke="#fff2a9" stroke-width="8"/><circle cx="${t.x}" cy="${t.y-30}" r="42" fill="none" stroke="#9fe6ff" stroke-width="5"/>`;}).join('')}</svg>`;
  const a=boardPoint(attacker.x,attacker.y),ranged=attacker.range>1;
  return `<svg class="battle-effects ${ranged?'ranged':'melee'} ${attacker.role==='谋士'?'magic':''}" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${b.fx.hits.map(hit=>{const t=boardPoint(hit.x,hit.y);return ranged?`<path class="projectile-trail" d="M${a.x},${a.y-45} Q${(a.x+t.x)/2},${Math.min(a.y,t.y)-100} ${t.x},${t.y-45}"/><g class="flying-shot">${attacker.role==='射手'?'<path d="M-26 0 H18 M8 -7 L21 0 L8 7 M-23 -5 L-16 0 L-23 5" fill="none" stroke="#ffe8a1" stroke-width="4"/>':'<circle r="11" fill="#a9f2ff" stroke="#fff" stroke-width="3"/>'}<animateMotion dur="${.48/(b.speed||1)}s" fill="freeze" rotate="auto" path="M${a.x},${a.y-45} Q${(a.x+t.x)/2},${Math.min(a.y,t.y)-100} ${t.x},${t.y-45}"/></g><circle class="impact-ring" cx="${t.x}" cy="${t.y-45}" r="25"/>`:`<path class="blade-arc" d="M${t.x-45},${t.y-100} Q${t.x+80},${t.y-60} ${t.x-25},${t.y+5}"/>`;}).join('')}</svg>`;
}
function occupied(b,x,y){return b.allies.some(u=>u.hp>0&&u.x===x&&u.y===y)||b.enemies.some(u=>u.hp>0&&u.x===x&&u.y===y)}
function playerUnit(b){return b.allies.find(u=>u.uid===b.selectedId)}
function reachableCells(b,u){if(!u||u.hp<=0||u.acted||u.moved)return[];const seen=new Set([`${u.x},${u.y}`]),found=[],queue=[{x:u.x,y:u.y,steps:0}];for(let i=0;i<queue.length;i++){const p=queue[i];if(p.steps>=u.move)continue;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,y=p.y+dy,key=`${x},${y}`;if(x<0||x>=8||y<0||y>=4||seen.has(key)||occupied(b,x,y))continue;seen.add(key);found.push({x,y});queue.push({x,y,steps:p.steps+1})}}return found}
function canMoveCell(b,u,x,y){return reachableCells(b,u).some(p=>p.x===x&&p.y===y)}
function guideLine(b){if(b.danger&&b.phase==='player')return `精英箭阵：红色第 ${b.danger.x+1} 列将在敌方回合受击，移出可避开 18% 生命伤害。`;if(b.phase==='deploy')return '开战前可自由布阵：选中好汉，点左侧蓝格放置；点空格调整位置；点占用格的底座可互换。';if(b.previewPath?.length)return '白点是实际行走路线，再点目的地确认；出手前可撤回走位。';if(b.phase==='enemy')return '敌方逐个行动；观察目标、状态和首领蓄势提示。';return ['我是小浒！战士在前，射手和谋士在后，先选中一位好汉。','点绿色格预览路线，再点同一格确认；会绕开已占用的位置。','点射程内敌军普攻；主动技可以点敌人，也可以点友军治疗或护盾。','战士克射手、射手克谋士、谋士克战士；克制时伤害提高 35%。','熟悉啦：站位、距离、主动技和首领机制都会影响战局。'][Math.min(b.guideStep||0,4)];}
function battlePage(){
  const b=state.battle;
  if(!b)return '<div></div>';
  const u=playerUnit(b);
  const enemies=b.enemies.filter(e=>e.hp>0).length;
  const previewTarget=b.intent==='skill'&&b.skillPreview?.actor===u?.uid?[...b.allies,...b.enemies].find(unit=>unit.uid===b.skillPreview.target&&unit.hp>0):null;
  const previewCells=previewTarget?skillCells(u,previewTarget,heroMeta(u.id).skills[u.activeSkill||0]):[];
  let cells='';
  for(let y=0;y<4;y++)for(let x=0;x<8;x++){
    const live=b.allies.find(a=>a.hp>0&&a.x===x&&a.y===y)||b.enemies.find(a=>a.hp>0&&a.x===x&&a.y===y);
    const hit=b.fx?.hits?.find(h=>h.x===x&&h.y===y);
    const fxUnit=hit?[...b.allies,...b.enemies].find(a=>a.uid===hit.uid):null;
    const unit=live||fxUnit;
    let cls='cell';
    if(b.danger?.x===x)cls+=' danger-cell';
    if(previewCells.some(cell=>cell.x===x&&cell.y===y))cls+=' skill-area-preview';
    if(b.fx?.cells?.some(cell=>cell.x===x&&cell.y===y))cls+=' skill-area-fx';
    if(b.phase==='deploy'&&x<3)cls+=' deploy-zone';
    const pathIndex=(b.previewPath||[]).findIndex(p=>p.x===x&&p.y===y);
    if(pathIndex>0)cls+=' path-preview';
    if(pathIndex>0&&pathIndex===b.previewPath.length-1)cls+=' path-end';
    if(!unit&&b.phase==='player'&&b.intent!=='skill'&&u&&canMoveCell(b,u,x,y))cls+=' move-range';
    if(unit&&unit.uid===b.selectedId)cls+=' unit-selected';
    const actingSkill=u?heroMeta(u.id).skills?.[u.activeSkill||0]:null;
    if(unit&&b.intent==='skill'&&actingSkill&&dist(u,unit)<=actingSkill.range&&((actingSkill.target==='ally_single'&&unit.uid.startsWith('ally'))||(actingSkill.target!=='ally_single'&&unit.uid.startsWith('enemy'))))cls+=' attack-range';
    else if(unit&&unit.uid.startsWith('enemy')&&u&&dist(u,unit)<=u.range)cls+=' attack-range';
    const support=b.fx?.kind==='support';
    const hitMarkup=hit?`<span class="hit-pop ${support?(hit.shield!==undefined&&hit.heal===undefined?'shield-pop':'healing'):''} ${hit.critical?'critical':''}">${support?(hit.buff||(hit.heal!==undefined?'治疗 +'+hit.heal:'护盾 +'+hit.shield)):(hit.critical?'暴击 ':'')+'−'+(hit.damage||0)}${!support&&hit.shield?' · 护盾吸收 '+hit.shield:''}</span>${support?'':'<span class="hit-spark">✦</span>'}`:'';
    let sprite='';
    if(unit){
      const ally=unit.uid.startsWith('ally');
      const fxClass=b.fx?.kind==='support'?(hit?'supported':''):b.fx?.attacker===unit.uid?'attacking':b.fx?.hits?.some(h=>h.uid===unit.uid)?'hit':'';
      const motion=window.SHUIHU_MOTION?.actorState(unit,b.fx,b.fx?.attacker===unit.uid,Boolean(hit))||{classes:'',cueClass:'',label:''};
      const depth=(.82+y*.055).toFixed(2);
      const actionCue=motion.cueClass?`<span class="action-cue ${motion.cueClass}" aria-hidden="true"></span>`:'';
      sprite=`<div class="unit-sprite ${ally?'ally':'enemy'} ${ART[unit.id]?.frames?'has-frames':''} ${unit.range>1?'ranged-unit':''} ${unit.boss?'boss-unit':''} ${unit.hp<=0?'dead':''} ${unit.uid===b.selectedId?'active':''} ${fxClass} ${motion.classes} ${b.moveFxUid===unit.uid?'moving':''}" style="--depth-scale:${depth}" data-unit="${unit.uid}" data-hero="${unit.id}" data-motion="${motion.label||''}" role="button" aria-label="${esc(unit.name)}">${artHTML(unit,'unit-art')}${unit.status?.shield>0?'<span class="shield-dome" aria-label="护盾保护中"></span>':''}${actionCue}<span class="hp-mini" aria-label="生命 ${unit.hp}/${unit.maxHp}"><i style="width:${Math.max(0,unit.hp/unit.maxHp*100)}%"></i></span><span class="unit-tag">${esc(unit.name)}${unit.boss?' · 首领':''}</span>${unit.status?.prepared&&b.turn<=2?'<span class="prepared-status">凝神·运筹 ↑</span>':''}${unit.status?.shield?`<span class="unit-status">🛡 ${unit.status.shield}</span>`:''}${unit.status?.marked?'<span class="unit-status marked">🎯 已点名</span>':''}${unit.status?.stun?'<span class="unit-status marked">💫 眩晕</span>':''}</div>`;
    }
    const left=BOARD_GEOM.left+x*BOARD_GEOM.cellW;
    const top=BOARD_GEOM.top+y*BOARD_GEOM.cellH;
    const style=`left:${left.toFixed(3)}%;top:${top.toFixed(3)}%;width:${BOARD_GEOM.cellW.toFixed(3)}%;height:${BOARD_GEOM.cellH}%;z-index:${10+y}`;
    cells+=`<button class="${cls}" style="${style}" data-cell-x="${x}" data-cell-y="${y}" aria-label="${x+1}列${y+1}行">${sprite}${hitMarkup}${pathIndex>0?`<span class="path-step">${pathIndex===b.previewPath.length-1?'✓':pathIndex}</span>`:''}</button>`;
  }
  const res=b.result&&b.resultRevealed!==false?`<div class="battle-result"><div class="result-card"><div class="result-mark">${b.result.win?'🏆':'🩹'}</div><h2>${b.result.win?'战斗胜利':'整队休整'}</h2><p>${b.result.win?'战术奏效，收下这次战利品。':'伙伴需要休整，调整阵容后再战。'}</p><div class="loot">${esc(b.result.reward||'未获得战利品')}</div>${(b.result.lines&&b.result.lines.length)?`<div class="story-lines">${b.result.lines.map(l=>`<p class="story-line"><b>${esc(l.name)}</b>${esc(l.text)}</p>`).join('')}</div>`:''}<button class="primary-btn" data-action="battle-return">${b.result.win?'返回战场外':'返回整队'}</button></div></div>`:'';
  const phaseLabel=b.phase==='deploy'?'自由布阵':b.phase==='enemy'?'敌军行动':'我方行动';const activeSkill=u?heroMeta(u.id).skills?.[u.activeSkill||0]:null;const boss=b.enemies.find(e=>e.boss);const guide={name:'小浒',role:'谋士',color:'#c87950',icon:'📯',epithet:'报信童'};
  return `<div class="battle-wrap ${b.phase==='deploy'?'deployment':''} ${b.fx?'fx-'+b.fx.kind:''}" style="--battle-speed:${b.speed||1};--contact-delay:${window.SHUIHU_MOTION?.contactMs([...b.allies,...b.enemies].find(u=>u.uid===b.fx?.attacker),b.fx?.kind,b.speed)||0}ms"><div class="battle-head"><button class="back" data-action="battle-retreat">‹ 返回</button><span>${esc(b.title)} · 第 ${b.turn} 回合 · ${phaseLabel}</span><button class="camera-btn" data-action="battle-zoom">${b.zoomed?'全景':'放大沙盘'}</button><span class="round-chip">敌军 ${enemies} 人</span></div><div class="battle-scene ${b.fx&&b.fx.kind!=='support'?'combat-shake':''} ${b.zoomed?'zoomed':''}"><div class="arena-layer"><div class="battle-banner">${b.phase==='deploy'?'布阵阶段 · 开战后触发羁绊':boss?`首领：${esc(boss.name)} · ${esc(boss.mechanicName)}`:b.combo?`合击「${esc(b.combo.name)}」已发动`:phaseLabel+' · 布阵战棋'}</div><div class="side-banner ally-side">梁山军 · 我方</div><div class="side-banner enemy-side">${esc(boss?.faction||'官军哨队')} · 敌方</div><div class="tactical-grid">${cells}</div>${battleEffects(b)}</div></div><div class="battle-controls">${b.phase==='deploy'?'<div class="deploy-notice"><b>排兵布阵</b><span>点选好汉 → 点击左侧蓝格调整位置；点击队友交换站位。前排护卫，后排射手，辅助居中。</span></div>':''}<div class="battle-guide">${artHTML(guide,'guide-portrait')}<span class="guide-copy"><b>小浒 · 战场报信人</b><span>${guideLine(b)}</span></span></div>${boss?`<div class="boss-rule"><b>${esc(boss.mechanicName)}</b><span>${esc(boss.mechanicDescription)}</span></div>`:''}<div class="selected-panel">${u?`${artHTML(hero(u.id)||heroMeta(u.id),'mini-art')}<span class="copy"><b>${esc(u.name)} · ${u.id==='hero-001'?'辅助 · 护盾 / 治疗':u.id==='hero-003'?'军师 · 控制 / 落石':u.role}　${u.hp}/${u.maxHp}</b><small>攻击 ${u.atk} · 移动 ${u.move} 格 · 射程 ${u.range} 格${u.acted?' · 本回合已行动':''}${u.status?.shield?` · 护盾 ${u.status.shield}`:''}</small></span>`:'<span class="copy"><b>选择一位好汉</b></span>'}<span class="mode-note">${b.intent==='skill'?`点选${activeSkill?.target==='ally_single'?'友军':'敌军'}预览「${esc(activeSkill?.name||'名将技')}」`:'点绿格预览 · 再点确认 · 橙框可攻击'}</span></div><div class="battle-log">${esc(b.message)}</div><div class="action-row">${b.phase==='deploy'?'<button class="battle-action begin" data-action="begin-battle">布阵完成 · 开战</button>':''}<button class="battle-action undo" data-action="undo-move" ${!u?.moveOrigin||u.acted||b.auto||b.animating?'disabled':''}>撤回走位</button><button class="battle-action skill ${b.intent==='skill'?'active':''}" data-action="battle-intent" ${b.phase!=='player'||!u||u.acted||u.skillUsed||b.animating?'disabled':''}>✨ ${u?esc(activeSkillName(hero(u.id)||heroMeta(u.id))):'名将技'}</button><button class="battle-action auto" data-action="auto-battle">${b.auto?'⏸ 暂停':'▶ 自动'}</button><button class="battle-action speed" data-action="battle-speed" aria-label="切换战斗速度">${b.speed||1}× 速度</button><button class="battle-action end" data-action="end-turn" ${b.phase!=='player'||b.animating?'disabled':''}>结束回合</button></div></div>${res}</div>`;
}
function roleMultiplier(a,d){const strong={战士:'射手',射手:'谋士',谋士:'战士'};return strong[a]===d?1.35:(strong[d]===a?0.78:1)}
function logBattle(b,msg){b.message=msg;b.logs=b.logs||[];b.logs.unshift(msg);b.logs=b.logs.slice(0,5)}
function nearestEnemy(b,u){return b.enemies.filter(e=>e.hp>0).sort((a,c)=>dist(u,a)-dist(u,c))[0]}
function nearestAlly(b,u){return b.allies.filter(a=>a.hp>0).sort((a,c)=>dist(u,a)-dist(u,c))[0]}
function moveTowards(b,u,target,steps){
  const options=[];
  for(let y=0;y<4;y++)for(let x=0;x<8;x++){
    if(occupied(b,x,y))continue;
    const path=findPath(b,u,x,y);
    if(path.length>1&&path.length-1<=steps)options.push({x,y,path,distance:dist({x,y},target)});
  }
  if(dist(u,target)<=u.range||!options.length)return 0;
  options.sort((a,c)=>(Math.max(0,a.distance-u.range)-Math.max(0,c.distance-u.range))||a.path.length-c.path.length);
  const dest=options[0];u.travelPath=dest.path;u.x=dest.x;u.y=dest.y;return dest.path.length-1;
}
function battleDamage(attacker,target,mult=1,b=null,isSkill=false){let factor=roleMultiplier(attacker.role,target.role);if(attacker.status?.prepared&&b?.turn<=2)factor*=1.12;const passive=attacker.passive;if(!isSkill&&passive?.code==='marksman'&&b&&dist(attacker,target)>=3)factor*=1+(passive.damageRatio||0);if(passive?.code==='quickdraw'&&b?.turn===1)factor*=1+(passive.atkRatio||0);if(!isSkill&&passive?.code==='piercer')factor*=1+(passive.damageRatio||0);if(!isSkill&&passive?.code==='skirmish'&&attacker.moved)factor*=1+(passive.damageRatio||0);if(passive?.code==='finisher'&&target.hp/target.maxHp<.5)factor*=1+(passive.damageRatio||0);if(attacker.status?.weak)factor*=.78;if(attacker.status?.attackDown)factor*=1-attacker.status.attackDown;if(isSkill&&b?.teamSkillBonus)factor*=1+b.teamSkillBonus;if(isSkill&&attacker.exclusiveTrait?.damageRatio)factor*=1+attacker.exclusiveTrait.damageRatio;if(target.boss&&target.mechanic==='formationShield'&&b?.enemies.some(e=>e.hp>0&&e.formationGuard))factor*=.55;return Math.max(1,Math.round(attacker.atk*mult*factor))}
function applyDamage(target,amount){let damage=Math.max(1,Math.round(amount)),absorbed=0;if(target.passive?.code==='unyielding'&&!target.status.unyieldingUsed&&target.hp/target.maxHp>=.5&&(target.hp-damage)/target.maxHp<.5){target.status.shield=(target.status.shield||0)+Math.round(target.maxHp*(target.passive.shieldRatio||.14));target.status.unyieldingUsed=true}if(target.status?.shield>0){absorbed=Math.min(target.status.shield,damage);target.status.shield-=absorbed;damage-=absorbed}const hpDamage=Math.min(target.hp,damage);target.hp=Math.max(0,target.hp-hpDamage);return {hpDamage,absorbed}}
function updateBossThresholds(b){const boss=b.enemies.find(e=>e.boss);if(!boss||boss.hp<=0||boss.mechanic!=='rally'||boss.rallyUsed||boss.hp/boss.maxHp>.5)return;boss.rallyUsed=true;boss.status.shield=Math.round(boss.maxHp*.15);for(const ally of b.allies.filter(a=>a.hp>0))applyDamage(ally,Math.round(boss.atk*.12));logBattle(b,`${boss.name}发动「山寨号令」：全体受到冲击，首领获得护盾。`);if(b.allies.every(a=>a.hp<=0))finishBattle(b,false)}
function endPlayerPhase(b){if(b.result)return;if(b.allies.filter(u=>u.hp>0).every(u=>u.acted)){if(b.animating)b.pendingEnemyPhase=true;else enemyPhase(b)}}
function finishBattle(b,win,deferReveal=false){
  if(b.result)return;
  let reward='';
  if(win){
    const chapter=b.mode==='campaign'?CHAPTERS[b.stage-1]:null;
    const boss=chapter?.bossId?BOSSES.find(x=>x.id===chapter.bossId):null;
    const baseCoin=b.mode==='arena'?100:b.mode==='tower'?70+state.towerFloor*12:b.mode==='activity'?110:(chapter?.reward.gold||100)+(boss?.reward.gold||0);
    const coin=Math.round(baseCoin*(b.difficulty==='elite'?1.65:1));
    const fragments=(chapter?.reward.gearFragments||3)+(b.difficulty==='elite'?2:0);
    state.gold+=coin;
    state.gearFragments+=fragments;
    levelUpExp(18);
    if(b.mode==='campaign'){
      const firstClear=!state.clearedStages[b.stage];
      state.clearedStages[b.stage]=true;
      state.campaignWins++;
      state.stageUnlocked=Math.max(state.stageUnlocked,b.stage+1);
      state.grain+=chapter?.reward.grain||18;
      const bossCultivation=firstClear?(boss?.reward.cultivation||0):0;
      state.cultivation+=bossCultivation;
      const firstClearJade=firstClear?20:0;
      if(firstClearJade)state.jade+=firstClearJade;
      let recruitNote='';
      const unlock=HERO_CATALOG.find(h=>h.rank===chapter?.rewardHeroRank);
      if(firstClear&&unlock&&!hero(unlock.id)){
        obtainHero(unlock.id);
        recruitNote=` · 好汉 ${unlock.name} 应招`;
      }
      reward=`铜钱 +${coin} · 粮草 +${chapter?.reward.grain||18} · 装备碎片 +${fragments}${firstClearJade?` · 首胜玉璧 +${firstClearJade}`:''}${bossCultivation?` · 首胜修为 +${bossCultivation}`:''}${recruitNote}`;
    }else if(b.mode==='tower'){
      const gained=18+state.towerFloor*2;
      state.cultivation+=gained;
      state.towerFloor++;
      let towerJade=0;
      if((state.towerFloor-1)%5===0){state.blueprints++;towerJade=15;state.jade+=towerJade}
      reward=`铜钱 +${coin} · 修为 +${gained} · 装备碎片 +${fragments}${towerJade?` · 每五层玉璧 +${towerJade}`:''}`;
    }else if(b.mode==='arena'){
      state.arenaWins++;
      state.arenaStreak++;
      const points=100+Math.max(0,state.arenaStreak-1)*25;
      const honor=20+state.arenaStreak*5;
      state.arenaPoints+=points;
      state.honor+=honor;
      reward=`铜钱 +${coin} · 积分 +${points} · 荣誉 +${honor}`;
    }else{
      state.cultivation+=15;
      if(b.kind===0){
        const candidate=state.heroes.find(h=>h.quality==='diamond'&&!h.inParty)||HERO_CATALOG.find(h=>h.quality==='diamond'&&!hero(h.id));
        const id=candidate?.id||'hero-002';
        state.shards[id]=(state.shards[id]||0)+5;
        reward=`铜钱 +${coin} · ${heroMeta(id).name}信物 +5 · 修为 +15`;
      }else if(b.kind===1){
        state.grain+=60;
        reward=`铜钱 +${coin} · 粮草 +60 · 修为 +15`;
      }else{
        state.grain+=20;
        reward=`铜钱 +${coin} · 粮草 +20 · 修为 +15`;
      }
    }
  }else if(b.mode==='arena')state.arenaStreak=0;
  const storyLines=(b.mode==='campaign'&&typeof beatLinesFor==='function')?beatLinesFor(b.stage,win?'win':'lose'):[];
  b.result={win,reward,lines:storyLines};
  b.resultRevealed=!deferReveal;
  logBattle(b,win?'梁山阵线稳住了，战利品已经记入寨账。':'队伍暂时退回山寨；调整站位和技能后再战。');
  save();
}
function battleDelay(b,ms){return Math.max(35,Math.round(ms/(b.speed||1)))}
function pauseBattle(b,ms){return new Promise(resolve=>setTimeout(resolve,battleDelay(b,ms)))}
function playBattleFx(b,attacker,hits,kind='strike',cells=[]){if(!hits.length)return;clearTimeout(b.fxTimer);const seq=(b.fxSeq||0)+1;b.fxSeq=seq;b.fx={seq,attacker:attacker?.uid,hits,kind,cells};b.animating=true;b.fxTimer=setTimeout(()=>{if(state.battle!==b||b.fx?.seq!==seq)return;b.fx=null;b.animating=false;if(b.result&&b.resultRevealed===false)b.resultRevealed=true;if(b.pendingEnemyPhase&&!b.result){b.pendingEnemyPhase=false;enemyPhase(b)}render()},battleDelay(b,820))}
function playMoveFx(b,u,from){
  if(from){b.moveFxFrom={uid:u.uid,x:from.x,y:from.y};b.moveFxPath=u.travelPath?.length?u.travelPath:findPath(b,u,u.x,u.y,from);u.travelPath=null;}
  b.moveFxUid=u.uid;
  const seq=(b.moveFxSeq||0)+1;
  b.moveFxSeq=seq;
  b.animating=true;
  setTimeout(()=>{
    if(state.battle!==b||b.moveFxSeq!==seq)return;
    b.moveFxUid='';
    b.moveFxFrom=null;
    b.animating=false;
    render();
  },battleDelay(b,440));
}
function tickEnemyDebuffs(unit){if(unit.status?.weak)unit.status.weak--;if(unit.status?.attackDownTurns){unit.status.attackDownTurns--;if(unit.status.attackDownTurns<=0){delete unit.status.attackDownTurns;delete unit.status.attackDown}}}
function resolveEliteVolley(b){
  if(b.difficulty!=='elite')return;
  if(b.danger){const hits=b.allies.filter(u=>u.hp>0&&u.x===b.danger.x);for(const u of hits)applyDamage(u,Math.round(u.maxHp*.18));logBattle(b,`精英箭阵落下，命中 ${hits.length} 人；红色预警列可提前走位避开。`);}
  if(b.allies.every(u=>u.hp<=0)){finishBattle(b,false);return;}
  const front=b.allies.filter(u=>u.hp>0).sort((a,c)=>c.x-a.x)[0];
  b.danger=front?{x:front.x}:null;
}
function enemyPhase(b){
  if(b.result)return Promise.resolve();
  if(b.enemyPhasePromise)return b.enemyPhasePromise;
  b.phase='enemy';b.skillPreview=null;
  b.intent='select';
  b.enemyPhaseRunning=true;
  b.message='敌军开始行动，留意每位武将的目标与站位。';
  render();
  const pause=ms=>pauseBattle(b,ms);
  b.enemyPhasePromise=(async()=>{
    const lines=[];
    try{
      await pause(260);
      resolveEliteVolley(b);if(b.result)return;
      for(const marked of b.allies.filter(a=>a.hp>0&&a.status?.marked>0&&!a.moved)){
        const loss=applyDamage(marked,Math.round(marked.maxHp*.16));
        marked.status.marked=0;
        b.message=`${marked.name}留在原位，被记号箭命中；护盾吸收 ${loss.absorbed}，生命损失 ${loss.hpDamage}。`;
        lines.push(b.message);render();await pause(300);
      }
      for(const ally of b.allies.filter(a=>a.hp>0&&a.status?.burn>0)){
        const loss=applyDamage(ally,Math.round(ally.maxHp*.08));
        ally.status.burn--;
        b.message=`${ally.name}受到灼烧，护盾吸收 ${loss.absorbed}，生命损失 ${loss.hpDamage}。`;
        lines.push(b.message);render();await pause(260);
      }
      // Tick ally weak/attackDown at the start of the enemy phase so the debuff lasts
      // one full player turn regardless of whether the ally attacked or only moved.
      for(const ally of b.allies.filter(a=>a.hp>0))tickEnemyDebuffs(ally);
      if(b.allies.every(a=>a.hp<=0)){finishBattle(b,false);return;}
      for(const e of b.enemies){
        if(b.result||state.battle!==b)break;
        if(e.hp<=0)continue;
        if(e.status?.burn){
          const burn=Math.max(1,Math.round(e.maxHp*.08));
          applyDamage(e,burn);
          e.status.burn--;
          b.message=`${e.name}受到灼烧，-${burn}。`;
          lines.push(b.message);
          render();
          await pause(260);
          if(e.hp<=0)continue;
        }
        if(e.status?.stun){
          e.status.stun--;
          b.message=`${e.name}被眩晕，跳过本回合。`;
          lines.push(b.message);
          render();
          await pause(330);
          continue;
        }
        if(e.boss&&b.turn%2===0&&e.mechanic==='formationShield'){
          const target=nearestAlly(b,e);
          if(target&&dist(e,target)<=((e.skill&&e.skill.range)||1)){
            const result=applyDamage(target,battleDamage(e,target,e.skill?.multiplier||1.2,b,false));
            target.status.stun=Math.max(target.status.stun||0,e.skill?.duration||1);
            b.message=`${e.name}施展「${e.skill?.name||'闭门合围'}」：${target.name}受击并眩晕 1 回合。`;
            lines.push(b.message);tickEnemyDebuffs(e);playBattleFx(b,e,[{uid:target.uid,x:target.x,y:target.y,damage:result.hpDamage,shield:result.absorbed}],'enemy');render();await pause(700);
            continue;
          }
        }
        if(e.boss&&b.turn%2===0&&e.mechanic==='moraleBreak'){
          const target=b.allies.filter(a=>a.hp>0&&dist(e,a)<=(e.skill?.range||4)).sort((a,c)=>c.x-a.x)[0];
          if(target){const result=applyDamage(target,battleDamage(e,target,e.skill?.multiplier||.78,b,false));target.status.weak=Math.max(target.status.weak||0,1);b.message=`${e.name}发动「${e.skill?.name||'督战令'}」：${target.name}受击并虚弱 1 回合。`;lines.push(b.message);tickEnemyDebuffs(e);playBattleFx(b,e,[{uid:target.uid,x:target.x,y:target.y,damage:result.hpDamage,shield:result.absorbed}],'enemy');render();await pause(700);}
          if(target)continue;
        }
        if(e.boss&&b.turn%2===0&&e.mechanic==='markedShot'){
          const target=b.allies.filter(a=>a.hp>0&&dist(e,a)<=(e.skill?.range||5)).sort((a,c)=>dist(c,e)-dist(a,e))[0];
          if(target){const result=applyDamage(target,battleDamage(e,target,e.skill?.multiplier||1.25,b,false));const hit={uid:target.uid,x:target.x,y:target.y,damage:result.hpDamage,shield:result.absorbed};target.status.marked=2;b.message=`${e.name}施放「${e.skill?.name||'毒箭点名'}」，射中并标记了${target.name}；被标记者移动后可躲开追加伤害。`;lines.push(b.message);tickEnemyDebuffs(e);playBattleFx(b,e,[hit],'enemy');render();await pause(500);continue;}
        }
        if(e.boss&&b.turn%2===0&&e.mechanic==='rally'){
          const center=nearestAlly(b,e);
          const targets=center&&dist(e,center)<=(e.skill?.range||3)?b.allies.filter(a=>a.hp>0&&dist(a,center)<=1):[];
          const hits=[];
          for(const target of targets){const result=applyDamage(target,battleDamage(e,target,e.skill?.multiplier||.68,b,false));target.status.burn=Math.max(target.status.burn||0,e.skill?.duration||2);hits.push({uid:target.uid,x:target.x,y:target.y,damage:result.hpDamage,shield:result.absorbed});}
          if(hits.length){
            b.message=`${e.name}施放「${e.skill?.name||'江火连营'}」，火势波及 ${targets.length} 位好汉并灼烧 2 回合。`;
            lines.push(b.message);tickEnemyDebuffs(e);playBattleFx(b,e,hits,'enemy');render();await pause(650);continue;
          }
        }
        const target=nearestAlly(b,e);
        if(!target)break;
        const from={x:e.x,y:e.y};
        moveTowards(b,e,target,e.move);
        if(e.x!==from.x||e.y!==from.y){
          b.message=`${e.name}向${target.name}逼近。`;
          playMoveFx(b,e,from);
          render();
          await pause(460);
        }
        const close=nearestAlly(b,e);
        if(close&&dist(e,close)<=e.range){
          const critical=Math.random()<.2;const damage=Math.round(battleDamage(e,close,.72,b,false)*(critical?1.5:1)),result=applyDamage(close,damage);
          const hit={uid:close.uid,x:close.x,y:close.y,damage:result.hpDamage,shield:result.absorbed,critical};
          b.message=`${e.name}攻击${close.name}，${result.absorbed?`护盾吸收 ${result.absorbed}，`:''}造成 ${result.hpDamage} 点伤害。`;
          lines.push(b.message);
          playBattleFx(b,e,[hit],'enemy');
          render();
          await pause(860);
          if(close.hp<=0)render();
        }else{
          b.message=`${e.name}占住位置，等待下一次出击。`;
          lines.push(b.message);
          render();
          await pause(180);
        }
        tickEnemyDebuffs(e);
        if(b.allies.every(a=>a.hp<=0)){finishBattle(b,false);break;}
        if(b.enemies.every(enemy=>enemy.hp<=0)){finishBattle(b,true);break;}
      }
      if(b.result||state.battle!==b)return;
      if(b.allies.every(a=>a.hp<=0)){finishBattle(b,false);return;}
      if(b.enemies.every(e=>e.hp<=0)){finishBattle(b,true);return;}
      b.turn++;
      if(b.turn>30){finishBattle(b,false);b.message='战斗超过 30 回合，双方撤出战场。';return;}
      b.phase='player';
      b.intent='select';
      b.allies.forEach(a=>{a.acted=false;a.moved=false;a.moveOrigin=null;});
      for(const ally of b.allies.filter(a=>a.hp>0)){
        const passive=ally.passive;
        if(ally.status.stun>0){ally.status.stun--;ally.acted=true;lines.push(`${ally.name}仍受眩晕影响，跳过本回合。`);continue;}
        if(passive?.code==='healer'){const low=b.allies.filter(a=>a.hp>0).sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp)[0];const healed=Math.round(low.maxHp*(passive.healRatio||.04));low.hp=Math.min(low.maxHp,low.hp+healed);}
        if(passive?.code==='guard'){ally.status.shield=(ally.status.shield||0)+Math.round(ally.maxHp*(passive.shieldRatio||.08));}
        if(ally.status.marked>0)ally.status.marked--;
      }
      b.selectedId=b.allies.find(a=>a.hp>0&&!a.acted)?.uid||b.allies.find(a=>a.hp>0)?.uid||'';
      b.message=lines.length?lines[lines.length-1]+' 轮到我方重新布阵。':'敌军整队推进，轮到我方重新布阵。';
    }finally{
      b.enemyPhaseRunning=false;
      b.enemyPhasePromise=null;
      if(state.battle===b)render();
    }
  })();
  return b.enemyPhasePromise;
}
function performAttack(b,attacker,target){if(b.allies.includes(attacker)===b.allies.includes(target))return false;if(!attacker||!target||attacker.acted||target.hp<=0||b.animating)return false;if(dist(attacker,target)>attacker.range){toast('目标超出射程；点选绿色格走位后再攻击');return false}const critical=Math.random()<.2;const damage=Math.round(battleDamage(attacker,target,1,b,false)*(critical?1.5:1)),result=applyDamage(target,damage),hits=[{uid:target.uid,x:target.x,y:target.y,damage:result.hpDamage,shield:result.absorbed,critical}];attacker.acted=true;b.momentum=Math.min(3,(b.momentum||0)+1);let note=`${attacker.name}攻击${target.name}，${result.absorbed?`护盾吸收 ${result.absorbed}，`:''}造成 ${result.hpDamage} 点伤害。`;if(roleMultiplier(attacker.role,target.role)>1)note+=' 职业克制，伤害提高 35%。';if(roleMultiplier(attacker.role,target.role)<1)note+=' 对方职业克制了这次攻击。';b.guideStep=Math.max(b.guideStep||0,3);logBattle(b,note);updateBossThresholds(b);playBattleFx(b,attacker,hits,'strike');if(b.enemies.every(e=>e.hp<=0)){finishBattle(b,true,true);return true}b.selectedId=b.allies.find(u=>u.hp>0&&!u.acted)?.uid||attacker.uid;b.intent='select';endPlayerPhase(b);return true}
function performSkill(b,attacker,target){if(!attacker||!target||attacker.acted||attacker.skillUsed||target.hp<=0||b.animating)return false;const skill=heroMeta(attacker.id).skills?.[attacker.activeSkill||0];if(!skill)return false;const effect=skill.effect||{};const skillLevel=hero(attacker.id)?.skillLevel||1;const skillScale=1+Math.max(0,skillLevel-1)*.05;const allyTarget=skill.target==='ally_single';if(allyTarget&&!b.allies.includes(target)||!allyTarget&&!b.enemies.includes(target))return toast(allyTarget?'名将技请选择我方好汉':'名将技请选择敌方目标'),false;if(dist(attacker,target)>skill.range){toast(`目标超出名将技 ${skill.range} 格射程`);return false}const hits=[];let note=`${attacker.name}施放「${skill.name}」`;
  if(effect.type==='heal'){for(const ally of skillTargets(b,attacker,target,skill)){const amount=Math.round(ally.maxHp*(effect.healRatio||.24)*skillScale);const healed=Math.min(amount,ally.maxHp-ally.hp);ally.hp+=healed;note+=`，为${ally.name}回复 ${healed} 点生命`;hits.push({uid:ally.uid,x:ally.x,y:ally.y,heal:healed});}note+='。';}
  else if(effect.type==='guard'){for(const ally of skillTargets(b,attacker,target,skill)){const shield=Math.round(ally.maxHp*(effect.shieldRatio||.22)*skillScale);ally.status.shield=(ally.status.shield||0)+shield;note+=`，${ally.name}获得 ${shield} 点护盾`;hits.push({uid:ally.uid,x:ally.x,y:ally.y,shield});}note+='。';}
  else {const targets=skillTargets(b,attacker,target,skill);for(const enemy of targets){let mult=(effect.multiplier||1)*skillScale;if(enemy!==target)mult*=effect.splash??.72;const critical=Math.random()<.2;const damage=Math.round(battleDamage(attacker,enemy,mult,b,true)*(critical?1.5:1)),result=applyDamage(enemy,damage);hits.push({uid:enemy.uid,x:enemy.x,y:enemy.y,damage:result.hpDamage,shield:result.absorbed,critical});if(effect.status==='眩晕')enemy.status.stun=Math.max(enemy.status.stun||0,effect.duration||1);if(effect.status==='灼烧')enemy.status.burn=Math.max(enemy.status.burn||0,effect.duration||2);if(effect.status==='虚弱')enemy.status.weak=Math.max(enemy.status.weak||0,effect.duration||1);if(effect.type==='mark')enemy.status.marked=effect.duration||2;if(attacker.passive?.code==='disruptor'){enemy.status.attackDown=attacker.passive.atkDown||.08;enemy.status.attackDownTurns=1;}}
    note+=`，命中 ${targets.length} 名敌人，主目标倍率 ${Math.round((effect.multiplier||1)*100)}%。`;if(effect.status)note+=` ${effect.status} ${effect.duration||1} 回合。`;if(roleMultiplier(attacker.role,target.role)>1)note+=' 职业克制生效。';}
  attacker.skillUsed=true;attacker.acted=true;b.intent='select';b.guideStep=Math.max(b.guideStep||0,4);logBattle(b,note);updateBossThresholds(b);playBattleFx(b,attacker,hits,allyTarget?'support':'skill',skillCells(attacker,target,skill));if(b.enemies.every(e=>e.hp<=0)){finishBattle(b,true,true);return true}b.selectedId=b.allies.find(u=>u.hp>0&&!u.acted)?.uid||attacker.uid;endPlayerPhase(b);return true}
// Single source of truth for skill cell shapes: used by targeting preview, damage resolution and battle FX.
// Shape ids match DATA.skillShapes; legacy effects without a shape keep their old footprint.
const BOARD_W=8,BOARD_H=4;
function resolveSkillShape(effect={}){
  if(effect.shape)return effect.shape==='pierce'?'line':effect.shape;
  if(effect.type==='pierce')return 'line';
  if(effect.type==='cleave'||effect.type==='burn'&&effect.radius>0)return 'diamond';
  return 'single';
}
function shapeCells(shape,origin,target,radius=1){
  const tx=target.x,ty=target.y,dx=origin&&target.x<origin.x?-1:1,out=[];
  const r=Math.max(1,radius||1);
  // For the 'six' shape (two rows × three columns), pick the adjacent row that stays on board,
  // preferring the row above (matches "上排中心" semantics); fall back to the row below.
  const sixRow2=ty-1>=0?ty-1:ty+1;
  const inShape=(x,y)=>{
    const ax=Math.abs(x-tx),ay=Math.abs(y-ty);
    switch(shape){
      case 'cross5':return ax+ay<=1;
      case 'diamond':return ax+ay<=r;
      case 'ring8':return Math.max(ax,ay)===1;
      case 'square9':return Math.max(ax,ay)<=1;
      case 'xcross':return ax===ay&&ax<=1;
      case 'six':return ax<=1&&(y===ty||y===sixRow2);
      case 'line':return origin?y===ty&&x>=Math.min(origin.x,tx)&&x<=Math.max(origin.x,tx):x===tx&&y===ty;
      case 'line2':return y===ty&&(x===tx||x===tx+dx);
      case 'column':return x===tx;
      case 'row':return y===ty;
      case 'fan':return (x===tx&&y===ty)||(x===tx+dx&&ay<=1);
      case 'all':return true;
      default:return x===tx&&y===ty;
    }
  };
  for(let y=0;y<BOARD_H;y++)for(let x=0;x<BOARD_W;x++)if(inShape(x,y))out.push({x,y});
  return out;
}
function skillCells(attacker,target,skill){
  const effect=skill?.effect||{};
  return shapeCells(resolveSkillShape(effect),attacker,target,effect.radius);
}
function skillTargets(b,attacker,target,skill){
  const cells=skillCells(attacker,target,skill),team=skill.target==='ally_single'?b.allies:b.enemies;
  return team.filter(unit=>unit.hp>0&&cells.some(cell=>cell.x===unit.x&&cell.y===unit.y));
}
function previewSkill(b,attacker,target){
  const skill=heroMeta(attacker.id).skills?.[attacker.activeSkill||0];
  if(!skill||attacker.acted||attacker.skillUsed||target.hp<=0)return false;
  const team=skill.target==='ally_single'?b.allies:b.enemies;
  if(!team.includes(target)||dist(attacker,target)>skill.range){toast('请选择技能射程内的正确阵营目标');return false;}
  if(b.skillPreview?.actor===attacker.uid&&b.skillPreview?.target===target.uid){b.skillPreview=null;return performSkill(b,attacker,target);}
  b.skillPreview={actor:attacker.uid,target:target.uid};
  const targets=skillTargets(b,attacker,target,skill);
  b.message=`「${skill.name}」将影响 ${targets.length} 人：${targets.map(unit=>unit.name).join('、')}。再点同一目标确认；点技能按钮取消。`;
  return true;
}
function selectUnit(uid){
  const b=state.battle;
  if(b?.phase==='deploy'){const friend=b.allies.find(a=>a.uid===uid);if(friend){b.selectedId=uid;b.message=`已选中${friend.name}，点左侧空格调整站位。`;render();}return;}
  if(!b||b.result||b.animating||b.auto||b.phase!=='player')return;
  const friend=b.allies.find(u=>u.uid===uid);
  if(friend){if(b.auto)return;const actor=playerUnit(b);if(b.intent==='skill'&&actor){previewSkill(b,actor,friend);render();return;}if(friend.acted){toast('这位好汉本回合已行动');return;}b.selectedId=uid;b.previewPath=[];b.intent='select';b.guideStep=Math.max(b.guideStep||0,1);render();return;}
  const enemy=b.enemies.find(u=>u.uid===uid);
  const actor=playerUnit(b);
  if(enemy&&actor){if(b.intent==='skill')previewSkill(b,actor,enemy);else if(dist(actor,enemy)<=actor.range)performAttack(b,actor,enemy);else toast(actor.moved?'这位好汉已经走位，请选择另一位好汉':'敌人在射程外，先点棋盘上的绿色格走位');}
  render();
}
function clickCell(x,y){
  const b=state.battle;
  if(b?.phase==='deploy'){if(x>=3)return toast('只能布置在左侧三列');const u=playerUnit(b),other=b.allies.find(a=>a.x===x&&a.y===y);if(other&&u){[u.x,other.x]=[other.x,u.x];[u.y,other.y]=[other.y,u.y];b.message=`${u.name}与${other.name}互换站位。`;render();}else if(u){u.x=x;u.y=y;b.message=`${u.name}站位已调整，点开战开始。`;render();}return;}
  if(!b||b.result||b.animating||b.phase!=='player'||b.auto)return;
  const occupant=[...b.allies,...b.enemies].find(u=>u.hp>0&&u.x===x&&u.y===y);
  if(occupant){selectUnit(occupant.uid);return;}
  const u=playerUnit(b);
  if(b.intent!=='skill'&&canMoveCell(b,u,x,y)){
    const preview=b.previewPath||[],last=preview[preview.length-1];
    if(!last||last.x!==x||last.y!==y){b.previewPath=findPath(b,u,x,y);b.message=`${u.name} · ${b.previewPath.length-1} 格路线，再点目标格确认。`;render();return;}
    const from={x:u.x,y:u.y};u.moveOrigin=from;u.travelPath=preview;b.previewPath=[];
    u.x=x;u.y=y;u.moved=true;b.intent='select';
    b.guideStep=Math.max(b.guideStep||0,2);
    logBattle(b,`${u.name}走位到前线，攻击范围已更新。`);
    playMoveFx(b,u,from);
    render();
    return;
  }
  if(b.intent==='skill')toast('请点选技能射程内的目标');
  else if(u&&!u.acted&&!u.moved&&dist(u,{x,y})>u.move)toast('绿色高亮格是这位武将本回合可到达的位置');
}
function autoBattle(){const b=state.battle;if(!b||b.result)return;if(b.phase==='deploy')beginBattle(b);if(b.auto){b.auto=false;render();return}b.previewPath=[];b.skillPreview=null;b.intent='select';b.auto=true;render();runAutoBattle(b)}
async function runAutoBattle(b){
  while(!b.result&&b.auto&&state.battle===b){
    if(b.animating){await pauseBattle(b,80);continue;}
    if(b.phase==='enemy'){await enemyPhase(b);continue;}
    const u=b.allies.find(a=>a.hp>0&&!a.acted);
    if(!u){await enemyPhase(b);continue;}
    let target=nearestEnemy(b,u);
    if(!target){finishBattle(b,true);break;}
    const from={x:u.x,y:u.y};
    if(!u.moved)moveTowards(b,u,target,u.move);
    if(u.x!==from.x||u.y!==from.y){
      u.moved=true;
      playMoveFx(b,u,from);
      render();
      await pauseBattle(b,460);
    }
    if(!b.auto||b.result)break;
    target=nearestEnemy(b,u);
    const skill=heroMeta(u.id).skills?.[u.activeSkill||0];
    const skillTarget=skill?.target==='ally_single'?b.allies.filter(a=>a.hp>0).sort((a,c)=>skill.effect?.type==='guard'?((a.status.shield||0)-(c.status.shield||0))||c.x-a.x:a.hp/a.maxHp-c.hp/c.maxHp)[0]:target;
    const supportNeeded=skill?.effect?.type==='guard'?skillTarget&&(skillTarget.status.shield||0)<skillTarget.maxHp*.1&&(dist(u,target)>u.range||skillTarget.hp/skillTarget.maxHp<.8):skillTarget&&skillTarget.hp/skillTarget.maxHp<.76;
    const canSkill=!u.skillUsed&&skill&&skillTarget&&dist(u,skillTarget)<=skill.range&&(skill.target!=='ally_single'||supportNeeded);
    if(dist(u,target)<=u.range||canSkill){
      if(canSkill)performSkill(b,u,skillTarget);else performAttack(b,u,target);
      render();
      await pauseBattle(b,660);
    }else{
      u.acted=true;
      logBattle(b,`${u.name}占据有利位置。`);
      endPlayerPhase(b);
      render();
      await pauseBattle(b,180);
    }
  }
  if(state.battle===b){b.auto=false;render();}
}
function obtainHero(id){const meta=heroMeta(id);const existing=hero(id);if(existing){const q=meta.quality||'blue';const shards=GACHA.dupShards[q]||5;const jade=GACHA.dupJade[q]||0;state.shards[id]=(state.shards[id]||0)+shards;if(jade)state.jade+=jade;return {...meta,duplicate:true,shardsGained:shards,jadeGained:jade}}const fresh={...clone(meta),inParty:false,level:1,skillLevel:1,activeSkill:0};state.heroes.push(fresh);return fresh}
function pullCandidate(qualities){let pool=HERO_CATALOG.filter(h=>qualities.includes(h.quality)&&!hero(h.id));if(!pool.length)pool=HERO_CATALOG.filter(h=>qualities.includes(h.quality));return pool[Math.floor(Math.random()*pool.length)]||HERO_CATALOG[0]}
function pullQuality(mode){const p=state.jadePity||{};if((p.pulls||0)>=GACHA.hardPity)return'diamond';const r=Math.random();if(mode==='elite'){const extra=Math.max(0,(p.eliteMiss||0)-(GACHA.softPity-1))*GACHA.softStep;const diamondChance=Math.min(60,GACHA.elite.diamond+extra)/100;return r<diamondChance?'diamond':'red'}if(r<GACHA.normal.blue/100)return'blue';if(r<(GACHA.normal.blue+GACHA.normal.purple)/100)return'purple';return'red'}
function recruit(mode){let count=1;if(mode==='normal'){if(state.dailyA>0)state.dailyA--;else if(state.recruitTokens>0)state.recruitTokens--;else return toast('免费次数与招贤符都用完啦')}else if(mode==='elite'){if(state.dailyB>0)state.dailyB--;else if(state.jade>=30)state.jade-=30;else return toast('玉璧不足，先去征战积累吧')}else{if(state.jade<200)return toast('玉璧不足，十连招募需要 200');state.jade-=200;count=10}const pulled=[];let hasDark=false;for(let i=0;i<count;i++){let q=mode==='ten'&&i===count-1&&!hasDark?'diamond':pullQuality(mode==='elite'?'elite':'normal');if(q==='diamond')hasDark=true;const result=obtainHero(pullCandidate([q]).id);pulled.push({...result,quality:q});if(q==='diamond'){state.jadePity.pulls=0;state.jadePity.eliteMiss=0}else{state.jadePity.pulls=(state.jadePity.pulls||0)+1;if(mode==='elite')state.jadePity.eliteMiss=(state.jadePity.eliteMiss||0)+1}}state.lastRecruitMode=mode;state.lastRecruit=pulled;state.recruitReveal=true;render();toast(mode==='ten'?'十次寻访完成，第 10 位为暗金保底位':'寻访完成，结果已记入将册')}
function addHeroLevel(h){if(!h)return;const cost=h.materials.levelCoin+(h.level-1)*h.materials.levelCoinStep;if(state.gold<cost)return toast('铜钱不足');if(h.level>=state.cityLevel)return toast('武将等级不能超过城池等级');state.gold-=cost;h.level++;h.atk+=Math.round(h.atk*.08)+2;h.hp+=Math.round(h.hp*.09)+8;toast(`${h.name}升到 Lv.${h.level}，属性提升`);render()}
function upgradeSkill(){const h=hero(state.selectedHero);if(!h)return;const cost=h.materials.skillCultivation+((h.skillLevel||1)-1)*h.materials.skillCultivationStep;if(h.skillLevel>=5)return toast('名将技已升至当前上限');if(state.cultivation<cost)return toast('修为不足，去试练塔获取');state.cultivation-=cost;h.skillLevel=(h.skillLevel||1)+1;toast('名将技提升到 Lv.'+h.skillLevel);render()}
function selectComboHeroPage(){$('#modal').innerHTML=comboBook()}
function beginAuto(){autoBattle()}
function clickAction(e){
  const target=e.target instanceof Element?e.target:e.target?.parentElement;
  const el=target?.closest('[data-action],[data-unit],[data-cell-x]');
  if(!el)return;
  const a=el.dataset.action;
  if(a==='edit-profile'){editingProfile=true;renderProfileSetup();return;}
  if(a==='cancel-profile'){editingProfile=false;renderProfileSetup();return;}
  if(a==='recruit-reveal-close'){state.recruitReveal=false;render();return;}
  if(a==='reveal-hero'){const id=el.dataset.id;state.recruitReveal=false;state.tavernMenu=false;if(HERO_CATALOG.some(h=>h.id===id))state.selectedHero=id;state.page='heroes';render();return;}
  if(a==='reveal-again'){const mode=el.dataset.mode||'normal';state.recruitReveal=false;render();recruit(mode);return;}
  if(a==='tavern-owner'){state.recruitReveal=false;state.tavernMenu=true;render();return;}
  if(a==='tavern-close'){state.tavernMenu=false;render();return;}
  const battle=state.battle;
  if(journeyAction(a,el))return;
  if(state.page==='battle'&&battle?.phase==='enemy'&&!['auto-battle','battle-speed','battle-retreat','battle-return','battle-zoom'].includes(a))return;
  if(state.page==='battle'&&battle?.animating&&!['auto-battle','battle-speed','battle-retreat','battle-return','battle-zoom'].includes(a))return;
  if(a==='page'){state.tavernMenu=false;clearTimeout(storyTimer);state.story=null;state.page=el.dataset.page;if(state.page==='gear'&&!hero(state.selectedHero)&&state.heroes[0])state.selectedHero=state.heroes[0].id;render();return;}
  if(el.dataset.unit){selectUnit(el.dataset.unit);return;}
  if(el.dataset.cellX!==undefined){clickCell(Number(el.dataset.cellX),Number(el.dataset.cellY));return;}
  if(a==='begin-battle'){beginBattle(battle);return;}
  if(a==='undo-move'){undoMove(battle);return;}
  if(a==='battle-zoom'){if(battle){battle.zoomed=!battle.zoomed;render();}return;}
  if(a==='end-turn'){const b=state.battle;if(!b||b.result||b.phase!=='player')return;b.allies.forEach(u=>{if(u.hp>0)u.acted=true;});enemyPhase(b);render();return;}
  if(a==='auto-battle'){beginAuto();return;}
  if(a==='battle-speed'){if(battle){battle.speed=battle.speed===1?2:battle.speed===2?3:1;render();}return;}
  if(a==='battle-return'){const b=state.battle;if(!b?.result)return;state.page=b.returnPage;state.battle=null;render();return;}
  if(a==='battle-retreat'){const b=state.battle;if(!b)return;const refundable=b.phase==='deploy'&&b.reservation?.date===state.lastDailyDate;if(refundable){state.stamina=Math.min(STAMINA_MAX,state.stamina+b.reservation.stamina);state.activityLeft=Math.min(5,state.activityLeft+b.reservation.activity);b.reservation=null;}state.page=b.returnPage;state.battle=null;toast(refundable?'已取消布阵，本场预扣资源已退回':'已返回战场外');render();return;}
  if(a==='battle-intent'){const b=state.battle,u=playerUnit(b);if(!b||b.phase!=='player'||!u||u.acted)return;if(b.intent!=='skill'&&u.skillUsed)return toast('这位武将本场名将技已用过');b.skillPreview=null;b.previewPath=[];b.intent=b.intent==='skill'?'select':'skill';b.guideStep=Math.max(b.guideStep||0,4);render();return;}
  if(a==='preview-difficulty'){state.previewDifficulty=el.dataset.difficulty==='elite'?'elite':'normal';render();return;}
  if(a==='select-hero'){state.selectedHero=el.dataset.id;render();return;}
  if(a==='refill-stamina'){if(state.stamina>=STAMINA_MAX)return toast('军令已经满了');if(state.grain<20)return toast('粮草不足，先去粮仓或战斗获取');state.grain-=20;state.stamina=STAMINA_MAX;toast('军令已经补满');render();return;}
  if(a==='campaign-battle'){enterStory(Number(el.dataset.stage),el.dataset.difficulty||'normal');return;}
  if(a==='tower-battle'){startBattle('tower',state.towerFloor);return;}
  if(a==='arena-battle'){startBattle('arena',1);return;}
  if(a==='activity-battle'){startBattle('activity',1,Number(el.dataset.kind));return;}
  if(a==='recruit-one'){recruit('normal');return;}
  if(a==='recruit-elite'){recruit('elite');return;}
  if(a==='recruit-ten'){recruit('ten');return;}
  if(a==='recruit-target'){const id=el.dataset.id;if(!HERO_CATALOG.some(h=>h.id===id))return;if(hero(id))return toast('这位好汉已经入寨');const token=el.dataset.payment==='token';if(token){if(state.recruitTokens<1)return toast('招贤符不足');state.recruitTokens--;}else{if(state.gold<300)return toast('铜钱不足；可选择招贤符招募');state.gold-=300;}const got=obtainHero(id);state.selectedHero=id;state.lastRecruit=[got];toast(`${got.name}应招上山，消耗${token?'招贤符 ×1':'铜钱 300'}`);render();return;}
  if(a==='collect-tax'){if(state.cityClaimed)return toast('今日城池收益已经领过');const n=120+state.cityLevel*16;state.gold+=n;state.cityClaimed=true;levelUpExp(10);toast(`主城收益 +${n} 铜钱`);render();return;}
  if(a==='collect-grain'){if(state.farmClaimed)return toast('今日农庄已经收成');state.grain+=40+state.cityLevel*3;state.farmClaimed=true;levelUpExp(5);toast('收获粮草，训练伙伴更从容');render();return;}
  if(a==='daily-task'){if(state.taskClaimed)return toast('每日奖励已经领取');state.taskClaimed=true;state.gold+=100;state.recruitTokens++;state.cultivation+=10;state.jade+=25;toast('每日奖励：铜钱、招贤符、玉璧与修为到账');render();return;}
  if(a==='reset-save'){if(!confirm('重置本地存档？当前角色、资源和关卡进度都会清空。'))return;localStorage.removeItem(SAVE_KEY);state=initialState();render();toast('新存档已建立');return;}
  if(['bgm-toggle','bgm-volume','sfx-toggle','sfx-volume'].includes(a))return;
  if(a==='toggle-party'){const h=hero(el.dataset.id);if(!h)return;if(h.inParty){if(partyCount()<=1)return toast('队伍里至少留一位武将');h.inParty=false;}else{if(partyCount()>=state.selectedPartyMax)return toast('最多上阵五位武将');h.inParty=true;}render();return;}
  if(a==='train-hero'){addHeroLevel(hero(el.dataset.id));return;}
  if(a==='choose-skill'){const h=hero(state.selectedHero);if(h){h.activeSkill=Number(el.dataset.index);toast('已切换入场名将技');render();}return;}
  if(a==='upgrade-skill'){upgradeSkill();return;}
  if(a==='gear-page'){state.page='gear';if(!hero(state.selectedHero))state.selectedHero=state.heroes[0].id;render();return;}
  if(a==='combo-book'){selectComboHeroPage();return;}
  if(a==='close-modal'){$('#modal').innerHTML='';return;}
  if(a==='equip-gear'){const h=hero(state.selectedHero),slot=el.dataset.slot,variant=Number(el.dataset.variant);if(!h||!GEAR[h.role].some(row=>row[0]===slot)||variant===1&&!state.gearOwned[gearKey(h.role,slot,1)])return;state.equipment[h.id]={...state.equipment[h.id],[slot]:variant};toast(`${h.name}已穿戴${variant===1?'精制':'常备'}装备`);render();return;}
  if(a==='unequip-gear'){const h=hero(state.selectedHero),slot=el.dataset.slot;if(!h||!GEAR[h.role].some(row=>row[0]===slot))return;state.equipment[h.id]={...state.equipment[h.id],[slot]:null};toast(`${h.name}卸下了这件装备`);render();return;}
  if(a==='unlock-gear'){const key=el.dataset.key;if(!/^\S+:(weapon|armor|boots|charm):1$/.test(key)||state.gearOwned[key])return;if(state.gold<100||state.gearFragments<4)return toast('打造需要 100 铜钱和 4 装备碎片');state.gold-=100;state.gearFragments-=4;state.gearOwned[key]=true;toast('精制装备已打造，可以穿戴');render();return;}
  if(a==='upgrade-gear'){const role=el.dataset.role,key=el.dataset.key,level=state.gearLevels[key]||0,cost=80+level*45;if(!GEAR[role]?.some(row=>key===gearKey(role,row[0],0)||key===gearKey(role,row[0],1)))return;if(key.endsWith(':1')&&!state.gearOwned[key])return;if(level>=state.cityLevel)return toast('装备强化等级不能超过城池等级');if(state.gold<cost)return toast('铜钱不足');if(state.gearFragments<2)return toast('装备碎片不足');state.gold-=cost;state.gearFragments-=2;state.gearLevels[key]=level+1;toast('装备强化完成，穿戴后属性提升');render();return;}
  if(a==='advance-gear'){const key=el.dataset.key;if((state.gearLevels[key]||0)<3||state.gearAdvanced[key])return;if(state.blueprints<1)return toast('缺少进阶图纸');state.blueprints--;state.gearAdvanced[key]=true;toast('装备进阶成功，穿戴后属性提升');render();return;}
  if(a==='buy-shards'){const id=el.dataset.id;if(state.honor<100)return toast('荣誉不足');state.honor-=100;state.shards[id]=(state.shards[id]||0)+10;toast('获得 '+heroMeta(id).name+' 信物 ×10');render();return;}
  if(a==='synthesize'){const id=el.dataset.id;if((state.shards[id]||0)<30)return toast('信物还不够 30 枚');state.shards[id]-=30;const got=obtainHero(id);state.selectedHero=id;toast(got.duplicate?'信物转化完成':'武将合成成功');render();return;}
  if(a==='buy-exp'){if(state.gold<80)return toast('铜钱不足');state.gold-=80;state.cultivation+=15;toast('修为丹到账，修为 +15');render();return;}
  if(a==='buy-blueprint'){if(state.honor<120)return toast('荣誉不足');state.honor-=120;state.blueprints++;toast('兑换到一张进阶图纸');render();return;}
  if(a==='tower-battle'){startBattle('tower',state.towerFloor);return;}
}
document.addEventListener('submit',e=>{if(e.target.id!=='profile-form')return;e.preventDefault();if(!setPlayerName($('#player-name-input').value)){$('#profile-error').textContent='请输入 2—12 个字，可使用中文、字母或数字。';return;}render();});
document.addEventListener('click',clickAction,true);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&state.tavernMenu){state.tavernMenu=false;render();return;}
  // 取名/改名表单：Escape 退出编辑并回到界面；仅在已取名时可取消，首次取名不退回空名。
  if(e.key==='Escape'&&editingProfile&&state.playerName){editingProfile=false;renderProfileSetup();}
});
document.addEventListener('input',e=>{if(e.target.dataset?.action==='bgm-volume'&&window.BGM)BGM.setVolume(Number(e.target.value));else if(e.target.dataset?.action==='sfx-volume')window.SFX?.setVolume(Number(e.target.value));},true);
document.addEventListener('change',e=>{const el=e.target;if(el.id==='shard-target'){state.shardTarget=el.value;render();}else if(el.dataset?.action==='bgm-volume'&&window.BGM)BGM.setVolume(Number(el.value));else if(el.dataset?.action==='bgm-toggle'&&window.BGM){BGM.setEnabled(el.checked);render();}else if(el.dataset?.action==='sfx-volume')window.SFX?.setVolume(Number(el.value));else if(el.dataset?.action==='sfx-toggle'){window.SFX?.setEnabled(el.checked);render();}},true);
render();

/* Scene presentation; recruit() remains the sole owner of currency and rewards. */
function tavernArt(h){return artHTML(h).replace('loading="lazy"','loading="eager"')}
window.SHUIHU_TAVERN_UI={
 page(){
  const guests=state.heroes.filter(h=>window.SHUIHU_TAVERN_LIFE?.people[h.id]).sort((a,b)=>['hero-006','hero-009','hero-022'].indexOf(a.id)-['hero-006','hero-009','hero-022'].indexOf(b.id)).slice(0,3);
  return `<section class="tavern-page tavern-v2"><div class="wine-title"><span>梁山 · 人间烟火</span><h1>聚义酒肆</h1><p>一盏温酒，四海相逢</p></div><div class="tavern-scroll"><div class="tavern-room"><div class="keeper-placement"><button class="keeper-character" data-action="tavern-owner" aria-label="与酒馆掌柜交谈，招募好汉"><img src="assets/tavern/keeper.png" alt="笑眯眯的胖掌柜" draggable="false"><img class="keeper-laugh" src="assets/tavern/keeper-laugh.png" alt="" aria-hidden="true"><span class="keeper-speech"><span>客官，酒温好了！</span><span>哈哈，好汉请坐！</span><span>今日想结识哪位朋友？</span></span></button></div><div class="counter-foreground" aria-hidden="true"></div><button class="keeper-sign" data-action="tavern-owner">掌柜 <span>· 招贤</span><i>对话</i></button>${guests.map(h=>`<div class="tavern-guest" data-hero="${h.id}"><span>${esc(h.name)}</span></div>`).join('')}<div class="wine-scene-hint">点击柜台后的掌柜 · 结识新好汉</div></div></div>${state.tavernMenu?`<div class="tavern-dialog summon-scene" role="dialog" aria-modal="true" aria-label="掌柜招贤"><button class="summon-close" data-action="tavern-close" aria-label="返回酒肆">×</button>${this.options()}</div>`:''}</section>`;
 },
 options(){
  if(state.recruitReveal&&(state.lastRecruit||[]).length)return this.reveal();
  const options=[['recruit-one','把酒相邀','寻一位有缘人',state.dailyA>0?'今日免费':`招贤符 × 1`,'hero-006','blue'],['recruit-elite','名士来访','红将 · 暗金好汉',state.dailyB>0?'今日免费':'玉璧 × 30','hero-009','red'],['recruit-ten','群英赴宴','第 10 位为暗金保底位','玉璧 × 200','hero-004','gold']];
  return `<header class="summon-heading"><small>聚义酒肆 · 好汉相逢</small><h2>温酒候君来</h2><span>招贤符 ${state.recruitTokens}　·　玉璧 ${state.jade}</span></header><div class="pity-row">${dexLine()}${pityLine()}</div><div class="keeper-dialogue"><img src="assets/tavern/keeper.png" alt="掌柜"><blockquote>酒已温好，<br>今天想结识哪路好汉？<small>—— 酒肆掌柜</small></blockquote></div><div class="invitation-row">${options.map(([action,title,sub,cost,id,tone])=>`<button class="invitation ${tone}" data-action="${action}"><div class="invitation-art">${tavernArt(heroMeta(id))}</div><span class="invitation-copy"><small>${sub}</small><b>${title}</b><strong>${cost}</strong></span></button>`).join('')}</div><div class="summon-bottom"><button data-action="page" data-page="heroes">定向结交 ›</button><details><summary>寻访规则与概率</summary><p>${this.ruleText()}</p></details></div>`;
 },
 ruleText(){
  const g=typeof GACHA!=='undefined'?GACHA:{normal:{blue:53,purple:34,red:13},elite:{red:83,diamond:17},hardPity:10,softPity:8,softStep:3};
  const n=g.normal,e=g.elite;
  return `把酒相邀：蓝 ${n.blue}% · 紫 ${n.purple}% · 红 ${n.red}%。名士来访：红 ${e.red}% · 暗金 ${e.diamond}%。群英赴宴前九次使用把酒概率，第 10 位为暗金保底位。另有跨轮计数：连续 ${g.hardPity} 次未见暗金后，下一次为暗金；名士来访连续 ${g.softPity} 次未见暗金后，暗金概率逐次提高 ${g.softStep} 个百分点。每日两种单次寻访各免费一次。重复好汉转为本人信物，暗金重复另回玉璧。定向招募可用 300 铜钱或 1 招贤符；30 信物可合成。玉璧可从每日聚义赏、主线首胜与试练塔每五层获得。仅使用游戏资源，不使用真实支付。`;
 },
 revealActions(){
  const list=state.lastRecruit||[];const fresh=list.filter(h=>!h.duplicate);const mode=state.lastRecruitMode;
  const cost=mode==='ten'?'玉璧 × 200':mode==='elite'?(state.dailyB>0?'今日免费':'玉璧 × 30'):(state.dailyA>0?'今日免费':'招贤符 × 1');
  const back=mode==='ten'?'再来十次':mode==='elite'?'再访名士':'再邀一位';
  const first=fresh[0];
  const primary=first?`<button class="summon-next" data-action="reveal-hero" data-id="${first.id}">查看 ${esc(first.name)} ›</button>`:`<button class="summon-next" data-action="page" data-page="heroes">去将册看信物进度 ›</button>`;
  const close=`<button class="summon-take" data-action="recruit-reveal-close">收下这份缘分</button>`;
  return `<div class="summon-actions">${primary}<button class="summon-again" data-action="reveal-again" data-mode="${mode||'normal'}">${back} · ${cost}</button>${close}<span class="summon-pity">${pityLine()}</span></div>`;
 },
 reveal(){const list=state.lastRecruit;return `<div class="summon-reveal ${list.length>1?'is-ten':''}" aria-live="polite"><div class="summon-rays" aria-hidden="true"></div><header><small>梁山又添新缘</small><h2>${list.length>1?'群英赴宴':'好汉，应邀而来'}</h2></header><div class="summoned-heroes">${list.map((h,i)=>`<article class="summoned-hero ${h.quality}" style="--arrival:${i*85}ms"><div class="summon-character">${tavernArt(h)}<span class="quality ${h.quality}">${QUALITY[h.quality]} · ${h.role}</span><h3>${esc(h.epithet)} · ${esc(h.name)}</h3><strong class="power-badge">武力值 ${heroPower(h)}</strong></div>${typeof heroStoryHTML==='function'?heroStoryHTML(h,true):''}<p>${h.duplicate?`旧友重逢 · 信物 +${h.shardsGained||5}${h.jadeGained?` · 玉璧 +${h.jadeGained}`:''}`:'新伙伴 · 已入将册'}</p></article>`).join('')}</div>${this.revealActions()}<small class="summon-saved">好汉与信物已自动保存</small></div>`;}
};

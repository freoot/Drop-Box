const JOURNEY=window.SHUIHU_JOURNEY;
let storyTimer=null;
/* CH-002 首章单关分段：沿用现有 beats 二元组，用两条哨兵旁白把数组切为开场段 / 胜利段 / 失败段。
   不新增任何数据字段；哨兵行措辞在未被识别时读起来仍是一句通顺的预演式旁白。 */
const STORY_MARK={win:'——若此战得胜——',lose:'——若此战不利——'};
function isStoryMark(beat,kind){return !!beat&&beat[0]==='旁白'&&typeof beat[1]==='string'&&beat[1].startsWith(STORY_MARK[kind]);}
function storySegments(stage){
 const j=JOURNEY[stage-1];const out={open:[],win:[],lose:[]};
 if(!j||!Array.isArray(j.beats))return out;
 let bucket=out.open;
 for(const beat of j.beats){
  if(isStoryMark(beat,'win')){bucket=out.win;continue;}
  if(isStoryMark(beat,'lose')){bucket=out.lose;continue;}
  bucket.push(beat);
 }
 return out;
}
function storyOpening(stage){
 const seg=storySegments(stage);
 return seg.open.length?seg.open:(JOURNEY[stage-1]?.beats||[]);
}
function beatSpeakerName(beat,j){
 const speaker=beat[0]==='旁白'?null:heroMeta(beat[0]);
 return speaker?(DATA.heroes.find(h=>h.id===speaker.id)?.name||BOSSES.find(b=>b.id===speaker.id)?.name||j.foeName):'山河记';
}
function beatLinesFor(stage,kind){
 const j=JOURNEY[stage-1];if(!j)return [];
 const seg=storySegments(stage);
 const list=kind==='win'?seg.win:kind==='lose'?seg.lose:seg.open;
 return list.filter(b=>Array.isArray(b)&&b.length>1&&b[1]).map(b=>({name:beatSpeakerName(b,j),text:b[1]}));
}
function campaignMapPage(){
 const selected=Math.max(1,Math.min(6,state.mapStage||state.stageUnlocked)),ch=CHAPTERS[selected-1],story=JOURNEY[selected-1],unlocked=selected<=state.stageUnlocked;
 const lines=JOURNEY.slice(1).map((p,i)=>`<path class="${i+1<state.stageUnlocked?'unlocked':''}" d="M${JOURNEY[i].x},${JOURNEY[i].y} Q${p.x-5},${JOURNEY[i].y} ${p.x},${p.y}"/>`).join('');
 return `<div class="journey-page"><header class="journey-head"><span><small>THE ROAD TO LIANGSHAN</small><h1>聚义山河</h1></span><span>军令 ${state.stamina}/${STAMINA_MAX} <button data-action="refill-stamina">补给 · 20 粮草</button></span></header><div class="journey-scroll"><div class="journey-map"><svg class="journey-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${JOURNEY.map(p=>{const done=state.clearedStages[p.id],open=p.id<=state.stageUnlocked;return `<button class="map-node ${p.id===selected?'selected':''} ${open?'open':'locked'}" data-action="map-select" data-stage="${p.id}" style="left:${p.x}%;top:${p.y}%" aria-label="${p.place} · ${open?'查看故事':'尚未解锁'}"><span class="map-portrait">${artHTML(heroMeta(p.foe),'map-art')}</span><span class="map-pin">${done?'✓':open?p.id:'锁'}</span><b>${p.place.split(' · ')[1]}</b><small>${p.landmark?p.landmark+' · ':''}${p.foeName}驻守</small></button>`}).join('')}<span class="map-caption">剧情路线示意 · 非真实地理比例　← 可左右滑动 →</span></div></div><section class="journey-detail"><div class="journey-lead">${artHTML(heroMeta(story.lead),'journey-portrait')}</div><div class="journey-copy"><span class="eyebrow">${story.thread} · 公元 ${story.year} 年 · ${story.season}</span><h2>${story.place}</h2><p>${story.hook}</p><small>驻守：${story.foeName}　目标：${story.goal}</small><p class="adaptation-note">年代、行程与对话为游戏改编；含往事演武。</p></div><div class="journey-launch">${unlocked?`<button class="primary-btn" data-action="campaign-battle" data-stage="${selected}" data-difficulty="normal">踏上征途 · 普通（2 体力）</button><button class="outline-btn" data-action="campaign-battle" data-stage="${selected}" data-difficulty="elite">精英挑战（5 体力）</button>`:'<span>完成前一地点后开放</span>'}<small>胜利：铜钱 ${ch.reward.gold} · 粮草 ${ch.reward.grain}</small></div></section>${prebattleRoster('campaign',selected)}</div>`;
}
function enterStory(stage,difficulty='normal'){
 if(stage<1||stage>CHAPTERS.length||stage>state.stageUnlocked)return toast('先完成上一段征途');
 if(state.stamina<campaignCost(difficulty))return toast('军令不足，可在征战地图补给');
 clearTimeout(storyTimer);state.story={stage,difficulty,index:0,autoplay:false};state.mapStage=stage;state.page='story';render();
}
function storyPage(){
 const s=state.story;if(!s)return campaignMapPage();const j=JOURNEY[s.stage-1],list=storyOpening(s.stage);
 if(!list.length)return campaignMapPage();
 const beat=list[Math.min(Math.max(0,s.index),list.length-1)],speaker=beat[0]==='旁白'?null:heroMeta(beat[0]);
 const name=speaker?(DATA.heroes.find(h=>h.id===speaker.id)?.name||BOSSES.find(b=>b.id===speaker.id)?.name||j.foeName):'山河记';
 return `<section class="story-scene weather-${j.weather}" style="--focus-x:${j.x}%;--focus-y:${j.y}%"><div class="story-landscape"></div><div class="story-weather" aria-hidden="true">${Array.from({length:18},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><header class="story-top"><button data-action="story-back">‹ 返回地图</button><button data-action="story-skip">跳过 · 前往布阵</button></header><div class="story-title"><span>${j.thread}</span><h1>${j.place}</h1><p>公元 ${j.year} 年 · ${j.season}</p><small>游戏改编纪年 · 非史实断言</small></div>${speaker?`<div class="story-character">${artHTML(speaker,'story-art')}</div>`:''}<div class="story-dialogue" aria-live="polite"><span class="eyebrow">${Math.min(s.index+1,list.length)} / ${list.length}　${name}</span><p>${esc(beat[1])}</p><small>本关目标：${j.goal}</small><div><button class="outline-btn" data-action="story-auto">${s.autoplay?'暂停播放':'自动播放'}</button><button class="primary-btn" data-action="story-next">${s.index>=list.length-1?'进入战场':'继续故事 ›'}</button></div></div></section>`;
}
function scheduleStory(){clearTimeout(storyTimer);if(state.page==='story'&&state.story?.autoplay)storyTimer=setTimeout(()=>{if(state.page!=='story'||!state.story?.autoplay)return;advanceStory();},5500);}
function advanceStory(skip=false){
 const s=state.story;if(!s)return;clearTimeout(storyTimer);
 const list=storyOpening(s.stage);
 if(skip||s.index>=list.length-1){state.story=null;startBattle('campaign',s.stage,0,s.difficulty);return;}
 s.index++;render();scheduleStory();
}
function journeyAction(a,el){
 if(a==='map-select'){state.mapStage=Number(el.dataset.stage);render();return true;}
 if(a==='story-next'||a==='story-skip'){advanceStory(a==='story-skip');return true;}
 if(a==='story-auto'){state.story.autoplay=!state.story.autoplay;render();scheduleStory();return true;}
 if(a==='story-back'){clearTimeout(storyTimer);state.story=null;state.page='campaign';render();return true;}
 return false;
}

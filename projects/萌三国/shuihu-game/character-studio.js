(()=>{
 const cast=[{id:'hero-006',name:'林冲',title:'豹子头 · 战士',description:'银蓝铠甲、白披风、短须，持霜纹龙首长枪。近战动作清楚区分出招、霜枪名将技和受击。'},
 {id:'hero-009',name:'花荣',title:'小李广 · 射手',description:'白绿锦袍、高马尾与金冠，长弓与箭雨形成鲜明轮廓。拉弓与箭雨名将技区分清楚。'},
 {id:'hero-003',name:'吴用',title:'智多星 · 谋士',description:'紫金儒袍、羽扇与卷册。以挥扇召落石与紫色术阵表达谋略，属于本作改编。'},
 {id:'hero-001',name:'宋江',title:'及时雨 · 谋士',description:'红金官袍与杏黄义旗。名将技以金色护阵光十字守护身边兄弟。'},
 {id:'hero-004',name:'公孙胜',title:'入云龙 · 谋士',description:'蓝白道袍与松纹古剑，名将技召来雷云，呼风唤雨。'},
 {id:'hero-013',name:'鲁智深',title:'花和尚 · 战士',description:'橙色僧袍、花绣与月牙禅杖，名将技一杖震地。'},
 {id:'hero-014',name:'武松',title:'行者 · 战士',description:'红头巾与双戒刀，名将技为交叉刀光的醉步连环。'},
 {id:'hero-022',name:'李逵',title:'黑旋风 · 战士',description:'黑面虬髯、双板斧，名将技卷起红色旋风。'},
 {id:'hero-030',name:'张顺',title:'浪里白条 · 战士',description:'白衣短打、赤足持鱼叉，名将技掀起浪花翻江。'},
 {id:'hero-036',name:'燕青',title:'浪子 · 战士',description:'花绣浪子、轻装短弩，名将技为相扑锁臂摔投。'},
 {id:'hero-037',name:'朱武',title:'神机军师 · 谋士',description:'青袍阵旗与令牌，名将技展开太极石阵。'},
 {id:'hero-059',name:'扈三娘',title:'一丈青 · 战士',description:'银甲红裙、日月双刀，名将技挥出金红刀光。'}];
 const actions=[['idle','待机','轻微呼吸起伏，观察完整造型。'],['walk','移动','两帧连续步态（左右脚交替）配合位移补间。'],['attack','普通攻击','独立出招原画与前冲回收。'],['skill','名将技','独立名将技原画，含招式光效。'],['hit','受击','独立受击原画、后仰和短暂亮闪。'],['defeat','倒地','独立倒地原画（金星绕头），不再旋转淡出。']];
 let current=cast[0],action='idle',timer=null,walkTimer=null,speed=1;
 const $=id=>document.getElementById(id);
 function render(){
 $('characters').innerHTML=cast.map(c=>`<button data-hero="${c.id}" aria-pressed="${c===current}">${c.name}<small>${c.title}</small></button>`).join('');
 $('actions').innerHTML=actions.map(a=>`<button data-pose="${a[0]}" aria-pressed="${a[0]===action}">${a[1]}</button>`).join('');
 $('name').textContent=current.name;$('identity').textContent=current.title;$('description').textContent=current.description;
 const asset=window.SHUIHU_ART[current.id];clearInterval(walkTimer);walkTimer=null;
 if(asset.frames){
  const f=asset.frames,n=f.order.length,at=pose=>`${(f.order.indexOf(pose)/(n-1)*100).toFixed(4)}% 0`;
  const frame={idle:'idle',walk:'walkA',attack:'attack',skill:'skill',hit:'hit',defeat:'down'}[action];
  $('pose').style.backgroundImage=`url("${f.sheet}")`;$('pose').style.backgroundSize=`${n*100}% 100%`;$('pose').style.backgroundPosition=at(frame);
  $('pose').dataset.frame=frame;$('actor').dataset.frames='true';
  if(action==='walk')walkTimer=setInterval(()=>{const next=$('pose').dataset.frame==='walkA'?'walkB':'walkA';$('pose').dataset.frame=next;$('pose').style.backgroundPosition=at(next);},Math.round(220/speed));
 }else{
  const single=asset.cast&&['attack','skill'].includes(action);$('actor').dataset.frames='false';
  $('pose').style.backgroundImage=`url("${single?asset.cast:asset.actions}")`;
  $('pose').style.backgroundSize=single?'100% 100%':'200% 200%';$('pose').style.backgroundPosition='';
 }
 $('pose').setAttribute('aria-label',current.name+' · '+actions.find(a=>a[0]===action)[1]);
 $('actor').dataset.action=action;$('actor').style.setProperty('--speed',speed);
 $('motion-note').textContent=actions.find(a=>a[0]===action)[2];
 }
 function stop(){clearInterval(timer);timer=null;$('loop').textContent='连续演示';$('loop').setAttribute('aria-pressed','false');}
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.hero){current=cast.find(c=>c.id===b.dataset.hero);action='idle';render();}
 if(b.dataset.pose){stop();action=b.dataset.pose;render();}
 });
 $('loop').onclick=()=>{if(timer){stop();return;}timer=setInterval(()=>{action=actions[(actions.findIndex(a=>a[0]===action)+1)%actions.length][0];render();},2400);$('loop').textContent='暂停演示';$('loop').setAttribute('aria-pressed','true');};
 $('speed').onclick=()=>{speed=speed===1?2:1;$('speed').textContent=speed===1?'慢速 · 1×':'快速 · 2×';render();};
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();clearInterval(walkTimer);walkTimer=null;}});render();
})();

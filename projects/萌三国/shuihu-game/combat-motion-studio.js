/* Presentation-only study. No writes to the game save or combat state. */
(()=>{
 const canvas=document.querySelector('#stage'),c=canvas.getContext('2d'),status=document.querySelector('#status'),images={};
 const motion=window.SHUIHU_MOTION_TIMING;
 const config={frames:24,size:640,cols:6,impact:motion.CONTACT};
 let mode='idle',time=0,last=0,paused=false,sound=false,audio=null,struck=false,particles=[],health=100,freeze=0;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function load(name){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{images[name]=img;resolve()};img.onerror=reject;img.src=`assets/models/cutout/${name}-atlas.png?v=2`})}
 function tone(){if(!sound)return;audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(230,audio.currentTime);o.frequency.exponentialRampToValueAtTime(65,audio.currentTime+.12);g.gain.setValueAtTime(.08,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.14);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.15)}
 function impact(){struck=true;health=68;freeze=reduced?0:motion.HIT_STOP;tone();particles=Array.from({length:reduced?6:38},(_,i)=>({x:780,y:360,vx:Math.cos(i*2.4)*180+90,vy:Math.sin(i*2.4)*150-60,age:0,color:i%3?'#f7dc93':'#b2e8f2'}))}
 function start(next){mode=next;time=0;freeze=0;struck=false;particles=[];health=100;paused=false;document.querySelector('#pause').textContent='暂停';document.querySelector('#pause').setAttribute('aria-pressed','false');status.textContent={sequence:'跑步接近 → 蓄力 → 出枪 → 命中 → 收势',run:'跑步循环 · 双脚交替抬起与落下',attack:'出枪样板 · 第 12 帧触发命中',hit:'受击样板 · 后仰后回正'}[next]}
 document.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>start(b.dataset.play));
 document.querySelector('#pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'继续':'暂停';e.target.setAttribute('aria-pressed',String(paused))};
 document.querySelector('#sound').onclick=e=>{sound=!sound;e.target.textContent='音效：'+(sound?'开':'关');e.target.setAttribute('aria-pressed',String(sound))};
 function ellipse(x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill()}
 function background(){const g=c.createLinearGradient(0,0,0,688);g.addColorStop(0,'#163d43');g.addColorStop(1,'#537b68');c.fillStyle=g;c.fillRect(0,0,1100,688);
  c.fillStyle='#234d4d';c.beginPath();c.moveTo(0,240);c.lineTo(160,80);c.lineTo(330,240);c.lineTo(590,45);c.lineTo(820,240);c.lineTo(1000,120);c.lineTo(1100,280);c.closePath();c.fill();
  ellipse(550,520,490,125,'#173735');ellipse(550,502,490,125,'#b5aa7d');ellipse(550,488,480,118,'#d2c49a');
  c.save();c.beginPath();c.ellipse(550,488,470,110,0,0,Math.PI*2);c.clip();c.strokeStyle='#9f956e66';c.lineWidth=1;for(let x=40;x<1100;x+=85){c.beginPath();c.moveTo(x,375);c.lineTo(x+150,610);c.stroke()}for(let y=400;y<610;y+=38){c.beginPath();c.moveTo(0,y);c.lineTo(1100,y);c.stroke()}c.restore();
  c.fillStyle='#f8e9ce';c.font='600 22px system-ui';c.fillText('梁山演武 · 枪出寒星',38,48);c.font='15px system-ui';c.fillStyle='#b4cfca';c.fillText('原画分层动作试作',38,77)}
 function dummy(age){ellipse(788,490,52,12,'#314b3555');c.save();c.translate(790,475);c.rotate(reduced?0:motion.recoil(age));c.fillStyle='#694b32';c.fillRect(-17,-180,34,190);c.fillStyle='#c29c68';c.fillRect(-70,-124,140,18);ellipse(0,-189,40,44,'#b88954');ellipse(0,-189,27,30,'#d2b47d');c.strokeStyle='#754c2d';c.lineWidth=4;c.beginPath();c.moveTo(-18,-201);c.lineTo(18,-181);c.moveTo(18,-201);c.lineTo(-18,-181);c.stroke();c.restore();c.fillStyle='#172d2c';c.fillRect(725,220,130,12);c.fillStyle='#d4ab63';c.fillRect(727,222,126*health/100,8);c.fillStyle='#f8e9ce';c.font='14px system-ui';c.fillText('演武木桩  '+health+'/100',725,211)}
 function actor(clip,phase,x,attackTime=-1){const image=images[clip];if(!image)return;const frame=Math.min(23,Math.floor(Math.max(0,phase)*24));const pose=motion.attackPose(attackTime);x+=pose.step;ellipse(x+235,490,63,13,'#213c3344');c.save();c.translate(x+235,490);c.rotate(pose.lean);c.translate(-(x+235),-490);c.drawImage(image,(frame%6)*640,Math.floor(frame/6)*640,640,640,x,70,500,500);c.restore()}
 function effects(dt,age){
  if(age>=0&&age<.32){const a=1-age/.32;c.save();c.translate(790,338);c.globalAlpha=a;c.strokeStyle='#fff2c8';c.lineWidth=3;c.beginPath();c.ellipse(0,0,18+age*160,10+age*85,-.35,0,Math.PI*2);c.stroke();if(!reduced){c.fillStyle='#fffbe6';c.beginPath();for(let i=0;i<16;i++){const r=i%2?8:36,angle=i*Math.PI/8;c.lineTo(Math.cos(angle)*r,Math.sin(angle)*r)}c.closePath();c.fill()}c.restore()}
if(age>=0&&age<.25){c.save();c.globalAlpha=1-age/.25;c.strokeStyle='#b7f5ff';c.shadowColor='#72d9f7';c.shadowBlur=18;c.lineWidth=7;c.beginPath();c.moveTo(600,404);c.lineTo(790,338);c.stroke();c.strokeStyle='#fff6d8';c.lineWidth=2;c.beginPath();c.moveTo(590,414);c.lineTo(805,332);c.stroke();c.restore()}
  for(const p of particles){p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=170*dt;c.globalAlpha=Math.max(0,1-p.age/.7);c.fillStyle=p.color;c.fillRect(p.x,p.y,4,4)}c.globalAlpha=1;particles=particles.filter(p=>p.age<.7);
  if(age>=0&&age<1){c.globalAlpha=1-age;c.fillStyle='#fff0b8';c.font='bold 32px system-ui';c.fillText('−32',770,295-age*45);c.globalAlpha=1}}
 function tick(now){const dt=last?Math.min(.04,(now-last)/1000):0;last=now;let step=paused||document.hidden?0:dt;if(freeze>0){freeze=Math.max(0,freeze-step);step=0}time+=step;let clip='attack',p=0,x=285,attackTime=-1;
  if(mode==='run'){clip='run';p=time%1;x=165;}
  if(mode==='hit'){clip='hit';p=Math.min(.999,time);}
  if(mode==='attack'){p=Math.min(.999,time);attackTime=time;}
  if(mode==='sequence'){if(time<1.7){clip='run';p=time%1;x=55+230*time/1.7}else{p=Math.min(.999,time-1.7);attackTime=time-1.7}}
  if(attackTime>=config.impact&&!struck)impact();const age=attackTime<config.impact?-1:attackTime-config.impact;c.save();if(!reduced&&age>=0&&age<.18)c.translate(Math.sin(age*120)*4*(1-age/.18),Math.cos(age*95)*2*(1-age/.18));background();dummy(age);actor(clip,p,x,attackTime);effects(step,age);c.restore();
  if(attackTime>=0&&attackTime<1.2)status.textContent=freeze>0?'命中 · 短暂停顿':motion.attackPose(attackTime).phase;
  if((mode==='sequence'&&time>3.2)||(mode==='attack'&&time>1.6)||(mode==='hit'&&time>1.4))status.textContent='演示完成 · 可选择动作重播';requestAnimationFrame(tick)}
 Promise.all(['run','attack','hit'].map(load)).then(()=>{document.querySelectorAll('[data-play]').forEach(b=>b.disabled=false);status.textContent='动作素材已就绪 · 点击完整演武';requestAnimationFrame(tick)}).catch(()=>{status.textContent='动作素材未能加载，请稍后刷新页面。'});
})();

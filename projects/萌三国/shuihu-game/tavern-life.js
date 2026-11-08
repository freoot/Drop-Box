/* Tavern-only rest art and social state. Battle art is never used here. */
(function(root){
 const people={
  'hero-006':{file:'linchong',name:'林冲'},
  'hero-009':{file:'huarong',name:'花荣'},
  'hero-022':{file:'likui',name:'李逵'}
 };
 const chats=[
  [['hero-022','掌柜说这饼够三个人吃。'],['hero-009','所以你在等另外两个人？'],['hero-022','不，我在等另外两张饼。']],
  [['hero-009','林教头，今日不比枪，猜个谜？'],['hero-006','先说好，猜错了不罚人洗碗。'],['hero-009','那你已经猜中掌柜的心思了。']],
  [['hero-022','我走路已经很轻了！'],['hero-006','嗯，桌上的茶只是站起来迎你。']],
  [['hero-009','我的箭能穿杨，筷子却夹不住这颗豆。'],['hero-022','让开，这个我不用瞄准。']],
  [['hero-006','兵器留在门外，今日只论茶。'],['hero-022','茶能续，饼也能续吧？']],
  [['hero-022','这凳子怎么吱呀吱呀的？'],['hero-009','它也想跟你讲两句。']],
  [['hero-006','走了半日，坐下来歇歇脚。'],['hero-009','好，下一程等茶凉了再说。']],
  [['hero-009','今天风大，适合练箭。'],['hero-006','也适合把洗好的衣裳晾出去。'],['hero-009','原来教头已替我排好功课。']]
 ];
 function makeActor(id,i){return{id,seat:i,x:[45,76,32][i],y:[85,86,91][i],homeX:[45,76,32][i],homeY:[85,86,91][i],facing:i===1?-1:1,mode:i<2?'sit':'rest',distance:0,blinkAt:3+i*1.3};}
 // Only one guest takes a short horizontal stroll at a time; resting guests keep their seats.
 function advance(a,dt,time){if(a.mode==='walk'){const dx=a.goal-a.x;const move=Math.min(Math.abs(dx),dt*4);a.x+=Math.sign(dx)*move;a.distance+=move;a.facing=dx<0?-1:1;if(Math.abs(dx)<=move){a.mode='rest';a.returnAt=time+4;}}
  else if(a.returnAt&&time>=a.returnAt){a.returnAt=0;if(Math.abs(a.x-a.homeX)>.1){a.goal=a.homeX;a.mode='walk';}else {a.mode=a.seat<2?'sit':'rest';a.y=a.homeY;}}
 }
 function mount(){
  const room=document.querySelector('.tavern-v2 .tavern-room');if(!room)return()=>{};
  const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const actors=[...room.querySelectorAll('.tavern-guest')].map((el,i)=>{
   const a=makeActor(el.dataset.hero,i);const canvas=document.createElement('canvas');canvas.width=512;canvas.height=768;canvas.className='rest-canvas';canvas.setAttribute('aria-label',people[a.id].name+'正在歇脚');
   const label=document.createElement('span');label.className='rest-name';label.textContent=people[a.id].name;
   const bubble=document.createElement('span');bubble.className='guest-chat';bubble.setAttribute('aria-live','polite');
   el.replaceChildren(canvas,label,bubble);el.classList.add('rest-guest');
   const img=new Image();img.src='assets/tavern/rest/'+people[a.id].file+'.png';a.el=el;a.canvas=canvas;a.bubble=bubble;a.img=img;img.onload=()=>paint(a,0);return a;
  });
  let time=0,last=0,frame=0,nextChat=2,chat=null,line=0,lineAt=0,nextWalk=24,walker=0,disposed=false;
  const available=chats.filter(c=>c.every(([id])=>actors.some(a=>a.id===id)));
  function paint(a,t){a.el.style.left=a.x+'%';a.el.style.top=a.y+'%';a.el.style.zIndex=String(Math.round(a.y));a.el.dataset.activity=a.mode;
   if(a.img.complete&&a.img.naturalWidth)root.SHUIHU_REST_RIG.draw(a.canvas.getContext('2d'),a.img,a.mode,a.distance,a.facing,t,a.id);
  }
  function tick(now){if(disposed)return;const dt=last?Math.min(.05,(now-last)/1000):0;last=now;
   if(!document.hidden&&!document.querySelector('.tavern-dialog')){
    time+=dt;
    if(!reduced){
     if(!chat&&time>=nextChat&&available.length&&actors.every(a=>a.mode!=='walk'&&!a.returnAt)){chat=available[Math.floor(Math.random()*available.length)];line=0;lineAt=time;}
     if(chat&&time>=lineAt){actors.forEach(a=>{a.bubble.textContent='';a.el.classList.remove('talking')});
      if(line<chat.length){const [id,text]=chat[line++];const speaker=actors.find(a=>a.id===id);speaker.bubble.textContent=text;speaker.el.classList.add('talking');lineAt=time+4.8;}
      else{chat=null;nextChat=time+8+Math.random()*7;}}
     if(!chat&&time>=nextWalk){const a=actors[walker++%actors.length];if(a){a.mode='walk';a.goal=a.homeX+(a.seat===0?-9:9);a.returnAt=0;}nextWalk=time+28;}
     actors.forEach(a=>advance(a,dt,time));
    }
    actors.forEach(a=>paint(a,time));
   }
   frame=requestAnimationFrame(tick);
  }
  actors.forEach(a=>paint(a,0));frame=requestAnimationFrame(tick);
  return()=>{disposed=true;cancelAnimationFrame(frame);actors.forEach(a=>a.img.onload=null)};
 }
 const api={people,chats,makeActor,advance,mount};root.SHUIHU_TAVERN_LIFE=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

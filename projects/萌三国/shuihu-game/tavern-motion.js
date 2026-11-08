/* Grounded tavern movement. Coordinates are floor positions in scene percent. */
(function(root){
  const points=[[34,60],[35,76],[35,94],[49,94],[76,94],[88,94],[88,79],[49,60]];
  const links=[[1,7],[0,2],[1,3],[2,4],[3,5],[4,6],[5],[0]];
  function create(index=0){const node=[0,2,4,6,7][index%5];return {node,previous:-1,target:null,x:points[node][0],y:points[node][1],wait:1+index*.8,distance:0,frame:0,facing:1};}
  function step(a,seconds,random=Math.random){
    const dt=Math.max(0,Math.min(seconds,.05));
    if(a.wait>0){a.wait-=dt;a.frame=0;return a;}
    if(a.target===null){let choices=links[a.node].filter(n=>n!==a.previous);if(!choices.length)choices=links[a.node];a.target=choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];}
    const [x,y]=points[a.target],dx=x-a.x,dy=y-a.y,len=Math.hypot(dx,dy),travel=Math.min(len,dt*4.5);
    if(Math.abs(dx)>.01)a.facing=dx<0?-1:1;
    if(len){a.x+=dx/len*travel;a.y+=dy/len*travel;a.distance+=travel;}
    a.frame=1+Math.floor(a.distance/1.1)%2;
    if(len<=travel){a.previous=a.node;a.node=a.target;a.target=null;a.wait=.8+random()*2.8;a.frame=0;}
    return a;
  }
  const api={points,links,create,step};
  if(typeof module!=='undefined')module.exports=api;
  if(!root.document)return;
  root.SHUIHU_TAVERN_MOTION=api;
  if(root.SHUIHU_TAVERN_LIFE){let stop=()=>{};const screen=document.querySelector('#screen');const mount=()=>{stop();stop=root.SHUIHU_TAVERN_LIFE.mount()};if(screen){new MutationObserver(mount).observe(screen,{childList:true});mount();}return;}

  let cancel=()=>{};
  function mount(){
    cancel();
    const room=document.querySelector('.tavern-room');if(!room)return;
    const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const guests=[...room.querySelectorAll('.tavern-guest')];
    const actors=guests.map((el,i)=>{
      const name=el.lastElementChild?.textContent;
      const h=typeof state!=='undefined'?state.heroes.find(h=>h.name===name):null;
      const frames=h&&root.SHUIHU_ART?.[h.id]?.frames;
      let sprite=null,img=null;
      if(frames){sprite=document.createElement('canvas');sprite.width=704;sprite.height=512;sprite.className='tavern-walk-canvas';img=new Image();img.src=frames.sheet;el.replaceChildren(sprite);const label=document.createElement('span');label.textContent=name;el.append(label);}
      el.classList.add('grounded-guest');
      const actor={el,sprite,img,heroId:h?.id,a:create(i)};
      if(img)img.onload=()=>paint(actor);
      return actor;
    });
    function paint({el,sprite,img,heroId,a}){el.style.left=a.x+'%';el.style.top=a.y+'%';el.style.zIndex=String(Math.round(a.y));if(sprite&&img.complete&&img.naturalWidth)root.SHUIHU_GAIT?.draw(sprite.getContext('2d'),img,heroId,a.distance,a.frame!==0,a.facing);}

    actors.forEach(paint);
    if(reduced)return;
    let id,last=0;
    function tick(now){const dt=last?(now-last)/1000:0;last=now;
      if(!document.hidden&&!document.querySelector('.tavern-dialog'))actors.forEach(actor=>{
        // Yield before entering another guest's personal space.
        if(!actor.sprite)return;
        const candidate={...actor.a};step(candidate,dt);
        const blocked=actors.some(other=>other!==actor&&Math.hypot(candidate.x-other.a.x,(candidate.y-other.a.y)*.56)<9&&Math.hypot(candidate.x-other.a.x,(candidate.y-other.a.y)*.56)<Math.hypot(actor.a.x-other.a.x,(actor.a.y-other.a.y)*.56));
        if(!blocked)actor.a=candidate;else {actor.a.frame=0;actor.a.target=actor.a.node;actor.a.wait=.6;}
        paint(actor);
      });
      id=requestAnimationFrame(tick);
    }
    id=requestAnimationFrame(tick);cancel=()=>cancelAnimationFrame(id);
  }
  const screen=document.querySelector('#screen');
  if(screen){new MutationObserver(mount).observe(screen,{childList:true});mount();}
})(typeof window==='undefined'?globalThis:window);

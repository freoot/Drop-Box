/* One-shot world-space effects. Targets come from resolved combat hits. */
(function(root){
 function magicSvg(kind,targets,speed=1){
  kind=['wind','thunder','meteor','rocks','tactics','banner'].includes(kind)?kind:'thunder';
  const duration=.8/Math.max(.5,Math.min(4,Number(speed)||1));
  const points=targets.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).slice(0,32);
  if(!points.length)return '';
  return `<svg class="battle-effects spell-fx spell-${kind}" style="--spell-duration:${duration}s" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${points.map(p=>{
   const x=p.x,y=p.y-30;
   const bolt=`M${x+24},0 L${x-20},${y*.36} L${x+16},${y*.36} L${x-12},${y*.69} L${x+13},${y*.69} L${x},${y}`;
   const sparks=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return `<path d="M${x+Math.cos(a)*18},${y+Math.sin(a)*13} l${Math.cos(a)*30},${Math.sin(a)*24}"/>`}).join('');
   if(['meteor','rocks','tactics','banner'].includes(kind)){
    const debris=[-32,0,31].map((dx,i)=>`<path class="falling-rock rock-${i}" d="M${x+dx-14},${y-62-i*17} l19,-9 18,17 -8,23 -27,-3 Z"/>`).join('');
    const form=kind==='meteor'?`<path class="meteor-tail" d="M${x-95},${y-180} L${x+18},${y-13} L${x-26},${y+5} Z"/><circle class="meteor-core" cx="${x}" cy="${y}" r="28"/>`:kind==='rocks'?debris:kind==='banner'?`<path class="command-banner" d="M${x-24},${y+20} V${y-100} l66,12 -12,30 -54,-10"/>`:`<path class="tactic-rune" d="M${x},${y-70} l48,45 -48,45 -48,-45 Z M${x-30},${y-25} H${x+30} M${x},${y-55} V${y+5}"/>`;
    return `<g class="spell-target spell-${kind}">${form}<ellipse class="spell-wave" cx="${x}" cy="${y+28}" rx="58" ry="25"/></g>`;
   }
   return `<g class="spell-target"><ellipse class="spell-seal" cx="${x}" cy="${y+28}" rx="48" ry="19"/>${kind==='thunder'?`<path class="spell-bolt glow" d="${bolt}"/><path class="spell-bolt core" d="${bolt}"/><g class="spell-sparks">${sparks}</g>`:`<g class="spell-wind">${[0,1,2].map(i=>`<path d="M${x-48+i*7},${y-i*28} C${x+55},${y-35-i*28} ${x+65},${y+32-i*28} ${x-20},${y+10-i*28}"/>`).join('')}</g><g class="spell-rain">${[-36,-12,12,36].map(dx=>`<path d="M${x+dx+16},${y-130} l-24,78"/>`).join('')}</g>`}<ellipse class="spell-wave" cx="${x}" cy="${y+28}" rx="58" ry="25"/></g>`;
  }).join('')}</svg>`;
 }
 const api={magicSvg};root.SHUIHU_VFX=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

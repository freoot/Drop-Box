/* Shared timing for the training demo; damage happens once at CONTACT. */
(function(root){
 const CONTACT=11/24,HIT_STOP=.075;
 const clamp=x=>Math.max(0,Math.min(1,x));
 const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
 function attackPose(t){
  if(t<0)return {step:0,lean:0,phase:'待机'};
  if(t<.32){const a=ease(t/.32);return {step:-22*a,lean:-.045*a,phase:'沉肩收枪 · 蓄力'}}
  if(t<CONTACT){const a=Math.pow(clamp((t-.32)/(CONTACT-.32)),2);return {step:-22+64*a,lean:-.045+.105*a,phase:'前踏拧腰 · 刺出'}}
  if(t<.56)return {step:42,lean:.06,phase:'枪尖命中'};
  const a=ease((t-.56)/.55);return {step:42*(1-a),lean:.06*(1-a),phase:a<1?'卸力收枪':'收势'};
 }
 function recoil(age){if(age<0||age>.9)return 0;return -.24*Math.exp(-age*5)*Math.cos(age*18)}
 const api={CONTACT,HIT_STOP,attackPose,recoil};root.SHUIHU_MOTION_TIMING=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

/* Display estimate only. Never fed back into damage or healing. */
(function(root){
 const weights={hp:2,atk:12,move:80,range:100,skill:60};
 function calculate(h,bonus={}){const val=k=>Math.max(0,Number(h[k]||0)+Number(bonus[k]||0));return Math.round(val('hp')*weights.hp+val('atk')*weights.atk+val('move')*weights.move+val('range')*weights.range+Math.max(0,(h.skillLevel||1)-1)*weights.skill);}
 const api={weights,calculate};root.SHUIHU_POWER=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SHUIHU_MOTION=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const HERO_PROFILES={
    'hero-006':{key:'spear-thrust',roleClass:'motion-warrior',cueClass:'cue-spear',label:'回身刺枪'},
    'hero-009':{key:'bow-shot',roleClass:'motion-archer',cueClass:'cue-arrow',label:'拉弓放箭'},
    'hero-003':{key:'fan-cast',roleClass:'motion-strategist',cueClass:'cue-cast',label:'挥扇布阵'},
    'hero-004':{key:'thunder-cast',roleClass:'motion-strategist',cueClass:'cue-thunder',label:'引剑唤雷'}
  };
  const ROLE_PROFILES={
    '战士':{key:'melee-swing',roleClass:'motion-warrior',cueClass:'cue-slash',label:'近身挥击'},
    '射手':{key:'ranged-shot',roleClass:'motion-archer',cueClass:'cue-arrow',label:'远程射击'},
    '谋士':{key:'spell-cast',roleClass:'motion-strategist',cueClass:'cue-cast',label:'运筹施术'}
  };
  function profileFor(unit,kind='strike'){
    const profile=HERO_PROFILES[unit?.id]||ROLE_PROFILES[unit?.role]||ROLE_PROFILES['战士'];
    if(kind==='support')return {...profile,cueClass:''};
    return {...profile};
  }
  function actorState(unit,fx,isAttacker,isHit){
    if(!fx)return {classes:'',cueClass:'',label:''};
    const profile=profileFor(unit,fx.kind);
    if(isHit&&fx.kind!=='support')return {classes:`${profile.roleClass} receiving-hit`,cueClass:'',label:'受击'};
    if(isAttacker&&fx.kind!=='support')return {classes:`${profile.roleClass} performing-action action-${profile.key}`,cueClass:profile.cueClass,label:profile.label};
    return {classes:'',cueClass:'',label:''};
  }
  function contactMs(unit,kind='strike',speed=1){return Math.round((kind==='support'?410:unit?.role==='谋士'?410:unit?.range>1?480:294)/Math.max(1,speed));}
  return {profileFor,actorState,contactMs};
});

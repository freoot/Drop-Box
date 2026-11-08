/* AUDIO-002: bounded presentation audio, independent of music and game saves. */
(function(root){
 const KEY='shuihu-sfx-v1';let enabled=true,volume=.45,context=null,bus=null,unlocked=false;
 const voices=new Set(),timers=new Set();
 try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');if(typeof saved.enabled==='boolean')enabled=saved.enabled;if(Number.isFinite(saved.volume))volume=Math.max(0,Math.min(1,saved.volume));}catch{}
 function save(){try{localStorage.setItem(KEY,JSON.stringify({enabled,volume}));}catch{}}
 function ensure(){if(context)return context;const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)return null;context=new Audio();bus=context.createGain();bus.gain.value=volume*.22;const limiter=context.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=8;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.12;bus.connect(limiter).connect(context.destination);return context;}
 function cancel(){for(const timer of timers)clearTimeout(timer);timers.clear();for(const voice of voices){try{voice.stop();}catch{}}voices.clear();}
 function unlock(){unlocked=true;if(enabled){try{ensure()?.resume().catch(()=>{});}catch{}}}
 root.addEventListener?.('pointerdown',unlock,{passive:true});root.addEventListener?.('keydown',unlock);
 root.document?.addEventListener('visibilitychange',()=>{if(root.document.hidden)cancel();});
 function tone(type){if(!enabled||!volume||!unlocked||root.document?.hidden||voices.size>=4)return false;let ctx;try{ctx=ensure();}catch{return false;}if(!ctx||ctx.state!=='running')return false;
  const spec={swing:[350,110,.10,'noise'],arrow:[1800,600,.13,'noise'],magic:[440,880,.20,'sine'],impact:[150,55,.16,'triangle'],hurt:[100,65,.10,'noise'],shield:[620,930,.24,'sine'],heal:[520,780,.26,'sine']}[type];if(!spec)return false;
  const [from,to,duration,wave]=spec,now=ctx.currentTime,gain=ctx.createGain();let voice;
  if(wave==='noise'){const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.45;voice=ctx.createBufferSource();voice.buffer=buffer;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(from,now);filter.frequency.exponentialRampToValueAtTime(to,now+duration);voice.connect(filter).connect(gain);}else{voice=ctx.createOscillator();voice.type=wave;voice.frequency.setValueAtTime(from,now);voice.frequency.exponentialRampToValueAtTime(to,now+duration);voice.connect(gain);}
  gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.65,now+.008);gain.gain.exponentialRampToValueAtTime(.001,now+duration);gain.connect(bus);voices.add(voice);voice.onended=()=>{voices.delete(voice);voice.disconnect();gain.disconnect();};voice.start(now);voice.stop(now+duration+.01);
  root.document?.dispatchEvent(new CustomEvent('shuihu:sfx',{detail:{type,time:performance.now(),active:voices.size}}));return true;
 }
 function playCue({attacker,kind,hits=[],contactMs=0},valid=()=>true){cancel();if(!enabled||!unlocked||!hits.length)return;const damage=hits.some(h=>h.damage!==undefined),shield=hits.some(h=>h.shield>0),heal=hits.some(h=>h.heal>0);if(!damage&&!shield&&!heal)return;
  if(damage)tone(attacker?.role==='谋士'?'magic':attacker?.range>1?'arrow':'swing');
  const timer=setTimeout(()=>{timers.delete(timer);if(!valid())return;if(damage){tone(shield?'shield':'impact');if(hits.some(h=>h.damage>0))tone('hurt');}else tone(shield?'shield':'heal');},Math.max(0,contactMs));timers.add(timer);
 }
 root.SFX={playCue,cancel,isEnabled:()=>enabled,getVolume:()=>volume,setEnabled(on){enabled=Boolean(on);if(!enabled)cancel();else unlock();save();},setVolume(value){if(!Number.isFinite(value))return;volume=Math.max(0,Math.min(1,value));if(bus)bus.gain.value=volume*.22;if(!volume)cancel();save();}};
})(typeof window==='undefined'?globalThis:window);

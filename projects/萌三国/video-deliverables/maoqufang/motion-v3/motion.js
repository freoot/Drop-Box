// Adapted from video-shotcraft (Copyright 2026 Wei Yihao, Apache-2.0).
// Modified for Chinese transparent overlays, speech timing, and FPS independence.
export const clamp = x => Math.min(1, Math.max(0, x));
export const phase = (t, start, end) => clamp((t - start) / (end - start));
export const out = x => 1 - Math.pow(1 - clamp(x), 3);
export const fade = (t, duration) => phase(t, 0, .16) * (1 - phase(t, duration - .2, duration));
export function strokePath(len, seed = 77) {
  let a = seed;
  const rand = () => { let t = a += 0x6d2b79f5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const top = [], bottom = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, wob = rand() - .5;
    const mid = 19 + Math.sin(t * Math.PI * 1.6 + .4) * 2.6 + wob * 1.6;
    const width = Math.max(2.2, 14 + Math.sin(t * Math.PI) * 6 - Math.max(0, t - .86) * 46 + wob * 3);
    top.push(`${(t * len).toFixed(1)},${(mid-width/2).toFixed(1)}`);
    bottom.push(`${(t * len).toFixed(1)},${(mid+width/2).toFixed(1)}`);
  }
  return `M${top.join('L')}L${bottom.reverse().join('L')}Z`;
}
export function reelPosition(t, digit) {
  const speed = 32, stop = .10, decel = .24, settle = .11;
  const initial = speed * stop;
  const target = Math.ceil((initial + 6 - digit) / 10) * 10 + digit;
  if (t < stop) return speed * Math.max(0,t);
  if (t < stop+decel) return initial + (target+.5-initial)*out(phase(t,stop,stop+decel));
  if (t < stop+decel+settle) return target+.5-.5*out(phase(t,stop+decel,stop+decel+settle));
  return target;
}
export function driftState(t, i) {
  const hash = n => { const v = Math.sin(n*127.3)*43758.5453; return v-Math.floor(v); };
  const p = out(phase(t, i*.09, i*.09+.74));
  const angle = hash(i+1)*Math.PI*2, distance = 105+hash(i+101)*65;
  return {x:Math.cos(angle)*distance*(1-p),y:Math.sin(angle)*distance*(1-p),blur:7*(1-p),opacity:phase(t,i*.09,i*.09+.18)};
}
export function travel(t) {
  const p = phase(t,.42,1.56);
  const input=[0,.15,.88,1], output=[0,.055,.9,1];
  let i=0; while(i<2 && p>input[i+1]) i++;
  const u=phase(p,input[i],input[i+1]);
  const e=u<.5 ? 2*u*u : 1-Math.pow(-2*u+2,2)/2;
  return (output[i]+e*(output[i+1]-output[i]))*1440;
}

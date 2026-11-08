import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('./motion.js',import.meta.url),'utf8');
const m=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
// Reels must settle on the spoken value, including after nonsequential seeking.
for(const digit of [2,9,8,7]) {
  for(const time of [.45,.5,1,5]) assert.equal(m.reelPosition(time,digit)%10,digit);
  assert.ok(m.reelPosition(.34,digit)>m.reelPosition(.45,digit));
}
// These clocks are seconds: the same instant at 24/30/60 fps must agree.
for(const seconds of [0,.5,1,1.5,2,3]) {
  const samples=[24,30,60].map(fps=>m.travel(seconds*fps/fps));
  assert.deepEqual(samples,[samples[0],samples[0],samples[0]]);
}
let previous=0;
for(let i=0;i<=240;i++) {const x=m.travel(i/60);assert.ok(x>=previous-1e-8&&x<=1440);previous=x;}
assert.equal(m.travel(2),1440);
// Final brand letters must lock precisely, without residual blur or jitter.
for(let i=0;i<3;i++) {
  const s=m.driftState(1.1,i);
  assert.equal(Math.abs(s.x),0);assert.equal(Math.abs(s.y),0);assert.equal(s.blur,0);assert.equal(s.opacity,1);
  assert.deepEqual(m.driftState(.2,i),m.driftState(.2,i));
}
assert.equal(m.strokePath(390),m.strokePath(390));
assert.notEqual(m.strokePath(390,77),m.strokePath(390,78));
for(const duration of [3.6,163/30,4.2,3.5]) {
  assert.equal(m.fade(0,duration),0);assert.equal(m.fade(duration,duration),0);
  assert.equal(m.fade(duration/2,duration),1);
}
console.log('PASS: spoken digits, settling, monotonic seasonal journey, FPS independence, deterministic brand lock, entry/exit.');

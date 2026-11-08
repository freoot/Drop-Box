import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {create,step,points,links}=createRequire(import.meta.url)('../tavern-motion.js');
test('walk routes are connected and reversible',()=>{links.forEach((edges,i)=>edges.forEach(j=>assert.ok(links[j].includes(i))));const seen=new Set([0]);for(let n=0;n<8;n++)for(const i of seen)links[i].forEach(j=>seen.add(j));assert.equal(seen.size,points.length);});
test('walking changes legs, pauses at destinations and stays on the floor route',()=>{const a=create();const frames=new Set();let stops=0;for(let i=0;i<2000;i++){step(a,.05,()=>.2);frames.add(a.frame);if(a.wait>0)stops++;assert.ok(a.x>=34&&a.x<=88);assert.ok(a.y>=60&&a.y<=94);assert.ok(a.y>=93.99||a.x<=49||a.x>=87.99,'never crosses foreground table');}assert.deepEqual([...frames].sort(),[0,1,2]);assert.ok(stops>20);});
test('background tab delays cannot teleport a character',()=>{const a=create();a.wait=0;const before={...a};step(a,100,()=>0);assert.ok(Math.hypot(a.x-before.x,a.y-before.y)<=.226);});
test('guest starts have separate standing positions',()=>{const guests=Array.from({length:5},(_,i)=>create(i));assert.equal(new Set(guests.map(a=>a.x+','+a.y)).size,5);});

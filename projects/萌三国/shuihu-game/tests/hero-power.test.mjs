// Authored for the next validation round; not executed at the user's request.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const power=require('../hero-power.js');
const life=require('../tavern-life.js');
test('power is transparent and increases with equipment and skill growth',()=>{const h={hp:100,atk:20,move:3,range:1,skillLevel:1};assert.equal(power.calculate(h),780);assert.equal(power.calculate(h,{atk:10}),900);assert.equal(power.calculate({...h,skillLevel:2}),840);assert.equal(h.atk,20)});
test('short stroll stays on its floor line and returns to sitting',()=>{const a=life.makeActor('hero-006',0);const y=a.y;a.mode='walk';a.goal=a.homeX-1;life.advance(a,1,1);assert.equal(a.y,y);assert.equal(a.mode,'rest');life.advance(a,1,6);assert.equal(a.mode,'walk');life.advance(a,1,7);life.advance(a,1,12);assert.equal(a.mode,'sit');assert.equal(a.x,a.homeX)});

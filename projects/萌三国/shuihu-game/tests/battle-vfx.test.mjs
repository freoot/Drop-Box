import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {magicSvg}=createRequire(import.meta.url)('../battle-vfx.js');
test('tactics, falling rocks, fire and command support have different geometry',()=>{
 for(const [kind,marker] of [['rocks','falling-rock'],['meteor','meteor-tail'],['tactics','tactic-rune'],['banner','command-banner']]){
  const svg=magicSvg(kind,[{x:320,y:410}]);
  assert.ok(svg.includes(marker));assert.ok(!svg.includes('spell-bolt core'));
  assert.ok(svg.includes('cx="320"'));assert.ok(!svg.includes('NaN'));
 }
});
test('thunder and wind use distinct geometry at resolved hit positions',()=>{
 const thunder=magicSvg('thunder',[{x:300,y:400}]);
 const wind=magicSvg('wind',[{x:300,y:400}]);
 assert.match(thunder,/spell-bolt core/);assert.doesNotMatch(wind,/spell-bolt/);
 assert.match(wind,/spell-rain/);assert.match(wind,/cx="300" cy="398"/);
});
test('effects are finite, speed scaled and ignore invalid coordinates',()=>{
 assert.equal(magicSvg('wind',[]),'');
 assert.equal(magicSvg('wind',[{x:NaN,y:3}]),'');
 assert.match(magicSvg('thunder',[{x:1,y:2}],2),/--spell-duration:0.4s/);
 assert.doesNotMatch(magicSvg('wind',[{x:1,y:2}],Infinity),/Infinity|NaN/);
});

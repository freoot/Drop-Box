import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';

const {profileFor, actorState} = createRequire(import.meta.url)('../battle-motion.js');

test('representative heroes receive distinct authored attack motion profiles', () => {
  assert.deepEqual(profileFor({id:'hero-006', role:'战士'}, 'strike'), {
    key:'spear-thrust', roleClass:'motion-warrior', cueClass:'cue-spear', label:'回身刺枪'
  });
  assert.deepEqual(profileFor({id:'hero-009', role:'射手'}, 'strike'), {
    key:'bow-shot', roleClass:'motion-archer', cueClass:'cue-arrow', label:'拉弓放箭'
  });
  assert.deepEqual(profileFor({id:'hero-003', role:'谋士'}, 'skill'), {
    key:'fan-cast', roleClass:'motion-strategist', cueClass:'cue-cast', label:'挥扇布阵'
  });
});

test('generic roles remain visually distinct and support actions do not show attack cues', () => {
  assert.equal(profileFor({id:'hero-020', role:'战士'}, 'strike').key, 'melee-swing');
  assert.equal(profileFor({id:'hero-021', role:'射手'}, 'strike').key, 'ranged-shot');
  assert.equal(profileFor({id:'hero-022', role:'谋士'}, 'skill').key, 'spell-cast');
  assert.equal(actorState({id:'hero-022', role:'谋士'}, {kind:'support'}, true, false).cueClass, '');
});

test('actor state separates anticipation from directional hit recoil', () => {
  const attacker = actorState({id:'hero-009', role:'射手'}, {kind:'strike'}, true, false);
  assert.match(attacker.classes, /motion-archer/);
  assert.match(attacker.classes, /performing-action/);
  assert.equal(attacker.cueClass, 'cue-arrow');

  const victim = actorState({id:'enemy-1', role:'战士'}, {kind:'strike'}, false, true);
  assert.match(victim.classes, /receiving-hit/);
  assert.equal(victim.cueClass, '');
});

test('enemy projectiles and weapon trails use their own reversed trajectories', () => {
  const css=fs.readFileSync(new URL('../game.css',import.meta.url),'utf8');
  assert.match(css,/\.enemy \.cue-arrow\{animation-name:arrow-flight-back/);
  assert.match(css,/\.enemy \.cue-spear\{animation-name:spear-streak-back/);
  assert.match(css,/@keyframes arrow-flight-back/);
});

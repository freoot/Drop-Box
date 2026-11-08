// Prepared for a later validation round. Not executed in this delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=new URL('../assets/models/',import.meta.url);
test('local Blender prototypes retain sources, previews and distinct normal attack designs',()=>{
 const items=JSON.parse(fs.readFileSync(new URL('manifest.json',base),'utf8'));
 assert.equal(items.length,3);
 assert.equal(new Set(items.map(x=>x.attacks[0])).size,3);
 for(const item of items){assert.equal(item.art_source,'local_blender_procedural');assert.ok(fs.statSync(new URL(item.source,base)).size>0);assert.ok(fs.statSync(new URL(item.preview,base)).size>0);assert.ok(item.actions.includes('03_normal_attack'));}
});
test('refined Lin Chong preserves editable source and portrait-driven design',()=>{
 assert.ok(fs.statSync(new URL('source/linchong-refined.blend',base)).size>0);
 assert.ok(fs.statSync(new URL('linchong-refined.png',base)).size>0);
 const script=fs.readFileSync(new URL('../tools/blender/refine_linchong.py',import.meta.url),'utf8');
 assert.match(script,/White forehead band/);assert.match(script,/Jaw beard/);assert.match(script,/Layered pauldron/);
});
test('cutout prototype provides editable project and local movie',()=>{
 for(const file of ['cutout/linchong-cutout.blend','cutout/linchong-idle.mp4'])assert.ok(fs.statSync(new URL(file,base)).size>0);
});
test('gesture study retains original aspect ratio and supplies the local preview',()=>{
 for(const file of ['cutout/linchong-gesture.blend','cutout/linchong-gesture.mp4'])assert.ok(fs.statSync(new URL(file,base)).size>0);
 const script=fs.readFileSync(new URL('../tools/blender/linchong_gesture.py',import.meta.url),'utf8');assert.match(script,/width=height\*img.size\[0\]\/img.size\[1\]/);
 const page=fs.readFileSync(new URL('../cutout-studio.html',import.meta.url),'utf8');assert.match(page,/linchong-gesture.mp4/);assert.match(page,/playsinline/);
});
test('combat studies provide three local atlases and distinct editable clips',()=>{
 for(const name of ['run','attack','hit']){
  assert.ok(fs.statSync(new URL(`cutout/linchong-${name}.blend`,base)).size>0);
  assert.ok(fs.statSync(new URL(`cutout/${name}-atlas.png`,base)).size>0);
 }
 const manifest=JSON.parse(fs.readFileSync(new URL('cutout/motion-manifest.json',base),'utf8'));
 assert.equal(manifest.frames,24);assert.equal(manifest.impactFrame,11);
 const script=fs.readFileSync(new URL('../combat-motion-studio.js',import.meta.url),'utf8');
 assert.match(script,/attackTime>=config.impact&&!struck/);assert.doesNotMatch(script,/localStorage/);
});
test('heavy thrust anticipates, drives forward, holds contact and recovers',async()=>{
 const {createRequire}=await import('node:module');const timing=createRequire(import.meta.url)('../combat-motion-timing.js');
 assert.ok(timing.attackPose(.25).step<0);assert.equal(timing.attackPose(timing.CONTACT).step,42);
 assert.equal(timing.attackPose(1.2).step,0);assert.equal(timing.HIT_STOP,.075);
 assert.ok(timing.recoil(0)<0);assert.equal(timing.recoil(1),0);
});

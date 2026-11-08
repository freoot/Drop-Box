// Prepared for a later validation round, not executed in this delivery.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const plan=JSON.parse(fs.readFileSync(new URL('../assets/rigs/linchong-production-plan.json',import.meta.url),'utf8'));
test('production rig plan has explicit hierarchy and honest pending assets',()=>{
 const ids=new Set(plan.parts.map(p=>p.id));assert.equal(ids.size,plan.parts.length);
 for(const p of plan.parts){assert.ok(!p.parent||ids.has(p.parent));assert.equal(p.pivot.length,2);assert.ok(p.rotationDegrees[0]<p.rotationDegrees[1]);if(p.asset)assert.ok(fs.existsSync(new URL(`../${p.asset}`,import.meta.url)))}
 assert.ok(ids.has('spear'));assert.ok(ids.has('shin_near'));assert.equal(plan.status,'visible_layers_pending_joint_paint');
});
test('control rig is explicit about missing artwork and does not claim a bound character',()=>{
 const status=JSON.parse(fs.readFileSync(new URL('../assets/rigs/linchong-controls/build-status.json',import.meta.url),'utf8'));
 assert.equal(status.status,'partially_bound_missing_art');assert.equal(status.boundParts.length,16);assert.equal(status.missingParts.length,1);
 assert.ok(fs.statSync(new URL('../assets/rigs/linchong-controls/linchong-production-controls.blend',import.meta.url)).size>0);
});

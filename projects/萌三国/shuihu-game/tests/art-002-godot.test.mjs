import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const release=path.join(root,'assets/releases/ART-002/r6');
const manifest=JSON.parse(fs.readFileSync(path.join(release,'manifest.json'),'utf8'));
function glb(file){const b=fs.readFileSync(file);assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);return JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)).trim());}
test('ART-002 Godot samples contain six distinct rigged heroes with four real animation tracks',()=>{
 assert.deepEqual(manifest.heroes.map(h=>h.id),['hero-006','hero-001','hero-059','hero-014','hero-013','hero-003']);
 for(const hero of manifest.heroes){const data=glb(path.join(release,hero.model));assert.ok(data.skins?.length>0);assert.deepEqual(data.animations.map(a=>a.name).sort(),['attack','hit','idle','walk']);assert.ok(data.animations.every(a=>a.channels.length>10));assert.ok(fs.statSync(path.join(release,hero.source)).size>10000);assert.deepEqual(hero.forward_godot,[0,0,1]);
 for(const pose of hero.sampled_contacts){const soles=Object.values(pose.sole_min_z);assert.ok(Math.min(...soles)>=-.002,`${hero.slug} ${pose.clip} feet penetrate`);assert.ok(Math.abs(Math.min(...soles))<.002,'one sole stays grounded');}
 }
});
test('ART-002 complete battlefield retains 32 tiles, diorama base, shore, trees, pavilion and distant scenery',()=>{
 const data=glb(path.join(release,manifest.environment));const names=data.nodes.map(n=>n.name||'');
 assert.equal(names.filter(n=>/^Tile_\d_\d$/.test(n)).length,32);
 for(const prefix of ['DioramaFoundation','WoodSideFrame','WaterBasin','ShoreRock','JadeCanopy','PavilionPost','CurvedTileRoof','DistantKarst'])assert.ok(names.some(n=>n.startsWith(prefix)),prefix);
 const props=glb(path.join(release,manifest.props));for(const prefix of ['LeafSpearBlade','CurvedBlade','CommandBaton','GoldenRighteousBanner','ProvisionChest','HealingJar'])assert.ok(props.nodes.some(n=>n.name?.startsWith(prefix)),prefix);
});
test('ART-002 sample is isolated from browser gameplay and has explicit cell and actor selection layers',()=>{
 const scene=fs.readFileSync(path.join(root,'godot/art_002/battlefield_sample.gd'),'utf8');
 const actor=fs.readFileSync(path.join(root,'godot/art_002/hero_sample.gd'),'utf8');
 assert.match(scene,/collision_layer = 1/);assert.match(actor,/collision_layer = 2/);assert.match(actor,/atan2\(direction.x, direction.z\)/);
 assert.doesNotMatch(scene+actor,/localStorage|shangshan-shuihu|apply_damage|save_game/);
 assert.equal(fs.readFileSync(path.join(root,'project.godot'),'utf8').includes('run/main_scene="res://godot/journey_map/journey_map.tscn"'),true);
});

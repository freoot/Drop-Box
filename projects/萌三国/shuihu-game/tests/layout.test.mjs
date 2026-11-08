import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('relocated HTML and CSS resources resolve inside game folder',()=>{
 for(const name of ['index.html','character-studio.html','game.css','character-studio.css','tavern-motion.css']){
  const text=fs.readFileSync(path.join(root,name),'utf8');
  const refs=[...text.matchAll(/(?:src|href)=["']([^"']+)["']|url\(['"]?([^)'"\s]+)['"]?\)/g)].map(m=>m[1]||m[2]);
  for(const ref of refs){if(/^(?:https?:|data:|#)/.test(ref))continue;assert.ok(fs.existsSync(path.resolve(root,ref.split(/[?#]/)[0])),`${name}: missing ${ref}`);}
 }
});
test('old entry points forward to relocated game and Godot keeps local resources',()=>{
 for(const name of ['index.html','preview.html','character-studio.html'])assert.match(fs.readFileSync(path.join(root,'..',name),'utf8'),/url=shuihu-game\//);
 for(const name of ['project.godot','godot/journey_map/journey_map.tscn','godot/tests/smoke_test.gd']){
  const text=fs.readFileSync(path.join(root,name),'utf8');
  for(const match of text.matchAll(/res:\/\/([^"']+)/g))assert.ok(fs.existsSync(path.join(root,match[1])),match[1]);
 }
});

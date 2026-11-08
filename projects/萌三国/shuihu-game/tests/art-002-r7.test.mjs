import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const release=path.join(root,'assets/releases/ART-002/r7');
const r6=path.join(root,'assets/releases/ART-002/r6');
const prior=JSON.parse(fs.readFileSync(path.join(r6,'manifest.json')));
const batches=fs.readdirSync(path.join(release,'batches')).filter(f=>/^b\d+\.json$/.test(f));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function glb(file){
 const bytes=fs.readFileSync(file);
 assert.equal(bytes.toString('ascii',0,4),'glTF');
 assert.equal(bytes.readUInt32LE(8),bytes.length);
 const size=bytes.readUInt32LE(12);
 const data=JSON.parse(bytes.toString('utf8',20,20+size));
 const binary=bytes.subarray(28+size);
 function values(index){
  const a=data.accessors[index],view=data.bufferViews[a.bufferView];
  assert.equal(a.componentType,5126,'animation sampler uses float32');
  const count={SCALAR:1,VEC3:3,VEC4:4}[a.type];
  assert.ok(count);
  const start=(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||count*4;
  return Array.from({length:a.count},(_,i)=>Array.from({length:count},(_,j)=>binary.readFloatLE(start+i*stride+j*4)));
 }
 return {data,values};
}
for(const batchFile of batches){
 const batch=JSON.parse(fs.readFileSync(path.join(release,'batches',batchFile)));
 test(`ART-002 r7 ${batch.batch}: unique real assets, nonempty contacts and four moving clips`,()=>{
  assert.ok(batch.heroes.length>0&&batch.heroes.length<=24);
  assert.equal(new Set(batch.heroes.map(h=>h.id)).size,batch.heroes.length);
  for(const hero of batch.heroes){
   const {data,values}=glb(path.resolve(release,hero.model));
   assert.ok(data.skins?.length,hero.id);
   const skinned=data.nodes.filter(n=>n.skin!==undefined&&n.mesh!==undefined);
   assert.ok(skinned.length,hero.id+' has skinned mesh nodes');
   for(const node of skinned)for(const primitive of data.meshes[node.mesh].primitives){
    assert.ok(primitive.attributes.JOINTS_0!==undefined,hero.id+' joints exported');
    assert.ok(primitive.attributes.WEIGHTS_0!==undefined,hero.id+' skin weights exported');
   }
   assert.deepEqual(data.animations.map(a=>a.name).sort(),['attack','hit','idle','walk']);
   assert.ok(fs.statSync(path.resolve(release,hero.source)).size>10000);
   const contacts=hero.sampled_contacts||hero.animation?.sampled_contacts;
   assert.ok(contacts?.length>=12,`${hero.id} contacts must not be empty`);
   assert.deepEqual([...new Set(contacts.map(p=>p.clip))].sort(),['attack','hit','idle','walk']);
   for(const p of contacts){
    assert.deepEqual(Object.keys(p.sole_min_z).sort(),['L','R']);
    const soles=Object.values(p.sole_min_z);
    assert.ok(soles.every(Number.isFinite));
    assert.ok(Math.min(...soles)>=-.002);
    assert.ok(Math.abs(Math.min(...soles))<.002);
   }
   for(const animation of data.animations){
    const rotating=animation.channels.filter(c=>c.target.path==='rotation');
    assert.ok(rotating.some(c=>{
     const v=values(animation.samplers[c.sampler].output);
     return v.some(row=>row.some((x,j)=>Math.abs(x-v[0][j])>.001));
    }),`${hero.id}/${animation.name} must rotate imported bones`);
   }
  }
 });
 test(`ART-002 r7 ${batch.batch}: overlapping approved six are exact r6 assets`,()=>{
  for(const hero of batch.heroes){
   const old=prior.heroes.find(h=>h.id===hero.id);
   if(!old)continue;
   assert.equal(hash(path.resolve(release,hero.model)),hash(path.join(r6,old.model)),hero.id+' model');
   assert.equal(hash(path.resolve(release,hero.source)),hash(path.join(r6,old.source)),hero.id+' source');
  }
 });
}
test('ART-002 r7 b1 runtime evidence matches delivered assets',()=>{
 const batchFile=path.join(release,'batches/b1.json');
 const batch=JSON.parse(fs.readFileSync(batchFile));
 for(const name of ['headless.json','runtime.json']){
  const result=JSON.parse(fs.readFileSync(path.join(release,'evidence/b1',name)));
  assert.equal(result.manifest_sha256,hash(batchFile));
  assert.equal(result.review_script_sha256,hash(path.join(root,'godot/art_002/batch_review.gd')));
  assert.equal(result.controller_sha256,hash(path.join(root,'godot/art_002/hero_sample.gd')));
  assert.equal(result.world_model_sha256,hash(path.join(r6,'models/liangshan_battlefield.glb')));
  assert.deepEqual(result.failures,[]);
  assert.equal(result.cells.length,32);
  assert.ok(result.cells.every(c=>c.hit));
  assert.deepEqual(result.heroes.map(h=>h.id),batch.heroes.map(h=>h.id));
  for(const h of result.heroes){
   assert.equal(h.model_sha256,hash(path.resolve(release,batch.heroes.find(x=>x.id===h.id).model)));
   assert.ok(h.selected_by_input&&h.moved_by_input);
   assert.deepEqual(h.actions.map(a=>a.clip),['idle','walk','attack','hit']);
   assert.ok(h.actions.every(a=>a.max_rotation_component_delta>=.0001));
  }
 }
 for(const h of batch.heroes)assert.ok(fs.statSync(path.join(release,'evidence/b1',h.id+'-actions.png')).size>10000);
});
function verifyEvidence(folder,batch,mode){
 const graphical=mode==='capture';
 assert.ok(!fs.existsSync(path.join(folder,mode+'-in-progress.json')),'interrupted run');
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,mode+'-manifest.json')));
 const output=graphical?'runtime.json':'headless.json';
 const runtime=JSON.parse(fs.readFileSync(path.join(folder,output)));
 assert.equal(manifest.run_complete,true);
 assert.equal(manifest.mode,mode);
 assert.equal(manifest.batch,batch.batch);
 assert.ok(manifest.run_id);
 assert.equal(manifest.run_id,runtime.run_id);
 assert.equal(runtime.graphical,graphical);
 for(const key of ['manifest_sha256','review_script_sha256','controller_sha256','world_model_sha256','engine'])assert.equal(manifest[key],runtime[key]);
 assert.deepEqual(manifest.viewport,runtime.viewport);
 const expected=[output];
 if(graphical){
  assert.deepEqual(runtime.viewport,[1440,900]);
  for(let i=1;i<=Math.ceil(batch.heroes.length/6);i++)expected.push(`page-${String(i).padStart(2,'0')}.png`);
  for(const h of batch.heroes)expected.push(h.id+'-actions.png');
 }
 assert.deepEqual(Object.keys(manifest.files).sort(),expected.sort());
 for(const name of expected){
  const bytes=fs.readFileSync(path.join(folder,name)),entry=manifest.files[name];
  assert.equal(entry.sha256,hash(path.join(folder,name)),name+' hash');
  assert.equal(entry.bytes,bytes.length,name+' bytes');
  if(name.endsWith('.png')){
   assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   assert.equal(bytes.toString('ascii',12,16),'IHDR');
   const size=[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
   assert.deepEqual(size,name.startsWith('page-')?[1440,900]:[1440,1200]);
   assert.deepEqual([entry.width,entry.height],size);
  }
 }
}
for(const batchFile of batches){
 const batch=JSON.parse(fs.readFileSync(path.join(release,'batches',batchFile)));
 test(`ART-002 r7 ${batch.batch}: complete evidence is bound to every output`,()=>{
  for(const mode of ['capture','headless'])verifyEvidence(path.join(release,'evidence',batch.batch),batch,mode);
 });
}
test('ART-002 r7 rejects interrupted and altered capture fixtures',()=>{
 const batch=JSON.parse(fs.readFileSync(path.join(release,'batches/b1.json')));
 const source=path.join(release,'evidence/b1');
 const temporary=fs.mkdtempSync(path.join(process.env.TMPDIR||'/tmp','art002-evidence-'));
 try{
  for(const mutation of ['missing','changed','runtime','in-progress','incomplete']){
   const folder=path.join(temporary,mutation);
   fs.cpSync(source,folder,{recursive:true});
   verifyEvidence(folder,batch,'capture');
   if(mutation==='missing')fs.unlinkSync(path.join(folder,'page-01.png'));
   if(mutation==='changed')fs.appendFileSync(path.join(folder,'page-01.png'),'changed');
   if(mutation==='runtime')fs.appendFileSync(path.join(folder,'runtime.json'),' ');
   if(mutation==='in-progress')fs.writeFileSync(path.join(folder,'capture-in-progress.json'),'{}');
   if(mutation==='incomplete'){
    const file=path.join(folder,'capture-manifest.json'),m=JSON.parse(fs.readFileSync(file));
    delete m.files['page-01.png'];
    fs.writeFileSync(file,JSON.stringify(m));
   }
   assert.throws(()=>verifyEvidence(folder,batch,'capture'),mutation);
  }
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
test('ART-002 r7 b1 preserves canonical roster identity',()=>{
 const batch=JSON.parse(fs.readFileSync(path.join(release,'batches/b1.json')));
 assert.deepEqual(batch.heroes.map(h=>h.id),[2,5,6,7,8,10,11,12,13,14,15,17,19,21,22,23,24,25].map(n=>`hero-${String(n).padStart(3,'0')}`));
 const source=fs.readFileSync(path.join(root,'data/shuihu.js'),'utf8');
 const seats=[...source.matchAll(/\['([^']+)','([^']+)','([^']+)'\]/g)];
 for(const hero of batch.heroes){
  const row=seats[Number(hero.id.slice(-3))-1];
  assert.ok(hero.name.includes(row[1]));
  assert.ok((hero.byname||hero.name).includes(row[3]));
  assert.ok(hero.weapon?.kind&&hero.weapon.basis&&hero.weapon.source_note,hero.id+' explicit weapon basis required');
 }
});

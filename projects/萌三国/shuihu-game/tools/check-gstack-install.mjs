// Explicit installation check; not part of portable game tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=path.join(os.homedir(),'.codex','skills');
for(const name of ['gstack','gstack-review','gstack-qa','gstack-plan-eng-review']){
 const file=path.join(base,name,'SKILL.md');
 assert.ok(fs.existsSync(file),`Missing ${file}`);
 assert.match(fs.readFileSync(file,'utf8'),/^---/);
}
const binary=path.join(os.homedir(),'.gstack/repos/gstack/browse/dist/browse');
fs.accessSync(binary,fs.constants.X_OK);
assert.match(fs.readFileSync(path.join(os.homedir(),'.codex/AGENTS.md'),'utf8'),/gstack/);
console.log('gstack skills, executable and preference: passed');

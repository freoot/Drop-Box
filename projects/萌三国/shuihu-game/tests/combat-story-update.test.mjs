// Added for later execution; deliberately not run in this change at user request.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
test('boss health supports longer encounters',()=>{const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(new URL('data/shuihu.js',root),'utf8'),c);for(const b of c.window.SHUIHU_DATA.bosses)assert.ok(b.hp>=1000,b.name);});
test('Wusong story names Jingyang Ridge and novel adaptation',()=>{const c=vm.createContext({window:{},esc:s=>s});vm.runInContext(fs.readFileSync(new URL('data/hero-stories.js',root),'utf8'),c);const html=vm.runInContext("heroStoryHTML({id:'hero-014'})",c);assert.match(html,/景阳冈/);assert.match(html,/小说/);assert.doesNotMatch(html,/井冈山/);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative,sep} from 'node:path';
import {Manager} from '../src/manager.mjs';
import {receipt} from '../src/projection.mjs';
class NoModelManager extends Manager {async submit(id,task){this.seen??=[];this.seen.push({id,task,cwd:this.get(id).cwd});}}
for(const git of [false,true]) test(`shared cwd preserves ${git?'dirty Git':'non-Git'} files and independent sessions without copying`,async t=>{
 const root=realpathSync.native(mkdtempSync(join(tmpdir(),'dsh-shared-test-')));
 let manager;
 t.after(async()=>{await manager?.shutdown();const p=relative(realpathSync.native(tmpdir()),root);assert.ok(p.startsWith('dsh-shared-test-')&&!p.includes(sep));rmSync(root,{recursive:true,force:true});});
 const cwd=join(root,'project');mkdirSync(cwd);if(git)mkdirSync(join(cwd,'.git'));
 writeFileSync(join(cwd,'untracked.txt'),'user edits');
 manager=new NoModelManager({database:join(root,'state.sqlite'),workspaceIsolation:'shared',defaultProvider:'example-provider',defaultModel:'example-model',defaultEffort:'high'},class {constructor(){throw new Error('A model runtime must never be constructed');}});
 const a=await manager.start({cwd,task:'mock A'},{threadId:'A'});
 const b=await manager.start({cwd,task:'mock B'},{threadId:'B'});
 const c=await manager.start({cwd,task:'mock without metadata'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.cwd,cwd);assert.equal(b.cwd,cwd);assert.equal(c.cwd,cwd);
 assert.equal(a.isolation,undefined);assert.notEqual(a.id,b.id);assert.notEqual(b.id,c.id);
 assert.equal(a.parent_thread_id,'A');assert.equal(b.parent_thread_id,'B');
 assert.equal(a.provider,'example-provider');assert.equal(a.effort,'high');
 assert.equal(readFileSync(join(cwd,'untracked.txt'),'utf8'),'user edits');
 assert.equal(receipt(a,'start').file_isolation,false);assert.equal(receipt(a,'start').cwd,cwd);
 assert.equal(manager.seen.length,3);
});

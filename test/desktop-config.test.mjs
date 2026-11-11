import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runtimeConfig,MAX_OUTPUT_TOKENS} from '../src/config.mjs';

test('desktop preserves upstream official-provider completion budget and parent repair',()=>{
  const keys=['DSH_DESKTOP_EXECUTABLE','DSH_DESKTOP_PROVIDER_CONFIG'];
  const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const dir=mkdtempSync(join(tmpdir(),'dsh-desktop-config-'));
  try {
    process.env.DSH_DESKTOP_EXECUTABLE=process.execPath;
    delete process.env.DSH_DESKTOP_PROVIDER_CONFIG;
    const config=runtimeConfig(dir,process.execPath);
    const patch=readFileSync(config.patch,'utf8');
    assert.match(patch,new RegExp('maxTokens: '+MAX_OUTPUT_TOKENS));
    assert.equal(config.revalidateParents,true);
    assert.equal(config.workspaceIsolation,'shared');
    assert.equal(config.isolationRoot,join(dir,'workspaces'));
    assert.doesNotMatch(patch,/@deepseek-ai\/dsh-tool-subagent-control\/list-agents/);
  } finally {
    for(const key of keys)if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];
    rmSync(dir,{recursive:true,force:true});
  }
});

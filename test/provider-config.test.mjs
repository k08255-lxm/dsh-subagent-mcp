import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {providerOverlay} from '../src/provider-config.mjs';
function fixture(t,text) {const dir=mkdtempSync(join(tmpdir(),'dsh-provider-test-'));t.after(()=>rmSync(dir,{recursive:true}));const file=join(dir,'config.yml');writeFileSync(file,text);return file;}
const row="- id: llm-pi-ai\n  name: '@deepseek-ai/dsh-llm-pi-ai'\n  config:\n    providers:\n      example:\n        apiKeyEnv: EXAMPLE_KEY\n";
test('provider overlay selects declarations and preserves only credential references',t=>{
 const result=providerOverlay(fixture(t,"- id: unrelated\n  config: forbidden\n"+row+"- id: another\n  config: forbidden\n"));
 assert.ok(result.startsWith('- insert:\n'));assert.match(result,/apiKeyEnv: EXAMPLE_KEY/);assert.doesNotMatch(result,/forbidden/);
});
test('provider overlay refuses literal credentials',t=>{assert.throws(()=>providerOverlay(fixture(t,row+'        apiKey: fixture-secret\n')),/inline credentials/);});
test('provider overlay refuses embedded executable expressions',t=>{assert.throws(()=>providerOverlay(fixture(t,row+'        value: !!js dangerous()\n')),/inline credentials or code/);});

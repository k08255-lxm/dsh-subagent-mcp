import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {temporaryDirectory} from '../src/platform.mjs';
import {queueCompletion} from '../src/codex-queue.mjs';
const threadId='01a1c5a9-5c2f-7e53-b406-dc59356d38a5';
function fixture(t){const directory=mkdtempSync(join(temporaryDirectory(),'dsh-queue-'));t.after(()=>rmSync(directory,{recursive:true}));return {threadId,directory,output:{answer:'mock-only'}};}
test('queue validates ACK and never claims execution',t=>{
  const args=fixture(t);let calls=0;
  const options={spec:['mock'],run:(_spec,argv)=>{calls++;assert.deepEqual(argv.slice(0,3),['queue','--thread',threadId]);assert.ok(!argv.includes('--resume'));return `Queued message submission-1 for thread ${threadId}.`;}};
  const receipt=queueCompletion(args,options);
  assert.equal(receipt.queued_submission_id,'submission-1');assert.equal(receipt.execution,'unverified');
  assert.throws(()=>queueCompletion(args,options),/EEXIST/);assert.equal(calls,1);
});
test('queue rejects names before any command',t=>{
  let calls=0;assert.throws(()=>queueCompletion({...fixture(t),threadId:'same-name'},{spec:['mock'],run:()=>{calls++;}}),/exact parent/);assert.equal(calls,0);
});
for(const failure of ['timeout','wrong-thread','empty'])test(`queue ${failure} is not retried`,t=>{
  const args=fixture(t);let calls=0;const options={spec:['mock'],run:()=>{calls++;if(failure==='timeout')throw new Error('timeout');return failure==='empty'?'':`Queued message submission-1 for thread 00000000-0000-0000-0000-000000000000.`;}};
  assert.throws(()=>queueCompletion(args,options),/do not retry automatically/);
  assert.throws(()=>queueCompletion(args,options),/EEXIST/);assert.equal(calls,1);
});

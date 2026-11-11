import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePreset} from '../src/preset-compat.mjs';
test('legacy preset resolution stays supported', async () => {
  assert.equal(await resolvePreset({resolveMountable: async id => id}, 'standard'), 'standard');
});
test('current preset resolution accepts a healthy definition', async () => {
  assert.deepEqual(await resolvePreset({resolve: async id => ({id})}, 'standard'), {id:'standard'});
});
test('broken current presets fail before session creation', async () => {
  await assert.rejects(resolvePreset({resolve: async id => ({id,broken:{reason:'missing dependency'}})}, 'standard'), /missing dependency/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {runtimeLaunch, desktopCli} from '../src/runtime-launch.mjs';

test('desktop launcher mirrors official shim without invoking shell', () => {
  const exe = resolve('space dir', 'DeepSeek Harness.exe');
  const launch = runtimeLaunch({patch: 'patch.yml'}, {preset: 'standard'}, {DSH_DESKTOP_EXECUTABLE: exe});
  assert.equal(launch.command, exe);
  assert.deepEqual(launch.args, ['--expose-internals', desktopCli(exe), '--profile', 'codex-subagent', '--patch', 'patch.yml']);
  assert.equal(launch.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(launch.env.DSH_CLI, desktopCli(exe));
});
test('legacy standalone launcher retains original command and patch', () => {
  const launch = runtimeLaunch({cli: 'standalone.mjs', legacyPatch: 'old.yml'}, {}, {});
  assert.equal(launch.command, process.execPath);
  assert.deepEqual(launch.args, ['standalone.mjs', '--profile', 'codex-subagent', '--patch', 'old.yml']);
  assert.equal(launch.env.ELECTRON_RUN_AS_NODE, undefined);
});
test('desktop executable must be an absolute path', () => {
  assert.throws(() => desktopCli('relative.exe'), /absolute/);
});

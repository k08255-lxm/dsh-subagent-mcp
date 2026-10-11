import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {temporaryDirectory} from '../../src/platform.mjs';

test('Windows login launcher hides the child console and propagates its exit code', {skip:process.platform!=='win32', timeout:30000},()=>{
  const root=mkdtempSync(join(temporaryDirectory(),'dsh-hidden 雪 & '));
  const script=join(root,'child.ps1'),output=join(root,'result.json');
  writeFileSync(script,`param([string]$OutputFile)
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class ConsoleWindow {
 [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
}
'@
$handle=[ConsoleWindow]::GetConsoleWindow()
@{visible=[ConsoleWindow]::IsWindowVisible($handle);cwd=[Environment]::CurrentDirectory} | ConvertTo-Json | Set-Content -LiteralPath $OutputFile -Encoding utf8
exit 7
`);
  try {
    const result=spawnSync('wscript.exe',['//B','//NoLogo',fileURLToPath(new URL('../../scripts/windows-service.js',import.meta.url)),root,'powershell.exe','-NoLogo','-NoProfile','-NonInteractive','-File',script,'-OutputFile',output],{windowsHide:true,timeout:20000});
    assert.equal(result.error,undefined);
    assert.equal(result.status,7,'The task must retain the child exit status for restart supervision');
    const observed=JSON.parse(readFileSync(output,'utf8').replace(/^\uFEFF/,''));
    assert.equal(observed.visible,false,'The child must have no visible console window');
    assert.equal(observed.cwd.toLowerCase(),root.toLowerCase());
  } finally {rmSync(root,{recursive:true,force:true});}
});

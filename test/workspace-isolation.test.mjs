import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative, sep} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Manager} from '../src/manager.mjs';
import {makeServer} from '../src/server.mjs';
import {prepareWorkspace, validateAgentWorkspace} from '../src/workspace-isolation.mjs';

function fixture(t, beforeCleanup = async () => {}) {
  const directory = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-isolation-test-')));
  t.after(async () => {
    await beforeCleanup();
    const within = relative(realpathSync(tmpdir()), realpathSync(directory));
    assert.ok(within.startsWith('dsh-isolation-test-') && !within.includes(sep), 'cleanup is restricted to this temporary fixture');
    rmSync(directory, {recursive: true, force: true});
  });
  const repo = join(directory, 'source'); mkdirSync(repo);
  const emptyConfig = join(directory, 'empty-gitconfig'); writeFileSync(emptyConfig, '');
  const env = {...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig, GIT_TERMINAL_PROMPT: '0'};
  const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'core.longpaths=true', '-c', 'user.name=Isolation Test', '-c', 'user.email=isolation@example.invalid', '-c', 'commit.gpgSign=false', ...args], {env, encoding: 'utf8', windowsHide: true});
  git('init', '--quiet', '--template=', '--initial-branch=fixture');
  git('config', 'core.autocrlf', 'false');
  writeFileSync(join(repo, 'file.txt'), 'original\n');
  writeFileSync(join(repo, '.gitignore'), 'ignored.txt\n');
  mkdirSync(join(repo, 'nested')); writeFileSync(join(repo, 'nested', 'nested.txt'), 'nested\n');
  git('add', '.'); git('commit', '--quiet', '-m', 'fixture');
  const config = {database: join(directory, 'state.sqlite'), workspaceIsolation: 'git-worktree', isolationRoot: join(directory, 'isolated')};
  const prepare = (threadId, cwd=repo, permission='workspace-write') => prepareWorkspace(config, {cwd, threadId, permission});
  return {directory, repo, config, git, prepare};
}

test('different exact conversations use different detached worktrees, preserve source, and retain own edits', t => {
  const {repo, git, prepare} = fixture(t);
  const originalHead = git('rev-parse', 'HEAD').trim();
  const a = prepare('thread-A', join(repo, 'nested'));
  const b = prepare('thread-B', join(repo, 'nested'), 'read-only');
  assert.notEqual(a.cwd, b.cwd); assert.notEqual(a.cwd, join(repo, 'nested'));
  assert.equal(a.source_cwd, join(repo, 'nested'));
  assert.equal(a.isolation.base_commit, originalHead);
  writeFileSync(join(a.cwd, 'nested.txt'), 'A changed\n');
  assert.equal(readFileSync(join(b.cwd, 'nested.txt'), 'utf8'), 'nested\n');
  assert.equal(readFileSync(join(repo, 'nested', 'nested.txt'), 'utf8'), 'nested\n');
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(git('rev-parse', 'HEAD').trim(), originalHead);
  assert.equal(git('branch', '--format=%(refname:short)').trim(), 'fixture');
  assert.equal(execFileSync('git', ['-C', a.cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], {encoding:'utf8'}).trim(), 'HEAD');
  const reused = prepare('thread-A', join(repo, 'nested'));
  assert.equal(reused.cwd, a.cwd); assert.equal(readFileSync(join(reused.cwd, 'nested.txt'), 'utf8'), 'A changed\n');
  assert.notEqual(prepare('thread-A ').cwd, prepare('thread-A').cwd, 'identity is exact, never trimmed');
  writeFileSync(join(repo, 'file.txt'), 'later unsaved source\n');
  assert.equal(prepare('thread-A').isolation.worktree_root, a.isolation.worktree_root, 'reuse does not import later source changes');
  assert.throws(() => prepare('new-thread'), /modified, staged, untracked, or ignored/);
});

for (const type of ['modified', 'staged', 'untracked', 'ignored']) test(`unsnapshotted ${type} inputs fail closed without altering files`, t => {
  const {repo, config, git, prepare} = fixture(t);
  const filename = type === 'untracked' ? 'new.txt' : type === 'ignored' ? 'ignored.txt' : 'file.txt';
  writeFileSync(join(repo, filename), 'unsaved input\n');
  if (type === 'staged') git('add', filename);
  const before = git('status', '--porcelain=v1', '--ignored=matching');
  assert.throws(() => prepare('thread'), /modified, staged, untracked, or ignored/);
  assert.equal(readFileSync(join(repo, filename), 'utf8'), 'unsaved input\n');
  assert.equal(git('status', '--porcelain=v1', '--ignored=matching'), before);
  assert.equal(existsSync(config.isolationRoot), false);
});

test('missing identity, full access, non-Git source, and source-contained destination all fail closed', t => {
  const {directory, repo, config, prepare} = fixture(t);
  for (const threadId of [undefined, '', '  ', 12, 'bad\0id']) assert.throws(() => prepare(threadId), /MCP _meta.threadId/);
  assert.throws(() => prepare('thread', repo, 'danger-full-access'), /incompatible/);
  assert.throws(() => prepare('thread', directory), /needs a Git working tree/);
  assert.throws(() => prepareWorkspace({...config, isolationRoot:join(repo, 'inside')}, {cwd:repo,threadId:'thread',permission:'read-only'}), /outside the source/);
  assert.equal(existsSync(join(repo, 'inside')), false);
  assert.equal(existsSync(config.isolationRoot), false);
});

test('assume-unchanged index flags cannot hide unsaved source edits', t => {
  const {repo, config, git, prepare} = fixture(t);
  git('update-index', '--assume-unchanged', 'file.txt');
  writeFileSync(join(repo, 'file.txt'), 'hidden edit\n');
  assert.equal(git('status', '--porcelain'), '');
  assert.throws(() => prepare('thread'), /assume-unchanged or skip-worktree/);
  assert.equal(readFileSync(join(repo, 'file.txt'), 'utf8'), 'hidden edit\n');
  assert.match(git('ls-files', '-v', 'file.txt'), /^h /);
  assert.equal(existsSync(config.isolationRoot), false);
});

for (const mode of ['120000', '160000']) test(`tracked ${mode === '120000' ? 'symlinks' : 'submodules'} are rejected before checkout`, t => {
  const {repo, config, git, prepare} = fixture(t);
  git('config', 'core.symlinks', 'false');
  let object;
  if (mode === '120000') {
    writeFileSync(join(repo, 'linked'), 'file.txt');
    object = git('hash-object', '-w', 'linked').trim();
  } else {
    mkdirSync(join(repo, 'linked')); object = git('rev-parse', 'HEAD').trim();
  }
  git('update-index', '--add', '--cacheinfo', `${mode},${object},linked`);
  git('commit', '--quiet', '-m', 'linked fixture');
  assert.equal(git('status', '--porcelain'), '');
  assert.throws(() => prepare('thread'), /tracked symlinks or Git submodules/);
  assert.equal(existsSync(config.isolationRoot), false);
});

test('managed paths, incomplete ownership records and moved worktrees cannot fall back to source', t => {
  const {prepare, config} = fixture(t);
  const a = prepare('thread');
  assert.throws(() => prepare('other-thread', a.cwd), /managed isolation directory/);
  writeFileSync(join(a.isolation.record_directory, 'workspace.json'), '{broken');
  assert.throws(() => prepare('thread'), /incomplete or unrecognized/);
  assert.equal(existsSync(join(a.cwd, 'file.txt')), true);
  writeFileSync(join(a.isolation.record_directory, 'workspace.json'), JSON.stringify(a.isolation));
  renameSync(a.cwd, join(dirname(a.cwd), 'retained-moved-checkout'));
  assert.throws(() => validateAgentWorkspace(config, {...a,permission:'workspace-write'}), /moved, removed, or redirected/);
  assert.equal(existsSync(join(dirname(a.cwd), 'retained-moved-checkout', 'file.txt')), true);
});

test('worktree creation does not invoke source checkout hooks or inherit Git index overrides', t => {
  const {repo, directory, prepare, git} = fixture(t);
  mkdirSync(join(repo, '.git', 'hooks'), {recursive:true});
  writeFileSync(join(repo, '.git', 'hooks', 'post-checkout'), '#!/bin/sh\nprintf ran > hook-ran.txt\n', {mode:0o755});
  const prior = process.env.GIT_INDEX_FILE;
  process.env.GIT_INDEX_FILE = join(directory, 'do-not-create-index');
  let a;
  try {a = prepare('thread');}
  finally {if(prior===undefined)delete process.env.GIT_INDEX_FILE;else process.env.GIT_INDEX_FILE=prior;}
  assert.equal(existsSync(join(a.cwd, 'hook-ran.txt')), false);
  assert.equal(existsSync(join(directory, 'do-not-create-index')), false);
  assert.equal(git('status', '--porcelain'), '');
});

class FakeRuntime extends EventEmitter {
  static all = [];
  constructor(agent) {super();this.agent=agent;this.calls=[];FakeRuntime.all.push(this);}
  async request(method, params) {
    this.calls.push([method,params]);
    if(method==='session/prepare')return {workspace_id:'fixture',preset:this.agent.preset,permission:this.agent.permission};
    if(method==='session/prompt')return {messageId:'fake-only-no-model'};
    return {};
  }
  async close() {}
}
const tick = () => new Promise(resolve=>setImmediate(resolve));

test('MCP forwards only exact request metadata, rejects cross-conversation controls, and returns actual paths', async t => {
  let manager, server, client;
  const {directory, repo, config} = fixture(t, async()=>{await client?.close();await server?.close();await manager?.shutdown();});
  manager = new Manager(config, FakeRuntime);
  server = makeServer(manager, {desktop:true});
  client = new Client({name:'isolation-test',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);
  const call = (name,args,threadId) => client.callTool({name,arguments:args,...(threadId===undefined?{}:{_meta:{threadId}})});
  const value = result => JSON.parse(result.content[0].text);
  assert.match(client.getInstructions(), /Workspace isolation mode: git-worktree \(strict\)/);
  const before = FakeRuntime.all.length;
  const rejected=await call('dsh_start',{cwd:repo,task:'must not run',threadId:'invented-input-id'});
  assert.equal(rejected.isError,true);assert.match(rejected.content[0].text,/_meta.threadId/);
  assert.equal(manager.list().length,0);assert.equal(FakeRuntime.all.length,before);
  const full=await call('dsh_start',{cwd:repo,task:'must not run',permission:'danger-full-access'},'A');
  assert.equal(full.isError,true);assert.equal(FakeRuntime.all.length,before);
  const started=await call('dsh_start',{cwd:repo,task:'fixture only'},'A');
  assert.notEqual(started.isError,true,started.content[0].text);
  const first=value(started);await tick();
  assert.equal(first.source_cwd,repo);assert.notEqual(first.cwd,repo);assert.equal(first.isolation.mode,'git-worktree');
  assert.equal(manager.get(first.agent_id).isolation.thread_id,'A');
  const runtime=manager.live.get(first.agent_id);
  assert.equal(runtime.agent.cwd,first.cwd);
  assert.match(runtime.calls.find(([method])=>method==='session/prompt')[1].contentBlocks[0].text,/Workspace isolation:/);
  assert.equal(value(await call('dsh_status',{agent_id:first.agent_id})).source_cwd,repo);
  for(const [name,args] of [['dsh_followup',{task:'wrong owner'}],['dsh_rename',{name:'wrong owner'}],['dsh_interrupt',{}],['dsh_close',{}],['dsh_release',{}]]) {
    const denied=await call(name,{agent_id:first.agent_id,...args},'B');
    assert.equal(denied.isError,true);assert.match(denied.content[0].text,/another Codex conversation/);
  }
  const attached=await call('dsh_attach',{session_id:'external',web_url:'http://localhost:1234'},'A');
  assert.equal(attached.isError,true);assert.match(attached.content[0].text,/cannot be moved/);
  const second=value(await call('dsh_start',{cwd:repo,task:'second fixture',permission:'read-only'},'B'));
  assert.notEqual(second.cwd,first.cwd);await tick();
  const owned=manager.get(first.agent_id);owned.status='completed';owned.persisted=true;manager.save(owned);
  await tick();await manager.followup(first.agent_id,'owner continuation',{threadId:'A'});
  writeFileSync(join(first.cwd,'file.txt'),'retained change\n');
  await client.close();await server.close();await manager.shutdown();
  manager=new Manager(config,FakeRuntime);
  await assert.rejects(manager.followup(first.agent_id,'wrong owner',{threadId:'B'}),/another Codex conversation/);
  await manager.followup(first.agent_id,'restored owner',{threadId:'A'});
  assert.equal(manager.get(first.agent_id).cwd,first.cwd);
  assert.equal(readFileSync(join(first.cwd,'file.txt'),'utf8'),'retained change\n');
  manager.save({id:'legacy-fixture',cwd:directory,status:'completed',persisted:true});
  await assert.rejects(manager.followup('legacy-fixture','must not run',{threadId:'A'}),/no conversation-isolated workspace/);
  assert.equal(readFileSync(join(repo,'file.txt'),'utf8'),'original\n');
});

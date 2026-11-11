import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Manager} from '../src/manager.mjs';
import {makeServer} from '../src/server.mjs';
import {desktopConfig} from '../src/desktop.mjs';

for (const desktop of [true, false]) test(`MCP completion profile desktop=${desktop}`, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-desktop-'));
  const manager = new Manager({database: join(directory, 'state.sqlite')});
  manager.save({id: 'fixture', status: 'completed', answer: 'fixture result', finish_reason: 'completed'});
  const server = makeServer(manager, {desktop});
  const client = new Client({name: 'desktop-fixture', version: '1'});
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => {await client.close(); await server.close(); await manager.shutdown(); rmSync(directory, {recursive: true});});
  await server.connect(a); await client.connect(b);
  const {tools} = await client.listTools();
  assert.equal(tools.some(tool => tool.name === 'dsh_watch'), !desktop);
  assert.equal(tools.some(tool => tool.name === 'dsh_unwatch'), !desktop);
  if (desktop) {
    assert.match(client.getInstructions(), /automatic wakeup/);
    for (const tool of tools) assert.doesNotMatch(tool.description, /call dsh_watch/);
    const absent = await client.callTool({name: 'dsh_watch', arguments: {agent_id: 'fixture'}});
    assert.equal(absent.isError, true);
  }
  const result = await client.callTool({name: 'dsh_wait', arguments: {agent_id: 'fixture'}});
  const value = JSON.parse(result.content[0].text);
  assert.equal(value.answer, 'fixture result');
  assert.equal(value.wait_outcome, 'settled');
});

test('desktop config uses quoted absolute paths without writing configuration', () => {
  const config = desktopConfig({node: '/User space/node', root: '/User space/雪"project'});
  assert.match(config, /command = "\/User space\/node"/);
  assert.ok(config.includes('雪\\"project'));
  assert.match(config, /"mcp","--desktop"/);
  assert.match(config, /tool_timeout_sec = 3600/);
});

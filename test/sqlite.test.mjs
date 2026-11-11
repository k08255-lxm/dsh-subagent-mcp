import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {temporaryDirectory} from '../src/platform.mjs';
import {openDatabase} from '../src/sqlite.mjs';

test('SQLite memory database remains in memory',()=>{
  const db=openDatabase(':memory:');
  try { assert.equal(db.prepare('PRAGMA database_list').get().file,''); }
  finally { db.close(); }
});

test('SQLite persists and reopens long Unicode database paths',()=>{
  const root=mkdtempSync(join(temporaryDirectory(),'dsh-sqlite-test-'));
  const dir=join(root,...Array.from({length:6},(_,i)=>`${i}-中文-long-directory-`.repeat(2)));
  mkdirSync(dir,{recursive:true});
  const path=join(dir,'state.sqlite');
  assert.ok(path.length>260);
  let db;
  try {
    db=openDatabase(path);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE probe(value); INSERT INTO probe VALUES (42)');
    db.close();db=openDatabase(path);
    assert.equal(db.prepare('SELECT value FROM probe').get().value,42);
  } finally { db?.close();rmSync(root,{recursive:true}); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Store} from '../dist/store.js';
test('repeat production setup leaves the owner unchanged without needing bootstrap credentials',async()=>{
 const path=join(mkdtempSync(join(tmpdir(),'magic-setup-')),'test.sqlite');
 const env={...process.env,VERCEL:'',TURSO_DATABASE_URL:'',MAGIC_TURSO_DATABASE_URL:'',DATABASE_PATH:path,BOOTSTRAP_EMAIL:'owner@example.test',BOOTSTRAP_PASSWORD:'Local-test-only-password-42!',BUSINESS_SLUG:'setup-test'};
 let r=spawnSync(process.execPath,['dist/setup.js','--if-empty'],{env,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const db=new Store(path);const first=await db.db.prepare('SELECT * FROM users').all();assert.equal(first.length,1);db.db.close();
 r=spawnSync(process.execPath,['dist/setup.js','--if-empty'],{env:{...env,BOOTSTRAP_EMAIL:'',BOOTSTRAP_PASSWORD:''},encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const reopened=new Store(path);assert.deepEqual(await reopened.db.prepare('SELECT * FROM users').all(),first);reopened.db.close();
});


import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOptionalMap} from '../dist/venue-map-loading.js';

test('optional map succeeds normally and reports a failed dependency',async()=>{
  const signal=new AbortController().signal;
  assert.equal(await loadOptionalMap(async()=>42,signal,100),42);
  await assert.rejects(loadOptionalMap(async()=>{throw Error('Missing stylesheet');},signal,100),/Missing stylesheet/);
});

test('a stalled optional map times out while late completion stays harmless',async()=>{
  let finish;
  const late=new Promise(resolve=>{finish=resolve;});
  await assert.rejects(loadOptionalMap(()=>late,new AbortController().signal,15),/timed out/);
  finish('too late');
});

test('leaving the venue page cancels a pending load, including before it starts',async()=>{
  const controller=new AbortController();
  const pending=loadOptionalMap(()=>new Promise(()=>{}),controller.signal,100);
  controller.abort();
  await assert.rejects(pending,/cancelled/);
  let called=false;
  await assert.rejects(loadOptionalMap(async()=>{called=true;},controller.signal,100),/cancelled/);
  assert.equal(called,false);
});

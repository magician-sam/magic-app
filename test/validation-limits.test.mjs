import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';

test('oversized constrained collections fail before walking attacker-controlled elements', () => {
  let walked = 0;
  const element = z.preprocess(value => { walked++; return value; }, z.string());
  const cases = [
    [z.array(element).max(10), Array(1000).fill(1)],
    [z.set(element).max(10), new Set(Array.from({length:1000},(_,i)=>i))],
    [z.map(z.string(),element).max(10), new Map(Array.from({length:1000},(_,i)=>[String(i),i]))],
  ];
  for (const [schema,input] of cases) {
    walked=0;
    const result=schema.safeParse(input);
    assert.equal(result.success,false);
    assert.equal(walked,0,'size limit must stop validation before per-element work');
    assert.equal(result.error.issues.length,1);
    assert.equal(result.error.issues[0].code,'too_big');
  }
  assert.deepEqual(z.array(element).max(10).parse(['valid']),['valid']);
});

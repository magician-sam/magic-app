import test from 'node:test';
import assert from 'node:assert/strict';
import {festivePosition} from '../dist/festive-position.js';
test('floating visitors stay inside viewport, avoid controls and find a different clear spot',()=>{
  const protectedAreas=[{left:0,top:0,right:390,bottom:100},{left:0,top:680,right:390,bottom:844},{left:0,top:300,right:210,bottom:470}];
  const first=festivePosition(390,844,124,116,protectedAreas,undefined,()=>0);
  assert.ok(first);assert.ok(first.x>=10&&first.x+124<=380&&first.y>=100&&first.y+116<680);
  assert.ok(!protectedAreas.some(r=>first.x<r.right+6&&first.x+124>r.left-6&&first.y<r.bottom+6&&first.y+116>r.top-6));
  const second=festivePosition(390,844,124,116,protectedAreas,first,()=>0);
  assert.ok(second);assert.ok(Math.hypot(second.x-first.x,second.y-first.y)>=97.5);
  assert.equal(festivePosition(320,640,124,116,[{left:0,top:0,right:320,bottom:640}]),null);
  assert.equal(festivePosition(100,150,180,154,[]),null);
  const readable=festivePosition(390,844,112,100,[],undefined,()=>0,[{left:0,top:0,right:220,bottom:844,weight:10}]);
  assert.ok(readable.x>=220,'prefer a clear space instead of a text column');
});

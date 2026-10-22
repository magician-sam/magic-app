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

test('phone appearances explore both sides and different heights despite a tempting central text gap',()=>{
  for(const width of [320,390]){
    const height=844,spriteWidth=100,spriteHeight=140;
    const controls=[{left:0,top:0,right:width,bottom:80},{left:0,top:height-100,right:width,bottom:height},{left:width*.4,top:350,right:width,bottom:400}];
    const reading=[{left:0,top:80,right:110,bottom:height-100,weight:10},{left:width-110,top:80,right:width,bottom:height-100,weight:10}];
    let seed=42,previous;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
    const positions=[];
    for(let i=0;i<150;i++){
      const point=festivePosition(width,height,spriteWidth,spriteHeight,controls,previous,random,reading,true);
      assert.ok(point);
      assert.ok(point.x>=10&&point.x+spriteWidth<=width-10&&point.y>=10&&point.y+spriteHeight<=height-10);
      assert.ok(!controls.some(r=>point.x<r.right+6&&point.x+spriteWidth>r.left-6&&point.y<r.bottom+6&&point.y+spriteHeight>r.top-6),'never cover phone controls');
      if(previous)assert.ok(Math.hypot(point.x-previous.x,point.y-previous.y)>=width*.25);
      positions.push(point);previous=point;
    }
    assert.ok(positions.filter(p=>p.x<width*.25).length>=15,'appear on the left, not only in the centre');
    assert.ok(positions.filter(p=>p.x>width*.5).length>=15,'appear on the right');
    assert.ok(positions.filter(p=>p.y<height*.35).length>=15,'use upper available space');
    assert.ok(positions.filter(p=>p.y>height*.5).length>=15,'use lower available space');
    assert.equal(festivePosition(width,height,spriteWidth,spriteHeight,[{left:0,top:0,right:width,bottom:height}],undefined,random,reading,true),null);
  }
});

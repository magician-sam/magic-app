import test from 'node:test';
import assert from 'node:assert/strict';
import {installMediaPlayback,stopMediaWithin} from '../dist/media-playback.js';
test('gallery media stops on close, replacement, moving off-screen and backgrounding',()=>{
  const names=['HTMLMediaElement','HTMLIFrameElement','HTMLDialogElement','IntersectionObserver','MutationObserver','document','window'];
  const old=Object.fromEntries(names.map(key=>[key,globalThis[key]]));
  class Node extends EventTarget {
    isConnected=true; hidden=false; dialog=null;
    closest(selector){return selector==='dialog'?this.dialog:selector==='[hidden]'&&this.hidden?this:null;}
  }
  class Media extends Node {paused=false;currentTime=4;pause(){this.paused=true;}}
  class Frame extends Node {attrs=new Map([['src','https://www.youtube-nocookie.com/embed/abcdefghijk']]);dataset={};getAttribute(k){return this.attrs.get(k)??null;}setAttribute(k,v){this.attrs.set(k,v);}removeAttribute(k){this.attrs.delete(k);}}
  class Dialog extends Node {open=true;players=[];classList={contains:()=>false};querySelectorAll(){return this.players;}}
  const first=new Media(),second=new Media(),frame=new Frame(),dialog=new Dialog();dialog.players=[first,second,frame];for(const player of dialog.players)player.dialog=dialog;
  const doc=new EventTarget();doc.hidden=false;doc.body={};doc.querySelectorAll=selector=>selector==='dialog[open]'?(dialog.open?[dialog]:[]):dialog.players;
  const win=new EventTarget();let intersection,mutation;
  Object.assign(globalThis,{HTMLMediaElement:Media,HTMLIFrameElement:Frame,HTMLDialogElement:Dialog,document:doc,window:win,
    IntersectionObserver:class{constructor(callback){intersection=callback;}observe(){}unobserve(){}},MutationObserver:class{constructor(callback){mutation=callback;}observe(){}}});
  const event=(type,target)=>{const value=new Event(type);Object.defineProperty(value,'target',{value:target});doc.dispatchEvent(value);};
  try {
    installMediaPlayback();
    event('play',first);assert.equal(second.paused,true);assert.equal(first.paused,false);assert.ok(frame.getAttribute('src'));
    intersection([{target:first,isIntersecting:false}]);assert.equal(first.paused,true);assert.equal(first.currentTime,4);
    first.paused=false;event('close',dialog);assert.equal(first.paused,true);assert.equal(frame.getAttribute('src'),null);
    intersection([{target:frame,isIntersecting:true}]);assert.match(frame.getAttribute('src'),/youtube-nocookie/);
    second.paused=false;second.isConnected=false;mutation();assert.equal(second.paused,true);
    first.paused=false;doc.hidden=true;event('visibilitychange',doc);assert.equal(first.paused,true);
    doc.hidden=false;first.paused=false;win.dispatchEvent(new Event('pagehide'));assert.equal(first.paused,true);
    first.paused=false;stopMediaWithin(dialog);assert.equal(first.paused,true);
    dialog.open=false;first.paused=false;event('play',first);assert.equal(first.paused,true);
  } finally {for(const key of names){if(old[key]===undefined)delete globalThis[key];else globalThis[key]=old[key];}}
});

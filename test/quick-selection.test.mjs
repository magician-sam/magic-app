import test from 'node:test';
import assert from 'node:assert/strict';
import {isQuickActService,planQuickSelection,quickSelectionMatches} from '../dist/quick-selection.js';

const show=(id,includes=[id])=>({key:'show:'+id,kind:'show',title:id,group:'Shows',terms:[],includes});
const service=id=>({key:'service:'+id,kind:'service',title:id,group:'Services',terms:[]});

test('bulk addition is additive, duplicate safe and atomic when a choice is unavailable',()=>{
  const items=[show('magic'),service('Juggling'),service('Popcorn')];
  const existing=['show:magic'],requested=['show:magic','service:Juggling','service:Juggling','service:Popcorn'];
  assert.deepEqual(planQuickSelection(items,existing,requested),{keys:['show:magic','service:Juggling','service:Popcorn'],added:['service:Juggling','service:Popcorn']});
  assert.deepEqual(planQuickSelection(items,existing,['service:Juggling','service:Hidden']),{error:'unavailable'});
  assert.deepEqual(existing,['show:magic']);
  assert.equal(requested.length,4);
});

test('bundles cannot duplicate a show, including two new choices in the same click',()=>{
  const items=[show('magic'),show('science'),show('duo',['magic','science']),show('trio',['science','bubbles'])];
  for(const [existing,requested] of [[['show:magic'],['show:duo']],[['show:duo'],['show:magic']],[[],['show:duo','show:trio']],[[],['show:magic','show:duo']]]){
    assert.deepEqual(planQuickSelection(items,existing,requested),{error:'overlap'});
  }
  assert.deepEqual(planQuickSelection(items,[],['show:magic','show:science']).added,['show:magic','show:science']);
});

test('the quick shortcut obeys the request limits without dropping existing choices',()=>{
  const shows=Array.from({length:13},(_,i)=>show(String(i))),services=Array.from({length:31},(_,i)=>service(String(i)));
  const items=[...shows,...services];
  assert.equal(planQuickSelection(items,shows.slice(0,12).map(x=>x.key),[shows[12].key]).error,'limit');
  assert.equal(planQuickSelection(items,services.slice(0,30).map(x=>x.key),[services[30].key]).error,'limit');
  assert.equal(planQuickSelection(items,shows.slice(0,11).map(x=>x.key),[shows[11].key,...services.slice(0,30).map(x=>x.key)]).keys.length,42);
});

test('quick search handles spelling, translated and edited names, with direct matches preferred',()=>{
  const items=[{...service('Juggling'),terms:['Jonglerie','خفة التوازن','Circus juggling']},service('Clown'),{...service('Popcorn'),title:'Sam’s snacks',terms:['Popcorn','فشار']}];
  for(const query of ['juglir','jonglerie','juggling'])assert.deepEqual(quickSelectionMatches(items,query).map(x=>x.key),['service:Juggling']);
  for(const query of ['فشار','sam’s snacks','popcorn'])assert.deepEqual(quickSelectionMatches(items,query).map(x=>x.key),['service:Popcorn']);
  assert.deepEqual(quickSelectionMatches([service('Clown'),service('Clowny')],'clowny').map(x=>x.key),['service:Clowny']);
  assert.deepEqual(quickSelectionMatches(items,'zzzzzzz'),[]);
  assert.equal(quickSelectionMatches(items,'').length,items.length);
});


test('the shortcut exposes individual acts only and preserves other event choices without re-adding them',()=>{
  for(const name of ['BMX Show','Juggling','Face Painting & Glitter','Close-up Magic','Clown'])assert.equal(isQuickActService(name),true,name);
  for(const name of ['Food & Beverages','Cakes','Cotton Candy Station','Characters','Carnival Games',"Children's Workshops",'Photography','Decoration','Inflatable Slides','DJ','Sound System'])assert.equal(isQuickActService(name),false,name);
  const food={...service('Food & Beverages'),quick:false};
  const bundle={...show('duo',['magic','science']),quick:false};
  const magic=show('magic'),juggling={...service('Juggling'),title:'My renamed act',quick:isQuickActService('Juggling')};
  const items=[food,bundle,magic,juggling];
  assert.deepEqual(quickSelectionMatches(items,'').map(x=>x.key),['show:magic','service:Juggling']);
  assert.deepEqual(quickSelectionMatches(items,'food'),[]);
  assert.deepEqual(planQuickSelection(items,[],[food.key]),{error:'unavailable'});
  assert.deepEqual(planQuickSelection(items,[],[bundle.key]),{error:'unavailable'});
  assert.deepEqual(planQuickSelection(items,[food.key,bundle.key],[juggling.key]),{keys:[food.key,bundle.key,juggling.key],added:[juggling.key]});
  assert.deepEqual(planQuickSelection(items,[bundle.key],[magic.key]),{error:'overlap'});
});

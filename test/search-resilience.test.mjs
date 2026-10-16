import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesMultilingual, multilingualMatchScore } from '../dist/multilingual-search.js';
import { guestServiceNames } from '../dist/guest-services.js';
import { playtownMatches } from '../dist/playtown.js';
import { setCustomerLanguage } from '../dist/customer-i18n.js';
import { translateCustomerCopy } from '../dist/customer-language.js';

test('real service keys and common typing mistakes work in every display language',()=>{
  for(const language of ['en','fr','ar']) {
    setCustomerLanguage(language);
    for(const query of ['decortaion','decoraton','décoraton','ديكرو','الديكور'])assert.ok(matchesMultilingual(['Decoration'],query),query);
    for(const [name,query] of [["Children's Workshops",'atelier'],['Face Painting & Glitter','رسم وجوه'],['Cake','كاتو'],['Cakes','gateau'],['Photography','photograhy'],['Clown','clwon'],['Panda','pnda']])assert.ok(matchesMultilingual([name],query),name+' '+query);
    assert.equal(multilingualMatchScore(['Decoration'],'decoration'),0);
    assert.ok(multilingualMatchScore(['Decoration'],'decortaion')>0);
    assert.ok(playtownMatches('بيرووت','playtwn'));
    for(const query of ['dj','time','9876','قمر صناعي','notarealitem'])assert.equal(matchesMultilingual(['Decoration'],query),false,query);
    assert.equal(matchesMultilingual(['Mime'],'time'),false);
  }
});
test('spelling suggestions do not bypass current catalogue visibility or short-name boundaries',()=>{
  const active=guestServiceNames([],['Decoration','Balloon Decoration','Floral Decoration']);
  assert.equal(active.some(name=>matchesMultilingual([name],'decortaion')),false);
  assert.equal(matchesMultilingual(['Juggling'],'dj'),false);
  assert.equal(matchesMultilingual(['DJ'],'d'),false);
  assert.equal(playtownMatches('Tripoli','playtown'),false);
});

test('spoken spellings and nearby names work beyond the original juggler example',()=>{
  for(const language of ['en','fr','ar']) {
    setCustomerLanguage(language);
    for(const [name,query] of [
      ['Science Show','siance'],['Decoration','dekorashon'],
      ['Photography','fotografer'],['Carnival Games','karnival'],
      ['Animation','animayshun'],['DJ','deejay'],
      ['Balloon Twisting','بالونز'],['Balloon Decoration','بالونز'],
      ['Magic Show','magican'],['Sound System','sound sistem'],
    ]) assert.ok(matchesMultilingual([name],query),name+' '+query+' '+language);
    assert.ok(playtownMatches('','playgrond'));
    assert.ok(playtownMatches('','playtwn'));
    for(const [name,query] of [['Mime','time'],['DJ','day'],['Cakes','cars'],['Decoration','9876'],['Science Show','sound'],['Photography','football'],['Clown','moon']])
      assert.equal(matchesMultilingual([name],query),false,name+' '+query);
  }
});

test('customer-facing Photographer label preserves canonical Photography requests and searches',()=>{
  assert.equal(translateCustomerCopy('Photography','en'),'Photographer');
  assert.equal(translateCustomerCopy('Photography','fr'),'Photographe');
  assert.equal(translateCustomerCopy('Photography','ar'),'مصوّر');
  for(const query of ['photography','photographer','photografer','fotography','Photographe','تصوير'])
    assert.ok(matchesMultilingual(['Photography'],query),query);
});

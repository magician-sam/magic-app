import test from 'node:test';
import assert from 'node:assert/strict';
import { h, t, copy, enableCustomerTranslations, setCustomerLanguage } from '../dist/customer-i18n.js';
import { matchesMultilingual, normalizeSearch, locationTerms } from '../dist/multilingual-search.js';
import { noticeTitleView, noticeBodyView } from '../dist/customer-notice-view.js';
import { playtownMatches, playtown } from '../dist/playtown.js';
import { readDesignerAnswers, designerSummary } from '../dist/event-designer.js';

test('cross-language search is independent of display language', () => {
  for (const lang of ['en','fr','ar']) {
    setCustomerLanguage(lang);
    for(const query of ['magicien','سَاحِر','magic']) assert.ok(matchesMultilingual(['Magic Show'],query),lang+' '+query);
    for(const query of ['décoration','decoration','دِيـكُور']) assert.ok(matchesMultilingual(['Full Decoration'],query),query);
    for(const query of ['photographe','مصور','Photography']) assert.ok(matchesMultilingual(['Photography'],query),query);
    assert.equal(matchesMultilingual(['Mime'],'time'),false);
    assert.equal(matchesMultilingual(['Juggling'],'dj'),false);
    assert.equal(matchesMultilingual(['Full Decoration'],'balloon twisting'),false);
  }
});
test('French accents, Arabic variants and mixed-language words normalize consistently', () => {
  assert.equal(normalizeSearch('ÉCHASSIER'),'echassier');
  assert.equal(normalizeSearch('أَإِآـلْعَرَبِيّة'),'ااالعربيه');
  assert.ok(matchesMultilingual(['Floral Decoration'],'fleurs ورد'));
  assert.ok(matchesMultilingual(['Science Show'],'science عُلوم'));
});
test('PLAYTOWN discovery preserves supplied Maps and rates', () => {
  for(const query of ['بلاي تاون','aire de jeux','PLAYTOWN','أَطْفَال']) assert.ok(playtownMatches('',query),query);
  for(const area of ['عين التينه','BEYROUTH','Béyrouth']) assert.ok(playtownMatches(area,''),area);
  assert.equal(playtownMatches('Tripoli',''),false);
  assert.equal(playtown.map,'https://maps.app.goo.gl/Rv5SUZC4oA91vGFB6?g_st=aw');
  assert.deepEqual(playtown.passes.map(p=>[p.id,p.usd]),[['basic',15],['basic-artistic',20],['playtown',20],['playtown-artistic',25]]);
});
test('HTML localization keeps interpolated customer text, attributes and identifiers opaque', () => {
  enableCustomerTranslations();setCustomerLanguage('fr');
  const user='Magic Show';
  const result=h`<section><h2>Magic Show</h2><p>${user}</p><input value="${user}" name="Birthday"><button data-key="Magic Show">My account</button></section>`;
  assert.ok(result.includes('Spectacle de magie'));
  assert.ok(result.includes('<p>Magic Show</p>'));
  assert.ok(result.includes('value="Magic Show" name="Birthday"'));
  assert.ok(result.includes('data-key="Magic Show"'));
  assert.ok(result.includes('Mon compte'));
  assert.ok(h`<p>${'<script>test()</script>'}</p>`.includes('<script>test()</script>'),'escaping remains caller responsibility');
  assert.ok(copy('<script>test()</script>').includes('&lt;script&gt;'));
});
test('Backstage copy stays exactly English', () => {
  enableCustomerTranslations(false);setCustomerLanguage('ar');
  assert.equal(t('My account'),'My account');
  assert.equal(h`<button>My account</button>`,'<button>My account</button>');
});
test('language switching leaves saved occasion values and summaries unchanged', () => {
  const draft={occasion:'Baptism',format:'A gathering after the ceremony',guests:'21–50',feeling:'Soft and elegant',audience:'Mostly adults',setting:'At home'};
  const expected=designerSummary(draft);
  for(const lang of ['en','fr','ar']){setCustomerLanguage(lang);assert.deepEqual(readDesignerAnswers(draft),draft);assert.equal(designerSummary(draft),expected);}
});

test('count patterns localize display text while maintaining opaque interpolations', () => {
  enableCustomerTranslations();setCustomerLanguage('fr');
  assert.equal(t('3 shows to explore'),'3 spectacles à découvrir');
  assert.ok(copy('14 portfolio photos').includes('14 photos de portfolio'));
  setCustomerLanguage('ar');assert.equal(t('20 guests'),'20 ضيوف');
  assert.ok(h`<p>${'20 guests'}</p>`.includes('<p>20 guests</p>'),'raw record interpolation is preserved');
});

test('configured names that resemble object properties remain searchable and are never translated',()=>{
  enableCustomerTranslations();setCustomerLanguage('ar');
  for(const value of ['constructor','__proto__','toString']) { assert.equal(t(value),value);assert.equal(copy(value),value);assert.ok(matchesMultilingual([value],value)); }
  assert.equal(normalizeSearch('بَیرُوت'),'بيروت');
});

test('city aliases never add a particular street and proper provider names remain literal',()=>{
  assert.equal(matchesMultilingual([], 'عين التينة',locationTerms(['Beirut'])),false);
  assert.equal(matchesMultilingual([], 'عين التينة',locationTerms(['Beyrouth'])),false);
  assert.ok(matchesMultilingual([], 'بيروت',locationTerms(['Beyrouth'])));
  assert.ok(matchesMultilingual([], 'عين التينة',locationTerms(['Ain El Tineh, Beirut'])));
  assert.equal(matchesMultilingual([], 'photographe',['Photography']),false);
  assert.ok(matchesMultilingual(['photography'],'photographe'));
});

test('mixed option copy preserves values and opaque supplied labels',()=>{
  enableCustomerTranslations();setCustomerLanguage('fr');
  const result=h`<select><option value="original">My account ${'Photography'}</option></select>`;
  assert.ok(result.includes('value="original"'));
  assert.ok(result.includes('data-customer-option-parts='));
  assert.ok(result.includes('Mon compte Photography'));
  assert.equal(result.includes('<span'),false);
});

test('known notification envelopes preserve customer names, payment terms and historic text',()=>{
  enableCustomerTranslations();setCustomerLanguage('fr');
  assert.ok(noticeTitleView('Your event is confirmed · My account').endsWith(' · My account'));
  const body=noticeBodyView('Sam has confirmed My account for 2027-01-02 at 14:00. Payment agreement: Photography. Open your private event page for the agreed plan and recorded payments.','confirmed');
  assert.ok(body.includes('My account'));
  assert.ok(body.includes('Photography.'));
  assert.equal(noticeBodyView('Unchanged historic message','confirmed'),'Unchanged historic message');
});

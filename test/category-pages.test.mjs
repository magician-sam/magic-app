import test from 'node:test';
import assert from 'node:assert/strict';
import {categoryPages, categoryPageHash, categoryPageForHash, categoryPageIncludes} from '../dist/category-pages.js';
import {marketplaceCategoryCards} from '../dist/catalogue-settings.js';
import {translateCustomerCopy} from '../dist/customer-language.js';

test('all fourteen shortcuts have a dedicated same-app view with safe unknown-route handling', () => {
  assert.equal(categoryPages.length, marketplaceCategoryCards.length);
  for (const [title, , , key] of marketplaceCategoryCards) {
    const page = categoryPageForHash(categoryPageHash(key));
    assert.equal(page?.key, key);
    assert.equal(page?.title, title);
    assert.ok(page.section);
  }
  for (const hash of ['#category/unknown', '#category/__proto__', '#category/%3Cscript%3E', '#main', '#marketplace-categories']) {
    assert.equal(categoryPageForHash(hash), undefined);
  }
  for (const hash of ['#browse-treats', '#browse-party-machines', '#browse-food-stations']) assert.equal(categoryPageForHash(hash)?.key, 'food-stations');
  assert.equal(categoryPageForHash('#event-styling')?.key, 'styling');
  assert.equal(categoryPageForHash('#photography-video')?.key, 'capture');
});

test('category contents stay separated using canonical service identity and groups', () => {
  const page = key => categoryPageForHash(categoryPageHash(key));
  assert.equal(categoryPageIncludes(page('styling'), 'Decoration', 'event-styling'), true);
  assert.equal(categoryPageIncludes(page('styling'), 'Photography', 'photography-video'), false);
  assert.equal(categoryPageIncludes(page('shows'), 'magic Magic Show', 'sam-shows'), true);
  assert.equal(categoryPageIncludes(page('shows'), 'Popcorn Station', 'party-machines'), false);
  assert.equal(categoryPageIncludes(page('science'), 'science Science Show', 'sam-shows'), true);
  assert.equal(categoryPageIncludes(page('science'), 'magic Magic Show', 'sam-shows'), false);
  assert.equal(categoryPageIncludes(page('food-stations'), 'Slush Machine', 'party-machines'), true);
  assert.equal(categoryPageIncludes(page('food'), 'Slush Machine', 'party-machines'), false);
  assert.equal(categoryPageIncludes(page('inflatables'), 'Inflatable Slides', 'inflatables'), true);
  assert.equal(categoryPageIncludes(page('schools'), 'Science Show', 'sam-shows'), false);
  for (const lang of ['fr','ar']) assert.notEqual(translateCustomerCopy('← Back to categories',lang),'← Back to categories');
});

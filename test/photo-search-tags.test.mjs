import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePhotoTags,photoSearchTagsSchema} from '../dist/photo-search-tags.js';
import {matchesMultilingual} from '../dist/multilingual-search.js';
test('several photo tags work across writing systems and the requested misspelling',()=>{
  const tags=parsePhotoTags('#juggler #clown, magician، بهلوان\n jongleur #juggler');
  assert.deepEqual(tags,['juggler','clown','magician','بهلوان','jongleur']);
  for(const query of ['juglir','jugler','juggler','جونغلينغ','jongleur'])assert.ok(matchesMultilingual(tags,query),query);
  assert.ok(photoSearchTagsSchema.safeParse({url:'/portfolio/guest/juggling-rings-live.jpg',tags}).success);
  assert.equal(matchesMultilingual(tags,'DJ'),false);
});
test('photo tags reject unsafe URLs, markup and unbounded data',()=>{
  for(const value of [
    {url:'http://example.com/p.jpg',tags:['clown']},
    {url:'https://secret:password@example.com/p.jpg',tags:['clown']},
    {url:'/portfolio/../private.jpg',tags:['clown']},
    {url:'/portfolio/guest/clown-1.jpg',tags:['<script>']},
    {url:'/portfolio/guest/clown-1.jpg',tags:Array(17).fill('clown')},
    {url:'/portfolio/guest/clown-1.jpg',tags:['x'.repeat(61)]},
  ])assert.equal(photoSearchTagsSchema.safeParse(value).success,false);
});

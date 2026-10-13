import test from 'node:test';
import assert from 'node:assert/strict';
import { designerSteps, readDesignerAnswers, designerAudienceAge, designerSummary } from '../dist/event-designer.js';

test('birthday, school, festival and playground plans ask relevant questions', () => {
  const birthday = designerSteps('Birthday'), festival = designerSteps('Festival'), school = designerSteps('School event'), play = designerSteps('Playground visit');
  assert.equal(birthday.length, 5); assert.equal(festival.length, 6);
  assert.match(birthday.find(step => step.key === 'audience').title, /birthday/);
  assert.match(festival.find(step => step.key === 'format').title, /festival/);
  assert.deepEqual(school.find(step => step.key === 'audience').choices.map(([, value]) => value), ['Preschool / kindergarten', 'Primary school', 'Secondary school', 'Several school stages']);
  assert.equal(play.find(step => step.key === 'format').choices[0][1], 'An individual play visit');
  assert.equal(play.find(step => step.key === 'setting').choices.some(([, value]) => value === 'Outdoors'), false);
  assert.equal(festival.find(step => step.key === 'guests').choices.some(([, value]) => value === 'More than 300'), true);
});

test('changing the occasion discards irrelevant saved preferences and arbitrary text', () => {
  const input = { occasion: 'Birthday', format: 'A stage performance', guests: 'More than 300', audience: 'Primary school', feeling: '<script>bad</script>', setting: 'Outdoors', privateData: 'must not persist' };
  assert.deepEqual(readDesignerAnswers(input), { occasion: 'Birthday', format: '', guests: '', audience: '', feeling: '', setting: 'Outdoors' });
  for (const value of [null, [], 'text', { occasion: 'unknown' }]) assert.equal(designerSummary(value), '');
});

test('validated summary retains festival format and maps school stage for recommendation suitability', () => {
  const answers = readDesignerAnswers({ occasion: 'School event', format: 'A classroom workshop', guests: '21–50', audience: 'Primary school', feeling: 'Leave everyone speechless', setting: 'Indoors' });
  assert.equal(designerAudienceAge(answers), 9);
  assert.equal(designerSummary(answers), 'School event · A classroom workshop · 21–50 · Leave everyone speechless · Primary school · Indoors');
  assert.equal(designerAudienceAge({ ...answers, audience: 'Several school stages' }), null);
});

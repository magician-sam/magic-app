import test from 'node:test';
import assert from 'node:assert/strict';
import { designerOccasions, designerSteps, readDesignerAnswers, designerAudienceAge, designerSummary } from '../dist/event-designer.js';

test('birthday, school, festival and playground plans ask relevant questions', () => {
  const birthday = designerSteps('Birthday'), festival = designerSteps('Festival'), school = designerSteps('School event'), play = designerSteps('Playground visit');
  assert.equal(birthday.length, 6); assert.equal(festival.length, 6);
  assert.match(birthday.find(step => step.key === 'format').title, /birthday/);
  assert.match(birthday.find(step => step.key === 'audience').title, /birthday/);
  assert.match(festival.find(step => step.key === 'format').title, /festival/);
  assert.deepEqual(school.find(step => step.key === 'audience').choices.map(([, value]) => value), ['Preschool / kindergarten', 'Primary school', 'Secondary school', 'Several school stages']);
  assert.equal(play.find(step => step.key === 'format').choices[0][1], 'An individual play visit');
  assert.equal(play.find(step => step.key === 'setting').choices.some(([, value]) => value === 'Outdoors'), false);
  assert.equal(festival.find(step => step.key === 'guests').choices.some(([, value]) => value === 'More than 300'), true);
});

test('every occasion has a distinct opening brief and irrelevant formats are discarded', () => {
  const titles = new Set();
  for (const occasion of designerOccasions) {
    const steps = designerSteps(occasion), format = steps.find(step => step.key === 'format');
    assert.ok(format?.choices.length >= 3, occasion);
    titles.add(format.title);
    const answers = readDesignerAnswers({ occasion, format: format.choices[0][1] });
    assert.equal(answers.format, format.choices[0][1]);
    assert.ok(designerSummary(answers).includes(format.choices[0][1]));
  }
  assert.equal(titles.size, designerOccasions.length);
  assert.equal(readDesignerAnswers({ occasion: 'Birthday', format: 'A stage performance' }).format, '');
  assert.equal(readDesignerAnswers({ occasion: 'Festival', format: 'A children’s birthday' }).format, '');
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

test('family milestones keep ceremony and gathering preferences distinct from party plans', () => {
  const baptism = readDesignerAnswers({ occasion: 'Baptism', format: 'A gathering after the ceremony', guests: '21–50', feeling: 'Soft and elegant', audience: 'Family and friends of mixed ages', setting: 'A restaurant or reception venue' });
  assert.equal(designerAudienceAge(baptism), null);
  assert.match(designerSummary(baptism), /Baptism · A gathering after the ceremony/);
  assert.equal(readDesignerAnswers({ ...baptism, occasion: 'First Communion' }).format, '');
  assert.equal(readDesignerAnswers({ ...baptism, occasion: 'Birthday' }).feeling, '');
  const communion = readDesignerAnswers({ occasion: 'First Communion', format: 'A shared celebration for several families', audience: 'Many children 6–12', setting: 'A garden celebration' });
  assert.equal(designerAudienceAge(communion), 9);
  assert.ok(designerSummary(communion).includes('A shared celebration for several families'));
});

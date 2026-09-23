const test = require('node:test');
const assert = require('node:assert/strict');
const { HOME_URL, navigationKind } = require('../navigation.cjs');

test('only the production app stays inside the desktop window', () => {
  assert.equal(navigationKind(HOME_URL), 'app');
  assert.equal(navigationKind('https://magic-app-gray.vercel.app/b/magic-by-sam'), 'app');
  assert.equal(navigationKind('https://magic-app-gray.vercel.app.evil.example/manage'), 'external');
  assert.equal(navigationKind('https://wa.me/12345'), 'external');
  assert.equal(navigationKind('http://magic-app-gray.vercel.app/manage'), 'blocked');
  assert.equal(navigationKind('file:///C:/Windows/system.ini'), 'blocked');
  assert.equal(navigationKind('javascript:alert(1)'), 'blocked');
  assert.equal(navigationKind('invalid url'), 'blocked');
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { extractDkpId, normalizeDigikalaUrl, parseTomanPrice } = require('../helpers/parse');

test('extractDkpId: pulls dkp id from product url', () => {
  assert.strictEqual(extractDkpId('https://www.digikala.com/product/dkp-13715199/foo-bar/'), '13715199');
});
test('extractDkpId: rejects non-digikala host', () => {
  assert.strictEqual(extractDkpId('https://evil.com/product/dkp-1/'), null);
  assert.strictEqual(extractDkpId('https://digikala.com.evil.com/product/dkp-2/'), null);
});
test('extractDkpId: no dkp segment returns null', () => {
  assert.strictEqual(extractDkpId('https://www.digikala.com/search/'), null);
  assert.strictEqual(extractDkpId(''), null);
});
test('normalizeDigikalaUrl: strips query/hash, keeps path', () => {
  assert.strictEqual(
    normalizeDigikalaUrl('https://www.digikala.com/product/dkp-5/x/?spm=a#z'),
    'https://www.digikala.com/product/dkp-5/x/'
  );
});
test('normalizeDigikalaUrl: rejects non-digikala and invalid', () => {
  assert.strictEqual(normalizeDigikalaUrl('https://evil.com/x'), null);
  assert.strictEqual(normalizeDigikalaUrl('not a url'), null);
});
test('parseTomanPrice: Persian digits with separators and label', () => {
  assert.strictEqual(parseTomanPrice('۶۴۰,۰۰۰ تومان'), 640000);
});
test('parseTomanPrice: ASCII digits', () => {
  assert.strictEqual(parseTomanPrice('640000'), 640000);
});
test('parseTomanPrice: no digits returns null', () => {
  assert.strictEqual(parseTomanPrice('ناموجود'), null);
  assert.strictEqual(parseTomanPrice(''), null);
  assert.strictEqual(parseTomanPrice(null), null);
});

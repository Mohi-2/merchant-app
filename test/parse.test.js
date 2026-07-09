'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parsePriceRange, normalizeAlibabaUrl, extractAlibabaId } = require('../helpers/parse');

test('parsePriceRange: single price', () => {
  assert.deepStrictEqual(parsePriceRange('¥12.5'), { min: 12.5, max: 12.5 });
});

test('parsePriceRange: range with fullwidth yen and dash', () => {
  assert.deepStrictEqual(parsePriceRange('￥12.5-15.8'), { min: 12.5, max: 15.8 });
});

test('parsePriceRange: comma thousands and spaced hyphen', () => {
  assert.deepStrictEqual(parsePriceRange('¥1,234.00 - ¥2,000'), { min: 1234, max: 2000 });
});

test('parsePriceRange: en-dash and tilde variants', () => {
  assert.deepStrictEqual(parsePriceRange('¥3–5'), { min: 3, max: 5 });
  assert.deepStrictEqual(parsePriceRange('¥3~5'), { min: 3, max: 5 });
});

test('parsePriceRange: swapped order still returns min<=max', () => {
  assert.deepStrictEqual(parsePriceRange('¥15.8-12.5'), { min: 12.5, max: 15.8 });
});

test('parsePriceRange: garbage returns null', () => {
  assert.strictEqual(parsePriceRange(''), null);
  assert.strictEqual(parsePriceRange(null), null);
  assert.strictEqual(parsePriceRange('contact supplier'), null);
});

test('normalizeAlibabaUrl: strips query and hash', () => {
  assert.strictEqual(
    normalizeAlibabaUrl('https://www.alibaba.com/product-detail/Pot_123456789.html?spm=a2700&s=p#anchor'),
    'https://www.alibaba.com/product-detail/Pot_123456789.html'
  );
});

test('normalizeAlibabaUrl: resolves relative href', () => {
  assert.strictEqual(
    normalizeAlibabaUrl('/product-detail/Pot_123.html?x=1'),
    'https://www.alibaba.com/product-detail/Pot_123.html'
  );
});

test('normalizeAlibabaUrl: invalid input returns null', () => {
  assert.strictEqual(normalizeAlibabaUrl(''), null);
  assert.strictEqual(normalizeAlibabaUrl(null), null);
});

test('extractAlibabaId: trailing _digits.html', () => {
  assert.strictEqual(extractAlibabaId('https://www.alibaba.com/product-detail/Pot_123456789.html'), '123456789');
  assert.strictEqual(extractAlibabaId('https://www.alibaba.com/showroom/pots.html'), null);
});

'use strict';
process.env.CIM_DB_PATH = ':memory:';
const { test } = require('node:test');
const assert = require('node:assert');
const db = require('../helpers/db');
const { captureItems, listItems, listPrices, addProductFromItem, setStatus } = require('../helpers/crawl');

const ITEM = {
  url: 'https://www.alibaba.com/product-detail/Pot_111.html?spm=x',
  title: 'Stainless Steel Pot',
  image_url: 'https://img.example/p.jpg',
  price_raw: '¥12.5-15.8',
  moq: '2 pieces (Min. order)',
  seller_name: 'Yiwu Kitchen Co',
};

test('capture creates item + first price row, normalized url', () => {
  const r = captureItems([ITEM], 'SEARCH');
  assert.deepStrictEqual(r, { created: 1, updated: 0, total: 1 });
  const rows = listItems('NEW');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].url, 'https://www.alibaba.com/product-detail/Pot_111.html');
  assert.strictEqual(rows[0].alibaba_id, '111');
  assert.strictEqual(rows[0].price_min_cny, 12.5);
  assert.strictEqual(rows[0].price_max_cny, 15.8);
  assert.strictEqual(listPrices(rows[0].id).length, 1);
});

test('re-capture same url+price updates in place, no new price row', () => {
  const r = captureItems([ITEM], 'SEARCH');
  assert.deepStrictEqual(r, { created: 0, updated: 1, total: 1 });
  const rows = listItems('NEW');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(listPrices(rows[0].id).length, 1);
});

test('re-capture with changed price appends history row', () => {
  captureItems([{ ...ITEM, price_raw: '¥13-16' }], 'PRODUCT');
  const rows = listItems('NEW');
  assert.strictEqual(rows[0].price_min_cny, 13);
  assert.strictEqual(listPrices(rows[0].id).length, 2);
});

test('items without title or url are skipped silently', () => {
  const r = captureItems([{ url: '', title: 'x' }, { url: 'https://www.alibaba.com/p_1.html', title: '' }], 'SEARCH');
  assert.deepStrictEqual(r, { created: 0, updated: 0, total: 0 });
});

test('add-product creates product, links item, sets ADDED', () => {
  const item = listItems('NEW')[0];
  const productId = addProductFromItem(item.id, { name: 'قابلمه استیل', category_id: null, unit_label: 'عدد' });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  assert.strictEqual(product.alibaba_link, item.url);
  assert.strictEqual(product.image_url, item.image_url);
  const after = listItems('ADDED')[0];
  assert.strictEqual(after.id, item.id);
  assert.strictEqual(after.product_id, productId);
});

test('capture after ADDED keeps status, still appends price history', () => {
  captureItems([{ ...ITEM, price_raw: '¥14' }], 'SEARCH');
  const rows = listItems('ADDED');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(listPrices(rows[0].id).length, 3);
});

test('setStatus toggles IGNORED/NEW and rejects unknown id', () => {
  captureItems([{ ...ITEM, url: 'https://www.alibaba.com/product-detail/Pan_222.html', title: 'Pan' }], 'SEARCH');
  const pan = listItems('NEW').find(r => r.title === 'Pan');
  assert.strictEqual(setStatus(pan.id, 'IGNORED'), true);
  assert.strictEqual(listItems('IGNORED').length, 1);
  assert.strictEqual(setStatus(pan.id, 'NEW'), true);
  assert.strictEqual(setStatus(999999, 'IGNORED'), false);
});

test('addProductFromItem throws 404 for missing item', () => {
  assert.throws(() => addProductFromItem(999999, { name: 'x', unit_label: 'y' }), e => e.status === 404);
});

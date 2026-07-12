'use strict';
process.env.CIM_DB_PATH = ':memory:';
const { test } = require('node:test');
const assert = require('node:assert');
const db = require('../helpers/db');
const { captureOwnItems, linkOwnItem, listOwnItems, listOwnPrices } = require('../helpers/digikala');

const OWN = { digikala_id: '555', title: 'محصول من', price_raw: '۴۵۰,۰۰۰', stock: '12', sales_count: '30' };

test('captureOwnItems: bulk create with first history row', () => {
  const r = captureOwnItems([OWN, { digikala_id: '556', title: 'دومی', price_raw: '۱۰۰,۰۰۰', stock: '5' }]);
  assert.deepStrictEqual(r, { created: 2, updated: 0, total: 2 });
  const rows = listOwnItems();
  const a = rows.find(x => x.digikala_id === '555');
  assert.strictEqual(a.price, 450000);
  assert.strictEqual(a.stock, 12);
  assert.strictEqual(a.sales_count, 30);
  assert.strictEqual(listOwnPrices(a.id).length, 1);
});

test('captureOwnItems: same price+stock re-capture adds no history row', () => {
  const r = captureOwnItems([OWN]);
  assert.deepStrictEqual(r, { created: 0, updated: 1, total: 1 });
  const a = listOwnItems().find(x => x.digikala_id === '555');
  assert.strictEqual(listOwnPrices(a.id).length, 1);
});

test('captureOwnItems: changed price appends history row', () => {
  captureOwnItems([{ ...OWN, price_raw: '۵۰۰,۰۰۰' }]);
  const a = listOwnItems().find(x => x.digikala_id === '555');
  assert.strictEqual(a.price, 500000);
  assert.strictEqual(listOwnPrices(a.id).length, 2);
});

test('captureOwnItems: malformed entries skipped, batch survives', () => {
  const r = captureOwnItems([null, { title: 'no id' }, { digikala_id: '777', title: 'خوب', price_raw: '۹۰,۰۰۰' }]);
  assert.deepStrictEqual(r, { created: 1, updated: 0, total: 1 });
});

test('linkOwnItem: attaches product id, rejects unknown item', () => {
  const pid = db.prepare("INSERT INTO products (name, unit_label) VALUES ('p','عدد')").run().lastInsertRowid;
  const a = listOwnItems().find(x => x.digikala_id === '555');
  assert.strictEqual(linkOwnItem(a.id, pid), true);
  assert.strictEqual(listOwnItems().find(x => x.id === a.id).product_id, pid);
  assert.strictEqual(linkOwnItem(999999, pid), false);
});

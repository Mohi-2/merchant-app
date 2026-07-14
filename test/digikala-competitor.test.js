'use strict';
process.env.CIM_DB_PATH = ':memory:';
const { test } = require('node:test');
const assert = require('node:assert');
const db = require('../helpers/db');
const {
  captureCompetitor, refreshCompetitor, setCompetitorStatus,
  listCompetitors, listCompetitorPrices,
} = require('../helpers/digikala');

const RAW = {
  url: 'https://www.digikala.com/product/dkp-13715199/spoon/?spm=x',
  title: 'قاشق چای خوری',
  price_raw: '۶۴۰,۰۰۰ تومان',
  seller_name: 'رقیب الف',
};

test('captureCompetitor: creates item + first price row, normalized url + dkp id', () => {
  const r = captureCompetitor(RAW);
  assert.strictEqual(r.created, true);
  const rows = listCompetitors('ACTIVE');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].url, 'https://www.digikala.com/product/dkp-13715199/spoon/');
  assert.strictEqual(rows[0].digikala_id, '13715199');
  assert.strictEqual(rows[0].price, 640000);
  assert.strictEqual(listCompetitorPrices(rows[0].id).length, 1);
});

test('captureCompetitor: same price re-capture adds no history row', () => {
  const r = captureCompetitor(RAW);
  assert.strictEqual(r.created, false);
  assert.strictEqual(listCompetitorPrices(r.id).length, 1);
});

test('captureCompetitor: changed price appends history row', () => {
  const r = captureCompetitor({ ...RAW, price_raw: '۷۰۰,۰۰۰' });
  assert.strictEqual(listCompetitors('ACTIVE')[0].price, 700000);
  assert.strictEqual(listCompetitorPrices(r.id).length, 2);
});

test('captureCompetitor: missing title or non-digikala url is skipped', () => {
  assert.strictEqual(captureCompetitor({ url: RAW.url, title: '' }), null);
  assert.strictEqual(captureCompetitor({ url: 'https://evil.com/x', title: 'y' }), null);
});

test('refreshCompetitor: price change from API appends history, updates seller', async () => {
  const id = listCompetitors('ACTIVE')[0].id;
  const before = listCompetitorPrices(id).length;
  const stub = async () => ({ title: 'قاشق چای خوری', status: 'marketable', priceToman: 750000, sellerName: 'رقیب ب' });
  const item = await refreshCompetitor(id, stub);
  assert.strictEqual(item.price, 750000);
  assert.strictEqual(item.seller_name, 'رقیب ب');
  assert.strictEqual(listCompetitorPrices(id).length, before + 1);
});

test('refreshCompetitor: out_of_stock keeps price null, no crash', async () => {
  const id = listCompetitors('ACTIVE')[0].id;
  const stub = async () => ({ title: 'x', status: 'out_of_stock', priceToman: null, sellerName: null });
  const item = await refreshCompetitor(id, stub);
  assert.strictEqual(item.price, null);
});

test('refreshCompetitor: unknown id throws 404', async () => {
  await assert.rejects(refreshCompetitor(999999, async () => ({})), e => e.status === 404);
});

test('refreshCompetitor: backfills a null digikala_id from the stored url', async () => {
  const info = db.prepare(
    'INSERT INTO digikala_competitor_items (url, digikala_id, title, price) VALUES (?, NULL, ?, ?)'
  ).run('https://www.digikala.com/product/dkp-42/x/', 'بدون شناسه', 1000);
  const stub = async () => ({ title: 'بدون شناسه', status: 'marketable', priceToman: 2000, sellerName: 'س' });
  const item = await refreshCompetitor(info.lastInsertRowid, stub);
  assert.strictEqual(item.digikala_id, '42');
});

test('setCompetitorStatus: toggles IGNORED/ACTIVE, rejects unknown id', () => {
  const id = listCompetitors('ACTIVE')[0].id;
  assert.strictEqual(setCompetitorStatus(id, 'IGNORED'), true);
  assert.strictEqual(listCompetitors('IGNORED').length, 1);
  assert.strictEqual(setCompetitorStatus(id, 'ACTIVE'), true);
  assert.strictEqual(setCompetitorStatus(999999, 'IGNORED'), false);
});

test('setCompetitorStatus: rejects an invalid status string, leaves row unchanged', () => {
  const id = listCompetitors('ACTIVE')[0].id;
  assert.strictEqual(setCompetitorStatus(id, 'BOGUS'), false);
  assert.strictEqual(listCompetitors('ACTIVE').some(r => r.id === id), true);
});

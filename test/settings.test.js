'use strict';
process.env.CIM_DB_PATH = ':memory:';
const { test } = require('node:test');
const assert = require('node:assert');
const { getSetting, setSetting, getOrCreateCrawlToken } = require('../helpers/settings');

test('set/get roundtrip and upsert', () => {
  setSetting('foo', 'bar');
  assert.strictEqual(getSetting('foo'), 'bar');
  setSetting('foo', 'baz');
  assert.strictEqual(getSetting('foo'), 'baz');
});

test('crawl token is created once and stays stable', () => {
  const t1 = getOrCreateCrawlToken();
  const t2 = getOrCreateCrawlToken();
  assert.match(t1, /^[0-9a-f]{32}$/);
  assert.strictEqual(t1, t2);
});

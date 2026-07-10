'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildBookmarklet } = require('../services/bookmarklet');

test('bookmarklet embeds base url and token, is a javascript: URI', () => {
  const bm = buildBookmarklet('http://localhost:3003', 'abc123');
  assert.ok(bm.startsWith('javascript:'));
  const decoded = decodeURIComponent(bm.slice('javascript:'.length));
  assert.ok(decoded.includes('"http://localhost:3003"'));
  assert.ok(decoded.includes('"abc123"'));
  assert.ok(decoded.includes('/api/crawl/capture'));
  assert.ok(decoded.includes('/product-detail/'));
});

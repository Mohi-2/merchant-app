'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildDigikalaCompetitorBookmarklet, buildDigikalaOwnBookmarklet } = require('../services/bookmarklet');

test('competitor bookmarklet: javascript: URI embedding base, token, endpoint', () => {
  const b = buildDigikalaCompetitorBookmarklet('https://app.example', 'tok123');
  assert.ok(b.startsWith('javascript:'));
  const decoded = decodeURIComponent(b.slice('javascript:'.length));
  assert.ok(decoded.includes('https://app.example'));
  assert.ok(decoded.includes('tok123'));
  assert.ok(decoded.includes('/api/digikala/competitor/capture'));
  assert.doesNotThrow(() => new Function(decoded)); // valid JS
});

test('own bookmarklet: javascript: URI hitting own capture endpoint', () => {
  const b = buildDigikalaOwnBookmarklet('https://app.example', 'tok123');
  assert.ok(b.startsWith('javascript:'));
  const decoded = decodeURIComponent(b.slice('javascript:'.length));
  assert.ok(decoded.includes('/api/digikala/own/capture'));
  assert.ok(decoded.includes('tok123'));
  assert.doesNotThrow(() => new Function(decoded));
});

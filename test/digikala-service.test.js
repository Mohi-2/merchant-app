'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { fetchProduct } = require('../services/digikala');

function fakeFetch(body, ok = true, status = 200) {
  return async () => ({ ok, status, json: async () => body });
}

test('fetchProduct: parses marketable product, Rial->Toman', async () => {
  const body = { data: { product: {
    title_fa: 'قاشق چای خوری',
    status: 'marketable',
    default_variant: { price: { selling_price: 6400000 }, seller: { title: 'نلین گالری' } },
  } } };
  const r = await fetchProduct('13715199', fakeFetch(body));
  assert.strictEqual(r.title, 'قاشق چای خوری');
  assert.strictEqual(r.status, 'marketable');
  assert.strictEqual(r.priceToman, 640000);
  assert.strictEqual(r.sellerName, 'نلین گالری');
});

test('fetchProduct: out_of_stock has null price and seller', async () => {
  const body = { data: { product: { title_fa: 'x', status: 'out_of_stock' } } };
  const r = await fetchProduct('2', fakeFetch(body));
  assert.strictEqual(r.priceToman, null);
  assert.strictEqual(r.sellerName, null);
});

test('fetchProduct: non-200 throws UPSTREAM_ERROR', async () => {
  await assert.rejects(fetchProduct('2', fakeFetch({}, false, 503)), e => e.code === 'UPSTREAM_ERROR');
});

test('fetchProduct: missing data throws PARSE_ERROR', async () => {
  await assert.rejects(fetchProduct('2', fakeFetch({ nope: 1 })), e => e.code === 'PARSE_ERROR');
});

test('fetchProduct: network error throws UPSTREAM_ERROR', async () => {
  const badFetch = async () => { throw new Error('net down'); };
  await assert.rejects(fetchProduct('2', badFetch), e => e.code === 'UPSTREAM_ERROR');
});

test('fetchProduct: malformed 200 body throws PARSE_ERROR', async () => {
  const badFetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } });
  await assert.rejects(fetchProduct('2', badFetch), e => e.code === 'PARSE_ERROR');
});

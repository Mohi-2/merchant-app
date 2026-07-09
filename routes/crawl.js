'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../helpers/middleware');
const { getOrCreateCrawlToken } = require('../helpers/settings');
const { buildBookmarklet } = require('../services/bookmarklet');
const { captureItems, listItems, listPrices, addProductFromItem, setStatus } = require('../helpers/crawl');

const ALIBABA_ORIGIN = /^https?:\/\/([a-z0-9-]+\.)*alibaba\.com$/i;

// CORS only on /capture: the bookmarklet posts cross-origin from alibaba.com,
// authenticated by the crawl token (session cookies are not sent cross-site).
router.use('/capture', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALIBABA_ORIGIN.test(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

router.post('/capture', (req, res) => {
  const { token, page_type, items } = req.body || {};
  if (!token || token !== getOrCreateCrawlToken()) {
    return res.status(401).json({ error: 'توکن کپچر نامعتبر است' });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'هیچ آیتمی ارسال نشده' });
  }
  res.json({ ok: true, ...captureItems(items, page_type) });
});

router.get('/bookmarklet', requireAuth, (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({ bookmarklet: buildBookmarklet(base, getOrCreateCrawlToken()) });
});

router.get('/items', requireAuth, (req, res) => {
  res.json(listItems(req.query.status));
});

router.get('/items/:id/prices', requireAuth, (req, res) => {
  res.json(listPrices(req.params.id));
});

router.post('/items/:id/add-product', requireAuth, (req, res) => {
  const { name, category_id, unit_label } = req.body || {};
  if (!name || !unit_label) {
    return res.status(400).json({ error: 'نام و واحد شمارش الزامی است' });
  }
  try {
    const productId = addProductFromItem(req.params.id, { name, category_id, unit_label });
    res.status(201).json({ product_id: productId });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'خطا در افزودن محصول' });
  }
});

router.post('/items/:id/ignore', requireAuth, (req, res) => {
  if (!setStatus(req.params.id, 'IGNORED')) return res.status(404).json({ error: 'آیتم یافت نشد' });
  res.json({ ok: true });
});

router.post('/items/:id/unignore', requireAuth, (req, res) => {
  if (!setStatus(req.params.id, 'NEW')) return res.status(404).json({ error: 'آیتم یافت نشد' });
  res.json({ ok: true });
});

module.exports = router;

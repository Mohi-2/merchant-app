'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../helpers/middleware');
const { getOrCreateCrawlToken } = require('../helpers/settings');
const { buildDigikalaCompetitorBookmarklet, buildDigikalaOwnBookmarklet } = require('../services/bookmarklet');
const {
  captureCompetitor, refreshCompetitor, setCompetitorStatus, listCompetitors, listCompetitorPrices,
  captureOwnItems, linkOwnItem, listOwnItems, listOwnPrices,
} = require('../helpers/digikala');

const DIGIKALA_ORIGIN = /^https?:\/\/([a-z0-9-]+\.)*digikala\.com$/i;

// CORS on the two /capture endpoints: bookmarklets post cross-origin from
// digikala.com, authenticated by the crawl token (cookies aren't sent cross-site).
function corsCapture(req, res, next) {
  const origin = req.headers.origin;
  if (origin && DIGIKALA_ORIGIN.test(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}
router.use('/competitor/capture', corsCapture);
router.use('/own/capture', corsCapture);

function checkToken(req, res) {
  const { token } = req.body || {};
  if (!token || token !== getOrCreateCrawlToken()) {
    res.status(401).json({ error: 'توکن کپچر نامعتبر است' });
    return false;
  }
  return true;
}

// ---- Competitor ----
router.post('/competitor/capture', (req, res) => {
  if (!checkToken(req, res)) return;
  const { item } = req.body || {};
  if (!item || typeof item !== 'object') return res.status(400).json({ error: 'هیچ آیتمی ارسال نشده' });
  try {
    const r = captureCompetitor(item);
    if (!r) return res.status(400).json({ error: 'آیتم نامعتبر (لینک یا عنوان)' });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ error: 'خطا در ذخیره آیتم' });
  }
});

router.post('/competitor/:id/refresh', requireAuth, async (req, res) => {
  try {
    const item = await refreshCompetitor(Number(req.params.id));
    res.json(item);
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: e.message });
    if (e.code === 'UPSTREAM_ERROR' || e.code === 'PARSE_ERROR') return res.status(502).json({ error: 'خطا در دریافت از دیجی‌کالا' });
    res.status(e.status || 500).json({ error: e.status ? e.message : 'خطا در بروزرسانی' });
  }
});

router.patch('/competitor/:id/status', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!setCompetitorStatus(Number(req.params.id), status)) {
    return res.status(400).json({ error: 'وضعیت یا آیتم نامعتبر است' });
  }
  res.json({ ok: true });
});

router.get('/competitor', requireAuth, (req, res) => res.json(listCompetitors(req.query.status)));
router.get('/competitor/:id/prices', requireAuth, (req, res) => res.json(listCompetitorPrices(Number(req.params.id))));

// ---- Own ----
router.post('/own/capture', (req, res) => {
  if (!checkToken(req, res)) return;
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'هیچ آیتمی ارسال نشده' });
  try {
    res.json({ ok: true, ...captureOwnItems(items) });
  } catch (e) {
    res.status(500).json({ error: 'خطا در ذخیره آیتم‌ها' });
  }
});

router.patch('/own/:id/link', requireAuth, (req, res) => {
  const { product_id } = req.body || {};
  let pid = null;
  if (product_id != null && product_id !== '') {
    pid = Number(product_id);
    if (!Number.isFinite(pid)) return res.status(400).json({ error: 'شناسه محصول نامعتبر است' });
  }
  if (!linkOwnItem(Number(req.params.id), pid)) {
    return res.status(404).json({ error: 'آیتم یافت نشد' });
  }
  res.json({ ok: true });
});

router.get('/own', requireAuth, (req, res) => res.json(listOwnItems()));
router.get('/own/:id/prices', requireAuth, (req, res) => res.json(listOwnPrices(Number(req.params.id))));

// ---- Bookmarklets ----
router.get('/bookmarklets', requireAuth, (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const token = getOrCreateCrawlToken();
  res.json({
    competitor: buildDigikalaCompetitorBookmarklet(base, token),
    own: buildDigikalaOwnBookmarklet(base, token),
  });
});

module.exports = router;

'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../helpers/middleware');
const { fetchLatestRates } = require('../services/navasan');
const { getLatestRate, saveRate } = require('../helpers/exchangeRates');

router.get('/latest', requireAuth, (_req, res) => {
  const rate = getLatestRate();
  if (!rate) return res.status(404).json({ error: 'هنوز نرخ ارزی ثبت نشده است' });
  res.json(rate);
});

router.post('/refresh', requireAuth, async (_req, res) => {
  try {
    const rates = await fetchLatestRates();
    const saved = saveRate(rates);
    res.json(saved);
  } catch (e) {
    if (e.code === 'MISSING_TOKEN') return res.status(400).json({ error: e.message });
    res.status(502).json({ error: e.message || 'navasan.tech در دسترس نیست' });
  }
});

module.exports = router;

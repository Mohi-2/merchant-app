'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../helpers/middleware');
const { OUT_REASONS, listStock, listMovements, createOutMovement } = require('../helpers/inventory');

router.get('/stock', requireAuth, (_req, res) => {
  res.json(listStock());
});

router.get('/movements', requireAuth, (req, res) => {
  res.json(listMovements(req.query.product_id));
});

router.post('/movements', requireAuth, (req, res) => {
  const { product_id, quantity, reason, date, note } = req.body || {};
  if (!product_id || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'کالا و تعداد الزامی است' });
  }
  if (!OUT_REASONS.includes(reason)) {
    return res.status(400).json({ error: 'دلیل خروج نامعتبر است' });
  }
  if (!date) {
    return res.status(400).json({ error: 'تاریخ الزامی است' });
  }
  try {
    const movement = createOutMovement({ product_id, quantity, reason, date, note }, req.session.userId);
    res.status(201).json(movement);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'خطا در ثبت خروج' });
  }
});

module.exports = router;

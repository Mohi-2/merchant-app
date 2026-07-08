'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../helpers/middleware');
const { listPurchases, createPurchase } = require('../helpers/purchases');

router.get('/', requireAuth, (req, res) => {
  res.json(listPurchases(req.query.product_id));
});

router.post('/', requireAuth, (req, res) => {
  const { product_id, quantity, unit_price_cny, exchange_rate, supplier_name, purchase_date, note } = req.body || {};
  if (!product_id || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'کالا و تعداد الزامی است' });
  }
  if (unit_price_cny == null || unit_price_cny < 0) {
    return res.status(400).json({ error: 'قیمت واحد به یوان الزامی است' });
  }
  if (!exchange_rate || exchange_rate <= 0) {
    return res.status(400).json({ error: 'نرخ ارز الزامی است' });
  }
  if (!supplier_name || !purchase_date) {
    return res.status(400).json({ error: 'نام تامین‌کننده و تاریخ خرید الزامی است' });
  }
  try {
    const purchase = createPurchase(
      { product_id, quantity, unit_price_cny, exchange_rate, supplier_name, purchase_date, note },
      req.session.userId
    );
    res.status(201).json(purchase);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'خطا در ثبت خرید' });
  }
});

module.exports = router;

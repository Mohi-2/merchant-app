'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../helpers/middleware');
const { listProducts, getProduct, createProduct, updateProduct, deleteProduct } = require('../helpers/products');

router.get('/', requireAuth, (req, res) => {
  res.json(listProducts(req.query.category_id));
});

router.get('/:id', requireAuth, (req, res) => {
  const product = getProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'کالا یافت نشد' });
  res.json(product);
});

router.post('/', requireAuth, (req, res) => {
  const { name, category_id, unit_label, alibaba_link, image_url } = req.body || {};
  if (!name || !unit_label) {
    return res.status(400).json({ error: 'نام و واحد شمارش الزامی است' });
  }
  res.status(201).json(createProduct({ name, category_id, unit_label, alibaba_link, image_url }));
});

router.patch('/:id', requireAuth, (req, res) => {
  const { name, category_id, unit_label, alibaba_link, image_url } = req.body || {};
  if (!name || !unit_label) {
    return res.status(400).json({ error: 'نام و واحد شمارش الزامی است' });
  }
  const updated = updateProduct(req.params.id, { name, category_id, unit_label, alibaba_link, image_url });
  if (!updated) return res.status(404).json({ error: 'کالا یافت نشد' });
  res.json(updated);
});

router.delete('/:id', requireAuth, (req, res) => {
  try {
    const ok = deleteProduct(req.params.id);
    if (!ok) return res.status(404).json({ error: 'کالا یافت نشد' });
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message).includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'این کالا در خرید یا موجودی استفاده شده و قابل حذف نیست' });
    }
    throw e;
  }
});

module.exports = router;

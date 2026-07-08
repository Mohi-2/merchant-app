'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../helpers/middleware');
const { listCategories, createCategory, renameCategory, deleteCategory } = require('../helpers/categories');

router.get('/', requireAuth, (_req, res) => {
  res.json(listCategories());
});

router.post('/', requireAuth, (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'نام دسته‌بندی الزامی است' });
  try {
    res.status(201).json(createCategory(name));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'این دسته‌بندی قبلاً ثبت شده است' });
    }
    throw e;
  }
});

router.patch('/:id', requireAuth, (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'نام دسته‌بندی الزامی است' });
  const updated = renameCategory(req.params.id, name);
  if (!updated) return res.status(404).json({ error: 'دسته‌بندی یافت نشد' });
  res.json(updated);
});

router.delete('/:id', requireAuth, (req, res) => {
  const ok = deleteCategory(req.params.id);
  if (!ok) return res.status(404).json({ error: 'دسته‌بندی یافت نشد' });
  res.json({ ok: true });
});

module.exports = router;

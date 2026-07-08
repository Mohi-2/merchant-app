'use strict';
const express = require('express');
const router = express.Router();
const { listUsers, findUserByUsername, createUser } = require('../helpers/users');
const { requireAuth } = require('../helpers/middleware');

router.get('/', requireAuth, (_req, res) => {
  res.json(listUsers());
});

router.post('/', requireAuth, (req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'نام کاربری، رمز عبور و نام الزامی است' });
  }
  if (findUserByUsername(username)) {
    return res.status(409).json({ error: 'این نام کاربری قبلاً استفاده شده است' });
  }
  const user = createUser({ username, password, name });
  res.status(201).json(user);
});

module.exports = router;

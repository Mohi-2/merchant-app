'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { findUserByUsername, findUserById } = require('../helpers/users');
const { requireAuth } = require('../helpers/middleware');

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
  }
  const user = findUserByUsername(username);
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.name = user.name;
  res.json({ ok: true, user: { id: user.id, username: user.username, name: user.name } });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const user = findUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'ابتدا وارد شوید' });
  res.json({ user });
});

module.exports = router;

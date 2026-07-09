'use strict';
require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');
const { initDefaultAdmin } = require('./helpers/users');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
if (!process.env.SESSION_SECRET) {
  console.warn('[⚠️ Security] SESSION_SECRET not set — using insecure default (dev only)');
}
const SESSION_SECRET = process.env.SESSION_SECRET || 'cim-secret-change-me-in-production';

app.use(express.json({ limit: '5mb' }));
app.use(cookieSession({
  name: 'cim_session',
  keys: [SESSION_SECRET],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/exchange-rate', require('./routes/exchangeRate'));
app.use('/api/crawl', require('./routes/crawl'));

initDefaultAdmin();

app.listen(PORT, () => {
  console.log(`China Import Manager running on http://localhost:${PORT}`);
});

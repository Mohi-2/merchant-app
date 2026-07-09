'use strict';
const crypto = require('crypto');
const db = require('./db');

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

function getOrCreateCrawlToken() {
  let token = getSetting('crawl_token');
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    setSetting('crawl_token', token);
  }
  return token;
}

module.exports = { getSetting, setSetting, getOrCreateCrawlToken };

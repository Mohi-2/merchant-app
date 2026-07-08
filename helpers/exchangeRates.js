'use strict';
const db = require('./db');

function getLatestRate() {
  return db.prepare('SELECT * FROM exchange_rates ORDER BY id DESC LIMIT 1').get() || null;
}

function saveRate({ cnyToIrr, usdToIrr }) {
  const info = db.prepare(
    'INSERT INTO exchange_rates (cny_to_irr, usd_to_irr) VALUES (?, ?)'
  ).run(cnyToIrr, usdToIrr);
  return db.prepare('SELECT * FROM exchange_rates WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = { getLatestRate, saveRate };

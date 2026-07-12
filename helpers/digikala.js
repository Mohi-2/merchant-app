'use strict';
const db = require('./db');
const { extractDkpId, normalizeDigikalaUrl, parseTomanPrice } = require('./parse');
const { fetchProduct } = require('../services/digikala');

const cap = (v, n) => (v == null ? null : String(v).slice(0, n) || null);

// ---- Competitor ----
const compByUrl = db.prepare('SELECT * FROM digikala_competitor_items WHERE url = ?');
const compById = db.prepare('SELECT * FROM digikala_competitor_items WHERE id = ?');
const compInsert = db.prepare(`
  INSERT INTO digikala_competitor_items (url, digikala_id, title, seller_name, price)
  VALUES (@url, @digikala_id, @title, @seller_name, @price)
`);
const compUpdate = db.prepare(`
  UPDATE digikala_competitor_items
  SET title = @title, seller_name = @seller_name, price = @price, updated_at = datetime('now')
  WHERE id = @id
`);
const compLatestPrice = db.prepare('SELECT * FROM digikala_competitor_price_history WHERE item_id = ? ORDER BY id DESC LIMIT 1');
const compInsertPrice = db.prepare('INSERT INTO digikala_competitor_price_history (item_id, price) VALUES (?, ?)');

// Insert a history row only when the price actually changed (append-only, change-only).
function recordCompetitorPrice(itemId, price) {
  if (price == null) return;
  const last = compLatestPrice.get(itemId);
  if (!last || last.price !== price) compInsertPrice.run(itemId, price);
}

const captureCompetitor = db.transaction((raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const url = normalizeDigikalaUrl(raw.url);
  const title = String(raw.title || '').trim().slice(0, 300);
  if (!url || !title) return null;
  const price = parseTomanPrice(raw.price_raw);
  const fields = { title, seller_name: cap(raw.seller_name, 200), price };
  const existing = compByUrl.get(url);
  if (existing) {
    compUpdate.run({ ...fields, price: price != null ? price : existing.price, id: existing.id });
    recordCompetitorPrice(existing.id, price);
    return { id: existing.id, created: false };
  }
  const info = compInsert.run({ ...fields, url, digikala_id: extractDkpId(url) });
  recordCompetitorPrice(info.lastInsertRowid, price);
  return { id: info.lastInsertRowid, created: true };
});

async function refreshCompetitor(id, fetchProductImpl = fetchProduct) {
  const item = compById.get(id);
  if (!item) {
    const err = new Error('آیتم یافت نشد');
    err.status = 404;
    throw err;
  }
  const dkp = item.digikala_id || extractDkpId(item.url);
  if (!dkp) {
    const err = new Error('شناسه محصول دیجی‌کالا یافت نشد');
    err.status = 400;
    throw err;
  }
  const data = await fetchProductImpl(dkp);
  const apply = db.transaction(() => {
    compUpdate.run({
      id,
      title: item.title,
      seller_name: cap(data.sellerName, 200),
      price: data.priceToman != null ? data.priceToman : item.price,
    });
    recordCompetitorPrice(id, data.priceToman);
    // out_of_stock: keep the last known price on the row, but reflect unavailability
    if (data.priceToman == null) db.prepare("UPDATE digikala_competitor_items SET price = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
  });
  apply();
  return compById.get(id);
}

function setCompetitorStatus(id, status) {
  if (status !== 'ACTIVE' && status !== 'IGNORED') return false;
  return db.prepare('UPDATE digikala_competitor_items SET status = ? WHERE id = ?').run(status, id).changes > 0;
}

function listCompetitors(status) {
  const base = `
    SELECT ci.*, (SELECT COUNT(*) FROM digikala_competitor_price_history h WHERE h.item_id = ci.id) AS price_count
    FROM digikala_competitor_items ci
  `;
  if (status) return db.prepare(base + ' WHERE ci.status = ? ORDER BY ci.updated_at DESC, ci.id DESC').all(status);
  return db.prepare(base + ' ORDER BY ci.updated_at DESC, ci.id DESC').all();
}

function listCompetitorPrices(id) {
  return db.prepare('SELECT * FROM digikala_competitor_price_history WHERE item_id = ? ORDER BY id DESC').all(id);
}

module.exports = {
  captureCompetitor, refreshCompetitor, setCompetitorStatus, listCompetitors, listCompetitorPrices,
};

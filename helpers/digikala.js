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
  SET title = @title, seller_name = @seller_name, price = @price, digikala_id = @digikala_id, updated_at = datetime('now')
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

// Backfills a null digikala_id from the stored url (e.g. an item captured before
// extractDkpId could resolve it) — cheap since it's just a regex match, not a fetch.
function resolveDkpId(item) {
  return item.digikala_id || extractDkpId(item.url);
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
    compUpdate.run({ ...fields, price: price != null ? price : existing.price, digikala_id: resolveDkpId(existing), id: existing.id });
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
  const dkp = resolveDkpId(item);
  if (!dkp) {
    const err = new Error('شناسه محصول دیجی‌کالا یافت نشد');
    err.status = 400;
    throw err;
  }
  const data = await fetchProductImpl(dkp);
  const apply = db.transaction(() => {
    // priceToman is null on out_of_stock — write it straight through (no
    // fallback to the old price) so a single UPDATE reflects current
    // unavailability instead of a stale price followed by a second write.
    compUpdate.run({
      id,
      title: item.title,
      seller_name: cap(data.sellerName, 200),
      price: data.priceToman,
      digikala_id: dkp,
    });
    recordCompetitorPrice(id, data.priceToman);
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

// ---- Own listings ----
const ownById = db.prepare('SELECT * FROM digikala_own_items WHERE id = ?');
const ownByDkp = db.prepare('SELECT * FROM digikala_own_items WHERE digikala_id = ?');
const ownInsert = db.prepare(`
  INSERT INTO digikala_own_items (digikala_id, title, price, stock, sales_count)
  VALUES (@digikala_id, @title, @price, @stock, @sales_count)
`);
const ownUpdate = db.prepare(`
  UPDATE digikala_own_items
  SET title = @title, price = @price, stock = @stock, sales_count = @sales_count, updated_at = datetime('now')
  WHERE id = @id
`);
const ownLatestPrice = db.prepare('SELECT * FROM digikala_own_price_history WHERE item_id = ? ORDER BY id DESC LIMIT 1');
const ownInsertPrice = db.prepare('INSERT INTO digikala_own_price_history (item_id, price, stock) VALUES (?, ?, ?)');

// stock/sales are plain integers; parseTomanPrice strips non-digits and returns
// null when there are none, which is exactly the behavior we want here too.
const toInt = (v) => parseTomanPrice(v);

// New history row when price OR stock changed (own listings keep last known price
// on the item row even when a scrape misses it — unlike competitors' out_of_stock).
function recordOwnPrice(itemId, price, stock) {
  const last = ownLatestPrice.get(itemId);
  if (!last || last.price !== price || last.stock !== stock) ownInsertPrice.run(itemId, price, stock);
}

const captureOwnItems = db.transaction((rawItems) => {
  let created = 0, updated = 0;
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const digikala_id = raw.digikala_id != null ? String(raw.digikala_id).trim() : '';
    const title = String(raw.title || '').trim().slice(0, 300);
    if (!digikala_id || !title) continue;
    const price = parseTomanPrice(raw.price_raw);
    const stock = toInt(raw.stock);
    const sales_count = toInt(raw.sales_count);
    const existing = ownByDkp.get(digikala_id);
    if (existing) {
      ownUpdate.run({
        id: existing.id, title,
        price: price != null ? price : existing.price,
        stock: stock != null ? stock : existing.stock,
        sales_count: sales_count != null ? sales_count : existing.sales_count,
      });
      recordOwnPrice(existing.id, price != null ? price : existing.price, stock != null ? stock : existing.stock);
      updated++;
    } else {
      const info = ownInsert.run({ digikala_id, title, price, stock, sales_count });
      recordOwnPrice(info.lastInsertRowid, price, stock);
      created++;
    }
  }
  return { created, updated, total: created + updated };
});

function linkOwnItem(id, productId) {
  if (!ownById.get(id)) return false;
  return db.prepare('UPDATE digikala_own_items SET product_id = ? WHERE id = ?').run(productId ?? null, id).changes > 0;
}

function listOwnItems() {
  return db.prepare(`
    SELECT oi.*, (SELECT COUNT(*) FROM digikala_own_price_history h WHERE h.item_id = oi.id) AS price_count
    FROM digikala_own_items oi ORDER BY oi.updated_at DESC, oi.id DESC
  `).all();
}

function listOwnPrices(id) {
  return db.prepare('SELECT * FROM digikala_own_price_history WHERE item_id = ? ORDER BY id DESC').all(id);
}

module.exports = {
  captureCompetitor, refreshCompetitor, setCompetitorStatus, listCompetitors, listCompetitorPrices,
  captureOwnItems, linkOwnItem, listOwnItems, listOwnPrices,
};

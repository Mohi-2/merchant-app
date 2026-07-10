'use strict';
const db = require('./db');
const { parsePriceRange, normalizeAlibabaUrl, extractAlibabaId } = require('./parse');

const getByUrlStmt = db.prepare('SELECT * FROM crawled_items WHERE url = ?');
const insertItemStmt = db.prepare(`
  INSERT INTO crawled_items (alibaba_id, url, title, image_url, price_raw, price_min_cny, price_max_cny, moq, seller_name, source_page)
  VALUES (@alibaba_id, @url, @title, @image_url, @price_raw, @price_min_cny, @price_max_cny, @moq, @seller_name, @source_page)
`);
const updateItemStmt = db.prepare(`
  UPDATE crawled_items SET title = @title, image_url = @image_url, price_raw = @price_raw,
    price_min_cny = @price_min_cny, price_max_cny = @price_max_cny, moq = @moq,
    seller_name = @seller_name, last_seen_at = datetime('now')
  WHERE id = @id
`);
const latestPriceStmt = db.prepare('SELECT * FROM crawled_prices WHERE crawled_item_id = ? ORDER BY id DESC LIMIT 1');
const insertPriceStmt = db.prepare('INSERT INTO crawled_prices (crawled_item_id, price_raw, price_min_cny, price_max_cny) VALUES (?, ?, ?, ?)');

const captureItems = db.transaction((rawItems, pageType) => {
  let created = 0, updated = 0;
  const cap = (v, n) => (v == null ? null : String(v).slice(0, n) || null);
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const url = normalizeAlibabaUrl(raw.url);
    const title = String(raw.title || '').trim().slice(0, 300);
    if (!url || !title) continue;
    const priceRaw = cap(raw.price_raw, 100);
    // Only ¥/￥ prices are CNY. A €/$ price (e.g. when the browser's deliver-to
    // isn't set to China) is kept verbatim in price_raw but not parsed into the
    // CNY columns, so landed-cost math is never fed a mislabeled currency.
    const price = /[¥￥]/.test(priceRaw || '') ? parsePriceRange(priceRaw) : null;
    const fields = {
      title,
      image_url: cap(raw.image_url, 1000),
      price_raw: priceRaw,
      price_min_cny: price ? price.min : null,
      price_max_cny: price ? price.max : null,
      moq: cap(raw.moq, 200),
      seller_name: cap(raw.seller_name, 200),
    };
    const existing = getByUrlStmt.get(url);
    if (existing) {
      updateItemStmt.run({
        ...fields,
        ...(price ? {} : {
          price_raw: existing.price_raw,
          price_min_cny: existing.price_min_cny,
          price_max_cny: existing.price_max_cny,
        }),
        id: existing.id,
      });
      if (price) {
        const last = latestPriceStmt.get(existing.id);
        if (!last || last.price_min_cny !== price.min || last.price_max_cny !== price.max) {
          insertPriceStmt.run(existing.id, fields.price_raw, price.min, price.max);
        }
      }
      updated++;
    } else {
      const info = insertItemStmt.run({
        ...fields, url,
        alibaba_id: extractAlibabaId(url),
        source_page: pageType === 'PRODUCT' ? 'PRODUCT' : 'SEARCH',
      });
      if (price) insertPriceStmt.run(info.lastInsertRowid, fields.price_raw, price.min, price.max);
      created++;
    }
  }
  return { created, updated, total: created + updated };
});

function listItems(status) {
  const base = `
    SELECT ci.*, (SELECT COUNT(*) FROM crawled_prices cp WHERE cp.crawled_item_id = ci.id) AS price_count
    FROM crawled_items ci
  `;
  if (status) {
    return db.prepare(base + ' WHERE ci.status = ? ORDER BY ci.last_seen_at DESC, ci.id DESC').all(status);
  }
  return db.prepare(base + ' ORDER BY ci.last_seen_at DESC, ci.id DESC').all();
}

function listPrices(itemId) {
  return db.prepare('SELECT * FROM crawled_prices WHERE crawled_item_id = ? ORDER BY id DESC').all(itemId);
}

const addProductFromItem = db.transaction((itemId, { name, category_id, unit_label }) => {
  const item = db.prepare('SELECT * FROM crawled_items WHERE id = ?').get(itemId);
  if (!item) {
    const err = new Error('آیتم یافت نشد');
    err.status = 404;
    throw err;
  }
  const info = db.prepare(
    'INSERT INTO products (name, category_id, unit_label, alibaba_link, image_url) VALUES (?, ?, ?, ?, ?)'
  ).run(name, category_id ?? null, unit_label, item.url, item.image_url);
  db.prepare("UPDATE crawled_items SET status = 'ADDED', product_id = ? WHERE id = ?").run(info.lastInsertRowid, itemId);
  return info.lastInsertRowid;
});

function setStatus(itemId, status) {
  const info = db.prepare('UPDATE crawled_items SET status = ? WHERE id = ?').run(status, itemId);
  return info.changes > 0;
}

module.exports = { captureItems, listItems, listPrices, addProductFromItem, setStatus };

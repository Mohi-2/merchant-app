# Digikala Crawler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Digikala subsystem that tracks our own seller listings (via a seller-panel bookmarklet) and competitor prices (bookmarklet to start tracking, server-side public JSON API to refresh).

**Architecture:** Mirror the existing Alibaba crawler. Four new tables, pure parse helpers, a thin public-API wrapper service, a business-logic helper module, one route file, two new bookmarklet builders, and one new frontend page with two tabs. Competitor price refresh runs entirely server-side against `api.digikala.com/v2/product/<dkp>/` (verified live 2026-07-11) — no browser needed.

**Tech Stack:** Node.js, Express, better-sqlite3 (synchronous), node:test, vanilla JS frontend. CommonJS, no build step.

## Global Constraints

- **Currency:** Digikala public API returns prices in **Rial**; the whole app stores/displays **Toman**. Divide API `selling_price` by 10 on store. Bookmarklet-scraped displayed prices are already Toman.
- **Response convention:** success is a bare `res.json(obj)`; failure is `res.status(4xx|5xx).json({ error: 'پیام فارسی' })`. No envelope. Checks inline in handlers.
- **DB:** synchronous better-sqlite3. Wrap row+history mutations in `db.transaction()`. Schema is `CREATE TABLE IF NOT EXISTS` (idempotent on startup). Tests set `process.env.CIM_DB_PATH = ':memory:'` as the FIRST line, before requiring any helper.
- **Auth:** `/capture` endpoints use CORS + capture token (reuse `getOrCreateCrawlToken()` from `helpers/settings.js`), NOT session cookies. All other endpoints use `requireAuth`.
- **Bookmarklets:** must stay fully self-contained inline `javascript:` URIs (page CSP blocks external `<script src>` but not inline).
- **Store everything in Toman as integers.** Persian/Arabic digits must be normalized to ASCII before parsing.

---

### Task 1: Schema — four Digikala tables

**Files:**
- Modify: `db/schema.sql` (append at end, after `crawled_prices`)

**Interfaces:**
- Produces tables: `digikala_own_items`, `digikala_own_price_history`, `digikala_competitor_items`, `digikala_competitor_price_history`.

- [ ] **Step 1: Append the four tables to `db/schema.sql`**

```sql

CREATE TABLE IF NOT EXISTS digikala_own_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  digikala_id   TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  price         INTEGER,
  stock         INTEGER,
  sales_count   INTEGER,
  captured_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dk_own_product ON digikala_own_items(product_id);

CREATE TABLE IF NOT EXISTS digikala_own_price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL REFERENCES digikala_own_items(id) ON DELETE CASCADE,
  price       INTEGER,
  stock       INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dk_own_hist_item ON digikala_own_price_history(item_id);

CREATE TABLE IF NOT EXISTS digikala_competitor_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  url          TEXT NOT NULL UNIQUE,
  digikala_id  TEXT,
  title        TEXT NOT NULL,
  seller_name  TEXT,
  price        INTEGER,
  status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','IGNORED')),
  captured_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dk_comp_status ON digikala_competitor_items(status);

CREATE TABLE IF NOT EXISTS digikala_competitor_price_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL REFERENCES digikala_competitor_items(id) ON DELETE CASCADE,
  price       INTEGER,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dk_comp_hist_item ON digikala_competitor_price_history(item_id);
```

- [ ] **Step 2: Verify schema applies cleanly**

Run: `node -e "process.env.CIM_DB_PATH=':memory:'; const db=require('./helpers/db'); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'digikala%'\").all());"`
Expected: prints all four `digikala_*` table names.

- [ ] **Step 3: Commit**

```bash
git add db/schema.sql
git commit -m "feat: digikala crawler tables (own + competitor items & price history)"
```

---

### Task 2: Parse helpers — dkp id, url normalization, Toman price

**Files:**
- Modify: `helpers/parse.js` (add three functions + exports)
- Test: `test/digikala-parse.test.js` (create)

**Interfaces:**
- Produces:
  - `extractDkpId(url)` → string dkp id (e.g. `'13715199'`) or `null`. Rejects non-digikala hosts.
  - `normalizeDigikalaUrl(href)` → `origin+pathname` string or `null` (rejects non-digikala hosts, strips query/hash).
  - `parseTomanPrice(raw)` → integer Toman or `null` (normalizes Persian/Arabic digits, strips separators).

- [ ] **Step 1: Write the failing test** — create `test/digikala-parse.test.js`

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { extractDkpId, normalizeDigikalaUrl, parseTomanPrice } = require('../helpers/parse');

test('extractDkpId: pulls dkp id from product url', () => {
  assert.strictEqual(extractDkpId('https://www.digikala.com/product/dkp-13715199/foo-bar/'), '13715199');
});
test('extractDkpId: rejects non-digikala host', () => {
  assert.strictEqual(extractDkpId('https://evil.com/product/dkp-1/'), null);
  assert.strictEqual(extractDkpId('https://digikala.com.evil.com/product/dkp-2/'), null);
});
test('extractDkpId: no dkp segment returns null', () => {
  assert.strictEqual(extractDkpId('https://www.digikala.com/search/'), null);
  assert.strictEqual(extractDkpId(''), null);
});
test('normalizeDigikalaUrl: strips query/hash, keeps path', () => {
  assert.strictEqual(
    normalizeDigikalaUrl('https://www.digikala.com/product/dkp-5/x/?spm=a#z'),
    'https://www.digikala.com/product/dkp-5/x/'
  );
});
test('normalizeDigikalaUrl: rejects non-digikala and invalid', () => {
  assert.strictEqual(normalizeDigikalaUrl('https://evil.com/x'), null);
  assert.strictEqual(normalizeDigikalaUrl('not a url'), null);
});
test('parseTomanPrice: Persian digits with separators and label', () => {
  assert.strictEqual(parseTomanPrice('۶۴۰,۰۰۰ تومان'), 640000);
});
test('parseTomanPrice: ASCII digits', () => {
  assert.strictEqual(parseTomanPrice('640000'), 640000);
});
test('parseTomanPrice: no digits returns null', () => {
  assert.strictEqual(parseTomanPrice('ناموجود'), null);
  assert.strictEqual(parseTomanPrice(''), null);
  assert.strictEqual(parseTomanPrice(null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/digikala-parse.test.js`
Expected: FAIL — `extractDkpId is not a function` (not yet exported).

- [ ] **Step 3: Add the three functions to `helpers/parse.js`** (before `module.exports`)

```js
// Digikala product urls look like https://www.digikala.com/product/dkp-13715199/slug/.
// Rejects (returns null) any URL whose host is not digikala.com or a subdomain.
function isDigikalaHost(u) {
  return /(^|\.)digikala\.com$/i.test(u.hostname);
}

function extractDkpId(url) {
  let u;
  try { u = new URL(String(url || ''), 'https://www.digikala.com'); } catch { return null; }
  if (!isDigikalaHost(u)) return null;
  const m = u.pathname.match(/dkp-(\d+)/i);
  return m ? m[1] : null;
}

function normalizeDigikalaUrl(href) {
  if (!href) return null;
  let u;
  try { u = new URL(href, 'https://www.digikala.com'); } catch { return null; }
  if (!isDigikalaHost(u)) return null;
  return u.origin + u.pathname;
}

// Persian/Arabic-Indic digits -> ASCII, strip everything but digits, parse int Toman.
function parseTomanPrice(raw) {
  if (raw == null) return null;
  const ascii = String(raw)
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const digits = ascii.replace(/[^\d]/g, '');
  if (!digits) return null;
  return parseInt(digits, 10);
}
```

- [ ] **Step 4: Update the export line in `helpers/parse.js`**

```js
module.exports = { parsePriceRange, normalizeAlibabaUrl, extractAlibabaId, extractDkpId, normalizeDigikalaUrl, parseTomanPrice };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/digikala-parse.test.js`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add helpers/parse.js test/digikala-parse.test.js
git commit -m "feat: digikala parse helpers (dkp id, url normalize, toman price)"
```

---

### Task 3: Public API wrapper — `services/digikala.js`

**Files:**
- Create: `services/digikala.js`
- Test: `test/digikala-service.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure network wrapper).
- Produces: `async fetchProduct(dkpId, fetchImpl = fetch)` → `{ title, status, priceToman, sellerName }`. `priceToman` is `null` when out of stock. Throws `err` with `err.code = 'UPSTREAM_ERROR'` (non-200 / network) or `'PARSE_ERROR'` (unexpected shape).

- [ ] **Step 1: Write the failing test** — create `test/digikala-service.test.js`

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { fetchProduct } = require('../services/digikala');

function fakeFetch(body, ok = true, status = 200) {
  return async () => ({ ok, status, json: async () => body });
}

test('fetchProduct: parses marketable product, Rial->Toman', async () => {
  const body = { data: { product: {
    title_fa: 'قاشق چای خوری',
    status: 'marketable',
    default_variant: { price: { selling_price: 6400000 }, seller: { title: 'نلین گالری' } },
  } } };
  const r = await fetchProduct('13715199', fakeFetch(body));
  assert.strictEqual(r.title, 'قاشق چای خوری');
  assert.strictEqual(r.status, 'marketable');
  assert.strictEqual(r.priceToman, 640000);
  assert.strictEqual(r.sellerName, 'نلین گالری');
});

test('fetchProduct: out_of_stock has null price and seller', async () => {
  const body = { data: { product: { title_fa: 'x', status: 'out_of_stock' } } };
  const r = await fetchProduct('2', fakeFetch(body));
  assert.strictEqual(r.priceToman, null);
  assert.strictEqual(r.sellerName, null);
});

test('fetchProduct: non-200 throws UPSTREAM_ERROR', async () => {
  await assert.rejects(fetchProduct('2', fakeFetch({}, false, 503)), e => e.code === 'UPSTREAM_ERROR');
});

test('fetchProduct: missing data throws PARSE_ERROR', async () => {
  await assert.rejects(fetchProduct('2', fakeFetch({ nope: 1 })), e => e.code === 'PARSE_ERROR');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/digikala-service.test.js`
Expected: FAIL — cannot find module `../services/digikala`.

- [ ] **Step 3: Create `services/digikala.js`**

```js
'use strict';

// Thin wrapper around Digikala's public product API (verified live 2026-07-11):
//   GET https://api.digikala.com/v2/product/<dkp-id>/
// selling_price is in RIAL — divide by 10 for Toman. Out-of-stock products omit
// default_variant, so price/seller come back null (not an error).
async function fetchProduct(dkpId, fetchImpl = fetch) {
  const url = `https://api.digikala.com/v2/product/${encodeURIComponent(dkpId)}/`;
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    const err = new Error('خطا در اتصال به دیجی‌کالا');
    err.code = 'UPSTREAM_ERROR';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`digikala HTTP ${res.status}`);
    err.code = 'UPSTREAM_ERROR';
    throw err;
  }
  const json = await res.json();
  const product = json && json.data && json.data.product;
  if (!product) {
    const err = new Error('پاسخ دیجی‌کالا قابل تفسیر نبود');
    err.code = 'PARSE_ERROR';
    throw err;
  }
  const dv = product.default_variant || {};
  const rial = dv.price && dv.price.selling_price;
  return {
    title: product.title_fa || product.title_en || '',
    status: product.status || null,
    priceToman: rial != null ? Math.round(rial / 10) : null,
    sellerName: (dv.seller && dv.seller.title) || null,
  };
}

module.exports = { fetchProduct };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/digikala-service.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add services/digikala.js test/digikala-service.test.js
git commit -m "feat: digikala public product API wrapper (rial->toman, typed errors)"
```

---

### Task 4: Competitor helper logic — `helpers/digikala.js` (competitor half)

**Files:**
- Create: `helpers/digikala.js` (competitor functions; own functions added in Task 5)
- Test: `test/digikala-competitor.test.js`

**Interfaces:**
- Consumes: `extractDkpId`, `normalizeDigikalaUrl`, `parseTomanPrice` (Task 2); `fetchProduct` shape `{ title, status, priceToman, sellerName }` (Task 3).
- Produces:
  - `captureCompetitor(raw)` where `raw = { url, title, price_raw, seller_name }` → `{ id, created: boolean }`. Skips (returns `null`) when url or title missing/invalid.
  - `refreshCompetitor(id, fetchProductImpl = fetchProduct)` → updated item row. Throws `err.status = 404` if id unknown; propagates `fetchProduct` errors (`err.code`).
  - `setCompetitorStatus(id, status)` → boolean (`status` in `'ACTIVE'|'IGNORED'`).
  - `listCompetitors(status)` → item rows each with `price_count`.
  - `listCompetitorPrices(id)` → history rows, newest first.

- [ ] **Step 1: Write the failing test** — create `test/digikala-competitor.test.js`

```js
'use strict';
process.env.CIM_DB_PATH = ':memory:';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  captureCompetitor, refreshCompetitor, setCompetitorStatus,
  listCompetitors, listCompetitorPrices,
} = require('../helpers/digikala');

const RAW = {
  url: 'https://www.digikala.com/product/dkp-13715199/spoon/?spm=x',
  title: 'قاشق چای خوری',
  price_raw: '۶۴۰,۰۰۰ تومان',
  seller_name: 'رقیب الف',
};

test('captureCompetitor: creates item + first price row, normalized url + dkp id', () => {
  const r = captureCompetitor(RAW);
  assert.strictEqual(r.created, true);
  const rows = listCompetitors('ACTIVE');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].url, 'https://www.digikala.com/product/dkp-13715199/spoon/');
  assert.strictEqual(rows[0].digikala_id, '13715199');
  assert.strictEqual(rows[0].price, 640000);
  assert.strictEqual(listCompetitorPrices(rows[0].id).length, 1);
});

test('captureCompetitor: same price re-capture adds no history row', () => {
  const r = captureCompetitor(RAW);
  assert.strictEqual(r.created, false);
  assert.strictEqual(listCompetitorPrices(r.id).length, 1);
});

test('captureCompetitor: changed price appends history row', () => {
  const r = captureCompetitor({ ...RAW, price_raw: '۷۰۰,۰۰۰' });
  assert.strictEqual(listCompetitors('ACTIVE')[0].price, 700000);
  assert.strictEqual(listCompetitorPrices(r.id).length, 2);
});

test('captureCompetitor: missing title or non-digikala url is skipped', () => {
  assert.strictEqual(captureCompetitor({ url: RAW.url, title: '' }), null);
  assert.strictEqual(captureCompetitor({ url: 'https://evil.com/x', title: 'y' }), null);
});

test('refreshCompetitor: price change from API appends history, updates seller', async () => {
  const id = listCompetitors('ACTIVE')[0].id;
  const before = listCompetitorPrices(id).length;
  const stub = async () => ({ title: 'قاشق چای خوری', status: 'marketable', priceToman: 750000, sellerName: 'رقیب ب' });
  const item = await refreshCompetitor(id, stub);
  assert.strictEqual(item.price, 750000);
  assert.strictEqual(item.seller_name, 'رقیب ب');
  assert.strictEqual(listCompetitorPrices(id).length, before + 1);
});

test('refreshCompetitor: out_of_stock keeps price null, no crash', async () => {
  const id = listCompetitors('ACTIVE')[0].id;
  const stub = async () => ({ title: 'x', status: 'out_of_stock', priceToman: null, sellerName: null });
  const item = await refreshCompetitor(id, stub);
  assert.strictEqual(item.price, null);
});

test('refreshCompetitor: unknown id throws 404', async () => {
  await assert.rejects(refreshCompetitor(999999, async () => ({})), e => e.status === 404);
});

test('setCompetitorStatus: toggles IGNORED/ACTIVE, rejects unknown id', () => {
  const id = listCompetitors('ACTIVE')[0].id;
  assert.strictEqual(setCompetitorStatus(id, 'IGNORED'), true);
  assert.strictEqual(listCompetitors('IGNORED').length, 1);
  assert.strictEqual(setCompetitorStatus(id, 'ACTIVE'), true);
  assert.strictEqual(setCompetitorStatus(999999, 'IGNORED'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/digikala-competitor.test.js`
Expected: FAIL — cannot find module `../helpers/digikala`.

- [ ] **Step 3: Create `helpers/digikala.js` with the competitor half**

```js
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
```

Note on the out_of_stock branch: the plan's competitor test expects `price` to become `null` when the API reports out_of_stock, so the second `UPDATE ... SET price = NULL` inside `apply()` is deliberate — it overrides the "keep last known" line above specifically for the unavailable case. (Own items, Task 5, keep last known price instead — different rule.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/digikala-competitor.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add helpers/digikala.js test/digikala-competitor.test.js
git commit -m "feat: digikala competitor capture/refresh/status helpers"
```

---

### Task 5: Own-listing helper logic — extend `helpers/digikala.js`

**Files:**
- Modify: `helpers/digikala.js` (add own functions + extend exports)
- Test: `test/digikala-own.test.js`

**Interfaces:**
- Consumes: `parseTomanPrice` (Task 2), existing `cap`/`db` in the module.
- Produces:
  - `captureOwnItems(rawItems)` where each `raw = { digikala_id, title, price_raw, stock, sales_count }` → `{ created, updated, total }`. Upsert by `digikala_id`; entries with missing `digikala_id` or `title` skipped.
  - `linkOwnItem(id, productId)` → boolean.
  - `listOwnItems()` → item rows each with `price_count`.
  - `listOwnPrices(id)` → history rows, newest first.

- [ ] **Step 1: Write the failing test** — create `test/digikala-own.test.js`

```js
'use strict';
process.env.CIM_DB_PATH = ':memory:';
const { test } = require('node:test');
const assert = require('node:assert');
const db = require('../helpers/db');
const { captureOwnItems, linkOwnItem, listOwnItems, listOwnPrices } = require('../helpers/digikala');

const OWN = { digikala_id: '555', title: 'محصول من', price_raw: '۴۵۰,۰۰۰', stock: '12', sales_count: '30' };

test('captureOwnItems: bulk create with first history row', () => {
  const r = captureOwnItems([OWN, { digikala_id: '556', title: 'دومی', price_raw: '۱۰۰,۰۰۰', stock: '5' }]);
  assert.deepStrictEqual(r, { created: 2, updated: 0, total: 2 });
  const rows = listOwnItems();
  const a = rows.find(x => x.digikala_id === '555');
  assert.strictEqual(a.price, 450000);
  assert.strictEqual(a.stock, 12);
  assert.strictEqual(a.sales_count, 30);
  assert.strictEqual(listOwnPrices(a.id).length, 1);
});

test('captureOwnItems: same price+stock re-capture adds no history row', () => {
  const r = captureOwnItems([OWN]);
  assert.deepStrictEqual(r, { created: 0, updated: 1, total: 1 });
  const a = listOwnItems().find(x => x.digikala_id === '555');
  assert.strictEqual(listOwnPrices(a.id).length, 1);
});

test('captureOwnItems: changed price appends history row', () => {
  captureOwnItems([{ ...OWN, price_raw: '۵۰۰,۰۰۰' }]);
  const a = listOwnItems().find(x => x.digikala_id === '555');
  assert.strictEqual(a.price, 500000);
  assert.strictEqual(listOwnPrices(a.id).length, 2);
});

test('captureOwnItems: malformed entries skipped, batch survives', () => {
  const r = captureOwnItems([null, { title: 'no id' }, { digikala_id: '777', title: 'خوب', price_raw: '۹۰,۰۰۰' }]);
  assert.deepStrictEqual(r, { created: 1, updated: 0, total: 1 });
});

test('linkOwnItem: attaches product id, rejects unknown item', () => {
  const pid = db.prepare("INSERT INTO products (name, unit_label) VALUES ('p','عدد')").run().lastInsertRowid;
  const a = listOwnItems().find(x => x.digikala_id === '555');
  assert.strictEqual(linkOwnItem(a.id, pid), true);
  assert.strictEqual(listOwnItems().find(x => x.id === a.id).product_id, pid);
  assert.strictEqual(linkOwnItem(999999, pid), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/digikala-own.test.js`
Expected: FAIL — `captureOwnItems is not a function`.

- [ ] **Step 3: Add own functions to `helpers/digikala.js`** (insert before `module.exports`)

```js
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
        id: existing.id, title, sales_count,
        price: price != null ? price : existing.price,
        stock: stock != null ? stock : existing.stock,
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
```

- [ ] **Step 4: Extend the `module.exports` in `helpers/digikala.js`**

```js
module.exports = {
  captureCompetitor, refreshCompetitor, setCompetitorStatus, listCompetitors, listCompetitorPrices,
  captureOwnItems, linkOwnItem, listOwnItems, listOwnPrices,
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/digikala-own.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add helpers/digikala.js test/digikala-own.test.js
git commit -m "feat: digikala own-listing bulk capture + product link helpers"
```

---

### Task 6: Routes — `routes/digikala.js` + mount

**Files:**
- Create: `routes/digikala.js`
- Modify: `server.js` (add one mount line)
- Modify: `services/bookmarklet.js` (add two builder stubs so the `/bookmarklets` route resolves — full DOM logic lands in Task 7)

**Interfaces:**
- Consumes: all `helpers/digikala.js` exports (Tasks 4-5); `getOrCreateCrawlToken` (`helpers/settings.js`); `requireAuth` (`helpers/middleware.js`); `buildDigikalaCompetitorBookmarklet`, `buildDigikalaOwnBookmarklet` (`services/bookmarklet.js`).
- Produces route surface:
  - `POST /api/digikala/competitor/capture` (CORS+token, body `{ token, item }`)
  - `POST /api/digikala/own/capture` (CORS+token, body `{ token, items }`)
  - `POST /api/digikala/competitor/:id/refresh` (auth)
  - `PATCH /api/digikala/competitor/:id/status` (auth, body `{ status }`)
  - `GET /api/digikala/competitor` (auth, `?status`)
  - `GET /api/digikala/competitor/:id/prices` (auth)
  - `PATCH /api/digikala/own/:id/link` (auth, body `{ product_id }`)
  - `GET /api/digikala/own` (auth)
  - `GET /api/digikala/own/:id/prices` (auth)
  - `GET /api/digikala/bookmarklets` (auth) → `{ competitor, own }`

- [ ] **Step 1: Add two builder stubs to `services/bookmarklet.js`** (before `module.exports`, and extend exports). Real DOM logic is filled in Task 7.

```js
function buildDigikalaCompetitorBookmarklet(baseUrl, token) {
  return 'javascript:' + encodeURIComponent(`(function(){alert('calibrate in Task 7')})();`);
}
function buildDigikalaOwnBookmarklet(baseUrl, token) {
  return 'javascript:' + encodeURIComponent(`(function(){alert('calibrate in Task 7')})();`);
}
```

Extend exports:

```js
module.exports = { buildBookmarklet, buildCaptureScript, buildDigikalaCompetitorBookmarklet, buildDigikalaOwnBookmarklet };
```

- [ ] **Step 2: Create `routes/digikala.js`**

```js
'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../helpers/middleware');
const { getOrCreateCrawlToken } = require('../helpers/settings');
const { buildDigikalaCompetitorBookmarklet, buildDigikalaOwnBookmarklet } = require('../services/bookmarklet');
const {
  captureCompetitor, refreshCompetitor, setCompetitorStatus, listCompetitors, listCompetitorPrices,
  captureOwnItems, linkOwnItem, listOwnItems, listOwnPrices,
} = require('../helpers/digikala');

const DIGIKALA_ORIGIN = /^https?:\/\/([a-z0-9-]+\.)*digikala\.com$/i;

// CORS on the two /capture endpoints: bookmarklets post cross-origin from
// digikala.com, authenticated by the crawl token (cookies aren't sent cross-site).
function corsCapture(req, res, next) {
  const origin = req.headers.origin;
  if (origin && DIGIKALA_ORIGIN.test(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}
router.use('/competitor/capture', corsCapture);
router.use('/own/capture', corsCapture);

function checkToken(req, res) {
  const { token } = req.body || {};
  if (!token || token !== getOrCreateCrawlToken()) {
    res.status(401).json({ error: 'توکن کپچر نامعتبر است' });
    return false;
  }
  return true;
}

// ---- Competitor ----
router.post('/competitor/capture', (req, res) => {
  if (!checkToken(req, res)) return;
  const { item } = req.body || {};
  if (!item || typeof item !== 'object') return res.status(400).json({ error: 'هیچ آیتمی ارسال نشده' });
  try {
    const r = captureCompetitor(item);
    if (!r) return res.status(400).json({ error: 'آیتم نامعتبر (لینک یا عنوان)' });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ error: 'خطا در ذخیره آیتم' });
  }
});

router.post('/competitor/:id/refresh', requireAuth, async (req, res) => {
  try {
    const item = await refreshCompetitor(Number(req.params.id));
    res.json(item);
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: e.message });
    if (e.code === 'UPSTREAM_ERROR' || e.code === 'PARSE_ERROR') return res.status(502).json({ error: 'خطا در دریافت از دیجی‌کالا' });
    res.status(e.status || 500).json({ error: e.status ? e.message : 'خطا در بروزرسانی' });
  }
});

router.patch('/competitor/:id/status', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!setCompetitorStatus(Number(req.params.id), status)) {
    return res.status(400).json({ error: 'وضعیت یا آیتم نامعتبر است' });
  }
  res.json({ ok: true });
});

router.get('/competitor', requireAuth, (req, res) => res.json(listCompetitors(req.query.status)));
router.get('/competitor/:id/prices', requireAuth, (req, res) => res.json(listCompetitorPrices(Number(req.params.id))));

// ---- Own ----
router.post('/own/capture', (req, res) => {
  if (!checkToken(req, res)) return;
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'هیچ آیتمی ارسال نشده' });
  try {
    res.json({ ok: true, ...captureOwnItems(items) });
  } catch (e) {
    res.status(500).json({ error: 'خطا در ذخیره آیتم‌ها' });
  }
});

router.patch('/own/:id/link', requireAuth, (req, res) => {
  const { product_id } = req.body || {};
  if (!linkOwnItem(Number(req.params.id), product_id ? Number(product_id) : null)) {
    return res.status(404).json({ error: 'آیتم یافت نشد' });
  }
  res.json({ ok: true });
});

router.get('/own', requireAuth, (req, res) => res.json(listOwnItems()));
router.get('/own/:id/prices', requireAuth, (req, res) => res.json(listOwnPrices(Number(req.params.id))));

// ---- Bookmarklets ----
router.get('/bookmarklets', requireAuth, (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const token = getOrCreateCrawlToken();
  res.json({
    competitor: buildDigikalaCompetitorBookmarklet(base, token),
    own: buildDigikalaOwnBookmarklet(base, token),
  });
});

module.exports = router;
```

- [ ] **Step 3: Mount the router in `server.js`** — add after the `/api/crawl` line (`server.js:35`)

```js
app.use('/api/digikala', require('./routes/digikala'));
```

- [ ] **Step 4: Verify the full test suite still passes and the app boots**

Run: `npm test`
Expected: all suites PASS (existing 26 + new 25 = 51 tests).

Run: `node -e "require('./routes/digikala'); console.log('router loads')"`
Expected: prints `router loads` (no throw).

- [ ] **Step 5: Smoke-test the routes with curl** (start `npm run dev` in another shell first)

```bash
# unauth list should 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/digikala/competitor   # 401
# capture with bad token should 401
curl -s -X POST http://localhost:3000/api/digikala/competitor/capture \
  -H 'Content-Type: application/json' -d '{"token":"nope","item":{}}'                      # {"error":"توکن..."}
```
Expected: `401` then a Persian token error.

- [ ] **Step 6: Commit**

```bash
git add routes/digikala.js server.js services/bookmarklet.js
git commit -m "feat: digikala routes (competitor + own capture/refresh/list) + mount"
```

---

### Task 7: Bookmarklet DOM logic — competitor + seller panel

**Files:**
- Modify: `services/bookmarklet.js` (replace the two Task 6 stub bodies with real capture scripts)
- Test: `test/digikala-bookmarklet.test.js`

**Interfaces:**
- Consumes: nothing (pure string builders).
- Produces: `buildDigikalaCompetitorBookmarklet(base, token)` and `buildDigikalaOwnBookmarklet(base, token)` — each returns a `javascript:`-prefixed, URI-encoded, self-contained IIFE. Competitor posts `{ token, item }` to `/api/digikala/competitor/capture`; own posts `{ token, items }` to `/api/digikala/own/capture`.

**Calibration note:** competitor selectors target the public product page (`h1`, a `[class*="price"]` node, seller link) — the same defensive style as the Alibaba builder. The seller-panel DOM is behind auth and cannot be inspected here, so the own-panel builder reads generic table rows with a documented best-guess selector set; final selector calibration against the live `seller.digikala.com` panel is a user-assisted step (same handoff as the Alibaba live test). Tests assert the builder's structure (URI shape, embedded base/token, endpoint), not live DOM extraction.

- [ ] **Step 1: Write the failing test** — create `test/digikala-bookmarklet.test.js`

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildDigikalaCompetitorBookmarklet, buildDigikalaOwnBookmarklet } = require('../services/bookmarklet');

test('competitor bookmarklet: javascript: URI embedding base, token, endpoint', () => {
  const b = buildDigikalaCompetitorBookmarklet('https://app.example', 'tok123');
  assert.ok(b.startsWith('javascript:'));
  const decoded = decodeURIComponent(b.slice('javascript:'.length));
  assert.ok(decoded.includes('https://app.example'));
  assert.ok(decoded.includes('tok123'));
  assert.ok(decoded.includes('/api/digikala/competitor/capture'));
  assert.doesNotThrow(() => new Function(decoded)); // valid JS
});

test('own bookmarklet: javascript: URI hitting own capture endpoint', () => {
  const b = buildDigikalaOwnBookmarklet('https://app.example', 'tok123');
  assert.ok(b.startsWith('javascript:'));
  const decoded = decodeURIComponent(b.slice('javascript:'.length));
  assert.ok(decoded.includes('/api/digikala/own/capture'));
  assert.ok(decoded.includes('tok123'));
  assert.doesNotThrow(() => new Function(decoded));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/digikala-bookmarklet.test.js`
Expected: FAIL — the Task 6 stubs contain `alert(...)`, not the endpoint strings.

- [ ] **Step 3: Replace the two stub bodies in `services/bookmarklet.js`**

```js
// Runs on a competitor's PUBLIC digikala product page. Extracts raw strings only;
// server parses the Toman price and extracts the dkp id from the URL.
function buildDigikalaCompetitorScript(baseUrl, token) {
  return `(function(){
var BASE=${JSON.stringify(baseUrl)},TOKEN=${JSON.stringify(token)};
function txt(el){return el&&el.textContent?el.textContent.trim():''}
function toast(msg,ok){var d=document.createElement('div');d.textContent=msg;d.style.cssText='position:fixed;top:16px;left:16px;z-index:2147483647;padding:12px 18px;border-radius:10px;font:600 14px/1.4 sans-serif;direction:rtl;color:#fff;background:'+(ok?'#16a34a':'#ef4444')+';box-shadow:0 6px 20px rgba(0,0,0,.3)';document.body.appendChild(d);setTimeout(function(){d.remove()},5000)}
var h1=document.querySelector('h1');
var pel=document.querySelector('[data-testid*="price"],[class*="price"]');
var sel=document.querySelector('[data-testid*="seller"],a[href*="/seller/"],[class*="seller"]');
var item={url:location.href,title:txt(h1)||document.title,price_raw:txt(pel),seller_name:txt(sel)};
if(!item.title){toast('\\u0639\\u0646\\u0648\\u0627\\u0646 \\u0645\\u062d\\u0635\\u0648\\u0644 \\u067e\\u06cc\\u062f\\u0627 \\u0646\\u0634\\u062f',false);return}
fetch(BASE+'/api/digikala/competitor/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN,item:item})})
.then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d})})
.then(function(d){toast(d.created?'\\u0631\\u0642\\u06cc\\u0628 \\u062c\\u062f\\u06cc\\u062f \\u062b\\u0628\\u062a \\u0634\\u062f':'\\u0642\\u06cc\\u0645\\u062a \\u0628\\u0631\\u0648\\u0632 \\u0634\\u062f',true)})
.catch(function(e){toast('\\u062e\\u0637\\u0627: '+e.message,false)});
})();`;
}

// Runs on the seller panel product-list page. Reads every row on the current page.
// SELECTORS ARE BEST-GUESS — calibrate against the live seller.digikala.com panel.
function buildDigikalaOwnScript(baseUrl, token) {
  return `(function(){
var BASE=${JSON.stringify(baseUrl)},TOKEN=${JSON.stringify(token)};
function txt(el){return el&&el.textContent?el.textContent.trim():''}
function toast(msg,ok){var d=document.createElement('div');d.textContent=msg;d.style.cssText='position:fixed;top:16px;left:16px;z-index:2147483647;padding:12px 18px;border-radius:10px;font:600 14px/1.4 sans-serif;direction:rtl;color:#fff;background:'+(ok?'#16a34a':'#ef4444')+';box-shadow:0 6px 20px rgba(0,0,0,.3)';document.body.appendChild(d);setTimeout(function(){d.remove()},5000)}
var items=[];
var rows=document.querySelectorAll('tbody tr,[class*="product-row"],[data-testid*="product-row"]');
for(var i=0;i<rows.length;i++){
  var row=rows[i];
  var link=row.querySelector('a[href*="dkp-"]');
  var dkp='';if(link){var m=(link.getAttribute('href')||'').match(/dkp-(\\d+)/);if(m)dkp=m[1]}
  if(!dkp)continue;
  var titleEl=row.querySelector('[class*="title"],a[href*="dkp-"]');
  var priceEl=row.querySelector('[class*="price"],[data-testid*="price"]');
  var stockEl=row.querySelector('[class*="stock"],[data-testid*="stock"]');
  var salesEl=row.querySelector('[class*="sales"],[data-testid*="sales"]');
  items.push({digikala_id:dkp,title:txt(titleEl),price_raw:txt(priceEl),stock:txt(stockEl),sales_count:txt(salesEl)});
}
if(!items.length){toast('\\u0645\\u062d\\u0635\\u0648\\u0644\\u06cc \\u062f\\u0631 \\u0627\\u06cc\\u0646 \\u0635\\u0641\\u062d\\u0647 \\u067e\\u06cc\\u062f\\u0627 \\u0646\\u0634\\u062f',false);return}
fetch(BASE+'/api/digikala/own/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN,items:items})})
.then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d})})
.then(function(d){toast(d.total+' \\u0645\\u062d\\u0635\\u0648\\u0644 \\u062b\\u0628\\u062a \\u0634\\u062f ('+d.created+' \\u062c\\u062f\\u06cc\\u062f)',true)})
.catch(function(e){toast('\\u062e\\u0637\\u0627: '+e.message,false)});
})();`;
}
```

Then replace the two stub builders so they call these scripts:

```js
function buildDigikalaCompetitorBookmarklet(baseUrl, token) {
  return 'javascript:' + encodeURIComponent(buildDigikalaCompetitorScript(baseUrl, token));
}
function buildDigikalaOwnBookmarklet(baseUrl, token) {
  return 'javascript:' + encodeURIComponent(buildDigikalaOwnScript(baseUrl, token));
}
```

(Exports from Task 6 already list the two `build...Bookmarklet` names — no export change needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/digikala-bookmarklet.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add services/bookmarklet.js test/digikala-bookmarklet.test.js
git commit -m "feat: digikala bookmarklet DOM capture scripts (competitor + seller panel)"
```

---

### Task 8: Frontend page + nav

**Files:**
- Create: `public/digikala.html`
- Create: `public/js/digikala.js`
- Modify: `public/js/header.js` (add nav link)

**Interfaces:**
- Consumes: `/api/digikala/*` routes (Task 6); shared `public/js/api.js` (`api.get/post/patch` + `showToast`), `public/js/header.js` (`initHeader`), `fmtNumber` (defined in `api.js`).
- Produces: a two-tab page (`محصولات من` / `رقبا`) reachable from the nav.

- [ ] **Step 1: Add the nav link in `public/js/header.js`** — insert into `NAV_LINKS` after the `crawled` entry (`header.js:8`)

```js
  { key: 'digikala', label: 'دیجی‌کالا', href: '/digikala.html' },
```

- [ ] **Step 2: Create `public/digikala.html`**

```html
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>دیجی‌کالا – مدیریت واردات چین</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/app.css">
</head>
<body>
<div id="app-header"></div>
<main>
  <div class="card">
    <h2>راه‌اندازی بوکمارک‌ها</h2>
    <p style="font-size:13px;color:var(--muted);line-height:2;">
      «محصولات من» را در صفحه لیست محصولات پنل فروشنده بزن (همه محصولات صفحه یکجا خوانده می‌شوند).
      «رقیب» را روی صفحه عمومی محصول رقیب بزن تا ردیابی قیمتش شروع شود؛ بعد از آن با دکمه بروزرسانی، سرور خودکار قیمت را تازه می‌کند.
    </p>
    <p style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
      <a id="ownBookmarklet" class="btn primary" style="text-decoration:none;" href="#">📥 محصولات من (پنل فروشنده)</a>
      <a id="competitorBookmarklet" class="btn primary" style="text-decoration:none;" href="#">📥 ردیابی رقیب</a>
      <span class="hint" style="font-size:11.5px;color:var(--faint);">این دکمه‌ها را بکش به بوکمارک‌بار (کلیک نکن)</span>
    </p>
  </div>
  <div class="card">
    <div id="tabs" style="display:flex;gap:6px;margin-bottom:14px;">
      <button class="btn tab-btn" data-tab="own">محصولات من</button>
      <button class="btn tab-btn" data-tab="competitor">رقبا</button>
    </div>
    <div id="itemsWrap"><p class="empty">در حال بارگذاری…</p></div>
  </div>
</main>
<div id="toast"></div>
<script src="/js/api.js"></script>
<script src="/js/header.js"></script>
<script src="/js/digikala.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `public/js/digikala.js`**

```js
'use strict';

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let _tab = 'own';
let _products = [];

function tomanLabel(v) {
  return v == null ? '<span style="color:var(--faint);">ناموجود</span>' : `${fmtNumber(v)} تومان`;
}

async function loadItems() {
  const wrap = document.getElementById('itemsWrap');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('primary', b.dataset.tab === _tab));
  try {
    if (_tab === 'own') return renderOwn(wrap, await api.get('/api/digikala/own'));
    return renderCompetitor(wrap, await api.get('/api/digikala/competitor'));
  } catch (e) {
    wrap.innerHTML = `<p class="empty">خطا در بارگذاری: ${escHtml(e.message)}</p>`;
  }
}

function renderOwn(wrap, items) {
  if (!items.length) { wrap.innerHTML = '<p class="empty">هنوز محصولی از پنل فروشنده ثبت نشده.</p>'; return; }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>عنوان</th><th>قیمت</th><th>موجودی</th><th>فروش</th><th>محصول مرتبط</th><th>قیمت‌ها</th></tr></thead>
      <tbody>
        ${items.map(it => `
          <tr data-id="${it.id}">
            <td style="max-width:320px;">${escHtml(it.title)}</td>
            <td>${tomanLabel(it.price)}</td>
            <td>${it.stock == null ? '—' : fmtNumber(it.stock)}</td>
            <td>${it.sales_count == null ? '—' : fmtNumber(it.sales_count)}</td>
            <td>${linkCell(it)}</td>
            <td><button class="btn history-btn" data-kind="own" style="padding:4px 9px;">${fmtNumber(it.price_count)} ↓</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  bindHistory(wrap);
  wrap.querySelectorAll('.link-select').forEach(s => s.addEventListener('change', onLink));
}

function linkCell(it) {
  if (it.product_id) {
    const p = _products.find(x => x.id === it.product_id);
    return `<a class="product-link" href="/product-ledger.html?id=${it.product_id}">${escHtml(p ? p.name : 'محصول')} ←</a>`;
  }
  return `<select class="link-select"><option value="">— اتصال به محصول —</option>${_products.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}</select>`;
}

async function onLink(e) {
  const row = e.target.closest('tr');
  const productId = e.target.value;
  if (!productId) return;
  try {
    await api.patch(`/api/digikala/own/${row.dataset.id}/link`, { product_id: productId });
    showToast('به محصول متصل شد', 'success');
    loadItems();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderCompetitor(wrap, items) {
  if (!items.length) { wrap.innerHTML = '<p class="empty">هنوز رقیبی برای ردیابی ثبت نشده.</p>'; return; }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>عنوان</th><th>فروشنده</th><th>قیمت</th><th>قیمت‌ها</th><th></th></tr></thead>
      <tbody>
        ${items.map(it => `
          <tr data-id="${it.id}">
            <td style="max-width:320px;"><a class="product-link" href="${escHtml(it.url)}" target="_blank" rel="noopener">${escHtml(it.title)}</a></td>
            <td>${escHtml(it.seller_name || '—')}</td>
            <td>${tomanLabel(it.price)}</td>
            <td><button class="btn history-btn" data-kind="competitor" style="padding:4px 9px;">${fmtNumber(it.price_count)} ↓</button></td>
            <td style="white-space:nowrap;">
              <button class="btn refresh-btn" style="padding:5px 10px;">🔄 بروزرسانی</button>
              <button class="btn status-btn" style="padding:5px 10px;">${it.status === 'IGNORED' ? 'بازگردانی' : 'نادیده'}</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  bindHistory(wrap);
  wrap.querySelectorAll('.refresh-btn').forEach(b => b.addEventListener('click', onRefresh));
  wrap.querySelectorAll('.status-btn').forEach(b => b.addEventListener('click', onToggleStatus));
}

async function onRefresh(e) {
  const row = e.target.closest('tr');
  e.target.disabled = true; const t = e.target.textContent; e.target.textContent = '⏳';
  try {
    await api.post(`/api/digikala/competitor/${row.dataset.id}/refresh`, {});
    showToast('قیمت بروزرسانی شد', 'success');
    loadItems();
  } catch (err) {
    showToast(err.message, 'error');
    e.target.disabled = false; e.target.textContent = t;
  }
}

async function onToggleStatus(e) {
  const row = e.target.closest('tr');
  const next = e.target.textContent.trim() === 'نادیده' ? 'IGNORED' : 'ACTIVE';
  try {
    await api.patch(`/api/digikala/competitor/${row.dataset.id}/status`, { status: next });
    loadItems();
  } catch (err) { showToast(err.message, 'error'); }
}

function bindHistory(wrap) {
  wrap.querySelectorAll('.history-btn').forEach(b => b.addEventListener('click', onHistory));
}

async function onHistory(e) {
  const row = e.target.closest('tr');
  const kind = e.target.dataset.kind;
  const next = row.nextElementSibling;
  if (next && next.classList.contains('history-row')) { next.remove(); return; }
  const prices = await api.get(`/api/digikala/${kind}/${row.dataset.id}/prices`);
  const cols = row.children.length;
  const detail = document.createElement('tr');
  detail.className = 'history-row';
  detail.innerHTML = `<td colspan="${cols}" style="background:var(--panel2);font-size:12px;">
    ${prices.length ? prices.map(p => `${escHtml((p.recorded_at || '').slice(0, 16))} — ${p.price == null ? 'ناموجود' : fmtNumber(p.price) + ' تومان'}${p.stock != null ? ' (موجودی ' + fmtNumber(p.stock) + ')' : ''}`).join('<br>') : 'تاریخچه‌ای ثبت نشده'}
  </td>`;
  row.after(detail);
}

async function init() {
  try {
    const bm = await api.get('/api/digikala/bookmarklets');
    document.getElementById('ownBookmarklet').href = bm.own;
    document.getElementById('competitorBookmarklet').href = bm.competitor;
  } catch (e) { /* header handles auth redirect */ }
  document.getElementById('ownBookmarklet').addEventListener('click', ev => ev.preventDefault());
  document.getElementById('competitorBookmarklet').addEventListener('click', ev => ev.preventDefault());
  try { _products = await api.get('/api/products'); } catch (e) { _products = []; }
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => { _tab = b.dataset.tab; loadItems(); }));
  loadItems();
}

initHeader('digikala').then(me => { if (me) init(); });
```

- [ ] **Step 4: Verify in the browser**

Start the dev server, log in (`admin`/`admin123`), open `/digikala.html`. Confirm: nav shows «دیجی‌کالا» highlighted; two tabs render with empty-state text; both bookmarklet buttons have non-`#` hrefs (inspect: they start with `javascript:`); no console errors.

Run (from the browser devtools or via the preview tools): check `document.getElementById('ownBookmarklet').href.startsWith('javascript:')` → `true`.

- [ ] **Step 5: Commit**

```bash
git add public/digikala.html public/js/digikala.js public/js/header.js
git commit -m "feat: digikala frontend page (own + competitor tabs) + nav link"
```

---

### Task 9: Docs + full verification

**Files:**
- Modify: `CLAUDE.md` (add a Digikala subsystem section, mark the phase done)

- [ ] **Step 1: Add a Digikala section to `CLAUDE.md`** — after the "Alibaba bookmarklet crawler (Phase 2)" section, describe: two subsystems (own via seller-panel bookmarklet, competitor via bookmarklet-to-start + server-side `api.digikala.com/v2/product/<dkp>/` refresh), Rial→Toman on the API side, tables `digikala_own_items`/`digikala_competitor_items` (+ history), route prefix `/api/digikala`, reuses the crawl token. Update the earlier line that calls the Digikala crawler "a separate, later phase" to note it now exists.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all PASS (existing 26 + new: parse 8, service 4, competitor 8, own 5, bookmarklet 2 = 53 total), 0 fail.

- [ ] **Step 3: End-to-end server smoke test** (dev server running)

```bash
TOKEN=$(node -e "process.env.CIM_DB_PATH='data/app.sqlite';console.log(require('./helpers/settings').getOrCreateCrawlToken())")
# competitor capture via token (simulates the bookmarklet)
curl -s -X POST http://localhost:3000/api/digikala/competitor/capture -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"item\":{\"url\":\"https://www.digikala.com/product/dkp-13715199/x/\",\"title\":\"تست رقیب\",\"price_raw\":\"۶۴۰,۰۰۰ تومان\",\"seller_name\":\"رقیب\"}}"
```
Expected: `{"ok":true,"id":<n>,"created":true}`. Then log in via browser, open `/digikala.html` → «رقبا» tab shows the item; click «🔄 بروزرسانی» → real server-side API call updates price from live Digikala (verify no error toast).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document digikala crawler subsystem in CLAUDE.md"
```

---

## Live handoff (user-assisted, not a code task)

The seller-panel bookmarklet selectors (Task 7 own script) are best-guess and must be calibrated on the real `seller.digikala.com` product-list DOM, exactly like the Alibaba live-capture step was handed off in Phase 2. After deploy: drag both bookmarklets to the bookmark bar, run the own one on the seller panel list page, and adjust the row/price/stock selectors if the capture count is wrong. The competitor bookmarklet runs on any public product page and should work without calibration (public DOM), but verify the price node selector.

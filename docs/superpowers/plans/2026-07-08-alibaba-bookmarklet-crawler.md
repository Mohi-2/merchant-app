# Alibaba Bookmarklet Crawler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture Alibaba product data (title, CNY price, link, image, MOQ, seller) from the user's own browser via a bookmarklet, review captured items in a new app page, and convert them to products with one click; price history accumulates on re-capture.

**Architecture:** A self-contained `javascript:` bookmarklet scrapes RAW strings from Alibaba pages and POSTs them cross-origin to a token-authenticated, CORS-enabled capture endpoint. All parsing (price ranges, URL normalization) happens server-side in pure, unit-tested functions. Captured items live in `crawled_items` (+ `crawled_prices` history), reviewed in a new «کرالر علی‌بابا» page.

**Tech Stack:** Express, better-sqlite3, vanilla JS frontend (existing app conventions), `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-07-08-alibaba-bookmarklet-crawler-design.md`

## Global Constraints

- Repo: `/Users/mohammadhaddadi/Claude/Projects/china-import-manager` (all paths below relative to it).
- Follow existing conventions: success = bare `res.json(obj)`; failure = `res.status(4xx).json({ error: 'پیام فارسی' })`; helpers are sync (better-sqlite3); UI is RTL Persian static HTML + vanilla JS sharing `js/api.js`, `js/header.js`, `css/app.css`.
- `crawled_items.status` ∈ `NEW|ADDED|IGNORED`; capture NEVER changes `status`.
- Bookmarklet extracts raw strings only — no numeric parsing client-side.
- The dev server may be running via nodemon (port 3003 in the current session); restart picks up schema changes automatically.

---

### Task 1: Pure parsers (`helpers/parse.js`) — TDD

**Files:**
- Create: `helpers/parse.js`
- Create: `test/parse.test.js`
- Modify: `package.json` (add `"test": "node --test test/"` script)

**Interfaces:**
- Produces: `parsePriceRange(raw: string) => {min:number, max:number}|null`, `normalizeAlibabaUrl(href: string) => string|null`, `extractAlibabaId(url: string) => string|null` — consumed by Task 3 (`helpers/crawl.js`).

- [ ] **Step 1: Write the failing tests**

```js
// test/parse.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parsePriceRange, normalizeAlibabaUrl, extractAlibabaId } = require('../helpers/parse');

test('parsePriceRange: single price', () => {
  assert.deepStrictEqual(parsePriceRange('¥12.5'), { min: 12.5, max: 12.5 });
});

test('parsePriceRange: range with fullwidth yen and dash', () => {
  assert.deepStrictEqual(parsePriceRange('￥12.5-15.8'), { min: 12.5, max: 15.8 });
});

test('parsePriceRange: comma thousands and spaced hyphen', () => {
  assert.deepStrictEqual(parsePriceRange('¥1,234.00 - ¥2,000'), { min: 1234, max: 2000 });
});

test('parsePriceRange: en-dash and tilde variants', () => {
  assert.deepStrictEqual(parsePriceRange('¥3–5'), { min: 3, max: 5 });
  assert.deepStrictEqual(parsePriceRange('¥3~5'), { min: 3, max: 5 });
});

test('parsePriceRange: swapped order still returns min<=max', () => {
  assert.deepStrictEqual(parsePriceRange('¥15.8-12.5'), { min: 12.5, max: 15.8 });
});

test('parsePriceRange: garbage returns null', () => {
  assert.strictEqual(parsePriceRange(''), null);
  assert.strictEqual(parsePriceRange(null), null);
  assert.strictEqual(parsePriceRange('contact supplier'), null);
});

test('normalizeAlibabaUrl: strips query and hash', () => {
  assert.strictEqual(
    normalizeAlibabaUrl('https://www.alibaba.com/product-detail/Pot_123456789.html?spm=a2700&s=p#anchor'),
    'https://www.alibaba.com/product-detail/Pot_123456789.html'
  );
});

test('normalizeAlibabaUrl: resolves relative href', () => {
  assert.strictEqual(
    normalizeAlibabaUrl('/product-detail/Pot_123.html?x=1'),
    'https://www.alibaba.com/product-detail/Pot_123.html'
  );
});

test('normalizeAlibabaUrl: invalid input returns null', () => {
  assert.strictEqual(normalizeAlibabaUrl(''), null);
  assert.strictEqual(normalizeAlibabaUrl(null), null);
});

test('extractAlibabaId: trailing _digits.html', () => {
  assert.strictEqual(extractAlibabaId('https://www.alibaba.com/product-detail/Pot_123456789.html'), '123456789');
  assert.strictEqual(extractAlibabaId('https://www.alibaba.com/showroom/pots.html'), null);
});
```

- [ ] **Step 2: Add test script and run to verify failure**

In `package.json` `"scripts"` add: `"test": "node --test test/"`.

Run: `npm test`
Expected: FAIL — `Cannot find module '../helpers/parse'`

- [ ] **Step 3: Write the implementation**

```js
// helpers/parse.js
'use strict';

// "¥12.5", "￥12.5-15.8", "¥1,234.00 - ¥2,000" (dash/en-dash/em-dash/~) → {min,max}|null
function parsePriceRange(raw) {
  if (!raw) return null;
  const nums = String(raw).match(/\d[\d,]*\.?\d*/g);
  if (!nums) return null;
  const vals = nums.map(n => Number(n.replace(/,/g, ''))).filter(n => !Number.isNaN(n));
  if (!vals.length) return null;
  const a = vals[0];
  const b = vals.length > 1 ? vals[1] : vals[0];
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

// origin+pathname only (query/hash stripped); relative hrefs resolve against alibaba.com
function normalizeAlibabaUrl(href) {
  if (!href) return null;
  let u;
  try { u = new URL(href, 'https://www.alibaba.com'); } catch { return null; }
  return u.origin + u.pathname;
}

function extractAlibabaId(url) {
  const m = String(url || '').match(/_(\d+)\.html/);
  return m ? m[1] : null;
}

module.exports = { parsePriceRange, normalizeAlibabaUrl, extractAlibabaId };
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: all `parse` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add helpers/parse.js test/parse.test.js package.json
git commit -m "feat: price/url parsers for Alibaba capture"
```

---

### Task 2: Schema additions, test-overridable DB path, settings helper

**Files:**
- Modify: `db/schema.sql` (append three tables)
- Modify: `helpers/db.js` (env-overridable path)
- Create: `helpers/settings.js`
- Create: `test/settings.test.js`

**Interfaces:**
- Produces: `getOrCreateCrawlToken() => string` (stable across calls; crypto-random hex, stored in `settings` under key `crawl_token`) — consumed by Task 5.
- Produces: env var `CIM_DB_PATH` — set to `:memory:` in test files BEFORE requiring any helper, so tests run on a throwaway DB.

- [ ] **Step 1: Append to `db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crawled_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  alibaba_id     TEXT,
  url            TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  image_url      TEXT,
  price_raw      TEXT,
  price_min_cny  REAL,
  price_max_cny  REAL,
  moq            TEXT,
  seller_name    TEXT,
  source_page    TEXT CHECK (source_page IN ('SEARCH','PRODUCT')),
  status         TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','ADDED','IGNORED')),
  product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
  first_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_crawled_items_status ON crawled_items(status);

CREATE TABLE IF NOT EXISTS crawled_prices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crawled_item_id INTEGER NOT NULL REFERENCES crawled_items(id) ON DELETE CASCADE,
  price_raw       TEXT,
  price_min_cny   REAL,
  price_max_cny   REAL,
  captured_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_crawled_prices_item ON crawled_prices(crawled_item_id);
```

- [ ] **Step 2: Make DB path overridable in `helpers/db.js`**

Replace the `const db = new Database(...)` line so the path honors `CIM_DB_PATH`:

```js
const DB_PATH = process.env.CIM_DB_PATH || path.join(DATA_DIR, 'app.sqlite');
const db = new Database(DB_PATH);
```

(Keep the `DATA_DIR` mkdir above it — harmless when using `:memory:`.)

- [ ] **Step 3: Write the failing test**

```js
// test/settings.test.js
'use strict';
process.env.CIM_DB_PATH = ':memory:';
const { test } = require('node:test');
const assert = require('node:assert');
const { getSetting, setSetting, getOrCreateCrawlToken } = require('../helpers/settings');

test('set/get roundtrip and upsert', () => {
  setSetting('foo', 'bar');
  assert.strictEqual(getSetting('foo'), 'bar');
  setSetting('foo', 'baz');
  assert.strictEqual(getSetting('foo'), 'baz');
});

test('crawl token is created once and stays stable', () => {
  const t1 = getOrCreateCrawlToken();
  const t2 = getOrCreateCrawlToken();
  assert.match(t1, /^[0-9a-f]{32}$/);
  assert.strictEqual(t1, t2);
});
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../helpers/settings'`

- [ ] **Step 4: Implement `helpers/settings.js`**

```js
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
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test`
Expected: parse + settings tests PASS.

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql helpers/db.js helpers/settings.js test/settings.test.js
git commit -m "feat: crawl tables, settings store, test-overridable db path"
```

---

### Task 3: Capture/upsert helper (`helpers/crawl.js`) — TDD

**Files:**
- Create: `helpers/crawl.js`
- Create: `test/crawl.test.js`

**Interfaces:**
- Consumes: Task 1 parsers; Task 2 schema.
- Produces (consumed by Task 5 routes):
  - `captureItems(rawItems: Array<{url,title,image_url,price_raw,moq,seller_name}>, pageType: 'SEARCH'|'PRODUCT') => {created:number, updated:number, total:number}`
  - `listItems(status?: string) => rows` (each row includes `price_count` and, when ADDED, `product_id`)
  - `listPrices(itemId) => rows` (newest first)
  - `addProductFromItem(itemId, {name, category_id, unit_label}) => productId` (throws `{status:404}` if item missing)
  - `setStatus(itemId, 'NEW'|'IGNORED') => boolean` (false if item missing)

- [ ] **Step 1: Write the failing tests**

```js
// test/crawl.test.js
'use strict';
process.env.CIM_DB_PATH = ':memory:';
const { test } = require('node:test');
const assert = require('node:assert');
const db = require('../helpers/db');
const { captureItems, listItems, listPrices, addProductFromItem, setStatus } = require('../helpers/crawl');

const ITEM = {
  url: 'https://www.alibaba.com/product-detail/Pot_111.html?spm=x',
  title: 'Stainless Steel Pot',
  image_url: 'https://img.example/p.jpg',
  price_raw: '¥12.5-15.8',
  moq: '2 pieces (Min. order)',
  seller_name: 'Yiwu Kitchen Co',
};

test('capture creates item + first price row, normalized url', () => {
  const r = captureItems([ITEM], 'SEARCH');
  assert.deepStrictEqual(r, { created: 1, updated: 0, total: 1 });
  const rows = listItems('NEW');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].url, 'https://www.alibaba.com/product-detail/Pot_111.html');
  assert.strictEqual(rows[0].alibaba_id, '111');
  assert.strictEqual(rows[0].price_min_cny, 12.5);
  assert.strictEqual(rows[0].price_max_cny, 15.8);
  assert.strictEqual(listPrices(rows[0].id).length, 1);
});

test('re-capture same url+price updates in place, no new price row', () => {
  const r = captureItems([ITEM], 'SEARCH');
  assert.deepStrictEqual(r, { created: 0, updated: 1, total: 1 });
  const rows = listItems('NEW');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(listPrices(rows[0].id).length, 1);
});

test('re-capture with changed price appends history row', () => {
  captureItems([{ ...ITEM, price_raw: '¥13-16' }], 'PRODUCT');
  const rows = listItems('NEW');
  assert.strictEqual(rows[0].price_min_cny, 13);
  assert.strictEqual(listPrices(rows[0].id).length, 2);
});

test('items without title or url are skipped silently', () => {
  const r = captureItems([{ url: '', title: 'x' }, { url: 'https://www.alibaba.com/p_1.html', title: '' }], 'SEARCH');
  assert.deepStrictEqual(r, { created: 0, updated: 0, total: 0 });
});

test('add-product creates product, links item, sets ADDED', () => {
  const item = listItems('NEW')[0];
  const productId = addProductFromItem(item.id, { name: 'قابلمه استیل', category_id: null, unit_label: 'عدد' });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  assert.strictEqual(product.alibaba_link, item.url);
  assert.strictEqual(product.image_url, item.image_url);
  const after = listItems('ADDED')[0];
  assert.strictEqual(after.id, item.id);
  assert.strictEqual(after.product_id, productId);
});

test('capture after ADDED keeps status, still appends price history', () => {
  captureItems([{ ...ITEM, price_raw: '¥14' }], 'SEARCH');
  const rows = listItems('ADDED');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(listPrices(rows[0].id).length, 3);
});

test('setStatus toggles IGNORED/NEW and rejects unknown id', () => {
  captureItems([{ ...ITEM, url: 'https://www.alibaba.com/product-detail/Pan_222.html', title: 'Pan' }], 'SEARCH');
  const pan = listItems('NEW').find(r => r.title === 'Pan');
  assert.strictEqual(setStatus(pan.id, 'IGNORED'), true);
  assert.strictEqual(listItems('IGNORED').length, 1);
  assert.strictEqual(setStatus(pan.id, 'NEW'), true);
  assert.strictEqual(setStatus(999999, 'IGNORED'), false);
});

test('addProductFromItem throws 404 for missing item', () => {
  assert.throws(() => addProductFromItem(999999, { name: 'x', unit_label: 'y' }), e => e.status === 404);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '../helpers/crawl'`

- [ ] **Step 3: Implement `helpers/crawl.js`**

```js
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
  for (const raw of rawItems) {
    const url = normalizeAlibabaUrl(raw.url);
    const title = String(raw.title || '').trim().slice(0, 300);
    if (!url || !title) continue;
    const price = parsePriceRange(raw.price_raw);
    const fields = {
      title,
      image_url: raw.image_url || null,
      price_raw: raw.price_raw || null,
      price_min_cny: price ? price.min : null,
      price_max_cny: price ? price.max : null,
      moq: raw.moq || null,
      seller_name: raw.seller_name || null,
    };
    const existing = getByUrlStmt.get(url);
    if (existing) {
      updateItemStmt.run({ ...fields, id: existing.id });
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
  ).run(name, category_id || null, unit_label, item.url, item.image_url);
  db.prepare("UPDATE crawled_items SET status = 'ADDED', product_id = ? WHERE id = ?").run(info.lastInsertRowid, itemId);
  return info.lastInsertRowid;
});

function setStatus(itemId, status) {
  const info = db.prepare('UPDATE crawled_items SET status = ? WHERE id = ?').run(status, itemId);
  return info.changes > 0;
}

module.exports = { captureItems, listItems, listPrices, addProductFromItem, setStatus };
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: all tests PASS (parse + settings + crawl).

- [ ] **Step 5: Commit**

```bash
git add helpers/crawl.js test/crawl.test.js
git commit -m "feat: crawl capture/upsert helper with price history"
```

---

### Task 4: Bookmarklet builder (`services/bookmarklet.js`)

**Files:**
- Create: `services/bookmarklet.js`
- Create: `test/bookmarklet.test.js`

**Interfaces:**
- Produces: `buildBookmarklet(baseUrl: string, token: string) => string` (a `javascript:`-prefixed, URI-encoded script) — consumed by Task 5's `GET /api/crawl/bookmarklet`.

The client script extracts raw strings only and POSTs `{token, page_type, items}` to `<baseUrl>/api/crawl/capture`. It must be fully self-contained (no external script loading).

- [ ] **Step 1: Write the failing test**

```js
// test/bookmarklet.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildBookmarklet } = require('../services/bookmarklet');

test('bookmarklet embeds base url and token, is a javascript: URI', () => {
  const bm = buildBookmarklet('http://localhost:3003', 'abc123');
  assert.ok(bm.startsWith('javascript:'));
  const decoded = decodeURIComponent(bm.slice('javascript:'.length));
  assert.ok(decoded.includes('"http://localhost:3003"'));
  assert.ok(decoded.includes('"abc123"'));
  assert.ok(decoded.includes('/api/crawl/capture'));
  assert.ok(decoded.includes('/product-detail/'));
});
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../services/bookmarklet'`

- [ ] **Step 2: Implement `services/bookmarklet.js`**

```js
'use strict';

// Client-side capture script (runs on alibaba.com). Extracts RAW strings only;
// all numeric parsing happens server-side (helpers/parse.js). Must stay fully
// self-contained: page CSP can block external scripts, not inline javascript: URIs.
function buildCaptureScript(baseUrl, token) {
  return `(function(){
var BASE=${JSON.stringify(baseUrl)},TOKEN=${JSON.stringify(token)};
function txt(el){return el&&el.textContent?el.textContent.trim():''}
function priceIn(s){var m=s.match(/[\\u00A5\\uFFE5]\\s*[\\d.,]+(?:\\s*[-\\u2013\\u2014~]\\s*[\\u00A5\\uFFE5]?\\s*[\\d.,]+)?/);return m?m[0]:''}
function toast(msg,ok){var d=document.createElement('div');d.textContent=msg;d.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;padding:12px 18px;border-radius:10px;font:600 14px/1.4 sans-serif;direction:rtl;color:#fff;background:'+(ok?'#16a34a':'#ef4444')+';box-shadow:0 6px 20px rgba(0,0,0,.3)';document.body.appendChild(d);setTimeout(function(){d.remove()},5000)}
var isProduct=location.pathname.indexOf('/product-detail/')>-1;
var items=[];
if(isProduct){
  var h1=document.querySelector('h1');
  var pr='';var pel=document.querySelector('[class*="price"]');if(pel)pr=priceIn(txt(pel));
  if(!pr)pr=priceIn(txt(document.body).slice(0,8000));
  var mel=document.querySelector('[class*="moq"],[class*="min-order"],[class*="minOrder"]');
  var sel=document.querySelector('a[href*="company_profile"]');
  var img=document.querySelector('[class*="main"] img,[class*="gallery"] img,img');
  items.push({url:location.href,title:txt(h1)||document.title,image_url:img?(img.src||''):'',price_raw:pr,moq:txt(mel),seller_name:txt(sel)});
}else{
  var seen={};
  var links=document.querySelectorAll('a[href*="/product-detail/"]');
  for(var i=0;i<links.length;i++){
    var a=links[i];var href=(a.href||'').split('?')[0].split('#')[0];
    if(!href||seen[href])continue;
    var card=a.closest('[class*="card"],[class*="item"],[class*="gallery"],[class*="product"]')||a.parentElement;
    var up=0;while(card&&card.textContent.trim().length<40&&up<3){card=card.parentElement;up++}
    if(!card)continue;
    var title=a.getAttribute('title')||'';
    if(!title){var ai=card.querySelector('img[alt]');if(ai&&ai.alt)title=ai.alt}
    if(!title)title=txt(a);
    var pr2=priceIn(txt(card));
    if(!title||!pr2)continue;
    seen[href]=1;
    var img2=card.querySelector('img');
    var mm=txt(card).match(/(?:Min\\.?\\s*order|MOQ)[:\\s]*[\\d.,]+\\s*\\w*/i);
    var sel2=card.querySelector('a[href*="company_profile"]');
    items.push({url:href,title:title.slice(0,300),image_url:img2?(img2.src||img2.getAttribute('data-src')||''):'',price_raw:pr2,moq:mm?mm[0]:'',seller_name:txt(sel2)});
  }
}
if(!items.length){toast('\\u0645\\u062d\\u0635\\u0648\\u0644\\u06cc \\u062f\\u0631 \\u0627\\u06cc\\u0646 \\u0635\\u0641\\u062d\\u0647 \\u067e\\u06cc\\u062f\\u0627 \\u0646\\u0634\\u062f',false);return}
fetch(BASE+'/api/crawl/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN,page_type:isProduct?'PRODUCT':'SEARCH',items:items})})
.then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d})})
.then(function(d){toast(d.total+' \\u0645\\u062d\\u0635\\u0648\\u0644 \\u0630\\u062e\\u06cc\\u0631\\u0647 \\u0634\\u062f ('+d.created+' \\u062c\\u062f\\u06cc\\u062f)',true)})
.catch(function(e){toast('\\u062e\\u0637\\u0627: '+e.message,false)});
})();`;
}

function buildBookmarklet(baseUrl, token) {
  return 'javascript:' + encodeURIComponent(buildCaptureScript(baseUrl, token));
}

module.exports = { buildBookmarklet, buildCaptureScript };
```

(Persian toast strings are `\uXXXX`-escaped so the generated URI survives any encoding step; `¥`/`￥` are `¥`/`￥`.)

- [ ] **Step 3: Run tests to verify pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add services/bookmarklet.js test/bookmarklet.test.js
git commit -m "feat: self-contained Alibaba capture bookmarklet builder"
```

---

### Task 5: Routes (`routes/crawl.js`) + server mount

**Files:**
- Create: `routes/crawl.js`
- Modify: `server.js` (mount after line `app.use('/api/exchange-rate', ...)`)

**Interfaces:**
- Consumes: Task 3 helper functions, Task 2 `getOrCreateCrawlToken`, Task 4 `buildBookmarklet`, existing `requireAuth` from `helpers/middleware.js`.
- Produces HTTP API (consumed by Task 6 frontend and the bookmarklet):
  - `POST /api/crawl/capture` — body `{token, page_type, items[]}`; 401 bad token, 400 empty items; 200 `{ok:true, created, updated, total}`; CORS for `*.alibaba.com` origins incl. OPTIONS preflight.
  - `GET /api/crawl/bookmarklet` → `{bookmarklet}` (session auth).
  - `GET /api/crawl/items?status=NEW` → rows.
  - `GET /api/crawl/items/:id/prices` → rows.
  - `POST /api/crawl/items/:id/add-product` — body `{name, category_id?, unit_label}`; 400 missing fields; 404 missing item; 201 `{product_id}`.
  - `POST /api/crawl/items/:id/ignore` / `POST /api/crawl/items/:id/unignore` — 404 if missing; `{ok:true}`.

- [ ] **Step 1: Implement `routes/crawl.js`**

```js
'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../helpers/middleware');
const { getOrCreateCrawlToken } = require('../helpers/settings');
const { buildBookmarklet } = require('../services/bookmarklet');
const { captureItems, listItems, listPrices, addProductFromItem, setStatus } = require('../helpers/crawl');

const ALIBABA_ORIGIN = /^https?:\/\/([a-z0-9-]+\.)*alibaba\.com$/i;

// CORS only on /capture: the bookmarklet posts cross-origin from alibaba.com,
// authenticated by the crawl token (session cookies are not sent cross-site).
router.use('/capture', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALIBABA_ORIGIN.test(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

router.post('/capture', (req, res) => {
  const { token, page_type, items } = req.body || {};
  if (!token || token !== getOrCreateCrawlToken()) {
    return res.status(401).json({ error: 'توکن کپچر نامعتبر است' });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'هیچ آیتمی ارسال نشده' });
  }
  res.json({ ok: true, ...captureItems(items, page_type) });
});

router.get('/bookmarklet', requireAuth, (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({ bookmarklet: buildBookmarklet(base, getOrCreateCrawlToken()) });
});

router.get('/items', requireAuth, (req, res) => {
  res.json(listItems(req.query.status));
});

router.get('/items/:id/prices', requireAuth, (req, res) => {
  res.json(listPrices(req.params.id));
});

router.post('/items/:id/add-product', requireAuth, (req, res) => {
  const { name, category_id, unit_label } = req.body || {};
  if (!name || !unit_label) {
    return res.status(400).json({ error: 'نام و واحد شمارش الزامی است' });
  }
  try {
    const productId = addProductFromItem(req.params.id, { name, category_id, unit_label });
    res.status(201).json({ product_id: productId });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'خطا در افزودن محصول' });
  }
});

router.post('/items/:id/ignore', requireAuth, (req, res) => {
  if (!setStatus(req.params.id, 'IGNORED')) return res.status(404).json({ error: 'آیتم یافت نشد' });
  res.json({ ok: true });
});

router.post('/items/:id/unignore', requireAuth, (req, res) => {
  if (!setStatus(req.params.id, 'NEW')) return res.status(404).json({ error: 'آیتم یافت نشد' });
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 2: Mount in `server.js`**

After the `app.use('/api/exchange-rate', ...)` line add:

```js
app.use('/api/crawl', require('./routes/crawl'));
```

- [ ] **Step 3: Verify with curl** (server running — nodemon auto-restarts; DB gains the new tables on restart)

```bash
COOKIES=/tmp/cim_cookies.txt
curl -s -c $COOKIES -X POST http://localhost:3003/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' > /dev/null

# token + bookmarklet
curl -s -b $COOKIES http://localhost:3003/api/crawl/bookmarklet | head -c 120
TOKEN=$(sqlite3 data/app.sqlite "SELECT value FROM settings WHERE key='crawl_token'")

# bad token → 401
curl -s -w '\n%{http_code}\n' -X POST http://localhost:3003/api/crawl/capture -H 'Content-Type: application/json' -d '{"token":"bad","items":[{"url":"x","title":"y"}]}'

# preflight → 204 with CORS headers
curl -s -i -X OPTIONS http://localhost:3003/api/crawl/capture -H 'Origin: https://www.alibaba.com' | head -6

# valid capture → created:1
curl -s -X POST http://localhost:3003/api/crawl/capture -H 'Content-Type: application/json' -H 'Origin: https://www.alibaba.com' \
  -d "{\"token\":\"$TOKEN\",\"page_type\":\"SEARCH\",\"items\":[{\"url\":\"https://www.alibaba.com/product-detail/Test_999.html?spm=1\",\"title\":\"Test Pot\",\"price_raw\":\"¥10-12\",\"moq\":\"2 pieces\",\"seller_name\":\"Test Co\"}]}"

# items list shows it; add-product; ignore/unignore round-trip
curl -s -b $COOKIES "http://localhost:3003/api/crawl/items?status=NEW"
```

Expected: 401 body has Persian error; OPTIONS shows `Access-Control-Allow-Origin: https://www.alibaba.com`; capture returns `{"ok":true,"created":1,...}`; list returns the item.

- [ ] **Step 4: Commit**

```bash
git add routes/crawl.js server.js
git commit -m "feat: crawl capture API with CORS + token auth, bookmarklet endpoint"
```

---

### Task 6: Frontend — crawler page + nav link

**Files:**
- Create: `public/crawled.html`
- Create: `public/js/crawled.js`
- Modify: `public/js/header.js` (add nav link to `NAV_LINKS` after the purchases entry)

**Interfaces:**
- Consumes: Task 5 HTTP API; existing `api`, `showToast`, `fmtNumber` (js/api.js), `initHeader` (js/header.js), `GET /api/categories`, `GET /api/exchange-rate/latest`.

- [ ] **Step 1: Add nav link in `public/js/header.js`**

In `NAV_LINKS`, after the purchases entry add:

```js
  { key: 'crawled', label: 'کرالر علی‌بابا', href: '/crawled.html' },
```

- [ ] **Step 2: Create `public/crawled.html`**

```html
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>کرالر علی‌بابا – مدیریت واردات چین</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/app.css">
</head>
<body>
<div id="app-header"></div>
<main>
  <div class="card">
    <h2>راه‌اندازی</h2>
    <p style="font-size:13px;color:var(--muted);line-height:2;">
      ۱) دکمه زیر را به نوار بوکمارک مرورگر بکش. ۲) در Alibaba.com کشور تحویل (Deliver to) را روی China بگذار تا قیمت‌ها یوان شوند.
      ۳) روی صفحه نتایج جستجو یا صفحه محصول، بوکمارک را بزن — محصولات همینجا ظاهر می‌شوند.
    </p>
    <p style="margin-top:10px;">
      <a id="bookmarkletLink" class="btn primary" style="text-decoration:none;display:inline-block;" href="#">📥 ذخیره در اپ واردات</a>
      <span class="hint" style="font-size:11.5px;color:var(--faint);margin-right:10px;">این دکمه را بکش به بوکمارک‌بار (کلیک نکن)</span>
    </p>
  </div>
  <div class="card">
    <h2>محصولات کرال‌شده</h2>
    <div id="tabs" style="display:flex;gap:6px;margin-bottom:14px;">
      <button class="btn tab-btn" data-status="NEW">جدید</button>
      <button class="btn tab-btn" data-status="ADDED">افزوده‌شده</button>
      <button class="btn tab-btn" data-status="IGNORED">نادیده‌گرفته</button>
    </div>
    <div id="itemsWrap"><p class="empty">در حال بارگذاری…</p></div>
  </div>
</main>
<div id="toast"></div>
<script src="/js/api.js"></script>
<script src="/js/header.js"></script>
<script src="/js/crawled.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create `public/js/crawled.js`**

```js
'use strict';

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let _status = 'NEW';
let _categories = [];
let _rate = null;

function priceLabel(item) {
  if (item.price_min_cny == null) return escHtml(item.price_raw || '—');
  const range = item.price_min_cny === item.price_max_cny
    ? `¥${fmtNumber(item.price_min_cny)}`
    : `¥${fmtNumber(item.price_min_cny)} – ¥${fmtNumber(item.price_max_cny)}`;
  if (!_rate) return range;
  const toman = Math.round(item.price_min_cny * _rate.cny_to_irr);
  return `${range}<br><span style="font-size:11px;color:var(--faint);">≈ ${fmtNumber(toman)} تومان</span>`;
}

function rowActions(item) {
  if (_status === 'NEW') {
    return `<button class="btn add-btn" style="padding:5px 10px;">افزودن به محصولات</button>
            <button class="btn ignore-btn" style="padding:5px 10px;">نادیده گرفتن</button>`;
  }
  if (_status === 'IGNORED') {
    return `<button class="btn unignore-btn" style="padding:5px 10px;">بازگردانی</button>`;
  }
  return item.product_id
    ? `<a class="product-link" href="/product-ledger.html?id=${item.product_id}">محصول ←</a>` : '—';
}

async function loadItems() {
  const wrap = document.getElementById('itemsWrap');
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('primary', b.dataset.status === _status);
  });
  try {
    const items = await api.get(`/api/crawl/items?status=${_status}`);
    if (!items.length) {
      wrap.innerHTML = '<p class="empty">آیتمی در این بخش نیست.</p>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th></th><th>عنوان</th><th>قیمت (یوان)</th><th>حداقل سفارش</th><th>فروشنده</th><th>قیمت‌ها</th><th></th></tr></thead>
        <tbody>
          ${items.map(it => `
            <tr data-id="${it.id}" data-title="${escHtml(it.title)}">
              <td>${it.image_url ? `<img class="thumb" src="${escHtml(it.image_url)}" onerror="this.style.visibility='hidden'">` : ''}</td>
              <td style="max-width:340px;"><a class="product-link" href="${escHtml(it.url)}" target="_blank" rel="noopener">${escHtml(it.title)}</a></td>
              <td>${priceLabel(it)}</td>
              <td>${escHtml(it.moq || '—')}</td>
              <td>${escHtml(it.seller_name || '—')}</td>
              <td><button class="btn history-btn" style="padding:4px 9px;">${fmtNumber(it.price_count)} ↓</button></td>
              <td style="white-space:nowrap;">${rowActions(it)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll('.add-btn').forEach(b => b.addEventListener('click', onAdd));
    wrap.querySelectorAll('.ignore-btn').forEach(b => b.addEventListener('click', e => onSetStatus(e, 'ignore')));
    wrap.querySelectorAll('.unignore-btn').forEach(b => b.addEventListener('click', e => onSetStatus(e, 'unignore')));
    wrap.querySelectorAll('.history-btn').forEach(b => b.addEventListener('click', onHistory));
  } catch (e) {
    wrap.innerHTML = `<p class="empty">خطا در بارگذاری: ${escHtml(e.message)}</p>`;
  }
}

async function onHistory(e) {
  const row = e.target.closest('tr');
  const next = row.nextElementSibling;
  if (next && next.classList.contains('history-row')) { next.remove(); return; }
  const prices = await api.get(`/api/crawl/items/${row.dataset.id}/prices`);
  const detail = document.createElement('tr');
  detail.className = 'history-row';
  detail.innerHTML = `<td colspan="7" style="background:var(--panel2);font-size:12px;">
    ${prices.length ? prices.map(p => `${escHtml((p.captured_at || '').slice(0, 16))} — ${escHtml(p.price_raw || `${p.price_min_cny}-${p.price_max_cny}`)}`).join('<br>') : 'تاریخچه‌ای ثبت نشده'}
  </td>`;
  row.after(detail);
}

async function onSetStatus(e, action) {
  const row = e.target.closest('tr');
  try {
    await api.post(`/api/crawl/items/${row.dataset.id}/${action}`, {});
    showToast(action === 'ignore' ? 'نادیده گرفته شد' : 'بازگردانده شد', 'success');
    loadItems();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function onAdd(e) {
  const row = e.target.closest('tr');
  const existing = row.nextElementSibling;
  if (existing && existing.classList.contains('add-row')) { existing.remove(); return; }
  const detail = document.createElement('tr');
  detail.className = 'add-row';
  detail.innerHTML = `<td colspan="7" style="background:var(--panel2);">
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;padding:6px 0;">
      <div class="field" style="flex:2;min-width:220px;"><label>نام محصول</label><input type="text" class="add-name" value="${escHtml(row.dataset.title)}"></div>
      <div class="field" style="flex:1;min-width:140px;"><label>دسته‌بندی</label><select class="add-category"><option value="">بدون دسته‌بندی</option>${_categories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}</select></div>
      <div class="field" style="flex:1;min-width:140px;"><label>واحد شمارش</label><input type="text" class="add-unit" placeholder="مثلاً عدد"></div>
      <button class="btn primary add-confirm" style="padding:10px 16px;">ثبت محصول</button>
    </div>
  </td>`;
  row.after(detail);
  detail.querySelector('.add-confirm').addEventListener('click', async () => {
    const name = detail.querySelector('.add-name').value.trim();
    const unit = detail.querySelector('.add-unit').value.trim();
    if (!name || !unit) { showToast('نام و واحد شمارش الزامی است', 'error'); return; }
    try {
      await api.post(`/api/crawl/items/${row.dataset.id}/add-product`, {
        name, unit_label: unit,
        category_id: detail.querySelector('.add-category').value || null,
      });
      showToast('به محصولات اضافه شد', 'success');
      loadItems();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function init() {
  try {
    const { bookmarklet } = await api.get('/api/crawl/bookmarklet');
    document.getElementById('bookmarkletLink').href = bookmarklet;
  } catch (e) { /* header already handles auth redirect */ }
  document.getElementById('bookmarkletLink').addEventListener('click', ev => ev.preventDefault());
  try { _categories = await api.get('/api/categories'); } catch (e) { _categories = []; }
  try { _rate = await api.get('/api/exchange-rate/latest'); } catch (e) { _rate = null; }
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => { _status = b.dataset.status; loadItems(); }));
  loadItems();
}

initHeader('crawled').then(me => { if (me) init(); });
```

- [ ] **Step 4: Verify in browser preview**

With the dev server running: open `/crawled.html`, confirm (a) nav shows «کرالر علی‌بابا» highlighted, (b) bookmarklet link `href` starts with `javascript:`, (c) the item captured via curl in Task 5 appears under «جدید» with price `¥10 – ¥12`, (d) «افزودن به محصولات» inline form creates a product (check `/products.html`), row moves to «افزوده‌شده» with a working «محصول ←» link, (e) ignore/unignore round-trip works, (f) price-history toggle shows the captured price row.

- [ ] **Step 5: Commit**

```bash
git add public/crawled.html public/js/crawled.js public/js/header.js
git commit -m "feat: Alibaba crawler page — bookmarklet setup + capture inbox"
```

---

### Task 7: End-to-end acceptance

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: every test file passes.

- [ ] **Step 2: Simulated capture round-trip** (curl, mirrors what the bookmarklet sends)

1. Capture 2 items in one batch (one with price range, one without price) → `created:2`.
2. Re-send same batch → `updated:2`, no new price rows (check `GET /api/crawl/items/:id/prices`).
3. Re-send with one changed price → that item gains a history row.
4. Add one item to products → appears on products page with `alibaba_link` + image; capture it again → stays `ADDED`, history grows.

- [ ] **Step 3: Live Alibaba test (real browser)**

On a real `alibaba.com` search page (deliver-to China) run the bookmarklet from the bookmarks bar; expect the on-page toast «N محصول ذخیره شد» and items in the app inbox. If extraction misses fields, tune selectors in `services/bookmarklet.js` (`buildCaptureScript`) — parsing fixes go in `helpers/parse.js` with a new unit test per fix.

- [ ] **Step 4: Update memory + final commit if anything changed**

```bash
git status --short   # expect clean
```

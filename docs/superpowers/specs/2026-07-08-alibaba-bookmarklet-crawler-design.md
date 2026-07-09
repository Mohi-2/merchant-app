# Phase 2 — Alibaba Price Capture via Bookmarklet

## Why

The user sources products from Alibaba.com (with delivery/ship-to set to China, which surfaces Yuan/CNY prices). Phase 2 lets them capture product data (title, CNY price, link, image, MOQ, seller) while browsing Alibaba in their own Chrome, review captured items inside the app, and convert any item into an app product with one click. Price history accumulates on re-capture.

A fully automated Playwright crawler is **Phase 3** — deferred because Alibaba's bot protection makes automation flaky, while a bookmarklet in the user's real browser can never be blocked. Phase 3 will reuse this phase's tables and capture endpoint unchanged.

A plain HTTP fetch of Alibaba search pages returns an empty JS shell (verified 2026-07-08), so server-side scraping without a real browser is not viable — hence the bookmarklet-first approach.

## Data model (additions to `db/schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crawled_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  alibaba_id     TEXT,                          -- numeric id from /product-detail/..._<id>.html when parseable
  url            TEXT NOT NULL UNIQUE,          -- normalized (origin+pathname, no query) — dedupe key
  title          TEXT NOT NULL,
  image_url      TEXT,
  price_raw      TEXT,                          -- verbatim price text, e.g. "¥12.5-15.8" (parser debugging)
  price_min_cny  REAL,
  price_max_cny  REAL,
  moq            TEXT,                          -- free text, e.g. "2 pieces (Min. order)"
  seller_name    TEXT,
  source_page    TEXT CHECK (source_page IN ('SEARCH','PRODUCT')),
  status         TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','ADDED','IGNORED')),
  product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
  first_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crawled_prices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  crawled_item_id INTEGER NOT NULL REFERENCES crawled_items(id) ON DELETE CASCADE,
  price_raw       TEXT,
  price_min_cny   REAL,
  price_max_cny   REAL,
  captured_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Existing DBs pick the new tables up automatically on restart (`CREATE TABLE IF NOT EXISTS` bootstrap).

Upsert semantics on capture (single transaction per item):
- Match by normalized `url`. New → insert item + first `crawled_prices` row (when a price was found).
- Existing → refresh `title/image_url/moq/seller_name/price_*` and `last_seen_at`; append a `crawled_prices` row **only when the parsed price differs from the item's latest recorded price**. `status` is never touched by capture — `ADDED` items keep accumulating price history for their linked product.

## Bookmarklet

Self-contained `javascript:` URI (no external script load, so page CSP `script-src` cannot block it). Embedded capture token. Behavior:

1. Detect page type from `location.pathname`: contains `/product-detail/` → PRODUCT (capture 1 item); otherwise if product-detail anchors exist on the page → SEARCH (capture all result cards).
2. Extract **raw strings only** — title, href, img src, price text (first `¥/￥ digits [- digits]` match), MOQ text, seller name — using resilient heuristics (anchor `href*="/product-detail/"`, closest card container, `[class*="price"]`, `[href*="company_profile"]`). All numeric parsing happens server-side.
3. `fetch('http://localhost:<port>/api/crawl/capture', {method:'POST', ...})` with `{token, page_type, items:[...]}`.
4. Show a floating toast on the Alibaba page: `«N محصول ذخیره شد (M جدید)»` or the error.

Auth: session cookies are not sent cross-site, so the endpoint authenticates with a random **capture token** — `helpers/settings.js` lazily creates it (crypto-random, stored under `settings.crawl_token`) the first time it's read, so no separate setup step exists. `GET /api/crawl/bookmarklet` (session-authenticated) builds the `javascript:` URI using `req.protocol + '://' + req.get('host')` as the base URL, so it always points at whatever host/port the user is currently browsing the app on, and renders as a draggable link on the crawler page.

Browser realities, accepted:
- HTTPS→`http://localhost` fetch is allowed by Chrome (localhost is "potentially trustworthy"; no mixed-content block).
- If Alibaba ever ships a restrictive `connect-src` CSP, the fetch would fail; **fallback plan** (only built if it actually happens): bookmarklet copies the JSON payload to the clipboard and the crawler page gets a paste box.
- Alibaba markup changes will degrade extraction; `price_raw` storage plus server-side parsing keeps failures diagnosable and fixes centralized.

## Server

`routes/crawl.js` (+ `helpers/crawl.js`, `helpers/settings.js`, pure parsers in `helpers/parse.js`):

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/crawl/capture` | capture token | upsert items batch; CORS-enabled (`Access-Control-Allow-Origin` echoed only for `*.alibaba.com` origins, OPTIONS preflight handled) |
| GET | `/api/crawl/bookmarklet` | session | `{bookmarklet: "javascript:..."}` with token embedded |
| GET | `/api/crawl/items?status=NEW` | session | list items (includes price fields + times) |
| GET | `/api/crawl/items/:id/prices` | session | price history rows |
| POST | `/api/crawl/items/:id/add-product` | session | body `{name, category_id?, unit_label}` — transaction: create product (`alibaba_link=url`, `image_url` copied), set item `status='ADDED'`, `product_id` |
| POST | `/api/crawl/items/:id/ignore` | session | `status='IGNORED'` |
| POST | `/api/crawl/items/:id/unignore` | session | `status='NEW'` |

`helpers/parse.js` (pure, unit-tested with `node --test`):
- `parsePriceRange(raw)` → `{min, max}|null` — handles `¥12.5`, `￥12.5-15.8`, `¥1,234.00 - ¥2,000`, en/em dashes, `~`.
- `normalizeAlibabaUrl(href)` → origin+pathname (strips query/hash); relative hrefs resolved against `https://www.alibaba.com`.
- `extractAlibabaId(url)` → trailing `_<digits>.html` id or null.

## App UI

New nav item **«کرالر علی‌بابا»** → `crawled.html` + `js/crawled.js`:
- **Setup card**: draggable bookmarklet link («ذخیره در اپ») + 2-line instructions (deliver-to China؛ روی صفحه جستجو یا محصول کلیک کن).
- **Inbox card** with tabs جدید / افزوده‌شده / نادیده‌گرفته: thumbnail, title (links to Alibaba), CNY price range + Toman equivalent (latest `exchange_rates.cny_to_irr`, omitted when no rate saved), MOQ, seller, capture count/last-seen. Row click toggles price-history detail.
- Row actions — NEW: **افزودن به محصولات** (inline form: name prefilled from title, category select, unit_label) و **نادیده گرفتن**; IGNORED: **بازگردانی**; ADDED: shows link to the created product's ledger.

## Testing & verification

1. `node --test` for `parse.js` (price ranges incl. comma thousands + dash variants, URL normalization, id extraction).
2. curl-level: capture with bad token → 401; valid batch → items created; re-capture same URL with new price → `last_seen_at` bumped + history row appended, no duplicate item; add-product → product row created with `alibaba_link`, item `ADDED`; capture again after ADDED → status untouched, history grows.
3. UI: bookmarklet link renders with token; inbox tabs work; add-product flow creates product visible on products page.
4. Real-world: run the bookmarklet on an actual alibaba.com search page in Chrome (via Chrome automation or manually) and confirm items land in the inbox. Extraction heuristics may need one tuning pass against live markup — expected, contained in the bookmarklet template + `parse.js`.

## Out of scope (Phase 3+)

Playwright auto-crawl per category (will reuse `crawled_items`/`crawled_prices` and the same upsert helper), category-to-search-term mapping, scheduled crawls, Digikala crawler.

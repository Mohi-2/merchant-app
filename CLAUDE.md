# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                        # start with nodemon (auto-restart), reads .env
npm start                          # production start (node server.js)
npm test                           # run all tests (node --test 'test/*.test.js')
node --test test/crawl.test.js     # run a single test file
```

There is no separate lint/build step — plain CommonJS, no bundler/TS.

## Architecture

**China Import Manager** is a Persian-language (RTL) tool for managing purchases from Chinese suppliers (Alibaba) and tracking inventory in Iran. Node.js/Express server serving a static multi-page app from `public/` (one HTML file + one JS file per section — not a single-page app) with a REST API under `/api`.

### Storage — SQLite via `better-sqlite3`

`helpers/db.js` opens the DB file (`data/app.sqlite`, WAL mode, foreign keys on) and runs `db/schema.sql` on every startup (`CREATE TABLE IF NOT EXISTS`, so it's idempotent). The DB path is overridable via `CIM_DB_PATH` (tests set it to `:memory:` before requiring any helper). `better-sqlite3` is synchronous, so every `helpers/*.js` function is a plain sync call — no `await` needed for DB access, unlike the Express route handlers which are still declared `async` for consistency.

### Data model

- **`users`** — `username`/`password_hash` (bcrypt)/`name`, no roles. Any authenticated user has equal access; `helpers/users.js`'s `initDefaultAdmin()` seeds `admin`/`admin123` on first run if the table is empty.
- **`categories`**, **`products`** (`unit_label` free text like "کارتن ۲۰ تایی", `alibaba_link`, `image_url`, denormalized `current_stock`).
- **`purchases`** — a purchase in CNY (`unit_price_cny` × `exchange_rate` → `total_cost_irr`, stored rather than recomputed later for audit stability).
- **`inventory_movements`** — append-only ledger, `type` IN/OUT, `reason` PURCHASE/SALE/USAGE/ADJUSTMENT/DAMAGE. `products.current_stock` is a cache that must only ever be mutated in the same transaction as a movement insert (see below) — never written directly elsewhere.
- **`exchange_rates`** — append-only log of CNY/USD→Toman rates (column names say `_irr` but the values and UI are Toman).
- **`crawled_items`** / **`crawled_prices`** / **`settings`** — the Alibaba capture subsystem (see below).

### Transactional invariant: stock mutations

Both purchase-creates-stock-IN (`helpers/purchases.js`'s `createPurchase`) and manual stock-OUT (`helpers/inventory.js`'s `createOutMovement`) are `db.transaction()`-wrapped so the ledger row and `products.current_stock` update are atomic. OUT uses a single conditional `UPDATE products SET current_stock = current_stock - ? WHERE id = ? AND current_stock >= ?` and checks `changes === 0` to reject over-withdrawal without a separate read-then-check race.

### Auth

`cookie-session` (not express-session) storing `userId`/`username`/`name` directly on `req.session` — see `routes/auth.js`. `helpers/middleware.js`'s `requireAuth` is the only guard (no `requireAdmin`, no roles). Response convention: success is a bare `res.json(obj)`; failure is `res.status(4xx).json({ error: 'پیام فارسی' })` — no envelope, no separate validation layer, checks are inline in route handlers.

### Alibaba bookmarklet crawler (Phase 2)

Server-side scraping of alibaba.com doesn't work (search pages return an empty JS shell to a plain fetch), so capture happens via a **bookmarklet** that runs in the user's own browser:

- `services/bookmarklet.js` generates a self-contained `javascript:` URI (must stay inline — no external `<script src>`, since page CSP can block that but not an inline bookmarklet). It extracts RAW strings only (title, price text, image, MOQ, seller) from the DOM; all numeric parsing happens server-side. Extraction selectors are calibrated against live alibaba.com markup — see the comments in that file (e.g., the real card title is `a.product-title`, climbed from its *parent* to reach the actual `.traffic-card-gallery` container, not the anchor itself).
- `routes/crawl.js`'s `POST /api/crawl/capture` is reachable cross-origin from `*.alibaba.com` (manual CORS handling, not the `cors` package) and authenticated by a random capture token (`helpers/settings.js`'s `getOrCreateCrawlToken()`, auto-created and stored in the `settings` table) rather than the session cookie, since cookies aren't sent cross-site.
- `helpers/crawl.js`'s `captureItems()` upserts by normalized URL (`helpers/parse.js`'s `normalizeAlibabaUrl`, which also rejects non-alibaba.com hosts), only parses `¥`/`￥`-prefixed prices into the CNY columns (a €/$ price — e.g. when the browser's deliver-to isn't China — is kept as raw text but never mislabeled as CNY), and appends a `crawled_prices` history row only when the parsed price actually changed.
- Reviewed at `public/crawled.html` (NEW/ADDED/IGNORED tabs); "add to products" creates a `products` row with `alibaba_link` set to the captured URL.
- Deferred: an automated Playwright crawler (Phase 3) would reuse these same tables/upsert helper. The Digikala crawler (below) is a separate subsystem that now exists.

### Digikala crawler (Phase 3)

Two independent subsystems for the *sell* side, kept fully separate (no FKs between them), under route prefix `/api/digikala` (`routes/digikala.js`), reusing the same capture token as the Alibaba crawler (`getOrCreateCrawlToken()`):

- **Own listings** (`digikala_own_items` + `digikala_own_price_history`) — a seller-panel bookmarklet (`buildDigikalaOwnBookmarklet`) reads every product row on the current `seller.digikala.com` list page in one click and posts them as a batch to `POST /api/digikala/own/capture`. `helpers/digikala.js`'s `captureOwnItems()` upserts by `digikala_id`, keeping the last known price/stock when a scrape omits a value. Own items can be linked to a system `products` row via `PATCH /api/digikala/own/:id/link`. **The seller-panel selectors are best-guess (the panel is auth-gated and could not be inspected during development) — they need live calibration, like the Alibaba live step.**
- **Competitors** (`digikala_competitor_items` + `digikala_competitor_price_history`) — a bookmarklet (`buildDigikalaCompetitorBookmarklet`) on a competitor's *public* product page posts one item to `POST /api/digikala/competitor/capture` to *start* tracking. Thereafter, price refresh is **server-side**: `POST /api/digikala/competitor/:id/refresh` calls Digikala's public JSON API (`services/digikala.js`'s `fetchProduct` → `https://api.digikala.com/v2/product/<dkp>/`), so no browser is needed to re-check a price (unlike Alibaba). Refresh is per-item and manual (a button on each row).
- **Currency:** the public API's `selling_price` is in **Rial**; `fetchProduct` divides by 10 to store **Toman** (everything else in the app is Toman). Out-of-stock (`status != 'marketable'`) → competitor `price` is set NULL and flagged «ناموجود», never deleted.
- Both subsystems append a price-history row only when the value actually changed (mirrors `crawled_prices`). Reviewed at `public/digikala.html` (two independent tabs: «محصولات من» / «رقبا»); prices in `helpers/parse.js`'s `parseTomanPrice` normalize Persian/Arabic digits. `extractDkpId`/`normalizeDigikalaUrl` reject non-digikala hosts.

### Exchange rate integration

`services/navasan.js` calls navasan.tech's `/latest/` endpoint (flat map of ~300 codes, each `{value, change, timestamp, date}`; `usd` and `cny` keys are the free-market sell rates, values already in Toman). Refresh is **manual only** — a "بروزرسانی نرخ ارز" button in the header (`public/js/header.js`) hits `POST /api/exchange-rate/refresh` synchronously (no polling; this is a single fast HTTP call, unlike a multi-second batch sync). Missing/invalid `NAVASAN_API_TOKEN` fails with a distinct `MISSING_TOKEN`/`PARSE_ERROR` code surfaced as a clean Persian 400/502, not a stack trace.

### Frontend

Static HTML + vanilla JS, one page + one JS file per section (`public/<name>.html`, `public/js/<name>.js`), no build step, no framework. Shared across pages: `public/js/api.js` (`api.get/post/patch/del` fetch wrapper + `showToast`), `public/js/header.js` (`initHeader(activePageKey)` — renders nav + user info + exchange-rate widget, and redirects to `/login.html` if the session check 401s), `public/css/app.css` (CSS-variable theme, light/dark via `prefers-color-scheme`). `public/index.html` is just an auth-check redirect to `dashboard.html` or `login.html`.

## Required env vars

```
PORT=3000
SESSION_SECRET=<random string>       # falls back to an insecure default with a console warning if unset (dev only)
NAVASAN_API_TOKEN=                   # from navasan.tech; exchange-rate refresh 400s with a clear message if unset
```

`.env` is loaded via `dotenv` in `server.js` for local dev.

## Deployment

**Liara (Docker):** `liara deploy -a merchant-app` uses `Dockerfile` + `liara.json`. Multi-stage build (`node:20-bookworm-slim`) compiles `better-sqlite3`'s native addon against glibc in a throwaway builder stage; the runtime stage runs as a non-root `appuser`. `data/` is a Liara disk (`data`, 1GB) mounted at `/app/data` (declared in `liara.json`'s `disks`), so the SQLite file survives redeploys. Env vars (`PORT`, `SESSION_SECRET`, `NAVASAN_API_TOKEN`) are set via `liara env:set -a merchant-app`, not committed. Live at `https://merchant-app.liara.run`.

**Docker (any host):** `docker compose up -d --build` with a `.env` providing `SESSION_SECRET`/`NAVASAN_API_TOKEN` — `docker-compose.yml` mounts a named volume at `/app/data` for the same persistence guarantee.

**Important:** `.dockerignore` must never list `Dockerfile` itself — some BuildKit-based remote builders (Liara included) exclude it from the build context in that case, failing with "the Dockerfile cannot be empty".

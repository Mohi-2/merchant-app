PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  unit_label     TEXT NOT NULL,
  alibaba_link   TEXT,
  image_url      TEXT,
  current_stock  INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  cny_to_irr   REAL NOT NULL,
  usd_to_irr   REAL NOT NULL,
  fetched_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cny    REAL NOT NULL CHECK (unit_price_cny >= 0),
  exchange_rate     REAL NOT NULL CHECK (exchange_rate > 0),
  total_cost_irr    REAL NOT NULL,
  supplier_name     TEXT NOT NULL,
  purchase_date     TEXT NOT NULL,
  note              TEXT,
  created_by        INTEGER REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_purchases_product ON purchases(product_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id            INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  type                  TEXT NOT NULL CHECK (type IN ('IN','OUT')),
  quantity              INTEGER NOT NULL CHECK (quantity > 0),
  reason                TEXT NOT NULL CHECK (reason IN ('PURCHASE','SALE','USAGE','ADJUSTMENT','DAMAGE')),
  reference_purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
  date                  TEXT NOT NULL,
  note                  TEXT,
  created_by            INTEGER REFERENCES users(id),
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_date ON inventory_movements(date);

'use strict';
const db = require('./db');

const OUT_REASONS = ['SALE', 'USAGE', 'ADJUSTMENT', 'DAMAGE'];

const MOVEMENTS_SQL = `
  SELECT m.*, p.name AS product_name, p.unit_label
  FROM inventory_movements m
  JOIN products p ON p.id = m.product_id
`;

function listStock() {
  return db.prepare(`
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY p.name
  `).all();
}

function listMovements(productId) {
  if (productId) {
    return db.prepare(MOVEMENTS_SQL + ' WHERE m.product_id = ? ORDER BY m.date DESC, m.id DESC').all(productId);
  }
  return db.prepare(MOVEMENTS_SQL + ' ORDER BY m.date DESC, m.id DESC').all();
}

const decrementStockStmt = db.prepare(`
  UPDATE products SET current_stock = current_stock - ?, updated_at = datetime('now')
  WHERE id = ? AND current_stock >= ?
`);

const insertOutMovementStmt = db.prepare(`
  INSERT INTO inventory_movements (product_id, type, quantity, reason, date, note, created_by)
  VALUES (?, 'OUT', ?, ?, ?, ?, ?)
`);

const getProductStmt = db.prepare('SELECT id, current_stock FROM products WHERE id = ?');

const createOutMovement = db.transaction((data, userId) => {
  const product = getProductStmt.get(data.product_id);
  if (!product) {
    const err = new Error('کالا یافت نشد');
    err.status = 404;
    throw err;
  }
  const result = decrementStockStmt.run(data.quantity, data.product_id, data.quantity);
  if (result.changes === 0) {
    const err = new Error('موجودی کافی نیست');
    err.status = 409;
    throw err;
  }
  const info = insertOutMovementStmt.run(data.product_id, data.quantity, data.reason, data.date, data.note || null, userId);
  return db.prepare(MOVEMENTS_SQL + ' WHERE m.id = ?').get(info.lastInsertRowid);
});

module.exports = { OUT_REASONS, listStock, listMovements, createOutMovement };

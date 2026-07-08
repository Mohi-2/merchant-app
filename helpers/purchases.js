'use strict';
const db = require('./db');

const LIST_SQL = `
  SELECT pu.*, p.name AS product_name, p.unit_label
  FROM purchases pu
  JOIN products p ON p.id = pu.product_id
`;

function listPurchases(productId) {
  if (productId) {
    return db.prepare(LIST_SQL + ' WHERE pu.product_id = ? ORDER BY pu.purchase_date DESC, pu.id DESC').all(productId);
  }
  return db.prepare(LIST_SQL + ' ORDER BY pu.purchase_date DESC, pu.id DESC').all();
}

const insertPurchaseStmt = db.prepare(`
  INSERT INTO purchases (product_id, quantity, unit_price_cny, exchange_rate, total_cost_irr, supplier_name, purchase_date, note, created_by)
  VALUES (@product_id, @quantity, @unit_price_cny, @exchange_rate, @total_cost_irr, @supplier_name, @purchase_date, @note, @created_by)
`);

const insertMovementStmt = db.prepare(`
  INSERT INTO inventory_movements (product_id, type, quantity, reason, reference_purchase_id, date, note, created_by)
  VALUES (@product_id, 'IN', @quantity, 'PURCHASE', @reference_purchase_id, @date, @note, @created_by)
`);

const incrementStockStmt = db.prepare(`
  UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?
`);

const getProductStmt = db.prepare('SELECT id FROM products WHERE id = ?');

const createPurchase = db.transaction((data, userId) => {
  if (!getProductStmt.get(data.product_id)) {
    const err = new Error('کالا یافت نشد');
    err.status = 404;
    throw err;
  }
  const totalCostIrr = data.quantity * data.unit_price_cny * data.exchange_rate;
  const info = insertPurchaseStmt.run({
    product_id: data.product_id,
    quantity: data.quantity,
    unit_price_cny: data.unit_price_cny,
    exchange_rate: data.exchange_rate,
    total_cost_irr: totalCostIrr,
    supplier_name: data.supplier_name,
    purchase_date: data.purchase_date,
    note: data.note || null,
    created_by: userId,
  });
  const purchaseId = info.lastInsertRowid;
  insertMovementStmt.run({
    product_id: data.product_id,
    quantity: data.quantity,
    reference_purchase_id: purchaseId,
    date: data.purchase_date,
    note: data.note || null,
    created_by: userId,
  });
  incrementStockStmt.run(data.quantity, data.product_id);
  return db.prepare(LIST_SQL + ' WHERE pu.id = ?').get(purchaseId);
});

module.exports = { listPurchases, createPurchase };

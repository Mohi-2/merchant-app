'use strict';
const db = require('./db');

const LIST_SQL = `
  SELECT p.*, c.name AS category_name
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`;

function listProducts(categoryId) {
  if (categoryId) {
    return db.prepare(LIST_SQL + ' WHERE p.category_id = ? ORDER BY p.name').all(categoryId);
  }
  return db.prepare(LIST_SQL + ' ORDER BY p.name').all();
}

function getProduct(id) {
  return db.prepare(LIST_SQL + ' WHERE p.id = ?').get(id);
}

function createProduct({ name, category_id, unit_label, alibaba_link, image_url }) {
  const info = db.prepare(
    `INSERT INTO products (name, category_id, unit_label, alibaba_link, image_url)
     VALUES (?, ?, ?, ?, ?)`
  ).run(name, category_id || null, unit_label, alibaba_link || null, image_url || null);
  return getProduct(info.lastInsertRowid);
}

function updateProduct(id, { name, category_id, unit_label, alibaba_link, image_url }) {
  const info = db.prepare(
    `UPDATE products SET name = ?, category_id = ?, unit_label = ?, alibaba_link = ?, image_url = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(name, category_id || null, unit_label, alibaba_link || null, image_url || null, id);
  if (info.changes === 0) return null;
  return getProduct(id);
}

function deleteProduct(id) {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return info.changes > 0;
}

module.exports = { listProducts, getProduct, createProduct, updateProduct, deleteProduct };

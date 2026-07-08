'use strict';
const db = require('./db');

function listCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY name').all();
}

function createCategory(name) {
  const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
}

function renameCategory(id, name) {
  const info = db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id);
  if (info.changes === 0) return null;
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

function deleteCategory(id) {
  const info = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return info.changes > 0;
}

module.exports = { listCategories, createCategory, renameCategory, deleteCategory };

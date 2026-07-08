'use strict';
const bcrypt = require('bcryptjs');
const db = require('./db');

function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
}

function findUserById(id) {
  return db.prepare('SELECT id, username, name, active, created_at FROM users WHERE id = ?').get(id);
}

function listUsers() {
  return db.prepare('SELECT id, username, name, active, created_at FROM users ORDER BY name').all();
}

function createUser({ username, password, name }) {
  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (username, password_hash, name) VALUES (?, ?, ?)'
  ).run(username, passwordHash, name);
  return findUserById(info.lastInsertRowid);
}

function initDefaultAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count === 0) {
    createUser({ username: 'admin', password: 'admin123', name: 'مدیر سیستم' });
    console.log('  👤  کاربر پیش‌فرض ساخته شد  →  admin / admin123');
  }
}

module.exports = { findUserByUsername, findUserById, listUsers, createUser, initDefaultAdmin };

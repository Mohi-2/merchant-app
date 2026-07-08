'use strict';

function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'ابتدا وارد شوید' });
  next();
}

module.exports = { requireAuth };

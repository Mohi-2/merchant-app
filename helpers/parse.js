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

// origin+pathname only (query/hash stripped); relative hrefs resolve against alibaba.com.
// Rejects (returns null) any URL whose host is not alibaba.com or a subdomain, so a
// stray /product-detail/ anchor to a third-party host can't be stored or rendered.
function normalizeAlibabaUrl(href) {
  if (!href) return null;
  let u;
  try { u = new URL(href, 'https://www.alibaba.com'); } catch { return null; }
  if (!/(^|\.)alibaba\.com$/i.test(u.hostname)) return null;
  return u.origin + u.pathname;
}

function extractAlibabaId(url) {
  const m = String(url || '').match(/_(\d+)\.html/);
  return m ? m[1] : null;
}

// Digikala product urls look like https://www.digikala.com/product/dkp-13715199/slug/.
// Rejects (returns null) any URL whose host is not digikala.com or a subdomain.
function isDigikalaHost(u) {
  return /(^|\.)digikala\.com$/i.test(u.hostname);
}

function extractDkpId(url) {
  let u;
  try { u = new URL(String(url || ''), 'https://www.digikala.com'); } catch { return null; }
  if (!isDigikalaHost(u)) return null;
  const m = u.pathname.match(/dkp-(\d+)/i);
  return m ? m[1] : null;
}

function normalizeDigikalaUrl(href) {
  if (!href) return null;
  let u;
  try { u = new URL(href); } catch { return null; }
  if (!isDigikalaHost(u)) return null;
  return u.origin + u.pathname;
}

// Persian/Arabic-Indic digits -> ASCII, strip everything but digits, parse int Toman.
function parseTomanPrice(raw) {
  if (raw == null) return null;
  const ascii = String(raw)
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const digits = ascii.replace(/[^\d]/g, '');
  if (!digits) return null;
  return parseInt(digits, 10);
}

module.exports = { parsePriceRange, normalizeAlibabaUrl, extractAlibabaId, extractDkpId, normalizeDigikalaUrl, parseTomanPrice };

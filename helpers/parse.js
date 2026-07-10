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

module.exports = { parsePriceRange, normalizeAlibabaUrl, extractAlibabaId };

'use strict';

async function fetchLatestRates() {
  const token = process.env.NAVASAN_API_TOKEN;
  if (!token) {
    const err = new Error('NAVASAN_API_TOKEN تنظیم نشده است. لطفاً ابتدا در navasan.tech ثبت‌نام کرده و توکن را در .env قرار دهید.');
    err.code = 'MISSING_TOKEN';
    throw err;
  }
  const url = `https://api.navasan.tech/latest/?api_key=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const err = new Error(`navasan.tech HTTP ${res.status}`);
    err.code = 'UPSTREAM_ERROR';
    throw err;
  }
  const json = await res.json();

  // ---- PARSING BOUNDARY ----
  // navasan.tech's exact field names are unverified (no live token available yet).
  // This is the only place to adjust once a real response sample is seen.
  const cny = json.usd_cny?.value ?? json.cny_sell?.value ?? json.cny?.value;
  const usd = json.usd_sell?.value ?? json.usd?.value;
  if (!cny || !usd) {
    const err = new Error('پاسخ navasan.tech قابل تفسیر نبود — ساختار پاسخ را بررسی کنید');
    err.code = 'PARSE_ERROR';
    throw err;
  }
  return { cnyToIrr: Number(cny), usdToIrr: Number(usd) };
}

module.exports = { fetchLatestRates };

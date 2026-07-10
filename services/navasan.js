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

  // navasan.tech /latest returns a flat map of ~300 codes, each { value, change,
  // timestamp, date }. `value` is a string in TOMAN (not rial). Verified against a
  // live response 2026-07: `usd` and `cny` are the free-market sell rates we want
  // (usd/cny ≈ 6.8, matching the real USD/CNY cross-rate). The DB columns are named
  // *_to_irr for historical reasons but the whole app treats them as Toman (the UI
  // labels them «تومان») — so we store these Toman values directly.
  const cny = json.cny?.value;
  const usd = json.usd?.value;
  if (cny == null || usd == null || !Number(cny) || !Number(usd)) {
    const err = new Error('پاسخ navasan.tech قابل تفسیر نبود — ساختار پاسخ را بررسی کنید');
    err.code = 'PARSE_ERROR';
    throw err;
  }
  return { cnyToIrr: Number(cny), usdToIrr: Number(usd) };
}

module.exports = { fetchLatestRates };

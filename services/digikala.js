'use strict';

// Thin wrapper around Digikala's public product API (verified live 2026-07-11):
//   GET https://api.digikala.com/v2/product/<dkp-id>/
// selling_price is in RIAL — divide by 10 for Toman. Out-of-stock products omit
// default_variant, so price/seller come back null (not an error).
async function fetchProduct(dkpId, fetchImpl = fetch) {
  const url = `https://api.digikala.com/v2/product/${encodeURIComponent(dkpId)}/`;
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    const err = new Error('خطا در اتصال به دیجی‌کالا');
    err.code = 'UPSTREAM_ERROR';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`digikala HTTP ${res.status}`);
    err.code = 'UPSTREAM_ERROR';
    throw err;
  }
  let json;
  try {
    json = await res.json();
  } catch (e) {
    const err = new Error('پاسخ دیجی‌کالا قابل تفسیر نبود');
    err.code = 'PARSE_ERROR';
    throw err;
  }
  const product = json && json.data && json.data.product;
  if (!product) {
    const err = new Error('پاسخ دیجی‌کالا قابل تفسیر نبود');
    err.code = 'PARSE_ERROR';
    throw err;
  }
  const dv = product.default_variant || {};
  const rial = dv.price && dv.price.selling_price;
  return {
    title: product.title_fa || product.title_en || '',
    status: product.status || null,
    priceToman: rial != null ? Math.round(rial / 10) : null,
    sellerName: (dv.seller && dv.seller.title) || null,
  };
}

module.exports = { fetchProduct };

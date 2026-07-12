'use strict';

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let _tab = 'own';
let _products = [];

function tomanLabel(v) {
  return v == null ? '<span style="color:var(--faint);">ناموجود</span>' : `${fmtNumber(v)} تومان`;
}

async function loadItems() {
  const wrap = document.getElementById('itemsWrap');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('primary', b.dataset.tab === _tab));
  try {
    if (_tab === 'own') return renderOwn(wrap, await api.get('/api/digikala/own'));
    return renderCompetitor(wrap, await api.get('/api/digikala/competitor'));
  } catch (e) {
    wrap.innerHTML = `<p class="empty">خطا در بارگذاری: ${escHtml(e.message)}</p>`;
  }
}

function renderOwn(wrap, items) {
  if (!items.length) { wrap.innerHTML = '<p class="empty">هنوز محصولی از پنل فروشنده ثبت نشده.</p>'; return; }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>عنوان</th><th>قیمت</th><th>موجودی</th><th>فروش</th><th>محصول مرتبط</th><th>قیمت‌ها</th></tr></thead>
      <tbody>
        ${items.map(it => `
          <tr data-id="${it.id}">
            <td style="max-width:320px;">${escHtml(it.title)}</td>
            <td>${tomanLabel(it.price)}</td>
            <td>${it.stock == null ? '—' : fmtNumber(it.stock)}</td>
            <td>${it.sales_count == null ? '—' : fmtNumber(it.sales_count)}</td>
            <td>${linkCell(it)}</td>
            <td><button class="btn history-btn" data-kind="own" style="padding:4px 9px;">${fmtNumber(it.price_count)} ↓</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  bindHistory(wrap);
  wrap.querySelectorAll('.link-select').forEach(s => s.addEventListener('change', onLink));
}

function linkCell(it) {
  if (it.product_id) {
    const p = _products.find(x => x.id === it.product_id);
    return `<a class="product-link" href="/product-ledger.html?id=${it.product_id}">${escHtml(p ? p.name : 'محصول')} ←</a>`;
  }
  return `<select class="link-select"><option value="">— اتصال به محصول —</option>${_products.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}</select>`;
}

async function onLink(e) {
  const row = e.target.closest('tr');
  const productId = e.target.value;
  if (!productId) return;
  try {
    await api.patch(`/api/digikala/own/${row.dataset.id}/link`, { product_id: productId });
    showToast('به محصول متصل شد', 'success');
    loadItems();
  } catch (err) { showToast(err.message, 'error'); }
}

function renderCompetitor(wrap, items) {
  if (!items.length) { wrap.innerHTML = '<p class="empty">هنوز رقیبی برای ردیابی ثبت نشده.</p>'; return; }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>عنوان</th><th>فروشنده</th><th>قیمت</th><th>قیمت‌ها</th><th></th></tr></thead>
      <tbody>
        ${items.map(it => `
          <tr data-id="${it.id}">
            <td style="max-width:320px;"><a class="product-link" href="${escHtml(it.url)}" target="_blank" rel="noopener">${escHtml(it.title)}</a></td>
            <td>${escHtml(it.seller_name || '—')}</td>
            <td>${tomanLabel(it.price)}</td>
            <td><button class="btn history-btn" data-kind="competitor" style="padding:4px 9px;">${fmtNumber(it.price_count)} ↓</button></td>
            <td style="white-space:nowrap;">
              <button class="btn refresh-btn" style="padding:5px 10px;">🔄 بروزرسانی</button>
              <button class="btn status-btn" style="padding:5px 10px;">${it.status === 'IGNORED' ? 'بازگردانی' : 'نادیده'}</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  bindHistory(wrap);
  wrap.querySelectorAll('.refresh-btn').forEach(b => b.addEventListener('click', onRefresh));
  wrap.querySelectorAll('.status-btn').forEach(b => b.addEventListener('click', onToggleStatus));
}

async function onRefresh(e) {
  const row = e.target.closest('tr');
  e.target.disabled = true; const t = e.target.textContent; e.target.textContent = '⏳';
  try {
    await api.post(`/api/digikala/competitor/${row.dataset.id}/refresh`, {});
    showToast('قیمت بروزرسانی شد', 'success');
    loadItems();
  } catch (err) {
    showToast(err.message, 'error');
    e.target.disabled = false; e.target.textContent = t;
  }
}

async function onToggleStatus(e) {
  const row = e.target.closest('tr');
  const next = e.target.textContent.trim() === 'نادیده' ? 'IGNORED' : 'ACTIVE';
  try {
    await api.patch(`/api/digikala/competitor/${row.dataset.id}/status`, { status: next });
    loadItems();
  } catch (err) { showToast(err.message, 'error'); }
}

function bindHistory(wrap) {
  wrap.querySelectorAll('.history-btn').forEach(b => b.addEventListener('click', onHistory));
}

async function onHistory(e) {
  const row = e.target.closest('tr');
  const kind = e.target.dataset.kind;
  const next = row.nextElementSibling;
  if (next && next.classList.contains('history-row')) { next.remove(); return; }
  const prices = await api.get(`/api/digikala/${kind}/${row.dataset.id}/prices`);
  const cols = row.children.length;
  const detail = document.createElement('tr');
  detail.className = 'history-row';
  detail.innerHTML = `<td colspan="${cols}" style="background:var(--panel2);font-size:12px;">
    ${prices.length ? prices.map(p => `${escHtml((p.recorded_at || '').slice(0, 16))} — ${p.price == null ? 'ناموجود' : fmtNumber(p.price) + ' تومان'}${p.stock != null ? ' (موجودی ' + fmtNumber(p.stock) + ')' : ''}`).join('<br>') : 'تاریخچه‌ای ثبت نشده'}
  </td>`;
  row.after(detail);
}

async function init() {
  try {
    const bm = await api.get('/api/digikala/bookmarklets');
    document.getElementById('ownBookmarklet').href = bm.own;
    document.getElementById('competitorBookmarklet').href = bm.competitor;
  } catch (e) { /* header handles auth redirect */ }
  document.getElementById('ownBookmarklet').addEventListener('click', ev => ev.preventDefault());
  document.getElementById('competitorBookmarklet').addEventListener('click', ev => ev.preventDefault());
  try { _products = await api.get('/api/products'); } catch (e) { _products = []; }
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => { _tab = b.dataset.tab; loadItems(); }));
  loadItems();
}

initHeader('digikala').then(me => { if (me) init(); });

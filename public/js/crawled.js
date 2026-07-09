'use strict';

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let _status = 'NEW';
let _categories = [];
let _rate = null;

function priceLabel(item) {
  if (item.price_min_cny == null) return escHtml(item.price_raw || '—');
  const range = item.price_min_cny === item.price_max_cny
    ? `¥${fmtNumber(item.price_min_cny)}`
    : `¥${fmtNumber(item.price_min_cny)} – ¥${fmtNumber(item.price_max_cny)}`;
  if (!_rate) return range;
  const toman = Math.round(item.price_min_cny * _rate.cny_to_irr);
  return `${range}<br><span style="font-size:11px;color:var(--faint);">≈ ${fmtNumber(toman)} تومان</span>`;
}

function rowActions(item) {
  if (_status === 'NEW') {
    return `<button class="btn add-btn" style="padding:5px 10px;">افزودن به محصولات</button>
            <button class="btn ignore-btn" style="padding:5px 10px;">نادیده گرفتن</button>`;
  }
  if (_status === 'IGNORED') {
    return `<button class="btn unignore-btn" style="padding:5px 10px;">بازگردانی</button>`;
  }
  return item.product_id
    ? `<a class="product-link" href="/product-ledger.html?id=${item.product_id}">محصول ←</a>` : '—';
}

async function loadItems() {
  const wrap = document.getElementById('itemsWrap');
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('primary', b.dataset.status === _status);
  });
  try {
    const items = await api.get(`/api/crawl/items?status=${_status}`);
    if (!items.length) {
      wrap.innerHTML = '<p class="empty">آیتمی در این بخش نیست.</p>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th></th><th>عنوان</th><th>قیمت (یوان)</th><th>حداقل سفارش</th><th>فروشنده</th><th>قیمت‌ها</th><th></th></tr></thead>
        <tbody>
          ${items.map(it => `
            <tr data-id="${it.id}" data-title="${escHtml(it.title)}">
              <td>${it.image_url ? `<img class="thumb" src="${escHtml(it.image_url)}" onerror="this.style.visibility='hidden'">` : ''}</td>
              <td style="max-width:340px;"><a class="product-link" href="${escHtml(it.url)}" target="_blank" rel="noopener">${escHtml(it.title)}</a></td>
              <td>${priceLabel(it)}</td>
              <td>${escHtml(it.moq || '—')}</td>
              <td>${escHtml(it.seller_name || '—')}</td>
              <td><button class="btn history-btn" style="padding:4px 9px;">${fmtNumber(it.price_count)} ↓</button></td>
              <td style="white-space:nowrap;">${rowActions(it)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll('.add-btn').forEach(b => b.addEventListener('click', onAdd));
    wrap.querySelectorAll('.ignore-btn').forEach(b => b.addEventListener('click', e => onSetStatus(e, 'ignore')));
    wrap.querySelectorAll('.unignore-btn').forEach(b => b.addEventListener('click', e => onSetStatus(e, 'unignore')));
    wrap.querySelectorAll('.history-btn').forEach(b => b.addEventListener('click', onHistory));
  } catch (e) {
    wrap.innerHTML = `<p class="empty">خطا در بارگذاری: ${escHtml(e.message)}</p>`;
  }
}

async function onHistory(e) {
  const row = e.target.closest('tr');
  const next = row.nextElementSibling;
  if (next && next.classList.contains('history-row')) { next.remove(); return; }
  const prices = await api.get(`/api/crawl/items/${row.dataset.id}/prices`);
  const detail = document.createElement('tr');
  detail.className = 'history-row';
  detail.innerHTML = `<td colspan="7" style="background:var(--panel2);font-size:12px;">
    ${prices.length ? prices.map(p => `${escHtml((p.captured_at || '').slice(0, 16))} — ${escHtml(p.price_raw || `${p.price_min_cny}-${p.price_max_cny}`)}`).join('<br>') : 'تاریخچه‌ای ثبت نشده'}
  </td>`;
  row.after(detail);
}

async function onSetStatus(e, action) {
  const row = e.target.closest('tr');
  try {
    await api.post(`/api/crawl/items/${row.dataset.id}/${action}`, {});
    showToast(action === 'ignore' ? 'نادیده گرفته شد' : 'بازگردانده شد', 'success');
    loadItems();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function onAdd(e) {
  const row = e.target.closest('tr');
  const existing = row.nextElementSibling;
  if (existing && existing.classList.contains('add-row')) { existing.remove(); return; }
  const detail = document.createElement('tr');
  detail.className = 'add-row';
  detail.innerHTML = `<td colspan="7" style="background:var(--panel2);">
    <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;padding:6px 0;">
      <div class="field" style="flex:2;min-width:220px;"><label>نام محصول</label><input type="text" class="add-name" value="${escHtml(row.dataset.title)}"></div>
      <div class="field" style="flex:1;min-width:140px;"><label>دسته‌بندی</label><select class="add-category"><option value="">بدون دسته‌بندی</option>${_categories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}</select></div>
      <div class="field" style="flex:1;min-width:140px;"><label>واحد شمارش</label><input type="text" class="add-unit" placeholder="مثلاً عدد"></div>
      <button class="btn primary add-confirm" style="padding:10px 16px;">ثبت محصول</button>
    </div>
  </td>`;
  row.after(detail);
  detail.querySelector('.add-confirm').addEventListener('click', async () => {
    const name = detail.querySelector('.add-name').value.trim();
    const unit = detail.querySelector('.add-unit').value.trim();
    if (!name || !unit) { showToast('نام و واحد شمارش الزامی است', 'error'); return; }
    try {
      await api.post(`/api/crawl/items/${row.dataset.id}/add-product`, {
        name, unit_label: unit,
        category_id: detail.querySelector('.add-category').value || null,
      });
      showToast('به محصولات اضافه شد', 'success');
      loadItems();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function init() {
  try {
    const { bookmarklet } = await api.get('/api/crawl/bookmarklet');
    document.getElementById('bookmarkletLink').href = bookmarklet;
  } catch (e) { /* header already handles auth redirect */ }
  document.getElementById('bookmarkletLink').addEventListener('click', ev => ev.preventDefault());
  try { _categories = await api.get('/api/categories'); } catch (e) { _categories = []; }
  try { _rate = await api.get('/api/exchange-rate/latest'); } catch (e) { _rate = null; }
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => { _status = b.dataset.status; loadItems(); }));
  loadItems();
}

initHeader('crawled').then(me => { if (me) init(); });

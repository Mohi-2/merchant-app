'use strict';

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadStock() {
  const wrap = document.getElementById('stockTableWrap');
  try {
    const products = await api.get('/api/inventory/stock');
    if (!products.length) {
      wrap.innerHTML = '<p class="empty">هنوز محصولی ثبت نشده — از صفحه «محصولات» شروع کنید.</p>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th>محصول</th><th>دسته‌بندی</th><th>واحد شمارش</th><th>موجودی فعلی</th><th></th></tr></thead>
        <tbody>
          ${products.map(p => `
            <tr>
              <td>${escHtml(p.name)}</td>
              <td>${escHtml(p.category_name || '—')}</td>
              <td>${escHtml(p.unit_label)}</td>
              <td class="${p.current_stock <= 0 ? 'stock-low' : ''}">${fmtNumber(p.current_stock)}</td>
              <td><a class="product-link" href="/product-ledger.html?id=${p.id}">تاریخچه ←</a></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    wrap.innerHTML = `<p class="empty">خطا در بارگذاری: ${escHtml(e.message)}</p>`;
  }
}

initHeader('dashboard').then(me => { if (me) loadStock(); });

'use strict';

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const REASON_LABEL = { SALE: 'فروش', USAGE: 'مصرف', ADJUSTMENT: 'اصلاح موجودی', DAMAGE: 'ضایعات', PURCHASE: 'خرید' };

function getProductId() {
  return new URLSearchParams(window.location.search).get('id');
}

async function loadProductHeader(id) {
  try {
    const product = await api.get(`/api/products/${id}`);
    document.getElementById('productTitle').textContent = `📦 ${product.name}`;
    document.getElementById('productMeta').textContent =
      `دسته‌بندی: ${product.category_name || '—'} | واحد شمارش: ${product.unit_label} | موجودی فعلی: ${fmtNumber(product.current_stock)}`;
  } catch (e) {
    document.getElementById('productTitle').textContent = 'محصول یافت نشد';
  }
}

async function loadLedger(id) {
  const wrap = document.getElementById('ledgerWrap');
  try {
    const movements = await api.get(`/api/inventory/movements?product_id=${id}`);
    if (!movements.length) {
      wrap.innerHTML = '<p class="empty">هنوز جابجایی‌ای برای این محصول ثبت نشده.</p>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th>نوع</th><th>تعداد</th><th>دلیل</th><th>تاریخ</th><th>مرتبط با خرید</th><th>یادداشت</th></tr></thead>
        <tbody>
          ${movements.map(m => `
            <tr>
              <td><span class="badge ${m.type === 'IN' ? 'in' : 'out'}">${m.type === 'IN' ? 'ورود' : 'خروج'}</span></td>
              <td>${fmtNumber(m.quantity)} ${escHtml(m.unit_label)}</td>
              <td>${REASON_LABEL[m.reason] || m.reason}</td>
              <td>${escHtml(m.date)}</td>
              <td>${m.reference_purchase_id ? '#' + m.reference_purchase_id : '—'}</td>
              <td>${escHtml(m.note || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    wrap.innerHTML = `<p class="empty">خطا در بارگذاری: ${escHtml(e.message)}</p>`;
  }
}

async function init() {
  const id = getProductId();
  if (!id) {
    document.getElementById('productTitle').textContent = 'محصولی انتخاب نشده';
    return;
  }
  await loadProductHeader(id);
  await loadLedger(id);
}

initHeader('dashboard').then(me => { if (me) init(); });

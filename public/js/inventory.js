'use strict';

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const REASON_LABEL = { SALE: 'فروش', USAGE: 'مصرف', ADJUSTMENT: 'اصلاح موجودی', DAMAGE: 'ضایعات', PURCHASE: 'خرید' };

let _products = [];

async function loadProductsIntoSelect() {
  _products = await api.get('/api/products');
  const select = document.getElementById('productId');
  select.innerHTML = _products.map(p => `<option value="${p.id}">${escHtml(p.name)} (${escHtml(p.unit_label)})</option>`).join('');
  updateStockHint();
}

function updateStockHint() {
  const id = document.getElementById('productId').value;
  const product = _products.find(p => String(p.id) === id);
  document.getElementById('stockHint').textContent = product ? `موجودی فعلی: ${fmtNumber(product.current_stock)}` : '';
}

async function loadMovements() {
  const wrap = document.getElementById('movementsWrap');
  try {
    const movements = await api.get('/api/inventory/movements');
    if (!movements.length) {
      wrap.innerHTML = '<p class="empty">هنوز جابجایی‌ای ثبت نشده.</p>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th>محصول</th><th>نوع</th><th>تعداد</th><th>دلیل</th><th>تاریخ</th><th>یادداشت</th></tr></thead>
        <tbody>
          ${movements.slice(0, 50).map(m => `
            <tr>
              <td>${escHtml(m.product_name)}</td>
              <td><span class="badge ${m.type === 'IN' ? 'in' : 'out'}">${m.type === 'IN' ? 'ورود' : 'خروج'}</span></td>
              <td>${fmtNumber(m.quantity)} ${escHtml(m.unit_label)}</td>
              <td>${REASON_LABEL[m.reason] || m.reason}</td>
              <td>${escHtml(m.date)}</td>
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

document.getElementById('productId').addEventListener('change', updateStockHint);

document.getElementById('movementForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const payload = {
    product_id: Number(document.getElementById('productId').value),
    quantity: Number(document.getElementById('quantity').value),
    reason: document.getElementById('reason').value,
    date: document.getElementById('date').value,
    note: document.getElementById('note').value.trim() || null,
  };
  btn.disabled = true;
  try {
    await api.post('/api/inventory/movements', payload);
    showToast('خروج از انبار ثبت شد', 'success');
    document.getElementById('quantity').value = '';
    document.getElementById('note').value = '';
    await loadProductsIntoSelect();
    loadMovements();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

async function init() {
  document.getElementById('date').value = new Date().toISOString().slice(0, 10);
  await loadProductsIntoSelect();
  await loadMovements();
}

initHeader('inventory').then(me => { if (me) init(); });

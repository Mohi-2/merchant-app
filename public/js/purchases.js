'use strict';

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadProductsIntoSelect() {
  const products = await api.get('/api/products');
  const select = document.getElementById('productId');
  select.innerHTML = products.map(p => `<option value="${p.id}">${escHtml(p.name)} (${escHtml(p.unit_label)})</option>`).join('');
}

async function loadLatestRateIntoForm() {
  try {
    const rate = await api.get('/api/exchange-rate/latest');
    document.getElementById('exchangeRate').value = rate.cny_to_irr;
    document.getElementById('rateHint').textContent = `نرخ فعلی: ${fmtNumber(rate.cny_to_irr)} تومان (قابل ویرایش)`;
  } catch (e) {
    document.getElementById('rateHint').textContent = 'نرخ ارز ثبت‌نشده — لطفاً دستی وارد کنید';
  }
}

function updateTotalPreview() {
  const qty = Number(document.getElementById('quantity').value) || 0;
  const price = Number(document.getElementById('unitPriceCny').value) || 0;
  const rate = Number(document.getElementById('exchangeRate').value) || 0;
  const total = qty * price * rate;
  document.getElementById('totalPreview').textContent = `${fmtNumber(Math.round(total))} تومان`;
}

async function loadPurchases() {
  const wrap = document.getElementById('purchasesWrap');
  try {
    const purchases = await api.get('/api/purchases');
    if (!purchases.length) {
      wrap.innerHTML = '<p class="empty">هنوز خریدی ثبت نشده.</p>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th>محصول</th><th>تعداد</th><th>قیمت واحد (یوان)</th><th>نرخ ارز</th><th>جمع کل (تومان)</th><th>تامین‌کننده</th><th>تاریخ</th></tr></thead>
        <tbody>
          ${purchases.map(p => `
            <tr>
              <td>${escHtml(p.product_name)}</td>
              <td>${fmtNumber(p.quantity)} ${escHtml(p.unit_label)}</td>
              <td>${fmtNumber(p.unit_price_cny)}</td>
              <td>${fmtNumber(p.exchange_rate)}</td>
              <td>${fmtNumber(Math.round(p.total_cost_irr))}</td>
              <td>${escHtml(p.supplier_name)}</td>
              <td>${escHtml(p.purchase_date)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    wrap.innerHTML = `<p class="empty">خطا در بارگذاری: ${escHtml(e.message)}</p>`;
  }
}

['quantity', 'unitPriceCny', 'exchangeRate'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateTotalPreview);
});

document.getElementById('purchaseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const payload = {
    product_id: Number(document.getElementById('productId').value),
    quantity: Number(document.getElementById('quantity').value),
    unit_price_cny: Number(document.getElementById('unitPriceCny').value),
    exchange_rate: Number(document.getElementById('exchangeRate').value),
    supplier_name: document.getElementById('supplierName').value.trim(),
    purchase_date: document.getElementById('purchaseDate').value,
    note: document.getElementById('note').value.trim() || null,
  };
  btn.disabled = true;
  try {
    await api.post('/api/purchases', payload);
    showToast('خرید ثبت شد و موجودی بروزرسانی شد', 'success');
    document.getElementById('purchaseForm').reset();
    document.getElementById('purchaseDate').value = new Date().toISOString().slice(0, 10);
    await loadLatestRateIntoForm();
    updateTotalPreview();
    loadPurchases();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

async function init() {
  document.getElementById('purchaseDate').value = new Date().toISOString().slice(0, 10);
  await loadProductsIntoSelect();
  await loadLatestRateIntoForm();
  updateTotalPreview();
  await loadPurchases();
}

initHeader('purchases').then(me => { if (me) init(); });

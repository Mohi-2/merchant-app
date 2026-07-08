'use strict';

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let _categories = [];
let _lastProducts = [];

async function loadCategoriesIntoSelect() {
  _categories = await api.get('/api/categories');
  const select = document.getElementById('categoryId');
  select.innerHTML = '<option value="">بدون دسته‌بندی</option>' +
    _categories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
}

async function loadProducts() {
  const wrap = document.getElementById('productsWrap');
  try {
    const products = _lastProducts = await api.get('/api/products');
    if (!products.length) {
      wrap.innerHTML = '<p class="empty">هنوز محصولی ثبت نشده.</p>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th></th><th>نام</th><th>دسته‌بندی</th><th>واحد شمارش</th><th>موجودی</th><th></th></tr></thead>
        <tbody>
          ${products.map(p => `
            <tr data-id="${p.id}">
              <td>${p.image_url ? `<img class="thumb" src="${escHtml(p.image_url)}" onerror="this.style.visibility='hidden'">` : ''}</td>
              <td>${escHtml(p.name)} ${p.alibaba_link ? `<a class="product-link" href="${escHtml(p.alibaba_link)}" target="_blank" rel="noopener">🔗</a>` : ''}</td>
              <td>${escHtml(p.category_name || '—')}</td>
              <td>${escHtml(p.unit_label)}</td>
              <td>${fmtNumber(p.current_stock)}</td>
              <td style="white-space:nowrap;">
                <button class="btn edit-btn" style="padding:5px 10px;">ویرایش</button>
                <button class="btn danger delete-btn" style="padding:5px 10px;">حذف</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', onEdit));
    wrap.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', onDelete));
  } catch (e) {
    wrap.innerHTML = `<p class="empty">خطا در بارگذاری: ${escHtml(e.message)}</p>`;
  }
}

function onEdit(e) {
  const row = e.target.closest('tr');
  const id = row.dataset.id;
  const product = _lastProducts.find(p => String(p.id) === id);
  if (!product) return;
  document.getElementById('productId').value = product.id;
  document.getElementById('name').value = product.name;
  document.getElementById('categoryId').value = product.category_id || '';
  document.getElementById('unitLabel').value = product.unit_label;
  document.getElementById('alibabaLink').value = product.alibaba_link || '';
  document.getElementById('imageUrl').value = product.image_url || '';
  document.getElementById('formTitle').textContent = 'ویرایش محصول';
  document.getElementById('submitBtn').textContent = 'ذخیره تغییرات';
  document.getElementById('cancelEditBtn').style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('formTitle').textContent = 'محصول جدید';
  document.getElementById('submitBtn').textContent = 'افزودن محصول';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

async function onDelete(e) {
  const row = e.target.closest('tr');
  const id = row.dataset.id;
  if (!confirm('حذف این محصول؟')) return;
  try {
    await api.del(`/api/products/${id}`);
    showToast('محصول حذف شد', 'success');
    loadAll();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('cancelEditBtn').addEventListener('click', resetForm);

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const payload = {
    name: document.getElementById('name').value.trim(),
    category_id: document.getElementById('categoryId').value || null,
    unit_label: document.getElementById('unitLabel').value.trim(),
    alibaba_link: document.getElementById('alibabaLink').value.trim() || null,
    image_url: document.getElementById('imageUrl').value.trim() || null,
  };
  try {
    if (id) {
      await api.patch(`/api/products/${id}`, payload);
      showToast('محصول بروزرسانی شد', 'success');
    } else {
      await api.post('/api/products', payload);
      showToast('محصول افزوده شد', 'success');
    }
    resetForm();
    loadAll();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

async function loadAll() {
  await loadCategoriesIntoSelect();
  await loadProducts();
}

initHeader('products').then(me => { if (me) loadAll(); });

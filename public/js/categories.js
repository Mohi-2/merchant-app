'use strict';

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadCategories() {
  const wrap = document.getElementById('categoriesWrap');
  try {
    const categories = await api.get('/api/categories');
    if (!categories.length) {
      wrap.innerHTML = '<p class="empty">هنوز دسته‌بندی‌ای ثبت نشده.</p>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th>نام</th><th></th></tr></thead>
        <tbody>
          ${categories.map(c => `
            <tr data-id="${c.id}">
              <td class="cat-name">${escHtml(c.name)}</td>
              <td style="white-space:nowrap;">
                <button class="btn rename-btn" style="padding:5px 10px;">ویرایش</button>
                <button class="btn danger delete-btn" style="padding:5px 10px;">حذف</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    wrap.querySelectorAll('.rename-btn').forEach(btn => btn.addEventListener('click', onRename));
    wrap.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', onDelete));
  } catch (e) {
    wrap.innerHTML = `<p class="empty">خطا در بارگذاری: ${escHtml(e.message)}</p>`;
  }
}

async function onRename(e) {
  const row = e.target.closest('tr');
  const id = row.dataset.id;
  const current = row.querySelector('.cat-name').textContent;
  const name = prompt('نام جدید دسته‌بندی:', current);
  if (!name || name.trim() === current) return;
  try {
    await api.patch(`/api/categories/${id}`, { name: name.trim() });
    showToast('دسته‌بندی بروزرسانی شد', 'success');
    loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function onDelete(e) {
  const row = e.target.closest('tr');
  const id = row.dataset.id;
  if (!confirm('حذف این دسته‌بندی؟ محصولات مرتبط بدون دسته‌بندی می‌مانند.')) return;
  try {
    await api.del(`/api/categories/${id}`);
    showToast('دسته‌بندی حذف شد', 'success');
    loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('newCategoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('categoryName');
  try {
    await api.post('/api/categories', { name: input.value.trim() });
    input.value = '';
    showToast('دسته‌بندی افزوده شد', 'success');
    loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

initHeader('categories').then(me => { if (me) loadCategories(); });

'use strict';

const NAV_LINKS = [
  { key: 'dashboard', label: 'موجودی', href: '/dashboard.html' },
  { key: 'products', label: 'محصولات', href: '/products.html' },
  { key: 'categories', label: 'دسته‌بندی‌ها', href: '/categories.html' },
  { key: 'purchases', label: 'خریدها', href: '/purchases.html' },
  { key: 'inventory', label: 'ثبت خروج انبار', href: '/inventory.html' },
];

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'همین الان';
  if (mins < 60) return `${mins} دقیقه پیش`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ساعت پیش`;
  return `${Math.round(hours / 24)} روز پیش`;
}

function renderRateWidget(rate) {
  const box = document.getElementById('rateWidgetText');
  if (!box) return;
  if (!rate) {
    box.textContent = 'نرخ ارز هنوز ثبت نشده';
    return;
  }
  box.textContent = `یوان: ${fmtNumber(rate.cny_to_irr)} | دلار: ${fmtNumber(rate.usd_to_irr)} تومان (${timeAgo(rate.fetched_at)})`;
}

async function refreshExchangeRate() {
  const btn = document.getElementById('refreshRateBtn');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '⏳ در حال دریافت…';
  try {
    const rate = await api.post('/api/exchange-rate/refresh', {});
    renderRateWidget(rate);
    showToast('نرخ ارز بروزرسانی شد', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function initHeader(activeKey) {
  const mount = document.getElementById('app-header');
  if (!mount) return;

  let me;
  try {
    me = (await api.get('/api/auth/me')).user;
  } catch (e) {
    window.location.href = '/login.html';
    return;
  }

  mount.innerHTML = `
    <header class="app-header">
      <span class="brand">📦 مدیریت واردات چین</span>
      <nav>
        ${NAV_LINKS.map(l => `<a href="${l.href}" class="${l.key === activeKey ? 'active' : ''}">${l.label}</a>`).join('')}
      </nav>
      <div class="spacer"></div>
      <div class="rate-widget">
        <span id="rateWidgetText">در حال بارگذاری…</span>
        <button class="btn" id="refreshRateBtn" style="padding:5px 10px;">🔄 بروزرسانی نرخ ارز</button>
      </div>
      <div class="user-box">
        <span>👤 ${me.name}</span>
        <button class="btn" id="logoutBtn" style="padding:5px 10px;">خروج</button>
      </div>
    </header>
  `;

  document.getElementById('refreshRateBtn').addEventListener('click', refreshExchangeRate);
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api.post('/api/auth/logout', {});
    window.location.href = '/login.html';
  });

  try {
    const rate = await api.get('/api/exchange-rate/latest');
    renderRateWidget(rate);
  } catch (e) {
    renderRateWidget(null);
  }

  return me;
}

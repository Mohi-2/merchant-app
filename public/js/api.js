'use strict';

function _apiThrow(r, d) {
  const e = Object.assign(new Error(d.error || 'HTTP ' + r.status), { status: r.status });
  throw e;
}
const api = {
  get: path => fetch(path).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) _apiThrow(r, d); return d; }),
  post: (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) _apiThrow(r, d); return d; }),
  patch: (path, body) => fetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) _apiThrow(r, d); return d; }),
  del: path => fetch(path, { method: 'DELETE' }).then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) _apiThrow(r, d); return d; }),
};

let _toastTimer = null;
function showToast(text, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  if (_toastTimer) clearTimeout(_toastTimer);
  const col = type === 'success' ? '#16a34a' : type === 'error' ? '#ef4444' : '#003EFF';
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  el.style.borderColor = col;
  el.innerHTML = `<span style="color:${col};font-size:16px;">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span><span>${text.replace(/</g, '&lt;')}</span>`;
  _toastTimer = setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(20px)'; }, 3800);
}

function fmtNumber(n) {
  return Number(n || 0).toLocaleString('fa-IR');
}

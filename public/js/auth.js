'use strict';

(async () => {
  try {
    await api.get('/api/auth/me');
    window.location.href = '/dashboard.html';
  } catch (e) {
    // not logged in, stay on login page
  }
})();

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  btn.disabled = true;
  btn.textContent = 'در حال ورود…';
  try {
    await api.post('/api/auth/login', { username, password });
    window.location.href = '/dashboard.html';
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'ورود';
  }
});

(function () {
  const form = document.getElementById('admin-login-form');
  const errorEl = document.getElementById('admin-login-error');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const formData = new FormData(form);
    const payload = {
      username: formData.get('username'),
      password: formData.get('password'),
    };

    try {
      const res = await fetch('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        errorEl.hidden = false;
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (data && data.success) {
        window.location.href = '/admin/dashboard';
      } else {
        window.location.href = '/admin/dashboard';
      }
    } catch (err) {
      errorEl.textContent = 'Unable to login. Please try again.';
      errorEl.hidden = false;
    }
  });
})();

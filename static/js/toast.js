(function () {
  function ensureRoot() {
    let root = document.getElementById('toastRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toastRoot';
      root.className = 'toast-root';
      root.setAttribute('aria-live', 'polite');
      document.body.appendChild(root);
    }
    return root;
  }

  function showToast(message, type, duration) {
    if (!message) return;
    const root = ensureRoot();
    const el = document.createElement('div');
    el.className = `toast toast-${type || 'info'}`;
    el.textContent = message;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const ms = duration ?? 3200;
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 220);
    }, ms);
  }

  window.showToast = showToast;
})();

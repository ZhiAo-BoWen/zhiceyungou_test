function refreshIcons(root) {
  if (window.lucide) lucide.createIcons({ nameAttr: 'data-lucide', root: root || document });
}

refreshIcons();

const adminLoginSection = document.getElementById('adminLoginSection');
const adminMainSection = document.getElementById('adminMainSection');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const adminLoginError = document.getElementById('adminLoginError');
const adminPasswordError = document.getElementById('adminPasswordError');
const adminPasswordSuccess = document.getElementById('adminPasswordSuccess');
let reviewingApplicationId = null;

function showAdminPasswordMessage(error, success) {
  if (adminPasswordError) {
    adminPasswordError.textContent = error || '';
    adminPasswordError.hidden = !error;
  }
  if (adminPasswordSuccess) {
    adminPasswordSuccess.textContent = success || '';
    adminPasswordSuccess.hidden = !success;
  }
}

function showLoginError(message) {
  if (!adminLoginError) return;
  adminLoginError.textContent = message;
  adminLoginError.hidden = !message;
}

function setLoggedIn(loggedIn) {
  adminLoginSection.hidden = loggedIn;
  adminMainSection.hidden = !loggedIn;
  adminLogoutBtn.hidden = !loggedIn;
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

async function checkSession() {
  try {
    const data = await apiFetch('/api/admin/session');
    setLoggedIn(!!data.logged_in);
    if (data.logged_in) {
      await loadAllPanels();
    }
  } catch {
    setLoggedIn(false);
  }
}

document.getElementById('adminLoginBtn')?.addEventListener('click', async () => {
  const password = document.getElementById('adminLoginPassword')?.value || '';
  if (!password) {
    showLoginError('请输入密码');
    return;
  }
  showLoginError('');
  try {
    await apiFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoggedIn(true);
    await loadAllPanels();
  } catch (err) {
    showLoginError(err.message);
  }
});

document.getElementById('adminLoginPassword')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('adminLoginBtn')?.click();
});

adminLogoutBtn?.addEventListener('click', async () => {
  await apiFetch('/api/admin/logout', { method: 'POST' });
  setLoggedIn(false);
});

document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.admin-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab);
    });
  });
});

document.getElementById('changePasswordBtn')?.addEventListener('click', async () => {
  const current = document.getElementById('currentAdminPassword')?.value || '';
  const next = document.getElementById('newAdminPassword')?.value || '';
  const confirm = document.getElementById('confirmAdminPassword')?.value || '';
  showAdminPasswordMessage('', '');
  if (!current || !next) {
    showAdminPasswordMessage('请填写完整密码信息', '');
    return;
  }
  if (next !== confirm) {
    showAdminPasswordMessage('两次输入的新密码不一致', '');
    return;
  }
  try {
    await apiFetch('/api/admin/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
    showAdminPasswordMessage('', '密码修改成功');
    document.getElementById('currentAdminPassword').value = '';
    document.getElementById('newAdminPassword').value = '';
    document.getElementById('confirmAdminPassword').value = '';
  } catch (err) {
    showAdminPasswordMessage(err.message, '');
  }
});

function renderUsers(users) {
  const tbody = document.querySelector('#usersTable tbody');
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="admin-empty">暂无用户记录</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(user => `
    <tr>
      <td>${escapeHtml(user.ip || '')}</td>
      <td>${user.remaining ?? 0}</td>
      <td>${user.used ?? 0}</td>
      <td>${escapeHtml(user.last_login_at || '-')}</td>
      <td>${escapeHtml(user.created_at || '-')}</td>
    </tr>
  `).join('');
}

function renderLogs(logs) {
  const tbody = document.querySelector('#logsTable tbody');
  if (!tbody) return;
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">暂无日志</td></tr>';
    return;
  }
  tbody.innerHTML = logs.map(log => `
    <tr>
      <td>${escapeHtml(log.created_at || '')}</td>
      <td><span class="admin-tag">${escapeHtml(log.category_label || log.category || '')}</span></td>
      <td>${escapeHtml(log.ip || '')}</td>
      <td>${log.remaining ?? '-'}</td>
      <td>${escapeHtml(log.last_login_at || '-')}</td>
      <td>${escapeHtml(log.message || '')}</td>
    </tr>
  `).join('');
}

function renderApplications(items) {
  const tbody = document.querySelector('#applicationsTable tbody');
  if (!tbody) return;
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="admin-empty">暂无申请记录</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${escapeHtml(item.created_at || '')}</td>
      <td>${escapeHtml(item.nickname || '')}</td>
      <td>${escapeHtml(item.ip || '')}</td>
      <td class="admin-reason-cell">${escapeHtml(item.reason || '')}</td>
      <td><span class="admin-status admin-status-${item.status || ''}">${escapeHtml(item.status_label || item.status || '')}</span></td>
      <td>
        ${item.status === 'pending'
          ? `<button type="button" class="btn-mini btn-primary admin-review-btn" data-id="${escapeHtml(item.id)}">处理</button>`
          : `<span class="admin-muted">${escapeHtml(item.reviewed_at || '-')}</span>`}
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('.admin-review-btn').forEach(btn => {
    btn.addEventListener('click', () => openReviewModal(btn.dataset.id, items));
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadUsers() {
  const users = await apiFetch('/api/admin/users');
  renderUsers(users);
}

async function loadLogs() {
  const category = document.getElementById('logCategoryFilter')?.value || '';
  const url = category ? `/api/admin/logs?category=${encodeURIComponent(category)}` : '/api/admin/logs';
  const logs = await apiFetch(url);
  renderLogs(logs);
}

async function loadApplications() {
  const status = document.getElementById('applicationStatusFilter')?.value || '';
  const url = status ? `/api/admin/applications?status=${encodeURIComponent(status)}` : '/api/admin/applications';
  const items = await apiFetch(url);
  renderApplications(items);
}

async function loadAllPanels() {
  await Promise.all([loadUsers(), loadLogs(), loadApplications()]);
}

document.getElementById('refreshUsersBtn')?.addEventListener('click', loadUsers);
document.getElementById('refreshLogsBtn')?.addEventListener('click', loadLogs);
document.getElementById('refreshApplicationsBtn')?.addEventListener('click', loadApplications);
document.getElementById('logCategoryFilter')?.addEventListener('change', loadLogs);
document.getElementById('applicationStatusFilter')?.addEventListener('change', loadApplications);

const reviewModal = document.getElementById('reviewModal');

function openReviewModal(id, items) {
  const item = items.find(entry => entry.id === id);
  if (!item) return;
  reviewingApplicationId = id;
  document.getElementById('reviewModalHint').textContent =
    `昵称：${item.nickname} · IP：${item.ip} · 理由：${item.reason}`;
  document.getElementById('reviewGrantCount').value = '2';
  document.getElementById('reviewNote').value = '';
  reviewModal.hidden = false;
  refreshIcons(reviewModal);
}

function closeReviewModal() {
  reviewModal.hidden = true;
  reviewingApplicationId = null;
}

document.getElementById('reviewModalClose')?.addEventListener('click', closeReviewModal);
reviewModal?.addEventListener('click', e => {
  if (e.target === reviewModal) closeReviewModal();
});

async function submitReview(action) {
  if (!reviewingApplicationId) return;
  try {
    await apiFetch(`/api/admin/applications/${reviewingApplicationId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        granted: Number(document.getElementById('reviewGrantCount')?.value || 2),
        review_note: document.getElementById('reviewNote')?.value || '',
      }),
    });
    closeReviewModal();
    await loadAllPanels();
    showToast(action === 'approve' ? '已批准申请' : '已拒绝申请', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('reviewApproveBtn')?.addEventListener('click', () => submitReview('approve'));
document.getElementById('reviewRejectBtn')?.addEventListener('click', () => submitReview('reject'));

checkSession();

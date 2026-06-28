function initMermaidTheme() {
  mermaid.initialize({
    startOnLoad: false,
    theme: getTheme() === 'dark' ? 'dark' : 'default',
    securityLevel: 'loose',
  });
}

initMermaidTheme();

function refreshIcons(root) {
  if (window.lucide) lucide.createIcons({ nameAttr: 'data-lucide', root: root || document });
}

const THEME_KEY = 'app-theme';

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function updateThemeToggleUI(theme) {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const iconWrap = btn.querySelector('.footer-action-icon');
  const label = btn.querySelector('.theme-label');
  const iconEl = iconWrap?.querySelector('[data-lucide]');
  if (iconEl) iconEl.setAttribute('data-lucide', theme === 'light' ? 'moon' : 'sun');
  if (label) label.textContent = theme === 'light' ? '深色模式' : '浅色模式';
  refreshIcons(btn);
}

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  updateThemeToggleUI(next);
  initMermaidTheme();
  if (currentTask?.result) {
    renderTechStack(currentTask.result.tech_stack);
    renderHardware(currentTask.result.hardware);
    renderProjectStructure(currentTask.result.project_structure);
  }
}

refreshIcons();
updateThemeToggleUI(getTheme());

document.getElementById('themeToggle')?.addEventListener('click', () => {
  applyTheme(getTheme() === 'light' ? 'dark' : 'light');
});

document.getElementById('adminPanelBtn')?.addEventListener('click', () => {
  window.open('/admin', '_blank');
});

// ---- 体验次数与申请 ----
const quotaApplyModal = document.getElementById('quotaApplyModal');
const quotaBadge = document.getElementById('quotaBadge');
const quotaApplyStatus = document.getElementById('quotaApplyStatus');
const quotaApplyError = document.getElementById('quotaApplyError');
let currentQuota = null;

function showQuotaApplyError(message) {
  if (!quotaApplyError) return;
  quotaApplyError.textContent = message || '';
  quotaApplyError.hidden = !message;
}

function updateQuotaBadge(quota) {
  currentQuota = quota;
  if (!quotaBadge || !quota) return;
  quotaBadge.textContent = `剩余体验次数：${quota.remaining ?? 0} / ${quota.limit ?? 2}`;
  quotaBadge.classList.toggle('quota-empty', !quota.can_submit);
}

async function loadQuotaStatus() {
  try {
    const res = await fetch('/api/quota/status');
    const data = await res.json();
    updateQuotaBadge(data);
  } catch {
    if (quotaBadge) quotaBadge.textContent = '剩余体验次数：--';
  }
}

function openQuotaApplyModal() {
  if (!quotaApplyModal) return;
  quotaApplyModal.hidden = false;
  showQuotaApplyError('');
  if (quotaApplyStatus && currentQuota) {
    quotaApplyStatus.textContent = `当前剩余 ${currentQuota.remaining ?? 0} 次体验机会`;
    quotaApplyStatus.className = 'quota-apply-status';
  }
  document.getElementById('quotaNickname').value = '';
  document.getElementById('quotaReason').value = '';
  refreshIcons(quotaApplyModal);
  document.getElementById('quotaNickname')?.focus();
}

function closeQuotaApplyModal() {
  if (quotaApplyModal) quotaApplyModal.hidden = true;
}

document.getElementById('quotaApplyBtn')?.addEventListener('click', openQuotaApplyModal);
document.getElementById('quotaApplyModalClose')?.addEventListener('click', closeQuotaApplyModal);
document.getElementById('quotaApplyCancelBtn')?.addEventListener('click', closeQuotaApplyModal);
quotaApplyModal?.addEventListener('click', e => {
  if (e.target === quotaApplyModal) closeQuotaApplyModal();
});

document.getElementById('quotaApplySubmitBtn')?.addEventListener('click', async () => {
  const nickname = document.getElementById('quotaNickname')?.value.trim();
  const reason = document.getElementById('quotaReason')?.value.trim();
  if (!nickname) {
    showQuotaApplyError('请填写昵称');
    return;
  }
  if (!reason) {
    showQuotaApplyError('请填写申请理由');
    return;
  }
  showQuotaApplyError('');
  const btn = document.getElementById('quotaApplySubmitBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/quota/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '提交失败');
    closeQuotaApplyModal();
    showToast('申请已提交，请等待管理员审核', 'success');
  } catch (err) {
    showQuotaApplyError(err.message);
  } finally {
    btn.disabled = false;
  }
});

loadQuotaStatus();

let currentFile = null;
let currentTask = null;
let hwChartInstances = [];
let workspaceSyncInterval = null;

// ---- 视图切换 ----
let activeNavView = 'home';
let activeTaskId = null;

function showView(name, navView, taskId = null) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const map = { intro: 'viewIntro', home: 'viewHome', loading: 'viewLoading', result: 'viewResult', history: 'viewHistory' };
  document.getElementById(map[name])?.classList.add('active');

  if (taskId) {
    activeTaskId = taskId;
    activeNavView = null;
  } else if (navView) {
    activeNavView = navView;
    activeTaskId = null;
  } else if (['intro', 'home', 'history'].includes(name)) {
    activeNavView = name;
    activeTaskId = null;
  }
  syncNavHighlight();
}

function syncNavHighlight() {
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', !activeTaskId && n.dataset.view === activeNavView);
  });
  document.querySelectorAll('.history-item[data-task-id]').forEach(h => {
    h.classList.toggle('active', !!activeTaskId && h.dataset.taskId === activeTaskId);
  });
  document.querySelectorAll('.history-card[data-task-id]').forEach(c => {
    c.classList.toggle('active', !!activeTaskId && c.dataset.taskId === activeTaskId);
  });
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    stopWorkspaceSync();
    if (view === 'intro') showView('intro', 'intro');
    if (view === 'home') showView('home', 'home');
    if (view === 'history') { loadHistoryFull(); showView('history', 'history'); }
  });
});

// ---- 结果模块切换 ----
function switchResultModule(name) {
  document.querySelectorAll('.result-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.module === name);
  });
  document.querySelectorAll('.result-module').forEach(m => {
    m.classList.toggle('active', m.dataset.module === name);
  });
  if (name === 'hardware') {
    hwChartInstances.forEach(c => c.resize());
  }
  if (name === 'structure') {
    startWorkspaceSync();
  } else {
    stopWorkspaceSync();
  }
}

document.querySelectorAll('.result-tab').forEach(btn => {
  btn.addEventListener('click', () => switchResultModule(btn.dataset.module));
});

// ---- Tab 切换 ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector(`[data-panel="${btn.dataset.tab}"]`)?.classList.add('active');
  });
});

// ---- 文件上传 ----
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const fileAnalyzeBtn = document.getElementById('fileAnalyzeBtn');
const clearFileBtn = document.getElementById('clearFileBtn');
const useExampleFileBtn = document.getElementById('useExampleFileBtn');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files.length) setFile(fileInput.files[0]); });

function setFile(file) {
  currentFile = file;
  fileName.textContent = file.name;
  fileAnalyzeBtn.disabled = false;
  clearFileBtn.disabled = false;
}

function clearFile() {
  currentFile = null;
  fileInput.value = '';
  fileName.textContent = '';
  fileAnalyzeBtn.disabled = true;
  clearFileBtn.disabled = true;
}

clearFileBtn.addEventListener('click', clearFile);

useExampleFileBtn?.addEventListener('click', async e => {
  e.stopPropagation();
  useExampleFileBtn.disabled = true;
  try {
    const res = await fetch('/api/examples/default');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '实例文件加载失败');
    }
    const blob = await res.blob();
    const file = new File([blob], '业务需求示例_智慧仓储.txt', { type: 'text/plain' });
    setFile(file);
    showToast('已加载实例文件：智慧仓储', 'success');
    refreshIcons(useExampleFileBtn.closest('.upload-example-row'));
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    useExampleFileBtn.disabled = false;
  }
});

// ---- 表单清除 ----
const businessForm = document.getElementById('businessForm');
document.getElementById('clearFormBtn').addEventListener('click', () => {
  businessForm.reset();
});

// ---- 表单提交 ----
businessForm.addEventListener('submit', async e => {
  e.preventDefault();
  const formData = new FormData(e.target);
  formData.append('input_type', 'form');
  formData.append('model', document.getElementById('modelSelect').value);
  await runAnalysis(formData);
});

fileAnalyzeBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  const formData = new FormData();
  formData.append('input_type', 'file');
  formData.append('file', currentFile);
  formData.append('model', document.getElementById('modelSelect').value);
  await runAnalysis(formData);
});

function getModelDisplayName(modelId) {
  const sel = document.getElementById('modelSelect');
  if (!sel || !modelId) return modelId || '';
  const opt = [...sel.options].find(o => o.value === modelId);
  return opt ? opt.textContent.trim() : modelId;
}

function setLoadingView({ title = '', model = '' } = {}) {
  const loadingTitle = document.getElementById('loadingTaskTitle');
  const loadingModel = document.getElementById('loadingTaskModel');
  if (loadingTitle) loadingTitle.textContent = title;
  if (loadingModel) loadingModel.textContent = model ? `模型：${model}` : '';
}

async function runAnalysis(formData) {
  let taskId = null;
  const modelId = formData.get('model') || document.getElementById('modelSelect')?.value || '';
  setLoadingView({ model: getModelDisplayName(modelId) });
  showView('loading', 'home');
  try {
    const prepRes = await fetch('/api/tasks/submit', { method: 'POST', body: formData });
    const prep = await prepRes.json().catch(() => ({}));
    if (!prepRes.ok) throw new Error(prep.error || '创建任务失败');
    if (prep.quota) updateQuotaBadge(prep.quota);

    taskId = prep.task.id;
    setLoadingView({
      title: prep.task.title || '',
      model: getModelDisplayName(prep.task.model || modelId),
    });
    activeTaskId = taskId;
    await loadTaskHistory();
    syncNavHighlight();

    const runRes = await fetch(`/api/tasks/${taskId}/run`, { method: 'POST' });
    const data = await runRes.json().catch(() => ({}));
    if (!runRes.ok) throw new Error(data.error || '分析失败');
    if (data.quota) updateQuotaBadge(data.quota);
    if (data.workspace) updateServerWorkspaceUI(data.workspace);
    if (window.IS_SERVER_MODE && data.workspace?.ready) {
      applyWorkspace(data.task?.workspace_path || data.workspace.path, false);
    } else if (data.task?.workspace_path) {
      applyWorkspace(data.task.workspace_path, false);
    }

    renderResult(data.task);
    await loadTaskHistory();
    switchResultModule('tech');
    showView('result', null, data.task.id);
  } catch (err) {
    await loadTaskHistory();
    await loadQuotaStatus();
    showToast(err.message, 'error', 4500);
    if (taskId) {
      loadHistoryFull();
      showView('history', 'history', taskId);
    } else {
      showView('home', 'home');
    }
  }
}

// ---- 渲染结果 ----
function renderResult(task) {
  currentTask = task;

  const { form_data, result, model, created_at } = task;
  document.getElementById('resultTitle').textContent = form_data.project_name || '分析结果';
  document.getElementById('resultMeta').textContent = `${created_at} · ${model}`;

  renderTechStack(result.tech_stack);
  renderHardware(result.hardware);
  renderProjectStructure(result.project_structure);

  if (window.IS_SERVER_MODE) {
    loadServerWorkspaceInfo().then(info => {
      if (!info?.ready) {
        resetWorkspace();
        return;
      }
      applyWorkspace(task.workspace_path || info.path, false);
    });
  } else if (task.workspace_path) {
    applyWorkspace(task.workspace_path, false);
  } else {
    resetWorkspace();
  }
}

function renderTechStack(tech) {
  if (!tech) return;
  const tbody = document.querySelector('#techStackTable tbody');
  tbody.innerHTML = '';
  (tech.items || []).forEach(item => {
    const pri = item.priority || '中';
    const priClass = pri.includes('高') ? 'priority-high' : pri.includes('低') ? 'priority-low' : 'priority-mid';
    tbody.innerHTML += `<tr>
      <td>${esc(item.category)}</td>
      <td><strong>${esc(item.technology)}</strong></td>
      <td>${esc(item.version)}</td>
      <td class="${priClass}">${esc(pri)}</td>
      <td>${esc(item.reason)}</td>
    </tr>`;
  });
  renderMermaid('archDiagram', tech.architecture_mermaid);
}

function renderHardware(hw) {
  if (!hw) return;
  document.getElementById('hwSummary').textContent = hw.summary || '';
  const tbody = document.querySelector('#hardwareTable tbody');
  tbody.innerHTML = '';
  (hw.items || []).forEach(item => {
    tbody.innerHTML += `<tr>
      <td><strong>${esc(item.name)}</strong></td>
      <td>${esc(item.spec)}</td>
      <td>${item.quantity ?? '-'}</td>
      <td>${esc(item.unit_price)}</td>
      <td>${esc(item.total_price)}</td>
      <td>${esc(item.reason)}</td>
    </tr>`;
  });
  renderHwCharts(hw.items || []);
}

function chartThemeOptions() {
  const dark = getTheme() === 'dark';
  const grid = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const tick = dark ? '#9ca3af' : '#6b7280';
  const label = dark ? '#e8eaf0' : '#1a1f36';
  return {
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: { stepSize: 20, color: tick, backdropColor: 'transparent' },
        grid: { color: grid },
        angleLines: { color: grid },
        pointLabels: { color: label },
      },
    },
    plugins: { legend: { display: false } },
  };
}

function renderHwCharts(items) {
  const container = document.getElementById('hwCharts');
  container.innerHTML = '';
  hwChartInstances.forEach(c => c.destroy());
  hwChartInstances = [];

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'hw-chart-card';
    card.innerHTML = `<h5>${esc(item.name)}</h5><canvas id="hwChart${idx}"></canvas>`;
    container.appendChild(card);

    const metrics = item.metrics || {};
    const labels = ['性能', '性价比', '可扩展性', '可靠性'];
    const values = [
      metrics.performance ?? 70,
      metrics.cost_efficiency ?? 70,
      metrics.scalability ?? 70,
      metrics.reliability ?? 70,
    ];

    const ctx = document.getElementById(`hwChart${idx}`).getContext('2d');
    const chart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: item.name,
          data: values,
          backgroundColor: 'rgba(79,110,247,0.2)',
          borderColor: 'rgba(79,110,247,0.8)',
          pointBackgroundColor: 'rgba(79,110,247,1)',
        }],
      },
      options: chartThemeOptions(),
    });
    hwChartInstances.push(chart);
  });
}

function renderProjectStructure(proj) {
  if (!proj) return;
  document.getElementById('structureSummary').textContent = proj.readme_summary || '';
  renderTree(document.getElementById('projectTree'), proj.tree || []);
  renderMermaid('structureDiagram', proj.mermaid);
}

function renderTree(container, nodes) {
  container.innerHTML = '';
  function build(parent, items, d) {
    items.forEach(node => {
      const div = document.createElement('div');
      div.className = 'tree-node';
      div.style.paddingLeft = (d * 16) + 'px';

      const item = document.createElement('div');
      item.className = 'tree-item';

      const isFolder = node.type === 'folder';
      const icon = document.createElement('span');
      icon.className = 'explorer-icon ' + fileIconClass(node.name, isFolder, false);

      const name = document.createElement('span');
      name.className = 'tree-name';
      name.textContent = node.name;

      const desc = document.createElement('span');
      desc.className = 'tree-desc';
      desc.textContent = node.description || '';

      item.append(icon, name, desc);
      div.appendChild(item);
      parent.appendChild(div);
      if (node.children?.length) build(parent, node.children, d + 1);
    });
  }
  build(container, nodes, 0);
}

async function renderMermaid(elementId, code) {
  const el = document.getElementById(elementId);
  const btn = document.querySelector(`.btn-diagram-fs[data-diagram="${elementId}"]`);
  if (!el || !code) {
    if (el) el.textContent = '暂无图表';
    diagramSources[elementId] = null;
    if (btn) btn.disabled = true;
    return;
  }
  el.removeAttribute('data-processed');
  el.textContent = code;
  try {
    const { svg } = await mermaid.render('mmd_' + elementId + '_' + Date.now(), code);
    el.innerHTML = svg;
    diagramSources[elementId] = code;
    if (btn) btn.disabled = false;
  } catch {
    el.textContent = code;
    diagramSources[elementId] = null;
    if (btn) btn.disabled = true;
  }
}

// ---- 图表全屏查看 ----
const diagramSources = {};
const diagramFsOverlay = document.getElementById('diagramFullscreen');
const diagramFsViewport = document.getElementById('diagramFsViewport');
const diagramFsStage = document.getElementById('diagramFsStage');
const diagramFsTitle = document.getElementById('diagramFsTitle');
const diagramFsZoomLevel = document.getElementById('diagramFsZoomLevel');

const diagramViewer = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  baseWidth: 0,
  baseHeight: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  translateStartX: 0,
  translateStartY: 0,
  diagramId: null,
  title: '',
  minScale: 0.1,
  maxScale: 12,
};

function readSvgNaturalSize(svg) {
  const widthAttr = svg.getAttribute('width');
  const heightAttr = svg.getAttribute('height');
  if (widthAttr && heightAttr) {
    const width = parseFloat(widthAttr);
    const height = parseFloat(heightAttr);
    if (width > 0 && height > 0) return { width, height };
  }
  const viewBox = svg.viewBox?.baseVal;
  if (viewBox?.width > 0 && viewBox?.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }
  const box = svg.getBBox();
  return { width: box.width, height: box.height };
}

function getDiagramSvgSize(svg) {
  if (diagramViewer.baseWidth && diagramViewer.baseHeight) {
    return {
      width: diagramViewer.baseWidth * diagramViewer.scale,
      height: diagramViewer.baseHeight * diagramViewer.scale,
    };
  }
  return readSvgNaturalSize(svg);
}

function updateDiagramPosition() {
  if (!diagramFsStage) return;
  diagramFsStage.style.transform = `translate(${diagramViewer.translateX}px, ${diagramViewer.translateY}px)`;
}

function applyDiagramView() {
  const svg = diagramFsStage?.querySelector('svg');
  if (svg && diagramViewer.baseWidth && diagramViewer.baseHeight) {
    const width = diagramViewer.baseWidth * diagramViewer.scale;
    const height = diagramViewer.baseHeight * diagramViewer.scale;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    svg.style.maxWidth = 'none';
  }
  updateDiagramPosition();
  if (diagramFsZoomLevel) {
    diagramFsZoomLevel.textContent = `${Math.round(diagramViewer.scale * 100)}%`;
  }
}

function fitDiagramToView() {
  const svg = diagramFsStage?.querySelector('svg');
  if (!svg || !diagramFsViewport || !diagramViewer.baseWidth) return;
  const vw = diagramFsViewport.clientWidth;
  const vh = diagramFsViewport.clientHeight;
  const padding = 48;
  const scaleX = (vw - padding) / diagramViewer.baseWidth;
  const scaleY = (vh - padding) / diagramViewer.baseHeight;
  diagramViewer.scale = Math.min(Math.max(Math.min(scaleX, scaleY), diagramViewer.minScale), 3);
  diagramViewer.translateX = (vw - diagramViewer.baseWidth * diagramViewer.scale) / 2;
  diagramViewer.translateY = (vh - diagramViewer.baseHeight * diagramViewer.scale) / 2;
  applyDiagramView();
}

function zoomDiagramAt(clientX, clientY, factor) {
  if (!diagramFsViewport) return;
  const rect = diagramFsViewport.getBoundingClientRect();
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  const prevScale = diagramViewer.scale;
  const nextScale = Math.min(diagramViewer.maxScale, Math.max(diagramViewer.minScale, prevScale * factor));
  const ratio = nextScale / prevScale;
  diagramViewer.translateX = mx - (mx - diagramViewer.translateX) * ratio;
  diagramViewer.translateY = my - (my - diagramViewer.translateY) * ratio;
  diagramViewer.scale = nextScale;
  applyDiagramView();
}

function openDiagramFullscreen(diagramId, title) {
  const sourceEl = document.getElementById(diagramId);
  const svg = sourceEl?.querySelector('svg');
  if (!svg || !diagramFsOverlay || !diagramFsStage) return;

  diagramViewer.diagramId = diagramId;
  diagramViewer.title = title || '图表';
  if (diagramFsTitle) diagramFsTitle.textContent = diagramViewer.title;

  diagramFsStage.innerHTML = '';
  const clone = svg.cloneNode(true);
  diagramFsStage.appendChild(clone);

  const { width, height } = readSvgNaturalSize(clone);
  diagramViewer.baseWidth = width;
  diagramViewer.baseHeight = height;
  diagramViewer.scale = 1;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.maxWidth = 'none';

  diagramFsOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  refreshIcons(diagramFsOverlay);

  requestAnimationFrame(() => fitDiagramToView());
}

function closeDiagramFullscreen() {
  if (!diagramFsOverlay) return;
  diagramFsOverlay.hidden = true;
  document.body.style.overflow = '';
  if (diagramFsStage) diagramFsStage.innerHTML = '';
  diagramViewer.isDragging = false;
  diagramViewer.baseWidth = 0;
  diagramViewer.baseHeight = 0;
  diagramFsViewport?.classList.remove('dragging');
}

function getDiagramBgColor() {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue('--diagram-bg').trim() || (getTheme() === 'dark' ? '#1e2230' : '#f8f9fc');
}

async function downloadDiagramPng() {
  const svg = diagramFsStage?.querySelector('svg');
  if (!svg) return;

  const clone = svg.cloneNode(true);
  const width = diagramViewer.baseWidth || readSvgNaturalSize(clone).width;
  const height = diagramViewer.baseHeight || readSvgNaturalSize(clone).height;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.style.width = '';
  clone.style.height = '';
  clone.style.maxWidth = '';
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  const bg = getDiagramBgColor();
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('width', '100%');
  bgRect.setAttribute('height', '100%');
  bgRect.setAttribute('fill', bg);
  clone.insertBefore(bgRect, clone.firstChild);

  const svgData = new XMLSerializer().serializeToString(clone);
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = new Image();
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const project = currentTask?.form_data?.project_name || 'diagram';
  const safeName = `${diagramViewer.title}-${project}`.replace(/[\\/:*?"<>|]/g, '_');
  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

document.querySelectorAll('.btn-diagram-fs').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    openDiagramFullscreen(btn.dataset.diagram, btn.dataset.title);
  });
});

diagramFsViewport?.addEventListener('wheel', e => {
  e.preventDefault();
  zoomDiagramAt(e.clientX, e.clientY, e.deltaY > 0 ? 0.9 : 1.1);
}, { passive: false });

diagramFsViewport?.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  diagramViewer.isDragging = true;
  diagramViewer.dragStartX = e.clientX;
  diagramViewer.dragStartY = e.clientY;
  diagramViewer.translateStartX = diagramViewer.translateX;
  diagramViewer.translateStartY = diagramViewer.translateY;
  diagramFsViewport.classList.add('dragging');
});

window.addEventListener('mousemove', e => {
  if (!diagramViewer.isDragging) return;
  diagramViewer.translateX = diagramViewer.translateStartX + (e.clientX - diagramViewer.dragStartX);
  diagramViewer.translateY = diagramViewer.translateStartY + (e.clientY - diagramViewer.dragStartY);
  updateDiagramPosition();
});

window.addEventListener('mouseup', () => {
  if (!diagramViewer.isDragging) return;
  diagramViewer.isDragging = false;
  diagramFsViewport?.classList.remove('dragging');
});

document.getElementById('diagramFsZoomIn')?.addEventListener('click', () => {
  const rect = diagramFsViewport?.getBoundingClientRect();
  if (rect) zoomDiagramAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2);
});

document.getElementById('diagramFsZoomOut')?.addEventListener('click', () => {
  const rect = diagramFsViewport?.getBoundingClientRect();
  if (rect) zoomDiagramAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.2);
});

document.getElementById('diagramFsReset')?.addEventListener('click', fitDiagramToView);
document.getElementById('diagramFsDownload')?.addEventListener('click', () => downloadDiagramPng().catch(() => showToast('PNG 导出失败', 'error')));
document.getElementById('diagramFsClose')?.addEventListener('click', closeDiagramFullscreen);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && diagramFsOverlay && !diagramFsOverlay.hidden) {
    closeDiagramFullscreen();
  }
});

// ---- 工作空间选择与写入 ----
const workspacePath = document.getElementById('workspacePath');
const selectWorkspaceBtn = document.getElementById('selectWorkspaceBtn');
const downloadWorkspaceBtn = document.getElementById('downloadWorkspaceBtn');
const writeProjectBtn = document.getElementById('writeProjectBtn');
const writeStatus = document.getElementById('writeStatus');
const syncTime = document.getElementById('syncTime');
const syncRefreshBtn = document.getElementById('syncRefreshBtn');
const syncToolbar = document.getElementById('syncToolbar');
const localFolderTree = document.getElementById('localFolderTree');
const workspaceHint = document.getElementById('workspaceHint');
const workspaceQuotaBar = document.getElementById('workspaceQuotaBar');
const workspaceQuotaFill = document.getElementById('workspaceQuotaFill');
const workspaceQuotaText = document.getElementById('workspaceQuotaText');
const serverFolderModal = document.getElementById('serverFolderModal');
const serverFolderList = document.getElementById('serverFolderList');
let serverWorkspaceInfo = null;
let activeSyncRoot = '';

function getServerHomePath() {
  return workspacePath?.dataset.serverHome || serverWorkspaceInfo?.home || serverWorkspaceInfo?.path || '';
}

function getActiveWorkspacePath() {
  if (!window.IS_SERVER_MODE) return workspacePath?.value.trim() || '';
  return workspacePath?.dataset.serverPath || getServerHomePath();
}

function formatServerWorkspaceLabel(fullPath) {
  const home = getServerHomePath();
  const slug = serverWorkspaceInfo?.display_name || '云端主目录';
  if (!fullPath || fullPath === home) return `${slug} / (根目录)`;
  if (home && fullPath.startsWith(home + '/')) {
    return `${slug} / ${fullPath.slice(home.length + 1)}`;
  }
  return fullPath;
}

function joinWorkspacePath(base, rel) {
  if (!rel) return base;
  return `${base.replace(/\/$/, '')}/${rel.replace(/^\//, '')}`;
}

function isWorkspaceQuotaFull(info) {
  if (!info?.ready) return false;
  return Number(info.remaining_bytes ?? 1) <= 0;
}

function updateWorkspaceQuotaUI(info) {
  if (!window.IS_SERVER_MODE || !info?.ready) {
    workspaceQuotaBar?.setAttribute('hidden', '');
    return;
  }
  workspaceQuotaBar?.removeAttribute('hidden');
  const used = Number(info.used_mb ?? 0);
  const quota = Number(info.quota_mb ?? 10);
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  if (workspaceQuotaFill) {
    workspaceQuotaFill.style.width = `${pct}%`;
    workspaceQuotaFill.classList.toggle('quota-full', pct >= 100);
    workspaceQuotaFill.classList.toggle('quota-warn', pct >= 80 && pct < 100);
  }
  if (workspaceQuotaText) {
    workspaceQuotaText.textContent = `${used} MB / ${quota} MB`;
  }
  if (syncToolbar) {
    const full = isWorkspaceQuotaFull(info);
    syncToolbar.querySelectorAll('[data-action="mkfile"], [data-action="mkdir"]').forEach(btn => {
      btn.disabled = full;
      btn.title = full ? '存储空间已满（10MB 上限）' : '';
    });
  }
}

function updateServerWorkspaceUI(info) {
  serverWorkspaceInfo = info || null;
  if (workspaceHint && info) {
    workspaceHint.textContent = info.ready
      ? `主目录配额 ${info.used_mb}MB / ${info.quota_mb}MB · 可为每个任务选择不同子文件夹`
      : (info.message || workspaceHint.textContent);
  }
  updateWorkspaceQuotaUI(info);
  if (!workspacePath) return;
  if (info?.ready) {
    workspacePath.dataset.serverHome = info.home || info.path;
    if (!workspacePath.dataset.serverPath) {
      workspacePath.dataset.serverPath = info.path;
    }
    workspacePath.value = formatServerWorkspaceLabel(getActiveWorkspacePath());
    writeProjectBtn.disabled = !currentTask;
    syncToolbar.hidden = false;
    updateSyncRefreshBtn();
  } else {
    workspacePath.value = '';
    workspacePath.dataset.serverPath = '';
    workspacePath.dataset.serverHome = '';
    writeProjectBtn.disabled = true;
    syncToolbar.hidden = true;
    syncTime.textContent = '尚未分配';
    updateSyncRefreshBtn();
  }
}

async function loadServerWorkspaceInfo() {
  if (!window.IS_SERVER_MODE) return null;
  try {
    const res = await fetch('/api/workspace/info');
    const data = await res.json();
    updateServerWorkspaceUI(data);
    return data;
  } catch {
    return null;
  }
}

if (window.IS_SERVER_MODE) {
  loadServerWorkspaceInfo().then(info => {
    if (info?.ready) applyWorkspace(info.path, false);
  });
}

const workspaceExplorer = new WorkspaceExplorer({
  container: localFolderTree,
  toolbar: syncToolbar,
  onRequest: (endpoint, extra, refresh) => workspaceRequest(endpoint, extra, refresh),
});

function updateSyncRefreshBtn() {
  const ready = !!getActiveWorkspacePath();
  if (syncRefreshBtn) syncRefreshBtn.disabled = !ready;
  if (downloadWorkspaceBtn) downloadWorkspaceBtn.disabled = !ready;
}

function resetWorkspace() {
  workspacePath.value = '';
  workspacePath.dataset.serverPath = '';
  workspacePath.dataset.serverHome = '';
  activeSyncRoot = '';
  writeProjectBtn.disabled = true;
  writeStatus.textContent = '';
  writeStatus.classList.remove('error');
  stopWorkspaceSync();
  syncTime.textContent = '未选择';
  updateSyncRefreshBtn();
  syncToolbar.hidden = true;
  workspaceExplorer.reset();
}

async function saveTaskWorkspace(path) {
  if (!currentTask?.id) return;
  try {
    const res = await fetch(`/api/tasks/${currentTask.id}/workspace`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const data = await parseJsonResponse(res);
    if (res.ok) currentTask.workspace_path = path;
  } catch { /* ignore */ }
}

function applyWorkspace(path, persist = true) {
  if (window.IS_SERVER_MODE) {
    const home = getServerHomePath();
    const target = path || home;
    workspacePath.dataset.serverHome = home;
    workspacePath.dataset.serverPath = target;
    workspacePath.value = formatServerWorkspaceLabel(target);
    if (persist && target) saveTaskWorkspace(target);
  } else {
    workspacePath.value = path;
    if (persist) saveTaskWorkspace(path);
  }
  writeProjectBtn.disabled = !currentTask;
  syncToolbar.hidden = false;
  updateSyncRefreshBtn();
  startWorkspaceSync();
}

window.setServerWorkspaceFolder = function (relPath) {
  if (!window.IS_SERVER_MODE || !activeSyncRoot) return;
  applyWorkspace(joinWorkspacePath(activeSyncRoot, relPath || ''));
  showToast('已切换工作目录', 'success');
};

function stopWorkspaceSync() {
  if (workspaceSyncInterval) {
    clearInterval(workspaceSyncInterval);
    workspaceSyncInterval = null;
  }
}

function startWorkspaceSync() {
  stopWorkspaceSync();
  const path = getActiveWorkspacePath();
  if (!path) return;
  syncWorkspace();
  workspaceSyncInterval = setInterval(syncWorkspace, 3000);
}

let syncInProgress = false;

async function syncWorkspace() {
  let path = getActiveWorkspacePath();
  if (window.IS_SERVER_MODE && !path) {
    const info = await loadServerWorkspaceInfo();
    path = info?.path || '';
    if (!path) {
      syncTime.textContent = '尚未分配';
      return;
    }
    workspacePath.dataset.serverPath = path;
  }
  if (!path) return;
  if (syncInProgress) return;
  syncInProgress = true;
  syncRefreshBtn?.classList.add('spinning');
  try {
    const body = window.IS_SERVER_MODE ? { workspace: path } : { path };
    const res = await fetch('/api/workspace-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.error || '同步失败');
    renderWorkspaceSync(data);
    if (window.IS_SERVER_MODE && data.used_mb !== undefined) {
      updateServerWorkspaceUI(data);
    }
  } catch (err) {
    syncTime.textContent = '同步失败';
    workspaceExplorer.showError(err.message);
  } finally {
    syncInProgress = false;
    syncRefreshBtn?.classList.remove('spinning');
  }
}

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 404) throw new Error('接口不可用，请确认服务已更新并重启');
    if (res.status === 502 || res.status === 504) throw new Error('网关错误：Flask 未运行或 nginx 无法连接后端');
    if (res.status >= 500) throw new Error('服务器内部错误，请查看后端日志');
    const hint = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    throw new Error(hint ? `服务返回异常 (HTTP ${res.status})` : `服务返回异常 (HTTP ${res.status})，请稍后重试`);
  }
}

function renderWorkspaceSync(data) {
  activeSyncRoot = data.path || activeSyncRoot;
  syncTime.textContent = `更新于 ${data.synced_at}`;
  workspaceExplorer.render(data);
}

async function workspaceRequest(endpoint, extra, refresh = true) {
  const workspace = getActiveWorkspacePath();
  if (window.IS_SERVER_MODE && !workspace) {
    const info = await loadServerWorkspaceInfo();
    if (!info?.path) throw new Error('工作空间尚未分配，请刷新页面后重试');
  }
  if (!workspace && !window.IS_SERVER_MODE) {
    throw new Error('请先选择工作空间');
  }
  let data = {};
  if (endpoint) {
    const body = window.IS_SERVER_MODE ? { workspace, ...extra } : { workspace, ...extra };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.error || '操作失败');
    if (window.IS_SERVER_MODE && data.usage) {
      updateServerWorkspaceUI(data.usage);
    }
  }
  if (refresh) await syncWorkspace();
  return data;
}

syncRefreshBtn?.addEventListener('click', () => syncWorkspace());

async function openServerFolderModal() {
  if (!serverFolderModal || !serverFolderList) return;
  serverFolderList.innerHTML = '<p class="modal-hint">加载中…</p>';
  serverFolderModal.hidden = false;
  refreshIcons(serverFolderModal);
  try {
    await loadServerWorkspaceInfo();
    const res = await fetch('/api/workspace/folders');
    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.error || '无法加载文件夹列表');
    if (!data.ready) {
      throw new Error(data.message || '工作空间尚未就绪，请刷新页面后重试');
    }
    const active = getActiveWorkspacePath();
    serverFolderList.innerHTML = '';
    (data.folders || []).forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'server-folder-item' + (item.path === active ? ' active' : '');
      btn.style.paddingLeft = `${12 + (item.depth || 0) * 16}px`;
      btn.textContent = item.name || '(根目录)';
      btn.title = item.rel ? item.rel : '主目录根路径';
      btn.addEventListener('click', () => {
        closeServerFolderModal();
        applyWorkspace(item.path);
        writeStatus.textContent = '已选择工作文件夹，可执行写入';
        writeStatus.classList.remove('error');
      });
      serverFolderList.appendChild(btn);
    });
  } catch (err) {
    serverFolderList.innerHTML = `<p class="form-inline-error">${esc(err.message)}</p>`;
  }
}

function closeServerFolderModal() {
  if (serverFolderModal) serverFolderModal.hidden = true;
}

document.getElementById('serverFolderModalClose')?.addEventListener('click', closeServerFolderModal);
document.getElementById('serverFolderCancelBtn')?.addEventListener('click', closeServerFolderModal);
serverFolderModal?.addEventListener('click', e => {
  if (e.target === serverFolderModal) closeServerFolderModal();
});

selectWorkspaceBtn?.addEventListener('click', async () => {
  writeStatus.classList.remove('error');
  if (window.IS_SERVER_MODE) {
    await openServerFolderModal();
    return;
  }
  try {
    const res = await fetch('/api/select-workspace', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '选择失败');
    if (data.cancelled) {
      writeStatus.textContent = '';
      return;
    }
    applyWorkspace(data.path);
    writeStatus.textContent = '已选择工作空间，可执行写入';
  } catch (err) {
    writeStatus.textContent = err.message;
    writeStatus.classList.add('error');
  }
});

function parseDownloadFilename(res) {
  const disp = res.headers.get('Content-Disposition') || '';
  const utf8 = disp.match(/filename\*=UTF-8''([^;\s]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = disp.match(/filename="?([^";\s]+)"?/i);
  return plain ? plain[1] : 'workspace.zip';
}

downloadWorkspaceBtn?.addEventListener('click', async () => {
  const path = getActiveWorkspacePath();
  if (!path) return;
  downloadWorkspaceBtn.disabled = true;
  const label = downloadWorkspaceBtn.textContent;
  downloadWorkspaceBtn.textContent = '打包中…';
  try {
    const res = await fetch('/api/workspace/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: path }),
    });
    if (!res.ok) {
      let message = '下载失败';
      try {
        const err = await res.json();
        message = err.error || message;
      } catch { /* binary error body */ }
      throw new Error(message);
    }
    const contentType = res.headers.get('Content-Type') || '';
    if (!contentType.includes('zip') && !contentType.includes('octet-stream')) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '下载失败：服务返回异常');
    }
    const blob = await res.blob();
    if (!blob.size) throw new Error('下载失败：ZIP 文件为空');
    const filename = parseDownloadFilename(res);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`已下载 ${filename}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    downloadWorkspaceBtn.textContent = label;
    updateSyncRefreshBtn();
  }
});

writeProjectBtn.addEventListener('click', async () => {
  const path = getActiveWorkspacePath();
  if ((!path && !window.IS_SERVER_MODE) || !currentTask) return;
  if (window.IS_SERVER_MODE && isWorkspaceQuotaFull(serverWorkspaceInfo)) {
    writeStatus.textContent = '存储空间已满，无法写入项目结构';
    writeStatus.classList.add('error');
    return;
  }
  if (!window.IS_SERVER_MODE && !confirm(`确认将项目结构写入以下目录？\n\n${path}`)) return;

  writeProjectBtn.disabled = true;
  writeStatus.textContent = '';
  writeStatus.classList.remove('error');
  try {
    const res = await fetch('/api/write-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: path,
        task_id: currentTask.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '写入失败');
    writeStatus.textContent = `写入成功，共创建 ${data.created_count} 个文件/目录`;
    writeStatus.classList.remove('error');
    if (window.IS_SERVER_MODE && data.usage) {
      updateServerWorkspaceUI(data.usage);
    }
    syncWorkspace();
  } catch (err) {
    writeStatus.textContent = err.message;
    writeStatus.classList.add('error');
  } finally {
    writeProjectBtn.disabled = false;
  }
});

function taskStatusBadge(status, label) {
  const key = status || 'completed';
  const text = label || ({ running: '进行中', completed: '已完成', failed: '已失败' }[key] || key);
  return `<span class="task-status task-status-${key}">${esc(text)}</span>`;
}

function historyItemHtml(t) {
  return `
    <div class="history-item-head">
      <span class="history-item-title">${esc(t.title)}</span>
      ${taskStatusBadge(t.status, t.status_label)}
    </div>
    <span class="time">${esc(t.created_at)}</span>
  `;
}

// ---- 任务历史 ----
async function loadTaskHistory() {
  try {
    const res = await fetch('/api/tasks');
    const tasks = await res.json();
    const container = document.getElementById('historyItems');
    if (!tasks.length) {
      container.innerHTML = '<div class="history-empty">暂无任务</div>';
      return;
    }
    container.innerHTML = '';
    tasks.slice(0, 10).forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-item';
      btn.dataset.taskId = t.id;
      btn.innerHTML = historyItemHtml(t);
      btn.addEventListener('click', () => loadTask(t.id));
      container.appendChild(btn);
    });
    syncNavHighlight();
  } catch { /* ignore */ }
}

async function loadHistoryFull() {
  const res = await fetch('/api/tasks');
  const tasks = await res.json();
  const container = document.getElementById('historyFullList');
  if (!tasks.length) {
    container.innerHTML = '<div class="empty-state">暂无历史任务</div>';
    return;
  }
  container.innerHTML = '';
  tasks.forEach(t => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.dataset.taskId = t.id;
    card.innerHTML = `
      <div class="history-card-info">
        <div class="history-card-title">${esc(t.title)}</div>
        <div class="history-card-meta">${esc(t.created_at)} · ${esc(t.model)} ${taskStatusBadge(t.status, t.status_label)}</div>
      </div>
      <div class="history-card-actions">
        <button data-del="${t.id}">删除</button>
      </div>`;
    card.addEventListener('click', e => {
      if (e.target.dataset.del) return;
      loadTask(t.id);
    });
    card.querySelector('[data-del]').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('确认删除该任务？')) return;
      await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
      loadHistoryFull();
      loadTaskHistory();
    });
    container.appendChild(card);
  });
  syncNavHighlight();
}

async function loadTask(id) {
  stopWorkspaceSync();
  const res = await fetch(`/api/tasks/${id}`);
  const task = await res.json();
  if (!res.ok) {
    showToast(task.error || '任务不存在', 'error');
    return;
  }
  if (task.status === 'running') {
    setLoadingView({
      title: task.title || '',
      model: getModelDisplayName(task.model),
    });
    showView('loading', null, id);
    return;
  }
  if (task.status === 'failed') {
    showToast(task.error || '任务分析失败', 'error', 4500);
    showView('history', 'history', id);
    return;
  }
  if (!task.result) {
    showToast('任务暂无分析结果', 'error');
    showView('history', 'history', id);
    return;
  }
  renderResult(task);
  switchResultModule('tech');
  showView('result', null, id);
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

loadTaskHistory();

// ---- 弹窗：健康检查 ----
const healthModal = document.getElementById('healthModal');
const healthModalBody = document.getElementById('healthModalBody');

function openModal(modal) {
  if (!modal) return;
  modal.hidden = false;
  refreshIcons(modal);
}

function closeModal(modal) {
  if (modal) modal.hidden = true;
}

function bindModalClose(modal, ...triggers) {
  triggers.forEach(el => el?.addEventListener('click', () => closeModal(modal)));
  modal?.addEventListener('click', e => {
    if (e.target === modal) closeModal(modal);
  });
}

bindModalClose(
  healthModal,
  document.getElementById('healthModalClose'),
  document.getElementById('healthModalOkBtn'),
);

function renderHealthModal(data) {
  if (!healthModalBody) return;
  const rows = (data.results || []).map(r => `
    <tr>
      <td>${esc(r.name)}<div class="modal-hint" style="margin:0;font-size:11px;">${esc(r.id)}</div></td>
      <td class="${r.ok ? 'health-ok' : 'health-fail'}">${r.ok ? '正常' : '失败'}</td>
      <td>${r.ok ? `${r.latency_ms} ms` : esc(r.error || '—')}</td>
    </tr>
  `).join('');
  healthModalBody.innerHTML = `
    <p class="modal-hint">${esc(data.summary || '')}</p>
    <div class="modal-table-wrap">
      <table class="modal-table">
        <thead>
          <tr><th>模型</th><th>连通性</th><th>延迟 / 错误</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="3">暂无数据</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

document.getElementById('healthCheckBtn')?.addEventListener('click', async () => {
  openModal(healthModal);
  if (healthModalBody) healthModalBody.innerHTML = '<p class="modal-hint">正在检测各模型连通性，请稍候...</p>';
  try {
    const res = await fetch('/api/models/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '检查失败');
    renderHealthModal(data);
  } catch (err) {
    if (healthModalBody) {
      healthModalBody.innerHTML = `<p class="modal-hint health-fail">${esc(err.message)}</p>`;
    }
  }
});

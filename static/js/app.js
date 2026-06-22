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

// ---- API Key 配置 ----
const apiKeyModal = document.getElementById('apiKeyModal');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyStatus = document.getElementById('apiKeyStatus');

async function loadApiKeyStatus() {
  if (!apiKeyStatus) return;
  try {
    const res = await fetch('/api/config/api-key');
    const data = await res.json();
    if (data.configured) {
      apiKeyStatus.textContent = `当前已配置：${data.masked}`;
      apiKeyStatus.className = 'api-key-status configured';
    } else {
      apiKeyStatus.textContent = '当前未配置 API Key';
      apiKeyStatus.className = 'api-key-status empty';
    }
  } catch {
    apiKeyStatus.textContent = '无法读取配置状态';
    apiKeyStatus.className = 'api-key-status empty';
  }
}

function openApiKeyModal() {
  if (!apiKeyModal) return;
  apiKeyModal.hidden = false;
  if (apiKeyInput) apiKeyInput.value = '';
  loadApiKeyStatus();
  refreshIcons(apiKeyModal);
  apiKeyInput?.focus();
}

function closeApiKeyModal() {
  if (apiKeyModal) apiKeyModal.hidden = true;
  if (apiKeyInput) apiKeyInput.value = '';
}

document.getElementById('apiKeyBtn')?.addEventListener('click', openApiKeyModal);
document.getElementById('apiKeyModalClose')?.addEventListener('click', closeApiKeyModal);
document.getElementById('apiKeyCancelBtn')?.addEventListener('click', closeApiKeyModal);
apiKeyModal?.addEventListener('click', e => {
  if (e.target === apiKeyModal) closeApiKeyModal();
});

document.getElementById('apiKeySaveBtn')?.addEventListener('click', async () => {
  const apiKey = apiKeyInput?.value.trim();
  if (!apiKey) {
    alert('请输入 API Key');
    return;
  }
  const btn = document.getElementById('apiKeySaveBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/config/api-key', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '保存失败');
    closeApiKeyModal();
    alert('API Key 已保存并生效');
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
});

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

    renderResult(data.task);
    await loadTaskHistory();
    switchResultModule('tech');
    showView('result', null, data.task.id);
  } catch (err) {
    await loadTaskHistory();
    alert(err.message);
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

  if (task.workspace_path) {
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
document.getElementById('diagramFsDownload')?.addEventListener('click', () => downloadDiagramPng().catch(() => alert('PNG 导出失败')));
document.getElementById('diagramFsClose')?.addEventListener('click', closeDiagramFullscreen);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && diagramFsOverlay && !diagramFsOverlay.hidden) {
    closeDiagramFullscreen();
  }
});

// ---- 工作空间选择与写入 ----
const workspacePath = document.getElementById('workspacePath');
const selectWorkspaceBtn = document.getElementById('selectWorkspaceBtn');
const writeProjectBtn = document.getElementById('writeProjectBtn');
const writeStatus = document.getElementById('writeStatus');
const syncTime = document.getElementById('syncTime');
const syncRefreshBtn = document.getElementById('syncRefreshBtn');
const syncToolbar = document.getElementById('syncToolbar');
const localFolderTree = document.getElementById('localFolderTree');

const workspaceExplorer = new WorkspaceExplorer({
  container: localFolderTree,
  toolbar: syncToolbar,
  onRequest: (endpoint, extra, refresh) => workspaceRequest(endpoint, extra, refresh),
});

function updateSyncRefreshBtn() {
  if (syncRefreshBtn) syncRefreshBtn.disabled = !workspacePath.value.trim();
}

function resetWorkspace() {
  workspacePath.value = '';
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
  workspacePath.value = path;
  writeProjectBtn.disabled = false;
  syncToolbar.hidden = false;
  updateSyncRefreshBtn();
  if (persist) saveTaskWorkspace(path);
  startWorkspaceSync();
}

function stopWorkspaceSync() {
  if (workspaceSyncInterval) {
    clearInterval(workspaceSyncInterval);
    workspaceSyncInterval = null;
  }
}

function startWorkspaceSync() {
  stopWorkspaceSync();
  const path = workspacePath.value.trim();
  if (!path) return;
  syncWorkspace();
  workspaceSyncInterval = setInterval(syncWorkspace, 3000);
}

let syncInProgress = false;

async function syncWorkspace() {
  const path = workspacePath.value.trim();
  if (!path) return;
  if (syncInProgress) return;
  syncInProgress = true;
  syncRefreshBtn?.classList.add('spinning');
  try {
    const res = await fetch('/api/workspace-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.error || '同步失败');
    renderWorkspaceSync(data);
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
    throw new Error(res.status === 404 ? '同步接口不可用，请重启服务后重试' : '服务返回异常，请稍后重试');
  }
}

function renderWorkspaceSync(data) {
  syncTime.textContent = `更新于 ${data.synced_at}`;
  workspaceExplorer.render(data);
}

async function workspaceRequest(endpoint, extra, refresh = true) {
  const workspace = workspacePath.value.trim();
  if (!workspace) throw new Error('请先选择工作空间');
  let data = {};
  if (endpoint) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace, ...extra }),
    });
    data = await parseJsonResponse(res);
    if (!res.ok) throw new Error(data.error || '操作失败');
  }
  if (refresh) await syncWorkspace();
  return data;
}

syncRefreshBtn?.addEventListener('click', () => syncWorkspace());

selectWorkspaceBtn.addEventListener('click', async () => {
  writeStatus.classList.remove('error');
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

writeProjectBtn.addEventListener('click', async () => {
  const path = workspacePath.value.trim();
  if (!path || !currentTask) return;
  if (!confirm(`确认将项目结构写入以下目录？\n\n${path}`)) return;

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
    alert(`写入成功，共创建 ${data.created_count} 个文件/目录`);
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
    alert(task.error || '任务不存在');
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
    alert(task.error || '任务分析失败');
    showView('history', 'history', id);
    return;
  }
  if (!task.result) {
    alert('任务暂无分析结果');
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

/**
 * VS Code 风格工作空间资源管理器
 */
class WorkspaceExplorer {
  constructor(options) {
    this.container = options.container;
    this.toolbar = options.toolbar;
    this.onRequest = options.onRequest;
    this.expanded = new Set();
    this.selectedPaths = new Set();
    this.treeData = [];
    this.flatRows = [];
    this._initialized = false;

    this.selectAllBtn = document.getElementById('selectAllBtn');
    this.toggleExpandBtn = document.getElementById('toggleExpandBtn');
    this.container.classList.add('explorer-panel');
    this.toolbar?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'select-all') this.toggleSelectAll();
      else if (action === 'toggle-expand') this.toggleExpandAll();
      else this.createItem(action, btn.dataset.parent || '');
    });

    this.container.addEventListener('click', e => this._onClick(e));
    this.container.addEventListener('dblclick', e => this._onDblClick(e));
    this.container.addEventListener('contextmenu', e => this._onContextMenu(e));
  }

  showError(message) {
    this.container.innerHTML = `<p class="sync-placeholder">${message}</p>`;
  }

  reset() {
    this.expanded.clear();
    this.selectedPaths.clear();
    this.treeData = [];
    this.flatRows = [];
    this._initialized = false;
    this.container.innerHTML = '<p class="sync-placeholder">请先选择工作空间文件夹</p>';
    this._updateSelectAllBtn();
    this._updateExpandBtn();
  }

  render(data) {
    this.treeData = data.tree || [];
    if (!this._initialized && this.treeData.length) {
      this.treeData.forEach(n => { if (n.type === 'folder') this.expanded.add(n.path); });
      this._initialized = true;
    }

    const validPaths = new Set(this._collectPaths(this.treeData));
    this.selectedPaths = new Set([...this.selectedPaths].filter(p => validPaths.has(p)));
    this._paintTree();
  }

  _paintTree() {
    this.container.innerHTML = '';
    this.container.setAttribute('role', 'tree');
    this.container.setAttribute('aria-label', '工作空间文件树');

    if (!this.treeData.length) {
      this.container.innerHTML = '<p class="sync-placeholder">文件夹为空</p>';
      this.flatRows = [];
      this._updateSelectAllBtn();
      this._updateExpandBtn();
      return;
    }

    const tree = document.createElement('div');
    tree.className = 'explorer-tree';
    this._buildNodes(tree, this.treeData, 0);
    this.container.appendChild(tree);
    this._rebuildFlatRows();
    this._updateSelection();
    this._updateExpandBtn();
  }

  _collectFolderPaths(nodes) {
    const paths = [];
    nodes.forEach(n => {
      if (n.type === 'folder' && n.path) {
        paths.push(n.path);
        if (n.children?.length) paths.push(...this._collectFolderPaths(n.children));
      }
    });
    return paths;
  }

  toggleSelectAll() {
    const allPaths = this.flatRows.map(r => r.dataset.path).filter(Boolean);
    if (!allPaths.length) return;
    const allSelected = allPaths.every(p => this.selectedPaths.has(p));
    if (allSelected) this.selectedPaths.clear();
    else allPaths.forEach(p => this.selectedPaths.add(p));
    this._updateSelection();
  }

  toggleExpandAll() {
    const folders = this._collectFolderPaths(this.treeData);
    if (!folders.length) return;
    const allExpanded = folders.every(p => this.expanded.has(p));
    if (allExpanded) this.expanded.clear();
    else folders.forEach(p => this.expanded.add(p));
    this._paintTree();
  }

  _updateExpandBtn() {
    if (!this.toggleExpandBtn) return;
    const folders = this._collectFolderPaths(this.treeData);
    const allExpanded = folders.length > 0 && folders.every(p => this.expanded.has(p));
    this.toggleExpandBtn.textContent = allExpanded ? '全部收叠' : '全部展开';
  }

  _updateSelectAllBtn() {
    if (!this.selectAllBtn) return;
    const allPaths = this.flatRows.map(r => r.dataset.path).filter(Boolean);
    const allSelected = allPaths.length > 0 && allPaths.every(p => this.selectedPaths.has(p));
    this.selectAllBtn.textContent = allSelected ? '取消选择' : '选择全部';
  }

  _collectPaths(nodes) {
    const paths = [];
    nodes.forEach(n => {
      if (n.path) paths.push(n.path);
      if (n.children?.length) paths.push(...this._collectPaths(n.children));
    });
    return paths;
  }

  _buildNodes(parent, nodes, depth) {
    nodes.forEach(node => {
      if (node.type === 'error') {
        parent.appendChild(this._row(node, depth, false));
        return;
      }
      const isFolder = node.type === 'folder';
      const isOpen = isFolder && this.expanded.has(node.path);
      parent.appendChild(this._row(node, depth, isOpen));

      if (isFolder && node.children?.length) {
        const childWrap = document.createElement('div');
        childWrap.className = 'explorer-children';
        childWrap.dataset.parent = node.path;
        childWrap.hidden = !isOpen;
        this._buildNodes(childWrap, node.children, depth + 1);
        parent.appendChild(childWrap);
      }
    });
  }

  _row(node, depth, isOpen) {
    const isFolder = node.type === 'folder';
    const row = document.createElement('div');
    row.className = 'explorer-row';
    row.style.paddingLeft = `${8 + depth * 16}px`;
    row.dataset.path = node.path || '';
    row.dataset.type = node.type;
    row.dataset.name = node.name;
    row.setAttribute('role', 'treeitem');
    if (isFolder) row.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

    const twist = document.createElement('span');
    twist.className = 'explorer-twist' + (isFolder ? (isOpen ? ' open' : '') : ' placeholder');
    twist.textContent = isFolder ? '▶' : '';

    const icon = document.createElement('span');
    icon.className = 'explorer-icon ' + fileIconClass(node.name, isFolder, isOpen);

    const label = document.createElement('span');
    label.className = 'explorer-label';
    label.textContent = node.name;
    label.title = node.path || node.name;

    row.append(twist, icon, label);
    return row;
  }

  _rebuildFlatRows() {
    this.flatRows = [...this.container.querySelectorAll('.explorer-row[data-path]')];
  }

  _onClick(e) {
    const row = e.target.closest('.explorer-row');

    if (!row?.dataset.path) {
      if (!e.ctrlKey && !e.metaKey) {
        this.selectedPaths.clear();
        this._updateSelection();
      }
      return;
    }

    const path = row.dataset.path;
    const isFolder = row.dataset.type === 'folder';

    if (e.target.closest('.explorer-twist') && isFolder) {
      this._toggle(path);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (this.selectedPaths.has(path)) this.selectedPaths.delete(path);
      else this.selectedPaths.add(path);
    } else {
      this.selectedPaths.clear();
      this.selectedPaths.add(path);
    }
    this._updateSelection();
  }

  _onDblClick(e) {
    const row = e.target.closest('.explorer-row');
    if (!row || row.dataset.type !== 'folder') return;
    this._toggle(row.dataset.path);
  }

  _toggle(path) {
    if (this.expanded.has(path)) this.expanded.delete(path);
    else this.expanded.add(path);
    const row = this.flatRows.find(r => r.dataset.path === path);
    const childWrap = [...this.container.querySelectorAll('.explorer-children')]
      .find(c => c.dataset.parent === path);
    if (!row) return;
    const open = this.expanded.has(path);
    row.setAttribute('aria-expanded', open ? 'true' : 'false');
    row.querySelector('.explorer-twist')?.classList.toggle('open', open);
    const icon = row.querySelector('.explorer-icon');
    if (icon) {
      icon.className = 'explorer-icon ' + fileIconClass(row.dataset.name, true, open);
    }
    if (childWrap) childWrap.hidden = !open;
    this._updateExpandBtn();
  }

  _updateSelection() {
    const multi = this.selectedPaths.size > 1;
    this.container.querySelectorAll('.explorer-row').forEach(r => {
      const on = this.selectedPaths.has(r.dataset.path);
      r.classList.toggle('selected', on && !multi);
      r.classList.toggle('multi-selected', on && multi);
    });
    this._updateSelectAllBtn();
  }

  _parentPath(row) {
    if (!row?.dataset.path) return '';
    const parts = row.dataset.path.split('/');
    parts.pop();
    return parts.join('/');
  }

  _getRowData(path) {
    const row = this.flatRows.find(r => r.dataset.path === path);
    return row ? { path, name: row.dataset.name, type: row.dataset.type } : null;
  }

  _onContextMenu(e) {
    const row = e.target.closest('.explorer-row');
    if (!row?.dataset.path) return;
    e.preventDefault();

    const path = row.dataset.path;
    if (!this.selectedPaths.has(path)) {
      this.selectedPaths.clear();
      this.selectedPaths.add(path);
      this._updateSelection();
    }

    const name = row.dataset.name;
    const type = row.dataset.type;
    const parent = type === 'folder' ? path : this._parentPath(row);
    const count = this.selectedPaths.size;

    const menu = document.createElement('div');
    menu.className = 'explorer-context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const items = [
      { label: '新建文件', action: () => this.createItem('mkfile', parent) },
      { label: '新建文件夹', action: () => this.createItem('mkdir', parent) },
    ];
    if (window.IS_SERVER_MODE && type === 'folder' && typeof window.setServerWorkspaceFolder === 'function') {
      items.unshift({
        label: '设为工作目录',
        action: () => window.setServerWorkspaceFolder(path),
      });
    }
    if (count === 1) {
      items.push({ label: '重命名', action: () => this.renameItem(path, name) });
    }
    items.push({
      label: count > 1 ? `删除 ${count} 项` : '删除',
      action: () => this.deleteSelected(),
      danger: true,
    });

    items.forEach(it => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'explorer-ctx-item' + (it.danger ? ' danger' : '');
      btn.textContent = it.label;
      btn.addEventListener('click', () => { menu.remove(); it.action(); });
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    const close = ev => {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  async createItem(action, parent) {
    const label = action === 'mkdir' ? '文件夹名称' : '文件名称';
    const name = prompt(`请输入${label}：`);
    if (!name?.trim()) return;
    const endpoint = action === 'mkdir' ? '/api/workspace/mkdir' : '/api/workspace/create-file';
    try {
      await this.onRequest(endpoint, { parent, name: name.trim() });
      if (parent) this.expanded.add(parent);
    } catch (err) { showToast(err.message, 'error'); }
  }

  async renameItem(relPath, oldName) {
    const newName = prompt('请输入新名称：', oldName);
    if (!newName?.trim() || newName.trim() === oldName) return;
    try {
      await this.onRequest('/api/workspace/rename', { path: relPath, new_name: newName.trim() });
      if (this.selectedPaths.has(relPath)) {
        this.selectedPaths.delete(relPath);
        const parts = relPath.split('/');
        parts[parts.length - 1] = newName.trim();
        this.selectedPaths.add(parts.join('/'));
      }
    } catch (err) { showToast(err.message, 'error'); }
  }

  async deleteSelected() {
    const items = [...this.selectedPaths].map(p => this._getRowData(p)).filter(Boolean);
    if (!items.length) return;

    const msg = items.length === 1
      ? `确认删除${items[0].type === 'folder' ? '文件夹' : '文件'}「${items[0].name}」？`
      : `确认删除选中的 ${items.length} 个项目？`;
    if (!confirm(msg)) return;

    try {
      for (const item of items) {
        await this.onRequest('/api/workspace/delete', { path: item.path }, false);
      }
      this.selectedPaths.clear();
      await this.onRequest(null, {}, true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async deleteItem(relPath, name, type) {
    this.selectedPaths.clear();
    this.selectedPaths.add(relPath);
    await this.deleteSelected();
  }
}

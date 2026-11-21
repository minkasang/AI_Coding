const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Lazy expandable R-27 tree (system → assembly instance → part instance).
 */
export class VehicleTreeUI {
  /**
   * @param {HTMLElement} rootEl
   * @param {ReturnType<import('./vehicle-snapshot-client.mjs').createSnapshotContext>} ctx
   * @param {(partInstanceId: string) => void} onSelect
   */
  constructor(rootEl, ctx, onSelect) {
    this.rootEl = rootEl;
    this.ctx = ctx;
    this.onSelect = onSelect;
    this.expandedSystems = new Set();
    this.expandedAssemblies = new Set();
    /** @type {string|null} */
    this.selectedId = null;
    this.rootEl.classList.add('vehicle-tree');
    this.render();
    this.rootEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tree-toggle]');
      if (btn) {
        e.preventDefault();
        this._toggle(btn.dataset.treeToggle, btn.dataset.kind);
        this.render();
        return;
      }
      const pick = e.target.closest('button[data-vehicle-select]');
      if (pick) {
        this.selectedId = pick.dataset.vehicleSelect;
        this.onSelect(this.selectedId);
        this.render();
      }
    });
  }

  _toggle(id, kind) {
    const set = kind === 'system' ? this.expandedSystems : this.expandedAssemblies;
    if (set.has(id)) set.delete(id);
    else set.add(id);
  }

  render() {
    const tree = this.ctx.workbenchTree;
    const systems = tree.systems || [];
    const rows = systems.map((sys) => this._systemRow(sys)).join('');
    this.rootEl.innerHTML = rows || '<p class="section-help">快照无系统数据</p>';
  }

  _systemRow(sys) {
    const open = this.expandedSystems.has(sys.systemId);
    const aiCount = (sys.assemblyInstanceIds || []).length;
    const summary = aiCount
      ? `${aiCount} 个总成实例`
      : `${(sys.subsystemIds || []).length} 个子系统 · 域内无总成展开`;
    let children = '';
    if (open && aiCount) {
      children = (sys.assemblyInstanceIds || []).map((ai) => this._assemblyRow(ai)).join('');
    } else if (open && !aiCount) {
      children = `<p class="vehicle-coverage">${escapeHTML(summary)}（R-16 骨架已覆盖，实例懒加载未展开）</p>`;
    }
    return `<div class="vehicle-tree-sys">
      <button type="button" class="vehicle-tree-toggle" data-tree-toggle="${escapeHTML(sys.systemId)}" data-kind="system" aria-expanded="${open}">
        <span class="veh-fold">${open ? '▾' : '▸'}</span>
        <span class="veh-label">${escapeHTML(sys.name)}</span>
        <span class="veh-meta">${aiCount || '—'}</span>
      </button>
      ${open ? `<div class="vehicle-tree-kids">${children}</div>` : ''}
    </div>`;
  }

  _assemblyRow(assemblyInstanceId) {
    const ai = this.ctx.getAssembly(assemblyInstanceId);
    if (!ai) return '';
    const open = this.expandedAssemblies.has(assemblyInstanceId);
    const label = this.ctx.getAssemblyLabel(assemblyInstanceId);
    const parts = ai.partInstanceIds || [];
    let children = '';
    if (open) {
      children = parts.map((pi) => this._partRow(pi)).join('');
    }
    return `<div class="vehicle-tree-assy">
      <button type="button" class="vehicle-tree-toggle assy" data-tree-toggle="${escapeHTML(assemblyInstanceId)}" data-kind="assembly" aria-expanded="${open}">
        <span class="veh-fold">${open ? '▾' : '▸'}</span>
        <span class="veh-label">${escapeHTML(label)}</span>
        <span class="veh-meta">${parts.length}</span>
      </button>
      ${open ? `<div class="vehicle-tree-kids">${children}</div>` : ''}
    </div>`;
  }

  _partRow(partInstanceId) {
    const inst = this.ctx.getPartInstance(partInstanceId);
    const name = inst ? this.ctx.getPartName(inst.partId) : partInstanceId;
    const selected = this.selectedId === partInstanceId;
    const demo = this.ctx.getDemoCad(partInstanceId);
    const badge = demo
      ? '<span class="veh-badge demo">DEMO</span>'
      : '<span class="veh-badge none">无几何</span>';
    return `<button type="button" class="vehicle-tree-part ${selected ? 'is-selected' : ''}"
      data-vehicle-select="${escapeHTML(partInstanceId)}" title="${escapeHTML(partInstanceId)}">
      <span class="part-symbol">◇</span>
      <span class="tree-name">${escapeHTML(name)}</span>${badge}
    </button>`;
  }
}
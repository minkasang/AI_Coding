import {
  ProjectStore, createDemoProject, createEmptyProject, getInstances, assertProject
} from './project-store.mjs';
import { EngineeringViewport } from './viewport.js';
import './shell-router.js';

const el = (id) => document.getElementById(id);
const $ = (selector) => document.querySelector(selector);
const STORAGE = 'carlab.workbench-v2.project.v1';
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let store = null;
let viewport = null;
let seed = null;
let metadata = null;
let toastHandle = null;
let viewportReady = false;

function toast(message, duration = 3000) {
  const element = el('toast');
  element.textContent = message;
  element.classList.add('active');
  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => element.classList.remove('active'), duration);
}
function partByKey(key) {
  return seed.catalog.find((part) => part.partKey === key);
}
function refresh(snapshot) {
  const instances = getInstances(snapshot.project);
  window.CARLAB_ACTIVE_PROJECT_NAME = snapshot.project.name;
  if (window.CARLAB_SHELL?.mode === 'assembly') {
    el('projectName').textContent = snapshot.project.name;
  }
  el('projectRevision').textContent = 'REV ' + snapshot.project.revision;
  el('undoBtn').disabled = !snapshot.canUndo;
  el('redoBtn').disabled = !snapshot.canRedo;
  el('treeFoot').textContent = instances.length + ' 个零件实例 · ' + snapshot.project.assemblies.length + ' 个总成';
  el('sceneStatus').textContent = viewportReady
    ? (instances.length ? '视窗已就绪' : '空白工程') : '模型载入中';
  el('emptyHint').hidden = instances.length > 0;
  el('explodeOut').textContent = Math.round(snapshot.explode * 100) + '%';
  el('explodeRange').value = Math.round(snapshot.explode * 100);
  el('isolateBtn').disabled = !snapshot.selectedId;
  el('isolateBtn').textContent = snapshot.isolatedId ? '退出隔离模式' : '隔离选中零件';
  renderTree(snapshot);
  renderInspector(snapshot);
  if (viewportReady) {
    viewport.sync(snapshot, seed.catalog);
    const stats = viewport.counts();
    el('renderStats').textContent = 'WebGL · ' + instances.length + ' 实例';
  }
}
function renderTree(snapshot) {
  const project = snapshot.project;
  const assemblies = project.assemblies;
  const whole = assemblies.map((assembly) => {
    const instItems = assembly.instances.map((inst) => {
      const part = partByKey(inst.partKey);
      return `<div class="tree-item ${inst.visible ? '' : 'is-hidden'}">
        <button class="tree-select ${inst.instanceId === snapshot.selectedId ? 'is-selected' : ''}"
          data-select="${escapeHTML(inst.instanceId)}" role="treeitem" aria-selected="${inst.instanceId === snapshot.selectedId}">
          <span class="part-symbol">◇</span>
          <span class="tree-name" title="${escapeHTML(part?.displayName || inst.partKey)}">${escapeHTML(part?.displayName || inst.partKey)}</span>
        </button>
        <button class="tree-visibility" data-visibility="${escapeHTML(inst.instanceId)}"
          title="${inst.visible ? '隐藏零件' : '显示零件'}" aria-label="${inst.visible ? '隐藏' : '显示'}${escapeHTML(part?.displayName || '')}">${inst.visible ? '◉' : '◌'}</button>
      </div>`;
    }).join('');
    return `<div class="tree-group">
      <div class="tree-root"><span class="folder-icon">▣</span><span>${escapeHTML(project.name)}</span>
        <span class="root-count">${assembly.instances.length}</span></div>
      <div class="tree-assembly">◈ ${escapeHTML(assembly.name)}</div>
      ${instItems || '<p class="section-help" style="padding-left:12px">尚无零件。从下方零件库选择“+”开始。</p>'}
    </div>`;
  }).join('');
  el('tree').innerHTML = whole;
}
function renderCatalog() {
  el('catalog').innerHTML = seed.catalog.map((part) => `
    <div class="catalog-card">
      <div class="catalog-icon">◇</div>
      <div class="catalog-text"><strong>${escapeHTML(part.displayName)}</strong>
        <small>${escapeHTML(part.subtitle)}</small></div>
      <button class="add-part-btn" data-add="${escapeHTML(part.partKey)}"
        title="把${escapeHTML(part.displayName)}添加到工程" aria-label="添加${escapeHTML(part.displayName)}">+</button>
    </div>`).join('');
}
function field(label, value) {
  return `<div class="property-row"><span>${escapeHTML(label)}</span>
    <strong>${escapeHTML(value)}</strong></div>`;
}
function renderInspector(snapshot) {
  const id = snapshot.selectedId;
  const inst = id && getInstances(snapshot.project).find((x) => x.instanceId === id);
  if (!inst) {
    el('inspector').innerHTML = `<div class="inspector-placeholder">
      <div class="selected-icon" style="margin:0 auto 14px">⌖</div>
      点击画布或左侧对象树中的零件，查看其尺寸、来源和装配信息。
    </div>`;
    return;
  }
  const part = partByKey(inst.partKey);
  const local = metadata?.components?.[inst.partKey];
  const size = local?.bbox_size_mm?.map((x) => Number(x).toFixed(1)).join(' × ') || '未知';
  const relationCount = (snapshot.project.relations || []).filter((relation) =>
    relation.from === id || relation.to === id).length;
  const warning = local?.solid_valid ? 'B-rep 几何验证通过（仅演示）' : '工程几何验证未确认';
  el('inspector').innerHTML = `
    <div class="selected-icon">◇</div>
    <h3 class="selected-name">${escapeHTML(part?.displayName)}</h3>
    <p class="selected-sub">${escapeHTML(part?.subtitle)} / ${escapeHTML(part?.category)}</p>
    <span class="evidence-tag">${escapeHTML(part?.evidence)} · 未认证</span>
    <div class="inspector-table">
      ${field('实例 ID', inst.instanceId)}
      ${field('零件 Key', inst.partKey)}
      ${field('外形尺寸', size === '未知' ? size : size + ' mm')}
      ${field('当前可见', inst.visible ? '是' : '否')}
      ${field('装配连接', relationCount + ' 条示意关系')}
      ${field('几何校验', warning)}
      ${field('物理属性', '未建立质量 / 惯量')}
      ${field('运动约束', '未建立求解器')}
    </div>
    <p class="part-desc">${escapeHTML(part?.detail)}</p>
    <div class="selection-actions">
      <button class="btn btn-secondary" data-action="focus">◎ 聚焦</button>
      <button class="btn btn-ghost" data-action="visibility">${inst.visible ? '隐藏' : '显示'}零件</button>
      <button class="btn btn-ghost" data-action="isolate">隔离</button>
      <button class="btn danger" data-action="remove">移除实例</button>
    </div>
  `;
}
function safeAction(callback) {
  try { callback(); } catch (error) { toast(error.message || String(error), 5000); }
}
async function boot() {
  el('loadingStatus').textContent = '正在加载工程数据与零件资产…';
  try {
    const response = await fetch('./fixtures/wheel-end-demo.json');
    if (!response.ok) throw new Error('工程数据 HTTP ' + response.status);
    seed = await response.json();
    const sample = createDemoProject(seed);
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        const parsed = JSON.parse(saved);
        assertProject(parsed, seed.catalog);
        store = new ProjectStore(parsed, seed.catalog);
      }
    } catch (e) {
      console.warn('保存的工程无法加载，改用样例工程', e);
      toast('之前保存的工程格式无效，已载入安全示例', 5000);
    }
    if (!store) store = new ProjectStore(sample, seed.catalog);
    metadata = await fetch(seed.metadata).then((x) => x.ok ? x.json() : null).catch(() => null);
    renderCatalog();
    viewport = new EngineeringViewport(el('viewport'), el('viewCanvas'), (id) => {
      safeAction(() => store.select(id));
    });
    store.subscribe(refresh);
    await viewport.load(seed);
    viewportReady = true;
    viewport.setActive(window.CARLAB_SHELL?.mode === 'assembly');
    el('loadingStatus').hidden = true;
    refresh(store.snapshot());
    if (window.CARLAB_SHELL?.mode === 'assembly') viewport.focus();
    window.__CARLAB_V2_READY__ = true;
  } catch (error) {
    el('loadingStatus').textContent = '模型未能载入：' + error.message;
    el('sceneStatus').textContent = '加载失败';
    console.error(error);
  }
}
document.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (!button || !store || !seed) return;
  safeAction(() => {
    if (button.dataset.select) return store.select(button.dataset.select);
    if (button.dataset.visibility) return store.toggleVisibility(button.dataset.visibility);
    if (button.dataset.add) {
      const id = store.add(button.dataset.add);
      toast('已添加独立实例 ' + id);
      return viewport.focus(id);
    }
    const action = button.dataset.action;
    if (action === 'focus') return viewport.focus(store.selectedId);
    if (action === 'visibility') return store.toggleVisibility(store.selectedId);
    if (action === 'isolate') return store.isolate(store.selectedId);
    if (action === 'remove') {
      const id = store.selectedId;
      if (!id) return;
      store.remove(id);
      toast('已移除实例（可使用撤销恢复）');
      return viewport.focus();
    }
  });
});
el('explodeRange').addEventListener('input', (e) => {
  if (store) safeAction(() => store.setExplode(Number(e.target.value) / 100));
});
el('undoBtn').addEventListener('click', () => store?.undo());
el('redoBtn').addEventListener('click', () => store?.redo());
el('focusBtn').addEventListener('click', () => viewport?.focus(store?.selectedId));
el('resetCameraBtn').addEventListener('click', () => viewport?.focus());
el('isolateBtn').addEventListener('click', () => safeAction(() => store?.isolate(store.selectedId)));
el('showAllBtn').addEventListener('click', () => {
  if (!store) return;
  store.showAll();
  toast('全部零件已恢复显示');
});
window.addEventListener('carlab:workview-changed', (event) => {
  viewport?.setActive(event.detail.view === 'assembly');
});
el('blankBtn').addEventListener('click', () => {
  if (!store) return;
  if (!confirm('新建空白工程会替换当前工作区。需要保留请先导出工程。确定继续？')) return;
  store.replace(createEmptyProject(seed));
  window.CARLAB_SHELL?.switchTo('assembly');
  viewport.focus();
  toast('空白工程已建立。请从左侧零件库添加第一个部件。');
});
el('loadDemoBtn').addEventListener('click', () => {
  if (!store) return;
  if (!confirm('载入示例工程会替换当前工作区。确定继续？')) return;
  store.replace(createDemoProject(seed));
  window.CARLAB_SHELL?.switchTo('assembly');
  viewport.focus();
  toast('已恢复原始轮端装配示例');
});
el('saveBtn').addEventListener('click', () => {
  if (!store) return;
  safeAction(() => {
    localStorage.setItem(STORAGE, store.exportDocument());
    toast('工程已保存到当前浏览器。建议同时导出 JSON 备份。');
  });
});
el('importBtn').addEventListener('click', () => el('importFile').click());
el('importFile').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file || !store) return;
  try {
    if (file.size > 2_000_000) throw new Error('工程 JSON 不能超过 2MB');
    const project = JSON.parse(await file.text());
    assertProject(project, seed.catalog);
    if (!confirm('导入会替换当前工作区。需要保留当前工程请先导出。确定导入？')) return;
    store.replace(project);
    viewport.focus();
    toast('工程导入成功：' + project.name);
  } catch (error) {
    toast('导入失败：' + error.message, 5000);
  } finally {
    e.target.value = '';
  }
});
el('exportBtn').addEventListener('click', () => {
  if (!store) return;
  safeAction(() => {
    const blob = new Blob([store.exportDocument()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'CARLAB-' + store.project.projectId + '-rev' + store.project.revision + '.json';
    link.href = url; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    toast('已导出工程 JSON（保存的是工程数据，不包含大型 GLB）');
  });
});
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();store?.undo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();store?.redo();
  }
});
boot();

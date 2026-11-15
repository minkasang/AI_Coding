import { buildVehicleTree, findInstanceNode } from './vehicle-tree-adapter.mjs';

const treeEl = document.getElementById('tree');
const inspectorEl = document.getElementById('inspector');
const footEl = document.getElementById('foot');

/** @type {string|null} */
let selectedId = null;

function geometryBadge(geo) {
  if (!geo) return '';
  if (geo.status === 'DEMO_SUBSTITUTE') return '<span class="badge demo">DEMO</span>';
  if (geo.status === 'PLACEHOLDER') return '<span class="badge ph">占位</span>';
  return '<span class="badge none">无几何</span>';
}

function renderTreeNode(node, depth = 0) {
  const pad = depth * 14;
  const isSelectable = node.kind === 'instance';
  const selected = selectedId && node.selectionId === selectedId;
  const row = document.createElement('div');
  row.style.paddingLeft = pad + 'px';

  if (node.kind === 'coverage') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'coverage';
    btn.disabled = true;
    btn.textContent = node.label;
    row.appendChild(btn);
    treeEl.appendChild(row);
    return;
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = selected ? 'is-selected' : '';
  btn.setAttribute('role', 'treeitem');
  btn.setAttribute('aria-selected', String(!!selected));
  btn.innerHTML = node.label + (node.geometry ? geometryBadge(node.geometry) : '');
  if (isSelectable) {
    btn.addEventListener('click', () => {
      selectedId = node.instanceId;
      renderTree(tree);
      renderInspector(node.instanceId);
    });
  } else {
    btn.style.fontWeight = node.kind === 'vehicle' ? '600' : node.kind === 'system' ? '500' : '400';
    btn.addEventListener('click', () => {
      selectedId = null;
      renderTree(tree);
      inspectorEl.innerHTML = `<p class="hint">已选层级：<strong>${node.label}</strong>（${node.kind}）</p>`;
    });
  }
  row.appendChild(btn);
  treeEl.appendChild(row);
  for (const child of node.children || []) renderTreeNode(child, depth + 1);
}

/** @type {import('./vehicle-tree-adapter.mjs').TreeNode} */
let tree;

function renderTree(root) {
  treeEl.innerHTML = '';
  renderTreeNode(root, 0);
}

function renderInspector(instanceId) {
  const node = findInstanceNode(tree, instanceId);
  if (!node) return;
  const g = node.geometry;
  const inspectClass = g.inspectable ? 'status-ok' : 'status-warn';
  inspectorEl.innerHTML = `
    <h2 style="margin:0 0 0.75rem;font-size:1rem">${node.label}</h2>
    <dl>
      <dt>实例 ID</dt><dd><code>${node.instanceId}</code></dd>
      <dt>零件 ID</dt><dd><code>${node.partId}</code></dd>
      <dt>总成</dt><dd><code>${node.assemblyId}</code></dd>
      <dt>系统</dt><dd><code>${node.systemId}</code></dd>
      <dt>几何状态</dt><dd>${g.status} / ${g.mappingStatus}</dd>
      <dt>展示与检查</dt><dd class="${inspectClass}">${g.inspectable ? '可高亮/聚焦/测距/剖切' : '仅属性 — 无真实几何'}</dd>
      <dt>CAD</dt><dd>${g.cadUrl ? `<a href="${g.cadUrl}">${g.cadUrl}</a>` : '—'}</dd>
      <dt>说明</dt><dd>${g.hint}</dd>
    </dl>
    <div class="hint">接入 5173 时：用同一 <strong>instanceId</strong> 驱动 viewport.sync / InspectionBridge；不得在查看器内二次 mm→m 或复制 GLB 冒充其它实例。</div>
  `;
}

async function main() {
  const [r16Res, domRes] = await Promise.all([
    fetch('./r16-vehicle-index.json'),
    fetch('/src-experiments/domain-contract-v1/fixtures/vehicle-skeleton.json')
  ]);
  if (!r16Res.ok || !domRes.ok) throw new Error('fixture fetch failed');
  const r16Index = await r16Res.json();
  const domain = await domRes.json();
  const built = buildVehicleTree(r16Index, domain);
  tree = built.root;
  selectedId = domain.selectedId || null;
  renderTree(tree);
  if (selectedId) renderInspector(selectedId);
  footEl.textContent =
    `R-16：${built.meta.r16Totals.partInstances} 实例 · 域模型 REV ${built.meta.domainRevision}：${built.meta.domainInstanceCount} 实例 · 选择键 ${built.meta.selectionKey}`;
}

main().catch((e) => {
  footEl.textContent = '错误：' + e.message;
  console.error(e);
});
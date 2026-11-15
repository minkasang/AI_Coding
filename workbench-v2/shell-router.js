/**
 * CARLAB single-site business router:
 * - model: engineering editing (PartInstance & catalog)
 * - inspect: same engineering model, read/measure/visual isolation context
 * - experiment: original low-fidelity vehicle driving/sample experiments
 * - projects: project/resource chooser reached from the breadcrumb
 *
 * Whole-car Cannon sample and 3-part CAD fixture remain independent until
 * validated engineering schema + constraints connect them.
 */
const VIEW_ALIASES = { vehicle: 'experiment', assembly: 'model' };
const VIEWS = new Set(['model', 'inspect', 'experiment', 'projects']);
const contexts = {
  model: '编辑当前装配 · DEMO 零件库，整车工程尚未完成',
  inspect: '在同一工程上选择、隐藏、聚焦和拆解零件',
  experiment: '已有整车行驶演示 · 简化物理，不代表真实多体悬架',
  projects: '管理工程入口和可用样例'
};
const el = (id) => document.getElementById(id);
const frame = el('legacyVehicleFrame');
let view = 'experiment';
let legacyPreset = 'vehicle';
let settingsOpen = false;
function applySettings() {
  el('experimentSettings').setAttribute('aria-expanded',String(settingsOpen));
  try {
    frame.contentDocument?.body?.classList.toggle('carlab-controls-open', settingsOpen);
  } catch { /* sample may not be loaded yet */ }
}
function normalise(next) {
  return VIEW_ALIASES[next] || next;
}
function setLegacyPreset(next) {
  if (!['vehicle', 'tire', 'suspension', 'drivetrain'].includes(next)) return false;
  legacyPreset = next;
  const picker = el('legacyPreset');
  if (picker) picker.value = next;
  try {
    const legacyTab = frame.contentDocument?.getElementById('tab-' + next);
    if (legacyTab) legacyTab.click();
  } catch (error) {
    console.warn('旧版试验未就绪', error);
  }
  return true;
}
function styleLegacy() {
  try {
    const doc = frame.contentDocument;
    if (!doc?.head) return;
    if (!doc.getElementById('carlab-embedded-demo')) {
      const css = doc.createElement('style');
      css.id = 'carlab-embedded-demo';
      css.textContent = [
        '.topbar{display:none!important}',
        '.workspace-intro{display:none!important}',
        'body:not(.carlab-controls-open) .control-dock{display:none!important}',
        '.control-dock{top:22px!important;right:24px!important;max-height:calc(100% - 175px)!important}',
        '.telemetry-hud{bottom:20px!important}',
        '#panel{top:18px!important}'
      ].join(' ');
      doc.head.appendChild(css);
    }
    setLegacyPreset(legacyPreset);
    applySettings();
  } catch (error) {
    console.warn('历史物理演示暂时不可用', error);
  }
}
frame.addEventListener('load', styleLegacy);
function open(next, updateUrl = true) {
  next = normalise(next);
  if (!VIEWS.has(next)) return false;
  view = next;
  const inEngineering = next === 'model' || next === 'inspect';
  document.body.dataset.workview = next;
  el('assemblyWorkbench').hidden = !inEngineering;
  el('vehicleWorkspace').hidden = next !== 'experiment';
  el('projectHub').hidden = next !== 'projects';
  for (const tab of document.querySelectorAll('.module-tab[data-workview]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.workview === next));
  }
  el('viewContext').textContent = contexts[next];
  el('projectName').textContent =
    next === 'experiment' ? '整车演示 · 低保真' :
    next === 'projects' ? '工程与样例' :
    (window.CARLAB_ACTIVE_PROJECT_NAME || '轮端工程');
  if (inEngineering) {
    el('workbenchHeading').textContent = next === 'model' ? '车辆工程 · 装配编辑' : '车辆工程 · 展示检查';
    el('workbenchDescription').textContent = next === 'model'
      ? '从对象树选择装配或零件；从左侧零件库添加实例。当前仅有轮端 DEMO，暂非完整整车。'
      : '选择零件、聚焦高亮、调整可见性和爆炸视图。不同子系统属于车辆结构，不是独立页面。';
  }
  const projectMenu = el('projectMenu');
  if (projectMenu && next !== 'model') projectMenu.open = false;
  if (next === 'experiment' && !frame.getAttribute('src')) frame.src = frame.dataset.src;
  if (next === 'projects') {
    let description = '示例零件 3 类 · 当前工程可编辑';
    try {
      const stored = JSON.parse(localStorage.getItem('carlab.workbench-v2.project.v1'));
      if (stored && typeof stored.name === 'string' && Array.isArray(stored.assemblies)) {
        const count = stored.assemblies.reduce((total, assembly) => total + (assembly.instances?.length || 0), 0);
        description = stored.name + ' · ' + count + ' 个实例已保存';
      }
    } catch { /* malformed saves are handled by the project controller */ }
    el('savedProjectSummary').textContent = description;
  }
  if (updateUrl) {
    const url = new URL(location.href);
    if (next === 'experiment') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    history.pushState({ view: next }, '', url);
  }
  window.dispatchEvent(new CustomEvent('carlab:workview-changed', { detail: { view: next } }));
  return true;
}
el('legacyPreset').addEventListener('change', (e) => setLegacyPreset(e.target.value));
el('experimentSettings').addEventListener('click', () => {
  settingsOpen = !settingsOpen;
  applySettings();
});
document.addEventListener('click', (event) => {
  const tab = event.target.closest('button[data-workview]');
  if (tab) {
    event.preventDefault();
    open(tab.dataset.workview);
    return;
  }
  if (event.target.closest('#workspaceCrumb, #projectsCrumb, #projectName')) {
    event.preventDefault();
    open('projects');
    return;
  }
  if (event.target.closest('#newBlankHub')) {
    event.preventDefault();
    el('blankBtn').click();
  }
});
window.addEventListener('popstate', () => {
  open(new URLSearchParams(location.search).get('view') || 'experiment', false);
});
open(new URLSearchParams(location.search).get('view') || 'experiment', false);
window.CARLAB_SHELL = {
  get mode() { return view; },
  switchTo: open,
  selectLegacyPreset: setLegacyPreset
};

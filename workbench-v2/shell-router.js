/**
 * Navigation between existing whole-car experiment, editable wheel-end demo,
 * and a functional project entry point. The two models are intentionally
 * NOT represented as a unified high-fidelity vehicle assembly.
 */
const validViews = new Set(['vehicle', 'assembly', 'projects']);
const get = (id) => document.getElementById(id);
const contexts = {
  vehicle: '整车实验：简化车身 + 四轮物理演示，尚未接入精细 CAD 装配',
  assembly: '零件装配：3 类示例 CAD 零件，可查看、添加、保存；没有完整整车',
  projects: '汽车项目：已有演示工程与空白创建入口'
};
let mode = 'vehicle';
let legacyMode = 'vehicle';
const frame = get('legacyVehicleFrame');
function applyLegacyEmbed() {
  try {
    const doc = frame.contentDocument;
    if (!doc?.head) return;
    if (!doc.getElementById('carlab-v2-integration-css')) {
      const style = doc.createElement('style');
      style.id = 'carlab-v2-integration-css';
      style.textContent = [
        '.topbar{display:none!important}',
        '.workspace-intro{top:26px!important;left:30px!important}',
        '.control-dock{top:23px!important;right:28px!important;max-height:calc(100% - 170px)!important}',
        '.telemetry-hud{bottom:22px!important}',
        '#panel{top:18px!important}'
      ].join(' ');
      doc.head.appendChild(style);
    }
    selectLegacyMode(legacyMode);
  } catch (error) { console.warn('旧整车页面尚未准备好', error); }
}
function selectLegacyMode(next) {
  if (!['vehicle','tire','suspension','drivetrain'].includes(next)) return false;
  legacyMode = next;
  document.querySelectorAll('[data-legacy-mode]').forEach((btn) =>
    btn.setAttribute('aria-selected', String(btn.dataset.legacyMode === next)));
  try {
    const tab = frame.contentDocument?.getElementById('tab-' + next);
    if (tab) tab.click();
  } catch (error) { console.warn('旧版演示切换失败', error); }
  return true;
}
frame.addEventListener('load', applyLegacyEmbed);
function switchTo(next, updateUrl = true) {
  if (!validViews.has(next)) return false;
  mode = next;
  document.body.dataset.workview = next;
  get('assemblyWorkbench').hidden = next !== 'assembly';
  get('vehicleWorkspace').hidden = next !== 'vehicle';
  get('projectHub').hidden = next !== 'projects';
  document.querySelectorAll('[data-workview]').forEach((button) => {
    const selected = button.dataset.workview === next;
    if (button.getAttribute('role') === 'tab') {
      button.setAttribute('aria-selected', String(selected));
    }
  });
  get('viewContext').textContent = contexts[next];
  get('projectName').textContent =
    next === 'vehicle' ? '整车实验 · 简化演示车' :
    next === 'projects' ? '汽车项目' :
    (window.CARLAB_ACTIVE_PROJECT_NAME || '轮端装配工程');
  if (next === 'vehicle') {
    const frame = get('legacyVehicleFrame');
    if (!frame.getAttribute('src')) frame.setAttribute('src', frame.dataset.src);
  }
  if (next === 'projects') {
    let detail = '演示零件 3 类 · 工程结构可编辑';
    try {
      const saved = JSON.parse(localStorage.getItem('carlab.workbench-v2.project.v1'));
      if (saved?.name && Array.isArray(saved.assemblies)) {
        const count = saved.assemblies.reduce((n, a) => n + a.instances.length, 0);
        detail = '本机存有工程：' + saved.name + ' · ' + count + ' 实例';
      }
    } catch { /* corrupted saves stay in main.js safe fallback */ }
    get('savedProjectSummary').textContent = detail;
  }
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('view', next);
    history.pushState({ view: next }, '', url);
  }
  window.dispatchEvent(new CustomEvent('carlab:workview-changed', { detail: { view: next } }));
  return true;
}
document.addEventListener('click', (event) => {
  const modeButton = event.target.closest('[data-legacy-mode]');
  if (modeButton) { event.preventDefault(); selectLegacyMode(modeButton.dataset.legacyMode); return; }
  const trigger = event.target.closest('button[data-workview]');
  if (trigger) {
    event.preventDefault();
    switchTo(trigger.dataset.workview);
    return;
  }
  if (event.target.closest('#workspaceCrumb, #projectsCrumb, #projectName')) {
    event.preventDefault();
    switchTo('projects');
    return;
  }
  if (event.target.closest('#newBlankHub')) {
    event.preventDefault();
    get('blankBtn').click();
  }
});
window.addEventListener('popstate', () => {
  const state = new URLSearchParams(location.search).get('view');
  switchTo(validViews.has(state) ? state : 'vehicle', false);
});
const initialView = new URLSearchParams(location.search).get('view');
switchTo(validViews.has(initialView) ? initialView : 'vehicle', false);
window.CARLAB_SHELL = { get mode() { return mode; }, switchTo };

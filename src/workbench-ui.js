/**
 * CARLAB Workbench shell: adds a fifth, integrated CAD inspection mode.
 * Original vehicle / tire / suspension / drivetrain controllers stay intact.
 * No duplicate task state, no extra backend, no dependency on port 5175.
 */
const tabs = [...document.querySelectorAll('.mode-tabs [data-mode]')];
const workspace = document.getElementById('assemblyWorkspace');
const iframe = document.getElementById('assemblyFrame');
const title = document.getElementById('introTitle');
const kicker = document.getElementById('introKicker');
const desc = document.getElementById('introDesc');
const tags = document.getElementById('introTags');
const subtitle = document.getElementById('modeSubtitle');
const modeNames = {
  vehicle: {
    index: '01 / VEHICLE SYSTEMS',
    title: '整车机械，一眼看清。',
    desc: '从底盘与悬架开始，观察车辆结构和简化物理演示，再逐步引入有证据的真实机械约束。',
    tags: ['整车动力学演示', '驾驶与载荷实验', '实时 3D']
  },
  tire: {
    index: '02 / WHEEL & TIRE',
    title: '从轮辋细节，理解机械质感。',
    desc: '对照多种轮胎规格、轮辋和制动结构，查看几何细节与不同材料的呈现。',
    tags: ['轮胎规格', '轮辋结构', '细节特写']
  },
  suspension: {
    index: '03 / SUSPENSION',
    title: '让悬架运动，变得可观察。',
    desc: '查看弹簧、减振器和悬架行程，区分动态演示与真正的工程机构约束。',
    tags: ['弹簧与减振器', '行程实验', '仿真示意']
  },
  drivetrain: {
    index: '04 / DRIVETRAIN',
    title: '看见动力，如何层层传递。',
    desc: '把齿轮、轴和差速传动放到近处，观察不同机械部件之间的运动关系。',
    tags: ['齿轮传动', '机械机构', '转速联动']
  },
  assembly: {
    index: '05 / ENGINEERING INSPECTOR',
    title: '零件装配，真正可拆开查看。',
    desc: '点击任意零件，查看它的尺寸、来源说明、装配层级与可视化爆炸视图。',
    tags: ['装配树', '零件检查器', '工程真实性标注']
  }
};

let activeMode = 'vehicle';
function updateIntro(mode) {
  const current = modeNames[mode] || modeNames.vehicle;
  kicker.textContent = current.index;
  title.textContent = current.title;
  desc.textContent = current.desc;
  tags.replaceChildren(...current.tags.map((label) => {
    const span = document.createElement('span');
    span.textContent = label;
    return span;
  }));
}

function showAssembly() {
  if (activeMode === 'assembly') return;
  activeMode = 'assembly';
  document.body.classList.add('workbench-assembly-active');
  workspace.hidden = false;
  if (!iframe.src || iframe.getAttribute('src') === 'about:blank') {
    iframe.src = iframe.dataset.src;
  }
  tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.mode === 'assembly')));
  document.getElementById('workspaceIntro').hidden = true;
  subtitle.textContent = '工程查看 · 零件树 / 尺寸 / 拆解视图';
  updateIntro('assembly');
  document.title = '零件装配 | CARLAB 小车工程工坊';
}

function showLegacy(mode) {
  if (!(mode in modeNames) || mode === 'assembly') return;
  activeMode = mode;
  document.body.classList.remove('workbench-assembly-active');
  workspace.hidden = true;
  document.getElementById('workspaceIntro').hidden = false;
  tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.mode === mode)));
  updateIntro(mode);
  document.title = 'CARLAB · 小车工程工坊';
}

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    if (tab.dataset.mode === 'assembly') showAssembly();
    else showLegacy(tab.dataset.mode);
  });
}

// Mirror keyboard-driven focusgroup selection, without changing the existing
// Three.js scene controller or its internal tab/physics logic.
document.querySelector('.mode-tabs')?.addEventListener('keydown', (e) => {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  queueMicrotask(() => {
    const focused = document.activeElement;
    if (!focused?.matches?.('.mode-tabs [data-mode]')) return;
    if (focused.dataset.mode === 'assembly') showAssembly();
    else showLegacy(focused.dataset.mode);
  });
});

// The viewer is loaded only when entered. Reloads can restore the selected
// view via a URL query without impacting the original vehicle mode hashes.
const query = new URLSearchParams(window.location.search);
if (query.get('view') === 'assembly') showAssembly();
else updateIntro(activeMode);

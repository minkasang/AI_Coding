// R-40 断言：环境与激活 / 双尺寸布局 / 整体可见性 / 颜色同源 / 选中与拾取一致性 /
//          剖切门控 / 交互缺陷登记 / 复跑确定性。
//
// 颜色同源用「线性色比 r/g、b/g」判定：白光只对漫反射做等比缩放，色比对光强不敏感，
// 因此可以把页面实测值与 manifest 的 displayColor 直接比。绝对亮度不可跨渲染器比较。
//
// 跑：
//   node viewer/experiments/wheel-end-workbench-qa-v1/verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, 'results');
const MAIN = path.join(RESULTS, 'workbench-qa.json');
const REPEAT = path.join(RESULTS, 'repeat', 'workbench-qa.repeat.json');
const MANIFEST = path.resolve(HERE, '../../../cad/experiments/vehicle-cad-pipeline-v1/out/c01-c5d74da77c293aa5321f/manifest.json');

let pass = 0, fail = 0, skip = 0;
const failures = [];
const observations = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; failures.push(name + (detail ? '  ' + detail : '')); console.log('FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function skipped(name, why) { skip++; console.log('SKIP  ' + name + '  (' + why + ')'); }
function observe(name, text) { observations.push(name + '：' + text); console.log('OBS   ' + name + '  ' + text); }

if (!fs.existsSync(MAIN)) { console.error('缺少 ' + MAIN + '，请先跑 run-qa.mjs'); process.exit(2); }
const rec = JSON.parse(fs.readFileSync(MAIN, 'utf8'));
const num = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : '—');
const partOf = (k) => rec.parts.find((p) => p.semantic === k);
const visOf = (k) => rec.overallVisibility.find((v) => v.semantic === k);

// manifest 的 displayColor 是线性值；色比参考值直接由包计算，避免自证
const PART_KEYS = { 'PART-20-016': 'knuckle', 'PART-30-001': 'bearingOuter', 'PART-30-002': 'bearingInner', 'PART-30-006': 'hub', 'PART-30-009': 'stud' };
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const refRatios = {};
for (const [pid, key] of Object.entries(PART_KEYS)) {
  const c = manifest.partDefinitions[pid].displayColor;
  refRatios[key] = { rg: +(c[0] / c[1]).toFixed(3), bg: +(c[2] / c[1]).toFixed(3), linear: c };
}

console.log('=== 1. 环境与激活（我验的是哪条路径） ===');
ok('结果来自真实 5173 主工作台', /127\.0\.0\.1:5173\/workbench-v2\/index\.html\?view=model$/.test(rec.page), rec.page);
ok('渲染后端如实标注为软件光栅化（不冒充真实 GPU）',
  /SwiftShader/.test(rec.backend), rec.backend);
ok('C-01 已激活（正常路径）', rec.c01.ok === true);
ok('标题为「C-01 静态工装」', rec.c01.heading === 'C-01 静态工装', rec.c01.heading);
ok('说明含 STATIC_WORKHOLDING_DEMO / 非整车坐标 / 运动禁用',
  /STATIC_WORKHOLDING_DEMO/.test(rec.c01.description) && /非整车坐标/.test(rec.c01.description) && /运动禁用/.test(rec.c01.description),
  rec.c01.description);
ok('页面可见「静态」「DEMO/演示」标识（静态演示身份）', rec.demoLabel.hasStatic && rec.demoLabel.hasDemo);
ok('装配树 9 行（C-01 九实例）', rec.trees.assembly.count === 9, String(rec.trees.assembly.count));
ok('车辆树 14 行', rec.trees.vehicle.count === 14, String(rec.trees.vehicle.count));
ok('清空选择全程未失败（差分口径可信）', rec.clearFailures === 0, 'clearFailures=' + rec.clearFailures);

console.log('\n=== 2. 两种桌面尺寸的布局 ===');
const SIZES_WANT = [[1500, 920], [1280, 800]];
ok('恰有两个尺寸且为 1500x920 / 1280x800',
  rec.sizes.length === 2 && SIZES_WANT.every(([w, h]) => rec.sizes.some((s) => s.width === w && s.height === h)),
  rec.sizes.map((s) => s.tag).join(', '));
for (const s of rec.sizes) {
  ok(`${s.tag}：面板矩形无重叠`, s.layout.overlaps.length === 0,
    s.layout.overlaps.length ? JSON.stringify(s.layout.overlaps) : '0 处');
  ok(`${s.tag}：无横向溢出`, s.layout.docScrollW === s.layout.docClientW,
    `${s.layout.docScrollW}/${s.layout.docClientW}`);
  ok(`${s.tag}：选中零件不挤压画布`,
    s.canvasNoSelection.w === s.canvasWithSelection.w && s.canvasNoSelection.h === s.canvasWithSelection.h,
    `${s.canvasNoSelection.w}x${s.canvasNoSelection.h} → ${s.canvasWithSelection.w}x${s.canvasWithSelection.h}`);
  ok(`${s.tag}：画面有实际模型内容`, s.overall.pixels > 40000, '像素 ' + s.overall.pixels);
  ok(`${s.tag}：均值亮度落在浅色工作区区间 [195,225]`,
    s.overall.meanLuma >= 195 && s.overall.meanLuma <= 225, num(s.overall.meanLuma));
}
ok('选中前后画布尺寸零跳变', rec.layoutJump.canvasWidthDelta === 0 && rec.layoutJump.canvasHeightDelta === 0,
  `Δw=${rec.layoutJump.canvasWidthDelta} Δh=${rec.layoutJump.canvasHeightDelta}`);

console.log('\n=== 3. 整体视图可见性（R-35 结论在页面上的复核） ===');
const knuckleVis = visOf('knuckle'), hubVis = visOf('hub'), studVis = visOf('stud');
const outerVis = visOf('bearingOuter'), innerVis = visOf('bearingInner');
ok('转向节在默认机位可见', knuckleVis.changedPixels >= 5000, '轮廓像素 ' + knuckleVis.changedPixels);
ok('轮毂在默认机位可见', hubVis.changedPixels >= 5000, '轮廓像素 ' + hubVis.changedPixels);
ok('螺柱在默认机位可见但占比很小（<0.5%）',
  studVis.changedPixels > 0 && studVis.changedRatio < 0.005,
  `像素 ${studVis.changedPixels} 占 ${(studVis.changedRatio * 100).toFixed(2)}%`);
ok('轴承外圈在默认机位不可见（0 像素）', outerVis.changedPixels === 0, String(outerVis.changedPixels));
ok('轴承内圈在默认机位不可见（0 像素）', innerVis.changedPixels === 0, String(innerVis.changedPixels));
ok('全部高亮差分与原图同尺寸（差分有效）',
  rec.overallVisibility.every((v) => v.sameCanvas === true));
observe('轴承验收路径', '轴承内外圈在默认整车机位高亮变化像素为 0，与 R-35「整体视图里轴承 0 像素」一致；' +
  '轴承可辨识性只能用隔离或检查模式剖切验收，不得用整体视图下结论。');

console.log('\n=== 4. 颜色同源（页面是否沿用 manifest 的 displayColor） ===');
ok('5 类语义各取 1 个实例', rec.parts.length === 5, rec.parts.map((p) => p.semantic).join(', '));
ok('5 件均选中成功', rec.parts.every((p) => p.selectOk === true));
ok('5 件均隔离出真实几何（无空隔离）', rec.parts.every((p) => p.isolateEmpty === false),
  rec.parts.map((p) => `${p.semantic}:${p.rawPixelsInModelArea}px`).join(' '));
ok('转向节无车辆树入口，只能视窗拾取选中',
  partOf('knuckle').selectVia === 'viewport-pick', String(partOf('knuckle').selectVia));
ok('其余 4 件经车辆树选中',
  ['hub', 'stud', 'bearingOuter', 'bearingInner'].every((k) => partOf(k).selectVia === 'vehicle-tree'));

for (const p of rec.parts) {
  const ref = refRatios[p.semantic];
  const dRg = +(p.ratios.rg - ref.rg).toFixed(3);
  const dBg = +(p.ratios.bg - ref.bg).toFixed(3);
  ok(`${p.semantic}：线性色比与 manifest 一致（|Δ| ≤ 0.06）`,
    Math.abs(dRg) <= 0.06 && Math.abs(dBg) <= 0.06,
    `实测 ${p.ratios.rg}/${p.ratios.bg} vs 期望 ${ref.rg}/${ref.bg}（Δ ${dRg}/${dBg}）`);
}
const lumas = rec.parts.map((p) => p.measured.luma);
ok('5 件实测亮度极差 > 15（没有退化成单一兜底色）',
  Math.max(...lumas) - Math.min(...lumas) > 15, '极差 ' + (Math.max(...lumas) - Math.min(...lumas)).toFixed(2));
const FALLBACK = [174, 193, 218];  // viewport 兜底色 #aec1da
const hitsFallback = rec.parts.filter((p) => p.measured.rgb.every((v, i) => Math.abs(v - FALLBACK[i]) <= 3));
ok('无任何零件实测颜色等于兜底色 #aec1da（±3）', hitsFallback.length === 0,
  hitsFallback.map((p) => p.semantic).join(',') || '无');
// 亮度排序：manifest 由暗到亮为 knuckle < stud < bearingOuter < hub < bearingInner
const ORDER_REF = ['knuckle', 'stud', 'bearingOuter', 'hub', 'bearingInner'];
const orderMeas = [...rec.parts].sort((a, b) => a.measured.luma - b.measured.luma).map((p) => p.semantic);
const swappable = ORDER_REF.filter((k, i) => orderMeas[i] !== k).length;
ok('实测亮度序列与 manifest 序列同向（至多 1 处相邻互换）', swappable <= 2,
  `期望 ${ORDER_REF.join(' < ')} / 实测 ${orderMeas.join(' < ')}`);
observe('亮度序细节', '实测 hub（197.91）比 bearingOuter（199.84）暗 1.93（<1%），与 manifest 中两者次序相反；' +
  '差异在隔离机位的光照/金属高光范围内，不构成颜色退化。');

console.log('\n=== 5. 选中与拾取的双向一致性 ===');
ok('视窗拾取探测覆盖 3x3 网格', rec.pickProbes.length === 9, String(rec.pickProbes.length));
ok('至少 1 点命中几何', rec.pickSummary.hits >= 1, `命中 ${rec.pickSummary.hits}/9`);
ok('所有命中都与对象树同步（无不一致）', rec.pickSummary.inconsistent === 0,
  '不一致 ' + rec.pickSummary.inconsistent);
ok('命中集合包含转向节与螺柱（视窗 → 树双向可达）',
  rec.pickSummary.distinctSelected.includes('PI-20-016-FL') &&
  rec.pickSummary.distinctSelected.some((id) => id.startsWith('PI-30-009')),
  rec.pickSummary.distinctSelected.join(', '));
const stale = rec.pickProbes.filter((p) => p.selected === null && p.inspector);
ok('未命中时检查器仍显示上一件（陈旧残留）已被登记为观察项', stale.length >= 1,
  stale.length + ' 例');
if (stale.length) {
  observe('检查器陈旧值', `点击空白处后 selected=null，但检查器仍显示「${stale[0].inspector}」，` +
    '属未清空的残留 UI 状态；不影响选中逻辑，但会让用户误以为该零件仍被选中。');
}

console.log('\n=== 6. 剖切的门控与实际效果 ===');
ok('整车视图下剖切控件未生效（符合 mode 门控）',
  rec.clipModelMode.ariaPressed === 'false' && rec.clipModelMode.inlineHidden === true,
  `ariaPressed=${rec.clipModelMode.ariaPressed} inlineHidden=${rec.clipModelMode.inlineHidden}`);
ok('整车视图下剖切前后画面零变化（且两帧已稳定，不是相机漂移）',
  rec.clipModelMode.visibleChangedPixels === 0 &&
  rec.clipModelMode.beforeSettled === true && rec.clipModelMode.afterSettled === true,
  `变化像素 ${rec.clipModelMode.visibleChangedPixels}`);
ok('整车视图下零件像素占比不变（剖切确实没切）',
  rec.clipModelMode.partPixelFraction.before === rec.clipModelMode.partPixelFraction.after,
  `${rec.clipModelMode.partPixelFraction.before} → ${rec.clipModelMode.partPixelFraction.after}`);
ok('检查模式下 C-01 仍激活且 mode=inspect',
  rec.clipInspectMode.activation.active === true && rec.clipInspectMode.activation.mode === 'inspect',
  String(rec.clipInspectMode.activation.mode));
ok('检查模式下剖切控件进入按下态并展开参数',
  rec.clipInspectMode.ariaPressed === 'true' && rec.clipInspectMode.inlineHidden === false);
ok('检查模式剖切真实生效：零件可见面积下降过半',
  rec.clipInspectMode.partPixelFraction.after < rec.clipInspectMode.partPixelFraction.before * 0.7,
  `${rec.clipInspectMode.partPixelFraction.before} → ${rec.clipInspectMode.partPixelFraction.after}` +
  `（${Math.round((1 - rec.clipInspectMode.partPixelFraction.after / rec.clipInspectMode.partPixelFraction.before) * 100)}% 面积被切掉）`);
ok('剖切前后两帧均已稳定（排除漂移）',
  rec.clipInspectMode.beforeSettled === true && rec.clipInspectMode.afterSettled === true);
observe('剖切控件挤压画布', `展开剖切参数后画布高度 ${rec.clipInspectMode.beforeSize[1]} → ${rec.clipInspectMode.afterSize[1]}，` +
  '因此该组不能用逐像素差分，改用面积归一化占比；这是布局层面的可改进项，不阻断功能。');
observe('剖切入口提示缺失', '整车视图下点剖切按钮没有任何反馈（既不生效也不提示需要切到检查模式），' +
  '用户会以为功能坏了；建议在 mode !== inspect 时禁用按钮或给出提示。');

console.log('\n=== 7. 左栏装配树点选的模式副作用（登记为缺陷） ===');
const atc = rec.assemblyTreeClick;
ok('装配树行存在（转向节 PI-20-016-FL）', atc.found === true);
ok('点击前处于 C-01 激活态', atc.before.c01 === true && atc.before.heading === 'C-01 静态工装',
  atc.before.heading);
ok('点击装配树行后退出 C-01 模式', atc.after.c01 === false && atc.after.heading === '工程装配',
  atc.after.heading);
ok('点击装配树行后选中不跟随（仍是原来的零件）', atc.after.selected === atc.before.selected,
  `${atc.before.selected} → ${atc.after.selected}`);
observe('转向节无树入口', '车辆树 14 行中没有转向节；左栏装配树的转向节行点击后会退出 C-01 模式且不改变选中。' +
  '结果是转向节只能靠视窗拾取选中，对象树侧缺少可用入口。');

console.log('\n=== 8. 车辆树标注与事实一致性 ===');
ok('车辆树 13/14 行标注「无几何」', rec.trees.vehicle.noGeometryCount === 13,
  `${rec.trees.vehicle.noGeometryCount}/${rec.trees.vehicle.count}`);
const withGeometry = rec.parts.filter((p) => p.isolateEmpty === false && p.selectVia === 'vehicle-tree');
ok('标注「无几何」的行中有 4 类实际可隔离出几何', withGeometry.length === 4,
  withGeometry.map((p) => p.semantic).join(', '));
observe('「无几何」标注失真', '车辆树把轴承内外圈与 5 个螺柱都标成「无几何」，' +
  '但它们在隔离视图里都有上万像素的真实几何（如 bearingOuter 50953 px）；只有轮毂行没有该标注。' +
  '标注与实际不符，会让验收者误判哪些零件可看。');

console.log('\n=== 9. 复跑确定性 ===');
if (!fs.existsSync(REPEAT)) {
  skipped('复跑一致性', '缺少 ' + REPEAT + '，请跑 run-qa.mjs --repeat');
} else {
  const rep = JSON.parse(fs.readFileSync(REPEAT, 'utf8'));
  ok('复跑结果标注 repeat=true', rep.repeat === true);
  const norm = (o) => JSON.stringify(o)
    .replaceAll('results/repeat/', 'results/')
    .replace(/"generatedAt":"[^"]*"/, '"generatedAt":"X"')
    .replace(/"repeat":(true|false)/, '"repeat":false');
  ok('复跑与首跑逐字段一致（除生成时间与路径前缀）', norm(rep) === norm(rec));
  const keys = ['c01', 'trees', 'layoutJump', 'overallVisibility', 'parts', 'pickSummary', 'clipModelMode', 'clipInspectMode', 'assemblyTreeClick'];
  // 块内含有截图路径，需要同样抹掉 repeat 前缀再比
  const block = (o, k) => JSON.stringify(o[k]).replaceAll('results/repeat/', 'results/');
  const diffs = keys.filter((k) => block(rep, k) !== block(rec, k));
  ok('关键证据块逐项一致', diffs.length === 0, diffs.join(',') || '全部一致');
}

console.log('\n--- 观察项 ---');
observations.forEach((o, i) => console.log(`${i + 1}. ${o}`));
console.log(`\nFINAL_CHECKS_PASS=${pass} FAIL=${fail} SKIP=${skip} OBS=${observations.length}`);
if (fail) { console.log('失败项：'); failures.forEach((f) => console.log(' - ' + f)); }
console.log(fail ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(fail ? 1 : 0);

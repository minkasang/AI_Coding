// R-24 一致性与纪律校验：单变量、颜色/状态一致性、bounds 推导与换资产敏感性、
// 成本、负面回归、截图完整性、patch 纪律、两次全量重跑确定性。
// 运行：node viewer/experiments/render-staging-v1/verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, 'results');
const load = (p) => JSON.parse(fs.readFileSync(path.join(HERE, p), 'utf8'));

// 直接 import 实验页实际使用的参数适配层，验证「推导」而不是「抄常量」
const staging = await import('./staging-config.mjs');

let fail = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra && !cond ? ' — ' + extra : ''}`);
};
const near = (a, b, eps = 1e-5) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < eps;
const KEY_ORDER = ['b', 'm', 'g', 'h', 's', 'all'];
const SCENE_KEYS = ['single', 'explode', 'clip'];
const VIEW_KEYS = ['iso', 'side'];
const VARS = ['m', 'g', 'h', 's'];

const summary = load('results/run-summary.json');
const patch = load('patch-candidate.json');
const byId = Object.fromEntries(summary.cases.map((c) => [c.id, c]));
const base = byId.b;

console.log('=== 1. 运行结构 ===');
ok('六个配置齐全且顺序固定', JSON.stringify(summary.caseOrder) === JSON.stringify(KEY_ORDER),
  JSON.stringify(summary.caseOrder));
for (const id of KEY_ORDER) {
  const c = byId[id];
  ok(`${id} 存在且为 6 帧（3 场景 × 2 视角）`, !!c && c.data.frames.length === 6);
  if (!c) continue;
  const keys = c.data.frames.map((f) => `${f.scene}-${f.view}`).sort();
  const want = SCENE_KEYS.flatMap((s) => VIEW_KEYS.map((v) => `${s}-${v}`)).sort();
  ok(`${id} 帧组合完整`, JSON.stringify(keys) === JSON.stringify(want));
  const pngs = Object.values(c.shots);
  ok(`${id} 六张 PNG 存在且非空`, pngs.length === 6 && pngs.every((p) => {
    const f = path.join(HERE, p);
    return fs.existsSync(f) && fs.statSync(f).size > 1024;
  }));
  ok(`${id} 每帧都记录 contactGround（地面高度投影口径）`,
    c.data.frames.every((f) => f.contactGround && typeof f.contactGround.minLuma === 'number'));
}

console.log('\n=== 2. 一轮一个变量 ===');
ok('b 基线四变量全 0', base && VARS.every((k) => base.vars[k] === 0));
for (const id of VARS) {
  const c = byId[id];
  const active = VARS.filter((k) => c?.vars[k] === 1);
  ok(`${id.toUpperCase()} 只开启一个变量`, active.length === 1 && active[0] === id, active.join(','));
  ok(`${id.toUpperCase()} 未标为组合反例`, c && c.combination === false);
}
ok('all 四变量全开且明确标记为组合反例',
  byId.all && byId.all.combination === true && VARS.every((k) => byId.all.vars[k] === 1));
for (const id of KEY_ORDER) {
  const c = byId[id];
  ok(`${id} appliedConfig 与变量一致`, !!c && (() => {
    const a = c.data.appliedConfig;
    return a.materialMode === (c.vars.m ? 'GLB_NATIVE_PBR' : 'V2_UNIFORM_OVERRIDE')
      && a.groundPolicy === (c.vars.g ? 'GLB_BOUNDS_DERIVED' : 'V2_FIXED')
      && near(a.hemiIntensity, c.vars.h ? 0.45 : 0.9)
      && near(a.sunIntensity, c.vars.s ? 2.4 : 2.0)
      && near(a.exposure, 1.18) && near(a.fillIntensity, 0.9);
  })());
}

console.log('\n=== 3. 材质颜色 / 高亮 / 剖切 / 拆解状态一致性 ===');
const STATE_FIELDS = ['instanceId', 'visible', 'color', 'baseColor', 'emissive',
  'emissiveIntensity', 'clippingPlanes', 'clipIntersection', 'envMapIntensity'];
const stripState = (rows) => rows.map((r) => Object.fromEntries(STATE_FIELDS.map((k) => [k, r[k]])));
for (const scene of SCENE_KEYS) {
  ok(`${scene} 各配置状态行数一致`,
    KEY_ORDER.every((id) => byId[id]?.data.states[scene].length === base.data.states[scene].length));
  for (const id of KEY_ORDER) {
    ok(`${id}/${scene} 颜色/高亮/可见性/剖切状态与基线逐字段相同`,
      JSON.stringify(stripState(byId[id].data.states[scene])) === JSON.stringify(stripState(base.data.states[scene])));
  }
}
ok('explode 场景确实有选中高亮（emissive 非 000000）',
  base.data.states.explode.some((r) => r.emissive && r.emissive !== '000000' && r.emissiveIntensity > 0));
ok('explode 场景未启用剖切（拆解与剖切解耦）',
  base.data.states.explode.every((r) => r.clippingPlanes === 0));
ok('clip 场景确实启用了剖切（clippingPlanes=1）',
  base.data.states.clip.every((r) => r.clippingPlanes === 1));
ok('single 场景确实隔离为单部件（仅一个 visible instance）',
  new Set(base.data.states.single.filter((r) => r.visible).map((r) => r.instanceId)).size === 1);
ok('single 场景未启用剖切', base.data.states.single.every((r) => r.clippingPlanes === 0));
ok('single 场景无选中高亮', base.data.states.single.every((r) => r.emissive === '000000'));
ok('explode 场景 explode=1', base.data.scenes.find((s) => s.name === 'explode')?.explode === 1);
ok('clip 场景 explode=0', base.data.scenes.find((s) => s.name === 'clip')?.explode === 0);

console.log('\n=== 4. GLB bounds 推导与换资产敏感性（禁止写死 -0.043） ===');
const gd = base.data.groundDerived;
ok('G 政策为 GLB_BOUNDS_DERIVED', gd.policy === 'GLB_BOUNDS_DERIVED');
ok('bounds 来源为全可见无爆炸完整模型', gd.boundsSource === 'FULL_MODEL_ALL_VISIBLE_EXPLODE_0');
ok('groundY = boundsMinY - clearance', near(gd.groundY, gd.boundsMinY - gd.clearanceM, 1e-6));
ok('gridY = groundY + clearance', near(gd.gridY, gd.groundY + gd.clearanceM, 1e-6));
ok('记录了与 R-19 写死值的差值', typeof gd.deltaFromHardcodedM === 'number');
console.log(`      本轮实测：boundsMinY=${gd.boundsMinY} → groundY=${gd.groundY}，与写死 -0.043 的 Δ=${gd.deltaFromHardcodedM}（数值巧合，不代表复用常量）`);
ok('如实记录数值巧合（Δ=0 不被隐藏）', near(gd.deltaFromHardcodedM, 0));
ok('记录了 V2 地面与 GLB 最低点的空隙 0.054 m', near(gd.gapFromV2GroundM, 0.054));
ok('G case 使用 bounds 推导的 groundY/gridY',
  near(byId.g.data.appliedConfig.groundY, gd.groundY) && near(byId.g.data.appliedConfig.gridY, gd.gridY));
ok('基线 case 仍用 V2 原值 -0.096 / -0.095',
  near(base.data.appliedConfig.groundY, -0.096) && near(base.data.appliedConfig.gridY, -0.095));
ok('所有 case 的 groundDerived 完全一致（不随场景漂移）',
  KEY_ORDER.every((id) => JSON.stringify(byId[id].data.groundDerived) === JSON.stringify(gd)));

// 换资产敏感性：喂不同 bounds 给实验页实际使用的同一个函数，证明它会变，常量不会变。
const probeA = staging.deriveGroundFromBounds({ min: { y: -0.042 } });
const probeB = staging.deriveGroundFromBounds({ min: { y: -0.060 } });
const probeC = staging.deriveGroundFromBounds({ min: { y: -0.010 } });
ok('同一推导函数对当前 GLB 复现实测 groundY', near(probeA.groundY, gd.groundY));
ok('换一个更低 GLB 后 groundY 变为 -0.061（不是固定的 -0.043）',
  near(probeB.groundY, -0.061) && Math.abs(probeB.groundY - gd.hardcodedY) > 1e-6);
ok('换一个更高 GLB 后 groundY 变为 -0.011',
  near(probeC.groundY, -0.011));
ok('三个探针的 hardcodedY 恒为 -0.043（用于对比，不是输出）',
  [probeA, probeB, probeC].every((p) => near(p.hardcodedY, -0.043)));
ok('G 变量确实改变了地面投影条带位置（contactGround ROI y）',
  Math.abs(byId.g.metrics.sideContactGroundRectY - base.metrics.sideContactGroundRectY) > 1);
ok('parseConfig 拒绝多变量组合（除非 all=1）',
  (() => { try { staging.parseConfig(new URLSearchParams('m=1&g=1')); return false; }
    catch (e) { return String(e.message).includes('违反一轮一个变量'); } })());
ok('parseConfig 拒绝 groundPolicy=hardcoded',
  (() => { try { staging.parseConfig(new URLSearchParams('groundPolicy=hardcoded')); return false; }
    catch (e) { return String(e.message).includes('拒绝写死地面'); } })());

console.log('\n=== 5. M 单变量与成本 ===');
const native = base.data.glb.nativePbr;
const partOf = (caseId, instanceId) => byId[caseId].data.states.explode
  .filter((r) => r.instanceId === instanceId);
ok('基线所有材质为 V2 统一 0.70/0.34',
  base.data.states.explode.every((r) => near(r.metalness, 0.70) && near(r.roughness, 0.34)));
const instToPart = Object.fromEntries(base.data.glb.instances.map((i) => [i.instanceId, i.partKey]));
const mRestored = Object.entries(instToPart).every(([id, partKey]) => {
  const rows = partOf('m', id);
  const values = native[partKey];
  return rows.length === values.length && rows.every((r, i) =>
    near(r.metalness, values[i].metalness, 1e-3) && near(r.roughness, values[i].roughness, 1e-3));
});
ok('M case 逐零件恢复 GLB 原生 PBR 数值', mRestored);
ok('M case PBR 分档确实不止一种（有分层）',
  new Set(byId.m.data.states.explode.map((r) => `${r.metalness}/${r.roughness}`)).size >= 3);
ok('G/H/S case 不改 PBR 数值',
  ['g', 'h', 's'].every((id) => byId[id].data.states.explode
    .every((r) => near(r.metalness, 0.70) && near(r.roughness, 0.34))));
const costs = KEY_ORDER.map((id) => JSON.stringify(byId[id].cost.asset));
ok('六配置静态资产成本普查完全一致', new Set(costs).size === 1);
ok('几何/纹理/draw-call 相对基线无变化（M/G/H/S 均为非几何变量）',
  ['m', 'g', 'h', 's'].every((id) =>
    byId[id].cost.calls === base.cost.calls &&
    byId[id].cost.triangles === base.cost.triangles &&
    byId[id].cost.geometries === base.cost.geometries &&
    byId[id].cost.textures === base.cost.textures));
ok('GLB 无外部贴图（uniqueTextures=0），不虚构纹理成本',
  base.cost.asset.uniqueTextures === 0 && base.cost.asset.textureSlots === 0);
ok('所有配置未修改几何法线', KEY_ORDER.every((id) => byId[id].data.fixed.geometryNormalsModified === false));
ok('所有配置声明生产文件未被修改', KEY_ORDER.every((id) => byId[id].data.fixed.productionFileModified === false));
ok('渲染后端如实标注为 SwiftShader',
  KEY_ORDER.every((id) => byId[id].data.fixed.rendererBackend.includes('SwiftShader')));

console.log('\n=== 6. 截图完整性 ===');
for (const id of KEY_ORDER) {
  const it = byId[id].data.integrity;
  ok(`${id} preserveDrawingBuffer 生效且无空白帧`,
    it.preserveDrawingBuffer === true && it.emptyFrameDetected === false &&
    it.backgroundSamples.length === 6 &&
    it.backgroundSamples.every((s) => s.rgba[0] + s.rgba[1] + s.rgba[2] >= 30));
}

console.log('\n=== 7. 负面回归 ===');
ok('六组负面处理全部显式拒绝', summary.negatives.length === 6 && summary.negatives.every((n) => n.rejected === true));
for (const n of summary.negatives) {
  ok(`${n.id} 拒绝原因命中预期`, n.matched === true, String(n.error).slice(0, 160));
}
ok('所有负面用例未产出伪造的指标帧', summary.negatives.every((n) => !n.frames));

console.log('\n=== 8. 最小 patch 纪律 ===');
ok('patch 状态为 PROPOSAL_NOT_APPLIED', patch.status === 'PROPOSAL_NOT_APPLIED');
ok('patch 策略为 ONE_VARIABLE_PER_STEP', patch.policy === 'ONE_VARIABLE_PER_STEP');
ok('patch 明确未修改生产文件', patch.productionFileModified === false);
ok('patch 逐变量拆成 M/G/H/S 四步',
  Array.isArray(patch.steps) && patch.steps.length === 4 &&
  JSON.stringify(patch.steps.map((s) => s.variable)) === JSON.stringify(['M', 'G', 'H', 'S']));
ok('每步均为 PROPOSAL_NOT_APPLIED 且含 VISUAL_ASSUMPTION',
  patch.steps.every((s) => s.status === 'PROPOSAL_NOT_APPLIED' && s.evidenceLevel.includes('VISUAL_ASSUMPTION')));
ok('每步都记录指标差与成本差', patch.steps.every((s) => s.metricDelta && s.costDelta));
ok('每步都给出建议且不声称可直接合入',
  patch.steps.every((s) => typeof s.recommendation === 'string' && !s.recommendation.includes('直接合入')));
ok('patch 保留 bounds 推导事实且禁止写死',
  patch.groundDerivation?.policy === 'GLB_BOUNDS_DERIVED' &&
  patch.caveats.some((c) => c.includes('不得写死')));
ok('patch 明确记录「数值巧合 Δ=0」', patch.caveats.some((c) => c.includes('Δ=0')));
ok('patch 含四变量全开组合反例及结论', !!patch.combinationNegative && typeof patch.combinationNegative.verdict === 'string');
ok('patch 明确 SwiftShader 非真实 GPU 性能', patch.caveats.some((c) => c.includes('真实 GPU')));

console.log('\n=== 9. 组合反例负面信号 ===');
const allNear = byId.all.metrics.isoNearWhiteRatio;
const bNear = base.metrics.isoNearWhiteRatio;
console.log(`      b.isoNearWhiteRatio=${bNear}  all.isoNearWhiteRatio=${allNear}  Δ=${+(allNear - bNear).toFixed(6)}`);
ok('组合反例近白比变化被如实写入 patch（不隐藏负面信号）',
  near(patch.combinationNegative.isoNearWhiteRatio.delta, +(allNear - bNear).toFixed(6), 1e-6));
ok('组合反例未给出整包合入建议', !patch.combinationNegative.verdict.includes('推荐整包合入'));
ok('组合反例记录了地面投影位置变化',
  typeof patch.combinationNegative.sideContactGroundRectY?.delta === 'number');
ok('patch 含可分离性分析且判定亮度指标近似可加',
  patch.separabilityAnalysis?.brightnessMetricsApproximatelyAdditive === true &&
  typeof patch.separabilityAnalysis.mShareOfCombinedContrastGain === 'number');
ok('可分离性分析覆盖五个指标',
  Object.keys(patch.separabilityAnalysis?.metrics || {}).length === 5);
ok('M 单变量承担组合对比度增益的主要部分（≥80%）',
  patch.separabilityAnalysis.mShareOfCombinedContrastGain >= 0.8,
  String(patch.separabilityAnalysis.mShareOfCombinedContrastGain));
ok('M 单变量的近白代价明显小于组合（≤30%）',
  patch.separabilityAnalysis.mShareOfCombinedNearWhiteCost <= 0.3,
  String(patch.separabilityAnalysis.mShareOfCombinedNearWhiteCost));

console.log('\n=== 10. 两次全量重跑确定性 ===');
const repeatPath = path.join(RESULTS, 'run-summary.repeat.json');
if (!fs.existsSync(repeatPath)) {
  console.log('SKIP  未找到 results/run-summary.repeat.json（用 R24_TAG=repeat 复跑后自动启用）');
} else {
  const repeat = JSON.parse(fs.readFileSync(repeatPath, 'utf8'));
  const comparable = (s) => s.cases.map((c) => ({
    id: c.id, metrics: c.metrics, cost: c.cost,
    appliedConfig: c.data.appliedConfig, groundDerived: c.data.groundDerived,
    assetCost: c.data.assetCost, states: c.data.states,
    frames: c.data.frames, glb: c.data.glb, integrity: c.data.integrity
  }));
  const a = JSON.stringify(comparable(summary));
  const b = JSON.stringify(comparable(repeat));
  ok('主跑与复跑的所有数值/状态/指标逐字节一致', a === b,
    a === b ? '' : `长度 ${a.length} vs ${b.length}`);
  ok('复跑负面结果一致', JSON.stringify(summary.negatives.map((n) => [n.id, n.rejected, n.matched, n.error])) ===
    JSON.stringify(repeat.negatives.map((n) => [n.id, n.rejected, n.matched, n.error])));
}

console.log(`\nFINAL_CHECKS_FAIL=${fail} / RESULT: ${fail === 0 ? 'PASS' : 'FAIL'}`);
process.exit(fail === 0 ? 0 : 1);

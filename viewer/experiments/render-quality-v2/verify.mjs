// R-19 结果一致性校验：四组三视角齐全、同一 GLB、单变量约束、固定机位、反例回归、补丁一致。
// 复现：node verify.mjs   （退出码 0 = PASS）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'results', 'ab-metrics.json');
const NEG = path.join(HERE, 'results', 'negative-cases.json');
const PATCH = path.join(HERE, 'patch-candidate.json');
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, pass: !!cond, detail });
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

if (!fs.existsSync(DATA)) { console.error('FATAL: 缺少 results/ab-metrics.json'); process.exit(2); }
const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const byCase = new Map(data.cases.map((c) => [c.case, c]));
const VIEWS = ['iso', 'top', 'side'];

ok('schemaVersion = carlab.r19.ab/1.0', data.schemaVersion === 'carlab.r19.ab/1.0');
ok('四组齐全 l0m0/l1m0/l0m1/l1m1',
  ['l0m0', 'l1m0', 'l0m1', 'l1m1'].every((k) => byCase.has(k)));
ok('声明未改生产文件', data.environment?.productionFilesTouched === false);
ok('声明 5173 同源、无新常驻端口', /5173/.test(data.environment?.service || '') && /未新增常驻端口/.test(data.environment?.service || ''));
ok('声明软件光栅化', /swiftshader/i.test(data.environment?.rasterizer || ''));
ok('声明无外部素材', /^none/.test(data.environment?.externalAssets || ''));

for (const c of data.cases) {
  ok(`${c.case} 三个视角齐全`, c.views.length === 3 && c.views.every((v, i) => v.name === VIEWS[i]));
  ok(`${c.case} GLB 单位为米`, c.glb?.glbUnit === 'm');
  ok(`${c.case} GLB 有 3 个零件与三角数`, c.glb?.parts === 3 && c.glb?.triangles > 0);
  for (const v of c.views) {
    ok(`${c.case}/${v.name} renderInfo 完整`,
      ['calls', 'triangles', 'geometries', 'textures'].every((k) => finite(v.renderInfo?.[k])),
      JSON.stringify(v.renderInfo));
    ok(`${c.case}/${v.name} 模型 ROI 有像素`, v.model?.pixels > 0, `pixels=${v.model?.pixels}`);
    ok(`${c.case}/${v.name} 过曝/层次/梯度指标有效`,
      ['nearWhiteRatio', 'clippedRatio', 'highlightRatio', 'lumaStdDev', 'edgeGradient', 'meanLuma']
        .every((k) => finite(v.model?.[k])));
    ok(`${c.case}/${v.name} 接地剖面 32 点有限`,
      Array.isArray(v.contact?.profile) && v.contact.profile.length === 32 && v.contact.profile.every(finite));
    ok(`${c.case}/${v.name} 三个零件 ROI 齐全`,
      Array.isArray(v.partRois) && v.partRois.length === 3 && v.partRois.every((p) => p.pixels > 0));
    ok(`${c.case}/${v.name} 截图存在且非空`,
      fs.existsSync(path.join(HERE, v.shot)) && fs.statSync(path.join(HERE, v.shot)).size > 10000,
      v.shot);
  }
}

// 同一 GLB、同一物理尺寸：四组 bbox / meshCount / triangles 完全一致
const glbKeys = new Set(data.cases.map((c) => JSON.stringify({
  asset: c.glb.asset, bbox: c.glb.bbox, parts: c.glb.parts,
  meshCount: c.glb.meshCount, triangles: c.glb.triangles
})));
ok('四组使用完全相同的 GLB 与包围盒', glbKeys.size === 1,
  `distinct=${glbKeys.size}`);

// 单变量 + 配置包约束：只改材质与光参数，不增删任何几何/对象
for (const view of VIEWS) {
  const rs = data.cases.map((c) => c.views.find((v) => v.name === view).renderInfo);
  ok(`${view}: 四组 calls 相同`, new Set(rs.map((r) => r.calls)).size === 1,
    rs.map((r) => r.calls).join(','));
  ok(`${view}: 四组 triangles 相同`, new Set(rs.map((r) => r.triangles)).size === 1,
    rs.map((r) => r.triangles).join(','));
  ok(`${view}: 四组 geometries 相同`, new Set(rs.map((r) => r.geometries)).size === 1,
    rs.map((r) => r.geometries).join(','));
}

// M 生效：m1 恢复 GLB 原值，m0 为统一覆盖
for (const c of data.cases) {
  const uniform = c.parts.every((p) => p.appliedMaterials.every((m) => m.metalness === 0.7 && m.roughness === 0.34));
  const native = c.parts.every((p) => p.appliedMaterials.every((m, i) =>
    m.metalness === p.glbMaterials[i]?.metalness && m.roughness === p.glbMaterials[i]?.roughness));
  if (c.m === 0) ok(`${c.case} 材质 = V2 统一覆盖 0.70/0.34`, uniform);
  else ok(`${c.case} 材质 = 恢复 GLB 自带 PBR`, native);
}
ok('m1 组三个零件的 PBR 数值确实不同（存在层次）', (() => {
  const c = byCase.get('l0m1');
  const vals = c.parts.map((p) => `${p.appliedMaterials[0]?.metalness}/${p.appliedMaterials[0]?.roughness}`);
  return new Set(vals).size >= 2;
})());

// L 生效：配置包逐项变化，且 M 不干扰光照配置
const L_KEYS = ['exposure', 'hemiIntensity', 'sunIntensity', 'fillIntensity',
  'groundColor', 'groundOpacity', 'groundY', 'gridY'];
for (const k of L_KEYS) {
  const l0 = byCase.get('l0m0').appliedConfig[k];
  const l1 = byCase.get('l1m1').appliedConfig[k];
  ok(`L 生效：${k} 由 ${l0} 改为 ${l1}`, l0 !== l1);
}
ok('M 不干扰光照配置：l0m0 与 l0m1 的 appliedConfig 仅 materialMode 不同', (() => {
  const a = byCase.get('l0m0').appliedConfig, b = byCase.get('l0m1').appliedConfig;
  return L_KEYS.every((k) => a[k] === b[k]) && a.materialMode !== b.materialMode;
})());

// 固定机位：同视角下四组相机与 ROI 完全一致
for (const view of VIEWS) {
  const keys = new Set(data.cases.map((c) => {
    const v = c.views.find((x) => x.name === view);
    return JSON.stringify({ cam: v.camera, roi: v.roi.model });
  }));
  ok(`${view}: 四组相机与模型 ROI 完全一致`, keys.size === 1, `distinct=${keys.size}`);
}
ok('未修改几何法线', data.cases.every((c) => c.fixed?.geometryNormalsModified === false));

// 反例回归
if (fs.existsSync(NEG)) {
  const neg = JSON.parse(fs.readFileSync(NEG, 'utf8'));
  ok('四条反例齐全', neg.cases.length === 4);
  for (const n of neg.cases) {
    const keywordOk = n.id === 'missing-glb' ? true : (n.error || '').includes(n.expect);
    ok(`反例 ${n.id} 被显式拒绝`, n.rejected === true && keywordOk, n.error?.slice(0, 80));
    ok(`反例 ${n.id} 未产出伪造指标`, !n.views && !n.glb);
  }
} else ok('negative-cases.json 存在', false);

// 参数补丁
if (fs.existsSync(PATCH)) {
  const p = JSON.parse(fs.readFileSync(PATCH, 'utf8'));
  ok('patch-candidate.json 状态为 PROPOSAL_NOT_APPLIED', p.status === 'PROPOSAL_NOT_APPLIED');
  ok('补丁目标为 workbench-v2/viewport.js', p.target === 'workbench-v2/viewport.js');
  ok('补丁含 9 项变更（8 光/接地 + 1 材质）', p.changes.length === 9);
  const a = byCase.get('l0m0'), d = byCase.get('l1m1');
  ok('补丁 metricBasis 与实测一致（发白比）',
    p.metricBasis.isoNearWhiteRatio.baseline === a.views.find((v) => v.name === 'iso').model.nearWhiteRatio &&
    p.metricBasis.isoNearWhiteRatio.proposed === d.views.find((v) => v.name === 'iso').model.nearWhiteRatio);
  ok('补丁明确标注 L 为配置包', p.caveats.some((s) => s.includes('不是单变量')));
  ok('补丁如实记录发白比上升（负面信号）',
    Array.isArray(p.adverseFindings) &&
    p.adverseFindings.some((f) => f.metric.includes('nearWhiteRatio') && f.worse === true));
  ok('补丁如实记录接地条带口径不敏感',
    Array.isArray(p.adverseFindings) &&
    p.adverseFindings.some((f) => f.metric.includes('centerEdgeRatio') && f.improvementSmall === true));
  ok('补丁给出「不建议无条件合入」建议',
    typeof p.recommendation === 'string' && p.recommendation.includes('不建议无条件全量合入'));
} else ok('patch-candidate.json 存在', false);

let fails = 0;
for (const c of checks) {
  if (!c.pass) fails++;
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  [' + c.detail + ']' : ''}`);
}
console.log(`\nFINAL_CHECKS_FAIL=${fails} / RESULT: ${fails ? 'FAIL' : 'PASS'}`);
process.exit(fails ? 1 : 0);

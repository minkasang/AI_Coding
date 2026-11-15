// R-14 结果一致性校验：检查四组齐全、指标非空、单变量约束成立。
// 复现：node verify.mjs   （退出码 0 = PASS）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, 'results', 'ab-metrics.json');
const checks = [];
const ok = (name, cond, detail = '') => checks.push({ name, pass: !!cond, detail });

if (!fs.existsSync(FILE)) {
  console.error('FATAL: 缺少 results/ab-metrics.json，请先运行 node run-ab.mjs');
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const byCase = new Map(data.cases.map((c) => [c.case, c]));
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

ok('schemaVersion = carlab.r14.ab/1.0', data.schemaVersion === 'carlab.r14.ab/1.0');
ok('四组齐全 (n0g0/n1g0/n0g1/n1g1)',
  ['n0g0', 'n1g0', 'n0g1', 'n1g1'].every((k) => byCase.has(k)));
ok('环境变量声明为软件光栅化', /swiftshader/i.test(data.environment?.rasterizer || ''));
ok('声明未改生产页面', data.environment?.productionPageTouched === false);
ok('声明无外部素材', /none/i.test(data.environment?.externalAssets || ''));

for (const c of data.cases) {
  const m = c.metrics;
  ok(`${c.case} 无页面错误`, !m.error, m.error || '');
  ok(`${c.case} renderInfo 完整`,
    ['calls', 'triangles', 'geometries', 'textures'].every((k) => finite(m.renderInfo?.[k])),
    JSON.stringify(m.renderInfo));
  ok(`${c.case} 轮辋 ROI 有像素`, m.rim?.pixels > 0, `pixels=${m.rim?.pixels}`);
  ok(`${c.case} 高光占比/边缘梯度有效`,
    finite(m.rim?.highlightRatio) && finite(m.rim?.edgeGradient));
  ok(`${c.case} 接地剖面 32 点且全为有限数`,
    Array.isArray(m.contact?.profile) && m.contact.profile.length === 32 &&
    m.contact.profile.every(finite));
  ok(`${c.case} 接地不对称度/亮度比有效`,
    finite(m.contact?.asymmetry) && finite(m.contact?.centerEdgeRatio));
  ok(`${c.case} 截图文件存在`, fs.existsSync(path.join(HERE, c.shot)), c.shot);
  ok(`${c.case} 变量标志与 case 一致`, m.n === c.n && m.g === c.g);
  ok(`${c.case} AO 贴片与 G 变量一致`,
    m.geometry?.aoMeshPresent === (c.g === 0) &&
    m.geometry?.groundReceiveShadow === (c.g === 1));
}

const get = (k) => byCase.get(k)?.metrics;
const n0g0 = get('n0g0'), n1g0 = get('n1g0'), n0g1 = get('n0g1'), n1g1 = get('n1g1');
if (n0g0 && n1g0 && n0g1 && n1g1) {
  // 单变量约束 1：N 只改法线，不改三角数与 draw call
  ok('N 单变量：n0g0 / n1g0 triangles 相同',
    n0g0.renderInfo.triangles === n1g0.renderInfo.triangles,
    `${n0g0.renderInfo.triangles} vs ${n1g0.renderInfo.triangles}`);
  ok('N 单变量：n0g1 / n1g1 triangles 相同',
    n0g1.renderInfo.triangles === n1g1.renderInfo.triangles,
    `${n0g1.renderInfo.triangles} vs ${n1g1.renderInfo.triangles}`);
  ok('N 单变量：n0g0 / n1g0 calls 相同',
    n0g0.renderInfo.calls === n1g0.renderInfo.calls,
    `${n0g0.renderInfo.calls} vs ${n1g0.renderInfo.calls}`);
  ok('N 单变量：n0g1 / n1g1 calls 相同',
    n0g1.renderInfo.calls === n1g1.renderInfo.calls,
    `${n0g1.renderInfo.calls} vs ${n1g1.renderInfo.calls}`);

  // N 确实生效：法线分布发生变化（方向数或熵），且 N1 组有被处理的 mesh
  for (const [k, m] of [['n1g0', n1g0], ['n1g1', n1g1]]) {
    ok(`${k} creasedMeshes > 0`, m.geometry?.creasedMeshes > 0,
      `creasedMeshes=${m.geometry?.creasedMeshes}`);
  }
  ok('N 生效：法线分布与基线不同（唯一方向数或熵）',
    (n1g0.normalsAfter.uniqueNormals !== n0g0.normalsBefore.uniqueNormals ||
     n1g0.normalsAfter.normalEntropy !== n0g0.normalsBefore.normalEntropy),
    `before=${n0g0.normalsBefore.uniqueNormals}/${n0g0.normalsBefore.normalEntropy} after=${n1g0.normalsAfter.uniqueNormals}/${n1g0.normalsAfter.normalEntropy}`);
  ok('四组法线基线（改造前）完全一致',
    new Set([n0g0, n1g0, n0g1, n1g1].map((m) =>
      `${m.normalsBefore.uniqueNormals}|${m.normalsBefore.normalEntropy}|${m.normalsBefore.triangles}`)).size === 1);

  // 单变量约束 2：G 只增减一个 AO 贴片（1 次 draw call / 2 个三角）
  for (const [a, b] of [['n0g0', 'n0g1'], ['n1g0', 'n1g1']]) {
    const A = get(a), B = get(b);
    ok(`G 单变量：${a}/${b} triangles 差 = 2（AO 平面）`,
      A.renderInfo.triangles - B.renderInfo.triangles === 2,
      `${A.renderInfo.triangles} - ${B.renderInfo.triangles}`);
    ok(`G 单变量：${a}/${b} calls 差 = 1（AO 平面）`,
      A.renderInfo.calls - B.renderInfo.calls === 1,
      `${A.renderInfo.calls} - ${B.renderInfo.calls}`);
  }

  // G 确实生效：接地带的亮度剖面不同
  ok('G 生效：接地亮度剖面产生可测差异',
    n0g0.contact.asymmetry !== n0g1.contact.asymmetry ||
    n0g0.contact.centerEdgeRatio !== n0g1.contact.centerEdgeRatio,
    `asym ${n0g0.contact.asymmetry} vs ${n0g1.contact.asymmetry}; ratio ${n0g0.contact.centerEdgeRatio} vs ${n0g1.contact.centerEdgeRatio}`);
  ok('固定机位：四组 ROI 矩形一致',
    new Set([n0g0, n1g0, n0g1, n1g1].map((m) => JSON.stringify(m.roi))).size === 1);
}

let fails = 0;
for (const c of checks) {
  if (!c.pass) fails++;
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  [' + c.detail + ']' : ''}`);
}
console.log(`\nFINAL_CHECKS_FAIL=${fails} / RESULT: ${fails ? 'FAIL' : 'PASS'}`);
process.exit(fails ? 1 : 0);

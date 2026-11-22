// R-35 断言：资产事实 / A/B 结构一致 / 差异量级 / 可读性判定 / 截图完整 / 纪律 / 复跑确定性。
//
// 跑：
//   node viewer/experiments/wheel-end-visual-baseline-v1/verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, 'results');
const MAIN = path.join(RESULTS, 'wheel-end-check.json');
const REPEAT = path.join(RESULTS, 'repeat', 'wheel-end-check.repeat.json');

let pass = 0, fail = 0, skip = 0;
const failures = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log('PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; failures.push(name + (detail ? '  ' + detail : '')); console.log('FAIL  ' + name + (detail ? '  ' + detail : '')); }
}
function skipped(name, why) { skip++; console.log('SKIP  ' + name + '  (' + why + ')'); }

if (!fs.existsSync(MAIN)) { console.error('缺少 ' + MAIN + '，请先跑 run-checks.mjs'); process.exit(2); }
const raw = JSON.parse(fs.readFileSync(MAIN, 'utf8')).payload;
const num = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : '—');
const view = (n) => raw.views.find((v) => v.view === n);
const armOf = (v, id) => v.arms.find((a) => a.arm === id);
const groupOf = (v, key) => armOf(v, 'A').groups.find((g) => g.key === key);
const pairOf = (v, a, b) => (armOf(v, 'A').allPairs || []).find(
  (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));

console.log('=== 1. 资产事实 ===');
ok('包 ID 为 C-01 已验收包', raw.packageId === 'c01-c5d74da77c293aa5321f', raw.packageId);
ok('来源等级为 DEMO_ASSUMPTION（不得声称 OEM）', raw.sourceGrade === 'DEMO_ASSUMPTION', raw.sourceGrade);
ok('GLB 单位为 m', raw.glb.unit === 'm');
ok('GLB 无外部贴图（纯数值 PBR）', raw.glb.textures === 0 && raw.glb.images === 0,
  `textures=${raw.glb.textures} images=${raw.glb.images}`);
ok('原生 PBR 只有 1 档（本资产无分档可恢复）', raw.glb.nativeDistinct === 1,
  raw.glb.nativeTiers.map((t) => `${num(t.metalness, 2)}/${num(t.roughness, 2)}×${t.materials}`).join(','));
ok('该唯一档为 metalness 0.72 / roughness 0.34',
  Math.abs(raw.glb.nativeTiers[0].metalness - 0.72) < 1e-6 && Math.abs(raw.glb.nativeTiers[0].roughness - 0.34) < 1e-6);
ok('已记录现有覆盖值与其生产源码出处',
  raw.fixed.legacyPbr.metalness === 0.70 && raw.fixed.legacyPbr.roughness === 0.34 &&
  /viewport\.js:16[67]/.test(raw.fixed.legacySource), raw.fixed.legacySource);
ok('9 个实例、5 种零件语义', raw.seedCount.instances === 9 && Object.keys(raw.partKeys).length === 5);

console.log('\n=== 2. A/B 结构一致（材质改动不得动几何与装配） ===');
for (const v of raw.views) {
  ok(`${v.view}：两臂世界矩阵逐值相同`, v.sameWorldMatrices === true);
  const a = armOf(v, 'A').renderInfo, b = armOf(v, 'B').renderInfo;
  ok(`${v.view}：draw call / 三角形 / 几何 / 纹理 相同`,
    a.calls === b.calls && a.triangles === b.triangles && a.geometries === b.geometries && a.textures === b.textures,
    `calls=${a.calls} tris=${a.triangles}`);
}

console.log('\n=== 3. A/B 差异量级（证明「恢复原生 PBR」在该资产上接近 no-op） ===');
for (const v of raw.views) {
  const d = v.overallDelta;
  ok(`${v.view}：对比度差 < 2`, Math.abs(d.lumaStdDev) < 2, 'Δ=' + num(d.lumaStdDev));
  ok(`${v.view}：均值亮度差 < 2`, Math.abs(d.meanLuma) < 2, 'Δ=' + num(d.meanLuma));
  ok(`${v.view}：边缘梯度差 < 0.1`, Math.abs(d.edgeGradient) < 0.1, 'Δ=' + num(d.edgeGradient, 4));
}
const maxContrast = Math.max(...raw.views.map((v) => Math.abs(v.overallDelta.lumaStdDev)));
ok('三机位最大对比度差 < 1（远小于 R-24 的 M 单变量 +12.254）', maxContrast < 1, 'max=' + num(maxContrast));

console.log('\n=== 4. 可读性判定 ===');
const full = view('full'), bear = view('bearingIsolated'), hubv = view('hubStack');

ok('full：轴承内圈完全不可见（被转向节与轮毂遮挡）',
  (armOf(full, 'A').occluded || []).includes('PI-30-002-FL'),
  'occluded=' + (armOf(full, 'A').occluded || []).join(','));
ok('full：轴承外圈完全不可见', (armOf(full, 'A').occluded || []).includes('PI-30-001-FL'));
ok('full：转向节 vs 轮毂 DISTINCT', pairOf(full, 'knuckle', 'hub')?.verdict === 'DISTINCT',
  'ΔL=' + num(pairOf(full, 'knuckle', 'hub')?.deltaLuma));
ok('full：转向节 vs 螺柱 DISTINCT', pairOf(full, 'knuckle', 'stud')?.verdict === 'DISTINCT',
  'ΔL=' + num(pairOf(full, 'knuckle', 'stud')?.deltaLuma));
const hubStudFull = pairOf(full, 'hub', 'stud');
ok('full：轮毂 vs 螺柱 记录为 MARGINAL（整体视图下螺柱偏小）',
  hubStudFull?.verdict === 'MARGINAL', 'ΔL=' + num(hubStudFull?.deltaLuma));

ok('bearingIsolated：内外圈都有足够像素（≥50000）',
  (groupOf(bear, 'bearingOuter')?.pixels || 0) >= 50000 && (groupOf(bear, 'bearingInner')?.pixels || 0) >= 50000,
  `outer=${groupOf(bear, 'bearingOuter')?.pixels} inner=${groupOf(bear, 'bearingInner')?.pixels}`);
const ringPair = pairOf(bear, 'bearingOuter', 'bearingInner');
ok('bearingIsolated：内外圈 DISTINCT（ΔL ≥ 12）', ringPair?.verdict === 'DISTINCT', 'ΔL=' + num(ringPair?.deltaLuma));
ok('bearingIsolated：该机位只有这两个零件可见', armOf(bear, 'A').groups.length === 2);

ok('hubStack：轮毂 + 5 颗螺柱都可见', (groupOf(hubv, 'hub')?.pixels || 0) > 50000 &&
  groupOf(hubv, 'stud')?.instances === 5, `studs=${groupOf(hubv, 'stud')?.instances}`);
const hubStudFront = pairOf(hubv, 'hub', 'stud');
ok('hubStack：轮毂 vs 螺柱 DISTINCT', hubStudFront?.verdict === 'DISTINCT', 'ΔL=' + num(hubStudFront?.deltaLuma));

const studRows = armOf(hubv, 'A').parts.filter((p) => p.key.startsWith('PI-30-009'));
const studSpread = Math.max(...studRows.map((p) => p.meanLuma)) - Math.min(...studRows.map((p) => p.meanLuma));
ok('hubStack：五颗螺柱之间表观亮度存在差异（记录用，不设阈值）', studSpread > 5,
  'spread=' + num(studSpread));

console.log('\n=== 5. 截图完整性 ===');
const shots = JSON.parse(fs.readFileSync(MAIN, 'utf8')).shots;
ok('截图数量为 9（3 机位 × A/B + 3 张分割图）', shots.length === 9, String(shots.length));
let minBytes = Infinity;
for (const rel of shots) {
  // rel 形如 'results/shot-A-full.png'（相对本实验目录）
  const abs = path.join(HERE, rel);
  const b = fs.existsSync(abs) ? fs.statSync(abs).size : 0;
  if (b < minBytes) minBytes = b;
  ok('截图存在且非空：' + path.basename(rel), b > 10000, b + ' bytes');
}
ok('所有截图 > 10KB（无空白帧）', minBytes > 10000, 'min=' + minBytes);
for (const v of raw.views) {
  ok(`${v.view}：模型像素数 ≥ 10000（渲染确实有内容）`, armOf(v, 'A').modelPixels >= 10000,
    'px=' + armOf(v, 'A').modelPixels);
}
ok('preserveDrawingBuffer 生效', raw.integrity.preserveDrawingBuffer === true);

console.log('\n=== 6. 纪律 ===');
ok('生产文件未修改', raw.fixed.productionFileModified === false);
ok('使用生产 EngineeringViewport 类', /workbench-v2\/viewport\.js/.test(raw.fixed.productionClass), raw.fixed.productionClass);
ok('曝光固定为生产值 1.18', Math.abs(raw.fixed.exposure - 1.18) < 1e-9, String(raw.fixed.exposure));
ok('几何法线未改', raw.fixed.geometryNormalsModified === false);
ok('渲染后端如实标注为 SwiftShader', /SwiftShader/.test(raw.fixed.rendererBackend), raw.fixed.rendererBackend);

console.log('\n=== 7. 复跑确定性 ===');
if (fs.existsSync(REPEAT)) {
  const rep = JSON.parse(fs.readFileSync(REPEAT, 'utf8')).payload;
  const strip = (p) => JSON.stringify({ ...p, generatedAt: null, elapsedMs: null });
  ok('主跑与复跑数值 / 状态 / 指标逐字节一致', strip(raw) === strip(rep));
} else {
  skipped('主跑与复跑逐字节一致', '未找到 results/wheel-end-check.repeat.json，先跑 run-checks.mjs --repeat');
}

console.log('\n=== 汇总 ===');
console.log(`PASS ${pass} / FAIL ${fail} / SKIP ${skip}`);
if (fail) {
  console.log('\n失败项：');
  for (const f of failures) console.log('  - ' + f);
}
console.log(fail === 0 ? 'FINAL_CHECKS_FAIL=0 / RESULT: PASS' : `FINAL_CHECKS_FAIL=${fail} / RESULT: FAIL`);
process.exit(fail === 0 ? 0 : 1);

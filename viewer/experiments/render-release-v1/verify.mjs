// R-30 断言：默认关闭、M 分档恢复、精确回退、幂等、非 PBR 不变、测距/属性/剖切不被破坏、
// 成本不变、截图完整、patch 纪律、两次重跑确定性。
// 运行：node viewer/experiments/render-release-v1/verify.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, 'results');
const load = (p) => JSON.parse(fs.readFileSync(path.join(HERE, p), 'utf8'));

let fail = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra && !cond ? ' — ' + extra : ''}`);
};
const near = (a, b, eps = 1e-9) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < eps;
const LEGACY = { metalness: 0.70, roughness: 0.34, envMapIntensity: 1.05 };
const STATE_KEYS = ['none', 'selectExplode', 'selectClip'];
const VIEW_KEYS = ['iso', 'side'];
const FLAGS = ['off', 'on'];

const summary = load('results/release-check.json');
const patch = load('patch-candidate.json');
const raw = summary.payload;
const frames = raw.frames;

console.log('=== 1. 结构 ===');
ok('共 12 帧（3 状态 × 2 机位 × 2 flag）', frames.length === 12, String(frames.length));
for (const st of STATE_KEYS) for (const vd of VIEW_KEYS) for (const fl of FLAGS) {
  const f = frames.find((x) => x.state === st && x.view === vd && x.flag === fl);
  ok(`${fl}/${st}/${vd} 存在`, !!f);
}
ok('12 张 PNG 均存在且非空', Object.values(summary.shots).length === 12 && Object.values(summary.shots).every((p) => {
  const f = path.join(HERE, p);
  return fs.existsSync(f) && fs.statSync(f).size > 1024;
}));
ok('每帧都记录了 stateRows 与 clipBounds', frames.every((f) => Array.isArray(f.stateRows) && f.clipBounds));
ok('渲染后端如实标注 SwiftShader', raw.fixed.rendererBackend.includes('SwiftShader'));

console.log('\n=== 2. 默认关闭（生产行为不变） ===');
ok('defaultEnabled=false', raw.flag.defaultEnabled === false);
ok('offStatus.enabled=false', raw.flag.offStatus.enabled === false);
ok('off 时逐材质等于生产旧值 0.70/0.34/1.05',
  raw.flag.snapshotOff.length === 3 && raw.flag.snapshotOff.every((r) =>
    near(r.metalness, LEGACY.metalness) && near(r.roughness, LEGACY.roughness) && near(r.envMapIntensity, LEGACY.envMapIntensity)));
ok('off 时 PBR 分档只有 1 种', raw.flag.histogramOff.distinct === 1);
ok('legacySource 指向 viewport.js:166-167', raw.flag.offStatus.legacySource === 'workbench-v2/viewport.js:166-167');
ok('生产文件未修改', raw.fixed.productionFileModified === false);
ok('fixed 里声明了 Composer 文件锁', String(raw.fixed.fileLock).includes('composer'));

console.log('\n=== 3. 开启后恢复 GLB 原生分档 ===');
const native = raw.glb.nativePbr;
const expected = {};
for (const [partKey, values] of Object.entries(native)) {
  for (const v of values) {
    const key = `${+v.metalness.toFixed(4)}/${+v.roughness.toFixed(4)}`;
    expected[key] = (expected[key] || 0) + 1;
  }
}
const expectedSorted = Object.fromEntries(Object.entries(expected).sort());
ok('on 的分档桶与 GLB 原生 PBR 完全一致',
  JSON.stringify(raw.flag.histogramOn.buckets) === JSON.stringify(expectedSorted),
  JSON.stringify(raw.flag.histogramOn.buckets) + ' vs ' + JSON.stringify(expectedSorted));
ok('on 分档 ≥3 种', raw.flag.histogramOn.distinct >= 3);
ok('on 时逐材质等于 GLB 原生值',
  raw.flag.snapshotOn.every((r) => {
    const values = native[r.partKey];
    const v = values?.[r.index];
    return v && near(r.metalness, +v.metalness.toFixed(4), 1e-6) && near(r.roughness, +v.roughness.toFixed(4), 1e-6);
  }));
ok('M 不改 envMapIntensity（仍为 1.05）',
  raw.flag.snapshotOn.every((r) => near(r.envMapIntensity, LEGACY.envMapIntensity)));

console.log('\n=== 4. 回退与幂等 ===');
ok('第一次 disable 精确回退（无违规）', raw.flag.rollback.ok === true && raw.flag.rollback.violations.length === 0);
ok('最终 disable 仍精确回退', raw.flag.finalRollback.ok === true);
ok('回退后逐材质等于旧值',
  raw.flag.snapshotRollback.every((r) =>
    near(r.metalness, LEGACY.metalness) && near(r.roughness, LEGACY.roughness) && near(r.envMapIntensity, LEGACY.envMapIntensity)));
ok('on→off→on 与首次 on 完全一致（幂等）', raw.flag.idempotent.ok === true);
ok('切换次数与流程一致（on, off, on, off = 4）', raw.flag.switches === 4, String(raw.flag.switches));

console.log('\n=== 5. 非 PBR 字段不受影响 ===');
ok('off 与 on 在全部 6 个 state/view 的非 PBR 字段逐字节相同', raw.flag.nonPbrStable === true);
for (const st of STATE_KEYS) for (const vd of VIEW_KEYS) {
  const a = frames.find((f) => f.flag === 'off' && f.state === st && f.view === vd);
  const b = frames.find((f) => f.flag === 'on' && f.state === st && f.view === vd);
  ok(`${st}/${vd} stateRows 相同`, JSON.stringify(a.stateRows) === JSON.stringify(b.stateRows));
}
ok('none 状态无选中高亮', frames.find((f) => f.state === 'none').stateRows.every((r) => r.emissive === '000000'));
ok('selectExplode 有选中高亮', frames.find((f) => f.state === 'selectExplode').stateRows.some((r) => r.emissive !== '000000'));
ok('selectClip 启用了剖切（clippingPlanes=1）', frames.find((f) => f.state === 'selectClip').stateRows.every((r) => r.clippingPlanes === 1));
ok('none 未启用剖切', frames.find((f) => f.state === 'none').stateRows.every((r) => r.clippingPlanes === 0));

console.log('\n=== 6. 测距 / 属性 / 剖切未被破坏 ===');
ok('真实 MeasureTool 在 off/on 下距离完全相同', raw.measure.sameDistance === true,
  `${raw.measure.off.distanceM} vs ${raw.measure.on.distanceM}`);
ok('格式化读数相同', raw.measure.sameFormatted === true,
  `${raw.measure.off.formatted} vs ${raw.measure.on.formatted}`);
ok('测距确实命中两个不同零件实例',
  raw.measure.off.ok && raw.measure.off.pointCount === 2 && new Set(raw.measure.off.hitInstanceIds).size === 2,
  JSON.stringify(raw.measure.off.hitInstanceIds));
for (const st of STATE_KEYS) for (const vd of VIEW_KEYS) {
  const a = frames.find((f) => f.flag === 'off' && f.state === st && f.view === vd);
  const b = frames.find((f) => f.flag === 'on' && f.state === st && f.view === vd);
  ok(`${st}/${vd} clipBounds 相同`, JSON.stringify(a.clipBounds) === JSON.stringify(b.clipBounds));
  ok(`${st}/${vd} draw-call / 三角形相同`,
    a.renderInfo.calls === b.renderInfo.calls && a.renderInfo.triangles === b.renderInfo.triangles);
}

console.log('\n=== 7. 成本与截图完整性 ===');
ok('所有帧 calls 一致', new Set(frames.map((f) => f.renderInfo.calls)).size === 1,
  JSON.stringify([...new Set(frames.map((f) => f.renderInfo.calls))]));
ok('所有帧 triangles 一致', new Set(frames.map((f) => f.renderInfo.triangles)).size === 1);
ok('所有帧 geometries / textures 一致',
  new Set(frames.map((f) => `${f.renderInfo.geometries}/${f.renderInfo.textures}`)).size === 1);
ok('preserveDrawingBuffer 生效且无空白帧',
  raw.integrity.preserveDrawingBuffer === true && raw.integrity.emptyFrameDetected === false &&
  raw.integrity.backgroundSamples.length === 12 &&
  raw.integrity.backgroundSamples.every((s) => s.rgba[0] + s.rgba[1] + s.rgba[2] >= 30));

console.log('\n=== 8. patch 纪律 ===');
ok('status=PROPOSAL_NOT_APPLIED', patch.status === 'PROPOSAL_NOT_APPLIED');
ok('policy=FEATURE_FLAG_DEFAULT_OFF', patch.policy === 'FEATURE_FLAG_DEFAULT_OFF');
ok('defaultEnabled=false', patch.defaultEnabled === false);
ok('刻意未改生产文件', patch.productionFileModified === false);
ok('owner 为 composer-2-5（不抢主 UI 文件）', patch.owner === 'composer-2-5');
ok('注入步骤恰好 2 步且都是新增行',
  patch.steps.length === 2 && patch.steps.every((s) => s.code.trim().endsWith(';') && !s.code.includes('-')) &&
  patch.steps[0].code === 'this.mPbrFlag = null;' &&
  patch.steps[1].code === 'if (this.mPbrFlag) this.mPbrFlag.reapply();');
ok('adapter 搬迁保持内容不变', patch.adapterFiles.length === 2 && patch.adapterFiles.every((f) => f.contentUnchanged === true));
ok('给出三种回退方式', patch.rollback.length === 3 && patch.rollback.some((r) => r.includes('flag.disable()')));
ok('只做 M，不调曝光/灯光/地面', patch.scope.includes('仅 M 单变量') && patch.scope.includes('不调曝光'));
ok('caveats 含 VISUAL_ASSUMPTION / SwiftShader / 不自行合入',
  patch.caveats.some((c) => c.includes('VISUAL_ASSUMPTION')) &&
  patch.caveats.some((c) => c.includes('SwiftShader')) &&
  patch.caveats.some((c) => c.includes('不自行合入')));
ok('evidence 如实记录默认关闭与回退结果',
  patch.evidence.defaultEnabled === false && patch.evidence.rollbackOk === true && patch.evidence.finalRollbackOk === true);
ok('evidence 记录测距一致与成本不变',
  patch.evidence.measureSameDistance === true && patch.evidence.costUnchanged === true);

console.log('\n=== 9. 两次重跑确定性 ===');
const repeatPath = path.join(RESULTS, 'release-check.repeat.json');
if (!fs.existsSync(repeatPath)) {
  console.log('SKIP  未找到 results/release-check.repeat.json（用 --repeat 复跑后自动启用）');
} else {
  const repeat = JSON.parse(fs.readFileSync(repeatPath, 'utf8')).payload;
  const pick = (p) => JSON.stringify({
    glb: p.glb,
    flag: {
      histogramOff: p.flag.histogramOff, histogramOn: p.flag.histogramOn,
      snapshotOff: p.flag.snapshotOff, snapshotOn: p.flag.snapshotOn, snapshotRollback: p.flag.snapshotRollback,
      rollback: p.flag.rollback, finalRollback: p.flag.finalRollback,
      idempotent: p.flag.idempotent, nonPbrStable: p.flag.nonPbrStable, switches: p.flag.switches
    },
    measure: p.measure,
    frames: p.frames,
    integrity: p.integrity
  });
  ok('主跑与复跑所有数值/状态/指标逐字节一致', pick(raw) === pick(repeat));
}

console.log(`\nFINAL_CHECKS_FAIL=${fail} / RESULT: ${fail === 0 ? 'PASS' : 'FAIL'}`);
process.exit(fail === 0 ? 0 : 1);

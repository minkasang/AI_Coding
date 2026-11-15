// R-24 A/B 驱动：复用 5173 同源服务，跑 b/M/G/H/S/all 六配置 × 双场景 × 双视角，
// 并做 6 组负面回归；输出可重跑数据、PNG、对照表与逐变量最小 patch 候选。
//
// 复现：
//   node viewer/experiments/render-staging-v1/run-ab.mjs
//   R24_TAG=repeat node viewer/experiments/render-staging-v1/run-ab.mjs   # 确定性复跑
//   R24_ONLY=m node viewer/experiments/render-staging-v1/run-ab.mjs       # 单配置冒烟
// 若 5173 未运行，临时启停根 server.mjs；不新增任何常驻端口。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '../../..');
const TAG = process.env.R24_TAG || '';
const RESULTS = path.join(HERE, 'results', TAG ? TAG : '.');
const PORT = Number(process.env.CARLAB_PORT) || 5173;
const BASE = `http://127.0.0.1:${PORT}`;
const PAGE = '/viewer/experiments/render-staging-v1/index.html';
const TMP = 'F:/tmp/r24-chrome';
const ONLY = process.env.R24_ONLY || '';
const BUDGET = '30000';

const CASES = [
  { id: 'b', qs: 'm=0&g=0&h=0&s=0', vars: { m: 0, g: 0, h: 0, s: 0 }, combination: false },
  { id: 'm', qs: 'm=1&g=0&h=0&s=0', vars: { m: 1, g: 0, h: 0, s: 0 }, combination: false },
  { id: 'g', qs: 'm=0&g=1&h=0&s=0', vars: { m: 0, g: 1, h: 0, s: 0 }, combination: false },
  { id: 'h', qs: 'm=0&g=0&h=1&s=0', vars: { m: 0, g: 0, h: 1, s: 0 }, combination: false },
  { id: 's', qs: 'm=0&g=0&h=0&s=1', vars: { m: 0, g: 0, h: 0, s: 1 }, combination: false },
  { id: 'all', qs: 'all=1', vars: { m: 1, g: 1, h: 1, s: 1 }, combination: true }
].filter((c) => !ONLY || c.id === ONLY);

const NEGATIVES = [
  { id: 'bad-m', qs: 'm=9', expect: '非法 m', desc: '非法变量值不得静默回退基线' },
  { id: 'bad-g', qs: 'g=2', expect: '非法 g', desc: '非法变量值不得静默回退基线' },
  { id: 'bad-combination', qs: 'm=1&g=1', expect: '违反一轮一个变量', desc: '未标记 all 的多变量组合必须被拒绝' },
  { id: 'hardcoded-ground', qs: 'groundPolicy=hardcoded', expect: '拒绝写死地面', desc: '禁止复用 R-19 写死的 -0.043 常量' },
  { id: 'bad-unit', qs: 'unit=mm', expect: '米', desc: '生产 viewport.load() 必须拒绝非米 GLB' },
  { id: 'missing-glb', qs: 'asset=/viewer/experiments/engineering-viewer/assets/__missing__.glb', expect: 'GLB', desc: '缺失资产必须显式失败' }
];

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].filter(Boolean).find((p) => fs.existsSync(p));
if (!CHROME) { console.error('FATAL: 未找到 chrome.exe'); process.exit(2); }
if (!CASES.length) { console.error('FATAL: R24_ONLY 未匹配任何 case'); process.exit(2); }

fs.mkdirSync(RESULTS, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

function probe() {
  return new Promise((resolve) => {
    const req = http.get(BASE + '/', (r) => { r.resume(); resolve(r.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}
async function ensureServer() {
  if (await probe()) { console.log(`[R-24] 复用已运行的 5173 同源服务 ${BASE}`); return null; }
  console.log('[R-24] 5173 未运行，临时启动根 server.mjs（本次结束后自动关闭）');
  const srv = spawn(process.execPath, [path.join(PROJECT, 'server.mjs')], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, cwd: PROJECT
  });
  let err = '';
  srv.stderr.on('data', (b) => { err += b.toString(); });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('临时服务启动超时 ' + err)), 10000);
    srv.stdout.on('data', (b) => {
      if (b.toString().includes('已启动')) { clearTimeout(t); resolve(); }
    });
    srv.on('exit', (c) => { clearTimeout(t); reject(new Error('临时服务退出 ' + c + ' ' + err)); });
  });
  if (!(await probe())) throw new Error('临时服务已启动但 HTTP 探测失败');
  return srv;
}

const chromeBase = [
  '--headless=new', '--disable-gpu-sandbox', '--no-first-run',
  '--no-default-browser-check', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--hide-scrollbars',
  '--window-size=1280,800', '--virtual-time-budget=' + BUDGET,
  '--force-device-scale-factor=1'
];
function dumpDom(qs, tag) {
  return execFileSync(CHROME, [
    ...chromeBase,
    `--user-data-dir=${TMP}/${tag}`,
    `--disk-cache-dir=${TMP}/cache-${tag}`,
    '--dump-dom', `${BASE}${PAGE}?${qs}&clean=1`
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 300000, windowsHide: true });
}
function extract(dom) {
  const m = dom.match(/__R24_JSON_BEGIN__([\s\S]*?)__R24_JSON_END__/);
  if (!m) throw new Error('DOM 中无 __R24_JSON_BEGIN__：' + dom.slice(0, 400));
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"));
}

const num = (v, d = 4) => typeof v === 'number' ? v.toFixed(d) : '—';
const delta = (a, b, d = 4) => typeof a === 'number' && typeof b === 'number' ? +(a - b).toFixed(d) : null;

function frameOf(raw, scene, viewName) {
  return raw.frames.find((f) => f.scene === scene && f.view === viewName);
}

function metricSet(raw) {
  const iso = frameOf(raw, 'explode', 'iso');
  const side = frameOf(raw, 'explode', 'side');
  const singleIso = frameOf(raw, 'single', 'iso');
  const clipIso = frameOf(raw, 'clip', 'iso');
  return {
    isoNearWhiteRatio: iso?.model.nearWhiteRatio ?? null,
    isoHighlightRatio: iso?.model.highlightRatio ?? null,
    isoMeanLuma: iso?.model.meanLuma ?? null,
    isoLumaStdDev: iso?.model.lumaStdDev ?? null,
    isoEdgeGradient: iso?.model.edgeGradient ?? null,
    isoClippedRatio: iso?.model.clippedRatio ?? null,
    sideMinLuma: side?.contact.minLuma ?? null,
    sideCenterEdgeRatio: side?.contact.centerEdgeRatio ?? null,
    singleIsoNearWhiteRatio: singleIso?.model.nearWhiteRatio ?? null,
    singleIsoMeanLuma: singleIso?.model.meanLuma ?? null,
    clipIsoNearWhiteRatio: clipIso?.model.nearWhiteRatio ?? null,
    sideContactGroundMinLuma: side?.contactGround.minLuma ?? null,
    sideContactGroundRectY: side?.roi.contactGround.y ?? null
  };
}

function costOf(raw) {
  const f = frameOf(raw, 'explode', 'iso');
  return {
    calls: f?.renderInfo.calls ?? null,
    triangles: f?.renderInfo.triangles ?? null,
    geometries: f?.renderInfo.geometries ?? null,
    textures: f?.renderInfo.textures ?? null,
    asset: raw.assetCost
  };
}

function buildPatch(cases, base, negatives) {
  const byId = Object.fromEntries(cases.map((c) => [c.raw.case, c]));
  const b = byId.b;
  const stepDefs = [
    {
      variable: 'M', order: 1, parameter: 'materialOverride',
      source: 'workbench-v2/viewport.js:163-170',
      baseline: { mode: 'V2_UNIFORM_OVERRIDE', metalness: 0.70, roughness: 0.34 },
      proposed: { mode: 'GLB_NATIVE_PBR', action: '不覆盖 mat.metalness / mat.roughness，保留 GLB 自带分档' },
      evidenceLevel: 'GLB_BINARY_EVIDENCE + VISUAL_ASSUMPTION'
    },
    {
      variable: 'G', order: 2, parameter: 'groundY / gridY',
      source: 'workbench-v2/viewport.js:46,56',
      baseline: { groundY: -0.096, gridY: -0.095, policy: 'FIXED_CONSTANT' },
      proposed: { policy: 'GLB_BOUNDS_DERIVED', clearanceM: 0.001 },
      evidenceLevel: 'GLB_GEOMETRY_MEASURED + VISUAL_ASSUMPTION'
    },
    {
      variable: 'H', order: 3, parameter: 'hemiIntensity',
      source: 'workbench-v2/viewport.js:33',
      baseline: 0.9, proposed: 0.45,
      evidenceLevel: 'VISUAL_ASSUMPTION'
    },
    {
      variable: 'S', order: 4, parameter: 'sunIntensity',
      source: 'workbench-v2/viewport.js:34',
      baseline: 2.0, proposed: 2.4,
      evidenceLevel: 'VISUAL_ASSUMPTION'
    }
  ];
  const steps = stepDefs.map((d) => {
    const c = byId[d.variable.toLowerCase()];
    const m = c ? c.metrics : null;
    const bm = b ? b.metrics : null;
    const metricDelta = m && bm ? {
      isoNearWhiteRatio: delta(m.isoNearWhiteRatio, bm.isoNearWhiteRatio, 6),
      isoLumaStdDev: delta(m.isoLumaStdDev, bm.isoLumaStdDev, 3),
      isoEdgeGradient: delta(m.isoEdgeGradient, bm.isoEdgeGradient, 4),
      sideMinLuma: delta(m.sideMinLuma, bm.sideMinLuma, 2),
      sideContactGroundMinLuma: delta(m.sideContactGroundMinLuma, bm.sideContactGroundMinLuma, 2),
      sideContactGroundRectY: delta(m.sideContactGroundRectY, bm.sideContactGroundRectY, 2)
    } : null;
    const adverse = metricDelta ? {
      nearWhiteRatioIncreased: metricDelta.isoNearWhiteRatio > 0,
      contactDarker: metricDelta.sideMinLuma < 0
    } : null;
    const cost = c ? c.cost : null;
    const costDelta = cost && b ? {
      calls: cost.calls - b.cost.calls,
      triangles: cost.triangles - b.cost.triangles,
      geometries: cost.geometries - b.cost.geometries,
      textures: cost.textures - b.cost.textures
    } : null;
    return {
      ...d,
      changeCount: d.variable === 'G' ? 2 : 1,
      note: d.variable === 'G'
        ? 'groundY 与 gridY 必须成对由同一 bounds 推导；本轮作为「一个接地变量」而非两个独立变量'
        : '单参数单变量',
      metricDelta,
      adverse,
      costDelta,
      status: 'PROPOSAL_NOT_APPLIED',
      recommendation: d.variable === 'M'
        ? '优先单独在 V2 真实 UI 状态复核：数值来自项目自身 GLB 二进制，且几何/纹理/draw-call 成本不变'
        : d.variable === 'G'
          ? '可单独复核，但必须保留 bounds 推导逻辑，禁止把实测值写成常量；换 GLB 后须重算'
          : '纯视觉假设，须在真实 GPU 与 5173 工作台复测后再议，不建议单独先上'
    };
  });

  // ---- 可分离性分析：四个单变量之和 vs 组合反例，判断「整包」是否真有额外增益。
  // 这是 R-24 相对 R-19 的核心增量：R-19 只知道不能整包合入，本轮量化出收益来自谁、代价来自谁。
  const singleIds = ['m', 'g', 'h', 's'];
  const metricKeys = ['isoNearWhiteRatio', 'isoLumaStdDev', 'isoEdgeGradient',
    'sideMinLuma', 'sideContactGroundMinLuma'];
  const separability = {};
  if (b && byId.all && singleIds.every((id) => byId[id])) {
    for (const key of metricKeys) {
      const bv = b.metrics[key];
      const singles = singleIds.map((id) => ({ id, delta: delta(byId[id].metrics[key], bv, 6) }));
      const sumOfSingles = +singles.reduce((a, x) => a + (x.delta ?? 0), 0).toFixed(6);
      const combined = delta(byId.all.metrics[key], bv, 6);
      const interaction = +(combined - sumOfSingles).toFixed(6);
      separability[key] = {
        baseline: bv, singles, sumOfSingles, combined, interaction,
        relativeInteraction: combined !== 0 ? +(Math.abs(interaction / combined)).toFixed(4) : null
      };
    }
  }
  const contrast = separability.isoLumaStdDev;
  const nw = separability.isoNearWhiteRatio;
  const mContrastShare = contrast?.combined ? +(contrast.singles[0].delta / contrast.combined).toFixed(4) : null;
  const mNearWhiteShare = nw?.combined ? +(nw.singles[0].delta / nw.combined).toFixed(4) : null;
  const brightnessAdditive = !!contrast && !!nw &&
    contrast.relativeInteraction < 0.25 && nw.relativeInteraction < 0.25;

  const allCase = byId.all;
  const combinationNegative = allCase && b ? {
    id: 'all',
    description: '四变量一次性全开的组合反例；用于复现 R-19「不能整包无条件合入」的负面信号',
    isoNearWhiteRatio: {
      baseline: b.metrics.isoNearWhiteRatio,
      combined: allCase.metrics.isoNearWhiteRatio,
      delta: delta(allCase.metrics.isoNearWhiteRatio, b.metrics.isoNearWhiteRatio, 6)
    },
    isoLumaStdDev: {
      baseline: b.metrics.isoLumaStdDev,
      combined: allCase.metrics.isoLumaStdDev,
      delta: delta(allCase.metrics.isoLumaStdDev, b.metrics.isoLumaStdDev, 3)
    },
    sideContactGroundRectY: {
      baseline: b.metrics.sideContactGroundRectY,
      combined: allCase.metrics.sideContactGroundRectY,
      delta: delta(allCase.metrics.sideContactGroundRectY, b.metrics.sideContactGroundRectY, 2),
      note: '地面投影条带的 y 位置；G 变量把地面抬到 GLB 最低点附近时会明显上移'
    },
    verdict: allCase.metrics.isoNearWhiteRatio > b.metrics.isoNearWhiteRatio
      ? '组合后近白像素比上升，整包合入存在发白风险，不予推荐'
      : '组合后近白像素比未上升，但仍不构成整包合入依据（L 类多参数贡献未分离）'
  } : null;

  return {
    schemaVersion: 'carlab.r24.patchCandidate/1.0',
    status: 'PROPOSAL_NOT_APPLIED',
    target: 'workbench-v2/viewport.js',
    policy: 'ONE_VARIABLE_PER_STEP',
    requiresApproval: ['gpt-6', 'composer-2-5'],
    generatedAt: new Date().toISOString(),
    measuredOn: 'headless Chrome + SwiftShader 软件光栅化；无真实 GPU FPS / 帧时间 / 显存数据',
    productionFileModified: false,
    groundDerivation: b ? b.raw.groundDerived : null,
    steps,
    separabilityAnalysis: {
      method: '四个单变量相对基线的增量之和，与 all 组合反例的实际增量对比；差值记为交互项',
      metrics: separability,
      brightnessMetricsApproximatelyAdditive: brightnessAdditive,
      mShareOfCombinedContrastGain: mContrastShare,
      mShareOfCombinedNearWhiteCost: mNearWhiteShare,
      conclusion: brightnessAdditive
        ? `亮度类指标近似线性可加（交互项占比 <25%），四变量同时开启没有额外增益。对比度改善的 ${(mContrastShare * 100).toFixed(1)}% 来自 M 单变量，而组合的近白上升是 M 单变量的 ${(1 / mNearWhiteShare).toFixed(1)} 倍。因此推荐只按 M 小步推进，G 单独复核接地，H/S 暂不采用。接地类指标存在交互（M 改变阴影强度 × G 改变阴影位置），不可简单相加。`
        : '亮度类指标交互项较大，不能认定变量贡献可分离；需进一步拆分实验，本轮不给出单变量优先建议。'
    },
    combinationNegative,
    negativeChecks: negatives.map((n) => ({ id: n.id, expect: n.expect, rejected: n.rejected, desc: n.desc })),
    caveats: [
      '所有 proposed 数值为 VISUAL_ASSUMPTION，不是厂商材料、OEM 尺寸或计量认证',
      'M 的 PBR 数值取自项目自身 GLB，仍属 DEMO 材质，不构成真实材料证据',
      'G 的 groundY/gridY 必须由 Box3 实测 bounds 推导，换资产后重算，不得写死 -0.043 或本轮实测值；本轮实测值恰好也等于 -0.043（Δ=0），但这是数值巧合而非复用常量，verify.mjs 用换资产敏感性反例证明推导会随 GLB 变化',
      'H/S 只改灯光强度，未分离 PMREM 环境、曝光与 fill 的贡献',
      'nearWhiteRatio 受浅色背景(#eef3f8 约 luma 242)污染，不能单独作为过曝判据',
      '本轮不改几何法线（R-14 已记录 toCreasedNormals 成本）',
      'SwiftShader 只支持像素级可复验截图与 renderer.info 计数，不能声称 RTX 5060 或真实 GPU 性能'
    ]
  };
}

async function main() {
  // 只由已保存的 run-summary.json 重建 patch，不重跑 Chrome：保证补丁可重复生成。
  if (process.env.R24_PATCH_ONLY === '1') {
    const s = JSON.parse(fs.readFileSync(path.join(HERE, 'results', 'run-summary.json'), 'utf8'));
    const cases = s.cases.map((c) => ({
      id: c.id, metrics: c.metrics, cost: c.cost,
      raw: { case: c.id, frames: c.data.frames, groundDerived: c.data.groundDerived }
    }));
    const rebuilt = buildPatch(cases, cases.find((c) => c.id === 'b'), s.negatives);
    fs.writeFileSync(path.join(HERE, 'patch-candidate.json'), JSON.stringify(rebuilt, null, 2) + '\n');
    console.log('[R-24] PATCH_ONLY：已由 results/run-summary.json 重建 patch-candidate.json（未重跑 Chrome）');
    console.log(rebuilt.separabilityAnalysis.conclusion);
    return;
  }
  const srv = await ensureServer();
  const cases = [];
  try {
    for (const c of CASES) {
      const tag = `${TAG ? TAG + '-' : ''}case-${c.id}`;
      const raw = extract(dumpDom(c.qs, tag));
      if (raw.rejected || raw.error) throw new Error(`${c.id} 被拒绝: ${raw.error}`);
      if (!Array.isArray(raw.frames) || raw.frames.length !== 6) {
        throw new Error(`${c.id} 帧数不是 6（3 场景 × 2 视角），实际 ${raw.frames?.length}`);
      }
      const shots = {};
      for (const f of raw.frames) {
        if (!f.png) throw new Error(`${c.id}/${f.scene}/${f.view} 无截图数据`);
        const name = `shot-${TAG ? TAG + '-' : ''}${c.id}-${f.scene}-${f.view}.png`;
        fs.writeFileSync(path.join(RESULTS, name), Buffer.from(f.png, 'base64'));
        shots[`${f.scene}-${f.view}`] = `results/${TAG ? TAG + '/' : ''}${name}`;
      }
      const frames = raw.frames.map(({ png, ...rest }) => rest);
      cases.push({
        id: c.id, qs: c.qs, vars: c.vars, combination: c.combination,
        shots, metrics: metricSet(raw), cost: costOf(raw),
        raw: { ...raw, frames },
        caseData: {
          case: raw.case, cfg: raw.cfg, appliedConfig: raw.appliedConfig,
          fixed: raw.fixed, glb: raw.glb, groundDerived: raw.groundDerived,
          assetCost: raw.assetCost, scenes: raw.scenes, views: raw.views,
          states: raw.states, frames, integrity: raw.integrity,
          measuredAt: raw.measuredAt
        }
      });
      console.log(`[R-24] ${c.id.padEnd(4)} 完成：6 帧 | iso近白 ${num(cases.at(-1).metrics.isoNearWhiteRatio, 6)} | side最小亮度 ${num(cases.at(-1).metrics.sideMinLuma, 2)} | groundY ${num(cases.at(-1).caseData.appliedConfig.groundY, 3)}`);
    }

    // ---- 负面回归
    const negatives = [];
    for (const n of NEGATIVES) {
      const tag = `${TAG ? TAG + '-' : ''}neg-${n.id}`;
      const raw = extract(dumpDom(n.qs, tag));
      const rejected = raw.rejected === true;
      const matched = rejected && String(raw.error).includes(n.expect);
      negatives.push({ ...n, rejected, matched, error: raw.error || null });
      console.log(`[R-24] 负面 ${n.id.padEnd(18)} rejected=${rejected} matched=${matched}`);
    }

    const summary = {
      schemaVersion: 'carlab.r24.runSummary/1.0',
      tag: TAG || 'main',
      generatedAt: new Date().toISOString(),
      server: { base: BASE, reusedExisting: !srv, constantPortsOnly: true },
      chrome: { headless: true, backend: 'SwiftShader', budgetMs: Number(BUDGET) },
      caseOrder: CASES.map((c) => c.id),
      cases: cases.map((c) => ({
        id: c.id, qs: c.qs, vars: c.vars, combination: c.combination,
        shots: c.shots, metrics: c.metrics, cost: c.cost,
        data: c.caseData
      })),
      negatives
    };
    const summaryName = TAG ? `run-summary.${TAG}.json` : 'run-summary.json';
    fs.writeFileSync(path.join(HERE, 'results', summaryName), JSON.stringify(summary, null, 2) + '\n');
    fs.writeFileSync(path.join(RESULTS, 'negatives.json'), JSON.stringify(negatives, null, 2) + '\n');

    const bCase = cases.find((c) => c.id === 'b');
    const patch = buildPatch(cases, bCase, negatives);
    if (!TAG) {
      fs.writeFileSync(path.join(HERE, 'patch-candidate.json'), JSON.stringify(patch, null, 2) + '\n');
    }

    // ---- 控制台对照表
    console.log('\n=== R-24 对照表（explode/iso 为亮度口径，explode/side 为接地面口径）===');
    console.log('case  iso近白    iso对比度  iso边缘梯度  side最小亮度  地面接触带min  groundY   calls  triangles');
    for (const c of cases) {
      console.log(`${c.id.padEnd(5)} ${num(c.metrics.isoNearWhiteRatio, 6)}  ${num(c.metrics.isoLumaStdDev, 3).padStart(8)}  ${num(c.metrics.isoEdgeGradient, 4).padStart(11)}  ${num(c.metrics.sideMinLuma, 2).padStart(12)}  ${num(c.metrics.sideContactGroundMinLuma, 2).padStart(14)}  ${num(c.caseData.appliedConfig.groundY, 3).padStart(7)}  ${String(c.cost.calls).padStart(5)}  ${String(c.cost.triangles).padStart(9)}`);
    }
    if (patch.combinationNegative) {
      console.log(`\n组合反例 all：iso近白 ${num(patch.combinationNegative.isoNearWhiteRatio.baseline, 6)} → ${num(patch.combinationNegative.isoNearWhiteRatio.combined, 6)}（Δ ${patch.combinationNegative.isoNearWhiteRatio.delta}）`);
      console.log(patch.combinationNegative.verdict);
    }
    console.log(`\n输出：results/${summaryName}、results/negatives.json、${TAG ? '（复跑不重写 patch）' : 'patch-candidate.json'}、${cases.length * 6} 张 PNG`);
  } finally {
    if (srv) { srv.kill(); console.log('[R-24] 临时 5173 服务已关闭（未留下常驻端口）'); }
  }
}

main().catch((e) => { console.error('[R-24] FATAL: ' + (e.stack || e.message)); process.exit(1); });

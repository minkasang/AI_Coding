// R-19 A/B 驱动：复用 5173 同源资产，跑 2×2 配置 × 3 视角，并做反例回归。
// 复现：node run-ab.mjs    （若 5173 未运行，临时启停根 server.mjs；不新增常驻端口）
// Chrome 用户数据/缓存显式落在 F 盘；不下载任何外部素材。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '../../..');
const RESULTS = path.join(HERE, 'results');
const PORT = Number(process.env.CARLAB_PORT) || 5173;
const BASE = `http://127.0.0.1:${PORT}`;
const PAGE = '/viewer/experiments/render-quality-v2/index.html';
const TMP = 'F:/tmp/r19-chrome';
const ONLY = process.env.R19_ONLY || '';
const CASES = [
  { l: 0, m: 0 }, { l: 1, m: 0 },
  { l: 0, m: 1 }, { l: 1, m: 1 }
].filter((c) => !ONLY || `l${c.l}m${c.m}` === ONLY);
const NEGATIVES = [
  { id: 'bad-l', qs: 'l=9&m=0', expect: '非法 l' },
  { id: 'bad-m', qs: 'l=0&m=2', expect: '非法 m' },
  { id: 'bad-unit', qs: 'l=0&m=0&unit=mm', expect: '必须以米为单位' },
  { id: 'missing-glb', qs: 'l=0&m=0&asset=/viewer/experiments/engineering-viewer/assets/__missing__.glb', expect: 'GLB' }
];
const VIEW_NAMES = ['iso', 'top', 'side'];
const BUDGET = '20000';

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].filter(Boolean).find((p) => fs.existsSync(p));
if (!CHROME) { console.error('FATAL: 未找到 chrome.exe'); process.exit(2); }
if (!CASES.length) { console.error('FATAL: R19_ONLY 未匹配任何 case'); process.exit(2); }

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
  if (await probe()) { console.log(`[R-19] 复用已运行的 5173 同源服务 ${BASE}`); return null; }
  console.log('[R-19] 5173 未运行，临时启动根 server.mjs（本次结束后自动关闭）');
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
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 240000, windowsHide: true });
}
function extract(dom) {
  const m = dom.match(/__R19_JSON_BEGIN__([\s\S]*?)__R19_JSON_END__/);
  if (!m) throw new Error('DOM 中无 __R19_JSON_BEGIN__：' + dom.slice(0, 260));
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"));
}

const num = (v, d = 4) => typeof v === 'number' ? v.toFixed(d) : '—';

async function main() {
  const srv = await ensureServer();
  const cases = [];
  try {
    for (const c of CASES) {
      const id = `l${c.l}m${c.m}`;
      const raw = extract(dumpDom(`l=${c.l}&m=${c.m}`, id));
      if (raw.error) throw new Error(`${id} 页面报错: ${raw.error}`);
      if (!Array.isArray(raw.views) || raw.views.length !== 3)
        throw new Error(`${id} 视角数不是 3`);

      const shots = {};
      for (const v of raw.views) {
        if (!v.png) throw new Error(`${id}/${v.name} 无截图数据`);
        const rel = `results/shot-${id}-${v.name}.png`;
        fs.writeFileSync(path.join(HERE, rel), Buffer.from(v.png, 'base64'));
        shots[v.name] = rel;
      }
      const views = raw.views.map((v) => {
        const { png, ...rest } = v;
        return { ...rest, shot: shots[v.name] };
      });
      cases.push({ case: id, l: c.l, m: c.m, glb: raw.glb,
        appliedConfig: raw.appliedConfig, parts: raw.parts,
        fixed: raw.fixed, views });
      const iso = views.find((v) => v.name === 'iso');
      const side = views.find((v) => v.name === 'side');
      console.log(`[R-19] ${id}: nearWhite=${num(iso.model.nearWhiteRatio, 5)} ` +
        `std=${num(iso.model.lumaStdDev, 2)} grad=${num(iso.model.edgeGradient, 2)} ` +
        `centerEdge=${num(side.contact.centerEdgeRatio)} calls=${iso.renderInfo.calls} tris=${iso.renderInfo.triangles}`);
    }

    // 反例回归：非法输入必须显式拒绝，不能静默回退到基线
    const negatives = [];
    for (const n of NEGATIVES) {
      const raw = extract(dumpDom(n.qs, 'neg-' + n.id));
      const rejected = raw.rejected === true && typeof raw.error === 'string' && raw.error.length > 0;
      negatives.push({ id: n.id, query: n.qs, expect: n.expect,
        rejected, error: raw.error || '(none)' });
      console.log(`[R-19] negative ${n.id}: ${rejected ? 'REJECTED' : 'FAILED-TO-REJECT'} — ${raw.error || '(none)'}`);
    }
    fs.writeFileSync(path.join(RESULTS, 'negative-cases.json'),
      JSON.stringify({ measuredAt: new Date().toISOString(), cases: negatives }, null, 2) + '\n');

    const payload = {
      schemaVersion: 'carlab.r19.ab/1.0',
      measuredAt: new Date().toISOString(),
      environment: {
        chrome: CHROME,
        service: `${BASE} (5173 同源；未新增常驻端口)`,
        page: PAGE,
        viewport: [1280, 800],
        virtualTimeBudgetMs: Number(BUDGET),
        rasterizer: 'Chrome headless --use-angle=swiftshader (SOFTWARE) — 不是真实 GPU',
        userDataDir: TMP + '/<case>',
        externalAssets: 'none — 仅项目自身 GLB + 程序化 RoomEnvironment',
        productionFilesTouched: false
      },
      variables: {
        M: 'm0 = V2 统一覆盖 metalness/roughness；m1 = 恢复 GLB 自带 pbrMetallicRoughness（严格单变量）',
        L: 'l0 = 逐参数复刻 viewport.js；l1 = 光/接地参数配置包（多参数，非单变量）',
        views: VIEW_NAMES
      },
      cases,
      negativeCases: negatives
    };
    fs.writeFileSync(path.join(RESULTS, 'ab-metrics.json'), JSON.stringify(payload, null, 2) + '\n');

    // 对照表（机器生成）
    const rows = [];
    for (const c of cases) for (const v of c.views) {
      rows.push(`| \`${c.case}\` | ${v.name} | ${num(v.model.nearWhiteRatio, 5)} | ` +
        `${num(v.model.highlightRatio, 5)} | ${num(v.model.meanLuma, 1)} | ` +
        `${num(v.model.lumaStdDev, 2)} | ${num(v.model.edgeGradient, 2)} | ` +
        `${num(v.contact.centerEdgeRatio)} | ${num(v.contact.minLuma, 1)} | ` +
        `${v.renderInfo.calls} / ${v.renderInfo.triangles} | [图](./shot-${c.case}-${v.name}.png) |`);
    }
    fs.writeFileSync(path.join(RESULTS, 'ab-summary.md'),
      `# R-19 · 2×2 × 3 视角 A/B 结果（自动生成，勿手改）\n\n` +
      `生成时间：${payload.measuredAt} · 5173 同源 GLB · 1280×800 · SwiftShader 软件光栅化\n\n` +
      `| case | 视角 | 发白比(≥235) | 高光比(≥205) | 均亮 | 亮度标准差 | 边缘梯度 | 接地中心/两侧 | 接触带最暗 | calls/tris | 截图 |\n` +
      `|---|---|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\n` +
      `> 口径见 \`../metrics.js\` 与 \`../README.md\`。\`calls/triangles\` 是绘制统计，**不是 FPS**。\n` +
      `> 亮度作用于 8-bit 显示编码值，未做 sRGB→linear 反变换；只用于组间相对比较。\n` +
      `> 严格纯白裁切比 \`clippedRatio\`（三通道均 ≥250）存于 \`ab-metrics.json\`，本项目实测多为 0，因此对照表改用更敏感的 \`nearWhiteRatio\`。\n`);

    // 可合入 V2 的参数补丁（数字一律取自实跑，不手抄）
    if (cases.length === 4) {
      const a = cases.find((c) => c.case === 'l0m0');
      const d = cases.find((c) => c.case === 'l1m1');
      const LINES = {
        exposure: 'workbench-v2/viewport.js:26',
        hemiIntensity: 'workbench-v2/viewport.js:33',
        sunIntensity: 'workbench-v2/viewport.js:34',
        fillIntensity: 'workbench-v2/viewport.js:42',
        groundColor: 'workbench-v2/viewport.js:53',
        groundOpacity: 'workbench-v2/viewport.js:53',
        groundY: 'workbench-v2/viewport.js:56',
        gridY: 'workbench-v2/viewport.js:46'
      };
      const changes = Object.keys(LINES).map((k) => ({
        parameter: k, source: LINES[k],
        baseline: a.appliedConfig[k], proposed: d.appliedConfig[k],
        evidenceLevel: 'VISUAL_ASSUMPTION',
        note: '视觉参数候选，非厂商光照/材料标准；需真实 GPU 复核'
      }));
      changes.push({
        parameter: 'materialOverride', source: 'workbench-v2/viewport.js:163-170',
        baseline: { mode: 'V2_UNIFORM_OVERRIDE', metalness: 0.70, roughness: 0.34, envMapIntensity: 1.05 },
        proposed: {
          mode: 'GLB_NATIVE_PBR',
          action: '不再用统一数值覆盖 mat.metalness / mat.roughness；保留 GLB 自带分档',
          perPart: a.parts.map((p) => ({
            partKey: p.partKey, nodeMatch: p.nodeMatch,
            metalness: p.glbMaterials[0]?.metalness, roughness: p.glbMaterials[0]?.roughness
          }))
        },
        evidenceLevel: 'GLB_BINARY_EVIDENCE + VISUAL_ASSUMPTION',
        note: '数值取自项目自身 GLB 的 pbrMetallicRoughness，不是厂商认证材料；颜色仍沿用 fixture DEMO 色'
      });
      const g0 = a.views.find((v) => v.name === 'iso');
      const g1 = d.views.find((v) => v.name === 'iso');
      const s0 = a.views.find((v) => v.name === 'side');
      const s1 = d.views.find((v) => v.name === 'side');
      const patch = {
        schemaVersion: 'carlab.r19.patchCandidate/1.0',
        status: 'PROPOSAL_NOT_APPLIED',
        target: 'workbench-v2/viewport.js',
        generatedAt: payload.measuredAt,
        requiresApproval: ['gpt-6', 'composer-2-5'],
        measuredOn: 'SwiftShader 软件光栅化；无真实 GPU FPS/显存数据',
        metricBasis: {
          isoNearWhiteRatio: { baseline: g0.model.nearWhiteRatio, proposed: g1.model.nearWhiteRatio },
          isoLumaStdDev: { baseline: g0.model.lumaStdDev, proposed: g1.model.lumaStdDev },
          isoEdgeGradient: { baseline: g0.model.edgeGradient, proposed: g1.model.edgeGradient },
          isoHighlightRatio: { baseline: g0.model.highlightRatio, proposed: g1.model.highlightRatio },
          sideCenterEdgeRatio: { baseline: s0.contact.centerEdgeRatio, proposed: s1.contact.centerEdgeRatio },
          sideContactMin: { baseline: s0.contact.minLuma, proposed: s1.contact.minLuma }
        },
        adverseFindings: [
          {
            metric: 'iso nearWhiteRatio (luma>=235)',
            baseline: g0.model.nearWhiteRatio, proposed: g1.model.nearWhiteRatio,
            worse: g1.model.nearWhiteRatio > g0.model.nearWhiteRatio,
            interpretation: '该值上升，不能声称「过曝被消除」。同期 highlightRatio(>=205) 下降、lumaStdDev 上升，' +
              '表明亮度分布两极化（高光更集中、中间调变暗），而非整片更白；且模型 ROI 含大面积浅色背景' +
              '(#eef3f8 约 luma 242)，近白像素有相当部分来自背景，此指标不可单独作为过曝判据。'
          },
          {
            metric: 'side centerEdgeRatio (20px 固定条带)',
            baseline: s0.contact.centerEdgeRatio, proposed: s1.contact.centerEdgeRatio,
            improvementSmall: Math.abs(s1.contact.centerEdgeRatio - s0.contact.centerEdgeRatio) < 0.02,
            interpretation: '固定条带口径下改善很小；阴影加深主要由 minLuma 下降与目视截图反映。' +
              '条带按模型最低点投影推导，在 iso/top 视角不一定覆盖阴影核心，接地读数应主要看 side 视角。'
          }
        ],
        recommendation: '不建议无条件全量合入：先按 M（严格单变量）在 V2 真实 UI 状态复核材质层次，' +
          '再按 L 配置包小步复核曝光/接地；所有数值仍为 VISUAL_ASSUMPTION，须真实 GPU 与真实工作台复测。',
        changes,
        caveats: [
          'L 是多参数配置包，不是单变量；内部各参数贡献本轮未分离',
          '未改几何法线（R-14 已记录 toCreasedNormals 1 cm 量化与几何释放成本）',
          'GLB 中 DEMO 材质的 metalness/roughness 不是厂商材料证据',
          'groundY/gridY 对齐是按当前 GLB 包围盒推导；换资产后须重新计算，不能写死'
        ]
      };
      fs.writeFileSync(path.join(HERE, 'patch-candidate.json'), JSON.stringify(patch, null, 2) + '\n');
      console.log('[R-19] 已写 patch-candidate.json');
    }

    console.log(`[R-19] 完成：${cases.length} 组 × 3 视角，${cases.length * 3} 帧截图，${negatives.length} 条反例`);
  } finally {
    if (srv) { srv.kill(); console.log('[R-19] 临时 5173 服务已关闭'); }
  }
}

main().catch((e) => { console.error('[R-19] FATAL:', e.stack || e.message || e); process.exit(1); });

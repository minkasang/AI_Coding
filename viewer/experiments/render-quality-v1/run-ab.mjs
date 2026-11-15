// R-14 A/B 驱动：固定机位跑 2×2 四组，抓指标 JSON + 截图。
// 复现：node run-ab.mjs   （自动启停 5181 隔离服务；生产 5173 不受影响）
// 所有 Chrome 用户数据/缓存显式落在 F 盘，不主动下载任何素材。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, 'results');
const PORT = Number(process.env.R14_PORT) || 5181;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = 'F:/tmp/r14-chrome';
const ONLY = process.env.R14_ONLY || ''; // 冒烟/单组重跑：R14_ONLY=n0g0 node run-ab.mjs
const CASES = [
  { n: 0, g: 0 }, { n: 1, g: 0 },
  { n: 0, g: 1 }, { n: 1, g: 1 }
].filter((c) => !ONLY || `n${c.n}g${c.g}` === ONLY);
if (!CASES.length) { console.error('FATAL: R14_ONLY 未匹配任何 case'); process.exit(2); }
const W = 1280, H = 800;
const BUDGET = '12000';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error('FATAL: 未找到 chrome.exe，请设置 CHROME_PATH');
  process.exit(2);
}

fs.mkdirSync(RESULTS, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

function probe() {
  return new Promise((resolve) => {
    const req = http.get(BASE + '/', (r) => { r.resume(); resolve(r.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(1200, () => { req.destroy(); resolve(false); });
  });
}

async function ensureServer() {
  if (await probe()) { console.log(`[R-14] 复用已运行的 ${BASE}`); return null; }
  console.log(`[R-14] 启动隔离服务 ${BASE}`);
  const srv = spawn(process.execPath, [path.join(HERE, 'server.mjs')], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  let err = '';
  srv.stderr.on('data', (b) => { err += b.toString(); });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('服务启动超时: ' + err)), 10000);
    srv.stdout.on('data', (b) => {
      if (b.toString().includes('[R-14] render-quality-v1')) { clearTimeout(t); resolve(); }
    });
    srv.on('exit', (c) => { clearTimeout(t); reject(new Error('服务退出 code=' + c + ' ' + err)); });
  });
  if (!(await probe())) throw new Error('服务已启动但 HTTP 探测失败');
  return srv;
}

const winPath = (p) => p.replace(/\\/g, '/');
const chromeBase = [
  '--headless=new',
  '--disable-gpu-sandbox',
  '--no-first-run',
  '--no-default-browser-check',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  `--window-size=${W},${H}`,
  `--virtual-time-budget=${BUDGET}`,
  '--force-device-scale-factor=1'
];

function chrome(extra, label) {
  return execFileSync(CHROME, [...chromeBase, ...extra], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: 180000, windowsHide: true
  });
}

function decodeEntities(s) {
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
}

function extractMetrics(dom) {
  const m = dom.match(/__R14_JSON_BEGIN__([\s\S]*?)__R14_JSON_END__/);
  if (!m) throw new Error('DOM 中没有 __R14_JSON_BEGIN__ 标记；title/前 300 字符: ' + dom.slice(0, 300));
  return JSON.parse(decodeEntities(m[1]));
}

function fmt(v, digits = 4) {
  return typeof v === 'number' ? v.toFixed(digits) : String(v);
}

async function main() {
  const srv = await ensureServer();
  const cases = [];
  try {
    for (const c of CASES) {
      const id = `n${c.n}g${c.g}`;
      const url = `${BASE}/?n=${c.n}&g=${c.g}&clean=1`;
      const profile = `${TMP}/${id}`;

      const dom = chrome([
        `--user-data-dir=${profile}-dom`,
        `--disk-cache-dir=${TMP}/cache-${id}-dom`,
        '--dump-dom', url
      ], id + '-dom');
      const metrics = extractMetrics(dom);
      if (metrics.error) throw new Error(`${id} 页面报错: ${metrics.error}`);

      const shot = winPath(path.join(RESULTS, `shot-${id}.png`));
      chrome([
        `--user-data-dir=${profile}-shot`,
        `--disk-cache-dir=${TMP}/cache-${id}-shot`,
        `--screenshot=${shot}`, url
      ], id + '-shot');
      if (!fs.existsSync(shot)) throw new Error(`${id} 截图未生成: ${shot}`);

      cases.push({ case: id, n: c.n, g: c.g, url, shot: `results/shot-${id}.png`, metrics });
      console.log(`[R-14] ${id}: calls=${metrics.renderInfo.calls} tris=${metrics.renderInfo.triangles} ` +
        `uniqueNormals=${metrics.normalsAfter.uniqueNormals} highlight=${fmt(metrics.rim.highlightRatio, 5)} ` +
        `contactAsym=${fmt(metrics.contact.asymmetry, 2)} shot=${fs.statSync(shot).size}B`);
    }
  } finally {
    if (srv) srv.kill();
  }

  const payload = {
    schemaVersion: 'carlab.r14.ab/1.0',
    measuredAt: new Date().toISOString(),
    environment: {
      chrome: CHROME,
      viewport: [W, H],
      virtualTimeBudgetMs: Number(BUDGET),
      rasterizer: 'Chrome headless --use-angle=swiftshader (SOFTWARE) — 不是真实 GPU',
      userDataDir: TMP + '/<case>-{dom,shot}',
      externalAssets: 'none — 无 HDRI / 纹理 / CC0 下载，环境光为程序化 RoomEnvironment',
      productionPageTouched: false
    },
    variables: {
      N: '0 = 生产 computeVertexNormals() 全硬面法线；1 = toCreasedNormals(35°)，仅改法线',
      G: '0 = 程序化径向渐变假 AO 贴片、地面不接收阴影；1 = 无贴片、地面接收真实 PCF 软阴影'
    },
    cases
  };
  fs.writeFileSync(path.join(RESULTS, 'ab-metrics.json'), JSON.stringify(payload, null, 2) + '\n');

  // 自动生成对照表，避免手写数字抄错
  const rows = cases.map((c) => {
    const m = c.metrics;
    return `| \`${c.case}\` | ${c.n} | ${c.g} | ${m.renderInfo.calls} | ${m.renderInfo.triangles} | ` +
      `${m.normalsBefore.uniqueNormals} → ${m.normalsAfter.uniqueNormals} | ` +
      `${fmt(m.rim.highlightRatio, 5)} | ${fmt(m.rim.edgeGradient, 3)} | ` +
      `${fmt(m.contact.asymmetry, 2)} | ${fmt(m.contact.centerEdgeRatio, 4)} | ` +
      `[截图](./shot-${c.case}.png) |`;
  });
  const summary = `# R-14 · 2×2 A/B 结果（自动生成，勿手改）\n\n` +
    `生成时间：${payload.measuredAt} · 视口 ${W}×${H} · 软件光栅化（SwiftShader）\n\n` +
    `| case | N | G | calls | triangles | 唯一法线(前→后) | 高光占比 | 边缘梯度 | 接地左右不对称 | 中心/两侧亮度比 | 截图 |\n` +
    `|---|---|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\n` +
    `> 口径见 \`../metrics.js\` 顶部注释与 \`../README.md\`。\`calls/triangles\` 是 \`renderer.info\` 的**绘制统计**，不是 FPS。\n` +
    `> \`高光占比\` = 轮辋 ROI 内显示编码亮度 ≥205 的像素比例；\`边缘梯度\` = ROI 内相邻像素亮度差均值；\n` +
    `> \`接地左右不对称\` = 接触带左 1/3 与右 1/3 平均亮度之差（正值表示左侧更亮）；\`中心/两侧亮度比\` < 1 表示接触中心更暗。\n`;
  fs.writeFileSync(path.join(RESULTS, 'ab-summary.md'), summary);

  console.log(`[R-14] 已写 results/ab-metrics.json (${cases.length} 组) 与 results/ab-summary.md`);
}

main().catch((e) => { console.error('[R-14] FATAL:', e.message || e); process.exit(1); });

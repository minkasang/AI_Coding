// R-35 驱动：一次 Chrome 调用跑完 3 机位 × 2 臂（A 现有覆盖 / B GLB 原生），
// 输出 9 张 PNG（每机位 A/B + 分割图）与全量指标。
//
// 复现：
//   node viewer/experiments/wheel-end-visual-baseline-v1/run-checks.mjs
//   node viewer/experiments/wheel-end-visual-baseline-v1/run-checks.mjs --repeat
// 复用既有 5173 同源服务；未运行则临时启停根 server.mjs，不留常驻端口。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '../../..');
const REPEAT = process.argv.includes('--repeat');
const RESULTS = path.join(HERE, 'results', REPEAT ? 'repeat' : '.');
const PORT = Number(process.env.CARLAB_PORT) || 5173;
const BASE = `http://127.0.0.1:${PORT}`;
const PAGE = '/viewer/experiments/wheel-end-visual-baseline-v1/index.html';
const TMP = 'F:/tmp/r35-chrome';
const BUDGET = '60000';

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
].filter(Boolean).find((p) => fs.existsSync(p));
if (!CHROME) { console.error('FATAL: 未找到 chrome.exe'); process.exit(2); }

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
  if (await probe()) { console.log(`[R-35] 复用已运行的 5173 同源服务 ${BASE}`); return null; }
  console.log('[R-35] 5173 未运行，临时启动根 server.mjs（结束后自动关闭）');
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

function dumpDom(tag) {
  return execFileSync(CHROME, [
    ...chromeBase,
    `--user-data-dir=${TMP}/${tag}`,
    `--disk-cache-dir=${TMP}/cache-${tag}`,
    '--dump-dom', `${BASE}${PAGE}?clean=1`
  ], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, timeout: 600000, windowsHide: true });
}

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");

function extract(dom, begin, end, what) {
  const m = dom.match(new RegExp(begin + '([\\s\\S]*?)' + end));
  if (!m) throw new Error(`DOM 中无 ${what}：` + dom.slice(0, 300));
  return JSON.parse(unescape(m[1]).replace(/&nbsp;/g, ' '));
}

const f = (v, d = 3) => (typeof v === 'number' ? v.toFixed(d) : '—');

async function main() {
  const srv = await ensureServer();
  try {
    const tag = REPEAT ? 'r35-repeat' : 'r35-main';
    const dom = dumpDom(tag);
    const raw = extract(dom, '__R35_JSON_BEGIN__', '__R35_JSON_END__', '__R35_JSON_BEGIN__');
    if (raw.error) throw new Error('页面报错：' + raw.error);

    const shots = extract(dom, '__R35_SHOTS_BEGIN__', '__R35_SHOTS_END__', '__R35_SHOTS_BEGIN__');

    const written = [];
    for (const [name, b64] of Object.entries(shots)) {
      const file = `shot-${name}.png`;
      fs.writeFileSync(path.join(RESULTS, file), Buffer.from(b64, 'base64'));
      written.push(file);
    }

    const outName = REPEAT ? 'wheel-end-check.repeat.json' : 'wheel-end-check.json';
    const record = {
      schemaVersion: 'carlab.r35.check/1.0',
      repeat: REPEAT,
      generatedAt: new Date().toISOString(),
      server: BASE,
      chrome: CHROME,
      payload: raw,
      shots: written.map((n) => `results/${REPEAT ? 'repeat/' : ''}${n}`)
    };
    fs.writeFileSync(path.join(RESULTS, outName), JSON.stringify(record, null, 2));

    // 摘要
    console.log('\n=== R-35 结果摘要 ===');
    console.log(`包 ${raw.packageId} · ${raw.sourceGrade} · GLB ${(raw.glb.bytes / 1024).toFixed(0)}KB · ` +
      `材质 ${raw.glb.materials} 个 / 原生 PBR 档位 ${raw.glb.nativeDistinct}`);
    console.log('原生分档：' + raw.glb.nativeTiers.map((t) => `${f(t.metalness, 2)}/${f(t.roughness, 2)}×${t.materials}`).join('  '));
    console.log('');
    console.log('机位            臂  对比度   边缘梯度  近白比    calls  tris');
    for (const v of raw.views) {
      for (const a of v.arms) {
        console.log(
          `${v.view.padEnd(15)} ${a.arm}  ${f(a.overall.lumaStdDev).padStart(7)}  ${f(a.overall.edgeGradient, 4).padStart(8)}  ` +
          `${f(a.overall.nearWhiteRatio, 4).padStart(6)}  ${String(a.renderInfo.calls).padStart(4)}  ${String(a.renderInfo.triangles).padStart(6)}`
        );
      }
    }
    console.log('');
    for (const v of raw.views) {
      console.log(`--- ${v.view}（${v.label}）---`);
      console.log('  两臂世界矩阵一致：' + (v.sameWorldMatrices ? 'yes' : 'NO'));
      console.log('  整体差（B-A）：对比度 ' + f(v.overallDelta.lumaStdDev) +
        ' 边缘梯度 ' + f(v.overallDelta.edgeGradient, 4) + ' 均值亮度 ' + f(v.overallDelta.meanLuma));
      const occ = v.arms[0].occluded || [];
      if (occ.length) console.log('  本机位完全不可见（0 像素）：' + occ.join(', '));
      console.log('  可见零件亮度与两两分离度：');
      for (const g of v.arms[0].groups) {
        console.log(`    ${g.key.padEnd(13)} L=${f(g.meanLuma).padStart(7)}  实例 ${g.instances}  像素 ${g.pixels}`);
      }
      for (const p of (v.arms[0].allPairs || [])) {
        console.log(`    ${(p.a + ' / ' + p.b).padEnd(30)} ΔL=${f(p.deltaLuma).padStart(7)} → ${p.verdict}${p.keyPair ? '  [关注对]' : ''}`);
      }
    }
    console.log(`\n输出：${outName}、${written.length} 张 PNG`);
  } finally {
    if (srv) srv.kill();
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

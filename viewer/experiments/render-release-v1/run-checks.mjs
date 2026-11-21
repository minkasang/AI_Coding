// R-30 驱动：一次 Chrome 调用跑完 off→on→off 全流程（3 状态 × 2 机位 × 2 flag = 12 帧），
// 并输出回退/幂等/测距/属性证据与精确 patch 候选。
//
// 复现：
//   node viewer/experiments/render-release-v1/run-checks.mjs
//   node viewer/experiments/render-release-v1/run-checks.mjs --repeat    # 确定性复跑
// 复用既有 5173 同源服务；若未运行则临时启停根 server.mjs，不留常驻端口。
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
const PAGE = '/viewer/experiments/render-release-v1/index.html';
const TMP = 'F:/tmp/r30-chrome';
const BUDGET = '45000';

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
  if (await probe()) { console.log(`[R-30] 复用已运行的 5173 同源服务 ${BASE}`); return null; }
  console.log('[R-30] 5173 未运行，临时启动根 server.mjs（结束后自动关闭）');
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
  ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 420000, windowsHide: true });
}

function extract(dom) {
  const m = dom.match(/__R30_JSON_BEGIN__([\s\S]*?)__R30_JSON_END__/);
  if (!m) throw new Error('DOM 中无 __R30_JSON_BEGIN__：' + dom.slice(0, 400));
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"));
}

const num = (v, d = 4) => (typeof v === 'number' ? v.toFixed(d) : '—');

function buildPatch(raw) {
  const onHist = raw.flag.histogramOn;
  const rb = raw.flag.rollback;
  const frb = raw.flag.finalRollback;
  const onFrame = raw.frames.find((f) => f.flag === 'on' && f.state === 'none' && f.view === 'iso');
  const offFrame = raw.frames.find((f) => f.flag === 'off' && f.state === 'none' && f.view === 'iso');
  return {
    schemaVersion: 'carlab.r30.patchCandidate/1.0',
    status: 'PROPOSAL_NOT_APPLIED',
    target: 'workbench-v2/viewport.js',
    owner: 'composer-2-5',
    requiresApproval: ['gpt-6', 'composer-2-5'],
    policy: 'FEATURE_FLAG_DEFAULT_OFF',
    defaultEnabled: false,
    generatedAt: new Date().toISOString(),
    measuredOn: 'headless Chrome + SwiftShader；无真实 GPU FPS/帧时间/显存数据',
    productionFileModified: false,
    scope: '仅 M 单变量（metalness/roughness 恢复 GLB 分档）；不调曝光/灯光/地面高度',
    // 两步注入 + 一次实例化；删除任一即回退
    steps: [
      {
        order: 1,
        file: 'workbench-v2/viewport.js',
        insertAt: 'constructor 末尾（this.animate(); 之前或之后均可）',
        code: 'this.mPbrFlag = null;',
        note: '只新增一个字段，不改任何现有参数'
      },
      {
        order: 2,
        file: 'workbench-v2/viewport.js',
        insertAt: 'sync() 末尾，_updateClipBounds() 之后',
        code: 'if (this.mPbrFlag) this.mPbrFlag.reapply();',
        note: '处理 sync 新增零件后 M 与旧值的混合态；未注入实例时为 no-op'
      }
    ],
    adapterFiles: [
      { from: 'viewer/experiments/render-release-v1/m-pbr-flag.mjs', to: 'workbench-v2/m-pbr-flag.mjs', contentUnchanged: true },
      { from: 'viewer/experiments/render-release-v1/glb-pbr.mjs', to: 'workbench-v2/glb-pbr.mjs', contentUnchanged: true }
    ],
    injection: [
      'import { MPbrFlag } from "./m-pbr-flag.mjs";',
      'const flag = MPbrFlag.attach(viewport, { seed, instances: getInstances(project), enabled: false });',
      '// 配置来源建议：URL ?mPbr=1 或 localStorage，默认 false'
    ],
    rollback: [
      'A. 运行时：flag.disable() —— 无条件写回 0.70/0.34/1.05，已实测精确回退',
      'B. 配置：把 enabled 置回 false 或删掉 ?mPbr=1',
      'C. 代码：删除注入的 2 行 + adapter 文件，viewport.js 行为与合入前完全一致'
    ],
    evidence: {
      defaultEnabled: raw.flag.defaultEnabled,
      histogramOn: onHist,
      histogramOff: raw.flag.histogramOff,
      rollbackOk: rb.ok,
      finalRollbackOk: frb.ok,
      idempotentOk: raw.flag.idempotent.ok,
      nonPbrStable: raw.flag.nonPbrStable,
      measureSameDistance: raw.measure.sameDistance,
      measure: { off: raw.measure.off, on: raw.measure.on },
      frameContrast: onFrame && offFrame ? {
        isoNearWhiteRatio: { off: offFrame.model.nearWhiteRatio, on: onFrame.model.nearWhiteRatio },
        isoLumaStdDev: { off: offFrame.model.lumaStdDev, on: onFrame.model.lumaStdDev },
        isoEdgeGradient: { off: offFrame.model.edgeGradient, on: onFrame.model.edgeGradient }
      } : null,
      costUnchanged: onFrame && offFrame
        ? onFrame.renderInfo.calls === offFrame.renderInfo.calls &&
          onFrame.renderInfo.triangles === offFrame.renderInfo.triangles
        : false
    },
    caveats: [
      'PBR 数值来自项目自身 GLB 的 DEMO 材质，不是厂商材料或 OEM 尺寸；仍为 VISUAL_ASSUMPTION',
      '本轮不改几何法线、不改曝光/hemi/sun/fill、不改地面高度',
      'SwiftShader 只支持像素级可复验截图与 renderer.info 计数，不代表 RTX GPU 性能',
      '接入生产前须由 Composer 在 5173 主页做一次真实 Chrome 回归；本候选不自行合入',
      '换 GLB 资产后 nativePbr 会变，adapter 从模板实时读取，不需要改代码；但需重跑本检查'
    ]
  };
}

async function main() {
  const srv = await ensureServer();
  try {
    const raw = extract(dumpDom(REPEAT ? 'r30-repeat' : 'r30-main'));
    if (raw.rejected || raw.error) throw new Error('页面被拒绝：' + raw.error);
    if (!Array.isArray(raw.frames) || raw.frames.length !== 12) {
      throw new Error(`帧数不是 12（3 状态 × 2 机位 × 2 flag），实际 ${raw.frames?.length}`);
    }

    const shots = {};
    for (const f of raw.frames) {
      if (!f.png) throw new Error(`${f.flag}/${f.state}/${f.view} 无截图`);
      const name = `shot-${f.flag}-${f.state}-${f.view}.png`;
      fs.writeFileSync(path.join(RESULTS, name), Buffer.from(f.png, 'base64'));
      shots[`${f.flag}-${f.state}-${f.view}`] = `results/${REPEAT ? 'repeat/' : ''}${name}`;
    }
    const frames = raw.frames.map(({ png, ...rest }) => rest);

    const summary = {
      schemaVersion: 'carlab.r30.runSummary/1.0',
      repeat: REPEAT,
      generatedAt: new Date().toISOString(),
      server: { base: BASE, reusedExisting: !srv, constantPortsOnly: true },
      chrome: { headless: true, backend: 'SwiftShader', budgetMs: Number(BUDGET) },
      payload: { ...raw, frames },
      shots
    };
    fs.writeFileSync(path.join(HERE, 'results', REPEAT ? 'release-check.repeat.json' : 'release-check.json'),
      JSON.stringify(summary, null, 2) + '\n');

    const patch = buildPatch(raw);
    if (!REPEAT) {
      fs.writeFileSync(path.join(HERE, 'patch-candidate.json'), JSON.stringify(patch, null, 2) + '\n');
    }

    console.log('\n=== R-30 结果摘要 ===');
    console.log(`flag 默认：${raw.flag.defaultEnabled === false ? '关闭（生产旧设置）' : '开启（不符合要求）'} | 切换次数 ${raw.flag.switches}`);
    console.log(`histogram off：${JSON.stringify(raw.flag.histogramOff.buckets)}`);
    console.log(`histogram on ：${JSON.stringify(raw.flag.histogramOn.buckets)}（分档 ${raw.flag.histogramOn.distinct} 种）`);
    console.log(`回退：ok=${raw.flag.rollback.ok} 违规=${raw.flag.rollback.violations.length} | 最终回退 ok=${raw.flag.finalRollback.ok}`);
    console.log(`幂等：ok=${raw.flag.idempotent.ok} | 非 PBR 稳定：${raw.flag.nonPbrStable}`);
    console.log(`测距：off=${raw.measure.off.formatted} on=${raw.measure.on.formatted} 相同=${raw.measure.sameDistance}`);
    console.log('\nflag/state/view     近白比    对比度   边缘梯度  calls  tris');
    for (const f of frames) {
      console.log(`${(f.flag + '/' + f.state + '/' + f.view).padEnd(26)} ${num(f.model.nearWhiteRatio, 6)}  ${num(f.model.lumaStdDev, 3).padStart(8)}  ${num(f.model.edgeGradient, 4).padStart(8)}  ${String(f.renderInfo.calls).padStart(5)}  ${String(f.renderInfo.triangles).padStart(6)}`);
    }
    console.log(`\n输出：${REPEAT ? 'results/release-check.repeat.json' : 'results/release-check.json'}、${REPEAT ? '（复跑不重写 patch）' : 'patch-candidate.json'}、12 张 PNG`);
  } finally {
    if (srv) { srv.kill(); console.log('[R-30] 临时 5173 服务已关闭（未留下常驻端口）'); }
  }
}

main().catch((e) => { console.error('[R-30] FATAL: ' + (e.stack || e.message)); process.exit(1); });

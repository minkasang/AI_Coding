// R-40 驱动：在真实 5173 主工作台上做轮端视觉验收。
//
// 为什么不用「选中前后差分」取零件遮罩：实测选中零件会让画布尺寸变化（右侧检查器占位），
// 两帧不是同一投影，差分测到的是整体重排。因此改为：
//   1) 用页面自带的「隔离选中零件」把单个零件单独显示，按色度分类取该零件像素，测其实际颜色；
//   2) 用 5 个零件的实际颜色序列判断页面是否沿用了 manifest 的 displayColor
//      （若退化成兜底色 #aec1da，5 个零件颜色会几乎相同，序列不再有区分度）；
//   3) 颜色确认与 R-35 基线同源后，R-35 的可读性结论即可迁移到页面。
//
// 复现：
//   node viewer/experiments/wheel-end-workbench-qa-v1/run-qa.mjs
//   node viewer/experiments/wheel-end-workbench-qa-v1/run-qa.mjs --repeat
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, findChrome } from './cdp.mjs';
import { decodePng, frameStats, diffMask } from './png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPEAT = process.argv.includes('--repeat');
const RESULTS = path.join(HERE, 'results', REPEAT ? 'repeat' : '.');
const PORT = 9245;
const PROFILE = 'F:/tmp/r40-qa-profile';
const BASE = `http://127.0.0.1:${process.env.CARLAB_PORT || 5173}`;
const PAGE = `${BASE}/workbench-v2/index.html?view=model`;

const SIZES = [
  { width: 1500, height: 920, tag: '1500x920' },
  { width: 1280, height: 800, tag: '1280x800' }
];

// 5 类语义各取一个代表实例；期望 sRGB 由 manifest displayColor（线性）换算
const TARGETS = [
  { id: 'PI-20-016-FL', semantic: 'knuckle', label: '转向节', linear: [0.24, 0.30, 0.36] },
  { id: 'PI-30-006-FL', semantic: 'hub', label: '轮毂法兰', linear: [0.52, 0.56, 0.62] },
  { id: 'PI-30-009-FL-01', semantic: 'stud', label: '螺柱 01', linear: [0.28, 0.32, 0.38] },
  { id: 'PI-30-001-FL', semantic: 'bearingOuter', label: '轴承外圈', linear: [0.42, 0.47, 0.53] },
  { id: 'PI-30-002-FL', semantic: 'bearingInner', label: '轴承内圈', linear: [0.65, 0.69, 0.74] }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(RESULTS, { recursive: true });

const srgb = (c) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));

async function waitFor(cdp, expr, tries = 60, gap = 200) {
  for (let i = 0; i < tries; i++) {
    if (await cdp.evaluate(expr).catch(() => false)) return true;
    await sleep(gap);
  }
  return false;
}

const savePng = (name, buf) => {
  const file = `shot-${name}.png`;
  fs.writeFileSync(path.join(RESULTS, file), buf);
  return `results/${REPEAT ? 'repeat/' : ''}${file}`;
};

const canvasRect = async (cdp) => cdp.evaluate(`(() => {
  const r = document.getElementById('viewCanvas').getBoundingClientRect();
  return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
})()`);

/** 截画布区域（不含左右面板），避免布局变化影响尺寸。 */
async function shotCanvas(cdp) {
  const r = await canvasRect(cdp);
  const res = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 },
    captureBeyondViewport: false
  });
  return { png: Buffer.from(res.data, 'base64'), rect: r };
}

/**
 * 按色度 + 亮度排除背景，取零件像素：零件为蓝灰金属（b>g>r），背景 #eef3f8 很亮且接近中性。
 * 必须限定到「模型区」（裁掉顶部工具条与底部状态条），否则 UI 文字会被当成零件
 * ——转向节隔离后画面是空的，之前的 4265 像素就是这么来的。
 */
function partColor(img, opts = {}) {
  const bg = opts.bg || [238, 243, 248];
  const x0 = Math.max(0, opts.x0 ?? 0);
  const y0 = Math.max(0, opts.y0 ?? 60);
  const x1 = Math.min(img.width, opts.x1 ?? img.width);
  const y1 = Math.min(img.height, opts.y1 ?? img.height - 110);
  const mask = opts.mask || null;
  let n = 0, sr = 0, sg = 0, sb = 0, sl = 0;
  const hist = new Uint32Array(256);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (mask && !mask[y * img.width + x]) continue;
      const i = (y * img.width + x) * img.channels;
      const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
      // 背景本身也是 b>g>r 且色度约 10，必须先排除，否则会把整片背景当成零件
      if (Math.abs(r - bg[0]) <= 6 && Math.abs(g - bg[1]) <= 6 && Math.abs(b - bg[2]) <= 6) continue;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (chroma < 12) continue;           // 中性地面
      if (b < g || g < r) continue;        // 非蓝灰
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (L > 232) continue;               // 过亮多半是地面高光
      n++; sr += r; sg += g; sb += b; sl += L;
      hist[Math.min(255, Math.max(0, Math.round(L)))]++;
    }
  }
  if (!n) return { pixels: 0, rgb: null, luma: null, lumaP50: null, lumaP90: null };
  const pct = (p) => {
    const target = n * p;
    let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) return i; }
    return 255;
  };
  return {
    pixels: n,
    rgb: [+(sr / n).toFixed(1), +(sg / n).toFixed(1), +(sb / n).toFixed(1)],
    luma: +(sl / n).toFixed(2),
    lumaP50: pct(0.5),
    lumaP90: pct(0.9)
  };
}

/** 腐蚀遮罩：高亮差分会把描边光晕算进来，向内收 2px 再取色，避免采到边上。 */
function erode(mask, w, h, r = 2) {
  const out = new Uint8Array(w * h);
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      let ok = true;
      for (let dy = -r; dy <= r && ok; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (!mask[(y + dy) * w + (x + dx)]) { ok = false; break; }
        }
      }
      if (ok) out[p] = 1;
    }
  }
  return out;
}

/** sRGB 0-255 → 线性，用于和 manifest 的 displayColor（线性值）比对色比。 */
const toLinear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** 白光强度不敏感的色比 r/g、b/g（漫反射项对白光只做等比缩放）。 */
function chromaRatios(rgb) {
  if (!rgb) return null;
  const [r, g, b] = rgb.map(toLinear);
  return { rg: +(r / g).toFixed(3), bg: +(b / g).toFixed(3) };
}

async function main() {
  const chrome = findChrome();
  const cdp = new Cdp(chrome, PORT, PROFILE);
  const record = {
    schemaVersion: 'carlab.r40.workbenchQa/1.0',
    repeat: REPEAT,
    generatedAt: new Date().toISOString(),
    page: PAGE,
    backend: 'headless Chrome + SwiftShader 软件光栅化',
    c01: null,
    demoLabel: null,
    trees: null,
    sizes: [],
    overallVisibility: [],
    parts: [],
    isolated: {},
    clip: null,
    assemblyTreeClick: null,
    pickProbes: [],
    pickSummary: null,
    clearFailures: 0,
    layoutJump: null
  };

  try {
    await cdp.connect();
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: "try { localStorage.removeItem('carlab.workbench-v2.project.v1'); } catch {}"
    });
    await cdp.goto(PAGE);

    if (!await waitFor(cdp, 'Boolean(window.__CARLAB_V2_READY__)', 150, 200)) {
      throw new Error('主工作台 __CARLAB_V2_READY__ 未就绪');
    }
    await waitFor(cdp, 'Boolean(window.__CARLAB_VEHICLE_SNAPSHOT__)', 60, 200);
    if (!await waitFor(cdp, 'Boolean(window.__CARLAB_C01_READY__)', 90, 200)) {
      throw new Error('C-01 资产未就绪（__CARLAB_C01_READY__ 未置位）');
    }

    // 树是懒展开的，每步等子节点渲染
    await cdp.evaluate(`(() => { const b = document.querySelector('[data-tree-toggle="SYS-30"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
    await waitFor(cdp, `Boolean(document.querySelector('[data-tree-toggle="AI-30-002-FL"]'))`, 40, 150);
    await cdp.evaluate(`(() => { const b = document.querySelector('[data-tree-toggle="AI-30-002-FL"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
    await waitFor(cdp, `Boolean(document.querySelector('[data-vehicle-select="PI-30-006-FL"]'))`, 40, 150);

    const activate = await cdp.evaluate(`(async () => {
      document.querySelector('[data-vehicle-select="PI-30-006-FL"]')?.click();
      for (let i = 0; i < 60; i++) {
        if (window.__CARLAB_C01_ACTIVE__) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      return {
        ok: Boolean(window.__CARLAB_C01_ACTIVE__),
        err: window.__CARLAB_C01_LAST_ERROR || window.__CARLAB_C01_ERROR__ || null,
        heading: document.getElementById('workbenchHeading')?.textContent || null,
        description: document.getElementById('workbenchDescription')?.textContent || null,
        context: document.getElementById('viewContext')?.textContent || null,
        treeCount: document.querySelectorAll('[data-select]').length,
        vehicleRows: document.querySelectorAll('[data-vehicle-select]').length
      };
    })()`);
    record.c01 = activate;
    if (!activate?.ok) throw new Error('C-01 未激活：' + JSON.stringify(activate));

    // 重载页面并重新激活 C-01（左栏装配树点选会把页面踢出 C-01 模式，需要复位）
    const activateC01 = async () => {
      await cdp.goto(PAGE);
      if (!await waitFor(cdp, 'Boolean(window.__CARLAB_V2_READY__)', 150, 200)) {
        throw new Error('重载后 __CARLAB_V2_READY__ 未就绪');
      }
      await waitFor(cdp, 'Boolean(window.__CARLAB_C01_READY__)', 90, 200);
      await cdp.setViewport(SIZES[0].width, SIZES[0].height);
      await cdp.evaluate(`(() => { const b = document.querySelector('[data-tree-toggle="SYS-30"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
      await waitFor(cdp, `Boolean(document.querySelector('[data-tree-toggle="AI-30-002-FL"]'))`, 40, 150);
      await cdp.evaluate(`(() => { const b = document.querySelector('[data-tree-toggle="AI-30-002-FL"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
      await waitFor(cdp, `Boolean(document.querySelector('[data-vehicle-select="PI-30-006-FL"]'))`, 40, 150);
      const ok = await cdp.evaluate(`(async () => {
        document.querySelector('[data-vehicle-select="PI-30-006-FL"]')?.click();
        for (let i = 0; i < 60; i++) {
          if (window.__CARLAB_C01_ACTIVE__) break;
          await new Promise((r) => setTimeout(r, 250));
        }
        return Boolean(window.__CARLAB_C01_ACTIVE__);
      })()`);
      if (!ok) throw new Error('重载后 C-01 未激活');
    };

    record.demoLabel = await cdp.evaluate(`(() => {
      const t = document.body.innerText || '';
      return { hasStatic: /静态/.test(t), hasDemo: /DEMO|演示|样板|ASSUMPTION/i.test(t),
        heading: document.getElementById('workbenchHeading')?.textContent || '',
        description: document.getElementById('workbenchDescription')?.textContent || '' };
    })()`);

    // 两棵树共存的事实取证：左栏可编辑装配（有几何的 9 个实例）与车辆树（14 行，含「无几何」占位）
    record.trees = await cdp.evaluate(`(() => {
      const dump = (sel) => [...document.querySelectorAll(sel)].map((el) => ({
        id: el.getAttribute('data-select') || el.getAttribute('data-vehicle-select'),
        text: (el.textContent || '').trim().replace(/\\s+/g, ' '),
        noGeometry: /无几何/.test(el.textContent || '')
      }));
      const assembly = dump('[data-select]');
      const vehicle = dump('[data-vehicle-select]');
      return {
        assembly: { count: assembly.length, rows: assembly },
        vehicle: { count: vehicle.length, rows: vehicle,
          noGeometryCount: vehicle.filter((r) => r.noGeometry).length },
        isSelectedClassOnBoth: document.querySelectorAll('.tree-select.is-selected').length
          + document.querySelectorAll('.vehicle-tree-part.is-selected').length
      };
    })()`);

    // 布局跳变取证：无选中 vs 选中后的画布尺寸
    // clear() 必须真的清空选择，否则「无选中」那一帧其实带着上一件的高亮，差分口径就废了。
    // 不能用 Esc：实测 Esc 会把页面退出 C-01 模式。只用「点画布边缘空白」这条路径。
    const clear = async () => {
      const isSel = () => cdp.evaluate(`Boolean(document.querySelector('[data-select].is-selected'))`);
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!await isSel()) return true;
        const r = await canvasRect(cdp);
        for (const [x, y] of [[4, 4], [r.w - 4, 4], [4, r.h * 0.5], [r.w - 4, r.h * 0.5], [4, r.h - 4]]) {
          if (!await isSel()) return true;
          await cdp.click(r.x + x, r.y + y);
          await sleep(260);
        }
      }
      if (!await isSel()) return true;
      record.clearFailures += 1;
      return false;
    };

    // 相机在选中/激活后会有一段收敛；用「连拍到两帧逐像素一致」代替固定睡眠，
    // 否则会把相机漂移当成剖切或高亮的效果（首跑与复跑就因此差出 2 万多像素）。
    const stableShot = async (tries = 10, gap = 350) => {
      let prevPng = (await shotCanvas(cdp)).png;
      let prev = decodePng(prevPng);
      let lastDiff = null;
      for (let i = 0; i < tries; i++) {
        await sleep(gap);
        prevPng = (await shotCanvas(cdp)).png;
        const cur = decodePng(prevPng);
        if (cur.width !== prev.width || cur.height !== prev.height) { prev = cur; lastDiff = -1; continue; }
        lastDiff = diffMask(prev, cur, 6).count;
        if (lastDiff === 0) return { png: prevPng, img: cur, settled: true, tries: i + 1 };
        prev = cur;
      }
      return { png: prevPng, img: prev, settled: false, tries, lastDiff };
    };
    const resetCamera = async () => {
      await cdp.evaluate(`document.getElementById('resetCameraBtn')?.click()`);
      await sleep(500);
    };
    // 车辆树（[data-vehicle-select]）是 C-01 模式下**唯一**能安全点选的入口：
    // 左栏装配树（[data-select]）的点选会先把页面退出 C-01 模式（heading 变「工程装配」、
    // __CARLAB_C01_ACTIVE__ 变 false），且选中不改变——已单独取证，不混进视觉结论。
    const selectRow = async (id) => cdp.evaluate(`(async () => {
      const v = document.querySelector('[data-vehicle-select="${id}"]');
      if (!v) return { ok: false, reason: 'no-vehicle-tree-row', viaTree: null };
      v.click();
      for (let i = 0; i < 30; i++) {
        if (document.querySelector('[data-select].is-selected')?.getAttribute('data-select') === '${id}') break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const sel = document.querySelector('[data-select].is-selected');
      const ins = document.querySelector('.selected-name') || document.querySelector('.vehicle-inspector-title');
      return {
        ok: sel?.getAttribute('data-select') === '${id}',
        viaTree: 'vehicle-tree',
        c01Active: Boolean(window.__CARLAB_C01_ACTIVE__),
        heading: document.getElementById('workbenchHeading')?.textContent || null,
        treeLabel: (sel?.textContent || '').trim().replace(/\\s+/g, ' ') || null,
        inspector: (ins?.textContent || '').trim() || null
      };
    })()`);

    // 没有车辆树行的零件（转向节）只能用视窗拾取选中；按由中心向外的固定顺序试，结果可复现。
    const pickByGrid = async (id) => {
      const r = await canvasRect(cdp);
      const fx = [0.5, 0.4, 0.6, 0.3, 0.7];
      const fy = [0.35, 0.45, 0.25, 0.55, 0.65];
      let tries = 0;
      for (const v of fy) {
        for (const u of fx) {
          await clear();
          await resetCamera();
          await cdp.click(r.x + r.w * u, r.y + r.h * v);
          tries++;
          const got = await cdp.evaluate(`(() => ({
            selected: document.querySelector('[data-select].is-selected')?.getAttribute('data-select') || null,
            c01Active: Boolean(window.__CARLAB_C01_ACTIVE__)
          }))()`);
          if (got.selected === id) {
            return { ok: true, viaTree: 'viewport-pick', tries,
              point: [+u.toFixed(2), +v.toFixed(2)], c01Active: got.c01Active };
          }
        }
      }
      return { ok: false, viaTree: 'viewport-pick', tries };
    };

    // 统一入口：先试车辆树，没有该行再走视窗拾取
    const selectPart = async (id) => {
      const viaTree = await selectRow(id);
      if (viaTree.ok) return viaTree;
      return pickByGrid(id);
    };


    await cdp.setViewport(SIZES[0].width, SIZES[0].height);
    await clear();
    const rectNoSel = await canvasRect(cdp);
    await selectRow('PI-30-006-FL');
    const rectWithSel = await canvasRect(cdp);
    record.layoutJump = {
      noSelection: rectNoSel,
      withSelection: rectWithSel,
      canvasWidthDelta: +(rectWithSel.w - rectNoSel.w).toFixed(1),
      canvasHeightDelta: +(rectWithSel.h - rectNoSel.h).toFixed(1)
    };

    // 两种尺寸：整体 + 选中两支截图与布局检查
    for (const size of SIZES) {
      await cdp.setViewport(size.width, size.height);
      const sizeRec = { tag: size.tag, width: size.width, height: size.height, frames: {} };

      await clear();
      await resetCamera();
      const overall = await shotCanvas(cdp);
      sizeRec.frames.overall = savePng(`${size.tag}-overall`, overall.png);
      sizeRec.overall = frameStats(decodePng(overall.png));
      sizeRec.canvasNoSelection = overall.rect;

      await selectRow('PI-30-006-FL');
      await resetCamera();
      const selected = await shotCanvas(cdp);
      sizeRec.frames.selectedHub = savePng(`${size.tag}-selected-hub`, selected.png);
      sizeRec.canvasWithSelection = selected.rect;

      sizeRec.layout = await cdp.evaluate(`(() => {
        const want = ['PROJECT EXPLORER', 'COMPONENT LIBRARY', '可编辑装配'];
        const nodes = [...document.querySelectorAll('body *')].filter((el) => {
          const t = (el.textContent || '').trim();
          return el.children.length === 0 && t.length < 40 && want.some((w) => t.includes(w));
        });
        const rects = nodes.slice(0, 12).map((el) => {
          const r = el.getBoundingClientRect();
          return { text: (el.textContent || '').trim().slice(0, 26), x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
        });
        const overlaps = [];
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > 2 && oy > 2) overlaps.push({ a: a.text, b: b.text, area: +(ox * oy).toFixed(1) });
        }
        return { rects, overlaps, docScrollW: document.documentElement.scrollWidth,
          docClientW: document.documentElement.clientWidth };
      })()`);

      record.sizes.push(sizeRec);
    }

    // 整体视图里每个零件到底占多少像素：用「选中高亮」差分得到该零件在默认机位下的可见轮廓。
    // 这一步回答 R-35 提出的问题——整体视图里轴承是否根本看不见。
    await cdp.setViewport(SIZES[0].width, SIZES[0].height);
    await clear();
    await resetCamera();
    const overallBase = decodePng((await shotCanvas(cdp)).png);
    for (const t of TARGETS) {
      await clear();
      await resetCamera();
      const sel = await selectPart(t.id);
      await resetCamera();
      const shot = await shotCanvas(cdp);
      const img = decodePng(shot.png);
      const same = img.width === overallBase.width && img.height === overallBase.height;
      const dm = same ? diffMask(overallBase, img, 6) : null;
      // 高亮差分给出该零件在默认机位的轮廓；在**未高亮**的原图上按此遮罩取色，
      // 得到的是「真实共视条件下」该零件的外观，比隔离渲染更接近用户看到的样子。
      let vis = null;
      if (dm && dm.count > 0) {
        const eroded = erode(dm.mask, img.width, img.height, 2);
        const c = partColor(overallBase, { mask: eroded });
        vis = { pixels: c.pixels, rgb: c.rgb, luma: c.luma, ratios: chromaRatios(c.rgb) };
      }
      record.overallVisibility.push({
        instanceId: t.id,
        semantic: t.semantic,
        label: t.label,
        selectOk: sel?.ok ?? false,
        viaTree: sel?.viaTree ?? null,
        pickTries: sel?.tries ?? null,
        sameCanvas: same,
        changedPixels: dm ? dm.count : null,
        changedRatio: dm ? +(dm.count / (img.width * img.height)).toFixed(4) : null,
        visibleColor: vis,
        frame: savePng(`overall-sel-${t.semantic}`, shot.png)
      });
    }
    // 清空选择，后续隔离测量从干净状态开始
    await clear();
    await resetCamera();

    // 逐零件隔离测量（主尺寸）
    await cdp.setViewport(SIZES[0].width, SIZES[0].height);
    record.isolateButton = await cdp.evaluate(`(() => {
      const b = document.getElementById('isolateBtn');
      return b ? { exists: true, text: b.textContent.trim(), disabled: b.disabled } : { exists: false };
    })()`);

    for (const t of TARGETS) {
      await clear();
      const sel = await selectPart(t.id);
      // 进入隔离
      const iso = await cdp.evaluate(`(async () => {
        const b = document.getElementById('isolateBtn');
        if (!b) return { ok: false, reason: 'no button' };
        if (!/退出/.test(b.textContent)) b.click();
        await new Promise((r) => setTimeout(r, 500));
        return { ok: /退出/.test(b.textContent), text: b.textContent.trim() };
      })()`);
      await resetCamera();
      const shot = await shotCanvas(cdp);
      const img = decodePng(shot.png);
      const c = partColor(img);
      // 隔离视图里零件应占据可测量的面积；否则说明隔离没生效或零件被移出画面，
      // 此时测到的只是 UI 残留，必须显式判空，不能让它冒充零件颜色。
      const isolateEmpty = !c.pixels || c.pixels < 3000;
      record.parts.push({
        instanceId: t.id, semantic: t.semantic, label: t.label,
        expectedSrgb: t.linear.map(srgb),
        selectOk: sel?.ok ?? false,
        selectVia: sel?.viaTree ?? null,
        pickTries: sel?.tries ?? null,
        treeLabel: sel?.treeLabel ?? null, inspectorTitle: sel?.inspector ?? null,
        isolateOk: iso?.ok ?? false,
        isolateEmpty,
        measured: isolateEmpty ? null : c,
        ratios: isolateEmpty ? null : chromaRatios(c.rgb),
        rawPixelsInModelArea: c.pixels,
        frame: savePng(`isolate-${t.semantic}`, shot.png)
      });
      // 退出隔离
      await cdp.evaluate(`(async () => {
        const b = document.getElementById('isolateBtn');
        if (b && /退出/.test(b.textContent)) b.click();
        await new Promise((r) => setTimeout(r, 400));
      })()`);
    }

    // 左栏装配树的点选行为：点击会不会把页面踢出 C-01 模式、选中是否跟随。
    // 这条与视觉验收分开记，因为它改变的是模式状态，不是渲染结果。
    await activateC01();   // 保证起始状态确定（C-01 已激活），否则 before 会随上一段流程漂移
    record.assemblyTreeClick = await cdp.evaluate(`(async () => {
      const before = {
        heading: document.getElementById('workbenchHeading')?.textContent || null,
        c01: Boolean(window.__CARLAB_C01_ACTIVE__),
        selected: document.querySelector('[data-select].is-selected')?.getAttribute('data-select') || null
      };
      const row = document.querySelector('[data-select="PI-20-016-FL"]');
      if (!row) return { found: false, before };
      row.click();
      await new Promise((r) => setTimeout(r, 1000));
      return {
        found: true,
        before,
        after: {
          heading: document.getElementById('workbenchHeading')?.textContent || null,
          c01: Boolean(window.__CARLAB_C01_ACTIVE__),
          selected: document.querySelector('[data-select].is-selected')?.getAttribute('data-select') || null
        },
        note: '点左栏装配树行会退出 C-01 模式且不改变选中，因此转向节在界面上没有可用的树入口'
      };
    })()`);
    record.assemblyTreeClick.screenshot = savePng('assembly-tree-click-after', (await shotCanvas(cdp)).png);

    // 剖切看轴承安装关系：以「画面是否真的变了」为准，不依赖 aria-pressed
    await activateC01();
    await clear();
    await selectRow('PI-30-002-FL');
    await resetCamera();
    const beforeStable = await stableShot();
    const beforeClip = beforeStable.img;
    const clipState = await cdp.evaluate(`(async () => {
      const t = document.getElementById('clipToggle');
      if (!t) return { ok: false, reason: 'no clipToggle' };
      if (t.getAttribute('aria-pressed') !== 'true') t.click();
      await new Promise((r) => setTimeout(r, 300));
      const axis = document.getElementById('clipAxis');
      if (axis) { axis.value = 'x'; axis.dispatchEvent(new Event('change', { bubbles: true })); }
      const pos = document.getElementById('clipPos');
      if (pos) { pos.value = '50'; pos.dispatchEvent(new Event('input', { bubbles: true })); }
      await new Promise((r) => setTimeout(r, 500));
      return {
        ariaPressed: t.getAttribute('aria-pressed'),
        disabled: t.disabled,
        inlineHidden: document.getElementById('clipInline')?.hidden ?? null,
        axis: axis?.value ?? null, pos: pos?.value ?? null
      };
    })()`);
    await resetCamera();
    const afterStable = await stableShot();
    const afterClip = afterStable.img;
    record.clipModelMode = {
      ...clipState,
      beforeSettled: beforeStable.settled,
      afterSettled: afterStable.settled,
      visibleChangedPixels: diffMask(beforeClip, afterClip, 6).count,
      partPixelFraction: {
        before: +(partColor(beforeClip).pixels / (beforeClip.width * beforeClip.height)).toFixed(4),
        after: +(partColor(afterClip).pixels / (afterClip.width * afterClip.height)).toFixed(4)
      },
      note: '剖切仅在 mode === inspect 下生效（inspection-bridge 第 81 行提前 return），整车视图下静默无效'
    };
    record.isolated.clipModelMode = savePng('clip-model-mode', afterStable.png);
    await cdp.evaluate(`document.getElementById('clipToggle')?.click()`);

    // ---- 检查模式下的剖切（剖切功能的正确入口） ----
    const PAGE_INSPECT = `${BASE}/workbench-v2/index.html?view=inspect`;
    await cdp.goto(PAGE_INSPECT);
    if (!await waitFor(cdp, 'Boolean(window.__CARLAB_V2_READY__)', 150, 200)) {
      throw new Error('检查模式：__CARLAB_V2_READY__ 未就绪');
    }
    await waitFor(cdp, 'Boolean(window.__CARLAB_C01_READY__)', 90, 200);
    await cdp.evaluate(`(() => { const b = document.querySelector('[data-tree-toggle="SYS-30"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
    await waitFor(cdp, `Boolean(document.querySelector('[data-tree-toggle="AI-30-002-FL"]'))`, 40, 150);
    await cdp.evaluate(`(() => { const b = document.querySelector('[data-tree-toggle="AI-30-002-FL"]'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
    await waitFor(cdp, `Boolean(document.querySelector('[data-vehicle-select="PI-30-002-FL"]'))`, 40, 150);
    await cdp.setViewport(SIZES[0].width, SIZES[0].height);
    const actInspect = await cdp.evaluate(`(async () => {
      document.querySelector('[data-vehicle-select="PI-30-002-FL"]')?.click();
      for (let i = 0; i < 60; i++) {
        if (window.__CARLAB_C01_ACTIVE__) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      return { active: Boolean(window.__CARLAB_C01_ACTIVE__),
        mode: window.CARLAB_SHELL?.mode || null,
        heading: document.getElementById('workbenchHeading')?.textContent || null };
    })()`);
    await resetCamera();
    const beforeInspectStable = await stableShot();
    const beforeInspectClip = beforeInspectStable.img;
    const clipInspectState = await cdp.evaluate(`(async () => {
      const t = document.getElementById('clipToggle');
      if (!t) return { ok: false, reason: 'no clipToggle' };
      if (t.getAttribute('aria-pressed') !== 'true') t.click();
      await new Promise((r) => setTimeout(r, 350));
      const axis = document.getElementById('clipAxis');
      if (axis) { axis.value = 'x'; axis.dispatchEvent(new Event('change', { bubbles: true })); }
      const pos = document.getElementById('clipPos');
      if (pos) { pos.value = '50'; pos.dispatchEvent(new Event('input', { bubbles: true })); }
      await new Promise((r) => setTimeout(r, 550));
      return { ariaPressed: t.getAttribute('aria-pressed'), disabled: t.disabled,
        inlineHidden: document.getElementById('clipInline')?.hidden ?? null,
        axis: axis?.value ?? null, pos: pos?.value ?? null };
    })()`);
    const afterInspectStable = await stableShot();
    const afterInspectClip = afterInspectStable.img;
    // 剖切控件展开会挤压画布，尺寸可能变；不同尺寸不能逐像素差分，如实记录
    const sameSize = afterInspectClip.width === beforeInspectClip.width
      && afterInspectClip.height === beforeInspectClip.height;
    record.clipInspectMode = {
      activation: actInspect,
      ...clipInspectState,
      beforeSettled: beforeInspectStable.settled,
      afterSettled: afterInspectStable.settled,
      beforeSize: [beforeInspectClip.width, beforeInspectClip.height],
      afterSize: [afterInspectClip.width, afterInspectClip.height],
      sizeChanged: !sameSize,
      visibleChangedPixels: sameSize ? diffMask(beforeInspectClip, afterInspectClip, 6).count : null,
      // 尺寸变了不能逐像素差分，改用面积归一化的零件像素占比：剖掉一半，占比应明显下降
      partPixelFraction: {
        before: +(partColor(beforeInspectClip).pixels / (beforeInspectClip.width * beforeInspectClip.height)).toFixed(4),
        after: +(partColor(afterInspectClip).pixels / (afterInspectClip.width * afterInspectClip.height)).toFixed(4)
      },
      note: sameSize
        ? null
        : '剖切控件展开挤压画布（高度变化），逐像素差分不可比；改用面积归一化占比判断剖切是否生效'
    };
    record.isolated.clipInspect = savePng('clip-inspect-x50', afterInspectStable.png);

    // 视窗点击 → 树与检查器同步：用 3x3 网格扫一遍，避免单点落在空白处导致证据过弱
    await clear();
    await resetCamera();
    const r0 = await canvasRect(cdp);
    const fr = [0.35, 0.5, 0.65];
    const fx = [0.35, 0.5, 0.65];
    const points = [];
    for (let iy = 0; iy < fr.length; iy++) {
      for (let ix = 0; ix < fx.length; ix++) {
        points.push({ name: `g${iy}${ix}`, x: r0.x + r0.w * fx[ix], y: r0.y + r0.h * fr[iy] });
      }
    }
    for (const pt of points) {
      await cdp.click(pt.x, pt.y);
      const got = await cdp.evaluate(`(() => {
        const sel = document.querySelector('[data-select].is-selected');
        const ins = document.querySelector('.selected-name') || document.querySelector('.vehicle-inspector-title');
        return {
          selected: sel?.getAttribute('data-select') || null,
          treeSaysSelected: sel?.classList.contains('is-selected') ?? false,
          treeLabel: (sel?.textContent || '').trim().replace(/\\s+/g, ' ') || null,
          inspector: (ins?.textContent || '').trim() || null,
          inspectorVisible: ins ? ins.getBoundingClientRect().height > 0 : false
        };
      })()`);
      record.pickProbes.push({
        name: pt.name,
        clickAt: [Math.round(pt.x), Math.round(pt.y)],
        rel: [+((pt.x - r0.x) / r0.w).toFixed(2), +((pt.y - r0.y) / r0.h).toFixed(2)],
        ...got
      });
      await clear();
      await resetCamera();
    }
    record.pickSummary = {
      probes: record.pickProbes.length,
      hits: record.pickProbes.filter((p) => p.selected).length,
      distinctSelected: [...new Set(record.pickProbes.filter((p) => p.selected).map((p) => p.selected))],
      inconsistent: record.pickProbes.filter((p) => p.selected && !p.treeSaysSelected).length
    };

    fs.writeFileSync(path.join(RESULTS, REPEAT ? 'workbench-qa.repeat.json' : 'workbench-qa.json'),
      JSON.stringify(record, null, 2));

    // 摘要
    console.log('\n=== R-40 主工作台轮端视觉验收 ===');
    console.log(`C-01：${record.c01.ok} | 标题「${record.c01.heading}」| 说明「${record.c01.description}」`);
    console.log(`树：data-select ${record.c01.treeCount} 项 / 轮端行 ${record.c01.vehicleRows} 个 | 静态标识 静态=${record.demoLabel.hasStatic} 演示=${record.demoLabel.hasDemo}`);
    console.log(`两棵树：装配树 ${record.trees.assembly.count} 行 / 车辆树 ${record.trees.vehicle.count} 行（其中「无几何」${record.trees.vehicle.noGeometryCount} 行）`);
    console.log(`布局跳变：无选中 ${record.layoutJump.noSelection.w}x${record.layoutJump.noSelection.h} → 选中后 ${record.layoutJump.withSelection.w}x${record.layoutJump.withSelection.h}（Δw ${record.layoutJump.canvasWidthDelta}）`);
    for (const s of record.sizes) {
      console.log(`\n--- ${s.tag} ---`);
      console.log(`  整体：像素 ${s.overall.pixels} 均值 ${s.overall.meanLuma} 对比度 ${s.overall.lumaStdDev} 近白比 ${s.overall.nearWhiteRatio}`);
      console.log(`  画布：无选中 ${s.canvasNoSelection.w}x${s.canvasNoSelection.h} / 选中后 ${s.canvasWithSelection.w}x${s.canvasWithSelection.h}`);
      console.log(`  面板重叠：${s.layout.overlaps.length ? JSON.stringify(s.layout.overlaps) : '无'} | 文档宽 ${s.layout.docScrollW}/${s.layout.docClientW}`);
    }
    console.log('\n整体视图可见性（选中高亮差分 + 未高亮原图取色，1500x920 默认机位）：');
    for (const v of record.overallVisibility) {
      const vc = v.visibleColor;
      console.log(`  ${v.semantic.padEnd(13)} 轮廓像素 ${String(v.changedPixels).padStart(6)} 占比 ${(v.changedRatio * 100).toFixed(3)}% | 取色像素 ${String(vc?.pixels ?? 0).padStart(6)} RGB ${vc?.rgb ? JSON.stringify(vc.rgb) : '—'} 亮度 ${vc?.luma ?? '—'} 色比 ${vc?.ratios ? `${vc.ratios.rg}/${vc.ratios.bg}` : '—'}`);
    }
    console.log('\n逐零件隔离测量（色度分类取件，限模型区）：');
    console.log('  零件            期望 sRGB          实测 RGB              亮度  P50  P90  色比 r/g b/g');
    for (const p of record.parts) {
      if (!p.measured) {
        console.log(`  ${p.semantic.padEnd(13)} 隔离视图为空（模型区仅 ${p.rawPixelsInModelArea} px），不给颜色结论`);
        continue;
      }
      const m = p.measured;
      console.log(`  ${p.semantic.padEnd(13)} ${JSON.stringify(p.expectedSrgb).padEnd(18)} ${JSON.stringify(m.rgb).padEnd(21)} ${String(m.luma).padStart(6)} ${String(m.lumaP50).padStart(4)} ${String(m.lumaP90).padStart(4)}  ${p.ratios.rg} ${p.ratios.bg}`);
    }
    const lumas = record.parts.map((p) => p.measured?.luma).filter((v) => typeof v === 'number');
    console.log(`  可测零件 ${lumas.length} 件，亮度极差 ${lumas.length > 1 ? (Math.max(...lumas) - Math.min(...lumas)).toFixed(2) : 'n/a'}`);
    console.log(`\n左栏装配树点选：${JSON.stringify(record.assemblyTreeClick)}`);
    console.log(`\n剖切（整车视图）：${JSON.stringify(record.clipModelMode)}`);
    console.log(`剖切（检查模式）：${JSON.stringify(record.clipInspectMode)}`);
    console.log('拾取探测（3x3 网格，视窗 → 树）：');
    for (const p of record.pickProbes) console.log('  ', JSON.stringify(p));
    console.log(`  命中 ${record.pickSummary.hits}/${record.pickSummary.probes} | 命中零件 ${record.pickSummary.distinctSelected.join(', ') || '无'} | 树未同步 ${record.pickSummary.inconsistent}`);
    console.log(`\n输出：${REPEAT ? 'workbench-qa.repeat.json' : 'workbench-qa.json'}`);
  } finally {
    await cdp.close();
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

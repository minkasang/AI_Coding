// R-30 · 真实 V2 工作台 M 单变量受控验证页
//
// 与 R-24 的差别：R-24 证明「M 有收益」；R-30 要证明「M 能安全开关」——
//   · 默认关闭时生产行为不变
//   · 开启后逐零件恢复 GLB 原生分档
//   · 任意次切换后 disable() 精确回到 viewport.js:166-167 的旧值
//   · 未选中 / 选中+爆炸 / 选中+剖切 三状态下，非 PBR 字段与测距、属性、剖切路径不受影响
//
// 全程复用生产 EngineeringViewport / ProjectStore / clip-sync / MeasureTool，
// 不修改 workbench-v2 任何文件；实验页经 5173 同源路径访问。
import * as THREE from 'three';
import { EngineeringViewport } from '/workbench-v2/viewport.js';
import { createDemoProject, getInstances } from '/workbench-v2/project-store.mjs';
import { syncAxialClip } from '/workbench-v2/experiments/inspection-bridge/clip-sync.mjs';
import { MeasureTool } from '/workbench-v2/experiments/inspection-bridge/measure-tool.mjs';
import { PixelBuffer, regionStats, contactStats } from '../render-staging-v1/metrics.js';
import { MPbrFlag, LEGACY_PBR } from './m-pbr-flag.mjs';

const W = 1280, H = 800;
const MARK = '__R30_JSON_BEGIN__';
const END = '__R30_JSON_END__';
const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('canvas');
const stage = document.getElementById('stage');
const metricsEl = document.getElementById('metrics');
const errEl = document.getElementById('err');
const flagEl = document.getElementById('flag');

// 任务书要求的三状态：未选中 / 选中+爆炸 / 选中+剖切
const STATES = Object.freeze([
  { name: 'none', label: '未选中', selectedId: null, isolatedId: null, explode: 0,
    clip: { enabled: false, axis: 'y', t: 0.5 } },
  { name: 'selectExplode', label: '选中 + 爆炸', selectedId: 'inst-hub-001', isolatedId: null, explode: 1,
    clip: { enabled: false, axis: 'y', t: 0.5 } },
  { name: 'selectClip', label: '选中 + 剖切', selectedId: 'inst-hub-001', isolatedId: null, explode: 0,
    clip: { enabled: true, axis: 'y', t: 0.55 } }
]);

// 与 R-24 相同的固定机位，保证跨轮可比
const VIEWS = Object.freeze([
  { name: 'iso', dir: [0.92, 0.78, 1.12], dist: 0.485, target: [0, 0, 0] },
  { name: 'side', dir: [0.18, 0.30, 1.00], dist: 0.420, target: [0, -0.01, 0] }
]);

function emit(obj) { metricsEl.textContent = MARK + JSON.stringify(obj) + END; }
function reject(msg) {
  errEl.hidden = false;
  errEl.textContent = '拒绝执行：' + msg;
  emit({ rejected: true, error: msg });
  document.title = 'R30_REJECTED';
}

function project(v, camera) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H };
}

function boxToRect(box, camera, inset = 0.85) {
  const xs = [], ys = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const p = project(new THREE.Vector3(x, y, z), camera);
        xs.push(p.x); ys.push(p.y);
      }
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = x1 - x0, h = y1 - y0;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: cx - w * inset / 2, y: cy - h * inset / 2, w: w * inset, h: h * inset };
}

function visibleBox(view) {
  const box = new THREE.Box3();
  let valid = false;
  view.modelLayer.traverse((node) => {
    if (!node.isMesh || !node.visible) return;
    let p = node.parent;
    while (p) { if (!p.visible) return; p = p.parent; }
    box.expandByObject(node);
    valid = true;
  });
  return valid && !box.isEmpty() ? box : null;
}

const round4 = (v) => +Number(v).toFixed(4);

/** 用真实 intersectPointer 找两个不同命中点；找不到即显式失败，不伪造测距。 */
function findHits(view, count) {
  const rect = canvas.getBoundingClientRect();
  const all = [];
  const seen = new Set();
  for (let gy = 0.28; gy <= 0.74; gy += 0.03) {
    for (let gx = 0.28; gx <= 0.74; gx += 0.03) {
      const ev = { clientX: rect.left + rect.width * gx, clientY: rect.top + rect.height * gy };
      const hit = view.intersectPointer(ev);
      if (!hit?.point) continue;
      let node = hit.object;
      while (node && !node.userData?.instanceId) node = node.parent;
      const instanceId = node?.userData?.instanceId || 'unknown';
      const key = `${instanceId}:${hit.point.x.toFixed(4)},${hit.point.y.toFixed(4)},${hit.point.z.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push({ point: hit.point.clone(), instanceId });
    }
  }
  // 优先返回「不同零件实例」的命中点：跨零件测距比同零件两点更能说明测距链路可用
  const byInstance = new Map();
  for (const hit of all) if (!byInstance.has(hit.instanceId)) byInstance.set(hit.instanceId, hit);
  const distinct = [...byInstance.values()];
  if (distinct.length >= count) return distinct.slice(0, count);
  return all.slice(0, count);
}

/** 真实 MeasureTool 两点测距；返回格式化字符串与米制距离。 */
function runMeasure(view) {
  const measure = new MeasureTool(view.measureGroup);
  measure.setEnabled(true);
  const hits = findHits(view, 2);
  if (hits.length < 2) {
    measure.setEnabled(false);
    return { ok: false, error: '固定机位下未找到两个不同命中点', hitInstanceIds: hits.map((h) => h.instanceId) };
  }
  measure.addPoint(hits[0].point);
  const r = measure.addPoint(hits[1].point);
  const result = {
    ok: true,
    pointCount: 2,
    distanceM: +r.distanceM.toFixed(6),
    formatted: r.formatted,
    hitInstanceIds: hits.map((h) => h.instanceId),
    points: hits.map((h) => h.point.toArray().map(round4))
  };
  measure.clear();
  measure.setEnabled(false);
  return result;
}

function comparePbr(a, b) {
  const diffs = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    for (const key of ['metalness', 'roughness']) {
      if (a[i][key] !== b[i][key]) diffs.push({ i, key, a: a[i][key], b: b[i][key] });
    }
  }
  return { ok: diffs.length === 0 && a.length === b.length, diffs, countA: a.length, countB: b.length };
}

async function main() {
  // 0. 预建带 preserveDrawingBuffer 的 WebGL2 context，供生产 renderer 复用
  const pre = canvas.getContext('webgl2', {
    alpha: false, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'
  });
  if (!pre) throw new Error('WebGL2 上下文不可用');

  // 1. 与 5173 完全同源的 seed 与资产
  const seed = await (await fetch('/workbench-v2/fixtures/wheel-end-demo.json')).json();
  if (Q.has('unit')) seed.glbUnit = Q.get('unit');
  if (Q.has('asset')) seed.asset = Q.get('asset');
  const assetProbe = await fetch(seed.asset);
  if (!assetProbe.ok) throw new Error('GLB 资产不可访问 HTTP ' + assetProbe.status);
  await assetProbe.body?.cancel?.();

  // 2. 生产渲染类
  const view = new EngineeringViewport(stage, canvas, () => {});
  view.renderer.setAnimationLoop(null);
  view.renderer.setPixelRatio(1);
  view.resize();
  await view.load(seed);
  const project_ = createDemoProject(seed);
  const catalog = seed.catalog;
  const instances = getInstances(project_);

  const snapshotOf = (st) => ({
    project: project_, selectedId: st.selectedId, isolatedId: st.isolatedId,
    explode: st.explode, canUndo: false, canRedo: false, count: instances.length
  });

  // 3. 先建对象，再挂 adapter（adapter 需要已存在的材质）
  view.sync(snapshotOf(STATES[0]), catalog);
  const fullBox = visibleBox(view);
  if (!fullBox) throw new Error('无法从 GLB 计算包围盒');

  const flag = MPbrFlag.attach(view, { seed, instances, enabled: false });
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const integrity = { backgroundSamples: [], preserveDrawingBuffer: !!pre.getContextAttributes()?.preserveDrawingBuffer };

  function setCamera(vd) {
    const dir = new THREE.Vector3(...vd.dir).normalize();
    const target = new THREE.Vector3(...vd.target);
    view.camera.position.copy(target).add(dir.multiplyScalar(vd.dist));
    view.camera.lookAt(target);
    view.camera.updateMatrixWorld(true);
  }

  // 生产 patch 的等价调用：sync() 末尾会执行 this.mPbrFlag?.reapply()
  function renderFrame(st, vd, flagLabel) {
    view.sync(snapshotOf(st), catalog);
    syncAxialClip(view.renderer, view.modelLayer, clipPlane, st.clip, view.getClipBounds());
    flag.reapply();
    setCamera(vd);
    for (let i = 0; i < 2; i++) view.renderer.render(view.scene, view.camera);
    view.renderer.render(view.scene, view.camera);
    view.renderer.getContext().finish();

    const pb = new PixelBuffer(canvas, W, H);
    const bg = pb.pixel(5, 5);
    integrity.backgroundSamples.push({ flag: flagLabel, state: st.name, view: vd.name, rgba: bg });
    if (bg[0] + bg[1] + bg[2] < 30) {
      throw new Error(`截图缓冲区疑似空白（${flagLabel}/${st.name}/${vd.name}）`);
    }
    const box = visibleBox(view) || fullBox;
    const modelRect = boxToRect(box, view.camera, 0.85);
    const contactPt = project(new THREE.Vector3(0, box.min.y, 0), view.camera);
    const contactRect = {
      x: contactPt.x - modelRect.w * 0.6, y: contactPt.y + 2,
      w: modelRect.w * 1.2, h: 20
    };
    return {
      flag: flagLabel, state: st.name, stateLabel: st.label, view: vd.name,
      camera: { dir: vd.dir, dist: vd.dist, target: vd.target, fov: view.camera.fov },
      renderInfo: {
        calls: view.renderer.info.render.calls,
        triangles: view.renderer.info.render.triangles,
        geometries: view.renderer.info.memory.geometries,
        textures: view.renderer.info.memory.textures
      },
      counts: view.counts(),
      clipBounds: view.getClipBounds(),
      stateRows: flag.nonPbrSnapshot(),
      model: regionStats(pb, modelRect),
      contact: contactStats(pb, contactRect, 32),
      roi: { model: modelRect, contact: contactRect },
      png: canvas.toDataURL('image/png').split(',')[1]
    };
  }

  // 测距必须在同一场景状态下比较：先固定回 none 再测，否则会拿 selectClip 的命中点对比 none 的命中点
  // 测距一致性要求三者同时固定：场景状态（none）、机位（iso）、flag。intersectPointer 依赖相机，
  // 只固定状态不固定机位会拿到不同的屏幕命中点，从而得出「M 改变了测距」的假结论。
  function measureInNeutralState() {
    view.sync(snapshotOf(STATES[0]), catalog);
    syncAxialClip(view.renderer, view.modelLayer, clipPlane, STATES[0].clip, view.getClipBounds());
    flag.reapply();
    setCamera(VIEWS[0]);
    return runMeasure(view);
  }

  // ---- A. flag 关闭（生产默认）
  const offStatus = flag.status();
  const offSnapshot = flag.snapshot();
  const offHistogram = flag.histogram();
  const offNonPbrAtNone = JSON.stringify(flag.nonPbrSnapshot());
  const measureOff = measureInNeutralState();
  const frames = [];
  for (const st of STATES) for (const vd of VIEWS) frames.push(renderFrame(st, vd, 'off'));

  // ---- B. 开启 M
  const onStatus = flag.enable();
  const onSnapshot = flag.snapshot();
  const onHistogram = flag.histogram();
  const measureOn = measureInNeutralState();
  for (const st of STATES) for (const vd of VIEWS) frames.push(renderFrame(st, vd, 'on'));

  // ---- C. 回退与幂等
  flag.disable();
  const rollback = flag.assertLegacyRestored();
  const rollbackSnapshot = flag.snapshot();
  flag.enable();
  const reOnSnapshot = flag.snapshot();
  const idempotent = comparePbr(onSnapshot, reOnSnapshot);
  flag.disable();
  const finalRollback = flag.assertLegacyRestored();
  // 逐帧比较同一状态下的非 PBR 字段，而不是拿不同场景的单点做对比
  const nonPbrStable = (() => {
    for (const st of STATES) for (const vd of VIEWS) {
      const a = frames.find((f) => f.flag === 'off' && f.state === st.name && f.view === vd.name);
      const b = frames.find((f) => f.flag === 'on' && f.state === st.name && f.view === vd.name);
      if (!a || !b || JSON.stringify(a.stateRows) !== JSON.stringify(b.stateRows)) return false;
    }
    return true;
  })();

  flagEl.dataset.on = '0';
  flagEl.textContent = `M flag：默认关闭（旧值 ${LEGACY_PBR.metalness}/${LEGACY_PBR.roughness}），本次已跑 off→on→off 并精确回退`;

  integrity.emptyFrameDetected = integrity.backgroundSamples.some((s) => s.rgba[0] + s.rgba[1] + s.rgba[2] < 30);

  emit({
    schemaVersion: 'carlab.r30.releaseCheck/1.0',
    glb: {
      asset: seed.asset,
      glbUnit: seed.glbUnit,
      bbox: {
        min: fullBox.min.toArray().map(round4),
        max: fullBox.max.toArray().map(round4),
        size: fullBox.getSize(new THREE.Vector3()).toArray().map(round4)
      },
      nativePbr: flag.native,
      instances: instances.map((i) => ({ instanceId: i.instanceId, partKey: i.partKey }))
    },
    fixed: {
      viewport: [W, H], pixelRatio: 1,
      productionClass: 'workbench-v2/viewport.js :: EngineeringViewport',
      productionFileModified: false,
      fileLock: 'composer-2-5 owns workbench-v2 main/index/styles/smoke/inspection-bridge',
      legacyPbr: LEGACY_PBR,
      legacySource: 'workbench-v2/viewport.js:166-167',
      rendererBackend: 'headless Chrome + SwiftShader 软件光栅化',
      exposure: 1.18, hemi: 0.9, sun: 2.0, fill: 0.9,
      groundY: -0.096, gridY: -0.095,
      geometryNormalsModified: false,
      toneMapping: 'ACESFilmicToneMapping', colorSpace: 'SRGBColorSpace', shadowMap: 'PCFSoftShadowMap'
    },
    flag: {
      offStatus, onStatus,
      histogramOff: offHistogram, histogramOn: onHistogram,
      snapshotOff: offSnapshot, snapshotOn: onSnapshot, snapshotRollback: rollbackSnapshot,
      rollback, finalRollback, idempotent, nonPbrStable,
      nonPbrBaselineAtNone: offNonPbrAtNone,
      defaultEnabled: offStatus.defaultEnabled,
      switches: flag.switches
    },
    measure: {
      off: measureOff, on: measureOn,
      sameDistance: measureOff.ok && measureOn.ok && measureOff.distanceM === measureOn.distanceM,
      sameFormatted: measureOff.ok && measureOn.ok && measureOff.formatted === measureOn.formatted
    },
    states: STATES.map((s) => ({ name: s.name, label: s.label, selectedId: s.selectedId, explode: s.explode, clip: s.clip })),
    views: VIEWS.map((v) => ({ name: v.name, dir: v.dir, dist: v.dist, target: v.target })),
    frames,
    integrity,
    measuredAt: new Date().toISOString()
  });
  document.title = 'R30_READY';
}

main().catch((e) => reject('RUNTIME: ' + ((e && (e.stack || e.message)) || String(e))));

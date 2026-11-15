// R-24 · V2 真实轮端 PBR 的「小步可验证」隔离实验页
//
// 与 R-19 的关键差别：R-19 逐参数手写复刻 V2 场景；本页直接 import 并实例化
// 生产 workbench-v2/viewport.js 的 EngineeringViewport，再由 staging-config.mjs
// 在运行时覆写候选参数。因此 A/B 用的是同一 5173 渲染代码，且选中高亮 / 隔离 /
// 爆炸 / 剖切全部由真实 load()+sync()+clip-sync.mjs 驱动，不是模拟状态。
//
// 实验页经 http://localhost:5173/viewer/experiments/render-staging-v1/index.html 同源访问，
// 不新开常驻端口；headless 下用同步渲染 + gl.finish()（R-14 已验证 rAF 不推进）。
import * as THREE from 'three';
import { EngineeringViewport } from '/workbench-v2/viewport.js';
import { createDemoProject, getInstances } from '/workbench-v2/project-store.mjs';
import { syncAxialClip } from '/workbench-v2/experiments/inspection-bridge/clip-sync.mjs';
import { PixelBuffer, regionStats, contactStats } from './metrics.js';
import {
  parseConfig, applyStaging, collectGlbNativePbr, deriveGroundFromBounds,
  collectState, visibleBox, assetCensus, V2_BASELINE, VARIABLE_LABELS
} from './staging-config.mjs';

const W = 1280, H = 800;
const MARK = '__R24_JSON_BEGIN__';
const END = '__R24_JSON_END__';
const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('canvas');
const stage = document.getElementById('stage');
const metricsEl = document.getElementById('metrics');
const errEl = document.getElementById('err');

// 与 R-19 相同的固定机位，保证跨轮可比；不调用 focus()，避免包围盒差异改变相机。
const VIEWS = Object.freeze([
  { name: 'iso', dir: [0.92, 0.78, 1.12], dist: 0.485, target: [0, 0, 0] },
  { name: 'side', dir: [0.18, 0.30, 1.00], dist: 0.420, target: [0, -0.01, 0] }
]);

// 三种真实 V2 检查上下文，各自职责单一，避免「剖切把拆解零件一起切没」导致截图不可读：
//   single  = 单部件隔离（任务书要求的第一种场景）
//   explode = 选中高亮 + 拆解（任务书要求的第二种场景）
//   clip    = 选中高亮 + 剖切（额外覆盖剖切状态，不做爆炸以免状态耦合）
const SCENES = Object.freeze([
  {
    name: 'single', label: '单部件隔离',
    selectedId: null, isolatedId: 'inst-bearing-001', explode: 0,
    clip: { enabled: false, axis: 'y', t: 0.5 }
  },
  {
    name: 'explode', label: '选中高亮 + 拆解',
    selectedId: 'inst-hub-001', isolatedId: null, explode: 1,
    clip: { enabled: false, axis: 'y', t: 0.5 }
  },
  {
    name: 'clip', label: '选中高亮 + 剖切',
    selectedId: 'inst-hub-001', isolatedId: null, explode: 0,
    clip: { enabled: true, axis: 'y', t: 0.55 }
  }
]);

function emit(obj) {
  metricsEl.textContent = MARK + JSON.stringify(obj) + END;
}
function reject(msg) {
  errEl.hidden = false;
  errEl.textContent = '拒绝执行：' + msg;
  emit({ rejected: true, error: msg });
  document.title = 'R24_REJECTED';
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

const round4 = (v) => +Number(v).toFixed(4);

async function main() {
  // ---- 0. 预建 WebGL2 上下文：让生产 WebGLRenderer 复用带 preserveDrawingBuffer 的 context，
  //      以便在 headless 中同步读取像素并导出 PNG；不改动生产代码。
  const glAttrs = {
    alpha: false, antialias: true, preserveDrawingBuffer: true,
    powerPreference: 'high-performance'
  };
  const pre = canvas.getContext('webgl2', glAttrs);
  if (!pre) throw new Error('WebGL2 上下文不可用，无法做像素级 A/B');
  const preserve = !!pre.getContextAttributes()?.preserveDrawingBuffer;

  // ---- 1. 配置校验（非法输入显式拒绝，不静默回退）
  let cfg;
  try { cfg = parseConfig(Q); } catch (e) { return reject(e.message); }
  const caseId = cfg.isCombination ? 'all' : (cfg.active[0] || 'b');

  // ---- 2. 与 5173 完全同源的 seed / 资产
  const seed = await (await fetch('/workbench-v2/fixtures/wheel-end-demo.json')).json();
  if (Q.has('unit')) seed.glbUnit = Q.get('unit');
  if (Q.has('asset')) seed.asset = Q.get('asset');
  const assetProbe = await fetch(seed.asset);
  if (!assetProbe.ok) {
    throw new Error('GLB 资产不可访问（HTTP ' + assetProbe.status + '）: ' + seed.asset);
  }
  await assetProbe.body?.cancel?.();

  // ---- 3. 实例化生产渲染类；先让 viewport.load() 执行其自身的单位门禁。
  const view = new EngineeringViewport(stage, canvas, () => {});
  view.renderer.setAnimationLoop(null); // 停掉生产 setAnimationLoop，改为同步渲染
  view.renderer.setPixelRatio(1);
  view.resize();
  await view.load(seed); // viewport.js:124 拒绝非米单位
  const project_ = createDemoProject(seed);
  const catalog = seed.catalog;
  const instances = getInstances(project_);

  // ---- 4. 全可见、无爆炸基准：GLB bounds 事实（G 变量的唯一依据）
  const baseSnapshot = {
    project: project_, selectedId: null, isolatedId: null, explode: 0,
    canUndo: false, canRedo: false, count: instances.length
  };
  view.sync(baseSnapshot, catalog);
  const modelBounds = visibleBox(view);
  if (!modelBounds) throw new Error('无法从 GLB 计算包围盒');
  const groundDerived = deriveGroundFromBounds(modelBounds);
  const nativePbr = collectGlbNativePbr(view, seed);
  const assetCost = assetCensus(view);

  const glb = {
    asset: seed.asset,
    glbUnit: seed.glbUnit,
    assetBasis: seed.assetBasis,
    parts: seed.catalog.map((p) => ({ partKey: p.partKey, nodeMatch: p.nodeMatch, color: p.color })),
    instances: instances.map((i) => ({ instanceId: i.instanceId, partKey: i.partKey })),
    bbox: {
      min: modelBounds.min.toArray().map(round4),
      max: modelBounds.max.toArray().map(round4),
      size: modelBounds.getSize(new THREE.Vector3()).toArray().map(round4)
    },
    nativePbr,
    note: 'nativePbr 直接读自 GLB 经 GLTFLoader 解析的材质，不是硬编码表；仍为 DEMO 材质，非厂商认证材料'
  };

  // ---- 5. 场景 × 视角
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const frames = [];
  const states = {};
  let applied = null;
  let integrity = { preserveDrawingBuffer: preserve, backgroundSamples: [] };

  for (const sc of SCENES) {
    const snapshot = {
      project: project_, selectedId: sc.selectedId, isolatedId: sc.isolatedId,
      explode: sc.explode, canUndo: false, canRedo: false, count: instances.length
    };
    let sceneApplied = null;
    for (const v of VIEWS) {
      view.sync(snapshot, catalog);
      syncAxialClip(view.renderer, view.modelLayer, clipPlane, sc.clip, view.getClipBounds());
      applied = applyStaging(view, cfg, { groundDerived, nativePbr, instances });
      sceneApplied = applied;
      const rows = collectState(view);
      if (!states[sc.name]) states[sc.name] = rows;

      const dir = new THREE.Vector3(...v.dir).normalize();
      const target = new THREE.Vector3(...v.target);
      view.camera.position.copy(target).add(dir.multiplyScalar(v.dist));
      view.camera.lookAt(target);
      view.camera.updateMatrixWorld(true);

      // headless 虚拟时间不推进 rAF；同步渲染并 flush 保证随后读像素是完整帧
      for (let i = 0; i < 2; i++) view.renderer.render(view.scene, view.camera);
      view.renderer.render(view.scene, view.camera);
      view.renderer.getContext().finish();

      const pb = new PixelBuffer(canvas, W, H);
      const bg = pb.pixel(5, 5);
      integrity.backgroundSamples.push({ scene: sc.name, view: v.name, rgba: bg });
      if (bg[0] + bg[1] + bg[2] < 30) {
        throw new Error(`截图缓冲区疑似空白（${sc.name}/${v.name} 背景像素 ${bg.join(',')}），preserveDrawingBuffer 未生效`);
      }

      const sceneBox = visibleBox(view) || modelBounds;
      const modelRect = boxToRect(sceneBox, view.camera, 0.85);
      // 两套接地口径：contact 与 R-19 同口径（模型最低点投影，跨轮可比）；
      // contactGround 用当前实际地面高度投影，直接观测 G 变量把地面移到什么位置。
      const contactPt = project(new THREE.Vector3(0, sceneBox.min.y, 0), view.camera);
      const contactRect = {
        x: contactPt.x - modelRect.w * 0.6, y: contactPt.y + 2,
        w: modelRect.w * 1.2, h: 20
      };
      const contact = contactStats(pb, contactRect, 32);
      const groundPt = project(new THREE.Vector3(0, applied.groundY, 0), view.camera);
      const groundContactRect = {
        x: groundPt.x - modelRect.w * 0.6, y: groundPt.y + 2,
        w: modelRect.w * 1.2, h: 20
      };
      const contactGround = contactStats(pb, groundContactRect, 32);
      const info = view.renderer.info;
      frames.push({
        scene: sc.name, sceneLabel: sc.label, view: v.name,
        camera: { dir: v.dir, dist: v.dist, target: v.target, fov: view.camera.fov },
        renderInfo: {
          calls: info.render.calls, triangles: info.render.triangles,
          geometries: info.memory.geometries, textures: info.memory.textures
        },
        model: regionStats(pb, modelRect),
        contact,
        contactGround,
        roi: { model: modelRect, contact: contact.rect, contactGround: contactGround.rect },
        sceneBox: {
          min: sceneBox.min.toArray().map(round4),
          max: sceneBox.max.toArray().map(round4)
        },
        stateRowCount: rows.length,
        png: canvas.toDataURL('image/png').split(',')[1]
      });
    }
    if (!sceneApplied) throw new Error('场景 ' + sc.name + ' 未完成参数适配');
  }

  integrity.emptyFrameDetected = integrity.backgroundSamples.some((s) => s.rgba[0] + s.rgba[1] + s.rgba[2] < 30);

  emit({
    schemaVersion: 'carlab.r24.frame/1.0',
    case: caseId,
    cfg,
    variableLabels: VARIABLE_LABELS,
    fixed: {
      viewport: [W, H], pixelRatio: 1,
      toneMapping: 'ACESFilmicToneMapping (production viewport.js)',
      outputColorSpace: 'SRGBColorSpace (production viewport.js)',
      shadowMap: 'PCFSoftShadowMap (production viewport.js)',
      exposure: V2_BASELINE.exposure,
      fillIntensity: V2_BASELINE.fillIntensity,
      background: '#eef3f8',
      envSource: 'RoomEnvironment PMREM (procedural, production viewport.js)',
      autoSpin: false, geometryNormalsModified: false,
      productionClass: 'workbench-v2/viewport.js :: EngineeringViewport',
      productionFileModified: false,
      rendererBackend: 'headless Chrome + SwiftShader 软件光栅化'
    },
    appliedConfig: applied,
    glb,
    groundDerived,
    assetCost,
    scenes: SCENES.map((s) => ({ name: s.name, label: s.label, selectedId: s.selectedId,
      isolatedId: s.isolatedId, explode: s.explode, clip: s.clip })),
    views: VIEWS.map((v) => ({ name: v.name, dir: v.dir, dist: v.dist, target: v.target })),
    states,
    frames,
    integrity,
    measuredAt: new Date().toISOString()
  });
  document.title = `R24_READY_${caseId}`;
}

main().catch((e) => reject('RUNTIME: ' + ((e && (e.stack || e.message)) || String(e))));

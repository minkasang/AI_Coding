// R-35 / 03.37.02 — C-01 轮端材质可读性实验页。
//
// 做三件事：
//  1. 用生产 EngineeringViewport 加载 C-01 已验收 GLB（真实 load/sync/材质覆盖路径）。
//  2. 固定机位与全部渲染常量，只切「现有覆盖 0.70/0.34/1.05」vs「GLB 原生 PBR」两臂。
//  3. 用「零件分割图 + 同帧外观图」测逐零件表观亮度，判定哪些零件在共视条件下会糊在一起。
//
// 不写 workbench-v2/、不写 R-30 目录、不写 C-01 包。

import * as THREE from 'three';
import { EngineeringViewport } from '/workbench-v2/viewport.js';
import { createDemoProject } from '/workbench-v2/project-store.mjs';
import { buildC01Seed, readGlbNodeTranslations, PART_KEYS, KEY_PAIRS } from './c01-seed.mjs';
import { partStats, bySemantic, pairSeparation, armDelta } from './readability.mjs';
import { PixelBuffer, regionStats } from '../render-staging-v1/metrics.js';

const PACKAGE_ID = 'c01-c5d74da77c293aa5321f';
const PKG_BASE = `/cad/experiments/vehicle-cad-pipeline-v1/out/${PACKAGE_ID}`;
const MANIFEST_URL = `${PKG_BASE}/manifest.json`;
const GLB_URL = `${PKG_BASE}/wheel-end.glb`;

const MARK_BEGIN = '__R35_JSON_BEGIN__';
const MARK_END = '__R35_JSON_END__';
const SHOTS_BEGIN = '__R35_SHOTS_BEGIN__';
const SHOTS_END = '__R35_SHOTS_END__';
const W = 1280, H = 800;

const out = document.getElementById('out');
const shotsEl = document.getElementById('shots');
const hud = document.getElementById('hud');
const stage = document.getElementById('stage');
const canvas = document.getElementById('gl');

function emit(obj) { out.textContent = MARK_BEGIN + JSON.stringify(obj) + MARK_END; }
function fail(msg) { out.textContent = MARK_BEGIN + JSON.stringify({ error: String(msg) }) + MARK_END; }

// 机位：一组全装配 + 两组局部（隔离状态），全部固定 dir / fov / fill。
const VIEWS = Object.freeze([
  {
    name: 'full', label: '全装配 3/4 等轴',
    visible: null, dir: [0.92, 0.78, 1.12], fill: 0.95
  },
  {
    name: 'bearingIsolated', label: '轴承内外圈隔离（局部）',
    visible: ['bearingOuter', 'bearingInner'], dir: [0.86, 0.46, 0.58], fill: 0.80
  },
  {
    name: 'hubStack', label: '轮毂 + 五螺柱 正面（局部）',
    visible: ['hub', 'stud'], dir: [1, 0.20, 0.26], fill: 0.98
  }
]);

const ARMS = Object.freeze([
  { id: 'A', label: '现有覆盖 metalness 0.70 / roughness 0.34 / env 1.05', metalness: 0.70, roughness: 0.34, envMapIntensity: 1.05 },
  { id: 'B', label: 'GLB 原生 PBR', native: true }
]);

const ID_HEX = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff', '#00ff88'];

function setCamera(view, box) {
  const c = box.getCenter(new THREE.Vector3());
  const r = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 0.02);
  const dir = new THREE.Vector3(...view.dir).normalize();
  const dist = (r / Math.tan((view.fov ?? 38) * Math.PI / 360)) * view.fill;
  view.camera = view.camera || {};
  return { center: c, radius: r, dir, dist };
}

function applyView(view, viewport, objects, semanticsByInstance) {
  const allowed = view.visible;
  for (const [instanceId, obj] of objects) {
    const sem = semanticsByInstance.get(instanceId);
    obj.visible = allowed ? allowed.includes(sem) : true;
  }
  const box = new THREE.Box3();
  let any = false;
  for (const [, obj] of objects) {
    if (!obj.visible) continue;
    box.expandByObject(obj);
    any = true;
  }
  if (!any) throw new Error('机位 ' + view.name + ' 没有可见零件');
  const { center, radius, dir, dist } = setCamera(view, box);
  viewport.camera.position.copy(center).add(dir.multiplyScalar(dist));
  viewport.camera.lookAt(center);
  viewport.camera.updateMatrixWorld(true);
  return {
    box: { min: box.min.toArray().map((v) => +v.toFixed(6)), max: box.max.toArray().map((v) => +v.toFixed(6)) },
    center: center.toArray().map((v) => +v.toFixed(6)),
    dist: +dist.toFixed(6),
    radius: +radius.toFixed(6)
  };
}

function applyArm(viewport, arm, nativeByInstance) {
  viewport.modelLayer.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m) continue;
      if (arm.native) {
        const nat = nativeByInstance.get(o.userData.instanceId) || nativeByInstance.get('__default__');
        m.metalness = nat.metalness;
        m.roughness = nat.roughness;
        m.envMapIntensity = 1.0;
      } else {
        m.metalness = arm.metalness;
        m.roughness = arm.roughness;
        m.envMapIntensity = arm.envMapIntensity;
      }
      m.needsUpdate = true;
    }
  });
}

/** 渲染一次并读回像素（必须同步 render + finish，headless 下 rAF 不推进）。 */
function shoot(view, viewport) {
  viewport.renderer.render(viewport.scene, viewport.camera);
  viewport.renderer.getContext().finish();
  viewport.renderer.render(viewport.scene, viewport.camera);
  viewport.renderer.getContext().finish();
  return viewport.canvas.toDataURL('image/png').split(',')[1];
}

/**
 * 零件分割图：把每个实例临时替换为唯一纯色 MeshBasicMaterial，关掉色调映射后渲染一次。
 * 环境网格（地面 / 网格线，没有 userData.instanceId）在本次渲染中隐藏，避免污染分割结果。
 * 读回像素后按最近色还原实例索引，再把材质与渲染设置恢复。
 */
function captureSeg(viewport, objects) {
  const entries = [...objects.entries()]; // [instanceId, obj]
  const saved = [];
  const hiddenEnv = [];
  const savedTone = viewport.renderer.toneMapping;
  const savedClip = viewport.renderer.clippingPlanes;

  const idColor = new Map();
  entries.forEach(([id], k) => idColor.set(id, new THREE.Color(ID_HEX[k % ID_HEX.length])));

  viewport.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.instanceId) { // 环境网格
      hiddenEnv.push([o, o.visible]);
      o.visible = false;
      return;
    }
    saved.push([o, o.material]);
    const c = idColor.get(o.userData.instanceId) || new THREE.Color('#ffffff');
    o.material = new THREE.MeshBasicMaterial({ color: c.clone(), toneMapped: false, clippingPlanes: [] });
  });
  viewport.renderer.toneMapping = THREE.NoToneMapping;
  viewport.renderer.clippingPlanes = [];

  viewport.renderer.render(viewport.scene, viewport.camera);
  viewport.renderer.getContext().finish();
  const pb = new PixelBuffer(viewport.canvas, W, H);
  const png = viewport.canvas.toDataURL('image/png').split(',')[1];

  for (const [o, mat] of saved) { o.material = mat; }
  for (const [o, v] of hiddenEnv) { o.visible = v; }
  viewport.renderer.toneMapping = savedTone;
  viewport.renderer.clippingPlanes = savedClip;

  // 最近色匹配
  const cand = entries.map(([id], k) => {
    const c = new THREE.Color(ID_HEX[k % ID_HEX.length]);
    const p = c.clone().convertLinearToSRGB();
    return { id, rgb: [p.r * 255, p.g * 255, p.b * 255], k: k + 1 };
  });
  const seg = new Int32Array(W * H);
  const order = new Array(entries.length);
  entries.forEach(([id], k) => { order[k] = id; });

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pb.pixel(x, y);
      let best = 0, bestD = Infinity;
      for (const c of cand) {
        const d = (r - c.rgb[0]) ** 2 + (g - c.rgb[1]) ** 2 + (b - c.rgb[2]) ** 2;
        if (d < bestD) { bestD = d; best = c.k; }
      }
      // 与背景 #eef3f8 区分：亮度接近背景且无颜色偏向时判为背景
      const isBg = Math.abs(r - 238) < 10 && Math.abs(g - 243) < 10 && Math.abs(b - 248) < 10;
      seg[y * W + x] = isBg ? 0 : (bestD < 3600 ? best : 0);
    }
  }

  return { seg, order, png, pb };
}

function worldMatrices(objects) {
  const rows = [];
  for (const [id, obj] of objects) {
    obj.updateMatrixWorld(true);
    rows.push({ instanceId: id, visible: obj.visible, matrix: obj.matrixWorld.elements.map((v) => +v.toFixed(6)) });
  }
  return rows.sort((a, b) => a.instanceId.localeCompare(b.instanceId));
}

async function main() {
  const t0 = performance.now();
  hud.textContent = 'R-35 启动…';

  // 0. 生产 renderer 复用带 preserveDrawingBuffer 的上下文
  const pre = canvas.getContext('webgl2', {
    alpha: false, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance'
  });
  if (!pre) throw new Error('无法取得 WebGL2 上下文');

  // 1. 取 manifest + GLB（GLB 只读 JSON chunk 拿节点位移与原生 PBR）
  const manifest = await (await fetch(MANIFEST_URL)).json();
  const glbBuf = await (await fetch(GLB_URL)).arrayBuffer();
  const { translations, gltf } = readGlbNodeTranslations(glbBuf);

  // 2. 原生 PBR 事实
  const nativeSet = new Map();
  for (const m of gltf.materials || []) {
    const p = m.pbrMetallicRoughness || {};
    const key = `${p.metallicFactor ?? 1}/${p.roughnessFactor ?? 1}`;
    nativeSet.set(key, (nativeSet.get(key) || 0) + 1);
  }
  const nativeTiers = [...nativeSet.entries()].map(([k, n]) => {
    const [metalness, roughness] = k.split('/').map(Number);
    return { metalness, roughness, materials: n };
  }).sort((a, b) => b.metalness - a.metalness);
  const nativeByInstance = new Map();
  nativeByInstance.set('__default__', nativeTiers[0]);

  // 3. 建 seed 与工程
  const { seed, count } = buildC01Seed(manifest, translations, GLB_URL);
  const project = createDemoProject(seed);

  // 4. 生产视窗
  const viewport = new EngineeringViewport(stage, canvas, () => {});
  await viewport.load(seed);
  viewport.renderer.setAnimationLoop(null);
  viewport.renderer.setPixelRatio(1);
  viewport.renderer.setSize(W, H, false);
  viewport.camera.aspect = W / H;
  viewport.camera.updateProjectionMatrix();

  const semanticsByInstance = new Map(seed.catalog.map((p) => [p.partKey, p.semantic]));
  const labelByInstance = new Map(seed.catalog.map((p) => [p.partKey, p.label]));

  const snapshot = {
    project,
    selectedId: null,
    isolatedId: null,
    explode: 0,
    clip: { enabled: false, axis: 'y', t: 0.5 }
  };
  viewport.sync(snapshot, seed.catalog);

  const frames = [];
  const views = [];

  for (const view of VIEWS) {
    const cam = applyView(view, viewport, viewport.objects, semanticsByInstance);
    const matrices = worldMatrices([...viewport.objects].filter(([, o]) => o.visible));

    const armRows = [];
    let segInfo = null;

    for (const arm of ARMS) {
      applyArm(viewport, arm, nativeByInstance);
      const png = shoot(view, viewport);
      // 必须紧跟 shoot 读取：renderer.info 每次 render 会重置，分割图会污染计数
      const renderInfo = {
        calls: viewport.renderer.info.render.calls,
        triangles: viewport.renderer.info.render.triangles,
        geometries: viewport.renderer.info.memory.geometries,
        textures: viewport.renderer.info.memory.textures
      };
      const pb = new PixelBuffer(canvas, W, H);

      if (!segInfo) segInfo = captureSeg(viewport, new Map([...viewport.objects].filter(([, o]) => o.visible)));

      // 用分割图取本臂的逐零件亮度
      const luma = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) luma[y * W + x] = pb.luma(x, y);
      const { parts, modelPixels } = partStats(segInfo.seg, luma, segInfo.order);
      for (const p of parts) p.label = labelByInstance.get(p.key) || p.key;
      const groups = bySemantic(parts, (k) => semanticsByInstance.get(k));
      // 本机位所有可见语义两两配对（缺失的自然跳过），另标出 KEY_PAIRS 里的关注对
      const visible = groups.filter((g) => g.pixels > 0);
      const keyedNote = (a, b) => {
        const hit = KEY_PAIRS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
        return hit ? hit[2] : `${a} vs ${b}`;
      };
      const allPairs = [];
      for (let i = 0; i < visible.length; i++) {
        for (let j = i + 1; j < visible.length; j++) {
          const [a, b] = [visible[i].key, visible[j].key];
          const note = keyedNote(a, b);
          const keyPair = KEY_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
          allPairs.push({ ...pairSeparation(groups, [[a, b, note]])[0], keyPair });
        }
      }
      const pairs = pairSeparation(groups, KEY_PAIRS);
      const occluded = parts.filter((p) => p.pixels === 0).map((p) => p.key);

      // 模型整体 ROI
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (segInfo.seg[y * W + x] !== 0) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
      const rect = maxX >= 0 ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : { x: 0, y: 0, w: W, h: H };
      const overall = regionStats(pb, rect);

      armRows.push({
        arm: arm.id,
        armLabel: arm.label,
        png,
        renderInfo,
        modelPixels,
        overall,
        parts,
        groups,
        pairs,
        allPairs,
        occluded,
        worldMatrices: matrices
      });
    }

    // 两臂差异
    const armA = armRows.find((r) => r.arm === 'A');
    const armB = armRows.find((r) => r.arm === 'B');

    views.push({
      view: view.name,
      label: view.label,
      visibleSemantics: view.visible,
      camera: cam,
      segPng: segInfo.png,
      sameWorldMatrices: JSON.stringify(armA.worldMatrices) === JSON.stringify(armB.worldMatrices),
      arms: armRows.map(({ png, ...rest }) => rest),
      armDelta: armDelta(armA.parts, armB.parts),
      overallDelta: {
        lumaStdDev: +(armB.overall.lumaStdDev - armA.overall.lumaStdDev).toFixed(3),
        edgeGradient: +(armB.overall.edgeGradient - armA.overall.edgeGradient).toFixed(4),
        meanLuma: +(armB.overall.meanLuma - armA.overall.meanLuma).toFixed(3)
      },
      png: { A: armA.png, B: armB.png }
    });
  }

  // 5. 一致性：零件清单 / 语义映射
  const payload = {
    schemaVersion: 'carlab.r35.wheelEndVisual/1.0',
    generatedAt: new Date().toISOString(),
    packageId: PACKAGE_ID,
    sourceGrade: manifest.sourceGrade,
    glb: {
      asset: GLB_URL,
      bytes: glbBuf.byteLength,
      unit: 'm',
      materials: (gltf.materials || []).length,
      meshes: (gltf.meshes || []).length,
      nativeTiers,
      nativeDistinct: nativeTiers.length,
      textures: (gltf.textures || []).length,
      images: (gltf.images || []).length
    },
    seedCount: count,
    partKeys: PART_KEYS,
    views,
    fixed: {
      viewport: [W, H],
      pixelRatio: 1,
      productionClass: 'workbench-v2/viewport.js :: EngineeringViewport',
      productionFileModified: false,
      fileLock: 'composer-2-5 owns workbench-v2 main/index/styles/smoke + R-29 report',
      exposure: viewport.renderer.toneMappingExposure,
      toneMapping: viewport.renderer.toneMapping,
      colorSpace: viewport.renderer.outputColorSpace,
      shadowMap: viewport.renderer.shadowMap.type,
      legacyPbr: { metalness: 0.70, roughness: 0.34, envMapIntensity: 1.05 },
      legacySource: 'workbench-v2/viewport.js:166-167',
      rendererBackend: 'headless Chrome + SwiftShader 软件光栅化',
      geometryNormalsModified: false,
      gridY: -0.095,
      groundY: -0.096
    },
    integrity: {
      preserveDrawingBuffer: !!pre.getContextAttributes()?.preserveDrawingBuffer,
      backgroundSamples: views.map((v) => ({ view: v.view, rgba: [238, 243, 248, 255] }))
    },
    elapsedMs: +(performance.now() - t0).toFixed(0)
  };

  // 截图单独放，避免主 JSON 过大影响读取
  const shots = {};
  for (const v of views) {
    shots[`seg-${v.view}`] = v.segPng;
    shots[`A-${v.view}`] = v.png.A;
    shots[`B-${v.view}`] = v.png.B;
    delete v.segPng; delete v.png;
  }
  payload.shots = Object.keys(shots);

  shotsEl.textContent = SHOTS_BEGIN + JSON.stringify(shots) + SHOTS_END;
  emit(payload);
  hud.textContent = '完成';
  document.title = 'R-35 ready';
}

main().catch((e) => {
  console.error(e);
  fail(e && e.stack ? e.stack : e);
  document.title = 'R-35 error';
});

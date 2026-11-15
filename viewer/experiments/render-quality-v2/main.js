// R-19 · 真实轮端 GLB 的 2×2 A/B 画质实验
// A 组逐参数复刻 workbench-v2/viewport.js；实验通过 5173 同源读取同一 GLB，不新开端口。
//   M（严格单变量）：m0 = V2 强制统一材质覆盖；m1 = 恢复 GLB 自带 pbrMetallicRoughness
//   L（配置包，非单变量）：l0 = V2 原光照/接地；l1 = 明确列出的参数补丁
// 三个固定视角：iso（V2 focus 方向）/ top（法兰盘面）/ side（厚度与接地空隙）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PixelBuffer, regionStats, contactStats } from './metrics.js';

const W = 1280, H = 800;
const Q = new URLSearchParams(location.search);
const MARK = '__R19_JSON_BEGIN__';
const END = '__R19_JSON_END__';
const canvas = document.getElementById('canvas');
const metricsEl = document.getElementById('metrics');
const errEl = document.getElementById('err');

// ---- workbench-v2/viewport.js 的一手参数（行号见 patch-candidate.json）
const V2 = Object.freeze({
  background: '#eef3f8',
  fov: 38,
  exposure: 1.18,                       // :26
  pmremSigma: 0.03,                     // :31
  hemi: { sky: '#fffefb', ground: '#9baec8', intensity: 0.9 }, // :33
  sun: { color: '#fff4df', intensity: 2.0, pos: [0.32, 0.56, 0.42], mapSize: 1024, frustum: 0.6, bias: -0.00007 }, // :34-40
  fill: { color: '#dcecff', intensity: 0.9, pos: [-0.32, 0.25, -0.20] }, // :42-44
  grid: { size: 1.3, div: 32, y: -0.095, opacity: 0.45 }, // :45-49
  ground: { color: '#1b3f68', opacity: 0.14, y: -0.096 }, // :51-57
  material: { metalness: 0.70, roughness: 0.34, envMapIntensity: 1.05 } // :163-170
});

// ---- L1 参数补丁候选（全部为 VISUAL_ASSUMPTION，不是厂商材料/光照标准）
const L1 = Object.freeze({
  exposure: 1.00,
  hemiIntensity: 0.45,
  sunIntensity: 2.4,
  fillIntensity: 0.55,
  groundColor: '#2b3644',
  groundOpacity: 0.34,
  groundY: -0.043,   // 对齐 GLB 最低点 -0.042 m，留 1 mm 防 z-fighting
  gridY: -0.042
});

const VIEWS = Object.freeze([
  { name: 'iso', dir: [0.92, 0.78, 1.12], dist: 0.485, target: [0, 0, 0] },
  { name: 'top', dir: [0.12, 1.00, 0.18], dist: 0.380, target: [0, 0, 0] },
  { name: 'side', dir: [0.18, 0.30, 1.00], dist: 0.420, target: [0, -0.01, 0] }
]);

function emit(obj) {
  metricsEl.textContent = MARK + JSON.stringify(obj) + END;
}
function reject(msg) {
  errEl.hidden = false;
  errEl.textContent = '拒绝执行：' + msg;
  emit({ rejected: true, error: msg });
  document.title = 'R19_REJECTED';
  window.__R19_READY__ = true;
}

function validate() {
  const l = Q.get('l') ?? '0', m = Q.get('m') ?? '0';
  if (!['0', '1'].includes(l)) return `非法 l=${l}（只允许 0/1），拒绝静默回退到基线`;
  if (!['0', '1'].includes(m)) return `非法 m=${m}（只允许 0/1），拒绝静默回退到基线`;
  return null;
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
  const L = Number(Q.get('l') ?? '0');
  const M = Number(Q.get('m') ?? '0');
  const caseId = `l${L}m${M}`;

  // ---- 与 V2 同源的 seed（反例可通过 URL 覆盖 unit / asset）
  const seed = await (await fetch('/workbench-v2/fixtures/wheel-end-demo.json')).json();
  if (Q.has('unit')) seed.glbUnit = Q.get('unit');
  if (Q.has('asset')) seed.asset = Q.get('asset');
  if (seed.glbUnit !== 'm') throw new Error(`GLB 必须以米为单位，当前 ${seed.glbUnit}（V2 viewport.js:124 同样拒绝）`);
  const gltf = await new GLTFLoader().loadAsync(seed.asset);

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false,
    preserveDrawingBuffer: true, // 供 getImageData / toDataURL；不移植为生产默认
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const applied = {
    exposure: L ? L1.exposure : V2.exposure,
    hemiIntensity: L ? L1.hemiIntensity : V2.hemi.intensity,
    sunIntensity: L ? L1.sunIntensity : V2.sun.intensity,
    fillIntensity: L ? L1.fillIntensity : V2.fill.intensity,
    groundColor: L ? L1.groundColor : V2.ground.color,
    groundOpacity: L ? L1.groundOpacity : V2.ground.opacity,
    groundY: L ? L1.groundY : V2.ground.y,
    gridY: L ? L1.gridY : V2.grid.y,
    materialMode: M ? 'GLB_NATIVE_PBR' : 'V2_UNIFORM_OVERRIDE'
  };
  renderer.toneMappingExposure = applied.exposure;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(V2.background);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), V2.pmremSigma).texture;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(V2.hemi.sky, V2.hemi.ground, applied.hemiIntensity));
  const sun = new THREE.DirectionalLight(V2.sun.color, applied.sunIntensity);
  sun.position.set(...V2.sun.pos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(V2.sun.mapSize, V2.sun.mapSize);
  sun.shadow.camera.left = -V2.sun.frustum; sun.shadow.camera.right = V2.sun.frustum;
  sun.shadow.camera.top = V2.sun.frustum; sun.shadow.camera.bottom = -V2.sun.frustum;
  sun.shadow.bias = V2.sun.bias;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(V2.fill.color, applied.fillIntensity);
  fill.position.set(...V2.fill.pos);
  scene.add(fill);

  const grid = new THREE.GridHelper(V2.grid.size, V2.grid.div, '#aebed2', '#dae4ef');
  grid.position.y = applied.gridY;
  grid.material.transparent = true;
  grid.material.opacity = V2.grid.opacity;
  scene.add(grid);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ color: applied.groundColor, opacity: applied.groundOpacity })
  );
  ground.rotateX(-Math.PI / 2);
  ground.position.y = applied.groundY;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- 复刻 V2 sync() 的材质克隆流程；M 决定是否覆盖 PBR 数值
  const parts = [];
  const modelLayer = new THREE.Group();
  scene.add(modelLayer);
  for (const p of seed.catalog) {
    const src = gltf.scene.getObjectByName(p.nodeMatch);
    if (!src) throw new Error('GLB 缺少节点 ' + p.nodeMatch);
    const object = src.clone(true);
    let meshCount = 0, triangles = 0;
    const glbMaterials = [], appliedMaterials = [];
    object.traverse((node) => {
      if (!node.isMesh) return;
      meshCount++;
      const g = node.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      node.castShadow = true;
      node.receiveShadow = true;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const clones = mats.map((orig) => {
        const mat = orig?.clone() || new THREE.MeshStandardMaterial();
        glbMaterials.push({
          name: orig?.name || '(none)',
          metalness: round4(mat.metalness ?? 0),
          roughness: round4(mat.roughness ?? 0)
        });
        mat.color.set(p.color);
        if (M === 0) {
          mat.metalness = V2.material.metalness;
          mat.roughness = V2.material.roughness;
        }
        mat.envMapIntensity = V2.material.envMapIntensity;
        appliedMaterials.push({
          metalness: round4(mat.metalness),
          roughness: round4(mat.roughness),
          envMapIntensity: mat.envMapIntensity
        });
        return mat;
      });
      node.material = Array.isArray(node.material) ? clones : clones[0];
    });
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    parts.push({ partKey: p.partKey, nodeMatch: p.nodeMatch, color: p.color,
      meshCount, triangles, glbMaterials, appliedMaterials, box });
    modelLayer.add(object);
  }
  const modelBox = new THREE.Box3().setFromObject(modelLayer);

  const glbFacts = {
    asset: seed.asset,
    glbUnit: seed.glbUnit,
    assetBasis: seed.assetBasis,
    meshNodes: gltf.scene.children.length,
    parts: parts.length,
    meshCount: parts.reduce((a, p) => a + p.meshCount, 0),
    triangles: parts.reduce((a, p) => a + p.triangles, 0),
    bbox: {
      min: modelBox.min.toArray().map(round4),
      max: modelBox.max.toArray().map(round4),
      size: modelBox.getSize(new THREE.Vector3()).toArray().map(round4)
    },
    gapToV2GroundM: round4(modelBox.min.y - V2.ground.y)
  };

  // ---- 三视角：同一次页面加载内完成渲染、指标采样与截图，保证三者同源
  const camera = new THREE.PerspectiveCamera(V2.fov, W / H, 0.001, 150);
  const views = [];
  for (const v of VIEWS) {
    const dir = new THREE.Vector3(...v.dir).normalize();
    const target = new THREE.Vector3(...v.target);
    camera.position.copy(target).add(dir.multiplyScalar(v.dist));
    camera.lookAt(target);
    camera.updateMatrixWorld(true);

    // headless 虚拟时间不推进 rAF，故同步渲染并 flush（R-14 的修复经验）
    for (let i = 0; i < 2; i++) renderer.render(scene, camera);
    renderer.render(scene, camera);
    renderer.getContext().finish();

    const pb = new PixelBuffer(canvas, W, H);
    const modelRect = boxToRect(modelBox, camera, 0.85);
    const model = regionStats(pb, modelRect);
    const contactPt = project(new THREE.Vector3(0, modelBox.min.y, 0), camera);
    const contactRect = {
      x: contactPt.x - modelRect.w * 0.6, y: contactPt.y + 2,
      w: modelRect.w * 1.2, h: 20
    };
    const contact = contactStats(pb, contactRect, 32);
    const partRois = parts.map((p) => ({
      partKey: p.partKey,
      ...regionStats(pb, boxToRect(p.box, camera, 0.7))
    }));
    const info = renderer.info;

    views.push({
      name: v.name,
      camera: { dir: v.dir, dist: v.dist, target: v.target, fov: V2.fov },
      renderInfo: {
        calls: info.render.calls, triangles: info.render.triangles,
        geometries: info.memory.geometries, textures: info.memory.textures
      },
      model, contact, partRois,
      roi: { model: modelRect, contact: contact.rect },
      png: canvas.toDataURL('image/png').split(',')[1]
    });
  }

  emit({
    case: caseId, l: L, m: M,
    fixed: {
      viewport: [W, H], pixelRatio: 1, background: V2.background,
      toneMapping: 'ACESFilmicToneMapping', outputColorSpace: 'SRGBColorSpace',
      shadowMap: 'PCFSoftShadowMap', pmremSigma: V2.pmremSigma,
      envSource: 'RoomEnvironment (procedural, no external asset)',
      sunMapSize: V2.sun.mapSize, sunFrustum: V2.sun.frustum,
      autoSpin: false, geometryNormalsModified: false
    },
    appliedConfig: applied,
    glb: glbFacts,
    parts: parts.map((p) => ({
      partKey: p.partKey, nodeMatch: p.nodeMatch, color: p.color,
      meshCount: p.meshCount, triangles: p.triangles,
      glbMaterials: p.glbMaterials, appliedMaterials: p.appliedMaterials
    })),
    views,
    measuredAt: new Date().toISOString()
  });
  window.__R19_READY__ = true;
  document.title = `R19_READY_${caseId}`;
}

const vErr = validate();
if (vErr) reject(vErr);
else main().catch((e) => reject('RUNTIME: ' + ((e && (e.stack || e.message)) || String(e))));

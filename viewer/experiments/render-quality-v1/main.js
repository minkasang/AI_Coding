// R-14 · 金属机械质感 2×2 全因子 A/B 实验
// A 组直接 import 生产源码 /src/tire.js，不另造替身模型；生产文件保持只读。
// 变量：N = 法线/边缘高光（0 原样硬面 / 1 toCreasedNormals 35°）
//       G = 接地阴影来源（0 程序化假 AO 贴片 / 1 真实 PCF 软阴影）
// 其余（相机、曝光、环境、灯光、材质、几何拓扑、尺寸、自转）四组完全一致。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTire } from '/src/tire.js';
import { TIRE_SPECS } from '/src/specs.js';
import { PixelBuffer, regionStats, contactStats, geometryNormalStats } from './metrics.js';

const Q = new URLSearchParams(location.search);
const N = Q.get('n') === '1' ? 1 : 0;
const G = Q.get('g') === '1' ? 1 : 0;
const W = 1280, H = 800;
const CREASE_DEG = 35;

const errEl = document.getElementById('err');
const metricsEl = document.getElementById('metrics');
const canvas = document.getElementById('canvas');

function fail(e) {
  const msg = (e && (e.stack || e.message)) || String(e);
  errEl.hidden = false;
  errEl.textContent = '运行失败：' + msg;
  metricsEl.textContent = '__R14_JSON_BEGIN__' + JSON.stringify({ case: `n${N}g${G}`, error: msg }) + '__R14_JSON_END__';
  document.title = 'R14_ERROR';
}

const FIXED = Object.freeze({
  cameraPosition: [0.38, 0.52, 1.55],
  cameraFov: 36,
  cameraTargetY: null, // 运行时由轮心决定，四组同一数值
  exposure: 1.08,
  environmentIntensity: 1.0,
  hemisphere: 0.58,
  keyIntensity: 2.15,
  fillIntensity: 0.85,
  stripIntensity: 3.2,
  shadowMap: 'PCFSoftShadowMap',
  toneMapping: 'ACESFilmicToneMapping',
  outputColorSpace: 'SRGBColorSpace',
  envSource: 'RoomEnvironment / PMREM (procedural, no external asset)',
  autoSpin: false,
  pixelRatio: 1,
  viewport: [W, H],
  specId: TIRE_SPECS[0].id,
  creaseAngleDeg: CREASE_DEG
});

function makeAOTexture() {
  // 原样复刻 src/main.js:131-142 的径向渐变假 AO
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const grad = ctx.createRadialGradient(S / 2, S / 2, S * 0.04, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(20,19,18,0.60)');
  grad.addColorStop(0.45, 'rgba(20,19,18,0.30)');
  grad.addColorStop(1, 'rgba(20,19,18,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(cv);
}

function metalnessOf(mesh) {
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return m && typeof m.metalness === 'number' ? m.metalness : -1;
}

function project(v, camera) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H };
}

async function main() {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false,
    preserveDrawingBuffer: true, // 供 Canvas2D.getImageData 采样，见 README「已知限制」
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = FIXED.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f0ec);
  scene.environmentIntensity = FIXED.environmentIntensity;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // --- 与 src/main.js 同构的灯光（数值固定，四组不随变量变化）
  RectAreaLightUniformsLib.init();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc9bf, FIXED.hemisphere));
  const key = new THREE.DirectionalLight(0xffffff, FIXED.keyIntensity);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -2; key.shadow.camera.right = 2;
  key.shadow.camera.top = 2; key.shadow.camera.bottom = -2;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 20;
  key.shadow.bias = -0.00035; key.shadow.normalBias = 0.018; key.shadow.radius = 3;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe6ecf6, FIXED.fillIntensity);
  fill.position.set(-5, 3, -4);
  scene.add(fill);
  const strip = new THREE.RectAreaLight(0xffffff, FIXED.stripIntensity, 1.3, 3.8);
  strip.position.set(-2.2, 3.2, 2.4);
  strip.lookAt(0, 0.35, 0);
  scene.add(strip);

  // --- 地面：G 变量的唯一开关之一
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0xe8e5df, roughness: 0.9, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = (G === 1);
  scene.add(ground);

  // --- 真实生产轮胎（生产源码只读）
  const spec = TIRE_SPECS[0];
  const tire = createTire(spec);
  const d = tire.dimensions;
  tire.root.position.set(0, d.outerRadius, 0);
  tire.root.rotation.y = -0.40;   // 与生产展台同斜角；为接地实验不放 -0.17 前倾
  scene.add(tire.root);

  // --- N 变量：只改金属零件法线，几何拓扑/三角数/材质/灯光不动
  const metalMeshes = [];
  tire.root.traverse((o) => {
    if (o.isMesh && metalnessOf(o) >= 0.4) metalMeshes.push(o);
  });
  const normalsBefore = geometryNormalStats(metalMeshes.map((o) => o.geometry));
  let creasedMeshes = 0;
  if (N === 1) {
    for (const mesh of metalMeshes) {
      try {
        // toCreasedNormals 对 non-indexed 几何会原地写 normal，因此必须先 clone
        const cloned = mesh.geometry.clone();
        const result = toCreasedNormals(cloned, THREE.MathUtils.degToRad(CREASE_DEG));
        mesh.geometry = result;
        creasedMeshes++;
      } catch (e) {
        // 单个几何失败不静默吞掉，写入指标供 verify 检查
        console.warn('[R-14] crease failed on one mesh', e);
      }
    }
  }
  const normalsAfter = geometryNormalStats(metalMeshes.map((o) => o.geometry));

  // --- G 变量：假 AO 贴片 vs 真实阴影
  let aoMesh = null;
  if (G === 0) {
    const aoGeo = new THREE.PlaneGeometry(0.68, 0.48);
    aoGeo.rotateX(-Math.PI / 2);
    aoGeo.rotateY(-0.40);
    aoMesh = new THREE.Mesh(aoGeo, new THREE.MeshBasicMaterial({
      map: makeAOTexture(), transparent: true, depthWrite: false,
      opacity: 0.85, toneMapped: false
    }));
    aoMesh.position.y = 0.002;
    scene.add(aoMesh);
  }

  // --- 固定机位
  const camera = new THREE.PerspectiveCamera(FIXED.cameraFov, W / H, 0.05, 100);
  camera.position.set(...FIXED.cameraPosition);
  camera.lookAt(0, d.outerRadius * 0.92, 0);
  camera.updateMatrixWorld(true);

  // --- 同步渲染若干帧后再采样。
  // headless Chrome 的 --virtual-time-budget 不会推进 requestAnimationFrame，
  // 因此这里刻意不使用 rAF；preserveDrawingBuffer + gl.finish() 保证随后读像素拿到完整帧。
  for (let i = 0; i < 3; i++) renderer.render(scene, camera);
  renderer.render(scene, camera);
  renderer.getContext().finish();

  // --- ROI：由固定相机投影算出，四组完全一致
  const center = project(new THREE.Vector3(0, d.outerRadius, 0), camera);
  const rimEdge = project(new THREE.Vector3(d.rimRadius, d.outerRadius, 0), camera);
  const rimPx = Math.max(40, Math.abs(rimEdge.x - center.x) * 0.9);
  const rimRect = { x: center.x - rimPx, y: center.y - rimPx, w: rimPx * 2, h: rimPx * 2 };
  const contactPt = project(new THREE.Vector3(0, 0, 0), camera);
  const contactRect = { x: contactPt.x - rimPx * 1.9, y: contactPt.y + 3, w: rimPx * 3.8, h: 22 };

  const pb = new PixelBuffer(canvas, W, H);
  const rim = regionStats(pb, rimRect);
  const contact = contactStats(pb, contactRect, 32);
  const info = renderer.info;

  const metrics = {
    case: `n${N}g${G}`,
    n: N, g: G,
    fixed: { ...FIXED, cameraTargetY: +(d.outerRadius * 0.92).toFixed(6) },
    geometry: {
      specId: spec.id,
      outerRadius: +d.outerRadius.toFixed(6),
      rimRadius: +d.rimRadius.toFixed(6),
      metalMeshes: metalMeshes.length,
      creasedMeshes,
      aoMeshPresent: !!aoMesh,
      groundReceiveShadow: ground.receiveShadow
    },
    renderInfo: {
      calls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      frame: info.render.frame,
      geometries: info.memory.geometries,
      textures: info.memory.textures
    },
    normalsBefore,
    normalsAfter,
    rim,
    contact,
    roi: {
      rim: { x: +rimRect.x.toFixed(1), y: +rimRect.y.toFixed(1), w: +rimRect.w.toFixed(1), h: +rimRect.h.toFixed(1) },
      contact: contact.rect
    },
    measuredAt: new Date().toISOString()
  };

  metricsEl.textContent = '__R14_JSON_BEGIN__' + JSON.stringify(metrics) + '__R14_JSON_END__';
  window.__R14_METRICS__ = metrics;
  window.__R14_READY__ = true;
  document.title = `R14_READY_${metrics.case}`;
}

main().catch(fail);

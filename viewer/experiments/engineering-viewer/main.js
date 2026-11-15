import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#canvas');
const statusEl = $('#status');
const loadError = $('#loadError');

const state = {
  mode: 'engineering',
  selectedId: null,
  isolated: false,
  xray: false,
  explode: 0,
  parts: [],
  measure: { enabled: false, points: [] },
  clip: { enabled: false, axis: 'y', t: 0.35 },
};

let scene, camera, renderer, controls, raycaster, pointer;
let assemblyRoot, grid;
let metadata = null;
let manifest = null;
let clipPlane = null;
let measureGroup = null;
let clipBounds = null;

function setStatus(msg) {
  statusEl.textContent = msg;
}

function showLoadError(msg) {
  loadError.hidden = false;
  loadError.textContent = msg;
  setStatus('加载失败');
}

function renderTruthBadges(manifest) {
  const labels = [
    ['验证级别', manifest.validationLevel, true],
    ['尺寸来源', manifest.dimensionProvenance, true],
    ['运动', manifest.motionPlaybackKind, false],
    ['证据', manifest.evidenceStatus, false],
  ];
  const readable = { VISUAL: '视觉演示', ASSUMED: '示例参数', NONE: '未模拟', PARTIAL: '部分验证' };
  $('#truthBadges').innerHTML = labels
    .map(([k, v, warn]) => `<span class="badge${warn ? ' warn' : ''}">${k}：${readable[v] || v}</span>`)
    .join('');
}

function applyMode() {
  const eng = state.mode === 'engineering';
  scene.background = new THREE.Color(eng ? 0xf2f6fb : 0xe8eff8);
  if (grid) grid.visible = eng;
  renderer.toneMappingExposure = eng ? 1.35 : 1.5;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const rec = state.parts.find((p) => p.object === o || p.root === o);
    if (!rec) return;
    for (const m of [].concat(o.material)) {
      if (m) m.wireframe = eng && state.xray;
    }
  });
}

function collectMeshes(root) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return meshes;
}

function highlightSelection() {
  for (const part of state.parts) {
    const emissive = new THREE.Color(
      part.id === state.selectedId ? 0x3355aa : 0x000000
    );
    for (const mesh of part.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m.emissive) m.emissive.copy(emissive);
      }
    }
  }
  document.querySelectorAll('#partTree button').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.partId === state.selectedId);
  });
}

function updateVisibility() {
  for (const part of state.parts) {
    const show =
      !state.isolated ||
      part.id === state.selectedId ||
      !state.selectedId;
    for (const mesh of part.meshes) {
      mesh.visible = show;
      if (!show) continue;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        if (state.xray && part.id !== state.selectedId) {
          m.transparent = true;
          m.opacity = 0.22;
          m.depthWrite = false;
        } else if (!state.isolated || part.id === state.selectedId) {
          m.transparent = false;
          m.opacity = 1;
          m.depthWrite = true;
        }
      }
    }
  }
  highlightSelection();
}

function applyExplode(factor) {
  const t = factor / 100;
  for (const part of state.parts) {
    const [ax, ay, az] = part.explodeAxis;
    const dist = part.explodeM * t;
    const offset = new THREE.Vector3(ax, ay, az).multiplyScalar(dist);
    part.root.position.copy(part.basePosition).add(offset);
  }
}

function formatDistance(m) {
  if (!Number.isFinite(m)) return 'UNKNOWN';
  return `${(m * 1000).toFixed(2)} mm（${m.toFixed(4)} m）`;
}

function renderRelations(partId) {
  const box = $('#partRelations');
  const rels = (manifest?.relations || []).filter((r) => r.from === partId || r.to === partId);
  if (!rels.length) {
    box.hidden = true;
    return;
  }
  const names = Object.fromEntries(state.parts.map((p) => [p.id, p.displayName]));
  box.hidden = false;
  box.innerHTML = `<p class="hint">装配关系（示意，未验证工艺）</p><ul>${rels
    .map((r) => {
      const other = r.from === partId ? r.to : r.from;
      const flag = r.verified ? '' : ' · <em>待验证</em>';
      return `<li>${names[partId]} ↔ ${names[other] || other}：${r.label}${flag}</li>`;
    })
    .join('')}</ul>`;
}

function syncClipping() {
  if (!clipPlane || !renderer) return;
  const axis = state.clip.axis;
  const normal = new THREE.Vector3(
    axis === 'x' ? 1 : 0,
    axis === 'y' ? 1 : 0,
    axis === 'z' ? 1 : 0
  );
  clipPlane.normal.copy(normal);
  if (clipBounds) {
    const { min, max } = clipBounds[axis];
    const constant = min + (max - min) * state.clip.t;
    clipPlane.constant = -constant;
  }
  const planes = state.clip.enabled ? [clipPlane] : [];
  renderer.clippingPlanes = planes;
  renderer.localClippingEnabled = true;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material);
    for (const m of mats) {
      if (!m) continue;
      m.clippingPlanes = planes;
      m.clipIntersection = false;
      m.needsUpdate = true;
    }
  });
}

function clearMeasure() {
  state.measure.points = [];
  measureGroup.clear();
  $('#measureReadout').hidden = true;
  $('#btnClearMeasure').hidden = true;
  canvas.classList.remove('measure-active');
}

function setMeasureMode(on) {
  state.measure.enabled = on;
  $('#btnMeasure').classList.toggle('on', on);
  $('#btnMeasure').setAttribute('aria-pressed', String(on));
  if (!on) clearMeasure();
  else {
    canvas.classList.add('measure-active');
    setStatus('测距：在模型表面点击两个点（视觉距离，非计量认证）');
  }
}

function updateMeasureVisual() {
  measureGroup.clear();
  const pts = state.measure.points;
  if (!pts.length) return;
  const markerGeo = new THREE.SphereGeometry(0.004, 16, 16);
  const markerMat = new THREE.MeshBasicMaterial({ color: 0x1d5fd6 });
  for (const p of pts) {
    const m = new THREE.Mesh(markerGeo, markerMat);
    m.position.copy(p);
    measureGroup.add(m);
  }
  if (pts.length === 2) {
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(
      geom,
      new THREE.LineBasicMaterial({ color: 0x1d5fd6, depthTest: false })
    );
    measureGroup.add(line);
    const d = pts[0].distanceTo(pts[1]);
    const readout = $('#measureReadout');
    readout.hidden = false;
    readout.innerHTML = `<p class="hint">两点测距（场景几何，ASSUMED）</p><p><strong>${formatDistance(d)}</strong></p>
      <p class="hint">非 CMM/三坐标结果；仅用于学习观察。</p>`;
    $('#btnClearMeasure').hidden = false;
    setStatus(`测距：${formatDistance(d)}`);
  }
}

function addMeasurePoint(point) {
  if (state.measure.points.length >= 2) state.measure.points = [];
  state.measure.points.push(point.clone());
  updateMeasureVisual();
}

function selectPart(id) {
  state.selectedId = id;
  const part = state.parts.find((p) => p.id === id);
  if (!part) return;
  $('#inspectEmpty').hidden = true;
  $('#inspectBody').hidden = false;
  $('#partName').textContent = part.displayName;
  $('#partNode').textContent = `节点：${part.nodeName}`;
  const meta = metadata?.components?.[part.metaKey];
  const dl = $('#partMeta');
  dl.innerHTML = '';
  if (meta) {
    addRow(dl, '包围盒 (mm)', meta.bbox_size_mm?.join(' × '));
    addRow(dl, '体积 (mm³)', meta.volume_mm3?.toFixed?.(1) ?? meta.volume_mm3);
  }
  if (part.extras) {
    addRow(dl, '零件编号', part.extras.partId || part.extras.part_id);
    addRow(dl, '材料标记', part.extras.materialClass || part.extras.material_class);
    addRow(dl, '安装方式', part.extras.mountingType || part.extras.mounting_type);
  }
  const readerNotes = {
    bearing: '这是轴承外形包络，不代表已经验证滚动体、内部配合、预紧和寿命。',
    studs: '螺柱用于显示安装位置；螺纹、夹紧力和真实装配工艺尚未验证。',
    hub: '当前法兰是参数化展示样例；具体车型尺寸、材料性能和强度尚未获得工程认证。'
  };
  $('#partDisclaimer').textContent = readerNotes[part.id] || '当前仅供结构观察，不代表真实车辆工程认证。';
  renderRelations(part.id);
  highlightSelection();
  updateVisibility();
  setStatus(`已选：${part.displayName}`);
}

function addRow(dl, label, value) {
  if (!value) return;
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  dl.append(dt, dd);
}

function buildTree() {
  const ul = $('#partTree');
  ul.innerHTML = state.parts
    .map((p) => `<li><button type="button" data-part-id="${p.id}">${p.displayName}</button></li>`)
    .join('');
  ul.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-part-id]');
    if (!btn) return;
    selectPart(btn.dataset.partId);
  });
}

function bindUI() {
  document.querySelectorAll('.mode-toggle .mode').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('.mode-toggle .mode').forEach((b) => b.classList.toggle('on', b === btn));
      applyMode();
    });
  });
  $('#btnShowAll').addEventListener('click', () => {
    state.isolated = false;
    state.xray = false;
    updateVisibility();
    applyMode();
    setStatus('已显示全部零件');
  });
  $('#btnIsolate').addEventListener('click', () => {
    if (!state.selectedId) return setStatus('请先选择零件');
    state.isolated = true;
    state.xray = false;
    updateVisibility();
    setStatus('隔离模式：仅显示选中零件');
  });
  $('#btnXray').addEventListener('click', () => {
    state.xray = !state.xray;
    state.isolated = false;
    updateVisibility();
    applyMode();
    setStatus(state.xray ? 'X 光：未选中零件半透明' : '已关闭 X 光');
  });
  $('#explode').addEventListener('input', (e) => {
    state.explode = Number(e.target.value);
    applyExplode(state.explode);
  });
  $('#btnMeasure').addEventListener('click', () => setMeasureMode(!state.measure.enabled));
  $('#btnClearMeasure').addEventListener('click', clearMeasure);
  $('#btnClip').addEventListener('click', () => {
    state.clip.enabled = !state.clip.enabled;
    $('#btnClip').classList.toggle('on', state.clip.enabled);
    $('#btnClip').setAttribute('aria-pressed', String(state.clip.enabled));
    $('#clipControls').hidden = !state.clip.enabled;
    syncClipping();
    setStatus(state.clip.enabled ? '剖切：视觉截面，不代表真实加工' : '已关闭剖切');
  });
  $('#clipAxis').addEventListener('change', (e) => {
    state.clip.axis = e.target.value;
    syncClipping();
  });
  $('#clipPos').addEventListener('input', (e) => {
    state.clip.t = Number(e.target.value) / 100;
    syncClipping();
  });
}

function onPointerDown(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(
    state.parts.flatMap((p) => p.meshes),
    false
  );
  if (!hits.length) return;
  const hit = hits[0];
  if (state.measure.enabled) {
    addMeasurePoint(hit.point);
    return;
  }
  const part = state.parts.find((p) => p.meshes.includes(hit.object));
  if (part) selectPart(part.id);
}

function resize() {
  const parent = canvas.parentElement;
  const w = parent.clientWidth;
  const h = Math.max(parent.clientHeight, 360);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, state.mode === 'engineering' ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.localClippingEnabled = true;
  clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  scene = new THREE.Scene();
  measureGroup = new THREE.Group();
  camera = new THREE.PerspectiveCamera(42, 1, 0.01, 50);
  camera.position.set(0.35, 0.22, 0.42);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.target.set(0, 0.04, 0);
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa0bad3, 1.45));
  const key = new THREE.DirectionalLight(0xffffff, 3.0);
  key.position.set(2, 3, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdceaff, 1.45);
  fill.position.set(-2.5, 1.5, -1.5);
  scene.add(fill);
  grid = new THREE.GridHelper(0.6, 12, 0xc8d6e7, 0xe1e9f2);
  grid.position.y = -0.06;
  scene.add(grid, measureGroup);
  window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', onPointerDown);
  resize();
}

async function loadAssembly() {
  manifest = await (await fetch('./assembly.manifest.json')).json();
  renderTruthBadges(manifest);
  // Prefer the latest locally generated CAD output. A tiny curated fixture
  // makes the viewer useful after git clone, before running Blender/build123d.
  metadata = null;
  for (const url of [manifest.metadataPath, manifest.metadataFallbackPath].filter(Boolean)) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      metadata = await response.json();
      break;
    } catch (err) {
      console.warn('无法加载这份元数据，尝试下一来源：', url, err.message);
    }
  }

  const loader = new GLTFLoader();
  let gltf = null;
  let loadedFrom = '';
  for (const url of [manifest.glbPath, manifest.glbFallbackPath].filter(Boolean)) {
    try {
      gltf = await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
      loadedFrom = url;
      break;
    } catch (err) {
      console.warn('无法加载 GLB，尝试下一来源：', url, err.message);
    }
  }
  if (!gltf) throw new Error('没有可用的轮端 GLB；请检查内置样例或重新生成 CAD。');

  assemblyRoot = gltf.scene;
  // GLB 已在 Blender 导出阶段完成 mm→m（见 blender_assembly_to_glb.py），禁止再次 scale 0.001
  scene.add(assemblyRoot);

  const bounds = assertAssemblyBounds(assemblyRoot);
  clipBounds = {
    x: { min: bounds.box.min.x, max: bounds.box.max.x },
    y: { min: bounds.box.min.y, max: bounds.box.max.y },
    z: { min: bounds.box.min.z, max: bounds.box.max.z },
  };
  const unitRoot = assemblyRoot.getObjectByName('Assembly_WheelHub');
  const glbUnit = unitRoot?.userData?.carlab_unit || 'meter (inferred)';

  for (const def of manifest.parts) {
    let root = null;
    assemblyRoot.traverse((o) => {
      if (root) return;
      if (o.name && o.name.includes(def.nodeMatch)) root = o;
    });
    if (!root) {
      console.warn('未找到节点', def.nodeMatch);
      continue;
    }
    const meshes = collectMeshes(root);
    for (const mesh of meshes) {
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => m.clone());
      } else if (mesh.material) {
        mesh.material = mesh.material.clone();
      }
    }
    const metaKey =
      def.id === 'hub' ? 'hub' : def.id === 'bearing' ? 'bearing' : 'studs';
    // Visual preview materials (not engineering evidence). Avoid the all-black
    // silhouette produced by the original dim prototype viewer.
    const display = {
      hub: { color: 0xc1cbda, metalness: 0.86, roughness: 0.28 },
      bearing: { color: 0x8c9fb8, metalness: 0.78, roughness: 0.37 },
      studs: { color: 0xabb9cb, metalness: 0.82, roughness: 0.29 },
    }[def.id] || { color: 0xb7c7d8, metalness: 0.7, roughness: 0.4 };
    for (const mesh of meshes) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (!mat?.isMeshStandardMaterial && !mat?.isMeshPhysicalMaterial) continue;
        mat.color.setHex(display.color);
        mat.metalness = display.metalness;
        mat.roughness = display.roughness;
        mat.envMapIntensity = 1.25;
        mat.needsUpdate = true;
      }
    }
    state.parts.push({
      id: def.id,
      displayName: def.displayName,
      nodeName: root.name,
      metaKey,
      root,
      meshes,
      object: root,
      basePosition: root.position.clone(),
      explodeAxis: def.explodeAxis,
      explodeM: def.explodeMm * 0.001,
      extras: root.userData || null,
    });
  }

  if (!state.parts.length) {
    throw new Error('GLB 中未匹配到任何零件节点，请检查 assembly.manifest.json 的 nodeMatch。');
  }

  buildTree();
  applyMode();
  syncClipping();
  selectPart(state.parts[0].id);

  const box = new THREE.Box3().setFromObject(assemblyRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  controls.target.copy(center);
  camera.position.set(
    center.x + size.length() * 0.9,
    center.y + size.y * 0.5,
    center.z + size.length() * 0.7
  );
  setStatus(
    `已加载 ${state.parts.length} 个零件 · ${glbUnit} · 包围盒最大边 ${bounds.maxDim.toFixed(3)} m${loadedFrom === manifest.glbFallbackPath ? ' · 内置样例' : ''}`
  );
}

function assertAssemblyBounds(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim < 0.05) {
    throw new Error(
      `装配包围盒过小（${maxDim.toExponential(2)} m），疑似重复应用 0.001 缩放。`
    );
  }
  if (maxDim > 5) {
    throw new Error(`装配包围盒过大（${maxDim.toFixed(2)} m），请检查 GLB 单位。`);
  }
  return { box, size, maxDim };
}

function loop() {
  requestAnimationFrame(loop);
  controls.update();
  renderer.render(scene, camera);
}

async function boot() {
  initScene();
  bindUI();
  try {
    await loadAssembly();
    loop();
  } catch (e) {
    console.error(e);
    showLoadError(
      `${e.message}\n\n请确认：\n1) npm run viewer:engineering\n2) GLB 存在：cad/experiments/planning_feasibility/out/wheel_hub_assembly.glb\n3) 若无，运行 verify_assembly.py 生成`
    );
  }
}

boot();
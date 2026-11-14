import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { TIRE_SPECS, GEAR_RATIOS, STUDIO_MODES, CAR_CONFIG, deriveDimensions } from './specs.js';
import { createTire } from './tire.js';
import { createCoilover } from './parts/coilSpring.js';
import { createDrivetrainRig } from './parts/drivetrain.js';
import { createVehicleRig } from './parts/chassis.js';
import { createProvingGroundWorld, createSuspensionBenchSim } from './physics/vehicleWorld.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const canvas = $('#scene');
const liveStatus = $('#liveStatus');

function announce(text) {
  if (liveStatus) liveStatus.textContent = text;
}

const state = {
  mode: 'vehicle',
  tireFocus: null,
  tireView: 'overview',
  spin: true,
  rimVisible: true,
  bareRim: false,
  highlight: false,
  followCamera: true,
  shellVisible: false,
  articulateDrivetrain: true,
  motorRpm: 120,
  drivetrainAngle: 0,
  drivetrainTime: 0,
  anim: null
};

// ---------------------------------------------------------------- 渲染器 / 场景 / 相机
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf2f0ec);
scene.fog = new THREE.Fog(0xf2f0ec, 18, 52);
scene.environmentIntensity = 1.0;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 140);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 0.9;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI * 0.492;
controls.minPolarAngle = 0.08;

// ---------------------------------------------------------------- 摄影棚布光
RectAreaLightUniformsLib.init();
scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc9bf, 0.58));

const key = new THREE.DirectionalLight(0xffffff, 2.15);
key.position.set(5.2, 8.8, 6.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -9;
key.shadow.camera.right = 9;
key.shadow.camera.top = 9;
key.shadow.camera.bottom = -9;
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 28;
key.shadow.bias = -0.00035;
key.shadow.normalBias = 0.018;
key.shadow.radius = 3;
scene.add(key, key.target);

const fillLight = new THREE.DirectionalLight(0xe6ecf6, 0.85);
fillLight.position.set(-6, 3.5, -4.5);
scene.add(fillLight);

const stripA = new THREE.RectAreaLight(0xffffff, 3.2, 1.3, 3.8);
stripA.position.set(-3.0, 3.2, 2.6);
stripA.lookAt(0, 0.45, 0);
scene.add(stripA);

const stripB = new THREE.RectAreaLight(0xe8f0ff, 2.0, 1.0, 3.0);
stripB.position.set(3.2, 2.2, 1.0);
stripB.lookAt(0, 0.45, 0);
scene.add(stripB);

// ---------------------------------------------------------------- 地面与网格
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0xeae7e1, roughness: 0.88, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const gridHelper = new THREE.GridHelper(60, 60, 0xc6c1b7, 0xdad5cc);
gridHelper.position.y = 0.002;
scene.add(gridHelper);

// ---------------------------------------------------------------- 模式 1：整车物理试验台（Cannon-es + 机械总成）
let equippedTireSpec = TIRE_SPECS[0]; // 默认 245/35 R20，可在轮胎特写里切换装配
const vehicleRig = createVehicleRig(equippedTireSpec);
scene.add(vehicleRig.root);

const physicsWorld = createProvingGroundWorld(scene, deriveDimensions(equippedTireSpec));

// ---------------------------------------------------------------- 模式 2：轮胎总成特写（保留原 4 胎展台）
const tireStage = new THREE.Group();
scene.add(tireStage);

const podiumSide = new THREE.MeshStandardMaterial({ color: 0x6e6a62, roughness: 0.72, metalness: 0.04 });
const podiumTop = new THREE.MeshPhysicalMaterial({
  color: 0x7c776f, roughness: 0.60, metalness: 0.04, clearcoat: 0.14, clearcoatRoughness: 0.55
});
const PODIUM_H = 0.072;
const SPACING = 1.04;

function makeAOTexture() {
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
const aoGeo = new THREE.PlaneGeometry(0.68, 0.48);
aoGeo.rotateX(-Math.PI / 2);
aoGeo.rotateY(-0.40);
const aoMat = new THREE.MeshBasicMaterial({
  map: makeAOTexture(), transparent: true, depthWrite: false, opacity: 0.85, toneMapped: false
});

const tires = TIRE_SPECS.map((spec, i) => {
  const t = createTire(spec);
  const d = t.dimensions;
  const x = (i - (TIRE_SPECS.length - 1) / 2) * SPACING;
  const pr = Math.min(0.495, d.outerRadius + 0.075);

  const podium = new THREE.Mesh(
    new THREE.CylinderGeometry(pr, pr, PODIUM_H, 80),
    [podiumSide, podiumTop, podiumSide]
  );
  podium.position.set(x, PODIUM_H / 2, 0);
  podium.receiveShadow = true;
  tireStage.add(podium);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(pr - 0.012, 0.0030, 6, 100),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.accent), metalness: 0.4, roughness: 0.45 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, PODIUM_H + 0.0015, 0);
  tireStage.add(ring);

  const ao = new THREE.Mesh(aoGeo, aoMat);
  ao.position.set(x, PODIUM_H + 0.0035, 0);
  tireStage.add(ao);

  t.root.position.set(x, d.outerRadius + PODIUM_H + 0.002, 0);
  t.root.rotation.y = -0.40;
  t.root.rotation.x = -0.17;
  t.root.userData.index = i;
  t.spin.rotation.z = i * 0.21;
  tireStage.add(t.root);

  return { ...t, x, podium, ring, ao, labelPos: new THREE.Vector3(x, d.outerRadius * 2 + PODIUM_H + 0.16, 0) };
});

// ---------------------------------------------------------------- 模式 3：避震弹簧特写台（单角 1/4 车物理振荡台）
const suspensionStage = new THREE.Group();
scene.add(suspensionStage);

const suspBench = createSuspensionBenchSim();
const suspFrameMat = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.42, metalness: 0.80 });
const suspAlloyMat = new THREE.MeshStandardMaterial({ color: 0x9ca4b0, roughness: 0.28, metalness: 0.90 });

// 试验台底座立柱与液压振源踏板
const benchBase = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 0.95), podiumTop);
benchBase.position.set(0.22, 0.04, 0);
benchBase.receiveShadow = true;
suspensionStage.add(benchBase);

const towerPost = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.08, 0.18), suspFrameMat);
towerPost.position.set(-0.24, 0.62, 0);
towerPost.castShadow = true;
suspensionStage.add(towerPost);

const shakerPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.06, 36), suspAlloyMat);
shakerPlate.position.set(0.46, 0.11, 0);
shakerPlate.receiveShadow = true;
shakerPlate.castShadow = true;
suspensionStage.add(shakerPlate);

// 单角摆臂、避震器、轮毂转向节
const benchCoil = createCoilover({
  coilRadius: 0.056,
  wireRadius: 0.0105,
  turns: 7.5,
  restSpan: 0.46,
  coilColor: 0xc8563c
});
suspensionStage.add(benchCoil.root);

const benchUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 12).rotateX(Math.PI / 2), suspAlloyMat);
benchUpperArm.geometry.translate(0, 0, 0.5);
benchUpperArm.castShadow = true;
const benchLowerArm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 12).rotateX(Math.PI / 2), suspAlloyMat);
benchLowerArm.geometry.translate(0, 0, 0.5);
benchLowerArm.castShadow = true;
suspensionStage.add(benchUpperArm, benchLowerArm);

const benchKnuckle = new THREE.Group();
suspensionStage.add(benchKnuckle);
const benchCaliper = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.12, 0.09),
  new THREE.MeshPhysicalMaterial({ color: 0xc84b31, roughness: 0.28, metalness: 0.35, clearcoat: 0.7 })
);
benchKnuckle.add(benchCaliper);

let benchTire = null;
function setBenchTire(spec) {
  if (benchTire) benchKnuckle.remove(benchTire.root);
  benchTire = createTire(spec);
  benchTire.root.rotation.y = Math.PI / 2;
  benchTire.rimGroup.visible = state.rimVisible;
  benchTire.liner.visible = !state.rimVisible;
  benchKnuckle.add(benchTire.root);
  const d = benchTire.dimensions;
  const caliperR = d.rotorOuterR * 0.78;
  benchCaliper.position.set(d.brakeDiscZ, caliperR * 0.72, -caliperR * 0.68);
}
setBenchTire(equippedTireSpec);

// ---------------------------------------------------------------- 模式 4：机械传动特写台（开放齿轮+差速器+半轴）
const drivetrainStage = new THREE.Group();
scene.add(drivetrainStage);

const dlStand = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 2.7), podiumTop);
dlStand.position.set(0, 0.035, 0);
dlStand.receiveShadow = true;
drivetrainStage.add(dlStand);

const dlRig = createDrivetrainRig({ wheelbase: 2.10, diffY: 0 });
dlRig.root.position.set(0, 0.56, 0);
drivetrainStage.add(dlRig.root);

// 支架立柱与 4 个模拟轮毂法兰
for (const pz of [0.30, -0.35]) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.48, 16), suspFrameMat);
  post.position.set(0, 0.27, pz);
  post.castShadow = true;
  drivetrainStage.add(post);
}
const dlHubMarkers = [];
const dlHubDefs = [
  [0.78, 0.52, 1.05], [-0.78, 0.52, 1.05],
  [0.78, 0.52, -1.05], [-0.78, 0.52, -1.05]
];
for (const [hx, hy, hz] of dlHubDefs) {
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.06, 20).rotateZ(Math.PI / 2),
    suspAlloyMat
  );
  hub.position.set(hx, hy, hz);
  hub.castShadow = true;
  drivetrainStage.add(hub);
  dlHubMarkers.push({ mesh: hub, basePos: new THREE.Vector3(hx, hy, hz) });
}

// ---------------------------------------------------------------- 轮胎模式 HTML 浮标 & 底部卡片 & 详情抽屉
const labelLayer = $('#labels');
const cardLayer = $('#cards');
const panel = $('#panel');
const panelBody = $('#panelBody');

function ratioSVG(spec) {
  const d = deriveDimensions(spec);
  const k = 105;
  const ro = (d.outerRadius * k).toFixed(1);
  const rr = (d.rimRadius * k).toFixed(1);
  const rMark = (50 + Number(ro) * 0.98).toFixed(1);
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="${ro}" fill="#22252a"/>
    <circle cx="50" cy="50" r="${ro}" fill="none" stroke="#0f1114" stroke-width="1"/>
    <circle cx="50" cy="50" r="${rr}" fill="#c9cdd2" stroke="#8c9198" stroke-width="1.2"/>
    <circle cx="50" cy="50" r="${(d.rimRadius * k * 0.55).toFixed(1)}" fill="none" stroke="#9aa0a8" stroke-width="2"/>
    <path d="M50 50 L${rMark} 50" stroke="${spec.accent}" stroke-width="1.4" stroke-dasharray="2 2"/>
    <text x="50" y="97" text-anchor="middle" font-size="9" fill="#5c606a" font-family="Arial">胎侧高 ${Math.round(d.sidewallHeight * 1000)} mm</text>
  </svg>`;
}

function equipTireOnVehicle(spec) {
  equippedTireSpec = spec;
  const dims = vehicleRig.equipTire(spec);
  physicsWorld.setTireRadius(dims.outerRadius);
  setBenchTire(spec);
  vehicleRig.setRimVisible(state.rimVisible);
  vehicleRig.setTreadHighlight(state.highlight);
  $('#hudTireSpec').textContent = spec.spec;
  announce(`已将 ${spec.spec} ${spec.name} 装配到整车`);
}

tires.forEach((t, i) => {
  const spec = t.spec;
  const el = document.createElement('div');
  el.className = 'float-label';
  el.innerHTML = `<span class="fl-dot" style="background:${spec.accent}"></span>
    <span class="fl-spec">${spec.spec}</span><span class="fl-ar">扁平比 ${spec.aspect}%</span>`;
  labelLayer.appendChild(el);
  t.labelEl = el;

  const card = document.createElement('button');
  card.className = 'card';
  card.type = 'button';
  card.innerHTML = `
    <div class="card-top"><span class="card-cat" style="color:${spec.accentDark}">${spec.category}</span>
      <span class="card-num">0${i + 1}</span></div>
    <div class="card-name">${spec.name}</div>
    <div class="card-spec">${spec.spec}</div>
    <div class="card-ratio"><span class="bar-label">高宽比</span>
      <span class="bar"><i style="width:${spec.aspect}%;background:${spec.accent}"></i></span>
      <b>${spec.aspect}%</b></div>`;
  card.style.setProperty('--accent', spec.accent);
  card.addEventListener('click', () => (state.tireFocus === i ? tireOverview() : tireFocus(i)));
  cardLayer.appendChild(card);
  t.cardEl = card;
});

function renderTirePanel(spec) {
  const d = deriveDimensions(spec);
  const mm = (v) => Math.round(v * 1000);
  const isEquipped = equippedTireSpec.id === spec.id;
  panelBody.innerHTML = `
    <div class="p-head">
      <span class="p-cat" style="color:${spec.accentDark}">${spec.category}</span>
      <h2>${spec.name}</h2>
      <div class="p-spec">${spec.spec}</div>
      <div class="p-brand">${spec.brand} · ${spec.model}</div>
    </div>
    <div class="p-figure">
      ${ratioSVG(spec)}
      <div class="p-figure-note">同一比例尺下的断面剖视图<br/><b>轮辋越大，胎侧越薄</b></div>
    </div>
    <div class="p-grid">
      <div><span>断面宽</span><b>${spec.width} mm</b></div>
      <div><span>扁平比</span><b>${spec.aspect} %</b></div>
      <div><span>胎侧高</span><b>${mm(d.sidewallHeight)} mm</b></div>
      <div><span>轮胎外径</span><b>${mm(d.outerDiameter)} mm</b></div>
      <div><span>轮辋规格</span><b>${spec.rimStyle.widthInch}${spec.rimStyle.contour} × ${spec.rimInch}</b></div>
      <div><span>偏距 ET</span><b>+${spec.rimStyle.etMm} mm</b></div>
      <div><span>孔距 PCD</span><b>${spec.rimStyle.bolts} × ${spec.rimStyle.pcdMm}</b></div>
      <div><span>中心孔 CB</span><b>Ø ${spec.rimStyle.centerBoreMm} mm</b></div>
    </div>
    <div class="p-section"><h3>轮毂工程结构</h3><p>遵循 ETRTO ${spec.rimStyle.contour} 型轮缘、5° 胎圈锥面、H2 双安全凸峰与非对称深槽设计；辐条按悬臂梁弯矩梯度由轮心向轮缘渐缩放样，并按偏距 ET+${spec.rimStyle.etMm}mm 留出通风打孔刹车盘与卡钳空间。</p></div>
    <div class="p-section"><h3>花纹结构</h3><p>${spec.patternName}。胎面由实体花纹块逐块生成，块间空隙就是纵向主沟与横向沟，块内的细缝是刀槽（sipes）。</p></div>
    <div class="p-section"><h3>设计要点</h3>
      <ul>${spec.highlights.map((h) => `<li>${h}</li>`).join('')}</ul>
    </div>
    <div class="p-actions">
      <button class="p-equip" id="pEquip" type="button">${isEquipped ? '✓ 当前已装配到整车（点击切回整车）' : '装配此规格到整车物理场 →'}</button>
      <button class="p-back" id="pBack" type="button">← 返回轮胎总览</button>
    </div>`;
  $('#pEquip').addEventListener('click', () => {
    equipTireOnVehicle(spec);
    selectMode('vehicle');
  });
  $('#pBack').addEventListener('click', tireOverview);
}

// ---------------------------------------------------------------- 相机辅助 & 轮胎特写视角
function overviewDistance() {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  return THREE.MathUtils.clamp(6.7 / aspect, 3.8, 9.5);
}

function moveCamera(pos, target, instant = false) {
  if (instant) {
    state.anim = null;
    camera.position.copy(pos);
    controls.target.copy(target);
    controls.update();
  } else {
    state.anim = { pos: pos.clone(), target: target.clone() };
  }
}
controls.addEventListener('start', () => { state.anim = null; });

function tireOverview(instant = false) {
  state.tireFocus = null;
  state.tireView = 'overview';
  tires.forEach((t) => {
    t.root.visible = true;
    t.podium.visible = true;
    t.ring.visible = true;
    t.ao.visible = true;
    t.cardEl.classList.remove('active');
  });
  panel.classList.remove('open');
  document.body.classList.remove('focused');
  moveCamera(new THREE.Vector3(0, 1.08, overviewDistance()), new THREE.Vector3(0, 0.46, 0), instant);
}

function tireFocus(i, instant = false) {
  const t = tires[i];
  state.tireFocus = i;
  state.tireView = 'focus';
  tires.forEach((o, j) => {
    const on = j === i;
    o.root.visible = on;
    o.podium.visible = on;
    o.ring.visible = on;
    o.ao.visible = on;
    o.cardEl.classList.toggle('active', on);
  });
  renderTirePanel(t.spec);
  panel.classList.add('open');
  document.body.classList.add('focused');
  const d = t.dimensions;
  moveCamera(
    new THREE.Vector3(t.x + 0.62, d.outerRadius + 0.72, 2.15),
    new THREE.Vector3(t.x + 0.30, d.outerRadius + PODIUM_H, 0),
    instant
  );
}

function tireTopView(instant = false) {
  state.tireView = 'top';
  if (state.tireFocus !== null) {
    const t = tires[state.tireFocus];
    const d = t.dimensions;
    moveCamera(
      new THREE.Vector3(t.x + 0.30, d.outerRadius * 2 + 1.30, 1.34),
      new THREE.Vector3(t.x + 0.24, d.outerRadius + PODIUM_H, 0),
      instant
    );
  } else {
    moveCamera(new THREE.Vector3(0, 2.85, 1.62), new THREE.Vector3(0, 0.36, 0), instant);
  }
}

// ---------------------------------------------------------------- 模式 Tabs & 工具栏控制
const modeTabs = $$('.mode-tabs button[role="tab"]');
const tabPanels = $$('.tab-panels > [role="tabpanel"]');
const toolbarButtons = $$('.toolbar button[data-modes]');

function updateToolbarVisibility(mode) {
  for (const btn of toolbarButtons) {
    const allowed = btn.dataset.modes.split(' ');
    btn.hidden = !allowed.includes(mode);
  }
}

function selectMode(modeId, instantCamera = false) {
  if (!STUDIO_MODES.some((m) => m.id === modeId)) return;
  state.mode = modeId;

  const meta = STUDIO_MODES.find((m) => m.id === modeId);
  $('#modeSubtitle').textContent = meta.subtitle;

  for (const tab of modeTabs) {
    const active = tab.dataset.mode === modeId;
    tab.ariaSelected = String(active);
    tab.toggleAttribute('focusgroupstart', active);
  }

  for (const p of tabPanels) {
    const active = p.id === `panel-${modeId}`;
    if (active) {
      p.removeAttribute('hidden');
      p.tabIndex = 0;
    } else {
      p.hidden = 'until-found';
      p.removeAttribute('tabindex');
    }
  }

  updateToolbarVisibility(modeId);

  // 切换 3D 舞台与 UI 浮层
  vehicleRig.root.visible = modeId === 'vehicle';
  physicsWorld.setVisible(modeId === 'vehicle');
  tireStage.visible = modeId === 'tire';
  suspensionStage.visible = modeId === 'suspension';
  drivetrainStage.visible = modeId === 'drivetrain';

  $('#telemetryHud').hidden = modeId !== 'vehicle';
  $('#driveDock').hidden = modeId !== 'vehicle';
  $('#tireBottom').hidden = modeId !== 'tire';
  gridHelper.visible = modeId === 'vehicle';

  if (modeId !== 'tire') {
    panel.classList.remove('open');
    document.body.classList.remove('focused');
    tires.forEach((t) => { t.labelEl.style.opacity = '0'; });
  }

  if (modeId === 'vehicle') {
    const cp = physicsWorld.chassisBody.position;
    moveCamera(
      new THREE.Vector3(cp.x + 3.6, cp.y + 1.85, cp.z + 4.3),
      new THREE.Vector3(cp.x, cp.y + 0.12, cp.z + 0.4),
      instantCamera
    );
  } else if (modeId === 'tire') {
    tireOverview(instantCamera);
  } else if (modeId === 'suspension') {
    moveCamera(new THREE.Vector3(1.55, 0.88, 1.75), new THREE.Vector3(0.24, 0.42, 0), instantCamera);
  } else if (modeId === 'drivetrain') {
    moveCamera(new THREE.Vector3(1.85, 1.38, 1.95), new THREE.Vector3(0, 0.56, 0.05), instantCamera);
  }

  announce(`已切换到${meta.label}`);
}

for (const tab of modeTabs) {
  tab.addEventListener('click', () => selectMode(tab.dataset.mode));
}

for (const p of tabPanels) {
  p.addEventListener('beforematch', () => {
    const modeId = p.id.replace('panel-', '');
    selectMode(modeId);
  });
}

// 若浏览器尚不支持原生 focusgroup，按 guidance 装上 roving-tabindex 回退
if (!('focusGroup' in HTMLElement.prototype)) {
  const tablist = $('.mode-tabs');
  modeTabs.forEach((t, idx) => { t.tabIndex = idx === 0 ? 0 : -1; });
  tablist.addEventListener('keydown', (e) => {
    const cur = modeTabs.indexOf(document.activeElement);
    if (cur < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (cur + 1) % modeTabs.length;
    else if (e.key === 'ArrowLeft') next = (cur - 1 + modeTabs.length) % modeTabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = modeTabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    modeTabs.forEach((t, i) => { t.tabIndex = i === next ? 0 : -1; });
    modeTabs[next].focus();
    selectMode(modeTabs[next].dataset.mode);
  });

  const bar = $('.toolbar');
  const syncBarTabIndex = () => {
    const visible = toolbarButtons.filter((b) => !b.hidden);
    if (!visible.length) return;
    if (!visible.some((b) => b.tabIndex === 0)) {
      toolbarButtons.forEach((b) => { b.tabIndex = -1; });
      visible[0].tabIndex = 0;
    }
  };
  syncBarTabIndex();
  bar.addEventListener('focusin', ({ target }) => {
    if (toolbarButtons.includes(target)) {
      toolbarButtons.forEach((b) => { b.tabIndex = b === target ? 0 : -1; });
    }
  });
  bar.addEventListener('keydown', (e) => {
    const visible = toolbarButtons.filter((b) => !b.hidden);
    const idx = visible.indexOf(document.activeElement);
    if (idx < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % visible.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + visible.length) % visible.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = visible.length - 1;
    if (next < 0) return;
    e.preventDefault();
    visible.forEach((b, i) => { b.tabIndex = i === next ? 0 : -1; });
    visible[next].focus();
  });
}

// ---------------------------------------------------------------- 工具栏与滑块联动
function setToggle(btn, on) {
  btn.setAttribute('aria-pressed', String(on));
}

function syncSlider(slider, formatFn) {
  const update = () => {
    slider.style.setProperty('--attr-min', slider.min || '0');
    slider.style.setProperty('--attr-max', slider.max || '100');
    slider.style.setProperty('--control-value', slider.value);
    const out = document.querySelector(`output[for="${slider.id}"]`);
    const text = formatFn ? formatFn(Number(slider.value)) : slider.value;
    if (out) out.textContent = text;
    slider.setAttribute('aria-valuetext', text);
  };
  update();
  slider.addEventListener('input', update);
}

// 工具栏按钮事件
$('#btnAutoDemo').addEventListener('click', (e) => {
  physicsWorld.state.autoDemo = !physicsWorld.state.autoDemo;
  setToggle(e.currentTarget, physicsWorld.state.autoDemo);
  announce(physicsWorld.state.autoDemo ? '已开启自动试驾演示' : '已切回手动驾驶');
});

$('#btnFollow').addEventListener('click', (e) => {
  state.followCamera = !state.followCamera;
  setToggle(e.currentTarget, state.followCamera);
});

$('#btnShell').addEventListener('click', (e) => {
  state.shellVisible = !state.shellVisible;
  vehicleRig.setShellVisible(state.shellVisible);
  setToggle(e.currentTarget, state.shellVisible);
});

$('#btnSlowMo').addEventListener('click', (e) => {
  physicsWorld.state.slowMo = !physicsWorld.state.slowMo;
  setToggle(e.currentTarget, physicsWorld.state.slowMo);
});

$('#btnSpin').addEventListener('click', (e) => {
  state.spin = !state.spin;
  setToggle(e.currentTarget, state.spin);
});

$('#btnRim').addEventListener('click', (e) => {
  state.rimVisible = !state.rimVisible;
  if (!state.rimVisible && state.bareRim) {
    state.bareRim = false;
    tires.forEach((t) => { t.tireGroup.visible = true; });
    setToggle($('#btnBareRim'), false);
  }
  tires.forEach((t) => {
    t.rimGroup.visible = state.rimVisible;
    t.liner.visible = !state.rimVisible;
  });
  vehicleRig.setRimVisible(state.rimVisible);
  if (benchTire) {
    benchTire.rimGroup.visible = state.rimVisible;
    benchTire.liner.visible = !state.rimVisible;
  }
  setToggle(e.currentTarget, state.rimVisible);
});

$('#btnBareRim').addEventListener('click', (e) => {
  state.bareRim = !state.bareRim;
  if (state.bareRim && !state.rimVisible) {
    state.rimVisible = true;
    tires.forEach((t) => {
      t.rimGroup.visible = true;
      t.liner.visible = false;
    });
    setToggle($('#btnRim'), true);
  }
  tires.forEach((t) => { t.tireGroup.visible = !state.bareRim; });
  setToggle(e.currentTarget, state.bareRim);
  announce(state.bareRim ? '已隐藏胎皮，展示裸轮毂与 J-轮廓结构' : '已恢复显示完整轮胎总成');
});

$('#btnHi').addEventListener('click', (e) => {
  state.highlight = !state.highlight;
  tires.forEach((t) => { t.treadMesh.material = state.highlight ? t.materials.treadHi : t.materials.tread; });
  vehicleRig.setTreadHighlight(state.highlight);
  setToggle(e.currentTarget, state.highlight);
});

$('#btnDrop').addEventListener('click', () => {
  physicsWorld.triggerDropTest();
  announce('已执行车辆跌落冲击测试');
});

$('#btnBumpRun').addEventListener('click', () => {
  physicsWorld.state.autoDemo = false;
  setToggle($('#btnAutoDemo'), false);
  physicsWorld.launchBumpRun();
  announce('已启动冲减速带测试');
});

$('#btnResetCar').addEventListener('click', () => {
  physicsWorld.state.autoDemo = false;
  setToggle($('#btnAutoDemo'), false);
  physicsWorld.resetVehicle(0.24);
  const cp = physicsWorld.chassisBody.position;
  moveCamera(
    new THREE.Vector3(cp.x + 3.6, cp.y + 1.85, cp.z + 4.3),
    new THREE.Vector3(cp.x, cp.y + 0.12, cp.z + 0.4)
  );
  announce('车辆已重置回试验台起点');
});

$('#btnTop').addEventListener('click', () => tireTopView(false));
$('#btnResetTire').addEventListener('click', () => tireOverview(false));

$('#btnImpact').addEventListener('click', () => {
  suspBench.triggerImpact(2.6);
  announce('已对单角避震施加冲击脉冲');
});

$('#btnArticulate').addEventListener('click', (e) => {
  state.articulateDrivetrain = !state.articulateDrivetrain;
  setToggle(e.currentTarget, state.articulateDrivetrain);
});

// 档位切换
const gearBtns = $$('#gearGroup .gbtn');
gearBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const idx = Number(btn.dataset.gear);
    const gear = GEAR_RATIOS[idx];
    physicsWorld.state.gearRatio = gear.ratio;
    gearBtns.forEach((b) => {
      const on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('#gearNote').textContent = `${gear.label.split(' ')[0]} 档 · ${gear.ratio.toFixed(2)}:1`;
    announce(`已切换至 ${gear.label}`);
  });
});

// 物理与渲染滑块
const rangeStiffness = $('#rangeStiffness');
const rangeDamping = $('#rangeDamping');
const rangeTravel = $('#rangeTravel');
const rangeLight = $('#rangeLight');
const rangeLightTire = $('#rangeLightTire');

syncSlider(rangeStiffness, (v) => `${Math.round(v)}`);
syncSlider(rangeDamping, (v) => v.toFixed(1));
syncSlider(rangeTravel, (v) => `${Math.round(v * 10)} mm`);

const applyLightValue = (val) => {
  const v = val / 100;
  renderer.toneMappingExposure = 0.78 + v * 0.62;
  scene.environmentIntensity = 0.55 + v * 1.05;
};

syncSlider(rangeLight, (v) => `${Math.round(v)}%`);
syncSlider(rangeLightTire, (v) => `${Math.round(v)}%`);

rangeStiffness.addEventListener('input', () => {
  const v = Number(rangeStiffness.value);
  physicsWorld.setSuspensionParams({ stiffness: v });
  suspBench.cfg.stiffness = v;
});
rangeDamping.addEventListener('input', () => {
  const v = Number(rangeDamping.value);
  physicsWorld.setSuspensionParams({ damping: v });
  suspBench.cfg.damping = v;
});
rangeTravel.addEventListener('input', () => {
  const len = Number(rangeTravel.value) / 100;
  physicsWorld.setSuspensionParams({ restLength: len });
  suspBench.cfg.restLength = len;
});

const bindLightPair = (source, target) => {
  source.addEventListener('input', () => {
    const val = Number(source.value);
    applyLightValue(val);
    target.value = source.value;
    target.style.setProperty('--control-value', target.value);
    const out = document.querySelector(`output[for="${target.id}"]`);
    if (out) out.textContent = `${Math.round(val)}%`;
    target.setAttribute('aria-valuetext', `${Math.round(val)}%`);
  });
};
bindLightPair(rangeLight, rangeLightTire);
bindLightPair(rangeLightTire, rangeLight);

// 避震特写台滑块
const rangeBenchLoad = $('#rangeBenchLoad');
const rangeBenchStiff = $('#rangeBenchStiff');
const rangeBenchDamp = $('#rangeBenchDamp');
syncSlider(rangeBenchLoad, (v) => `${Math.round(v)}%`);
syncSlider(rangeBenchStiff, (v) => `${Math.round(v)}`);
syncSlider(rangeBenchDamp, (v) => v.toFixed(1));

rangeBenchLoad.addEventListener('input', () => {
  suspBench.cfg.manualPreload = Number(rangeBenchLoad.value) / 100;
});
rangeBenchStiff.addEventListener('input', () => {
  suspBench.cfg.stiffness = Number(rangeBenchStiff.value);
});
rangeBenchDamp.addEventListener('input', () => {
  suspBench.cfg.damping = Number(rangeBenchDamp.value);
});

// 传动特写台滑块
const rangeMotorRpm = $('#rangeMotorRpm');
syncSlider(rangeMotorRpm, (v) => `${Math.round(v)} RPM`);
rangeMotorRpm.addEventListener('input', () => {
  state.motorRpm = Number(rangeMotorRpm.value);
});

// ---------------------------------------------------------------- 驾驶键盘与触控按键
const keysHeld = new Set();
const touchDrive = { forward: false, backward: false, left: false, right: false, brake: false };

$$('.dbtn[data-drive]').forEach((btn) => {
  const dir = btn.dataset.drive;
  const setDown = (down) => {
    touchDrive[dir] = down;
    btn.classList.toggle('pressed', down);
    if (down && physicsWorld.state.autoDemo) {
      physicsWorld.state.autoDemo = false;
      setToggle($('#btnAutoDemo'), false);
    }
  };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); setDown(true); });
  btn.addEventListener('pointerup', () => setDown(false));
  btn.addEventListener('pointerleave', () => setDown(false));
  btn.addEventListener('pointercancel', () => setDown(false));
});

window.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  const onFormControl = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  const k = e.key.toLowerCase();

  if (state.mode === 'tire') {
    if (e.key === 'Escape' || e.key === '0' || k === 'r') tireOverview();
    if (e.key >= '1' && e.key <= '4' && !onFormControl) tireFocus(Number(e.key) - 1);
    if ((e.key === ' ' || e.code === 'Space') && tag !== 'BUTTON' && !onFormControl) {
      e.preventDefault();
      $('#btnSpin').click();
    }
    return;
  }

  if (state.mode === 'vehicle' && !onFormControl) {
    if (['w', 'a', 's', 'd'].includes(k)) {
      keysHeld.add(k);
      if (physicsWorld.state.autoDemo) {
        physicsWorld.state.autoDemo = false;
        setToggle($('#btnAutoDemo'), false);
      }
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && tag !== 'BUTTON') {
      e.preventDefault();
      keysHeld.add(k);
    }
    if ((e.key === ' ' || e.code === 'Space') && tag !== 'BUTTON') {
      e.preventDefault();
      keysHeld.add('space');
    }
    if (k === 'r') $('#btnResetCar').click();
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  keysHeld.delete(k);
  if (e.key === ' ' || e.code === 'Space') keysHeld.delete('space');
});

// 轮胎模式：点击 3D 轮胎聚焦（拖拽不触发）
const raycaster = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
  downAt = null;
  if (moved > 5 || state.mode !== 'tire') return;
  const ndc = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(tires.filter((t) => t.root.visible).map((t) => t.root), true);
  if (!hits.length) return;
  let o = hits[0].object;
  while (o && o.userData.index === undefined) o = o.parent;
  if (o) tireFocus(o.userData.index);
});

// ---------------------------------------------------------------- 窗口自适应
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (state.mode === 'tire' && state.tireFocus === null && state.tireView === 'overview' && !state.anim) {
    camera.position.set(0, 1.08, overviewDistance());
    controls.target.set(0, 0.46, 0);
    controls.update();
  }
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- 遥测 HUD 与分场景更新
const hudSpeed = $('#hudSpeed');
const hudRpm = $('#hudRpm');
const barEls = ['FL', 'FR', 'RL', 'RR'].map((k) => ({ bar: $(`#bar${k}`), val: $(`#val${k}`) }));

const _benchDir = new THREE.Vector3();
const _benchZ = new THREE.Vector3(0, 0, 1);

function aimBenchBar(mesh, start, end) {
  _benchDir.subVectors(end, start);
  const len = _benchDir.length() || 0.01;
  _benchDir.divideScalar(len);
  mesh.position.copy(start);
  mesh.quaternion.setFromUnitVectors(_benchZ, _benchDir);
  mesh.scale.z = len;
}

function updateSuspensionBench(dt) {
  const res = suspBench.step(dt);
  const d = benchTire ? benchTire.dimensions : deriveDimensions(equippedTireSpec);
  const roadTopY = 0.14 + res.roadHeight;
  const wheelY = roadTopY + d.outerRadius;
  const chassisY = wheelY + res.suspensionLength - CAR_CONFIG.chassisConnY;

  shakerPlate.position.y = roadTopY - 0.03;

  const upperPivot = new THREE.Vector3(-0.20, chassisY + 0.12, 0);
  const lowerPivot = new THREE.Vector3(-0.20, chassisY - 0.09, 0);
  const shockTop = new THREE.Vector3(-0.14, chassisY + 0.28, 0);
  const hubPos = new THREE.Vector3(0.46, wheelY, 0);

  benchKnuckle.position.copy(hubPos);

  const uEnd = new THREE.Vector3(hubPos.x - 0.14, hubPos.y + 0.09, 0);
  const lEnd = new THREE.Vector3(hubPos.x - 0.14, hubPos.y - 0.085, 0);

  aimBenchBar(benchUpperArm, upperPivot, uEnd);
  aimBenchBar(benchLowerArm, lowerPivot, lEnd);

  const shockBot = new THREE.Vector3().lerpVectors(lowerPivot, lEnd, 0.72);
  shockBot.y += 0.02;
  const compRatio = Math.max(0, Math.min(1, (res.restLength - res.suspensionLength) / CAR_CONFIG.suspension.maxTravel));
  benchCoil.setSpan(shockTop, shockBot, compRatio);
}

const _dlHubLocal = [
  new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()
];

function updateDrivetrainBench(dt) {
  const slowScale = physicsWorld.state.slowMo ? 0.28 : 1.0;
  const stepDt = dt * slowScale;
  state.drivetrainTime += stepDt;

  // motorRpm -> 电机转角 -> 按 16:24 传给中央传动轴 -> 再经 3.73 传给半轴/车轮
  const motorOmega = (state.motorRpm * Math.PI * 2) / 60;
  const shaftOmega = motorOmega * (16 / 24);
  const wheelOmega = shaftOmega / 3.73;
  state.drivetrainAngle += wheelOmega * stepDt;

  for (let i = 0; i < dlHubMarkers.length; i++) {
    const m = dlHubMarkers[i];
    const bounce = state.articulateDrivetrain
      ? Math.sin(state.drivetrainTime * 3.1 + (i % 2 === 0 ? 0 : Math.PI) + (i >= 2 ? 1.1 : 0)) * 0.15
      : 0;
    m.mesh.position.set(m.basePos.x, m.basePos.y + bounce, m.basePos.z);
    _dlHubLocal[i].set(m.basePos.x, m.basePos.y + bounce - 0.56, m.basePos.z);
  }
  dlRig.update(_dlHubLocal, state.drivetrainAngle, 2.1);
}

// ---------------------------------------------------------------- 主循环
const clock = new THREE.Clock();
const projected = new THREE.Vector3();
const prevChassisPos = new THREE.Vector3().copy(physicsWorld.chassisBody.position);

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state.mode === 'vehicle') {
    const fwd = (keysHeld.has('w') || keysHeld.has('arrowup') || touchDrive.forward ? 1 : 0)
      - (keysHeld.has('s') || keysHeld.has('arrowdown') || touchDrive.backward ? 1 : 0);
    const steer = (keysHeld.has('a') || keysHeld.has('arrowleft') || touchDrive.left ? 1 : 0)
      - (keysHeld.has('d') || keysHeld.has('arrowright') || touchDrive.right ? 1 : 0);
    const brake = keysHeld.has('space') || touchDrive.brake;

    const snap = physicsWorld.step(dt, { throttle: fwd, steer, brake });
    vehicleRig.syncFromPhysics(snap);

    // 随车跟拍（叠加车身位移增量，依然保留鼠标自由拖拽旋转与缩放）
    if (state.followCamera && !state.anim) {
      const dx = snap.chassisPosition.x - prevChassisPos.x;
      const dy = snap.chassisPosition.y - prevChassisPos.y;
      const dz = snap.chassisPosition.z - prevChassisPos.z;
      camera.position.x += dx;
      camera.position.y += dy;
      camera.position.z += dz;
      controls.target.x += dx;
      controls.target.y += dy;
      controls.target.z += dz;
    }
    prevChassisPos.copy(snap.chassisPosition);

    // 太阳阴影中心随车移动，保证开到场地任何位置都有锐利阴影
    key.target.position.set(snap.chassisPosition.x, 0, snap.chassisPosition.z);
    key.position.set(snap.chassisPosition.x + 5.2, 8.8, snap.chassisPosition.z + 6.4);

    // 更新遥测 HUD
    const speedAbs = Math.abs(snap.speedKmHour);
    hudSpeed.textContent = speedAbs.toFixed(1);
    const wheelR = deriveDimensions(equippedTireSpec).outerRadius;
    const speedMs = speedAbs / 3.6;
    const driveshaftRpm = Math.round(((speedMs / wheelR) * 60 / (Math.PI * 2)) * 3.73);
    hudRpm.textContent = String(driveshaftRpm);

    for (let i = 0; i < 4; i++) {
      const w = snap.wheels[i];
      const pct = Math.round(Math.max(0, Math.min(1, (w.restLength - w.suspensionLength) / w.maxTravel)) * 100);
      barEls[i].bar.style.width = `${pct}%`;
      barEls[i].val.textContent = `${pct}%`;
    }
  } else if (state.mode === 'tire') {
    key.target.position.set(0, 0.4, 0);
    key.position.set(3.2, 6.2, 4.6);
    if (state.spin) {
      tires.forEach((t) => { t.spin.rotation.z += dt * 0.32; });
    }
    const w = window.innerWidth, h = window.innerHeight;
    tires.forEach((t) => {
      const visible = t.root.visible && state.tireFocus === null;
      if (!visible) { t.labelEl.style.opacity = '0'; return; }
      projected.copy(t.labelPos).project(camera);
      const onScreen = projected.z < 1 && Math.abs(projected.x) < 1.15 && Math.abs(projected.y) < 1.15;
      t.labelEl.style.opacity = onScreen ? '1' : '0';
      t.labelEl.style.left = `${(projected.x * 0.5 + 0.5) * w}px`;
      t.labelEl.style.top = `${(-projected.y * 0.5 + 0.5) * h}px`;
    });
  } else if (state.mode === 'suspension') {
    key.target.position.set(0.2, 0.4, 0);
    key.position.set(3.2, 5.8, 4.4);
    updateSuspensionBench(physicsWorld.state.slowMo ? dt * 0.28 : dt);
  } else if (state.mode === 'drivetrain') {
    key.target.position.set(0, 0.5, 0);
    key.position.set(3.6, 6.2, 4.6);
    updateDrivetrainBench(dt);
  }

  if (state.anim) {
    camera.position.lerp(state.anim.pos, 1 - Math.pow(0.001, dt));
    controls.target.lerp(state.anim.target, 1 - Math.pow(0.001, dt));
    if (camera.position.distanceTo(state.anim.pos) < 0.004) state.anim = null;
  }
  controls.update();

  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- 启动与 Hash 参数支持
vehicleRig.setShellVisible(state.shellVisible);
setToggle($('#btnFollow'), true);
setToggle($('#btnSpin'), true);
setToggle($('#btnRim'), true);
setToggle($('#btnArticulate'), true);

const hashParams = new URLSearchParams(location.hash.slice(1));
const initMode = hashParams.get('mode') || (hashParams.has('tire') ? 'tire' : 'vehicle');
selectMode(initMode, true);
if (initMode === 'tire' && hashParams.has('tire')) {
  const i = Number(hashParams.get('tire'));
  if (Number.isInteger(i) && i >= 0 && i < tires.length) tireFocus(i, true);
}
if (initMode === 'tire' && hashParams.get('view') === 'top') tireTopView(true);

tick();
window.__CAR_LAB_READY__ = true;

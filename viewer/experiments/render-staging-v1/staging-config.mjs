// R-24 · 独立参数适配层。
// 本文件不修改 workbench-v2/viewport.js：它只在运行时对「真实生产 EngineeringViewport 实例」
// 覆写候选参数，使 A/B 用的是同一 5173 渲染代码和同一份 GLB/工程状态。
//
// 变量纪律：b = 全基线；M / G / H / S 各自是严格单变量；all = 四变量全开，仅作组合反例。
// 所有候选数值都是 VISUAL_ASSUMPTION（视觉假设），不是厂商材料/光照标准或计量认证。
import * as THREE from 'three';

/** workbench-v2/viewport.js 当前一手基线（2026-11-15 22:34 逐行核对） */
export const V2_BASELINE = Object.freeze({
  exposure: 1.18,          // :26
  hemiIntensity: 0.9,      // :33
  sunIntensity: 2.0,       // :34
  fillIntensity: 0.9,      // :42
  gridY: -0.095,           // :46
  groundY: -0.096,         // :56
  metalness: 0.70,         // :166
  roughness: 0.34,         // :166
  envMapIntensity: 1.05    // :167
});

/** R-19 曾写死的地面常量；R-24 任务书明确禁止复用，必须由 GLB bounds 推导。 */
export const HARDCODED_GROUND_Y = -0.043;
export const CLEARANCE_M = 0.001; // 地面低于 GLB 最低点 1 mm，防 z-fighting

/** 候选数值：均标 VISUAL_ASSUMPTION，来源见 docs/research/R-24-v2-visual-staging.md */
export const CANDIDATE_VALUES = Object.freeze({
  hemiIntensity: { baseline: 0.9, proposed: 0.45, evidenceLevel: 'VISUAL_ASSUMPTION' },
  sunIntensity: { baseline: 2.0, proposed: 2.4, evidenceLevel: 'VISUAL_ASSUMPTION' }
});

export const VARIABLE_KEYS = Object.freeze(['m', 'g', 'h', 's']);

export const VARIABLE_LABELS = Object.freeze({
  m: 'GLB 原生 PBR 分层（严格单变量）',
  g: '地面高度由 GLB bounds 推导（严格单变量）',
  h: '环境填光 hemi 强度（严格单变量）',
  s: '主光 sun 强度（严格单变量）'
});

/**
 * 解析并校验 URL 配置。非法值显式抛错，绝不静默回退基线。
 * all=1 是刻意保留的组合反例开关，会标明 isCombination=true。
 */
export function parseConfig(searchParams) {
  if (searchParams.get('groundPolicy') === 'hardcoded') {
    throw new Error(`拒绝写死地面：R-24 要求由 GLB bounds 推导，禁止复用 R-19 的 ${HARDCODED_GROUND_Y} 常量`);
  }
  const all = searchParams.get('all') ?? '0';
  if (!['0', '1'].includes(all)) throw new Error(`非法 all=${all}（只允许 0/1）`);
  const cfg = { isCombination: all === '1' };
  for (const k of VARIABLE_KEYS) {
    const raw = all === '1' ? '1' : (searchParams.get(k) ?? '0');
    if (raw !== '0' && raw !== '1') {
      throw new Error(`非法 ${k}=${raw}（只允许 0/1），拒绝静默回退基线`);
    }
    cfg[k] = Number(raw);
  }
  cfg.active = VARIABLE_KEYS.filter((k) => cfg[k] === 1);
  if (!cfg.isCombination && cfg.active.length > 1) {
    throw new Error(`违反一轮一个变量：同时开启 ${cfg.active.join(', ')}；请使用 all=1 明确标记组合反例`);
  }
  return cfg;
}

/**
 * 由「全可见、无爆炸」的完整模型包围盒推导地面/网格高度。
 * 刻意不使用单部件隔离或爆炸后的 bounds——否则地面会跟着场景状态漂移。
 */
export function deriveGroundFromBounds(modelBox) {
  const minY = modelBox.min.y;
  const groundY = +(minY - CLEARANCE_M).toFixed(6);
  const gridY = +(groundY + CLEARANCE_M).toFixed(6);
  return {
    policy: 'GLB_BOUNDS_DERIVED',
    boundsSource: 'FULL_MODEL_ALL_VISIBLE_EXPLODE_0',
    boundsMinY: +minY.toFixed(6),
    clearanceM: CLEARANCE_M,
    groundY,
    gridY,
    hardcodedY: HARDCODED_GROUND_Y,
    deltaFromHardcodedM: +(groundY - HARDCODED_GROUND_Y).toFixed(6),
    v2GroundY: V2_BASELINE.groundY,
    gapFromV2GroundM: +(minY - V2_BASELINE.groundY).toFixed(6),
    evidenceLevel: 'GLB_GEOMETRY_MEASURED'
  };
}

/** 从生产 viewport 保留的 GLB 模板节点读取原生 PBR 数值（不是硬编码表）。 */
export function collectGlbNativePbr(view, seed) {
  const out = {};
  for (const part of seed.catalog) {
    const src = view.templates.get(part.partKey);
    if (!src) throw new Error('GLB 模板缺少 ' + part.partKey);
    const values = [];
    src.traverse((node) => {
      if (!node.isMesh) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        values.push({
          name: mat?.name || '(none)',
          metalness: +(mat?.metalness ?? 0).toFixed(4),
          roughness: +(mat?.roughness ?? 0).toFixed(4)
        });
      }
    });
    out[part.partKey] = values;
  }
  return out;
}

function findLight(scene, predicate, label) {
  const hit = scene.children.find(predicate);
  if (!hit) throw new Error('生产场景缺少 ' + label + '，参数适配基线已漂移');
  return hit;
}

/**
 * 把候选参数应用到真实 EngineeringViewport 实例。
 * 该函数在每次 sync() 之后调用，保证不被生产 sync 的颜色/高亮逻辑覆盖。
 */
export function applyStaging(view, cfg, ctx) {
  const hemi = findLight(view.scene, (o) => o.isHemisphereLight, 'HemisphereLight');
  const sun = findLight(view.scene, (o) => o.isDirectionalLight && o.castShadow, 'castShadow DirectionalLight (sun)');
  const fill = findLight(view.scene, (o) => o.isDirectionalLight && !o.castShadow, 'fill DirectionalLight');
  const ground = view.scene.children.find((o) => o.isMesh && o.material?.isShadowMaterial);
  const grid = view.scene.children.find((o) => o.name === 'visual_reference_grid');
  if (!ground || !grid) throw new Error('生产场景缺少 ground/grid，参数适配基线已漂移');

  const applied = {
    exposure: V2_BASELINE.exposure,
    hemiIntensity: cfg.h ? CANDIDATE_VALUES.hemiIntensity.proposed : V2_BASELINE.hemiIntensity,
    sunIntensity: cfg.s ? CANDIDATE_VALUES.sunIntensity.proposed : V2_BASELINE.sunIntensity,
    fillIntensity: V2_BASELINE.fillIntensity,
    groundY: cfg.g ? ctx.groundDerived.groundY : V2_BASELINE.groundY,
    gridY: cfg.g ? ctx.groundDerived.gridY : V2_BASELINE.gridY,
    materialMode: cfg.m ? 'GLB_NATIVE_PBR' : 'V2_UNIFORM_OVERRIDE',
    groundPolicy: cfg.g ? 'GLB_BOUNDS_DERIVED' : 'V2_FIXED',
    evidenceLevel: 'VISUAL_ASSUMPTION'
  };

  hemi.intensity = applied.hemiIntensity;
  sun.intensity = applied.sunIntensity;
  fill.intensity = applied.fillIntensity;
  view.renderer.toneMappingExposure = applied.exposure;
  ground.position.y = applied.groundY;
  grid.position.y = applied.gridY;

  // M：恢复 GLB 自带各零件 PBR 分档；不动 color / emissive / clippingPlanes / 几何。
  if (cfg.m) {
    const instances = ctx.instances;
    for (const [id, object] of view.objects) {
      const inst = instances.find((x) => x.instanceId === id);
      if (!inst) continue;
      const native = ctx.nativePbr[inst.partKey];
      if (!native) continue;
      let cursor = 0;
      object.traverse((node) => {
        if (!node.isMesh) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of mats) {
          const value = native[cursor++];
          if (!value || !mat) continue;
          mat.metalness = value.metalness;
          mat.roughness = value.roughness;
        }
      });
    }
  }
  return applied;
}

/** 采集与「材质颜色一致性 / 高亮 / 剖切 / 可见性」有关的状态断言。 */
export function collectState(view) {
  const rows = [];
  for (const [id, object] of view.objects) {
    let visible = object.visible;
    let node = object.parent;
    while (node) { if (!node.visible) visible = false; node = node.parent; }
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        rows.push({
          instanceId: id,
          visible,
          color: mat.color?.getHexString?.() ?? null,
          baseColor: mat.userData?.baseColor?.getHexString?.() ?? null,
          emissive: mat.emissive?.getHexString?.() ?? null,
          emissiveIntensity: +(mat.emissiveIntensity ?? 0).toFixed(4),
          clippingPlanes: (mat.clippingPlanes || []).length,
          clipIntersection: !!mat.clipIntersection,
          metalness: +(mat.metalness ?? 0).toFixed(4),
          roughness: +(mat.roughness ?? 0).toFixed(4),
          envMapIntensity: +(mat.envMapIntensity ?? 0).toFixed(4)
        });
      }
    });
  }
  return rows;
}

/** 只统计真正可见网格的包围盒；Box3.setFromObject 会包含不可见对象，不能直接用于单部件场景。 */
export function visibleBox(view) {
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

/** 纹理 / 几何 / 三角形静态成本普查（与 renderer.info 的运行时计数分开记录）。 */
export function assetCensus(view) {
  const geometries = new Set();
  const textures = new Set();
  const slots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
    'emissiveMap', 'alphaMap', 'envMap', 'lightMap', 'bumpMap', 'displacementMap'];
  let meshCount = 0, triangles = 0, textureSlots = 0;
  const attributeNames = new Set();
  view.modelLayer.traverse((node) => {
    if (!node.isMesh) return;
    meshCount++;
    const g = node.geometry;
    geometries.add(g.uuid);
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const name of Object.keys(g.attributes)) attributeNames.add(name);
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const key of slots) {
        if (mat[key]) { textures.add(mat[key].uuid); textureSlots++; }
      }
    }
  });
  return {
    meshCount,
    triangles: +triangles.toFixed(0),
    uniqueGeometries: geometries.size,
    uniqueTextures: textures.size,
    textureSlots,
    attributeNames: [...attributeNames].sort(),
    note: 'GLB 无外部贴图时 uniqueTextures 应为 0；PMREM/RoomEnvironment 由 renderer 管理，不计入模型资产'
  };
}

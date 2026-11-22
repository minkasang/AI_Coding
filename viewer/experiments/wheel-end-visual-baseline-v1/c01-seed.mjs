/**
 * R-35 / 03.37.01 — C-01 轮端资产 → 生产 EngineeringViewport 的 seed 适配器。
 *
 * 纯逻辑，不 import three，Node 与浏览器共用。
 *
 * 关键约束（来自 workbench-v2/viewport.js，只读）：
 *  - load(seed) 要求 seed.glbUnit === 'm'，并按 seed.catalog[].nodeMatch 从 GLB 取节点。
 *  - sync() 会用 part.color 覆盖材质颜色，缺省时退到 COLOR[partKey] 再退到固定 '#aec1da'。
 *    C-01 的 partId 全部命中兜底色，因此必须显式传色，否则 5 个零件会被刷成同一色。
 *  - sync() 会用 inst.offset 覆盖节点自身位移，因此 offset 必须等于 GLB 节点的 translation。
 */

/** 零件语义名。未收录的 partId 直接抛错，不允许静默兜底。 */
export const PART_KEYS = Object.freeze({
  'PART-20-016': 'knuckle',
  'PART-30-001': 'bearingOuter',
  'PART-30-002': 'bearingInner',
  'PART-30-006': 'hub',
  'PART-30-009': 'stud'
});

/** 线性值 → sRGB 十六进制（three 的 Color.set('#hex') 按 sRGB 解释）。 */
export function linearToSrgbHex(linear) {
  const enc = (c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  return '#' + linear.slice(0, 3).map((c) => enc(c).toString(16).padStart(2, '0')).join('');
}

/** sRGB 十六进制 → 线性分量，用于回读校验。 */
export function srgbHexToLinear(hex) {
  const v = hex.replace('#', '');
  const dec = (h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [dec(v.slice(0, 2)), dec(v.slice(2, 4)), dec(v.slice(4, 6))];
}

/**
 * 从 C-01 manifest 生成生产视窗可消费的 seed + project。
 * @param {object} manifest c01 manifest.json 解析结果
 * @param {object} nodeTransforms { [nodeName]: [x,y,z] } GLB 节点 translation（米）
 * @param {string} assetUrl 同源 GLB 路径
 */
export function buildC01Seed(manifest, nodeTransforms, assetUrl) {
  if (!manifest || !Array.isArray(manifest.instances)) throw new Error('buildC01Seed 需要 C-01 manifest.instances');
  if (!nodeTransforms || typeof nodeTransforms !== 'object') throw new Error('buildC01Seed 需要 GLB 节点位移表');
  if (!assetUrl) throw new Error('buildC01Seed 需要 assetUrl');

  const catalog = [];
  const instances = [];
  const seen = new Set();

  for (const inst of manifest.instances) {
    const node = inst.partInstanceId;
    if (!node) throw new Error('实例缺少 partInstanceId');
    if (seen.has(node)) throw new Error('实例 ID 重复：' + node);
    seen.add(node);

    const partKey = PART_KEYS[inst.partId];
    if (!partKey) throw new Error('未收录的 partId：' + inst.partId);
    const def = manifest.partDefinitions?.[inst.partId];
    if (!def) throw new Error('manifest 缺少零件定义：' + inst.partId);
    if (!Array.isArray(def.displayColor) || def.displayColor.length < 3) {
      throw new Error('零件缺少 displayColor：' + inst.partId);
    }

    const offset = nodeTransforms[node];
    if (!Array.isArray(offset) || offset.length !== 3 || offset.some((v) => !Number.isFinite(v))) {
      throw new Error('GLB 缺少可用节点位移：' + node);
    }

    catalog.push({
      partKey: node,
      nodeMatch: node,
      label: inst.label || partKey,
      semantic: partKey,
      partId: inst.partId,
      color: linearToSrgbHex(def.displayColor),
      linearColor: def.displayColor.slice(0, 3),
      explodeMm: 0,
      explodeAxis: [0, 0, 0]
    });
    instances.push({
      instanceId: node,
      partKey: node,
      label: inst.label || partKey,
      semantic: partKey,
      partId: inst.partId,
      visible: true,
      offset: offset.slice(0, 3)
    });
  }

  return {
    seed: {
      schemaVersion: 'carlab.project-demo/0.1',
      projectId: 'c01-wheel-end-fl',
      projectName: 'C-01 左前轮端（演示样板）',
      description: 'C-01 已验收 DEMO_ASSUMPTION 轮端；本 seed 仅用于 R-35 视觉基线验证。',
      asset: assetUrl,
      glbUnit: 'm',
      assetBasis: 'DEMO_ASSUMPTION',
      catalog,
      assemblies: [{ assemblyId: 'c01-wheel-end-root', name: '左前轮端', source: 'DEMO', instances }],
      relations: []
    },
    count: { instances: instances.length, parts: Object.keys(PART_KEYS).length }
  };
}

/**
 * 直接从 GLB 二进制读节点 translation（米），避免为拿位移而二次加载模型。
 * 只读 JSON chunk，不碰 geometry。
 */
export function readGlbNodeTranslations(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('不是合法 GLB（magic 不匹配）');
  const jsonLen = view.getUint32(12, true);
  const jsonType = view.getUint32(16, true);
  if (jsonType !== 0x4e4f534a) throw new Error('GLB 首块不是 JSON chunk');
  const text = new TextDecoder().decode(new Uint8Array(arrayBuffer, 20, jsonLen));
  const gltf = JSON.parse(text);
  if (!Array.isArray(gltf.nodes)) throw new Error('GLB 缺少 nodes');
  const out = {};
  for (const node of gltf.nodes) {
    if (!node || !node.name || node.mesh === undefined) continue;
    out[node.name] = Array.isArray(node.translation) ? node.translation : [0, 0, 0];
  }
  return { translations: out, gltf };
}

/** 关注的可读性配对（同机位下应当能区分开的零件对）。 */
export const KEY_PAIRS = Object.freeze([
  ['bearingInner', 'bearingOuter', '轴承内圈 vs 外圈（同轴压装，最易混）'],
  ['bearingOuter', 'hub', '轴承外圈 vs 轮毂法兰'],
  ['hub', 'stud', '轮毂法兰 vs 螺柱'],
  ['knuckle', 'bearingOuter', '转向节 vs 轴承外圈（压入关系）'],
  ['stud', 'bearingInner', '螺柱 vs 轴承内圈']
]);

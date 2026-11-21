// R-30 · M 单变量受控 feature flag adapter。
//
// 目的：把 R-24 已获批的 M（保留 GLB 自带 metalness/roughness 分档）变成**可开关、可回退**的
// 生产候选，而不是一次性改死渲染参数。本文件不修改 workbench-v2/viewport.js。
//
// 三条硬约束，全部由 verify.mjs 断言：
//  1. 默认关闭：enabled=false 时不写任何材质字段，生产行为与现状完全一致。
//  2. 一键回退：disable() 无条件写回 LEGACY_PBR（等同于 viewport.js:166-167 的硬编码值），
//     不依赖「进入时快照」——否则在已开启状态下再次 disable 会回退到开启后的值。
//  3. 不碰非 PBR：color / emissive / emissiveIntensity / visible / clippingPlanes 一律不写。
//
// 纯逻辑实现，不 import three，便于 Node 侧单测与浏览器共用同一份代码。
import { readGlbNativePbr } from './glb-pbr.mjs';

export { readGlbNativePbr };

export const FLAG_SCHEMA = 'carlab.r30.mPbrFlag/1.0';

/** 生产源码里的真实默认值；必须与 workbench-v2/viewport.js:166-167 一致 */
export const LEGACY_PBR = Object.freeze({ metalness: 0.70, roughness: 0.34, envMapIntensity: 1.05 });
export const LEGACY_SOURCE = 'workbench-v2/viewport.js:166-167';
export const DEFAULT_ENABLED = false;
export const STATE_FIELDS = Object.freeze([
  'color', 'emissive', 'emissiveIntensity', 'visible', 'clippingPlanes', 'clipIntersection'
]);

const hex = (c) => (c && typeof c.getHexString === 'function' ? c.getHexString() : (typeof c === 'string' ? c : null));

export class MPbrFlag {
  /**
   * @param {object} view 生产 EngineeringViewport 实例（只读使用 objects / templates）
   * @param {{ seed: object, instances: Array<{instanceId:string, partKey:string}>, enabled?: boolean }} options
   */
  constructor(view, { seed, instances, enabled = DEFAULT_ENABLED } = {}) {
    if (!view || !view.objects) throw new Error('MPbrFlag 需要真实 EngineeringViewport 实例');
    if (!seed || !Array.isArray(seed.catalog)) throw new Error('MPbrFlag 需要含 catalog 的工程 seed');
    if (!Array.isArray(instances)) throw new Error('MPbrFlag 需要 instances 列表用于零件身份映射');
    this.view = view;
    this.seed = seed;
    this.instances = instances;
    this.native = readGlbNativePbr(view.templates, seed);
    this.enabled = false;
    this.switches = 0;
    this.appliedMaterials = 0;
    this.missingTargets = [];
    this.partKeyByInstance = new Map(instances.map((x) => [x.instanceId, x.partKey]));
    this._label();
    if (enabled) this.setEnabled(true);
  }

  /** 给每个材质打 (instanceId, partKey, index) 标签；每次 reapply 重建，避免新增零件错位。 */
  _label() {
    let count = 0;
    this.missingTargets = [];
    for (const [instanceId, object] of this.view.objects) {
      const partKey = this.partKeyByInstance.get(instanceId) || null;
      let index = 0;
      object.traverse((node) => {
        if (!node.isMesh) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of mats) {
          if (!mat) continue;
          mat.userData = mat.userData || {};
          mat.userData.mPbr = { instanceId, partKey, index: index++ };
          count++;
        }
      });
    }
    this.appliedMaterials = count;
    return count;
  }

  _materials() {
    const out = [];
    for (const [instanceId, object] of this.view.objects) {
      object.traverse((node) => {
        if (!node.isMesh) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of mats) {
          if (!mat) continue;
          out.push({ instanceId, mat, label: mat.userData?.mPbr || null });
        }
      });
    }
    return out;
  }

  _writeLegacy() {
    for (const { mat } of this._materials()) {
      mat.metalness = LEGACY_PBR.metalness;
      mat.roughness = LEGACY_PBR.roughness;
      mat.envMapIntensity = LEGACY_PBR.envMapIntensity;
    }
    this.missingTargets = [];
  }

  _writeNative() {
    const missing = [];
    for (const { instanceId, mat, label } of this._materials()) {
      const partKey = label?.partKey || this.partKeyByInstance.get(instanceId) || null;
      const index = label?.index ?? 0;
      const values = partKey ? this.native[partKey] : null;
      const value = values?.[index];
      if (!value) {
        // 新零件或未知零件：退回生产默认，避免留下半开状态
        mat.metalness = LEGACY_PBR.metalness;
        mat.roughness = LEGACY_PBR.roughness;
        mat.envMapIntensity = LEGACY_PBR.envMapIntensity;
        missing.push({ instanceId, partKey, index });
        continue;
      }
      mat.metalness = value.metalness;
      mat.roughness = value.roughness;
      mat.envMapIntensity = LEGACY_PBR.envMapIntensity;
    }
    this.missingTargets = missing;
  }

  setEnabled(next) {
    const want = Boolean(next);
    if (want === this.enabled) return this.status();
    this._label();
    if (want) this._writeNative();
    else this._writeLegacy();
    this.enabled = want;
    this.switches++;
    return this.status();
  }

  enable() { return this.setEnabled(true); }
  disable() { return this.setEnabled(false); }
  toggle() { return this.setEnabled(!this.enabled); }

  /** sync() 之后调用：新对象会拿到生产默认值，需要按当前 flag 状态重新收敛。 */
  reapply() {
    this._label();
    if (this.enabled) this._writeNative();
    else this._writeLegacy();
    return this.status();
  }

  /** 逐材质快照，用于断言 PBR 与非 PBR 字段。 */
  snapshot() {
    return this._materials().map(({ instanceId, mat, label }) => ({
      instanceId,
      partKey: label?.partKey ?? this.partKeyByInstance.get(instanceId) ?? null,
      index: label?.index ?? 0,
      metalness: +Number(mat.metalness ?? 0).toFixed(4),
      roughness: +Number(mat.roughness ?? 0).toFixed(4),
      envMapIntensity: +Number(mat.envMapIntensity ?? 0).toFixed(4),
      color: hex(mat.color),
      emissive: hex(mat.emissive),
      emissiveIntensity: +Number(mat.emissiveIntensity ?? 0).toFixed(4),
      visible: !!this.view.objects.get(instanceId)?.visible,
      clippingPlanes: Array.isArray(mat.clippingPlanes) ? mat.clippingPlanes.length : 0,
      clipIntersection: !!mat.clipIntersection
    }));
  }

  /** 只取与 M 无关的字段，用于证明 adapter 没有副作用。 */
  nonPbrSnapshot() {
    return this.snapshot().map((row) => {
      const out = { instanceId: row.instanceId, partKey: row.partKey, index: row.index };
      for (const key of STATE_FIELDS) out[key] = row[key];
      return out;
    });
  }

  /** 回退是否精确：逐材质等于 LEGACY_PBR。 */
  assertLegacyRestored(eps = 1e-9) {
    const violations = [];
    for (const row of this.snapshot()) {
      for (const key of ['metalness', 'roughness', 'envMapIntensity']) {
        if (Math.abs(row[key] - LEGACY_PBR[key]) > eps) {
          violations.push({ instanceId: row.instanceId, index: row.index, key, actual: row[key], expected: LEGACY_PBR[key] });
        }
      }
    }
    return { ok: violations.length === 0, violations };
  }

  /** PBR 分档种类数；>1 才说明 GLB 自带分层被真正恢复。 */
  histogram() {
    const counts = new Map();
    for (const row of this.snapshot()) {
      const key = `${row.metalness}/${row.roughness}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return { distinct: counts.size, buckets: Object.fromEntries([...counts.entries()].sort()) };
  }

  status() {
    return {
      schema: FLAG_SCHEMA,
      enabled: this.enabled,
      defaultEnabled: DEFAULT_ENABLED,
      switches: this.switches,
      appliedMaterials: this.appliedMaterials,
      legacy: LEGACY_PBR,
      legacySource: LEGACY_SOURCE,
      nativeParts: Object.keys(this.native),
      missingTargets: this.missingTargets,
      rollback: 'disable() 无条件写回 LEGACY_PBR，与 viewport.js:166-167 一致',
      fileLock: '本 adapter 位于 viewer/experiments/render-release-v1/，不写 workbench-v2/'
    };
  }

  /** 生产者可用它判断是否需要把 reapply 挂到 sync 末尾。 */
  static attach(view, options) {
    const flag = new MPbrFlag(view, options);
    view.mPbrFlag = flag;
    return flag;
  }
}

import { resolveInstanceGeometry } from './geometry-status.mjs';

/**
 * @typedef {object} R16Index
 * @property {{ vehicleId: string, name: string }} vehicle
 * @property {Array<{ systemId: string, name: string, r16Counts: object }>} systems
 * @property {object} totals
 */

/**
 * @typedef {object} DomainProject
 * @property {string} name
 * @property {number} revision
 * @property {Array<{ systemId: string, name: string }>} systems
 * @property {Array<{ assemblyId: string, name: string, systemId: string, parentAssemblyId: string|null }>} assemblies
 * @property {Array<{ instanceId: string, partId: string, assemblyId: string, visible?: boolean }>} partInstances
 * @property {Array<{ partId: string, name: string, geometryBasis?: string }>} partDefinitions
 * @property {Array<object>} [assets]
 */

/**
 * @typedef {object} TreeNode
 * @property {string} nodeId
 * @property {'vehicle'|'system'|'assembly'|'instance'|'coverage'} kind
 * @property {string} label
 * @property {string} [selectionId]
 * @property {string} [systemId]
 * @property {string} [assemblyId]
 * @property {string} [instanceId]
 * @property {object} [geometry]
 * @property {object} [r16]
 * @property {TreeNode[]} [children]
 */

/**
 * @param {R16Index} r16Index
 * @param {DomainProject} domain
 * @returns {{ root: TreeNode, meta: object }}
 */
export function buildVehicleTree(r16Index, domain) {
  if (!r16Index?.systems?.length) throw new Error('R-16 index missing systems');
  if (!domain?.assemblies?.length) throw new Error('domain project missing assemblies');

  const domainSystems = new Map((domain.systems || []).map((s) => [s.systemId, s]));
  const partsById = new Map((domain.partDefinitions || []).map((p) => [p.partId, p]));
  const instancesByAssembly = new Map();
  for (const inst of domain.partInstances || []) {
    if (inst.visible === false) continue;
    if (!instancesByAssembly.has(inst.assemblyId)) instancesByAssembly.set(inst.assemblyId, []);
    instancesByAssembly.get(inst.assemblyId).push(inst);
  }

  /**
   * @param {string} systemId
   * @param {string|null} parentAssemblyId
   * 根层按 systemId 分桶；子总成按 parent 链接（允许 SYS-40 卡钳挂在 SYS-30 轮端下）。
   */
  function assemblyForest(systemId, parentAssemblyId) {
    const level = (domain.assemblies || []).filter((a) => {
      if ((a.parentAssemblyId || null) !== parentAssemblyId) return false;
      if (parentAssemblyId === null) return a.systemId === systemId;
      return true;
    });
    return level.map((assy) => {
      const childAssy = assemblyForest(systemId, assy.assemblyId);
      const instNodes = (instancesByAssembly.get(assy.assemblyId) || []).map((inst) => {
        const part = partsById.get(inst.partId);
        const geometry = resolveInstanceGeometry(domain, inst);
        return {
          nodeId: `inst:${inst.instanceId}`,
          kind: 'instance',
          label: part?.name ? `${part.name} (${inst.instanceId})` : inst.instanceId,
          selectionId: inst.instanceId,
          instanceId: inst.instanceId,
          partId: inst.partId,
          assemblyId: assy.assemblyId,
          systemId,
          geometry,
          children: []
        };
      });
      return {
        nodeId: `assy:${assy.assemblyId}`,
        kind: 'assembly',
        label: assy.name,
        assemblyId: assy.assemblyId,
        systemId,
        children: [...childAssy, ...instNodes]
      };
    });
  }

  const systemChildren = r16Index.systems.map((r16Sys) => {
    const dom = domainSystems.get(r16Sys.systemId);
    const name = dom?.name || r16Sys.name;
    const assyTree = assemblyForest(r16Sys.systemId, null);
    const children = [...assyTree];
    if (!assyTree.length) {
      children.push({
        nodeId: `cov:${r16Sys.systemId}`,
        kind: 'coverage',
        label: `R-16 覆盖：${r16Sys.r16Counts.assemblyDefinitions} 总成定义 · ${r16Sys.r16Counts.partInstances} 零件实例（域模型未展开）`,
        systemId: r16Sys.systemId,
        r16: r16Sys.r16Counts,
        children: []
      });
    }
    return {
      nodeId: `sys:${r16Sys.systemId}`,
      kind: 'system',
      label: name,
      systemId: r16Sys.systemId,
      r16: r16Sys.r16Counts,
      children
    };
  });

  const root = {
    nodeId: 'veh:root',
    kind: 'vehicle',
    label: domain.name || r16Index.vehicle.name,
    selectionId: null,
    children: systemChildren
  };

  const domainInstanceCount = (domain.partInstances || []).filter((i) => i.visible !== false).length;
  return {
    root,
    meta: {
      r16Totals: r16Index.totals,
      domainRevision: domain.revision,
      domainInstanceCount,
      selectionKey: 'instanceId',
      inspectToolsRequireGeometry: true
    }
  };
}

/**
 * @param {TreeNode} root
 * @param {string} instanceId
 * @returns {TreeNode|null}
 */
export function findInstanceNode(root, instanceId) {
  if (!instanceId) return null;
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (n.kind === 'instance' && n.instanceId === instanceId) return n;
    if (n.children) stack.push(...n.children);
  }
  return null;
}

/**
 * @param {TreeNode} root
 * @returns {string[]}
 */
export function listInstanceIds(root) {
  const ids = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (n.instanceId) ids.push(n.instanceId);
    if (n.children) stack.push(...n.children);
  }
  return ids;
}
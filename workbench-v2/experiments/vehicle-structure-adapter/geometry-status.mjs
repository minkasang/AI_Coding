import { KNOWN_CAD_BY_INSTANCE } from './known-cad-map.mjs';

/** @typedef {'REAL_CAD'|'DEMO_SUBSTITUTE'|'PLACEHOLDER'|'NO_GEOMETRY'} GeometryDisplayStatus */

/**
 * @param {import('./vehicle-tree-adapter.mjs').DomainProject} project
 * @param {{ instanceId: string, partId: string }} inst
 * @returns {{
 *   status: GeometryDisplayStatus,
 *   mappingStatus: string,
 *   inspectable: boolean,
 *   cadUrl: string|null,
 *   hint: string,
 * }}
 */
export function resolveInstanceGeometry(project, inst) {
  const part = (project.partDefinitions || []).find((p) => p.partId === inst.partId);
  const asset = (project.assets || []).find((a) => a.partId === inst.partId);
  const known = KNOWN_CAD_BY_INSTANCE[inst.instanceId];

  if (known?.cadUrl) {
    return {
      status: known.mappingStatus === 'DEMO_SUBSTITUTE' ? 'DEMO_SUBSTITUTE' : 'REAL_CAD',
      mappingStatus: known.mappingStatus,
      inspectable: true,
      cadUrl: known.cadUrl,
      hint: known.note || asset?.note || '已有 CAD（按 instanceId 绑定）'
    };
  }

  if (asset?.mappingStatus === 'PLACEHOLDER') {
    return {
      status: 'PLACEHOLDER',
      mappingStatus: 'PLACEHOLDER',
      inspectable: false,
      cadUrl: null,
      hint: '未建立几何（PLACEHOLDER）'
    };
  }

  if (part?.geometryBasis === 'NEEDS_MEASUREMENT' || asset?.glb == null) {
    return {
      status: 'NO_GEOMETRY',
      mappingStatus: asset?.mappingStatus || 'NONE',
      inspectable: false,
      cadUrl: null,
      hint: '未建立几何'
    };
  }

  return {
    status: 'NO_GEOMETRY',
    mappingStatus: asset?.mappingStatus || 'UNKNOWN',
    inspectable: false,
    cadUrl: null,
    hint: '无已核实 CAD'
  };
}
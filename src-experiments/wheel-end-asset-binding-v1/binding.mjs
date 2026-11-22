/**
 * R-32 read-only binding between the R-27 snapshot and the approved C-01
 * left-front wheel-end demo package. Browser-safe; no Three.js or Node imports.
 * The GLB keeps its own transforms; CAD matrices are never re-applied here.
 */
export const BINDING_API_VERSION = 'carlab.wheelEndAssetBinding/0.1.0-proposal';
export const MANIFEST_SCHEMA = 'carlab.c01WheelEndAsset/1';
export const STATIC_PLACEMENT = 'STATIC_WORKHOLDING_DEMO';
export const EXPECTED_INSTANCE_COUNT = 9;
export const EXPECTED_MESH_COUNT = 5;
export const EXPECTED_ASSEMBLY_GROUPS = 2;
export const EXPECTED_STUD_COUNT = 5;

const IDENTITY4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const clone = (value) => JSON.parse(JSON.stringify(value));
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const isNum3 = (value) => Array.isArray(value) && value.length === 3 && value.every(isNum);
const isNum4 = (value) => Array.isArray(value) && value.length === 4 && value.every(isNum);

export class WheelEndBindingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WheelEndBindingError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new WheelEndBindingError(code, message, details);
}
function requireCondition(condition, code, message, details = {}) {
  if (!condition) fail(code, message, details);
}

export async function sha256Hex(input) {
  if (!globalThis.crypto?.subtle) fail('E_CRYPTO_UNAVAILABLE', 'WebCrypto SHA-256 is required to verify C-01 assets.');
  let bytes;
  if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else if (ArrayBuffer.isView(input)) bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  else if (typeof input === 'string') bytes = new TextEncoder().encode(input);
  else fail('E_INPUT_INVALID', 'sha256Hex expects a string, ArrayBuffer or typed array.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseGlbJson(buffer) {
  let bytes;
  if (buffer instanceof ArrayBuffer) bytes = new Uint8Array(buffer);
  else if (ArrayBuffer.isView(buffer)) bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  else fail('E_GLB_INVALID', 'GLB input must be an ArrayBuffer or typed array.');
  requireCondition(bytes.byteLength >= 20, 'E_GLB_INVALID', 'GLB is shorter than the 12-byte header plus JSON chunk header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const totalLength = view.getUint32(8, true);
  const jsonLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  requireCondition(magic === 0x46546c67, 'E_GLB_INVALID', 'GLB magic is not glTF.');
  requireCondition(version === 2, 'E_GLB_INVALID', `Unsupported GLB version ${version}.`);
  requireCondition(totalLength === bytes.byteLength, 'E_GLB_INVALID', 'GLB declared length does not match the buffer.');
  requireCondition(chunkType === 0x4e4f534a, 'E_GLB_INVALID', 'First GLB chunk is not JSON.');
  requireCondition(20 + jsonLength <= bytes.byteLength, 'E_GLB_INVALID', 'GLB JSON chunk exceeds the buffer.');
  const text = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim();
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    fail('E_GLB_INVALID', 'GLB JSON chunk could not be parsed.', { reason: error.message });
  }
  return { json, totalLength, jsonLength, magic: 'glTF', version };
}

function quatNorm(quaternion) {
  return Math.hypot(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
}

function trsToMatrix({ translation = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1] }) {
  const [x, y, z, w] = rotation;
  const [sx, sy, sz] = scale;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    translation[0], translation[1], translation[2], 1
  ];
}

function mul4(a, b) {
  const out = new Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] = a[row] * b[column * 4]
        + a[4 + row] * b[column * 4 + 1]
        + a[8 + row] * b[column * 4 + 2]
        + a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function toRowMajor(matrix) {
  const out = new Array(16);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) out[row * 4 + column] = matrix[column * 4 + row];
  }
  return out;
}

function localMatrixOfNode(node) {
  if (Array.isArray(node.matrix)) {
    requireCondition(node.matrix.length === 16 && node.matrix.every(isNum), 'E_GLB_INVALID', `Node ${node.name ?? '?'} matrix must be 16 finite numbers.`);
    return [...node.matrix];
  }
  const translation = node.translation ?? [0, 0, 0];
  const rotation = node.rotation ?? [0, 0, 0, 1];
  const scale = node.scale ?? [1, 1, 1];
  requireCondition(isNum3(translation), 'E_GLB_INVALID', `Node ${node.name ?? '?'} translation must be a finite 3-vector.`);
  requireCondition(isNum4(rotation) && Math.abs(quatNorm(rotation) - 1) < 1e-6, 'E_GLB_INVALID', `Node ${node.name ?? '?'} rotation must be a unit quaternion.`);
  requireCondition(isNum3(scale) && scale.every((value) => value > 0), 'E_GLB_INVALID', `Node ${node.name ?? '?'} scale must be positive.`);
  return trsToMatrix({ translation, rotation, scale });
}

function assertSnapshotAndManifest({ consumer, consumerIndex, snapshotSha256, manifest, manifestSha256, expectedPackageId, expectedManifestSha256, expectedGlbSha256, glbSha256 }) {
  requireCondition(manifest?.schemaVersion === MANIFEST_SCHEMA, 'E_MANIFEST_INVALID', `Manifest schema must be ${MANIFEST_SCHEMA}.`);
  requireCondition(manifest.packageId && manifest.sourceGrade === 'DEMO_ASSUMPTION', 'E_MANIFEST_INVALID', 'Manifest packageId/sourceGrade is invalid.');
  if (expectedPackageId) requireCondition(manifest.packageId === expectedPackageId, 'E_PACKAGE_ID_MISMATCH', 'Manifest packageId does not match the approved package.', { expected: expectedPackageId, actual: manifest.packageId });
  if (expectedManifestSha256) requireCondition(manifestSha256 === expectedManifestSha256, 'E_MANIFEST_HASH_MISMATCH', 'Manifest SHA-256 does not match the expected value.', { expected: expectedManifestSha256, actual: manifestSha256 });
  requireCondition(manifest.snapshotBinding, 'E_MANIFEST_INVALID', 'Manifest snapshotBinding is missing.');
  const binding = manifest.snapshotBinding;
  requireCondition(binding.snapshotId === consumer.snapshotId, 'E_SNAPSHOT_MISMATCH', 'Manifest snapshot id does not match the R-27 consumer.', { expected: consumer.snapshotId, actual: binding.snapshotId });
  requireCondition(binding.revision === consumer.revision, 'E_SNAPSHOT_MISMATCH', 'Manifest snapshot revision does not match the R-27 consumer.', { expected: consumer.revision, actual: binding.revision });
  requireCondition(binding.snapshotSha256 === snapshotSha256, 'E_SNAPSHOT_MISMATCH', 'Manifest snapshot SHA-256 does not match the R-27 snapshot.', { expected: snapshotSha256, actual: binding.snapshotSha256 });
  requireCondition(consumerIndex?.snapshotSha256 === snapshotSha256, 'E_SNAPSHOT_MISMATCH', 'Consumer index SHA-256 does not match the snapshot.');
  const status = consumer.getDisplayStatus();
  requireCondition(binding.variantId === status.variant.variantId, 'E_VARIANT_MISMATCH', 'Manifest variant does not match the snapshot variant.', { expected: status.variant.variantId, actual: binding.variantId });
  requireCondition(binding.selectionKey === 'partInstanceId', 'E_MANIFEST_INVALID', 'Manifest selectionKey must be partInstanceId.');
  requireCondition(binding.mappingStatus === 'DEMO_SUBSTITUTE' && binding.sameVehicleClaim === false, 'E_MANIFEST_INVALID', 'Manifest must stay DEMO_SUBSTITUTE and not claim the same vehicle.');
  requireCondition(manifest.assets?.glb === 'wheel-end.glb', 'E_MANIFEST_INVALID', 'Manifest GLB asset must be wheel-end.glb.');
  const declaredGlbHash = manifest.sha256?.['wheel-end.glb'];
  requireCondition(declaredGlbHash === glbSha256, 'E_GLB_HASH_MISMATCH', 'GLB SHA-256 does not match the manifest.', { expected: declaredGlbHash, actual: glbSha256 });
  if (expectedGlbSha256) requireCondition(glbSha256 === expectedGlbSha256, 'E_GLB_HASH_MISMATCH', 'GLB SHA-256 does not match the approved package.', { expected: expectedGlbSha256, actual: glbSha256 });
  requireCondition(manifest.root?.frameId, 'E_MANIFEST_INVALID', 'Manifest root frameId is missing.');
  requireCondition(manifest.root.vehiclePlacement == null && manifest.root.motionBinding == null, 'E_VEHICLE_PLACEMENT_UNAVAILABLE', 'C-01 must remain a static workholding demo without vehicle placement or motion binding.');
  requireCondition(binding.snapshotId === consumerIndex.snapshotId, 'E_SNAPSHOT_MISMATCH', 'Consumer index snapshot id does not match the manifest.');
}

function validateInstances(consumer, manifest) {
  const instances = manifest.instances;
  requireCondition(Array.isArray(instances) && instances.length === EXPECTED_INSTANCE_COUNT, 'E_INSTANCE_SET_MISMATCH', `C-01 must expose exactly ${EXPECTED_INSTANCE_COUNT} instances.`, { actual: instances?.length });
  const ids = new Set();
  const partIds = new Set();
  const assemblyIds = new Set();
  const byPart = new Map();
  for (const row of instances) {
    requireCondition(row.partInstanceId?.startsWith('PI-'), 'E_INSTANCE_SET_MISMATCH', 'Every C-01 instance must use a PI-* id.');
    requireCondition(!ids.has(row.partInstanceId), 'E_INSTANCE_DUPLICATE', `Duplicate C-01 instance ${row.partInstanceId}.`);
    ids.add(row.partInstanceId);
    partIds.add(row.partId);
    assemblyIds.add(row.assemblyInstanceId);
    if (!byPart.has(row.partId)) byPart.set(row.partId, []);
    byPart.get(row.partId).push(row);
    requireCondition(row.parent == null || instances.some((candidate) => candidate.partInstanceId === row.parent), 'E_INSTANCE_SET_MISMATCH', `Unknown C-01 parent ${row.parent} for ${row.partInstanceId}.`);
    requireCondition(row.parent !== row.partInstanceId, 'E_HIERARCHY', `C-01 instance ${row.partInstanceId} is its own parent.`);
    requireCondition(row.parentMount && row.childMount && row.constraint, 'E_MANIFEST_INVALID', `C-01 instance ${row.partInstanceId} lacks mount/constraint metadata.`);
  }
  const studs = byPart.get('PART-30-009') ?? [];
  requireCondition(studs.length === EXPECTED_STUD_COUNT, 'E_INSTANCE_SET_MISMATCH', `C-01 must expose ${EXPECTED_STUD_COUNT} PART-30-009 stud instances.`, { actual: studs.length });
  const definitionCount = Object.keys(manifest.partDefinitions || {}).length;
  requireCondition(definitionCount === EXPECTED_MESH_COUNT, 'E_MESH_DEFINITION_MISMATCH', `C-01 must declare ${EXPECTED_MESH_COUNT} part definitions.`, { actual: definitionCount });
  for (const partId of partIds) requireCondition(Boolean(manifest.partDefinitions[partId]), 'E_PART_MISMATCH', `Manifest part definition missing for ${partId}.`);
  const details = new Map();
  for (const row of instances) {
    let detail;
    try {
      detail = consumer.getObjectDetail(row.partInstanceId);
    } catch (error) {
      fail('E_INSTANCE_NOT_IN_SNAPSHOT', `C-01 instance ${row.partInstanceId} is missing from the R-27 snapshot.`, { cause: error.code ?? null });
    }
    requireCondition(detail.identity.partId === row.partId, 'E_PART_MISMATCH', `C-01 part does not match the snapshot for ${row.partInstanceId}.`, { expected: detail.identity.partId, actual: row.partId });
    requireCondition(detail.identity.assemblyInstanceId === row.assemblyInstanceId, 'E_ASSEMBLY_MISMATCH', `C-01 assembly does not match the snapshot for ${row.partInstanceId}.`, { expected: detail.identity.assemblyInstanceId, actual: row.assemblyInstanceId });
    if (row.snapshotFrameId) requireCondition(detail.identity.frameId === row.snapshotFrameId, 'E_FRAME_MISMATCH', `C-01 snapshot frame does not match for ${row.partInstanceId}.`, { expected: detail.identity.frameId, actual: row.snapshotFrameId });
    requireCondition(detail.geometry.status === 'NO_GEOMETRY', 'E_PART_MISMATCH', `Snapshot instance ${row.partInstanceId} must remain NO_GEOMETRY underneath the demo binding.`);
    details.set(row.partInstanceId, detail);
  }
  for (const row of instances) {
    let current = row;
    const seen = new Set();
    while (current?.parent) {
      if (seen.has(current.partInstanceId)) fail('E_HIERARCHY', `Cycle in C-01 assembly graph at ${current.partInstanceId}.`);
      seen.add(current.partInstanceId);
      current = instances.find((candidate) => candidate.partInstanceId === current.parent);
    }
  }
  return { instances, ids, partIds, assemblyIds, byPart, details };
}

function validateGlb(glbJson, manifest, manifestInstances) {
  const nodes = glbJson?.nodes;
  const meshes = glbJson?.meshes;
  const scenes = glbJson?.scenes;
  requireCondition(Array.isArray(nodes) && nodes.length > 0, 'E_GLB_INVALID', 'GLB nodes are missing.');
  requireCondition(Array.isArray(meshes) && meshes.length === EXPECTED_MESH_COUNT, 'E_MESH_DEFINITION_MISMATCH', `GLB must contain ${EXPECTED_MESH_COUNT} mesh definitions.`, { actual: meshes?.length });
  requireCondition(Array.isArray(scenes) && scenes.length === 1 && scenes[0].nodes?.length === 1, 'E_GLB_INVALID', 'GLB must have one scene with one root node.');
  const parentOf = new Map();
  for (let index = 0; index < nodes.length; index += 1) {
    for (const child of nodes[index].children ?? []) {
      requireCondition(!parentOf.has(child), 'E_HIERARCHY', `GLB node ${child} has more than one parent.`);
      parentOf.set(child, index);
    }
  }
  const rootIndex = scenes[0].nodes[0];
  const rootNode = nodes[rootIndex];
  requireCondition(rootNode?.extras?.frameId === manifest.root.frameId, 'E_HIERARCHY', 'GLB root frameId does not match the manifest.', { expected: manifest.root.frameId, actual: rootNode?.extras?.frameId });
  requireCondition(rootNode.extras.packageId === manifest.packageId, 'E_HIERARCHY', 'GLB root packageId does not match the manifest.');
  requireCondition(rootNode.extras.unit === 'm' && rootNode.extras.sourceGrade === manifest.sourceGrade, 'E_GLB_INVALID', 'GLB root unit/sourceGrade is invalid.');

  const instanceNodeIndices = [];
  const groups = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.extras?.partInstanceId) instanceNodeIndices.push(index);
    else if (node.extras?.assemblyInstanceId) groups.push(index);
    else if (index !== rootIndex) fail('E_HIERARCHY', `GLB node ${node.name ?? index} is neither an instance nor an assembly group.`);
  }
  requireCondition(instanceNodeIndices.length === EXPECTED_INSTANCE_COUNT, 'E_INSTANCE_SET_MISMATCH', `GLB must contain ${EXPECTED_INSTANCE_COUNT} instance nodes.`, { actual: instanceNodeIndices.length });
  requireCondition(groups.length === EXPECTED_ASSEMBLY_GROUPS, 'E_ASSEMBLY_MISMATCH', `GLB must contain ${EXPECTED_ASSEMBLY_GROUPS} assembly groups.`, { actual: groups.length });
  const manifestGroupIds = new Set(manifestInstances.map((row) => row.assemblyInstanceId));
  const glbGroupIds = new Set(groups.map((index) => nodes[index].extras?.assemblyInstanceId));
  requireCondition(glbGroupIds.size === manifestGroupIds.size && [...manifestGroupIds].every((id) => glbGroupIds.has(id)), 'E_ASSEMBLY_MISMATCH', 'GLB assembly groups do not match the manifest assembly instances.', { expected: [...manifestGroupIds], actual: [...glbGroupIds] });
  for (const groupIndex of groups) {
    const children = nodes[groupIndex].children ?? [];
    requireCondition(children.length > 0 && children.every((index) => nodes[index]?.extras?.partInstanceId), 'E_HIERARCHY', `GLB assembly group ${nodes[groupIndex].name ?? groupIndex} must contain instance nodes only.`);
  }
  const nodeById = new Map();
  for (const index of instanceNodeIndices) {
    const node = nodes[index];
    const id = node.extras.partInstanceId;
    requireCondition(!nodeById.has(id), 'E_NODE_DUPLICATE', `Duplicate GLB node for ${id}.`);
    const row = manifestInstances.find((candidate) => candidate.partInstanceId === id);
    requireCondition(row, 'E_NODE_MISSING', `GLB node ${id} is not declared in the manifest.`);
    requireCondition(node.name === id, 'E_NODE_PART_MISMATCH', `GLB node name does not match extras.partInstanceId for ${id}.`);
    requireCondition(node.mesh != null && meshes[node.mesh], 'E_NODE_MISSING', `GLB node ${id} has no mesh.`);
    requireCondition(node.extras.partId === row.partId, 'E_NODE_PART_MISMATCH', `GLB node partId mismatch for ${id}.`, { expected: row.partId, actual: node.extras.partId });
    requireCondition(node.extras.assemblyInstanceId === row.assemblyInstanceId, 'E_ASSEMBLY_MISMATCH', `GLB node assembly mismatch for ${id}.`);
    requireCondition(node.extras.sourceGrade === manifest.sourceGrade, 'E_GLB_INVALID', `GLB node sourceGrade mismatch for ${id}.`);
    const parent = parentOf.get(index);
    requireCondition(parent != null, 'E_HIERARCHY', `GLB instance ${id} has no parent.`);
    requireCondition(!nodes[parent].extras?.partInstanceId, 'E_HIERARCHY', `GLB instance ${id} is nested under another instance.`);
    requireCondition(nodes[parent].extras?.assemblyInstanceId === row.assemblyInstanceId, 'E_ASSEMBLY_MISMATCH', `GLB parent group does not match the manifest assembly for ${id}.`);
    nodeById.set(id, index);
  }
  for (const row of manifestInstances) requireCondition(nodeById.has(row.partInstanceId), 'E_NODE_MISSING', `GLB is missing the node for ${row.partInstanceId}.`);
  const meshToNodes = new Map();
  for (const index of instanceNodeIndices) {
    const meshIndex = nodes[index].mesh;
    if (!meshToNodes.has(meshIndex)) meshToNodes.set(meshIndex, []);
    meshToNodes.get(meshIndex).push(index);
  }
  requireCondition(meshToNodes.size === EXPECTED_MESH_COUNT, 'E_MESH_DEFINITION_MISMATCH', 'GLB mesh use does not cover the five definitions.');
  const studIndices = manifestInstances.filter((row) => row.partId === 'PART-30-009').map((row) => nodeById.get(row.partInstanceId));
  const studMeshes = new Set(studIndices.map((index) => nodes[index].mesh));
  requireCondition(studMeshes.size === 1 && meshToNodes.get([...studMeshes][0]).length === EXPECTED_STUD_COUNT, 'E_STUD_MESH_NOT_SHARED', 'The five stud instances must share one mesh definition.');
  for (const [meshIndex, indices] of meshToNodes) {
    if (indices.length > 1 && meshIndex !== [...studMeshes][0]) fail('E_MESH_DEFINITION_MISMATCH', 'Only the stud mesh may be shared by multiple instances.', { meshIndex, count: indices.length });
  }
  return { nodes, meshes, rootIndex, rootNode, instanceNodeIndices, groups, nodeById, parentOf, meshToNodes };
}

function buildNodeBinding({ nodeIndex, nodes, parentOf, localMatrices, worldMatrices, manifestRow, meshToNodes }) {
  const node = nodes[nodeIndex];
  const chain = [];
  let cursor = nodeIndex;
  const seen = new Set();
  while (cursor != null) {
    if (seen.has(cursor)) fail('E_HIERARCHY', 'Cycle while composing GLB node parent chain.');
    seen.add(cursor);
    chain.unshift(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  const parentIndex = parentOf.get(nodeIndex) ?? null;
  const sharedNodes = meshToNodes.get(node.mesh) ?? [];
  return {
    partInstanceId: manifestRow.partInstanceId,
    partId: manifestRow.partId,
    assemblyInstanceId: manifestRow.assemblyInstanceId,
    snapshotFrameId: manifestRow.snapshotFrameId ?? null,
    label: manifestRow.label ?? manifestRow.partId,
    nodeIndex,
    nodeName: node.name ?? null,
    meshIndex: node.mesh,
    meshSharedByNodeIndices: [...sharedNodes],
    meshSharedByPartInstanceIds: sharedNodes.map((index) => nodes[index].extras.partInstanceId),
    meshShared: sharedNodes.length > 1,
    parentNodeIndex: parentIndex,
    parentNodeName: parentIndex == null ? null : nodes[parentIndex].name ?? null,
    parentChain: chain.map((index) => ({
      nodeIndex: index,
      nodeName: nodes[index].name ?? null,
      kind: index === chain[0] ? 'root' : (nodes[index].extras?.partInstanceId ? 'instance' : 'assemblyGroup')
    })),
    localTransform: {
      translation: [...(node.translation ?? [0, 0, 0])],
      rotation: [...(node.rotation ?? [0, 0, 0, 1])],
      scale: [...(node.scale ?? [1, 1, 1])]
    },
    matrixLocal: toRowMajor(localMatrices.get(nodeIndex)),
    threeMatrixLocal: [...localMatrices.get(nodeIndex)],
    matrixWorldGlb: toRowMajor(worldMatrices.get(nodeIndex)),
    threeMatrixWorld: [...worldMatrices.get(nodeIndex)],
    units: 'm',
    up: 'Y',
    coordinateBasis: 'GLB_OWN_M_Y_UP',
    cadToGlbAppliedInGlb: true,
    cadReconstructionOnly: {
      rootFromPartCad: manifestRow.rootFromPartCad ? clone(manifestRow.rootFromPartCad) : null,
      rootBoundsMm: manifestRow.rootBoundsMm ? clone(manifestRow.rootBoundsMm) : null,
      note: 'Only for rebuilding from the manifest/STEP; never multiply this onto the GLB node transform.'
    },
    sourceGrade: 'DEMO_ASSUMPTION',
    mappingStatus: 'DEMO_SUBSTITUTE',
    staticOnly: true,
    vehiclePlacement: null,
    motionBinding: null
  };
}

function legacyBridge() {
  const assetUrl = '/viewer/experiments/engineering-viewer/assets/wheel_hub_assembly.glb';
  return {
    hub: {
      partKey: 'hub',
      displayName: '轮毂法兰',
      nodeMatch: 'Part_Hub',
      legacyAssetUrl: assetUrl,
      piIds: ['PI-30-006-FL'],
      mapping: 'ONE_TO_ONE',
      mappingCount: 1,
      canonicalSinglePart: true,
      source: 'workbench-v2/fixtures/wheel-end-demo.json'
    },
    bearing: {
      partKey: 'bearing',
      displayName: '轴承包络',
      nodeMatch: 'Part_Bearing',
      legacyAssetUrl: assetUrl,
      piIds: ['PI-30-001-FL', 'PI-30-002-FL'],
      mapping: 'ONE_TO_TWO',
      mappingCount: 2,
      canonicalSinglePart: false,
      source: 'workbench-v2/fixtures/wheel-end-demo.json'
    },
    studs: {
      partKey: 'studs',
      displayName: '车轮螺柱（组）',
      nodeMatch: 'Part_WheelStuds',
      legacyAssetUrl: assetUrl,
      piIds: ['PI-30-009-FL-01', 'PI-30-009-FL-02', 'PI-30-009-FL-03', 'PI-30-009-FL-04', 'PI-30-009-FL-05'],
      mapping: 'ONE_TO_FIVE',
      mappingCount: 5,
      canonicalSinglePart: false,
      source: 'workbench-v2/fixtures/wheel-end-demo.json'
    }
  };
}

export function createWheelEndBinding({
  consumer,
  consumerIndex,
  snapshotSha256,
  manifest,
  manifestSha256 = null,
  glbJson,
  glbSha256,
  expectedPackageId = null,
  expectedManifestSha256 = null,
  expectedGlbSha256 = null
}) {
  requireCondition(consumer && typeof consumer.getObjectDetail === 'function', 'E_CONSUMER_REQUIRED', 'An R-31 vehicle consumer is required.');
  requireCondition(glbJson && typeof glbJson === 'object', 'E_GLB_INVALID', 'A parsed GLB JSON is required.');
  assertSnapshotAndManifest({ consumer, consumerIndex, snapshotSha256, manifest, manifestSha256, expectedPackageId, expectedManifestSha256, expectedGlbSha256, glbSha256 });
  const { instances, ids, partIds, assemblyIds, byPart, details } = validateInstances(consumer, manifest);
  const glb = validateGlb(glbJson, manifest, instances);

  const localMatrices = new Map();
  const worldMatrices = new Map();
  for (let index = 0; index < glb.nodes.length; index += 1) localMatrices.set(index, localMatrixOfNode(glb.nodes[index]));
  const visit = (index, parentWorld, stack) => {
    if (stack.has(index)) fail('E_HIERARCHY', 'Cycle in GLB hierarchy.');
    stack.add(index);
    const world = mul4(parentWorld, localMatrices.get(index));
    worldMatrices.set(index, world);
    for (const child of glb.nodes[index].children ?? []) visit(child, world, stack);
    stack.delete(index);
  };
  visit(glb.rootIndex, IDENTITY4, new Set());
  for (const index of glb.instanceNodeIndices) requireCondition(worldMatrices.has(index), 'E_HIERARCHY', `GLB instance node ${index} is not reachable from the root.`);

  const byPi = new Map();
  for (const row of instances) {
    const nodeIndex = glb.nodeById.get(row.partInstanceId);
    byPi.set(row.partInstanceId, buildNodeBinding({
      nodeIndex,
      nodes: glb.nodes,
      parentOf: glb.parentOf,
      localMatrices,
      worldMatrices,
      manifestRow: row,
      meshToNodes: glb.meshToNodes
    }));
  }
  const legacy = legacyBridge();
  const meshDefinitions = [...glb.meshToNodes.entries()].map(([meshIndex, nodeIndices]) => ({
    meshIndex,
    nodeIndices: [...nodeIndices],
    partInstanceIds: nodeIndices.map((index) => glb.nodes[index].extras.partInstanceId),
    partIds: [...new Set(nodeIndices.map((index) => glb.nodes[index].extras.partId))],
    shared: nodeIndices.length > 1
  }));
  const assemblyGroups = glb.groups.map((index) => ({
    nodeIndex: index,
    nodeName: glb.nodes[index].name ?? null,
    assemblyInstanceId: glb.nodes[index].extras.assemblyInstanceId,
    childNodeIndices: [...(glb.nodes[index].children ?? [])]
  }));

  function getBinding(partInstanceId) {
    const binding = byPi.get(partInstanceId);
    if (binding) return { ok: true, ...clone(binding) };
    let detail;
    try {
      detail = consumer.getObjectDetail(partInstanceId);
    } catch (error) {
      fail('E_UNKNOWN_INSTANCE', `Unknown R-27 instance ${partInstanceId}.`, { cause: error.code ?? null });
    }
    const fallback = getFallbackStatus(partInstanceId);
    return {
      ok: false,
      code: 'E_NOT_IN_C01_PACKAGE',
      status: 'NO_DEMO_BINDING',
      partInstanceId,
      partId: detail.identity.partId,
      fallback,
      inspectable: fallback.inspectable,
      note: 'This instance stays NO_GEOMETRY; C-01 only binds the nine left-front wheel-end instances.'
    };
  }

  function getFallbackStatus(partInstanceId, options = {}) {
    let detail;
    try {
      detail = consumer.getObjectDetail(partInstanceId);
    } catch (error) {
      fail('E_UNKNOWN_INSTANCE', `Unknown R-27 instance ${partInstanceId}.`, { cause: error.code ?? null });
    }
    const binding = byPi.get(partInstanceId);
    if (binding && options.disableC01 !== true) {
      return {
        ok: true,
        status: 'C01_DEMO_SUBSTITUTE',
        source: 'C01_PACKAGE',
        inspectable: true,
        showLegacy: false,
        suppressLegacyBridge: partInstanceId === 'PI-30-006-FL',
        mappingStatus: 'DEMO_SUBSTITUTE',
        geometryStatus: detail.geometry.status,
        note: 'C-01 package demo node; engineering geometry remains NO_GEOMETRY.'
      };
    }
    for (const part of Object.values(legacy)) {
      if (!part.piIds.includes(partInstanceId)) continue;
      if (part.canonicalSinglePart) {
        return {
          ok: true,
          status: 'LEGACY_SINGLE_PART_DEMO',
          source: 'V2_LEGACY_DEMO',
          inspectable: true,
          showLegacy: true,
          legacyPartKey: part.partKey,
          legacyAssetUrl: part.legacyAssetUrl,
          supersededByC01: Boolean(binding),
          note: 'Legacy single-part demo; only for the legacy V2 project or when C-01 is disabled.'
        };
      }
      return {
        ok: false,
        status: 'LEGACY_GROUP_DEMO_NOT_ONE_TO_ONE',
        source: 'V2_LEGACY_DEMO',
        inspectable: false,
        showLegacy: false,
        legacyPartKey: part.partKey,
        mappingCount: part.mappingCount,
        piIds: [...part.piIds],
        reason: `${part.displayName} is a group/envelope demo asset; it cannot become a single canonical part instance.`,
        geometryStatus: detail.geometry.status
      };
    }
    return {
      ok: true,
      status: 'NO_GEOMETRY',
      source: 'NONE',
      inspectable: false,
      showLegacy: false,
      geometryStatus: detail.geometry.status,
      note: 'No C-01 binding and no one-to-one legacy demo binding.'
    };
  }

  function getRenderPlan(options = {}) {
    if (options.mode && options.mode !== STATIC_PLACEMENT) {
      fail('E_VEHICLE_PLACEMENT_UNAVAILABLE', 'C-01 has no vehicle placement or motion binding; only STATIC_WORKHOLDING_DEMO is supported.', { requestedMode: options.mode });
    }
    const disableC01 = options.disableC01 === true;
    if (!disableC01) {
      if (options.includeLegacyWithC01 === true) {
        const c01Ids = new Set(byPi.keys());
        const overlaps = Object.values(legacy).flatMap((part) => part.piIds.filter((id) => c01Ids.has(id)).map((id) => ({ partKey: part.partKey, partInstanceId: id })));
        if (overlaps.length > 0) fail('E_LEGACY_DUPLICATE_GEOMETRY', 'C-01 and the legacy demo would render the same instance twice.', { overlaps });
      }
      return {
        ok: true,
        mode: STATIC_PLACEMENT,
        useC01: true,
        packageId: manifest.packageId,
        root: { nodeIndex: glb.rootIndex, nodeName: glb.rootNode.name ?? null, frameId: manifest.root.frameId, packageId: manifest.packageId, unit: 'm', sourceGrade: manifest.sourceGrade },
        assemblyGroups: clone(assemblyGroups),
        instanceNodes: [...byPi.values()].map((binding) => ({
          partInstanceId: binding.partInstanceId,
          nodeIndex: binding.nodeIndex,
          meshIndex: binding.meshIndex,
          parentNodeIndex: binding.parentNodeIndex,
          threeMatrixWorld: [...binding.threeMatrixWorld]
        })),
        meshDefinitions: clone(meshDefinitions),
        legacyGroups: [],
        suppressedLegacyPartKeys: Object.keys(legacy),
        vehiclePlacement: null,
        motionBinding: null,
        canPlayMotion: false,
        sourceGrade: 'DEMO_ASSUMPTION',
        note: 'Static workholding demo only. Do not apply vehicle placement or motion.'
      };
    }
    return {
      ok: true,
      mode: STATIC_PLACEMENT,
      useC01: false,
      packageId: null,
      root: null,
      assemblyGroups: [],
      instanceNodes: [],
      meshDefinitions: [],
      legacyGroups: Object.values(legacy).map((part) => ({
        partKey: part.partKey,
        displayName: part.displayName,
        legacyAssetUrl: part.legacyAssetUrl,
        piIds: [...part.piIds],
        mapping: part.mapping,
        canShowAsSingleInstance: part.canonicalSinglePart
      })),
      suppressedLegacyPartKeys: [],
      vehiclePlacement: null,
      motionBinding: null,
      canPlayMotion: false,
      sourceGrade: 'DEMO_ASSUMPTION',
      note: 'Legacy V2 three-part demo fallback; it is not a one-to-one canonical binding for bearing/studs.'
    };
  }

  function getStatus() {
    const display = consumer.getDisplayStatus();
    return {
      ok: true,
      apiVersion: BINDING_API_VERSION,
      packageId: manifest.packageId,
      manifestSha256,
      glbSha256,
      snapshotId: consumer.snapshotId,
      revision: consumer.revision,
      variantId: display.variant.variantId,
      sourceGrade: 'DEMO_ASSUMPTION',
      mappingStatus: 'DEMO_SUBSTITUTE',
      sameVehicleClaim: false,
      counts: {
        c01Instances: byPi.size,
        c01Meshes: meshDefinitions.length,
        assemblyGroups: assemblyGroups.length,
        studs: (byPart.get('PART-30-009') ?? []).length,
        snapshotPartInstances: display.counts.partInstances,
        fallbackWithoutC01: display.counts.partInstances - byPi.size
      },
      staticOnly: true,
      vehiclePlacement: null,
      motionBinding: null,
      legacyDemoBridge: Object.values(legacy).map((part) => ({
        partKey: part.partKey,
        mapping: part.mapping,
        piIds: [...part.piIds],
        canonicalSinglePart: part.canonicalSinglePart
      }))
    };
  }

  function getInstanceView(partInstanceId) {
    const detail = consumer.getObjectDetail(partInstanceId);
    const binding = getBinding(partInstanceId);
    const fallback = getFallbackStatus(partInstanceId);
    return {
      ok: true,
      detail,
      binding: binding.ok ? binding : null,
      bindingStatus: binding.ok ? 'C01_DEMO_SUBSTITUTE' : binding.code,
      fallback,
      renderNode: binding.ok
        ? { nodeIndex: binding.nodeIndex, meshIndex: binding.meshIndex, parentChain: binding.parentChain, threeMatrixWorld: binding.threeMatrixWorld }
        : null,
      staticOnly: true
    };
  }

  function assertStaticOnly(mode) {
    if (mode && mode !== STATIC_PLACEMENT) fail('E_VEHICLE_PLACEMENT_UNAVAILABLE', 'Only STATIC_WORKHOLDING_DEMO is available for C-01.', { requestedMode: mode });
    return { ok: true, mode: STATIC_PLACEMENT, vehiclePlacement: null, motionBinding: null, canPlayMotion: false };
  }

  return Object.freeze({
    apiVersion: BINDING_API_VERSION,
    packageId: manifest.packageId,
    snapshotId: consumer.snapshotId,
    revision: consumer.revision,
    getBinding,
    getFallbackStatus,
    getRenderPlan,
    getStatus,
    getInstanceView,
    getScenePlan: getRenderPlan,
    getLegacyDemoBridge: () => clone(legacy),
    assertStaticOnly,
    listBindings: () => [...byPi.values()].map((binding) => clone(binding))
  });
}

function sameOrigin(url, expectedOrigin) {
  if (!expectedOrigin) return true;
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    fail('E_INVALID_URL', `Invalid asset URL ${url}.`);
  }
  return origin === expectedOrigin;
}

export async function loadWheelEndVerifiedPackageFromUrls({
  snapshotUrl,
  consumerIndexUrl,
  manifestUrl,
  glbUrl,
  expectedOrigin = globalThis.location?.origin ?? null,
  expectedPackageId = null,
  expectedGlbSha256 = null,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') fail('E_FETCH_UNAVAILABLE', 'A fetch implementation is required.');
  for (const [name, url] of Object.entries({ snapshotUrl, consumerIndexUrl, manifestUrl, glbUrl })) {
    requireCondition(Boolean(url), 'E_INVALID_URL', `${name} is required.`);
    if (!sameOrigin(url, expectedOrigin)) fail('E_CROSS_ORIGIN_ASSET', `${name} is not on the expected origin.`, { url, expectedOrigin });
  }
  const [snapshotResponse, indexResponse, manifestResponse, glbResponse] = await Promise.all([
    fetchImpl(snapshotUrl), fetchImpl(consumerIndexUrl), fetchImpl(manifestUrl), fetchImpl(glbUrl)
  ]);
  for (const response of [snapshotResponse, indexResponse, manifestResponse, glbResponse]) {
    if (response.ok === false) fail('E_FETCH_FAILED', 'Failed to fetch a C-01 or snapshot asset.', { status: response.status });
  }
  const snapshotText = await snapshotResponse.text();
  const consumerIndex = await indexResponse.json();
  const manifestText = await manifestResponse.text();
  const glbBuffer = await glbResponse.arrayBuffer();
  const snapshotSha256 = await sha256Hex(snapshotText);
  const manifestSha256 = await sha256Hex(manifestText);
  const glbSha256 = await sha256Hex(glbBuffer);
  const manifest = JSON.parse(manifestText);
  const { createVehicleConsumer } = await import('../vehicle-consumer-v1/consumer.mjs');
  const consumer = createVehicleConsumer({ snapshot: JSON.parse(snapshotText), consumerIndex, snapshotSha256 });
  const glbJson = parseGlbJson(glbBuffer).json;
  const binding = createWheelEndBinding({
    consumer,
    consumerIndex,
    snapshotSha256,
    manifest,
    manifestSha256,
    glbJson,
    glbSha256,
    expectedPackageId,
    expectedGlbSha256
  });
  return Object.freeze({
    binding,
    manifest,
    manifestSha256,
    glbBuffer,
    glbSha256,
    snapshotSha256
  });
}

export async function loadWheelEndAssetBindingFromUrls(options = {}) {
  const pack = await loadWheelEndVerifiedPackageFromUrls(options);
  return pack.binding;
}

/**
 * R-27 single read-only vehicle snapshot + pose run projection.
 * Reads R-16 tree, R-21 crosswalk, R-22 integration and R-23 motion stream.
 * Does not write into production workbench code or other models' artifacts.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SNAPSHOT_SCHEMA = 'carlab.vehicleSnapshot/0.1.0-proposal';
export const CONSUMER_SCHEMA = 'carlab.vehicleSnapshot.consumer/0.1.0-proposal';
export const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(MODULE_DIR, '../..');

export const R16_PATH = 'docs/research/R-16-vehicle-skeleton.fixture.json';
export const R17_FIXTURE_PATH = 'src-experiments/domain-contract-v1/fixtures/fl-wheel-end.json';
export const R21_PATH = 'docs/research/R-21-vehicle-tree-mapping.fixture.json';
export const R22_PATH = 'src-experiments/vehicle-integration-v1/fixtures/integration-output.json';
export const R23_PATH = 'src-experiments/mechanism-stream-v1/motion-stream.json';
export const R25_CAD_MAP_PATH = 'workbench-v2/experiments/vehicle-structure-adapter/known-cad-map.mjs';
export const R26_TASK_PATH = 'agent-workspace/agents/qwen4/tasks/R-26.md';
export const SNAPSHOT_PATH = 'src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json';
export const CONSUMER_INDEX_PATH = 'src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json';

const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const clone = (value) => JSON.parse(JSON.stringify(value));
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const isNum3 = (value) => Array.isArray(value) && value.length === 3 && value.every(isNum);
const isMat4 = (value) => Array.isArray(value) && value.length === 4 && value.every((row) => Array.isArray(row) && row.length === 4 && row.every(isNum));
const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const norm3 = (value) => Math.hypot(value[0], value[1], value[2]);
const round = (value, digits = 6) => Number(value.toFixed(digits));
function quatToMat3(quaternion) {
  const [x, y, z, w] = quaternion;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
  ];
}
function matrixFromPose(position, quaternion) {
  const rotation = quatToMat3(quaternion);
  return [
    [rotation[0][0], rotation[0][1], rotation[0][2], position[0]],
    [rotation[1][0], rotation[1][1], rotation[1][2], position[1]],
    [rotation[2][0], rotation[2][1], rotation[2][2], position[2]],
    [0, 0, 0, 1]
  ];
}
function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}
function sha256File(root, relativePath) {
  return createHash('sha256').update(readFileSync(join(root, relativePath))).digest('hex');
}
function readJson(root, relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}
function readTextIfExists(root, relativePath) {
  const absolute = join(root, relativePath);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
}
function taskStatus(text) {
  if (!text) return 'MISSING';
  const match = /^status:\s*([^\s]+)/m.exec(text);
  return match ? match[1].trim() : 'UNKNOWN';
}

export async function loadInputs(root = DEFAULT_ROOT) {
  const knownCadModule = await import(pathToFileURL(join(root, R25_CAD_MAP_PATH)).href);
  const r26Text = readTextIfExists(root, R26_TASK_PATH);
  const r26Artifacts = existsSync(join(root, 'docs/research'))
    ? readdirSync(join(root, 'docs/research')).filter((name) => /^R-26[-.]/.test(name)).sort()
    : [];
  const paths = [R16_PATH, R17_FIXTURE_PATH, R21_PATH, R22_PATH, R23_PATH, R25_CAD_MAP_PATH];
  const hashes = {};
  for (const path of paths) hashes[path] = sha256File(root, path);
  if (r26Text) hashes[R26_TASK_PATH] = sha256Text(r26Text);
  return {
    r16: readJson(root, R16_PATH),
    r17Fixture: readJson(root, R17_FIXTURE_PATH),
    r21: readJson(root, R21_PATH),
    r22: readJson(root, R22_PATH),
    r23: readJson(root, R23_PATH),
    knownCad: knownCadModule.KNOWN_CAD_BY_INSTANCE || {},
    knownCadPath: R25_CAD_MAP_PATH,
    r26: { status: taskStatus(r26Text), artifacts: r26Artifacts, taskPath: R26_TASK_PATH, textPresent: Boolean(r26Text) },
    hashes
  };
}

const ROLES = [
  { role: 'UPPER_ARM', mechanismId: 'INST-SLA-UPPER-ARM-FL', r21Role: 'UPPER-ARM' },
  { role: 'LOWER_ARM', mechanismId: 'INST-SLA-LOWER-ARM-FL', r21Role: 'LOWER-ARM' },
  { role: 'UPRIGHT', mechanismId: 'INST-SLA-UPRIGHT-FL', r21Role: 'UPRIGHT' },
  { role: 'HUB', mechanismId: 'INST-SLA-HUB-FL', r21Role: 'HUB' },
  { role: 'TIEROD', mechanismId: 'INST-SLA-TIEROD-FL', r21Role: 'TIEROD' }
];

function inputRecords(inputs) {
  return [
    { role: 'R16_TREE', path: R16_PATH, sha256: inputs.hashes[R16_PATH], provider: 'qwen4', declaredStatus: inputs.r16.status, readOnly: true },
    { role: 'R17_FIXTURE', path: R17_FIXTURE_PATH, sha256: inputs.hashes[R17_FIXTURE_PATH], provider: 'deepseek', declaredStatus: inputs.r17Fixture.schemaVersion, readOnly: true },
    { role: 'R21_MAPPING', path: R21_PATH, sha256: inputs.hashes[R21_PATH], provider: 'qwen4', declaredStatus: inputs.r21.status, readOnly: true },
    { role: 'R22_INTEGRATION', path: R22_PATH, sha256: inputs.hashes[R22_PATH], provider: 'deepseek', declaredStatus: inputs.r22.status, readOnly: true },
    { role: 'R23_MOTION', path: R23_PATH, sha256: inputs.hashes[R23_PATH], provider: 'grok', declaredStatus: `${inputs.r23.motionValueBasis}/${inputs.r23.provenance}`, readOnly: true },
    { role: 'R25_CAD_WHITELIST', path: R25_CAD_MAP_PATH, sha256: inputs.hashes[R25_CAD_MAP_PATH], provider: 'composer-2-5', declaredStatus: 'DEMO_WHITELIST', readOnly: true },
    { role: 'R26_DECISIONS', path: R26_TASK_PATH, sha256: inputs.hashes[R26_TASK_PATH] ?? null, provider: 'qwen4', declaredStatus: inputs.r26.status, readOnly: true, outputFound: inputs.r26.artifacts.length > 0 }
  ];
}

function buildBindingMatrix(inputs, canonicalIds) {
  const r21RoleBySource = new Map(inputs.r21.r18RoleMapping.map((row) => [row.r18InstanceId, row]));
  const r22BindingBySource = new Map((inputs.r22.deepSlice?.instanceBindings || []).map((row) => [row.sourceInstanceId, row]));
  const r23Frame = inputs.r23.frames[0];
  const r23BySource = new Map(r23Frame.instances.map((row) => [row.mechanismInstanceId, row]));
  return ROLES.map((role) => {
    const r21 = r21RoleBySource.get(role.mechanismId) ?? null;
    const r22 = r22BindingBySource.get(role.mechanismId) ?? null;
    const r23 = r23BySource.get(role.mechanismId) ?? null;
    let r27Status = 'UNRESOLVED';
    let targetInstanceId = null;
    let attachTo = 'NONE';
    let agreement = 'UNDECIDED';
    let poseKind = 'NONE';
    let published = false;
    let discrepancy = null;
    if (role.role === 'UPPER_ARM' || role.role === 'LOWER_ARM' || role.role === 'UPRIGHT') {
      r27Status = 'BOUND_RIGID_PART';
      targetInstanceId = r22?.canonicalInstanceId ?? r21?.r16InstanceId ?? null;
      attachTo = 'PART';
      poseKind = 'RIGID_PART';
      agreement = '3_OF_3';
      published = true;
    } else if (role.role === 'HUB') {
      r27Status = 'CANDIDATE_ROLE_BINDING';
      targetInstanceId = 'PI-30-006-FL';
      attachTo = 'ROLE_MARKER';
      poseKind = 'ROLE_ONLY';
      agreement = '2_OF_3';
      published = true;
      discrepancy = {
        code: 'R27-DISC-HUB',
        r22: 'BOUND_TO_PI-30-006-FL',
        r23: 'UNBOUND_NO_HUB_BODY',
        r21: 'BOUND_TO_INSTANCE',
        resolution: 'Use PI-30-006-FL as a candidate role marker only; R-18 hub pose is a wheel-center/spindle role, not a proven local frame of the flange.'
      };
    } else if (role.role === 'TIEROD') {
      r27Status = 'REQUIRED_DEFERRED_NO_INSTANCE';
      targetInstanceId = null;
      attachTo = 'NONE';
      poseKind = 'NONE';
      agreement = '3_OF_3_UNBOUND';
      published = false;
      discrepancy = {
        code: 'R27-DISC-TIEROD',
        status: 'CONSISTENT_UNBOUND_BUT_REQUIRED',
        note: 'PART-20-075 is required in this variant; DEFERRED means geometry/source not closed, not that the part is optional or absent.'
      };
    }
    if (targetInstanceId && !canonicalIds.has(targetInstanceId)) {
      throw new Error(`R27-E-CANONICAL-MISSING: ${role.role} target ${targetInstanceId}`);
    }
    return {
      role: role.role,
      r18SourceInstanceId: role.mechanismId,
      r16DefinitionId: r21?.mappedPartDefinitionId ?? r22?.r16DefinitionId ?? r23?.definitionId ?? null,
      r21: { bindingStatus: r21?.bindingStatus ?? 'MISSING', instanceId: r21?.r16InstanceId ?? null },
      r22: { bindingStatus: r22?.bindingStatus ?? 'MISSING', instanceId: r22?.canonicalInstanceId ?? null, reason: r22?.reason ?? null },
      r23: { bindingStatus: r23?.bindingStatus ?? 'MISSING', instanceId: r23?.instanceId ?? null, reason: r23?.bindingReason ?? null },
      r27: {
        bindingStatus: r27Status,
        targetInstanceId,
        attachTo,
        poseKind,
        agreement,
        published,
        notARigidPartPose: poseKind === 'ROLE_ONLY',
        requiredInVariant: role.role === 'TIEROD' ? true : null
      },
      discrepancy
    };
  });
}

function buildStrictPoseFrames(inputs, bindingMatrix) {
  const rigidRoles = new Set(bindingMatrix.filter((row) => row.r27.bindingStatus === 'BOUND_RIGID_PART').map((row) => row.r18SourceInstanceId));
  return inputs.r23.frames.map((sourceFrame) => ({
    frameIndex: sourceFrame.frameIndex,
    travelM: sourceFrame.travelM,
    solverStatus: sourceFrame.solverStatus,
    residualM: sourceFrame.residualM,
    poses: sourceFrame.instances
      .filter((instance) => rigidRoles.has(instance.mechanismInstanceId))
      .map((instance) => {
        const binding = bindingMatrix.find((row) => row.r18SourceInstanceId === instance.mechanismInstanceId);
        const positionM = [...instance.position];
        const quaternionXYZW = [...instance.quaternion];
        return {
          instanceId: binding.r27.targetInstanceId,
          role: binding.role,
          positionM,
          quaternionXYZW,
          scale: [...instance.scale],
          matrixWorld: matrixFromPose(positionM, quaternionXYZW),
          geometryStatus: 'NO_GEOMETRY'
        };
      })
  }));
}

function buildDemoMotionView(inputs, bindingMatrix) {
  const bindingByMechanism = new Map(bindingMatrix.map((row) => [row.r18SourceInstanceId, row]));
  const frames = inputs.r23.frames.map((sourceFrame) => ({
    frameIndex: sourceFrame.frameIndex,
    travelM: sourceFrame.travelM,
    solverStatus: sourceFrame.solverStatus,
    residualM: sourceFrame.residualM,
    poses: sourceFrame.instances.map((instance) => {
      const binding = bindingByMechanism.get(instance.mechanismInstanceId);
      const published = Boolean(binding?.r27.published);
      const positionM = [...instance.position];
      const quaternionXYZW = [...instance.quaternion];
      return {
        role: binding?.role ?? 'UNKNOWN',
        mechanismInstanceId: instance.mechanismInstanceId,
        sourceDefinitionId: instance.definitionId,
        instanceId: binding?.r27.targetInstanceId ?? null,
        candidateInstanceId: binding?.r27.targetInstanceId ?? null,
        bindingStatus: binding?.r27.bindingStatus ?? 'UNRESOLVED',
        attachTo: binding?.r27.attachTo ?? 'NONE',
        poseKind: binding?.r27.poseKind ?? 'NONE',
        published,
        notARigidPartPose: Boolean(binding?.r27.notARigidPartPose),
        positionM,
        quaternionXYZW,
        scale: [...instance.scale],
        matrixWorld: published ? matrixFromPose(positionM, quaternionXYZW) : null,
        observedPositionM: published ? null : positionM,
        observedQuaternionXYZW: published ? null : quaternionXYZW,
        closureErrorM: instance.closureErrorM ?? null,
        rigidLengthsM: instance.rigidLengthsM ? clone(instance.rigidLengthsM) : null,
        geometryStatus: 'NO_GEOMETRY',
        requiresBadge: true
      };
    }),
    constraints: clone(sourceFrame.constraints),
    clearance: clone(sourceFrame.clearance),
    force: sourceFrame.force ?? 'N/A'
  }));
  return {
    status: 'DEMO_ONLY',
    badge: 'DEMO_ONLY_STALE_SOURCE_REV_3',
    requiresDemoMode: true,
    publishAsCurrent: false,
    playbackAllowed: 'DEMO_ONLY_WITH_BADGE',
    sourceRunId: inputs.r23.simulationRun.runId,
    sourceRevision: inputs.r23.simulationRun.inputRevision,
    snapshotRevision: inputs.r22.vehicleProject.revision,
    frameId: 'FR-VEHICLE',
    units: 'm',
    up: 'Y',
    scalePolicy: { globalScale: 1, implicitScale: false, negativeScaleAllowed: false, perPoseScale: 'UNIT_XYZ_REQUIRED' },
    mirrorPolicy: { rightSidePublished: false, globalNegativeScaleAllowed: false, regenerateMirroredGeometryOnly: true },
    frames,
    forceBasis: inputs.r23.force,
    geometryValueBasis: inputs.r23.geometryValueBasis,
    motionValueBasis: inputs.r23.motionValueBasis,
    provenance: inputs.r23.provenance,
    rule: 'The source run revision 3 does not match snapshot revision 1. Render only in demo mode with a STALE + DEMO badge; never publish as CURRENT or production motion.'
  };
}

function buildWorkbenchTree(snapshot) {
  const systemIndex = new Map(snapshot.tree.systems.map((system, index) => [system.systemId, index]));
  const assemblyInstances = snapshot.tree.assemblyInstances.map((assembly) => ({
    assemblyInstanceId: assembly.assemblyInstanceId,
    definitionRef: assembly.definitionRef,
    systemId: assembly.systemId,
    corner: assembly.corner,
    frameId: assembly.frameId,
    geometryStatus: 'NO_GEOMETRY',
    partInstanceIds: []
  }));
  const assemblyIndex = new Map(assemblyInstances.map((assembly, index) => [assembly.assemblyInstanceId, index]));
  for (const part of snapshot.tree.partInstances) {
    const index = assemblyIndex.get(part.assemblyInstanceId);
    if (index == null) throw new Error(`R27-E-ORPHAN-PART: ${part.partInstanceId} -> ${part.assemblyInstanceId}`);
    assemblyInstances[index].partInstanceIds.push(part.partInstanceId);
  }
  const systems = snapshot.tree.systems
    .filter((system) => system.level === 'SYSTEM')
    .map((system) => ({
      systemId: system.systemId,
      name: system.name,
      subsystemIds: snapshot.tree.systems.filter((child) => child.level === 'SUBSYSTEM' && child.parentSystemId === system.systemId).map((child) => child.systemId),
      assemblyInstanceIds: assemblyInstances.filter((assembly) => assembly.systemId === system.systemId).map((assembly) => assembly.assemblyInstanceId)
    }));
  const indexedPartIds = assemblyInstances.flatMap((assembly) => assembly.partInstanceIds);
  if (indexedPartIds.length !== snapshot.tree.partInstances.length) throw new Error(`R27-E-TREE-DUPLICATE: ${indexedPartIds.length} != ${snapshot.tree.partInstances.length}`);
  if (new Set(indexedPartIds).size !== indexedPartIds.length) throw new Error('R27-E-TREE-DUPLICATE: a part instance is indexed twice');
  for (const system of systems) {
    if (!systemIndex.has(system.systemId)) throw new Error(`R27-E-SYSTEM-INDEX: ${system.systemId}`);
  }
  return {
    root: { vehicleId: 'VEH-001', name: 'R-16 候选整车工程（只读快照）', systemIds: systems.map((system) => system.systemId) },
    systems,
    assemblyInstances
  };
}

function buildIndexes(snapshot) {
  const indexOf = (items, key) => Object.fromEntries(items.map((item, index) => [item[key], index]));
  return {
    bySystemId: indexOf(snapshot.tree.systems, 'systemId'),
    byAssemblyDefinitionId: indexOf(snapshot.tree.assemblyDefinitions, 'assemblyDefinitionId'),
    byAssemblyInstanceId: indexOf(snapshot.tree.assemblyInstances, 'assemblyInstanceId'),
    byPartDefinitionId: indexOf(snapshot.tree.partDefinitions, 'partDefinitionId'),
    byPartInstanceId: indexOf(snapshot.tree.partInstances, 'partInstanceId'),
    byMountFrameId: indexOf(snapshot.tree.mountFrames.canonical, 'frameId'),
    byRole: Object.fromEntries(snapshot.bindingMatrix.map((row) => [row.role, row.r27.targetInstanceId]))
  };
}

function buildConflictRegister(inputs) {
  const r21Decision = {
    'CF-01': 'D-R27-06',
    'CF-02': 'D-R27-04',
    'CF-03': 'D-R27-06',
    'CF-04': 'D-R27-07',
    'CF-05': 'D-R27-03',
    'CF-06': 'D-R27-06',
    'CF-07': 'D-R27-03',
    'CF-08': 'D-R27-06',
    'CF-09': 'D-R27-01'
  };
  const r22Decision = {
    'CF-R22-01': 'D-R27-04',
    'CF-R22-02': 'D-R27-02',
    'CF-R22-03': 'D-R27-03',
    'CF-R22-04': 'D-R27-06',
    'CF-R22-05': 'D-R27-01',
    'CF-R22-06': 'D-R27-03',
    'CF-R22-07': 'D-R27-05',
    'CF-R22-08': 'D-R27-02',
    'CF-R22-09': 'D-R27-07',
    'CF-R22-10': 'D-R27-05'
  };
  const r21 = inputs.r21.conflicts.map((conflict) => ({
    registerId: `R21-${conflict.id}`,
    source: 'R-21',
    sourceConflictId: conflict.id,
    severity: conflict.severity,
    topic: conflict.title,
    status: 'OPEN',
    disposition: 'PRESERVED_NO_AUTO_RESOLUTION',
    decisionRef: r21Decision[conflict.id] ?? null
  }));
  const r22 = inputs.r22.conflicts.map((conflict) => ({
    registerId: `R22-${conflict.conflictId}`,
    source: 'R-22',
    sourceConflictId: conflict.conflictId,
    severity: conflict.severity,
    topic: conflict.topic,
    status: 'OPEN',
    disposition: 'PRESERVED_NO_AUTO_RESOLUTION',
    decisionRef: r22Decision[conflict.conflictId] ?? null
  }));
  const r27 = [
    {
      registerId: 'R27-CF-01',
      source: 'R-27',
      sourceConflictId: 'R27-CF-01',
      severity: 'P0',
      topic: 'hub role binding disagreement',
      status: 'OPEN',
      disposition: 'CANDIDATE_ROLE_MARKER_ONLY',
      decisionRef: 'D-R27-02',
      detail: 'R-21 and R-22 bind the R-18 hub pose to PI-30-006-FL; R-23 leaves it unbound with UNBOUND_NO_HUB_BODY. R-27 keeps a candidate role marker, not a rigid part pose.'
    },
    {
      registerId: 'R27-CF-02',
      source: 'R-27',
      sourceConflictId: 'R27-CF-02',
      severity: 'P1',
      topic: 'pose run revision mismatch',
      status: 'OPEN',
      disposition: 'STRICT_POSE_RUN_STALE_DEMO_VIEW_BADGED',
      decisionRef: 'D-R27-02',
      detail: 'R-23 run inputRevision=3, snapshot revision=1. Strict poseRun is STALE with no current frames; only a DEMO view with a stale badge is exposed.'
    },
    {
      registerId: 'R27-CF-03',
      source: 'R-27',
      sourceConflictId: 'R27-CF-03',
      severity: 'P1',
      topic: 'crosswalk coverage gap',
      status: 'OPEN',
      disposition: 'PRESERVED_NOT_A_DEFECT',
      decisionRef: 'D-R27-04',
      detail: 'R-21 maps 13 of 278 R-16 instances. The other 265 remain canonical R-16 nodes with no R-17 projection; they are not deleted or invented.'
    },
    {
      registerId: 'R27-CF-04',
      source: 'R-27',
      sourceConflictId: 'R27-CF-04',
      severity: 'P1',
      topic: 'R-26 decision output missing',
      status: 'OPEN',
      disposition: 'DEFAULT_PRESERVE_ALL_CONFLICTS',
      decisionRef: 'D-R27-08',
      detail: `R-26 status is ${inputs.r26.status}; no output artifacts found. R-27 preserves all R-21/R-22 conflicts and does not auto-resolve them.`
    },
    {
      registerId: 'R27-CF-05',
      source: 'R-27',
      sourceConflictId: 'R27-CF-05',
      severity: 'P2',
      topic: 'projection frame scope',
      status: 'OPEN',
      disposition: 'SCOPE_DECLARED_NOT_MERGED',
      decisionRef: 'D-R27-03',
      detail: `R-21 maps ${inputs.r21.frameMapping.length} R-17 frames across both R-17 fixtures; this snapshot includes ${inputs.r17Fixture.frames.length} FL wheel-end fixture frames. The remaining frames stay outside the FL motion slice; nonzero-origin counts differ accordingly.`
    }
  ];
  return [...r21, ...r22, ...r27];
}

function buildSourceRegistry(inputs) {
  return {
    artifacts: inputRecords(inputs).map((input) => ({
      sourceId: input.role,
      kind: 'INPUT_ARTIFACT',
      grade: 'PROJECT_RESEARCH',
      path: input.path,
      sha256: input.sha256,
      declaredStatus: input.declaredStatus,
      verificationStatus: input.sha256 ? 'HASH_VERIFIED' : 'UNVERIFIED',
      provider: input.provider
    })),
    r16ExternalRefs: {
      count: 46,
      status: 'UNVERIFIED_REFERENCE',
      note: 'R-16 external source IDs were not re-opened in R-27. No string is promoted to SOURCED or OEM.'
    },
    policies: {
      sourcedRequiresArtifactAndHash: true,
      oemRequiresVerifiableArtifact: true,
      stringPromotionForbidden: true,
      forgedSourceFailsClosed: true,
      demoProvenance: 'DEMO_ASSUMPTION / FICTIONAL_FIXTURE'
    }
  };
}

function buildGeometry(inputs, snapshot, canonicalIds) {
  const knownCadBindings = [];
  for (const [projectionAlias, cad] of Object.entries(inputs.knownCad)) {
    const r18Role = inputs.r21.r18RoleMapping.find((row) => row.r18InstanceId === projectionAlias);
    const r17Instance = inputs.r21.partInstanceMapping.find((row) => row.r17InstanceId === projectionAlias && row.r16InstanceId);
    const instanceId = r18Role?.r16InstanceId ?? r17Instance?.r16InstanceId ?? null;
    if (instanceId && canonicalIds.has(instanceId)) {
      knownCadBindings.push({
        instanceId,
        projectionAlias,
        projectionKind: r18Role ? 'R18_ROLE_ALIAS' : 'R17_FIXTURE_ALIAS',
        cadUrl: cad.cadUrl,
        mappingStatus: cad.mappingStatus,
        units: cad.units,
        up: cad.up,
        allowed: true,
        copyToOtherInstances: false,
        attachTo: 'ROLE_MARKER',
        geometryStatus: 'NO_GEOMETRY',
        note: 'Single demo substitute; it does not change the engineering geometry status and cannot be copied to other instances.'
      });
    }
  }
  return {
    policy: 'NO_GEOMETRY_FOR_ENGINEERING_DATA',
    noGeometryInstances: snapshot.tree.partInstances.length,
    sourcedGeometryInstances: 0,
    renderableProductionInstances: 0,
    demoCadBindings: knownCadBindings,
    demoCadBindingCount: knownCadBindings.length,
    bulkCadBindingForbidden: true,
    rule: 'Every engineering instance is NO_GEOMETRY unless an explicit demo substitute is listed. A demo GLB is not real CAD and must never be cloned to 278 instances.'
  };
}

export function buildSnapshot(inputs) {
  const r22 = inputs.r22;
  const vp = r22.vehicleProject;
  const r16Defs = new Map(inputs.r16.partDefinitions.map((definition) => [definition.id, definition]));
  const r21PartDef = new Map(inputs.r21.partDefinitionMapping.map((row) => [row.partId, row]));
  const r21PartInst = new Map(inputs.r21.partInstanceMapping.filter((row) => row.r16InstanceId).map((row) => [row.r16InstanceId, row]));
  const r21AsmInst = new Map(inputs.r21.assemblyInstanceMapping.filter((row) => row.r16AssemblyInstanceId).map((row) => [row.r16AssemblyInstanceId, row]));
  const r21AsmDef = new Map(inputs.r21.assemblyDefinitionMapping.map((row) => [row.assemblyId, row]));
  const placeholder = new Map((inputs.r21.conflicts.find((conflict) => conflict.id === 'CF-01')?.detail || []).map((row) => [row.assemblyId, row]));
  const nameDrift = new Map((inputs.r21.conflicts.find((conflict) => conflict.id === 'CF-03')?.detail || []).map((row) => [row.partId, row]));
  const evidenceConflict = new Map((inputs.r21.conflicts.find((conflict) => conflict.id === 'CF-04')?.detail || []).map((row) => [row.partId, row]));

  const systems = vp.systems.map((system) => ({
    systemId: system.systemId,
    name: system.name,
    level: system.level,
    parentSystemId: system.parentSystemId,
    evidenceInherited: system.evidenceInherited
  }));
  const assemblyDefinitions = vp.assemblyDefinitions.map((definition) => {
    const placeholderRow = placeholder.get(definition.assemblyId);
    const mapping = r21AsmDef.get(definition.assemblyId);
    return {
      assemblyDefinitionId: definition.assemblyId,
      name: definition.name,
      systemId: definition.systemId,
      parentNodeId: definition.parentNodeId,
      parentKind: definition.parentKind,
      purchaseBoundary: definition.purchaseBoundary,
      targetLevel: definition.targetLevel,
      evidenceInherited: definition.evidenceInherited,
      isPlaceholder: Boolean(placeholderRow),
      canonicalName: placeholderRow?.rp01Name ?? null,
      projectionName: placeholderRow?.r17Name ?? null,
      semanticBroadening: Boolean(placeholderRow),
      r21Mapping: mapping ? { r17Name: mapping.r17Name, nameDrift: Boolean(mapping.nameDrift), semanticBroadening: Boolean(mapping.semanticBroadening), status: mapping.status } : null
    };
  });
  const assemblyInstances = vp.assemblyInstances.map((assembly) => {
    const mapping = r21AsmInst.get(assembly.assemblyInstanceId);
    return {
      assemblyInstanceId: assembly.assemblyInstanceId,
      definitionRef: assembly.definitionRef,
      systemId: assembly.systemId,
      frameId: assembly.frameId,
      corner: assembly.corner,
      scope: assembly.scope,
      activeInVariant: assembly.activeInVariant,
      evidenceInherited: assembly.evidenceInherited,
      valueBasis: assembly.valueBasis,
      geometryStatus: 'NO_GEOMETRY',
      projection: mapping ? { r17AssemblyInstanceId: mapping.r17AssemblyInstanceId, r17FrameId: mapping.r17FrameId, mappingStatus: mapping.status, canonicalIdentity: false } : null
    };
  });
  const partDefinitions = vp.partDefinitions.map((definition) => {
    const source = r16Defs.get(definition.partId);
    const mapping = r21PartDef.get(definition.partId);
    const drift = nameDrift.get(definition.partId);
    const evidence = evidenceConflict.get(definition.partId);
    return {
      partDefinitionId: definition.partId,
      name: definition.name,
      systemId: definition.systemId,
      parentNodeId: definition.parentNodeId,
      parentKind: definition.parentKind,
      familyRef: definition.familyRef,
      evidenceInherited: definition.evidenceInherited,
      geometryStatus: 'NO_GEOMETRY',
      instancePolicy: definition.instancePolicy,
      optionality: source?.optionality ?? null,
      qtyVehicleTotalInherited: definition.qtyVehicleTotalInherited,
      variantFlag: definition.variantFlag ?? null,
      modelBlocked: Boolean(definition.modelBlocked),
      sourceRefs: [...(definition.sourceRefs || [])],
      canonicalName: drift?.rp01Name ?? null,
      projectionName: mapping?.r17Name ?? drift?.r17Name ?? null,
      nameDrift: Boolean(mapping?.nameDrift || drift),
      evidenceProjection: evidence ? {
        rp01Evidence: evidence.rp01Evidence,
        rp01Sources: [...(evidence.rp01Sources || [])],
        r17EvidenceInherited: evidence.r17,
        r16EvidenceInherited: evidence.r16,
        direction: evidence.direction,
        status: 'OPEN_PRESERVED'
      } : null,
      requiredButDeferred: definition.partId === 'PART-20-075' ? {
        status: 'REQUIRED_BUT_DEFERRED',
        reason: 'GEOMETRY_AND_SOURCE_NOT_CLOSED',
        optionality: 'required',
        qtyVehicleTotal: 2,
        handedness: 'MIRROR_REGENERATE',
        downstreamMustNotOmit: true
      } : null,
      variantDecision: definition.partId === 'PART-40-048' ? {
        status: 'VARIANT_UNDECIDED',
        variantFlag: 'caliperFixedOrFloating',
        reason: 'FLOATING_CALIPER_NEEDS_BRACKET_FIXED_CALIPER_MAY_BOLT_TO_KNUCKLE',
        optionality: 'required',
        downstreamMustNotAssumePresenceOrAbsence: true
      } : null
    };
  });
  const partInstances = vp.partInstances.map((instance) => {
    const mapping = r21PartInst.get(instance.instanceId);
    return {
      partInstanceId: instance.instanceId,
      partId: instance.partId,
      assemblyInstanceId: instance.assemblyInstanceId,
      frameId: instance.frameId,
      corner: instance.corner,
      ordinal: instance.ordinal,
      quantity: { perAssembly: 1 },
      sourceQtyPerCorner: instance.quantity?.sourceQtyPerCorner ?? null,
      qtySemantics: 'ONE_PHYSICAL_PIECE_PER_INSTANCE',
      qtyVehicleTotalInherited: instance.qtyVehicleTotalInherited,
      geometryStatus: 'NO_GEOMETRY',
      inspectable: false,
      evidenceInherited: instance.evidenceInherited,
      evidence: clone(instance.evidence || {}),
      projection: mapping ? {
        r17PartInstanceId: mapping.r17InstanceId,
        r17AssemblyInstanceId: mapping.r17AssemblyId,
        r17FrameId: mapping.r17FrameId,
        r17ParentDefinitionRef: mapping.r17ParentDefinitionRef,
        parentLevelMismatch: Boolean(mapping.r17ParentDefinitionRef && mapping.r16ParentDefinitionId && mapping.r17ParentDefinitionRef !== mapping.r16ParentDefinitionId),
        mappingStatus: mapping.status,
        canonicalIdentity: false,
        mappingKind: 'ROLE_BASED_NOT_IDENTITY'
      } : null
    };
  });
  const canonicalIds = new Set(partInstances.map((instance) => instance.partInstanceId));
  if (canonicalIds.size !== partInstances.length) throw new Error('R27-E-DUP-PI: duplicate canonical part instance id');

  const canonicalFrames = vp.mountFrames.map((frame) => ({
    frameId: frame.frameId,
    assemblyInstanceId: frame.assemblyInstanceId,
    corner: frame.corner,
    space: 'MOUNT_LOCAL',
    units: null,
    origin: null,
    rotation: null,
    anchorStatus: 'UNANCHORED_UNKNOWN',
    worldFrame: 'UNFROZEN_PENDING_RP07',
    handedness: frame.handedness,
    mirrorPolicy: frame.mirrorPolicy,
    globalScaleForbidden: true,
    canonicalIdentity: true
  }));
  const r23TravelZero = inputs.r23.frames.find((frame) => frame.travelM === 0) || inputs.r23.frames[0];
  const r23Hub = r23TravelZero.instances.find((instance) => instance.mechanismInstanceId === 'INST-SLA-HUB-FL');
  const r17WheelEnd = inputs.r17Fixture.frames.find((frame) => frame.frameId === 'FR-WHEEL-END-FL');
  const frameDelta = r17WheelEnd && r23Hub ? r17WheelEnd.origin.map((value, index) => value - r23Hub.position[index]) : null;
  const projectionFrames = inputs.r17Fixture.frames.map((frame) => {
    const hasNonZero = Array.isArray(frame.origin) && frame.origin.some((value) => Math.abs(value) > 1e-12);
    return {
      frameId: frame.frameId,
      parentFrameId: frame.parentFrameId,
      space: frame.space,
      units: frame.units,
      origin: [...frame.origin],
      rotation: clone(frame.rotation),
      hasNonZeroNumericOrigin: hasNonZero,
      valueBasis: 'DEMO_ASSUMPTION',
      notCanonical: true,
      canonicalIdentity: false,
      numericOriginUnverified: hasNonZero,
      note: 'Projection-only frame from the R-17 fixture; numeric origins have no sourced basis.'
    };
  });
  const frames = {
    canonical: canonicalFrames,
    canonicalAnchoredCount: 0,
    canonicalUnanchoredCount: canonicalFrames.length,
    projection: projectionFrames,
    projectionNonZeroOriginCount: projectionFrames.filter((frame) => frame.hasNonZeroNumericOrigin).length,
    projectionNonZeroOriginValueBasis: 'DEMO_ASSUMPTION',
    projectionScope: {
      fixture: R17_FIXTURE_PATH,
      framesIncluded: projectionFrames.length,
      r21TotalProjectionFrames: inputs.r21.frameMapping.length,
      framesNotIncluded: inputs.r21.frameMapping.length - projectionFrames.length,
      nonzeroOriginFramesIncluded: projectionFrames.filter((frame) => frame.hasNonZeroNumericOrigin).length,
      r21ClaimedNonzeroOriginFrames: inputs.r21.frameMapping.filter((row) => row.hasNonZeroNumericOrigin).length,
      reason: 'R-27 includes the FL wheel-end fixture frames used by R-22/R-23; the R-17 vehicle-skeleton fixture frames are outside this motion slice and are not merged.',
      note: 'R-21 counts nonzero numeric origins across both R-17 fixtures; the FL fixture alone has fewer.'
    },
    numericFrameConflict: frameDelta ? {
      r17FrameId: 'FR-WHEEL-END-FL',
      r17OriginM: [...r17WheelEnd.origin],
      r18HubTravelZeroM: [...r23Hub.position],
      deltaM: frameDelta.map((value) => round(value)),
      distanceM: round(norm3(frameDelta)),
      status: 'DO_NOT_MERGE',
      note: 'Both are demo fixtures with no sourced anchor; identity mapping only.'
    } : null,
    displayPolicy: {
      productionMatrices: 0,
      demoFrameId: 'FR-VEHICLE',
      units: 'm',
      up: 'Y',
      globalScale: 1,
      implicitGlobalScale: false,
      negativeScaleAllowed: false,
      hinge: 'R-16 canonical frames are unanchored; only demo motion poses have display matrices.'
    }
  };

  const countByPart = new Map();
  for (const instance of partInstances) countByPart.set(instance.partId, (countByPart.get(instance.partId) || 0) + 1);
  const qtyRows = partDefinitions
    .filter((definition) => countByPart.has(definition.partDefinitionId))
    .map((definition) => {
      const physical = countByPart.get(definition.partDefinitionId);
      return {
        partId: definition.partDefinitionId,
        name: definition.name,
        inheritedVehicleTotal: definition.qtyVehicleTotalInherited,
        physicalInstanceCount: physical,
        delta: physical - definition.qtyVehicleTotalInherited,
        status: physical === definition.qtyVehicleTotalInherited ? 'MATCH' : 'MISMATCH_OPEN'
      };
    });
  const derivedMismatchIds = qtyRows.filter((row) => row.status === 'MISMATCH_OPEN').map((row) => row.partId).sort();
  const declaredConflicts = inputs.r22.inheritedIssues.qtyConflicts.map((row) => ({
    partId: row.definitionId,
    name: row.name,
    inheritedVehicleTotal: row.qtyVehicleTotalInherited,
    instantiatedTotal: row.instantiatedTotalInThisVariant,
    distribution: row.distribution,
    divisor: row.divisor,
    status: 'OPEN',
    reason: row.reason
  }));
  const declaredIds = declaredConflicts.map((row) => row.partId).sort();
  const studs = partInstances.filter((instance) => instance.partId === 'PART-30-009');
  const qty = {
    policy: 'ONE_PHYSICAL_PIECE_PER_INSTANCE',
    rule: 'Each PI-* instance is one physical piece. qtyPerCorner is part/corner-level and must not be multiplied by the instance count.',
    rows: qtyRows,
    derivedMismatchIds,
    declaredConflictIds: declaredIds,
    conflicts: declaredConflicts,
    auditStatus: JSON.stringify(derivedMismatchIds) === JSON.stringify(declaredIds) ? 'CONSISTENT' : 'DIVERGED',
    doubleCountExample: {
      partId: 'PART-30-009',
      physicalInstances: studs.length,
      sourceQtyPerCorner: studs[0]?.sourceQtyPerCorner ?? null,
      naiveSumOfQtyPerCorner: studs.reduce((sum, instance) => sum + (instance.sourceQtyPerCorner || 0), 0),
      inheritedVehicleTotal: partDefinitions.find((definition) => definition.partDefinitionId === 'PART-30-009')?.qtyVehicleTotalInherited ?? null,
      correctTotal: studs.length
    },
    bomLines: vp.bomLines.length,
    bomRule: 'COUNT_OF_PHYSICAL_INSTANCES_PER_PARENT'
  };

  const bindingMatrix = buildBindingMatrix(inputs, canonicalIds);
  const sourceRun = inputs.r23.simulationRun;
  const snapshotRevision = vp.revision;
  const revisionMismatch = sourceRun.inputRevision !== snapshotRevision;
  const poseRun = {
    runId: sourceRun.runId,
    source: R23_PATH,
    sourceRunStatus: sourceRun.status,
    sourceRevision: sourceRun.inputRevision,
    snapshotRevision,
    status: revisionMismatch ? 'STALE' : 'CURRENT',
    reason: revisionMismatch ? 'SOURCE_REVISION_MISMATCH' : 'REVISION_MATCHED',
    revisionMismatch,
    playbackAllowed: !revisionMismatch,
    notCurrent: revisionMismatch,
    frames: revisionMismatch ? [] : buildStrictPoseFrames(inputs, bindingMatrix),
    sourceFrameCount: inputs.r23.frames.length,
    sourceFrameIndex: inputs.r23.frames.map((frame) => ({
      frameIndex: frame.frameIndex,
      travelM: frame.travelM,
      solverStatus: frame.solverStatus,
      residualM: frame.residualM
    })),
    sourceRunHash: sourceRun.resultHash,
    solver: sourceRun.solver,
    frameId: sourceRun.frameId,
    valueBasis: inputs.r23.motionValueBasis,
    provenance: inputs.r23.provenance,
    forceBasis: inputs.r23.force,
    stalePolicy: {
      strictConsumer: 'NO_CURRENT_FRAMES',
      demoConsumer: 'DEMO_VIEW_WITH_STALE_BADGE_ONLY',
      futureProvider: 'R-28 must publish a run bound to this snapshot revision or explicitly rebase with a new hash.'
    }
  };
  const demoMotionView = buildDemoMotionView(inputs, bindingMatrix);

  const sourceRegistry = buildSourceRegistry(inputs);
  const conflictRegister = buildConflictRegister(inputs);
  const decisions = [
    {
      decisionId: 'D-R27-01',
      status: 'PROPOSED_PENDING_GPT6',
      decision: 'Snapshot variant is R-16 VAR-R16-BOF-ICE; R-17 VV-A-SWB-STD is a projection-only fixture variant. Alignment is BLOCKED, not assumed.',
      ask: 'GPT-6/RP-07 to declare the variant alignment relationship or keep them separate.'
    },
    {
      decisionId: 'D-R27-02',
      status: 'PROPOSED_PENDING_GPT6',
      decision: 'Strict poseRun is STALE because R-23 revision 3 differs from snapshot revision 1. Only a DEMO motion view with a stale badge is exposed; hub is a candidate role marker, tie rod is required but deferred.',
      ask: 'R-28 to publish a run bound to the snapshot revision; GPT-6 to confirm the hub role-pose policy.'
    },
    {
      decisionId: 'D-R27-03',
      status: 'PROPOSED_PENDING_GPT6',
      decision: 'All 278 engineering instances remain NO_GEOMETRY; all 37 canonical frames remain UNANCHORED_UNKNOWN. Only projection frames carry DEMO numeric origins.',
      ask: 'RP-07 to supply sourced frame anchors and geometry before production rendering.'
    },
    {
      decisionId: 'D-R27-04',
      status: 'PROPOSED_PENDING_GPT6',
      decision: 'PI-* is the only canonical selection key. INST-*/ASM-* are projection aliases and never selection keys. R-21 maps 13/278; the other 265 remain canonical-only.',
      ask: 'R-17 contract and workbench consumers to accept the PI-* primary key.'
    },
    {
      decisionId: 'D-R27-05',
      status: 'PROPOSED_PENDING_GPT6',
      decision: 'Quantity is derived by counting physical PI instances; qtyPerCorner is not multiplied. All 12 declared qty conflicts remain OPEN.',
      ask: 'GPT-6 to adopt this quantity policy in D-04.'
    },
    {
      decisionId: 'D-R27-06',
      status: 'PROPOSED_PENDING_GPT6',
      decision: 'R-21 placeholder flags, name drift, parent drift and frame granularity differences are preserved; no RP-01 name or parent is rewritten.',
      ask: 'GPT-6 to adjudicate placeholders and parent-level rules.'
    },
    {
      decisionId: 'D-R27-07',
      status: 'PROPOSED_PENDING_GPT6',
      decision: 'No source-grade promotion. R-16 external refs stay UNVERIFIED_REFERENCE; DEMO assets stay DEMO_SUBSTITUTE; forged sources fail closed.',
      ask: 'GPT-6 to establish the evidence registry and OEM verification workflow.'
    },
    {
      decisionId: 'D-R27-08',
      status: 'PROPOSED_PENDING_GPT6',
      decision: 'R-26 output is missing; R-27 preserves all R-21/R-22 conflicts instead of auto-resolving them.',
      ask: 'Qwen4 R-26 to publish the conflict decision matrix; then R-27 can incorporate it.'
    },
    {
      decisionId: 'D-R27-09',
      status: 'PROPOSED_PENDING_GPT6',
      decision: 'This snapshot is read-only for Composer R-29; no production workbench file is modified by R-27.',
      ask: 'Composer R-29 to consume the snapshot behind a feature flag and report unsupported fields.'
    }
  ];

  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA,
    snapshotId: 'SNAP-R27-R16-R21-R22-R23-01',
    projectId: vp.projectId,
    revision: snapshotRevision,
    status: 'CANDIDATE_NOT_FROZEN',
    readOnly: true,
    generatedAt: '2026-11-15',
    purpose: 'Single read-only engineering snapshot for the 5173 workbench: 278 R-16 candidate instances, explicit NO_GEOMETRY, blocked variant alignment, and a stale/demo-only pose projection.',
    inputs: inputRecords(inputs),
    r26: {
      status: inputs.r26.status,
      artifacts: inputs.r26.artifacts,
      decisionPolicy: 'MISSING_OUTPUT_PRESERVE_ALL_CONFLICTS'
    },
    variant: {
      variantId: inputs.r16.variant.id,
      status: inputs.r16.variant.status,
      generation: 'GEN1',
      alignmentStatus: 'BLOCKED_PENDING_ADJUDICATION',
      sameVehicleClaim: false,
      projectionVariantId: inputs.r17Fixture.variant.variantId,
      projectionProjectId: inputs.r17Fixture.projectId,
      generationAgrees: true,
      r16ChoiceGroups: Object.keys(inputs.r16.variant.choiceGroups),
      r17ChoiceGroups: Object.keys(inputs.r17Fixture.variant.moduleSelections || {}),
      blockedActions: ['CLAIM_SAME_VEHICLE', 'FREEZE_VARIANT', 'USE_PROJECTION_AS_PRODUCTION']
    },
    counts: {},
    tree: {
      systems,
      assemblyDefinitions,
      assemblyInstances,
      partDefinitions,
      partInstances,
      references: vp.references.map((reference) => ({
        refId: reference.refId,
        parentNodeId: reference.parentNodeId,
        canonicalRef: reference.canonicalRef,
        countedInBom: false,
        bom: false
      })),
      mountFrames: frames
    },
    indexes: null,
    workbenchTree: null,
    geometry: null,
    qty,
    bindingMatrix,
    poseRun,
    demoMotionView,
    conflictRegister,
    conflictSourceCounts: {
      'R-21': inputs.r21.conflicts.length,
      'R-22': inputs.r22.conflicts.length,
      'R-27': 5
    },
    sourceCoverage: {
      r16: {
        systems: inputs.r16.systemView?.length ?? inputs.r16.systems.length,
        subsystems: inputs.r16.subsystems.length,
        assemblyDefinitions: inputs.r16.assemblies.length,
        assemblyInstances: inputs.r16.assemblyInstances.length,
        partDefinitions: inputs.r16.partDefinitions.length,
        partInstances: inputs.r16.partInstances.length,
        mountFrames: inputs.r16.mountFrames.length,
        references: inputs.r16.references.length
      },
      r17: {
        systems: inputs.r17Fixture.systems.length,
        partInstances: inputs.r17Fixture.partInstances.length,
        frames: inputs.r17Fixture.frames.length
      },
      r21: {
        mappedPartInstances: inputs.r21.partInstanceMapping.filter((row) => row.r16InstanceId).length,
        unmappedPartInstances: inputs.r21.unmapped.r16OnlyPartInstancesCount,
        conflicts: inputs.r21.conflicts.length
      },
      r22: { conflicts: inputs.r22.conflicts.length, partInstances: inputs.r22.coverage.r16.partInstances },
      r23: { frames: inputs.r23.frames.length, roles: ROLES.length, runRevision: inputs.r23.simulationRun.inputRevision },
      r25: { demoCadBindings: Object.keys(inputs.knownCad).length },
      r26: { status: inputs.r26.status, artifacts: inputs.r26.artifacts.length }
    },
    decisions,
    sourceRegistry,
    consumerContract: {
      readOnly: true,
      canonicalSelectionKey: 'partInstanceId',
      canonicalPartDefinitionKey: 'partDefinitionId',
      aliasPolicy: {
        r17PartInstance: 'INST-*',
        r17AssemblyInstance: 'ASM-*',
        aliasesAreNotCanonical: true,
        requireExplicitProjectionField: true
      },
      entrypoint: SNAPSHOT_PATH,
      consumerIndex: CONSUMER_INDEX_PATH,
      treeSource: 'workbenchTree',
      indexSource: 'indexes',
      badges: {
        noGeometry: 'NO_GEOMETRY',
        demoCad: 'DEMO_SUBSTITUTE',
        demoPose: 'DEMO_ONLY_STALE_SOURCE_REV_3',
        variant: 'VARIANT_NOT_ALIGNED',
        requiredDeferred: 'REQUIRED_NOT_INSTANTIATED',
        placeholderAssembly: 'PLACEHOLDER_ASSEMBLY'
      },
      posePlayback: {
        strict: 'DISABLED_STALE',
        demo: 'DEMO_MODE_ONLY_WITH_BADGE',
        frameId: 'FR-VEHICLE',
        units: 'm',
        up: 'Y'
      },
      forbidden: [
        'USE_INST_OR_ASM_AS_CANONICAL_SELECTION_KEY',
        'CLONE_DEMO_GLB_TO_278_INSTANCES',
        'FABRICATE_MESH_FOR_NO_GEOMETRY',
        'PLAY_STALE_RUN_AS_CURRENT',
        'PROMOTE_SOURCE_WITHOUT_ARTIFACT_AND_HASH',
        'REWRITE_RP01_NAMES_OR_PARENTS'
      ]
    },
    openDecisionsForGpt6: ['D-R22-01', 'D-R22-02', 'D-R22-03', 'D-R22-07', 'R21-CF-01', 'R21-CF-06', 'R21-CF-09', 'R27-CF-01', 'R27-CF-02', 'R27-CF-04']
  };
  snapshot.counts = computeCounts(snapshot);
  snapshot.workbenchTree = buildWorkbenchTree(snapshot);
  snapshot.indexes = buildIndexes(snapshot);
  snapshot.geometry = buildGeometry(inputs, snapshot, canonicalIds);
  snapshot.counts = computeCounts(snapshot);
  return snapshot;
}

export function computeCounts(snapshot) {
  const systems = snapshot.tree.systems;
  const partInstances = snapshot.tree.partInstances;
  const poseFrames = snapshot.demoMotionView?.frames || [];
  const rigidPartPoses = (snapshot.demoMotionView?.frames?.[0]?.poses || []).filter((pose) => pose.attachTo === 'PART' && pose.published).length;
  const candidateRolePoses = (snapshot.demoMotionView?.frames?.[0]?.poses || []).filter((pose) => pose.attachTo === 'ROLE_MARKER' && pose.published).length;
  const unboundRequiredRoles = (snapshot.demoMotionView?.frames?.[0]?.poses || []).filter((pose) => pose.attachTo === 'NONE' && !pose.published).length;
  return {
    systems: systems.filter((system) => system.level === 'SYSTEM').length,
    subsystems: systems.filter((system) => system.level === 'SUBSYSTEM').length,
    assemblyDefinitions: snapshot.tree.assemblyDefinitions.length,
    assemblyInstances: snapshot.tree.assemblyInstances.length,
    partDefinitions: snapshot.tree.partDefinitions.length,
    partInstances: partInstances.length,
    mountFrames: snapshot.tree.mountFrames.canonical.length,
    projectionFrames: snapshot.tree.mountFrames.projection.length,
    references: snapshot.tree.references.length,
    bomLines: snapshot.qty.bomLines,
    noGeometryInstances: partInstances.filter((instance) => instance.geometryStatus === 'NO_GEOMETRY').length,
    sourcedGeometryInstances: partInstances.filter((instance) => instance.geometryStatus === 'SOURCED').length,
    demoCadBindings: snapshot.geometry?.demoCadBindingCount ?? 0,
    crosswalkMappedInstances: partInstances.filter((instance) => instance.projection).length,
    crosswalkUnmappedInstances: partInstances.filter((instance) => !instance.projection).length,
    qtyConflicts: snapshot.qty.conflicts.length,
    conflictRegister: snapshot.conflictRegister.length,
    decisions: snapshot.decisions.length,
    poseRunCurrentFrames: snapshot.poseRun.frames.length,
    demoMotionFrames: poseFrames.length,
    rigidPartPoseBindings: rigidPartPoses,
    candidateRoleBindings: candidateRolePoses,
    unboundRequiredRoles
  };
}

export function verifyInputHashes(snapshot, root = DEFAULT_ROOT) {
  const errors = [];
  for (const input of snapshot.inputs || []) {
    if (!input.sha256) continue;
    try {
      const actual = sha256File(root, input.path);
      if (actual !== input.sha256) errors.push({ code: 'SNAP-E-INPUT-HASH', objectId: input.role, rule: 'sha256 matches live file', source: 'inputs', message: `${input.path}: ${actual} != ${input.sha256}` });
    } catch (error) {
      errors.push({ code: 'SNAP-E-INPUT-HASH', objectId: input.role, rule: 'input readable', source: 'inputs', message: error.message });
    }
  }
  return { ok: errors.length === 0, errors };
}

export function consumePoseRun(snapshot, request = {}) {
  if (!Number.isInteger(request.revision)) return { status: 'BLOCKED', reason: 'REVISION_REQUIRED', playbackAllowed: false };
  if (request.frameId && request.frameId !== snapshot.poseRun.frameId) return { status: 'BLOCKED', reason: 'FRAME_MISMATCH', playbackAllowed: false, expectedFrameId: snapshot.poseRun.frameId };
  if (request.revision !== snapshot.revision) return { status: 'STALE', reason: 'CONSUMER_REVISION_MISMATCH', playbackAllowed: false, consumerRevision: request.revision, snapshotRevision: snapshot.revision };
  if (snapshot.poseRun.status === 'CURRENT' && snapshot.poseRun.playbackAllowed === true) {
    return { status: 'CURRENT', playbackAllowed: true, frames: snapshot.poseRun.frames, revision: snapshot.revision };
  }
  return {
    status: 'STALE',
    reason: 'SOURCE_REVISION_MISMATCH',
    playbackAllowed: false,
    sourceRevision: snapshot.poseRun.sourceRevision,
    snapshotRevision: snapshot.revision,
    demoViewAvailable: snapshot.demoMotionView.status === 'DEMO_ONLY',
    demoBadge: snapshot.demoMotionView.badge
  };
}

export function validateSnapshot(snapshot) {
  const errors = [];
  const warnings = [];
  const e = (code, objectId, rule, source, message) => errors.push({ code, objectId, rule, source, message });
  const w = (code, objectId, rule, source, message) => warnings.push({ code, objectId, rule, source, message });
  const unique = (items, key, source) => {
    const seen = new Map();
    for (const item of items || []) {
      const id = item?.[key];
      if (!id) { e('SNAP-E-ID-MISSING', null, `${source}.${key}`, source, 'missing id'); continue; }
      if (seen.has(id)) e('SNAP-E-DUP-PI', id, `${source}.${key} unique`, source, `duplicate ${id}`);
      seen.set(id, item);
    }
    return seen;
  };
  if (!snapshot || snapshot.schemaVersion !== SNAPSHOT_SCHEMA) e('SNAP-E-SCHEMA', null, 'schemaVersion', 'snapshot', `expected ${SNAPSHOT_SCHEMA}`);
  if (snapshot.status !== 'CANDIDATE_NOT_FROZEN' || snapshot.readOnly !== true) e('SNAP-E-STATUS', null, 'CANDIDATE_NOT_FROZEN/readOnly', 'snapshot', 'status');
  for (const input of snapshot.inputs || []) {
    if (!input.path || !/^[0-9a-f]{64}$/.test(input.sha256 || '')) e('SNAP-E-INPUT', input.role, 'path/sha256', 'inputs', 'bad pin');
  }
  if (!Array.isArray(snapshot.inputs) || snapshot.inputs.length < 6) e('SNAP-E-INPUT', null, '>=6 inputs', 'inputs', 'missing inputs');

  const systemIds = unique(snapshot.tree.systems, 'systemId', 'tree.systems');
  const assemblyDefIds = unique(snapshot.tree.assemblyDefinitions, 'assemblyDefinitionId', 'tree.assemblyDefinitions');
  const assemblyInstanceIds = unique(snapshot.tree.assemblyInstances, 'assemblyInstanceId', 'tree.assemblyInstances');
  const partDefIds = unique(snapshot.tree.partDefinitions, 'partDefinitionId', 'tree.partDefinitions');
  const partInstanceIds = unique(snapshot.tree.partInstances, 'partInstanceId', 'tree.partInstances');
  unique(snapshot.tree.mountFrames.canonical, 'frameId', 'tree.mountFrames.canonical');
  unique(snapshot.tree.mountFrames.projection, 'frameId', 'tree.mountFrames.projection');
  unique(snapshot.tree.references, 'refId', 'tree.references');
  unique(snapshot.bindingMatrix, 'role', 'bindingMatrix');
  unique(snapshot.conflictRegister, 'registerId', 'conflictRegister');
  unique(snapshot.decisions, 'decisionId', 'decisions');
  if (systemIds.size === 0 || assemblyDefIds.size === 0 || assemblyInstanceIds.size === 0 || partDefIds.size === 0 || partInstanceIds.size === 0) e('SNAP-E-EMPTY', null, 'non-empty tree', 'tree', 'empty');

  for (const system of snapshot.tree.systems) {
    if (system.parentSystemId && !systemIds.has(system.parentSystemId)) e('SNAP-E-REF', system.systemId, 'parentSystemId', 'systems', `missing ${system.parentSystemId}`);
  }
  for (const assembly of snapshot.tree.assemblyInstances) {
    if (!assemblyDefIds.has(assembly.definitionRef)) e('SNAP-E-REF', assembly.assemblyInstanceId, 'definitionRef', 'assemblyInstances', `missing ${assembly.definitionRef}`);
    if (!systemIds.has(assembly.systemId)) e('SNAP-E-REF', assembly.assemblyInstanceId, 'systemId', 'assemblyInstances', `missing ${assembly.systemId}`);
    if (!snapshot.tree.mountFrames.canonical.some((frame) => frame.frameId === assembly.frameId)) e('SNAP-E-REF', assembly.assemblyInstanceId, 'frameId', 'assemblyInstances', `missing ${assembly.frameId}`);
  }
  for (const part of snapshot.tree.partInstances) {
    if (!part.partInstanceId?.startsWith('PI-')) e('SNAP-E-ALIAS', part.partInstanceId, 'canonical PI-*', 'partInstances', 'alias used as canonical');
    if (!partDefIds.has(part.partId)) e('SNAP-E-REF', part.partInstanceId, 'partId', 'partInstances', `missing ${part.partId}`);
    if (!assemblyInstanceIds.has(part.assemblyInstanceId)) e('SNAP-E-REF', part.partInstanceId, 'assemblyInstanceId', 'partInstances', `missing ${part.assemblyInstanceId}`);
    if (!snapshot.tree.mountFrames.canonical.some((frame) => frame.frameId === part.frameId)) e('SNAP-E-REF', part.partInstanceId, 'frameId', 'partInstances', `missing ${part.frameId}`);
    if (part.quantity?.perAssembly !== 1 || part.qtySemantics !== 'ONE_PHYSICAL_PIECE_PER_INSTANCE') e('SNAP-E-QTY-DOUBLE', part.partInstanceId, 'one physical piece per PI', 'partInstances', 'quantity semantics');
    if (part.geometryStatus !== 'NO_GEOMETRY' || part.glb != null || part.mesh != null || part.assetId != null) e('SNAP-E-GEOMETRY', part.partInstanceId, 'NO_GEOMETRY', 'partInstances', 'fabricated geometry');
    if (part.projection && !part.projection.r17PartInstanceId?.startsWith('INST-')) e('SNAP-E-ALIAS', part.partInstanceId, 'projection alias INST-*', 'partInstances', 'bad alias');
  }
  for (const frame of snapshot.tree.mountFrames.canonical) {
    if (frame.anchorStatus !== 'UNANCHORED_UNKNOWN' || frame.origin !== null || frame.rotation !== null || frame.units !== null) e('SNAP-E-FRAME', frame.frameId, 'canonical frame unanchored', 'frames.canonical', 'invented anchor');
  }
  for (const frame of snapshot.tree.mountFrames.projection) {
    if (frame.notCanonical !== true || frame.valueBasis !== 'DEMO_ASSUMPTION') e('SNAP-E-FRAME', frame.frameId, 'projection demo-only', 'frames.projection', 'projection frame treated as canonical');
    if (frame.hasNonZeroNumericOrigin && frame.numericOriginUnverified !== true) e('SNAP-E-FRAME', frame.frameId, 'numeric origin unverified', 'frames.projection', 'numeric origin unlabelled');
  }
  const nonzeroIncluded = snapshot.tree.mountFrames.projection.filter((frame) => frame.hasNonZeroNumericOrigin).length;
  const projectionScope = snapshot.tree.mountFrames.projectionScope;
  if (snapshot.tree.mountFrames.projectionNonZeroOriginCount !== nonzeroIncluded) e('SNAP-E-FRAME', null, 'nonzero origin count reproducible', 'frames.projection', 'stale count');
  if (!projectionScope || projectionScope.framesIncluded !== snapshot.tree.mountFrames.projection.length || projectionScope.framesNotIncluded !== projectionScope.r21TotalProjectionFrames - projectionScope.framesIncluded || projectionScope.nonzeroOriginFramesIncluded !== nonzeroIncluded) {
    e('SNAP-E-FRAME', null, 'projection frame scope declared', 'frames.projectionScope', 'scope mismatch');
  }
  if (snapshot.tree.references.length !== 35) e('SNAP-E-REF', null, '35 references preserved', 'tree.references', String(snapshot.tree.references.length));
  for (const reference of snapshot.tree.references) {
    if (reference.countedInBom !== false || reference.bom === true) e('SNAP-E-REF', reference.refId, 'REF not BOM', 'tree.references', 'reference counted as BOM');
  }

  const variant = snapshot.variant;
  if (variant.alignmentStatus !== 'BLOCKED_PENDING_ADJUDICATION' || variant.sameVehicleClaim !== false) e('SNAP-E-VARIANT', variant.variantId, 'variant alignment BLOCKED', 'variant', 'variant assumed aligned');
  if (variant.projectionVariantId === variant.variantId) e('SNAP-E-VARIANT', variant.variantId, 'different projection variant', 'variant', 'same id without evidence');

  const qty = snapshot.qty;
  if (qty.policy !== 'ONE_PHYSICAL_PIECE_PER_INSTANCE') e('SNAP-E-QTY-DOUBLE', null, 'qty policy', 'qty', 'wrong policy');
  const recomputed = {};
  for (const part of snapshot.tree.partInstances) recomputed[part.partId] = (recomputed[part.partId] || 0) + 1;
  const derived = snapshot.tree.partDefinitions.filter((definition) => recomputed[definition.partDefinitionId] != null && recomputed[definition.partDefinitionId] !== definition.qtyVehicleTotalInherited).map((definition) => definition.partDefinitionId).sort();
  if (JSON.stringify(derived) !== JSON.stringify(qty.derivedMismatchIds)) e('SNAP-E-QTY-AUDIT', null, 'derived mismatches reproducible', 'qty', 'stale qty audit');
  if (qty.auditStatus !== 'CONSISTENT') e('SNAP-E-QTY-AUDIT', null, 'audit CONSISTENT', 'qty', qty.auditStatus);
  if (qty.doubleCountExample?.naiveSumOfQtyPerCorner === qty.doubleCountExample?.correctTotal) e('SNAP-E-QTY-DOUBLE', 'PART-30-009', 'double-count example present', 'qty', 'example lost');
  if (qty.conflicts.length !== qty.declaredConflictIds.length) e('SNAP-E-QTY-AUDIT', null, 'declared conflicts preserved', 'qty', `${qty.conflicts.length} != ${qty.declaredConflictIds.length}`);
  if (qty.derivedByMultiplyingQtyPerCorner === true) e('SNAP-E-QTY-DOUBLE', null, 'no qtyPerCorner multiplication', 'qty', 'flag');

  if (!Array.isArray(snapshot.bindingMatrix) || snapshot.bindingMatrix.length !== 5) e('SNAP-E-POSE-UNBOUND', null, '5 roles', 'bindingMatrix', 'missing roles');
  for (const row of snapshot.bindingMatrix) {
    if (row.r27.targetInstanceId && !partInstanceIds.has(row.r27.targetInstanceId)) e('SNAP-E-REF', row.role, 'target PI exists', 'bindingMatrix', `missing ${row.r27.targetInstanceId}`);
    if (row.r27.published && !row.r27.targetInstanceId) e('SNAP-E-POSE-UNBOUND', row.role, 'published pose has target', 'bindingMatrix', 'null target published');
    if (row.r27.bindingStatus === 'BOUND_RIGID_PART' && row.r27.attachTo !== 'PART') e('SNAP-E-POSE-UNBOUND', row.role, 'rigid part attachTo PART', 'bindingMatrix', row.r27.attachTo);
  }
  const rigidCount = snapshot.bindingMatrix.filter((row) => row.r27.bindingStatus === 'BOUND_RIGID_PART').length;
  const roleCount = snapshot.bindingMatrix.filter((row) => row.r27.bindingStatus === 'CANDIDATE_ROLE_BINDING').length;
  const deferredCount = snapshot.bindingMatrix.filter((row) => row.r27.bindingStatus === 'REQUIRED_DEFERRED_NO_INSTANCE').length;
  if (rigidCount !== 3 || roleCount !== 1 || deferredCount !== 1) e('SNAP-E-POSE-UNBOUND', null, '3 rigid + 1 role + 1 required deferred', 'bindingMatrix', `${rigidCount}/${roleCount}/${deferredCount}`);

  const poseRun = snapshot.poseRun;
  const revisionMismatch = poseRun.sourceRevision !== poseRun.snapshotRevision;
  if (poseRun.revisionMismatch !== revisionMismatch) e('SNAP-E-RUN-STALE', poseRun.runId, 'revisionMismatch flag', 'poseRun', 'flag does not match revisions');
  if (revisionMismatch) {
    if (poseRun.status !== 'STALE' || poseRun.playbackAllowed !== false || poseRun.frames.length !== 0) e('SNAP-E-RUN-STALE', poseRun.runId, 'mismatched run must be STALE and empty', 'poseRun', 'stale run publishes frames');
  } else {
    if (poseRun.status !== 'CURRENT' || poseRun.playbackAllowed !== true) e('SNAP-E-RUN-STALE', poseRun.runId, 'matched run may be CURRENT', 'poseRun', 'matched run not current');
    if (poseRun.frames.length !== 9) e('SNAP-E-RUN-STALE', poseRun.runId, 'matched run publishes 9 frames', 'poseRun', String(poseRun.frames.length));
    for (const frame of poseRun.frames) {
      if (frame.poses.length !== 3) e('SNAP-E-POSE-UNBOUND', frame.frameIndex, '3 rigid part poses', 'poseRun.frames', String(frame.poses.length));
      for (const pose of frame.poses) {
        if (!partInstanceIds.has(pose.instanceId)) e('SNAP-E-POSE-UNBOUND', pose.instanceId, 'strict pose target exists', 'poseRun.frames', 'missing');
        if (!isMat4(pose.matrixWorld) || pose.scale.some((value) => value !== 1)) e('SNAP-E-DISPLAY', pose.instanceId, 'rigid strict pose', 'poseRun.frames', 'bad matrix/scale');
      }
    }
  }
  if (poseRun.sourceFrameCount !== 9 || poseRun.sourceFrameIndex.length !== 9) e('SNAP-E-RUN-STALE', poseRun.runId, '9 source frames', 'poseRun', 'frame count');

  const demo = snapshot.demoMotionView;
  if (demo.status !== 'DEMO_ONLY' || demo.requiresDemoMode !== true || demo.publishAsCurrent !== false || (revisionMismatch && !demo.badge.includes('STALE'))) e('SNAP-E-RUN-STALE', demo.sourceRunId, 'demo-only stale badge', 'demoMotionView', 'demo claimed current');
  if (demo.frames.length !== 9) e('SNAP-E-RUN-STALE', null, '9 demo frames', 'demoMotionView', String(demo.frames.length));
  for (const frame of demo.frames) {
    if (frame.poses.length !== 5) e('SNAP-E-POSE-UNBOUND', frame.frameIndex, '5 role poses', 'demoMotionView', String(frame.poses.length));
    const partPoses = frame.poses.filter((pose) => pose.attachTo === 'PART');
    const markers = frame.poses.filter((pose) => pose.attachTo === 'ROLE_MARKER');
    const none = frame.poses.filter((pose) => pose.attachTo === 'NONE');
    if (partPoses.length !== 3 || markers.length !== 1 || none.length !== 1) e('SNAP-E-POSE-UNBOUND', frame.frameIndex, '3 PART + 1 ROLE + 1 NONE', 'demoMotionView', `${partPoses.length}/${markers.length}/${none.length}`);
    for (const pose of frame.poses) {
      if (!pose.published) {
        if (pose.instanceId !== null || pose.matrixWorld !== null) e('SNAP-E-POSE-UNBOUND', pose.role, 'unpublished pose has no matrix', 'demoMotionView', 'published null pose');
        continue;
      }
      if (!pose.instanceId || !partInstanceIds.has(pose.instanceId)) e('SNAP-E-POSE-UNBOUND', pose.role, 'published pose target', 'demoMotionView', `${pose.instanceId}`);
      if (!isNum3(pose.positionM) || !Array.isArray(pose.quaternionXYZW) || pose.quaternionXYZW.length !== 4 || Math.abs(Math.hypot(...pose.quaternionXYZW) - 1) > 1e-6) e('SNAP-E-UNIT', pose.role, 'pose position/quaternion', 'demoMotionView', 'bad pose');
      if (!Array.isArray(pose.scale) || pose.scale.some((value) => value !== 1)) e('SNAP-E-DISPLAY', pose.role, 'scale=[1,1,1]', 'demoMotionView', JSON.stringify(pose.scale));
      if (!isMat4(pose.matrixWorld) || pose.matrixWorld[3].some((value, index) => value !== (index === 3 ? 1 : 0))) e('SNAP-E-DISPLAY', pose.role, '4x4 affine matrix', 'demoMotionView', 'bad matrix');
      else {
        const rotation = [pose.matrixWorld[0].slice(0, 3), pose.matrixWorld[1].slice(0, 3), pose.matrixWorld[2].slice(0, 3)];
        if (Math.abs(det3(rotation) + 1) < 1e-9) e('SNAP-E-DISPLAY', pose.role, 'det=+1', 'demoMotionView', 'reflected matrix');
        else if (Math.abs(det3(rotation) - 1) > 1e-6) e('SNAP-E-DISPLAY', pose.role, 'rigid matrix', 'demoMotionView', 'not rigid');
        for (let column = 0; column < 3; column++) {
          if (Math.abs(Math.hypot(rotation[0][column], rotation[1][column], rotation[2][column]) - 1) > 1e-6) e('SNAP-E-DISPLAY', pose.role, 'unit column', 'demoMotionView', 'scaled matrix');
        }
        if (Math.abs(pose.matrixWorld[0][3] - pose.positionM[0]) > 1e-9 || Math.abs(pose.matrixWorld[1][3] - pose.positionM[1]) > 1e-9 || Math.abs(pose.matrixWorld[2][3] - pose.positionM[2]) > 1e-9) e('SNAP-E-DISPLAY', pose.role, 'translation matches pose', 'demoMotionView', 'mismatch');
      }
    }
  }

  if (snapshot.geometry.noGeometryInstances !== snapshot.tree.partInstances.length) e('SNAP-E-GEOMETRY', null, 'all instances NO_GEOMETRY', 'geometry', 'count mismatch');
  if (snapshot.geometry.demoCadBindings.length > 1) e('SNAP-E-CAD-BULK', null, 'at most 1 demo CAD binding', 'geometry', String(snapshot.geometry.demoCadBindings.length));
  for (const binding of snapshot.geometry.demoCadBindings) {
    if (binding.mappingStatus !== 'DEMO_SUBSTITUTE' || binding.copyToOtherInstances !== false) e('SNAP-E-CAD-BULK', binding.instanceId, 'single demo substitute', 'geometry', 'bulk CAD binding');
    if (!partInstanceIds.has(binding.instanceId)) e('SNAP-E-REF', binding.instanceId, 'demo CAD target exists', 'geometry', 'missing instance');
  }

  const r21Count = snapshot.conflictRegister.filter((conflict) => conflict.source === 'R-21').length;
  const r22Count = snapshot.conflictRegister.filter((conflict) => conflict.source === 'R-22').length;
  const r27Count = snapshot.conflictRegister.filter((conflict) => conflict.source === 'R-27').length;
  if (r21Count !== snapshot.conflictSourceCounts['R-21'] || r22Count !== snapshot.conflictSourceCounts['R-22'] || r27Count !== snapshot.conflictSourceCounts['R-27']) {
    e('SNAP-E-CONFLICT', null, 'conflict source counts preserved', 'conflictRegister', `${r21Count}/${r22Count}/${r27Count} vs ${JSON.stringify(snapshot.conflictSourceCounts)}`);
  }
  const decisionIds = new Set(snapshot.decisions.map((decision) => decision.decisionId));
  for (const conflict of snapshot.conflictRegister) {
    if (!['OPEN', 'MITIGATED', 'BLOCKED'].includes(conflict.status)) e('SNAP-E-CONFLICT', conflict.registerId, 'conflict status', 'conflictRegister', conflict.status);
    if (!conflict.decisionRef || !decisionIds.has(conflict.decisionRef)) e('SNAP-E-CONFLICT', conflict.registerId, 'decisionRef exists', 'conflictRegister', `missing ${conflict.decisionRef}`);
  }
  if (snapshot.r26.decisionPolicy !== 'MISSING_OUTPUT_PRESERVE_ALL_CONFLICTS') e('SNAP-E-R26', null, 'R-26 missing policy', 'r26', 'auto-resolved without R-26');
  if (snapshot.r26.artifacts.length > 0 && snapshot.r26.decisionPolicy === 'MISSING_OUTPUT_PRESERVE_ALL_CONFLICTS') e('SNAP-E-R26', null, 'R-26 output must be consumed', 'r26', 'output exists but ignored');

  if (snapshot.consumerContract.canonicalSelectionKey !== 'partInstanceId') e('SNAP-E-CONTRACT', null, 'canonical selection key', 'consumerContract', 'alias used as primary');
  for (const rule of ['USE_INST_OR_ASM_AS_CANONICAL_SELECTION_KEY', 'CLONE_DEMO_GLB_TO_278_INSTANCES', 'FABRICATE_MESH_FOR_NO_GEOMETRY', 'PLAY_STALE_RUN_AS_CURRENT']) {
    if (!snapshot.consumerContract.forbidden.includes(rule)) e('SNAP-E-CONTRACT', null, 'forbidden rule', 'consumerContract', `missing ${rule}`);
  }

  for (const source of snapshot.sourceRegistry.artifacts || []) {
    if (source.grade === 'SOURCED' && (source.verificationStatus !== 'HASH_VERIFIED' || !/^[0-9a-f]{64}$/.test(source.sha256 || ''))) e('SNAP-E-SOURCE', source.sourceId, 'SOURCED requires hash-verified artifact', 'sourceRegistry', 'forged/source upgrade');
  }

  const tree = snapshot.workbenchTree;
  if (!tree || tree.systems.length !== 13) e('SNAP-E-TREE', null, '13 top-level systems', 'workbenchTree', String(tree?.systems?.length));
  else {
    const indexed = tree.assemblyInstances.flatMap((assembly) => assembly.partInstanceIds);
    if (indexed.length !== 278 || new Set(indexed).size !== 278) e('SNAP-E-TREE', null, '278 unique part instances in tree', 'workbenchTree', String(indexed.length));
    if (tree.assemblyInstances.length !== 37) e('SNAP-E-TREE', null, '37 assembly instances in tree', 'workbenchTree', String(tree.assemblyInstances.length));
  }
  const indexCounts = {
    byPartInstanceId: Object.keys(snapshot.indexes?.byPartInstanceId || {}).length,
    byPartDefinitionId: Object.keys(snapshot.indexes?.byPartDefinitionId || {}).length,
    byAssemblyInstanceId: Object.keys(snapshot.indexes?.byAssemblyInstanceId || {}).length,
    bySystemId: Object.keys(snapshot.indexes?.bySystemId || {}).length
  };
  if (indexCounts.byPartInstanceId !== 278 || indexCounts.byPartDefinitionId !== 493 || indexCounts.byAssemblyInstanceId !== 37 || indexCounts.bySystemId !== 67) e('SNAP-E-TREE', null, 'index counts', 'indexes', JSON.stringify(indexCounts));

  const recomputedCounts = computeCounts(snapshot);
  if (JSON.stringify(recomputedCounts) !== JSON.stringify(snapshot.counts)) e('SNAP-E-COUNTS', null, 'counts reproducible', 'counts', 'stale counts');
  if (snapshot.counts.partInstances !== snapshot.tree.partInstances.length) e('SNAP-E-COUNTS', null, 'counts match arrays', 'counts', 'mismatch');
  const coverage = snapshot.sourceCoverage;
  for (const key of ['systems', 'subsystems', 'assemblyDefinitions', 'assemblyInstances', 'partDefinitions', 'partInstances', 'mountFrames', 'references']) {
    if (snapshot.counts[key] !== coverage.r16[key]) e('SNAP-E-COUNTS', key, 'source coverage preserved', 'sourceCoverage', `${snapshot.counts[key]} != ${coverage.r16[key]}`);
  }
  if (snapshot.counts.crosswalkMappedInstances !== coverage.r21.mappedPartInstances || snapshot.counts.crosswalkUnmappedInstances !== coverage.r21.unmappedPartInstances) {
    e('SNAP-E-COUNTS', null, 'R-21 crosswalk coverage preserved', 'sourceCoverage', `${snapshot.counts.crosswalkMappedInstances}/${snapshot.counts.crosswalkUnmappedInstances} vs ${coverage.r21.mappedPartInstances}/${coverage.r21.unmappedPartInstances}`);
  }
  if (coverage.r21.mappedPartInstances + coverage.r21.unmappedPartInstances !== coverage.r16.partInstances) e('SNAP-E-COUNTS', null, 'mapped + unmapped = 278', 'sourceCoverage', 'coverage arithmetic');
  const tieRod = snapshot.tree.partDefinitions.find((definition) => definition.partDefinitionId === 'PART-20-075');
  const bracket = snapshot.tree.partDefinitions.find((definition) => definition.partDefinitionId === 'PART-40-048');
  if (!tieRod?.requiredButDeferred || tieRod.requiredButDeferred.downstreamMustNotOmit !== true) e('SNAP-E-PART-DEFERRED', 'PART-20-075', 'required-but-deferred preserved', 'partDefinitions', 'missing required/deferred flag');
  if (!bracket?.variantDecision || bracket.variantDecision.status !== 'VARIANT_UNDECIDED') e('SNAP-E-VARIANT', 'PART-40-048', 'caliper variant decision UNDECIDED', 'partDefinitions', 'bracket presence assumed');
  const hubRow = snapshot.bindingMatrix.find((row) => row.role === 'HUB');
  if (!hubRow?.discrepancy || hubRow.discrepancy.code !== 'R27-DISC-HUB') e('SNAP-E-POSE-UNBOUND', 'HUB', 'hub discrepancy reported', 'bindingMatrix', 'R22/R23 hub disagreement hidden');

  return { ok: errors.length === 0, errors, warnings };
}

export function buildConsumerIndex(snapshot, snapshotJson) {
  return {
    schemaVersion: CONSUMER_SCHEMA,
    snapshotId: snapshot.snapshotId,
    snapshotPath: SNAPSHOT_PATH,
    snapshotSha256: sha256Text(snapshotJson),
    readOnly: true,
    status: snapshot.status,
    counts: snapshot.counts,
    entrypoints: {
      tree: 'workbenchTree',
      indexes: 'indexes',
      partInstances: 'tree.partInstances',
      partDefinitions: 'tree.partDefinitions',
      bindingMatrix: 'bindingMatrix',
      strictPoseRun: 'poseRun',
      demoMotionView: 'demoMotionView',
      consumerContract: 'consumerContract',
      conflicts: 'conflictRegister'
    },
    canonicalSelectionKey: snapshot.consumerContract.canonicalSelectionKey,
    aliases: snapshot.consumerContract.aliasPolicy,
    badges: snapshot.consumerContract.badges,
    posePlayback: snapshot.consumerContract.posePlayback,
    forbidden: snapshot.consumerContract.forbidden,
    requiredFields: {
      partInstance: ['partInstanceId', 'partId', 'assemblyInstanceId', 'frameId', 'corner', 'quantity', 'geometryStatus', 'evidenceInherited'],
      assemblyInstance: ['assemblyInstanceId', 'definitionRef', 'systemId', 'frameId', 'corner', 'geometryStatus'],
      demoPose: ['role', 'instanceId', 'bindingStatus', 'attachTo', 'published', 'positionM', 'quaternionXYZW', 'matrixWorld', 'geometryStatus']
    }
  };
}

export function summaryOf(snapshot, report, hashReport) {
  return {
    schemaVersion: snapshot.schemaVersion,
    snapshotId: snapshot.snapshotId,
    status: snapshot.status,
    validation: { ok: report.ok, errors: report.errors, warnings: report.warnings },
    inputHashes: { ok: hashReport.ok, errors: hashReport.errors },
    counts: snapshot.counts,
    variant: snapshot.variant,
    qty: {
      auditStatus: snapshot.qty.auditStatus,
      conflicts: snapshot.qty.conflicts.length,
      doubleCountExample: snapshot.qty.doubleCountExample
    },
    bindingMatrix: snapshot.bindingMatrix.map((row) => ({
      role: row.role,
      r21: row.r21.bindingStatus,
      r22: row.r22.bindingStatus,
      r23: row.r23.bindingStatus,
      r27: row.r27.bindingStatus,
      target: row.r27.targetInstanceId,
      attachTo: row.r27.attachTo,
      agreement: row.r27.agreement
    })),
    poseRun: {
      status: snapshot.poseRun.status,
      sourceRevision: snapshot.poseRun.sourceRevision,
      snapshotRevision: snapshot.poseRun.snapshotRevision,
      playbackAllowed: snapshot.poseRun.playbackAllowed,
      frames: snapshot.poseRun.frames.length,
      demoFrames: snapshot.demoMotionView.frames.length,
      demoBadge: snapshot.demoMotionView.badge
    },
    conflicts: snapshot.conflictRegister.length,
    decisions: snapshot.decisions.map((decision) => decision.decisionId),
    r26: snapshot.r26
  };
}

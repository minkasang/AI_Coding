/**
 * R-22 cross-model integration proposal.
 * Reads the candidate R-16 tree, the R-17 domain contract and the R-18 demo pose run.
 * It never invents geometry, hardpoints outside the fictional R-18 fixture, or a
 * second canonical identity for a part instance.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject, SCHEMA_VERSION as DOMAIN_SCHEMA_VERSION } from '../domain-contract-v1/domain.mjs';

export const SCHEMA_VERSION = 'carlab.vehicle-integration/0.1.0-proposal';
export const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = resolve(MODULE_DIR, '../..');

export const R16_PATH = 'docs/research/R-16-vehicle-skeleton.fixture.json';
export const R17_MODEL_PATH = 'src-experiments/domain-contract-v1/domain.mjs';
export const R17_FIXTURE_PATH = 'src-experiments/domain-contract-v1/fixtures/fl-wheel-end.json';
export const R18_PATH = 'src-experiments/mechanism-vertical-slice-v1/R-18-results.json';
export const KINEMATICS_FIXTURE_PATH = 'src-experiments/kinematics/fixture-demo.json';

const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const JOINT_TYPES = new Set(['FIXED', 'REVOLUTE', 'SPHERICAL', 'PRISMATIC', 'UNIVERSAL', 'CYLINDRICAL', 'GEAR', 'CONTACT', 'SPRING_DAMPER', 'BELT']);
const CONSTRAINT_TYPES = new Set(['DISTANCE', 'POINT_ON_LINE', 'PRESCRIBED_POSITION', 'POINT_ON_CIRCLE', 'OUTPUT', 'SET']);
const EVIDENCE_RANK = {
  OUT_OF_SCOPE: 0,
  UNKNOWN: 1,
  ASSUMPTION: 2,
  DEMO_ASSUMPTION: 3,
  ENGINEERING_INFERENCE: 4,
  EVIDENCE: 5,
  SOURCED_SECONDARY: 5,
  SOURCED: 6
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const isNum3 = (value) => Array.isArray(value) && value.length === 3 && value.every(isNum);
const isMat3 = (value) => Array.isArray(value) && value.length === 3 && value.every((row) => Array.isArray(row) && row.length === 3 && row.every(isNum));
const norm3 = (value) => Math.hypot(value[0], value[1], value[2]);
const normalize3 = (value) => {
  const length = norm3(value);
  if (!Number.isFinite(length) || length === 0) return null;
  return value.map((item) => item / length);
};
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
function quatToMat3(quaternion) {
  const [x, y, z, w] = quaternion;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]
  ];
}
const mat3ColumnNorm = (m, column) => Math.hypot(m[0][column], m[1][column], m[2][column]);
const rank = (value) => EVIDENCE_RANK[value] ?? 0;
const round = (value, digits = 6) => Number(value.toFixed(digits));

function readText(root, relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}
function readJson(root, relativePath) {
  return JSON.parse(readText(root, relativePath));
}
function sha256File(root, relativePath) {
  return createHash('sha256').update(readFileSync(join(root, relativePath))).digest('hex');
}

export function loadInputs(root = DEFAULT_ROOT) {
  return {
    r16: readJson(root, R16_PATH),
    r17Fixture: readJson(root, R17_FIXTURE_PATH),
    r18: readJson(root, R18_PATH),
    kinematics: readJson(root, KINEMATICS_FIXTURE_PATH),
    hashes: {
      [R16_PATH]: sha256File(root, R16_PATH),
      [R17_MODEL_PATH]: sha256File(root, R17_MODEL_PATH),
      [R17_FIXTURE_PATH]: sha256File(root, R17_FIXTURE_PATH),
      [R18_PATH]: sha256File(root, R18_PATH),
      [KINEMATICS_FIXTURE_PATH]: sha256File(root, KINEMATICS_FIXTURE_PATH)
    }
  };
}

function nodeIndex(r16) {
  const index = new Map();
  for (const key of ['systems', 'subsystems', 'assemblies', 'partFamilies', 'datums', 'partDefinitions', 'references']) {
    for (const node of r16[key]) index.set(node.id, node);
  }
  return index;
}
function ownerSystemId(id, index) {
  let current = index.get(id);
  const seen = new Set();
  while (current) {
    if (current.rp01Kind === 'system') return current.id;
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    current = current.parentId ? index.get(current.parentId) : null;
  }
  return null;
}
function cornerOfR17Instance(instance) {
  const match = /-(FL|FR|RL|RR)(?:-(\d+))?$/.exec(instance.instanceId);
  return match ? { corner: match[1], ordinal: match[2] ? Number(match[2]) : 1 } : { corner: null, ordinal: 1 };
}

function sourceEvidenceRecords(inputs) {
  return [
    {
      sourceId: 'SRC-R16-TREE',
      kind: 'PROJECT_ARTIFACT',
      grade: 'PROJECT_RESEARCH',
      path: R16_PATH,
      sha256: inputs.hashes[R16_PATH],
      supports: '13 systems / 53 subsystems / 108 assembly definitions / 493 part definitions / 278 part instances / 37 mount frames',
      limitations: 'candidate tree; zero sourced geometry; 278 instances valueBasis UNKNOWN'
    },
    {
      sourceId: 'SRC-R17-CONTRACT',
      kind: 'PROJECT_ARTIFACT',
      grade: 'PROPOSAL',
      path: R17_MODEL_PATH,
      sha256: inputs.hashes[R17_MODEL_PATH],
      supports: 'ProjectStore / validateProject / Frame / Joint / Constraint / SimulationRun semantics',
      limitations: 'proposal, not a frozen production schema; instanceId prefix currently INST-*'
    },
    {
      sourceId: 'SRC-R17-FIXTURE',
      kind: 'PROJECT_ARTIFACT',
      grade: 'PROPOSAL',
      path: R17_FIXTURE_PATH,
      sha256: inputs.hashes[R17_FIXTURE_PATH],
      supports: 'FL wheel-end fixture, 11 instances, 3 Joint, 6 Constraint/Output',
      limitations: 'fixture-local identity and frame origins; not an OEM assembly'
    },
    {
      sourceId: 'SRC-R18-DEMO',
      kind: 'FICTIONAL_FIXTURE',
      grade: 'DEMO_ASSUMPTION',
      path: R18_PATH,
      sha256: inputs.hashes[R18_PATH],
      supports: 'FL double-wishbone rigid poses, 9 travel samples, 11 checks',
      limitations: 'fictional hardpoints; no forces; CANDIDATE_NOT_FROZEN; not production kinematics'
    },
    {
      sourceId: 'SRC-KIN-FIXTURE',
      kind: 'FICTIONAL_FIXTURE',
      grade: 'DEMO_ASSUMPTION',
      path: KINEMATICS_FIXTURE_PATH,
      sha256: inputs.hashes[KINEMATICS_FIXTURE_PATH],
      supports: 'DEMO hardpoint values used by the R-18 slice',
      limitations: 'explicitly fictional; must not be presented as vehicle hardpoints'
    },
    {
      sourceId: 'SRC-R16-REF-S01',
      kind: 'INHERITED_REFERENCE',
      grade: 'UNVERIFIED_REFERENCE',
      path: `${R16_PATH}#sources[S01]`,
      supports: 'R-16 identity basis for PART-20-001 / PART-20-008',
      limitations: 'R-22 did not re-open the original source; no OEM drawing was verified'
    },
    {
      sourceId: 'SRC-R16-REF-S04',
      kind: 'INHERITED_REFERENCE',
      grade: 'UNVERIFIED_REFERENCE',
      path: `${R16_PATH}#sources[S04]`,
      supports: 'R-16 identity basis for PART-30-006',
      limitations: 'R-22 did not re-open the original source; no OEM drawing was verified'
    },
    {
      sourceId: 'SRC-R16-REF-S05',
      kind: 'INHERITED_REFERENCE',
      grade: 'UNVERIFIED_REFERENCE',
      path: `${R16_PATH}#sources[S05]`,
      supports: 'R-16 identity basis for PART-30-006',
      limitations: 'R-22 did not re-open the original source; no OEM drawing was verified'
    }
  ];
}

function deriveBomLines(partInstances) {
  const groups = new Map();
  for (const instance of partInstances) {
    const key = `${instance.assemblyInstanceId}|${instance.partId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(instance);
  }
  return [...groups.entries()].map(([key, instances]) => {
    const [assemblyInstanceId, partId] = key.split('|');
    return {
      bomLineId: `BOM-${assemblyInstanceId}-${partId}`,
      assemblyInstanceId,
      partRef: partId,
      qtyPerAssembly: instances.reduce((sum, instance) => sum + instance.quantity.perAssembly, 0),
      instanceIds: instances.map((instance) => instance.instanceId),
      qtyBasis: 'COUNT_OF_PHYSICAL_INSTANCES_PER_PARENT',
      inheritedVehicleQtyVisible: null
    };
  });
}

/**
 * R-16 stores the part-level quantity per corner on every ordinal instance.
 * Summing qtyPerCorner across ordinals double-counts (5 studs would become 25).
 * The integration treats every PI-* instance as one physical piece.
 */
export function computeQtyAudit(partDefinitions, partInstances, declaredConflicts) {
  const countByPart = new Map();
  for (const instance of partInstances) {
    countByPart.set(instance.partId, (countByPart.get(instance.partId) || 0) + 1);
  }
  const rows = [];
  for (const definition of partDefinitions) {
    const count = countByPart.get(definition.partId);
    if (count == null) continue;
    rows.push({
      partId: definition.partId,
      name: definition.name,
      inheritedVehicleTotal: definition.qtyVehicleTotalInherited,
      physicalInstanceCount: count,
      delta: count - definition.qtyVehicleTotalInherited,
      status: count === definition.qtyVehicleTotalInherited ? 'MATCH' : 'MISMATCH_OPEN'
    });
  }
  const derivedMismatchIds = rows.filter((row) => row.status === 'MISMATCH_OPEN').map((row) => row.partId).sort();
  const declaredConflictIds = [...new Set(declaredConflicts.map((item) => item.definitionId))].sort();
  const declared = new Set(declaredConflictIds);
  const derived = new Set(derivedMismatchIds);
  const unlistedMismatchIds = derivedMismatchIds.filter((id) => !declared.has(id));
  const declaredButMatchingIds = declaredConflictIds.filter((id) => !derived.has(id));
  return {
    partQtySemantics: 'R16 qtyPerCorner is a part-level per-corner quantity. Each PI-* instance is one physical piece; do not multiply by qtyPerCorner.',
    rows,
    derivedMismatchIds,
    declaredConflictIds,
    unlistedMismatchIds,
    declaredButMatchingIds,
    status: unlistedMismatchIds.length === 0 && declaredButMatchingIds.length === 0 ? 'CONSISTENT' : 'DIVERGED'
  };
}

function buildR17Crosswalk(r17Fixture, r16) {
  const candidates = new Map();
  for (const instance of r16.partInstances) {
    const key = `${instance.definitionId}|${instance.corner}`;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push(instance);
  }
  const definitions = new Map(r16.partDefinitions.map((definition) => [definition.id, definition]));
  const rows = r17Fixture.partInstances.map((fixtureInstance) => {
    const { corner, ordinal } = cornerOfR17Instance(fixtureInstance);
    const key = `${fixtureInstance.partId}|${corner}`;
    const group = (candidates.get(key) || []).slice().sort((a, b) => a.ordinal - b.ordinal);
    const match = group.find((item) => item.ordinal === ordinal) || (group.length === 1 ? group[0] : null);
    const definition = definitions.get(fixtureInstance.partId);
    if (!match) {
      return {
        r17InstanceId: fixtureInstance.instanceId,
        partId: fixtureInstance.partId,
        corner,
        ordinal,
        canonicalInstanceId: null,
        status: 'UNBOUND',
        reason: group.length === 0 ? 'R16_HAS_NO_INSTANCE' : 'R16_ORDINAL_AMBIGUOUS',
        r16DefinitionPolicy: definition?.instancePolicy ?? 'MISSING_DEFINITION',
        r16DefinitionStatus: definition?.valueBasis ?? 'UNKNOWN'
      };
    }
    return {
      r17InstanceId: fixtureInstance.instanceId,
      partId: fixtureInstance.partId,
      corner,
      ordinal: match.ordinal,
      canonicalInstanceId: match.instanceId,
      canonicalAssemblyInstanceId: match.assemblyInstanceId,
      canonicalMountFrameId: match.mountFrameId,
      status: 'BOUND',
      bindingBasis: group.length === 1 ? 'PART_AND_CORNER' : 'PART_AND_CORNER_AND_ORDINAL'
    };
  });
  return {
    contractSchemaVersion: r17Fixture.schemaVersion,
    bindingRule: 'R-16 PI-* is canonical. The R-17 fixture INST-* is a view-local alias, bound only through partId + corner + ordinal.',
    r17Scope: {
      systems: r17Fixture.systems.length,
      partInstances: r17Fixture.partInstances.length,
      joints: r17Fixture.joints.length,
      constraints: r17Fixture.constraints.length
    },
    rows,
    unbound: rows.filter((row) => row.status === 'UNBOUND')
  };
}

const R18_CROSSWALK = [
  { sourceInstanceId: 'INST-SLA-UPPER-ARM-FL', partId: 'PART-20-001', corner: 'FL', ordinal: 1 },
  { sourceInstanceId: 'INST-SLA-LOWER-ARM-FL', partId: 'PART-20-008', corner: 'FL', ordinal: 1 },
  { sourceInstanceId: 'INST-SLA-UPRIGHT-FL', partId: 'PART-20-016', corner: 'FL', ordinal: 1 },
  { sourceInstanceId: 'INST-SLA-TIEROD-FL', partId: 'PART-20-075', corner: 'FL', ordinal: 1 },
  { sourceInstanceId: 'INST-SLA-HUB-FL', partId: 'PART-30-006', corner: 'FL', ordinal: 1 }
];

function buildR18Bindings(r18, r16) {
  const instanceByTriple = new Map();
  for (const instance of r16.partInstances) {
    instanceByTriple.set(`${instance.definitionId}|${instance.corner}|${instance.ordinal}`, instance);
  }
  const definitions = new Map(r16.partDefinitions.map((definition) => [definition.id, definition]));
  const poseById = new Map(r18.designSample.instances.map((pose) => [pose.instanceId, pose]));
  const bindings = [];
  for (const item of R18_CROSSWALK) {
    const pose = poseById.get(item.sourceInstanceId);
    const definition = definitions.get(item.partId);
    const canonical = instanceByTriple.get(`${item.partId}|${item.corner}|${item.ordinal}`);
    const binding = {
      sourceInstanceId: item.sourceInstanceId,
      expectedPartId: item.partId,
      expectedCorner: item.corner,
      expectedOrdinal: item.ordinal,
      canonicalInstanceId: canonical?.instanceId ?? null,
      canonicalAssemblyInstanceId: canonical?.assemblyInstanceId ?? null,
      canonicalMountFrameId: canonical?.mountFrameId ?? null,
      bindingStatus: canonical ? 'BOUND' : 'UNBOUND',
      bindingBasis: canonical ? 'DECLARED_PART_CORNER_ORDINAL' : null,
      r16DefinitionId: item.partId,
      r16DefinitionPolicy: definition?.instancePolicy ?? 'MISSING_DEFINITION',
      r16DefinitionStatus: definition?.valueBasis ?? 'UNKNOWN'
    };
    if (!canonical) {
      binding.reason = definition?.instancePolicy === 'DEFERRED'
        ? 'R16_DEFINITION_DEFERRED_NO_INSTANCE'
        : 'NO_MATCHING_R16_INSTANCE';
    }
    if (!pose) {
      binding.bindingStatus = 'UNBOUND';
      binding.reason = 'R18_POSE_MISSING';
    }
    bindings.push(binding);
  }
  const knownSources = new Set(R18_CROSSWALK.map((item) => item.sourceInstanceId));
  for (const pose of r18.designSample.instances) {
    if (!knownSources.has(pose.instanceId)) {
      bindings.push({
        sourceInstanceId: pose.instanceId,
        canonicalInstanceId: null,
        bindingStatus: 'UNBOUND',
        reason: 'NO_DECLARED_CROSSWALK',
        r16DefinitionId: null
      });
    }
  }
  return {
    valueBasis: r18.valueBasis,
    provenance: r18.provenance,
    instanceIdStatus: r18.instanceIdStatus,
    bindings,
    posesById: poseById
  };
}

function poseRecord(binding, pose) {
  return {
    sourceInstanceId: binding.sourceInstanceId,
    instanceId: binding.canonicalInstanceId,
    bindingStatus: 'BOUND',
    bindingBasis: binding.bindingBasis,
    sourceAssemblyInstanceId: binding.canonicalAssemblyInstanceId,
    sourceMountFrameId: binding.canonicalMountFrameId,
    positionM: [...pose.position],
    quaternionXYZW: [...pose.quaternion],
    scale: [...pose.scale],
    closureErrorM: pose.closureErrorM ?? null,
    rigidLengthsM: pose.rigidLengthsM ? { ...pose.rigidLengthsM } : null,
    geometryStatus: 'NO_GEOMETRY',
    displayStatus: 'DEMO_FRAME_ONLY_MOUNT_FRAME_UNANCHORED',
    inspectable: false,
    evidence: {
      valueBasis: 'DEMO_ASSUMPTION',
      provenance: 'FICTIONAL_FIXTURE',
      instanceIdStatus: 'CANDIDATE_NOT_FROZEN'
    }
  };
}

function buildDeepSlice(r18, kinematics, r18Bindings) {
  const bound = r18Bindings.bindings.filter((binding) => binding.bindingStatus === 'BOUND');
  const bySource = new Map(bound.map((binding) => [binding.sourceInstanceId, binding]));
  const pose = (sourceInstanceId) => {
    const binding = bySource.get(sourceInstanceId);
    return binding ? r18Bindings.posesById.get(sourceInstanceId) : null;
  };
  const upperPose = pose('INST-SLA-UPPER-ARM-FL');
  const lowerPose = pose('INST-SLA-LOWER-ARM-FL');
  const uprightPose = pose('INST-SLA-UPRIGHT-FL');
  const hubPose = pose('INST-SLA-HUB-FL');
  if (!upperPose || !lowerPose || !uprightPose || !hubPose) {
    const error = new Error('R22-E-DEEP-SLICE-POSE-MISSING: refusing to build a partial FL kinematic chain without all four core bound poses');
    error.code = 'R22-E-DEEP-SLICE-POSE-MISSING';
    throw error;
  }
  const frames = [
    { frameId: 'FR-VEHICLE', space: 'VEHICLE_DEMO', units: 'm', origin: [0, 0, 0], rotation: I3, parentFrameId: null, originBasis: 'DEMO_ASSUMPTION', source: 'R-18 frame' },
    { frameId: 'FR-DS-CHASSIS-UPPER-FL', space: 'VEHICLE_DEMO', units: 'm', origin: [...upperPose.position], rotation: I3, parentFrameId: 'FR-VEHICLE', originBasis: 'DEMO_ASSUMPTION_FROM_R18_POSE', source: 'R-18 upper arm pose position' },
    { frameId: 'FR-DS-CHASSIS-LOWER-FL', space: 'VEHICLE_DEMO', units: 'm', origin: [...lowerPose.position], rotation: I3, parentFrameId: 'FR-VEHICLE', originBasis: 'DEMO_ASSUMPTION_FROM_R18_POSE', source: 'R-18 lower arm pose position' },
    { frameId: 'FR-DS-UPPER-ARM-FL', space: 'VEHICLE_DEMO', units: 'm', origin: [...upperPose.position], rotation: I3, parentFrameId: 'FR-VEHICLE', originBasis: 'DEMO_ASSUMPTION_FROM_R18_POSE', source: 'R-18 upper arm pose position' },
    { frameId: 'FR-DS-LOWER-ARM-FL', space: 'VEHICLE_DEMO', units: 'm', origin: [...lowerPose.position], rotation: I3, parentFrameId: 'FR-VEHICLE', originBasis: 'DEMO_ASSUMPTION_FROM_R18_POSE', source: 'R-18 lower arm pose position' },
    { frameId: 'FR-DS-KNUCKLE-FL', space: 'VEHICLE_DEMO', units: 'm', origin: [...uprightPose.position], rotation: I3, parentFrameId: 'FR-VEHICLE', originBasis: 'DEMO_ASSUMPTION_FROM_R18_POSE', source: 'R-18 upright pose position' },
    { frameId: 'FR-DS-HUB-FL', space: 'VEHICLE_DEMO', units: 'm', origin: [...hubPose.position], rotation: I3, parentFrameId: 'FR-VEHICLE', originBasis: 'DEMO_ASSUMPTION_FROM_R18_POSE', source: 'R-18 hub pose position' },
    { frameId: 'FR-DS-WHEEL-END-FL', space: 'VEHICLE_DEMO', units: 'm', origin: [...hubPose.position], rotation: I3, parentFrameId: 'FR-VEHICLE', originBasis: 'DEMO_ASSUMPTION_FROM_R18_POSE', source: 'R-18 hub pose position' },
    { frameId: 'FR-DS-SHOCK-FL', space: 'VEHICLE_DEMO', units: 'm', origin: [...kinematics.hardpoints.shockChassis], rotation: I3, parentFrameId: 'FR-VEHICLE', originBasis: 'DEMO_ASSUMPTION_FROM_KINEMATICS_FIXTURE', source: 'R-04/R-18 fictional fixture' }
  ];
  const frameIds = new Set(frames.map((frame) => frame.frameId));
  const upperAxis = normalize3(sub3(kinematics.hardpoints.upperAxisB, kinematics.hardpoints.upperAxisA));
  const lowerAxis = normalize3(sub3(kinematics.hardpoints.lowerAxisB, kinematics.hardpoints.lowerAxisA));
  const spindleAxis = normalize3(kinematics.hardpoints.spindleAxis);
  if (!upperAxis || !lowerAxis || !spindleAxis) throw new Error('R-22 demo axes could not be normalized');

  const joints = [
    {
      jointId: 'J-UPPER-ARM-FL',
      type: 'REVOLUTE',
      frameA: 'FR-DS-CHASSIS-UPPER-FL',
      frameB: 'FR-DS-UPPER-ARM-FL',
      axisA: upperAxis,
      axisB: upperAxis,
      limits: null,
      driver: null,
      hardpoint: { axisA: [...kinematics.hardpoints.upperAxisA], axisB: [...kinematics.hardpoints.upperAxisB] },
      hardpointBasis: 'DEMO_ASSUMPTION',
      solverEligible: true,
      status: 'PROPOSED_DEMO',
      proposedBy: 'R-23 Grok',
      evidenceInherited: 'DEMO_ASSUMPTION',
      r17Template: null,
      note: 'Chassis-side revolute axis; fictional hardpoints, not a production bushing model.'
    },
    {
      jointId: 'J-LOWER-ARM-FL',
      type: 'REVOLUTE',
      frameA: 'FR-DS-CHASSIS-LOWER-FL',
      frameB: 'FR-DS-LOWER-ARM-FL',
      axisA: lowerAxis,
      axisB: lowerAxis,
      limits: null,
      driver: null,
      hardpoint: { axisA: [...kinematics.hardpoints.lowerAxisA], axisB: [...kinematics.hardpoints.lowerAxisB] },
      hardpointBasis: 'DEMO_ASSUMPTION',
      solverEligible: true,
      status: 'PROPOSED_DEMO',
      proposedBy: 'R-23 Grok',
      evidenceInherited: 'DEMO_ASSUMPTION',
      r17Template: null,
      note: 'Chassis-side revolute axis; fictional hardpoints.'
    },
    {
      jointId: 'J-UPPER-BALL-FL',
      type: 'SPHERICAL',
      frameA: 'FR-DS-UPPER-ARM-FL',
      frameB: 'FR-DS-KNUCKLE-FL',
      axisA: null,
      axisB: null,
      limits: null,
      driver: null,
      hardpoint: { center: [...kinematics.hardpoints.upperBall] },
      hardpointBasis: 'DEMO_ASSUMPTION',
      solverEligible: true,
      status: 'PROPOSED_DEMO',
      evidenceInherited: 'DEMO_ASSUMPTION',
      r17Template: null,
      note: 'Ball-joint flag on PART-20-003 is a candidate serviceability flag, not a sourced joint specification.'
    },
    {
      jointId: 'J-LOWER-BALL-FL',
      type: 'SPHERICAL',
      frameA: 'FR-DS-LOWER-ARM-FL',
      frameB: 'FR-DS-KNUCKLE-FL',
      axisA: null,
      axisB: null,
      limits: null,
      driver: null,
      hardpoint: { center: [...kinematics.hardpoints.lowerBall] },
      hardpointBasis: 'DEMO_ASSUMPTION',
      solverEligible: true,
      status: 'PROPOSED_DEMO',
      evidenceInherited: 'DEMO_ASSUMPTION',
      r17Template: null,
      note: 'Fictional ball centre.'
    },
    {
      jointId: 'J-DS-HUB-FL',
      type: 'REVOLUTE',
      frameA: 'FR-DS-KNUCKLE-FL',
      frameB: 'FR-DS-HUB-FL',
      axisA: spindleAxis,
      axisB: spindleAxis,
      limits: null,
      driver: null,
      hardpoint: { center: [...kinematics.hardpoints.wheelCenter], axis: [...kinematics.hardpoints.spindleAxis] },
      hardpointBasis: 'DEMO_ASSUMPTION',
      solverEligible: true,
      status: 'PROPOSED_DEMO',
      evidenceInherited: 'DEMO_ASSUMPTION',
      r17Template: 'J-HUB-FL',
      note: 'Reuses the R-17 hub-revolute semantics; wheel spin remains UNKNOWN.'
    }
  ];
  for (const joint of joints) {
    if (!frameIds.has(joint.frameA) || !frameIds.has(joint.frameB)) throw new Error(`deep-slice frame missing for ${joint.jointId}`);
  }

  const constraints = [
    { constraintId: 'CON-SUSP-UPPER-CIRCLE', type: 'POINT_ON_CIRCLE', jointOrConstraint: 'CONSTRAINT', r17Template: 'CON-SUSP-UPPER-CIRCLE', boundInstanceIds: ['INST-SLA-UPPER-ARM-FL'], hardpoints: ['upperAxisA', 'upperAxisB', 'upperBall'], valueBasis: 'DEMO_ASSUMPTION', status: 'DEMO' },
    { constraintId: 'CON-SUSP-LOWER-CIRCLE', type: 'POINT_ON_CIRCLE', jointOrConstraint: 'CONSTRAINT', r17Template: 'CON-SUSP-LOWER-CIRCLE', boundInstanceIds: ['INST-SLA-LOWER-ARM-FL'], hardpoints: ['lowerAxisA', 'lowerAxisB', 'lowerBall'], valueBasis: 'DEMO_ASSUMPTION', status: 'DEMO' },
    { constraintId: 'CON-KINGPIN-LENGTH', type: 'DISTANCE', jointOrConstraint: 'CONSTRAINT', r17Template: 'CON-KINGPIN-LENGTH', boundInstanceIds: ['INST-SLA-UPRIGHT-FL'], hardpoints: ['upperBall', 'lowerBall'], valueBasis: 'DEMO_ASSUMPTION', status: 'DEMO' },
    { constraintId: 'CON-TIE-ROD-LENGTH', type: 'DISTANCE', jointOrConstraint: 'CONSTRAINT', r17Template: 'CON-TIE-ROD-LENGTH', boundInstanceIds: [], solverSymbols: ['tieRod'], valueBasis: 'DEMO_ASSUMPTION', status: 'DEMO_ONLY_UNBOUND_BODY', reason: 'R-16 PART-20-075 is DEFERRED; the R-18 tie-rod pose is not published.' },
    { constraintId: 'CON-WHEEL-CENTER-HEIGHT', type: 'PRESCRIBED_POSITION', jointOrConstraint: 'CONSTRAINT', r17Template: 'CON-WHEEL-CENTER-HEIGHT', boundInstanceIds: ['INST-SLA-HUB-FL'], hardpoints: ['wheelCenter'], valueBasis: 'DEMO_ASSUMPTION', status: 'DEMO' },
    { constraintId: 'CON-SHOCK-OUTPUT', type: 'OUTPUT', jointOrConstraint: 'OUTPUT', r17Template: 'CON-SHOCK-OUTPUT', boundInstanceIds: [], output: { outputId: 'OUT-SHOCK-LENGTH-FL', valueM: r18.designSample.shockLengthM, unit: 'm', valueBasis: 'DEMO_ASSUMPTION' }, valueBasis: 'DEMO_ASSUMPTION', status: 'DEMO' }
  ];

  return {
    sliceId: 'SLICE-FL-SLA-DEMO',
    valueBasis: 'DEMO_ASSUMPTION',
    provenance: 'FICTIONAL_FIXTURE',
    frame: {
      frameId: 'FR-VEHICLE',
      units: 'm',
      up: 'Y',
      handedness: 'RIGHT_HANDED',
      worldFrame: 'UNFROZEN_PENDING_RP07',
      frameBasis: 'FICTIONAL_DEMO',
      source: KINEMATICS_FIXTURE_PATH,
      note: 'Vehicle demo frame only. It does not anchor any R-16 mount frame.'
    },
    frames,
    hardpoints: Object.entries(kinematics.hardpoints).map(([name, value]) => ({
      name,
      kind: name === 'spindleAxis' ? 'DIRECTION' : 'POINT',
      value: [...value],
      unit: name === 'spindleAxis' ? '1' : 'm',
      valueBasis: 'DEMO_ASSUMPTION',
      source: KINEMATICS_FIXTURE_PATH
    })),
    instanceBindings: r18Bindings.bindings,
    joints,
    rejectedJoints: [
      {
        jointId: 'J-TIEROD-INNER-FL',
        type: 'SPHERICAL',
        frameA: null,
        frameB: 'FR-DS-KNUCKLE-FL',
        code: 'VEH-E-JOINT-INSTANCE-MISSING',
        reason: 'NO_CANONICAL_INSTANCE',
        detail: 'R-16 PART-20-074 is DEFERRED; no PI-* instance exists, so no joint may bind a body.'
      },
      {
        jointId: 'J-TIEROD-OUTER-FL',
        type: 'SPHERICAL',
        frameA: 'FR-DS-KNUCKLE-FL',
        frameB: null,
        code: 'VEH-E-JOINT-INSTANCE-MISSING',
        reason: 'NO_CANONICAL_INSTANCE',
        detail: 'R-16 PART-20-075 is DEFERRED; the R-18 tie-rod pose remains unpublished.'
      },
      {
        jointId: 'J-UPPER-ARM-CHASSIS-FL',
        type: 'REVOLUTE',
        frameA: 'FR-20-002-FL',
        frameB: 'FR-DS-UPPER-ARM-FL',
        code: 'VEH-E-JOINT-NO-HARDPOINT',
        reason: 'MOUNT_FRAME_UNANCHORED',
        detail: 'FR-20-002-FL is an R-16 mount frame with origin/rotation UNKNOWN; attaching a solver joint would invent a hardpoint.'
      }
    ],
    constraints,
    outputs: [
      {
        outputId: 'OUT-SHOCK-LENGTH-FL',
        kind: 'OUTPUT',
        valueM: r18.designSample.shockLengthM,
        unit: 'm',
        valueBasis: 'DEMO_ASSUMPTION',
        template: 'CON-SHOCK-OUTPUT',
        note: 'Shock length is an OUTPUT, not a rigid Joint.'
      }
    ],
    metrics: {
      residualM: r18.designSample.residualM,
      camberRad: r18.designSample.camberRad,
      toeRad: r18.designSample.toeRad,
      shockLengthM: r18.designSample.shockLengthM,
      halfshaftLengthM: r18.designSample.halfshaftLengthM,
      maxClosureErrorM: Math.max(...r18.designSample.instances.map((item) => item.closureErrorM || 0)),
      clearance: clone(r18.designSample.clearance),
      solverCalled: r18.designSample.solverCalled,
      forces: null,
      forceBasis: 'UNKNOWN'
    },
    guards: {
      admittedJoints: joints.length,
      rejectedJoints: 3,
      outputIsNotJoint: true,
      unanchoredMountFrameJointsRejected: 1,
      unboundBodyJointsRejected: 2
    }
  };
}

function buildPoseRun(r18, deepSlice, r18Bindings, projectRevision) {
  const poses = [];
  const unboundPoses = [];
  for (const binding of r18Bindings.bindings) {
    const pose = r18Bindings.posesById.get(binding.sourceInstanceId);
    if (!pose) continue;
    if (binding.bindingStatus === 'BOUND') {
      poses.push(poseRecord(binding, pose));
    } else {
      unboundPoses.push({
        sourceInstanceId: binding.sourceInstanceId,
        instanceId: null,
        published: false,
        reason: binding.reason,
        r16DefinitionId: binding.r16DefinitionId,
        r16DefinitionPolicy: binding.r16DefinitionPolicy,
        observedPose: {
          positionM: [...pose.position],
          quaternionXYZW: [...pose.quaternion],
          scale: [...pose.scale],
          note: 'Raw R-18 fixture value retained for traceability; NOT published as a bound pose.'
        }
      });
    }
  }
  return {
    runId: 'RUN-R22-FL-SLA-DEMO-001',
    sourceRun: 'R-18 designSample',
    sourceRunStatus: 'R18_11_OF_11_CHECKS_PASS',
    inputRevision: projectRevision,
    projectRevision,
    status: 'CURRENT',
    valueBasis: 'DEMO_ASSUMPTION',
    provenance: 'FICTIONAL_FIXTURE',
    instanceIdStatus: 'CANDIDATE_NOT_FROZEN',
    frameId: deepSlice.frame.frameId,
    units: 'm',
    up: 'Y',
    unitsPolicy: {
      cadSource: 'mm',
      runtime: 'm',
      conversionFactor: 0.001,
      explicitConversionRequired: true,
      implicitGlobalScale: false,
      evidence: (() => {
        const check = r18.checks.find((item) => item.id === 'M06_engineering_millimetres_match_vehicle_pose');
        return check ? { checkId: check.id, pass: check.pass, inputFrameUnits: 'mm', vehicleHubM: check.vehicle, solvedHubM: check.engineering } : null;
      })()
    },
    scalePolicy: { globalScale: 1, implicitScale: false, perInstanceScale: 'UNIT_XYZ_REQUIRED' },
    mirrorPolicy: {
      policy: 'REGENERATE_MIRRORED_GEOMETRY',
      globalNegativeScaleAllowed: false,
      rightSidePublished: false,
      note: 'R-18 M05 solved the right side from independently mirrored hardpoints; no negative-scale copy is published here.',
      evidence: (() => {
        const check = r18.checks.find((item) => item.id === 'M05_right_side_is_explicit_mirror');
        return check ? { checkId: check.id, pass: check.pass, leftX: check.leftX, rightX: check.rightX } : null;
      })()
    },
    runPolicy: {
      boundTo: 'project revision + input sha256',
      onProjectRevisionChange: 'STALE',
      onInputHashChange: 'REHASH_AND_REVALIDATE',
      staleRunsPublishPoses: false
    },
    travelSamplesM: [...r18.travelSamplesM],
    poses,
    displayTransforms: poses.map((pose) => {
      const rotation = quatToMat3(pose.quaternionXYZW);
      return {
        instanceId: pose.instanceId,
        sourceInstanceId: pose.sourceInstanceId,
        frameId: 'FR-VEHICLE',
        units: 'm',
        up: 'Y',
        matrixWorld: [
          [rotation[0][0], rotation[0][1], rotation[0][2], pose.positionM[0]],
          [rotation[1][0], rotation[1][1], rotation[1][2], pose.positionM[1]],
          [rotation[2][0], rotation[2][1], rotation[2][2], pose.positionM[2]],
          [0, 0, 0, 1]
        ],
        scale: [1, 1, 1],
        production: false,
        basis: 'R18_DEMO_POSE_FRAME_ONLY',
        note: 'Verifiable m / Y-up rigid transform in the fictional FR-VEHICLE demo frame; not an R-16 mount-frame anchor and not a production display matrix.'
      };
    }),
    unboundPoses,
    metrics: clone(deepSlice.metrics),
    clearance: clone(r18.designSample.clearance),
    forces: null,
    forceBasis: 'UNKNOWN',
    sourceChecks: { passCount: r18.passCount, failCount: r18.failCount, failed: [...r18.failed] }
  };
}

function buildDomainView(inputs, deepSlice, poseRun, r16, sourceEvidence) {
  const r18 = inputs.r18;
  const keras = inputs.kinematics.hardpoints;
  const part = (partId) => {
    const definition = r16.partDefinitions.find((item) => item.id === partId);
    if (!definition) throw new Error(`missing R-16 definition ${partId}`);
    return definition;
  };
  const sourceIdsByPart = {
    'PART-20-001': ['SRC-R16-REF-S01'],
    'PART-20-008': ['SRC-R16-REF-S01'],
    'PART-20-016': [],
    'PART-30-006': ['SRC-R16-REF-S04', 'SRC-R16-REF-S05']
  };
  const frame = (frameId, parentFrameId, origin, source) => ({
    frameId,
    parentFrameId,
    space: 'VEHICLE_DEMO',
    units: 'm',
    origin,
    rotation: I3,
    mirror: null,
    scale: null,
    originBasis: 'DEMO_ASSUMPTION',
    source,
    tolerance: { positionM: 0.0005, angleDeg: 0.1 }
  });
  const upperPose = r18.designSample.instances.find((item) => item.instanceId === 'INST-SLA-UPPER-ARM-FL').position;
  const lowerPose = r18.designSample.instances.find((item) => item.instanceId === 'INST-SLA-LOWER-ARM-FL').position;
  const uprightPose = r18.designSample.instances.find((item) => item.instanceId === 'INST-SLA-UPRIGHT-FL').position;
  const hubPose = r18.designSample.instances.find((item) => item.instanceId === 'INST-SLA-HUB-FL').position;
  const frames = [
    frame('FR-VEHICLE', null, [0, 0, 0], 'R-18 demo frame'),
    frame('FR-DS-CHASSIS-UPPER-FL', 'FR-VEHICLE', [...upperPose], 'R-18 upper pose position'),
    frame('FR-DS-CHASSIS-LOWER-FL', 'FR-VEHICLE', [...lowerPose], 'R-18 lower pose position'),
    frame('FR-DS-UPPER-ARM-FL', 'FR-VEHICLE', [...upperPose], 'R-18 upper pose position'),
    frame('FR-DS-LOWER-ARM-FL', 'FR-VEHICLE', [...lowerPose], 'R-18 lower pose position'),
    frame('FR-DS-KNUCKLE-FL', 'FR-VEHICLE', [...uprightPose], 'R-18 upright pose position'),
    frame('FR-DS-HUB-FL', 'FR-VEHICLE', [...hubPose], 'R-18 hub pose position'),
    frame('FR-DS-WHEEL-END-FL', 'FR-VEHICLE', [...hubPose], 'R-18 hub pose position'),
    frame('FR-DS-SHOCK-FL', 'FR-VEHICLE', [...keras.shockChassis], 'R-04/R-18 fictional fixture')
  ];
  const upperAxis = normalize3(sub3(keras.upperAxisB, keras.upperAxisA));
  const lowerAxis = normalize3(sub3(keras.lowerAxisB, keras.lowerAxisA));
  const spindleAxis = normalize3(keras.spindleAxis);
  const definitions = ['PART-20-001', 'PART-20-008', 'PART-20-016', 'PART-30-006'].map((partId) => {
    const definition = part(partId);
    return {
      partId,
      name: definition.name,
      parentAssemblyDefinitionId: definition.parentId,
      evidenceInherited: definition.valueBasis,
      sourceEvidenceIds: sourceIdsByPart[partId],
      geometryBasis: 'UNKNOWN',
      geometryValue: null,
      geometryStatus: 'NO_GEOMETRY',
      massStatus: 'UNKNOWN',
      mountStatus: 'UNKNOWN',
      modelBlocked: Boolean(definition.modelBlocked),
      note: 'R-16 candidate definition; geometry and mass remain UNKNOWN.'
    };
  });
  const instances = [
    { instanceId: 'INST-SLA-UPPER-ARM-FL', engineeringInstanceId: 'PI-20-001-FL', partId: 'PART-20-001', assemblyId: 'AI-20-002-FL', frameId: 'FR-DS-UPPER-ARM-FL', sourceEvidenceIds: ['SRC-R16-REF-S01'] },
    { instanceId: 'INST-SLA-LOWER-ARM-FL', engineeringInstanceId: 'PI-20-008-FL', partId: 'PART-20-008', assemblyId: 'AI-20-003-FL', frameId: 'FR-DS-LOWER-ARM-FL', sourceEvidenceIds: ['SRC-R16-REF-S01'] },
    { instanceId: 'INST-SLA-UPRIGHT-FL', engineeringInstanceId: 'PI-20-016-FL', partId: 'PART-20-016', assemblyId: 'AI-20-004-FL', frameId: 'FR-DS-KNUCKLE-FL', sourceEvidenceIds: [] },
    { instanceId: 'INST-SLA-HUB-FL', engineeringInstanceId: 'PI-30-006-FL', partId: 'PART-30-006', assemblyId: 'AI-30-002-FL', frameId: 'FR-DS-HUB-FL', sourceEvidenceIds: ['SRC-R16-REF-S04', 'SRC-R16-REF-S05'] }
  ].map((item) => ({
    ...item,
    aliasStatus: 'VIEW_LOCAL_NOT_CANONICAL',
    variantId: 'VAR-R16-BOF-ICE',
    visible: true,
    evidenceInherited: 'UNKNOWN',
    claimedEvidence: null,
    quantity: { perAssembly: 1 },
    geometryStatus: 'NO_GEOMETRY',
    inspectable: false
  }));
  const joints = [
    { jointId: 'J-UPPER-ARM-FL', type: 'REVOLUTE', frameA: 'FR-DS-CHASSIS-UPPER-FL', frameB: 'FR-DS-UPPER-ARM-FL', axisA: upperAxis, axisB: upperAxis, limits: null, driver: null, hardpoint: { axisA: [...keras.upperAxisA], axisB: [...keras.upperAxisB] }, hardpointBasis: 'DEMO_ASSUMPTION', solverEligible: true, evidenceInherited: 'DEMO_ASSUMPTION', sourceEvidenceIds: ['SRC-R18-DEMO', 'SRC-KIN-FIXTURE'] },
    { jointId: 'J-LOWER-ARM-FL', type: 'REVOLUTE', frameA: 'FR-DS-CHASSIS-LOWER-FL', frameB: 'FR-DS-LOWER-ARM-FL', axisA: lowerAxis, axisB: lowerAxis, limits: null, driver: null, hardpoint: { axisA: [...keras.lowerAxisA], axisB: [...keras.lowerAxisB] }, hardpointBasis: 'DEMO_ASSUMPTION', solverEligible: true, evidenceInherited: 'DEMO_ASSUMPTION', sourceEvidenceIds: ['SRC-R18-DEMO', 'SRC-KIN-FIXTURE'] },
    { jointId: 'J-UPPER-BALL-FL', type: 'SPHERICAL', frameA: 'FR-DS-UPPER-ARM-FL', frameB: 'FR-DS-KNUCKLE-FL', axisA: null, axisB: null, limits: null, driver: null, hardpoint: { center: [...keras.upperBall] }, hardpointBasis: 'DEMO_ASSUMPTION', solverEligible: true, evidenceInherited: 'DEMO_ASSUMPTION', sourceEvidenceIds: ['SRC-R18-DEMO', 'SRC-KIN-FIXTURE'] },
    { jointId: 'J-LOWER-BALL-FL', type: 'SPHERICAL', frameA: 'FR-DS-LOWER-ARM-FL', frameB: 'FR-DS-KNUCKLE-FL', axisA: null, axisB: null, limits: null, driver: null, hardpoint: { center: [...keras.lowerBall] }, hardpointBasis: 'DEMO_ASSUMPTION', solverEligible: true, evidenceInherited: 'DEMO_ASSUMPTION', sourceEvidenceIds: ['SRC-R18-DEMO', 'SRC-KIN-FIXTURE'] },
    { jointId: 'J-DS-HUB-FL', type: 'REVOLUTE', frameA: 'FR-DS-KNUCKLE-FL', frameB: 'FR-DS-HUB-FL', axisA: spindleAxis, axisB: spindleAxis, limits: null, driver: null, hardpoint: { center: [...keras.wheelCenter], axis: [...keras.spindleAxis] }, hardpointBasis: 'DEMO_ASSUMPTION', solverEligible: true, evidenceInherited: 'DEMO_ASSUMPTION', sourceEvidenceIds: ['SRC-R18-DEMO', 'SRC-KIN-FIXTURE'], r17Template: 'J-HUB-FL' }
  ];
  const constraints = deepSlice.constraints.map((constraint) => ({
    constraintId: constraint.constraintId,
    type: constraint.type,
    jointOrConstraint: constraint.jointOrConstraint,
    status: constraint.status,
    source: constraint.r17Template ? `R-17 template ${constraint.r17Template}` : 'R-22',
    evidenceInherited: 'DEMO_ASSUMPTION',
    boundInstanceIds: [...constraint.boundInstanceIds],
    output: constraint.output ? clone(constraint.output) : null
  }));
  const assemblies = [
    { assemblyId: 'AI-20-002-FL', definitionRef: 'ASSY-20-002', systemId: 'SYS-20', parentAssemblyId: null, frameId: 'FR-DS-UPPER-ARM-FL', name: '上摆臂总成 FL（R-16 实例）' },
    { assemblyId: 'AI-20-003-FL', definitionRef: 'ASSY-20-003', systemId: 'SYS-20', parentAssemblyId: null, frameId: 'FR-DS-LOWER-ARM-FL', name: '下摆臂总成 FL（R-16 实例）' },
    { assemblyId: 'AI-20-004-FL', definitionRef: 'ASSY-20-004', systemId: 'SYS-20', parentAssemblyId: null, frameId: 'FR-DS-KNUCKLE-FL', name: '前转向节 FL（R-16 实例）' },
    { assemblyId: 'AI-20-005-FL', definitionRef: 'ASSY-20-005', systemId: 'SYS-20', parentAssemblyId: null, frameId: 'FR-DS-SHOCK-FL', name: '前弹簧与减振器 FL（R-16 实例，只有 OUTPUT）' },
    { assemblyId: 'AI-30-001-FL', definitionRef: 'ASSY-30-001', systemId: 'SYS-30', parentAssemblyId: null, frameId: 'FR-DS-WHEEL-END-FL', name: '前轮端总成 FL（R-16 实例）' },
    { assemblyId: 'AI-30-002-FL', definitionRef: 'ASSY-30-002', systemId: 'SYS-30', parentAssemblyId: null, frameId: 'FR-DS-HUB-FL', name: '轮毂轴承 Gen1 FL（R-16 实例）' }
  ];
  const assemblyDefinitions = ['ASSY-20-001', 'ASSY-20-002', 'ASSY-20-003', 'ASSY-20-004', 'ASSY-20-005', 'ASSY-30-001', 'ASSY-30-002'].map((assemblyId) => {
    const definition = r16.assemblies.find((item) => item.id === assemblyId);
    return { assemblyId, name: definition?.name ?? assemblyId, evidenceInherited: definition?.valueBasis ?? 'UNKNOWN', geometryStatus: 'NO_GEOMETRY' };
  });
  const bomLines = instances.map((instance) => ({
    bomLineId: `BOM-${instance.assemblyId}-${instance.partId}`,
    assemblyId: instance.assemblyId,
    partRef: instance.partId,
    qtyPerAssembly: 1,
    instanceIds: [instance.instanceId]
  }));
  return {
    schemaVersion: DOMAIN_SCHEMA_VERSION,
    projectId: 'PROJECT-R22-DS-FL-SLA',
    name: 'FL 双叉臂纵切·R-16 身份 + R-18 虚构位姿（候选投影）',
    revision: 1,
    variant: {
      variantId: 'VAR-R16-BOF-ICE',
      name: '非承载式越野·燃油（首发基型候选）',
      generation: 'GEN1',
      platformFamilyRef: 'PF-R16-CANDIDATE',
      parameters: {},
      moduleSelections: { 'CG-HUB': 'ASSY-30-002' },
      evidenceInherited: 'ASSUMPTION'
    },
    systems: [
      { systemId: 'VEH-001', name: '整车根（RP-01）', parentSystemId: null, evidenceInherited: 'ASSUMPTION' },
      { systemId: 'SYS-20', name: '悬架、转向与车轴定位', parentSystemId: 'VEH-001', evidenceInherited: 'ASSUMPTION' },
      { systemId: 'SYS-30', name: '车轮、轮胎与轮端', parentSystemId: 'VEH-001', evidenceInherited: 'ASSUMPTION' }
    ],
    assemblyDefinitions,
    assemblies,
    partDefinitions: definitions,
    partInstances: instances,
    frames,
    joints,
    constraints,
    references: [],
    bomLines,
    quantityFacts: [],
    assets: [],
    sourceEvidence: sourceEvidence.map((item) => ({
      sourceId: item.sourceId,
      kind: item.kind,
      grade: item.grade,
      path: item.path,
      supports: item.supports,
      limitations: item.limitations
    })),
    simulationRuns: [
      {
        runId: 'RUN-R22-FL-SLA-DEMO-001',
        inputRevision: 1,
        solver: 'mechanism-vertical-slice-v1/pose.mjs + kinematics/solve.mjs (fictional fixture)',
        status: 'PASS',
        resultHash: `sha256:${createHash('sha256').update(JSON.stringify(r18.designSample)).digest('hex')}`,
        producedAt: '2026-11-15',
        source: 'R-18 demo; not production kinematics'
      }
    ],
    selectedId: 'INST-SLA-UPPER-ARM-FL',
    identityPolicy: {
      canonicalInstanceId: 'PI-* from R-16',
      viewInstanceId: 'INST-* required by carlab.domain-contract/0.1.0-proposal',
      aliasStatus: 'VIEW_LOCAL_NOT_CANONICAL',
      rule: 'engineeringInstanceId is the only canonical engineering identity; the INST-* key exists only because the current R-17 validator requires it.'
    },
    valueBasis: 'DEMO_ASSUMPTION'
  };
}

export function buildIntegration(root = DEFAULT_ROOT) {
  return buildIntegrationFromInputs(loadInputs(root));
}

export function buildIntegrationFromInputs(inputs) {
  const { r16, r18 } = inputs;
  const index = nodeIndex(r16);
  const sourceEvidence = sourceEvidenceRecords(inputs);
  const systems = [
    {
      systemId: 'VEH-001',
      name: '整车根（RP-01）',
      level: 'VEHICLE',
      parentSystemId: null,
      evidenceInherited: 'ASSUMPTION',
      sourceRefs: []
    },
    ...r16.systems.map((system) => ({
      systemId: system.id,
      name: system.name,
      level: 'SYSTEM',
      parentSystemId: system.parentId === 'VEH-001' ? null : system.parentId,
      evidenceInherited: system.valueBasis,
      sourceRefs: [...(system.sources || [])]
    })),
    ...r16.subsystems.map((subsystem) => ({
      systemId: subsystem.id,
      name: subsystem.name,
      level: 'SUBSYSTEM',
      parentSystemId: subsystem.parentId,
      evidenceInherited: subsystem.valueBasis,
      sourceRefs: [...(subsystem.sources || [])]
    }))
  ];
  const assemblyDefinitions = r16.assemblies.map((assembly) => ({
    assemblyId: assembly.id,
    name: assembly.name,
    systemId: ownerSystemId(assembly.id, index),
    parentNodeId: assembly.parentId,
    parentKind: index.get(assembly.parentId)?.rp01Kind ?? 'MISSING',
    purchaseBoundary: assembly.purchaseBoundary ?? null,
    targetLevel: assembly.targetLevel ?? null,
    evidenceInherited: assembly.valueBasis,
    sourceRefs: [...(assembly.sources || [])]
  }));
  const assemblyInstances = r16.assemblyInstances.map((assembly) => ({
    assemblyInstanceId: assembly.instanceId,
    definitionRef: assembly.assemblyId,
    systemId: ownerSystemId(assembly.assemblyId, index),
    frameId: assembly.mountFrameId,
    corner: assembly.corner,
    scope: assembly.scope,
    activeInVariant: assembly.activeInVariant,
    parentAssemblyInstanceId: null,
    parentStatus: 'UNSPECIFIED_IN_R16',
    evidenceInherited: assembly.evidenceInherited,
    valueBasis: assembly.valueBasis,
    geometryStatus: 'NO_GEOMETRY',
    geometryBasis: 'UNKNOWN'
  }));
  const partDefinitions = r16.partDefinitions.map((definition) => ({
    partId: definition.id,
    name: definition.name,
    parentNodeId: definition.parentId,
    parentKind: index.get(definition.parentId)?.rp01Kind ?? 'MISSING',
    systemId: ownerSystemId(definition.id, index),
    partClass: definition.partClass ?? null,
    familyRef: definition.familyRef ?? null,
    evidenceInherited: definition.valueBasis,
    geometryBasis: definition.geometryBasis,
    geometryValue: null,
    geometryStatus: 'NO_GEOMETRY',
    massStatus: definition.massStatus ?? 'UNKNOWN',
    mountStatus: definition.mountStatus ?? 'UNKNOWN',
    instancePolicy: definition.instancePolicy,
    qtyVehicleTotalInherited: definition.qtyVehicleTotal,
    qtyBasis: definition.qtyBasis,
    mirroredInRP01: Boolean(definition.mirroredInRP01),
    handednessPolicy: definition.handednessPolicy ? clone(definition.handednessPolicy) : null,
    variantFlag: definition.variantFlag ?? null,
    modelBlocked: Boolean(definition.modelBlocked),
    sourceRefs: [...(definition.sources || [])],
    inspectable: false
  }));
  const partInstances = r16.partInstances.map((instance) => ({
    instanceId: instance.instanceId,
    partId: instance.definitionId,
    assemblyInstanceId: instance.assemblyInstanceId,
    frameId: instance.mountFrameId,
    corner: instance.corner,
    ordinal: instance.ordinal,
    quantity: { perAssembly: 1, sourceQtyPerCorner: instance.qtyPerCorner },
    qtyVehicleTotalInherited: instance.qtyVehicleTotalInherited,
    distribution: instance.distribution,
    distributionDivisor: instance.distributionDivisor,
    distributionBasis: instance.distributionBasis,
    /** R16 qtyPerCorner is part-level; each PI instance is one physical piece. */
    quantitySemantics: 'ONE_PHYSICAL_PIECE_PER_INSTANCE',
    evidenceInherited: instance.valueBasis,
    claimedEvidence: null,
    evidence: {
      identityBasis: instance.identityBasis,
      geometryBasis: instance.geometryBasis,
      massBasis: instance.massBasis,
      mountBasis: instance.mountBasis,
      valueBasis: instance.valueBasis,
      valueBasisDefinition: instance.valueBasisDefinition,
      evidenceInherited: instance.evidenceInherited
    },
    geometryStatus: 'NO_GEOMETRY',
    materialStatus: 'UNKNOWN',
    massStatus: 'UNKNOWN',
    mountStatus: 'UNKNOWN',
    fastenerRole: instance.fastenerRole ?? null,
    countedInBom: instance.countedInBom !== false,
    isDeepSlice: Boolean(instance.isDeepSlice),
    variantId: null,
    variantScope: 'SINGLE_VARIANT_PROJECT_VAR_R16_BOF_ICE',
    inspectable: false
  }));
  const mountFrames = r16.mountFrames.map((frame) => ({
    frameId: frame.frameId,
    assemblyInstanceId: frame.instanceId,
    corner: frame.corner,
    kind: frame.kind,
    space: 'MOUNT_LOCAL',
    units: null,
    origin: null,
    rotation: null,
    anchorStatus: 'UNANCHORED_UNKNOWN',
    worldFrame: 'UNFROZEN_PENDING_RP07',
    handedness: frame.handedness,
    mirrorPolicy: frame.mirrorPolicy,
    globalScaleForbidden: frame.globalScaleForbidden,
    source: 'R-16 mount frame; no numeric anchor recorded'
  }));
  const references = r16.references.map((reference) => ({
    refId: reference.id,
    parentNodeId: reference.parentId,
    canonicalRef: reference.refId,
    name: reference.name,
    countedInBom: false,
    bom: false,
    sourceRefs: [...(reference.sources || [])]
  }));
  const qtyAudit = computeQtyAudit(partDefinitions, partInstances, r16.qtyConflicts);
  const bomLines = deriveBomLines(partInstances);
  const crosswalk = buildR17Crosswalk(inputs.r17Fixture, r16);
  const r18Bindings = buildR18Bindings(r18, r16);
  const deepSlice = buildDeepSlice(r18, inputs.kinematics, r18Bindings);
  const poseRun = buildPoseRun(r18, deepSlice, r18Bindings, 1);
  const domainView = buildDomainView(inputs, deepSlice, poseRun, r16, sourceEvidence);
  const declaredHubOption = r16.variant.choiceGroups['CG-HUB'];
  const hubRule = r16.architectureRules['CG-HUB'].options[declaredHubOption];
  const variantGuards = {
    choiceGroup: 'CG-HUB',
    selectedOption: declaredHubOption,
    requiredInstantiatedParts: [...hubRule.requiresParts],
    forbiddenInstantiatedParts: [...hubRule.forbidsParts],
    fastenerChoice: r16.variant.choiceGroups['CG-FASTENER'] ?? null,
    fastenerRuleStatus: r16.architectureRules['CG-FASTENER']?.status ?? 'UNKNOWN',
    rule: r16.variant.status
  };
  const artifact = {
    schemaVersion: SCHEMA_VERSION,
    artifactId: 'INTEGRATION-R16-R17-R18-V1',
    taskId: 'R-22',
    date: '2026-11-15',
    status: 'CANDIDATE_NOT_FROZEN',
    purpose: 'First traceable VehicleProject + PoseRun candidate across the R-16 tree, R-17 contract and R-18 demo poses. No CAD, no OEM hardpoints, no production schema freeze.',
    inputArtifacts: [
      { role: 'VEHICLE_OBJECT_TREE', path: R16_PATH, sha256: inputs.hashes[R16_PATH], declaredStatus: r16.status, owner: 'qwen4' },
      { role: 'DOMAIN_CONTRACT_MODEL', path: R17_MODEL_PATH, sha256: inputs.hashes[R17_MODEL_PATH], declaredStatus: DOMAIN_SCHEMA_VERSION, owner: 'deepseek' },
      { role: 'DOMAIN_FIXTURE_FL_WHEEL_END', path: R17_FIXTURE_PATH, sha256: inputs.hashes[R17_FIXTURE_PATH], declaredStatus: inputs.r17Fixture.schemaVersion, owner: 'deepseek' },
      { role: 'POSE_RUN', path: R18_PATH, sha256: inputs.hashes[R18_PATH], declaredStatus: `${r18.valueBasis}/${r18.provenance}`, owner: 'grok' },
      { role: 'DEMO_HARDPOINTS', path: KINEMATICS_FIXTURE_PATH, sha256: inputs.hashes[KINEMATICS_FIXTURE_PATH], declaredStatus: inputs.kinematics.valueBasis, owner: 'grok' }
    ],
    scope: {
      variantId: r16.variant.id,
      variantStatus: r16.variant.status,
      generation: 'GEN1',
      worldFrame: 'UNFROZEN_PENDING_RP07',
      fullVehicle: 'CATALOG_ONLY_NO_GEOMETRY',
      deepSlice: 'FL_DOUBLE_WISHBONE_FICTIONAL_POSE',
      productionReady: false,
      claim: 'No claim that the whole vehicle is physically solved, CAD-complete, or OEM-sourced.'
    },
    vehicleProject: {
      projectId: 'PROJECT-R16-CANDIDATE-INTEGRATION',
      revision: 1,
      variant: {
        variantId: r16.variant.id,
        name: r16.variant.name,
        status: r16.variant.status,
        generation: 'GEN1',
        basedOn: r16.variant.basedOn,
        choiceGroups: clone(r16.variant.choiceGroups)
      },
      variantGuards,
      systems,
      assemblyDefinitions,
      assemblyInstances,
      partDefinitions,
      partInstances,
      mountFrames,
      references,
      bomLines,
      joints: [],
      constraints: [],
      simulationRuns: [],
      geometryPolicy: {
        sourcedGeometryInstances: 0,
        noGeometryInstances: partInstances.length,
        fabricatedGeometryInstances: 0,
        renderableProductionInstances: 0,
        rule: 'Every instance without a sourced geometry record is NO_GEOMETRY and is not inspectable.'
      },
      identityPolicy: {
        canonicalInstanceId: 'PI-* from R-16',
        canonicalDefinitionId: 'PART-* from R-16',
        assemblyInstanceId: 'AI-* from R-16',
        mountFrameId: 'FR-* from R-16',
        object3DNameIsNotIdentity: true,
        variantInId: false
      }
    },
    crosswalk,
    deepSlice,
    poseRun,
    domainView,
    qtyAudit,
    inheritedIssues: {
      qtyConflicts: clone(r16.qtyConflicts),
      modelBlockedItems: clone(r16.modelBlocked),
      modelBlockedDefinitionCount: r16.partDefinitions.filter((definition) => definition.modelBlocked).length,
      referenceCount: r16.references.length,
      referenceCountedInBom: 0
    },
    sourceEvidence,
    coverage: null,
    conflicts: [
      {
        conflictId: 'CF-R22-01',
        severity: 'P0',
        topic: 'instanceId namespace',
        statement: 'R-16 declares PI-* should map to R-17 PartInstance.instanceId, but the approved R-17 validator requires INST-*.',
        counterexample: 'PI-30-006-FL is rejected by DOMAIN-E-INSTANCE-ID in carlab.domain-contract/0.1.0-proposal.',
        decisionId: 'D-R22-01'
      },
      {
        conflictId: 'CF-R22-02',
        severity: 'P0',
        topic: 'R-18 identity reuse',
        statement: 'R-18 uses its own INST-SLA-* identities instead of reusing R-16 PI-* identities.',
        counterexample: '5 R-18 poses: 4 resolve by part+corner to R-16, 1 (INST-SLA-TIEROD-FL / PART-20-075) has no R-16 instance because the definition is DEFERRED.',
        decisionId: 'D-R22-02'
      },
      {
        conflictId: 'CF-R22-03',
        severity: 'P1',
        topic: 'FL frame disagreement',
        statement: 'The R-17 FL wheel-end fixture frame and the R-18 FL pose fixture disagree numerically; neither is sourced.',
        counterexample: (() => {
          const r17Frame = inputs.r17Fixture.frames.find((frame) => frame.frameId === 'FR-WHEEL-END-FL');
          const hub = r18.designSample.instances.find((item) => item.instanceId === 'INST-SLA-HUB-FL');
          const delta = sub3(r17Frame.origin, hub.position);
          return { r17FrameOriginM: [...r17Frame.origin], r18HubPositionM: [...hub.position], deltaM: delta.map((value) => round(value)), distanceM: round(norm3(delta)) };
        })(),
        decisionId: 'D-R22-03'
      },
      {
        conflictId: 'CF-R22-04',
        severity: 'P1',
        topic: 'fixture-only R-17 instance',
        statement: 'The R-17 FL wheel-end fixture instantiates a part that R-16 defers.',
        counterexample: 'INST-CALIPER-BRACKET-FL references PART-40-048, whose R-16 instancePolicy is DEFERRED; it has no canonical PI-* identity.',
        decisionId: 'D-R22-04'
      },
      {
        conflictId: 'CF-R22-05',
        severity: 'P1',
        topic: 'variant-safe identity',
        statement: 'R-16 PI-* identifiers contain no variant segment, so one ID could denote different definition sets under Gen1 and Gen3.',
        counterexample: 'PI-30-006-FL is valid for GEN1; a future GEN3 variant must not silently reuse it for a different hub definition.',
        decisionId: 'D-R22-05'
      },
      {
        conflictId: 'CF-R22-06',
        severity: 'P1',
        topic: 'unanchored mount frames',
        statement: 'All 37 R-16 mount frames have no numeric origin or rotation.',
        counterexample: 'FR-20-002-FL has only originSemantics "相对基准，未给世界绝对坐标"; no display matrix can be produced without inventing one.',
        decisionId: 'D-R22-06'
      },
      {
        conflictId: 'CF-R22-07',
        severity: 'P1',
        topic: 'quantity double-count',
        statement: 'R-16 stores the part-level qtyPerCorner on every ordinal instance; summing qtyPerCorner double-counts.',
        counterexample: (() => {
          const studs = r16.partInstances.filter((instance) => instance.definitionId === 'PART-30-009');
          return {
            instances: studs.length,
            naiveSumOfQtyPerCorner: studs.reduce((sum, instance) => sum + instance.qtyPerCorner, 0),
            physicalPieces: studs.length,
            inheritedVehicleTotal: r16.partDefinitions.find((definition) => definition.id === 'PART-30-009').qtyVehicleTotal
          };
        })(),
        decisionId: 'D-R22-07'
      },
      {
        conflictId: 'CF-R22-08',
        severity: 'P1',
        topic: 'run lineage',
        statement: 'Grok R-23 publishes RUN-SLA-FL-DEMO-001 at inputRevision=3 against the R-17 fixture; this integration publishes RUN-R22-FL-SLA-DEMO-001 at revision 1 against a different input set.',
        counterexample: 'Both are FL demo runs, but their input revisions and instance identities differ; neither may be replayed as the other.',
        decisionId: 'D-R22-08'
      },
      {
        conflictId: 'CF-R22-09',
        severity: 'P2',
        topic: 'source evidence',
        statement: 'R-16 carries 46 external source reference IDs that R-22 did not re-open.',
        counterexample: 'PART-20-001 inherits SOURCED_SECONDARY from S01; this integration keeps it as an UNVERIFIED_REFERENCE, not an OEM drawing.',
        decisionId: 'D-R22-09'
      },
      {
        conflictId: 'CF-R22-10',
        severity: 'P2',
        topic: 'inherited quantity conflicts',
        statement: 'R-16 declares 12 OPEN quantity conflicts; the integration preserves inherited totals and physical instance counts side by side.',
        counterexample: { declared: 12, derivedByInstanceCount: qtyAudit.derivedMismatchIds.length, auditStatus: qtyAudit.status },
        decisionId: 'D-R22-10'
      }
    ],
    decisions: [
      {
        decisionId: 'D-R22-01',
        status: 'PROPOSED_PENDING_GPT6',
        decision: 'Use R-16 PI-* as the only canonical instanceId. INST-* in the R-17 view is a declared view-local alias, never a second engineering identity.',
        ask: 'GPT-6 to either amend the R-17 prefix rule to accept PI-* or declare PI-* the canonical namespace.'
      },
      {
        decisionId: 'D-R22-02',
        status: 'PROPOSED_PENDING_GPT6',
        decision: 'Bind R-18 poses only by declared part+corner+ordinal crosswalk. Never invent a PI-* identity for an unbound pose.',
        ask: 'Grok/Qwen4 to add canonical R-16 instanceId to future pose outputs.'
      },
      {
        decisionId: 'D-R22-03',
        status: 'PROPOSED_PENDING_GPT6',
        decision: 'Keep R-17 fixture frames and the R-18 FR-VEHICLE demo frame separate. Do not merge numeric transforms or claim a world anchor.',
        ask: 'GPT-6 to define the RP-07 world-frame handoff before any absolute layout.'
      },
      {
        decisionId: 'D-R22-04',
        status: 'PROPOSED_PENDING_GPT6',
        decision: 'Crosswalk R-17 fixture instances to canonical R-16 identities; leave fixture-only or deferred parts unbound and visible.',
        ask: 'Qwen4/DeepSeek to reconcile PART-40-048 whether it belongs in this variant.'
      },
      {
        decisionId: 'D-R22-05',
        status: 'PROPOSED_PENDING_GPT6',
        decision: 'One integration artifact represents one explicit variant (GEN1 VAR-R16-BOF-ICE). PI-* identifiers are not assumed variant-safe.',
        ask: 'GPT-6 to decide whether variant belongs in the instanceId or in a variant-scoped project.'
      },
      {
        decisionId: 'D-R22-06',
        status: 'PROPOSED_PENDING_GPT6',
        decision: 'All 37 R-16 mount frames remain UNANCHORED_UNKNOWN; no production display transform is emitted from the vehicle tree.',
        ask: 'RP-07 to supply sourced frame anchors before rendering the full vehicle.'
      },
      {
        decisionId: 'D-R22-07',
        status: 'PROPOSED_PENDING_GPT6',
        decision: 'Interpret qtyPerCorner as part-level and each PI-* instance as one physical piece; derive BOM qty from instance counts per parent.',
        ask: 'Qwen4 to confirm or correct the quantity semantics in R-16 and future trees.'
      },
      {
        decisionId: 'D-R22-08',
        status: 'PROPOSED_PENDING_GPT6',
        decision: 'Bind PoseRun to project revision and input hashes; never replay a run from a different revision or input set.',
        ask: 'Grok/Composer to key runs by canonical instanceId + input revision.'
      },
      {
        decisionId: 'D-R22-09',
        status: 'PROPOSED_PENDING_GPT6',
        decision: 'No source-grade upgrade. R-16 inherited source references remain UNVERIFIED_REFERENCE; only artifact hashes are verified.',
        ask: 'GPT-6 to decide the evidence registry and verification workflow.'
      },
      {
        decisionId: 'D-R22-10',
        status: 'PROPOSED_PENDING_GPT6',
        decision: 'Preserve all 12 inherited quantity conflicts as OPEN; show inherited total and physical count side by side, no silent repair.',
        ask: 'GPT-6 to rule the final vehicle-total policy.'
      }
    ]
  };
  artifact.coverage = computeCoverage(artifact);
  return { artifact, inputs };
}

export function computeCoverage(artifact) {
  const vehicle = artifact.vehicleProject;
  const crosswalk = artifact.crosswalk || { rows: [], r17Scope: { systems: 0, partInstances: 0 } };
  const poseRun = artifact.poseRun || { poses: [], unboundPoses: [], travelSamplesM: [] };
  const domainView = artifact.domainView || { systems: [], partInstances: [], joints: [], constraints: [], bomLines: [] };
  const inherited = artifact.inheritedIssues || { modelBlockedItems: [], modelBlockedDefinitionCount: 0, qtyConflicts: [] };
  const poses = poseRun.poses;
  const r17BoundCanonical = new Set(crosswalk.rows.filter((row) => row.status === 'BOUND').map((row) => row.canonicalInstanceId));
  return {
    r16: {
      systems: vehicle.systems.filter((system) => system.level === 'SYSTEM').length,
      subsystems: vehicle.systems.filter((system) => system.level === 'SUBSYSTEM').length,
      assemblyDefinitions: vehicle.assemblyDefinitions.length,
      assemblyInstances: vehicle.assemblyInstances.length,
      partDefinitions: vehicle.partDefinitions.length,
      partInstances: vehicle.partInstances.length,
      mountFrames: vehicle.mountFrames.length,
      references: vehicle.references.length,
      bomLines: vehicle.bomLines.length,
      geometrySourcedInstances: vehicle.partInstances.filter((instance) => instance.geometryStatus === 'SOURCED').length,
      noGeometryInstances: vehicle.partInstances.filter((instance) => instance.geometryStatus === 'NO_GEOMETRY').length,
      modelBlockedItems: inherited.modelBlockedItems.length,
      modelBlockedDefinitions: inherited.modelBlockedDefinitionCount,
      qtyConflicts: inherited.qtyConflicts.length
    },
    r17: {
      systems: crosswalk.r17Scope.systems,
      partInstances: crosswalk.r17Scope.partInstances,
      bound: crosswalk.rows.filter((row) => row.status === 'BOUND').length,
      unbound: crosswalk.rows.filter((row) => row.status === 'UNBOUND').length
    },
    r18: {
      samples: poseRun.travelSamplesM.length,
      poses: poses.length + poseRun.unboundPoses.length,
      boundToR16: poses.length,
      boundToR17: poses.filter((pose) => r17BoundCanonical.has(pose.instanceId)).length,
      unbound: poseRun.unboundPoses.length
    },
    domainView: {
      systems: domainView.systems.length,
      partInstances: domainView.partInstances.length,
      joints: domainView.joints.length,
      constraints: domainView.constraints.length,
      bomLines: domainView.bomLines.length
    },
    solve: {
      assemblyInstances: vehicle.assemblyInstances.length,
      hardpointAnchoredAssemblyInstances: 0,
      demoHardpointAssemblyInstances: new Set(poses.map((pose) => pose.sourceAssemblyInstanceId)).size,
      solvablePartInstances: poses.length
    }
  };
}

export function verifyInputHashes(artifact, root = DEFAULT_ROOT) {
  const errors = [];
  for (const input of artifact.inputArtifacts || []) {
    let actual;
    try {
      actual = sha256File(root, input.path);
    } catch (error) {
      errors.push({ code: 'VEH-E-INPUT-HASH', objectId: input.role, rule: 'input readable', source: 'inputArtifacts', message: `${input.path}: ${error.message}` });
      continue;
    }
    if (actual !== input.sha256) {
      errors.push({ code: 'VEH-E-INPUT-HASH', objectId: input.role, rule: 'sha256 matches live file', source: 'inputArtifacts', message: `${input.path}: expected ${input.sha256}, got ${actual}` });
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateIntegration(artifact) {
  const errors = [];
  const warnings = [];
  const e = (code, objectId, rule, source, message) => errors.push({ code, objectId, rule, source, message });
  const w = (code, objectId, rule, source, message) => warnings.push({ code, objectId, rule, source, message });
  const unique = (items, key, source) => {
    const seen = new Map();
    for (const item of items || []) {
      const id = item?.[key];
      if (!id) {
        e('VEH-E-ID-MISSING', null, `${source}.${key} required`, source, 'missing id');
        continue;
      }
      if (seen.has(id)) e('VEH-E-DUP-ID', id, `${source}.${key} unique`, source, `duplicate ${id}`);
      seen.set(id, item);
    }
    return seen;
  };
  const value3 = (value) => isNum3(value);

  if (!artifact || artifact.schemaVersion !== SCHEMA_VERSION) e('VEH-E-SCHEMA', null, 'schemaVersion', 'artifact', `expected ${SCHEMA_VERSION}`);
  if (!artifact || artifact.status !== 'CANDIDATE_NOT_FROZEN') e('VEH-E-STATUS', null, 'status CANDIDATE_NOT_FROZEN', 'artifact', 'candidate status required');
  for (const input of artifact?.inputArtifacts || []) {
    if (!input.role || !input.path || !/^[0-9a-f]{64}$/.test(input.sha256 || '')) {
      e('VEH-E-INPUT', input.role ?? null, 'role/path/sha256', 'inputArtifacts', 'input pin incomplete');
    }
    if (input.status === 'APPROVED' || input.declaredStatus === 'APPROVED') e('VEH-E-INPUT', input.role, 'input not approved', 'inputArtifacts', 'approved input cannot be re-pinned as candidate');
  }

  const vehicle = artifact?.vehicleProject;
  if (!vehicle) {
    e('VEH-E-PROJECT', null, 'vehicleProject', 'vehicleProject', 'missing vehicle project');
    return { ok: false, errors, warnings };
  }
  if (!vehicle.projectId || !Number.isInteger(vehicle.revision) || vehicle.revision < 1) e('VEH-E-PROJECT', vehicle.projectId ?? null, 'projectId/revision', 'vehicleProject', 'identity required');
  if (!vehicle.variant?.variantId || !['GEN1', 'GEN3'].includes(vehicle.variant?.generation)) e('VEH-E-VARIANT', vehicle.variant?.variantId ?? null, 'variantId/GEN1|GEN3', 'vehicleProject.variant', 'explicit variant required');

  const systemIds = unique(vehicle.systems, 'systemId', 'vehicleProject.systems');
  unique(vehicle.assemblyDefinitions, 'assemblyId', 'vehicleProject.assemblyDefinitions');
  const assemblyInstanceIds = unique(vehicle.assemblyInstances, 'assemblyInstanceId', 'vehicleProject.assemblyInstances');
  const partDefinitionIds = unique(vehicle.partDefinitions, 'partId', 'vehicleProject.partDefinitions');
  const partInstanceIds = unique(vehicle.partInstances, 'instanceId', 'vehicleProject.partInstances');
  const frameIds = unique(vehicle.mountFrames, 'frameId', 'vehicleProject.mountFrames');
  unique(vehicle.references, 'refId', 'vehicleProject.references');
  unique(vehicle.bomLines, 'bomLineId', 'vehicleProject.bomLines');

  for (const system of vehicle.systems || []) {
    if (system.parentSystemId && !systemIds.has(system.parentSystemId)) e('VEH-E-PARENT-MISSING', system.systemId, 'parentSystemId', 'systems', `missing ${system.parentSystemId}`);
  }
  for (const definition of vehicle.assemblyDefinitions || []) {
    if (!systemIds.has(definition.systemId)) e('VEH-E-REF-MISSING', definition.assemblyId, 'systemId', 'assemblyDefinitions', `missing ${definition.systemId}`);
  }
  for (const assembly of vehicle.assemblyInstances || []) {
    if (!vehicle.assemblyDefinitions.some((definition) => definition.assemblyId === assembly.definitionRef)) e('VEH-E-REF-MISSING', assembly.assemblyInstanceId, 'definitionRef', 'assemblyInstances', `missing ${assembly.definitionRef}`);
    if (!systemIds.has(assembly.systemId)) e('VEH-E-REF-MISSING', assembly.assemblyInstanceId, 'systemId', 'assemblyInstances', `missing ${assembly.systemId}`);
    if (!frameIds.has(assembly.frameId)) e('VEH-E-REF-MISSING', assembly.assemblyInstanceId, 'frameId', 'assemblyInstances', `missing ${assembly.frameId}`);
    if (assembly.parentAssemblyInstanceId && !assemblyInstanceIds.has(assembly.parentAssemblyInstanceId)) e('VEH-E-REF-MISSING', assembly.assemblyInstanceId, 'parentAssemblyInstanceId', 'assemblyInstances', 'missing parent');
  }
  for (const definition of vehicle.partDefinitions || []) {
    if (!definition.partId?.startsWith('PART-')) e('VEH-E-ID-MISSING', definition.partId, 'PART-*', 'partDefinitions', 'bad part id');
    if (!systemIds.has(definition.systemId)) e('VEH-E-REF-MISSING', definition.partId, 'systemId', 'partDefinitions', `missing ${definition.systemId}`);
    if (!definition.evidenceInherited) e('VEH-E-EVIDENCE-UPGRADE', definition.partId, 'evidenceInherited', 'partDefinitions', 'missing');
    if (definition.geometryStatus === 'NO_GEOMETRY' && (definition.geometryValue != null || definition.glb != null || definition.mesh != null || definition.assetId != null)) e('VEH-E-GEOMETRY-CLAIM', definition.partId, 'NO_GEOMETRY has no geometry', 'partDefinitions', 'fabricated geometry attached');
  }
  for (const instance of vehicle.partInstances || []) {
    if (!instance.instanceId?.startsWith('PI-')) e('VEH-E-ID-MISSING', instance.instanceId, 'PI-*', 'partInstances', 'bad instance id');
    const definition = vehicle.partDefinitions.find((item) => item.partId === instance.partId);
    if (!definition) e('VEH-E-REF-MISSING', instance.instanceId, 'partId', 'partInstances', `missing ${instance.partId}`);
    if (!assemblyInstanceIds.has(instance.assemblyInstanceId)) e('VEH-E-REF-MISSING', instance.instanceId, 'assemblyInstanceId', 'partInstances', `missing ${instance.assemblyInstanceId}`);
    if (!frameIds.has(instance.frameId)) e('VEH-E-REF-MISSING', instance.instanceId, 'frameId', 'partInstances', `missing ${instance.frameId}`);
    if (rank(instance.evidence?.valueBasis) > rank(definition?.evidenceInherited)) e('VEH-E-EVIDENCE-UPGRADE', instance.instanceId, 'instance valueBasis <= definition', 'partInstances', `${definition?.evidenceInherited} -> ${instance.evidence?.valueBasis}`);
    if (rank(instance.evidence?.identityBasis) > rank(definition?.evidenceInherited)) e('VEH-E-EVIDENCE-UPGRADE', instance.instanceId, 'instance identityBasis <= definition', 'partInstances', `${definition?.evidenceInherited} -> ${instance.evidence?.identityBasis}`);
    if (instance.claimedEvidence && rank(instance.claimedEvidence) > rank(instance.evidenceInherited)) e('VEH-E-EVIDENCE-UPGRADE', instance.instanceId, 'claimedEvidence <= evidenceInherited', 'partInstances', `${instance.evidenceInherited} -> ${instance.claimedEvidence}`);
    if (instance.claimedEvidence === 'SOURCED' && !(instance.sourceEvidenceIds || []).length) e('VEH-E-SOURCE-MISSING', instance.instanceId, 'SOURCED requires source', 'partInstances', 'no source');
    if (!Number.isInteger(instance.quantity?.perAssembly) || instance.quantity.perAssembly < 1) e('VEH-E-QTY', instance.instanceId, 'quantity.perAssembly>=1', 'partInstances', 'bad quantity');
    if (instance.quantitySemantics !== 'ONE_PHYSICAL_PIECE_PER_INSTANCE') e('VEH-E-QTY', instance.instanceId, 'quantity semantics', 'partInstances', 'must be one physical piece per PI instance');
    if (instance.geometryStatus === 'NO_GEOMETRY' && (instance.glb != null || instance.mesh != null || instance.assetId != null || instance.geometryValue != null || instance.fidelityClaim != null)) e('VEH-E-GEOMETRY-CLAIM', instance.instanceId, 'NO_GEOMETRY has no geometry', 'partInstances', 'fabricated geometry attached');
    if (instance.geometryStatus !== 'NO_GEOMETRY') w('VEH-W-COVERAGE-GAP', instance.instanceId, 'geometry status', 'partInstances', `non-NO_GEOMETRY status ${instance.geometryStatus}`);
  }
  for (const frame of vehicle.mountFrames || []) {
    if (frame.anchorStatus === 'UNANCHORED_UNKNOWN') {
      if (frame.origin !== null || frame.rotation !== null || frame.units !== null) e('VEH-E-FRAME-STATE', frame.frameId, 'unanchored frame has null transform', 'mountFrames', 'invented frame anchor');
      if (frame.worldFrame !== 'UNFROZEN_PENDING_RP07') e('VEH-E-FRAME-STATE', frame.frameId, 'worldFrame UNFROZEN_PENDING_RP07', 'mountFrames', frame.worldFrame);
      if (frame.globalScaleForbidden !== true) e('VEH-E-SCALE', frame.frameId, 'globalScaleForbidden', 'mountFrames', 'global scale not forbidden');
    } else if (frame.anchorStatus === 'ANCHORED') {
      if (!value3(frame.origin) || !isMat3(frame.rotation) || frame.units !== 'm') e('VEH-E-UNIT', frame.frameId, 'anchored frame m/origin/rotation', 'mountFrames', 'bad anchored frame');
    } else {
      e('VEH-E-FRAME-STATE', frame.frameId, 'anchorStatus', 'mountFrames', frame.anchorStatus);
    }
    if (!assemblyInstanceIds.has(frame.assemblyInstanceId)) e('VEH-E-REF-MISSING', frame.frameId, 'assemblyInstanceId', 'mountFrames', `missing ${frame.assemblyInstanceId}`);
  }
  for (const reference of vehicle.references || []) {
    if (reference.countedInBom !== false || reference.bom === true) e('VEH-E-REF-BOM', reference.refId, 'REF not BOM', 'references', 'reference counted as BOM');
    if (!reference.canonicalRef) e('VEH-E-REF-MISSING', reference.refId, 'canonicalRef', 'references', 'missing target');
  }
  for (const line of vehicle.bomLines || []) {
    if (!assemblyInstanceIds.has(line.assemblyInstanceId)) e('VEH-E-BOM', line.bomLineId, 'assemblyInstanceId', 'bomLines', 'missing assembly');
    if (!partDefinitionIds.has(line.partRef)) e('VEH-E-BOM', line.bomLineId, 'partRef', 'bomLines', `missing ${line.partRef}`);
    if (!Number.isInteger(line.qtyPerAssembly) || line.qtyPerAssembly < 1) e('VEH-E-BOM', line.bomLineId, 'qtyPerAssembly>=1', 'bomLines', 'bad qty');
    let sum = 0;
    for (const instanceId of line.instanceIds || []) {
      const instance = partInstanceIds.get(instanceId);
      if (!instance) e('VEH-E-BOM', line.bomLineId, 'instanceIds', 'bomLines', `missing ${instanceId}`);
      else sum += instance.quantity.perAssembly;
    }
    if (sum !== line.qtyPerAssembly) e('VEH-E-BOM', line.bomLineId, 'qty = sum(instance qty)', 'bomLines', `${sum} != ${line.qtyPerAssembly}`);
    if (partInstanceIds.get(line.instanceIds?.[0])?.assemblyInstanceId !== line.assemblyInstanceId) e('VEH-E-BOM', line.bomLineId, 'instances in parent', 'bomLines', 'instance in another assembly');
  }
  const guards = vehicle.variantGuards;
  if (guards) {
    const instantiated = new Set(vehicle.partInstances.map((instance) => instance.partId));
    for (const partId of guards.requiredInstantiatedParts || []) {
      if (!instantiated.has(partId)) e('VEH-E-VARIANT-MISMATCH', partId, 'required part instantiated', 'vehicleProject.variantGuards', `missing ${partId}`);
    }
    for (const partId of guards.forbiddenInstantiatedParts || []) {
      if (instantiated.has(partId)) e('VEH-E-VARIANT-MISMATCH', partId, 'forbidden part not instantiated', 'vehicleProject.variantGuards', `${partId} belongs to another variant`);
    }
  }
  const qtyAudit = computeQtyAudit(vehicle.partDefinitions, vehicle.partInstances, artifact.inheritedIssues?.qtyConflicts || []);
  if (JSON.stringify(qtyAudit) !== JSON.stringify(artifact.qtyAudit)) e('VEH-E-QTY-AUDIT', null, 'qty audit reproducible', 'qtyAudit', 'stale or tampered audit');
  if (artifact.qtyAudit?.status !== 'CONSISTENT') w('VEH-W-QTY-AUDIT-DIVERGED', null, 'declared conflicts match derived', 'qtyAudit', artifact.qtyAudit?.status ?? 'missing');

  const deep = artifact.deepSlice;
  const poseRun = artifact.poseRun;
  if (!deep || !poseRun) {
    e('VEH-E-PROJECT', null, 'deepSlice/poseRun', 'artifact', 'missing integration payload');
  } else {
    const deepFrameIds = unique(deep.frames, 'frameId', 'deepSlice.frames');
    for (const frame of deep.frames || []) {
      if (frame.units !== 'm') e('VEH-E-UNIT', frame.frameId, 'demo frame m', 'deepSlice.frames', frame.units);
      if (!value3(frame.origin) || !isMat3(frame.rotation)) e('VEH-E-UNIT', frame.frameId, 'origin/rotation', 'deepSlice.frames', 'bad transform');
      else if (Math.abs(det3(frame.rotation) - 1) > 1e-9) e('VEH-E-MIRROR', frame.frameId, 'det=+1', 'deepSlice.frames', 'improper rotation');
      if (frame.parentFrameId && !deepFrameIds.has(frame.parentFrameId)) e('VEH-E-REF-MISSING', frame.frameId, 'parentFrameId', 'deepSlice.frames', `missing ${frame.parentFrameId}`);
      if (frame.scale != null && frame.scale !== 1) e('VEH-E-SCALE', frame.frameId, 'scale=1', 'deepSlice.frames', String(frame.scale));
    }
    for (const hardpoint of deep.hardpoints || []) {
      if (!value3(hardpoint.value)) e('VEH-E-UNIT', hardpoint.name, 'hardpoint value[3]', 'deepSlice.hardpoints', 'bad hardpoint');
      if (hardpoint.kind === 'DIRECTION') {
        if (hardpoint.unit !== '1') e('VEH-E-UNIT', hardpoint.name, 'direction unitless', 'deepSlice.hardpoints', hardpoint.unit);
        if (Math.abs(norm3(hardpoint.value) - 1) > 1e-6) e('VEH-E-UNIT', hardpoint.name, 'direction normalized', 'deepSlice.hardpoints', 'not unit length');
      } else if (hardpoint.unit !== 'm') {
        e('VEH-E-UNIT', hardpoint.name, 'hardpoint m', 'deepSlice.hardpoints', hardpoint.unit);
      }
      if (hardpoint.valueBasis !== 'DEMO_ASSUMPTION') e('VEH-E-EVIDENCE-UPGRADE', hardpoint.name, 'DEMO_ASSUMPTION', 'deepSlice.hardpoints', hardpoint.valueBasis);
    }
    const jointIds = unique(deep.joints, 'jointId', 'deepSlice.joints');
    const constraintIds = unique(deep.constraints, 'constraintId', 'deepSlice.constraints');
    for (const joint of deep.joints || []) {
      if (!JOINT_TYPES.has(joint.type)) e('VEH-E-JOINT-TYPE', joint.jointId, 'joint type', 'deepSlice.joints', joint.type);
      if (constraintIds.has(joint.jointId)) e('VEH-E-CONSTRAINT-AS-JOINT', joint.jointId, 'constraint must not be joint', 'deepSlice.joints', 'constraint id in joints');
      if (vehicle.mountFrames.some((frame) => frame.frameId === joint.frameA || frame.frameId === joint.frameB)) {
        e('VEH-E-JOINT-NO-HARDPOINT', joint.jointId, 'joint frame cannot be an unanchored R-16 mount frame', 'deepSlice.joints', `${joint.frameA} / ${joint.frameB}`);
      } else if (!deepFrameIds.has(joint.frameA) || !deepFrameIds.has(joint.frameB)) {
        e('VEH-E-JOINT-FRAME', joint.jointId, 'frameA/frameB', 'deepSlice.joints', 'missing frame');
      }
      if (joint.solverEligible) {
        if (!joint.hardpoint || joint.hardpointBasis === 'UNKNOWN') e('VEH-E-JOINT-NO-HARDPOINT', joint.jointId, 'solver joint requires hardpoint', 'deepSlice.joints', 'no hardpoint');
        if (joint.evidenceInherited !== 'DEMO_ASSUMPTION') e('VEH-E-EVIDENCE-UPGRADE', joint.jointId, 'DEMO_ASSUMPTION', 'deepSlice.joints', joint.evidenceInherited);
      }
      if (['REVOLUTE', 'PRISMATIC', 'CYLINDRICAL', 'UNIVERSAL'].includes(joint.type)) {
        if (!value3(joint.axisA) || Math.abs(norm3(joint.axisA) - 1) > 1e-6) e('VEH-E-JOINT-AXIS', joint.jointId, 'axisA normalized', 'deepSlice.joints', 'bad axis');
      }
      if (joint.limits) {
        const { min, max, unit } = joint.limits;
        if (!isNum(min) || !isNum(max) || min > max) e('VEH-E-JOINT-LIMIT', joint.jointId, 'limits min<=max', 'deepSlice.joints', 'bad limits');
        const expected = ['REVOLUTE', 'UNIVERSAL'].includes(joint.type) ? 'rad' : ['PRISMATIC', 'CYLINDRICAL'].includes(joint.type) ? 'm' : null;
        if (expected && unit !== expected) e('VEH-E-JOINT-LIMIT', joint.jointId, `limit unit ${expected}`, 'deepSlice.joints', unit);
      }
    }
    for (const constraint of deep.constraints || []) {
      if (jointIds.has(constraint.constraintId)) e('VEH-E-CONSTRAINT-AS-JOINT', constraint.constraintId, 'joint id in constraints', 'deepSlice.constraints', 'collision');
      if (!CONSTRAINT_TYPES.has(constraint.type)) e('VEH-E-CONSTRAINT-TYPE', constraint.constraintId, 'constraint type', 'deepSlice.constraints', constraint.type);
      const expected = constraint.type === 'OUTPUT' ? 'OUTPUT' : 'CONSTRAINT';
      if (constraint.jointOrConstraint !== expected) e('VEH-E-CONSTRAINT-KIND', constraint.constraintId, `jointOrConstraint=${expected}`, 'deepSlice.constraints', constraint.jointOrConstraint);
      for (const instanceId of constraint.boundInstanceIds || []) {
        if (!partInstanceIds.has(instanceId) && !deep.instanceBindings.some((binding) => binding.sourceInstanceId === instanceId)) e('VEH-E-CONSTRAINT-BINDING', constraint.constraintId, 'boundInstanceIds', 'deepSlice.constraints', `missing ${instanceId}`);
      }
      if (constraint.type === 'OUTPUT' && (!constraint.output || !isNum(constraint.output.valueM) || constraint.output.unit !== 'm')) e('VEH-E-CONSTRAINT-KIND', constraint.constraintId, 'OUTPUT value/unit', 'deepSlice.constraints', 'bad output');
    }
    for (const rejected of deep.rejectedJoints || []) {
      if (!rejected.code || !rejected.reason) e('VEH-E-JOINT-TYPE', rejected.jointId, 'rejected joint documents code/reason', 'deepSlice.rejectedJoints', 'missing evidence');
    }

    if (poseRun.frameId !== deep.frame.frameId) e('VEH-E-POSE-FRAME', poseRun.runId, 'frameId matches deepSlice', 'poseRun', poseRun.frameId);
    if (poseRun.units !== 'm' || poseRun.up !== 'Y') e('VEH-E-UNIT', poseRun.runId, 'm/Y-up', 'poseRun', `${poseRun.units}/${poseRun.up}`);
    if (poseRun.unitsPolicy?.conversionFactor !== 0.001 || poseRun.unitsPolicy?.implicitGlobalScale !== false) e('VEH-E-UNIT', poseRun.runId, 'mm->m explicit 0.001 only', 'poseRun.unitsPolicy', 'bad conversion policy');
    if (poseRun.scalePolicy?.globalScale !== 1 || poseRun.scalePolicy?.implicitScale !== false) e('VEH-E-SCALE', poseRun.runId, 'globalScale=1 implicitScale=false', 'poseRun', 'implicit scale');
    if (poseRun.runPolicy?.staleRunsPublishPoses !== false) e('VEH-E-RUN-STALE', poseRun.runId, 'stale runs publish no poses', 'poseRun.runPolicy', 'stale policy');
    if (poseRun.valueBasis !== 'DEMO_ASSUMPTION' || poseRun.provenance !== 'FICTIONAL_FIXTURE') e('VEH-E-EVIDENCE-UPGRADE', poseRun.runId, 'DEMO_ASSUMPTION/FICTIONAL_FIXTURE', 'poseRun', `${poseRun.valueBasis}/${poseRun.provenance}`);
    if (!Number.isInteger(poseRun.inputRevision) || poseRun.inputRevision < 1) e('VEH-E-RUN-REVISION', poseRun.runId, 'inputRevision>=1', 'poseRun', String(poseRun.inputRevision));
    if (poseRun.projectRevision !== vehicle.revision) e('VEH-E-RUN-STALE', poseRun.runId, 'projectRevision=vehicle revision', 'poseRun', `${poseRun.projectRevision} != ${vehicle.revision}`);
    if (poseRun.status === 'CURRENT' && poseRun.inputRevision !== vehicle.revision) e('VEH-E-RUN-STALE', poseRun.runId, 'CURRENT run matches revision', 'poseRun', `${poseRun.inputRevision} != ${vehicle.revision}`);
    if (poseRun.status === 'STALE' && poseRun.poses.length > 0) e('VEH-E-RUN-STALE', poseRun.runId, 'STALE run publishes no current poses', 'poseRun', 'poses present');
    const poseInstanceIds = new Set();
    for (const pose of poseRun.poses || []) {
      if (poseInstanceIds.has(pose.instanceId)) e('VEH-E-DUP-ID', pose.instanceId, 'pose instance unique', 'poseRun.poses', 'duplicate pose');
      poseInstanceIds.add(pose.instanceId);
      if (!poseRun.poses.every((item) => item.bindingStatus === 'BOUND')) e('VEH-E-POSE-UNBOUND', pose.instanceId, 'bindingStatus BOUND', 'poseRun.poses', pose.bindingStatus);
      if (!partInstanceIds.has(pose.instanceId)) e('VEH-E-POSE-INSTANCE', pose.instanceId, 'canonical PI-* exists', 'poseRun.poses', 'unbound canonical identity');
      if (!value3(pose.positionM)) e('VEH-E-POSE-INSTANCE', pose.instanceId, 'positionM[3]', 'poseRun.poses', 'bad position');
      if (!Array.isArray(pose.scale) || pose.scale.length !== 3 || pose.scale.some((value) => value !== 1)) e('VEH-E-POSE-SCALE', pose.instanceId, 'scale=[1,1,1]', 'poseRun.poses', JSON.stringify(pose.scale));
      if (!Array.isArray(pose.quaternionXYZW) || pose.quaternionXYZW.length !== 4 || Math.abs(Math.hypot(...pose.quaternionXYZW) - 1) > 1e-6) e('VEH-E-POSE-QUAT', pose.instanceId, 'unit quaternion', 'poseRun.poses', 'bad quaternion');
      if (pose.geometryStatus !== 'NO_GEOMETRY' || pose.glb != null || pose.mesh != null || pose.assetId != null) e('VEH-E-GEOMETRY-CLAIM', pose.instanceId, 'NO_GEOMETRY', 'poseRun.poses', 'pose claims geometry');
      if (pose.evidence?.valueBasis !== 'DEMO_ASSUMPTION') e('VEH-E-EVIDENCE-UPGRADE', pose.instanceId, 'DEMO_ASSUMPTION', 'poseRun.poses', pose.evidence?.valueBasis);
    }
    const displayByInstance = new Map();
    for (const display of poseRun.displayTransforms || []) {
      displayByInstance.set(display.instanceId, display);
      if (display.units !== 'm' || display.up !== 'Y' || display.frameId !== poseRun.frameId) e('VEH-E-UNIT', display.instanceId, 'display m/Y-up/demo frame', 'poseRun.displayTransforms', `${display.units}/${display.up}/${display.frameId}`);
      if (display.production !== false) e('VEH-E-DISPLAY', display.instanceId, 'demo display is not production', 'poseRun.displayTransforms', 'production flag');
      const matrix = display.matrixWorld;
      if (!Array.isArray(matrix) || matrix.length !== 4 || matrix.some((row) => !Array.isArray(row) || row.length !== 4 || row.some((value) => !isNum(value)))) {
        e('VEH-E-DISPLAY', display.instanceId, '4x4 matrixWorld', 'poseRun.displayTransforms', 'bad matrix');
        continue;
      }
      if (matrix[3].some((value, index) => value !== (index === 3 ? 1 : 0))) e('VEH-E-DISPLAY', display.instanceId, 'bottom row 0,0,0,1', 'poseRun.displayTransforms', 'bad affine matrix');
      const rotation = [matrix[0].slice(0, 3), matrix[1].slice(0, 3), matrix[2].slice(0, 3)];
      const determinant = det3(rotation);
      if (Math.abs(determinant + 1) < 1e-9) e('VEH-E-MIRROR', display.instanceId, 'det=+1 unless explicit mirror', 'poseRun.displayTransforms', 'improper display rotation');
      else if (Math.abs(determinant - 1) > 1e-6) e('VEH-E-DISPLAY', display.instanceId, 'rigid rotation det=1', 'poseRun.displayTransforms', `det=${determinant}`);
      for (let column = 0; column < 3; column++) {
        if (Math.abs(mat3ColumnNorm(rotation, column) - 1) > 1e-6) e('VEH-E-SCALE', display.instanceId, 'display column unit length', 'poseRun.displayTransforms', `column ${column}`);
      }
      const pose = (poseRun.poses || []).find((item) => item.instanceId === display.instanceId);
      if (!pose) e('VEH-E-DISPLAY', display.instanceId, 'display has a bound pose', 'poseRun.displayTransforms', 'orphan display');
      else if (Math.abs(matrix[0][3] - pose.positionM[0]) > 1e-9 || Math.abs(matrix[1][3] - pose.positionM[1]) > 1e-9 || Math.abs(matrix[2][3] - pose.positionM[2]) > 1e-9) e('VEH-E-DISPLAY', display.instanceId, 'translation equals pose position', 'poseRun.displayTransforms', 'mismatch');
    }
    for (const pose of poseRun.poses || []) {
      if (!displayByInstance.has(pose.instanceId)) e('VEH-E-DISPLAY', pose.instanceId, 'bound pose has display transform', 'poseRun.displayTransforms', 'missing');
    }
    for (const unbound of poseRun.unboundPoses || []) {
      if (unbound.published !== false || unbound.instanceId != null) e('VEH-E-POSE-UNBOUND-PUBLISHED', unbound.sourceInstanceId, 'unbound pose not published', 'poseRun.unboundPoses', 'published or has canonical id');
      if (poseInstanceIds.has(unbound.instanceId)) e('VEH-E-POSE-UNBOUND-PUBLISHED', unbound.sourceInstanceId, 'unbound not in poses', 'poseRun.unboundPoses', 'duplicate canonical identity');
      if (!unbound.reason) e('VEH-E-POSE-UNBOUND', unbound.sourceInstanceId, 'reason', 'poseRun.unboundPoses', 'missing reason');
    }
    if (poseRun.forces !== null || poseRun.forceBasis !== 'UNKNOWN') e('VEH-E-FORCES', poseRun.runId, 'forces null/UNKNOWN', 'poseRun', 'unsupported force claim');
    if (poseRun.clearance && poseRun.clearance.notCadCollision !== true) e('VEH-E-CLEARANCE', poseRun.runId, 'notCadCollision', 'poseRun', 'proxy presented as CAD collision');
  }

  if (!artifact.domainView) {
    e('VEH-E-DOMAIN-VIEW', null, 'domainView', 'domainView', 'missing R-17-compatible projection');
  } else {
    const report = validateProject(artifact.domainView);
    for (const error of report.errors) {
      e('VEH-E-DOMAIN-VIEW', error.objectId, error.rule, `domainView:${error.source}`, `${error.code} ${error.message}`);
    }
    const viewInstances = new Map((artifact.domainView.partInstances || []).map((instance) => [instance.instanceId, instance]));
    for (const instance of artifact.domainView.partInstances || []) {
      const canonical = partInstanceIds.get(instance.engineeringInstanceId);
      if (!canonical) e('VEH-E-DOMAIN-BINDING', instance.instanceId, 'engineeringInstanceId exists', 'domainView.partInstances', `missing ${instance.engineeringInstanceId}`);
      else if (canonical.partId !== instance.partId) e('VEH-E-DOMAIN-BINDING', instance.instanceId, 'partId matches canonical', 'domainView.partInstances', `${canonical.partId} != ${instance.partId}`);
      if (instance.aliasStatus !== 'VIEW_LOCAL_NOT_CANONICAL') e('VEH-E-DOMAIN-BINDING', instance.instanceId, 'aliasStatus', 'domainView.partInstances', instance.aliasStatus);
    }
    for (const pose of artifact.poseRun?.poses || []) {
      if (![...viewInstances.values()].some((instance) => instance.engineeringInstanceId === pose.instanceId)) {
        e('VEH-E-DOMAIN-BINDING', pose.instanceId, 'bound pose has domain-view instance', 'domainView.partInstances', 'missing projected instance');
      }
    }
    const run = (artifact.domainView.simulationRuns || [])[0];
    if (run && run.inputRevision !== artifact.domainView.revision) e('VEH-E-RUN-STALE', run.runId, 'domain view run revision', 'domainView.simulationRuns', `${run.inputRevision} != ${artifact.domainView.revision}`);
  }

  const recomputed = computeCoverage(artifact);
  if (JSON.stringify(recomputed) !== JSON.stringify(artifact.coverage)) e('VEH-E-COVERAGE-STALE', null, 'coverage reproducible', 'coverage', 'declared coverage does not match arrays');
  if (artifact.coverage?.r16?.noGeometryInstances !== artifact.coverage?.r16?.partInstances) w('VEH-W-COVERAGE-GAP', null, 'all instances NO_GEOMETRY', 'coverage', 'some instance claims non-missing geometry');

  const decisionIds = unique(artifact.decisions, 'decisionId', 'decisions');
  const conflictIds = unique(artifact.conflicts, 'conflictId', 'conflicts');
  for (const conflict of artifact.conflicts || []) {
    if (!['P0', 'P1', 'P2'].includes(conflict.severity)) e('VEH-E-CONFLICT', conflict.conflictId, 'severity P0|P1|P2', 'conflicts', conflict.severity);
    if (!decisionIds.has(conflict.decisionId)) e('VEH-E-DECISION', conflict.conflictId, 'decisionId exists', 'conflicts', `missing ${conflict.decisionId}`);
  }
  for (const decision of artifact.decisions || []) {
    if (decision.status !== 'PROPOSED_PENDING_GPT6') e('VEH-E-DECISION', decision.decisionId, 'proposed pending GPT-6', 'decisions', decision.status);
  }

  return { ok: errors.length === 0, errors, warnings, counts: { errors: errors.length, warnings: warnings.length, decisions: decisionIds.size, conflicts: conflictIds.size } };
}

export function summaryOf(artifact, report, hashReport) {
  return {
    schemaVersion: artifact.schemaVersion,
    artifactId: artifact.artifactId,
    status: artifact.status,
    validation: { ok: report.ok, errors: report.errors, warnings: report.warnings },
    inputHashes: { ok: hashReport.ok, errors: hashReport.errors },
    coverage: artifact.coverage,
    qtyAudit: {
      status: artifact.qtyAudit.status,
      derivedMismatches: artifact.qtyAudit.derivedMismatchIds.length,
      declaredConflicts: artifact.qtyAudit.declaredConflictIds.length,
      unlisted: artifact.qtyAudit.unlistedMismatchIds,
      declaredButMatching: artifact.qtyAudit.declaredButMatchingIds
    },
    conflicts: artifact.conflicts.map((conflict) => ({ conflictId: conflict.conflictId, severity: conflict.severity, topic: conflict.topic, decisionId: conflict.decisionId })),
    decisions: artifact.decisions.map((decision) => decision.decisionId)
  };
}

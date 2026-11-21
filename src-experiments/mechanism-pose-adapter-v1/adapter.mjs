/**
 * 把运动流适配到 R-27 快照修订。只返回新对象，不修改快照或生产页面。
 */
import { createHash } from 'node:crypto';
import { buildMotionStream } from '../mechanism-stream-v1/stream.mjs';

export const SNAPSHOT_EXPECTATION = {
  snapshotId: 'SNAP-R27-R16-R21-R22-R23-01',
  sourceRevision: 1,
  variantId: 'VAR-R16-BOF-ICE',
  frameId: 'FR-VEHICLE'
};

const RIGID = {
  'PI-20-001-FL': 'UPPER_ARM',
  'PI-20-008-FL': 'LOWER_ARM',
  'PI-20-016-FL': 'KNUCKLE'
};

function quatNorm(q) {
  return Math.hypot(q[0], q[1], q[2], q[3]);
}

function blocked(code, reason) {
  return {
    legalAssembly: false,
    playbackAllowed: false,
    status: code,
    reason,
    frames: [],
    force: 'N/A',
    motionValueBasis: 'DEMO_ASSUMPTION',
    geometryValueBasis: 'UNKNOWN'
  };
}

export function buildCanonicalStream(options = {}) {
  const source = buildMotionStream({
    inputRevision: SNAPSHOT_EXPECTATION.sourceRevision,
    runId: 'RUN-SLA-FL-SNAP1-001',
    declaredLengthsM: options.declaredLengthsM,
    tieLengthOverrideM: options.tieLengthOverrideM,
    omitConstraints: options.omitConstraints,
    variant: options.variant
  });
  if (!source.legalAssembly) return blocked(source.status || 'BLOCKED', source.code || source.category);
  const frames = source.frames.map((frame) => {
    const published = [];
    const omitted = [];
    for (const item of frame.instances) {
      if (RIGID[item.instanceId]) {
        published.push({
          runId: 'RUN-SLA-FL-SNAP1-001',
          sourceRevision: SNAPSHOT_EXPECTATION.sourceRevision,
          frameBasis: { frameId: 'FR-VEHICLE', units: 'm', basis: 'DEMO_ASSUMPTION', notEqualTo: 'FR-WHEEL-END-FL' },
          instanceId: item.instanceId,
          role: RIGID[item.instanceId],
          positionMeters: item.position,
          quaternion: item.quaternion,
          residual: item.closureErrorM,
          validity: 'VALID',
          scale: item.scale,
          published: true
        });
      } else if (item.definitionId === 'PART-20-075') {
        omitted.push({
          role: 'TIEROD',
          definitionId: 'PART-20-075',
          instanceId: null,
          requiredButDeferred: true,
          validity: 'REQUIRED_DEFERRED',
          published: false,
          observedPositionMeters: item.position
        });
      } else if (item.bindingStatus === 'UNBOUND_NO_HUB_BODY') {
        omitted.push({
          role: 'HUB',
          instanceId: null,
          candidateInstanceId: 'PI-30-006-FL',
          roleOnly: true,
          bindingBasis: 'WHEEL_CENTER_AND_SPINDLE_NOT_FLANGE_FRAME',
          validity: 'ROLE_ONLY',
          published: false,
          notARigidPartPose: true,
          observedPositionMeters: item.position
        });
      }
    }
    return {
      frameIndex: frame.frameIndex,
      travelM: frame.travelM,
      sourceRevision: SNAPSHOT_EXPECTATION.sourceRevision,
      frameBasis: { frameId: 'FR-VEHICLE', units: 'm', basis: 'DEMO_ASSUMPTION' },
      validity: 'VALID',
      instances: published,
      omitted,
      constraints: frame.constraints,
      clearance: frame.clearance,
      force: 'N/A'
    };
  });
  const rebaseHash = createHash('sha256').update(JSON.stringify(frames)).digest('hex');
  return {
    schema: 'carlab.canonicalMotion/0.1-proposal',
    legalAssembly: true,
    playbackAllowed: true,
    status: 'CURRENT',
    snapshotId: SNAPSHOT_EXPECTATION.snapshotId,
    sourceRevision: SNAPSHOT_EXPECTATION.sourceRevision,
    variantId: SNAPSHOT_EXPECTATION.variantId,
    frames,
    simulationRun: {
      runId: 'RUN-SLA-FL-SNAP1-001',
      sourceRevision: 1,
      inputRevision: 1,
      solver: 'src-experiments/mechanism-stream-v1/stream.mjs',
      status: 'CURRENT',
      frameId: 'FR-VEHICLE',
      resultHash: rebaseHash,
      rebase: {
        fromRunId: 'RUN-SLA-FL-DEMO-001',
        fromInputRevision: 3,
        fromResultHash: 'd3c7fd2430861d4db4a8e426e39337a243988d225ba6861698355e757a6732c0',
        toSourceRevision: 1,
        rebaseHash
      }
    },
    force: 'N/A',
    motionValueBasis: 'DEMO_ASSUMPTION',
    geometryValueBasis: 'UNKNOWN',
    conflicts: [
      {
        code: 'R28-DISC-HUB',
        r22: 'BOUND_TO_PI-30-006-FL',
        r28: 'ROLE_ONLY',
        reason: '轮心加旋转轴不是独立轮毂法兰的已证实局部坐标。'
      },
      {
        code: 'R28-DISC-FRAME',
        demoFrame: 'FR-VEHICLE',
        otherFrame: 'FR-WHEEL-END-FL',
        reason: 'R-22 记录两套原点相差约 1.277 m。本流不合并坐标。'
      }
    ]
  };
}

export function applyPose(snapshot, frame, stream = null) {
  const source = stream || { sourceRevision: frame?.sourceRevision, variantId: SNAPSHOT_EXPECTATION.variantId, simulationRun: { frameId: 'FR-VEHICLE' } };
  if (!snapshot || snapshot.revision !== source.sourceRevision) {
    return { playbackAllowed: false, status: 'STALE', poses: {}, omitted: [], reason: '快照修订与运动流不一致' };
  }
  if (snapshot.variantId && source.variantId && snapshot.variantId !== source.variantId) {
    return { playbackAllowed: false, status: 'BLOCKED', poses: {}, omitted: [], reason: '变型不一致' };
  }
  if ((frame?.frameBasis?.frameId || source.simulationRun.frameId) !== 'FR-VEHICLE') {
    return { playbackAllowed: false, status: 'BLOCKED', poses: {}, omitted: [], reason: '坐标系不一致' };
  }
  if (!frame || frame.validity !== 'VALID') {
    return { playbackAllowed: false, status: 'BLOCKED', poses: {}, omitted: frame?.omitted || [], reason: '该帧无效' };
  }
  const poses = {};
  for (const item of frame.instances) {
    if (item.published && item.validity === 'VALID' && item.instanceId) {
      poses[item.instanceId] = {
        positionMeters: item.positionMeters,
        quaternion: item.quaternion,
        validity: item.validity
      };
    }
  }
  return {
    playbackAllowed: true,
    status: 'CURRENT',
    snapshotId: snapshot.snapshotId,
    runId: frame.instances[0]?.runId || null,
    sourceRevision: frame.sourceRevision,
    frameIndex: frame.frameIndex,
    poses,
    omitted: frame.omitted,
    force: 'N/A',
    motionValueBasis: 'DEMO_ASSUMPTION'
  };
}

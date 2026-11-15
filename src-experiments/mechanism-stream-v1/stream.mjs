/**
 * 把 R-18 的刚性位姿收成可供工程实例读取的运动流。
 * 不修改求解器，不新建端口，不把演示硬点升级成真实车辆数据。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runSlice } from '../mechanism-vertical-slice-v1/pose.mjs';

const fixture = JSON.parse(readFileSync(new URL('../kinematics/fixture-demo.json', import.meta.url), 'utf8'));

export const BINDING = {
  'INST-SLA-UPPER-ARM-FL': { instanceId: 'PI-20-001-FL', definitionId: 'PART-20-001', bindingStatus: 'BOUND' },
  'INST-SLA-LOWER-ARM-FL': { instanceId: 'PI-20-008-FL', definitionId: 'PART-20-008', bindingStatus: 'BOUND' },
  'INST-SLA-UPRIGHT-FL': { instanceId: 'PI-20-016-FL', definitionId: 'PART-20-016', bindingStatus: 'BOUND' },
  'INST-SLA-TIEROD-FL': {
    instanceId: null,
    definitionId: 'PART-20-075',
    bindingStatus: 'DEFERRED_NO_INSTANCE',
    reason: 'R-16 外拉杆端 instancePolicy=DEFERRED，骨架里没有 PI-20-075-FL。'
  },
  'INST-SLA-HUB-FL': {
    instanceId: null,
    definitionId: null,
    bindingStatus: 'UNBOUND_NO_HUB_BODY',
    reason: 'R-16 纵切没有单独实例化的轮毂本体。PI-30-031-FL 是制动盘定位螺钉，不能拿来当轮心。'
  }
};

const CONSTRAINTS = [
  ['INST-SLA-UPPER-ARM-FL', 'axisAToBall', 'CON-SUSP-UPPER-CIRCLE'],
  ['INST-SLA-LOWER-ARM-FL', 'axisAToBall', 'CON-SUSP-LOWER-CIRCLE'],
  ['INST-SLA-UPRIGHT-FL', null, 'CON-KINGPIN-LENGTH'],
  ['INST-SLA-TIEROD-FL', 'length', 'CON-TIE-ROD-LENGTH']
];

function quatDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

function sameHemisphere(previous, quaternion) {
  if (!previous || quatDot(previous, quaternion) >= 0) return quaternion;
  return quaternion.map((value) => -value);
}

function pingPong(step = 0.02, limit = 0.04) {
  const forward = [];
  for (let travel = -limit; travel <= limit + 1e-9; travel += step) forward.push(Number(travel.toFixed(3)));
  const back = forward.slice(0, -1).reverse();
  return forward.concat(back);
}

function constraintReport(sample, baselines) {
  const byMechanism = Object.fromEntries(sample.instances.map((item) => [item.mechanismInstanceId, item]));
  const rows = CONSTRAINTS.map(([mechanismId, lengthKey, constraintId]) => {
    const instance = byMechanism[mechanismId];
    const length = lengthKey ? instance.rigidLengthsM[lengthKey] : null;
    const baseline = baselines[constraintId];
    const residual = length === null ? instance.closureErrorM : length - baseline;
    return {
      constraintId,
      jointOrConstraint: 'CONSTRAINT',
      residualM: residual,
      status: Math.abs(residual) < 1e-6 ? 'SATISFIED' : 'VIOLATED'
    };
  });
  rows.push({
    constraintId: 'CON-WHEEL-CENTER-HEIGHT',
    jointOrConstraint: 'CONSTRAINT',
    residualM: sample.instances.find((item) => item.mechanismInstanceId === 'INST-SLA-HUB-FL').position[1] - (baselines.wheelY + sample.travelM),
    status: 'PLACEHOLDER'
  });
  rows[rows.length - 1].status = Math.abs(rows[rows.length - 1].residualM) < 1e-6 ? 'SATISFIED' : 'VIOLATED';
  rows.push({
    constraintId: 'CON-SHOCK-OUTPUT',
    jointOrConstraint: 'OUTPUT',
    lengthM: sample.shockLengthM,
    residualM: null,
    status: 'OUTPUT'
  });
  return rows;
}

export function buildMotionStream(options = {}) {
  const travels = options.travelsM || pingPong();
  const slice = runSlice({
    provenance: 'FICTIONAL_FIXTURE',
    valueBasis: 'DEMO_ASSUMPTION',
    travelsM: travels,
    variant: options.variant,
    omitConstraints: options.omitConstraints,
    solverRequest: {
      topology: 'doubleWishbone',
      side: 'left',
      valueBasis: 'DEMO_ASSUMPTION',
      frame: options.frame || { frameId: 'FR-VEHICLE', units: 'm' },
      hardpoints: options.hardpoints || fixture.hardpoints,
      proxies: options.proxies || [
        { id: 'upper-ball', instanceId: 'INST-SLA-UPPER-ARM-FL', local: [
          fixture.hardpoints.upperBall[0] - fixture.hardpoints.upperAxisA[0],
          fixture.hardpoints.upperBall[1] - fixture.hardpoints.upperAxisA[1],
          fixture.hardpoints.upperBall[2] - fixture.hardpoints.upperAxisA[2]
        ], radiusM: 0.015 },
        { id: 'rail', world: [0.05, 0.2, 0], radiusM: 0.02 }
      ],
      closureLimitM: 1e-6,
      declaredLengthsM: options.declaredLengthsM,
      tieLengthOverrideM: options.tieLengthOverrideM
    }
  });
  if (!slice.legalAssembly) {
    return {
      legalAssembly: false,
      status: 'BLOCKED',
      category: slice.category,
      code: slice.code,
      frames: [],
      force: 'N/A',
      geometryValueBasis: 'UNKNOWN',
      motionValueBasis: 'DEMO_ASSUMPTION'
    };
  }
  const baselines = {};
  const first = slice.samples[0];
  for (const [mechanismId, lengthKey, constraintId] of CONSTRAINTS) {
    if (!lengthKey) continue;
    const instance = first.instances.find((item) => item.instanceId === mechanismId);
    baselines[constraintId] = instance.rigidLengthsM[lengthKey];
  }
  baselines.wheelY = first.instances.find((item) => item.instanceId === 'INST-SLA-HUB-FL').position[1] - first.travelM;
  const previousQuat = {};
  const frames = slice.samples.map((sample, index) => ({
    frameIndex: index,
    travelM: sample.travelM,
    solverStatus: sample.code,
    residualM: sample.residualM,
    instances: sample.instances.map((item) => {
      const binding = BINDING[item.instanceId];
      const quaternion = sameHemisphere(previousQuat[item.instanceId], item.quaternion);
      previousQuat[item.instanceId] = quaternion;
      return {
        mechanismInstanceId: item.instanceId,
        instanceId: binding.instanceId,
        definitionId: binding.definitionId,
        bindingStatus: binding.bindingStatus,
        bindingReason: binding.reason || null,
        position: item.position,
        quaternion,
        scale: item.scale,
        closureErrorM: item.closureErrorM ?? null,
        rigidLengthsM: item.rigidLengthsM || null
      };
    }),
    constraints: constraintReport({
      ...sample,
      instances: sample.instances.map((item) => ({ ...item, mechanismInstanceId: item.instanceId }))
    }, baselines),
    clearance: {
      ...sample.clearance,
      label: 'DEMO_SPHERE_PROXY',
      cadCollisionVerified: false
    },
    force: 'N/A'
  }));
  const simulationRun = {
    runId: options.runId || 'RUN-SLA-FL-DEMO-001',
    inputRevision: options.inputRevision || 3,
    solver: 'src-experiments/mechanism-vertical-slice-v1/pose.mjs',
    status: 'CURRENT',
    frameId: 'FR-VEHICLE'
  };
  const hash = createHash('sha256').update(JSON.stringify(frames)).digest('hex');
  simulationRun.resultHash = hash;
  return {
    schema: 'carlab.motionStream/0.1-proposal',
    legalAssembly: true,
    status: 'CURRENT',
    frames,
    simulationRun,
    force: 'N/A',
    geometryValueBasis: 'UNKNOWN',
    motionValueBasis: 'DEMO_ASSUMPTION',
    provenance: 'FICTIONAL_FIXTURE',
    instanceIdStatus: 'REUSED_R16_CANDIDATE',
    jointProposal: [
      { jointId: 'J-UPPER-ARM-FL', type: 'REVOLUTE', status: 'PROPOSED_NOT_IN_R17_FIXTURE' },
      { jointId: 'J-LOWER-ARM-FL', type: 'REVOLUTE', status: 'PROPOSED_NOT_IN_R17_FIXTURE' }
    ]
  };
}

export function consumeStream(stream, project = {}) {
  if (project.frameId && project.frameId !== stream.simulationRun.frameId) {
    return { runId: stream.simulationRun.runId, status: 'BLOCKED', reason: '坐标系与运动流不一致' };
  }
  if (project.revision !== stream.simulationRun.inputRevision) {
    return {
      runId: stream.simulationRun.runId,
      status: 'STALE',
      inputRevision: stream.simulationRun.inputRevision,
      projectRevision: project.revision,
      reason: '工程修订已变化'
    };
  }
  return { runId: stream.simulationRun.runId, status: 'CURRENT', resultHash: stream.simulationRun.resultHash };
}

export function quaternionStepRad(stream) {
  const steps = [];
  const previous = {};
  for (const frame of stream.frames) {
    for (const instance of frame.instances) {
      const key = instance.mechanismInstanceId;
      if (previous[key]) {
        const dot = Math.min(1, Math.abs(quatDot(previous[key], instance.quaternion)));
        steps.push(2 * Math.acos(dot));
      }
      previous[key] = instance.quaternion;
    }
  }
  return Math.max(...steps);
}

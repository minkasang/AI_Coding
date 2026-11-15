import { readFileSync, writeFileSync } from 'node:fs';
import { vehicleToEngineering } from '../kinematics/frame.mjs';
import { runSlice } from './pose.mjs';

const fixture = JSON.parse(readFileSync(new URL('../kinematics/fixture-demo.json', import.meta.url), 'utf8'));
const checks = [];
function check(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), ...detail });
}

const travels = [];
for (let travel = -0.04; travel <= 0.04001; travel += 0.01) travels.push(Number(travel.toFixed(3)));
const proxies = [
  { id: 'upper-ball', instanceId: 'INST-SLA-UPPER-ARM-FL', local: [
    fixture.hardpoints.upperBall[0] - fixture.hardpoints.upperAxisA[0],
    fixture.hardpoints.upperBall[1] - fixture.hardpoints.upperAxisA[1],
    fixture.hardpoints.upperBall[2] - fixture.hardpoints.upperAxisA[2]
  ], radiusM: 0.015 },
  { id: 'rail', world: [0.05, 0.2, 0], radiusM: 0.02 }
];
const slice = runSlice({
  provenance: 'FICTIONAL_FIXTURE',
  valueBasis: 'DEMO_ASSUMPTION',
  travelsM: travels,
  solverRequest: {
    topology: 'doubleWishbone',
    side: 'left',
    valueBasis: 'DEMO_ASSUMPTION',
    frame: { frameId: 'FR-VEHICLE', units: 'm' },
    hardpoints: fixture.hardpoints,
    proxies,
    closureLimitM: 1e-6
  }
});
const named = [-0.04, 0, 0.04].map((travel) => slice.samples.find((sample) => sample.travelM === travel));
check('M01_three_named_poses', slice.legalAssembly && named.every(Boolean) && slice.samples.length === travels.length, {
  count: slice.samples.length
});

function range(values) {
  return Math.max(...values) - Math.min(...values);
}
const upperLengths = slice.samples.map((sample) => sample.instances[0].rigidLengthsM.axisAToBall);
const lowerLengths = slice.samples.map((sample) => sample.instances[1].rigidLengthsM.axisAToBall);
const tieLengths = slice.samples.map((sample) => sample.instances[3].rigidLengthsM.length);
check('M02_arm_and_tierod_lengths_constant', range(upperLengths) < 0.0001 && range(lowerLengths) < 0.0001 && range(tieLengths) < 0.0001, {
  upperRangeM: range(upperLengths),
  lowerRangeM: range(lowerLengths),
  tieRangeM: range(tieLengths)
});
const closure = Math.max(...slice.samples.flatMap((sample) => sample.instances.map((item) => item.closureErrorM || 0)));
check('M03_ball_closure_within_limit', closure < 1e-6, { maxClosureM: closure });
check('M04_no_scale_and_no_force', slice.samples.every((sample) => sample.instances.every((item) => item.scale.every((value) => value === 1))) && slice.forces === null && slice.samples.every((sample) => sample.forceBasis === 'UNKNOWN'), {});

const under = runSlice({ omitConstraints: ['tieRod'], travelsM: [0], solverRequest: { hardpoints: fixture.hardpoints } });
check('N01_underconstrained_not_legal', under.legalAssembly === false && under.category === 'UNDERCONSTRAINED' && under.samples.length === 0, {
  category: under.category
});
const conflict = runSlice({
  travelsM: [0],
  solverRequest: {
    topology: 'doubleWishbone',
    side: 'left',
    frame: { frameId: 'FR-VEHICLE', units: 'm' },
    hardpoints: fixture.hardpoints,
    declaredLengthsM: { tieRod: 0.5 }
  }
});
check('N02_length_conflict_not_legal', conflict.legalAssembly === false && conflict.code === 'KIN-E-LENGTH' && conflict.samples.length === 0, {
  code: conflict.code
});
const diverge = runSlice({
  travelsM: [0],
  solverRequest: {
    topology: 'doubleWishbone',
    side: 'left',
    frame: { frameId: 'FR-VEHICLE', units: 'm' },
    hardpoints: fixture.hardpoints,
    tieLengthOverrideM: 0.20089143810376277
  }
});
check('N03_nonconvergence_not_legal', diverge.legalAssembly === false && diverge.category === 'SOLVER_NUMERICAL' && diverge.code === 'KIN-E-CONVERGE', {
  code: diverge.code,
  residual: diverge.residualM
});

const mirrorPoint = (point) => [-point[0], point[1], point[2]];
const rightPoints = {};
for (const [name, point] of Object.entries(fixture.hardpoints)) rightPoints[name] = mirrorPoint(point);
const right = runSlice({
  travelsM: [0],
  solverRequest: {
    topology: 'doubleWishbone',
    side: 'right',
    frame: { frameId: 'FR-VEHICLE', units: 'm' },
    hardpoints: rightPoints,
    proxies: []
  }
});
const leftHub = named[1].instances.find((item) => item.instanceId.endsWith('HUB-FL'));
const rightHub = right.samples[0].instances.find((item) => item.instanceId.endsWith('HUB-FR'));
check('M05_right_side_is_explicit_mirror', right.legalAssembly && rightHub.position[0] < 0 && Math.abs(rightHub.position[0] + leftHub.position[0]) < 1e-6 && Math.abs(right.samples[0].camberRad - named[1].camberRad) < 1e-8, {
  leftX: leftHub.position[0],
  rightX: rightHub.position[0]
});

const engineering = {};
for (const [name, point] of Object.entries(fixture.hardpoints)) {
  const converted = vehicleToEngineering(point);
  engineering[name] = name === 'spindleAxis' ? converted : converted.map((value) => value * 1000);
}
const fromEngineering = runSlice({
  travelsM: [0],
  solverRequest: {
    topology: 'doubleWishbone',
    side: 'left',
    frame: { frameId: 'FR-ENGINEERING', units: 'mm' },
    hardpoints: engineering,
    proxies: []
  }
});
const engineeringHub = fromEngineering.samples[0].instances.find((item) => item.instanceId.endsWith('HUB-FL'));
check('M06_engineering_millimetres_match_vehicle_pose', fromEngineering.legalAssembly && Math.abs(engineeringHub.position[0] - leftHub.position[0]) < 1e-6 && Math.abs(engineeringHub.position[1] - leftHub.position[1]) < 1e-6, {
  vehicle: leftHub.position,
  engineering: engineeringHub.position
});

const blocked = runSlice({
  travelsM: [0],
  variant: { lowerArmSpanM: 0.7356, lowerArmMaxSpanM: 0.56, valueBasis: 'DEMO_ASSUMPTION' },
  solverRequest: {
    topology: 'doubleWishbone',
    side: 'left',
    frame: { frameId: 'FR-VEHICLE', units: 'm' },
    hardpoints: fixture.hardpoints
  }
});
check('N04_variant_span_does_not_publish_poses', blocked.legalAssembly === false && blocked.category === 'VARIANT_ILLEGAL' && blocked.solverCalled === false && blocked.samples.length === 0, {
  code: blocked.code
});

const interfering = runSlice({
  travelsM: [0],
  solverRequest: {
    topology: 'doubleWishbone',
    side: 'left',
    frame: { frameId: 'FR-VEHICLE', units: 'm' },
    hardpoints: fixture.hardpoints,
    proxies: [
      { id: 'a', world: [0, 0, 0], radiusM: 1 },
      { id: 'b', world: [0.1, 0, 0], radiusM: 1 }
    ]
  }
});
check('N05_proxy_interference_is_not_legal_assembly', interfering.legalAssembly === false && interfering.samples[0].clearance.status === 'INTERFERENCE' && interfering.samples[0].clearance.notCadCollision === true, {
  status: interfering.samples[0]?.clearance.status
});

const failed = checks.filter((item) => !item.pass).map((item) => item.id);
const output = {
  schema: 'carlab.r18.mechanismSlice.v1',
  date: '2026-11-15',
  command: 'node src-experiments/mechanism-vertical-slice-v1/run-checks.mjs',
  valueBasis: 'DEMO_ASSUMPTION',
  provenance: 'FICTIONAL_FIXTURE',
  instanceIdStatus: 'CANDIDATE_NOT_FROZEN',
  passCount: checks.length - failed.length,
  failCount: failed.length,
  failed,
  checks,
  designSample: named[1] || null,
  travelSamplesM: travels
};
writeFileSync(new URL('./R-18-results.json', import.meta.url), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ passCount: output.passCount, failCount: output.failCount, failed, closure: checks.find((item) => item.id === 'M03_ball_closure_within_limit') }, null, 2));
if (failed.length) process.exit(1);

/**
 * 隔离运行 R-09 正例和反例。不读取、不修改 src/。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { vehicleToEngineering } from './frame.mjs';
import { solveCorner, solveSweep } from './solve.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixture-demo.json', import.meta.url), 'utf8'));
const checks = [];
function check(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), ...detail });
}

function base(overrides = {}) {
  return {
    topology: 'doubleWishbone',
    side: 'left',
    valueBasis: fixture.valueBasis,
    sources: fixture.sources,
    frame: { frameId: 'FR-VEHICLE', units: 'm' },
    hardpoints: fixture.hardpoints,
    travelM: 0,
    ...overrides
  };
}

const design = solveCorner(base());
check('P01_design_assembles', design.ok && design.valueBasis === 'DEMO_ASSUMPTION' && design.residual < 1e-8, {
  code: design.code,
  residual: design.residual,
  camberRad: design.pose?.camberRad
});

const travels = [];
for (let travel = -0.06; travel <= 0.06001; travel += 0.02) travels.push(Number(travel.toFixed(3)));
const sweep = solveSweep(base(), travels);
const upper = sweep.samples.map((sample) => sample.pose.upperRadial);
const upperRange = Math.max(...upper) - Math.min(...upper);
const camber = sweep.samples.map((sample) => sample.pose.camberRad);
const toe = sweep.samples.map((sample) => sample.pose.toeRad);
check('P02_sweep_keeps_arm_radius', sweep.ok && upperRange < 0.0001, { upperRange, points: sweep.samples.length });
check('P03_camber_and_toe_change', Math.max(...camber) - Math.min(...camber) > 0.002 && Math.max(...toe) - Math.min(...toe) > 0.0003, {
  camberRange: Math.max(...camber) - Math.min(...camber),
  toeRange: Math.max(...toe) - Math.min(...toe)
});

const mac = solveSweep(base({ topology: 'macpherson' }), travels);
const at40s = sweep.samples.find((sample) => sample.travelM === 0.04);
const at40m = mac.samples.find((sample) => sample.travelM === 0.04);
check('P04_macpherson_camber_differs', mac.ok && Math.abs(at40s.pose.camberRad - at40m.pose.camberRad) > 0.01, {
  sla: at40s.pose.camberRad,
  macpherson: at40m.pose.camberRad
});

const engineering = {};
for (const [name, point] of Object.entries(fixture.hardpoints)) {
  const converted = vehicleToEngineering(point);
  engineering[name] = name === 'spindleAxis' ? converted : converted.map((value) => value * 1000);
}
const fromEngineering = solveCorner(base({
  frame: { frameId: 'FR-ENGINEERING', units: 'mm' },
  hardpoints: engineering
}));
check('P05_engineering_millimetres_match', fromEngineering.ok && Math.abs(fromEngineering.pose.camberRad - design.pose.camberRad) < 1e-9, {
  design: design.pose.camberRad,
  converted: fromEngineering.pose?.camberRad
});

const unlabeled = solveCorner(base({ valueBasis: undefined }));
check('P06_missing_basis_is_demo', unlabeled.ok && unlabeled.valueBasis === 'DEMO_ASSUMPTION', { valueBasis: unlabeled.valueBasis });

const fivePoints = {
  wheelCenter: [0.72, 0, 0],
  spindleAxis: [1, -0.02, 0.01],
  shockChassis: [0.4, 0.36, 0],
  shockUpright: [0.6, 0.04, 0],
  diffOutput: [0.15, 0, 0],
  links: [
    { id: 'link1', chassis: [0.36, 0.22, 0.16], upright: [0.58, 0.16, 0.08] },
    { id: 'link2', chassis: [0.34, 0.2, -0.14], upright: [0.58, 0.16, -0.06] },
    { id: 'link3', chassis: [0.32, -0.02, 0.18], upright: [0.62, -0.05, 0.1] },
    { id: 'link4', chassis: [0.3, -0.04, -0.16], upright: [0.62, -0.05, -0.08] },
    { id: 'link5', chassis: [0.28, 0.05, 0.18], upright: [0.56, 0.04, 0.12] }
  ]
};
const fiveTravels = [-0.03, 0, 0.03];
const five = solveSweep(base({ topology: 'fiveLink', hardpoints: fivePoints, valueBasis: 'DEMO_ASSUMPTION' }), fiveTravels);
const fiveLinkError = five.ok ? Math.max(...five.samples.flatMap((sample) => sample.pose.linkErrors.map(Math.abs))) : null;
check('P07_five_link_distance_constraints', five.ok && fiveLinkError < 1e-8, {
  ok: five.ok,
  code: five.samples.find((sample) => !sample.ok)?.code || 'KIN-OK',
  maxLinkError: fiveLinkError
});

const sourced = solveCorner(base({ valueBasis: 'SOURCED', sources: [] }));
check('N01_sourced_without_citation_rejected', sourced.ok === false && sourced.code === 'KIN-E-BASIS', { code: sourced.code });

const scaled = solveCorner(base({ scale: 1.1 }));
check('N02_scale_rejected', scaled.code === 'KIN-E-SCALE', { code: scaled.code });

const mirrored = solveCorner(base({
  frame: { frameId: 'FR-VEHICLE', units: 'm', rotation: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], mirror: null }
}));
check('N03_reflection_without_flag_rejected', mirrored.code === 'KIN-E-MIRROR', { code: mirrored.code });

const rightOnLeft = solveCorner(base({ side: 'right' }));
check('N04_right_side_positive_x_rejected', rightOnLeft.code === 'KIN-E-SIDE', { code: rightOnLeft.code });

const badLength = solveCorner(base({ declaredLengthsM: { tieRod: 0.5 } }));
check('N05_declared_length_conflict', badLength.code === 'KIN-E-LENGTH', { code: badLength.code, detail: badLength.detail });

const tooFar = solveCorner(base({ travelM: 0.12 }));
check('N06_travel_limit', tooFar.code === 'KIN-E-TRAVEL', { code: tooFar.code });

const wrongJoint = solveCorner(base({
  joints: [
    { id: 'upperArm', type: 'prismatic' },
    { id: 'lowerArm', type: 'revolute' },
    { id: 'tieRod', type: 'distance' },
    { id: 'shock', type: 'prismatic' }
  ]
}));
check('N07_wrong_joint_type', wrongJoint.code === 'KIN-E-JOINT', { code: wrongJoint.code });

const impossible = solveCorner(base({ tieLengthOverrideM: design.pose.tieLength - 0.08 }));
check('N08_short_tierod_does_not_converge', impossible.code === 'KIN-E-CONVERGE', { code: impossible.code, residual: impossible.detail?.residual });

const bumped = solveCorner(base({ travelM: 0.06 }));
const limit = solveCorner(base({
  travelM: 0.06,
  limits: { shockLengthM: { min: bumped.pose.shockLength + 0.01, max: bumped.pose.shockLength + 0.05 } }
}));
check('N09_shock_limit_rejected', bumped.ok && limit.code === 'KIN-E-LIMIT', {
  shock: bumped.pose.shockLength,
  code: limit.code
});

const mirrorPoint = (point) => [-point[0], point[1], point[2]];
const rightPoints = {};
for (const [name, point] of Object.entries(fixture.hardpoints)) rightPoints[name] = mirrorPoint(point);
const right = solveCorner(base({ side: 'right', hardpoints: rightPoints }));
check('P08_explicit_right_mirror_assembles', right.ok && Math.abs(right.pose.camberRad - design.pose.camberRad) < 1e-9, {
  left: design.pose.camberRad,
  right: right.pose?.camberRad
});

const failed = checks.filter((item) => !item.pass).map((item) => item.id);
const output = {
  schema: 'carlab.r09.kinematicsRun.v1',
  date: '2026-11-14',
  command: 'node src-experiments/kinematics/run-checks.mjs',
  valueBasis: 'DEMO_ASSUMPTION',
  passCount: checks.length - failed.length,
  failCount: failed.length,
  failed,
  checks,
  highlights: {
    designCamberRad: design.pose?.camberRad,
    slaCamberAt40mm: at40s?.pose.camberRad,
    macphersonCamberAt40mm: at40m?.pose.camberRad,
    fiveLinkOk: five.ok
  }
};
writeFileSync(new URL('./R-09-results.json', import.meta.url), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ passCount: output.passCount, failCount: output.failCount, failed, highlights: output.highlights }, null, 2));
if (failed.length) process.exit(1);

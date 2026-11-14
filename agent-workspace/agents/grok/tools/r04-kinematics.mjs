/**
 * R-04 虚构双叉臂运动学夹具。
 * 坐标：+X 向左（左轮外侧），+Y 向上，+Z 向前。单位 m、rad。
 * 硬点是虚构夹具，不是量产车数据。不修改 src/。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'F:/project/cyq/AI_Coding/car/docs/research/R-04-kinematics-fixture.json';

const hardpoints = {
  upperAxisA: [0.28, 0.22, 0.13],
  upperAxisB: [0.24, 0.20, -0.13],
  upperBall: [0.55, 0.18, 0.01],
  lowerAxisA: [0.32, -0.04, 0.16],
  lowerAxisB: [0.26, -0.07, -0.16],
  lowerBall: [0.62, -0.06, 0.00],
  tieInner: [0.26, 0.06, 0.15],
  tieOuter: [0.54, 0.05, 0.13],
  wheelCenter: [0.72, 0.00, 0.00],
  spindleAxis: [1, -0.04, 0.015],
  shockChassis: [0.36, 0.34, 0.02],
  diffOutput: [0.12, -0.02, 0.00],
  strutTop: [0.42, 0.56, 0.02]
};

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => mul(a, 1 / norm(a));
const dist = (a, b) => norm(sub(a, b));
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function perpendicular(dir) {
  const ref = Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize(cross(dir, ref));
}

function axisOf(a, b) {
  return { origin: a, dir: normalize(sub(b, a)) };
}

function circleParts(point, axis) {
  const v = sub(point, axis.origin);
  const along = dot(v, axis.dir);
  const radial = norm(sub(v, mul(axis.dir, along)));
  return { along, radial };
}

function circleResidual(point, axis, built) {
  const now = circleParts(point, axis);
  return [now.radial - built.radial, now.along - built.along];
}

function lineResidual(point, origin, dir) {
  const v = sub(point, origin);
  const along = dot(v, dir);
  const perp = sub(v, mul(dir, along));
  const t1 = perpendicular(dir);
  const t2 = cross(dir, t1);
  return [dot(perp, t1), dot(perp, t2)];
}

function uprightBasis(lowerBall, upperBall, tieOuter) {
  const x = normalize(sub(upperBall, lowerBall));
  const v = sub(tieOuter, lowerBall);
  const y = normalize(sub(v, mul(x, dot(v, x))));
  const z = cross(x, y);
  return { origin: lowerBall, x, y, z };
}

function toWorld(frame, local) {
  return add(frame.origin, add(mul(frame.x, local[0]), add(mul(frame.y, local[1]), mul(frame.z, local[2]))));
}

function toLocal(frame, point) {
  const v = sub(point, frame.origin);
  return [dot(v, frame.x), dot(v, frame.y), dot(v, frame.z)];
}

function wheelCenterOf(lowerBall, upperBall, tieOuter, local) {
  return toWorld(uprightBasis(lowerBall, upperBall, tieOuter), local);
}

function spindleOf(lowerBall, upperBall, tieOuter, localDir) {
  const frame = uprightBasis(lowerBall, upperBall, tieOuter);
  return normalize(add(mul(frame.x, localDir[0]), add(mul(frame.y, localDir[1]), mul(frame.z, localDir[2]))));
}

function rodrigues(point, origin, axisDir, angle) {
  const v = sub(point, origin);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rotated = add(add(mul(v, c), mul(cross(axisDir, v), s)), mul(axisDir, dot(axisDir, v) * (1 - c)));
  return add(origin, rotated);
}

function armAngle(axis, fromPoint, toPoint) {
  const r0 = sub(sub(fromPoint, axis.origin), mul(axis.dir, dot(sub(fromPoint, axis.origin), axis.dir)));
  const r1 = sub(sub(toPoint, axis.origin), mul(axis.dir, dot(sub(toPoint, axis.origin), axis.dir)));
  const s = dot(axis.dir, cross(r0, r1));
  return Math.atan2(s, dot(r0, r1));
}

function camberRad(spindle) {
  // 旋转轴必须指向车轮外侧。外侧端抬高时 spindle.y > 0，外倾为正。
  return Math.atan2(spindle[1], Math.hypot(spindle[0], spindle[2]));
}

function toeRad(spindle) {
  const forward = normalize(cross(spindle, [0, 1, 0]));
  return Math.atan2(forward[0], forward[2]);
}

function kingpinInclinationRad(lowerBall, upperBall) {
  const axis = sub(upperBall, lowerBall);
  const side = Math.sign(lowerBall[0] || upperBall[0]) || 1;
  return Math.atan2(axis[0] * side, axis[1]);
}

function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(M[i][k]) > Math.abs(M[pivot][k])) pivot = i;
    }
    [M[k], M[pivot]] = [M[pivot], M[k]];
    const diag = M[k][k];
    if (Math.abs(diag) < 1e-14) return null;
    for (let j = k; j <= n; j++) M[k][j] /= diag;
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const factor = M[i][k];
      for (let j = k; j <= n; j++) M[i][j] -= factor * M[k][j];
    }
  }
  return M.map((row) => row[n]);
}

function newton(q0, residualFn) {
  let q = q0.slice();
  for (let iter = 0; iter < 40; iter++) {
    const r = residualFn(q);
    const nrm = Math.max(...r.map((v) => Math.abs(v)));
    if (nrm < 1e-10) return { ok: true, q, residual: nrm, iter };
    const J = Array.from({ length: r.length }, () => new Array(q.length).fill(0));
    const h = 1e-8;
    for (let j = 0; j < q.length; j++) {
      const qp = q.slice();
      const qm = q.slice();
      qp[j] += h;
      qm[j] -= h;
      const rp = residualFn(qp);
      const rm = residualFn(qm);
      for (let i = 0; i < r.length; i++) J[i][j] = (rp[i] - rm[i]) / (2 * h);
    }
    const dx = solveLinear(J, r.map((v) => -v));
    if (!dx) return { ok: false, q, residual: nrm, iter, reason: 'singular' };
    let step = 1;
    let accepted = false;
    for (let attempt = 0; attempt < 14; attempt++) {
      const trial = q.map((v, i) => v + step * dx[i]);
      const next = Math.max(...residualFn(trial).map((v) => Math.abs(v)));
      if (next < nrm * (1 - 1e-4 * step) || next < 1e-10) {
        q = trial;
        accepted = true;
        break;
      }
      step *= 0.5;
    }
    if (!accepted) return { ok: false, q, residual: nrm, iter, reason: 'linesearch' };
  }
  const end = residualFn(q);
  return { ok: false, q, residual: Math.max(...end.map((v) => Math.abs(v))), iter: 40, reason: 'maxiter' };
}

function buildModel(points) {
  const spindle = normalize(points.spindleAxis);
  const frame = uprightBasis(points.lowerBall, points.upperBall, points.tieOuter);
  const upperAxis = axisOf(points.upperAxisA, points.upperAxisB);
  const lowerAxis = axisOf(points.lowerAxisA, points.lowerAxisB);
  const strutDir = normalize(sub(points.upperBall, points.strutTop));
  const lowerMid = lerp(points.lowerAxisA, points.lowerAxisB, 0.5);
  const shockArmDesign = lerp(lowerMid, points.lowerBall, 0.7);
  return {
    points,
    spindleLocal: toLocal(frame, add(points.lowerBall, spindle)),
    wheelLocal: toLocal(frame, points.wheelCenter),
    upperAxis,
    lowerAxis,
    upperCircle: circleParts(points.upperBall, upperAxis),
    lowerCircle: circleParts(points.lowerBall, lowerAxis),
    kingpin: dist(points.upperBall, points.lowerBall),
    tieToLower: dist(points.tieOuter, points.lowerBall),
    tieToUpper: dist(points.tieOuter, points.upperBall),
    tieRod: dist(points.tieOuter, points.tieInner),
    strutDir,
    shockArmDesign,
    designQ: [...points.lowerBall, ...points.upperBall, ...points.tieOuter],
    designWheelY: points.wheelCenter[1]
  };
}

function residual(q, model, targetY, options = {}) {
  const lowerBall = q.slice(0, 3);
  const upperBall = q.slice(3, 6);
  const tieOuter = q.slice(6, 9);
  const tieInner = options.tieInner || model.points.tieInner;
  const tieLength = options.tieLength ?? model.tieRod;
  const upper = options.topology === 'macpherson'
    ? lineResidual(upperBall, model.points.strutTop, model.strutDir)
    : circleResidual(upperBall, model.upperAxis, model.upperCircle);
  const wheelY = wheelCenterOf(lowerBall, upperBall, tieOuter, model.wheelLocal)[1];
  return [
    ...upper,
    ...circleResidual(lowerBall, model.lowerAxis, model.lowerCircle),
    dist(upperBall, lowerBall) - model.kingpin,
    dist(tieOuter, lowerBall) - model.tieToLower,
    dist(tieOuter, upperBall) - model.tieToUpper,
    dist(tieOuter, tieInner) - tieLength,
    wheelY - targetY
  ];
}

function poseOf(q, model) {
  const lowerBall = q.slice(0, 3);
  const upperBall = q.slice(3, 6);
  const tieOuter = q.slice(6, 9);
  const wheelCenter = wheelCenterOf(lowerBall, upperBall, tieOuter, model.wheelLocal);
  const spindle = spindleOf(lowerBall, upperBall, tieOuter, model.spindleLocal);
  const angle = armAngle(model.lowerAxis, model.points.lowerBall, lowerBall);
  const shockArm = rodrigues(model.shockArmDesign, model.lowerAxis.origin, model.lowerAxis.dir, angle);
  return {
    lowerBall, upperBall, tieOuter, wheelCenter, spindle,
    camberRad: camberRad(spindle),
    toeRad: toeRad(spindle),
    kingpinInclinationRad: kingpinInclinationRad(lowerBall, upperBall),
    shockLength: dist(model.points.shockChassis, shockArm),
    halfshaftLength: dist(model.points.diffOutput, wheelCenter),
    upperRadial: circleParts(upperBall, model.upperAxis).radial,
    lowerRadial: circleParts(lowerBall, model.lowerAxis).radial,
    tieLength: dist(tieOuter, model.points.tieInner),
    uprightKingpin: dist(upperBall, lowerBall)
  };
}

function sweep(model, travels, topology) {
  const samples = [];
  let guess = model.designQ.slice();
  let ok = true;
  for (const travel of travels) {
    const targetY = model.designWheelY + travel;
    const solved = newton(guess, (q) => residual(q, model, targetY, { topology }));
    if (!solved.ok) {
      ok = false;
      samples.push({ travel_m: travel, ok: false, reason: solved.reason, residual_m: solved.residual });
      break;
    }
    guess = solved.q;
    const pose = poseOf(solved.q, model);
    samples.push({
      travel_m: travel,
      ok: true,
      residual_m: solved.residual,
      iterations: solved.iter,
      wheelCenter_m: pose.wheelCenter,
      spindleAxis: pose.spindle,
      camber_rad: pose.camberRad,
      toe_rad: pose.toeRad,
      kingpinInclination_rad: pose.kingpinInclinationRad,
      shockLength_m: pose.shockLength,
      halfshaftLength_m: pose.halfshaftLength,
      upperRadial_m: pose.upperRadial,
      lowerRadial_m: pose.lowerRadial,
      tieLength_m: pose.tieLength,
      uprightKingpin_m: pose.uprightKingpin
    });
  }
  return { ok, samples };
}

function range(values) {
  return Math.max(...values) - Math.min(...values);
}

const tests = [];
function check(id, pass, detail) {
  tests.push({ id, pass: Boolean(pass), ...detail });
}

const model = buildModel(hardpoints);
const designResidual = Math.max(...residual(model.designQ, model, model.designWheelY).map(Math.abs));
check('T01_design_residual', designResidual < 1e-12, {
  residual_m: designResidual,
  expect: '设计位置满足全部刚性约束'
});

const travels = [];
for (let t = -0.06; t <= 0.06001; t += 0.01) travels.push(Number(t.toFixed(4)));
const sla = sweep(model, travels, 'sla');
const slaOk = sla.samples.filter((s) => s.ok);
check('T02_sweep_converges', sla.ok && slaOk.length === travels.length, {
  solved: slaOk.length,
  requested: travels.length,
  failed: sla.samples.find((s) => !s.ok) || null
});

const upperErr = range(slaOk.map((s) => s.upperRadial_m));
const lowerErr = range(slaOk.map((s) => s.lowerRadial_m));
const tieErr = range(slaOk.map((s) => s.tieLength_m));
const kingErr = range(slaOk.map((s) => s.uprightKingpin_m));
check('T03_upper_arm_radius_constant', upperErr < 0.0001, { range_m: upperErr });
check('T04_lower_arm_radius_constant', lowerErr < 0.0001, { range_m: lowerErr });
check('T05_tierod_length_constant', tieErr < 0.0001, { range_m: tieErr });
check('T06_upright_kingpin_constant', kingErr < 0.0001, { range_m: kingErr });

const wheelYErr = Math.max(...slaOk.map((s) => Math.abs(s.wheelCenter_m[1] - (model.designWheelY + s.travel_m))));
check('T07_wheel_height_follows_input', wheelYErr < 0.00001, { maxError_m: wheelYErr });

const camberRange = range(slaOk.map((s) => s.camber_rad));
const toeRange = range(slaOk.map((s) => s.toe_rad));
check('T08_camber_changes_with_travel', camberRange > 0.1 * Math.PI / 180, {
  range_rad: camberRange,
  range_deg: camberRange * 180 / Math.PI
});
check('T09_toe_changes_with_travel', toeRange > 0.02 * Math.PI / 180, {
  range_rad: toeRange,
  range_deg: toeRange * 180 / Math.PI
});

const slaAgain = sweep(model, travels, 'sla');
const poseErr = Math.max(...slaOk.map((s, i) => dist(s.wheelCenter_m, slaAgain.samples[i].wheelCenter_m)));
check('T10_sweep_repeatable', poseErr < 1e-12, { maxWheelCenterDelta_m: poseErr });

const movedWheel = dist(add(hardpoints.wheelCenter, [0.03, 0, 0]), hardpoints.lowerBall) - dist(hardpoints.wheelCenter, hardpoints.lowerBall);
check('T11_track_stretch_breaks_upright', Math.abs(movedWheel) > 0.0001, {
  wheelToLowerBallChange_m: movedWheel,
  expect: '只把轮心外移 30 mm 会改变转向节上的固定距离'
});

const movedLower = circleParts(add(hardpoints.lowerBall, [0.02, 0, 0]), model.lowerAxis);
const movedUpper = circleParts(add(hardpoints.upperBall, [0.02, 0, 0]), model.upperAxis);
check('T12_outboard_balls_miss_arm_circles',
  Math.abs(movedLower.radial - model.lowerCircle.radial) > 0.001
  && Math.abs(movedUpper.radial - model.upperCircle.radial) > 0.001, {
  lowerRadialError_m: movedLower.radial - model.lowerCircle.radial,
  upperRadialError_m: movedUpper.radial - model.upperCircle.radial
});

const tieStretch = dist(add(hardpoints.tieOuter, [0.02, 0, 0]), hardpoints.tieInner) - model.tieRod;
check('T13_track_change_breaks_tierod', Math.abs(tieStretch) > 0.0001, { lengthChange_m: tieStretch });

function toeAtRack(offset) {
  const tieInner = add(hardpoints.tieInner, [offset, 0, 0]);
  const solved = newton(model.designQ, (q) => residual(q, model, model.designWheelY, { tieInner }));
  if (!solved.ok) return { ok: false, reason: solved.reason };
  return { ok: true, toe: toeRad(spindleOf(solved.q.slice(0, 3), solved.q.slice(3, 6), solved.q.slice(6, 9), model.spindleLocal)) };
}
const toePos = toeAtRack(0.015);
const toeNeg = toeAtRack(-0.015);
const toe0 = toeRad(hardpoints.spindleAxis);
check('T14_rack_changes_toe_both_ways',
  toePos.ok && toeNeg.ok && (toePos.toe - toe0) * (toeNeg.toe - toe0) < 0
  && Math.abs(toePos.toe - toeNeg.toe) > 0.05 * Math.PI / 180, {
  toeAtPlus15mm_rad: toePos.toe,
  toeAtMinus15mm_rad: toeNeg.toe,
  toeAtDesign_rad: toe0
});

let shortFail = null;
for (const cut of [0.04, 0.08, 0.12, 0.16]) {
  const solved = newton(model.designQ, (q) => residual(q, model, model.designWheelY, { tieLength: model.tieRod - cut }));
  if (!solved.ok) {
    shortFail = { cut_m: cut, reason: solved.reason, residual_m: solved.residual };
    break;
  }
}
check('T15_impossible_tierod_rejected', shortFail !== null, shortFail || { note: 'tested cuts still converged' });

const mac = sweep(model, travels, 'macpherson');
const macOk = mac.samples.filter((s) => s.ok);
let camberGap = 0;
if (mac.ok) {
  const index = slaOk.findIndex((s) => Math.abs(s.travel_m - 0.04) < 1e-9);
  if (index >= 0) camberGap = Math.abs(slaOk[index].camber_rad - macOk[index].camber_rad);
}
check('T16_macpherson_camber_differs', mac.ok && camberGap > 0.05 * Math.PI / 180, {
  solved: macOk.length,
  camberGapAt40mm_rad: camberGap,
  camberGapAt40mm_deg: camberGap * 180 / Math.PI
});

const halfRange = range(slaOk.map((s) => s.halfshaftLength_m));
check('T17_halfshaft_length_changes', halfRange > 0.0005, {
  range_m: halfRange,
  expect: '差速器输出点固定时，轮心跳动会改变半轴长度'
});

const shockRange = range(slaOk.map((s) => s.shockLength_m));
check('T18_shock_length_changes_arm_radius_does_not', shockRange > 0.001 && lowerErr < 0.0001, {
  shockRange_m: shockRange,
  lowerArmRadialRange_m: lowerErr
});

function demoArmLengths(suspLen, side = 1) {
  const z = 2.46 / 2;
  const hubX = side * 0.84;
  const hubY = 0.08 - suspLen;
  const upperEnd = [hubX - side * 0.14, hubY + 0.09, z];
  const lowerEnd = [hubX - side * 0.14, hubY - 0.085, z];
  const upperPivot = [side * 0.29, 0.11, z];
  const lowerPivot = [side * 0.27, -0.09, z];
  return { upper: dist(upperPivot, upperEnd), lower: dist(lowerPivot, lowerEnd) };
}
const demoRest = demoArmLengths(0.34);
const demoBump = demoArmLengths(0.12);
check('T19_current_demo_arms_are_not_rigid', Math.abs(demoRest.upper - demoBump.upper) > 0.01, {
  upperAtRest_m: demoRest.upper,
  upperAtBump_m: demoBump.upper,
  upperDelta_mm: (demoRest.upper - demoBump.upper) * 1000,
  source: '只读复算 src/parts/chassis.js 的枢轴到球头公式'
});

const kpiMoved = kingpinInclinationRad(add(hardpoints.lowerBall, [0.02, 0, 0]), hardpoints.upperBall);
const kpi0 = kingpinInclinationRad(hardpoints.lowerBall, hardpoints.upperBall);
check('T20_single_ball_move_changes_kingpin', Math.abs(kpiMoved - kpi0) > 0.2 * Math.PI / 180, {
  design_rad: kpi0,
  afterLowerBallOutboard20mm_rad: kpiMoved,
  delta_deg: (kpiMoved - kpi0) * 180 / Math.PI
});

function mirrorPoint(p) { return [-p[0], p[1], p[2]]; }
const mirroredPoints = {
  upperAxisA: mirrorPoint(hardpoints.upperAxisA),
  upperAxisB: mirrorPoint(hardpoints.upperAxisB),
  upperBall: mirrorPoint(hardpoints.upperBall),
  lowerAxisA: mirrorPoint(hardpoints.lowerAxisA),
  lowerAxisB: mirrorPoint(hardpoints.lowerAxisB),
  lowerBall: mirrorPoint(hardpoints.lowerBall),
  tieInner: mirrorPoint(hardpoints.tieInner),
  tieOuter: mirrorPoint(hardpoints.tieOuter),
  wheelCenter: mirrorPoint(hardpoints.wheelCenter),
  spindleAxis: mirrorPoint(normalize(hardpoints.spindleAxis)),
  shockChassis: mirrorPoint(hardpoints.shockChassis),
  diffOutput: mirrorPoint(hardpoints.diffOutput),
  strutTop: mirrorPoint(hardpoints.strutTop)
};
const right = buildModel(mirroredPoints);
const rightResidual = Math.max(...residual(right.designQ, right, right.designWheelY).map(Math.abs));
const leftCamber = camberRad(normalize(hardpoints.spindleAxis));
const rightCamber = camberRad(normalize(mirroredPoints.spindleAxis));
const rightWheelX = mirroredPoints.wheelCenter[0];
const rightTrackShrinks = Math.abs(rightWheelX + 0.03) < Math.abs(rightWheelX);
const leftTrackGrows = Math.abs(hardpoints.wheelCenter[0] + 0.03) > Math.abs(hardpoints.wheelCenter[0]);
check('T21_mirror_keeps_camber_uniform_plus_x_shrinks_right_track',
  rightResidual < 1e-9 && Math.abs(leftCamber - rightCamber) < 1e-12 && rightTrackShrinks && leftTrackGrows, {
  rightDesignResidual_m: rightResidual,
  leftCamber_rad: leftCamber,
  rightCamber_rad: rightCamber,
  rightWheelX_m: rightWheelX,
  note: '正确镜像后两侧外倾相同。左右轮同时加世界坐标 +X 时，右轮轮距反而变小。'
});

const failed = tests.filter((t) => !t.pass).map((t) => t.id);
const payload = {
  schema: 'carlab.r04.kinematicsFixture.v1',
  task: 'R-04',
  date: '2026-11-14',
  provenance: 'FICTIONAL_FIXTURE',
  notAProductionVehicle: true,
  frame: {
    x: 'left, outboard on the left wheel',
    y: 'up',
    z: 'forward',
    units: { length: 'm', angle: 'rad' }
  },
  command: 'node F:\\tmp\\r04-kinematics.mjs',
  hardpoints,
  derived: {
    upperArmRadial_m: model.upperCircle.radial,
    upperArmAlong_m: model.upperCircle.along,
    lowerArmRadial_m: model.lowerCircle.radial,
    lowerArmAlong_m: model.lowerCircle.along,
    kingpinLength_m: model.kingpin,
    tieRodLength_m: model.tieRod,
    tieToLower_m: model.tieToLower,
    tieToUpper_m: model.tieToUpper,
    spindleAxisUnit: normalize(hardpoints.spindleAxis),
    wheelCenterLocalOnUpright: model.wheelLocal
  },
  constraintModel: {
    sla: 'upper ball on arm circle, lower ball on arm circle, three upright distances, tie-rod length, prescribed wheel-center height',
    macpherson: 'upper ball replaced by the strut line through strutTop; other constraints unchanged',
    shock: 'length is an output. It is not a constant-length link.',
    drivenCoordinate: 'wheelCenter.y'
  },
  sweepTravel_m: travels,
  slaSweep: sla.samples,
  macphersonSweep: mac.samples,
  passCount: tests.length - failed.length,
  failCount: failed.length,
  failed,
  tests,
  solverSource: readFileSync(new URL(import.meta.url), 'utf8')
};

mkdirSync('F:/project/cyq/AI_Coding/car/docs/research', { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2));
const summary = {
  passCount: payload.passCount,
  failCount: payload.failCount,
  failed,
  camberDeg: camberRange * 180 / Math.PI,
  toeDeg: toeRange * 180 / Math.PI,
  halfRange_mm: halfRange * 1000,
  shockRange_mm: shockRange * 1000,
  upperErr_mm: upperErr * 1000,
  camberGap40_deg: camberGap * 180 / Math.PI,
  designResidual,
  shortFail,
  demoUpperDelta_mm: (demoRest.upper - demoBump.upper) * 1000
};
console.log(JSON.stringify(summary, null, 2));

import { determinant, directionToVehicle, toVehicleMeters } from './frame.mjs';

const TEMPLATES = {
  doubleWishbone: [
    { id: 'upperArm', type: 'revolute' },
    { id: 'lowerArm', type: 'revolute' },
    { id: 'tieRod', type: 'distance' },
    { id: 'shock', type: 'prismatic' }
  ],
  macpherson: [
    { id: 'strut', type: 'prismatic' },
    { id: 'lowerArm', type: 'revolute' },
    { id: 'tieRod', type: 'distance' }
  ],
  fiveLink: [
    { id: 'link1', type: 'distance' },
    { id: 'link2', type: 'distance' },
    { id: 'link3', type: 'distance' },
    { id: 'link4', type: 'distance' },
    { id: 'link5', type: 'distance' },
    { id: 'shock', type: 'prismatic' }
  ]
};

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => norm(sub(a, b));
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function fail(code, message, detail = {}) {
  return { ok: false, code, message, detail };
}

function rotateXYZ(angles, vector) {
  const [rx, ry, rz] = angles;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  let x = vector[0];
  let y = cx * vector[1] - sx * vector[2];
  let z = sx * vector[1] + cx * vector[2];
  const x2 = cy * x + sy * z;
  const z2 = -sy * x + cy * z;
  y = y;
  x = cz * x2 - sz * y;
  const y3 = sz * x2 + cz * y;
  return [x, y3, z2];
}

function axisOf(a, b) {
  const direction = sub(b, a);
  const length = norm(direction);
  if (length < 1e-9) return null;
  return { origin: a, dir: direction.map((v) => v / length) };
}

function circleParts(point, axis) {
  const offset = sub(point, axis.origin);
  const along = dot(offset, axis.dir);
  const radial = norm(sub(offset, mul(axis.dir, along)));
  return { along, radial };
}

function uprightBasis(lowerBall, upperBall, tieOuter) {
  const x = sub(upperBall, lowerBall);
  const xl = norm(x);
  if (xl < 1e-9) return null;
  const xn = x.map((v) => v / xl);
  const raw = sub(tieOuter, lowerBall);
  const y = sub(raw, mul(xn, dot(raw, xn)));
  const yl = norm(y);
  if (yl < 1e-9) return null;
  const yn = y.map((v) => v / yl);
  return { origin: lowerBall, x: xn, y: yn, z: cross(xn, yn) };
}

function toWorld(frame, local) {
  return add(frame.origin, add(mul(frame.x, local[0]), add(mul(frame.y, local[1]), mul(frame.z, local[2]))));
}

function toLocal(frame, point) {
  const offset = sub(point, frame.origin);
  return [dot(offset, frame.x), dot(offset, frame.y), dot(offset, frame.z)];
}

function wheelOf(lowerBall, upperBall, tieOuter, local) {
  const frame = uprightBasis(lowerBall, upperBall, tieOuter);
  if (!frame) return null;
  return toWorld(frame, local);
}

function spindleOf(lowerBall, upperBall, tieOuter, local) {
  const frame = uprightBasis(lowerBall, upperBall, tieOuter);
  if (!frame) return null;
  const vector = add(mul(frame.x, local[0]), add(mul(frame.y, local[1]), mul(frame.z, local[2])));
  const length = norm(vector);
  return length < 1e-12 ? null : vector.map((v) => v / length);
}

function rodrigues(point, origin, axisDir, angle) {
  const offset = sub(point, origin);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rotated = add(add(mul(offset, c), mul(cross(axisDir, offset), s)), mul(axisDir, dot(axisDir, offset) * (1 - c)));
  return add(origin, rotated);
}

function armAngle(axis, fromPoint, toPoint) {
  const radial = (point) => {
    const offset = sub(point, axis.origin);
    return sub(offset, mul(axis.dir, dot(offset, axis.dir)));
  };
  const from = radial(fromPoint);
  const to = radial(toPoint);
  return Math.atan2(dot(axis.dir, cross(from, to)), dot(from, to));
}

export function camberRad(spindle) {
  return Math.atan2(spindle[1], Math.hypot(spindle[0], spindle[2]));
}

export function toeRad(spindle) {
  const forward = cross(spindle, [0, 1, 0]);
  const length = norm(forward);
  if (length < 1e-12) return 0;
  return Math.atan2(forward[0] / length, forward[2] / length);
}

function solveLinear(matrix, rhs) {
  const size = rhs.length;
  const rows = matrix.map((row, index) => [...row, rhs[index]]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const diagonal = rows[column][column];
    if (Math.abs(diagonal) < 1e-14) return null;
    for (let col = column; col <= size; col++) rows[column][col] /= diagonal;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let col = column; col <= size; col++) rows[row][col] -= factor * rows[column][col];
    }
  }
  return rows.map((row) => row[size]);
}

function newton(initial, residualFn) {
  let state = initial.slice();
  for (let iter = 0; iter < 40; iter++) {
    const residual = residualFn(state);
    const magnitude = Math.max(...residual.map((value) => Math.abs(value)));
    if (magnitude < 1e-9) return { ok: true, state, residual: magnitude, iter };
    const jacobian = residual.map(() => new Array(state.length).fill(0));
    const step = 1e-8;
    for (let column = 0; column < state.length; column++) {
      const plus = state.slice();
      const minus = state.slice();
      plus[column] += step;
      minus[column] -= step;
      const upper = residualFn(plus);
      const lower = residualFn(minus);
      for (let row = 0; row < residual.length; row++) jacobian[row][column] = (upper[row] - lower[row]) / (2 * step);
    }
    const delta = solveLinear(jacobian, residual.map((value) => -value));
    if (!delta) return { ok: false, state, residual: magnitude, iter, reason: 'singular' };
    let scale = 1;
    let accepted = false;
    for (let attempt = 0; attempt < 14; attempt++) {
      const trial = state.map((value, index) => value + scale * delta[index]);
      const next = Math.max(...residualFn(trial).map((value) => Math.abs(value)));
      if (next < magnitude * (1 - 1e-4 * scale) || next < 1e-9) {
        state = trial;
        accepted = true;
        break;
      }
      scale *= 0.5;
    }
    if (!accepted) return { ok: false, state, residual: magnitude, iter, reason: 'linesearch' };
  }
  const end = residualFn(state);
  return { ok: false, state, residual: Math.max(...end.map((value) => Math.abs(value))), iter: 40, reason: 'maxiter' };
}

function sameJoints(actual, expected) {
  if (!actual || actual.length !== expected.length) return false;
  return expected.every((joint, index) => actual[index].id === joint.id && actual[index].type === joint.type);
}

function convertPoints(points, frameId, units) {
  const converted = {};
  for (const [name, value] of Object.entries(points)) {
    if (name === 'links') {
      converted.links = [];
      for (const link of value) {
        const chassis = toVehicleMeters(link.chassis, frameId, units);
        const upright = toVehicleMeters(link.upright, frameId, units);
        if (!chassis.ok || !upright.ok) return fail('KIN-E-FRAME', '五连杆端点无法换算。', { id: link.id });
        converted.links.push({ id: link.id, chassis: chassis.point, upright: upright.point });
      }
      continue;
    }
    if (name === 'spindleAxis') {
      const direction = directionToVehicle(value, frameId);
      if (!direction) return fail('KIN-E-FRAME', '旋转轴所在坐标系无法识别。');
      converted.spindleAxis = direction;
      continue;
    }
    const result = toVehicleMeters(value, frameId, units);
    if (!result.ok) return fail(result.code, '硬点坐标或单位无法换到车辆坐标系。', { name });
    converted[name] = result.point;
  }
  return { ok: true, points: converted };
}

function prepare(request) {
  if (!request || typeof request !== 'object') return fail('KIN-E-INPUT', '请求必须是对象。');
  if (Object.prototype.hasOwnProperty.call(request, 'scale')) {
    return fail('KIN-E-SCALE', '不允许用缩放表示轮距、轴距或镜像。', { rule: 'R-01 P14' });
  }
  const frame = request.frame || {};
  if (frame.rotation) {
    const det = determinant(frame.rotation);
    if (Math.abs(det + 1) < 1e-6 && !frame.mirror?.handednessFlip) {
      return fail('KIN-E-MIRROR', '反射变换必须声明 mirror.handednessFlip。', { determinant: det, rule: 'R-02 DC-E024' });
    }
  }
  const frameId = frame.frameId || 'FR-VEHICLE';
  const units = frame.units || 'm';
  let valueBasis = request.valueBasis;
  if (!valueBasis) valueBasis = 'DEMO_ASSUMPTION';
  if (valueBasis === 'SOURCED' && (!Array.isArray(request.sources) || request.sources.length === 0)) {
    return fail('KIN-E-BASIS', '标成实测来源时必须给出来源编号。');
  }
  const topology = request.topology;
  if (!TEMPLATES[topology]) return fail('KIN-E-JOINT', '拓扑必须是 doubleWishbone、macpherson 或 fiveLink。');
  if (request.joints && !sameJoints(request.joints, TEMPLATES[topology])) {
    return fail('KIN-E-JOINT', '关节类型与拓扑不一致。', { expected: TEMPLATES[topology], actual: request.joints });
  }
  const converted = convertPoints(request.hardpoints || {}, frameId, units);
  if (!converted.ok) return converted;
  const points = converted.points;
  const side = request.side || 'left';
  const wheelX = points.wheelCenter?.[0];
  if (side === 'left' && !(wheelX > 0)) return fail('KIN-E-SIDE', '左轮轮心必须在 +X。', { wheelX });
  if (side === 'right' && !(wheelX < 0)) return fail('KIN-E-SIDE', '右轮轮心必须在 -X。', { wheelX });
  const travel = request.travelM || 0;
  const travelLimit = request.limits?.travelM || { min: -0.08, max: 0.08 };
  if (travel < travelLimit.min || travel > travelLimit.max) {
    return fail('KIN-E-TRAVEL', '请求行程超出声明范围。', { travel, travelLimit });
  }
  return { ok: true, frameId, units, valueBasis, topology, side, points, travel, request };
}

function lengthConflict(points, declared, topology) {
  if (!declared) return null;
  const compare = (name, actual) => {
    if (declared[name] === undefined) return null;
    const error = Math.abs(declared[name] - actual);
    if (error > 0.0005) return { name, declared: declared[name], actual, error };
    return null;
  };
  if (topology === 'fiveLink') {
    for (const link of points.links || []) {
      const found = compare(link.id, dist(link.chassis, link.upright));
      if (found) return found;
    }
    return null;
  }
  return compare('tieRod', dist(points.tieOuter, points.tieInner))
    || compare('kingpin', dist(points.upperBall, points.lowerBall));
}

function buildArmModel(points, topology) {
  const frame = uprightBasis(points.lowerBall, points.upperBall, points.tieOuter);
  if (!frame) return fail('KIN-E-INPUT', '转向节三点不能共线。');
  const upperAxis = topology === 'doubleWishbone' ? axisOf(points.upperAxisA, points.upperAxisB) : null;
  const lowerAxis = axisOf(points.lowerAxisA, points.lowerAxisB);
  if (!lowerAxis || (topology === 'doubleWishbone' && !upperAxis)) return fail('KIN-E-INPUT', '摆臂轴线的两个衬套点重合。');
  const strutDir = topology === 'macpherson' ? directionToVehicle(sub(points.upperBall, points.strutTop), 'FR-VEHICLE') : null;
  const lowerMid = lerp(points.lowerAxisA, points.lowerAxisB, 0.5);
  return {
    ok: true,
    topology,
    points,
    wheelLocal: toLocal(frame, points.wheelCenter),
    spindleLocal: toLocal(frame, add(points.lowerBall, points.spindleAxis)),
    upperAxis,
    lowerAxis,
    upperCircle: upperAxis ? circleParts(points.upperBall, upperAxis) : null,
    lowerCircle: circleParts(points.lowerBall, lowerAxis),
    kingpin: dist(points.upperBall, points.lowerBall),
    tieToLower: dist(points.tieOuter, points.lowerBall),
    tieToUpper: dist(points.tieOuter, points.upperBall),
    tieRod: dist(points.tieOuter, points.tieInner),
    strutDir,
    shockArmDesign: lerp(lowerMid, points.lowerBall, 0.7),
    designState: [...points.lowerBall, ...points.upperBall, ...points.tieOuter],
    designWheelY: points.wheelCenter[1]
  };
}

function lineResidual(point, origin, direction) {
  const offset = sub(point, origin);
  const along = dot(offset, direction);
  const perpendicular = sub(offset, mul(direction, along));
  const helper = Math.abs(direction[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const tangent = cross(direction, helper);
  const t1 = tangent.map((v) => v / norm(tangent));
  const t2 = cross(direction, t1);
  return [dot(perpendicular, t1), dot(perpendicular, t2)];
}

function circleResidual(point, axis, built) {
  const now = circleParts(point, axis);
  return [now.radial - built.radial, now.along - built.along];
}

function armResidual(state, model, targetY, tieLength) {
  const lowerBall = state.slice(0, 3);
  const upperBall = state.slice(3, 6);
  const tieOuter = state.slice(6, 9);
  const upper = model.topology === 'macpherson'
    ? lineResidual(upperBall, model.points.strutTop, model.strutDir)
    : circleResidual(upperBall, model.upperAxis, model.upperCircle);
  const wheel = wheelOf(lowerBall, upperBall, tieOuter, model.wheelLocal);
  if (!wheel) return new Array(9).fill(1);
  return [
    ...upper,
    ...circleResidual(lowerBall, model.lowerAxis, model.lowerCircle),
    dist(upperBall, lowerBall) - model.kingpin,
    dist(tieOuter, lowerBall) - model.tieToLower,
    dist(tieOuter, upperBall) - model.tieToUpper,
    dist(tieOuter, model.points.tieInner) - tieLength,
    wheel[1] - targetY
  ];
}

function armPose(state, model) {
  const lowerBall = state.slice(0, 3);
  const upperBall = state.slice(3, 6);
  const tieOuter = state.slice(6, 9);
  const wheelCenter = wheelOf(lowerBall, upperBall, tieOuter, model.wheelLocal);
  const spindle = spindleOf(lowerBall, upperBall, tieOuter, model.spindleLocal);
  const angle = armAngle(model.lowerAxis, model.points.lowerBall, lowerBall);
  const shockArm = rodrigues(model.shockArmDesign, model.lowerAxis.origin, model.lowerAxis.dir, angle);
  const shockLength = model.topology === 'macpherson'
    ? dist(model.points.strutTop, upperBall)
    : dist(model.points.shockChassis, shockArm);
  return {
    wheelCenter, spindle,
    camberRad: camberRad(spindle),
    toeRad: toeRad(spindle),
    shockLength,
    halfshaftLength: dist(model.points.diffOutput, wheelCenter),
    upperRadial: model.upperAxis ? circleParts(upperBall, model.upperAxis).radial : null,
    lowerRadial: circleParts(lowerBall, model.lowerAxis).radial,
    tieLength: dist(tieOuter, model.points.tieInner)
  };
}

function buildFiveModel(points) {
  if (!Array.isArray(points.links) || points.links.length !== 5) return fail('KIN-E-INPUT', '五连杆需要正好五根距离约束。');
  const origin = points.wheelCenter;
  return {
    ok: true,
    topology: 'fiveLink',
    points,
    origin,
    locals: points.links.map((link) => ({ id: link.id, chassis: link.chassis, local: sub(link.upright, origin), length: dist(link.chassis, link.upright) })),
    shockLocal: sub(points.shockUpright, origin),
    spindle: points.spindleAxis,
    designState: [...origin, 0, 0, 0],
    designWheelY: origin[1]
  };
}

function fivePoint(state, local, origin) {
  return add(state.slice(0, 3), rotateXYZ(state.slice(3, 6), local));
}

function fiveResidual(state, model, targetY) {
  const residuals = model.locals.map((link) => dist(fivePoint(state, link.local, model.origin), link.chassis) - link.length);
  residuals.push(state[1] - targetY);
  return residuals;
}

function fivePose(state, model) {
  const wheelCenter = state.slice(0, 3);
  const spindle = rotateXYZ(state.slice(3, 6), model.spindle);
  const shock = dist(model.points.shockChassis, fivePoint(state, model.shockLocal, model.origin));
  return {
    wheelCenter, spindle,
    camberRad: camberRad(spindle),
    toeRad: toeRad(spindle),
    shockLength: shock,
    halfshaftLength: dist(model.points.diffOutput, wheelCenter),
    linkErrors: model.locals.map((link) => dist(fivePoint(state, link.local, model.origin), link.chassis) - link.length)
  };
}

function rejectLimits(pose, limits) {
  if (!limits) return null;
  if (limits.shockLengthM && (pose.shockLength < limits.shockLengthM.min || pose.shockLength > limits.shockLengthM.max)) {
    return fail('KIN-E-LIMIT', '减振器长度超出关节极限。', { shockLength: pose.shockLength, limits: limits.shockLengthM });
  }
  if (limits.halfshaftLengthM && (pose.halfshaftLength < limits.halfshaftLengthM.min || pose.halfshaftLength > limits.halfshaftLengthM.max)) {
    return fail('KIN-E-LIMIT', '半轴长度超出允许伸缩。', { halfshaftLength: pose.halfshaftLength, limits: limits.halfshaftLengthM });
  }
  return null;
}

export function solveCorner(request) {
  const prepared = prepare(request);
  if (!prepared.ok) return prepared;
  const conflict = lengthConflict(prepared.points, request.declaredLengthsM, prepared.topology);
  if (conflict) return fail('KIN-E-LENGTH', '声明杆长和硬点距离冲突。', conflict);
  const targetY = (prepared.topology === 'fiveLink' ? prepared.points.wheelCenter[1] : prepared.points.wheelCenter[1]) + prepared.travel;
  if (prepared.topology === 'fiveLink') {
    const model = buildFiveModel(prepared.points);
    if (!model.ok) return model;
    const initial = request.initialState || model.designState;
    const solved = newton(initial, (state) => fiveResidual(state, model, targetY));
    if (!solved.ok) return fail('KIN-E-CONVERGE', '五连杆位置约束不收敛。', { reason: solved.reason, residual: solved.residual });
    const pose = fivePose(solved.state, model);
    const limited = rejectLimits(pose, request.limits);
    if (limited) return { ...limited, diagnosticPose: pose };
    return { ok: true, code: 'KIN-OK', valueBasis: prepared.valueBasis, frameId: 'FR-VEHICLE', topology: prepared.topology, pose, iterations: solved.iter, residual: solved.residual, state: solved.state };
  }
  for (const name of ['lowerBall', 'upperBall', 'tieOuter', 'tieInner', 'lowerAxisA', 'lowerAxisB', 'wheelCenter', 'spindleAxis', 'diffOutput']) {
    if (!prepared.points[name]) return fail('KIN-E-INPUT', '缺少硬点。', { name });
  }
  if (prepared.topology === 'doubleWishbone' && (!prepared.points.upperAxisA || !prepared.points.shockChassis)) {
    return fail('KIN-E-INPUT', '双叉臂缺少上摆臂轴线或减振器上支点。');
  }
  if (prepared.topology === 'macpherson' && !prepared.points.strutTop) return fail('KIN-E-INPUT', '麦弗逊缺少滑柱上支点。');
  const model = buildArmModel(prepared.points, prepared.topology);
  if (!model.ok) return model;
  const tieLength = request.tieLengthOverrideM ?? model.tieRod;
  const initial = request.initialState || model.designState;
  const solved = newton(initial, (state) => armResidual(state, model, targetY, tieLength));
  if (!solved.ok) return fail('KIN-E-CONVERGE', '悬架约束不收敛，当前位置不能装配。', { reason: solved.reason, residual: solved.residual, topology: prepared.topology });
  const pose = armPose(solved.state, model);
  const limited = rejectLimits(pose, request.limits);
  if (limited) return { ...limited, diagnosticPose: pose };
  return { ok: true, code: 'KIN-OK', valueBasis: prepared.valueBasis, frameId: 'FR-VEHICLE', topology: prepared.topology, pose, iterations: solved.iter, residual: solved.residual, state: solved.state };
}

export function solveSweep(request, travels) {
  const samples = [];
  let initialState = request.initialState;
  for (const travel of travels) {
    const solved = solveCorner({ ...request, travelM: travel, initialState });
    samples.push({ travelM: travel, ok: solved.ok, code: solved.code, pose: solved.pose || solved.diagnosticPose || null, residual: solved.residual ?? solved.detail?.residual });
    if (!solved.ok) return { ok: false, samples };
    initialState = solved.state;
  }
  return { ok: true, samples };
}

export { TEMPLATES };

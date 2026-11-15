/**
 * 把已验收的单角解算变成刚性零件位姿。
 * 不修改求解器，不拉伸网格，不输出没有证据的力。
 */
import { solveCorner } from '../kinematics/solve.mjs';
import { directionToVehicle, toVehicleMeters } from '../kinematics/frame.mjs';
import { checkVariantStatics } from '../kinematics-bridge/bridge.mjs';

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => Math.hypot(v[0], v[1], v[2]);
const normalize = (v) => mul(v, 1 / norm(v));
const dist = (a, b) => norm(sub(a, b));

function quatFromAxisAngle(axis, angle) {
  const half = angle / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

function quatFromBasis(x, y, z) {
  const m00 = x[0];
  const m01 = y[0];
  const m02 = z[0];
  const m10 = x[1];
  const m11 = y[1];
  const m12 = z[1];
  const m20 = x[2];
  const m21 = y[2];
  const m22 = z[2];
  const trace = m00 + m11 + m22;
  let qx;
  let qy;
  let qz;
  let qw;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    qw = 0.25 * s;
    qx = (m21 - m12) / s;
    qy = (m02 - m20) / s;
    qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  const n = Math.hypot(qx, qy, qz, qw);
  return [qx / n, qy / n, qz / n, qw / n];
}

export function rotateByQuat(q, v) {
  const xyz = [q[0], q[1], q[2]];
  const t = mul(cross(xyz, v), 2);
  return add(v, add(mul(t, q[3]), cross(xyz, t)));
}

function axisAngleBetween(origin, axisDir, fromPoint, toPoint) {
  const radial = (point) => {
    const offset = sub(point, origin);
    return sub(offset, mul(axisDir, dot(offset, axisDir)));
  };
  const from = radial(fromPoint);
  const to = radial(toPoint);
  return Math.atan2(dot(axisDir, cross(from, to)), dot(from, to));
}

function armInstance(id, axisA, axisB, designBall, currentBall) {
  const axis = normalize(sub(axisB, axisA));
  const angle = axisAngleBetween(axisA, axis, designBall, currentBall);
  const quaternion = quatFromAxisAngle(axis, angle);
  const posedBall = add(axisA, rotateByQuat(quaternion, sub(designBall, axisA)));
  return {
    instanceId: id,
    position: axisA,
    quaternion,
    rigidLengthsM: {
      axisAToBall: dist(axisA, currentBall),
      axisBToBall: dist(axisB, currentBall)
    },
    closureErrorM: dist(posedBall, currentBall),
    scale: [1, 1, 1]
  };
}

function uprightInstance(id, design, current) {
  const basis = (lower, upper, outer) => {
    const x = normalize(sub(upper, lower));
    const y = normalize(sub(sub(outer, lower), mul(x, dot(sub(outer, lower), x))));
    return { x, y, z: cross(x, y) };
  };
  const now = basis(current.lower, current.upper, current.outer);
  const quaternion = quatFromBasis(now.x, now.y, now.z);
  const localUpper = [dist(design.upper, design.lower), 0, 0];
  const posedUpper = add(current.lower, rotateByQuat(quaternion, localUpper));
  return {
    instanceId: id,
    position: current.lower,
    quaternion,
    closureErrorM: dist(posedUpper, current.upper),
    scale: [1, 1, 1]
  };
}

function tieRodInstance(id, inner, designOuter, currentOuter) {
  const direction = normalize(sub(currentOuter, inner));
  const helper = Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const x = normalize(cross(helper, direction));
  const y = cross(direction, x);
  const quaternion = quatFromBasis(x, y, direction);
  const length = dist(inner, designOuter);
  const posedOuter = add(inner, rotateByQuat(quaternion, [0, 0, length]));
  return {
    instanceId: id,
    position: inner,
    quaternion,
    rigidLengthsM: { length: dist(inner, currentOuter) },
    closureErrorM: dist(posedOuter, currentOuter),
    scale: [1, 1, 1]
  };
}

function hubInstance(id, wheelCenter, spindle) {
  const x = normalize(spindle);
  const helper = Math.abs(x[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const y = normalize(sub(helper, mul(x, dot(helper, x))));
  const z = cross(x, y);
  return {
    instanceId: id,
    position: wheelCenter,
    quaternion: quatFromBasis(x, y, z),
    wheelSpinRad: null,
    wheelSpinBasis: 'UNKNOWN',
    scale: [1, 1, 1]
  };
}

function clearance(instances, proxies) {
  const byId = Object.fromEntries(instances.map((item) => [item.instanceId, item]));
  const worlds = proxies.map((proxy) => {
    if (proxy.world) return { ...proxy, center: proxy.world };
    const instance = byId[proxy.instanceId];
    return { ...proxy, center: add(instance.position, rotateByQuat(instance.quaternion, proxy.local)) };
  });
  const pairs = [];
  for (let i = 0; i < worlds.length; i++) {
    for (let j = i + 1; j < worlds.length; j++) {
      const gap = dist(worlds[i].center, worlds[j].center) - worlds[i].radiusM - worlds[j].radiusM;
      pairs.push({ a: worlds[i].id, b: worlds[j].id, clearanceM: gap, interference: gap < 0 });
    }
  }
  return {
    method: 'DECLARED_SPHERE_PROXY',
    notCadCollision: true,
    pairs,
    status: pairs.some((pair) => pair.interference) ? 'INTERFERENCE' : 'CLEAR'
  };
}

function rejected(category, code, message, extra = {}) {
  return {
    legalAssembly: false,
    category,
    code,
    message,
    samples: [],
    forces: null,
    forceBasis: 'UNKNOWN',
    ...extra
  };
}

function vehicleHardpoints(hardpoints, frame = { frameId: 'FR-VEHICLE', units: 'm' }) {
  const converted = {};
  for (const [name, value] of Object.entries(hardpoints)) {
    if (!Array.isArray(value) || value.length !== 3 || typeof value[0] !== 'number') {
      converted[name] = value;
      continue;
    }
    if (name === 'spindleAxis') {
      const direction = directionToVehicle(value, frame.frameId || 'FR-VEHICLE');
      if (!direction) return { ok: false, code: 'KIN-E-FRAME' };
      converted[name] = direction;
      continue;
    }
    const point = toVehicleMeters(value, frame.frameId || 'FR-VEHICLE', frame.units || 'm');
    if (!point.ok) return point;
    converted[name] = point.point;
  }
  return { ok: true, points: converted };
}

export function poseAtTravel(solverRequest, travelM, initialState) {
  const solved = solveCorner({ ...solverRequest, travelM, initialState });
  if (!solved.ok) {
    return rejected(
      solved.code === 'KIN-E-CONVERGE' ? 'SOLVER_NUMERICAL' : 'GEOMETRY_INFEASIBLE',
      solved.code,
      solved.message,
      { residualM: solved.detail?.residual ?? null, solverCalled: true }
    );
  }
  const converted = vehicleHardpoints(solverRequest.hardpoints, solverRequest.frame);
  if (!converted.ok) return rejected('INPUT_INVALID', converted.code, '硬点不能换到车辆坐标。', { solverCalled: true });
  const points = converted.points;
  const [lx, ly, lz, ux, uy, uz, tx, ty, tz] = solved.state;
  const current = { lower: [lx, ly, lz], upper: [ux, uy, uz], outer: [tx, ty, tz] };
  const side = solverRequest.side === 'right' ? 'FR' : 'FL';
  const instances = [
    armInstance(`INST-SLA-UPPER-ARM-${side}`, points.upperAxisA, points.upperAxisB, points.upperBall, current.upper),
    armInstance(`INST-SLA-LOWER-ARM-${side}`, points.lowerAxisA, points.lowerAxisB, points.lowerBall, current.lower),
    uprightInstance(`INST-SLA-UPRIGHT-${side}`, { lower: points.lowerBall, upper: points.upperBall, outer: points.tieOuter }, current),
    tieRodInstance(`INST-SLA-TIEROD-${side}`, points.tieInner, points.tieOuter, current.outer),
    hubInstance(`INST-SLA-HUB-${side}`, solved.pose.wheelCenter, solved.pose.spindle)
  ];
  const proxyReport = clearance(instances, solverRequest.proxies || []);
  const mechanismOk = instances.every((item) => (item.closureErrorM || 0) < (solverRequest.closureLimitM || 1e-6));
  return {
    legalAssembly: mechanismOk && proxyReport.status === 'CLEAR',
    category: mechanismOk ? 'MECHANISM_OK' : 'CLOSURE_FAIL',
    code: solved.code,
    travelM,
    residualM: solved.residual,
    camberRad: solved.pose.camberRad,
    toeRad: solved.pose.toeRad,
    shockLengthM: solved.pose.shockLength,
    halfshaftLengthM: solved.pose.halfshaftLength,
    instances,
    clearance: proxyReport,
    state: solved.state,
    solverCalled: true,
    forces: null,
    forceBasis: 'UNKNOWN',
    valueBasis: solved.valueBasis || 'DEMO_ASSUMPTION',
    frameId: 'FR-VEHICLE'
  };
}

export function runSlice(request) {
  if (request.omitConstraints?.length) {
    return rejected('UNDERCONSTRAINED', 'KIN-E-UNDER', '约束被去掉后自由度超过一个，不发布零件位姿。', {
      omitted: request.omitConstraints,
      solverCalled: false
    });
  }
  const variant = checkVariantStatics({
    ...(request.variant || {}),
    valueBasis: request.valueBasis || 'DEMO_ASSUMPTION'
  });
  if (!variant.ok) {
    return rejected('VARIANT_ILLEGAL', variant.failures[0].rule, variant.failures[0].message, {
      failures: variant.failures,
      solverCalled: false
    });
  }
  const travels = request.travelsM || [0];
  const samples = [];
  let initial = undefined;
  for (const travel of travels) {
    const sample = poseAtTravel(request.solverRequest, travel, initial);
    if (!sample.legalAssembly && sample.code !== 'KIN-OK') {
      return { ...sample, samples: [], requestedTravelsM: travels };
    }
    if (sample.code !== 'KIN-OK') return { ...sample, samples: [], requestedTravelsM: travels };
    initial = sample.state;
    const published = { ...sample };
    delete published.state;
    samples.push(published);
  }
  const legal = samples.every((sample) => sample.legalAssembly);
  return {
    legalAssembly: legal,
    category: legal ? 'MECHANISM_OK' : 'CLEARANCE_OR_CLOSURE',
    samples,
    requestedTravelsM: travels,
    valueBasis: 'DEMO_ASSUMPTION',
    provenance: request.provenance || 'FICTIONAL_FIXTURE',
    instanceIdStatus: 'CANDIDATE_NOT_FROZEN',
    forces: null,
    forceBasis: 'UNKNOWN'
  };
}

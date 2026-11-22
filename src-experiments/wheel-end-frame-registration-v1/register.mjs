/**
 * 判断 C-01 转向节基准和 R-28 运动位姿能否唯一刚体配准。
 * 不修改 CAD、快照或运动流。
 */
import { readFileSync } from 'node:fs';

const POSITION_LIMIT_M = 0.0001;
const ANGLE_LIMIT_RAD = 0.1 * Math.PI / 180;

const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => Math.hypot(v[0], v[1], v[2]);
const normalize = (v) => mul(v, 1 / norm(v));

function det(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

function centroid(points) {
  return points.reduce((sum, point) => add(sum, point), [0, 0, 0]).map((value) => value / points.length);
}

function pointSpread(points) {
  const edges = [sub(points[1], points[0]), sub(points[2], points[0]), sub(points[2], points[1])];
  return { edges, area: norm(cross(edges[0], edges[1])), shortest: Math.min(...edges.map(norm)) };
}

function frameOf(points) {
  const origin = centroid(points);
  const x = normalize(sub(points[1], points[0]));
  const raw = sub(points[2], points[0]);
  const rejected = sub(raw, mul(x, dot(raw, x)));
  const y = normalize(rejected);
  return { origin, x, y, z: cross(x, y) };
}

function rotationFromFrames(src, dst) {
  const sourceAxes = [src.x, src.y, src.z];
  const targetAxes = [dst.x, dst.y, dst.z];
  return [0, 1, 2].map((row) => [0, 1, 2].map((col) => targetAxes.reduce((sum, axis, index) => sum + axis[row] * sourceAxes[index][col], 0)));
}

function matMulVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}

export function rigidFromPointPairs(source, target, sourceNormal = null, targetNormal = null) {
  if (source.length !== 3 || target.length !== 3) {
    return { ok: false, code: 'NOT_UNIQUE', reason: '刚体定位需要三个不共线的同名物理点。' };
  }
  const spread = pointSpread(source);
  if (spread.shortest < 1e-9 || pointSpread(target).shortest < 1e-9) {
    return { ok: false, code: 'COINCIDENT', reason: '有重合点，不能确定刚体。' };
  }
  if (spread.area < 1e-9 || pointSpread(target).area < 1e-9) {
    return { ok: false, code: 'COLLINEAR', reason: '三点共线，不能确定绕连线的转角。' };
  }
  const src = frameOf(source);
  const dst = frameOf(target);
  const rotation = rotationFromFrames(src, dst);
  const handedness = det(rotation);
  if (handedness < 0.999) return { ok: false, code: 'MIRROR_REJECTED', handedness };
  if (sourceNormal && targetNormal) {
    const normalDot = dot(matMulVec(rotation, sourceNormal), targetNormal);
    if (normalDot < 0.999) return { ok: false, code: 'MIRROR_REJECTED', normalDot };
  }
  const translation = sub(dst.origin, matMulVec(rotation, src.origin));
  const residual = Math.max(...source.map((point, index) => norm(sub(add(matMulVec(rotation, point), translation), target[index]))));
  return { ok: residual <= POSITION_LIMIT_M, code: residual <= POSITION_LIMIT_M ? 'REGISTERED' : 'RESIDUAL_TOO_LARGE', rotation, translation, residualM: residual, handedness };
}

export function playbackFor(report, revision) {
  if (revision !== report.source.sourceRevision) return { playbackAllowed: false, status: 'STALE' };
  return { playbackAllowed: false, status: report.status, reason: '即使修订一致，基准不足仍然不能播放。' };
}

function loadDatums() {
  const parameters = JSON.parse(readFileSync(new URL('../../cad/experiments/vehicle-cad-pipeline-v1/parameters.json', import.meta.url), 'utf8'));
  const assembly = JSON.parse(readFileSync(new URL('../../cad/experiments/vehicle-cad-pipeline-v1/assembly.json', import.meta.url), 'utf8'));
  const datums = JSON.parse(readFileSync(new URL('../../cad/experiments/wheel-end-datum-interface-v1/datums.json', import.meta.url), 'utf8'));
  const motion = JSON.parse(readFileSync(new URL('../mechanism-pose-adapter-v1/canonical-motion.json', import.meta.url), 'utf8'));
  const width = parameters.bearing.width;
  const seats = ['upper', 'lower'].map((name) => {
    const ear = parameters.knuckle[name];
    const sign = name === 'upper' ? 1 : -1;
    return {
      name: `${name}BallJointSeat`,
      generatorOriginMm: [ear.offsetX, sign * ear.offsetY, -width / 2],
      generatorAxis: [0, sign, 0],
      meaning: '锥孔座轴线过凸台，不是球心。'
    };
  });
  return { parameters, assembly, datums, motion, seats };
}

export function assessRegistration() {
  const { parameters, assembly, datums, motion, seats } = loadDatums();
  const frame = motion.frames[0];
  const knuckle = frame.instances.find((item) => item.instanceId === 'PI-20-016-FL');
  const missing = [
    {
      id: 'BALL_CENTER',
      owner: 'C-01',
      detail: '球头未建模，只有锥孔座。沿锥轴到球心的距离没有来源。'
    },
    {
      id: 'SHARED_POINT_IDS',
      owner: 'C-01 与 R-28',
      detail: '运动硬点是另一套虚构夹具，没有和锥孔座使用同一个点编号。'
    },
    {
      id: 'ANCHOR_IS_NOT_ROOT_AXIS',
      owner: 'C-02',
      detail: 'assembly.json 的 xAxis/zAxis 是安装锚点在工装根坐标中的分量，不是第二套“Z 向上”定义。工装根仍是 X 外侧、Y 后、Z 上。'
    },
    {
      id: 'BEARING_FACE_TO_LOWER_BALL',
      owner: 'C-01 与 R-28',
      detail: 'CAD 原点是外侧轴承端面与主轴交点。运动转向节原点是下球铰。两者的偏移没有共同测量。'
    }
  ];
  return {
    playbackAllowed: false,
    status: 'REGISTRATION_BLOCKED',
    motionValueBasis: 'DEMO_ASSUMPTION',
    source: {
      cadFrameId: assembly.root.frameId,
      cadUnits: parameters.units,
      cadSourceGrade: parameters.sourceGrade,
      cadOriginMeaning: assembly.root.description,
      cadNumericAxes: { xAxis: assembly.root.xAxis, zAxis: assembly.root.zAxis, role: 'INSTALLATION_ANCHOR_IN_WORKHOLDING' },
      workholdingAxes: datums.frames.workholding.positiveAxes,
      c02Registration: datums.registration.status,
      c02VehicleFromWorkholding: datums.registration.vehicleFromWorkholding,
      spindleProjectionDifferenceMm: datums.registration.projectionCheck.referenceBallCenterProjectionMm,
      taperSeats: seats,
      snapshotId: motion.snapshotId,
      runId: motion.simulationRun.runId,
      sourceRevision: motion.sourceRevision,
      resultHash: motion.simulationRun.resultHash,
      variantId: motion.variantId,
      instanceId: 'PI-20-016-FL'
    },
    motionKnuckle: {
      originMeaning: 'LOWER_BALL_JOINT',
      positionMeters: knuckle.positionMeters,
      quaternion: knuckle.quaternion
    },
    roles: {
      hub: frame.omitted.find((item) => item.role === 'HUB'),
      tierod: frame.omitted.find((item) => item.role === 'TIEROD')
    },
    missing,
    thresholds: {
      positionM: POSITION_LIMIT_M,
      angleRad: ANGLE_LIMIT_RAD,
      positionBasis: 'C-01 文档写明 CAD 与 GLB 误差上限 0.10 mm。这不是实车 K&C 容差。'
    }
  };
}

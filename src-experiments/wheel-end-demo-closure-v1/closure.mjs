/**
 * 同源左前轮端的名义闭合。只读已发布 CAD 清单，不使用 R-28 位姿。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const C03 = new URL('../../cad/experiments/wheel-end-ball-joint-demo-v1/out/c03-3f4bf8c599df28679b86/manifest.json', import.meta.url);
const C04 = new URL('../../cad/experiments/wheel-end-wheel-center-demo-v1/out/c04-bae128570c76aec59353/manifest.json', import.meta.url);
const C05 = new URL('../../cad/experiments/wheel-end-steering-datum-v1/out/c05-ee1e461fecf00faa8151/manifest.json', import.meta.url);

function sha256(url) {
  return createHash('sha256').update(readFileSync(url)).digest('hex');
}

function yUpFromMm(point) {
  return [point[0] * 0.001, point[2] * 0.001, -point[1] * 0.001];
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function near(a, b, limit = 1e-12) {
  return distance(a, b) <= limit;
}

export function loadClosure() {
  const c03 = JSON.parse(readFileSync(C03, 'utf8'));
  const c04 = JSON.parse(readFileSync(C04, 'utf8'));
  const c05 = JSON.parse(readFileSync(C05, 'utf8'));
  const pins = {
    c03ManifestSha256: sha256(C03),
    c04ManifestSha256: sha256(C04),
    c05ManifestSha256: sha256(C05)
  };
  const hashLinked = pins.c03ManifestSha256 === c04.sources.c03.manifestSha256
    && pins.c04ManifestSha256 === c05.sources.c04.manifestSha256;
  const upper = c03.studs.upper.ballCenter;
  const lower = c03.studs.lower.ballCenter;
  const wheel = c04.wheelCenter;
  const outer = c05.outerBallCenter;
  const points = {
    upperBallM: upper.workholdingYUpM,
    lowerBallM: lower.workholdingYUpM,
    wheelCenterM: wheel.workholdingYUpM,
    outerBallM: outer.workholdingYUpM
  };
  const conversions = [
    near(yUpFromMm(upper.workholdingMm), points.upperBallM),
    near(yUpFromMm(lower.workholdingMm), points.lowerBallM),
    near(yUpFromMm(wheel.workholdingMm), points.wheelCenterM),
    near(yUpFromMm(outer.workholdingMm), points.outerBallM)
  ];
  const linked = hashLinked && c05.sources?.c04?.packageId === c04.packageId && c04.sources?.c03?.packageId === c03.packageId;
  return {
    ok: conversions.every(Boolean) && linked,
    code: conversions.every(Boolean) && linked ? 'NOMINAL_POINTS_CONSISTENT' : 'SOURCE_INCONSISTENT',
    fixtureId: 'DEMO-CLOSURE-R45-001',
    sourceGrade: 'DEMO_ASSUMPTION',
    playbackAllowed: false,
    packages: { c03: c03.packageId, c04: c04.packageId, c05: c05.packageId },
    pins,
    snapshot: c05.sources?.snapshot || c04.sources?.snapshot || null,
    points,
    distancesM: {
      upperToLower: distance(points.upperBallM, points.lowerBallM),
      wheelToLower: distance(points.wheelCenterM, points.lowerBallM),
      wheelToUpper: distance(points.wheelCenterM, points.upperBallM),
      outerToLower: distance(points.outerBallM, points.lowerBallM),
      outerToUpper: distance(points.outerBallM, points.upperBallM),
      outerToWheel: distance(points.outerBallM, points.wheelCenterM)
    },
    constraints: [
      { id: 'CON-UPPER-LOWER-BALL', type: 'DISTANCE', status: 'MEASURED_DEMO', points: ['upperBall', 'lowerBall'] },
      { id: 'CON-WHEEL-CENTER', type: 'DISTANCE', status: 'MEASURED_DEMO', points: ['wheelCenter', 'lowerBall', 'upperBall'] },
      { id: 'CON-OUTER-BALL', type: 'DISTANCE', status: 'MEASURED_DEMO', points: ['outerBall', 'upperBall', 'lowerBall', 'wheelCenter'] },
      { id: 'CON-TIE-ROD-LENGTH', type: 'DISTANCE', status: 'BLOCKED', reason: 'INNER_TIE_ROD_MISSING' }
    ],
    blockers: [
      { id: 'INNER_TIE_ROD_INTERFACE_NULL', owner: 'C-05', detail: 'innerTieRodInterface 为 null，C-06 尚未验收。' },
      { id: 'TIE_ROD_LENGTH_NULL', owner: 'C-05', detail: 'tieRodLengthMm 为 null。' },
      { id: 'CHASSIS_PIVOTS_ABSENT', owner: 'R-45', detail: '没有已发布的车身摆臂枢轴，不能做行程。' },
      { id: 'R44_NOT_USED', owner: 'R-44', detail: 'R-44 仍是 ready，本夹具直接钉住 C-04 发布清单，不读取未完成的消费层。' }
    ],
    bodyHardpoints: null,
    r28AcceptedForClosure: false
  };
}

export function requestTravel(closure, travelM) {
  if (!closure.ok) return { playbackAllowed: false, status: 'BLOCKED', code: closure.code };
  if (travelM !== 0) {
    return { playbackAllowed: false, status: 'BLOCKED', code: 'TRAVEL_INPUT_INCOMPLETE', blockers: closure.blockers };
  }
  return { playbackAllowed: false, status: 'NOMINAL_ONLY', code: 'STATIC_CLOSURE_ONLY', distancesM: closure.distancesM };
}

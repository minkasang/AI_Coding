/**
 * 用 C-03 球心和 C-02 工装主轴做转向节静态配准。
 * 不修改 CAD 包、R-28 或工作台。运动播放保持关闭。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { rigidFromPointPairs } from '../wheel-end-frame-registration-v1/register.mjs';

const POSITION_LIMIT_M = 0.0001;
const ANGLE_LIMIT_RAD = 0.1 * Math.PI / 180;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => Math.hypot(v[0], v[1], v[2]);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function applyMap(point) {
  const [x, y, z] = point;
  return [z + 0.2, x + 0.1, y - 0.3];
}

function angleError(a, b) {
  const value = Math.min(1, Math.max(-1, dot(a, b) / (norm(a) * norm(b))));
  return Math.acos(value);
}

export function loadFixture() {
  const manifestPath = new URL('../../cad/experiments/wheel-end-ball-joint-demo-v1/out/c03-3f4bf8c599df28679b86/manifest.json', import.meta.url);
  const datumsPath = new URL('../../cad/experiments/wheel-end-datum-interface-v1/datums.json', import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const datums = JSON.parse(readFileSync(datumsPath, 'utf8'));
  const manifestHash = sha256(manifestPath);
  const datumsHash = sha256(datumsPath);
  if (datumsHash !== manifest.sources.c02.datumsSha256) {
    return { ok: false, code: 'SOURCE_HASH_MISMATCH', actual: datumsHash, expected: manifest.sources.c02.datumsSha256 };
  }
  const lower = manifest.studs.lower.ballCenter.workholdingYUpM;
  const upper = manifest.studs.upper.ballCenter.workholdingYUpM;
  const outboard = [1, 0, 0];
  const clock = add(lower, mul(outboard, 0.05));
  return {
    ok: true,
    fixtureId: 'DEMO-KNUCKLE-STATIC-R38-001',
    sourceGrade: 'DEMO_ASSUMPTION',
    playbackAllowed: false,
    packageId: manifest.packageId,
    manifestSha256: manifestHash,
    datumsSha256: datumsHash,
    c01ManifestSha256: manifest.sources.c01.manifestSha256,
    snapshotId: manifest.sources.snapshot.snapshotId,
    snapshotRevision: manifest.sources.snapshot.revision,
    snapshotSha256: manifest.sources.snapshot.snapshotSha256,
    frame: {
      frameId: 'FR-R38-KNUCKLE-FL',
      units: 'm',
      parent: 'FR-C01-WHEEL-END-FL',
      origin: 'LOWER_BALL_CENTER',
      clock: 'OUTBOARD_THROUGH_LOWER_BALL',
      vehicleFromWorkholding: null
    },
    pointsM: { lower, upper, clock, witness: [0, 0, 0], outboard },
    pointsMm: {
      lower: manifest.studs.lower.ballCenter.workholdingMm,
      upper: manifest.studs.upper.ballCenter.workholdingMm
    }
  };
}

export function registerPose(fixture, poseId, mapPoint, mapDirection) {
  const source = [fixture.pointsM.lower, fixture.pointsM.upper, fixture.pointsM.clock];
  const target = source.map(mapPoint);
  const sourceNormal = fixture.pointsM.outboard;
  const targetNormal = mapDirection(sourceNormal);
  const fit = rigidFromPointPairs(source, target, sourceNormal, targetNormal);
  if (!fit.ok) return { poseId, ...fit, playbackAllowed: false };
  const witness = mapPoint(fixture.pointsM.witness);
  const predicted = add(mat(fit.rotation, fixture.pointsM.witness), fit.translation);
  const witnessResidualM = norm(sub(predicted, witness));
  const axisErrorRad = angleError(mat(fit.rotation, sourceNormal), targetNormal);
  const ok = witnessResidualM <= POSITION_LIMIT_M && axisErrorRad <= ANGLE_LIMIT_RAD;
  const transform = {
    poseId,
    frameId: fixture.frame.frameId,
    sourceFrameId: fixture.frame.parent,
    units: 'm',
    convention: 'row-major matrix acting on column vectors',
    rotation: fit.rotation,
    translationMeters: fit.translation,
    sourceGrade: 'DEMO_ASSUMPTION',
    playbackAllowed: false
  };
  return {
    poseId,
    ok,
    code: ok ? 'DEMO_REGISTERED' : 'WITNESS_FAILED',
    residualM: fit.residualM,
    witnessResidualM,
    axisErrorRad,
    handedness: fit.handedness,
    playbackAllowed: false,
    transform: ok ? transform : null
  };
}

export function applyTransform(transform, point) {
  if (!transform?.rotation || !transform.translationMeters) return null;
  return add(mat(transform.rotation, point), transform.translationMeters);
}

export function resultForFingerprint(fixture, claimedManifestSha256) {
  if (claimedManifestSha256 !== fixture.manifestSha256) {
    return { ok: false, code: 'MANIFEST_FINGERPRINT_MISMATCH', transforms: [], playbackAllowed: false };
  }
  return { ok: true, transforms: fixture.transforms || [], playbackAllowed: false };
}

function mat(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
  ];
}

export function consume(fixture, revision) {
  if (revision !== fixture.snapshotRevision) {
    return { playbackAllowed: false, status: 'STALE', reason: '快照修订与 C-03 记录不一致' };
  }
  return {
    playbackAllowed: false,
    status: 'DEMO_REGISTERED_MOTION_BLOCKED',
    reason: '静态球心已配准，但轮心、车身硬点、关节闭合和外拉杆仍未闭合。'
  };
}

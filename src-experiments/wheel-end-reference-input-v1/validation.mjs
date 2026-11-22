/**
 * R-39 read-only validation of same-source wheel-end reference inputs:
 * R-27 snapshot, C-02 datum table, C-03 ball-stud package and the R-28
 * reference motion. It never registers a new pose and never accepts C-04
 * wheel-center data before that package is released.
 */
import { C04_STATUS, validateC04Package } from './c04.mjs';

export const VALIDATION_SCHEMA = 'carlab.wheelEndReferenceInput/0.1.0-proposal';
export const C02_SCHEMA = 'carlab.c02WheelEndDatums/1';
export const C03_SCHEMA = 'carlab.c03DemoBallStuds/1';
export const R28_SCHEMA = 'carlab.canonicalMotion/0.1-proposal';

export const APPROVED = Object.freeze({
  snapshotId: 'SNAP-R27-R16-R21-R22-R23-01',
  snapshotSha256: 'f60d977efc2f5aefb878610b6b5a0bedb7579146f41a6a65528470e8b6a507c4',
  variantId: 'VAR-R16-BOF-ICE',
  c01PackageId: 'c01-c5d74da77c293aa5321f',
  c01ManifestSha256: '80e7e060de6b20015a6fdb8d5b81ea60b9e23ac442cebbb96b2bc2a5b5222d6a',
  c01AssemblySha256: '14758e7126cca3d63167a7c900356c81da53ccc95d0b7fbe358e3a1c2f146eab',
  c01AssemblyStepSha256: 'e44ea54eded24673c1578e321eb8fe4438688c21913e1b41f9eedc34ef8cdf7d',
  c01GlbSha256: 'c11da5170450979ba0d1b444af18e32679cc3e9fce11a941bb1172f8427710c3',
  c02DatumsSha256: '071eb3019dceeec74a53dc446f99413fadeaffc0a796358f61bb515a86e5f146',
  c03PackageId: 'c03-3f4bf8c599df28679b86',
  c03ManifestSha256: 'bfe27ea9f2ae6a3283a463389950373c5338287f6200b1179a6ed46b7d337e91',
  c03UpperStepSha256: '4ef7a17304c035edbceb8bb76009fd389e2f483d8488b4d67bb84056ed9fb88b',
  c03LowerStepSha256: '23242a0fb1c9a93081f64bc5faeff815e8648ac2b2322b91491f5c54663918dd',
  referenceMotionSha256: '44a58318a89522db68b1dc9dfa3aad94e7876d8c5714e7e02b63d1d7117c265d',
  fixtureSha256: '9cdc6e8241a5f539f56dafb6ae1d6e68b0ec02ff8fb4e8bc3a05c0f5cf0b6ed1',
  c01PartStepSha256: Object.freeze({
    'parts/PART-20-016.step': '12dcbfd3722cb9f582a23fb8fff51d000dcc6ca923887a4e40ed0a86fbd80527',
    'parts/PART-30-001.step': '3196f723f22efd4d63e6db2d981ed028e29ab85b0715eb1f0c6ae1a6bf6ee396',
    'parts/PART-30-002.step': '66d1967afa9e20a7fd4b60f5b057fbf7a2c1d05dfa4ef2eb5997bcf7286668fe',
    'parts/PART-30-006.step': 'c78f2ecc8f1aae6bc46b287b327cb696578bca400877e1b183d888e4147481e0',
    'parts/PART-30-009.step': '61c95645fce54e6d6aa2cb25ee1786036aa4f12230323ca28f1bebb984f7e95b'
  })
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const isNum3 = (value) => Array.isArray(value) && value.length === 3 && value.every(isNum);
const isNum4 = (value) => Array.isArray(value) && value.length === 4 && value.every(isNum);
const isMat4 = (value) => Array.isArray(value) && value.length === 4 && value.every(isNum4);
const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
const close3 = (a, b, tolerance = 1e-9) => isNum3(a) && isNum3(b) && a.every((value, index) => close(value, b[index], tolerance));
const matTranslation = (matrix) => [matrix[0][3], matrix[1][3], matrix[2][3]];
const toYUpM = (workholdingMm) => [workholdingMm[0] * 0.001, workholdingMm[2] * 0.001, -workholdingMm[1] * 0.001];
const fromYUpM = (glbM) => [glbM[0] * 1000, -glbM[2] * 1000, glbM[1] * 1000];
const fromYUpDirection = (glbDirection) => [glbDirection[0], -glbDirection[2], glbDirection[1]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
const normalize3 = (v) => v.map((value) => value / norm3(v));
const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

export class WheelEndReferenceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WheelEndReferenceError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new WheelEndReferenceError(code, message, details);
}
function requireCondition(condition, code, message, details = {}) {
  if (!condition) fail(code, message, details);
}
function check(checks, id, condition, code, message, details = {}) {
  if (!condition) fail(code, message, details);
  checks.push({ id, pass: true });
}

function assertSnapshotBinding(sources, consumer, snapshotSha256, expectedSnapshotSha256) {
  requireCondition(snapshotSha256 === expectedSnapshotSha256, 'E_SNAPSHOT_MISMATCH', 'Snapshot SHA-256 does not match the approved R-27 snapshot.', { expected: expectedSnapshotSha256, actual: snapshotSha256 });
  const display = consumer.getDisplayStatus();
  for (const [name, source] of Object.entries(sources)) {
    requireCondition(source.snapshotId === consumer.snapshotId, 'E_SNAPSHOT_MISMATCH', `${name} snapshot id mismatch.`, { expected: consumer.snapshotId, actual: source.snapshotId });
    requireCondition(source.revision === consumer.revision, 'E_SNAPSHOT_MISMATCH', `${name} snapshot revision mismatch.`, { expected: consumer.revision, actual: source.revision });
    requireCondition(source.snapshotSha256 === snapshotSha256, 'E_SNAPSHOT_MISMATCH', `${name} snapshot SHA-256 mismatch.`, { expected: snapshotSha256, actual: source.snapshotSha256 });
    requireCondition(source.variantId === display.variant.variantId, 'E_VARIANT_MISMATCH', `${name} variant mismatch.`, { expected: display.variant.variantId, actual: source.variantId });
    requireCondition(source.selectionKey === 'partInstanceId', 'E_SNAPSHOT_MISMATCH', `${name} selectionKey must be partInstanceId.`);
    requireCondition(source.mappingStatus === 'DEMO_SUBSTITUTE' && source.sameVehicleClaim === false, 'E_SNAPSHOT_MISMATCH', `${name} must stay DEMO_SUBSTITUTE and not claim the same vehicle.`);
  }
  return display;
}

function validateC02(datums, checks) {
  requireCondition(datums?.schemaVersion === C02_SCHEMA, 'E_C02_SCHEMA', `C-02 schema must be ${C02_SCHEMA}.`);
  requireCondition(datums.sourceGrade === 'DEMO_ASSUMPTION', 'E_C02_SCHEMA', 'C-02 sourceGrade must be DEMO_ASSUMPTION.');
  requireCondition(Array.isArray(datums.datums) && datums.datums.length === 7, 'E_DATUM_SET_MISMATCH', 'C-02 must expose exactly 7 datums.', { actual: datums.datums?.length });
  const ids = new Set();
  const byId = new Map();
  for (const datum of datums.datums) {
    requireCondition(typeof datum.datumId === 'string' && datum.datumId.length > 0, 'E_DATUM_SET_MISMATCH', 'Datum id is missing.');
    requireCondition(!ids.has(datum.datumId), 'E_DATUM_SET_MISMATCH', `Duplicate datum ${datum.datumId}.`);
    ids.add(datum.datumId);
    byId.set(datum.datumId, datum);
    requireCondition(datum.partInstanceId?.startsWith('PI-') && datum.partInstanceId.endsWith('-FL'), 'E_CORNER_MISMATCH', `Datum ${datum.datumId} must use an FL PI-* instance.`);
    requireCondition(datum.datumId.startsWith(`${datum.partInstanceId}/`), 'E_DATUM_PART_MISMATCH', `Datum id ${datum.datumId} does not start with its part instance.`);
    requireCondition(datum.sourceGrade === 'DEMO_ASSUMPTION', 'E_C02_SCHEMA', `Datum ${datum.datumId} sourceGrade must be DEMO_ASSUMPTION.`);
    requireCondition(isMat4(datum.partFromMountCad) && isMat4(datum.rootFromMountCad), 'E_DATUM_MATRIX', `Datum ${datum.datumId} matrices must be row-major 4x4.`);
    requireCondition(isNum3(datum.glbOriginM) && isNum3(datum.glbPositiveZDirection), 'E_DATUM_UNIT', `Datum ${datum.datumId} glb vectors are invalid.`);
    requireCondition(close(norm3(datum.glbPositiveZDirection), 1, 1e-6), 'E_DATUM_UNIT', `Datum ${datum.datumId} glb direction is not unit length.`);
  }
  for (const required of ['PI-20-016-FL/bearingSeatFront', 'PI-20-016-FL/bearingSeatBack', 'PI-20-016-FL/upperBallJointSeat', 'PI-20-016-FL/lowerBallJointSeat', 'PI-30-001-FL/frontFace', 'PI-30-001-FL/backFace', 'PI-30-006-FL/wheelMatingFace']) {
    requireCondition(byId.has(required), 'E_DATUM_SET_MISMATCH', `Required datum ${required} is missing.`);
  }
  const frames = datums.frames;
  requireCondition(frames.workholding.frameId === 'FR-C01-WHEEL-END-FL', 'E_FRAME_MISMATCH', 'C-02 workholding frame id mismatch.');
  requireCondition(frames.workholding.unit === 'mm' && frames.workholding.handedness === 'RIGHT', 'E_UNIT_MISMATCH', 'C-02 workholding must be right-handed mm.');
  requireCondition(frames.display.unit === 'm' && frames.display.positionScale === 0.001, 'E_UNIT_MISMATCH', 'C-02 display must be m with explicit 0.001 scale.');
  requireCondition(frames.workholding.originDatumId === 'PI-20-016-FL/bearingSeatFront', 'E_FRAME_MISMATCH', 'C-02 workholding origin datum mismatch.');
  requireCondition(isMat4(frames.anchor.rootFromAnchorCad) && close3([frames.anchor.rootFromAnchorCad[0][2], frames.anchor.rootFromAnchorCad[1][2], frames.anchor.rootFromAnchorCad[2][2]], [1, 0, 0]), 'E_FRAME_MISMATCH', 'C-02 anchor +Z must map to root +X.');
  requireCondition(close3(frames.spindle.outboardDirection, [1, 0, 0]), 'E_FRAME_MISMATCH', 'C-02 spindle outboard direction must be +X.');
  const glbDirections = frames.display.glbFromCadDirections;
  requireCondition(isMat4([...glbDirections.map((row) => [...row, 0]), [0, 0, 0, 1]]), 'E_FRAME_MISMATCH', 'C-02 GLB direction matrix is invalid.');
  requireCondition(close(det3(glbDirections), 1, 1e-9), 'E_FRAME_MISMATCH', 'C-02 GLB direction matrix must have determinant +1.');
  const registration = datums.registration;
  requireCondition(registration.status === 'REGISTRATION_BLOCKED', 'E_REGISTRATION_NOT_BLOCKED', 'C-02 registration must remain REGISTRATION_BLOCKED.');
  requireCondition(registration.playbackAllowed === false && registration.vehicleFromWorkholding === null, 'E_REGISTRATION_NOT_BLOCKED', 'C-02 registration must not permit playback or vehicle placement.');
  const missingKeys = new Set((registration.missing || []).map((row) => row.key));
  for (const key of ['upperTaperToBallCenter', 'lowerTaperToBallCenter', 'bearingOutboardFaceToLowerBallCenter', 'wheelMountFaceToWheelCenter', 'knuckleOuterTieRodInterface', 'sharedPhysicalLandmarkCorrespondences']) {
    requireCondition(missingKeys.has(key), 'E_MISSING_EXPLICIT', `C-02 missing list must explicitly include ${key}.`);
  }
  const projection = registration.projectionCheck;
  requireCondition(close(projection.cadTaperEntranceDistanceMm, 210.6869715953, 1e-6), 'E_PROJECTION_MISMATCH', 'C-02 CAD taper distance changed.');
  requireCondition(close(projection.referenceBallCenterDistanceMm, 250.1999200639, 1e-6), 'E_PROJECTION_MISMATCH', 'C-02 reference ball distance changed.');
  requireCondition(projection.cadTaperEntranceProjectionMm === 0, 'E_PROJECTION_MISMATCH', 'C-02 CAD taper projection must be 0.');
  requireCondition(close(projection.referenceBallCenterProjectionMm, -79.3776009561, 1e-6), 'E_PROJECTION_MISMATCH', 'C-02 reference projection changed.');
  requireCondition(projection.coaxialTaperOffsetsCanBridgeDifference === false, 'E_PROJECTION_MISMATCH', 'C-02 must not claim coaxial offsets bridge the difference.');
  checks.push({ id: 'C02_DATUMS_AND_BLOCKED_REGISTRATION', pass: true, detail: { datums: byId.size, missing: missingKeys.size } });
  return { byId, frames, registration, projection };
}

function validateC03(c03, checks) {
  requireCondition(c03?.schemaVersion === C03_SCHEMA, 'E_C03_SCHEMA', `C-03 schema must be ${C03_SCHEMA}.`);
  requireCondition(c03.packageId === APPROVED.c03PackageId, 'E_C03_PACKAGE_ID', 'C-03 packageId does not match the approved package.', { expected: APPROVED.c03PackageId, actual: c03.packageId });
  requireCondition(c03.sourceGrade === 'DEMO_ASSUMPTION', 'E_C03_SCHEMA', 'C-03 sourceGrade must be DEMO_ASSUMPTION.');
  requireCondition(c03.motionInput?.playbackAllowed === false, 'E_NEW_DEMO_PLAYBACK_FORBIDDEN', 'C-03 motionInput must keep playbackAllowed=false.');
  requireCondition(c03.motionInput.existingR28Registration === 'REGISTRATION_BLOCKED', 'E_REGISTRATION_NOT_BLOCKED', 'C-03 must record the existing R-28 registration as blocked.');
  requireCondition(c03.motionInput.wheelMountFaceToWheelCenter == null, 'E_C04_NOT_RELEASED', 'C-03 must not contain a wheel-center value before C-04.');
  requireCondition(c03.motionInput.outerTieRodInterface == null, 'E_MISSING_EXPLICIT', 'C-03 outer tie-rod interface must remain null.');
  requireCondition(c03.motionInput.ballSpanProjectionOnSpindleMm === 0, 'E_PROJECTION_MISMATCH', 'C-03 ball span projection must remain 0 mm.');
  const studs = c03.studs;
  for (const side of ['upper', 'lower']) {
    const stud = studs[side];
    requireCondition(stud, 'E_C03_SCHEMA', `C-03 missing ${side} ball stud.`);
    requireCondition(stud.geometryRole === 'BALL_STUD_ONLY', 'E_CANDIDATE_AS_PRODUCTION', `${side} ball stud must stay BALL_STUD_ONLY.`);
    requireCondition(stud.partInstanceId === null, 'E_CANDIDATE_AS_PRODUCTION', `${side} ball stud must not claim a canonical partInstanceId.`, { actual: stud.partInstanceId });
    const candidate = stud.candidateAssembly;
    requireCondition(candidate?.status === 'CANDIDATE_PARTIAL_GEOMETRY', 'E_CANDIDATE_AS_PRODUCTION', `${side} candidate assembly must remain CANDIDATE_PARTIAL_GEOMETRY.`);
    requireCondition(candidate.snapshotGeometryStatus === 'NO_GEOMETRY', 'E_CANDIDATE_AS_PRODUCTION', `${side} candidate assembly snapshot geometry must remain NO_GEOMETRY.`);
    requireCondition(candidate.partInstanceId?.endsWith('-FL'), 'E_CORNER_MISMATCH', `${side} candidate assembly must be FL.`);
    requireCondition(isNum3(stud.ballCenter.localMm) && isNum3(stud.ballCenter.workholdingMm) && isNum3(stud.ballCenter.workholdingYUpM), 'E_BALL_CENTER_INVALID', `${side} ball center vectors are invalid.`);
    requireCondition(close3(stud.ballCenter.workholdingYUpM, toYUpM(stud.ballCenter.workholdingMm), 1e-9), 'E_UNIT_MISMATCH', `${side} workholdingYUpM does not match the mm conversion.`);
  }
  requireCondition(studs.upper.candidateAssembly.partInstanceId === 'PI-20-003-FL', 'E_ROLE_SWAP', 'Upper ball stud must reference PI-20-003-FL.');
  requireCondition(studs.lower.candidateAssembly.partInstanceId === 'PI-20-010-FL', 'E_ROLE_SWAP', 'Lower ball stud must reference PI-20-010-FL.');
  requireCondition(studs.upper.seat.c02DatumId === 'PI-20-016-FL/upperBallJointSeat', 'E_ROLE_SWAP', 'Upper ball stud seat datum mismatch.');
  requireCondition(studs.lower.seat.c02DatumId === 'PI-20-016-FL/lowerBallJointSeat', 'E_ROLE_SWAP', 'Lower ball stud seat datum mismatch.');
  requireCondition(studs.upper.ballCenter.workholdingYUpM[1] > studs.lower.ballCenter.workholdingYUpM[1], 'E_ROLE_SWAP', 'Upper ball center must be above the lower ball center in Y-up.');
  const upperOffset = studs.upper.ballCenter.localMm[2];
  const lowerOffset = studs.lower.ballCenter.localMm[2];
  requireCondition(close(upperOffset, c03.effectiveParameters.upper.ballCenterOffset, 1e-9), 'E_BALL_CENTER_OFFSET', 'Upper ball center offset does not match effective parameters.');
  requireCondition(close(lowerOffset, c03.effectiveParameters.lower.ballCenterOffset, 1e-9), 'E_BALL_CENTER_OFFSET', 'Lower ball center offset does not match effective parameters.');
  checks.push({ id: 'C03_CANDIDATE_STUDS', pass: true, detail: { upper: upperOffset, lower: lowerOffset } });
  return { studs };
}

function validateCrossSource({ consumer, datums, c03, c02, checks }) {
  const knuckle = 'PI-20-016-FL';
  let knuckleDetail;
  try {
    knuckleDetail = consumer.getObjectDetail(knuckle);
  } catch (error) {
    fail('E_KNUCKLE_MISSING', `Knuckle ${knuckle} is missing from the R-27 snapshot.`, { cause: error.code ?? null });
  }
  requireCondition(knuckleDetail.identity.partId === 'PART-20-016', 'E_DATUM_PART_MISMATCH', 'Knuckle part id mismatch.');
  requireCondition(knuckleDetail.geometry.status === 'NO_GEOMETRY', 'E_CANDIDATE_AS_PRODUCTION', 'Knuckle must remain NO_GEOMETRY in the snapshot.');
  for (const datum of datums.datums) {
    let detail;
    try {
      detail = consumer.getObjectDetail(datum.partInstanceId);
    } catch (error) {
      fail('E_DATUM_PART_MISMATCH', `Datum ${datum.datumId} references a missing snapshot instance.`, { cause: error.code ?? null });
    }
    requireCondition(detail.identity.partId === datum.partId, 'E_DATUM_PART_MISMATCH', `Datum ${datum.datumId} part id mismatch.`, { expected: detail.identity.partId, actual: datum.partId });
  }
  for (const side of ['upper', 'lower']) {
    const candidate = c03.studs[side].candidateAssembly;
    let detail;
    try {
      detail = consumer.getObjectDetail(candidate.partInstanceId);
    } catch (error) {
      fail('E_CANDIDATE_PI_MISMATCH', `${side} candidate assembly is missing from the snapshot.`, { cause: error.code ?? null });
    }
    requireCondition(detail.identity.partId === candidate.partId, 'E_CANDIDATE_PI_MISMATCH', `${side} candidate part id mismatch.`);
    requireCondition(detail.identity.assemblyInstanceId === candidate.assemblyInstanceId, 'E_CANDIDATE_PI_MISMATCH', `${side} candidate assembly instance mismatch.`);
    requireCondition(detail.identity.frameId === candidate.snapshotFrameId, 'E_CANDIDATE_PI_MISMATCH', `${side} candidate frame mismatch.`);
    requireCondition(detail.geometry.status === 'NO_GEOMETRY', 'E_CANDIDATE_AS_PRODUCTION', `${side} candidate must remain NO_GEOMETRY.`);
    const stud = c03.studs[side];
    const seatDatum = c02.byId.get(stud.seat.c02DatumId);
    requireCondition(seatDatum, 'E_DATUM_SET_MISMATCH', `${side} seat datum ${stud.seat.c02DatumId} is missing.`);
    requireCondition(seatDatum.partInstanceId === stud.seat.knucklePartInstanceId, 'E_DATUM_PART_MISMATCH', `${side} seat datum knuckle mismatch.`);
    requireCondition(isMat4(stud.seat.rootFromStudCad), 'E_DATUM_MATRIX', `${side} rootFromStudCad is not 4x4.`);
    const sameMatrix = stud.seat.rootFromStudCad.every((row, rowIndex) => row.every((value, columnIndex) => close(value, seatDatum.rootFromMountCad[rowIndex][columnIndex], 1e-9)));
    requireCondition(sameMatrix, 'E_DATUM_MATRIX', `${side} rootFromStudCad does not match the C-02 seat matrix.`);
    const seatWorkholdingMm = fromYUpM(seatDatum.glbOriginM);
    const seatAxisCad = fromYUpDirection(seatDatum.glbPositiveZDirection);
    const expectedBall = seatWorkholdingMm.map((value, index) => value + seatAxisCad[index] * stud.ballCenter.localMm[2]);
    requireCondition(close3(stud.ballCenter.workholdingMm, expectedBall, 1e-6), 'E_BALL_CENTER_OFFSET', `${side} ball center is not seat origin plus the expected offset.`, { expected: expectedBall, actual: stud.ballCenter.workholdingMm });
    requireCondition(close3(fromYUpM(stud.ballCenter.workholdingYUpM), stud.ballCenter.workholdingMm, 1e-6), 'E_UNIT_MISMATCH', `${side} ball center mm/m representations disagree.`);
  }
  const upperBall = c03.studs.upper.ballCenter.workholdingYUpM;
  const lowerBall = c03.studs.lower.ballCenter.workholdingYUpM;
  const span = [upperBall[0] - lowerBall[0], upperBall[1] - lowerBall[1], upperBall[2] - lowerBall[2]];
  const spanMm = norm3(span) * 1000;
  requireCondition(spanMm > 0 && spanMm < 1000, 'E_BALL_CENTER_INVALID', 'Ball center span is outside the demo wheel-end range.');
  checks.push({ id: 'C02_C03_SEAT_AND_BALL_CENTER', pass: true, detail: { spanMm: Number(spanMm.toFixed(3)), upper: upperBall, lower: lowerBall } });
  return { knuckleDetail, spanMm };
}

function validateReferenceMotion({ referenceMotion, referenceMotionSha256, fixtureSha256, datums, c03, poseInput, checks }) {
  requireCondition(referenceMotion?.schema === R28_SCHEMA, 'E_REFERENCE_MOTION_SCHEMA', `Reference motion schema must be ${R28_SCHEMA}.`);
  requireCondition(referenceMotion.snapshotId === APPROVED.snapshotId && referenceMotion.sourceRevision === 1 && referenceMotion.variantId === APPROVED.variantId, 'E_REFERENCE_RUN_MISMATCH', 'Reference motion snapshot/revision/variant mismatch.');
  const run = referenceMotion.simulationRun;
  requireCondition(run?.runId === 'RUN-SLA-FL-SNAP1-001', 'E_REFERENCE_RUN_MISMATCH', 'Unexpected reference run id.', { actual: run?.runId });
  requireCondition(run.sourceRevision === 1 && run.inputRevision === 1, 'E_REFERENCE_RUN_MISMATCH', 'Reference run revision mismatch.');
  requireCondition(run.resultHash === 'ea07924e32613ccb4500ac737d4f6c08a6f531bba0afa0e6219f45bd4784ddc3', 'E_REFERENCE_RUN_MISMATCH', 'Reference result hash mismatch.');
  requireCondition(run.frameId === 'FR-VEHICLE', 'E_FRAME_MISMATCH', 'Reference run frame must be FR-VEHICLE.');
  requireCondition(referenceMotion.playbackAllowed === true && referenceMotion.status === 'CURRENT', 'E_REFERENCE_RUN_MISMATCH', 'Reference motion source status is not the expected CURRENT/playbackAllowed fixture.');
  for (const [label, source] of [['C-02', datums.sources.referenceMotion], ['C-03', c03.sources.referenceMotion]]) {
    requireCondition(source.sha256 === referenceMotionSha256, 'E_REFERENCE_MOTION_HASH_MISMATCH', `${label} reference motion hash mismatch.`);
    requireCondition(source.fixtureSha256 === fixtureSha256, 'E_REFERENCE_FIXTURE_HASH_MISMATCH', `${label} fixture hash mismatch.`);
    requireCondition(source.runId === run.runId && source.resultHash === run.resultHash, 'E_REFERENCE_RUN_MISMATCH', `${label} reference run id/hash mismatch.`);
    requireCondition(source.frameId === run.frameId && source.sourceRevision === run.sourceRevision, 'E_REFERENCE_RUN_MISMATCH', `${label} reference frame/revision mismatch.`);
    requireCondition(source.knuckleOriginFeature === 'LOWER_BALL_CENTER' && source.unit === 'm', 'E_REFERENCE_RUN_MISMATCH', `${label} reference knuckle origin/unit mismatch.`);
  }
  if (poseInput != null) {
    fail('E_R28_POSE_NOT_ACCEPTED', 'The old R-28 pose must not be accepted as the new same-source registration.', { poseInput });
  }
  checks.push({ id: 'R28_REFERENCE_ONLY', pass: true, detail: { runId: run.runId, sourcePlaybackAllowed: referenceMotion.playbackAllowed, acceptedForNewDemo: false } });
  return {
    runId: run.runId,
    sourceStatus: referenceMotion.status,
    sourcePlaybackAllowed: referenceMotion.playbackAllowed,
    acceptedForNewDemo: false,
    reason: 'OLD_R28_FRAME_NOT_REGISTERED_TO_C02_C03',
    resultHash: run.resultHash,
    frameId: run.frameId,
    sourceRevision: run.sourceRevision
  };
}

export function validateWheelEndReferenceInputs({
  consumer,
  snapshotSha256,
  datums,
  datumsSha256,
  c03Manifest,
  c03ManifestSha256,
  c03StepHashes,
  referenceMotion,
  referenceMotionSha256,
  fixture,
  fixtureSha256,
  c01Hashes,
  c04 = { outExists: false },
  c04Package = null,
  poseInput = null,
  expected = {},
  snapshotSource = null,
  workingTree = null
}) {
  requireCondition(consumer && typeof consumer.getDisplayStatus === 'function', 'E_CONSUMER_REQUIRED', 'An R-31 vehicle consumer is required.');
  const checks = [];
  const snapshotDrift = workingTree?.detected === true;
  const expectedSnapshot = expected.snapshotSha256 ?? APPROVED.snapshotSha256;
  const expectedDatums = expected.c02DatumsSha256 ?? APPROVED.c02DatumsSha256;
  const expectedC03 = expected.c03ManifestSha256 ?? APPROVED.c03ManifestSha256;
  const expectedMotion = expected.referenceMotionSha256 ?? APPROVED.referenceMotionSha256;
  const expectedFixture = expected.fixtureSha256 ?? APPROVED.fixtureSha256;
  requireCondition(datumsSha256 === expectedDatums, 'E_DATUMS_HASH_MISMATCH', 'C-02 datums SHA-256 does not match the approved table.', { expected: expectedDatums, actual: datumsSha256 });
  requireCondition(c03ManifestSha256 === expectedC03, 'E_C03_MANIFEST_HASH_MISMATCH', 'C-03 manifest SHA-256 does not match the approved package.', { expected: expectedC03, actual: c03ManifestSha256 });
  const display = assertSnapshotBinding({
    c02: datums.sources.snapshot,
    c03: c03Manifest.sources.snapshot,
    r28: { snapshotId: referenceMotion.snapshotId, revision: referenceMotion.sourceRevision, snapshotSha256, variantId: referenceMotion.variantId, selectionKey: 'partInstanceId', mappingStatus: 'DEMO_SUBSTITUTE', sameVehicleClaim: false }
  }, consumer, snapshotSha256, expectedSnapshot);
  const c02 = validateC02(datums, checks);
  const c03 = validateC03(c03Manifest, checks);

  requireCondition(datums.sources.c02 === undefined, 'E_C02_SCHEMA', 'C-02 should not self-reference C-02.');
  requireCondition(c03Manifest.sources.c02.datumsSha256 === datumsSha256, 'E_DATUMS_HASH_MISMATCH', 'C-03 does not reference the actual C-02 datums hash.');
  requireCondition(c03Manifest.sources.c01.packageId === datums.sources.c01.packageId, 'E_C01_SOURCE_MISMATCH', 'C-02/C-03 C-01 package ids differ.');
  requireCondition(c03Manifest.sources.c01.manifestSha256 === datums.sources.c01.manifestSha256, 'E_C01_SOURCE_MISMATCH', 'C-02/C-03 C-01 manifest hashes differ.');
  requireCondition(c03Manifest.sources.c01.assemblyStepSha256 === datums.sources.c01.assetsSha256['wheel-end.step'], 'E_C01_SOURCE_MISMATCH', 'C-02/C-03 C-01 assembly STEP hashes differ.');
  requireCondition(datums.sources.c01.packageId === APPROVED.c01PackageId, 'E_C01_SOURCE_MISMATCH', 'C-02 C-01 package id mismatch.');
  requireCondition(datums.sources.c01.manifestSha256 === APPROVED.c01ManifestSha256, 'E_C01_HASH_MISMATCH', 'C-02 C-01 manifest hash mismatch.');
  requireCondition(datums.sources.c01.assemblyDefinitionSha256 === APPROVED.c01AssemblySha256, 'E_C01_HASH_MISMATCH', 'C-02 C-01 assembly definition hash mismatch.');
  requireCondition(datums.sources.c01.assetsSha256['wheel-end.step'] === APPROVED.c01AssemblyStepSha256, 'E_C01_HASH_MISMATCH', 'C-02 C-01 assembly STEP hash mismatch.');
  requireCondition(datums.sources.c01.assetsSha256['wheel-end.glb'] === APPROVED.c01GlbSha256, 'E_C01_HASH_MISMATCH', 'C-02 C-01 GLB hash mismatch.');
  if (c01Hashes) {
    requireCondition(c01Hashes['manifest.json'] === APPROVED.c01ManifestSha256, 'E_C01_HASH_MISMATCH', 'Actual C-01 manifest hash mismatch.');
    requireCondition(c01Hashes['assembly.json'] === APPROVED.c01AssemblySha256, 'E_C01_HASH_MISMATCH', 'Actual C-01 assembly hash mismatch.');
    requireCondition(c01Hashes['wheel-end.step'] === APPROVED.c01AssemblyStepSha256, 'E_C01_HASH_MISMATCH', 'Actual C-01 assembly STEP hash mismatch.');
    requireCondition(c01Hashes['wheel-end.glb'] === APPROVED.c01GlbSha256, 'E_C01_HASH_MISMATCH', 'Actual C-01 GLB hash mismatch.');
    for (const [file, expectedHash] of Object.entries(APPROVED.c01PartStepSha256)) {
      requireCondition(c01Hashes[file] === expectedHash, 'E_C01_HASH_MISMATCH', `Actual C-01 ${file} hash mismatch.`);
    }
  }
  if (c03StepHashes) {
    requireCondition(c03StepHashes['upper-ball-stud.step'] === APPROVED.c03UpperStepSha256, 'E_C03_STEP_HASH_MISMATCH', 'C-03 upper STEP hash mismatch.');
    requireCondition(c03StepHashes['lower-ball-stud.step'] === APPROVED.c03LowerStepSha256, 'E_C03_STEP_HASH_MISMATCH', 'C-03 lower STEP hash mismatch.');
  }

  const cross = validateCrossSource({ consumer, datums, c03: c03.studs ? c03Manifest : c03, c02, checks });
  const reference = validateReferenceMotion({ referenceMotion, referenceMotionSha256, fixtureSha256, datums, c03: c03Manifest, poseInput, checks });

  let c04Accepted = null;
  if (c04Package) {
    c04Accepted = validateC04Package({
      manifest: c04Package.manifest,
      manifestSha256: c04Package.manifestSha256,
      stepSha256: c04Package.stepSha256,
      packageDir: c04Package.packageDir ?? null,
      snapshotArchiveHash: c04Package.snapshotArchiveHash,
      snapshotSha256,
      datumsSha256,
      c03Manifest,
      c03ManifestSha256,
      c03StepHashes,
      referenceMotion,
      referenceMotionSha256,
      fixtureSha256,
      c01Hashes,
      expected: expected.c04 ?? {}
    });
    checks.push({ id: 'C04_ACCEPTED', pass: true, detail: { packageId: c04Accepted.packageId, wheelCenter: c04Accepted.wheelCenter.workholdingYUpM, signedOffsetM: c04Accepted.signedOffset.m } });
  }
  if (c04?.value != null || c04?.wheelCenter != null) {
    fail('E_C04_NOT_RELEASED', 'C-04 wheel-center data must not be accepted before the package is released.', { c04 });
  }
  const wheelCenter = c04Accepted ? {
    status: C04_STATUS,
    available: true,
    accepted: true,
    packageId: c04Accepted.packageId,
    manifestSha256: c04Accepted.manifestSha256,
    stepSha256: c04Accepted.stepSha256,
    frameId: c04Accepted.frameId,
    value: clone(c04Accepted.wheelCenter),
    spindle: clone(c04Accepted.spindle),
    signedOffset: clone(c04Accepted.signedOffset),
    hubMountingFace: clone(c04Accepted.hubMountingFace),
    asset: clone(c04Accepted.asset),
    sourceGrade: 'DEMO_ASSUMPTION',
    playbackAllowed: false,
    reason: 'WHEEL_CENTER_REFERENCE_ONLY_NO_VEHICLE_PLACEMENT',
    candidatePackages: (c04?.packages ?? []).map((row) => ({
      packageDir: row.packageDir,
      manifestSha256: row.manifestSha256,
      accepted: row.packageDir?.endsWith(c04Accepted.packageId) ?? false
    }))
  } : {
    status: c04?.outExists ? 'C04_OUTPUT_PRESENT_PENDING_REVIEW' : 'PENDING_C04',
    available: false,
    accepted: false,
    value: null,
    reason: 'C04_NOT_RELEASED_FOR_R39',
    candidatePackages: (c04?.packages ?? []).map((row) => ({
      packageDir: row.packageDir,
      manifestSha256: row.manifestSha256,
      accepted: false
    }))
  };
  const unknowns = [
    ...(c04Accepted ? [] : [{ key: 'wheelMountFaceToWheelCenter', status: 'PENDING_C04', value: null }]),
    { key: 'knuckleOuterTieRodInterface', status: 'UNKNOWN', value: null },
    { key: 'sharedPhysicalLandmarkCorrespondences', status: 'UNKNOWN', value: null },
    { key: 'clockingWitness', status: 'NOT_SUPPLIED', value: null },
    { key: 'productionBallJointEntity', status: 'CANDIDATE_PARTIAL_GEOMETRY', value: null },
    { key: 'R28PoseAsNewRegistration', status: 'REJECTED_REFERENCE_ONLY', value: null }
  ];
  const upper = c03Manifest.studs.upper;
  const lower = c03Manifest.studs.lower;
  const r38Input = {
    status: snapshotDrift ? 'READY_WITH_PINNED_SNAPSHOT_WORKING_TREE_BLOCKED' : 'READY_FOR_STATIC_REGISTRATION_INPUTS',
    sourceGrade: 'DEMO_ASSUMPTION',
    snapshot: {
      snapshotId: consumer.snapshotId,
      revision: consumer.revision,
      snapshotSha256,
      variantId: display.variant.variantId,
      source: snapshotSource?.kind ?? 'CONSUMER',
      workingTreeBlocked: snapshotDrift
    },
    workholding: clone(datums.frames.workholding),
    display: clone(datums.frames.display),
    spindle: clone(datums.frames.spindle),
    datums: datums.datums.map((datum) => ({
      datumId: datum.datumId,
      partInstanceId: datum.partInstanceId,
      partId: datum.partId,
      mountName: datum.mountName,
      feature: datum.feature,
      glbOriginM: [...datum.glbOriginM],
      glbPositiveZDirection: [...datum.glbPositiveZDirection],
      rootFromMountCad: clone(datum.rootFromMountCad),
      partFromMountCad: clone(datum.partFromMountCad),
      sourceGrade: datum.sourceGrade
    })),
    knuckle: {
      partInstanceId: 'PI-20-016-FL',
      partId: 'PART-20-016',
      frameId: 'FR-20-004-FL',
      datumIds: datums.datums.filter((datum) => datum.partInstanceId === 'PI-20-016-FL').map((datum) => datum.datumId)
    },
    ballCenters: {
      upper: {
        artifactId: upper.artifactId,
        sourceGrade: 'DEMO_ASSUMPTION',
        candidateOnly: true,
        productionEntity: false,
        seatDatumId: upper.seat.c02DatumId,
        ballCenterLocalMm: [...upper.ballCenter.localMm],
        workholdingMm: [...upper.ballCenter.workholdingMm],
        workholdingYUpM: [...upper.ballCenter.workholdingYUpM],
        offsetMm: upper.ballCenter.localMm[2],
        candidateAssembly: clone(upper.candidateAssembly)
      },
      lower: {
        artifactId: lower.artifactId,
        sourceGrade: 'DEMO_ASSUMPTION',
        candidateOnly: true,
        productionEntity: false,
        seatDatumId: lower.seat.c02DatumId,
        ballCenterLocalMm: [...lower.ballCenter.localMm],
        workholdingMm: [...lower.ballCenter.workholdingMm],
        workholdingYUpM: [...lower.ballCenter.workholdingYUpM],
        offsetMm: lower.ballCenter.localMm[2],
        candidateAssembly: clone(lower.candidateAssembly)
      }
    },
    witnessFeatures: [
      { datumId: 'PI-20-016-FL/bearingSeatFront', glbOriginM: clone(c02.byId.get('PI-20-016-FL/bearingSeatFront').glbOriginM), role: 'WORKHOLDING_ORIGIN_AND_SPINDLE' },
      { datumId: 'PI-20-016-FL/upperBallJointSeat', glbOriginM: clone(c02.byId.get('PI-20-016-FL/upperBallJointSeat').glbOriginM), role: 'UPPER_SEAT' },
      { datumId: 'PI-20-016-FL/lowerBallJointSeat', glbOriginM: clone(c02.byId.get('PI-20-016-FL/lowerBallJointSeat').glbOriginM), role: 'LOWER_SEAT' }
    ],
    ballCenterSpanMm: Number(cross.spanMm.toFixed(3)),
    referenceMotion: reference,
    registration: {
      status: c02.registration.status,
      playbackAllowed: false,
      vehicleFromWorkholding: null,
      missing: clone(c02.registration.missing),
      projectionCheck: clone(c02.projection)
    },
    wheelCenter,
    c04: c04Accepted ? {
      packageId: c04Accepted.packageId,
      manifestSha256: c04Accepted.manifestSha256,
      stepSha256: c04Accepted.stepSha256,
      status: c04Accepted.status
    } : null,
    allowedUse: ['STATIC_REGISTRATION_INPUTS', 'WITNESS_POINT_CHECKS', ...(c04Accepted ? ['WHEEL_CENTER_REFERENCE'] : [])],
    forbiddenUse: [
      'PLAY_R28_MOTION',
      ...(c04Accepted ? ['USE_C04_WHEEL_CENTER_AS_VEHICLE_PLACEMENT'] : ['USE_C04_WHEEL_CENTER']),
      'TREAT_C03_SAMPLE_AS_PRODUCTION_PART',
      'MERGE_WITH_OLD_R28_POSE'
    ],
    playbackAllowed: false
  };
  checks.push({ id: 'R38_INPUT_PACKAGE', pass: true, detail: { datums: r38Input.datums.length, witnessFeatures: r38Input.witnessFeatures.length, ballCenters: 2 } });
  checks.push({ id: c04Accepted ? 'C04_ACCEPTED_REFERENCE' : 'C04_PENDING_REVIEW', pass: true, detail: { status: wheelCenter.status, candidatePackages: wheelCenter.candidatePackages.length } });
  if (snapshotDrift) checks.push({ id: 'R27_WORKING_TREE_DRIFT_BLOCKED', pass: true, detail: clone(workingTree) });
  return {
    schemaVersion: VALIDATION_SCHEMA,
    status: snapshotDrift ? 'ACCEPTED_STATIC_INPUTS_PINNED_BYTES_WORKING_TREE_BLOCKED' : 'ACCEPTED_STATIC_INPUTS_MOTION_BLOCKED',
    playbackAllowed: false,
    sourceGrade: 'DEMO_ASSUMPTION',
    snapshot: {
      snapshotId: consumer.snapshotId,
      revision: consumer.revision,
      snapshotSha256,
      variantId: display.variant.variantId,
      source: snapshotSource?.kind ?? 'CONSUMER'
    },
    snapshotSource,
    workingTree,
    blockers: snapshotDrift ? ['R27_WORKING_TREE_SNAPSHOT_DRIFT'] : [],
    fingerprints: {
      snapshotSha256,
      workingTreeSnapshotSha256: workingTree?.sha256 ?? snapshotSha256,
      c02DatumsSha256: datumsSha256,
      c03ManifestSha256,
      c03PackageId: c03Manifest.packageId,
      referenceMotionSha256,
      fixtureSha256,
      c01ManifestSha256: datums.sources.c01.manifestSha256,
      c01GlbSha256: datums.sources.c01.assetsSha256['wheel-end.glb'],
      ...(c04Accepted ? {
        c04PackageId: c04Accepted.packageId,
        c04ManifestSha256: c04Accepted.manifestSha256,
        c04StepSha256: c04Accepted.stepSha256
      } : {})
    },
    c02: { datums: c02.byId.size, frames: c02.frames, registration: c02.registration },
    c03: { packageId: c03Manifest.packageId, upper: upper.artifactId, lower: lower.artifactId },
    referenceMotion: reference,
    wheelCenter,
    unknowns,
    warnings: [
      'R28_REFERENCE_ONLY_NOT_A_NEW_REGISTRATION',
      'C03_BALL_STUDS_ARE_CANDIDATE_PARTIAL_GEOMETRY',
      ...(c04Accepted ? ['C04_WHEEL_CENTER_ACCEPTED_DEMO_REFERENCE'] : ['WHEEL_CENTER_PENDING_C04']),
      'PLAYBACK_REMAINS_DISABLED',
      ...(!c04Accepted && wheelCenter.status === 'C04_OUTPUT_PRESENT_PENDING_REVIEW' ? ['C04_OUTPUT_PRESENT_NOT_ACCEPTED'] : []),
      ...(snapshotDrift ? ['R27_WORKING_TREE_SNAPSHOT_DRIFT'] : [])
    ],
    checks,
    r38Input
  };
}

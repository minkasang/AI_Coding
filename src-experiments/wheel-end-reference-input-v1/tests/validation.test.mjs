import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPROVED, validateWheelEndReferenceInputs } from '../validation.mjs';
import { loadRawWheelEndReferenceInputs, validateWheelEndReferenceInputsFromDisk } from '../node-loader.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const raw = loadRawWheelEndReferenceInputs(root);
const positive = validateWheelEndReferenceInputsFromDisk(root);
const clone = (value) => JSON.parse(JSON.stringify(value));
const baseArgs = {
  consumer: raw.consumer,
  snapshotSha256: raw.snapshotSha256,
  datums: raw.datums,
  datumsSha256: raw.datumsSha256,
  c03Manifest: raw.c03Manifest,
  c03ManifestSha256: raw.c03ManifestSha256,
  c03StepHashes: raw.c03StepHashes,
  referenceMotion: raw.referenceMotion,
  referenceMotionSha256: raw.referenceMotionSha256,
  fixture: raw.fixture,
  fixtureSha256: raw.fixtureSha256,
  c01Hashes: raw.c01Hashes,
  c04: raw.c04,
  poseInput: null,
  expected: {},
  snapshotSource: raw.snapshotSource,
  workingTree: raw.workingTree
};

function build(overrides = {}) {
  return validateWheelEndReferenceInputs({ ...baseArgs, ...overrides });
}
function expectCode(fn, code) {
  assert.throws(fn, (error) => error.code === code, `expected ${code}`);
}

test('control: the approved C-02/C-03 inputs validate against the pinned R-27 snapshot', () => {
  assert.equal(positive.snapshot.snapshotSha256, APPROVED.snapshotSha256);
  assert.equal(positive.snapshot.snapshotId, APPROVED.snapshotId);
  assert.equal(positive.snapshot.revision, 1);
  assert.equal(positive.snapshot.variantId, APPROVED.variantId);
  assert.equal(positive.playbackAllowed, false);
  assert.ok(['ACCEPTED_STATIC_INPUTS_MOTION_BLOCKED', 'ACCEPTED_STATIC_INPUTS_PINNED_BYTES_WORKING_TREE_BLOCKED'].includes(positive.status));
  assert.ok(positive.checks.length >= 5);
});

test('all approved input fingerprints match', () => {
  assert.equal(positive.fingerprints.c02DatumsSha256, APPROVED.c02DatumsSha256);
  assert.equal(positive.fingerprints.c03ManifestSha256, APPROVED.c03ManifestSha256);
  assert.equal(positive.fingerprints.c03PackageId, APPROVED.c03PackageId);
  assert.equal(positive.fingerprints.referenceMotionSha256, APPROVED.referenceMotionSha256);
  assert.equal(positive.fingerprints.fixtureSha256, APPROVED.fixtureSha256);
  assert.equal(positive.fingerprints.c01ManifestSha256, APPROVED.c01ManifestSha256);
  assert.equal(positive.fingerprints.c01GlbSha256, APPROVED.c01GlbSha256);
});

test('seven datums, four knuckle datums and three witness features are exposed to R-38', () => {
  assert.equal(positive.r38Input.datums.length, 7);
  assert.equal(positive.r38Input.knuckle.partInstanceId, 'PI-20-016-FL');
  assert.equal(positive.r38Input.knuckle.partId, 'PART-20-016');
  assert.equal(positive.r38Input.knuckle.datumIds.length, 4);
  assert.equal(positive.r38Input.witnessFeatures.length, 3);
  assert.deepEqual(positive.r38Input.witnessFeatures.map((row) => row.datumId), [
    'PI-20-016-FL/bearingSeatFront',
    'PI-20-016-FL/upperBallJointSeat',
    'PI-20-016-FL/lowerBallJointSeat'
  ]);
});

test('ball centers preserve the 24 mm / 27 mm offsets and the 261.553 mm span', () => {
  const upper = positive.r38Input.ballCenters.upper;
  const lower = positive.r38Input.ballCenters.lower;
  assert.equal(upper.offsetMm, 24);
  assert.equal(lower.offsetMm, 27);
  assert.deepEqual(upper.workholdingYUpM, [-0.021, 0.134, -0.009]);
  assert.deepEqual(lower.workholdingYUpM, [-0.021, -0.127, 0.008]);
  assert.equal(positive.r38Input.ballCenterSpanMm, 261.553);
  assert.ok(upper.workholdingYUpM[1] > lower.workholdingYUpM[1]);
});

test('ball studs stay candidate partial geometry and never become production parts', () => {
  for (const side of ['upper', 'lower']) {
    const center = positive.r38Input.ballCenters[side];
    assert.equal(center.candidateOnly, true);
    assert.equal(center.productionEntity, false);
    assert.equal(center.candidateAssembly.status, 'CANDIDATE_PARTIAL_GEOMETRY');
    assert.equal(center.candidateAssembly.snapshotGeometryStatus, 'NO_GEOMETRY');
    assert.equal(center.sourceGrade, 'DEMO_ASSUMPTION');
  }
  assert.equal(positive.r38Input.ballCenters.upper.candidateAssembly.partInstanceId, 'PI-20-003-FL');
  assert.equal(positive.r38Input.ballCenters.lower.candidateAssembly.partInstanceId, 'PI-20-010-FL');
});

test('registration remains blocked and the missing inputs stay explicit', () => {
  assert.equal(positive.c02.registration.status, 'REGISTRATION_BLOCKED');
  assert.equal(positive.c02.registration.playbackAllowed, false);
  assert.equal(positive.c02.registration.vehicleFromWorkholding, null);
  assert.equal(positive.c02.registration.missing.length, 6);
  const keys = positive.c02.registration.missing.map((row) => row.key);
  assert.ok(keys.includes('wheelMountFaceToWheelCenter'));
  assert.ok(keys.includes('knuckleOuterTieRodInterface'));
  assert.ok(keys.includes('sharedPhysicalLandmarkCorrespondences'));
  assert.equal(positive.r38Input.registration.playbackAllowed, false);
});

test('the old R-28 motion is reference-only, even though its own source says CURRENT', () => {
  assert.equal(positive.referenceMotion.sourceStatus, 'CURRENT');
  assert.equal(positive.referenceMotion.sourcePlaybackAllowed, true);
  assert.equal(positive.referenceMotion.acceptedForNewDemo, false);
  assert.equal(positive.referenceMotion.reason, 'OLD_R28_FRAME_NOT_REGISTERED_TO_C02_C03');
  assert.equal(positive.referenceMotion.runId, 'RUN-SLA-FL-SNAP1-001');
  assert.equal(positive.referenceMotion.frameId, 'FR-VEHICLE');
  assert.equal(positive.r38Input.playbackAllowed, false);
});

test('C-04 output is listed but never accepted or value-read', () => {
  const wheel = positive.wheelCenter;
  assert.equal(wheel.available, false);
  assert.equal(wheel.accepted, false);
  assert.equal(wheel.value, null);
  assert.ok(['PENDING_C04', 'C04_OUTPUT_PRESENT_PENDING_REVIEW'].includes(wheel.status));
  for (const pkg of wheel.candidatePackages) assert.equal(pkg.accepted, false);
  assert.equal(positive.r38Input.wheelCenter.value, null);
});

test('a clean snapshot is accepted; a working-tree drift is reported as a blocker', () => {
  const clean = build({
    workingTree: { detected: false, sha256: APPROVED.snapshotSha256, approvedSha256: APPROVED.snapshotSha256 },
    snapshotSource: { kind: 'WORKING_TREE', sha256: APPROVED.snapshotSha256 }
  });
  assert.equal(clean.status, 'ACCEPTED_STATIC_INPUTS_MOTION_BLOCKED');
  assert.deepEqual(clean.blockers, []);
  const drift = build({
    workingTree: { detected: true, sha256: 'b8a1ac28b1ca1094051c1f3f1335765d0e68b05dd7ad2bb5ff0218e0082ac1e5', approvedSha256: APPROVED.snapshotSha256 },
    snapshotSource: { kind: 'GIT_HISTORY', sha256: APPROVED.snapshotSha256 }
  });
  assert.equal(drift.status, 'ACCEPTED_STATIC_INPUTS_PINNED_BYTES_WORKING_TREE_BLOCKED');
  assert.ok(drift.blockers.includes('R27_WORKING_TREE_SNAPSHOT_DRIFT'));
  assert.equal(drift.r38Input.snapshot.workingTreeBlocked, true);
});

test('wrong datums, C-03 manifest or reference-motion hash fails closed', () => {
  expectCode(() => build({ datumsSha256: '0'.repeat(64) }), 'E_DATUMS_HASH_MISMATCH');
  expectCode(() => build({ c03ManifestSha256: '0'.repeat(64) }), 'E_C03_MANIFEST_HASH_MISMATCH');
  expectCode(() => build({ referenceMotionSha256: '0'.repeat(64) }), 'E_REFERENCE_MOTION_HASH_MISMATCH');
});

test('wrong snapshot hash, revision or variant fails closed', () => {
  expectCode(() => build({ snapshotSha256: '0'.repeat(64) }), 'E_SNAPSHOT_MISMATCH');
  const revision = clone(raw.datums);
  revision.sources.snapshot.revision = 2;
  expectCode(() => build({ datums: revision }), 'E_SNAPSHOT_MISMATCH');
  const variant = clone(raw.datums);
  variant.sources.snapshot.variantId = 'VAR-WRONG';
  expectCode(() => build({ datums: variant }), 'E_VARIANT_MISMATCH');
});

test('swapped upper/lower roles or ball centers fail closed', () => {
  const candidateSwap = clone(raw.c03Manifest);
  candidateSwap.studs.upper.candidateAssembly = clone(candidateSwap.studs.lower.candidateAssembly);
  expectCode(() => build({ c03Manifest: candidateSwap }), 'E_ROLE_SWAP');
  const centerSwap = clone(raw.c03Manifest);
  centerSwap.studs.upper.ballCenter = clone(raw.c03Manifest.studs.lower.ballCenter);
  centerSwap.studs.lower.ballCenter = clone(raw.c03Manifest.studs.upper.ballCenter);
  expectCode(() => build({ c03Manifest: centerSwap }), 'E_ROLE_SWAP');
});

test('mixed units and wrong ball-center offsets fail closed', () => {
  const unitMix = clone(raw.c03Manifest);
  unitMix.studs.upper.ballCenter.workholdingYUpM = [...unitMix.studs.upper.ballCenter.workholdingMm];
  expectCode(() => build({ c03Manifest: unitMix }), 'E_UNIT_MISMATCH');
  const offset = clone(raw.c03Manifest);
  offset.studs.upper.ballCenter.localMm = [0, 0, 27];
  expectCode(() => build({ c03Manifest: offset }), 'E_BALL_CENTER_OFFSET');
});

test('treating a candidate as production fails closed', () => {
  const production = clone(raw.c03Manifest);
  production.studs.upper.partInstanceId = 'PI-20-003-FL';
  expectCode(() => build({ c03Manifest: production }), 'E_CANDIDATE_AS_PRODUCTION');
  const status = clone(raw.c03Manifest);
  status.studs.lower.candidateAssembly.status = 'EXACT_GEOMETRY';
  expectCode(() => build({ c03Manifest: status }), 'E_CANDIDATE_AS_PRODUCTION');
});

test('old R-28 pose input and C-04 wheel-center values are rejected', () => {
  expectCode(() => build({ poseInput: { sourceRunId: 'RUN-SLA-FL-SNAP1-001', frameId: 'FR-VEHICLE' } }), 'E_R28_POSE_NOT_ACCEPTED');
  expectCode(() => build({ c04: { outExists: true, packages: raw.c04.packages, value: [0, 0, 0] } }), 'E_C04_NOT_RELEASED');
});

test('missing datum, wrong part, wrong corner and wrong candidate identity fail closed', () => {
  const missing = clone(raw.datums);
  missing.datums = missing.datums.slice(0, 6);
  expectCode(() => build({ datums: missing }), 'E_DATUM_SET_MISMATCH');
  const wrongPart = clone(raw.datums);
  wrongPart.datums[0].partId = 'PART-WRONG';
  expectCode(() => build({ datums: wrongPart }), 'E_DATUM_PART_MISMATCH');
  const wrongCorner = clone(raw.datums);
  wrongCorner.datums[0].partInstanceId = 'PI-20-016-FR';
  wrongCorner.datums[0].datumId = 'PI-20-016-FR/bearingSeatFront';
  expectCode(() => build({ datums: wrongCorner }), 'E_CORNER_MISMATCH');
  const candidate = clone(raw.c03Manifest);
  candidate.studs.upper.candidateAssembly.partId = 'PART-WRONG';
  expectCode(() => build({ c03Manifest: candidate }), 'E_CANDIDATE_PI_MISMATCH');
});

test('reference run mismatch and registration status mismatch fail closed', () => {
  const run = clone(raw.referenceMotion);
  run.simulationRun.runId = 'RUN-WRONG';
  expectCode(() => build({ referenceMotion: run }), 'E_REFERENCE_RUN_MISMATCH');
  const registration = clone(raw.datums);
  registration.registration.status = 'REGISTERED';
  expectCode(() => build({ datums: registration }), 'E_REGISTRATION_NOT_BLOCKED');
});

test('read-only validation does not mutate the source inputs', () => {
  const before = [raw.datums, raw.c03Manifest, raw.referenceMotion, raw.fixture].map((value) => JSON.stringify(value));
  positive.r38Input.datums.length;
  build();
  const after = [raw.datums, raw.c03Manifest, raw.referenceMotion, raw.fixture].map((value) => JSON.stringify(value));
  assert.deepEqual(after, before);
});

test('the validator detects a live ball-center value change instead of hard-coding it', () => {
  const changed = clone(raw.c03Manifest);
  changed.studs.upper.ballCenter.workholdingMm[1] += 1;
  changed.studs.upper.ballCenter.workholdingYUpM[2] = -changed.studs.upper.ballCenter.workholdingMm[1] * 0.001;
  assert.throws(() => build({ c03Manifest: changed }), (error) => error.code === 'E_BALL_CENTER_OFFSET' || error.code === 'E_ROLE_SWAP');
});

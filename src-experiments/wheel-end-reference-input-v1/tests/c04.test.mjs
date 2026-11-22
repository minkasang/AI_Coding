import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { C04_APPROVED } from '../c04.mjs';
import { validateWheelEndReferenceInputs } from '../validation.mjs';
import { loadRawWheelEndReferenceInputs, validateWheelEndReferenceInputsFromDisk } from '../node-loader.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const raw = loadRawWheelEndReferenceInputs(root, { includeC04: true });
const positive = validateWheelEndReferenceInputsFromDisk(root, { includeC04: true });
const baseline = validateWheelEndReferenceInputsFromDisk(root);
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
  c04Package: raw.c04Package,
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
function c04With(mutator) {
  const packageCopy = clone(raw.c04Package);
  mutator(packageCopy.manifest, packageCopy);
  return packageCopy;
}

test('control: the approved C-04 package is accepted as a demo wheel center', () => {
  const wheel = positive.wheelCenter;
  assert.equal(wheel.status, 'ACCEPTED_DEMO_WHEEL_CENTER');
  assert.equal(wheel.available, true);
  assert.equal(wheel.accepted, true);
  assert.equal(wheel.packageId, C04_APPROVED.packageId);
  assert.equal(wheel.manifestSha256, C04_APPROVED.manifestSha256);
  assert.equal(wheel.stepSha256, C04_APPROVED.stepSha256);
  assert.deepEqual(wheel.value.workholdingYUpM, C04_APPROVED.wheelCenterYUpM);
  assert.deepEqual(wheel.spindle.outboardDirectionYUp, C04_APPROVED.spindleYUp);
  assert.equal(wheel.signedOffset.m, C04_APPROVED.signedOffsetM);
  assert.equal(wheel.signedOffset.mm, 24);
  assert.equal(wheel.asset.partInstanceId, null);
  assert.equal(wheel.asset.geometryRole, 'RIM_DATUM_ARTIFACT');
  assert.equal(wheel.playbackAllowed, false);
});

test('all C-04 dependencies and the snapshot archive are pinned', () => {
  assert.equal(positive.fingerprints.c04PackageId, C04_APPROVED.packageId);
  assert.equal(positive.fingerprints.c04ManifestSha256, C04_APPROVED.manifestSha256);
  assert.equal(positive.fingerprints.c04StepSha256, C04_APPROVED.stepSha256);
  assert.equal(positive.snapshot.snapshotSha256, 'f60d977efc2f5aefb878610b6b5a0bedb7579146f41a6a65528470e8b6a507c4');
  assert.equal(raw.c04Package.manifest.sources.snapshotArchive.sha256, positive.snapshot.snapshotSha256);
  assert.equal(raw.c04Package.manifest.sources.c02.datumsSha256, raw.datumsSha256);
  assert.equal(raw.c04Package.manifest.sources.c03.manifestSha256, raw.c03ManifestSha256);
});

test('the signed offset direction is hub-face minus wheel-center along outboard', () => {
  const wheel = positive.wheelCenter;
  const hub = wheel.hubMountingFace.workholdingYUpM;
  const center = wheel.value.workholdingYUpM;
  const axis = wheel.spindle.outboardDirectionYUp;
  const dot = (hub[0] - center[0]) * axis[0] + (hub[1] - center[1]) * axis[1] + (hub[2] - center[2]) * axis[2];
  assert.ok(Math.abs(dot - wheel.signedOffset.m) < 1e-9);
  assert.ok(wheel.signedOffset.positiveMeans.includes('OUTBOARD'));
  assert.deepEqual(wheel.hubMountingFace.workholdingYUpM, [0.021, 0, 0]);
});

test('R-38 gets the wheel center but keeps playback off and placement forbidden', () => {
  const item = positive.r38Input.wheelCenter;
  assert.equal(item.accepted, true);
  assert.deepEqual(item.value.workholdingYUpM, [-0.003, 0, 0]);
  assert.equal(positive.r38Input.playbackAllowed, false);
  assert.ok(positive.r38Input.allowedUse.includes('WHEEL_CENTER_REFERENCE'));
  assert.ok(positive.r38Input.forbiddenUse.includes('PLAY_R28_MOTION'));
  assert.ok(positive.r38Input.forbiddenUse.includes('USE_C04_WHEEL_CENTER_AS_VEHICLE_PLACEMENT'));
  assert.equal(positive.r38Input.registration.vehicleFromWorkholding, null);
  assert.equal(positive.r38Input.registration.playbackAllowed, false);
});

test('C-03 candidate ball studs and the old R-28 reference stay unchanged', () => {
  assert.equal(positive.r38Input.ballCenters.upper.candidateOnly, true);
  assert.equal(positive.r38Input.ballCenters.upper.candidateAssembly.partInstanceId, 'PI-20-003-FL');
  assert.equal(positive.r38Input.ballCenters.lower.candidateAssembly.partInstanceId, 'PI-20-010-FL');
  assert.equal(positive.referenceMotion.acceptedForNewDemo, false);
  assert.equal(positive.referenceMotion.sourcePlaybackAllowed, true);
  assert.ok(positive.r38Input.forbiddenUse.includes('TREAT_C03_SAMPLE_AS_PRODUCTION_PART'));
  assert.ok(positive.r38Input.forbiddenUse.includes('PLAY_R28_MOTION'));
});

test('the wheel-center unknown is cleared but outer tie-rod/shared landmarks remain', () => {
  const keys = positive.unknowns.map((row) => row.key);
  assert.equal(keys.includes('wheelMountFaceToWheelCenter'), false);
  assert.ok(keys.includes('knuckleOuterTieRodInterface'));
  assert.ok(keys.includes('sharedPhysicalLandmarkCorrespondences'));
  assert.ok(keys.includes('clockingWitness'));
});

test('without includeC04 the R-39 baseline stays pending', () => {
  assert.equal(baseline.wheelCenter.accepted, false);
  assert.equal(baseline.wheelCenter.value, null);
  assert.ok(['PENDING_C04', 'C04_OUTPUT_PRESENT_PENDING_REVIEW'].includes(baseline.wheelCenter.status));
  assert.equal(baseline.r38Input.wheelCenter.accepted, false);
});

test('an unapproved package or same-id different-hash manifest fails closed', () => {
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.packageId = 'c04-394e3930ed5c35a4668e'; }) }), 'E_C04_PACKAGE_NOT_APPROVED');
  const sameId = clone(raw.c04Package);
  sameId.manifestSha256 = 'f'.repeat(64);
  expectCode(() => build({ c04Package: sameId }), 'E_C04_MANIFEST_HASH_MISMATCH');
});

test('manifest or rim STEP hash mismatch fails closed', () => {
  const badManifest = clone(raw.c04Package);
  badManifest.manifestSha256 = '0'.repeat(64);
  expectCode(() => build({ c04Package: badManifest }), 'E_C04_MANIFEST_HASH_MISMATCH');
  const badStep = clone(raw.c04Package);
  badStep.stepSha256 = '0'.repeat(64);
  expectCode(() => build({ c04Package: badStep }), 'E_C04_STEP_HASH_MISMATCH');
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.sha256['rim-datum.step'] = '0'.repeat(64); }) }), 'E_C04_STEP_HASH_MISMATCH');
});

test('wrong offset direction, wheel center or unit fails closed', () => {
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.signedOffset.positiveMeans = 'HUB_MOUNTING_FACE_INBOARD'; }) }), 'E_C04_OFFSET_DIRECTION');
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.wheelCenter.workholdingYUpM = [-0.004, 0, 0]; }) }), 'E_C04_OFFSET_MISMATCH');
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.hubMountingFace.workholdingYUpM = [21, 0, 0]; }) }), 'E_C04_UNIT_MISMATCH');
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.signedOffset.m = 0.025; }) }), 'E_C04_OFFSET_MISMATCH');
});

test('dependency and snapshot archive mismatches fail closed', () => {
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.sources.c02.datumsSha256 = '0'.repeat(64); }) }), 'E_C04_DEPENDENCY_MISMATCH');
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.sources.c03.manifestSha256 = '0'.repeat(64); }) }), 'E_C04_DEPENDENCY_MISMATCH');
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.sources.snapshotArchive.sha256 = '0'.repeat(64); }) }), 'E_SNAPSHOT_ARCHIVE_MISMATCH');
});

test('motion boundary, asset identity and copied ball centers fail closed', () => {
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.motionInput.playbackAllowed = true; }) }), 'E_C04_MOTION_BOUNDARY');
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.motionInput.outerTieRodInterface = { partInstanceId: 'PART-20-075' }; }) }), 'E_C04_MOTION_BOUNDARY');
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.motionInput.vehicleFromWorkholding = [1, 0, 0]; }) }), 'E_C04_MOTION_BOUNDARY');
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.asset.partInstanceId = 'PI-30-006-FL'; }) }), 'E_C04_ASSET_IDENTITY');
  expectCode(() => build({ c04Package: c04With((manifest) => { manifest.motionInput.ballCentersFromC03.upper.workholdingYUpM[1] += 0.001; }) }), 'E_C04_DEPENDENCY_MISMATCH');
});

test('a missing approved C-04 package fails closed', () => {
  expectCode(
    () => loadRawWheelEndReferenceInputs(root, { includeC04: true, c04PackageDir: 'cad/experiments/wheel-end-wheel-center-demo-v1/out/missing' }),
    'E_C04_PACKAGE_MISSING'
  );
});

test('the C-04 package and dependencies are read-only', () => {
  const before = [raw.datums, raw.c03Manifest, raw.referenceMotion, raw.c04Package.manifest].map((value) => JSON.stringify(value));
  build();
  positive.r38Input.wheelCenter.value.workholdingYUpM[0];
  const after = [raw.datums, raw.c03Manifest, raw.referenceMotion, raw.c04Package.manifest].map((value) => JSON.stringify(value));
  assert.deepEqual(after, before);
});

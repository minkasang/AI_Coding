import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { C04_APPROVED } from './c04.mjs';
import { validateWheelEndReferenceInputs } from './validation.mjs';
import {
  loadRawWheelEndReferenceInputs,
  validateWheelEndReferenceInputsFromDisk
} from './node-loader.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const raw = loadRawWheelEndReferenceInputs(root, { includeC04: true });
const positive = validateWheelEndReferenceInputsFromDisk(root, { includeC04: true });
const baseline = validateWheelEndReferenceInputsFromDisk(root);
const baselineArgs = {
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
const checks = [];
const clone = (value) => JSON.parse(JSON.stringify(value));

function check(id, run) {
  try {
    checks.push({ id, pass: true, detail: run() ?? null });
  } catch (error) {
    checks.push({ id, pass: false, code: error.code ?? 'ERROR', message: error.message });
  }
}
function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    if (error.code !== code) throw new Error(`expected ${code}, got ${error.code}: ${error.message}`);
    return { expected: code };
  }
  throw new Error(`expected ${code}, but no error was thrown`);
}
function build(overrides = {}) {
  return validateWheelEndReferenceInputs({ ...baselineArgs, ...overrides });
}
function c04With(mutator) {
  const packageCopy = clone(raw.c04Package);
  mutator(packageCopy.manifest, packageCopy);
  return packageCopy;
}

check('W01_approved_c04_is_accepted_with_values', () => {
  const wheel = positive.wheelCenter;
  if (wheel.status !== 'ACCEPTED_DEMO_WHEEL_CENTER' || !wheel.accepted || !wheel.available) throw new Error('wheel center status');
  if (wheel.packageId !== C04_APPROVED.packageId) throw new Error('package');
  if (wheel.manifestSha256 !== C04_APPROVED.manifestSha256 || wheel.stepSha256 !== C04_APPROVED.stepSha256) throw new Error('hashes');
  if (wheel.value.workholdingYUpM.join(',') !== C04_APPROVED.wheelCenterYUpM.join(',')) throw new Error('wheel center');
  if (wheel.spindle.outboardDirectionYUp.join(',') !== C04_APPROVED.spindleYUp.join(',')) throw new Error('spindle');
  if (wheel.signedOffset.m !== C04_APPROVED.signedOffsetM || wheel.signedOffset.mm !== 24) throw new Error('signed offset');
  if (wheel.asset.partInstanceId !== null || wheel.asset.geometryRole !== 'RIM_DATUM_ARTIFACT') throw new Error('asset identity');
  return { wheelCenter: wheel.value.workholdingYUpM, spindle: wheel.spindle.outboardDirectionYUp, signedOffsetM: wheel.signedOffset.m };
});

check('W02_dependencies_and_snapshot_archive_are_pinned', () => {
  const f = positive.fingerprints;
  if (f.c04PackageId !== C04_APPROVED.packageId) throw new Error('c04 package');
  if (f.c04ManifestSha256 !== C04_APPROVED.manifestSha256) throw new Error('c04 manifest');
  if (f.c04StepSha256 !== C04_APPROVED.stepSha256) throw new Error('c04 step');
  if (positive.snapshot.snapshotSha256 !== 'f60d977efc2f5aefb878610b6b5a0bedb7579146f41a6a65528470e8b6a507c4') throw new Error('snapshot');
  const archive = raw.c04Package.manifest.sources.snapshotArchive;
  if (archive.sha256 !== positive.snapshot.snapshotSha256) throw new Error('snapshot archive');
  return { manifest: f.c04ManifestSha256, step: f.c04StepSha256, archive: archive.gitCommit };
});

check('W03_signed_offset_direction_is_consistent', () => {
  const wheel = positive.wheelCenter;
  const hub = wheel.hubMountingFace;
  const center = wheel.value;
  const delta = hub.workholdingYUpM.map((value, index) => value - center.workholdingYUpM[index]);
  const dot = delta[0] * wheel.spindle.outboardDirectionYUp[0]
    + delta[1] * wheel.spindle.outboardDirectionYUp[1]
    + delta[2] * wheel.spindle.outboardDirectionYUp[2];
  if (Math.abs(dot - wheel.signedOffset.m) > 1e-9) throw new Error('offset math');
  if (!wheel.signedOffset.positiveMeans.includes('OUTBOARD')) throw new Error('offset direction');
  return { delta, dot, signedOffset: wheel.signedOffset };
});

check('W04_r38_input_includes_wheel_center_but_keeps_playback_off', () => {
  const item = positive.r38Input.wheelCenter;
  if (!item.accepted || item.value.workholdingYUpM[0] !== -0.003) throw new Error('r38 wheel center');
  if (positive.r38Input.playbackAllowed !== false) throw new Error('playback');
  if (!positive.r38Input.allowedUse.includes('WHEEL_CENTER_REFERENCE')) throw new Error('allowed use');
  if (!positive.r38Input.forbiddenUse.includes('PLAY_R28_MOTION')) throw new Error('forbidden motion');
  if (!positive.r38Input.forbiddenUse.includes('USE_C04_WHEEL_CENTER_AS_VEHICLE_PLACEMENT')) throw new Error('forbidden placement');
  if (positive.r38Input.registration.vehicleFromWorkholding !== null) throw new Error('vehicle placement');
  return { wheelCenter: item.value.workholdingYUpM, playbackAllowed: false };
});

check('W05_c03_candidates_and_r28_reference_remain_unchanged', () => {
  const upper = positive.r38Input.ballCenters.upper;
  const lower = positive.r38Input.ballCenters.lower;
  if (!upper.candidateOnly || upper.candidateAssembly.partInstanceId !== 'PI-20-003-FL') throw new Error('upper candidate');
  if (!lower.candidateOnly || lower.candidateAssembly.partInstanceId !== 'PI-20-010-FL') throw new Error('lower candidate');
  if (positive.referenceMotion.acceptedForNewDemo !== false || positive.referenceMotion.sourcePlaybackAllowed !== true) throw new Error('R-28 reference');
  if (positive.r38Input.forbiddenUse.includes('TREAT_C03_SAMPLE_AS_PRODUCTION_PART') === false) throw new Error('candidate boundary');
  return { upper: upper.workholdingYUpM, lower: lower.workholdingYUpM };
});

check('W06_unknowns_keep_outer_tie_rod_but_clear_wheel_center', () => {
  const keys = positive.unknowns.map((row) => row.key);
  if (keys.includes('wheelMountFaceToWheelCenter')) throw new Error('wheel center still unknown');
  for (const key of ['knuckleOuterTieRodInterface', 'sharedPhysicalLandmarkCorrespondences', 'clockingWitness']) {
    if (!keys.includes(key)) throw new Error(`missing ${key}`);
  }
  return { unknowns: keys };
});

check('W07_r39_default_without_includeC04_still_pending', () => {
  if (baseline.wheelCenter.accepted !== false || baseline.wheelCenter.value !== null) throw new Error('baseline accepted C-04');
  if (baseline.status !== 'ACCEPTED_STATIC_INPUTS_MOTION_BLOCKED') throw new Error(baseline.status);
  return { status: baseline.wheelCenter.status, accepted: false };
});

check('W08_unapproved_package_and_same_id_hash_fail_closed', () => {
  const unapproved = c04With((manifest) => { manifest.packageId = 'c04-394e3930ed5c35a4668e'; });
  expectCode(() => build({ c04Package: unapproved }), 'E_C04_PACKAGE_NOT_APPROVED');
  const sameId = clone(raw.c04Package);
  sameId.manifestSha256 = 'f'.repeat(64);
  expectCode(() => build({ c04Package: sameId }), 'E_C04_MANIFEST_HASH_MISMATCH');
  return { checked: 2 };
});

check('W09_manifest_and_step_hash_mismatch_fail_closed', () => {
  const badManifest = clone(raw.c04Package);
  badManifest.manifestSha256 = '0'.repeat(64);
  expectCode(() => build({ c04Package: badManifest }), 'E_C04_MANIFEST_HASH_MISMATCH');
  const badStep = clone(raw.c04Package);
  badStep.stepSha256 = '0'.repeat(64);
  expectCode(() => build({ c04Package: badStep }), 'E_C04_STEP_HASH_MISMATCH');
  const badManifestStep = c04With((manifest) => { manifest.sha256['rim-datum.step'] = '0'.repeat(64); });
  expectCode(() => build({ c04Package: badManifestStep }), 'E_C04_STEP_HASH_MISMATCH');
  return { checked: 3 };
});

check('W10_offset_direction_wheel_center_and_unit_fail_closed', () => {
  const direction = c04With((manifest) => { manifest.signedOffset.positiveMeans = 'HUB_MOUNTING_FACE_INBOARD'; });
  expectCode(() => build({ c04Package: direction }), 'E_C04_OFFSET_DIRECTION');
  const center = c04With((manifest) => { manifest.wheelCenter.workholdingYUpM = [-0.004, 0, 0]; });
  expectCode(() => build({ c04Package: center }), 'E_C04_OFFSET_MISMATCH');
  const unit = c04With((manifest) => { manifest.hubMountingFace.workholdingYUpM = [21, 0, 0]; });
  expectCode(() => build({ c04Package: unit }), 'E_C04_UNIT_MISMATCH');
  return { checked: 3 };
});

check('W11_dependency_and_snapshot_archive_fail_closed', () => {
  const c02 = c04With((manifest) => { manifest.sources.c02.datumsSha256 = '0'.repeat(64); });
  expectCode(() => build({ c04Package: c02 }), 'E_C04_DEPENDENCY_MISMATCH');
  const c03 = c04With((manifest) => { manifest.sources.c03.manifestSha256 = '0'.repeat(64); });
  expectCode(() => build({ c04Package: c03 }), 'E_C04_DEPENDENCY_MISMATCH');
  const archive = c04With((manifest) => { manifest.sources.snapshotArchive.sha256 = '0'.repeat(64); });
  expectCode(() => build({ c04Package: archive }), 'E_SNAPSHOT_ARCHIVE_MISMATCH');
  return { checked: 3 };
});

check('W12_motion_boundary_and_asset_identity_fail_closed', () => {
  const playback = c04With((manifest) => { manifest.motionInput.playbackAllowed = true; });
  expectCode(() => build({ c04Package: playback }), 'E_C04_MOTION_BOUNDARY');
  const tieRod = c04With((manifest) => { manifest.motionInput.outerTieRodInterface = { partInstanceId: 'PART-20-075' }; });
  expectCode(() => build({ c04Package: tieRod }), 'E_C04_MOTION_BOUNDARY');
  const placement = c04With((manifest) => { manifest.motionInput.vehicleFromWorkholding = [1, 0, 0]; });
  expectCode(() => build({ c04Package: placement }), 'E_C04_MOTION_BOUNDARY');
  const asset = c04With((manifest) => { manifest.asset.partInstanceId = 'PI-30-006-FL'; });
  expectCode(() => build({ c04Package: asset }), 'E_C04_ASSET_IDENTITY');
  return { checked: 4 };
});

check('W13_c03_ball_centers_must_be_copied_unchanged', () => {
  const changed = c04With((manifest) => { manifest.motionInput.ballCentersFromC03.upper.workholdingYUpM[1] += 0.001; });
  expectCode(() => build({ c04Package: changed }), 'E_C04_DEPENDENCY_MISMATCH');
  return { checked: 1 };
});

check('W14_missing_c04_package_fails_closed', () => {
  expectCode(
    () => loadRawWheelEndReferenceInputs(root, { includeC04: true, c04PackageDir: 'cad/experiments/wheel-end-wheel-center-demo-v1/out/missing' }),
    'E_C04_PACKAGE_MISSING'
  );
  return { checked: 1 };
});

check('W15_c04_package_and_dependencies_are_read_only', () => {
  const before = [raw.datums, raw.c03Manifest, raw.referenceMotion, raw.c04Package.manifest].map((value) => JSON.stringify(value));
  validateWheelEndReferenceInputsFromDisk(root, { includeC04: true });
  build();
  const after = [raw.datums, raw.c03Manifest, raw.referenceMotion, raw.c04Package.manifest].map((value) => JSON.stringify(value));
  if (before.some((value, index) => value !== after[index])) throw new Error('input mutated');
  return { unchanged: true };
});

const failed = checks.filter((item) => !item.pass);
const output = {
  schema: 'carlab.r44.wheelCenterCheck.v1',
  date: '2026-11-22',
  command: 'node src-experiments/wheel-end-reference-input-v1/run-c04-checks.mjs',
  status: positive.status,
  playbackAllowed: positive.playbackAllowed,
  c04: {
    packageId: positive.wheelCenter.packageId,
    manifestSha256: positive.wheelCenter.manifestSha256,
    stepSha256: positive.wheelCenter.stepSha256,
    wheelCenterYUpM: positive.wheelCenter.value.workholdingYUpM,
    spindleYUp: positive.wheelCenter.spindle.outboardDirectionYUp,
    signedOffsetM: positive.wheelCenter.signedOffset.m
  },
  passCount: checks.length - failed.length,
  failCount: failed.length,
  failed: failed.map((item) => item.id),
  checks
};
mkdirSync(join(root, 'agent-workspace/agents/deepseek/reports'), { recursive: true });
writeFileSync(join(root, 'agent-workspace/agents/deepseek/reports/R-44-wheel-center-check-results.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ status: output.status, c04: output.c04, passCount: output.passCount, failCount: output.failCount, failed: output.failed, checks: output.checks }, null, 2));
if (failed.length) process.exit(1);

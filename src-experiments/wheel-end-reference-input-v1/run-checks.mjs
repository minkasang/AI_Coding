import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPROVED, validateWheelEndReferenceInputs } from './validation.mjs';
import { loadRawWheelEndReferenceInputs, validateWheelEndReferenceInputsFromDisk } from './node-loader.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const raw = loadRawWheelEndReferenceInputs(root);
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
const checks = [];

function check(id, run) {
  try {
    const detail = run();
    checks.push({ id, pass: true, detail: detail ?? null });
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
  return validateWheelEndReferenceInputs({ ...baseArgs, ...overrides });
}
const clone = (value) => JSON.parse(JSON.stringify(value));

const positive = validateWheelEndReferenceInputsFromDisk(root);
check('B01_reference_inputs_accepted_and_playback_blocked', () => {
  if (positive.snapshot.snapshotSha256 !== APPROVED.snapshotSha256) throw new Error('pinned snapshot');
  if (positive.playbackAllowed !== false) throw new Error('playback must be false');
  if (positive.c02.datums !== 7) throw new Error('datum count');
  if (positive.c03.upper !== 'C03-UPPER-BALL-STUD' || positive.c03.lower !== 'C03-LOWER-BALL-STUD') throw new Error('artifact ids');
  if (positive.r38Input.ballCenters.upper.offsetMm !== 24 || positive.r38Input.ballCenters.lower.offsetMm !== 27) throw new Error('offsets');
  if (positive.r38Input.ballCenterSpanMm !== 261.553) throw new Error(`span ${positive.r38Input.ballCenterSpanMm}`);
  return { status: positive.status, blockers: positive.blockers, span: positive.r38Input.ballCenterSpanMm };
});

check('B02_fingerprints_match_approved_files', () => {
  const f = positive.fingerprints;
  if (f.c02DatumsSha256 !== APPROVED.c02DatumsSha256) throw new Error('datums hash');
  if (f.c03ManifestSha256 !== APPROVED.c03ManifestSha256) throw new Error('c03 hash');
  if (f.referenceMotionSha256 !== APPROVED.referenceMotionSha256) throw new Error('motion hash');
  if (f.fixtureSha256 !== APPROVED.fixtureSha256) throw new Error('fixture hash');
  if (f.c01ManifestSha256 !== APPROVED.c01ManifestSha256) throw new Error('c01 manifest');
  if (f.c01GlbSha256 !== APPROVED.c01GlbSha256) throw new Error('c01 glb');
  return f;
});

check('B03_ball_centers_and_candidate_assemblies', () => {
  const upper = positive.r38Input.ballCenters.upper;
  const lower = positive.r38Input.ballCenters.lower;
  if (upper.candidateAssembly.partInstanceId !== 'PI-20-003-FL' || upper.candidateAssembly.status !== 'CANDIDATE_PARTIAL_GEOMETRY') throw new Error('upper candidate');
  if (lower.candidateAssembly.partInstanceId !== 'PI-20-010-FL' || lower.candidateAssembly.status !== 'CANDIDATE_PARTIAL_GEOMETRY') throw new Error('lower candidate');
  if (upper.productionEntity || lower.productionEntity) throw new Error('candidate marked production');
  if (upper.candidateOnly !== true || lower.candidateOnly !== true) throw new Error('candidateOnly flag');
  if (!upper.seatDatumId.endsWith('upperBallJointSeat') || !lower.seatDatumId.endsWith('lowerBallJointSeat')) throw new Error('seat datum');
  return { upper: upper.candidateAssembly.partInstanceId, lower: lower.candidateAssembly.partInstanceId };
});

check('B04_c04_output_present_but_not_accepted', () => {
  const wheel = positive.wheelCenter;
  if (wheel.available || wheel.accepted || wheel.value !== null) throw new Error('C-04 value accepted');
  if (!['PENDING_C04', 'C04_OUTPUT_PRESENT_PENDING_REVIEW'].includes(wheel.status)) throw new Error(wheel.status);
  if (wheel.status === 'C04_OUTPUT_PRESENT_PENDING_REVIEW' && wheel.candidatePackages.length === 0) throw new Error('candidate packages missing');
  return { status: wheel.status, packages: wheel.candidatePackages.length };
});

check('B05_r28_is_reference_only_not_new_registration', () => {
  const reference = positive.referenceMotion;
  if (reference.acceptedForNewDemo !== false) throw new Error('R-28 pose accepted');
  if (reference.sourcePlaybackAllowed !== true) throw new Error('source playback flag lost');
  if (reference.reason !== 'OLD_R28_FRAME_NOT_REGISTERED_TO_C02_C03') throw new Error('reason');
  if (reference.runId !== 'RUN-SLA-FL-SNAP1-001' || reference.frameId !== 'FR-VEHICLE') throw new Error('run');
  return reference;
});

check('B06_registration_remains_blocked_with_explicit_missing', () => {
  if (positive.c02.registration.status !== 'REGISTRATION_BLOCKED') throw new Error('registration status');
  if (positive.c02.registration.playbackAllowed !== false) throw new Error('registration playback');
  if (positive.c02.registration.vehicleFromWorkholding !== null) throw new Error('vehicle placement');
  if (positive.c02.registration.missing.length !== 6) throw new Error('missing count');
  return { missing: positive.c02.registration.missing.map((row) => row.key) };
});

check('B07_r38_input_has_datums_witnesses_and_no_wheel_center', () => {
  const input = positive.r38Input;
  if (input.datums.length !== 7) throw new Error('datums');
  if (input.witnessFeatures.length !== 3) throw new Error('witnesses');
  if (input.wheelCenter.accepted || input.wheelCenter.value !== null) throw new Error('wheel center');
  if (!input.forbiddenUse.includes('PLAY_R28_MOTION') || !input.forbiddenUse.includes('USE_C04_WHEEL_CENTER')) throw new Error('forbidden use');
  if (input.playbackAllowed !== false) throw new Error('playback');
  return { status: input.status, witness: input.witnessFeatures.map((row) => row.datumId) };
});

check('B08_snapshot_working_tree_drift_is_reported_as_blocker', () => {
  const clean = build({ workingTree: { detected: false, sha256: APPROVED.snapshotSha256, approvedSha256: APPROVED.snapshotSha256 }, snapshotSource: { kind: 'WORKING_TREE' } });
  if (clean.status !== 'ACCEPTED_STATIC_INPUTS_MOTION_BLOCKED') throw new Error(clean.status);
  const drift = build({ workingTree: { detected: true, sha256: 'b8a1ac28b1ca1094051c1f3f1335765d0e68b05dd7ad2bb5ff0218e0082ac1e5', approvedSha256: APPROVED.snapshotSha256 }, snapshotSource: { kind: 'GIT_HISTORY' } });
  if (drift.status !== 'ACCEPTED_STATIC_INPUTS_PINNED_BYTES_WORKING_TREE_BLOCKED') throw new Error(drift.status);
  if (!drift.blockers.includes('R27_WORKING_TREE_SNAPSHOT_DRIFT')) throw new Error('drift blocker');
  if (drift.r38Input.snapshot.workingTreeBlocked !== true) throw new Error('r38 drift flag');
  return { clean: clean.status, drift: drift.status };
});

check('B09_wrong_datums_or_c03_hash_fails_closed', () => {
  expectCode(() => build({ datumsSha256: '0'.repeat(64) }), 'E_DATUMS_HASH_MISMATCH');
  expectCode(() => build({ c03ManifestSha256: '0'.repeat(64) }), 'E_C03_MANIFEST_HASH_MISMATCH');
  return { checked: 2 };
});

check('B10_wrong_snapshot_hash_revision_or_variant_fails_closed', () => {
  expectCode(() => build({ snapshotSha256: '0'.repeat(64) }), 'E_SNAPSHOT_MISMATCH');
  const revision = clone(raw.datums);
  revision.sources.snapshot.revision = 2;
  expectCode(() => build({ datums: revision }), 'E_SNAPSHOT_MISMATCH');
  const variant = clone(raw.datums);
  variant.sources.snapshot.variantId = 'VAR-WRONG';
  expectCode(() => build({ datums: variant }), 'E_VARIANT_MISMATCH');
  return { checked: 3 };
});

check('B11_swapped_roles_or_ball_centers_fail_closed', () => {
  const candidateSwap = clone(raw.c03Manifest);
  candidateSwap.studs.upper.candidateAssembly = clone(candidateSwap.studs.lower.candidateAssembly);
  expectCode(() => build({ c03Manifest: candidateSwap }), 'E_ROLE_SWAP');
  const centerSwap = clone(raw.c03Manifest);
  centerSwap.studs.upper.ballCenter = clone(raw.c03Manifest.studs.lower.ballCenter);
  centerSwap.studs.lower.ballCenter = clone(raw.c03Manifest.studs.upper.ballCenter);
  expectCode(() => build({ c03Manifest: centerSwap }), 'E_ROLE_SWAP');
  return { checked: 2 };
});

check('B12_unit_mix_and_wrong_offset_fail_closed', () => {
  const unitMix = clone(raw.c03Manifest);
  unitMix.studs.upper.ballCenter.workholdingYUpM = [...unitMix.studs.upper.ballCenter.workholdingMm];
  expectCode(() => build({ c03Manifest: unitMix }), 'E_UNIT_MISMATCH');
  const offset = clone(raw.c03Manifest);
  offset.studs.upper.ballCenter.localMm = [0, 0, 27];
  expectCode(() => build({ c03Manifest: offset }), 'E_BALL_CENTER_OFFSET');
  return { checked: 2 };
});

check('B13_candidate_as_production_fails_closed', () => {
  const production = clone(raw.c03Manifest);
  production.studs.upper.partInstanceId = 'PI-20-003-FL';
  expectCode(() => build({ c03Manifest: production }), 'E_CANDIDATE_AS_PRODUCTION');
  const status = clone(raw.c03Manifest);
  status.studs.lower.candidateAssembly.status = 'EXACT_GEOMETRY';
  expectCode(() => build({ c03Manifest: status }), 'E_CANDIDATE_AS_PRODUCTION');
  return { checked: 2 };
});

check('B14_r28_pose_input_and_c04_value_are_rejected', () => {
  expectCode(() => build({ poseInput: { sourceRunId: 'RUN-SLA-FL-SNAP1-001', frameId: 'FR-VEHICLE' } }), 'E_R28_POSE_NOT_ACCEPTED');
  expectCode(() => build({ c04: { outExists: true, packages: raw.c04.packages, value: [0, 0, 0] } }), 'E_C04_NOT_RELEASED');
  return { checked: 2 };
});

check('B15_missing_datum_wrong_part_or_wrong_corner_fails_closed', () => {
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
  return { checked: 3 };
});

check('B16_reference_motion_hash_or_run_mismatch_fails_closed', () => {
  expectCode(() => build({ referenceMotionSha256: '0'.repeat(64) }), 'E_REFERENCE_MOTION_HASH_MISMATCH');
  const run = clone(raw.referenceMotion);
  run.simulationRun.runId = 'RUN-WRONG';
  expectCode(() => build({ referenceMotion: run }), 'E_REFERENCE_RUN_MISMATCH');
  return { checked: 2 };
});

check('B17_registration_status_or_candidate_pi_mismatch_fails_closed', () => {
  const registration = clone(raw.datums);
  registration.registration.status = 'REGISTERED';
  expectCode(() => build({ datums: registration }), 'E_REGISTRATION_NOT_BLOCKED');
  const candidate = clone(raw.c03Manifest);
  candidate.studs.upper.candidateAssembly.partId = 'PART-WRONG';
  expectCode(() => build({ c03Manifest: candidate }), 'E_CANDIDATE_PI_MISMATCH');
  return { checked: 2 };
});

check('B18_read_only_inputs_are_not_mutated', () => {
  const before = [raw.datums, raw.c03Manifest, raw.referenceMotion, raw.fixture].map((value) => JSON.stringify(value));
  positive.r38Input.datums.length;
  build();
  const after = [raw.datums, raw.c03Manifest, raw.referenceMotion, raw.fixture].map((value) => JSON.stringify(value));
  if (before.some((value, index) => value !== after[index])) throw new Error('input mutated');
  return { unchanged: true };
});

const failed = checks.filter((item) => !item.pass);
const output = {
  schema: 'carlab.r39.referenceInputCheck.v1',
  date: '2026-11-22',
  command: 'node src-experiments/wheel-end-reference-input-v1/run-checks.mjs',
  status: positive.status,
  playbackAllowed: positive.playbackAllowed,
  snapshotId: positive.snapshot.snapshotId,
  snapshotSha256: positive.snapshot.snapshotSha256,
  snapshotSource: positive.snapshotSource,
  workingTree: positive.workingTree,
  fingerprints: positive.fingerprints,
  passCount: checks.length - failed.length,
  failCount: failed.length,
  failed: failed.map((item) => item.id),
  checks
};
mkdirSync(join(root, 'agent-workspace/agents/deepseek/reports'), { recursive: true });
writeFileSync(join(root, 'agent-workspace/agents/deepseek/reports/R-39-reference-input-check-results.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ status: output.status, snapshotSha256: output.snapshotSha256, workingTree: output.workingTree, passCount: output.passCount, failCount: output.failCount, failed: output.failed, checks: output.checks }, null, 2));
if (failed.length) process.exit(1);

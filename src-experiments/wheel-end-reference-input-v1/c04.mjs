/**
 * R-44 approved C-04 wheel-center consumer.
 * Validates the released demo rim datum against C-01/C-02/C-03/R-27/R-28
 * dependencies. It returns reference data only; no vehicle placement, no
 * motion playback, no production part identity.
 */
export const C04_SCHEMA = 'carlab.c04DemoWheelCenter/1';
export const C04_STATUS = 'ACCEPTED_DEMO_WHEEL_CENTER';

export const C04_APPROVED = Object.freeze({
  packageId: 'c04-bae128570c76aec59353',
  manifestSha256: 'a29d64a876dbfde97e4442ecd3cf513a9109be8455fa31a2b5fb1a5fc1f37369',
  stepSha256: '76e37510b2b99694c9024f5a0e65e89d71ba0da2266a71ba1b3c9b633fc8810f',
  wheelCenterYUpM: [-0.003, 0, 0],
  spindleYUp: [1, 0, 0],
  hubMountYUp: [0.021, 0, 0],
  signedOffsetM: 0.024,
  snapshotArchiveGitCommit: '3524e32116019cca2a2decd91d6dfad4b180a2b2'
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);
const isNum3 = (value) => Array.isArray(value) && value.length === 3 && value.every(isNum);
const isMat4 = (value) => Array.isArray(value) && value.length === 4 && value.every((row) => Array.isArray(row) && row.length === 4 && row.every(isNum));
const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
const close3 = (a, b, tolerance = 1e-9) => isNum3(a) && isNum3(b) && a.every((value, index) => close(value, b[index], tolerance));
const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const toYUpM = (workholdingMm) => [workholdingMm[0] * 0.001, workholdingMm[2] * 0.001, -workholdingMm[1] * 0.001];
const fromYUpM = (glbM) => [glbM[0] * 1000, -glbM[2] * 1000, glbM[1] * 1000];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class C04ConsumerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'C04ConsumerError';
    this.code = code;
    this.details = details;
  }
}
function fail(code, message, details = {}) {
  throw new C04ConsumerError(code, message, details);
}
function requireCondition(condition, code, message, details = {}) {
  if (!condition) fail(code, message, details);
}
function check(checks, id, condition, code, message, details = {}) {
  if (!condition) fail(code, message, details);
  checks.push({ id, pass: true });
}

export function validateC04Package({
  manifest,
  manifestSha256,
  stepSha256,
  packageDir = null,
  snapshotArchiveHash,
  snapshotSha256,
  datumsSha256,
  c03Manifest,
  c03ManifestSha256,
  c03StepHashes,
  referenceMotion,
  referenceMotionSha256,
  fixtureSha256,
  c01Hashes,
  expected = {}
}) {
  const expectedPackageId = expected.packageId ?? C04_APPROVED.packageId;
  const expectedManifestSha = expected.manifestSha256 ?? C04_APPROVED.manifestSha256;
  const expectedStepSha = expected.stepSha256 ?? C04_APPROVED.stepSha256;
  const checks = [];

  requireCondition(manifest?.schemaVersion === C04_SCHEMA, 'E_C04_SCHEMA', `C-04 schema must be ${C04_SCHEMA}.`);
  requireCondition(manifest.sourceGrade === 'DEMO_ASSUMPTION', 'E_C04_SCHEMA', 'C-04 sourceGrade must be DEMO_ASSUMPTION.');
  requireCondition(manifest.packageId === expectedPackageId, 'E_C04_PACKAGE_NOT_APPROVED', 'C-04 package is not the approved package.', { expected: expectedPackageId, actual: manifest.packageId });
  requireCondition(manifestSha256 === expectedManifestSha, 'E_C04_MANIFEST_HASH_MISMATCH', 'C-04 manifest SHA-256 does not match the approved manifest.', { expected: expectedManifestSha, actual: manifestSha256 });
  requireCondition(stepSha256 === expectedStepSha, 'E_C04_STEP_HASH_MISMATCH', 'C-04 rim STEP SHA-256 does not match the approved STEP.', { expected: expectedStepSha, actual: stepSha256 });
  requireCondition(manifest.sha256?.['rim-datum.step'] === stepSha256, 'E_C04_STEP_HASH_MISMATCH', 'C-04 manifest does not pin the actual rim STEP.');
  requireCondition(manifest.asset?.artifactId === 'C04-FL-RIM-DATUM', 'E_C04_ASSET_IDENTITY', 'C-04 artifact id must be C04-FL-RIM-DATUM.');
  requireCondition(manifest.asset.partInstanceId === null && manifest.asset.geometryRole === 'RIM_DATUM_ARTIFACT', 'E_C04_ASSET_IDENTITY', 'C-04 rim datum must not claim a production part instance.');

  const sources = manifest.sources ?? {};
  const snapshot = sources.snapshot ?? {};
  requireCondition(snapshot.snapshotId === 'SNAP-R27-R16-R21-R22-R23-01' && snapshot.revision === 1, 'E_SNAPSHOT_MISMATCH', 'C-04 snapshot id/revision mismatch.');
  requireCondition(snapshot.snapshotSha256 === snapshotSha256, 'E_SNAPSHOT_MISMATCH', 'C-04 snapshot SHA-256 mismatch.');
  requireCondition(snapshot.variantId === 'VAR-R16-BOF-ICE' && snapshot.selectionKey === 'partInstanceId', 'E_SNAPSHOT_MISMATCH', 'C-04 snapshot variant/selection mismatch.');
  requireCondition(snapshot.mappingStatus === 'DEMO_SUBSTITUTE' && snapshot.sameVehicleClaim === false, 'E_SNAPSHOT_MISMATCH', 'C-04 must remain DEMO_SUBSTITUTE and not claim the same vehicle.');

  requireCondition(sources.snapshotArchive?.path === 'src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json', 'E_SNAPSHOT_ARCHIVE_MISMATCH', 'C-04 snapshotArchive path mismatch.');
  requireCondition(sources.snapshotArchive.sha256 === snapshotSha256, 'E_SNAPSHOT_ARCHIVE_MISMATCH', 'C-04 snapshotArchive SHA-256 mismatch.');
  requireCondition(sources.snapshotArchive.gitCommit === (expected.snapshotArchiveGitCommit ?? C04_APPROVED.snapshotArchiveGitCommit), 'E_SNAPSHOT_ARCHIVE_MISMATCH', 'C-04 snapshotArchive Git commit mismatch.');
  requireCondition(snapshotArchiveHash === snapshotSha256, 'E_SNAPSHOT_ARCHIVE_MISMATCH', 'Actual Git archive bytes do not match the C-04 snapshot.');

  requireCondition(sources.c02?.datumsSha256 === datumsSha256, 'E_C04_DEPENDENCY_MISMATCH', 'C-04 does not pin the actual C-02 datums.');
  requireCondition(sources.c03?.packageId === c03Manifest.packageId, 'E_C04_DEPENDENCY_MISMATCH', 'C-04 C-03 package id mismatch.');
  requireCondition(sources.c03.manifestSha256 === c03ManifestSha256, 'E_C04_DEPENDENCY_MISMATCH', 'C-04 C-03 manifest hash mismatch.');
  for (const step of ['upper-ball-stud.step', 'lower-ball-stud.step']) {
    requireCondition(sources.c03.stepSha256?.[step] === c03StepHashes?.[step], 'E_C04_DEPENDENCY_MISMATCH', `C-04 C-03 ${step} hash mismatch.`);
  }
  requireCondition(sources.referenceMotion?.sha256 === referenceMotionSha256, 'E_C04_DEPENDENCY_MISMATCH', 'C-04 reference motion hash mismatch.');
  requireCondition(sources.referenceMotion.fixtureSha256 === fixtureSha256, 'E_C04_DEPENDENCY_MISMATCH', 'C-04 reference fixture hash mismatch.');
  const run = referenceMotion.simulationRun;
  requireCondition(sources.referenceMotion.runId === run.runId && sources.referenceMotion.resultHash === run.resultHash, 'E_C04_DEPENDENCY_MISMATCH', 'C-04 reference run id/hash mismatch.');
  requireCondition(sources.referenceMotion.frameId === run.frameId && sources.referenceMotion.sourceRevision === run.sourceRevision, 'E_C04_DEPENDENCY_MISMATCH', 'C-04 reference frame/revision mismatch.');
  requireCondition(sources.referenceMotion.knuckleOriginFeature === 'LOWER_BALL_CENTER' && sources.referenceMotion.unit === 'm', 'E_C04_DEPENDENCY_MISMATCH', 'C-04 reference knuckle origin/unit mismatch.');
  requireCondition(sources.c01?.packageId === 'c01-c5d74da77c293aa5321f', 'E_C04_DEPENDENCY_MISMATCH', 'C-04 C-01 package id mismatch.');
  requireCondition(sources.c01.manifestSha256 === c01Hashes?.['manifest.json'], 'E_C04_DEPENDENCY_MISMATCH', 'C-04 C-01 manifest hash mismatch.');
  requireCondition(sources.c01.assemblyDefinitionSha256 === c01Hashes?.['assembly.json'], 'E_C04_DEPENDENCY_MISMATCH', 'C-04 C-01 assembly hash mismatch.');
  for (const [file, hash] of Object.entries(sources.c01.assetsSha256 ?? {})) {
    requireCondition(c01Hashes?.[file] === hash, 'E_C04_DEPENDENCY_MISMATCH', `C-04 C-01 asset ${file} hash mismatch.`);
  }

  const frames = manifest.frames ?? {};
  requireCondition(frames.workholding?.frameId === 'FR-C01-WHEEL-END-FL' && frames.workholding.unit === 'mm' && frames.workholding.handedness === 'RIGHT', 'E_C04_FRAME', 'C-04 workholding frame/unit mismatch.');
  requireCondition(frames.workholding.originDatumId === 'PI-20-016-FL/bearingSeatFront', 'E_C04_FRAME', 'C-04 workholding origin datum mismatch.');
  requireCondition(isMat4(frames.rootFromRimCad), 'E_C04_FRAME', 'C-04 rootFromRimCad must be 4x4.');
  requireCondition(close(det3(frames.rootFromRimCad), 1, 1e-9), 'E_C04_FRAME', 'C-04 rootFromRimCad must be a proper rotation.');
  requireCondition(close3([frames.rootFromRimCad[0][3], frames.rootFromRimCad[1][3], frames.rootFromRimCad[2][3]], [21, 0, 0], 1e-9), 'E_C04_FRAME', 'C-04 rim root must be at X=21 mm.');
  const axis = frames.workholdingYUpM?.axisConversion;
  requireCondition(isMat4([...axis.map((row) => [...row, 0]), [0, 0, 0, 1]]) && close(det3(axis), 1, 1e-9), 'E_C04_FRAME', 'C-04 Y-up conversion must be proper.');
  requireCondition(frames.workholdingYUpM.positionScale === 0.001 && frames.workholdingYUpM.unit === 'm', 'E_C04_UNIT_MISMATCH', 'C-04 Y-up conversion must be m with 0.001.');

  const hub = manifest.hubMountingFace ?? {};
  requireCondition(hub.c02DatumId === 'PI-30-006-FL/wheelMatingFace' && hub.hubPartInstanceId === 'PI-30-006-FL', 'E_C04_FRAME', 'C-04 hub mounting face identity mismatch.');
  requireCondition(close3(hub.workholdingMm, [21, 0, 0], 1e-9), 'E_C04_FRAME', 'C-04 hub mounting face must be at X=21 mm.');
  requireCondition(close3(hub.workholdingYUpM, toYUpM(hub.workholdingMm), 1e-9), 'E_C04_UNIT_MISMATCH', 'C-04 hub mounting face mm/m mismatch.');

  const center = manifest.wheelCenter ?? {};
  requireCondition(close3(center.workholdingYUpM, C04_APPROVED.wheelCenterYUpM, 1e-9), 'E_C04_OFFSET_MISMATCH', 'C-04 wheel center is not the approved value.', { expected: C04_APPROVED.wheelCenterYUpM, actual: center.workholdingYUpM });
  requireCondition(close3(center.workholdingYUpM, toYUpM(center.workholdingMm), 1e-9), 'E_C04_UNIT_MISMATCH', 'C-04 wheel center Y-up/mm mismatch.');
  requireCondition(center.feature === 'MIDPLANE_OF_TWO_RIM_REFERENCE_SECTIONS_ON_SPINDLE', 'E_C04_OFFSET_MISMATCH', 'C-04 wheel center feature mismatch.');

  const spindle = manifest.spindle ?? {};
  requireCondition(close3(spindle.outboardDirectionYUp, C04_APPROVED.spindleYUp, 1e-9), 'E_C04_FRAME', 'C-04 spindle outboard direction mismatch.');
  requireCondition(close3(spindle.outboardDirectionWorkholding, [1, 0, 0], 1e-9), 'E_C04_FRAME', 'C-04 spindle workholding direction mismatch.');
  requireCondition(close3(spindle.outboardDirectionLocal, [0, 0, 1], 1e-9), 'E_C04_FRAME', 'C-04 spindle local direction mismatch.');

  const offset = manifest.signedOffset ?? {};
  requireCondition(offset.definition === 'DOT(HUB_MOUNT_CENTER_MINUS_WHEEL_CENTER, OUTBOARD_UNIT_AXIS)', 'E_C04_OFFSET_DIRECTION', 'C-04 signed offset definition mismatch.');
  requireCondition(offset.positiveMeans === 'HUB_MOUNTING_FACE_OUTBOARD_OF_WHEEL_CENTER', 'E_C04_OFFSET_DIRECTION', 'C-04 signed offset direction meaning mismatch.');
  const computedOffset = dot3(
    [hub.workholdingYUpM[0] - center.workholdingYUpM[0], hub.workholdingYUpM[1] - center.workholdingYUpM[1], hub.workholdingYUpM[2] - center.workholdingYUpM[2]],
    spindle.outboardDirectionYUp
  );
  requireCondition(close(computedOffset, offset.m, 1e-9), 'E_C04_OFFSET_MISMATCH', 'C-04 signed offset does not match hub minus wheel center.', { computed: computedOffset, declared: offset.m });
  requireCondition(offset.m > 0 && close(offset.mm / 1000, offset.m, 1e-9), 'E_C04_UNIT_MISMATCH', 'C-04 signed offset mm/m mismatch.');
  requireCondition(close(offset.m, C04_APPROVED.signedOffsetM, 1e-9), 'E_C04_OFFSET_MISMATCH', 'C-04 signed offset is not the approved value.');
  requireCondition(offset.valueBasis === 'DEMO_ASSUMPTION', 'E_C04_OFFSET_DIRECTION', 'C-04 signed offset basis must be DEMO_ASSUMPTION.');
  requireCondition(manifest.effectiveParameters?.nominalOffsetMm === offset.mm, 'E_C04_OFFSET_MISMATCH', 'C-04 nominal offset parameter does not match the signed offset.');
  const sections = manifest.referenceSections;
  if (sections) {
    requireCondition(close(sections.separationMm, 140, 1e-9), 'E_C04_OFFSET_MISMATCH', 'C-04 reference section separation must remain 140 mm.');
    requireCondition(close3([
      (sections.inboard.workholdingMm[0] + sections.outboard.workholdingMm[0]) / 2,
      (sections.inboard.workholdingMm[1] + sections.outboard.workholdingMm[1]) / 2,
      (sections.inboard.workholdingMm[2] + sections.outboard.workholdingMm[2]) / 2
    ], [center.workholdingMm[0], center.workholdingMm[1], center.workholdingMm[2]], 1e-9), 'E_C04_OFFSET_MISMATCH', 'C-04 wheel center must be the midplane of the two reference sections.');
  }

  const motion = manifest.motionInput ?? {};
  requireCondition(motion.status === 'CAD_DATUMS_ONLY', 'E_C04_MOTION_BOUNDARY', 'C-04 motionInput status mismatch.');
  requireCondition(motion.outerTieRodInterface == null, 'E_C04_MOTION_BOUNDARY', 'C-04 outer tie-rod interface must remain null.');
  requireCondition(motion.vehicleFromWorkholding == null, 'E_C04_MOTION_BOUNDARY', 'C-04 vehicle placement must remain null.');
  requireCondition(motion.existingR28Registration === 'REGISTRATION_BLOCKED' && motion.playbackAllowed === false, 'E_C04_MOTION_BOUNDARY', 'C-04 must keep the old R-28 registration blocked and playback off.');
  for (const side of ['upper', 'lower']) {
    const copied = motion.ballCentersFromC03?.[side];
    const source = c03Manifest.studs?.[side]?.ballCenter;
    requireCondition(copied?.artifactId === c03Manifest.studs?.[side]?.artifactId, 'E_C04_DEPENDENCY_MISMATCH', `C-04 ${side} C-03 artifact id mismatch.`);
    requireCondition(close3(copied.localMm, source.localMm, 1e-9) && close3(copied.workholdingMm, source.workholdingMm, 1e-9) && close3(copied.workholdingYUpM, source.workholdingYUpM, 1e-9), 'E_C04_DEPENDENCY_MISMATCH', `C-04 ${side} C-03 ball center mismatch.`);
  }

  checks.push({ id: 'C04_PACKAGE_AND_DEPENDENCIES', pass: true, detail: { packageId: manifest.packageId, manifestSha256, stepSha256 } });
  checks.push({ id: 'C04_WHEEL_CENTER_AND_OFFSET', pass: true, detail: { wheelCenter: center.workholdingYUpM, spindle: spindle.outboardDirectionYUp, signedOffsetM: offset.m } });
  checks.push({ id: 'C04_MOTION_BOUNDARY', pass: true, detail: { outerTieRodInterface: null, vehicleFromWorkholding: null, playbackAllowed: false } });

  return {
    status: C04_STATUS,
    packageId: manifest.packageId,
    packageDir,
    manifestSha256,
    stepSha256,
    sourceGrade: 'DEMO_ASSUMPTION',
    asset: {
      artifactId: manifest.asset.artifactId,
      partInstanceId: null,
      geometryRole: manifest.asset.geometryRole
    },
    frameId: frames.workholding.frameId,
    wheelCenter: {
      localMm: [...center.localMm],
      workholdingMm: [...center.workholdingMm],
      workholdingYUpM: [...center.workholdingYUpM],
      feature: center.feature
    },
    spindle: {
      outboardDirectionLocal: [...spindle.outboardDirectionLocal],
      outboardDirectionWorkholding: [...spindle.outboardDirectionWorkholding],
      outboardDirectionYUp: [...spindle.outboardDirectionYUp]
    },
    signedOffset: {
      definition: offset.definition,
      positiveMeans: offset.positiveMeans,
      mm: offset.mm,
      m: offset.m,
      valueBasis: offset.valueBasis
    },
    hubMountingFace: {
      c02DatumId: hub.c02DatumId,
      hubPartInstanceId: hub.hubPartInstanceId,
      localMm: [...hub.localMm],
      workholdingMm: [...hub.workholdingMm],
      workholdingYUpM: [...hub.workholdingYUpM]
    },
    motionInput: clone(motion),
    checks
  };
}

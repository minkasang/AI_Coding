import { writeFileSync } from 'node:fs';
import { applyTransform, consume, loadFixture, registerPose, resultForFingerprint } from './static-registration.mjs';
import { rigidFromPointPairs } from '../wheel-end-frame-registration-v1/register.mjs';

const checks = [];
function check(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), ...detail });
}
const identity = (point) => point.slice();
const oblique = (point) => {
  const [x, y, z] = point;
  return [z + 0.2, x + 0.1, y - 0.3];
};
const linear = (direction) => [direction[2], direction[0], direction[1]];

const fixture = loadFixture();
check('A01_sources_match', fixture.ok && fixture.packageId === 'c03-3f4bf8c599df28679b86' && fixture.snapshotRevision === 1 && fixture.sourceGrade === 'DEMO_ASSUMPTION', {
  packageId: fixture.packageId,
  datumsSha256: fixture.datumsSha256
});
const poseA = registerPose(fixture, 'POSE-IDENTITY', identity, identity);
const poseB = registerPose(fixture, 'POSE-OBLIQUE', oblique, linear);
check('A02_two_poses_match_witness', poseA.ok && poseB.ok && poseB.witnessResidualM < 1e-9 && poseB.axisErrorRad < 1e-9 && poseA.playbackAllowed === false, {
  identityResidualM: poseA.residualM,
  obliqueWitnessM: poseB.witnessResidualM
});

const swapped = rigidFromPointPairs(
  [fixture.pointsM.lower, fixture.pointsM.upper, fixture.pointsM.clock],
  [oblique(fixture.pointsM.upper), oblique(fixture.pointsM.lower), oblique(fixture.pointsM.clock)],
  fixture.pointsM.outboard,
  linear(fixture.pointsM.outboard)
);
check('N01_swapped_balls_rejected', swapped.ok === false && swapped.residualM > 0.0001, { residualM: swapped.residualM });
const mixed = rigidFromPointPairs(
  [fixture.pointsMm.lower, fixture.pointsMm.upper, [0, 0, 0]],
  [fixture.pointsM.lower, fixture.pointsM.upper, fixture.pointsM.clock]
);
check('N02_unit_mix_rejected', mixed.ok === false && mixed.residualM > 0.0001, { residualM: mixed.residualM });
const mirrored = registerPose(fixture, 'POSE-MIRROR-AXIS', oblique, (direction) => {
  const turned = linear(direction);
  return [turned[0], -turned[1], turned[2]];
});
check('N03_reversed_outboard_rejected', mirrored.ok === false && mirrored.code === 'MIRROR_REJECTED', { code: mirrored.code });
function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
check('A03_transforms_replay_witness', poseA.transform && poseB.transform && distance(applyTransform(poseB.transform, fixture.pointsM.witness), oblique(fixture.pointsM.witness)) < 1e-9, {
  translation: poseB.transform?.translationMeters
});
check('N04_wrong_revision_stale', consume(fixture, 2).status === 'STALE' && consume(fixture, 1).playbackAllowed === false, {});
check('N05_bad_manifest_fingerprint_has_no_transform', resultForFingerprint(fixture, '0'.repeat(64)).transforms.length === 0, {});

const failed = checks.filter((item) => !item.pass).map((item) => item.id);
const output = {
  schema: 'carlab.r38.staticRegistration.v1',
  date: '2026-11-22',
  command: 'node src-experiments/wheel-end-same-source-registration-v1/run-checks.mjs',
  fixtureId: fixture.fixtureId,
  playbackAllowed: false,
  passCount: checks.length - failed.length,
  failCount: failed.length,
  failed,
  checks,
  transforms: [poseA.transform, poseB.transform],
  provenance: fixture.ok ? {
    packageId: fixture.packageId,
    manifestSha256: fixture.manifestSha256,
    datumsSha256: fixture.datumsSha256,
    c01ManifestSha256: fixture.c01ManifestSha256,
    snapshotId: fixture.snapshotId,
    snapshotRevision: fixture.snapshotRevision,
    snapshotSha256: fixture.snapshotSha256,
    sourceGrade: fixture.sourceGrade
  } : fixture
};
writeFileSync(new URL('./R-38-results.json', import.meta.url), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ passCount: output.passCount, failCount: output.failCount, failed, poseB: poseB && { witness: poseB.witnessResidualM, axis: poseB.axisErrorRad, code: poseB.code } }, null, 2));
if (failed.length) process.exit(1);

import { writeFileSync } from 'node:fs';
import { assessRegistration, playbackFor, rigidFromPointPairs } from './register.mjs';

const checks = [];
function check(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), ...detail });
}

const report = assessRegistration();
check('R01_real_pair_blocked', report.playbackAllowed === false && report.status === 'REGISTRATION_BLOCKED' && report.missing.length === 4, {
  missing: report.missing.map((item) => item.id)
});
check('R02_roles_preserved', report.roles.hub.roleOnly === true && report.roles.hub.instanceId === null && report.roles.tierod.requiredButDeferred === true && report.roles.tierod.instanceId === null, {});
check('R03_identity_recorded', report.source.instanceId === 'PI-20-016-FL' && report.source.sourceRevision === 1 && report.source.runId === 'RUN-SLA-FL-SNAP1-001' && report.motionValueBasis === 'DEMO_ASSUMPTION', {
  hash: report.source.resultHash
});

const source = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
const target = source.map(([x, y, z]) => [z + 0.2, x + 0.1, y - 0.3]);
const fit = rigidFromPointPairs(source, target);
check('R04_synthetic_fit_recovers', fit.ok && fit.residualM < 1e-9 && fit.handedness > 0.999, { residualM: fit.residualM });

const oblique = [[0, 0, 0], [1, 1, 0], [-1, 1, 0]];
const obliqueTarget = oblique.map(([x, y, z]) => [z + 0.2, x + 0.1, y - 0.3]);
const obliqueFit = rigidFromPointPairs(oblique, obliqueTarget);
check('R08_oblique_rigid_motion_recovers', obliqueFit.ok && obliqueFit.code === 'REGISTERED' && obliqueFit.residualM < 1e-9, {
  code: obliqueFit.code,
  residualM: obliqueFit.residualM
});
const sameDirection = rigidFromPointPairs(oblique, obliqueTarget, [0, 0, 1], [1, 0, 0]);
const mirrorFit = rigidFromPointPairs(oblique, obliqueTarget, [0, 0, 1], [-1, 0, 0]);
check('R09_same_physical_direction_passes', sameDirection.ok, {});
check('R05_mirror_rejected', mirrorFit.ok === false && mirrorFit.code === 'MIRROR_REJECTED', { code: mirrorFit.code, normalDot: mirrorFit.normalDot });
check('R10_collinear_is_not_mirror', rigidFromPointPairs([[0, 0, 0], [1, 1, 1], [2, 2, 2]], [[0, 0, 0], [1, 1, 1], [2, 2, 2]]).code === 'COLLINEAR', {});
check('R11_coincident_rejected', rigidFromPointPairs([[0, 0, 0], [0, 0, 0], [1, 0, 0]], [[0, 0, 0], [0, 0, 0], [1, 0, 0]]).code === 'COINCIDENT', {});
check('R12_c02_still_blocks_playback', report.source.c02Registration === 'REGISTRATION_BLOCKED' && report.source.c02VehicleFromWorkholding === null && Math.abs(report.source.spindleProjectionDifferenceMm + 79.3776009561) < 1e-6, {});

const mixed = rigidFromPointPairs([[0, 0, 0], [0.11, 0, 0], [0, 0.1, 0]], [[0, 0, 0], [110, 0, 0], [0, 100, 0]]);
check('R06_millimetre_mix_rejected', mixed.ok === false && mixed.residualM > 0.0001, { residualM: mixed.residualM });
check('R07_wrong_revision_not_playable', playbackFor(report, 2).status === 'STALE' && playbackFor(report, 1).playbackAllowed === false, {});

const failed = checks.filter((item) => !item.pass).map((item) => item.id);
const output = {
  schema: 'carlab.r33.registrationRun.v1',
  date: '2026-11-21',
  command: 'node src-experiments/wheel-end-frame-registration-v1/run-checks.mjs',
  playbackAllowed: report.playbackAllowed,
  status: report.status,
  passCount: checks.length - failed.length,
  failCount: failed.length,
  failed,
  checks,
  assessment: report
};
writeFileSync(new URL('./R-33-results.json', import.meta.url), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ passCount: output.passCount, failCount: output.failCount, failed, status: report.status }, null, 2));
if (failed.length) process.exit(1);

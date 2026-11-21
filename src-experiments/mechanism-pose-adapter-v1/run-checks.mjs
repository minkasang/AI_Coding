import { readFileSync, writeFileSync } from 'node:fs';
import { applyPose, buildCanonicalStream } from './adapter.mjs';

const snapshot = JSON.parse(readFileSync(new URL('../vehicle-snapshot-v1/fixtures/vehicle-snapshot.json', import.meta.url), 'utf8'));
const checks = [];
function check(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), ...detail });
}

const stream = buildCanonicalStream();
const ids = ['PI-20-001-FL', 'PI-20-008-FL', 'PI-20-016-FL'];
check('C01_revision_and_three_ids', stream.sourceRevision === 1 && stream.frames.length === 9 && stream.frames.every((frame) => ids.every((id) => frame.instances.some((item) => item.instanceId === id))), {
  revision: stream.sourceRevision,
  frames: stream.frames.length
});
check('C02_tie_and_hub_not_invented', stream.frames.every((frame) => {
  const tie = frame.omitted.find((item) => item.role === 'TIEROD');
  const hub = frame.omitted.find((item) => item.role === 'HUB');
  return tie.instanceId === null && tie.requiredButDeferred === true && hub.instanceId === null && hub.roleOnly === true && hub.candidateInstanceId === 'PI-30-006-FL';
}), {});

function quatNorm(q) {
  return Math.hypot(q[0], q[1], q[2], q[3]);
}
check('C03_quaternion_unit_and_cycle', stream.frames.every((frame) => frame.instances.every((item) => Math.abs(quatNorm(item.quaternion) - 1) < 1e-9)) && stream.frames[0].travelM === stream.frames.at(-1).travelM, {});

function range(values) {
  return Math.max(...values) - Math.min(...values);
}
const upperOrigin = stream.frames.map((frame) => frame.instances.find((item) => item.instanceId === 'PI-20-001-FL').positionMeters);
const upperMove = range(upperOrigin.map((point) => point[0])) + range(upperOrigin.map((point) => point[1])) + range(upperOrigin.map((point) => point[2]));
check('C04_hinge_origin_stays', upperMove < 1e-9, { upperMove });
check('C05_force_and_demo_basis', stream.force === 'N/A' && stream.motionValueBasis === 'DEMO_ASSUMPTION' && stream.frames.every((frame) => frame.clearance.cadCollisionVerified === false), {});

const view = applyPose({ revision: snapshot.revision, snapshotId: snapshot.snapshotId, variantId: snapshot.variant?.variantId }, stream.frames[0], stream);
check('C06_apply_pose_reads_snapshot', view.playbackAllowed && view.status === 'CURRENT' && view.poses['PI-20-001-FL'] && !view.poses['PI-30-006-FL'] && view.poses['PI-20-001-FL'].positionMeters[0] === stream.frames[0].instances[0].positionMeters[0], {
  keys: Object.keys(view.poses)
});
const stale = applyPose({ revision: 4, snapshotId: snapshot.snapshotId, variantId: snapshot.variant.variantId }, stream.frames[0], stream);
check('C07_wrong_revision_not_playable', stale.playbackAllowed === false && stale.status === 'STALE' && Object.keys(stale.poses).length === 0, {});
const wrongVariant = applyPose({ revision: 1, snapshotId: snapshot.snapshotId, variantId: 'OTHER' }, stream.frames[0], stream);
check('C08_wrong_variant_blocked', wrongVariant.status === 'BLOCKED' && wrongVariant.playbackAllowed === false, {});
const bad = buildCanonicalStream({ declaredLengthsM: { tieRod: 0.5 } });
check('C09_illegal_length_blocks', bad.playbackAllowed === false && bad.frames.length === 0, { status: bad.status });
check('C10_snapshot_revision_is_one', snapshot.revision === 1 && stream.simulationRun.rebase.fromInputRevision === 3 && stream.simulationRun.inputRevision === 1, {
  rebaseHash: stream.simulationRun.resultHash
});

const failed = checks.filter((item) => !item.pass).map((item) => item.id);
const output = {
  schema: 'carlab.r28.poseAdapterRun.v1',
  date: '2026-11-21',
  command: 'node src-experiments/mechanism-pose-adapter-v1/run-checks.mjs',
  passCount: checks.length - failed.length,
  failCount: failed.length,
  failed,
  checks
};
writeFileSync(new URL('./R-28-results.json', import.meta.url), JSON.stringify(output, null, 2));
writeFileSync(new URL('./canonical-motion.json', import.meta.url), JSON.stringify(stream, null, 2));
console.log(JSON.stringify({ passCount: output.passCount, failCount: output.failCount, failed, hash: stream.simulationRun?.resultHash }, null, 2));
if (failed.length) process.exit(1);

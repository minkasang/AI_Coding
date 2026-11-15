import { writeFileSync } from 'node:fs';
import { buildMotionStream, consumeStream, quaternionStepRad } from './stream.mjs';

const checks = [];
function check(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), ...detail });
}

const stream = buildMotionStream();
const first = stream.frames[0];
const last = stream.frames[stream.frames.length - 1];
check('S01_cycle_returns_to_start', stream.legalAssembly && stream.frames.length >= 3 && first.travelM === last.travelM && Math.abs(first.instances[0].position[1] - last.instances[0].position[1]) < 1e-9, {
  frames: stream.frames.length,
  travel: [first.travelM, last.travelM]
});
check('S02_quaternion_has_no_jump', quaternionStepRad(stream) < 0.35, { maxStepRad: quaternionStepRad(stream) });

function range(values) {
  return Math.max(...values) - Math.min(...values);
}
const upper = stream.frames.map((frame) => frame.instances.find((item) => item.instanceId === 'PI-20-001-FL').rigidLengthsM.axisAToBall);
const closure = Math.max(...stream.frames.flatMap((frame) => frame.instances.map((item) => item.closureErrorM || 0)));
check('S03_length_and_closure_hold', range(upper) < 0.0001 && closure < 1e-6, { upperRangeM: range(upper), closure });
check('S04_scale_one_and_force_na', stream.frames.every((frame) => frame.force === 'N/A' && frame.instances.every((item) => item.scale.every((value) => value === 1))), {});
check('S05_reuses_skeleton_ids', ['PI-20-001-FL', 'PI-20-008-FL', 'PI-20-016-FL'].every((id) => first.instances.some((item) => item.instanceId === id)), {});
const tie = first.instances.find((item) => item.definitionId === 'PART-20-075');
const hub = first.instances.find((item) => item.bindingStatus === 'UNBOUND_NO_HUB_BODY');
check('S06_missing_instances_stay_unbound', tie.instanceId === null && tie.bindingStatus === 'DEFERRED_NO_INSTANCE' && hub.instanceId === null, {
  tie: tie.bindingStatus,
  hub: hub.bindingStatus
});
const ids = first.constraints.map((item) => item.constraintId);
check('S07_constraint_ids_and_residuals', ['CON-SUSP-UPPER-CIRCLE', 'CON-SUSP-LOWER-CIRCLE', 'CON-KINGPIN-LENGTH', 'CON-TIE-ROD-LENGTH', 'CON-WHEEL-CENTER-HEIGHT'].every((id) => ids.includes(id)) && first.constraints.filter((item) => item.jointOrConstraint === 'CONSTRAINT').every((item) => item.status === 'SATISFIED'), {
  statuses: first.constraints.map((item) => [item.constraintId, item.status])
});
check('S08_shock_is_output', first.constraints.find((item) => item.constraintId === 'CON-SHOCK-OUTPUT').jointOrConstraint === 'OUTPUT', {});
check('S09_revision_change_is_stale', consumeStream(stream, { revision: 4, frameId: 'FR-VEHICLE' }).status === 'STALE' && consumeStream(stream, { revision: 3, frameId: 'FR-VEHICLE' }).status === 'CURRENT', {});
check('S10_frame_change_is_blocked', consumeStream(stream, { revision: 3, frameId: 'FR-ENGINEERING' }).status === 'BLOCKED', {});
const bad = buildMotionStream({ declaredLengthsM: { tieRod: 0.5 } });
check('S11_bad_input_publishes_no_frames', bad.legalAssembly === false && bad.frames.length === 0 && bad.status === 'BLOCKED', { code: bad.code });
check('S12_clearance_is_demo_proxy', first.clearance.label === 'DEMO_SPHERE_PROXY' && first.clearance.cadCollisionVerified === false, {});
const again = buildMotionStream();
check('S13_hash_repeats', stream.simulationRun.resultHash === again.simulationRun.resultHash && stream.simulationRun.runId === 'RUN-SLA-FL-DEMO-001', {});

const failed = checks.filter((item) => !item.pass).map((item) => item.id);
const output = {
  schema: 'carlab.r23.motionStreamRun.v1',
  date: '2026-11-15',
  command: 'node src-experiments/mechanism-stream-v1/run-checks.mjs',
  staticUrl: '/src-experiments/mechanism-stream-v1/motion-stream.json',
  passCount: checks.length - failed.length,
  failCount: failed.length,
  failed,
  checks
};
writeFileSync(new URL('./R-23-results.json', import.meta.url), JSON.stringify(output, null, 2));
writeFileSync(new URL('./motion-stream.json', import.meta.url), JSON.stringify(stream, null, 2));
console.log(JSON.stringify({ passCount: output.passCount, failCount: output.failCount, failed, frames: stream.frames.length, hash: stream.simulationRun.resultHash }, null, 2));
if (failed.length) process.exit(1);

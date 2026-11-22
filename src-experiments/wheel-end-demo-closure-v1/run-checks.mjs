import { writeFileSync } from 'node:fs';
import { loadClosure, requestTravel } from './closure.mjs';

const checks = [];
function check(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), ...detail });
}

const closure = loadClosure();
check('K01_published_points_consistent', closure.ok && closure.packages.c04 === 'c04-bae128570c76aec59353' && closure.packages.c05 === 'c05-ee1e461fecf00faa8151', {
  distancesM: closure.distancesM
});
check('K02_nominal_distances_positive', Object.values(closure.distancesM).every((value) => value > 0.05), closure.distancesM);
check('K03_travel_blocked', requestTravel(closure, 0.02).code === 'TRAVEL_INPUT_INCOMPLETE' && requestTravel(closure, 0).playbackAllowed === false, {});
check('K04_inner_end_named', closure.blockers.some((item) => item.id === 'INNER_TIE_ROD_INTERFACE_NULL') && closure.r28AcceptedForClosure === false, {});
check('K05_pins_present', Object.values(closure.pins).every((value) => typeof value === 'string' && value.length === 64), closure.pins);

const failed = checks.filter((item) => !item.pass).map((item) => item.id);
const output = {
  schema: 'carlab.r45.demoClosure.v1',
  date: '2026-11-22',
  command: 'node src-experiments/wheel-end-demo-closure-v1/run-checks.mjs',
  playbackAllowed: false,
  passCount: checks.length - failed.length,
  failCount: failed.length,
  failed,
  checks,
  closure
};
writeFileSync(new URL('./R-45-results.json', import.meta.url), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ passCount: output.passCount, failCount: output.failCount, failed, distancesM: closure.distancesM }, null, 2));
if (failed.length) process.exit(1);

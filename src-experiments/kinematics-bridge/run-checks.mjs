import { readFileSync, writeFileSync } from 'node:fs';
import { checkVariantStatics, explainSolverCode, reviewSuspension } from './bridge.mjs';

const fixture = JSON.parse(readFileSync(new URL('../kinematics/fixture-demo.json', import.meta.url), 'utf8'));
const checks = [];
function check(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), ...detail });
}

function request(overrides = {}) {
  return {
    provenance: 'FICTIONAL_FIXTURE',
    valueBasis: 'DEMO_ASSUMPTION',
    solverRequest: {
      topology: 'doubleWishbone',
      side: 'left',
      valueBasis: 'DEMO_ASSUMPTION',
      frame: { frameId: 'FR-VEHICLE', units: 'm' },
      hardpoints: fixture.hardpoints,
      travelM: 0
    },
    variant: {},
    ...overrides
  };
}

const legal = reviewSuspension(request());
check('B01_design_is_assemblable', legal.ok && legal.category === 'OK' && legal.solver.code === 'KIN-OK', {
  category: legal.category,
  code: legal.solver?.code
});

const scaled = reviewSuspension(request({
  solverRequest: { ...request().solverRequest, scale: 1.1, tieLengthOverrideM: 0.2 }
}));
check('B02_scale_stops_before_solver', scaled.solverCalled === false && scaled.failures.some((item) => item.rule === 'P14') && !scaled.failures.some((item) => item.rule === 'P09'), {
  rules: scaled.failures.map((item) => item.rule)
});

const rail = checkVariantStatics({
  valueBasis: 'DEMO_ASSUMPTION',
  railLengthM: 2.86,
  wheelbaseM: 2.7,
  minOverhangM: 0.1,
  source: 'R-01 demo rail 2.86 m and 0.10 m overhang'
});
check('B03_short_rail_is_p08_only', rail.failures.length === 1 && rail.failures[0].rule === 'P08' && Math.abs(rail.failures[0].detail.requiredM - 2.9) < 1e-9, {
  rules: rail.failures.map((item) => item.rule),
  required: rail.failures[0]?.detail.requiredM
});

const published = checkVariantStatics({
  valueBasis: 'DEMO_ASSUMPTION',
  lowerArmSpanM: 0.7356,
  lowerArmMaxSpanM: 0.56,
  tieRodSpanM: 0.7564,
  tieRodMaxSpanM: 0.6,
  source: 'R-01 reported 735.6 mm and 756.4 mm against 560 mm and 600 mm'
});
check('B04_published_spans_are_p09_not_convergence', published.failures.filter((item) => item.rule === 'P09').length === 2 && published.failures.every((item) => item.failureType === 'KINEMATIC_UNRESOLVABLE'), {
  count: published.failures.length
});

const moduleLimit = reviewSuspension(request({ variant: { lowerArmMaxSpanM: 0.2 } }));
check('B05_module_span_rejects_without_solver', moduleLimit.solverCalled === false && moduleLimit.failures[0].rule === 'P09' && moduleLimit.measured.lowerArmSpanM > 0.2, {
  span: moduleLimit.measured.lowerArmSpanM,
  message: moduleLimit.userMessage
});

const length = reviewSuspension(request({
  solverRequest: { ...request().solverRequest, declaredLengthsM: { tieRod: 0.5 } }
}));
check('B06_length_conflict_is_not_p08_or_p09', length.solverCalled && length.solver.code === 'KIN-E-LENGTH' && length.category === 'GEOMETRY_INFEASIBLE' && length.explanation.platformRules.length === 0 && length.explanation.mustNotRewriteAs.includes('P09'), {
  category: length.category,
  code: length.solver.code
});

const converge = reviewSuspension(request({
  solverRequest: { ...request().solverRequest, tieLengthOverrideM: fixture.hardpoints ? 0.20089143810376277 : 0.2 }
}));
check('B07_nonconvergence_stays_numerical', converge.category === 'SOLVER_NUMERICAL' && converge.solver.code === 'KIN-E-CONVERGE' && converge.explanation.platformRules.length === 0 && converge.explanation.mustNotRewriteAs.includes('P17'), {
  category: converge.category,
  residual: converge.solver.residual,
  hint: converge.explanation.interpretation
});

const nested = reviewSuspension(request({ variant: { nestedScale: { arm: 1.1 } } }));
check('B08_nested_scale_is_open_gap', nested.category === 'OPEN_GAP' && nested.solverCalled === false && nested.openGaps[0].failureType === 'SCALE_NOT_COVERED_BY_P14', {
  category: nested.category
});

const explainedScale = explainSolverCode('KIN-E-SCALE');
check('B09_scale_code_mentions_p14_only', explainedScale.platformRules.length === 1 && explainedScale.platformRules[0] === 'P14' && explainedScale.category === 'VARIANT_ILLEGAL', {
  rules: explainedScale.platformRules
});

const failed = checks.filter((item) => !item.pass).map((item) => item.id);
const output = {
  schema: 'carlab.r13.bridgeRun.v1',
  date: '2026-11-15',
  command: 'node src-experiments/kinematics-bridge/run-checks.mjs',
  valueBasis: 'DEMO_ASSUMPTION',
  provenance: 'FICTIONAL_FIXTURE',
  passCount: checks.length - failed.length,
  failCount: failed.length,
  failed,
  checks
};
writeFileSync(new URL('./R-13-results.json', import.meta.url), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ passCount: output.passCount, failCount: output.failCount, failed }, null, 2));
if (failed.length) process.exit(1);

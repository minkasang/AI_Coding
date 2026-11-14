import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/project/cyq/AI_Coding/car';
const mappingPath = process.argv[2] || path.join(ROOT, 'docs/research/R-07-schema-mapping.example.json');
const outPath = process.argv[3] || path.join(ROOT, 'agent-workspace/agents/deepseek/reports/R-07-mapping-check-results.json');

const failures = [];
const checks = [];
const fail = (message) => failures.push(message);
const record = (id, pass, detail) => checks.push({ id, pass, detail });

function getPath(obj, p) {
  return String(p).split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), obj);
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

let doc;
try {
  doc = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: `cannot parse ${mappingPath}: ${e.message}` }, null, 2));
  process.exit(2);
}

// top-level
for (const key of ['schemaVersion', 'status', 'canonical', 'mappings', 'conflicts', 'counterexamples', 'decisionRequests']) {
  if (doc[key] == null) fail(`missing top-level ${key}`);
}
if (!Array.isArray(doc.mappings)) fail('mappings must be an array');
if (!Array.isArray(doc.conflicts)) fail('conflicts must be an array');
if (!Array.isArray(doc.counterexamples)) fail('counterexamples must be an array');
if (!Array.isArray(doc.decisionRequests)) fail('decisionRequests must be an array');

const c = doc.canonical || {};
const wf = c.worldFrame || {};
if (wf.axes?.x !== 'left' || wf.axes?.y !== 'up' || wf.axes?.z !== 'forward') fail('canonical.worldFrame axes must be x=left,y=up,z=forward');
if (wf.units !== 'm') fail('canonical.worldFrame units must be m');
if (wf.handedness !== 'right') fail('canonical.worldFrame handedness must be right');
if (c.engineeringFrame?.axes?.x !== 'forward' || c.engineeringFrame?.axes?.y !== 'left' || c.engineeringFrame?.axes?.z !== 'up') fail('canonical.engineeringFrame axes must be x=forward,y=left,z=up');
for (const k of ['partId', 'partFamilyId', 'instanceId', 'assemblyId', 'revision', 'contentFingerprint', 'externalIds']) {
  if (c.identity?.[k] == null) fail(`canonical.identity missing ${k}`);
}
for (const k of ['valueBasis', 'evidence', 'fidelityClaim', 'fidelityTarget', 'verification', 'reviewStatus']) {
  if (c.truth?.[k] == null) fail(`canonical.truth missing ${k}`);
}
for (const t of ['DISTANCE', 'POINT_ON_LINE']) {
  if (!(c.jointTypes || []).includes(t)) fail(`canonical.jointTypes missing ${t}`);
}
if (!(c.drivers || []).includes('PRESCRIBED_POSITION')) fail('canonical.drivers missing PRESCRIBED_POSITION');
if (!String(c.asset?.revisionVsFingerprint || '').includes('contentFingerprint')) fail('canonical.asset.revisionVsFingerprint must mention contentFingerprint');
if (!String(c.asset?.modelingFidelity || '').includes('FID-V')) fail('canonical.asset.modelingFidelity must map envelope to FID-V');
if (!String(c.asset?.massProperties || '').includes('DEMO_ASSUMPTION')) fail('canonical.asset.massProperties must map to DEMO_ASSUMPTION');
record('canonical', failures.length === 0, 'axes/units/identity/truth/joint types/drivers/asset rules');

// mappings
const mappings = doc.mappings || [];
record('mappings.count', mappings.length >= 30, `count=${mappings.length} (>=30)`);
const fromCounts = {};
const mapIds = new Set();
for (const m of mappings) {
  if (!m.mappingId || !m.from || !m.to || !m.sourcePath || !m.targetPath || !m.transform || !m.status) fail(`mapping ${m.mappingId || '?'} missing required field`);
  if (mapIds.has(m.mappingId)) fail(`duplicate mappingId ${m.mappingId}`);
  mapIds.add(m.mappingId);
  fromCounts[m.from] = (fromCounts[m.from] || 0) + 1;
}
for (const model of ['R-01', 'R-03', 'R-04', 'RP-01', 'RP-02']) {
  if ((fromCounts[model] || 0) < 3) fail(`mapping coverage for ${model} < 3 (${fromCounts[model] || 0})`);
}
record('mappings.coverage', true, JSON.stringify(fromCounts));

// conflicts
const conflicts = doc.conflicts || [];
record('conflicts.count', conflicts.length >= 12, `count=${conflicts.length} (>=12)`);
const conflictIds = new Set();
for (const cf of conflicts) {
  for (const k of ['conflictId', 'severity', 'topic', 'sources', 'observed', 'whyItMatters', 'recommendation', 'owner', 'status']) {
    if (cf[k] == null || (Array.isArray(cf[k]) && cf[k].length === 0) || (typeof cf[k] === 'string' && cf[k].trim() === '')) fail(`conflict ${cf.conflictId || '?'} missing/empty ${k}`);
  }
  if (conflictIds.has(cf.conflictId)) fail(`duplicate conflictId ${cf.conflictId}`);
  conflictIds.add(cf.conflictId);
}
for (const id of ['C-01', 'C-02', 'C-03', 'C-04', 'C-05', 'C-06']) {
  if (!conflictIds.has(id)) fail(`missing P0 conflict ${id}`);
}
const p0 = conflicts.filter(cf => cf.severity === 'P0').length;
record('conflicts.p0', p0 >= 6, `P0=${p0}`);

// counterexamples and checks
const ces = doc.counterexamples || [];
record('counterexamples.count', ces.length >= 10, `count=${ces.length} (>=10)`);
const ceIds = new Set();
for (const ce of ces) {
  if (!ce.counterexampleId || !ce.conflictId || !ce.description || !ce.check || !ce.failure) fail(`counterexample ${ce.counterexampleId || '?'} missing required field`);
  if (ceIds.has(ce.counterexampleId)) fail(`duplicate counterexampleId ${ce.counterexampleId}`);
  ceIds.add(ce.counterexampleId);
  const chk = ce.check || {};
  let pass = false;
  let detail = '';
  if (chk.type === 'vector_diff') {
    const d = dist(chk.claimed, chk.correct);
    pass = Math.abs(d - chk.expectedDifference) <= (chk.tolerance ?? 1e-9);
    detail = `distance=${d}, expected=${chk.expectedDifference}`;
  } else if (chk.type === 'equals') {
    pass = eq(chk.actual, chk.expected);
    detail = `actual=${JSON.stringify(chk.actual)}, expected=${JSON.stringify(chk.expected)}`;
  } else if (chk.type === 'not_equals') {
    pass = !eq(chk.actual, chk.expected);
    detail = `actual=${JSON.stringify(chk.actual)}, expected!=${JSON.stringify(chk.expected)}`;
  } else if (chk.type === 'mapping_target') {
    const m = mappings.find(x => x.mappingId === chk.mappingId);
    pass = !!m && String(m.targetPath).includes(chk.expectedContains);
    detail = m ? `targetPath=${m.targetPath}` : `mapping ${chk.mappingId} not found`;
  } else if (chk.type === 'mapping_field_contains') {
    const m = mappings.find(x => x.mappingId === chk.mappingId);
    pass = !!m && String(m[chk.field] || '').includes(chk.expectedContains);
    detail = m ? `${chk.field}=${m[chk.field]}` : `mapping ${chk.mappingId} not found`;
  } else if (chk.type === 'includes_all') {
    const arr = getPath(c, chk.path);
    pass = Array.isArray(arr) && chk.expected.every(x => arr.includes(x));
    detail = `path=${chk.path}, actual=${JSON.stringify(arr)}`;
  } else if (chk.type === 'conflict_exists') {
    pass = conflictIds.has(chk.conflictId);
    detail = `conflict=${chk.conflictId}`;
  } else {
    detail = `unknown check type ${chk.type}`;
  }
  if (!pass) fail(`counterexample ${ce.counterexampleId} check failed: ${detail}`);
  record(`ce.${ce.counterexampleId}`, pass, detail);
}

// decision requests
const drs = doc.decisionRequests || [];
record('decisions.count', drs.length >= 10, `count=${drs.length} (>=10)`);
const drIds = new Set();
for (const dr of drs) {
  for (const k of ['id', 'question', 'recommendation', 'owner', 'blocking']) {
    if (!dr[k]) fail(`decision ${dr.id || '?'} missing ${k}`);
  }
  if (drIds.has(dr.id)) fail(`duplicate decision id ${dr.id}`);
  drIds.add(dr.id);
}

// every P0 conflict should have at least one counterexample
for (const cf of conflicts.filter(x => x.severity === 'P0')) {
  if (!ces.some(ce => ce.conflictId === cf.conflictId)) fail(`P0 conflict ${cf.conflictId} has no counterexample`);
}

const out = {
  mappingFile: mappingPath,
  ok: failures.length === 0,
  totals: {
    mappings: mappings.length,
    conflicts: conflicts.length,
    p0: p0,
    counterexamples: ces.length,
    decisions: drs.length,
    checks: checks.length,
    failedChecks: checks.filter(x => !x.pass).length
  },
  failures,
  checks
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ ok: out.ok, totals: out.totals, failures: failures.slice(0, 20), out: outPath }, null, 2));
process.exit(out.ok ? 0 : 1);

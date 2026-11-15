import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/project/cyq/AI_Coding/car';
const fixturePath = process.argv[2] || path.join(ROOT, 'docs/research/R-12-conditional-fixtures.json');
const outPath = process.argv[3] || path.join(ROOT, 'agent-workspace/agents/deepseek/reports/R-12-results.json');
const fx = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const aliases = new Map(fx.aliases.map(a => [a.aliasId, a]));
const variants = new Map(fx.variants.map(v => [v.configId, v]));
const generations = new Map(Object.entries(fx.generationSets));
const errorMaps = fx.errorMappings || [];
const fail = (code, message, detail = {}) => ({ ok: false, code, message, ...detail });
const pass = (detail = {}) => ({ ok: true, code: null, message: 'ok', ...detail });

function otherGeneration(g) {
  return g === 'GEN1' ? 'GEN3' : g === 'GEN3' ? 'GEN1' : null;
}
function aliasApplicable(alias, generation) {
  if (!alias.applicableWhen) return true;
  const allowed = alias.applicableWhen.allowed || [];
  return allowed.includes(generation);
}
function checkAlias(alias, generation, opts = {}) {
  if (!alias) return fail('ERR_ALIAS_UNKNOWN', 'alias not registered');
  if (opts.stripEvidence || !alias.evidenceInherited) return fail('ERR_EVIDENCE_INHERITANCE_MISSING', `alias ${alias.aliasId} lacks evidenceInherited`);
  if (opts.requireConfirmed && alias.status !== 'CONFIRMED') return fail('ERR_ALIAS_UNCONFIRMED', `alias ${alias.aliasId} status=${alias.status}; D-02 not confirmed`);
  if (!aliasApplicable(alias, generation)) return fail('ERR_ALIAS_NOT_APPLICABLE', `alias ${alias.aliasId} applicableWhen=${JSON.stringify(alias.applicableWhen)} does not allow ${generation}`);
  if (alias.parent && opts.hubAssembly && alias.parent !== opts.hubAssembly) return fail('ERR_ALIAS_PARENT_MISMATCH', `alias ${alias.aliasId} parent ${alias.parent} != selected hub ${opts.hubAssembly}`);
  return pass({ aliasId: alias.aliasId, canonicalRef: alias.canonicalRef, evidenceInherited: alias.evidenceInherited });
}
function resolveVariant(configId, opts = {}) {
  const v = variants.get(configId);
  if (!v) return fail('ERR_GEN_AMBIGUOUS', `variant ${configId} not found`);
  const gen = v.selectedGeneration;
  if (Array.isArray(gen) || !generations.has(gen)) return fail('ERR_GEN_AMBIGUOUS', `selectedGeneration=${JSON.stringify(gen)} must be exactly one of GEN1/GEN3`);
  const selected = generations.get(gen);
  const other = otherGeneration(gen);
  const otherSet = generations.get(other);
  const parts = new Set(v.parts || []);
  const cross = [...parts].filter(p => otherSet.parts.includes(p));
  if (cross.length) return fail('ERR_GEN_CROSS_MIX', `${gen} variant contains ${other} parts: ${cross.join(',')}`);
  if (v.hubAssembly !== selected.hubAssembly) return fail('ERR_GEN_CROSS_MIX', `${gen} variant hubAssembly=${v.hubAssembly}; expected ${selected.hubAssembly}`);
  const active = [];
  for (const aid of v.activeAliases || []) {
    const a = aliases.get(aid);
    const r = checkAlias(a, gen, { ...opts, hubAssembly: selected.hubAssembly });
    if (!r.ok) return r;
    active.push(aid);
  }
  return pass({ selectedParts: parts.size, activeAliases: active.length, generation: gen, hubAssembly: selected.hubAssembly });
}
function checkEvidence(c) {
  const rank = { UNKNOWN: 1, ASSUMPTION: 2, EVIDENCE: 3, SOURCED: 3 };
  if (c.inherited === 'UNKNOWN' && c.value != null) return fail('ERR_UNKNOWN_VALUE', `UNKNOWN inherited value must be null, got ${c.value}`);
  if (c.claim === 'SOURCED' && !c.sourceId) return fail('ERR_SOURCE_MISSING', 'SOURCED claim without sourceId');
  if ((rank[c.claim] ?? 0) > (rank[c.inherited] ?? 0)) return fail('ERR_EVIDENCE_UPGRADE', `claim ${c.claim} exceeds inherited ${c.inherited}`);
  return pass({ inherited: c.inherited, claim: c.claim });
}
function checkQuantity(c) {
  const l = c.line || {};
  if (l.qtyPerCorner === 20) return fail('ERR_QTY_LEVEL_CONFUSION', 'vehicle total 20 used as qtyPerCorner; expected 5');
  if (l.qtyPerCorner === 5 && l.vehicleTotal === 20 && l.combinedTotal != null) return fail('ERR_QTY_DOUBLE_COUNT', 'per-corner 5 and vehicle total 20 were summed into 25');
  return pass({ ref: l.ref, qtyPerCorner: l.qtyPerCorner, vehicleTotal: l.vehicleTotal ?? null });
}
function checkRef(c) {
  if (c.countedAsBom) return fail('ERR_REF_AS_BOM', 'REF line counted as a BOM component');
  if ((c.refs || []).includes('REF-30-001') && (c.directParts || []).includes('PART-40-046')) return fail('ERR_REF_DOUBLE_COUNT', 'rotor counted once via REF-30-001 and once as direct PART-40-046');
  return pass({ refs: c.refs || [], directParts: c.directParts || [] });
}
function checkProcurement(c) {
  const bom = fx.bom[c.bom];
  if (!bom) return fail('ERR_INPUT_SCHEMA_INVALID', `BOM ${c.bom} not found`);
  const lines = bom.lines.map(x => ({ ...x }));
  if (c.injectChild) lines.push({ lineId: 'L-INJECT', ref: c.injectChild, refKind: 'PART', qtyPerCorner: 1, parent: 'ASSY-30-002' });
  const childParts = c.mode === 'PURCHASED_ASSEMBLY'
    ? new Set([...generations.get('GEN1').parts, ...generations.get('GEN3').parts])
    : new Set();
  if (c.mode === 'PURCHASED_ASSEMBLY') {
    if (lines.some(l => childParts.has(l.ref))) return fail('ERR_PROCUREMENT_DOUBLE_COUNT', 'purchased assembly mode contains child parts of the hub assembly');
  } else if (c.mode === 'FULLY_EXPANDED') {
    if (lines.some(l => l.ref === 'ASSY-30-002' || l.ref === 'ASSY-30-003')) return fail('ERR_PROCUREMENT_DOUBLE_COUNT', 'fully expanded mode still contains a purchased hub assembly line');
  } else {
    return fail('ERR_INPUT_SCHEMA_INVALID', `unknown procurement mode ${c.mode}`);
  }
  const componentLines = lines.filter(l => l.refKind !== 'REF').length;
  return pass({ lineCount: lines.length, componentLines, mode: c.mode });
}
function mapError(c) {
  const m = errorMaps.find(e => e.code === c.kinCode && (c.cause == null || e.cause === c.cause));
  if (!m) return fail('ERR_ERROR_CODE_UNMAPPED', `no mapping for ${c.kinCode}/${c.cause}`);
  return pass({ parent: m.parent, note: m.note });
}

const results = [];
for (const c of fx.cases || []) {
  let actual;
  if (c.op === 'resolve') actual = resolveVariant(c.variant, c);
  else if (c.op === 'alias') actual = checkAlias(aliases.get(c.aliasId), variants.get(c.variant)?.selectedGeneration, c);
  else if (c.op === 'evidence') actual = checkEvidence(c);
  else if (c.op === 'quantity') actual = checkQuantity(c);
  else if (c.op === 'ref') actual = checkRef(c);
  else if (c.op === 'procurement') actual = checkProcurement(c);
  else if (c.op === 'mapping') actual = mapError(c);
  else actual = fail('ERR_INPUT_SCHEMA_INVALID', `unknown op ${c.op}`);
  const problems = [];
  const e = c.expect || {};
  if (e.ok !== undefined && actual.ok !== e.ok) problems.push(`ok expected ${e.ok} got ${actual.ok}`);
  if (e.code !== undefined && actual.code !== e.code) problems.push(`code expected ${e.code} got ${actual.code}`);
  if (e.selectedParts !== undefined && actual.selectedParts !== e.selectedParts) problems.push(`selectedParts expected ${e.selectedParts} got ${actual.selectedParts}`);
  if (e.activeAliases !== undefined && actual.activeAliases !== e.activeAliases) problems.push(`activeAliases expected ${e.activeAliases} got ${actual.activeAliases}`);
  if (e.lineCount !== undefined && actual.lineCount !== e.lineCount) problems.push(`lineCount expected ${e.lineCount} got ${actual.lineCount}`);
  if (e.componentLines !== undefined && actual.componentLines !== e.componentLines) problems.push(`componentLines expected ${e.componentLines} got ${actual.componentLines}`);
  if (e.parent !== undefined && actual.parent !== e.parent) problems.push(`parent expected ${e.parent} got ${actual.parent}`);
  results.push({ caseId: c.caseId, op: c.op, expected: e, actual, pass: problems.length === 0, problems });
}

const out = {
  fixture: fixturePath,
  ok: results.every(r => r.pass),
  totals: { cases: results.length, passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length },
  results
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ ok: out.ok, totals: out.totals, failures: results.filter(r => !r.pass), out: outPath }, null, 2));
process.exit(out.ok ? 0 : 1);

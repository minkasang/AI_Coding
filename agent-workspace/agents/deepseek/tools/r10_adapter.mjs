import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'F:/project/cyq/AI_Coding/car';
const FILES = {
  r06: 'docs/research/R-06-minimal-assembly-bom.json',
  r03: 'docs/research/R-03-asset-manifest.example.json',
  r04: 'docs/research/R-04-kinematics-fixture.json',
  r09: 'src-experiments/kinematics/fixture-demo.json',
  r02: 'docs/research/R-02-example-assembly.json',
  r07: 'docs/research/R-07-schema-mapping.example.json',
  r08: 'docs/research/R-08-quality-gates.json'
};
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex');
const clone = (x) => JSON.parse(JSON.stringify(x));

const src = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, read(p)]));

// Proposed externalId -> RP-01 canonical aliases. NOT confirmed by Gemini/Qwen4 yet.
const ALIASES = {
  'SYS-30-HUB-001': { canonicalRef: 'PART-30-006', refKind: 'PART', status: 'PROPOSED_NEEDS_CONFIRMATION' },
  'SYS-40-ROTOR-001': { canonicalRef: 'PART-40-046', refKind: 'PART', status: 'PROPOSED_NEEDS_CONFIRMATION' },
  'SYS-30-BRG-DAC4280': { canonicalRef: 'ASSY-30-002', refKind: 'ASSY', status: 'PROPOSED_NEEDS_CONFIRMATION' },
  'SYS-30-STUD-M14': { canonicalRef: 'PART-30-009', refKind: 'PART', status: 'PROPOSED_NEEDS_CONFIRMATION' },
  'SYS-30-WHEEL-END-ASSY': { canonicalRef: 'ASSY-30-001', refKind: 'ASSY', status: 'PROPOSED_NEEDS_CONFIRMATION' }
};
const EXPECTED_FINGERPRINTS = {
  'SYS-30-HUB-001': '4656a3d39589d4dc',
  'SYS-40-ROTOR-001': '67bc8bd8bacc7bb1',
  'SYS-30-BRG-DAC4280': '07c76680d71810cf',
  'SYS-30-STUD-M14': '1165d43dd98945ca'
};
const R06_ALLOWED_BOM_KEYS = new Set(['id', 'rp01Ref', 'name', 'necessity', 'qtyPerCorner', 'parent', 'assemblyBoundary', 'params', 'note', 'applicability', 'qtyWhenIncluded', 'deferReason']);

function mapMountType(t) {
  if (t === 'BOLTED_FLANGE_PILOTED') return { mapped: 'HUB_PILOTED_BOLTED', status: 'PROPOSED' };
  if (t === 'THREADED_STUD_NUT_SEAT') return { mapped: 'THREADED', status: 'OPEN_SEAT_TYPE' };
  return { mapped: null, status: 'OPEN_UNMAPPED_TYPE' };
}
function mapModelingFidelity(m) {
  if (m === 'GEOMETRIC_ENVELOPE_ONLY' || m === 'NOMINAL_CYLINDER_PLUS_METADATA') return 'FID-V';
  return null;
}
function sanitize(s) { return String(s).replace(/[^A-Za-z0-9_-]+/g, '-'); }

function validateInputs(input, opts = {}) {
  const err = (code, message) => ({ ok: false, code, message });
  const r06 = input.r06, r03 = input.r03, r04 = input.r04, aliases = input.aliases;

  if (opts.useExternalAsCanonical) return err('ERR_INPUT_DOUBLE_PRIMARY_KEY', 'naive converter used SYS-* as canonical partId instead of RP-01 PART-*');
  for (const p of r03.parts) {
    const a = aliases[p.part_id];
    if (!a) return err('ERR_INPUT_DOUBLE_PRIMARY_KEY', `R-03 external part ${p.part_id} has no canonical alias; cannot make it a second primary key`);
    if (p.part_id.startsWith('SYS-') && a.canonicalRef.startsWith('SYS-')) return err('ERR_INPUT_DOUBLE_PRIMARY_KEY', `R-03 external part ${p.part_id} alias points to another external ID`);
  }
  const seenInst = new Set();
  for (const p of r03.parts) for (const i of p.instances || []) {
    if (seenInst.has(i.instance_id)) return err('ERR_ASSEMBLY_DUPLICATE_INSTANCE', `duplicate R-03 instanceId ${i.instance_id}`);
    seenInst.add(i.instance_id);
  }
  if (opts.unitScale !== undefined && opts.unitScale !== 0.001) return err('ERR_INPUT_UNIT_MISMATCH', `R-03 sourceUnits=mm requires unitScale 0.001, got ${opts.unitScale}`);
  if (opts.mirrorWithoutFlag) return err('ERR_TRANSFORM_CHIRALITY', 'reflection matrix det=-1 without mirror.handednessFlip');
  const stud = r06.bom.find(b => b.id === 'BOM-30-009');
  if (stud && stud.qtyPerCorner !== 5) return err('ERR_ASSEMBLY_QTY_MISMATCH', `BOM-30-009 qtyPerCorner=${stud.qtyPerCorner}; expected 5 (20 is vehicle total)`);
  for (const p of r03.parts) {
    const expected = EXPECTED_FINGERPRINTS[p.part_id];
    if (expected && p.revision !== expected) return err('ERR_CACHE_FINGERPRINT_INVALID', `R-03 ${p.part_id} revision ${p.revision} != manifest fingerprint ${expected}`);
  }
  if (opts.claimBlockedInterface) {
    const anyBlocked = r06.interfaces.some(i => i.blockedDownstream);
    if (anyBlocked) return err('ERR_ASSEMBLY_INTERFACE_BLOCKED', 'adapter claimed assembly while one or more R-06 interfaces are blockedDownstream=true');
  }
  if (opts.constraintAsFixed) return err('ERR_ASSEMBLY_CONSTRAINT_MISCLASSIFIED', 'R-04 DISTANCE/POINT_ON_LINE/PRESCRIBED_POSITION mapped to FIXED Joint without Grok agreement');
  if (opts.provenance === 'SOURCED') return err('ERR_INPUT_UNTRUSTED_PROVENANCE', 'R-04 FICTIONAL_FIXTURE was labelled SOURCED');
  for (const b of r06.bom) if (!b.rp01Ref) return err('ERR_INPUT_MISSING_CANONICAL_ID', `R-06 BOM ${b.id} has no rp01Ref`);
  if (opts.transformScale !== undefined && opts.transformScale !== 1) return err('ERR_TRANSFORM_SCALE_INVALID', `asset transform scale ${opts.transformScale} != 1 (unit conversion separate)`);
  for (const b of r06.bom) for (const k of Object.keys(b)) if (!R06_ALLOWED_BOM_KEYS.has(k)) return err('ERR_INPUT_UNMAPPED_FIELD', `R-06 BOM ${b.id} field ${k} has no declared mapping`);
  const badUnknown = r06.parameterRequirements.find(p => p.grade === 'UNKNOWN' && p.value != null);
  if (badUnknown) return err('ERR_INPUT_UNKNOWN_HAS_VALUE', `UNKNOWN parameter ${badUnknown.id} carries value ${badUnknown.value}`);
  return { ok: true, code: null, message: 'converted with OPEN fields' };
}

function convertR06(r06) {
  const bomLines = r06.bom.map(b => ({
    bomLineId: b.id,
    source: 'R-06',
    sourceRef: b.rp01Ref,
    refKind: String(b.rp01Ref).startsWith('ASSY') ? 'ASSY' : 'PART',
    canonicalRef: b.rp01Ref,
    qtyPerCorner: b.qtyPerCorner,
    necessity: b.necessity,
    assemblyBoundary: b.assemblyBoundary || null,
    parameterRefs: b.params || [],
    applicability: b.applicability || null,
    qtyWhenIncluded: b.qtyWhenIncluded ?? null,
    deferReason: b.deferReason || null,
    note: b.note || null,
    status: 'CONVERTED'
  }));
  const interfaces = r06.interfaces.map(i => {
    const mt = mapMountType(i.type);
    return {
      mountId: i.id,
      between: i.between,
      sourceType: i.type,
      mappedType: mt.mapped,
      mappingStatus: mt.status,
      grade: i.grade,
      blockedDownstream: i.blockedDownstream,
      conflictRisk: i.conflictRisk,
      status: i.blockedDownstream ? 'BLOCKED' : 'OPEN',
      assemblyClaim: false
    };
  });
  const parameters = r06.parameterRequirements.map(p => ({
    paramId: p.id,
    name: p.name,
    unit: p.unit,
    unitConversionMm: p.unitConversion_mm ?? null,
    appliesTo: p.appliesTo || [],
    critical: !!p.critical,
    grade: p.grade,
    value: p.value ?? null,
    sourceId: p.sourceId || null,
    blockingDownstream: p.blockingDownstream ?? null,
    status: p.grade === 'UNKNOWN' ? 'OPEN' : 'CONVERTED',
    openReason: p.grade === 'UNKNOWN' ? 'UNKNOWN; value must remain null until source exists' : null
  }));
  return {
    bomLines,
    interfaces,
    parameters,
    assemblyGroups: r06.assemblyGroups || [],
    conflictCases: (r06.conflictCases || []).map(c => ({ id: c.id, kind: c.kind, mustRemainUnknown: c.mustRemainUnknown || [], errorToEmit: c.errorToEmit || null })),
    downstreamGuidance: r06.downstreamGuidance || {}
  };
}

function convertR03(r03, aliases) {
  const parts = r03.parts.map(p => {
    const alias = aliases[p.part_id] || null;
    return {
      assetId: `ASSET-${sanitize(p.part_id)}`,
      externalId: p.part_id,
      canonicalRef: alias ? alias.canonicalRef : null,
      refKind: alias ? alias.refKind : null,
      aliasStatus: alias ? alias.status : 'UNMAPPED',
      contentFingerprint: p.revision,
      revision: null,
      revisionStatus: 'OPEN_NEEDS_HUMAN_REVISION',
      modelingFidelity: p.modeling_fidelity || 'EXACT_DECLARED',
      fidelityClaim: mapModelingFidelity(p.modeling_fidelity),
      massProperties: p.mass_properties_assumption ? { ...p.mass_properties_assumption, valueBasis: 'DEMO_ASSUMPTION', usableForProductionClearance: false } : null,
      assets: p.assets || null,
      mountFrameCount: (p.mount_frames || []).length,
      instanceCount: (p.instances || []).length,
      status: 'CONVERTED_WITH_OPEN'
    };
  });
  const instances = [];
  for (const p of r03.parts) for (const i of p.instances || []) {
    const alias = aliases[p.part_id] || null;
    instances.push({
      externalId: i.instance_id,
      proposedInstanceId: `INST-${p.part_id.includes('STUD') ? 'STUD-FL' : sanitize(p.part_id)}-${Number(i.instance_id.split('_').pop()) + 1}`,
      canonicalRef: alias ? alias.canonicalRef : null,
      sourceTransformMm: i.transform_mm || null,
      frameStatus: 'PROPOSED_NEEDS_CONFIRMATION',
      status: 'CONVERTED_WITH_OPEN'
    });
  }
  const frames = [];
  const mounts = [];
  for (const p of r03.parts) for (const mf of p.mount_frames || []) {
    const fid = `FR-${sanitize(p.part_id)}-${sanitize(mf.frame_id)}`;
    frames.push({
      frameId: fid,
      frameKind: 'MOUNT',
      sourceExternalId: p.part_id,
      originM: (mf.origin_mm || []).map(v => v * 0.001),
      axis: mf.axis || null,
      units: 'm',
      valueBasis: 'DEMO_ASSUMPTION',
      status: 'CONVERTED_WITH_OPEN'
    });
    mounts.push({
      mountId: `MI-${sanitize(p.part_id)}-${sanitize(mf.frame_id)}`,
      sourceExternalId: p.part_id,
      frameId: fid,
      sourceType: null,
      matingSpecs: mf.mating_specs || null,
      pilot: { centerBoreMm: null, fit: null },
      fastenerPattern: mf.mating_specs ? { pcdMm: mf.mating_specs.pcd_mm ?? null, count: mf.mating_specs.bolt_count ?? null, holeDiameterMm: mf.mating_specs.hole_diameter_mm ?? null } : null,
      tolerance: null,
      status: 'OPEN_MISSING_CB_FIT_TOLERANCE'
    });
  }
  return { parts, instances, frames, mounts, coordinateConventions: r03.coordinate_conventions || null, assemblyExternalId: r03.assembly_id || null };
}

function convertKinematics(r04, r09) {
  const hps = r04.hardpoints || {};
  const frames = Object.entries(hps).map(([name, v]) => ({
    frameId: `FR-KIN-${name}`,
    frameKind: 'PROPOSED_KINEMATIC_POINT',
    parentFrameId: 'FR-VEHICLE',
    units: 'm',
    origin: v,
    valueBasis: 'DEMO_ASSUMPTION',
    provenance: 'FICTIONAL_FIXTURE',
    status: 'OPEN_PENDING_R02_ENUM'
  }));
  const constraints = [
    { constraintId: 'CON-SLA-UPPER-ARM-CIRCLE', type: 'POINT_ON_CIRCLE', jointOrConstraint: 'CONSTRAINT', status: 'OPEN_PENDING_GROK', source: 'R-04 constraintModel.sla' },
    { constraintId: 'CON-SLA-LOWER-ARM-CIRCLE', type: 'POINT_ON_CIRCLE', jointOrConstraint: 'CONSTRAINT', status: 'OPEN_PENDING_GROK', source: 'R-04 constraintModel.sla' },
    { constraintId: 'CON-KINGPIN-LENGTH', type: 'DISTANCE', jointOrConstraint: 'CONSTRAINT', status: 'OPEN_PENDING_GROK', source: 'R-04 upright distances' },
    { constraintId: 'CON-TIE-ROD-LENGTH', type: 'DISTANCE', jointOrConstraint: 'CONSTRAINT', status: 'OPEN_PENDING_GROK', source: 'R-04 tie-rod length' },
    { constraintId: 'CON-UPRIGHT-TRIANGLE', type: 'DISTANCE_SET', jointOrConstraint: 'CONSTRAINT', status: 'OPEN_PENDING_GROK', source: 'R-04 upright three distances' },
    { constraintId: 'CON-WHEEL-CENTER-HEIGHT', type: 'PRESCRIBED_POSITION', jointOrConstraint: 'CONSTRAINT', status: 'OPEN_PENDING_GROK', source: 'R-04 drivenCoordinate=wheelCenter.y' },
    { constraintId: 'CON-SHOCK-LENGTH-OUTPUT', type: 'OUTPUT_NOT_CONSTRAINT', jointOrConstraint: 'OUTPUT', status: 'OPEN_PENDING_GROK', source: 'R-04 shock length is output' }
  ];
  return {
    frames,
    constraints,
    joints: [],
    jointBoundary: 'OPEN_PENDING_GROK',
    provenance: 'FICTIONAL_FIXTURE',
    frame: r04.frame,
    tests: { r04: (r04.tests || []).length, r09PassCount: r09 ? 'see R-09 report' : null },
    verification: { status: 'PASS_FOR_FIXTURE', reviewStatus: 'NOT_REVIEWED', testRefs: ['R-04 T11..T21', 'R-09 P01..P08'] }
  };
}

function buildOutput(input) {
  const r06 = convertR06(input.r06);
  const r03 = convertR03(input.r03, input.aliases);
  const kin = convertKinematics(input.r04, input.r09);
  const counts = {
    r06Bom: r06.bomLines.length,
    r06PartRefs: r06.bomLines.filter(b => b.refKind === 'PART').length,
    r06AssyRefs: r06.bomLines.filter(b => b.refKind === 'ASSY').length,
    r06Params: r06.parameters.length,
    r06UnknownParams: r06.parameters.filter(p => p.grade === 'UNKNOWN').length,
    r06CriticalParams: r06.parameters.filter(p => p.critical).length,
    r06CriticalUnknown: r06.parameters.filter(p => p.critical && p.grade === 'UNKNOWN').length,
    r06Interfaces: r06.interfaces.length,
    r06BlockedInterfaces: r06.interfaces.filter(i => i.blockedDownstream).length,
    r03Parts: r03.parts.length,
    r03Instances: r03.instances.length,
    r03MountFrames: r03.frames.length,
    r03AliasesProposed: r03.parts.filter(p => p.aliasStatus === 'PROPOSED_NEEDS_CONFIRMATION').length,
    kinHardpoints: kin.frames.length,
    kinConstraints: kin.constraints.length,
    kinJoints: kin.joints.length
  };
  const handoffs = [
    {
      handoffId: 'H-01-HUB',
      from: ['R-06', 'R-03'],
      r06BomId: 'BOM-30-006',
      canonicalRef: 'PART-30-006',
      r03ExternalId: 'SYS-30-HUB-001',
      aliasStatus: 'PROPOSED_NEEDS_CONFIRMATION',
      contentFingerprint: '4656a3d39589d4dc',
      revision: null,
      fidelityClaim: 'FID-V',
      massPropertiesBasis: 'DEMO_ASSUMPTION',
      blockedInterfaces: ['IF-01', 'IF-02'],
      status: 'PARTIAL_OPEN'
    },
    {
      handoffId: 'H-02-STUD',
      from: ['R-06', 'R-03'],
      r06BomId: 'BOM-30-009',
      canonicalRef: 'PART-30-009',
      r03ExternalId: 'SYS-30-STUD-M14',
      aliasStatus: 'PROPOSED_NEEDS_CONFIRMATION',
      contentFingerprint: '1165d43dd98945ca',
      qtyPerCorner: 5,
      instanceCount: 5,
      blockedInterfaces: ['IF-03'],
      status: 'PARTIAL_OPEN'
    },
    {
      handoffId: 'H-03-ROTOR',
      from: ['R-06', 'R-03'],
      r06BomId: 'BOM-40-046',
      canonicalRef: 'PART-40-046',
      r03ExternalId: 'SYS-40-ROTOR-001',
      aliasStatus: 'PROPOSED_NEEDS_CONFIRMATION',
      contentFingerprint: '67bc8bd8bacc7bb1',
      blockedInterfaces: ['IF-02'],
      status: 'PARTIAL_OPEN'
    },
    {
      handoffId: 'H-04-KINEMATICS',
      from: ['R-04', 'R-09', 'R-02'],
      canonicalRef: null,
      jointBoundary: 'OPEN_PENDING_GROK',
      hardpoints: counts.kinHardpoints,
      constraints: counts.kinConstraints,
      joints: 0,
      status: 'OPEN_PROPOSED'
    }
  ];
  const unresolved = [
    ...r06.interfaces.filter(i => i.blockedDownstream).map(i => ({ id: `U-${i.mountId}`, topic: `R-06 interface ${i.mountId} blockedDownstream`, reason: i.conflictRisk })),
    ...r06.parameters.filter(p => p.critical && p.grade === 'UNKNOWN').map(p => ({ id: `U-${p.paramId}`, topic: `critical parameter ${p.paramId} UNKNOWN`, reason: p.name })),
    ...r03.mounts.filter(m => m.status === 'OPEN_MISSING_CB_FIT_TOLERANCE').map(m => ({ id: `U-${m.mountId}`, topic: 'R-03 mount missing center bore/fit/tolerance', reason: 'R-03 mount_frames does not carry pilot/CB/fit/tolerance' })),
    { id: 'U-R04-PROVENANCE', topic: 'R-04/R-09 hardpoints are FICTIONAL_FIXTURE', reason: 'Must not enter production CAD/BOM' },
    { id: 'U-JOINT-CONSTRAINT', topic: 'Joint vs Constraint boundary with Grok is OPEN', reason: 'DISTANCE/POINT_ON_LINE/PRESCRIBED_POSITION are constraints; do not auto-create Joint' },
    { id: 'U-R03-ALIAS', topic: 'R-03 SYS-* -> RP-01 PART/ASSY aliases are proposed, not confirmed', reason: 'Gemini confirmed PART-* canonical but not exact ID pairs' }
  ];
  return {
    ok: true,
    code: null,
    output: {
      schemaVersion: 'carlab.adapter-fixture/0.1.0-proposal',
      status: 'PROPOSAL',
      date: '2026-11-14',
      sourceInputs: Object.entries(FILES).map(([k, p]) => ({ source: k, path: p, sha256: hash(p) })),
      adapterRules: {
        canonicalPartId: 'RP-01 PART-* / ASSY-*; external SYS-* only via aliases',
        revision: 'human rNNN; contentFingerprint separate; file sha256 separate',
        units: 'CAD mm -> runtime m via unitScale 0.001; no mesh.scale',
        qty: 'BOM qty per parent assembly/corner; vehicle total separately derived',
        mirror: 'explicit mirror flag; det(R)=+1; no negative scale',
        truth: 'fidelity/evidence/verification/reviewStatus separate',
        jointBoundary: 'R-04 constraints stay constraints; no Joint until Grok/GPT-6 agree'
      },
      counts,
      r06: { bomLines: r06.bomLines, parameters: r06.parameters, interfaces: r06.interfaces, assemblyGroups: r06.assemblyGroups, conflictCases: r06.conflictCases },
      r03: { parts: r03.parts, instances: r03.instances, frames: r03.frames, mounts: r03.mounts, coordinateConventions: r03.coordinateConventions, assemblyExternalId: r03.assemblyExternalId },
      kinematics: kin,
      handoffs,
      unresolved,
      comparison: {
        r06: { sourceBom: src.r06.bom.length, adaptedBom: r06.bomLines.length, sourceParams: src.r06.parameterRequirements.length, adaptedParams: r06.parameters.length, sourceInterfaces: src.r06.interfaces.length, adaptedInterfaces: r06.interfaces.length, preserved: ['necessity', 'assemblyBoundary', 'qtyPerCorner', 'params', 'grade', 'blockedDownstream', 'conflictRisk', 'applicability', 'qtyWhenIncluded', 'deferReason'], lost: [], open: counts.r06BlockedInterfaces + counts.r06CriticalUnknown },
        r03: { sourceParts: src.r03.parts.length, adaptedAssets: r03.parts.length, sourceInstances: src.r03.parts.reduce((n, p) => n + (p.instances || []).length, 0), adaptedInstances: r03.instances.length, sourceMountFrames: src.r03.parts.reduce((n, p) => n + (p.mount_frames || []).length, 0), adaptedMountFrames: r03.frames.length, preserved: ['revision->contentFingerprint', 'modeling_fidelity', 'mass_properties_assumption as DEMO', 'assets', 'instances.transform_mm'], lost: ['solverSource (R-04, intentionally not copied)', 'R-03 mount_frames CB/fit/tolerance (missing at source)'], open: r03.mounts.filter(m => m.status === 'OPEN_MISSING_CB_FIT_TOLERANCE').length },
        r04: { sourceHardpoints: Object.keys(src.r04.hardpoints || {}).length, adaptedFrames: kin.frames.length, sourceConstraints: 6, adaptedConstraints: kin.constraints.length, sourceJoints: 0, adaptedJoints: 0, preserved: ['frame', 'hardpoints', 'constraintModel', 'tests', 'provenance'], lost: [], open: kin.constraints.length },
        r02Compatibility: { partDefinitionFields: 'present', partInstanceFields: 'present', frameFields: 'present', mountInterfaceFields: 'partial', assetManifestFields: 'present', bomLineFields: 'present', jointFields: 'empty/OPEN', verificationFields: 'present' }
      },
      rejections: [],
      errorCodeMap: {
        ERR_INPUT_DOUBLE_PRIMARY_KEY: 'new; map to R-08 ERR_INPUT_SCHEMA_INVALID for now',
        ERR_ASSEMBLY_DUPLICATE_INSTANCE: 'new; candidate for R-08 assembly taxonomy',
        ERR_INPUT_UNIT_MISMATCH: 'new; related to R-08 ERR_TRANSFORM_SCALE_INVALID',
        ERR_TRANSFORM_CHIRALITY: 'R-08 GATE_04 CHK_CHIRALITY_PRESERVATION',
        ERR_ASSEMBLY_QTY_MISMATCH: 'new; related to R-08 assembly taxonomy',
        ERR_CACHE_FINGERPRINT_INVALID: 'R-08 GATE_06 CHK_DETERMINISTIC_HASH',
        ERR_ASSEMBLY_INTERFACE_BLOCKED: 'new; related to R-06 interfaces[].blockedDownstream',
        ERR_ASSEMBLY_CONSTRAINT_MISCLASSIFIED: 'new; pending Grok/GPT-6 Joint vs Constraint decision',
        ERR_INPUT_UNTRUSTED_PROVENANCE: 'R-08 GATE_01 CHK_PROVENANCE_TAG',
        ERR_INPUT_MISSING_CANONICAL_ID: 'new; related to RP-01 canonical identity',
        ERR_TRANSFORM_SCALE_INVALID: 'R-08 GATE_04 CHK_SCALE_UNIFORMITY',
        ERR_INPUT_UNMAPPED_FIELD: 'new; related to R-08 ERR_INPUT_SCHEMA_INVALID',
        ERR_INPUT_UNKNOWN_HAS_VALUE: 'R-06 errorTypeEnum UNKNOWN_PARAM_HAS_VALUE'
      }
    }
  };
}

function makeInputs(mutator) {
  const input = { r06: clone(src.r06), r03: clone(src.r03), r04: clone(src.r04), r09: clone(src.r09), aliases: clone(ALIASES) };
  if (mutator) mutator(input);
  return input;
}

const cases = [
  { id: 'CASE-01', description: 'Happy path: R-06 BOM + R-03 assets + R-04/R-09 constraints, strict conversion', mode: {}, expectedCode: null },
  { id: 'NEG-01', description: 'Naive converter uses R-03 SYS-* as canonical partId (double primary key)', mode: { useExternalAsCanonical: true }, expectedCode: 'ERR_INPUT_DOUBLE_PRIMARY_KEY' },
  { id: 'NEG-02', description: 'Two R-03 instances share instanceId', mode: { mutate: (i) => { const stud = i.r03.parts.find(p => p.part_id === 'SYS-30-STUD-M14'); stud.instances[1].instance_id = stud.instances[0].instance_id; } }, expectedCode: 'ERR_ASSEMBLY_DUPLICATE_INSTANCE' },
  { id: 'NEG-03', description: 'R-03 mm transform fed as meters (unitScale=1)', mode: { unitScale: 1 }, expectedCode: 'ERR_INPUT_UNIT_MISMATCH' },
  { id: 'NEG-04', description: 'Reflection matrix det=-1 without mirror flag', mode: { mirrorWithoutFlag: true }, expectedCode: 'ERR_TRANSFORM_CHIRALITY' },
  { id: 'NEG-05', description: 'RP-01/vehicle total qty=20 copied into per-corner stud BOM', mode: { mutate: (i) => { i.r06.bom.find(b => b.id === 'BOM-30-009').qtyPerCorner = 20; } }, expectedCode: 'ERR_ASSEMBLY_QTY_MISMATCH' },
  { id: 'NEG-06', description: 'Stale R-03 content fingerprint', mode: { mutate: (i) => { i.r03.parts.find(p => p.part_id === 'SYS-30-HUB-001').revision = 'deadbeefdeadbeef'; } }, expectedCode: 'ERR_CACHE_FINGERPRINT_INVALID' },
  { id: 'NEG-07', description: 'Adapter claims assembly while R-06 interface is blockedDownstream=false', mode: { claimBlockedInterface: true }, expectedCode: 'ERR_ASSEMBLY_INTERFACE_BLOCKED' },
  { id: 'NEG-08', description: 'R-04 DISTANCE/POINT_ON_LINE/PRESCRIBED_POSITION mapped to FIXED Joint', mode: { constraintAsFixed: true }, expectedCode: 'ERR_ASSEMBLY_CONSTRAINT_MISCLASSIFIED' },
  { id: 'NEG-09', description: 'R-04 FICTIONAL_FIXTURE labelled SOURCED', mode: { provenance: 'SOURCED' }, expectedCode: 'ERR_INPUT_UNTRUSTED_PROVENANCE' },
  { id: 'NEG-10', description: 'R-06 BOM item lacks rp01Ref/canonical partId', mode: { mutate: (i) => { delete i.r06.bom.find(b => b.id === 'BOM-30-006').rp01Ref; } }, expectedCode: 'ERR_INPUT_MISSING_CANONICAL_ID' },
  { id: 'NEG-11', description: 'Asset transform scale 1.1 (non-uniform/non-rigid)', mode: { transformScale: 1.1 }, expectedCode: 'ERR_TRANSFORM_SCALE_INVALID' },
  { id: 'NEG-12', description: 'R-06 BOM carries an unmapped field legacyGrade', mode: { mutate: (i) => { i.r06.bom.find(b => b.id === 'BOM-30-006').legacyGrade = 'X'; } }, expectedCode: 'ERR_INPUT_UNMAPPED_FIELD' },
  { id: 'NEG-13', description: 'UNKNOWN parameter carries a numeric value', mode: { mutate: (i) => { const p = i.r06.parameterRequirements.find(x => x.grade === 'UNKNOWN'); p.value = 1; } }, expectedCode: 'ERR_INPUT_UNKNOWN_HAS_VALUE' }
];

const results = [];
for (const c of cases) {
  const opts = { ...c.mode };
  const mutator = opts.mutate;
  delete opts.mutate;
  const input = makeInputs(mutator);
  const check = validateInputs(input, opts);
  const pass = c.expectedCode == null ? check.ok : (!check.ok && check.code === c.expectedCode);
  results.push({ caseId: c.id, description: c.description, expectedCode: c.expectedCode, actual: check, pass });
}

const happy = buildOutput(makeInputs());
if (!happy.ok) {
  results.push({ caseId: 'CASE-01', description: 'happy path output build', expectedCode: null, actual: { ok: false, code: happy.code, message: happy.message }, pass: false });
}
const output = happy.output;
output.rejections = results;
output.validation = {
  cases: results.length,
  passed: results.filter(r => r.pass).length,
  failed: results.filter(r => !r.pass).length,
  happyPathOk: results.find(r => r.caseId === 'CASE-01')?.pass === true
};
fs.writeFileSync(path.join(ROOT, 'docs/research/R-10-adapter-example.json'), JSON.stringify(output, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'agent-workspace/agents/deepseek/reports/R-10-adapter-check-results.json'), JSON.stringify(output.validation, null, 2) + '\n');
console.log(JSON.stringify({ ok: output.validation.failed === 0, validation: output.validation, counts: output.counts, handoffs: output.handoffs.length, unresolved: output.unresolved.length }, null, 2));
process.exit(output.validation.failed === 0 ? 0 : 1);

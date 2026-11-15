/**
 * CARLAB domain-contract-v1: isolated candidate engineering data model.
 * Pure data/commands; no DOM, Three.js, CAD or physics dependency.
 * This is a PROPOSAL, not a frozen production schema.
 */
export const SCHEMA_VERSION = 'carlab.domain-contract/0.1.0-proposal';

const clone = (v) => JSON.parse(JSON.stringify(v));
const isNum3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const RANK = { UNKNOWN: 1, ASSUMPTION: 2, EVIDENCE: 3, SOURCED: 3 };
const JOINT_TYPES = new Set(['FIXED', 'REVOLUTE', 'SPHERICAL', 'PRISMATIC', 'UNIVERSAL', 'CYLINDRICAL', 'GEAR', 'CONTACT', 'SPRING_DAMPER', 'BELT']);
const CONSTRAINT_TYPES = new Set(['DISTANCE', 'POINT_ON_LINE', 'PRESCRIBED_POSITION', 'POINT_ON_CIRCLE', 'OUTPUT', 'SET']);
const ASSET_STATUS = new Set(['EXACT', 'DEMO_SUBSTITUTE', 'PLACEHOLDER']);
const FID = new Set(['FID-V', 'FID-G', 'FID-K', 'FID-D1', 'FID-D2']);

function det3(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
    - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
    + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}
function matMul(a, b) {
  const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return r;
}
function matVec(m, v) {
  return [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];
}
function norm3(v) { return Math.hypot(v[0], v[1], v[2]); }
function uniqueBy(items, key, errors, source) {
  const seen = new Set();
  for (const item of items || []) {
    const id = item?.[key];
    if (!id) { errors.push({ code: 'DOMAIN-E-ID-MISSING', objectId: null, rule: `${source}.${key} required`, source }); continue; }
    if (seen.has(id)) errors.push({ code: 'DOMAIN-E-ID-DUPLICATE', objectId: id, rule: `${source}.${key} unique`, source });
    seen.add(id);
  }
  return seen;
}
function applied(def, generation) {
  if (!def?.applicableWhen) return true;
  if (def.applicableWhen.generation) return def.applicableWhen.generation === generation;
  if (def.applicableWhen['CG-HUB']) return def.applicableWhen['CG-HUB'].includes(generation);
  return true;
}
function frameWorld(frameId, frames, stack = new Set()) {
  const f = frames.get(frameId);
  if (!f) return null;
  if (stack.has(frameId)) return null;
  stack.add(frameId);
  const parent = f.parentFrameId ? frameWorld(f.parentFrameId, frames, stack) : { origin: [0, 0, 0], rot: I3 };
  stack.delete(frameId);
  if (!parent) return null;
  const scale = f.units === 'mm' ? 0.001 : 1;
  const local = f.origin.map((v) => v * scale);
  const rot = f.rotation || I3;
  const rotated = matVec(parent.rot, local);
  return { origin: [parent.origin[0] + rotated[0], parent.origin[1] + rotated[1], parent.origin[2] + rotated[2]], rot: matMul(parent.rot, rot) };
}
function frameRoot(frameId, frames) {
  let cur = frames.get(frameId);
  const seen = new Set();
  while (cur && cur.parentFrameId) {
    if (seen.has(cur.frameId)) return null;
    seen.add(cur.frameId);
    cur = frames.get(cur.parentFrameId);
  }
  return cur?.frameId || null;
}

export function validateProject(project) {
  const errors = [];
  const warnings = [];
  const e = (code, objectId, rule, source, message) => errors.push({ code, objectId, rule, source, message });
  const w = (code, objectId, rule, source, message) => warnings.push({ code, objectId, rule, source, message });

  if (!project || project.schemaVersion !== SCHEMA_VERSION) e('DOMAIN-E-SCHEMA', null, 'schemaVersion', 'project', `expected ${SCHEMA_VERSION}`);
  if (!project?.projectId || !project?.name) e('DOMAIN-E-PROJECT', null, 'projectId/name', 'project', 'project identity required');
  if (!Number.isInteger(project?.revision) || project.revision < 1) e('DOMAIN-E-REVISION', project?.projectId, 'revision>=1', 'project', 'revision must be a positive integer');
  if (!project?.variant?.variantId) e('DOMAIN-E-VARIANT', null, 'variant.variantId', 'project', 'variant required');
  const generation = project?.variant?.generation;
  if (!['GEN1', 'GEN3'].includes(generation)) e('DOMAIN-E-GEN', project?.variant?.variantId, 'generation GEN1|GEN3', 'variant', 'variant generation must be explicitly GEN1 or GEN3');

  uniqueBy(project.systems, 'systemId', errors, 'systems');
  uniqueBy(project.assemblyDefinitions, 'assemblyId', errors, 'assemblyDefinitions');
  uniqueBy(project.assemblies, 'assemblyId', errors, 'assemblies');
  uniqueBy(project.partDefinitions, 'partId', errors, 'partDefinitions');
  uniqueBy(project.partInstances, 'instanceId', errors, 'partInstances');
  uniqueBy(project.frames, 'frameId', errors, 'frames');
  uniqueBy(project.joints, 'jointId', errors, 'joints');
  uniqueBy(project.constraints, 'constraintId', errors, 'constraints');
  uniqueBy(project.references, 'refId', errors, 'references');
  uniqueBy(project.bomLines, 'bomLineId', errors, 'bomLines');
  uniqueBy(project.assets, 'assetId', errors, 'assets');
  uniqueBy(project.sourceEvidence, 'sourceId', errors, 'sourceEvidence');
  uniqueBy(project.simulationRuns, 'runId', errors, 'simulationRuns');

  const systems = new Map((project.systems || []).map((x) => [x.systemId, x]));
  const assemblyDefs = new Map((project.assemblyDefinitions || []).map((x) => [x.assemblyId, x]));
  const assemblies = new Map((project.assemblies || []).map((x) => [x.assemblyId, x]));
  const parts = new Map((project.partDefinitions || []).map((x) => [x.partId, x]));
  const instances = new Map((project.partInstances || []).map((x) => [x.instanceId, x]));
  const frames = new Map((project.frames || []).map((x) => [x.frameId, x]));
  const joints = new Map((project.joints || []).map((x) => [x.jointId, x]));
  const constraints = new Map((project.constraints || []).map((x) => [x.constraintId, x]));
  const assets = new Map((project.assets || []).map((x) => [x.assetId, x]));
  const sources = new Map((project.sourceEvidence || []).map((x) => [x.sourceId, x]));

  // systems/tree
  for (const s of project.systems || []) {
    if (s.parentSystemId && !systems.has(s.parentSystemId)) e('DOMAIN-E-SYSTEM-REF', s.systemId, 'parentSystemId', 'systems', `missing ${s.parentSystemId}`);
  }
  for (const a of project.assemblyDefinitions || []) {
    if (!assemblies.has(a.assemblyId) && !a.definitionOnly) {
      // definitions are allowed without instances; only check kind
    }
  }
  for (const a of project.assemblies || []) {
    if (!a.definitionRef || !assemblyDefs.has(a.definitionRef)) e('DOMAIN-E-ASSEMBLY-DEF', a.assemblyId, 'definitionRef', 'assemblies', `missing ${a.definitionRef}`);
    if (!systems.has(a.systemId)) e('DOMAIN-E-SYSTEM-REF', a.assemblyId, 'systemId', 'assemblies', `missing ${a.systemId}`);
    if (a.parentAssemblyId && !assemblies.has(a.parentAssemblyId)) e('DOMAIN-E-ASSEMBLY-PARENT', a.assemblyId, 'parentAssemblyId', 'assemblies', `missing ${a.parentAssemblyId}`);
    if (!frames.has(a.frameId)) e('DOMAIN-E-FRAME-REF', a.assemblyId, 'frameId', 'assemblies', `missing ${a.frameId}`);
  }
  // assembly parent cycles
  for (const a of project.assemblies || []) {
    let cur = a, seen = new Set();
    while (cur?.parentAssemblyId) {
      if (seen.has(cur.assemblyId)) { e('DOMAIN-E-ASSEMBLY-CYCLE', a.assemblyId, 'parent chain acyclic', 'assemblies', 'cycle'); break; }
      seen.add(cur.assemblyId);
      cur = assemblies.get(cur.parentAssemblyId);
    }
  }

  // part definitions / generation / evidence
  for (const d of project.partDefinitions || []) {
    if (!d.partId?.startsWith('PART-')) e('DOMAIN-E-PART-ID', d.partId, 'PART-*', 'partDefinitions', 'partId prefix');
    if (!d.evidenceInherited) e('DOMAIN-E-EVIDENCE-MISSING', d.partId, 'evidenceInherited', 'partDefinitions', 'evidence inheritance required');
    if (d.claimedEvidence && (RANK[d.claimedEvidence] ?? 0) > (RANK[d.evidenceInherited] ?? 0)) e('DOMAIN-E-EVIDENCE-UPGRADE', d.partId, 'claimedEvidence<=inherited', 'partDefinitions', `${d.evidenceInherited} -> ${d.claimedEvidence}`);
    if (d.claimedEvidence === 'SOURCED' && !(d.sourceEvidenceIds || []).length) e('DOMAIN-E-SOURCE-MISSING', d.partId, 'SOURCED requires source', 'partDefinitions', 'no sourceEvidenceIds');
    if (d.geometryBasis === 'UNKNOWN' && d.geometryValue != null) e('DOMAIN-E-UNKNOWN-VALUE', d.partId, 'UNKNOWN value null', 'partDefinitions', 'UNKNOWN carries value');
    for (const sid of d.sourceEvidenceIds || []) if (!sources.has(sid)) e('DOMAIN-E-SOURCE-REF', d.partId, 'sourceEvidenceIds', 'partDefinitions', `missing ${sid}`);
  }
  // frames
  for (const f of project.frames || []) {
    if (!['m', 'mm'].includes(f.units)) e('DOMAIN-E-FRAME-UNIT', f.frameId, 'units m|mm', 'frames', `bad ${f.units}`);
    if (f.space !== 'CAD_LOCAL' && f.units !== 'm') e('DOMAIN-E-UNIT-MISMATCH', f.frameId, 'vehicle/instance frames m', 'frames', `${f.space} uses ${f.units}`);
    if (!isNum3(f.origin)) e('DOMAIN-E-FRAME-ORIGIN', f.frameId, 'origin[3]', 'frames', 'origin');
    if (!Array.isArray(f.rotation) || f.rotation.length !== 3) e('DOMAIN-E-FRAME-ROTATION', f.frameId, 'rotation 3x3', 'frames', 'rotation');
    else {
      const d = det3(f.rotation);
      if (Math.abs(d - 1) > 1e-6 && Math.abs(d + 1) > 1e-6) e('DOMAIN-E-FRAME-RIGID', f.frameId, 'det=+1', 'frames', `det=${d}`);
      if (Math.abs(d + 1) < 1e-6 && (!f.mirror || f.mirror.handednessFlip !== true)) e('DOMAIN-E-MIRROR', f.frameId, 'explicit mirror', 'frames', 'reflection without mirror');
    }
    if (f.scale != null && f.scale !== 1) e('DOMAIN-E-SCALE', f.frameId, 'scale=1', 'frames', `scale=${f.scale}`);
    if (f.parentFrameId && !frames.has(f.parentFrameId)) e('DOMAIN-E-FRAME-PARENT', f.frameId, 'parentFrameId', 'frames', `missing ${f.parentFrameId}`);
    if (f.parentFrameId) {
      let cur = f, seen = new Set();
      while (cur?.parentFrameId) {
        if (seen.has(cur.frameId)) { e('DOMAIN-E-FRAME-CYCLE', f.frameId, 'parent chain acyclic', 'frames', 'cycle'); break; }
        seen.add(cur.frameId);
        cur = frames.get(cur.parentFrameId);
      }
    }
  }
  // instances
  for (const i of project.partInstances || []) {
    if (!i.instanceId?.startsWith('INST-')) e('DOMAIN-E-INSTANCE-ID', i.instanceId, 'INST-*', 'partInstances', 'instanceId prefix');
    if (!parts.has(i.partId)) e('DOMAIN-E-PART-REF', i.instanceId, 'partId', 'partInstances', `missing ${i.partId}`);
    else if (!applied(parts.get(i.partId), generation)) e('DOMAIN-E-GEN-MIX', i.instanceId, 'applicableWhen', 'partInstances', `${i.partId} not applicable to ${generation}`);
    if (!assemblies.has(i.assemblyId)) e('DOMAIN-E-ASSEMBLY-REF', i.instanceId, 'assemblyId', 'partInstances', `missing ${i.assemblyId}`);
    if (!frames.has(i.frameId)) e('DOMAIN-E-FRAME-REF', i.instanceId, 'frameId', 'partInstances', `missing ${i.frameId}`);
    const f = frames.get(i.frameId);
    if (f && f.units !== 'm') e('DOMAIN-E-UNIT-MISMATCH', i.instanceId, 'instance frame m', 'partInstances', `${f.units}`);
    if (!i.evidenceInherited) e('DOMAIN-E-EVIDENCE-MISSING', i.instanceId, 'evidenceInherited', 'partInstances', 'required');
    if (i.claimedEvidence && (RANK[i.claimedEvidence] ?? 0) > (RANK[i.evidenceInherited] ?? 0)) e('DOMAIN-E-EVIDENCE-UPGRADE', i.instanceId, 'claimedEvidence<=inherited', 'partInstances', `${i.evidenceInherited} -> ${i.claimedEvidence}`);
    if (i.claimedEvidence === 'SOURCED' && !(i.sourceEvidenceIds || []).length) e('DOMAIN-E-SOURCE-MISSING', i.instanceId, 'SOURCED requires source', 'partInstances', 'no sourceEvidenceIds');
    if (i.variantId && i.variantId !== project.variant.variantId) e('DOMAIN-E-VARIANT-REF', i.instanceId, 'variantId', 'partInstances', `${i.variantId} != ${project.variant.variantId}`);
    if (i.quantity && (!Number.isInteger(i.quantity.perAssembly) || i.quantity.perAssembly < 1)) e('DOMAIN-E-QTY', i.instanceId, 'quantity.perAssembly>=1', 'partInstances', 'bad quantity');
  }
  // joints/constraints
  for (const j of project.joints || []) {
    if (!JOINT_TYPES.has(j.type)) e('DOMAIN-E-JOINT-TYPE', j.jointId, 'joint type', 'joints', j.type);
    if (!frames.has(j.frameA) || !frames.has(j.frameB)) e('DOMAIN-E-JOINT-FRAME', j.jointId, 'frameA/frameB', 'joints', 'missing frame');
    if (constraints.has(j.jointId)) e('DOMAIN-E-CONSTRAINT-AS-JOINT', j.jointId, 'constraint must not be joint', 'joints', 'constraint in joints');
    if (['REVOLUTE', 'PRISMATIC', 'CYLINDRICAL', 'UNIVERSAL'].includes(j.type)) {
      if (!isNum3(j.axisA) || Math.abs(norm3(j.axisA) - 1) > 1e-6) e('DOMAIN-E-JOINT-AXIS', j.jointId, 'axisA normalized', 'joints', 'axis');
    }
    if (j.limits != null) {
      const { min, max, unit } = j.limits;
      if (typeof min !== 'number' || typeof max !== 'number' || min > max) e('DOMAIN-E-JOINT-LIMIT', j.jointId, 'limits min<=max', 'joints', 'limits');
      const expected = ['REVOLUTE', 'UNIVERSAL'].includes(j.type) ? 'rad' : ['PRISMATIC', 'CYLINDRICAL'].includes(j.type) ? 'm' : null;
      if (expected && unit !== expected) e('DOMAIN-E-JOINT-LIMIT-UNIT', j.jointId, `limit unit ${expected}`, 'joints', unit);
    }
  }
  for (const c of project.constraints || []) {
    const expectedKind = c.type === 'OUTPUT' ? 'OUTPUT' : 'CONSTRAINT';
    if (c.jointOrConstraint !== expectedKind) e('DOMAIN-E-CONSTRAINT-KIND', c.constraintId, `jointOrConstraint=${expectedKind}`, 'constraints', c.jointOrConstraint);
    if (!CONSTRAINT_TYPES.has(c.type)) e('DOMAIN-E-CONSTRAINT-TYPE', c.constraintId, 'constraint type', 'constraints', c.type);
    if (joints.has(c.constraintId)) e('DOMAIN-E-CONSTRAINT-AS-JOINT', c.constraintId, 'constraint must not be joint', 'constraints', 'constraint id in joints');
  }
  // references / BOM / qty
  const refs = new Map((project.references || []).map((x) => [x.refId, x]));
  for (const r of project.references || []) {
    if (r.bom === true || r.kind === 'BOM') e('DOMAIN-E-REF-AS-BOM', r.refId, 'ref not BOM', 'references', 'ref counted as BOM');
    if (!r.canonicalRef) e('DOMAIN-E-REF-TARGET', r.refId, 'canonicalRef', 'references', 'missing target');
    const canonicalParts = new Set([r.canonicalRef, ...(r.containedPartIds || [])]);
    for (const i of project.partInstances || []) {
      if (i.assemblyId === r.assemblyId && canonicalParts.has(i.partId)) e('DOMAIN-E-REF-DOUBLE-COUNT', r.refId, 'REF and direct part must not coexist', 'references', `${i.partId} in ${r.assemblyId}`);
    }
  }
  const quantityFacts = new Map((project.quantityFacts || []).map((x) => [x.partId, x]));
  for (const b of project.bomLines || []) {
    if (!assemblies.has(b.assemblyId)) e('DOMAIN-E-BOM-ASSEMBLY', b.bomLineId, 'assemblyId', 'bomLines', `missing ${b.assemblyId}`);
    if (!b.partRef && !b.assemblyRef) e('DOMAIN-E-BOM-REF', b.bomLineId, 'partRef|assemblyRef', 'bomLines', 'missing ref');
    if (b.partRef && !parts.has(b.partRef)) e('DOMAIN-E-BOM-PART', b.bomLineId, 'partRef', 'bomLines', `missing ${b.partRef}`);
    if (b.assemblyRef && !assemblyDefs.has(b.assemblyRef)) e('DOMAIN-E-BOM-ASSY', b.bomLineId, 'assemblyRef', 'bomLines', `missing ${b.assemblyRef}`);
    if (!Number.isInteger(b.qtyPerAssembly) || b.qtyPerAssembly < 1) e('DOMAIN-E-BOM-QTY', b.bomLineId, 'qtyPerAssembly>=1', 'bomLines', 'qty');
    if (b.instanceIds) {
      let sum = 0;
      for (const iid of b.instanceIds) {
        const inst = instances.get(iid);
        if (!inst) e('DOMAIN-E-BOM-INSTANCE', b.bomLineId, 'instanceIds', 'bomLines', `missing ${iid}`);
        else sum += inst.quantity?.perAssembly ?? 1;
      }
      if (sum !== b.qtyPerAssembly) e('DOMAIN-E-QTY-MISMATCH', b.bomLineId, 'qty=sum(instance qty)', 'bomLines', `${sum} != ${b.qtyPerAssembly}`);
    }
    const qf = b.partRef ? quantityFacts.get(b.partRef) : null;
    if (qf && qf.qtyPerCorner * qf.cornerCount !== qf.vehicleTotal) e('DOMAIN-E-QTY-FACT', b.partRef, 'qtyPerCorner*cornerCount=vehicleTotal', 'quantityFacts', 'fact inconsistent');
    if (qf && b.qtyPerAssembly !== qf.qtyPerCorner) e('DOMAIN-E-QTY-LEVEL', b.bomLineId, 'BOM qty=per corner', 'bomLines', `${b.qtyPerAssembly} != ${qf.qtyPerCorner}`);
  }
  // assets/sources
  for (const a of project.assets || []) {
    if (!ASSET_STATUS.has(a.mappingStatus)) e('DOMAIN-E-ASSET-STATUS', a.assetId, 'mappingStatus', 'assets', a.mappingStatus);
    if (!parts.has(a.partId)) e('DOMAIN-E-ASSET-PART', a.assetId, 'partId', 'assets', `missing ${a.partId}`);
    if (!['mm', 'm'].includes(a.sourceUnits)) e('DOMAIN-E-ASSET-UNIT', a.assetId, 'sourceUnits', 'assets', a.sourceUnits);
    if (a.mappingStatus === 'PLACEHOLDER' && a.glb != null) e('DOMAIN-E-ASSET-PLACEHOLDER', a.assetId, 'placeholder glb=null', 'assets', 'placeholder has glb');
    if (a.fidelityClaim && !FID.has(a.fidelityClaim)) e('DOMAIN-E-ASSET-FID', a.assetId, 'fidelityClaim', 'assets', a.fidelityClaim);
    if (a.mappingStatus === 'DEMO_SUBSTITUTE' && ['FID-K', 'FID-D1', 'FID-D2'].includes(a.fidelityClaim)) e('DOMAIN-E-ASSET-OVERCLAIM', a.assetId, 'demo cannot claim FID-K+', 'assets', a.fidelityClaim);
  }
  for (const s of project.sourceEvidence || []) {
    if (!s.grade) e('DOMAIN-E-SOURCE-GRADE', s.sourceId, 'grade', 'sourceEvidence', 'grade required');
  }
  // runs / selection
  for (const r of project.simulationRuns || []) {
    if (!Number.isInteger(r.inputRevision) || r.inputRevision < 1) e('DOMAIN-E-RUN-REV', r.runId, 'inputRevision>=1', 'simulationRuns', 'revision');
    if (r.inputRevision !== project.revision) w('DOMAIN-W-STALE-RUN', r.runId, 'inputRevision=project.revision', 'simulationRuns', `STALE: run ${r.inputRevision} vs project ${project.revision}`);
  }
  if (project.selectedId && !instances.has(project.selectedId) && !assemblies.has(project.selectedId)) e('DOMAIN-E-SELECTION', project.selectedId, 'selectedId exists', 'project', 'missing selection');

  return { ok: errors.length === 0, errors, warnings };
}

export class ProjectStore {
  constructor(project) {
    const report = validateProject(project);
    if (!report.ok) throw new Error(`invalid domain project: ${report.errors[0].code} ${report.errors[0].message}`);
    this.project = clone(project);
    this.nextInstance = 1;
  }
  snapshot() { return clone(this.project); }
  validate() { return validateProject(this.project); }
  listTree() {
    return (this.project.systems || []).map((s) => ({
      systemId: s.systemId,
      name: s.name,
      assemblies: (this.project.assemblies || []).filter((a) => a.systemId === s.systemId).map((a) => ({
        assemblyId: a.assemblyId,
        name: a.name,
        definitionRef: a.definitionRef,
        instances: (this.project.partInstances || []).filter((i) => i.assemblyId === a.assemblyId).map((i) => ({ instanceId: i.instanceId, partId: i.partId }))
      }))
    }));
  }
  select(id) {
    if (!this.project.partInstances.some((i) => i.instanceId === id) && !this.project.assemblies.some((a) => a.assemblyId === id)) {
      throw new Error(`selection ${id} not found`);
    }
    this.project.selectedId = id;
    return id;
  }
  _commit(mutator) {
    const next = clone(this.project);
    mutator(next);
    next.revision += 1;
    const report = validateProject(next);
    if (!report.ok) throw new Error(`command rejected: ${report.errors[0].code} ${report.errors[0].message}`);
    this.project = next;
    return this.snapshot();
  }
  addInstance(partId, assemblyId, opts = {}) {
    const def = this.project.partDefinitions.find((p) => p.partId === partId);
    const assembly = this.project.assemblies.find((a) => a.assemblyId === assemblyId);
    if (!def) throw new Error(`unknown part ${partId}`);
    if (!assembly) throw new Error(`unknown assembly ${assemblyId}`);
    let id;
    do { id = `INST-${partId.replace(/^PART-/, '')}-${String(this.nextInstance++).padStart(3, '0')}`; } while (this.project.partInstances.some((i) => i.instanceId === id));
    const frameId = opts.frameId || `FR-${id}`;
    return this._commit((next) => {
      if (!next.frames.some((f) => f.frameId === frameId)) {
        next.frames.push({ frameId, parentFrameId: assembly.frameId, space: 'INSTANCE', units: 'm', origin: [0, 0, 0], rotation: I3, mirror: null, tolerance: { positionM: 0.0005, angleDeg: 0.1 }, source: 'ADD_INSTANCE_DEFAULT' });
      }
      next.partInstances.push({
        instanceId: id,
        partId,
        variantId: next.variant.variantId,
        assemblyId,
        frameId,
        visible: true,
        evidenceInherited: def.evidenceInherited,
        sourceEvidenceIds: clone(def.sourceEvidenceIds || []),
        quantity: { perAssembly: 1 }
      });
      if (!next.selectedId) next.selectedId = id;
    });
  }
  moveInstance(instanceId, assemblyId, frameId) {
    const inst = this.project.partInstances.find((i) => i.instanceId === instanceId);
    if (!inst) throw new Error(`unknown instance ${instanceId}`);
    if (!this.project.assemblies.some((a) => a.assemblyId === assemblyId)) throw new Error(`unknown assembly ${assemblyId}`);
    return this._commit((next) => {
      const target = next.partInstances.find((i) => i.instanceId === instanceId);
      target.assemblyId = assemblyId;
      if (frameId) {
        if (!next.frames.some((f) => f.frameId === frameId)) throw new Error(`unknown frame ${frameId}`);
        target.frameId = frameId;
      }
    });
  }
  setJoint(joint) {
    return this._commit((next) => {
      const idx = next.joints.findIndex((j) => j.jointId === joint.jointId);
      if (idx >= 0) next.joints[idx] = clone(joint); else next.joints.push(clone(joint));
    });
  }
  setConstraint(constraint) {
    return this._commit((next) => {
      const idx = next.constraints.findIndex((c) => c.constraintId === constraint.constraintId);
      if (idx >= 0) next.constraints[idx] = clone(constraint); else next.constraints.push(clone(constraint));
    });
  }
  selectVariant(variant) {
    return this._commit((next) => { next.variant = clone(variant); });
  }
  serialize() {
    const report = validateProject(this.project);
    if (!report.ok) throw new Error('cannot serialize invalid project');
    return JSON.stringify(this.project, null, 2) + '\n';
  }
  static restore(json) {
    return new ProjectStore(JSON.parse(json));
  }
  familyMembers(familyRef) {
    return (this.project.partDefinitions || []).filter((p) => p.familyRef === familyRef).map((p) => p.partId);
  }
  getRunStatus(runId) {
    const run = this.project.simulationRuns.find((r) => r.runId === runId);
    if (!run) throw new Error(`unknown run ${runId}`);
    return run.inputRevision === this.project.revision
      ? { runId, status: 'CURRENT', inputRevision: run.inputRevision, projectRevision: this.project.revision }
      : { runId, status: 'STALE', inputRevision: run.inputRevision, projectRevision: this.project.revision, reason: 'project inputs changed after this run' };
  }
  toDisplayTransform(instanceId) {
    const inst = this.project.partInstances.find((i) => i.instanceId === instanceId);
    if (!inst) throw new Error(`unknown instance ${instanceId}`);
    const f = this.project.frames.find((x) => x.frameId === inst.frameId);
    if (!f) throw new Error(`missing frame ${inst.frameId}`);
    if (f.units !== 'm') throw new Error(`display transform requires m, got ${f.units}`);
    const frames = new Map(this.project.frames.map((x) => [x.frameId, x]));
    const w = frameWorld(f.frameId, frames);
    if (!w) throw new Error('frame chain missing/cycle');
    if (Math.abs(det3(w.rot) - 1) > 1e-6) throw new Error('display transform must be proper rotation');
    return {
      instanceId,
      partId: inst.partId,
      assemblyId: inst.assemblyId,
      units: 'm',
      up: 'Y',
      matrixWorld: [
        [w.rot[0][0], w.rot[0][1], w.rot[0][2], w.origin[0]],
        [w.rot[1][0], w.rot[1][1], w.rot[1][2], w.origin[1]],
        [w.rot[2][0], w.rot[2][1], w.rot[2][2], w.origin[2]],
        [0, 0, 0, 1]
      ]
    };
  }
  snapshotForRender() {
    return this.project.partInstances.filter((i) => i.visible !== false).map((i) => this.toDisplayTransform(i.instanceId));
  }
  markRun(run) {
    return this._commit((next) => {
      const idx = next.simulationRuns.findIndex((r) => r.runId === run.runId);
      if (idx >= 0) next.simulationRuns[idx] = clone(run); else next.simulationRuns.push(clone(run));
    });
  }
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'F:/project/cyq/AI_Coding/car';
const docPath = process.argv[2] || path.join(ROOT, 'docs/research/R-02-example-assembly.json');

const PRIMARY = {
  frames: 'frameId', partFamilies: 'familyId', partDefinitions: 'partId', partVariants: 'variantId',
  partRevisions: 'revisionId', partInstances: 'instanceId', assemblyDefinitions: 'assemblyId',
  assemblyInstances: 'assemblyInstanceId', bomLines: 'bomLineId', mountInterfaces: 'mountId',
  joints: 'jointId', materials: 'materialId', assets: 'assetId', vehicleVariants: 'vehicleVariantId',
  sources: 'id'
};

const UNITS = new Set(['m', 'mm', 'count', '1', 'mm^2', 'mm^3', 'kg', 'kg/m^3', 'N', 'N*m', 'Pa', 'W', 'K', 'rad', 'deg', 'J/(kg*K)', 'm/s', 'm/s^2', 'A', 'V']);
const VALUE_BASIS = new Set(['EVIDENCE', 'LOCAL_MEASUREMENT', 'SOURCED', 'DERIVED', 'ENGINEERING_DERIVATION', 'DEMO_ASSUMPTION', 'ASSUMPTION', 'OPEN', 'DEFERRED', 'NOT_APPLICABLE']);
const EVIDENCE = new Set(['EVIDENCE', 'ENGINEERING_DERIVATION', 'ASSUMPTION', 'OPEN']);
const VERIFY = new Set(['UNTESTED', 'PASS', 'FAIL', 'BLOCKED']);
const REVIEW = new Set(['NOT_REVIEWED', 'PENDING', 'APPROVED', 'REJECTED']);
const FIDELITY = new Set(['FID-V', 'FID-G', 'FID-K', 'FID-D1', 'FID-D2']);
const JOINT_TYPES = new Set(['FIXED', 'REVOLUTE', 'SPHERICAL', 'PRISMATIC', 'UNIVERSAL', 'CYLINDRICAL', 'GEAR', 'CONTACT', 'SPRING_DAMPER', 'BELT']);
const MOUNT_TYPES = new Set(['BOLTED_CLAMPED', 'HUB_PILOTED_BOLTED', 'PRESS_FIT_SPLINE', 'CLAMPED', 'THREADED', 'ADHESIVE']);

const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

function clone(x) { return JSON.parse(JSON.stringify(x)); }
function getPath(obj, p) {
  const parts = String(p).split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = /^\d+$/.test(part) ? cur[Number(part)] : cur[part];
  }
  return cur;
}
function setPath(obj, p, value) {
  const parts = String(p).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (/^\d+$/.test(part)) cur = cur[Number(part)];
    else {
      if (cur[part] == null || typeof cur[part] !== 'object') cur[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cur = cur[part];
    }
  }
  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last)) cur[Number(last)] = value;
  else cur[last] = value;
}
function applyPatch(doc, patch) {
  for (const op of patch || []) {
    if (op.op !== 'set') throw new Error(`unsupported patch op ${op.op}`);
    const arr = doc.entities?.[op.entity];
    if (!Array.isArray(arr)) throw new Error(`unknown entity ${op.entity}`);
    const key = PRIMARY[op.entity];
    const item = arr.find(x => x[key] === op.id);
    if (!item) throw new Error(`entity ${op.entity}/${op.id} not found`);
    setPath(item, op.path, clone(op.value));
  }
}
function matMul(a, b) {
  const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return r;
}
function matVec(m, v) {
  return [m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2], m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2], m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]];
}
function det3(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}
function quatToMat(q) {
  const [x, y, z, w] = q;
  const n = Math.hypot(x, y, z, w);
  const X = x / n, Y = y / n, Z = z / n, W = w / n;
  return [
    [1 - 2 * (Y * Y + Z * Z), 2 * (X * Y - Z * W), 2 * (X * Z + Y * W)],
    [2 * (X * Y + Z * W), 1 - 2 * (X * X + Z * Z), 2 * (Y * Z - X * W)],
    [2 * (X * Z - Y * W), 2 * (Y * Z + X * W), 1 - 2 * (X * X + Y * Y)]
  ];
}
function rotationMatrix(rot) {
  if (!rot) return null;
  if (rot.type === 'matrix') return rot.value;
  if (rot.type === 'quaternion') return quatToMat(rot.value);
  return null;
}
function length3(v) { return Math.hypot(v[0], v[1], v[2]); }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

function buildIndex(doc) {
  const E = doc.entities || {};
  const idx = {};
  for (const name of Object.keys(PRIMARY)) {
    const arr = Array.isArray(E[name]) ? E[name] : [];
    const key = PRIMARY[name];
    const m = new Map();
    for (const x of arr) if (x && x[key] != null) m.set(x[key], x);
    idx[name] = m;
  }
  return idx;
}
function worldTransform(frameId, idx, stack = new Set()) {
  const f = idx.frames.get(frameId);
  if (!f) return null;
  if (stack.has(frameId)) return null;
  stack.add(frameId);
  const parent = f.parentFrameId ? worldTransform(f.parentFrameId, idx, stack) : { origin: [0, 0, 0], rot: I3 };
  stack.delete(frameId);
  if (!parent) return null;
  const scale = f.units === 'mm' ? 0.001 : 1;
  const rot = rotationMatrix(f.rotation) || I3;
  const local = [f.origin[0] * scale, f.origin[1] * scale, f.origin[2] * scale];
  const rotated = matVec(parent.rot, local);
  return { origin: [parent.origin[0] + rotated[0], parent.origin[1] + rotated[1], parent.origin[2] + rotated[2]], rot: matMul(parent.rot, rot) };
}
function rootFrame(frameId, idx) {
  let cur = idx.frames.get(frameId);
  const seen = new Set();
  while (cur && cur.parentFrameId) {
    if (seen.has(cur.frameId)) return null;
    seen.add(cur.frameId);
    cur = idx.frames.get(cur.parentFrameId);
  }
  return cur ? cur.frameId : null;
}
function param(variant, name) {
  const p = variant?.parameters?.[name];
  return p && p.value != null ? p.value : null;
}
function paperTrail(entity) {
  if (!entity) return;
  if (entity.valueBasis && !VALUE_BASIS.has(entity.valueBasis)) entity.__badBasis = true;
}

function validateDocument(doc) {
  const errors = [];
  const warnings = [];
  const err = (code, message, ref) => errors.push({ code, message, ref });
  const warn = (code, message, ref) => warnings.push({ code, message, ref });
  const E = doc.entities || {};
  const idx = buildIndex(doc);
  const A = (name) => Array.isArray(E[name]) ? E[name] : [];

  if (!doc.schemaVersion) err('DC-E001', 'missing schemaVersion', 'document');
  if (!doc.unitPolicy) err('DC-E001', 'missing unitPolicy', 'document');
  if (!doc.coordinatePolicy) err('DC-E001', 'missing coordinatePolicy', 'document');
  if (!doc.idPolicy) err('DC-E001', 'missing idPolicy', 'document');

  // duplicate IDs
  for (const name of Object.keys(PRIMARY)) {
    const key = PRIMARY[name];
    const seen = new Set();
    for (const x of A(name)) {
      const id = x?.[key];
      if (id == null || id === '') { err('DC-E001', `${name} missing ${key}`, name); continue; }
      if (seen.has(id)) err(name === 'partInstances' ? 'DC-E004' : 'DC-E002', `duplicate ${key} ${id}`, id);
      seen.add(id);
    }
  }
  // canonical part/assembly identity collision
  const rp01Seen = new Map();
  for (const n of [...A('partDefinitions'), ...A('assemblyDefinitions')]) {
    const rid = n.rp01Id || n.partId || n.assemblyId;
    if (!rid) continue;
    if (rp01Seen.has(rid)) err('DC-E009', `canonical RP-01 identity ${rid} defined twice (${rp01Seen.get(rid)} and ${n.kind})`, rid);
    rp01Seen.set(rid, n.kind);
  }

  // frames
  for (const f of A('frames')) {
    const ref = f.frameId;
    for (const k of ['frameId', 'frameKind', 'units', 'origin', 'rotation', 'handedness', 'tolerance']) if (f[k] == null) err('DC-E001', `frame ${ref} missing ${k}`, ref);
    if (f.units && !['m', 'mm'].includes(f.units)) err('DC-E021', `frame ${ref} unknown units ${f.units}`, ref);
    if (f.units) {
      if (f.frameKind === 'PART_LOCAL' && f.units !== 'mm') err('DC-E022', `part-local frame ${ref} must be mm`, ref);
      if (f.frameKind !== 'PART_LOCAL' && f.units !== 'm') err('DC-E022', `non-part-local frame ${ref} must be m`, ref);
    }
    if (!Array.isArray(f.origin) || f.origin.length !== 3) err('DC-E001', `frame ${ref} origin must be [x,y,z]`, ref);
    const rm = rotationMatrix(f.rotation);
    if (!rm) err('DC-E001', `frame ${ref} rotation unsupported`, ref);
    else {
      const d = det3(rm);
      if (Math.abs(d - 1) > 1e-6 && Math.abs(d + 1) > 1e-6) err('DC-E024', `frame ${ref} rotation is not rigid (det=${d.toFixed(4)})`, ref);
      if (Math.abs(d + 1) < 1e-6) {
        if (!f.mirror || f.mirror.handednessFlip !== true) err('DC-E024', `frame ${ref} is a reflection without explicit mirror rule`, ref);
        if (f.mirror && !f.mirror.mirrorOfFrameId) err('DC-E024', `frame ${ref} mirror lacks mirrorOfFrameId`, ref);
      }
    }
    if (f.tolerance?.positionM != null && f.tolerance.positionM < 0) err('DC-E027', `frame ${ref} negative position tolerance`, ref);
    if (f.tolerance?.angleDeg != null && f.tolerance.angleDeg < 0) err('DC-E027', `frame ${ref} negative angle tolerance`, ref);
    if (f.frameKind === 'WORLD' && f.parentFrameId != null) err('DC-E025', `world frame ${ref} must have null parent`, ref);
    if (f.frameKind !== 'WORLD' && f.frameKind !== 'PART_LOCAL' && !f.parentFrameId) err('DC-E025', `frame ${ref} missing parent`, ref);
    if (f.parentFrameId && !idx.frames.has(f.parentFrameId)) err('DC-E025', `frame ${ref} parent ${f.parentFrameId} missing`, ref);
    if (f.sourceFrameId) {
      const src = idx.frames.get(f.sourceFrameId);
      if (!src) err('DC-E020', `frame ${ref} sourceFrameId missing`, ref);
      else {
        if (src.frameKind !== 'PART_LOCAL') err('DC-E020', `frame ${ref} sourceFrameId is not PART_LOCAL`, ref);
        if (src.units === 'mm' && f.units === 'm' && f.unitScale !== 0.001) err('DC-E022', `frame ${ref} mm→m needs unitScale 0.001`, ref);
        if (src.units === f.units && f.unitScale != null && f.unitScale !== 1) err('DC-E022', `frame ${ref} same-unit scale must be 1`, ref);
      }
    }
    if (f.globalScale != null) err('DC-E026', `frame ${ref} uses globalScale`, ref);
    // cycle check
    let cur = f, seen = new Set();
    while (cur && cur.parentFrameId) {
      if (seen.has(cur.frameId)) { err('DC-E025', `frame parent cycle at ${ref}`, ref); break; }
      seen.add(cur.frameId);
      cur = idx.frames.get(cur.parentFrameId);
    }
  }

  // part definitions
  for (const d of A('partDefinitions')) {
    const ref = d.partId;
    for (const k of ['partId', 'kind', 'name', 'partClass', 'geometryBasis', 'variants', 'localFrameId']) if (d[k] == null) err('DC-E001', `part ${ref} missing ${k}`, ref);
    if (!d.partId) err('DC-E001', 'partDefinition has empty partId', ref);
    if (d.familyRef && !idx.partFamilies.has(d.familyRef)) err('DC-E006', `part ${ref} familyRef ${d.familyRef} is not a family`, ref);
    if (d.materialRef && !idx.materials.has(d.materialRef)) err('DC-E003', `part ${ref} materialRef ${d.materialRef} missing`, ref);
    if (!Array.isArray(d.variants) || d.variants.length === 0) err('DC-E001', `part ${ref} has no variants`, ref);
    for (const vid of d.variants || []) {
      const v = idx.partVariants.get(vid);
      if (!v) err('DC-E003', `part ${ref} variant ${vid} missing`, ref);
      else if (v.partId !== d.partId) err('DC-E009', `variant ${vid} points to ${v.partId}, not ${d.partId}`, vid);
    }
    const lf = idx.frames.get(d.localFrameId);
    if (!lf) err('DC-E020', `part ${ref} localFrameId missing`, ref);
    else if (lf.frameKind !== 'PART_LOCAL') err('DC-E020', `part ${ref} localFrameId is not PART_LOCAL`, ref);
    for (const mid of d.mounts || []) if (!idx.mountInterfaces.has(mid)) err('DC-E003', `part ${ref} mount ${mid} missing`, ref);
    for (const jid of d.joints || []) if (!idx.joints.has(jid)) err('DC-E003', `part ${ref} joint ${jid} missing`, ref);
    for (const aid of d.assets || []) if (!idx.assets.has(aid)) err('DC-E003', `part ${ref} asset ${aid} missing`, ref);
    paperTrail(d);
  }

  // part variants
  for (const v of A('partVariants')) {
    const ref = v.variantId;
    for (const k of ['variantId', 'partId', 'revision', 'parameters']) if (v[k] == null) err('DC-E001', `variant ${ref} missing ${k}`, ref);
    if (!idx.partDefinitions.has(v.partId)) err('DC-E003', `variant ${ref} partId ${v.partId} missing`, ref);
    const rev = idx.partRevisions.get(`${v.partId}@${v.revision}`);
    if (!rev) err('DC-E003', `variant ${ref} revision ${v.partId}@${v.revision} missing`, ref);
    for (const [name, p] of Object.entries(v.parameters || {})) {
      if (!p || typeof p !== 'object') { err('DC-E001', `variant ${ref} parameter ${name} malformed`, ref); continue; }
      if (p.valueBasis && !VALUE_BASIS.has(p.valueBasis)) err('DC-E060', `variant ${ref} parameter ${name} bad valueBasis ${p.valueBasis}`, ref);
      if (p.unit != null && !UNITS.has(p.unit)) err('DC-E021', `variant ${ref} parameter ${name} unknown unit ${p.unit}`, ref);
      if (p.value == null) {
        if (!['OPEN', 'DEFERRED', 'NOT_APPLICABLE'].includes(p.valueBasis)) err('DC-E062', `variant ${ref} parameter ${name} null must be OPEN/DEFERRED/NOT_APPLICABLE`, ref);
      } else {
        if (typeof p.value === 'number' && !p.unit) err('DC-E063', `variant ${ref} parameter ${name} numeric without unit`, ref);
        if (p.valueBasis === 'OPEN') err('DC-E062', `variant ${ref} parameter ${name} OPEN must be null`, ref);
        if (p.valueBasis === 'SOURCED' && (!Array.isArray(p.sources) || p.sources.length === 0)) err('DC-E061', `variant ${ref} parameter ${name} SOURCED without source`, ref);
      }
    }
  }

  // revisions
  for (const r of A('partRevisions')) {
    const ref = r.revisionId;
    for (const k of ['revisionId', 'partId', 'variantId', 'revision', 'status', 'verification']) if (r[k] == null) err('DC-E001', `revision ${ref} missing ${k}`, ref);
    if (r.revisionId !== `${r.partId}@${r.revision}`) err('DC-E007', `revision ${ref} id does not match partId@revision`, ref);
    if (!idx.partDefinitions.has(r.partId)) err('DC-E003', `revision ${ref} partId missing`, ref);
    if (!idx.partVariants.has(r.variantId)) err('DC-E003', `revision ${ref} variantId missing`, ref);
    if (r.verification) {
      if (!VERIFY.has(r.verification.status)) err('DC-E001', `revision ${ref} bad verification status`, ref);
      if (!REVIEW.has(r.verification.reviewStatus)) err('DC-E001', `revision ${ref} bad review status`, ref);
      if (r.verification.status === 'PASS' && (!Array.isArray(r.verification.testRefs) || r.verification.testRefs.length === 0)) err('DC-E064', `revision ${ref} PASS without testRefs`, ref);
    }
    if (r.fidelityClaim && !FIDELITY.has(r.fidelityClaim)) err('DC-E001', `revision ${ref} bad fidelityClaim`, ref);
  }

  // assembly definitions
  for (const a of A('assemblyDefinitions')) {
    const ref = a.assemblyId;
    for (const k of ['assemblyId', 'kind', 'name', 'revision', 'bomLineIds']) if (a[k] == null) err('DC-E001', `assembly ${ref} missing ${k}`, ref);
    for (const bid of a.bomLineIds || []) {
      const b = idx.bomLines.get(bid);
      if (!b) err('DC-E003', `assembly ${ref} BOM ${bid} missing`, ref);
      else if (b.assemblyDefId !== ref) err('DC-E009', `BOM ${bid} belongs to ${b.assemblyDefId}, not ${ref}`, bid);
    }
  }

  // assembly instances
  for (const a of A('assemblyInstances')) {
    const ref = a.assemblyInstanceId;
    for (const k of ['assemblyInstanceId', 'assemblyRef', 'frameId']) if (a[k] == null) err('DC-E001', `assemblyInstance ${ref} missing ${k}`, ref);
    const ar = a.assemblyRef || '';
    const [aid, rev] = ar.split('@');
    if (!idx.assemblyDefinitions.has(aid)) err('DC-E003', `assemblyInstance ${ref} assemblyRef ${ar} missing`, ref);
    else if (idx.assemblyDefinitions.get(aid).revision !== rev) err('DC-E003', `assemblyInstance ${ref} revision ${rev} missing`, ref);
    const f = idx.frames.get(a.frameId);
    if (!f) err('DC-E020', `assemblyInstance ${ref} frame missing`, ref);
    else if (!['ASSEMBLY', 'WORLD'].includes(f.frameKind)) err('DC-E020', `assemblyInstance ${ref} frame kind ${f.frameKind}`, ref);
    if (a.parentAssemblyInstanceId && !idx.assemblyInstances.has(a.parentAssemblyInstanceId)) err('DC-E003', `assemblyInstance ${ref} parent missing`, ref);
    if (a.refId) {
      const hasRef = A('bomLines').some(b => b.refId === a.refId);
      if (!hasRef) err('DC-E003', `assemblyInstance ${ref} refId ${a.refId} not in BOM`, ref);
    }
  }

  // part instances
  for (const p of A('partInstances')) {
    const ref = p.instanceId;
    for (const k of ['instanceId', 'partRef', 'variantId', 'assemblyInstanceId', 'frameId']) if (p[k] == null) err('DC-E001', `partInstance ${ref} missing ${k}`, ref);
    const pr = p.partRef || '';
    const [pid, rev] = pr.split('@');
    if (!pid || !rev) err('DC-E003', `partInstance ${ref} partRef malformed ${pr}`, ref);
    else {
      const revision = idx.partRevisions.get(pr);
      if (!revision) err('DC-E003', `partInstance ${ref} partRef ${pr} does not resolve`, ref);
      else if (revision.variantId !== p.variantId) err('DC-E007', `partInstance ${ref} variant ${p.variantId} != revision ${revision.variantId}`, ref);
    }
    if (!idx.partVariants.has(p.variantId)) err('DC-E003', `partInstance ${ref} variant missing`, ref);
    if (!idx.assemblyInstances.has(p.assemblyInstanceId)) err('DC-E003', `partInstance ${ref} assemblyInstance missing`, ref);
    const f = idx.frames.get(p.frameId);
    if (!f) err('DC-E020', `partInstance ${ref} frame missing`, ref);
    else {
      if (f.frameKind !== 'INSTANCE') err('DC-E020', `partInstance ${ref} frame is not INSTANCE`, ref);
      if (f.units !== 'm') err('DC-E022', `partInstance ${ref} frame units must be m`, ref);
      if (f.instanceId && f.instanceId !== ref) err('DC-E020', `partInstance ${ref} frame belongs to ${f.instanceId}`, ref);
    }
    for (const mid of p.mountInterfaceIds || []) if (!idx.mountInterfaces.has(mid)) err('DC-E003', `partInstance ${ref} mount ${mid} missing`, ref);
    for (const jid of p.jointIds || []) if (!idx.joints.has(jid)) err('DC-E003', `partInstance ${ref} joint ${jid} missing`, ref);
    if (p.refId) {
      const hasRef = A('bomLines').some(b => b.refId === p.refId);
      if (!hasRef) err('DC-E003', `partInstance ${ref} refId ${p.refId} not in BOM`, ref);
    }
  }

  // BOM lines
  for (const b of A('bomLines')) {
    const ref = b.bomLineId;
    for (const k of ['bomLineId', 'assemblyDefId', 'qty']) if (b[k] == null) err('DC-E001', `BOM ${ref} missing ${k}`, ref);
    if (!idx.assemblyDefinitions.has(b.assemblyDefId)) err('DC-E003', `BOM ${ref} assemblyDef ${b.assemblyDefId} missing`, ref);
    if (!Number.isInteger(b.qty) || b.qty <= 0) err('DC-E001', `BOM ${ref} qty must be a positive integer`, ref);
    const target = b.partRef || b.assemblyRef || b.refId;
    if (!target) err('DC-E001', `BOM ${ref} has no partRef/assemblyRef/refId`, ref);
    if (b.partRef) {
      const r = idx.partRevisions.get(b.partRef);
      if (!r) err('DC-E003', `BOM ${ref} partRef ${b.partRef} missing`, ref);
    }
    if (b.assemblyRef) {
      const [aid, rev] = b.assemblyRef.split('@');
      const a = idx.assemblyDefinitions.get(aid);
      if (!a || a.revision !== rev) err('DC-E003', `BOM ${ref} assemblyRef ${b.assemblyRef} missing`, ref);
    }
    if (b.refId) {
      const refs = A('bomLines').filter(x => x.refId === b.refId);
      if (refs.length > 1) err('DC-E005', `BOM ${ref} duplicate refId ${b.refId}`, ref);
      const rt = b.refTarget || '';
      if (!rt.includes('@')) err('DC-E003', `BOM ${ref} refTarget malformed`, ref);
      else {
        const [tid, trev] = rt.split('@');
        if (tid.startsWith('REF-')) err('DC-E005', `BOM ${ref} ref points at another REF`, ref);
        if (!idx.partRevisions.has(rt) && !(idx.assemblyDefinitions.get(tid)?.revision === trev)) err('DC-E003', `BOM ${ref} refTarget ${rt} missing`, ref);
      }
    }
    if (Array.isArray(b.instanceIds)) {
      if (b.qty !== b.instanceIds.length) err('DC-E008', `BOM ${ref} qty ${b.qty} != instanceIds ${b.instanceIds.length}`, ref);
      for (const iid of b.instanceIds) {
        const childPart = idx.partInstances.get(iid);
        const childAsm = idx.assemblyInstances.get(iid);
        if (!childPart && !childAsm) { err('DC-E003', `BOM ${ref} instance ${iid} missing`, ref); continue; }
        const parentId = childPart ? childPart.assemblyInstanceId : childAsm.parentAssemblyInstanceId;
        const parent = idx.assemblyInstances.get(parentId);
        if (!parent) { err('DC-E003', `BOM ${ref} instance ${iid} parent assembly missing`, ref); continue; }
        const par = parent.assemblyRef || '';
        if (!par.startsWith(`${b.assemblyDefId}@`)) err('DC-E008', `BOM ${ref} instance ${iid} parent ${parentId} is ${par}, not ${b.assemblyDefId}`, ref);
      }
    }
  }

  // mount interfaces
  for (const m of A('mountInterfaces')) {
    const ref = m.mountId;
    for (const k of ['mountId', 'type', 'frameA', 'frameB']) if (m[k] == null) err('DC-E001', `mount ${ref} missing ${k}`, ref);
    if (!MOUNT_TYPES.has(m.type)) err('DC-E033', `mount ${ref} unsupported type ${m.type}`, ref);
    const fa = idx.frames.get(m.frameA), fb = idx.frames.get(m.frameB);
    if (!fa || !fb) err('DC-E020', `mount ${ref} frame missing`, ref);
    const instA = fa?.instanceId ? idx.partInstances.get(fa.instanceId) : null;
    const instB = fb?.instanceId ? idx.partInstances.get(fb.instanceId) : null;
    const varA = instA ? idx.partVariants.get(instA.variantId) : null;
    const varB = instB ? idx.partVariants.get(instB.variantId) : null;
    const pcdMount = m.fastenerPattern?.pcdMm?.value ?? m.pattern?.pcdMm ?? null;
    const countMount = m.fastenerPattern?.count?.value ?? m.pattern?.count ?? null;
    const cbMount = m.pilot?.diameterMm?.value ?? null;
    const pcdA = param(varA, 'pcdMm'), pcdB = param(varB, 'pcdMm');
    const countA = param(varA, 'holeCount'), countB = param(varB, 'holeCount');
    const cbA = param(varA, 'centerBoreMm'), cbB = param(varB, 'centerBoreMm');
    if (pcdA != null && pcdB != null && Math.abs(pcdA - pcdB) > 0.01) err('DC-E030', `mount ${ref} PCD varies ${pcdA} vs ${pcdB}`, ref);
    if (pcdMount != null && pcdA != null && Math.abs(pcdMount - pcdA) > 0.01) err('DC-E030', `mount ${ref} PCD ${pcdMount} != part ${pcdA}`, ref);
    if (countA != null && countB != null && countA !== countB) err('DC-E031', `mount ${ref} hole count ${countA} vs ${countB}`, ref);
    if (countMount != null && countA != null && countMount !== countA) err('DC-E031', `mount ${ref} count ${countMount} != part ${countA}`, ref);
    if (cbMount != null && cbA != null && Math.abs(cbMount - cbA) > 0.01) err('DC-E032', `mount ${ref} pilot ${cbMount} != part ${cbA}`, ref);
    if (cbA != null && cbB != null && Math.abs(cbA - cbB) > 0.01) err('DC-E032', `mount ${ref} center bore ${cbA} vs ${cbB}`, ref);
    if (m.frameA && m.frameB && !['PRESS_FIT_SPLINE'].includes(m.type)) {
      const wa = worldTransform(m.frameA, idx), wb = worldTransform(m.frameB, idx);
      if (wa && wb) {
        const d = Math.hypot(wa.origin[0] - wb.origin[0], wa.origin[1] - wb.origin[1], wa.origin[2] - wb.origin[2]);
        const tol = (m.tolerance?.positionMm ?? 0.1) / 1000;
        if (d > tol) err('DC-E034', `mount ${ref} frame distance ${d.toFixed(6)} m > ${tol} m`, ref);
      }
    }
    if (m.pattern) {
      const { count, pcdMm, frameIds, matingFrameId } = m.pattern;
      if (!Array.isArray(frameIds) || frameIds.length !== count) err('DC-E031', `mount ${ref} pattern frame count mismatch`, ref);
      const wm = worldTransform(matingFrameId, idx);
      if (wm && Array.isArray(frameIds)) {
        const rr = pcdMm / 2 / 1000;
        const angles = [];
        for (const fid of frameIds) {
          const w = worldTransform(fid, idx);
          if (!w) { err('DC-E020', `mount ${ref} pattern frame ${fid} missing`, ref); continue; }
          const rel = [w.origin[0] - wm.origin[0], w.origin[1] - wm.origin[1], w.origin[2] - wm.origin[2]];
          const rad = Math.hypot(rel[0], rel[1], rel[2]);
          if (Math.abs(rad - rr) > 0.0002) err('DC-E030', `mount ${ref} pattern frame ${fid} radius ${rad.toFixed(6)} != ${rr.toFixed(6)}`, ref);
          angles.push(Math.atan2(rel[2], rel[1]) * 180 / Math.PI);
        }
        if (angles.length === count) {
          const step = 360 / count;
          for (let i = 1; i < angles.length; i++) {
            const d = Math.abs(((angles[i] - angles[i - 1]) + 360) % 360);
            if (Math.abs(d - step) > 0.2) err('DC-E030', `mount ${ref} pattern angular spacing ${d.toFixed(2)} != ${step}`, ref);
          }
        }
      }
    }
    paperTrail(m);
  }

  // joints
  for (const j of A('joints')) {
    const ref = j.jointId;
    for (const k of ['jointId', 'type', 'frameA', 'frameB']) if (j[k] == null) err('DC-E001', `joint ${ref} missing ${k}`, ref);
    if (!JOINT_TYPES.has(j.type)) err('DC-E040', `joint ${ref} unsupported type ${j.type}`, ref);
    const fa = idx.frames.get(j.frameA), fb = idx.frames.get(j.frameB);
    if (!fa || !fb) err('DC-E020', `joint ${ref} frame missing`, ref);
    if (fa && fb) {
      const ra = rootFrame(j.frameA, idx), rb = rootFrame(j.frameB, idx);
      if (!ra || !rb || ra !== rb) err('DC-E042', `joint ${ref} frames are not under one assembly root (${ra} vs ${rb})`, ref);
    }
    const needsAxis = ['REVOLUTE', 'PRISMATIC', 'CYLINDRICAL', 'UNIVERSAL'].includes(j.type);
    if (needsAxis) {
      if (!Array.isArray(j.axisA) || j.axisA.length !== 3) err('DC-E042', `joint ${ref} missing axisA`, ref);
      else if (Math.abs(length3(j.axisA) - 1) > 1e-6) err('DC-E023', `joint ${ref} axisA not normalized (${length3(j.axisA)})`, ref);
      if (j.axisB != null) {
        if (!Array.isArray(j.axisB) || j.axisB.length !== 3) err('DC-E042', `joint ${ref} axisB malformed`, ref);
        else {
          if (Math.abs(length3(j.axisB) - 1) > 1e-6) err('DC-E023', `joint ${ref} axisB not normalized`, ref);
          if (['REVOLUTE', 'PRISMATIC'].includes(j.type) && Math.abs(Math.abs(dot3(j.axisA, j.axisB)) - 1) > 0.01) err('DC-E042', `joint ${ref} axisA/axisB not aligned`, ref);
        }
      }
    }
    if (j.limits != null) {
      const { min, max, unit } = j.limits;
      if (typeof min !== 'number' || typeof max !== 'number') err('DC-E041', `joint ${ref} limits min/max must be numbers`, ref);
      else if (min > max) err('DC-E041', `joint ${ref} limits min ${min} > max ${max}`, ref);
      const expectedUnit = ['REVOLUTE', 'UNIVERSAL'].includes(j.type) ? 'rad' : ['PRISMATIC', 'CYLINDRICAL'].includes(j.type) ? 'm' : null;
      if (expectedUnit && unit !== expectedUnit) err('DC-E041', `joint ${ref} limit unit ${unit} != ${expectedUnit}`, ref);
    }
    if (!j.adapterHints) warn('DC-W006', `joint ${ref} lacks adapterHints`, ref);
    paperTrail(j);
  }

  // assets
  for (const a of A('assets')) {
    const ref = a.assetId;
    for (const k of ['assetId', 'partRef', 'mappingStatus', 'sourceUnits']) if (a[k] == null) err('DC-E001', `asset ${ref} missing ${k}`, ref);
    if (!idx.partRevisions.has(a.partRef)) err('DC-E003', `asset ${ref} partRef ${a.partRef} missing`, ref);
    if (!['EXACT', 'DEMO_SUBSTITUTE', 'PLACEHOLDER'].includes(a.mappingStatus)) err('DC-E053', `asset ${ref} bad mappingStatus`, ref);
    if (!['mm', 'm'].includes(a.sourceUnits)) err('DC-E050', `asset ${ref} sourceUnits must be mm|m`, ref);
    const files = ['step', 'stl', 'glb'].map(k => [k, a[k]]).filter(([, v]) => v != null);
    if (a.mappingStatus === 'PLACEHOLDER') {
      if (files.length > 0) err('DC-E053', `asset ${ref} placeholder has geometry files`, ref);
      if (a.transform != null) err('DC-E053', `asset ${ref} placeholder has transform`, ref);
    } else {
      if (!a.transform) err('DC-E050', `asset ${ref} missing transform`, ref);
      for (const [k, file] of files) {
        if (!file.path || !file.sha256) err('DC-E050', `asset ${ref} ${k} missing path/sha256`, ref);
        else {
          const abs = path.join(ROOT, file.path);
          if (!fs.existsSync(abs)) err('DC-E054', `asset ${ref} ${k} file missing ${file.path}`, ref);
          else {
            const actual = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
            if (actual !== file.sha256) err('DC-E051', `asset ${ref} ${k} hash mismatch`, ref);
          }
        }
      }
      if (a.sourceUnits === 'mm' && a.transform?.unitScale !== 0.001) err('DC-E022', `asset ${ref} mm asset needs unitScale 0.001`, ref);
      const rm = a.transform?.rotation ? rotationMatrix(a.transform.rotation) : null;
      if (rm && Math.abs(det3(rm) - 1) > 1e-6) err('DC-E052', `asset ${ref} transform is not a proper rotation`, ref);
      if (a.mappingStatus === 'DEMO_SUBSTITUTE' && ['FID-K', 'FID-D1', 'FID-D2'].includes(a.fidelityClaim)) err('DC-E053', `asset ${ref} demo substitute claims ${a.fidelityClaim}`, ref);
    }
    paperTrail(a);
  }

  // materials
  for (const m of A('materials')) {
    const ref = m.materialId;
    if (!m.materialId) err('DC-E001', 'material missing materialId', ref);
    for (const [name, p] of Object.entries(m.properties || {})) {
      if (!p || typeof p !== 'object') { err('DC-E001', `material ${ref} property ${name} malformed`, ref); continue; }
      if (p.value == null && !['OPEN', 'DEFERRED', 'NOT_APPLICABLE'].includes(p.valueBasis)) err('DC-E062', `material ${ref} ${name} null must be OPEN`, ref);
      if (p.value != null && typeof p.value === 'number' && !p.unit) err('DC-E063', `material ${ref} ${name} numeric without unit`, ref);
    }
  }

  // vehicle variants
  for (const v of A('vehicleVariants')) {
    const ref = v.vehicleVariantId;
    for (const k of ['vehicleVariantId', 'platformFamilyRef', 'architectureRef', 'powertrainRef', 'parameters']) if (v[k] == null) err('DC-E001', `variant ${ref} missing ${k}`, ref);
    if (!v.parameters?.['PD-WB']) err('DC-E071', `variant ${ref} missing PD-WB`, ref);
    if (!v.parameters?.['PD-FT']) err('DC-E071', `variant ${ref} missing PD-FT`, ref);
    if (v.globalScale != null) err('DC-E073', `variant ${ref} uses globalScale`, ref);
    for (const hp of Object.keys(v.hardpointOverrides || {})) {
      if ((v.fixedHardpointRefs || []).includes(hp)) err('DC-E074', `variant ${ref} overrides fixed hardpoint ${hp}`, ref);
    }
    for (const sel of Object.values(v.moduleSelections || {})) {
      if (v.powertrainRef === 'ICE' && String(sel).includes('BEV')) err('DC-E072', `variant ${ref} ICE selects BEV module ${sel}`, ref);
      if (v.architectureRef === 'ARCH-BOF' && String(sel).includes('UNI-SEDAN')) err('DC-E072', `variant ${ref} BOF selects UNI module ${sel}`, ref);
    }
    warn('DC-W002', `variant ${ref} platformFamilyRef ${v.platformFamilyRef} is external R-01 data; R-01 field alignment is still pending`, ref);
  }

  // warnings
  let openCount = 0;
  for (const name of ['partVariants', 'assets', 'materials', 'joints', 'mountInterfaces']) {
    for (const x of A(name)) {
      const serialized = JSON.stringify(x);
      if (serialized.includes('"OPEN"') || serialized.includes('"DEMO_ASSUMPTION"')) openCount++;
    }
  }
  if (openCount) warn('DC-W001', 'OPEN/ASSUMPTION values present; do not claim production truth', `count=${openCount}`);
  warn('DC-W003', 'CAD B-rep checks are still required; schema validation is not geometric validation', 'all');
  if (A('assets').some(a => a.mappingStatus === 'PLACEHOLDER')) warn('DC-W005', 'placeholder assets present; no geometry/mass claims allowed', 'assets');
  for (const r of A('partRevisions')) {
    if (r.fidelityClaim && ['FID-K', 'FID-D1', 'FID-D2'].includes(r.fidelityClaim) && r.verification?.status !== 'PASS') warn('DC-W004', `revision ${r.revisionId} claims ${r.fidelityClaim} but is not verified`, r.revisionId);
  }

  // dedupe errors/warnings
  const uniq = (arr, key) => { const s = new Set(); return arr.filter(x => { const k = key(x); if (s.has(k)) return false; s.add(k); return true; }); };
  const e = uniq(errors, x => `${x.code}|${x.ref}|${x.message}`);
  const w = uniq(warnings, x => `${x.code}|${x.ref}|${x.message}`);
  return { ok: e.length === 0, errors: e, warnings: w, summary: { nodes: A('partDefinitions').length + A('assemblyDefinitions').length, instances: A('partInstances').length + A('assemblyInstances').length, joints: A('joints').length, mounts: A('mountInterfaces').length } };
}

function checkExpect(actual, expect) {
  const codes = [...new Set((actual.errors || []).map(e => e.code))];
  const warnings = [...new Set((actual.warnings || []).map(w => w.code))];
  const problems = [];
  if (expect.ok !== undefined && actual.ok !== expect.ok) problems.push(`ok expected ${expect.ok} got ${actual.ok}`);
  for (const c of expect.codesInclude || []) if (!codes.includes(c)) problems.push(`missing code ${c}`);
  for (const c of expect.codesExclude || []) if (codes.includes(c)) problems.push(`unexpected code ${c}`);
  for (const c of expect.warningsInclude || []) if (!warnings.includes(c)) problems.push(`missing warning ${c}`);
  return problems;
}

const example = JSON.parse(fs.readFileSync(docPath, 'utf8'));
const base = validateDocument(example);
const results = [];
for (const tc of example.validationCases || []) {
  const d = clone(example);
  try {
    applyPatch(d, tc.patch);
    const actual = validateDocument(d);
    const problems = checkExpect(actual, tc.expect);
    results.push({ caseId: tc.caseId, title: tc.title, pass: problems.length === 0, problems, expected: tc.expect, actual: { ok: actual.ok, errorCodes: [...new Set(actual.errors.map(e => e.code))], warningCodes: [...new Set(actual.warnings.map(w => w.code))] } });
  } catch (e) {
    results.push({ caseId: tc.caseId, title: tc.title, pass: false, problems: [`patch/runtime error: ${e.message}`], expected: tc.expect, actual: null });
  }
}
const invalidResults = [];
for (const inv of example.invalidExamples || []) {
  const actual = validateDocument(inv.document);
  const codes = [...new Set(actual.errors.map(e => e.code))];
  const missing = (inv.expectCodes || []).filter(c => !codes.includes(c));
  invalidResults.push({ exampleId: inv.exampleId, description: inv.description, pass: missing.length === 0, expectedCodes: inv.expectCodes, actualCodes: codes, missing });
}

const passed = results.filter(r => r.pass).length;
const invalidPassed = invalidResults.filter(r => r.pass).length;
const out = {
  document: docPath,
  base: { ok: base.ok, errors: base.errors, warningCodes: [...new Set(base.warnings.map(w => w.code))], summary: base.summary },
  totals: { cases: results.length, passed, failed: results.length - passed, invalidExamples: invalidResults.length, invalidPassed, invalidFailed: invalidResults.length - invalidPassed },
  results,
  invalidResults
};
console.log(JSON.stringify(out, null, 2));
process.exit(passed === results.length && invalidPassed === invalidResults.length ? 0 : 1);

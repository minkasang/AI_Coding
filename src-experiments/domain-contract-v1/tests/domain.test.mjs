import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject, ProjectStore } from '../domain.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', name), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const codes = (report) => new Set(report.errors.map((e) => e.code));
const warnCodes = (report) => new Set(report.warnings.map((w) => w.code));
const skeleton = () => load('vehicle-skeleton.json');
const fl = () => load('fl-wheel-end.json');

test('vehicle skeleton validates and enumerates 10 systems + 4 wheel ends', () => {
  const p = skeleton();
  const report = validateProject(p);
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  const store = new ProjectStore(p);
  const tree = store.listTree();
  assert.equal(tree.length, 10);
  assert.deepEqual(tree.filter((s) => s.systemId === 'SYS-30')[0].assemblies.map((a) => a.assemblyId).sort(), ['ASM-HUB-BRG-FL', 'ASM-WHEEL-END-FL', 'ASM-WHEEL-END-FR', 'ASM-WHEEL-END-RL', 'ASM-WHEEL-END-RR']);
  assert.equal(store.snapshotForRender().length, p.partInstances.filter((i) => i.visible !== false).length);
});

test('FL wheel-end fixture validates: 5 studs, rotor REF not BOM, run current', () => {
  const p = fl();
  const report = validateProject(p);
  assert.equal(report.ok, true, JSON.stringify(report.errors));
  assert.equal(p.partInstances.filter((i) => i.partId === 'PART-30-009').length, 5);
  assert.equal(p.references.find((r) => r.refId === 'REF-30-001').bom, false);
  assert.equal(p.bomLines.some((b) => b.partRef === 'PART-40-046'), false);
  const store = new ProjectStore(p);
  assert.equal(store.getRunStatus('RUN-FL-001').status, 'CURRENT');
});

test('add/move/serialize/restore preserves stable instance IDs', () => {
  const store = new ProjectStore(fl());
  const before = store.snapshot().revision;
  const id = 'INST-TEST-001';
  store._commit((next) => {
    next.frames.push({ frameId: 'FR-TEST-001', parentFrameId: 'FR-WHEEL-END-FL', space: 'INSTANCE', units: 'm', origin: [0, 0.1, 0], rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], mirror: null, tolerance: { positionM: 0.0005, angleDeg: 0.1 } });
    next.partInstances.push({ instanceId: id, partId: 'PART-30-031', variantId: 'VV-A-SWB-STD', assemblyId: 'ASM-WHEEL-END-FL', frameId: 'FR-TEST-001', visible: true, evidenceInherited: 'ASSUMPTION', sourceEvidenceIds: ['SRC-RP01'], quantity: { perAssembly: 1 } });
  });
  assert.equal(store.snapshot().revision, before + 1);
  store.moveInstance(id, 'ASM-HUB-BRG-FL', 'FR-HUB-INST-FL');
  assert.equal(store.snapshot().partInstances.find((i) => i.instanceId === id).assemblyId, 'ASM-HUB-BRG-FL');
  const json = store.serialize();
  const restored = ProjectStore.restore(json);
  assert.equal(restored.snapshot().revision, store.snapshot().revision);
  assert.equal(restored.snapshot().partInstances.find((i) => i.instanceId === id).assemblyId, 'ASM-HUB-BRG-FL');
  assert.equal(restored.snapshot().selectedId, store.snapshot().selectedId);
});

test('Gen1/Gen3 mix is rejected in both add and variant change', () => {
  const store = new ProjectStore(skeleton());
  assert.throws(() => store.addInstance('PART-30-010', 'ASM-WHEEL-END-FL'), /DOMAIN-E-GEN-MIX/);
  const flStore = new ProjectStore(fl());
  assert.throws(() => flStore.selectVariant({ ...flStore.snapshot().variant, generation: 'GEN3' }), /DOMAIN-E-GEN-MIX/);
});

test('duplicate instanceId is rejected', () => {
  const p = fl();
  p.partInstances.push({ ...clone(p.partInstances[0]) });
  const report = validateProject(p);
  assert.equal(report.ok, false);
  assert.ok(codes(report).has('DOMAIN-E-ID-DUPLICATE'));
});

test('ASSUMPTION cannot be upgraded to SOURCED', () => {
  const p = fl();
  const stud = p.partInstances.find((i) => i.instanceId === 'INST-STUD-FL-1');
  stud.claimedEvidence = 'SOURCED';
  stud.sourceEvidenceIds = [];
  const report = validateProject(p);
  assert.equal(report.ok, false);
  assert.ok(codes(report).has('DOMAIN-E-EVIDENCE-UPGRADE'));
  assert.ok(codes(report).has('DOMAIN-E-SOURCE-MISSING'));
});

test('mutating inputs makes a previous simulation run STALE', () => {
  const store = new ProjectStore(fl());
  assert.equal(store.getRunStatus('RUN-FL-001').status, 'CURRENT');
  store._commit((next) => {
    next.variant.parameters['PD-WB'].value = 2500;
  });
  const status = store.getRunStatus('RUN-FL-001');
  assert.equal(status.status, 'STALE');
  assert.ok(warnCodes(store.validate()).has('DOMAIN-W-STALE-RUN'));
});

test('wrong units, scale and undeclared mirror are rejected', () => {
  const mm = clone(fl());
  mm.frames.find((f) => f.frameId === 'FR-HUB-INST-FL').units = 'mm';
  assert.ok(codes(validateProject(mm)).has('DOMAIN-E-UNIT-MISMATCH'));

  const scaled = clone(fl());
  scaled.frames.find((f) => f.frameId === 'FR-HUB-INST-FL').scale = 1.1;
  assert.ok(codes(validateProject(scaled)).has('DOMAIN-E-SCALE'));

  const mirrored = clone(fl());
  mirrored.frames.find((f) => f.frameId === 'FR-HUB-INST-FL').rotation = [[-1, 0, 0], [0, 1, 0], [0, 0, 1]];
  assert.ok(codes(validateProject(mirrored)).has('DOMAIN-E-MIRROR'));
});

test('REF and direct part must not coexist in the same assembly', () => {
  const p = fl();
  p.partInstances.push({
    instanceId: 'INST-DISC-DIRECT', partId: 'PART-40-046', variantId: 'VV-A-SWB-STD',
    assemblyId: 'ASM-WHEEL-END-FL', frameId: 'FR-DISC-ASM-FL', visible: true,
    evidenceInherited: 'ASSUMPTION', sourceEvidenceIds: ['SRC-RP01'], quantity: { perAssembly: 1 }
  });
  const report = validateProject(p);
  assert.equal(report.ok, false);
  assert.ok(codes(report).has('DOMAIN-E-REF-DOUBLE-COUNT'));
});

test('REF counted as BOM is rejected', () => {
  const p = fl();
  p.references.find((r) => r.refId === 'REF-30-001').bom = true;
  assert.ok(codes(validateProject(p)).has('DOMAIN-E-REF-AS-BOM'));
});

test('Constraint cannot be silently placed in Joint list', () => {
  const p = fl();
  p.joints.push({ jointId: 'CON-KINGPIN-LENGTH', type: 'FIXED', frameA: 'FR-HUB-AXIS-FL', frameB: 'FR-KNUCKLE-AXIS-FL', axisA: null, axisB: null, limits: null, driver: null, evidenceInherited: 'DEMO_ASSUMPTION' });
  assert.ok(codes(validateProject(p)).has('DOMAIN-E-CONSTRAINT-AS-JOINT'));
});

test('familyRef is not a deduplication key: three FAM-130-007 members remain', () => {
  const store = new ProjectStore(skeleton());
  assert.deepEqual(store.familyMembers('FAM-130-007').sort(), ['PART-30-009', 'PART-30-017', 'PART-30-029']);
});

test('display transform is m/Y-up, stable instanceId, no Object3D names', () => {
  const store = new ProjectStore(fl());
  const t = store.toDisplayTransform('INST-HUB-FL');
  assert.equal(t.instanceId, 'INST-HUB-FL');
  assert.equal(t.units, 'm');
  assert.equal(t.up, 'Y');
  assert.equal(t.matrixWorld.length, 4);
  assert.equal(t.matrixWorld[3][3], 1);
  assert.equal(store.snapshotForRender().every((x) => x.instanceId.startsWith('INST-')), true);
});

test('serialize/restore rejects corrupted revision and preserves selection', () => {
  const store = new ProjectStore(fl());
  const json = store.serialize();
  const restored = ProjectStore.restore(json);
  assert.equal(restored.snapshot().selectedId, 'INST-HUB-FL');
  assert.equal(restored.snapshot().revision, 3);
  assert.throws(() => ProjectStore.restore(json.replace('"revision": 3', '"revision": 0')), /invalid domain project/);
});

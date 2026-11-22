import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWheelEndBinding, loadWheelEndAssetBindingFromUrls, parseGlbJson } from '../binding.mjs';
import {
  DEFAULT_GLB_SHA256,
  DEFAULT_PACKAGE_DIR,
  DEFAULT_PACKAGE_ID,
  loadWheelEndAssetBindingFromDisk
} from '../node-loader.mjs';
import { loadSnapshotBundle, loadVehicleConsumer } from '../../vehicle-consumer-v1/node-loader.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const binding = loadWheelEndAssetBindingFromDisk(root);
const bundle = loadSnapshotBundle(root);
const consumer = loadVehicleConsumer(root);
const manifestText = readFileSync(join(root, DEFAULT_PACKAGE_DIR, 'manifest.json'), 'utf8');
const manifest = JSON.parse(manifestText);
const glbBuffer = readFileSync(join(root, DEFAULT_PACKAGE_DIR, 'wheel-end.glb'));
const glbJson = parseGlbJson(glbBuffer).json;
const glbSha256 = createHash('sha256').update(glbBuffer).digest('hex');
const manifestSha256 = createHash('sha256').update(Buffer.from(manifestText, 'utf8')).digest('hex');
const baseArgs = {
  consumer,
  consumerIndex: bundle.consumerIndex,
  snapshotSha256: bundle.snapshotSha256,
  manifest,
  manifestSha256,
  glbJson,
  glbSha256,
  expectedPackageId: DEFAULT_PACKAGE_ID,
  expectedGlbSha256: DEFAULT_GLB_SHA256
};
const clone = (value) => JSON.parse(JSON.stringify(value));

function build(overrides = {}) {
  return createWheelEndBinding({ ...baseArgs, ...overrides });
}
function expectCode(fn, code) {
  assert.throws(fn, (error) => error.code === code, `expected ${code}`);
}
function close(a, b, tolerance = 1e-9) {
  return Math.abs(a - b) <= tolerance;
}

test('control: the approved C-01 package binds nine instances to the R-27 snapshot', () => {
  const status = binding.getStatus();
  assert.equal(status.packageId, DEFAULT_PACKAGE_ID);
  assert.equal(status.snapshotId, 'SNAP-R27-R16-R21-R22-R23-01');
  assert.equal(status.revision, 1);
  assert.equal(status.variantId, 'VAR-R16-BOF-ICE');
  assert.equal(status.glbSha256, DEFAULT_GLB_SHA256);
  assert.deepEqual(status.counts, {
    c01Instances: 9,
    c01Meshes: 5,
    assemblyGroups: 2,
    studs: 5,
    snapshotPartInstances: 278,
    fallbackWithoutC01: 269
  });
  assert.equal(status.staticOnly, true);
  assert.equal(status.vehiclePlacement, null);
  assert.equal(status.motionBinding, null);
});

test('all nine binding identities exist in the snapshot with matching part, assembly and frame', () => {
  const bindings = binding.listBindings();
  assert.equal(bindings.length, 9);
  assert.equal(new Set(bindings.map((row) => row.partInstanceId)).size, 9);
  for (const row of bindings) {
    const detail = consumer.getObjectDetail(row.partInstanceId);
    assert.equal(detail.identity.partId, row.partId);
    assert.equal(detail.identity.assemblyInstanceId, row.assemblyInstanceId);
    assert.equal(detail.identity.frameId, row.snapshotFrameId);
    assert.equal(detail.geometry.status, 'NO_GEOMETRY');
    assert.equal(row.mappingStatus, 'DEMO_SUBSTITUTE');
    assert.equal(row.sourceGrade, 'DEMO_ASSUMPTION');
  }
});

test('five meshes, two assembly groups and five stud instances sharing one mesh', () => {
  const bindings = binding.listBindings();
  const studs = bindings.filter((row) => row.partId === 'PART-30-009');
  assert.equal(studs.length, 5);
  assert.equal(new Set(studs.map((row) => row.meshIndex)).size, 1);
  assert.equal(new Set(studs.map((row) => row.partInstanceId)).size, 5);
  assert.equal(new Set(bindings.map((row) => row.meshIndex)).size, 5);
  const plan = binding.getRenderPlan();
  assert.equal(plan.assemblyGroups.length, 2);
  assert.equal(plan.meshDefinitions.length, 5);
  assert.equal(plan.meshDefinitions.filter((row) => row.shared).length, 1);
  assert.deepEqual(plan.meshDefinitions.find((row) => row.shared).partInstanceIds.sort(), studs.map((row) => row.partInstanceId).sort());
});

test('every instance node keeps the GLB root → assembly → instance hierarchy and a rigid transform', () => {
  for (const row of binding.listBindings()) {
    assert.equal(row.parentChain.length, 3);
    assert.equal(row.parentChain[0].kind, 'root');
    assert.equal(row.parentChain[1].kind, 'assemblyGroup');
    assert.equal(row.parentChain[2].kind, 'instance');
    assert.equal(row.parentChain[0].nodeName, 'FR-C01-WHEEL-END-FL');
    assert.equal(row.matrixLocal.length, 16);
    assert.equal(row.matrixWorldGlb.length, 16);
    assert.equal(row.threeMatrixWorld.length, 16);
    assert.ok(row.matrixWorldGlb.every(Number.isFinite));
    assert.equal(row.units, 'm');
    assert.equal(row.up, 'Y');
    assert.equal(row.coordinateBasis, 'GLB_OWN_M_Y_UP');
    assert.equal(row.cadToGlbAppliedInGlb, true);
  }
  const hub = binding.getBinding('PI-30-006-FL');
  assert.ok(close(hub.localTransform.translation[0], 0.008));
  assert.ok(close(hub.matrixWorldGlb[3], 0.008));
});

test('CAD reconstruction matrices are retained but never applied twice to the GLB', () => {
  const hub = binding.getBinding('PI-30-006-FL');
  assert.ok(hub.cadReconstructionOnly.rootFromPartCad);
  assert.ok(hub.cadReconstructionOnly.note.includes('never'));
  assert.ok(close(hub.localTransform.translation[0], 0.008));
  assert.ok(close(hub.matrixWorldGlb[3], 0.008));
});

test('the render plan is static workholding only and refuses vehicle placement or motion', () => {
  const plan = binding.getRenderPlan();
  assert.equal(plan.mode, 'STATIC_WORKHOLDING_DEMO');
  assert.equal(plan.vehiclePlacement, null);
  assert.equal(plan.motionBinding, null);
  assert.equal(plan.canPlayMotion, false);
  assert.equal(plan.instanceNodes.length, 9);
  expectCode(() => binding.getRenderPlan({ mode: 'VEHICLE' }), 'E_VEHICLE_PLACEMENT_UNAVAILABLE');
  expectCode(() => binding.assertStaticOnly('MOTION'), 'E_VEHICLE_PLACEMENT_UNAVAILABLE');
});

test('the legacy three-part V2 demo has explicit 1:1 / 1:2 / 1:5 boundaries', () => {
  const legacy = binding.getLegacyDemoBridge();
  assert.equal(legacy.hub.mapping, 'ONE_TO_ONE');
  assert.deepEqual(legacy.hub.piIds, ['PI-30-006-FL']);
  assert.equal(legacy.bearing.mapping, 'ONE_TO_TWO');
  assert.equal(legacy.bearing.piIds.length, 2);
  assert.equal(legacy.studs.mapping, 'ONE_TO_FIVE');
  assert.equal(legacy.studs.piIds.length, 5);
  assert.equal(legacy.hub.canonicalSinglePart, true);
  assert.equal(legacy.bearing.canonicalSinglePart, false);
  assert.equal(legacy.studs.canonicalSinglePart, false);
});

test('fallbacks preserve no-geometry nodes and never treat group demos as one part', () => {
  const wheel = binding.getFallbackStatus('PI-30-019-FL');
  assert.equal(wheel.status, 'NO_GEOMETRY');
  assert.equal(wheel.inspectable, false);
  const caliper = binding.getFallbackStatus('PI-40-034-FL');
  assert.equal(caliper.status, 'NO_GEOMETRY');
  const hubLegacy = binding.getFallbackStatus('PI-30-006-FL', { disableC01: true });
  assert.equal(hubLegacy.status, 'LEGACY_SINGLE_PART_DEMO');
  assert.equal(hubLegacy.showLegacy, true);
  assert.equal(hubLegacy.supersededByC01, true);
  const bearingLegacy = binding.getFallbackStatus('PI-30-001-FL', { disableC01: true });
  assert.equal(bearingLegacy.status, 'LEGACY_GROUP_DEMO_NOT_ONE_TO_ONE');
  assert.equal(bearingLegacy.inspectable, false);
  const studLegacy = binding.getFallbackStatus('PI-30-009-FL-01', { disableC01: true });
  assert.equal(studLegacy.status, 'LEGACY_GROUP_DEMO_NOT_ONE_TO_ONE');
  assert.equal(studLegacy.mappingCount, 5);
});

test('C-01 supersedes the legacy hub and blocks duplicate rendering by default', () => {
  const hub = binding.getFallbackStatus('PI-30-006-FL');
  assert.equal(hub.status, 'C01_DEMO_SUBSTITUTE');
  assert.equal(hub.suppressLegacyBridge, true);
  const plan = binding.getRenderPlan();
  assert.deepEqual(plan.suppressedLegacyPartKeys.sort(), ['bearing', 'hub', 'studs']);
  expectCode(() => binding.getRenderPlan({ includeLegacyWithC01: true }), 'E_LEGACY_DUPLICATE_GEOMETRY');
  const legacyPlan = binding.getRenderPlan({ disableC01: true });
  assert.equal(legacyPlan.useC01, false);
  assert.equal(legacyPlan.legacyGroups.length, 3);
});

test('getInstanceView combines R-31 detail with the C-01 node and fallback status', () => {
  const hub = binding.getInstanceView('PI-30-006-FL');
  assert.equal(hub.bindingStatus, 'C01_DEMO_SUBSTITUTE');
  assert.equal(hub.binding.nodeIndex, 4);
  assert.equal(hub.renderNode.meshIndex, 3);
  assert.equal(hub.detail.geometry.status, 'NO_GEOMETRY');
  const wheel = binding.getBinding('PI-30-019-FL');
  assert.equal(wheel.ok, false);
  assert.equal(wheel.code, 'E_NOT_IN_C01_PACKAGE');
  assert.equal(wheel.fallback.status, 'NO_GEOMETRY');
});

test('snapshot, revision, variant, package id and GLB hash fail closed', () => {
  const badSnapshot = clone(manifest);
  badSnapshot.snapshotBinding.snapshotSha256 = '0'.repeat(64);
  expectCode(() => build({ manifest: badSnapshot }), 'E_SNAPSHOT_MISMATCH');
  const badRevision = clone(manifest);
  badRevision.snapshotBinding.revision = 99;
  expectCode(() => build({ manifest: badRevision }), 'E_SNAPSHOT_MISMATCH');
  const badVariant = clone(manifest);
  badVariant.snapshotBinding.variantId = 'VAR-WRONG';
  expectCode(() => build({ manifest: badVariant }), 'E_VARIANT_MISMATCH');
  expectCode(() => build({ glbSha256: '0'.repeat(64) }), 'E_GLB_HASH_MISMATCH');
  expectCode(() => build({ expectedPackageId: 'wrong-package' }), 'E_PACKAGE_ID_MISMATCH');
  expectCode(() => build({ expectedGlbSha256: 'f'.repeat(64) }), 'E_GLB_HASH_MISMATCH');
});

test('manifest instance set and identity errors are explicit', () => {
  const missing = clone(manifest);
  missing.instances = missing.instances.slice(0, 8);
  expectCode(() => build({ manifest: missing }), 'E_INSTANCE_SET_MISMATCH');
  const duplicate = clone(manifest);
  duplicate.instances[8].partInstanceId = duplicate.instances[0].partInstanceId;
  expectCode(() => build({ manifest: duplicate }), 'E_INSTANCE_DUPLICATE');
  const unknown = clone(manifest);
  unknown.instances[4].partInstanceId = 'PI-99-999-FL';
  expectCode(() => build({ manifest: unknown }), 'E_INSTANCE_NOT_IN_SNAPSHOT');
  const wrongPart = clone(manifest);
  wrongPart.instances[0].partId = 'PART-WRONG';
  expectCode(() => build({ manifest: wrongPart }), 'E_PART_MISMATCH');
  const wrongAssembly = clone(manifest);
  wrongAssembly.instances[0].assemblyInstanceId = 'AI-WRONG';
  expectCode(() => build({ manifest: wrongAssembly }), 'E_ASSEMBLY_MISMATCH');
  const wrongFrame = clone(manifest);
  wrongFrame.instances[0].snapshotFrameId = 'FR-WRONG';
  expectCode(() => build({ manifest: wrongFrame }), 'E_FRAME_MISMATCH');
});

test('GLB node, mesh and hierarchy errors are explicit', () => {
  const missingNode = clone(glbJson);
  missingNode.nodes[9].extras.partInstanceId = 'PI-30-009-FL-99';
  expectCode(() => build({ glbJson: missingNode }), 'E_NODE_MISSING');
  const duplicateNode = clone(glbJson);
  duplicateNode.nodes[8].extras.partInstanceId = duplicateNode.nodes[9].extras.partInstanceId;
  duplicateNode.nodes[8].name = duplicateNode.nodes[9].name;
  expectCode(() => build({ glbJson: duplicateNode }), 'E_NODE_DUPLICATE');
  const wrongPart = clone(glbJson);
  wrongPart.nodes[5].extras.partId = 'PART-WRONG';
  expectCode(() => build({ glbJson: wrongPart }), 'E_NODE_PART_MISMATCH');
  const fewerMeshes = clone(glbJson);
  fewerMeshes.meshes.pop();
  expectCode(() => build({ glbJson: fewerMeshes }), 'E_MESH_DEFINITION_MISMATCH');
  const studMesh = clone(glbJson);
  studMesh.nodes[9].mesh = 3;
  expectCode(() => build({ glbJson: studMesh }), 'E_STUD_MESH_NOT_SHARED');
  const hierarchy = clone(glbJson);
  hierarchy.nodes[10].children = hierarchy.nodes[10].children.filter((index) => index !== 5);
  hierarchy.nodes[4].children = [...(hierarchy.nodes[4].children ?? []), 5];
  expectCode(() => build({ glbJson: hierarchy }), 'E_HIERARCHY');
});

test('missing package and unknown instance are rejected', () => {
  expectCode(() => loadWheelEndAssetBindingFromDisk(root, { packageDir: 'cad/experiments/vehicle-cad-pipeline-v1/out/missing' }), 'E_PACKAGE_MISSING');
  expectCode(() => binding.getBinding('PI-99-999-FL'), 'E_UNKNOWN_INSTANCE');
});

test('a live GLB node transform flows into the binding matrices', () => {
  const moved = clone(glbJson);
  moved.nodes[4].translation = [0.009, 0, 0];
  const next = build({ glbJson: moved });
  const hub = next.getBinding('PI-30-006-FL');
  assert.ok(close(hub.localTransform.translation[0], 0.009));
  assert.ok(close(hub.matrixWorldGlb[3], 0.009));
  assert.ok(close(binding.getBinding('PI-30-006-FL').matrixWorldGlb[3], 0.008));
});

test('a changed manifest part identity is rejected instead of silently repaired', () => {
  const changed = clone(manifest);
  changed.instances[0].partId = 'PART-30-006';
  expectCode(() => build({ manifest: changed }), 'E_PART_MISMATCH');
});

test('the core does not mutate the manifest or parsed GLB', () => {
  const manifestBefore = JSON.stringify(manifest);
  const glbBefore = JSON.stringify(glbJson);
  binding.listBindings();
  binding.getRenderPlan();
  binding.getFallbackStatus('PI-30-019-FL');
  binding.getInstanceView('PI-30-006-FL');
  assert.equal(JSON.stringify(manifest), manifestBefore);
  assert.equal(JSON.stringify(glbJson), glbBefore);
});

test('the URL loader fetches same-origin assets, verifies hashes and builds the same binding', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('vehicle-snapshot.json')) return { ok: true, text: async () => bundle.snapshotText };
    if (url.endsWith('vehicle-snapshot.consumer.json')) return { ok: true, json: async () => bundle.consumerIndex };
    if (url.endsWith('manifest.json')) return { ok: true, text: async () => manifestText };
    if (url.endsWith('wheel-end.glb')) return { ok: true, arrayBuffer: async () => glbBuffer.buffer.slice(glbBuffer.byteOffset, glbBuffer.byteOffset + glbBuffer.byteLength) };
    return { ok: false, status: 404 };
  };
  const web = await loadWheelEndAssetBindingFromUrls({
    snapshotUrl: 'http://localhost:5173/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json',
    consumerIndexUrl: 'http://localhost:5173/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json',
    manifestUrl: `http://localhost:5173/${DEFAULT_PACKAGE_DIR}/manifest.json`,
    glbUrl: `http://localhost:5173/${DEFAULT_PACKAGE_DIR}/wheel-end.glb`,
    expectedOrigin: 'http://localhost:5173',
    expectedPackageId: DEFAULT_PACKAGE_ID,
    expectedGlbSha256: DEFAULT_GLB_SHA256,
    fetchImpl
  });
  assert.equal(web.getStatus().glbSha256, DEFAULT_GLB_SHA256);
  assert.equal(web.listBindings().length, 9);
});

test('cross-origin C-01 assets are rejected before any fetch', async () => {
  await assert.rejects(
    loadWheelEndAssetBindingFromUrls({
      snapshotUrl: 'https://example.com/snapshot.json',
      consumerIndexUrl: 'https://example.com/index.json',
      manifestUrl: 'https://example.com/manifest.json',
      glbUrl: 'https://example.com/wheel-end.glb',
      expectedOrigin: 'http://localhost:5173',
      fetchImpl: async () => ({ ok: true })
    }),
    (error) => error.code === 'E_CROSS_ORIGIN_ASSET'
  );
});

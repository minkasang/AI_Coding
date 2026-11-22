import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWheelEndBinding, loadWheelEndAssetBindingFromUrls, parseGlbJson } from './binding.mjs';
import {
  DEFAULT_GLB_SHA256, DEFAULT_PACKAGE_DIR, DEFAULT_PACKAGE_ID, loadWheelEndAssetBindingFromDisk
} from './node-loader.mjs';
import { loadSnapshotBundle, loadVehicleConsumer } from '../vehicle-consumer-v1/node-loader.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const binding = loadWheelEndAssetBindingFromDisk(root);
const bundle = loadSnapshotBundle(root);
const consumer = loadVehicleConsumer(root);
const manifestPath = join(root, DEFAULT_PACKAGE_DIR, 'manifest.json');
const glbPath = join(root, DEFAULT_PACKAGE_DIR, 'wheel-end.glb');
const manifestText = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestText);
const glbBuffer = readFileSync(glbPath);
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
const checks = [];

function check(id, run) {
  try {
    const detail = run();
    checks.push({ id, pass: true, detail: detail ?? null });
  } catch (error) {
    checks.push({ id, pass: false, code: error.code ?? 'ERROR', message: error.message });
  }
}
async function checkAsync(id, run) {
  try {
    const detail = await run();
    checks.push({ id, pass: true, detail: detail ?? null });
  } catch (error) {
    checks.push({ id, pass: false, code: error.code ?? 'ERROR', message: error.message });
  }
}
function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    if (error.code !== code) throw new Error(`expected ${code}, got ${error.code}: ${error.message}`);
    return { expected: code };
  }
  throw new Error(`expected ${code}, but no error was thrown`);
}
function build(overrides = {}) {
  return createWheelEndBinding({ ...baseArgs, ...overrides });
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function close(a, b, tolerance = 1e-9) {
  return Math.abs(a - b) <= tolerance;
}

check('B01_package_snapshot_and_status', () => {
  const status = binding.getStatus();
  if (status.packageId !== DEFAULT_PACKAGE_ID) throw new Error('package id');
  if (status.snapshotId !== 'SNAP-R27-R16-R21-R22-R23-01' || status.revision !== 1) throw new Error('snapshot');
  if (status.variantId !== 'VAR-R16-BOF-ICE') throw new Error('variant');
  if (status.glbSha256 !== DEFAULT_GLB_SHA256) throw new Error('glb hash');
  if (status.counts.c01Instances !== 9 || status.counts.c01Meshes !== 5 || status.counts.assemblyGroups !== 2) throw new Error('counts');
  if (!status.staticOnly || status.vehiclePlacement !== null || status.motionBinding !== null) throw new Error('static boundary');
  return status.counts;
});

check('B02_nine_unique_canonical_instances', () => {
  const bindings = binding.listBindings();
  if (bindings.length !== 9) throw new Error('binding count');
  if (new Set(bindings.map((row) => row.partInstanceId)).size !== 9) throw new Error('duplicate PI');
  for (const row of bindings) {
    const detail = consumer.getObjectDetail(row.partInstanceId);
    if (detail.identity.partId !== row.partId) throw new Error(`part ${row.partInstanceId}`);
    if (detail.identity.assemblyInstanceId !== row.assemblyInstanceId) throw new Error(`assembly ${row.partInstanceId}`);
    if (detail.identity.frameId !== row.snapshotFrameId) throw new Error(`frame ${row.partInstanceId}`);
    if (detail.geometry.status !== 'NO_GEOMETRY') throw new Error(`geometry ${row.partInstanceId}`);
  }
  return bindings.map((row) => row.partInstanceId);
});

check('B03_five_meshes_two_groups_five_shared_studs', () => {
  const bindings = binding.listBindings();
  const studs = bindings.filter((row) => row.partId === 'PART-30-009');
  if (studs.length !== 5) throw new Error('stud count');
  if (new Set(studs.map((row) => row.meshIndex)).size !== 1) throw new Error('stud mesh');
  if (new Set(studs.map((row) => row.partInstanceId)).size !== 5) throw new Error('stud identity');
  const meshes = new Set(bindings.map((row) => row.meshIndex));
  if (meshes.size !== 5) throw new Error(`mesh count ${meshes.size}`);
  const plan = binding.getRenderPlan();
  if (plan.assemblyGroups.length !== 2 || plan.meshDefinitions.length !== 5) throw new Error('plan counts');
  if (!plan.meshDefinitions.some((row) => row.shared && row.partInstanceIds.length === 5)) throw new Error('shared mesh definition');
  return { meshes: meshes.size, groups: plan.assemblyGroups.length };
});

check('B04_hierarchy_and_glb_transforms', () => {
  for (const row of binding.listBindings()) {
    if (row.parentChain.length !== 3) throw new Error(`chain ${row.partInstanceId}`);
    if (row.parentChain[0].kind !== 'root' || row.parentChain[1].kind !== 'assemblyGroup' || row.parentChain[2].kind !== 'instance') throw new Error(`chain kinds ${row.partInstanceId}`);
    if (row.parentChain[0].nodeName !== 'FR-C01-WHEEL-END-FL') throw new Error('root name');
    if (row.matrixWorldGlb.length !== 16 || row.threeMatrixWorld.length !== 16) throw new Error('matrix');
    if (!row.matrixWorldGlb.every(Number.isFinite)) throw new Error('matrix finite');
    if (row.coordinateBasis !== 'GLB_OWN_M_Y_UP' || row.cadToGlbAppliedInGlb !== true) throw new Error('basis');
  }
  const hub = binding.getBinding('PI-30-006-FL');
  if (!close(hub.localTransform.translation[0], 0.008, 1e-9)) throw new Error('hub translation');
  if (!close(hub.matrixWorldGlb[3], 0.008, 1e-9)) throw new Error('hub matrix translation');
  return { hubNode: hub.nodeIndex, hubParent: hub.parentNodeName };
});

check('B05_no_cad_matrix_reapplied', () => {
  const hub = binding.getBinding('PI-30-006-FL');
  if (!hub.cadReconstructionOnly.rootFromPartCad) throw new Error('manifest matrix retained');
  if (!close(hub.localTransform.translation[0], 0.008, 1e-9)) throw new Error('GLB transform not preserved');
  if (hub.cadReconstructionOnly.note.includes('never') !== true) throw new Error('warning missing');
  return { translationM: hub.localTransform.translation, note: hub.cadReconstructionOnly.note };
});

check('B06_legacy_three_parts_and_no_geometry_fallbacks', () => {
  const wheel = binding.getFallbackStatus('PI-30-019-FL');
  if (wheel.status !== 'NO_GEOMETRY' || wheel.inspectable) throw new Error('wheel fallback');
  const caliper = binding.getFallbackStatus('PI-40-034-FL');
  if (caliper.status !== 'NO_GEOMETRY' || caliper.inspectable) throw new Error('caliper fallback');
  const hubLegacy = binding.getFallbackStatus('PI-30-006-FL', { disableC01: true });
  if (hubLegacy.status !== 'LEGACY_SINGLE_PART_DEMO' || !hubLegacy.inspectable || !hubLegacy.supersededByC01) throw new Error('hub legacy');
  const bearingLegacy = binding.getFallbackStatus('PI-30-001-FL', { disableC01: true });
  if (bearingLegacy.status !== 'LEGACY_GROUP_DEMO_NOT_ONE_TO_ONE' || bearingLegacy.inspectable) throw new Error('bearing legacy');
  const studLegacy = binding.getFallbackStatus('PI-30-009-FL-01', { disableC01: true });
  if (studLegacy.status !== 'LEGACY_GROUP_DEMO_NOT_ONE_TO_ONE' || studLegacy.mappingCount !== 5) throw new Error('stud legacy');
  return { wheel: wheel.status, hubLegacy: hubLegacy.status, bearingLegacy: bearingLegacy.status, studLegacy: studLegacy.mappingCount };
});

check('B07_static_only_and_legacy_duplicate_guards', () => {
  if (binding.getRenderPlan().mode !== 'STATIC_WORKHOLDING_DEMO') throw new Error('mode');
  expectCode(() => binding.getRenderPlan({ mode: 'VEHICLE' }), 'E_VEHICLE_PLACEMENT_UNAVAILABLE');
  expectCode(() => binding.getRenderPlan({ includeLegacyWithC01: true }), 'E_LEGACY_DUPLICATE_GEOMETRY');
  const legacyPlan = binding.getRenderPlan({ disableC01: true });
  if (legacyPlan.useC01 || legacyPlan.legacyGroups.length !== 3) throw new Error('legacy plan');
  return { c01: binding.getRenderPlan().mode, legacyGroups: legacyPlan.legacyGroups.length };
});

check('B08_instance_view_combines_detail_and_binding', () => {
  const view = binding.getInstanceView('PI-30-006-FL');
  if (view.bindingStatus !== 'C01_DEMO_SUBSTITUTE') throw new Error('binding status');
  if (!view.binding || view.binding.nodeIndex !== 4) throw new Error('hub node');
  if (!view.renderNode || view.renderNode.meshIndex !== 3) throw new Error('render node');
  if (view.detail.geometry.status !== 'NO_GEOMETRY') throw new Error('detail geometry');
  const wheel = binding.getBinding('PI-30-019-FL');
  if (wheel.ok !== false || wheel.code !== 'E_NOT_IN_C01_PACKAGE' || wheel.fallback.status !== 'NO_GEOMETRY') throw new Error('unbound view');
  return { hubNode: view.binding.nodeIndex, wheel: wheel.code };
});

check('B09_snapshot_and_variant_mismatches_fail_closed', () => {
  const badSnapshot = clone(manifest);
  badSnapshot.snapshotBinding.snapshotSha256 = '0'.repeat(64);
  expectCode(() => build({ manifest: badSnapshot }), 'E_SNAPSHOT_MISMATCH');
  const badVariant = clone(manifest);
  badVariant.snapshotBinding.variantId = 'VAR-WRONG';
  expectCode(() => build({ manifest: badVariant }), 'E_VARIANT_MISMATCH');
  const badRevision = clone(manifest);
  badRevision.snapshotBinding.revision = 99;
  expectCode(() => build({ manifest: badRevision }), 'E_SNAPSHOT_MISMATCH');
  return { checked: 3 };
});

check('B10_glb_hash_and_package_id_fail_closed', () => {
  expectCode(() => build({ glbSha256: '0'.repeat(64) }), 'E_GLB_HASH_MISMATCH');
  expectCode(() => build({ expectedPackageId: 'wrong-package' }), 'E_PACKAGE_ID_MISMATCH');
  expectCode(() => build({ expectedGlbSha256: 'f'.repeat(64) }), 'E_GLB_HASH_MISMATCH');
  return { checked: 3 };
});

check('B11_manifest_instance_set_failures', () => {
  const missing = clone(manifest);
  missing.instances = missing.instances.slice(0, 8);
  expectCode(() => build({ manifest: missing }), 'E_INSTANCE_SET_MISMATCH');
  const duplicate = clone(manifest);
  duplicate.instances[8].partInstanceId = duplicate.instances[0].partInstanceId;
  expectCode(() => build({ manifest: duplicate }), 'E_INSTANCE_DUPLICATE');
  const unknown = clone(manifest);
  unknown.instances[4].partInstanceId = 'PI-99-999-FL';
  expectCode(() => build({ manifest: unknown }), 'E_INSTANCE_NOT_IN_SNAPSHOT');
  const part = clone(manifest);
  part.instances[0].partId = 'PART-WRONG';
  expectCode(() => build({ manifest: part }), 'E_PART_MISMATCH');
  const assembly = clone(manifest);
  assembly.instances[0].assemblyInstanceId = 'AI-WRONG';
  expectCode(() => build({ manifest: assembly }), 'E_ASSEMBLY_MISMATCH');
  const frame = clone(manifest);
  frame.instances[0].snapshotFrameId = 'FR-WRONG';
  expectCode(() => build({ manifest: frame }), 'E_FRAME_MISMATCH');
  return { checked: 6 };
});

check('B12_glb_node_and_mesh_failures', () => {
  const missing = clone(glbJson);
  missing.nodes[9].extras.partInstanceId = 'PI-30-009-FL-99';
  expectCode(() => build({ glbJson: missing }), 'E_NODE_MISSING');
  const duplicate = clone(glbJson);
  duplicate.nodes[8].extras.partInstanceId = duplicate.nodes[9].extras.partInstanceId;
  duplicate.nodes[8].name = duplicate.nodes[9].name;
  expectCode(() => build({ glbJson: duplicate }), 'E_NODE_DUPLICATE');
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
  return { checked: 6 };
});

check('B13_package_missing_and_unknown_instance', () => {
  expectCode(() => loadWheelEndAssetBindingFromDisk(root, { packageDir: 'cad/experiments/vehicle-cad-pipeline-v1/out/does-not-exist' }), 'E_PACKAGE_MISSING');
  expectCode(() => binding.getBinding('PI-99-999-FL'), 'E_UNKNOWN_INSTANCE');
  return { checked: 2 };
});

check('B14_live_node_transform_changes_binding', () => {
  const moved = clone(glbJson);
  moved.nodes[4].translation = [0.009, 0, 0];
  const next = build({ glbJson: moved });
  const hub = next.getBinding('PI-30-006-FL');
  if (!close(hub.localTransform.translation[0], 0.009, 1e-9)) throw new Error('translation not read from GLB');
  if (!close(hub.matrixWorldGlb[3], 0.009, 1e-9)) throw new Error('matrix not composed');
  return { translationM: hub.localTransform.translation[0] };
});

check('B15_read_only_inputs_not_mutated', () => {
  const manifestBefore = JSON.stringify(manifest);
  const glbBefore = JSON.stringify(glbJson);
  binding.listBindings();
  binding.getRenderPlan();
  binding.getFallbackStatus('PI-30-019-FL');
  binding.getInstanceView('PI-30-006-FL');
  if (JSON.stringify(manifest) !== manifestBefore) throw new Error('manifest mutated');
  if (JSON.stringify(glbJson) !== glbBefore) throw new Error('glb json mutated');
  return { unchanged: true };
});

await checkAsync('B16_same_origin_5173_assets', async () => {
  const origin = 'http://localhost:5173';
  const webBinding = await loadWheelEndAssetBindingFromUrls({
    snapshotUrl: `${origin}/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.json`,
    consumerIndexUrl: `${origin}/src-experiments/vehicle-snapshot-v1/fixtures/vehicle-snapshot.consumer.json`,
    manifestUrl: `${origin}/${DEFAULT_PACKAGE_DIR}/manifest.json`,
    glbUrl: `${origin}/${DEFAULT_PACKAGE_DIR}/wheel-end.glb`,
    expectedOrigin: origin,
    expectedPackageId: DEFAULT_PACKAGE_ID,
    expectedGlbSha256: DEFAULT_GLB_SHA256
  });
  const status = webBinding.getStatus();
  if (status.glbSha256 !== binding.getStatus().glbSha256) throw new Error('web hash');
  if (status.counts.c01Instances !== 9) throw new Error('web instances');
  return { origin, packageId: status.packageId, glbSha256: status.glbSha256.slice(0, 16) };
});

await checkAsync('B17_cross_origin_is_rejected', async () => {
  try {
    await loadWheelEndAssetBindingFromUrls({
      snapshotUrl: 'https://example.com/snapshot.json',
      consumerIndexUrl: 'https://example.com/index.json',
      manifestUrl: 'https://example.com/manifest.json',
      glbUrl: 'https://example.com/wheel-end.glb',
      expectedOrigin: 'http://localhost:5173',
      fetchImpl: async () => ({ ok: true })
    });
  } catch (error) {
    if (error.code !== 'E_CROSS_ORIGIN_ASSET') throw new Error(`expected E_CROSS_ORIGIN_ASSET, got ${error.code}`);
    return { checked: true };
  }
  throw new Error('expected E_CROSS_ORIGIN_ASSET, but no error was thrown');
});

const failed = checks.filter((item) => !item.pass);
const output = {
  schema: 'carlab.r32.wheelEndBindingCheck.v1',
  date: '2026-11-21',
  command: 'node src-experiments/wheel-end-asset-binding-v1/run-checks.mjs',
  packageId: DEFAULT_PACKAGE_ID,
  snapshotId: binding.snapshotId,
  revision: binding.revision,
  manifestSha256,
  glbSha256,
  passCount: checks.length - failed.length,
  failCount: failed.length,
  failed: failed.map((item) => item.id),
  checks
};
mkdirSync(join(root, 'agent-workspace/agents/deepseek/reports'), { recursive: true });
writeFileSync(join(root, 'agent-workspace/agents/deepseek/reports/R-32-binding-check-results.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ passCount: output.passCount, failCount: output.failCount, failed: output.failed, checks: output.checks }, null, 2));
if (failed.length) process.exit(1);

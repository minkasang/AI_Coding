import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createVehicleConsumer,
  fetchVehicleConsumer,
  sha256Hex
} from '../consumer.mjs';
import { loadSnapshotBundle, loadVehicleConsumer } from '../node-loader.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const bundle = loadSnapshotBundle(root);
const consumer = loadVehicleConsumer(root);
const clone = (value) => JSON.parse(JSON.stringify(value));

function expectCode(run, code) {
  assert.throws(run, (error) => error.code === code, `expected ${code}`);
}
async function expectRejects(promise, code) {
  await assert.rejects(promise, (error) => error.code === code, `expected ${code}`);
}
function collectTree() {
  const systems = consumer.getTreePage({ parentId: null, limit: 200 });
  const assemblies = [];
  const parts = [];
  for (const system of systems.nodes) {
    if (!system.hasChildren) continue;
    const assemblyPage = consumer.getTreePage({ parentId: system.nodeId, limit: 200 });
    for (const assembly of assemblyPage.nodes) {
      assemblies.push(assembly);
      const partPage = consumer.getTreePage({ parentId: assembly.nodeId, limit: 200 });
      parts.push(...partPage.nodes);
    }
  }
  return { systems, assemblies, parts };
}

test('control: the real snapshot loads, verifies and returns 278 parts', () => {
  assert.equal(consumer.snapshotId, 'SNAP-R27-R16-R21-R22-R23-01');
  assert.equal(consumer.revision, 1);
  const integrity = consumer.verifyIntegrity();
  assert.equal(integrity.ok, true);
  assert.equal(integrity.snapshotSha256, bundle.snapshotSha256);
  assert.equal(integrity.counts.partInstances, 278);
});

test('the root tree is 13 systems and the full tree covers 278 parts / 37 assemblies', () => {
  const { systems, assemblies, parts } = collectTree();
  assert.equal(systems.total, 13);
  assert.equal(new Set(assemblies.map((item) => item.selectionId)).size, 37);
  assert.equal(parts.length, 278);
  assert.equal(new Set(parts.map((item) => item.selectionId)).size, 278);
  const mapped = parts.filter((part) => part.mappingStatus === 'MAPPED_R21').length;
  assert.equal(mapped, 13);
  assert.equal(parts.filter((part) => part.mappingStatus === 'R16_CANONICAL_ONLY').length, 265);
});

test('pagination and query are deterministic', () => {
  const first = consumer.getTreePage({ limit: 5 });
  const second = consumer.getTreePage({ limit: 5, offset: first.nextOffset });
  assert.equal(first.nodes.length, 5);
  assert.equal(first.total, 13);
  assert.equal(first.hasMore, true);
  assert.equal(second.nodes.length, 5);
  assert.notEqual(second.nodes[0].nodeId, first.nodes[0].nodeId);
  const filtered = consumer.getTreePage({ query: '悬架' });
  assert.ok(filtered.nodes.some((node) => node.label.includes('悬架')));
  assert.equal(consumer.getTreePage({ limit: 200 }).total, 13);
});

test('PI selection is canonical and stable', () => {
  const result = consumer.selectVehiclePart('PI-20-001-FL');
  assert.equal(result.ok, true);
  assert.equal(result.selection.selectionKey, 'partInstanceId');
  assert.equal(result.canonicalInstanceId, 'PI-20-001-FL');
  assert.equal(result.aliasUsed, false);
  assert.deepEqual(consumer.getSelection(), { selectionKey: 'partInstanceId', selectionId: 'PI-20-001-FL', revision: 1 });
  assert.equal(consumer.clearSelection().selection, null);
});

test('projection aliases are conditional and never become canonical identity', () => {
  expectCode(() => consumer.selectVehiclePart('INST-SLA-UPPER-ARM-FL'), 'E_ALIAS_NOT_CANONICAL');
  const allowed = consumer.selectVehiclePart('INST-SLA-UPPER-ARM-FL', { allowProjectionAlias: true });
  assert.equal(allowed.aliasUsed, true);
  assert.equal(allowed.aliasStatus, 'VIEW_LOCAL_NOT_CANONICAL');
  assert.equal(allowed.canonicalInstanceId, 'PI-20-001-FL');
  assert.deepEqual(allowed.warnings, ['PROJECTION_ALIAS_USED']);
  expectCode(() => consumer.selectVehiclePart('ASM-WHEEL-END-FL'), 'E_NOT_A_PART');
  expectCode(() => consumer.selectVehiclePart('ASM-WHEEL-END-FL', { allowProjectionAlias: true }), 'E_NOT_A_PART');
  const resolved = consumer.resolveAlias('INST-HUB-FL');
  assert.equal(resolved.canonicalInstanceId, 'PI-30-006-FL');
  assert.equal(resolved.aliasKind, 'R17_PROJECTION');
  const roleAlias = consumer.resolveAlias('INST-SLA-HUB-FL');
  assert.equal(roleAlias.canonicalInstanceId, 'PI-30-006-FL');
  assert.equal(roleAlias.aliasKind, 'R18_ROLE_SOURCE');
  assert.equal(roleAlias.roleOnly, true);
});

test('the unbound tie-rod alias explains why it cannot be selected', () => {
  assert.throws(() => consumer.resolveAlias('INST-SLA-TIEROD-FL'), (error) => {
    assert.equal(error.code, 'E_ALIAS_UNBOUND');
    assert.equal(error.details.role, 'TIEROD');
    return true;
  });
});

test('upper-arm detail disables strict pose but keeps the demo attachment', () => {
  const detail = consumer.getObjectDetail('PI-20-001-FL');
  assert.equal(detail.nodeKind, 'partInstance');
  assert.equal(detail.identity.partId, 'PART-20-001');
  assert.equal(detail.geometry.status, 'NO_GEOMETRY');
  assert.equal(detail.geometry.canRenderStrict, false);
  assert.equal(detail.geometry.canRenderDemoGeometry, false);
  assert.equal(detail.pose.strict.available, false);
  assert.equal(detail.pose.demo.available, true);
  assert.equal(detail.pose.demo.attachTo, 'PART');
  assert.equal(detail.roleBinding.role, 'UPPER_ARM');
});

test('hub detail keeps the role marker and demo CAD separate from engineering geometry', () => {
  const detail = consumer.getObjectDetail('PI-30-006-FL');
  assert.equal(detail.identity.partId, 'PART-30-006');
  assert.equal(detail.geometry.status, 'NO_GEOMETRY');
  assert.equal(detail.geometry.demoCad.mappingStatus, 'DEMO_SUBSTITUTE');
  assert.equal(detail.geometry.demoCad.instanceId, 'PI-30-006-FL');
  assert.equal(detail.roleBinding.role, 'HUB');
  assert.equal(detail.roleBinding.r27.bindingStatus, 'CANDIDATE_ROLE_BINDING');
  assert.equal(detail.roleBinding.r27.notARigidPartPose, true);
  assert.equal(detail.pose.demo.attachTo, 'ROLE_MARKER');
  assert.ok(detail.relatedConflicts.includes('R27-CF-01'));
});

test('required deferred and variant-undecided definitions remain visible without instances', () => {
  const tie = consumer.getObjectDetail('PART-20-075');
  assert.equal(tie.nodeKind, 'partDefinition');
  assert.equal(tie.instanceCount, 0);
  assert.equal(tie.flags.requiredButDeferred.status, 'REQUIRED_BUT_DEFERRED');
  assert.equal(tie.flags.requiredButDeferred.downstreamMustNotOmit, true);
  const bracket = consumer.getObjectDetail('PART-40-048');
  assert.equal(bracket.instanceCount, 0);
  assert.equal(bracket.flags.variantDecision.status, 'VARIANT_UNDECIDED');
  assert.ok(bracket.displayStatus.badges.includes('VARIANT_UNDECIDED'));
});

test('assembly, system and placeholder details are available', () => {
  const assembly = consumer.getObjectDetail('AI-30-001-FL');
  assert.equal(assembly.nodeKind, 'assemblyInstance');
  assert.equal(assembly.definitionRef, 'ASSY-30-001');
  assert.ok(assembly.partInstanceIds.includes('PI-30-031-FL'));
  const system = consumer.getObjectDetail('SYS-20');
  assert.equal(system.nodeKind, 'system');
  assert.ok(system.assemblyInstanceIds.length > 0);
  assert.ok(system.subsystemIds.includes('SUB-20-01'));
  const placeholder = consumer.getObjectDetail('ASSY-50-001');
  assert.equal(placeholder.nodeKind, 'assemblyDefinition');
  assert.equal(placeholder.definition.isPlaceholder, true);
  assert.ok(placeholder.relatedConflicts.includes('R21-CF-01'));
});

test('display status reports the read-only, stale and no-geometry boundaries', () => {
  const status = consumer.getDisplayStatus();
  assert.equal(status.pose.strict.status, 'STALE');
  assert.equal(status.pose.strict.playbackAllowed, false);
  assert.equal(status.pose.strict.currentFrames, 0);
  assert.equal(status.pose.demo.frames, 9);
  assert.ok(status.pose.demo.badge.includes('STALE'));
  assert.equal(status.geometry.noGeometryInstances, 278);
  assert.equal(status.geometry.demoCadBindings, 1);
  assert.equal(status.variant.alignmentStatus, 'BLOCKED_PENDING_ADJUDICATION');
  assert.equal(status.conflicts.total, 24);
  assert.equal(status.readyForProductionMotion, false);
});

test('workspace state keeps the snapshot read-only and gates demo actions', () => {
  const model = consumer.getWorkspaceState({ mode: 'model' });
  assert.equal(model.capabilities.canEditSnapshot, false);
  assert.equal(model.capabilities.canSaveSnapshot, false);
  assert.equal(model.capabilities.canAddPart, false);
  assert.equal(model.capabilities.canSaveProject, 'EXTERNAL_PROJECT_STORE_ONLY');
  const inspect = consumer.getWorkspaceState({ mode: 'inspect' });
  assert.equal(inspect.capabilities.canSelectTree, true);
  assert.equal(inspect.capabilities.canPlayStrictPose, false);
  assert.equal(inspect.capabilities.canPlayDemoPose, false);
  const demo = consumer.getWorkspaceState({ mode: 'inspect', demoMode: true });
  assert.equal(demo.capabilities.canPlayDemoPose, true);
  assert.deepEqual(demo.requiredBadges, [consumer.getDisplayStatus().pose.demo.badge]);
});

test('selection restore rejects stale revisions and alias keys', () => {
  assert.equal(consumer.restoreSelection({ selectionKey: 'partInstanceId', selectionId: 'PI-20-001-FL', revision: 1 }).ok, true);
  expectCode(() => consumer.restoreSelection({ selectionKey: 'partInstanceId', selectionId: 'PI-20-001-FL', revision: 2 }), 'E_SELECTION_STALE');
  expectCode(() => consumer.restoreSelection({ selectionKey: 'instanceId', selectionId: 'INST-HUB-FL', revision: 1 }), 'E_ALIAS_NOT_CANONICAL');
});

test('strict pose consumption fails closed', () => {
  expectCode(() => consumer.consumePoseRun({}), 'E_REVISION_REQUIRED');
  expectCode(() => consumer.consumePoseRun({ revision: 2 }), 'E_REVISION_MISMATCH');
  expectCode(() => consumer.consumePoseRun({ revision: 1, frameId: 'FR-ENGINEERING' }), 'E_FRAME_MISMATCH');
  assert.throws(() => consumer.consumePoseRun({ revision: 1 }), (error) => {
    assert.equal(error.code, 'E_STALE_RUN');
    assert.equal(error.details.demoAvailable, true);
    return true;
  });
});

test('demo playback requires explicit mode, badge and source revision', () => {
  expectCode(() => consumer.getDemoPoseFrame({ frameIndex: 0, sourceRevision: 3 }), 'E_DEMO_MODE_REQUIRED');
  expectCode(() => consumer.getDemoPoseFrame({ frameIndex: 0, demoMode: true, sourceRevision: 3 }), 'E_BADGE_NOT_ACKNOWLEDGED');
  expectCode(() => consumer.getDemoPoseFrame({ frameIndex: 0, demoMode: true, acknowledgeBadge: true, sourceRevision: 1 }), 'E_SOURCE_REVISION_MISMATCH');
  expectCode(() => consumer.getDemoPoseFrame({ frameIndex: 99, demoMode: true, acknowledgeBadge: true, sourceRevision: 3 }), 'E_FRAME_INDEX');
  const frame = consumer.getDemoPoseFrame({ frameIndex: 4, demoMode: true, acknowledgeBadge: true, sourceRevision: 3 });
  assert.equal(frame.status, 'DEMO_ONLY');
  assert.equal(frame.notCurrent, true);
  assert.equal(frame.frame.poses.length, 5);
  assert.equal(frame.frame.poses.filter((pose) => pose.attachTo === 'PART').length, 3);
  assert.equal(frame.frame.poses.filter((pose) => pose.attachTo === 'ROLE_MARKER').length, 1);
  assert.equal(frame.frame.poses.filter((pose) => pose.attachTo === 'NONE').length, 1);
});

test('unknown ids, parents, aliases and pagination fail with explainable codes', () => {
  expectCode(() => consumer.selectVehiclePart('PI-99-999-FL'), 'E_UNKNOWN_ID');
  expectCode(() => consumer.getObjectDetail('UNKNOWN-1'), 'E_UNKNOWN_ID');
  expectCode(() => consumer.getTreePage({ parentId: 'system:SYS-999' }), 'E_UNKNOWN_PARENT');
  expectCode(() => consumer.getTreePage({ limit: 0 }), 'E_PAGINATION');
  expectCode(() => consumer.getTreePage({ limit: 201 }), 'E_PAGINATION');
  expectCode(() => consumer.getTreePage({ offset: -1 }), 'E_PAGINATION');
  expectCode(() => consumer.resolveAlias('INST-NOT-REAL'), 'E_UNKNOWN_ALIAS');
  expectCode(() => consumer.getWorkspaceState({ mode: 'drive' }), 'E_MODE');
});

test('snapshot hash, schema and counts fail closed at construction', () => {
  expectCode(() => createVehicleConsumer({ snapshot: bundle.snapshot, consumerIndex: bundle.consumerIndex }), 'E_SNAPSHOT_UNVERIFIED');
  expectCode(() => createVehicleConsumer({ ...bundle, snapshotSha256: '0'.repeat(64) }), 'E_SNAPSHOT_HASH_MISMATCH');
  const badCounts = clone(bundle.snapshot);
  badCounts.counts.partInstances = 999;
  expectCode(() => createVehicleConsumer({ snapshot: badCounts, consumerIndex: bundle.consumerIndex, snapshotSha256: bundle.snapshotSha256 }), 'E_SNAPSHOT_INVALID');
  const badIndex = { ...bundle.consumerIndex, schemaVersion: 'wrong' };
  expectCode(() => createVehicleConsumer({ snapshot: bundle.snapshot, consumerIndex: badIndex, snapshotSha256: bundle.snapshotSha256 }), 'E_CONSUMER_INDEX_INVALID');
});

test('WebCrypto and the fetch helper verify the same snapshot hash', async () => {
  const hash = await sha256Hex(bundle.snapshotText);
  assert.equal(hash, bundle.snapshotSha256);
  const fetchOk = async (url) => (url.endsWith('index.json')
    ? { ok: true, json: async () => bundle.consumerIndex }
    : { ok: true, text: async () => bundle.snapshotText });
  const fetched = await fetchVehicleConsumer({ snapshotUrl: 'snapshot.json', indexUrl: 'index.json', fetchImpl: fetchOk });
  assert.equal(fetched.snapshotId, consumer.snapshotId);
  const badIndex = { ...bundle.consumerIndex, snapshotSha256: 'f'.repeat(64) };
  const fetchBad = async (url) => (url.endsWith('index.json')
    ? { ok: true, json: async () => badIndex }
    : { ok: true, text: async () => bundle.snapshotText });
  await expectRejects(fetchVehicleConsumer({ snapshotUrl: 'snapshot.json', indexUrl: 'index.json', fetchImpl: fetchBad }), 'E_SNAPSHOT_HASH_MISMATCH');
});

test('read-only consumer operations do not mutate the source snapshot', () => {
  const before = JSON.stringify(bundle.snapshot);
  consumer.selectVehiclePart('PI-30-006-FL');
  consumer.getObjectDetail('PI-30-006-FL');
  consumer.getDisplayStatus();
  consumer.getWorkspaceState({ mode: 'inspect', demoMode: true });
  consumer.getDemoPoseFrame({ frameIndex: 0, demoMode: true, acknowledgeBadge: true, sourceRevision: 3 });
  const after = JSON.stringify(bundle.snapshot);
  assert.equal(after, before);
});

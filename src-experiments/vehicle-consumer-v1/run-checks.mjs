import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVehicleConsumer, sha256Hex } from './consumer.mjs';
import { DEFAULT_ROOT, loadSnapshotBundle, loadVehicleConsumer } from './node-loader.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = DEFAULT_ROOT;
const bundle = loadSnapshotBundle(root);
const consumer = loadVehicleConsumer(root);
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
function expectCode(code, run) {
  try {
    run();
  } catch (error) {
    if (error.code !== code) throw new Error(`expected ${code}, got ${error.code}: ${error.message}`);
    return { expected: code };
  }
  throw new Error(`expected ${code}, but no error was thrown`);
}
function collectTree() {
  const systems = consumer.getTreePage({ parentId: null, limit: 200 });
  const assemblyIds = [];
  const partIds = [];
  for (const system of systems.nodes) {
    if (!system.hasChildren) continue;
    let offset = 0;
    for (;;) {
      const page = consumer.getTreePage({ parentId: system.nodeId, offset, limit: 200 });
      for (const assembly of page.nodes) {
        assemblyIds.push(assembly.selectionId);
        let partOffset = 0;
        for (;;) {
          const parts = consumer.getTreePage({ parentId: assembly.nodeId, offset: partOffset, limit: 200 });
          for (const part of parts.nodes) partIds.push(part.selectionId);
          if (!parts.hasMore) break;
          partOffset = parts.nextOffset;
        }
      }
      if (!page.hasMore) break;
      offset = page.nextOffset;
    }
  }
  return { systems, assemblyIds, partIds };
}

check('C01_integrity_and_hash', () => {
  const result = consumer.verifyIntegrity();
  if (!result.ok || result.snapshotSha256 !== bundle.snapshotSha256) throw new Error('integrity mismatch');
  return { snapshotId: result.snapshotId, revision: result.revision, parts: result.counts.partInstances };
});

check('C02_root_tree_is_13_systems', () => {
  const page = consumer.getTreePage({ parentId: null, limit: 200 });
  if (page.total !== 13 || page.nodes.length !== 13) throw new Error(`expected 13 systems, got ${page.total}`);
  return { total: page.total };
});

check('C03_tree_covers_278_parts_and_37_assemblies', () => {
  const { systems, assemblyIds, partIds } = collectTree();
  if (systems.total !== 13) throw new Error('system count');
  if (new Set(assemblyIds).size !== 37) throw new Error(`assembly count ${new Set(assemblyIds).size}`);
  if (partIds.length !== 278 || new Set(partIds).size !== 278) throw new Error(`part count ${partIds.length}/${new Set(partIds).size}`);
  const mapped = partIds.filter((id) => consumer.getObjectDetail(id).instance.projection.mappingCategory === 'MAPPED_R21').length;
  if (mapped !== 13) throw new Error(`mapped count ${mapped}`);
  return { systems: systems.total, assemblies: new Set(assemblyIds).size, parts: new Set(partIds).size, mapped, canonicalOnly: 278 - mapped };
});

check('C04_pi_selection_is_stable', () => {
  const result = consumer.selectVehiclePart('PI-20-001-FL');
  if (!result.ok || result.selection.selectionKey !== 'partInstanceId') throw new Error('selection');
  if (result.canonicalInstanceId !== 'PI-20-001-FL' || result.aliasUsed) throw new Error('canonical identity');
  const workspace = consumer.getWorkspaceState({ mode: 'inspect' });
  if (workspace.selection?.selectionId !== 'PI-20-001-FL') throw new Error('workspace selection');
  const restored = consumer.restoreSelection({ selectionKey: 'partInstanceId', selectionId: 'PI-20-001-FL', revision: consumer.revision });
  if (!restored.ok) throw new Error('restore');
  return { selection: result.selection };
});

check('C05_alias_is_conditional_and_never_canonical', () => {
  expectCode('E_ALIAS_NOT_CANONICAL', () => consumer.selectVehiclePart('INST-SLA-UPPER-ARM-FL'));
  const allowed = consumer.selectVehiclePart('INST-SLA-UPPER-ARM-FL', { allowProjectionAlias: true });
  if (!allowed.aliasUsed || allowed.canonicalInstanceId !== 'PI-20-001-FL' || allowed.aliasStatus !== 'VIEW_LOCAL_NOT_CANONICAL') throw new Error('alias projection');
  expectCode('E_NOT_A_PART', () => consumer.selectVehiclePart('ASM-WHEEL-END-FL', { allowProjectionAlias: true }));
  const resolved = consumer.resolveAlias('INST-HUB-FL');
  if (resolved.canonicalInstanceId !== 'PI-30-006-FL' || !resolved.conditional) throw new Error('R17 alias');
  return { alias: resolved };
});

check('C06_unbound_required_alias_is_explained', () => {
  const error = expectCode('E_ALIAS_UNBOUND', () => consumer.resolveAlias('INST-SLA-TIEROD-FL'));
  return error;
});

check('C07_hub_detail_keeps_role_marker_and_demo_cad_separate', () => {
  const detail = consumer.getObjectDetail('PI-30-006-FL');
  if (detail.identity.partId !== 'PART-30-006') throw new Error('part');
  if (detail.geometry.status !== 'NO_GEOMETRY' || !detail.geometry.demoCad) throw new Error('geometry');
  if (detail.roleBinding?.role !== 'HUB' || detail.roleBinding.r27.bindingStatus !== 'CANDIDATE_ROLE_BINDING') throw new Error('role');
  if (!detail.roleBinding.r27.notARigidPartPose) throw new Error('role-only');
  if (!detail.relatedConflicts.includes('R27-CF-01')) throw new Error('conflict');
  return { badges: detail.displayStatus.badges, demoCad: detail.geometry.demoCad.mappingStatus };
});

check('C08_upper_arm_strict_pose_is_disabled_but_demo_available', () => {
  const detail = consumer.getObjectDetail('PI-20-001-FL');
  if (detail.pose.strict.available !== false) throw new Error('strict pose should be disabled');
  if (!detail.pose.demo.available || detail.pose.demo.attachTo !== 'PART') throw new Error('demo pose');
  if (detail.geometry.canRenderStrict !== false || detail.geometry.canRenderDemoGeometry !== false) throw new Error('geometry claims');
  return { pose: detail.pose };
});

check('C09_required_deferred_and_variant_undecided_are_visible', () => {
  const tie = consumer.getObjectDetail('PART-20-075');
  if (tie.instanceCount !== 0 || tie.flags.requiredButDeferred?.status !== 'REQUIRED_BUT_DEFERRED') throw new Error('tie rod');
  const bracket = consumer.getObjectDetail('PART-40-048');
  if (bracket.flags.variantDecision?.status !== 'VARIANT_UNDECIDED') throw new Error('bracket');
  return { tie: tie.flags.requiredButDeferred.status, bracket: bracket.flags.variantDecision.status };
});

check('C10_display_status_reports_stale_demo_and_conflicts', () => {
  const status = consumer.getDisplayStatus();
  if (status.pose.strict.status !== 'STALE' || status.pose.strict.playbackAllowed !== false) throw new Error('strict status');
  if (status.pose.demo.frames !== 9 || !status.pose.demo.badge.includes('STALE')) throw new Error('demo status');
  if (status.geometry.noGeometryInstances !== 278 || status.geometry.demoCadBindings !== 1) throw new Error('geometry status');
  if (status.conflicts.total !== 24 || status.conflicts.open !== 24) throw new Error('conflicts');
  if (status.variant.alignmentStatus !== 'BLOCKED_PENDING_ADJUDICATION') throw new Error('variant');
  return { pose: status.pose, geometry: status.geometry, conflicts: status.conflicts };
});

check('C11_strict_pose_run_fails_closed', () => {
  expectCode('E_REVISION_MISMATCH', () => consumer.consumePoseRun({ revision: 2 }));
  expectCode('E_STALE_RUN', () => consumer.consumePoseRun({ revision: 1 }));
  expectCode('E_FRAME_MISMATCH', () => consumer.consumePoseRun({ revision: 1, frameId: 'FR-ENGINEERING' }));
  expectCode('E_REVISION_REQUIRED', () => consumer.consumePoseRun({}));
  return { strict: 'blocked' };
});

check('C12_demo_playback_requires_explicit_flags', () => {
  expectCode('E_DEMO_MODE_REQUIRED', () => consumer.getDemoPoseFrame({ frameIndex: 0, sourceRevision: 3 }));
  expectCode('E_BADGE_NOT_ACKNOWLEDGED', () => consumer.getDemoPoseFrame({ frameIndex: 0, demoMode: true, sourceRevision: 3 }));
  expectCode('E_SOURCE_REVISION_MISMATCH', () => consumer.getDemoPoseFrame({ frameIndex: 0, demoMode: true, acknowledgeBadge: true, sourceRevision: 1 }));
  const frame = consumer.getDemoPoseFrame({ frameIndex: 4, demoMode: true, acknowledgeBadge: true, sourceRevision: 3 });
  if (frame.status !== 'DEMO_ONLY' || frame.notCurrent !== true || frame.frame.poses.length !== 5) throw new Error('demo frame');
  const attach = frame.frame.poses.reduce((counts, pose) => {
    counts[pose.attachTo] = (counts[pose.attachTo] || 0) + 1;
    return counts;
  }, {});
  if (attach.PART !== 3 || attach.ROLE_MARKER !== 1 || attach.NONE !== 1) throw new Error(JSON.stringify(attach));
  return { badge: frame.badge, attach };
});

check('C13_workspace_state_keeps_snapshot_read_only', () => {
  const model = consumer.getWorkspaceState({ mode: 'model' });
  if (model.capabilities.canEditSnapshot || model.capabilities.canSaveSnapshot || model.capabilities.canAddPart) throw new Error('model edit claims');
  if (model.capabilities.canSaveProject !== 'EXTERNAL_PROJECT_STORE_ONLY') throw new Error('save boundary');
  const inspect = consumer.getWorkspaceState({ mode: 'inspect' });
  if (!inspect.capabilities.canSelectTree || inspect.capabilities.canPlayStrictPose) throw new Error('inspect capabilities');
  expectCode('E_MODE', () => consumer.getWorkspaceState({ mode: 'drive' }));
  return { model: model.capabilities, inspect: inspect.capabilities };
});

check('C14_selection_restore_rejects_stale_or_alias_key', () => {
  const ok = consumer.restoreSelection({ selectionKey: 'partInstanceId', selectionId: 'PI-20-001-FL', revision: consumer.revision });
  if (!ok.ok) throw new Error('valid restore');
  expectCode('E_SELECTION_STALE', () => consumer.restoreSelection({ selectionKey: 'partInstanceId', selectionId: 'PI-20-001-FL', revision: consumer.revision + 1 }));
  expectCode('E_ALIAS_NOT_CANONICAL', () => consumer.restoreSelection({ selectionKey: 'instanceId', selectionId: 'INST-HUB-FL', revision: consumer.revision }));
  return { restored: ok.selection };
});

check('C15_snapshot_hash_fails_closed', () => {
  const tampered = '0'.repeat(64);
  expectCode('E_SNAPSHOT_HASH_MISMATCH', () => createVehicleConsumer({ ...bundle, snapshotSha256: tampered }));
  expectCode('E_SNAPSHOT_UNVERIFIED', () => createVehicleConsumer({ snapshot: bundle.snapshot, consumerIndex: bundle.consumerIndex }));
  return { hash: 'checked' };
});

check('C16_unknown_ids_and_pagination_errors', () => {
  expectCode('E_UNKNOWN_ID', () => consumer.selectVehiclePart('PI-99-999-FL'));
  expectCode('E_UNKNOWN_PARENT', () => consumer.getTreePage({ parentId: 'system:SYS-999' }));
  expectCode('E_PAGINATION', () => consumer.getTreePage({ limit: 0 }));
  expectCode('E_PAGINATION', () => consumer.getTreePage({ limit: 201 }));
  expectCode('E_UNKNOWN_ALIAS', () => consumer.resolveAlias('INST-NOT-REAL'));
  return { errors: 'checked' };
});

check('C18_consumer_does_not_mutate_snapshot', () => {
  const before = JSON.stringify(bundle.snapshot);
  consumer.selectVehiclePart('PI-30-006-FL');
  consumer.getObjectDetail('PI-30-006-FL');
  consumer.getDisplayStatus();
  consumer.getDemoPoseFrame({ frameIndex: 0, demoMode: true, acknowledgeBadge: true, sourceRevision: 3 });
  try { consumer.consumePoseRun({ revision: 1 }); } catch { /* expected stale */ }
  const after = JSON.stringify(bundle.snapshot);
  if (before !== after) throw new Error('snapshot mutated');
  return { unchanged: true };
});

check('C19_pagination_and_query_work', () => {
  const first = consumer.getTreePage({ limit: 5 });
  const second = consumer.getTreePage({ limit: 5, offset: first.nextOffset });
  if (first.nodes.length !== 5 || !first.hasMore || first.nextOffset !== 5) throw new Error('page 1');
  if (second.nodes.length !== 5 || second.nodes[0].nodeId === first.nodes[0].nodeId) throw new Error('page 2');
  const filtered = consumer.getTreePage({ query: '悬架' });
  if (!filtered.nodes.some((node) => node.label.includes('悬架'))) throw new Error('query');
  return { first: first.nodes.length, second: second.nodes.length, filtered: filtered.total };
});

check('C20_assembly_and_placeholder_detail', () => {
  const assembly = consumer.getObjectDetail('AI-30-001-FL');
  if (assembly.nodeKind !== 'assemblyInstance' || assembly.partCount < 1) throw new Error('assembly detail');
  const placeholder = consumer.getObjectDetail('ASSY-50-001');
  if (placeholder.nodeKind !== 'assemblyDefinition' || !placeholder.definition.isPlaceholder) throw new Error('placeholder');
  return { assemblyParts: assembly.partCount, placeholder: placeholder.definition.canonicalName };
});

await checkAsync('C17_fetch_helper_verifies_hash', async () => {
  const realHash = await sha256Hex(bundle.snapshotText);
  if (realHash !== bundle.snapshotSha256) throw new Error('WebCrypto hash differs from Node hash');
  const fetchOk = async (url) => (url.endsWith('index.json')
    ? { ok: true, json: async () => bundle.consumerIndex }
    : { ok: true, text: async () => bundle.snapshotText });
  const { fetchVehicleConsumer } = await import('./consumer.mjs');
  const fetched = await fetchVehicleConsumer({ snapshotUrl: 'snapshot.json', indexUrl: 'index.json', fetchImpl: fetchOk });
  if (fetched.snapshotId !== consumer.snapshotId) throw new Error('fetched consumer');
  const badIndex = { ...bundle.consumerIndex, snapshotSha256: 'f'.repeat(64) };
  const fetchBad = async (url) => (url.endsWith('index.json')
    ? { ok: true, json: async () => badIndex }
    : { ok: true, text: async () => bundle.snapshotText });
  try {
    await fetchVehicleConsumer({ snapshotUrl: 'snapshot.json', indexUrl: 'index.json', fetchImpl: fetchBad });
  } catch (error) {
    if (error.code !== 'E_SNAPSHOT_HASH_MISMATCH') throw new Error(`expected E_SNAPSHOT_HASH_MISMATCH, got ${error.code}`);
    return { hash: realHash.slice(0, 16), mismatchRejected: true };
  }
  throw new Error('expected hash mismatch');
});

const failed = checks.filter((item) => !item.pass);
const output = {
  schema: 'carlab.r31.consumerCheck.v1',
  date: '2026-11-21',
  command: 'node src-experiments/vehicle-consumer-v1/run-checks.mjs',
  snapshotId: consumer.snapshotId,
  snapshotRevision: consumer.revision,
  snapshotSha256: bundle.snapshotSha256,
  passCount: checks.length - failed.length,
  failCount: failed.length,
  failed: failed.map((item) => item.id),
  checks
};
mkdirSync(join(root, 'agent-workspace/agents/deepseek/reports'), { recursive: true });
writeFileSync(join(root, 'agent-workspace/agents/deepseek/reports/R-31-consumer-check-results.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ passCount: output.passCount, failCount: output.failCount, failed: output.failed, checks: output.checks }, null, 2));
if (failed.length) process.exit(1);

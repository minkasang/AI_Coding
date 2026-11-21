import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildConsumerIndex,
  buildSnapshot,
  consumePoseRun,
  loadInputs,
  validateSnapshot,
  verifyInputHashes
} from '../snapshot.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const clone = (value) => JSON.parse(JSON.stringify(value));
const inputs = await loadInputs(root);
const base = buildSnapshot(inputs);
const baseReport = validateSnapshot(base);

const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

function mutate(apply) {
  const snapshot = clone(base);
  apply(snapshot);
  return validateSnapshot(snapshot);
}
function expectCode(report, code) {
  assert.ok(
    report.errors.some((error) => error.code === code),
    `expected ${code}; errors=${JSON.stringify(report.errors.map((error) => error.code))}`
  );
}

test('control: the live snapshot validates with zero errors and zero warnings', () => {
  assert.deepEqual(baseReport.errors, []);
  assert.deepEqual(baseReport.warnings, []);
  assert.equal(baseReport.ok, true);
});

test('input pins match the live files', () => {
  const report = verifyInputHashes(base, root);
  assert.deepEqual(report.errors, []);
  assert.equal(report.ok, true);
});

test('the full R-16 tree is preserved and every instance is NO_GEOMETRY', () => {
  const counts = base.counts;
  assert.equal(counts.systems, 13);
  assert.equal(counts.subsystems, 53);
  assert.equal(counts.assemblyDefinitions, 108);
  assert.equal(counts.assemblyInstances, 37);
  assert.equal(counts.partDefinitions, 493);
  assert.equal(counts.partInstances, 278);
  assert.equal(counts.mountFrames, 37);
  assert.equal(counts.references, 35);
  assert.equal(counts.noGeometryInstances, 278);
  assert.equal(counts.sourcedGeometryInstances, 0);
  assert.equal(base.tree.partInstances.length, inputs.r22.vehicleProject.partInstances.length);
  for (const instance of base.tree.partInstances) {
    assert.equal(instance.geometryStatus, 'NO_GEOMETRY');
    assert.equal(instance.inspectable, false);
    assert.equal(instance.quantity.perAssembly, 1);
    assert.equal(instance.qtySemantics, 'ONE_PHYSICAL_PIECE_PER_INSTANCE');
  }
});

test('canonical PI identity is preserved and relative to the R-22 integration', () => {
  const byId = new Map(base.tree.partInstances.map((instance) => [instance.partInstanceId, instance]));
  for (const source of inputs.r22.vehicleProject.partInstances) {
    const target = byId.get(source.instanceId);
    assert.ok(target, `missing ${source.instanceId}`);
    assert.equal(target.partId, source.partId);
    assert.equal(target.assemblyInstanceId, source.assemblyInstanceId);
    assert.equal(target.frameId, source.frameId);
    assert.equal(target.corner, source.corner);
    assert.equal(target.ordinal, source.ordinal);
  }
  assert.equal(base.counts.crosswalkMappedInstances, 13);
  assert.equal(base.counts.crosswalkUnmappedInstances, 265);
  for (const instance of base.tree.partInstances) {
    assert.match(instance.partInstanceId, /^PI-/);
    if (instance.projection) assert.match(instance.projection.r17PartInstanceId, /^INST-/);
  }
});

test('variant alignment is BLOCKED and never claims the two fixtures are one vehicle', () => {
  assert.equal(base.variant.variantId, 'VAR-R16-BOF-ICE');
  assert.equal(base.variant.projectionVariantId, 'VV-A-SWB-STD');
  assert.notEqual(base.variant.variantId, base.variant.projectionVariantId);
  assert.equal(base.variant.alignmentStatus, 'BLOCKED_PENDING_ADJUDICATION');
  assert.equal(base.variant.sameVehicleClaim, false);
  assert.equal(base.variant.generationAgrees, true);
  assert.equal(base.variant.r16ChoiceGroups.length, 10);
  assert.equal(base.variant.r17ChoiceGroups.length, 1);
});

test('canonical frames stay unanchored; projection frames are DEMO and never merged', () => {
  assert.equal(base.tree.mountFrames.canonical.length, 37);
  assert.equal(base.tree.mountFrames.canonicalUnanchoredCount, 37);
  for (const frame of base.tree.mountFrames.canonical) {
    assert.equal(frame.anchorStatus, 'UNANCHORED_UNKNOWN');
    assert.equal(frame.origin, null);
    assert.equal(frame.rotation, null);
    assert.equal(frame.units, null);
  }
  assert.equal(base.tree.mountFrames.projection.length, 21);
  assert.equal(base.tree.mountFrames.projectionNonZeroOriginCount, 11);
  assert.equal(base.tree.mountFrames.projectionScope.framesIncluded, 21);
  assert.equal(base.tree.mountFrames.projectionScope.r21TotalProjectionFrames, 27);
  assert.equal(base.tree.mountFrames.projectionScope.framesNotIncluded, 6);
  assert.equal(base.tree.mountFrames.projectionScope.r21ClaimedNonzeroOriginFrames, 14);
  assert.equal(base.tree.mountFrames.projectionScope.nonzeroOriginFramesIncluded, 11);
  for (const frame of base.tree.mountFrames.projection) {
    assert.equal(frame.notCanonical, true);
    assert.equal(frame.valueBasis, 'DEMO_ASSUMPTION');
  }
  assert.equal(base.tree.mountFrames.numericFrameConflict.distanceM, 1.276597);
});

test('quantity audit counts physical PI instances and preserves 12 conflicts', () => {
  assert.equal(base.qty.auditStatus, 'CONSISTENT');
  assert.equal(base.qty.conflicts.length, 12);
  assert.deepEqual(base.qty.derivedMismatchIds, base.qty.declaredConflictIds);
  assert.equal(base.qty.doubleCountExample.physicalInstances, 20);
  assert.equal(base.qty.doubleCountExample.naiveSumOfQtyPerCorner, 100);
  assert.equal(base.qty.doubleCountExample.correctTotal, 20);
  assert.equal(base.qty.doubleCountExample.inheritedVehicleTotal, 20);
  assert.equal(base.qty.bomLines, 190);
});

test('binding matrix reports 3 rigid parts + 1 hub role + 1 required deferred role', () => {
  assert.equal(base.bindingMatrix.length, 5);
  assert.equal(base.bindingMatrix.filter((row) => row.r27.bindingStatus === 'BOUND_RIGID_PART').length, 3);
  assert.equal(base.bindingMatrix.filter((row) => row.r27.bindingStatus === 'CANDIDATE_ROLE_BINDING').length, 1);
  assert.equal(base.bindingMatrix.filter((row) => row.r27.bindingStatus === 'REQUIRED_DEFERRED_NO_INSTANCE').length, 1);
  const hub = base.bindingMatrix.find((row) => row.role === 'HUB');
  assert.equal(hub.r22.bindingStatus, 'BOUND');
  assert.equal(hub.r23.bindingStatus, 'UNBOUND_NO_HUB_BODY');
  assert.equal(hub.r27.targetInstanceId, 'PI-30-006-FL');
  assert.equal(hub.r27.attachTo, 'ROLE_MARKER');
  assert.equal(hub.discrepancy.code, 'R27-DISC-HUB');
  const tie = base.bindingMatrix.find((row) => row.role === 'TIEROD');
  assert.equal(tie.r27.targetInstanceId, null);
  assert.equal(tie.r27.published, false);
  assert.equal(tie.discrepancy.status, 'CONSISTENT_UNBOUND_BUT_REQUIRED');
});

test('required deferred parts and caliper variant undecided are explicit', () => {
  const tie = base.tree.partDefinitions.find((definition) => definition.partDefinitionId === 'PART-20-075');
  assert.equal(tie.requiredButDeferred.status, 'REQUIRED_BUT_DEFERRED');
  assert.equal(tie.requiredButDeferred.downstreamMustNotOmit, true);
  const bracket = base.tree.partDefinitions.find((definition) => definition.partDefinitionId === 'PART-40-048');
  assert.equal(bracket.variantDecision.status, 'VARIANT_UNDECIDED');
  assert.equal(bracket.variantDecision.downstreamMustNotAssumePresenceOrAbsence, true);
});

test('strict pose run is STALE while the demo motion view is badged and complete', () => {
  assert.equal(base.poseRun.status, 'STALE');
  assert.equal(base.poseRun.sourceRevision, 3);
  assert.equal(base.poseRun.snapshotRevision, 1);
  assert.equal(base.poseRun.playbackAllowed, false);
  assert.deepEqual(base.poseRun.frames, []);
  assert.equal(base.poseRun.sourceFrameCount, 9);
  assert.equal(base.demoMotionView.status, 'DEMO_ONLY');
  assert.equal(base.demoMotionView.requiresDemoMode, true);
  assert.equal(base.demoMotionView.publishAsCurrent, false);
  assert.equal(base.demoMotionView.frames.length, 9);
  for (const frame of base.demoMotionView.frames) {
    assert.equal(frame.poses.length, 5);
    assert.equal(frame.poses.filter((pose) => pose.attachTo === 'PART').length, 3);
    assert.equal(frame.poses.filter((pose) => pose.attachTo === 'ROLE_MARKER').length, 1);
    assert.equal(frame.poses.filter((pose) => pose.attachTo === 'NONE').length, 1);
    for (const pose of frame.poses.filter((item) => item.published)) {
      assert.equal(pose.scale.length, 3);
      assert.ok(pose.scale.every((value) => value === 1));
      assert.equal(pose.matrixWorld.length, 4);
      const rotation = [pose.matrixWorld[0].slice(0, 3), pose.matrixWorld[1].slice(0, 3), pose.matrixWorld[2].slice(0, 3)];
      assert.ok(Math.abs(det3(rotation) - 1) < 1e-9);
      assert.deepEqual([pose.matrixWorld[0][3], pose.matrixWorld[1][3], pose.matrixWorld[2][3]], pose.positionM);
    }
    for (const pose of frame.poses.filter((item) => !item.published)) {
      assert.equal(pose.instanceId, null);
      assert.equal(pose.matrixWorld, null);
    }
  }
});

test('consumePoseRun blocks wrong frames and never plays the mismatched run as current', () => {
  assert.equal(consumePoseRun(base, { revision: 1 }).status, 'STALE');
  assert.equal(consumePoseRun(base, { revision: 2 }).status, 'STALE');
  assert.equal(consumePoseRun(base, { revision: 1 }).playbackAllowed, false);
  assert.equal(consumePoseRun(base, { revision: 1, frameId: 'FR-ENGINEERING' }).status, 'BLOCKED');
  assert.equal(consumePoseRun(base, {}).status, 'BLOCKED');
  assert.equal(consumePoseRun(base, { revision: 1 }).demoViewAvailable, true);
});

test('workbench tree and indexes cover the whole tree exactly once', () => {
  assert.equal(base.workbenchTree.systems.length, 13);
  assert.equal(base.workbenchTree.assemblyInstances.length, 37);
  const ids = base.workbenchTree.assemblyInstances.flatMap((assembly) => assembly.partInstanceIds);
  assert.equal(ids.length, 278);
  assert.equal(new Set(ids).size, 278);
  assert.equal(Object.keys(base.indexes.byPartInstanceId).length, 278);
  assert.equal(Object.keys(base.indexes.byPartDefinitionId).length, 493);
  assert.equal(Object.keys(base.indexes.byAssemblyInstanceId).length, 37);
  assert.equal(Object.keys(base.indexes.bySystemId).length, 67);
  assert.equal(base.consumerContract.canonicalSelectionKey, 'partInstanceId');
});

test('conflict register keeps 9 R-21 + 10 R-22 + 5 R-27 conflicts and R-26 missing policy', () => {
  assert.equal(base.conflictRegister.length, 24);
  assert.equal(base.conflictRegister.filter((conflict) => conflict.source === 'R-21').length, 9);
  assert.equal(base.conflictRegister.filter((conflict) => conflict.source === 'R-22').length, 10);
  assert.equal(base.conflictRegister.filter((conflict) => conflict.source === 'R-27').length, 5);
  assert.equal(base.decisions.length, 9);
  assert.equal(base.r26.status, 'ready');
  assert.deepEqual(base.r26.artifacts, []);
  assert.equal(base.r26.decisionPolicy, 'MISSING_OUTPUT_PRESERVE_ALL_CONFLICTS');
  const decisionIds = new Set(base.decisions.map((decision) => decision.decisionId));
  for (const conflict of base.conflictRegister) assert.ok(decisionIds.has(conflict.decisionRef), conflict.registerId);
});

test('sources are not promoted and the single demo CAD binding is explicit', () => {
  for (const source of base.sourceRegistry.artifacts) assert.notEqual(source.grade, 'SOURCED');
  assert.equal(base.sourceRegistry.r16ExternalRefs.count, 46);
  assert.equal(base.sourceRegistry.r16ExternalRefs.status, 'UNVERIFIED_REFERENCE');
  assert.equal(base.geometry.demoCadBindings.length, 1);
  const binding = base.geometry.demoCadBindings[0];
  assert.equal(binding.instanceId, 'PI-30-006-FL');
  assert.equal(binding.projectionAlias, 'INST-HUB-FL');
  assert.equal(binding.mappingStatus, 'DEMO_SUBSTITUTE');
  assert.equal(binding.copyToOtherInstances, false);
  assert.equal(binding.geometryStatus, 'NO_GEOMETRY');
});

test('consumer index pins the snapshot by hash and exposes the entrypoints', () => {
  const json = JSON.stringify(base);
  const consumer = buildConsumerIndex(base, json);
  assert.equal(consumer.snapshotSha256, createHash('sha256').update(json).digest('hex'));
  assert.equal(consumer.canonicalSelectionKey, 'partInstanceId');
  assert.equal(consumer.entrypoints.tree, 'workbenchTree');
  assert.equal(consumer.counts.partInstances, 278);
  assert.ok(consumer.forbidden.includes('PLAY_STALE_RUN_AS_CURRENT'));
});

test('negative: a duplicate PI id is rejected', () => {
  const report = mutate((snapshot) => {
    snapshot.tree.partInstances.push(clone(snapshot.tree.partInstances[0]));
  });
  expectCode(report, 'SNAP-E-DUP-PI');
});

test('negative: multiplying qtyPerCorner is rejected', () => {
  const report = mutate((snapshot) => {
    const stud = snapshot.tree.partInstances.find((instance) => instance.partId === 'PART-30-009');
    stud.quantity.perAssembly = stud.sourceQtyPerCorner;
  });
  expectCode(report, 'SNAP-E-QTY-DOUBLE');
  const report2 = mutate((snapshot) => {
    snapshot.qty.derivedByMultiplyingQtyPerCorner = true;
  });
  expectCode(report2, 'SNAP-E-QTY-DOUBLE');
});

test('negative: fabricated geometry is rejected', () => {
  const report = mutate((snapshot) => {
    snapshot.tree.partInstances[0].glb = 'fake.glb';
  });
  expectCode(report, 'SNAP-E-GEOMETRY');
});

test('negative: a variant claimed aligned without evidence is rejected', () => {
  const report = mutate((snapshot) => {
    snapshot.variant.alignmentStatus = 'ALIGNED';
    snapshot.variant.sameVehicleClaim = true;
  });
  expectCode(report, 'SNAP-E-VARIANT');
});

test('negative: a stale run published as current is rejected', () => {
  const report = mutate((snapshot) => {
    snapshot.poseRun.status = 'CURRENT';
    snapshot.poseRun.playbackAllowed = true;
    snapshot.poseRun.frames = [{ frameIndex: 0, poses: [] }];
  });
  expectCode(report, 'SNAP-E-RUN-STALE');
});

test('negative: wrong units and a reflected display matrix are rejected', () => {
  const badPose = mutate((snapshot) => {
    const pose = snapshot.demoMotionView.frames[0].poses.find((item) => item.published);
    pose.positionM = [pose.positionM[0], pose.positionM[1]];
  });
  expectCode(badPose, 'SNAP-E-UNIT');
  const reflected = mutate((snapshot) => {
    const pose = snapshot.demoMotionView.frames[0].poses.find((item) => item.published);
    for (const row of pose.matrixWorld.slice(0, 3)) row[0] = -row[0];
  });
  expectCode(reflected, 'SNAP-E-DISPLAY');
});

test('negative: a forged SOURCED source is rejected', () => {
  const report = mutate((snapshot) => {
    snapshot.sourceRegistry.artifacts.push({
      sourceId: 'SRC-FAKE',
      kind: 'OEM_DRAWING',
      grade: 'SOURCED',
      path: 'docs/does-not-exist.pdf',
      sha256: 'f'.repeat(64),
      verificationStatus: 'NOT_REOPENED'
    });
  });
  expectCode(report, 'SNAP-E-SOURCE');
});

test('negative: publishing an unbound tie-rod pose is rejected', () => {
  const report = mutate((snapshot) => {
    const pose = snapshot.demoMotionView.frames[0].poses.find((item) => item.attachTo === 'NONE');
    pose.published = true;
    pose.instanceId = 'PI-20-075-FL';
    pose.matrixWorld = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  });
  expectCode(report, 'SNAP-E-POSE-UNBOUND');
});

test('negative: bulk demo CAD binding is rejected', () => {
  const report = mutate((snapshot) => {
    snapshot.geometry.demoCadBindings.push({
      instanceId: 'PI-30-006-FR',
      projectionAlias: 'INST-HUB-FR',
      mappingStatus: 'DEMO_SUBSTITUTE',
      copyToOtherInstances: true,
      units: 'm',
      up: 'Y'
    });
  });
  expectCode(report, 'SNAP-E-CAD-BULK');
});

test('negative: an INST-* alias used as a canonical PI is rejected', () => {
  const report = mutate((snapshot) => {
    snapshot.tree.partInstances[0].partInstanceId = 'INST-HUB-FL';
    snapshot.indexes.byPartInstanceId['INST-HUB-FL'] = 0;
  });
  expectCode(report, 'SNAP-E-ALIAS');
});

test('negative: dropping a preserved R-21 conflict is rejected', () => {
  const report = mutate((snapshot) => {
    snapshot.conflictRegister = snapshot.conflictRegister.filter((conflict) => conflict.registerId !== 'R21-CF-01');
  });
  expectCode(report, 'SNAP-E-CONFLICT');
});

test('negative: auto-resolving conflicts without R-26 is rejected', () => {
  const report = mutate((snapshot) => {
    snapshot.r26.decisionPolicy = 'AUTO_RESOLVED';
  });
  expectCode(report, 'SNAP-E-R26');
});

test('negative: using an alias as the consumer key is rejected', () => {
  const report = mutate((snapshot) => {
    snapshot.consumerContract.canonicalSelectionKey = 'instanceId';
  });
  expectCode(report, 'SNAP-E-CONTRACT');
});

test('negative: stale counts are rejected', () => {
  const report = mutate((snapshot) => {
    snapshot.counts.partInstances = 999;
  });
  expectCode(report, 'SNAP-E-COUNTS');
});

test('negative: anchoring a canonical frame is rejected', () => {
  const report = mutate((snapshot) => {
    snapshot.tree.mountFrames.canonical[0].origin = [0, 0, 0];
    snapshot.tree.mountFrames.canonical[0].units = 'm';
  });
  expectCode(report, 'SNAP-E-FRAME');
});

test('negative: dropping the required-deferred marker is rejected', () => {
  const report = mutate((snapshot) => {
    const tie = snapshot.tree.partDefinitions.find((definition) => definition.partDefinitionId === 'PART-20-075');
    tie.requiredButDeferred = null;
  });
  expectCode(report, 'SNAP-E-PART-DEFERRED');
});

test('negative: assuming the caliper bracket exists is rejected', () => {
  const report = mutate((snapshot) => {
    const bracket = snapshot.tree.partDefinitions.find((definition) => definition.partDefinitionId === 'PART-40-048');
    bracket.variantDecision = null;
  });
  expectCode(report, 'SNAP-E-VARIANT');
});

test('negative: hiding the hub binding disagreement is rejected', () => {
  const report = mutate((snapshot) => {
    const hub = snapshot.bindingMatrix.find((row) => row.role === 'HUB');
    hub.discrepancy = null;
  });
  expectCode(report, 'SNAP-E-POSE-UNBOUND');
});

test('liveness: a changed R-23 hub pose flows into the demo view', () => {
  const changed = clone(inputs);
  const frame = changed.r23.frames[0];
  const hub = frame.instances.find((instance) => instance.mechanismInstanceId === 'INST-SLA-HUB-FL');
  hub.position = [hub.position[0] + 0.01, hub.position[1], hub.position[2]];
  const next = buildSnapshot(changed);
  const nextHub = next.demoMotionView.frames[0].poses.find((pose) => pose.role === 'HUB');
  assert.equal(nextHub.positionM[0], hub.position[0]);
  assert.notEqual(nextHub.positionM[0], base.demoMotionView.frames[0].poses.find((pose) => pose.role === 'HUB').positionM[0]);
});

test('liveness: a same-revision R-23 run becomes a strict CURRENT view', () => {
  const changed = clone(inputs);
  changed.r23.simulationRun.inputRevision = changed.r22.vehicleProject.revision;
  const next = buildSnapshot(changed);
  const report = validateSnapshot(next);
  assert.deepEqual(report.errors, []);
  assert.equal(next.poseRun.status, 'CURRENT');
  assert.equal(next.poseRun.playbackAllowed, true);
  assert.equal(next.poseRun.frames.length, 9);
  assert.equal(consumePoseRun(next, { revision: next.revision, frameId: 'FR-VEHICLE' }).status, 'CURRENT');
});

test('liveness: removing an R-22 instance is detected as a coverage mismatch', () => {
  const changed = clone(inputs);
  changed.r22.vehicleProject.partInstances = changed.r22.vehicleProject.partInstances.filter((instance) => instance.instanceId !== 'PI-30-009-FL-01');
  const next = buildSnapshot(changed);
  const report = validateSnapshot(next);
  assert.equal(next.counts.partInstances, 277);
  assert.equal(next.counts.crosswalkMappedInstances, 12);
  expectCode(report, 'SNAP-E-COUNTS');
});
